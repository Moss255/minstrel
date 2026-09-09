import { figureScale, Measurements } from '@minstrel/actor'
import { textureFor } from '@minstrel/cartridge'
import { FX32_ONE, fx32, toFloat } from '@minstrel/fixed'
import { ModelRenderer, type Piece } from '@minstrel/gl'
import {
  type Geometry,
  measureBounds,
  type NodeTransform,
  poseGeometry,
  sampleAnimation,
} from '@minstrel/nitro-gfx'
import {
  applyStyle,
  type Box,
  cameraEye,
  covered,
  followCamera,
  INDOORS,
  OUTDOORS,
  occluders,
  updateFollowCamera,
} from '@minstrel/render'
import { groundBelow, PERSON } from '@minstrel/sim'
import { backdrop, findSpawn, placeGeometry } from '@minstrel/world'
import { castPieces, setSpriteCut, spriteCut, spritePieces, standingFrame } from './cast.ts'
import { doorGate, doorTaken } from './doors.ts'
import { axesFrom, lastSearch, readSticks, type Sticks } from './gamepad.ts'
import { type Loaded, load } from './load.ts'
import { advance, advanceMotion, type Player, player, playerPieces, WALK_SPEED } from './player.ts'

/**
 * Walk a village read from the player's own cartridge.
 *
 * The engine is original code; only the data comes from the cartridge, and it
 * is read on this machine and never uploaded.
 *
 * The doors lead somewhere. Where each one goes is read from the map's `.bmbl`
 * rather than from event bytecode — an earlier note here guessed the bytecode,
 * wrongly — so walking into one loads the map behind it and puts the character
 * down where that map says they come out.
 */

function must<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`page is missing ${selector}`)
  return element
}

const fileInput = must<HTMLInputElement>('#file')
const statusEl = must<HTMLDivElement>('#status')
const overlayEl = must<HTMLDivElement>('#overlay')
const startEl = must<HTMLDivElement>('#start')
const canvas = must<HTMLCanvasElement>('#gl')

const status = (text: string) => {
  statusEl.textContent = text
}

let renderer: ModelRenderer
try {
  renderer = new ModelRenderer(canvas)
} catch (error) {
  status(error instanceof Error ? error.message : String(error))
  throw error
}

const camera = followCamera(OUTDOORS, toFloat(PERSON.height))
const measurements = new Measurements()

/**
 * How fast the right stick turns the camera, in radians a second.
 *
 * Held all the way over, a full turn takes about two seconds — quick enough to
 * spin round and see who is behind you, slow enough to aim. Tuned by eye, like
 * the walking speed.
 */
const LOOK_RATE = Math.PI
/**
 * The same for tilt.
 *
 * No limits are imposed here: the follow camera has its own — 15 to 60 degrees
 * outdoors — and it applies them every frame. Clamping to a wider range first
 * only looked like it was doing something.
 */
const TILT_RATE = Math.PI / 2

/** How much clear air there has to be past a piece for it to count as in the way. */
const CLEARANCE = toFloat(PERSON.radius)
/** The DS plays a map's own animations at 30 frames a second. */
const MAP_FPS = 30

let loaded: Loaded | undefined
let self: Player | undefined
/**
 * The cartridge, kept so a doorway can open the map behind it.
 *
 * One reference to the bytes the player chose, never a copy: a dump is upwards
 * of 128 MiB and the loader takes a view of it.
 */
let cartridge: Uint8Array | undefined
/** Stops a doorway firing on the character it just put down. See `doors.ts`. */
const gate = doorGate()
/** Set while a map is loading, so a doorway cannot be taken twice. */
let travelling = false
/**
 * What the sprite keys have been moved to, and what the sheets say by default.
 *
 * The defaults are filled in from the first sheet the map loads, so the keys
 * start from the reading in `game-formats` rather than from zero.
 */
let cutStart = 0
let cutPitch = 0
let cutHeight = 0
/** Bytes added to odd frames only — see `SpriteCut.oddShift`. */
let cutOdd = 0
/** How wide a row of the sheet is in bytes, so a key can step by whole rows. */
let cutRowBytes = 16
/** The map as drawn this frame, and one box per piece for deciding what is in the way. */
let mapPieces: Piece[] = []
let mapBoxes: Box[] = []
/** Which of those are backdrop — sky and the like — rather than part of the place. */
let mapBackdrop: boolean[] = []
let mapFrame = -1
let hiddenPieces = 0
/** Whether a pad has been seen, so the overlay can say which controls apply. */
let padSeen = false
/** The last pad read, so the overlay can show what it reports. */
let pad: Sticks | undefined
/** The cast as drawn this frame. They are not occluders and not a roof. */
let castPiecesNow: Piece[] = []
/**
 * How much to shrink a character into the world.
 *
 * One factor for everybody, the player included. The cartridge models its
 * characters in one space — the village's cast runs 9.00 to 22.96 units against
 * the player's 22.9 — so a single scale is what keeps a child a child.
 */
