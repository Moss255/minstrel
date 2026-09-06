import { FX32_ONE, fx32, toFloat } from '@vesper/fixed'
import {
  type CollisionMesh,
  isCollisionMesh,
  isMapManifest,
  type MapManifest,
  readCollisionMesh,
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
} from '@vesper/render'
import {
  type CharacterState,
  type CollisionWorld,
  createCollisionWorld,
  groundBelow,
  PERSON,
  step as stepCharacter,
} from '@vesper/sim'
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

/**
 * The character parts and the motions that drive them.
 *
 * A character on this cartridge is not a model but a set of them: several
 * pieces, each an NSBMD carrying the same fourteen-bone rig — `waist`, `chest`,
 * `arm0L`, `head`, `leg1R` and so on — drawn together and posed by one
 * animation. The motions live apart from the parts, in a pack of their own.
 *
 * Which parts make the Hero is **not known**: they are a library of 796, and
 * the preset that names his is not decoded. The three `p_test` models are whole
 * figures on the same rig, so they stand in.
 */
const characterParts: Model[] = []
const characterMotions = new Map<string, Animation>()
const STAND_IN_PARTS = /\/chara_pc\.gp2\/p_test\d+\.nsbmd$/
const MOTION_PACK = '/chara_mp.gp2/mp0200ne.chr'
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

const camera: Camera = followCamera(OUTDOORS, toFloat(PERSON.height))
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
      if (STAND_IN_PARTS.test(path)) {
        try {
          const part = readNsbmd(payload).models[0]
          if (part?.numShapes) characterParts.push(part)
        } catch {
          // A part that will not read simply is not drawn.
        }
      }
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
        const read = readNsbca(payload).animations
        list.push(...read)
        if (archive.endsWith(MOTION_PACK)) {
          for (const motion of read) characterMotions.set(motion.name, motion)
        }
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
  characterParts.length = 0
  characterMotions.clear()
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
function assembleMap(archive: string): {
  models: Model[]
  missing: string[]
  meshes: CollisionMesh[]
} {
  const manifest = manifestsByArchive.get(archive)
  const members = membersByArchive.get(archive)
  if (!manifest || !members) return { models: [], missing: [], meshes: [] }

  const models: Model[] = []
  const missing: string[] = []
  const meshes: CollisionMesh[] = []
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
        try {
          meshes.push(readCollisionMesh(bytes))
        } catch {
          missing.push(file)
        }
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
  return { models, missing, meshes }
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
  /** Set when the thing on screen has collision to walk on. */
  world: CollisionWorld | undefined
}

/**
 * Walking the map, when there is collision under it.
 *
 * The character is simulated at a fixed 60Hz in the cartridge's own fixed-point
 * units; only the camera it drives is in floats. The position is not rendered
 * as a model yet — the Hero exists on the cartridge only as a library of parts,
 * and which of them make him is not known — so for now walking moves the
 * camera and the overlay reports where the feet are.
 */
interface Walker {
  state: CharacterState
  /** Which movement keys are down. */
  readonly held: Set<string>
  /** Left over from the last frame, so a slow frame is still 60Hz of ticks. */
  carry: number
  /** Which way the character is facing, in radians about the vertical. */
  facing: number
  /** Frame of the motion playing. */
  motionFrame: number
  /** The character's pieces, and how much to shrink them into the world. */
  readonly body: Piece_[]
  readonly scale: number
  /** Whether there is a roof overhead, which is what picks the camera style. */
  inside: boolean
}

/**
 * Build the character's pieces and work out how big it should be.
 *
 * The parts are modelled at their own scale, so they are shrunk to the height
 * the controller assumes a person is. Deriving the scale rather than picking a
 * number means the model and the collision capsule agree by construction.
 *
 * **Measure a pose the character is drawn in, not the bind pose.** The bind
 * pose is a T-pose: arms straight out, 9.2 units across and only 7.7 tall. Its
 * height is the height of a figure holding itself flat, not the height of the
 * figure — once posed it stands 10.0 tall. Scaling by the T-pose and drawing
 * the posed figure made the character 30% larger than the capsule walking it,
 * and it grew as it set off, because standing fell back to the bind pose.
 *
 * The **walk cycle** is what to measure, not the tallest pose of every motion:
 * reaching up a ladder or bending to pick something up are legitimately taller
 * and shorter than standing, and sizing by the extreme of those would leave the
 * character walking around too small. Its frames vary by under 2%.
 */
