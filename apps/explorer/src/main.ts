import { effectOf, type Song, songOf } from '@minstrel/audio'
import { Music } from '@minstrel/audio/player'
import {
  animationsFor,
  type Catalogue,
  catalogue,
  type Leaf,
  scanCartridge,
  textureFor,
} from '@minstrel/cartridge'
import {
  isMapManifest,
  isSprite,
  type MapManifest,
  readMapManifest,
  readSprite,
  type Sprite,
} from '@minstrel/game-formats'
import { DS_HEIGHT, DS_WIDTH, ModelRenderer, type Piece, ReferenceTarget } from '@minstrel/gl'
import {
  type Animation,
  drawCell,
  type Geometry,
  isG2dFile,
  type Mat4,
  type Model,
  measureBounds,
  NCER_MAGIC,
  NCGR_MAGIC,
  NCLR_MAGIC,
  type NodeTransform,
  poseGeometry,
  readNcer,
  readNcgr,
  readNclr,
  readNsbmd,
  sampleAnimation,
} from '@minstrel/nitro-gfx'
import { isSdat, readSdat, type Sdat } from '@minstrel/nitro-snd'
import { followCamera, OUTDOORS } from '@minstrel/render'
import { assembleMap, type MapPiece, placeGeometry } from '@minstrel/world'
import workletUrl from './sound-worklet.ts?worker&url'

/**
 * Browse a DS cartridge in the browser.
 *
 * General-purpose on purpose: this opens **any** DS cartridge, not one title.
 * It is what keeps the parser packages honest — a change to a `nitro-*` package
 * that only works on one game breaks the explorer on an unrelated cartridge,
 * and that is the test.
 *
 * The cartridge is read entirely on this machine; nothing is uploaded. Parsing
 * runs on the main thread, which is fine for the seconds a scan takes, and is
 * the thing to move into a Worker next.
 */

/** Something the list can show: one model, or a whole map. */
interface Entry {
  readonly path: string
  readonly name: string
  /** Set for a single model. */
  readonly leaf?: Leaf
  /** Set for an assembled map: the archive whose descriptor describes it. */
  readonly archive?: string
  /** Set for a 2D sprite sheet, which is drawn rather than rendered. */
  readonly sheet?: Leaf
  /** Set for a set of 2D cells: an NCER with the NCGR and NCLR beside it. */
  readonly cells?: {
    readonly ncer: Uint8Array
    readonly ncgr: Uint8Array
    readonly nclr: Uint8Array
  }
  /** Set for a sound: a sequence of an SDAT by name, or a sequence archive's first entry by index. */
  readonly sound?: { readonly sdat: Sdat; readonly sequence?: string; readonly archive?: number }
}

function must<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`page is missing ${selector}`)
  return element
}

const fileInput = must<HTMLInputElement>('#file')
const statusEl = must<HTMLDivElement>('#status')
const listEl = must<HTMLUListElement>('#models')
const filterEl = must<HTMLInputElement>('#filter')
const canvas = must<HTMLCanvasElement>('#gl')
const overlay = must<HTMLDivElement>('#overlay')
const scrubber = must<HTMLDivElement>('#scrubber')
const animationEl = must<HTMLSelectElement>('#animation')
const frameEl = must<HTMLInputElement>('#frame')
const frameLabelEl = must<HTMLSpanElement>('#frameLabel')
const playEl = must<HTMLButtonElement>('#play')
const soundEl = must<HTMLDivElement>('#sound')
const soundNameEl = must<HTMLDivElement>('#soundName')
const soundPlayEl = must<HTMLButtonElement>('#soundPlay')
const soundNoteEl = must<HTMLDivElement>('#soundNote')

/** The sequencer in its worklet — `@minstrel/audio` — playing one SDAT sequence at a time. */
const music = new Music(workletUrl)

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

// Reference mode renders at the DS's own 256x192 and 5-bit colour, then scales
// that up. It is the validation tool: differences from hardware only show at
// hardware's size and precision.
const referenceTarget = new ReferenceTarget(renderer.context)
const camera = followCamera(OUTDOORS, 1)