let characterScale = 1

/** Draw the map for one frame of its own animations. */
function poseMap(frame: number): void {
  if (!loaded) return
  const cat = loaded.catalogue
  const drawn: Piece[] = []
  for (const { model, place, scale, animation } of loaded.map.pieces) {
    // Each shape has its own matrix stack, because a model reuses slots between
    // shapes. A map's models each drive themselves.
    const stacks =
      animation && animation.boneCount === model.nodes.length
        ? model.pose(posedNodes(model, animation, frame))
        : model.shapeMatrices

    model.shapes.forEach((shape, index) => {
      const geometry: Geometry = placeGeometry(
        poseGeometry(model.geometry(shape), stacks[index] ?? model.matrices),
        place,
        // The piece's own scale, which `assembleMap` worked out: an eighth for
        // a piece instanced from the larger space, and the map's own scale for
        // the map itself — an eighth again indoors.
        scale,
      )
      const materialIndex = model.shapeMaterials[index]
      const material = materialIndex === undefined ? undefined : model.materials[materialIndex]
      const texture = material ? textureFor(cat, material) : undefined
      drawn.push(texture ? { geometry, ...texture } : { geometry })
    })
  }
  // The map's own boxes decide what is in the way and what counts as a roof;
  // the cast is neither, so it is measured before they are added.
  mapBoxes = drawn.map((piece) => measureBounds([piece.geometry]))
  mapBackdrop = backdrop(mapBoxes, loaded.world?.bounds)
  mapPieces = drawn
  castPiecesNow = [
    ...loaded.cast.members.flatMap((member) => castPieces(member, cat, characterScale, frame)),
    // The 2D cast faces the camera, so it is rebuilt in the frame loop rather
    // than here; this is only its first placement before anyone has moved.
  ]
}

function posedNodes(
  model: { nodes: readonly NodeTransform[] },
  animation: Parameters<typeof sampleAnimation>[0],
  frame: number,
): NodeTransform[] {
  const local = sampleAnimation(animation, frame % animation.frameCount)
  return model.nodes.map((node, i) => {
    const posed = local[i]
    return posed ? { ...node, local: posed } : node
  })
}

/**
 * Take the cartridge the player chose and open the first map.
 *
 * The bytes are taken as they arrive rather than through a `Blob`: a dump is
 * upwards of 128 MiB and going through one costs a second copy and, in some
 * browsers, a spill to disk. Only this one array is held.
 */
function begin(bytes: Uint8Array, map: string): void {
  startEl.hidden = true
  // Kept for the rest of the session: every doorway taken reads the cartridge
  // again for the map behind it.
  cartridge = bytes
  if (!enter(map)) startEl.hidden = false
}

/**
 * Where the character comes out, when they have come through a doorway.
 *
 * The stored height is not trusted on its own. It stands on the destination's
 * own collision floor on 884 of 1,132 doorways — 78.1% — and the rest would
 * leave the character hanging in the air or sunk into the ground, so the floor
 * is measured at the arrival and the stored height is the fallback.
 */
interface Arrival {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly facing: number
}

/**
 * Open a map and put the character down in it.
 *
 * With no arrival the character is put wherever the map affords standing, which
 * is how the first map opens. With one, they come out of a doorway.
 *
 * Returns whether anyone is standing anywhere afterwards. On failure the map
 * already loaded is left alone: a doorway onto a map that will not read should
 * not throw the player out of the one they are in.
 */