function buildCharacter(): { body: Piece_[]; scale: number } {
  const body = characterParts.flatMap(piecesOf)
  if (body.length === 0) return { body, scale: 1 }

  const heightOf = (stacks: Map<Model, Mat4[][]>): number => {
    const bounds = measureBounds(
      body.map((piece) =>
        poseGeometry(
          piece.geometry,
          stacks.get(piece.model)?.[piece.shape] ??
            piece.model.shapeMatrices[piece.shape] ??
            piece.model.matrices,
        ),
      ),
    )
    return bounds.maxY - bounds.minY
  }

  const upright =
    characterMotions.get('walk') ??
    characterMotions.get('stand') ??
    characterMotions.values().next().value
  let tallest = 0
  if (upright) {
    for (let frame = 0; frame < upright.frameCount; frame++) {
      tallest = Math.max(tallest, heightOf(characterStacks(upright, frame)))
    }
  }
  // No motion read: the bind pose is all there is, and it is better than
  // refusing to draw the character.
  if (tallest <= 0) tallest = heightOf(new Map())
  return { body, scale: (toFloat(PERSON.height) * sizeTrim) / Math.max(tallest, 0.001) }
}

/** Every part's matrix stacks for one frame of a motion, or its bind pose. */
function characterStacks(motion: Animation | undefined, frame: number): Map<Model, Mat4[][]> {
  const stacks = new Map<Model, Mat4[][]>()
  for (const part of characterParts) {
    if (motion && motion.boneCount === part.nodes.length) {
      const local = sampleAnimation(motion, frame)
      const nodes: NodeTransform[] = part.nodes.map((node, i) => {
        const posed = local[i]
        return posed ? { ...node, local: posed } : node
      })
      stacks.set(part, part.pose(nodes))
    } else {
      stacks.set(part, part.shapeMatrices as Mat4[][])
    }
  }
  return stacks
}

let walker: Walker | undefined
/** What the renderer last took, so the overlay can be redrawn without re-uploading. */
let lastUpload = { vertices: 0, triangles: 0, textured: 0 }
/** The scene without the character, kept so only the character is rebuilt. */
let mapPieces: Piece[] = []
/** One box per map piece, measured once, for deciding what is in the way. */
let mapBoxes: Box[] = []
/** Movement per tick, about three world units a second at 60Hz. */
const WALK_SPEED = Math.round(0.05 * FX32_ONE)
/** How much clear air there has to be past a piece for it to count as in the way. */
const CLEARANCE = toFloat(PERSON.radius)
/** How many map pieces the last frame left out, for the overlay. */
let hiddenPieces = 0
/**
 * A live multiplier on the character's size, driven by `[` and `]`.
 *
 * How large a person is against a building is the one part of the character's
 * scale this repository cannot measure — see `PERSON` — so it is adjustable
 * here, against the village, with the resulting number shown in the overlay.
 * Finding it by eye and then writing it down is honest; guessing it and calling
 * it derived would not be.
 */
let sizeTrim = 1
/** The tallest house in the shown map, for reporting the ratio. */
let houseHeight = 0
const TICK_MS = 1000 / 60

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
  lastUpload = renderer.upload(drawn)
  describe(lastUpload)
}