let cat: Catalogue | undefined
let manifests = new Map<string, MapManifest>()
let entries: Entry[] = []
let selected = -1
let wireframe = false
let referenceMode = false
let playing = true

/** What is on screen. */
interface Shown {
  readonly path: string
  /** The models drawn, each with where the map puts it and what animates it. */
  readonly pieces: readonly MapPiece[]
  readonly animations: readonly Animation[]
  animation: Animation | undefined
  frame: number
  /** An extra line for the overlay, when there is something to say. */
  readonly note: string | undefined
}

let shown: Shown | undefined
let lastShapes = 0
/** The DS plays a model's own animations at 30 frames a second. */
const ANIMATION_FPS = 30

/**
 * Walk the cartridge and catalogue what is in it.
 *
 * `pathFilter` limits the walk to cartridge paths containing a substring. A
 * full scan touches every archive and every compressed member, which is several
 * seconds of work; narrowing it is what makes a targeted load quick.
 */
function scan(rom: Uint8Array, pathFilter?: string): Entry[] {
  manifests = new Map()
  const options = pathFilter === undefined ? {} : { pathFilter }
  cat = catalogue(scanCartridge(rom, options), {
    classify: (leaf) => {
      if (!isMapManifest(leaf.bytes)) return false
      try {
        manifests.set(leaf.archive, readMapManifest(leaf.bytes))
      } catch {
        // A descriptor that will not read is not fatal to the scan.
      }
      return true
    },
  })

  // A map is worth offering as one thing. Its pieces stay in the list too,
  // because looking at one of them on its own is often what you want.
  const maps: Entry[] = [...manifests.keys()].map((archive) => ({
    path: archive,
    name: `${archive.slice(archive.lastIndexOf('/') + 1)} (map)`,
    archive,
  }))
  const models: Entry[] = cat.models.map((leaf) => ({
    path: leaf.path,
    name: leaf.path.slice(leaf.path.lastIndexOf('/') + 1),
    leaf,
  }))
  // Sprite sheets arrive as unclaimed leaves: they are not models and not in an
  // archive the catalogue knows how to open.
  const sheets: Entry[] = cat.other
    .filter((leaf) => leaf.path.toLowerCase().endsWith('.spr') && isSprite(leaf.bytes))
    .map((leaf) => ({
      path: leaf.path,
      name: `${leaf.path.slice(leaf.path.lastIndexOf('/') + 1)} (sprite)`,
      sheet: leaf,
    }))
  // Sets of 2D cells: an NCER with an NCGR and an NCLR under the same name.
  const byStem = new Map<string, Map<string, Leaf>>()
  for (const leaf of cat.other) {
    const dot = leaf.path.lastIndexOf('.')
    if (dot < 0) continue
    const kind = leaf.path.slice(dot + 1).toUpperCase()
    if (kind !== 'NCER' && kind !== 'NCGR' && kind !== 'NCLR') continue
    const stem = leaf.path.slice(0, dot)
    const set = byStem.get(stem) ?? new Map<string, Leaf>()
    set.set(kind, leaf)
    byStem.set(stem, set)
  }
  const cells: Entry[] = []
  for (const [stem, set] of byStem) {
    const ncer = set.get('NCER')
    const ncgr = set.get('NCGR')
    const nclr = set.get('NCLR')
    if (!ncer || !ncgr || !nclr) continue
    if (!isG2dFile(ncer.bytes, NCER_MAGIC) || !isG2dFile(ncgr.bytes, NCGR_MAGIC)) continue
    if (!isG2dFile(nclr.bytes, NCLR_MAGIC)) continue
    cells.push({
      path: stem,
      name: `${stem.slice(stem.lastIndexOf('/') + 1)} (cells)`,
      cells: { ncer: ncer.bytes, ncgr: ncgr.bytes, nclr: nclr.bytes },
    })
  }
  // Sounds: every SDAT's named sequences, and its sequence archives.
  const sounds: Entry[] = []
  for (const leaf of cat.other) {
    if (!isSdat(leaf.bytes)) continue
    let sdat: Sdat
    try {
      sdat = readSdat(leaf.bytes)
    } catch {
      continue
    }
    const file = leaf.path.slice(leaf.path.lastIndexOf('/') + 1)
    for (const record of sdat.sequences) {
      if (record.fileId === undefined || !record.name) continue
      sounds.push({
        path: `${leaf.path}#${record.name}`,
        name: `${record.name} (sequence, ${file})`,
        sound: { sdat, sequence: record.name },
      })
    }
    const archives = sdat.records[1] ?? []
    archives.forEach((record, index) => {
      if (record.fileId === undefined) return
      const label = record.name || `archive ${index}`
      sounds.push({
        path: `${leaf.path}#${label}`,
        name: `${label} (effects, ${file})`,
        sound: { sdat, archive: index },
      })
    })
  }
  return [...maps, ...models, ...sheets, ...cells, ...sounds]
}

