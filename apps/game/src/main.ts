import { figureScale, Measurements } from '@minstrel/actor'
import { textureFor } from '@minstrel/cartridge'
import { FX32_ONE, fx32, toFloat } from '@minstrel/fixed'
import type { Treasure } from '@minstrel/game-formats'
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
  boxOfTriangles,
  cameraEye,
  cellsOf,
  covered,
  followCamera,
  INDOORS,
  keepTriangles,
  OUTDOORS,
  occludedChunks,
  updateFollowCamera,
} from '@minstrel/render'
import { type CollisionWorld, createCollisionWorld, groundBelow, PERSON } from '@minstrel/sim'
import { backdrop, findSpawn, placeGeometry } from '@minstrel/world'
import {
  CABINET_OPENING,
  CABINET_SHUT,
  type Cabinet,
  cabinetsOf,
  cabinetTargets,
  motionFrame,
} from './cabinets.ts'
import { castPieces, setSpriteCut, spriteCut, spritePieces, standingFrame } from './cast.ts'
import { chestPieces, isChest } from './chests.ts'
import {
  type CollisionFit,
  collisionPieces,
  describeCollision,
  fitFrom,
  fitLine,
  fitMeshes,
  NO_FIT,
} from './collisionview.ts'
import { doorGate, doorTaken } from './doors.ts'
import { axesFrom, lastSearch, readSticks, type Sticks } from './gamepad.ts'
import { entranceOf, type Loaded, load, type Stage } from './load.ts'
import {
  back,
  choose,
  MENU_COMMANDS,
  type MenuState,
  moveCursor,
  openMenu,
  panelLines,
} from './menu.ts'
import { advance, advanceMotion, type Player, player, playerPieces, WALK_SPEED } from './player.ts'
import { doorShut, doorsOf, moveDoors, type SwingDoor, swingGeometry } from './swing.ts'
import {
  type Conversation,
  DEFAULT_CONTEXT,
  letterForStage,
  moveChoice,
  nextPage,
  noteOf,
  OPENING_STAGE,
  pickLine,
  promptOf,
  sameStage,
  stageOrder,
  startConversation,
  type Talker,
  talkTarget,
} from './talk.ts'
import {
  nearestTreasure,
  TREASURE_MARKER,
  treasureKey,
  treasurePieces,
  treasureTargets,
  treasureText,
} from './treasure.ts'

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
const talkEl = must<HTMLDivElement>('#talk')
const menuEl = must<HTMLDivElement>('#menu')

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
/**
 * The side of the squares a map's shapes are cut into for deciding what is in
 * the way: two and a half character heights, about half a house. A choice —
 * smaller hides less and tests more boxes a frame. The squares are never drawn
 * as pieces of their own: that was five times the draw calls, and the frame
 * rate fell with it.
 */
const OCCLUSION_CELL = toFloat(PERSON.height) * 2.5
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
/**
 * The map's shapes cut into chunks for deciding what is in the way — see
 * `cellsOf`: each shape's chunks as lists of its triangles, cut once per map;
 * and for every chunk, which shape and which of its chunks it is, and its box,
 * measured again with each pose.
 */
let shapeCells: number[][][] = []
let chunkShapes: number[] = []
let chunkLocal: number[] = []
let chunkBoxes: Box[] = []
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
/**
 * Where the story is: which of their records the cast stand at, which chapter
 * they talk from and which line they say. One for the whole game, not one per
 * map, and it opens where the slice does — see `OPENING_STAGE`. Undefined is no
 * stage at all: the file's own first placement of each character. `t` and `y`
 * move it.
 */
let storyStage: Stage | undefined = OPENING_STAGE
/**
 * Which chapter's talk files are read: an index into `loaded.letters`, or
 * undefined to follow the stage — see `letterForStage`. `v` and `b` move it.
 */
let chapterIndex: number | undefined
/** Who is being talked to, and how far through what they say. */
let talking: Conversation | undefined
/** The main menu while it is up — see `menu.ts`. */
let menu: MenuState | undefined
/**
 * The treasure opened this session, by `treasureKey` — its game-wide number, so
 * it stays open whichever way the Hero comes back. Not saved yet.
 */
const openedTreasure = new Set<string>()
/** The markers where the map's treasure is — see `treasure.ts`. */
let treasureDrawn: Piece[] = []
/** The map's doors, and how far each has swung — see `swing.ts`. */
let doors: SwingDoor[] = []
/** The map's cabinets, and the motion each is playing — see `cabinets.ts`. */
let cabinets: Cabinet[] = []
/** Talk-target ids from here on are cabinets, so they cannot be taken for a placed treasure. */
const CABINET_TARGET = 10_000

