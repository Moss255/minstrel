import {
  isCollisionMesh,
  isMapManifest,
  type MapManifest,
  readMapManifest,
  resolveMapResources,
} from '@vesper/game-formats'
import { isGpc, readGpc } from '@vesper/l5-gpc'
import { tryDecompressLz10 } from '@vesper/nitro-comp'
import {
  type Animation,
  type Geometry,
  isNsbca,
  isNsbmd,
  isNsbtx,
  type Mat4,
  type Model,
  type ModelMaterial,
  measureBounds,
  type NodeTransform,
  poseGeometry,
  readNsbca,
  readNsbmd,
  readTex0,
  sampleAnimation,
  type TextureSet,
  textureNameForMaterial,
} from '@vesper/nitro-gfx'
import { isNarc, readNarc, readNitroFs, walkFiles } from '@vesper/nitrofs'
import { DS_HEIGHT, DS_WIDTH, ReferenceTarget } from './reference.ts'
import { type Camera, ModelRenderer, type Piece } from './renderer.ts'

/**
 * Load a cartridge in the browser, find every model in it, and draw one.
 *
 * The cartridge is read entirely on this machine; nothing is uploaded. Parsing
 * runs on the main thread here, which is fine for the tens of milliseconds a
 * scan takes, and is the thing to move into a Worker when the explorer grows.
 */

/**
 * Something the list can show: one model, or a whole map assembled from the
 * resources its manifest names.
 */
interface Entry {
  path: string
  name: string
  /** Set for a single model. */
  bytes?: Uint8Array
  /** Set for an assembled map: the archive whose manifest describes it. */
  archive?: string
}

/**
 * Every texture the cartridge scan turned up, by name.
 *
 * A material names its texture but does not say which file holds it, and a
 * map's textures are routinely in a different archive from its models — so the
 * viewer resolves against everything it has loaded rather than guessing at the
 * pairing.
 */
const texturesByName = new Map<string, { set: TextureSet; name: string }>()

/**
 * Animations found in the scan, by the archive path they came from.
 *
 * An animation names no model, so the pairing is by proximity and bone count:
 * the animations offered for a model are the ones beside it that drive the same
 * number of bones.
 */
const animationsByArchive = new Map<string, Animation[]>()

/**
 * Map manifests found in the scan, and what each archive holds.
 *
 * A map is not one model. Its archive holds a dozen loose files and a `.bmdj`
 * beside them saying which of them the map is made of, so the viewer offers the
 * assembled map as well as its individual pieces.
 */
const manifestsByArchive = new Map<string, MapManifest>()
const membersByArchive = new Map<string, Map<string, Uint8Array>>()

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

const camera: Camera = { yaw: 0.7, pitch: 0.35, distance: 4, target: [0, 0, 0] }
let wireframe = false
let referenceMode = false
let entries: Entry[] = []
let selected = -1

/**
 * Walk the cartridge, unwrapping archives and compression, collecting models.
 *
 * `pathFilter` limits the walk to cartridge paths containing a substring. A
 * full scan touches every archive and every compressed member, which is several
 * seconds of work; narrowing it is what makes a targeted load quick. This runs
 * on the main thread and is the first thing to move into a Worker.
 */