function renderList(): void {
  const needle = filterEl.value.trim().toLowerCase()
  listEl.replaceChildren()
  entries.forEach((entry, index) => {
    if (needle && !entry.path.toLowerCase().includes(needle)) return
    const li = document.createElement('li')
    li.textContent = entry.name
    li.title = entry.path
    li.setAttribute('aria-selected', String(index === selected))
    li.addEventListener('click', () => select(index))
    listEl.append(li)
  })
}

/** Every drawable shape of the shown models, posed for the current frame. */
function draw(): Piece[] {
  if (!shown || !cat) return []
  const drawn: Piece[] = []
  for (const { model, place, animation } of shown.pieces) {
    // A map's models each drive themselves; a single model uses the animation
    // picked in the scrubber.
    const playingNow = animation ?? shown.animation
    const stacks: readonly (readonly Mat4[])[] =
      playingNow && playingNow.boneCount === model.nodes.length
        ? model.pose(posedNodes(model, playingNow, shown.frame))
        : model.shapeMatrices

    model.shapes.forEach((shape, index) => {
      const geometry: Geometry = placeGeometry(
        poseGeometry(model.geometry(shape), stacks[index] ?? model.matrices),
        place,
        1,
      )
      const materialIndex = model.shapeMaterials[index]
      const material = materialIndex === undefined ? undefined : model.materials[materialIndex]
      const texture = material ? textureFor(cat as Catalogue, material) : undefined
      drawn.push(texture ? { geometry, ...texture } : { geometry })
    })
  }
  return drawn
}

function posedNodes(model: Model, animation: Animation, frame: number): NodeTransform[] {
  const local = sampleAnimation(animation, frame % Math.max(1, animation.frameCount))
  return model.nodes.map((node, i) => {
    const posed = local[i]
    return posed ? { ...node, local: posed } : node
  })
}

/** Upload the current frame and describe it. */
function pose(): void {
  const drawn = draw()
  lastShapes = drawn.length
  describe(renderer.upload(drawn))
}

/** The sprite sheet on show: each frame its parts put together — see `readSprite`. */
let sheetSprite: Sprite | undefined

const sheetEl = must<HTMLCanvasElement>('#sheet')

/** A set of 2D cells on show, each drawn — see `drawCell`; undefined where one would not. */
let sheetCells: readonly { width: number; height: number; pixels: Uint8Array }[] | undefined

/** What the sheet canvas lays out: the sprite's frames, or the cells. */
function sheetImages(): {
  count: number
  image: (i: number) => { width: number; height: number; pixels: Uint8Array } | undefined
} {
  if (sheetCells) {
    const cells = sheetCells
    return { count: cells.length, image: (i) => cells[i] }
  }
  const sprite = sheetSprite
  if (!sprite) return { count: 0, image: () => undefined }
  return {
    count: sprite.frames,
    image: (i) => {
      try {
        return sprite.decode(i)
      } catch {
        return undefined
      }
    },
  }
}