function enter(map: string, arrival?: Arrival): boolean {
  if (!cartridge) return false
  const previous = loaded
  const previousSelf = self
  const started = performance.now()
  let opened: Loaded
  try {
    opened = load(cartridge, { map, lighting: wantedLighting, onProgress: status })
  } catch (error) {
    status(error instanceof Error ? error.message : String(error))
    loaded = previous
    self = previousSelf
    return false
  }

  const world = opened.world
  if (!world) {
    status(`${opened.archive} has no collision — there is nowhere to stand`)
    loaded = previous
    self = previousSelf
    return false
  }

  // Where to stand. An arrival names the spot; without one, the map is asked
  // for somewhere the character can walk from.
  const walkable = (near?: { x: number; z: number }) =>
    findSpawn(world, {
      person: PERSON,
      speed: WALK_SPEED,
      water: opened.map.water,
      ...(near ? { near } : {}),
    })
  let at: { x: ReturnType<typeof fx32>; y: ReturnType<typeof fx32>; z: ReturnType<typeof fx32> }
  /** How far from the arrival the character had to be put, if not on it. */
  let strayed = 0
  if (arrival) {
    const x = fx32(Math.round(arrival.x * FX32_ONE))
    const z = fx32(Math.round(arrival.z * FX32_ONE))
    const hit = groundBelow(world, x, z, fx32(Math.round(world.bounds.maxY + FX32_ONE)))
    if (hit) {
      at = { x, y: hit.y, z }
    } else {
      // No floor under the arrival. 136 of the cartridge's 1,132 doorways are
      // like this and 87 of them lead to a field, which is not a coincidence:
      // a field's collision does not reach its own doorways — see the field
      // note in `game-formats/FORMAT.md`.
      //
      // So the character is put on the walkable ground nearest the arrival
      // rather than wherever the map affords standing. It keeps which side of
      // the map they came in on, which the middle of the map does not: coming
      // out of the village, the difference is the west edge of the field
      // against somewhere in the middle of it.
      const spot = walkable({ x: arrival.x, z: arrival.z })
      if (!spot) {
        status(`${opened.archive} has no floor under the arrival, and nowhere else to stand`)
        loaded = previous
        self = previousSelf
        return false
      }
      at = spot
      strayed = Math.hypot(toFloat(spot.x) - arrival.x, toFloat(spot.z) - arrival.z)
    }
  } else {
    const spawn = walkable()
    if (!spawn) {
      status(`${opened.archive} has collision but nowhere the character can walk from`)
      loaded = previous
      self = previousSelf
      return false
    }
    at = spawn
  }

  loaded = opened
  measurements.clear()
  mapFrame = -1
  poseMap(0)

  const scale = figureScale(opened.figure, opened.pieces, measurements, toFloat(PERSON.height))
  characterScale = scale
  // The cast was posed before the scale was known; redo it now it is.
  poseMap(0)
  self = player(at, scale)
  if (arrival) self.facing = arrival.facing

  // The character is put down inside the doorway they came out of more often
  // than not, so the gate starts shut and opens when they step clear of it.
  gate.armed = false
  // The camera trails the character; without this it would fly across the world
  // from wherever it was watching the last map.
  camera.focus = [toFloat(at.x), toFloat(at.y) + camera.height, toFloat(at.z)]

  // Start the keys from what the parser decided, so nudging is relative to the
  // current reading rather than to zero.
  const firstSheet = opened.cast.sprites2d[0]
  if (firstSheet) {
    const sheet = firstSheet.sprite
    cutRowBytes = sheet.width / 2
    const already = spriteCut()
    cutHeight = already.height ?? sheet.height
    cutPitch = already.pitch ?? (sheet.width * cutHeight) / 2 + 8
    cutStart = already.start ?? 24 + 6 * cutRowBytes
    cutOdd = already.oddShift ?? 0
    if (cutParam) {
      cutStart = cutParam[0] ?? cutStart
      cutPitch = cutParam[1] ?? cutPitch
      cutHeight = cutParam[2] ?? cutHeight
      cutOdd = cutParam[3] ?? cutOdd
      setSpriteCut(
        { start: cutStart, pitch: cutPitch, height: cutHeight, oddShift: cutOdd },
        opened.cast,
      )
    }
  }

  const elapsed = Math.round(performance.now() - started)
  const { members, sprites, unclassified, missing, elsewhere } = opened.cast
  status(
    `${opened.archive} — ${opened.map.pieces.length} pieces, ${opened.map.meshes.length} collision meshes, ` +
      `${members.length + opened.cast.sprites2d.length} characters` +
      (opened.cast.sprites2d.length > 0 ? ` (${opened.cast.sprites2d.length} of them 2D)` : '') +
      (sprites > 0 ? `, ${sprites} sheets unread` : '') +
      (elsewhere > 0 ? `, ${elsewhere} stand in another map` : '') +
      (unclassified > 0 ? `, ${unclassified} unclassified` : '') +
      (missing.length > 0 ? `, ${missing.length} unread` : '') +
      `, ${opened.doorways.length} ${opened.doorways.length === 1 ? 'doorway' : 'doorways'}` +
      (strayed > 0 ? `, no floor under the doorway — put down ${strayed.toFixed(1)} away` : '') +
      `, ready in ${elapsed} ms`,
  )
  return true
}