function select(index: number): void {
  const entry = entries[index]
  if (!entry) return
  selected = index

  try {
    if (entry.archive !== undefined) {
      const { models, missing, meshes } = assembleMap(entry.archive)
      if (models.length === 0) throw new Error('the manifest names no model that reads')
      // The cartridge names its own nodes: a model carrying `hus` holds a
      // house, and its tallest shape is that house. Reported so the character's
      // size can be read against something rather than in bare units.
      houseHeight = 0
      for (const model of models) {
        if (!model.nodes.some((node) => /^hus\d*$/.test(node.name))) continue
        for (let shape = 0; shape < model.numShapes; shape++) {
          const bounds = measureBounds([model.posedGeometry(shape)])
          houseHeight = Math.max(houseHeight, bounds.maxY - bounds.minY)
        }
      }
      shown = {
        path: entry.path,
        models,
        pieces: models.flatMap(piecesOf),
        animations: [],
        animation: undefined,
        frame: 0,
        note:
          `assembled from ${models.length} models` +
          (meshes.length > 0 ? ` and ${meshes.length} collision meshes` : '') +
          (missing.length > 0 ? `, ${missing.length} missing` : ''),
        // A map's collision is all of its meshes; the village has thirteen.
        world: meshes.length > 0 ? createCollisionWorld(meshes) : undefined,
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
        world: undefined,
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

  mapPieces = drawn
  mapBoxes = drawn.map((piece) => measureBounds([piece.geometry]))
  const uploaded = renderer.upload(drawn)
  lastUpload = uploaded
  // Frame on the bind pose, so the camera does not jump about as an animation
  // moves the geometry.
  const bounds = measureBounds(drawn.map((p) => p.geometry))
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

  describe(uploaded)
  renderScrubber()
  renderList()
  walker = undefined
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
    walker
      ? `walking — ${toFloat(walker.state.x).toFixed(2)}, ${toFloat(walker.state.y).toFixed(2)}, ${toFloat(walker.state.z).toFixed(2)}` +
        (walker.state.grounded ? '' : ' (falling)') +
        (walker.body.length > 0
          ? ` · ${characterParts.length} character parts, stand-in`
          : ' · no character loaded (scan the whole cartridge to get one)') +
        ` · ${(toFloat(PERSON.height) * sizeTrim).toFixed(2)} units tall` +
        (houseHeight > 0
          ? ` (${((toFloat(PERSON.height) * sizeTrim) / houseHeight).toFixed(2)} of a ${houseHeight.toFixed(2)} house)`
          : '') +
        (sizeTrim !== 1 ? ` · trim ${sizeTrim.toFixed(2)} — [ and ] to adjust` : '') +
        (walker.inside ? ' · indoors' : '') +
        (hiddenPieces > 0 ? ` · ${hiddenPieces} pieces out of the way` : '')
      : shown.world
        ? 'press G to walk this map'
        : undefined,
    referenceMode ? `reference mode: ${DS_WIDTH}x${DS_HEIGHT}, 5-bit colour` : 'full resolution',
    animation
      ? `${animation.name} — frame ${shown.frame} of ${animation.frameCount}, ${animation.boneCount} bones`
      : shown.animations.length > 0
        ? 'bind pose'
        : undefined,
    walker
      ? 'WASD to walk · drag to turn · [ ] resize · G to stop'
      : 'drag to orbit · wheel to zoom · W wireframe · R reference mode · space play/pause',
  ]
    .filter((line) => line !== undefined)
    .join('\n')
}

/**
 * Put a walker on the map, at the centre of the collision it stands on.
 *
 * Somewhere near the middle of the mesh is as good a spawn as anything until
 * the cartridge's own start positions are found; if there is no ground there,
 * the first walkable triangle will do.
 */
function startWalking(): void {
  const world = shown?.world
  if (!world) {
    walker = undefined
    return
  }
  const { bounds } = world
  const midX = fx32(Math.round((bounds.minX + bounds.maxX) / 2))
  const midZ = fx32(Math.round((bounds.minZ + bounds.maxZ) / 2))
  let hit = groundBelow(world, midX, midZ, fx32(bounds.maxY + FX32_ONE))
  let x = midX
  let z = midZ

  if (!hit) {
    // The middle of a village is usually a building. Fall back to the walkable
    // ground nearest the middle rather than to whichever triangle comes first,
    // which could be a rooftop at the far edge of the map.
    let nearest = Number.POSITIVE_INFINITY
    for (const triangle of world.triangles) {
      if (triangle.normal[1] === 0) continue
      const [a, b, c] = triangle.vertices
      const cx = fx32(Math.round((a[0] + b[0] + c[0]) / 3))
      const cz = fx32(Math.round((a[2] + b[2] + c[2]) / 3))
      const away = Math.hypot(cx - midX, cz - midZ)
      if (away >= nearest) continue
      const found = groundBelow(world, cx, cz, fx32(bounds.maxY + FX32_ONE))
      if (!found) continue
      nearest = away
      hit = found
      x = cx
      z = cz
    }
  }
  if (!hit) {
    walker = undefined
    return
  }
  const { body, scale } = buildCharacter()
  walker = {
    state: { x, y: hit.y, z, fallSpeed: fx32(0), grounded: true },
    held: new Set(),
    carry: 0,
    facing: 0,
    motionFrame: 0,
    body,
    scale,
    inside: false,
  }
}

/**
 * The character's pieces, posed and put where it is standing.
 *
 * Every part carries the same rig, so one motion drives all of them: each is
 * posed against its own copy of that skeleton and they move together. The
 * result is then scaled into the world, turned to face the way it is walking,
 * and set down at the feet.
 */
function characterPieces(walker: Walker, motion: Animation | undefined): Piece[] {
  if (walker.body.length === 0) return []
  const sin = Math.sin(walker.facing)
  const cos = Math.cos(walker.facing)
  const scale = walker.scale
  const atX = toFloat(walker.state.x)
  const atY = toFloat(walker.state.y)
  const atZ = toFloat(walker.state.z)

  const stacks = characterStacks(motion, walker.motionFrame)

  return walker.body.map((piece) => {
    const stack = stacks.get(piece.model)?.[piece.shape] ?? piece.model.matrices
    const posed = poseGeometry(piece.geometry, stack)
    const vertices = posed.vertices.map((v) => {
      const x = v.x * scale
      const y = v.y * scale
      const z = v.z * scale
      return { ...v, x: atX + x * cos + z * sin, y: atY + y, z: atZ - x * sin + z * cos }
    })
    const geometry = { ...posed, vertices }
    return piece.texture ? { geometry, ...piece.texture } : { geometry }
  })
}

/**
 * Run the simulation forward by however much real time has passed.
 *
 * Fixed 60Hz, with the remainder carried, so the character covers the same
 * ground whatever the frame rate does. The camera's yaw decides which way
 * "forward" is, so walking is relative to the view rather than to the world.
 */
function walk(elapsedMs: number): void {
  if (!walker || !shown?.world) return
  const held = walker.held
  let forward = 0
  let right = 0
  if (held.has('w')) forward += 1
  if (held.has('s')) forward -= 1
  if (held.has('d')) right += 1
  if (held.has('a')) right -= 1

  walker.carry = Math.min(walker.carry + elapsedMs, TICK_MS * 8)
  let moved = false
  while (walker.carry >= TICK_MS) {
    walker.carry -= TICK_MS
    let dx = 0
    let dz = 0
    if (forward !== 0 || right !== 0) {
      const length = Math.hypot(forward, right)
      const sin = Math.sin(camera.yaw)
      const cos = Math.cos(camera.yaw)
      const fx = (forward / length) * WALK_SPEED
      const rx = (right / length) * WALK_SPEED
      dx = Math.round(fx * sin + rx * cos)
      dz = Math.round(fx * cos - rx * sin)
      moved = true
      // Turn towards where it is going, by the shorter way round.
      const wanted = Math.atan2(dx, dz)
      let turn = wanted - walker.facing
      while (turn > Math.PI) turn -= Math.PI * 2
      while (turn < -Math.PI) turn += Math.PI * 2
      walker.facing += turn * 0.25
    }
    walker.state = stepCharacter(shown.world, walker.state, fx32(dx), fx32(dz), PERSON)
    walker.motionFrame++
  }

  // `walk` while moving, `stand` otherwise. Both come from the motion pack the
  // parts name, which is where a character's animation lives on this cartridge.
  const motion = characterMotions.get(moved ? 'walk' : 'stand')
  if (motion && motion.frameCount > 0) walker.motionFrame %= motion.frameCount

  // Indoors the camera comes in and tilts further down. What counts as indoors
  // is whether there is a roof over the character's head, checked as they walk,
  // so the camera tucks in on the way through a door rather than on a guess
  // about how big the map is.
  const feet: [number, number, number] = [
    toFloat(walker.state.x),
    toFloat(walker.state.y),
    toFloat(walker.state.z),
  ]
  const inside = covered(mapBoxes, feet, toFloat(PERSON.height))
  if (inside !== walker.inside) {
    walker.inside = inside
    Object.assign(camera, applyStyle(camera, inside ? INDOORS : OUTDOORS, toFloat(PERSON.height)))
  }

  // The camera watches the character rather than the map's centre. The world
  // is deliberately not passed: the camera stays where it is and the roof comes
  // off instead, which is what the game does and the only thing that works in a
  // room, where there is nowhere to pull the camera to.
  updateFollowCamera(camera, walker.state, elapsedMs / 1000)

  // Redraw the scene with the character in it. The map's pieces are already
  // posed; only the character changes from frame to frame, and which pieces
  // stand between the camera and the character.
  if (walker.body.length > 0) {
    const hidden = new Set(occluders(mapBoxes, cameraEye(camera), camera.focus, CLEARANCE))
    const visible = mapPieces.filter((_, index) => !hidden.has(index))
    hiddenPieces = hidden.size
    lastUpload = renderer.upload([...visible, ...characterPieces(walker, motion)])
  }
  describe(lastUpload)
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
  // The camera's own limits apply while walking; free look otherwise.
  camera.pitch = walker
    ? camera.pitch + (event.clientY - lastY) * 0.01
    : Math.max(-1.5, Math.min(1.5, camera.pitch + (event.clientY - lastY) * 0.01))
  lastX = event.clientX
  lastY = event.clientY
})
canvas.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault()
    camera.distance = Math.max(0.05, camera.distance * (event.deltaY > 0 ? 1.1 : 1 / 1.1))
    if (!walker) camera.actualDistance = camera.distance
  },
  { passive: false },
)
addEventListener('keyup', (event) => {
  walker?.held.delete(event.key.toLowerCase())
})

addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
  const key = event.key.toLowerCase()

  if (key === '[' || key === ']') {
    sizeTrim = Math.min(4, Math.max(0.05, sizeTrim * (key === '[' ? 1 / 1.1 : 1.1)))
    if (walker) walker = { ...walker, ...buildCharacter() }
    describe(lastUpload)
    return
  }
  if (key === 'g') {
    if (walker) walker = undefined
    else startWalking()
    describe(lastUpload)
    return
  }
  // While walking, WASD drives the character rather than toggling views.
  if (walker && (key === 'w' || key === 'a' || key === 's' || key === 'd')) {
    walker.held.add(key)
    event.preventDefault()
    return
  }
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

let lastFrame = 0
function frame(now: number = 0): void {
  walk(lastFrame === 0 ? 0 : now - lastFrame)
  lastFrame = now
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