/** Lay every frame of the sheet — or every cell of the set — out in a grid, as big as the canvas allows. */
function drawSheet(): void {
  const images = sheetImages()
  const context = sheetEl.getContext('2d')
  if (images.count === 0 || !context) return
  const across = Math.ceil(Math.sqrt(images.count))
  const down = Math.ceil(images.count / across)
  // Every cell as large as the largest, so the grid is even.
  let first = { width: 1, height: 1 }
  for (let i = 0; i < images.count; i++) {
    const image = images.image(i)
    if (image)
      first = {
        width: Math.max(first.width, image.width),
        height: Math.max(first.height, image.height),
      }
  }
  const gap = 2
  const cellW = first.width + gap
  const cellH = first.height + gap
  const wide = across * cellW
  const tall = down * cellH
  // Whole-number zoom only: a sprite half-scaled is a sprite you cannot judge.
  const zoom = Math.max(
    1,
    Math.floor(Math.min(sheetEl.clientWidth / wide, sheetEl.clientHeight / tall)),
  )
  sheetEl.width = wide * zoom
  sheetEl.height = tall * zoom
  context.imageSmoothingEnabled = false
  context.fillStyle = '#14141a'
  context.fillRect(0, 0, sheetEl.width, sheetEl.height)

  for (let frame = 0; frame < images.count; frame++) {
    const image = images.image(frame)
    if (!image) continue
    const data = new ImageData(new Uint8ClampedArray(image.pixels), image.width, image.height)
    // A checkerboard behind it, because what is wrong with a sprite is usually
    // where its holes are.
    const atX = (frame % across) * cellW * zoom
    const atY = Math.floor(frame / across) * cellH * zoom
    for (let y = 0; y < image.height * zoom; y += 8) {
      for (let x = 0; x < image.width * zoom; x += 8) {
        context.fillStyle = ((x >> 3) + (y >> 3)) % 2 === 0 ? '#22222a' : '#2c2c36'
        context.fillRect(atX + x, atY + y, 8, 8)
      }
    }
    const tile = document.createElement('canvas')
    tile.width = image.width
    tile.height = image.height
    tile.getContext('2d')?.putImageData(data, 0, 0)
    context.drawImage(tile, atX, atY, image.width * zoom, image.height * zoom)
  }
}

