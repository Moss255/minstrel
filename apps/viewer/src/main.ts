import { FX32_ONE, type Fx32, fx32, toFloat } from '@vesper/fixed'
import {
  isCollisionMesh,
  isMapManifest,
  isMarkerVolume,
  isWaterTexture,
  type MapManifest,
  PLACED_PIECE_SCALE,
  placementOf,
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
  loopFrames,
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
  moveRelativeToCamera,
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
  type PlacedMesh,
  step as stepCharacter,
} from '@vesper/sim'
import { motionAdvance } from './motion.ts'
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
/**
 * The motion packs a character draws on.
 *
 * **One character's motions are spread across a family of packs**, not held in
 * one. The `.bcfg` beside a part names `mp0200ne`, and that pack holds exactly
 * one animation: `walk`. Standing is in `mp0200n` and `mp0200f`; `smile` is in
 * `mp0200b`, attacking in `mp0200be`, using an item in `mp0200bi`, casting in
 * `mp0200bm`. Of the cartridge's 136 packs, 56 carry a `stand` and 13 a `walk`,
 * and **not one carries both** — so a reader that takes the pack the config
 * names and stops has a character that can walk and cannot stand still.
 *
 * The family is the name without its trailing suffix.
 */
const MOTION_FAMILY = 'mp0200'
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
        // Every pack of the character's family, not only the one its config
        // names: the motions are spread across them.
        const pack = archive.slice(archive.lastIndexOf('/') + 1)
        if (archive.includes('/chara_mp.gp2/') && pack.startsWith(MOTION_FAMILY)) {
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
  loopLengths.clear()
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
  meshes: PlacedMesh[]
} {
  const manifest = manifestsByArchive.get(archive)
  const members = membersByArchive.get(archive)
  if (!manifest || !members) return { models: [], missing: [], meshes: [] }

  const models: Model[] = []
  const missing: string[] = []
  const meshes: PlacedMesh[] = []
  placeByModel = new Map()
  animationByModel = new Map()
  for (const { resource, files } of resolveMapResources(manifest, members.keys())) {
    if (files.length === 0) {
      missing.push(resource.name)
      continue
    }
    // Where the map puts this piece. A door is modelled at its own origin and
    // placed at the building it belongs to; drawing it unplaced leaves all ten
    // of them stacked in the middle of the map, in the air, with their
    // collision boxes stacked there too — which is walls where there is nothing
    // and nothing where there are walls.
    const place = placementOf(manifest, resource)
    // One authored resource compiles to several files under the same stem, so
    // take each for what it is rather than picking one and hoping.
    for (const file of files) {
      const bytes = members.get(file)
      if (!bytes) continue
      if (isCollisionMesh(bytes)) {
        try {
          const mesh = readCollisionMesh(bytes)
          // A doorway's marker is not a wall. Left in, the village's ten
          // doorways are sealed and its walkable ground drops from 93% to 24%.
          if (isMarkerVolume(mesh)) continue
          meshes.push({
            mesh,
            // Collision is in whole fx32 words; the placement is in units.
            offset: {
              x: Math.round(place.x * FX32_ONE),
              y: Math.round(place.y * FX32_ONE),
              z: Math.round(place.z * FX32_ONE),
            },
          })
        } catch {
          missing.push(file)
        }
        continue
      }
      if (!isNsbmd(bytes)) continue
      try {
        const model = readNsbmd(bytes).models[0]
        if (model?.numShapes) {
          models.push(model)
          placeByModel.set(model, place)
          // The animation compiled from the same authored resource, which is
          // the one that drives this model's own bones.
          for (const sibling of files) {
            if (sibling === file) continue
            const beside = members.get(sibling)
            if (!beside || !isNsbca(beside)) continue
            try {
              const found = readNsbca(beside).animations.find(
                (a) => a.boneCount === model.nodes.length,
              )
              if (found) animationByModel.set(model, found)
            } catch {
              // An animation that will not read simply is not played.
            }
          }
        }
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
  /** Frame of the motion playing, which is fractional between two frames. */
  motionFrame: number
  /** Which motion that frame belongs to, so a change can reset it. */
  motion: string | undefined
  /** The character's pieces, and how much to shrink them into the world. */
  readonly body: Piece_[]
  readonly scale: number
  /** Whether there is a roof overhead, which is what picks the camera style. */
  inside: boolean
}

/**
 * The stand-in parts worth drawing.
 *
 * The three `p_test` parts are not three pieces of one figure. `p_test0` is a
 * whole figure of four shapes; `p_test1` is its upper two and `p_test2` its
 * lower two, to the same bounds exactly. Drawing all three draws the character
 * twice, which shows up first on the head.
 *
 * A part is dropped when another part already covers everything it covers. On
 * a real character, assembled one part per slot, nothing is dropped.
 */
function usefulParts(): Model[] {
  const measured = characterParts.map((model) => ({
    model,
    bounds: measureBounds(model.shapes.map((_, shape) => model.posedGeometry(shape))),
    shapes: model.numShapes,
  }))
  return measured
    .filter(
      (part) =>
        !measured.some(
          (other) =>
            other !== part &&
            // Bigger, or the same size and listed first, so two identical parts
            // do not each drop the other and leave nothing.
            (other.shapes > part.shapes ||
              (other.shapes === part.shapes && measured.indexOf(other) < measured.indexOf(part))) &&
            other.bounds.minY <= part.bounds.minY + 1e-3 &&
            other.bounds.maxY >= part.bounds.maxY - 1e-3 &&
            other.bounds.minX <= part.bounds.minX + 1e-3 &&
            other.bounds.maxX >= part.bounds.maxX - 1e-3,
        ),
    )
    .map((part) => part.model)
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
  const body = usefulParts().flatMap(piecesOf)
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
    for (let frame = 0; frame < loopLengthOf(upright); frame++) {
      tallest = Math.max(tallest, heightOf(characterStacks(upright, frame)))
    }
  }
  // No motion read: the bind pose is all there is, and it is better than
  // refusing to draw the character.
  if (tallest <= 0) tallest = heightOf(new Map())
  return { body, scale: (toFloat(PERSON.height) * sizeTrim) / Math.max(tallest, 0.001) }
}

/**
 * How many frames of a motion to play before looping, asked once and kept.
 *
 * Nearly half the cartridge's animations end on a repeat of their first frame.
 * Playing all of them shows that pose twice running, which on the nine-frame
 * walk at a normal pace is a hitch several times a second.
 */
const loopLengths = new Map<Animation, number>()
function loopLengthOf(motion: Animation): number {
  const known = loopLengths.get(motion)
  if (known !== undefined) return known
  const frames = loopFrames(motion)
  loopLengths.set(motion, frames)
  return frames
}

/** Every part's matrix stacks for one frame of a motion, or its bind pose. */
function characterStacks(motion: Animation | undefined, frame: number): Map<Model, Mat4[][]> {
  const stacks = new Map<Model, Mat4[][]>()
  for (const part of usefulParts()) {
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
/** How many shapes the last upload held, which is not the map's shape count. */
let lastShapes = 0
/** The scene without the character, kept so only the character is rebuilt. */
let mapPieces: Piece[] = []
/** One box per map piece, measured once, for deciding what is in the way. */
let mapBoxes: Box[] = []
/**
 * Which of those are backdrop rather than part of the place.
 *
 * The village's sky is a single piece 15.70 by 12.08 units, wrapped around a
 * map whose walkable ground is 12.0 by 9.1. It is over the character's head
 * everywhere, so without this the open street reads as indoors and the camera
 * tucks in under the sky.
 *
 * The test is containment rather than size: a piece that reaches past the map's
 * collision **on all four sides** is not part of the place being stood in. A
 * room's ceiling sits within its own walls and is not caught. No map on the
 * cartridge has collision above head height — not one downward-facing raised
 * triangle anywhere — so the geometry has to answer this, and this is the least
 * it can be asked.
 */
let mapBackdrop: boolean[] = []
/**
 * Movement per tick, as a fraction of the character's own height.
 *
 * A speed in world units does not survive the character being resized, and the
 * character has been resized by a factor of ten over this milestone. At 0.05
 * units a tick the 0.18-unit character crossed **sixteen of its own heights a
 * second**, which is a sprint by any measure and read as sliding.
 *
 * Four heights a second is a brisk walk for a game — a person manages about
 * one — and puts the village, twelve units across, at seventeen seconds corner
 * to corner.
 */
const WALK_HEIGHTS_PER_SECOND = 4
const WALK_SPEED = Math.round((toFloat(PERSON.height) * WALK_HEIGHTS_PER_SECOND * FX32_ONE) / 60)
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
/**
 * A live multiplier on the size of a map's **placed** pieces, on `,` and `.`.
 *
 * The doors are the case in point. They are authored at `upScale` 1 while the
 * terrain around them is at 8, and the manifest's own scale field is 1, 1, 1 on
 * every resource of the cartridge — so nothing in the data says to resize them,
 * and nothing here does by default. This exists to find out whether they should
 * be, without a constant being invented to hold the answer.
 */
let propTrim = PLACED_PIECE_SCALE
/** The tallest house in the shown map, for reporting the ratio. */
let houseHeight = 0
/** The tallest wall of the shown map's buildings, and the tallest placed piece. */
let wallHeight = 0
let propHeight = 0
/**
 * Where the shown map's water is, as a footprint and a surface height.
 *
 * A map's textures are named for what they are (`m01m00wtr01` is water beside
 * `m01m00grs01`), and the village's water is two flat planes straight across
 * the middle — which is exactly where a spawn looking for the map's centre
 * lands. Nothing else is read from it: this is only for not standing a
 * character in the sea.
 */
let waterAreas: { minX: number; maxX: number; minZ: number; maxZ: number; surface: number }[] = []
const TICK_MS = 1000 / 60

let shown: Shown | undefined
let playing = true

/** Where the current map puts each of its models. */
let placeByModel = new Map<Model, { x: number; y: number; z: number }>()
/**
 * The animation a map model drives itself with, when it ships one.
 *
 * A map is not a still life. The village's sky model carries a 541-frame joint
 * animation, and without it its four cloud nodes sit at one point — the bind
 * pose puts them all in the same place and the animation is what drifts them
 * apart across the sky. Same for the waterfall.
 */
let animationByModel = new Map<Model, Animation>()
/** Which frame the map's own animations are on, at the DS's 30 a second. */
let mapFrame = 0

/**
 * A posed shape moved to where the map puts the model it belongs to.
 *
 * A placed piece is scaled about its own base rather than its centre, so
 * resizing it slides it up or down the wall it stands against instead of
 * sinking it into the ground.
 */
function placed(geometry: Geometry, model: Model): Geometry {
  const place = placeByModel.get(model)
  if (!place) return geometry
  const moved = place.x !== 0 || place.y !== 0 || place.z !== 0
  const scale = moved ? propTrim : 1
  if (!moved && scale === 1) return geometry
  return {
    ...geometry,
    vertices: geometry.vertices.map((v) => ({
      ...v,
      x: v.x * scale + place.x,
      y: v.y * scale + place.y,
      z: v.z * scale + place.z,
    })),
  }
}

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
    // A map's models each drive themselves; a single model uses the animation
    // picked in the scrubber.
    const own = animationByModel.get(model)
    const playing = own ?? animation
    if (playing && playing.boneCount === model.nodes.length) {
      const local = sampleAnimation(playing, own ? mapFrame % playing.frameCount : shown.frame)
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
    const posed = placed(poseGeometry(piece.geometry, stack), piece.model)
    return piece.texture ? { geometry: posed, ...piece.texture } : { geometry: posed }
  })
  // The scene the walker draws against, so a map that animates itself keeps
  // moving while it is being walked.
  mapPieces = drawn
  mapBoxes = drawn.map((piece) => measureBounds([piece.geometry]))
  const ground = shown.world?.bounds
  mapBackdrop = mapBoxes.map((box) =>
    ground === undefined
      ? false
      : box.minX < ground.minX / FX32_ONE &&
        box.maxX > ground.maxX / FX32_ONE &&
        box.minZ < ground.minZ / FX32_ONE &&
        box.maxZ > ground.maxZ / FX32_ONE,
  )
  if (!walker) {
    lastUpload = renderer.upload(drawn)
    lastShapes = drawn.length
  }
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
      wallHeight = 0
      propHeight = 0
      waterAreas = []
      for (const model of models) {
        const place = placeByModel.get(model)
        const moved = place !== undefined && (place.x !== 0 || place.y !== 0 || place.z !== 0)
        if (moved) {
          // A placed piece — a doorway, a sign. Its height is the thing to read
          // against the buildings it stands among.
          const bounds = measureBounds(model.shapes.map((_, shape) => model.posedGeometry(shape)))
          propHeight = Math.max(propHeight, bounds.maxY - bounds.minY)
          continue
        }
        for (let shape = 0; shape < model.numShapes; shape++) {
          const materialIndex = model.shapeMaterials[shape]
          const material = materialIndex === undefined ? undefined : model.materials[materialIndex]
          const texture = material?.texture
          if (texture === undefined || !isWaterTexture(texture)) continue
          const bounds = measureBounds([model.posedGeometry(shape)])
          const at = place ?? { x: 0, y: 0, z: 0 }
          waterAreas.push({
            minX: bounds.minX + at.x,
            maxX: bounds.maxX + at.x,
            minZ: bounds.minZ + at.z,
            maxZ: bounds.maxZ + at.z,
            surface: bounds.maxY + at.y,
          })
        }
        if (!model.nodes.some((node) => /^hus\d*$/.test(node.name))) continue
        for (let shape = 0; shape < model.numShapes; shape++) {
          const bounds = measureBounds([model.posedGeometry(shape)])
          const height = bounds.maxY - bounds.minY
          houseHeight = Math.max(houseHeight, height)
          // A wall rather than the ground it stands on: tall, and starting
          // above the base of the model rather than at it.
          if (height > 0.6 && bounds.minY > 0.2) wallHeight = Math.max(wallHeight, height)
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
    const posed = placed(poseGeometry(piece.geometry, stack), piece.model)
    return piece.texture ? { geometry: posed, ...piece.texture } : { geometry: posed }
  })

  mapPieces = drawn
  mapBoxes = drawn.map((piece) => measureBounds([piece.geometry]))
  const ground = shown.world?.bounds
  mapBackdrop = mapBoxes.map((box) =>
    ground === undefined
      ? false
      : box.minX < ground.minX / FX32_ONE &&
        box.maxX > ground.maxX / FX32_ONE &&
        box.minZ < ground.minZ / FX32_ONE &&
        box.maxZ > ground.maxZ / FX32_ONE,
  )
  const uploaded = renderer.upload(drawn)
  lastUpload = uploaded
  lastShapes = drawn.length
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
  // What was drawn, not what the map holds: the character's shapes are in the
  // upload too and some of the map's may have been left out of the way.
  const shapes = lastShapes
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
        (propHeight > 0
          ? ` · placed pieces ${(propHeight * propTrim).toFixed(2)} tall` +
            (wallHeight > 0
              ? ` (${((propHeight * propTrim) / wallHeight).toFixed(2)} of a ${wallHeight.toFixed(2)} wall)`
              : '') +
            ` x${propTrim.toFixed(2)}`
          : '') +
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
      ? 'WASD to walk · drag to turn · [ ] resize player · , . resize placed pieces · G to stop'
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
/**
 * Is this spot in the water?
 *
 * The map's own textures say where the water is; what matters here is only that
 * the ground at a spawn is not under it. The village's river runs straight
 * across the middle of the map, so a spawn that looks for the map's centre
 * lands in it.
 */
function isUnderWater(x: number, y: number, z: number): boolean {
  return waterAreas.some(
    (water) =>
      x >= water.minX &&
      x <= water.maxX &&
      z >= water.minZ &&
      z <= water.maxZ &&
      // Within a character's height of the surface, not just below it. The
      // village's spawn stood on a sandbank 0.17 above a river surface at
      // -0.31, which for a character 0.18 tall is knee-deep in it.
      y <= water.surface + toFloat(PERSON.height),
  )
}

/**
 * Can the character actually walk away from here?
 *
 * The ground being standable is not enough: the village's spawn was a spot with
 * open ground in all sixteen directions that the character could not leave,
 * because it sat inside a two-and-a-half-unit wall and a thicket of eighty-
 * degree faces. Somewhere to stand and somewhere to walk are different
 * questions, and only the second one matters for a spawn.
 */
function canLeave(world: CollisionWorld, x: Fx32, y: Fx32, z: Fx32): number {
  let open = 0
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4
    const dx = fx32(Math.round(Math.cos(angle) * WALK_SPEED))
    const dz = fx32(Math.round(Math.sin(angle) * WALK_SPEED))
    let state: CharacterState = { x, y, z, fallSpeed: fx32(0), grounded: true }
    for (let tick = 0; tick < 16; tick++) state = stepCharacter(world, state, dx, dz, PERSON)
    const moved = Math.hypot(toFloat(state.x) - toFloat(x), toFloat(state.z) - toFloat(z))
    // Half of what it asked for, which a wall taken at an angle still passes.
    if (moved > (toFloat(fx32(WALK_SPEED)) * 16) / 2) open++
  }
  return open
}

/**
 * Put a walker on the map, somewhere it can walk from.
 *
 * Candidates are the map's own walkable triangles, tried nearest the middle
 * first, and the first one the character can leave in most directions wins. If
 * none can be left the least bad is used rather than refusing to walk at all.
 */
function startWalking(): void {
  const world = shown?.world
  if (!world) {
    walker = undefined
    return
  }
  const { bounds } = world
  const midX = (bounds.minX + bounds.maxX) / 2
  const midZ = (bounds.minZ + bounds.maxZ) / 2

  const candidates: { x: Fx32; z: Fx32; away: number }[] = []
  const middle = groundBelow(
    world,
    fx32(Math.round(midX)),
    fx32(Math.round(midZ)),
    fx32(bounds.maxY + FX32_ONE),
  )
  if (middle) candidates.push({ x: fx32(Math.round(midX)), z: fx32(Math.round(midZ)), away: 0 })
  for (const triangle of world.triangles) {
    if (triangle.normal[1] === 0) continue
    const [a, b, c] = triangle.vertices
    const cx = Math.round((a[0] + b[0] + c[0]) / 3)
    const cz = Math.round((a[2] + b[2] + c[2]) / 3)
    candidates.push({ x: fx32(cx), z: fx32(cz), away: Math.hypot(cx - midX, cz - midZ) })
  }
  candidates.sort((p, q) => p.away - q.away)

  let best: { x: Fx32; y: Fx32; z: Fx32; open: number } | undefined
  // Enough to cross a map's walkable ground without stalling the key press.
  for (const candidate of candidates.slice(0, 400)) {
    const found = groundBelow(world, candidate.x, candidate.z, fx32(bounds.maxY + FX32_ONE))
    if (!found || found.slope < PERSON.maxSlope) continue
    if (isUnderWater(toFloat(candidate.x), toFloat(found.y), toFloat(candidate.z))) continue
    const open = canLeave(world, candidate.x, found.y, candidate.z)
    if (!best || open > best.open) best = { x: candidate.x, y: found.y, z: candidate.z, open }
    if (open >= 6) break
  }
  if (!best) {
    walker = undefined
    return
  }

  const { body, scale } = buildCharacter()
  walker = {
    state: { x: best.x, y: best.y, z: best.z, fallSpeed: fx32(0), grounded: true },
    held: new Set(),
    carry: 0,
    facing: 0,
    motionFrame: 0,
    motion: undefined,
    body,
    scale,
    inside: false,
  }
}

/**
 * Move the character's animation on. The rates are in `motion.ts`.
 *
 * The frame resets when the motion changes, because a count left over from a
 * nine-frame walk means something else in a seventeen-frame idle.
 */
function advanceMotion(
  walker: Walker,
  moving: boolean,
  elapsedMs: number,
  travelled: number,
): void {
  const wanted = moving ? 'walk' : 'stand'
  if (wanted !== walker.motion) {
    walker.motion = wanted
    walker.motionFrame = 0
  }
  const motion = characterMotions.get(wanted)
  if (!motion || motion.frameCount <= 0) return

  // The frames that make up the loop, which is not always all of them.
  const frameCount = loopLengthOf(motion)
  walker.motionFrame += motionAdvance({
    moving,
    // Real time rather than whole ticks, so an idle does not run in steps of
    // however many ticks happened to fall in a frame.
    ticks: (elapsedMs * 60) / 1000,
    travelled,
    frameCount,
    unitsPerTick: toFloat(fx32(WALK_SPEED)),
  })
  walker.motionFrame %= frameCount
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

  const stacks = characterStacks(motion, Math.floor(walker.motionFrame))
  const posedPieces = walker.body.map((piece) => ({
    piece,
    posed: poseGeometry(
      piece.geometry,
      stacks.get(piece.model)?.[piece.shape] ?? piece.model.matrices,
    ),
  }))

  /**
   * Stand the figure on the ground **this frame**, not once for the motion.
   *
   * A character is otherwise hung from its model's origin, and the motions do
   * not keep the figure there: the idle carries the whole body smoothly from
   * 0.39 up to 1.25 in model units and back, a rise of an eighth of the
   * character's own height, while its height changes by 0.05. Anchoring to the
   * lowest frame of the cycle plants the feet on one frame in seventeen and
   * floats for the other sixteen.
   *
   * The cost is that a motion with both feet genuinely off the ground — a jump,
   * or the flight phase of `run` — would be pinned down. Walking and standing
   * both keep a foot planted throughout, and they are what is played.
   */
  const floor = Math.min(...posedPieces.map(({ posed }) => measureBounds([posed]).minY))

  return posedPieces.map(({ piece, posed }) => {
    const vertices = posed.vertices.map((v) => {
      const x = v.x * scale
      const y = (v.y - floor) * scale
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

  // Whether the character is walking is a fact about the keys, not about
  // whether a simulation tick happened to fall in this frame. Taking it from
  // the loop meant that on any frame short enough to run no tick — which at
  // 60Hz is most other frames — the motion flipped to standing and the frame
  // count reset, so the character stuttered between two poses.
  const moving = forward !== 0 || right !== 0
  walker.carry = Math.min(walker.carry + elapsedMs, TICK_MS * 8)
  // How far the character actually got, which is not how far it was asked to
  // go: a wall takes most of it away.
  let travelled = 0
  while (walker.carry >= TICK_MS) {
    walker.carry -= TICK_MS
    const from = walker.state
    let dx = 0
    let dz = 0
    if (forward !== 0 || right !== 0) {
      const step = moveRelativeToCamera(camera.yaw, forward, right)
      dx = Math.round(step.x * WALK_SPEED)
      dz = Math.round(step.z * WALK_SPEED)
      // Turn towards where it is going, by the shorter way round.
      const wanted = Math.atan2(dx, dz)
      let turn = wanted - walker.facing
      while (turn > Math.PI) turn -= Math.PI * 2
      while (turn < -Math.PI) turn += Math.PI * 2
      walker.facing += turn * 0.25
    }
    walker.state = stepCharacter(shown.world, walker.state, fx32(dx), fx32(dz), PERSON)
    travelled += Math.hypot(
      toFloat(walker.state.x) - toFloat(from.x),
      toFloat(walker.state.z) - toFloat(from.z),
    )
  }

  advanceMotion(walker, moving, elapsedMs, travelled)

  // Indoors the camera comes in and tilts further down. What counts as indoors
  // is whether there is a roof over the character's head, checked as they walk,
  // so the camera tucks in on the way through a door rather than on a guess
  // about how big the map is.
  const feet: [number, number, number] = [
    toFloat(walker.state.x),
    toFloat(walker.state.y),
    toFloat(walker.state.z),
  ]
  const inside = covered(
    mapBoxes.filter((_, index) => !mapBackdrop[index]),
    feet,
    toFloat(PERSON.height),
  )
  if (inside !== walker.inside) {
    walker.inside = inside
    Object.assign(camera, applyStyle(camera, inside ? INDOORS : OUTDOORS, toFloat(PERSON.height)))
  }

  // The camera watches the character rather than the map's centre. The world is
  // passed so the eye is kept above the ground: it is never pulled forward for
  // a building — the roof comes off instead — but the ground is the one thing
  // culling must not remove, so a camera inside a hill sees through the world.
  updateFollowCamera(camera, walker.state, elapsedMs / 1000, shown.world, PERSON)

  // Redraw the scene with the character in it. The map's pieces are re-posed
  // only when the map animates itself; otherwise only the character changes
  // from frame to frame, along with which pieces are in the way.
  if (walker.body.length > 0) {
    const hidden = new Set(occluders(mapBoxes, cameraEye(camera), camera.focus, CLEARANCE))
    const visible = mapPieces.filter((_, index) => !hidden.has(index))
    hiddenPieces = hidden.size
    const uploading = [
      ...visible,
      ...characterPieces(walker, characterMotions.get(walker.motion ?? '')),
    ]
    lastUpload = renderer.upload(uploading)
    lastShapes = uploading.length
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
  // A map's models animate themselves whether or not the scrubber is showing.
  if (animationByModel.size > 0 && playing) {
    const next = Math.floor(elapsed / (1000 / 30))
    if (next !== mapFrame) {
      mapFrame = next
      pose()
    }
  }
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

  if (key === ',' || key === '.') {
    propTrim = Math.min(4, Math.max(0.05, propTrim * (key === ',' ? 1 / 1.1 : 1.1)))
    if (selected >= 0) select(selected)
    return
  }
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