/**
 * Take a doorway, if the character is standing in one.
 *
 * Loading a map is not quick and it blocks, so the frame that starts it says so
 * first and the load happens on the next turn of the event loop. `travelling`
 * holds the door shut meanwhile.
 */
function maybeTravel(): void {
  if (!self || !loaded || travelling) return
  const door = doorTaken(gate, loaded.doorways, toFloat(self.state.x), toFloat(self.state.z))
  if (!door) return
  travelling = true
  status(`entering ${door.to}…`)
  setTimeout(() => {
    enter(door.to, {
      x: door.arriveX,
      y: door.arriveY,
      z: door.arriveZ,
      facing: door.arriveFacing,
    })
    travelling = false
  }, 0)
}

/**
 * Move the sprite cut, and cut every sheet again.
 *
 * Three numbers decide where a frame is: the byte the pixels start at, the
 * bytes from one frame to the next, and the rows in a frame. The first is
 * settled horizontally and not vertically, and the other two are measured
 * rather than derived — see the sprite section of
 * `packages/game-formats/FORMAT.md`.
 */
function moveCut(by: { start?: number; pitch?: number; height?: number; odd?: number }): void {
  if (!loaded) return
  cutStart += by.start ?? 0
  cutPitch += by.pitch ?? 0
  cutHeight += by.height ?? 0
  cutOdd += by.odd ?? 0
  setSpriteCut(
    { start: cutStart, pitch: cutPitch, height: cutHeight, oddShift: cutOdd },
    loaded.cast,
  )
  status(
    `sprite cut — start ${cutStart}, pitch ${cutPitch}, height ${cutHeight}, ` +
      `odd frames ${cutOdd >= 0 ? '+' : ''}${cutOdd} (a row is ${cutRowBytes} bytes, ` +
      `a byte is 2 pixels across)`,
  )
}

/** The overlay text: where the character is, and what it is standing in. */
function describe(uploaded: { vertices: number; triangles: number; textured: number }): void {
  if (!self || !loaded) {
    overlayEl.textContent = ''
    return
  }
  overlayEl.textContent = [
    `${loaded.code} · ${toFloat(self.state.x).toFixed(2)}, ${toFloat(self.state.y).toFixed(2)}, ${toFloat(self.state.z).toFixed(2)}` +
      (self.state.grounded ? '' : ' (falling)') +
      (self.inside ? ' · indoors' : ''),
    `${uploaded.vertices} vertices · ${uploaded.triangles} triangles` +
      (hiddenPieces > 0 ? ` · ${hiddenPieces} pieces out of the way` : ''),
    loaded.pieces.length === 0 ? 'no character parts loaded' : undefined,
    padSeen ? 'left stick to walk · right stick to look' : 'WASD to walk · drag to turn',
    showSprite
      ? `sprite cut: start ${cutStart}  pitch ${cutPitch}  height ${cutHeight}` +
        `   (row = ${cutRowBytes} bytes)\n` +
        "  [ ] start by a byte · ; ' start by a row · , . pitch · - = height · 0 reset"
      : undefined,
    // With `?pad=1`, what the pad reports — move a stick and watch which
    // numbers change, then pass those four to `?axes=`.
    showPad && !pad
      ? (() => {
          const found = lastSearch()
          if (!found.available) return 'pad: this browser has no gamepad API'
          if (found.filled > 0) return `pad: ${found.filled} present but none connected`
          // Chromium keeps a pad hidden until it has been used on this page.
          return `pad: none in ${found.slots} slots — press a button on it with this page focused`
        })()
      : undefined,
    showPad && pad
      ? `pad: ${pad.id} (${pad.mapping || 'no standard mapping'})\n` +
        `${pad.axes.length} axes: ${pad.axes.map((a, i) => `${i}:${a.toFixed(2)}`).join('  ')}\n` +
        `${pad.buttons.length} buttons: ${
          pad.buttons
            .map((b, i) => (b > 0.02 ? `${i}:${b.toFixed(2)}` : ''))
            .filter(Boolean)
            .join('  ') || 'none pressed'
        }`
      : undefined,
  ]
    .filter((line) => line !== undefined)
    .join('\n')
}