function select(index: number): void {
  const entry = entries[index]
  if (!entry || !cat) return
  selected = index

  try {
    if (entry.sound !== undefined) {
      soundEl.hidden = false
      sheetEl.hidden = true
      canvas.hidden = true
      scrubber.hidden = true
      shown = undefined
      playSound(entry)
      renderList()
      return
    }
    soundEl.hidden = true
    if (entry.cells !== undefined) {
      const bank = readNcer(entry.cells.ncer)
      const tiles = readNcgr(entry.cells.ncgr)
      const palettes = readNclr(entry.cells.nclr)
      let failed = 0
      sheetCells = bank.cells.map((cell) => {
        try {
          const drawn = drawCell(cell, bank.mapping, tiles, palettes)
          return { width: drawn.width, height: drawn.height, pixels: drawn.rgba }
        } catch {
          failed++
          return { width: 8, height: 8, pixels: new Uint8Array(8 * 8 * 4) }
        }
      })
      sheetSprite = undefined
      sheetEl.hidden = false
      canvas.hidden = true
      scrubber.hidden = true
      shown = undefined
      drawSheet()
      status(
        `${entry.path} — ${bank.cells.length} cells, ${tiles.bits}-bit characters, ${palettes.bits}-bit palettes` +
          (failed > 0 ? `, ${failed} not drawn` : ''),
      )
      renderList()
      return
    }
    if (entry.sheet !== undefined) {
      sheetSprite = readSprite(entry.sheet.bytes)
      sheetCells = undefined
      sheetEl.hidden = false
      canvas.hidden = true
      scrubber.hidden = true
      shown = undefined
      drawSheet()
      const parts = sheetSprite.layout[0]?.parts.length ?? 0
      status(
        `${entry.path} — ${sheetSprite.frames} frames, up to ${sheetSprite.width}x${sheetSprite.height}` +
          `, ${parts} part${parts === 1 ? '' : 's'} to the first, ${sheetSprite.colours} colours`,
      )
      renderList()
      return
    }
    sheetEl.hidden = true
    canvas.hidden = false
    if (entry.archive !== undefined) {
      const manifest = manifests.get(entry.archive)
      const members = cat.members.get(entry.archive)
      if (!manifest || !members) throw new Error('the archive holds nothing to assemble')
      const map = assembleMap(manifest, members)
      if (map.pieces.length === 0) throw new Error('the descriptor names no model that reads')
      shown = {
        path: entry.path,
        pieces: map.pieces,
        animations: [],
        animation: undefined,
        frame: 0,
        note:
          `assembled from ${map.pieces.length} models` +
          (map.meshes.length > 0 ? ` and ${map.meshes.length} collision meshes` : '') +
          (map.missing.length > 0 ? `, ${map.missing.length} missing` : ''),
      }
    } else {
      const leaf = entry.leaf as Leaf
      const model = readNsbmd(leaf.bytes).models[0]
      if (!model) throw new Error('container holds no model')
      const animations = animationsFor(cat, model, leaf.archive)
      shown = {
        path: entry.path,
        // A lone model is shown at its own size and framed by its bounds, so
        // it takes no shrink into a world.
        pieces: [{ model, place: { x: 0, y: 0, z: 0 }, scale: 1, animation: undefined }],
        animations,
        animation: animations[0],
        frame: 0,
        note: undefined,
      }
    }
  } catch (error) {
    shown = undefined
    overlay.textContent = `${entry.name}\n${error instanceof Error ? error.message : String(error)}`
    return
  }

  // Frame on the bind pose, so the camera does not jump about as an animation
  // moves the geometry.
  if (!shown) return
  const bindPose: Shown = { ...shown, animation: undefined, frame: 0 }
  const saved = shown
  shown = bindPose
  const drawn = draw()
  shown = saved
  const bounds = measureBounds(drawn.map((piece) => piece.geometry))
  const size = Math.max(
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
    bounds.maxZ - bounds.minZ,
    0.001,
  )
  camera.focus = [
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + bounds.maxY) / 2,
    (bounds.minZ + bounds.maxZ) / 2,
  ]
  camera.distance = size * 2.2
  camera.actualDistance = camera.distance

  renderScrubber()
  renderList()
  pose()
}

/** The sound on show, and whether it is playing — see `playSound`. */
let sounding: { readonly entry: Entry; readonly song: Song; playing: boolean } | undefined

/** Play an entry's sound: a sequence by name, or a sequence archive's first filled entry. */
function playSound(entry: Entry): void {
  const sound = entry.sound
  if (!sound) return
  const song =
    sound.sequence !== undefined
      ? songOf(sound.sdat, sound.sequence)
      : sound.archive !== undefined
        ? effectOf(sound.sdat, sound.archive)
        : undefined
  soundNameEl.textContent = entry.name
  if (!song) {
    sounding = undefined
    soundPlayEl.hidden = true
    soundNoteEl.textContent = 'its bank or waves would not read'
    status(`${entry.path} — will not play`)
    return
  }
  sounding = { entry, song, playing: true }
  soundPlayEl.hidden = false
  soundPlayEl.textContent = 'stop'
  const waves = song.archives.reduce((n, a) => n + (a?.length ?? 0), 0)
  status(
    `${entry.path} — ${song.commands.length} bytes of commands, ${song.bank.instruments.length} instruments, ${waves} waves, volume ${song.volume}`,
  )
  void music.play(entry.name, song)
}

soundPlayEl.addEventListener('click', () => {
  if (!sounding) return
  if (sounding.playing) {
    music.stop()
    sounding.playing = false
    soundPlayEl.textContent = 'play'
  } else {
    void music.play(sounding.entry.name, sounding.song)
    sounding.playing = true
    soundPlayEl.textContent = 'stop'
  }
})

