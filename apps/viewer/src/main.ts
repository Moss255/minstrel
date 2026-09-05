import { isGpc, readGpc } from '@vesper/l5-gpc'
import { tryDecompressLz10 } from '@vesper/nitro-comp'
import {
  isNsbmd,
  isNsbtx,
  type Model,
  measureBounds,
  readNsbmd,
  readTex0,
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

interface Entry {
  path: string
  name: string
  bytes: Uint8Array
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
    if (isNsbtx(payload)) {
      collectTextures(payload)
      return
    }
    if (isNarc(payload)) {
      try {
        for (const member of readNarc(payload).entries()) {
          visit(member.data, `${path}/${member.name ?? member.index}`, depth + 1)
        }
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
  const fs = readNitroFs(rom)
  const needle = pathFilter?.toLowerCase()
  for (const file of walkFiles(fs.root)) {
    if (needle && !file.path.toLowerCase().includes(needle)) continue
    visit(fs.read(file), file.path, 0)
  }
  return found
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

function textureFor(materialName: string): DecodedTexture | undefined {
  const wanted = textureNameForMaterial(materialName)
  const found = texturesByName.get(wanted)
  if (!found) return undefined
  const info = found.set.texture(found.name)
  if (!info) return undefined
  try {
    const palette = found.set.palette(`${info.name}_pl`) ?? found.set.palettes[info.index]
    return { pixels: found.set.decode(info, palette), width: info.width, height: info.height }
  } catch {
    return undefined
  }
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

function select(index: number): void {
  const entry = entries[index]
  if (!entry) return
  selected = index

  let model: Model | undefined
  let pieces: Piece[] = []
  try {
    const nsbmd = readNsbmd(entry.bytes)
    model = nsbmd.models[0]
    if (!model) throw new Error('container holds no model')
    const resolved = model
    pieces = resolved.shapes.map((shape, index) => {
      // Posed: each vertex placed by the matrix its display list bound it to,
      // which is what a skinned model needs and is the identity for the rest.
      const geometry = resolved.posedGeometry(shape)
      const materialIndex = resolved.shapeMaterials[index]
      const material = materialIndex === undefined ? undefined : resolved.materials[materialIndex]
      const texture = material ? textureFor(material.name) : undefined
      return texture ? { geometry, ...texture } : { geometry }
    })
  } catch (error) {
    overlay.textContent = `${entry.name}\n${error instanceof Error ? error.message : String(error)}`
    return
  }

  const uploaded = renderer.upload(pieces)
  const bounds = measureBounds(pieces.map((p) => p.geometry))
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

  overlay.textContent = [
    entry.path,
    `${model.numShapes} shapes · ${uploaded.vertices} vertices · ${uploaded.triangles} triangles`,
    `${uploaded.textured}/${model.numShapes} shapes textured, from ${texturesByName.size} textures found`,
    referenceMode ? `reference mode: ${DS_WIDTH}x${DS_HEIGHT}, 5-bit colour` : 'full resolution',
    'drag to orbit · wheel to zoom · W wireframe · R reference mode',
  ].join('\n')

  renderList()
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
  if (event.key === 'w' || event.key === 'W') wireframe = !wireframe
  if (event.key === 'r' || event.key === 'R') {
    referenceMode = !referenceMode
    if (selected >= 0) select(selected)
  }
})

function frame(): void {
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