function collectModels(rom: Uint8Array, pathFilter?: string): Entry[] {
  const found: Entry[] = []

  const visit = (bytes: Uint8Array, path: string, depth: number): void => {
    if (depth > 4) return
    const payload = tryDecompressLz10(bytes) ?? bytes

    if (isNsbmd(payload)) {
      found.push({ path, name: path.slice(path.lastIndexOf('/') + 1), bytes: payload })
      collectTextures(payload)
      return
    }
    if (isCollisionMesh(payload)) return
    if (isNsbtx(payload)) {
      collectTextures(payload)
      return
    }
    if (isMapManifest(payload)) {
      try {
        manifestsByArchive.set(path.slice(0, path.lastIndexOf('/')), readMapManifest(payload))
      } catch {
        // A manifest that will not read is not fatal to the scan.
      }
      return
    }
    if (isNsbca(payload)) {
      try {
        const archive = path.slice(0, path.lastIndexOf('/'))
        const list = animationsByArchive.get(archive) ?? []
        list.push(...readNsbca(payload).animations)
        animationsByArchive.set(archive, list)
      } catch {
        // An animation container that will not read is not fatal to the scan.
      }
      return
    }
    if (isNarc(payload)) {
      try {
        const members = new Map<string, Uint8Array>()
        for (const member of readNarc(payload).entries()) {
          const name = String(member.name ?? member.index)
          const data = tryDecompressLz10(member.data) ?? member.data
          members.set(name, data)
          visit(member.data, `${path}/${name}`, depth + 1)
        }
        // Kept so a map's manifest can resolve its resources by stem.
        if (members.size > 0) membersByArchive.set(path, members)
      } catch {
        // A container that will not open is not fatal to the scan.
      }
      return
    }
    if (isGpc(payload)) {
      try {
        const archive = readGpc(payload)
        for (const member of archive.members) {
          if (!member.readable) continue
          visit(archive.read(member), `${path}/${member.name}`, depth + 1)
        }
      } catch {
        // Same.
      }
    }
  }

  texturesByName.clear()
  animationsByArchive.clear()
  manifestsByArchive.clear()
  membersByArchive.clear()
  const fs = readNitroFs(rom)
  const needle = pathFilter?.toLowerCase()
  for (const file of walkFiles(fs.root)) {
    if (needle && !file.path.toLowerCase().includes(needle)) continue
    visit(fs.read(file), file.path, 0)
  }

  // A map is worth offering as one thing. Its pieces stay in the list too,
  // because looking at one of them on its own is often what you want.
  const maps: Entry[] = []
  for (const [archive] of manifestsByArchive) {
    maps.push({
      path: archive,
      name: `${archive.slice(archive.lastIndexOf('/') + 1)} (map)`,
      archive,
    })
  }
  return [...maps, ...found]
}

/**
 * Load every model a map's manifest names.
 *
 * The manifest lists authoring names; the archive holds what they were built
 * to. Nothing is placed: a map's pieces already carry their own world
 * coordinates, which is why they can simply be drawn together.
 */
function assembleMap(archive: string): { models: Model[]; missing: string[]; collision: number } {
  const manifest = manifestsByArchive.get(archive)
  const members = membersByArchive.get(archive)
  if (!manifest || !members) return { models: [], missing: [], collision: 0 }

  const models: Model[] = []
  const missing: string[] = []
  let collision = 0
  for (const { resource, files } of resolveMapResources(manifest, members.keys())) {
    if (files.length === 0) {
      missing.push(resource.name)
      continue
    }
    // One authored resource compiles to several files under the same stem, so
    // take each for what it is rather than picking one and hoping.
    for (const file of files) {
      const bytes = members.get(file)
      if (!bytes) continue
      if (isCollisionMesh(bytes)) {
        collision++
        continue
      }
      if (!isNsbmd(bytes)) continue
      try {
        const model = readNsbmd(bytes).models[0]
        if (model?.numShapes) models.push(model)
      } catch {
        missing.push(file)
      }
    }
  }
  return { models, missing, collision }
}

/** Index a container's textures by name, if it carries any. */
function collectTextures(bytes: Uint8Array): void {
  try {
    let set: TextureSet | undefined
    if (isNsbtx(bytes)) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const offset = view.getUint32(0x10, true)
      set = readTex0(bytes.subarray(offset, offset + view.getUint32(offset + 4, true)))
    } else {
      set = readNsbmd(bytes).textures
    }
    if (!set) return
    for (const texture of set.textures) {
      if (!texturesByName.has(texture.name))
        texturesByName.set(texture.name, { set, name: texture.name })
    }
  } catch {
    // A container whose textures will not read is not fatal to the scan.
  }
}