/** The overlay text for whatever is on screen. */
function describe(uploaded: { vertices: number; triangles: number; textured: number }): void {
  if (!shown) return
  const { animation } = shown
  overlay.textContent = [
    shown.path,
    `${lastShapes} shapes · ${uploaded.vertices} vertices · ${uploaded.triangles} triangles`,
    `${uploaded.textured}/${lastShapes} shapes textured, from ${cat?.textures.size ?? 0} textures found`,
    shown.note,
    referenceMode ? `reference mode: ${DS_WIDTH}x${DS_HEIGHT}, 5-bit colour` : 'full resolution',
    animation
      ? `${animation.name} — frame ${shown.frame} of ${animation.frameCount}, ${animation.boneCount} bones`
      : shown.animations.length > 0
        ? 'bind pose'
        : undefined,
    'drag to orbit · wheel to zoom · W wireframe · R reference mode · space play/pause',
  ]
    .filter((line) => line !== undefined)
    .join('\n')
}

/** Fill the animation picker and the frame slider for the current model. */
function renderScrubber(): void {
  const list = shown?.animations ?? []
  scrubber.hidden = list.length === 0
  if (!shown || list.length === 0) return

  animationEl.replaceChildren()
  const rest = document.createElement('option')
  rest.value = ''
  rest.textContent = 'bind pose'
  animationEl.append(rest)
  list.forEach((animation, index) => {
    const option = document.createElement('option')
    option.value = String(index)
    option.textContent = `${animation.name} (${animation.frameCount}f)`
    animationEl.append(option)
  })
  animationEl.value = shown.animation ? String(list.indexOf(shown.animation)) : ''
  frameEl.max = String(Math.max(0, (shown.animation?.frameCount ?? 1) - 1))
  frameEl.value = String(shown.frame)
  frameLabelEl.textContent = shown.animation
    ? `${shown.frame} / ${shown.animation.frameCount - 1}`
    : ''
  playEl.textContent = playing ? 'pause' : 'play'
}

/** Step the animation on, at the DS's 30 frames a second. */
function advance(elapsed: number): void {
  if (!shown || !playing) return
  // A map's models animate themselves whether or not the scrubber is showing.
  const selfDriven = shown.pieces.some((piece) => piece.animation !== undefined)
  const count = shown.animation?.frameCount ?? 0
  const next = Math.floor(elapsed / (1000 / ANIMATION_FPS))
  if (selfDriven) {
    if (next === shown.frame) return
    shown.frame = next
    pose()
    return
  }
  if (!shown.animation || count <= 1) return
  const wrapped = next % count
  if (wrapped === shown.frame) return
  shown.frame = wrapped
  frameEl.value = String(wrapped)
  frameLabelEl.textContent = `${wrapped} / ${count - 1}`
  pose()
}

/**
 * Take a cartridge and catalogue it.
 *
 * The bytes are taken as they arrive rather than through a `Blob`: a dump is
 * upwards of 128 MiB and going through one costs a second copy and, in some
 * browsers, a spill to disk that fails outright.
 */
async function load(rom: Uint8Array, label: string, pathFilter?: string): Promise<void> {
  status(`reading ${label}…`)
  const started = performance.now()
  try {
    entries = scan(rom, pathFilter)
  } catch (error) {
    status(error instanceof Error ? error.message : String(error))
    return
  }
  const elapsed = Math.round(performance.now() - started)
  status(`${entries.length} entries found in ${elapsed} ms`)
  filterEl.hidden = entries.length === 0
  selected = -1
  renderList()
  if (entries.length > 0) select(0)
}

animationEl.addEventListener('change', () => {
  if (!shown) return
  const index = animationEl.value === '' ? -1 : Number(animationEl.value)
  shown.animation = shown.animations[index]
  shown.frame = 0
  renderScrubber()
  pose()
})

frameEl.addEventListener('input', () => {
  if (!shown?.animation) return
  playing = false
  playEl.textContent = 'play'
  shown.frame = Number(frameEl.value)
  frameLabelEl.textContent = `${shown.frame} / ${shown.animation.frameCount - 1}`
  pose()
})