/** Draw the map for one frame of its own animations. */
function poseMap(frame: number): void {
  if (!loaded) return
  const cat = loaded.catalogue
  const drawn: Piece[] = []
  for (const [pieceIndex, piece] of loaded.map.pieces.entries()) {
    const { model, animation } = piece
    const swung = doors.find((door) => door.piece === pieceIndex)?.angle ?? 0
    const grow = roomScale * worldScale
    const scale = piece.scale * grow
    const place = { x: piece.place.x * grow, y: piece.place.y * grow, z: piece.place.z * grow }
    // Each shape has its own matrix stack, because a model reuses slots between
    // shapes. A map's models each drive themselves.
    // A cabinet stands where its motion has it; everything else loops its own.
    const cabinet = cabinets.find((c) => c.piece === pieceIndex)
    const stacks =
      animation && animation.boneCount === model.nodes.length
        ? model.pose(
            posedNodes(
              model,
              animation,
              cabinet
                ? motionFrame(
                    cabinet.motions,
                    cabinet.motion,
                    frame - cabinet.since,
                    animation.frameCount,
                  )
                : frame,
            ),
          )
        : model.shapeMatrices

    model.shapes.forEach((shape, index) => {
      const geometry: Geometry = placeGeometry(
        swingGeometry(poseGeometry(model.geometry(shape), stacks[index] ?? model.matrices), swung),
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
  // Each shape's own box decides what counts as a roof and what is backdrop;
  // the cast is neither, so it is measured before they are added.
  mapBoxes = drawn.map((piece) => measureBounds([piece.geometry]))
  mapBackdrop = backdrop(mapBoxes, (world ?? loaded.world)?.bounds)
  mapPieces = drawn
  // What is in the way is decided a chunk at a time — see `occludedChunks`. A
  // map's triangles keep their order from pose to pose, so it is cut once.
  if (shapeCells.length !== drawn.length) {
    const cell = OCCLUSION_CELL * roomScale * worldScale
    shapeCells = drawn.map((piece) => cellsOf(piece.geometry, cell))
    chunkShapes = shapeCells.flatMap((cells, shape) => cells.map(() => shape))
    chunkLocal = shapeCells.flatMap((cells) => cells.map((_, local) => local))
  }
  chunkBoxes = chunkShapes.map((shape, chunk) =>
    boxOfTriangles(
      (drawn[shape] as Piece).geometry,
      shapeCells[shape]?.[chunkLocal[chunk] as number] ?? [],
    ),
  )
  refit()
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
 * With one, they come out of a doorway. With no arrival — the first map — they
 * come in the way the map's neighbours bring them, which for the village is the
 * road from the field; see `entranceOf`. Only a map nothing leads into is opened
 * wherever it affords standing.
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

  // With no doorway to arrive by, come in by the map's entrance: where a
  // doorway from outside it puts you. Guessing at the middle of the village
  // stood the character at the river's edge by the waterfall.
  const entrance = arrival ? undefined : entranceOf(opened.catalogue, opened.code)
  const via: Arrival | undefined =
    arrival ??
    (entrance && {
      x: entrance.door.arriveX,
      y: entrance.door.arriveY,
      z: entrance.door.arriveZ,
      facing: entrance.door.arriveFacing,
    })

  // Where to stand. An arrival names the spot; without one, the map is asked
  // for somewhere the character can walk from.
  const walkable = (near?: { x: number; z: number }) =>
    findSpawn(world, {
      person: person(),
      speed: WALK_SPEED,
      water: opened.map.water,
      ...(near ? { near } : {}),
    })
  let at: { x: ReturnType<typeof fx32>; y: ReturnType<typeof fx32>; z: ReturnType<typeof fx32> }
  /** How far from the arrival the character had to be put, if not on it. */
  let strayed = 0
  if (via) {
    // A world grown around the character has to put them down where they now
    // belong in it, or they arrive inside the walls.
    const x = fx32(Math.round(via.x * worldScale * FX32_ONE))
    const z = fx32(Math.round(via.z * worldScale * FX32_ONE))
    const hit = groundBelow(world, x, z, fx32(Math.round(world.bounds.maxY + FX32_ONE)))
    if (hit) {
      at = { x, y: hit.y, z }
    } else {
      // No floor under the arrival. Rare: 2 of the 1,098 arrivals measured,
      // now each collision mesh is read at its own size. Before that, a
      // field's was read at half of it and 136 arrivals missed, 87 of them
      // into a field.
      //
      // So the character is put on the walkable ground nearest the arrival
      // rather than wherever the map affords standing. It keeps which side of
      // the map they came in on, which the middle of the map does not.
      const spot = walkable({ x: via.x * worldScale, z: via.z * worldScale })
      if (!spot) {
        status(`${opened.archive} has no floor under the arrival, and nowhere else to stand`)
        loaded = previous
        self = previousSelf
        return false
      }
      at = spot
      strayed = Math.hypot(toFloat(spot.x) - via.x, toFloat(spot.z) - via.z)
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

  // The cast where the story stage has them.
  if (storyStage !== undefined) opened = { ...opened, cast: opened.castAt(storyStage) }
  loaded = opened
  chapterIndex = undefined
  closeTalk()
  refreshTreasures()
  doors = doorsOf(opened.map)
  cabinets = cabinetsOf(opened.map, opened.treasures, (slot) => {
    const inside = opened.treasures[slot]
    return inside !== undefined && openedTreasure.has(treasureKey(opened.code, slot, inside))
  })
  measurements.clear()
  mapFrame = -1
  shapeCells = []
  poseMap(0)

  const scale = figureScale(opened.figure, opened.pieces, measurements, toFloat(person().height))
  characterScale = scale
  // The cast was posed before the scale was known; redo it now it is.
  poseMap(0)
  self = player(at, scale)
  if (via) self.facing = via.facing

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
    // The sheet reports the cut it was read with, rather than the arithmetic
    // being copied here where it would go stale.
    cutHeight = already.height ?? sheet.cut.height
    cutPitch = already.pitch ?? sheet.cut.pitch
    cutStart = already.start ?? sheet.cut.start
    cutOdd = already.oddShift ?? sheet.cut.oddShift
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
      (opened.treasures.length > 0 ? `, ${opened.treasures.length} treasure` : '') +
      (entrance ? `, came in from ${entrance.from}` : '') +
      (strayed > 0 ? `, no floor under the doorway — put down ${strayed.toFixed(1)} away` : '') +
      `, ready in ${elapsed} ms` +
      // Never leave a resized map looking like a wrong one.
      (fitState() === 'as the file has it' ? '' : ` — ${fitState()}`),
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
      (hiddenPieces > 0 ? ` · ${hiddenPieces} chunks out of the way` : ''),
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
    // Doors swing on the frame's own time, and a door that moved is a map to redraw.
    const swung =
      self !== undefined &&
      moveDoors(doors, { x: toFloat(self.state.x), z: toFloat(self.state.z) }, elapsedMs / 1000)
    if (wanted !== mapFrame || swung) {
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
    const { moving, travelled } = advance(self, world, camera.yaw, elapsedMs)
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
      toFloat(person().height),
    )
    if (inside !== self.inside) {
      self.inside = inside
      Object.assign(
        camera,
        applyStyle(camera, inside ? INDOORS : OUTDOORS, toFloat(person().height) * worldScale),
      )
    }

    // The world is passed so the eye is kept above the ground: it is never
    // pulled forward for a building — the roof comes off instead — but the
    // ground is the one thing culling must not remove, so a camera inside a
    // hill sees through the world.
    // The boom is a multiple of the character's height, so a world grown around
    // a character that did not grow leaves the camera inside it. Pulling it back
    // by the same factor keeps the room framed, which is the whole point: what
    // should change on screen is the character's size against the room, not how
    // close the camera happens to be.
    updateFollowCamera(
      camera,
      self.state,
      elapsedMs / 1000,
      world,
      worldScale === 1
        ? person()
        : { ...person(), height: fx32(Math.round(person().height * worldScale)) },
    )

    const hidden = occludedChunks(
      mapBoxes,
      chunkBoxes,
      chunkShapes,
      cameraEye(camera),
      camera.focus,
      CLEARANCE,
      mapBackdrop,
    )
    hiddenPieces = hidden.length
    // A shape with a chunk in the way is drawn without that chunk's triangles;
    // every other shape is drawn as it was posed.
    const hiddenIn = new Map<number, number[]>()
    for (const chunk of hidden) {
      const shape = chunkShapes[chunk] as number
      const list = hiddenIn.get(shape)
      if (list) list.push(chunkLocal[chunk] as number)
      else hiddenIn.set(shape, [chunkLocal[chunk] as number])
    }
    const drawn = [
      ...mapPieces.map((piece, shape) => {
        const gone = hiddenIn.get(shape)
        if (!gone) return piece
        const indices = keepTriangles(piece.geometry.indices, shapeCells[shape] ?? [], gone)
        return { ...piece, geometry: { ...piece.geometry, indices } }
      }),
      ...(showCollision ? collisionDrawn : []),
      ...castPiecesNow,
      ...treasureDrawn,
      ...loaded.cast.sprites2d.flatMap((s) =>
        spritePieces(
          s,
          toFloat(PERSON.height) * worldScale,
          camera.yaw,
          standingFrame(s, camera.yaw),
        ),
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
    uploaded = renderer.upload([
      ...mapPieces,
      ...(showCollision ? collisionDrawn : []),
      ...castPiecesNow,
      ...treasureDrawn,
    ])
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
/** `?collision=1`, or `c` at any time: draw the collision mesh over the map. */
let showCollision = params.get('collision') === '1'
/** Built per map, and again whenever the fit below is moved. */
let collisionDrawn: Piece[] = []
/**
 * A correction to the collision, fitted by eye — see `CollisionFit`.
 *
 * It moves the mesh the character walks on as well as the one drawn, so a fit
 * can be judged by walking it and not only by looking at it.
 */
let fit: CollisionFit = fitFrom(params.get('fit'))
const NO_FIT_LINE = fitLine('', NO_FIT).trim()
/** The world as the fit leaves it: what the character actually walks on. */
let world: CollisionWorld | undefined
/**
 * A scale on the room the map *draws*, as against the collision it carries.
 *
 * The two experiments are not the same. Making the collision twice the size
 * gives the character twice the floor and leaves the room as it was; making the
 * room half the size fits the same floor to a smaller room and leaves the
 * character standing over more of it. They align identically and look nothing
 * alike, so both have to be available for the eye to choose between them.
 *
 * `?room=` sets it, `n` and `m` move it.
 */
let roomScale = Number(params.get('room')) > 0 ? Number(params.get('room')) : 1
/**
 * A scale on the room **and** its collision together, against the character.
 *
 * The other two controls ask whether the room and the collision agree with each
 * other. This one asks the question underneath: whether the pair of them is
 * right and the *character* is the wrong size. `PERSON.height` was set by eye
 * against the village and is the one number in the chain that no file gives, so
 * it is the one worth being able to hold still while everything else moves.
 *
 * `?world=` sets it, `g` and `h` move it.
 */
let worldScale = Number(params.get('world')) > 0 ? Number(params.get('world')) : 1
/**
 * A scale on the **character**, leaving the world exactly as the file has it.
 *
 * The cleaner way to ask whether the character is the wrong size. Growing the
 * world asks the same question and asks the camera an awkward one alongside it:
 * the boom is a multiple of the character's height, so a doubled room framed by
 * an unchanged character puts the camera on the floorboards. Shrinking the
 * character instead is the ordinary case with a different constant, and the
 * camera behaves.
 *
 * `?person=` sets it, `j` and `i` move it. `PERSON.radius` goes with it, being
 * a fact about the body; the step and snap heights do not — see `PERSON`.
 */
let personScale = Number(params.get('person')) > 0 ? Number(params.get('person')) : 1
/** The character as the scale above leaves them. */
function person() {
  if (personScale === 1) return PERSON
  return {
    ...PERSON,
    height: fx32(Math.round(PERSON.height * personScale)),
    radius: fx32(Math.round(PERSON.radius * personScale)),
  }
}
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

/**
 * Rebuild the collision from the map's meshes with the current fit applied.
 *
 * Both the mesh drawn and the one walked on, so a fit can be judged by walking
 * it. Cheap enough to do on a keypress: an interior is a few dozen triangles.
 */
function refit(): void {
  if (!loaded) return
  // The collision takes its own fit and the world scale on top of it, so the
  // two questions stay separate: does the collision match the room, and does
  // the pair match the character.
  // A door's own collision stands only while the door is shut.
  const standing = loaded.map.meshes.filter(
    (_, index) => !doors.some((door) => door.mesh === index && !doorShut(door)),
  )
  const meshes = fitMeshes(standing, {
    sx: fit.sx * worldScale,
    sy: fit.sy * worldScale,
    sz: fit.sz * worldScale,
    x: fit.x * worldScale,
    y: fit.y * worldScale,
    z: fit.z * worldScale,
  })
  world = meshes.length > 0 ? createCollisionWorld(meshes) : undefined
  collisionDrawn = world ? collisionPieces(world) : []
}

/**
 * Step the story stage through the ones this map's cast records and triggers
 * start at — see `Loaded.stages`. Before the first is no stage at all: the
 * file's own first placement of each character.
 */
function moveStage(by: number): void {
  if (!loaded) return
  const known = [...loaded.stages]
  const current = storyStage
  if (current && !known.some((stage) => sameStage(stage, current))) known.push(current)
  known.sort((a, b) => stageOrder(a) - stageOrder(b))
  const list: (Stage | undefined)[] = [undefined, ...known]
  const at = list.findIndex((stage) => sameStage(stage, current))
  storyStage = list[(at + by + list.length) % list.length]
  closeTalk()
  loaded = { ...loaded, cast: loaded.castAt(storyStage) }
  poseMap(Math.max(mapFrame, 0))
  const here = loaded.cast.members.length + loaded.cast.sprites2d.length
  const line =
    storyStage === undefined
      ? `${loaded.code} cast as the file first places it — ${here} characters · t/y change stage`
      : `${loaded.code} stage ${storyStage.major}.${storyStage.minor} · talk from chapter ${chapter() ?? '—'} — ${here} characters · t/y change stage`
  status(line)
  console.log(line)
}

/** The chapter letter talk is read from: the one `v` and `b` chose, or the stage's. */
function chapter(): string | undefined {
  if (!loaded || loaded.letters.length === 0) return undefined
  if (chapterIndex !== undefined) return loaded.letters[chapterIndex]
  return letterForStage(loaded.letters, storyStage)
}

/** Step the chapter talk is read from, leaving the cast where it stands. */
function moveChapter(by: number): void {
  if (!loaded || loaded.letters.length === 0) return
  const count = loaded.letters.length
  const from = chapterIndex ?? Math.max(0, loaded.letters.indexOf(chapter() ?? ''))
  chapterIndex = (from + by + count) % count
  closeTalk()
  status(
    `${loaded.code} talk from chapter ${loaded.letters[chapterIndex]} (${chapterIndex + 1} of ${count}) · v/b change chapter · f talk`,
  )
}

/** Redraw the treasure markers, after a map is entered or a treasure opened. */
function refreshTreasures(): void {
  if (!loaded) {
    treasureDrawn = []
    return
  }
  const { code, treasures } = loaded
  const isOpen = (treasure: Treasure, slot: number) =>
    openedTreasure.has(treasureKey(code, slot, treasure))
  treasureDrawn = [
    // A chest is drawn with its own model; anything else placed keeps a marker.
    ...chestPieces(treasures, loaded.chests, isOpen, (material) =>
      textureFor(loaded?.catalogue ?? { textures: new Map() }, material),
    ),
    ...treasurePieces(
      treasures,
      isOpen,
      toFloat(PERSON.height) * worldScale * TREASURE_MARKER,
      isChest,
    ),
  ]
}

/**
 * Open the treasure the Hero is facing, if there is one near enough: the same
 * reach and facing as talking. True when there was one.
 */
function openTreasureAhead(): boolean {
  if (!loaded || !self) return false
  const target = talkTarget(
    { x: toFloat(self.state.x), z: toFloat(self.state.z), facing: self.facing },
    [
      ...treasureTargets(loaded.treasures),
      ...cabinetTargets(cabinets).map((t) => ({ ...t, id: CABINET_TARGET + t.id })),
    ],
  )
  if (!target) return false
  // A cabinet opens whatever is inside: it plays its opening once, then holds.
  const cabinet = target.id >= CABINET_TARGET ? cabinets[target.id - CABINET_TARGET] : undefined
  if (cabinet && cabinet.motion === CABINET_SHUT) {
    cabinet.motion = CABINET_OPENING
    cabinet.since = Math.max(mapFrame, 0)
    poseMap(Math.max(mapFrame, 0))
  }
  const slot = cabinet ? cabinet.slot : target.id
  const treasure = slot === undefined ? undefined : loaded.treasures[slot]
  if (slot === undefined || !treasure) {
    talking = startConversation(
      target,
      `${cabinet?.stem ?? 'treasure'} in ${loaded.code}`,
      ['You open it. No treasure record is paired with it.'],
      ['unpaired'],
    )
    showTalk()
    return true
  }
  const key = treasureKey(loaded.code, slot, treasure)
  const already = openedTreasure.has(key)
  openedTreasure.add(key)
  talking = startConversation(
    { ...target, id: treasure.index ?? target.id },
    `${cabinet ? `${cabinet.stem}, ` : ''}kind 0x${treasure.kind.toString(16)} in ${loaded.code}`,
    [treasureText(treasure, already)],
    [already ? 'already open' : 'opened'],
  )
  refreshTreasures()
  showTalk()
  return true
}

/**
 * `f`: talk to whoever the Hero is facing, or go on to the next page. With
 * nobody there, open the treasure or the cabinet in front instead, if there is one.
 *
 * What they say is `pickLine`'s choice for the story stage — a line of their
 * talk file, or an event's messages — and the status line says why. `Shift+F`
 * reads out every line of their file instead, for checking the choice.
 */
function talk(everyLine = false): void {
  if (!loaded || !self) return
  if (talking) {
    talking = nextPage(talking)
    showTalk()
    return
  }
  const cast: Talker[] = [...loaded.cast.members, ...loaded.cast.sprites2d].map((member) => ({
    id: member.placement.id,
    name: member.name,
    x: member.placement.x,
    z: member.placement.z,
  }))
  const who = talkTarget(
    { x: toFloat(self.state.x), z: toFloat(self.state.z), facing: self.facing },
    cast,
  )
  if (!who) {
    if (openTreasureAhead()) return
    const here = { x: toFloat(self.state.x), z: toFloat(self.state.z) }
    const nearest = nearestTreasure(loaded.treasures, here)
    const cabinet = cabinets
      .map((c) => Math.hypot(c.x - here.x, c.z - here.z))
      .sort((a, b) => a - b)[0]
    status(
      'nobody near enough, and in front, to talk to, and no treasure' +
        (nearest
          ? ` — the nearest, #${nearest.treasure.index ?? '?'}, is ${nearest.distance.toFixed(2)} away`
          : ' placed in this map') +
        (cabinet === undefined ? '' : `; the nearest cabinet is ${cabinet.toFixed(2)} away`),
    )
    return
  }
  const letter = chapter()
  const lines = letter === undefined ? [] : loaded.linesOf(who.id, letter)
  if (everyLine || storyStage === undefined) {
    talking = startConversation(
      who,
      `every line of chapter ${letter ?? '—'}`,
      lines.map((line) => line.text),
      lines.map(noteOf),
    )
  } else {
    const choice = pickLine({
      triggers: loaded.triggers,
      map: loaded.mapId,
      stage: storyStage,
      night: wantedLighting === 'night',
      id: who.id,
      lines,
    })
    if (choice?.kind === 'line') {
      talking = startConversation(
        who,
        `chapter ${letter}: ${choice.why}`,
        [choice.line.text],
        [noteOf(choice.line)],
      )
    } else if (choice?.kind === 'event') {
      const messages = loaded.eventMessages(choice.event)
      talking = startConversation(
        who,
        `ev${String(choice.event).padStart(5, '0')}: ${choice.why}`,
        messages.map((message) => message.text),
        messages.map((message) => `message ${message.id}`),
      )
    }
  }
  if (!talking) {
    const when = storyStage ? ` at ${storyStage.major}.${storyStage.minor}` : ''
    status(`${who.name} (#${who.id}) has nothing to say in chapter ${letter ?? '—'}${when}`)
    return
  }
  showTalk()
}

/** Draw the main menu, or put it away when it is closed. */
function showMenu(): void {
  if (!menu) {
    menuEl.hidden = true
    return
  }
  menuEl.replaceChildren()
  const commands = document.createElement('div')
  commands.className = 'commands'
  for (const [index, command] of MENU_COMMANDS.entries()) {
    const item = document.createElement('div')
    item.textContent = command.label
    if (index === menu.cursor) item.className = 'chosen'
    commands.append(item)
  }
  menuEl.append(commands)
  if (menu.panel) {
    const panel = document.createElement('div')
    panel.className = 'panel'
    const stage = storyStage ? `${storyStage.major}.${storyStage.minor}` : undefined
    for (const line of panelLines(menu.panel, {
      hero: DEFAULT_CONTEXT.heroName,
      map: loaded?.code,
      stage,
    })) {
      const row = document.createElement('div')
      row.textContent = line
      panel.append(row)
    }
    menuEl.append(panel)
  }
  menuEl.hidden = false
}

/** Draw the conversation's page into the text box, or put the box away when it is over. */
function showTalk(): void {
  if (!talking) {
    closeTalk()
    return
  }
  const { who, source, texts, notes, line, page, run, choice, aside } = talking
  const shown = run.pages[page]
  talkEl.replaceChildren()
  if (shown?.speaker) {
    const name = document.createElement('div')
    name.className = 'speaker'
    name.textContent = shown.speaker
    talkEl.append(name)
  }
  const body = document.createElement('div')
  body.textContent = shown?.text ?? ''
  talkEl.append(body)
  // A prompt is asked on the last page of a run, with its answers under it.
  const asking = promptOf(talking)
  if (asking) {
    const list = document.createElement('div')
    list.className = 'choices'
    for (const [index, answer] of asking.answers.entries()) {
      const item = document.createElement('div')
      item.textContent = answer.label
      if (index === choice) item.className = 'chosen'
      list.append(item)
    }
    talkEl.append(list)
  }
  talkEl.hidden = false
  const which = texts.length > 1 ? `${line + 1} of ${texts.length}, ` : ''
  status(
    `${who.name} #${who.id} · ${source} · ${which}${notes[line] ?? ''} · page ${page + 1} of ${run.pages.length}` +
      (aside ? ` · ${aside}` : '') +
      (run.unhandled.length > 0 ? ` · not shown: <${run.unhandled.join('> <')}>` : '') +
      (asking ? ' · ↑/↓ choose, f answer, Esc close' : ' · f next, Esc close'),
  )
}

function closeTalk(): void {
  talking = undefined
  talkEl.hidden = true
  talkEl.replaceChildren()
}

/** Resize the character, leaving the world exactly as the file has it. */
function movePerson(by: number): void {
  personScale = Math.max(0.05, personScale + by)
  poseMap(0)
  showCollision = true
  const line =
    `${loaded?.code ?? '?'}  character ${personScale.toFixed(3)}` +
    `  (${toFloat(person().height).toFixed(3)} tall, world untouched)`
  status(line)
  console.log(line)
}

/** Resize the room and its collision together, leaving the character alone. */
function moveWorld(by: number): void {
  const was = worldScale
  worldScale = Math.max(0.05, worldScale + by)
  // Everything in the world scales except the character, so the character has
  // to be carried to where they now stand in it.
  if (self) {
    const k = worldScale / was
    self.state = {
      ...self.state,
      x: fx32(Math.round(self.state.x * k)),
      y: fx32(Math.round(self.state.y * k)),
      z: fx32(Math.round(self.state.z * k)),
    }
  }
  poseMap(0)
  showCollision = true
  const line =
    `${loaded?.code ?? '?'}  world ${worldScale.toFixed(3)}` +
    `  (room and collision together, character ${toFloat(PERSON.height).toFixed(3)} tall)`
  status(line)
  console.log(line)
}

/** Resize the room the map draws, leaving its collision where the file put it. */
function moveRoom(by: number): void {
  roomScale = Math.max(0.05, roomScale + by)
  poseMap(0)
  showCollision = true
  const line = `${loaded?.code ?? '?'}  room ${roomScale.toFixed(3)}  ·  ${fitLine('collision', fit)}`
  status(line)
  console.log(line)
}

/**
 * What is currently being done to this map, said out loud.
 *
 * A fit or a room scale is easy to leave applied and impossible to see, and a
 * map that has been quietly resized looks like a map that is wrong. So the
 * state goes on the status line whenever it is not the file's own.
 */
function fitState(): string {
  const moved = fit !== NO_FIT && fitLine('', fit).trim() !== NO_FIT_LINE
  const resized = roomScale !== 1 || worldScale !== 1 || personScale !== 1
  if (!moved && !resized) return 'as the file has it'
  return [
    moved ? fitLine('collision', fit) : '',
    roomScale !== 1 ? `room ${roomScale.toFixed(3)}` : '',
    worldScale !== 1 ? `world ${worldScale.toFixed(3)}` : '',
    personScale !== 1 ? `character ${personScale.toFixed(3)}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Move the fit and say where it now is, in a form that can be copied down. */
function moveFit(by: Partial<CollisionFit>, factor?: number): void {
  const step = (was: number, add: number | undefined) => (factor ? was * factor : was + (add ?? 0))
  fit = {
    sx: step(fit.sx, by.sx),
    sy: step(fit.sy, by.sy),
    sz: step(fit.sz, by.sz),
    x: fit.x + (by.x ?? 0),
    y: fit.y + (by.y ?? 0),
    z: fit.z + (by.z ?? 0),
  }
  refit()
  showCollision = true
  const line = fitLine(loaded?.code ?? '?', fit)
  status(`${line} · room ${roomScale.toFixed(3)}   —   ${describeCollision(world)}`)
  console.log(line)
}

addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase()
  // The main menu: `x` opens it, and it or Esc goes back a step at a time.
  // While it is up the Hero stands still and the movement keys choose.
  if (menu) {
    if (key === 'arrowup' || key === 'w') menu = moveCursor(menu, -1)
    else if (key === 'arrowdown' || key === 's') menu = moveCursor(menu, 1)
    else if (key === 'f' || key === 'enter') {
      const taken = choose(menu)
      menu = taken.state
      if (taken.talk) {
        showMenu()
        talk()
        event.preventDefault()
        return
      }
    } else if (key === 'x' || key === 'escape') menu = back(menu)
    showMenu()
    event.preventDefault()
    return
  }
  if (key === 'x' && loaded && !talking) {
    self?.held.clear()
    menu = openMenu()
    showMenu()
    event.preventDefault()
    return
  }
  // While a prompt waits for an answer the arrows choose, before anything else
  // that uses them; f or Enter answers, as it goes on to the next page.
  if (talking && promptOf(talking) && key.startsWith('arrow')) {
    talking = moveChoice(talking, key === 'arrowup' || key === 'arrowleft' ? -1 : 1)
    showTalk()
    event.preventDefault()
    return
  }
  if (key === 'enter' && talking) {
    talk()
    event.preventDefault()
    return
  }
  if (self && (key === 'w' || key === 'a' || key === 's' || key === 'd')) {
    self.held.add(key)
    event.preventDefault()
  }
  // Talk to whoever the Hero faces: `f` to start and to go on, Shift+F for every
  // line of their file, Esc to stop, `v` and `b` to read another chapter's words.
  if (key === 'f' && loaded) {
    talk(event.shiftKey)
    event.preventDefault()
  }
  if (key === 'escape' && talking) {
    closeTalk()
    event.preventDefault()
  }
  if ((key === 'v' || key === 'b') && loaded) {
    moveChapter(key === 'b' ? 1 : -1)
    event.preventDefault()
  }
  // Flick through the story stages the cast's records name: `t` back, `y` on.
  if ((key === 't' || key === 'y') && loaded) {
    moveStage(key === 'y' ? 1 : -1)
    event.preventDefault()
  }
  if (key === 'c') {
    showCollision = !showCollision
    status(
      showCollision
        ? `${fitLine(loaded?.code ?? '?', fit)} — green stands, red stops · arrows move · q/e raise · -/= scale all, ,/. x, ;/' z, k/l y · [/] halve/double · n/m room · g/h room+collision · j/i character · 0 resets`
        : 'collision hidden',
    )
    event.preventDefault()
  }
  // Fitting the collision over the room, by eye. Only while it is on show, so
  // these keys are free the rest of the time.
  if (showCollision) {
    const step = event.shiftKey ? 0.1 : 0.01
    const nudge: Record<string, () => void> = {
      arrowleft: () => moveFit({ x: -step }),
      arrowright: () => moveFit({ x: step }),
      arrowup: () => moveFit({ z: -step }),
      arrowdown: () => moveFit({ z: step }),
      q: () => moveFit({ y: -step }),
      e: () => moveFit({ y: step }),
      // All three axes together, then each on its own: the first room fitted
      // wanted twice its size in z and about its own in x.
      '-': () => moveFit({ sx: -step, sy: -step, sz: -step }),
      '=': () => moveFit({ sx: step, sy: step, sz: step }),
      ',': () => moveFit({ sx: -step }),
      '.': () => moveFit({ sx: step }),
      ';': () => moveFit({ sz: -step }),
      "'": () => moveFit({ sz: step }),
      k: () => moveFit({ sy: -step }),
      l: () => moveFit({ sy: step }),
      // The other way round: leave the collision and resize the room over it.
      n: () => moveRoom(-step),
      m: () => moveRoom(step),
      // Both at once, against a character that does not move: is the pair right
      // and the character small?
      g: () => moveWorld(-step),
      h: () => moveWorld(step),
      // And the character alone, which asks the same question the other way up.
      j: () => movePerson(-step),
      i: () => movePerson(step),
      '[': () => moveFit({}, 0.5),
      ']': () => moveFit({}, 2),
      '0': () => {
        fit = NO_FIT
        roomScale = 1
        worldScale = 1
        personScale = 1
        poseMap(0)
        refit()
        status(`${fitLine(loaded?.code ?? '?', fit)} — back to the file`)
      },
    }
    const move = nudge[key]
    if (move) {
      move()
      event.preventDefault()
      return
    }
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
