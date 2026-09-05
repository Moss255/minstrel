import { isGpc, readGpc } from '@vesper/l5-gpc'
import { tryDecompressLz10 } from '@vesper/nitro-comp'
import { type Geometry, isNsbmd, type Model, measureBounds, readNsbmd } from '@vesper/nitro-gfx'
import { isNarc, readNarc, readNitroFs, walkFiles } from '@vesper/nitrofs'
import { type Camera, ModelRenderer } from './renderer.ts'

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

const camera: Camera = { yaw: 0.7, pitch: 0.35, distance: 4, target: [0, 0, 0] }
let wireframe = false
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

  const fs = readNitroFs(rom)
  const needle = pathFilter?.toLowerCase()
  for (const file of walkFiles(fs.root)) {
    if (needle && !file.path.toLowerCase().includes(needle)) continue
    visit(fs.read(file), file.path, 0)
  }
  return found
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
  let geometries: Geometry[] = []
  try {
    const nsbmd = readNsbmd(entry.bytes)
    model = nsbmd.models[0]
    if (!model) throw new Error('container holds no model')
    geometries = model.shapes.map((shape) => (model as Model).geometry(shape))
  } catch (error) {
    overlay.textContent = `${entry.name}\n${error instanceof Error ? error.message : String(error)}`
    return
  }

  const uploaded = renderer.upload(geometries)
  const bounds = measureBounds(geometries)
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
    `materials: ${model.materials.map((m) => m.name).join(', ') || '(none)'}`,
    'drag to orbit · wheel to zoom · W for wireframe',
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
})

function frame(): void {
  renderer.draw(camera, wireframe)
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