playEl.addEventListener('click', () => {
  playing = !playing
  playEl.textContent = playing ? 'pause' : 'play'
})

async function chose(file: File): Promise<void> {
  status(`reading ${file.name}…`)
  await load(new Uint8Array(await file.arrayBuffer()), file.name)
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) void chose(file)
})
filterEl.addEventListener('input', renderList)

addEventListener('resize', () => {
  if (!sheetEl.hidden) drawSheet()
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
  camera.pitch = Math.max(-1.5, Math.min(1.5, camera.pitch + (event.clientY - lastY) * 0.01))
  lastX = event.clientX
  lastY = event.clientY
})
canvas.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault()
    camera.distance = Math.max(0.05, camera.distance * (event.deltaY > 0 ? 1.1 : 1 / 1.1))
    camera.actualDistance = camera.distance
  },
  { passive: false },
)

addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
  if (event.key === 'w' || event.key === 'W') wireframe = !wireframe
  if (event.key === 'r' || event.key === 'R') {
    referenceMode = !referenceMode
    describe(renderer.upload(draw()))
  }
  if (event.key === ' ') {
    event.preventDefault()
    playing = !playing
    playEl.textContent = playing ? 'pause' : 'play'
  }
})

function frame(now = 0): void {
  advance(now)
  if (sounding) {
    const report = music.report
    soundNoteEl.textContent = report
      ? `${report.playing ? 'playing' : report.finished ? 'finished' : 'stopped'} · ${report.ticks} sequence ticks · ${Math.round(report.frames / 44100)} s of audio`
      : 'starting…'
  }
  const width = Math.max(1, Math.floor(canvas.clientWidth * devicePixelRatio))
  const height = Math.max(1, Math.floor(canvas.clientHeight * devicePixelRatio))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }

  if (referenceMode) {
    referenceTarget.bind()
    renderer.draw(camera, wireframe, { width: DS_WIDTH, height: DS_HEIGHT })
    referenceTarget.present(width, height, true)
  } else {
    renderer.draw(camera, wireframe)
  }
  requestAnimationFrame(frame)
}
frame()
status('choose or drop a cartridge dump')

// Development convenience: `?rom=<url>` loads a dump over HTTP instead of
// through the file picker, and `?model=<substring>` picks one by path. This is
// what lets the explorer be driven headlessly for verification. It fetches only
// what the URL names, so it stays inert unless a developer asks for it.
const params = new URLSearchParams(location.search)
const romUrl = params.get('rom')
if (romUrl) {
  void (async () => {
    status(`fetching ${romUrl}…`)
    try {
      const response = await fetch(romUrl)
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      if (params.get('reference') === '1') referenceMode = true
      await load(
        new Uint8Array(await response.arrayBuffer()),
        romUrl,
        params.get('path') ?? undefined,
      )
      const wanted = params.get('model')
      if (wanted) {
        const index = entries.findIndex((e) => e.path.toLowerCase().includes(wanted.toLowerCase()))
        if (index >= 0) select(index)
        else status(`no model matching '${wanted}'`)
      }
      const wantedAnimation = params.get('animation')
      if (wantedAnimation !== null && shown) {
        const index = shown.animations.findIndex((a) =>
          a.name.toLowerCase().includes(wantedAnimation.toLowerCase()),
        )
        shown.animation = index >= 0 ? shown.animations[index] : undefined
        shown.frame = 0
        renderScrubber()
        pose()
      }
      const wantedFrame = params.get('frame')
      if (wantedFrame !== null && shown?.animation) {
        playing = false
        shown.frame = Number(wantedFrame)
        renderScrubber()
        pose()
      }
      const yaw = params.get('yaw')
      const pitch = params.get('pitch')
      if (yaw) camera.yaw = Number(yaw)
      if (pitch) camera.pitch = Number(pitch)
      document.title = `ready — ${entries.length} models`
    } catch (error) {
      status(error instanceof Error ? error.message : String(error))
      document.title = 'failed'
    }
  })()
}