/** Decode the texture a material names, if the scan found one. */
interface DecodedTexture {
  pixels: Uint8Array
  width: number
  height: number
}

function textureFor(material: ModelMaterial): DecodedTexture | undefined {
  // The material says which texture and palette it binds. Falling back to the
  // name heuristic only matters for the few materials that declare neither.
  const wanted = material.texture ?? textureNameForMaterial(material.name)
  const found = texturesByName.get(wanted)
  if (!found) return undefined
  const info = found.set.texture(found.name)
  if (!info) return undefined
  try {
    const palette =
      (material.palette === undefined ? undefined : found.set.palette(material.palette)) ??
      found.set.palette(`${info.name}_pl`) ??
      found.set.palettes[info.index]
    return { pixels: found.set.decode(info, palette), width: info.width, height: info.height }
  } catch {
    return undefined
  }
}

/** The animations beside a model that drive the same skeleton. */
function animationsFor(model: Model, path: string): Animation[] {
  const list = animationsByArchive.get(path.slice(0, path.lastIndexOf('/'))) ?? []
  return list.filter((a) => a.boneCount === model.nodes.length)
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
/**
 * What the viewer is currently showing: one model, or a whole map assembled
 * from the resources its manifest names.
 *
 * A piece is one shape of one model, with its geometry as the display list gave
 * it. Keeping it unposed means a frame change is one pass of matrix resolution
 * and one pass over the vertices, with no display list re-run — and it is what
 * lets several models share a scene, because each piece remembers which model
 * to pose it against.
 */
interface Piece_ {
  readonly model: Model
  readonly shape: number
  readonly geometry: Geometry
  readonly texture: DecodedTexture | undefined
}

interface Shown {
  path: string
  models: Model[]
  pieces: Piece_[]
  animations: Animation[]
  animation: Animation | undefined
  frame: number
  /** An extra line for the overlay, when there is something to say. */
  note: string | undefined
}

let shown: Shown | undefined
let playing = true

/** Every drawable shape of a model, with the texture its material binds. */
function piecesOf(model: Model): Piece_[] {
  return model.shapes.map((shape, index) => {
    const materialIndex = model.shapeMaterials[index]
    const material = materialIndex === undefined ? undefined : model.materials[materialIndex]
    return {
      model,
      shape: index,
      geometry: model.geometry(shape),
      texture: material ? textureFor(material) : undefined,
    }
  })
}

/** Upload the current frame, posing against the animation if one is playing. */
function pose(): void {
  if (!shown) return
  const { animation } = shown

  // Each shape has its own matrix stack, because a model reuses slots between
  // shapes; `Model.pose` resolves them against the frame's node transforms.
  const stacks = new Map<Model, Mat4[][]>()
  for (const model of shown.models) {
    if (animation && animation.boneCount === model.nodes.length) {
      const local = sampleAnimation(animation, shown.frame)
      const nodes: NodeTransform[] = model.nodes.map((node, i) => {
        const posed = local[i]
        return posed ? { ...node, local: posed } : node
      })
      stacks.set(model, model.pose(nodes))
    } else {
      stacks.set(model, model.shapeMatrices as Mat4[][])
    }
  }

  const drawn: Piece[] = shown.pieces.map((piece) => {
    const stack = stacks.get(piece.model)?.[piece.shape] ?? piece.model.matrices
    const posed = poseGeometry(piece.geometry, stack)
    return piece.texture ? { geometry: posed, ...piece.texture } : { geometry: posed }
  })
  describe(renderer.upload(drawn))
}

function select(index: number): void {
  const entry = entries[index]
  if (!entry) return
  selected = index

  try {
    if (entry.archive !== undefined) {
      const { models, missing, collision } = assembleMap(entry.archive)
      if (models.length === 0) throw new Error('the manifest names no model that reads')
      shown = {
        path: entry.path,
        models,
        pieces: models.flatMap(piecesOf),
        animations: [],
        animation: undefined,
        frame: 0,
        note:
          `assembled from ${models.length} models` +
          (collision > 0 ? ` and ${collision} collision meshes` : '') +
          (missing.length > 0 ? `, ${missing.length} missing` : ''),
      }
    } else {
      const model = readNsbmd(entry.bytes as Uint8Array).models[0]
      if (!model) throw new Error('container holds no model')
      const animations = animationsFor(model, entry.path)
      shown = {
        path: entry.path,
        models: [model],
        pieces: piecesOf(model),
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

  const drawn: Piece[] = shown.pieces.map((piece) => {
    const stack = piece.model.shapeMatrices[piece.shape] ?? piece.model.matrices
    const posed = poseGeometry(piece.geometry, stack)
    return piece.texture ? { geometry: posed, ...piece.texture } : { geometry: posed }
  })

  const uploaded = renderer.upload(drawn)
  // Frame on the bind pose, so the camera does not jump about as an animation
  // moves the geometry.
  const bounds = measureBounds(drawn.map((p) => p.geometry))
  const size = Math.max(
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
    bounds.maxZ - bounds.minZ,
    0.001,
  )
  camera.target = [
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + bounds.maxY) / 2,
    (bounds.minZ + bounds.maxZ) / 2,
  ]
  camera.distance = size * 2.2

  describe(uploaded)
  renderScrubber()
  renderList()
  if (shown.animation) pose()
}

/** The overlay text for whatever is on screen. */
function describe(uploaded: { vertices: number; triangles: number; textured: number }): void {
  if (!shown) return
  const { animation } = shown
  const shapes = shown.pieces.length
  overlay.textContent = [
    shown.path,
    `${shapes} shapes · ${uploaded.vertices} vertices · ${uploaded.triangles} triangles`,
    `${uploaded.textured}/${shapes} shapes textured, from ${texturesByName.size} textures found`,
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
  if (!shown?.animation || !playing) return
  const count = shown.animation.frameCount
  if (count <= 1) return
  const next = Math.floor(elapsed / (1000 / 30)) % count
  if (next === shown.frame) return
  shown.frame = next
  frameEl.value = String(next)
  frameLabelEl.textContent = `${next} / ${count - 1}`
  pose()
}

async function load(file: File, pathFilter?: string): Promise<void> {
  status(`reading ${file.name}…`)
  const rom = new Uint8Array(await file.arrayBuffer())
  const started = performance.now()
  try {
    entries = collectModels(rom, pathFilter)
  } catch (error) {
    status(error instanceof Error ? error.message : String(error))
    return
  }
  const elapsed = Math.round(performance.now() - started)
  status(`${entries.length} models found in ${elapsed} ms`)
  filterEl.hidden = entries.length === 0
  selected = -1
  renderList()
  if (entries.length > 0) select(0)
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) void load(file)
})
filterEl.addEventListener('input', renderList)

document.addEventListener('dragover', (event) => {
  event.preventDefault()
  document.body.classList.add('dragging')
})
document.addEventListener('dragleave', () => document.body.classList.remove('dragging'))
document.addEventListener('drop', (event) => {
  event.preventDefault()
  document.body.classList.remove('dragging')
  const file = event.dataTransfer?.files?.[0]
  if (file) void load(file)
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
  },
  { passive: false },
)
addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
  if (event.key === 'w' || event.key === 'W') wireframe = !wireframe
  if (event.key === 'r' || event.key === 'R') {
    referenceMode = !referenceMode
    if (selected >= 0) select(selected)
  }
  if (event.key === ' ') {
    event.preventDefault()
    playing = !playing
    playEl.textContent = playing ? 'pause' : 'play'
  }
})

function frame(now: number = 0): void {
  advance(now)
  const canvas = renderer.context.canvas as HTMLCanvasElement
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
// what lets the viewer be driven headlessly for verification. It fetches only
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
      await load(new File([await response.blob()], romUrl), params.get('path') ?? undefined)
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