let lastFrame = 0
function frame(now = 0): void {
  const elapsedMs = lastFrame === 0 ? 0 : now - lastFrame
  lastFrame = now

  if (loaded) {
    // A map is not a still life: the village's sky drifts its clouds apart and
    // the waterfall runs, both on the map's own animations.
    const wanted = Math.floor(now / (1000 / MAP_FPS))
    if (wanted !== mapFrame) {
      mapFrame = wanted
      poseMap(wanted)
    }
  }

  // A pad is read fresh each frame; the browser hands back a snapshot, not a
  // handle, and one unplugged mid-game simply reads as absent.
  const sticks = readSticks(padAxes, padOverridden)
  if (sticks.connected) {
    padSeen = true
    pad = sticks
    const seconds = elapsedMs / 1000
    camera.yaw -= sticks.lookX * LOOK_RATE * seconds
    // The follow camera clamps this to its own range on the same frame.
    camera.pitch += sticks.lookY * TILT_RATE * seconds
  }

  let uploaded = { vertices: 0, triangles: 0, textured: 0 }
  if (self && loaded?.world) {
    self.stick = { forward: sticks.forward, right: sticks.right }
    const { moving, travelled } = advance(self, loaded.world, camera.yaw, elapsedMs)
    advanceMotion(self, loaded.figure, measurements, moving, elapsedMs, travelled)
    maybeTravel()

    // Indoors the camera comes in and tilts further down. What counts as
    // indoors is whether there is a roof over the character's head, checked as
    // they walk, so the camera tucks in on the way through a door rather than
    // on a guess about how big the map is.
    const feet: [number, number, number] = [
      toFloat(self.state.x),
      toFloat(self.state.y),
      toFloat(self.state.z),
    ]
    const inside = covered(
      mapBoxes.filter((_, index) => !mapBackdrop[index]),
      feet,
      toFloat(PERSON.height),
    )
    if (inside !== self.inside) {
      self.inside = inside
      Object.assign(camera, applyStyle(camera, inside ? INDOORS : OUTDOORS, toFloat(PERSON.height)))
    }

    // The world is passed so the eye is kept above the ground: it is never
    // pulled forward for a building — the roof comes off instead — but the
    // ground is the one thing culling must not remove, so a camera inside a
    // hill sees through the world.
    updateFollowCamera(camera, self.state, elapsedMs / 1000, loaded.world, PERSON)

    const hidden = new Set(occluders(mapBoxes, cameraEye(camera), camera.focus, CLEARANCE))
    hiddenPieces = hidden.size
    const drawn = [
      ...mapPieces.filter((_, index) => !hidden.has(index)),
      ...castPiecesNow,
      ...loaded.cast.sprites2d.flatMap((s) =>
        spritePieces(s, toFloat(PERSON.height), camera.yaw, standingFrame(s, camera.yaw)),
      ),
      ...playerPieces(
        self,
        loaded.figure,
        loaded.pieces,
        loaded.catalogue,
        measurements,
        loaded.figure.motions.get(self.motion ?? ''),
      ),
    ]
    uploaded = renderer.upload(drawn)
  } else if (mapPieces.length > 0) {
    uploaded = renderer.upload([...mapPieces, ...castPiecesNow])
  }
  describe(uploaded)

  const width = Math.max(1, Math.floor(canvas.clientWidth * devicePixelRatio))
  const height = Math.max(1, Math.floor(canvas.clientHeight * devicePixelRatio))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  renderer.draw(camera, false)
  requestAnimationFrame(frame)
}

const params = new URLSearchParams(location.search)
const wantedMap = params.get('map') ?? 'M01'
/**
 * `?axes=0,1,2,3` moves the sticks to other axes, `?lookbuttons=6,7` reads the
 * look stick from two analog buttons, and `?pad=1` shows what a pad reports.
 */
const padAxes = axesFrom(params.get('axes'), params.get('lookbuttons'))
/** A layout given on the URL wins over anything known about the pad. */
const padOverridden = params.get('axes') !== null || params.get('lookbuttons') !== null
const showPad = params.get('pad') === '1'
/** `?sprite=1` shows the sprite cut and turns its keys on. */
const showSprite = params.get('sprite') === '1'
/**
 * `?cut=start,pitch,height,odd` starts from those numbers instead of the
 * parser's, so a candidate can be looked at without pressing a key twelve
 * times. Any field left empty keeps the parser's value.
 */
const cutParam = params
  .get('cut')
  ?.split(',')
  .map((v) => (v === '' ? undefined : Number(v)))
/** `?lighting=night` builds the map's night pieces instead of its day ones. */
const wantedLighting = params.get('lighting') === 'night' ? 'night' : 'day'
/**
 * `?door=M01M02` takes that doorway as soon as the first map has loaded.
 *
 * Walking into a door cannot be driven by a headless browser, and this is the
 * same path a door takes — `enter` with the doorway's own arrival — so a
 * screenshot of it is a screenshot of the real thing.
 */
const wantedDoor = params.get('door')

async function chose(file: File): Promise<void> {
  status(`reading ${file.name}…`)
  begin(new Uint8Array(await file.arrayBuffer()), wantedMap)
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) void chose(file)
})
document.addEventListener('dragover', (event) => {
  event.preventDefault()
  document.body.classList.add('dragging')
})
document.addEventListener('dragleave', () => document.body.classList.remove('dragging'))
document.addEventListener('drop', (event) => {
  event.preventDefault()
  document.body.classList.remove('dragging')
  const file = event.dataTransfer?.files?.[0]
  if (file) void chose(file)
})

let dragging = false
let lastX = 0
let lastY = 0
canvas.addEventListener('pointerdown', (event) => {
  dragging = true
  lastX = event.clientX
  lastY = event.clientY
  canvas.setPointerCapture(event.pointerId)
})
canvas.addEventListener('pointerup', (event) => {
  dragging = false
  canvas.releasePointerCapture(event.pointerId)
})
canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return
  camera.yaw -= (event.clientX - lastX) * 0.01
  camera.pitch += (event.clientY - lastY) * 0.01
  lastX = event.clientX
  lastY = event.clientY
})

addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase()
  if (self && (key === 'w' || key === 'a' || key === 's' || key === 'd')) {
    self.held.add(key)
    event.preventDefault()
  }
  if (!showSprite) return
  // A byte is two pixels across; a row moves the frame down one.
  const moves: Record<string, () => void> = {
    '[': () => moveCut({ start: -1 }),
    ']': () => moveCut({ start: 1 }),
    ';': () => moveCut({ start: -cutRowBytes }),
    "'": () => moveCut({ start: cutRowBytes }),
    ',': () => moveCut({ pitch: -1 }),
    '.': () => moveCut({ pitch: 1 }),
    '-': () => moveCut({ height: -1 }),
    '=': () => moveCut({ height: 1 }),
    '9': () => moveCut({ odd: -1 }),
    '\\': () => moveCut({ odd: 1 }),
  }
  const move = moves[key]
  if (move) {
    move()
    event.preventDefault()
  }
  if (key === '0' && loaded) {
    // Back to what the parser decided.
    const sheet = loaded.cast.sprites2d[0]?.sprite
    if (sheet) {
      cutHeight = sheet.height
      cutPitch = (sheet.width * cutHeight) / 2 + 8
      cutStart = 24 + 6 * (sheet.width / 2)
      cutOdd = 0
      moveCut({})
    }
    event.preventDefault()
  }
})
addEventListener('keyup', (event) => {
  self?.held.delete(event.key.toLowerCase())
})

frame()
status('choose or drop a cartridge dump')

// Development convenience: `?rom=<url>` loads a dump over HTTP instead of
// through the file picker. It fetches only what the URL names, so it stays
// inert unless a developer asks for it.
const romUrl = params.get('rom')
if (romUrl) {
  void (async () => {
    status(`fetching ${romUrl}…`)
    try {
      const response = await fetch(romUrl)
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      begin(new Uint8Array(await response.arrayBuffer()), wantedMap)
      if (wantedDoor && loaded) {
        const door = loaded.doorways.find((d) => d.to.toLowerCase() === wantedDoor.toLowerCase())
        if (!door) throw new Error(`${loaded.code} has no doorway to '${wantedDoor}'`)
        enter(door.to, {
          x: door.arriveX,
          y: door.arriveY,
          z: door.arriveZ,
          facing: door.arriveFacing,
        })
      }
      // `tools/shot` waits for a title beginning with `ready`, so a headless
      // driver can tell loading apart from a page that is merely slow.
      document.title = self ? 'ready — walking' : 'ready — loaded'
    } catch (error) {
      status(error instanceof Error ? error.message : String(error))
      document.title = 'failed'
    }
  })()
}
