import type { Catalogue, DecodedTexture } from '@minstrel/cartridge'
import { textureFor } from '@minstrel/cartridge'
import {
  isSprite,
  NPC_KIND,
  type NpcEntry,
  type NpcPlacement,
  readSprite,
  type Sprite,
  type SpriteCut,
} from '@minstrel/game-formats'
import type { Piece } from '@minstrel/gl'
import {
  type Animation,
  type Geometry,
  isNsbca,
  isNsbmd,
  loopFrames,
  type Mat4,
  type Model,
  measureBounds,
  type NodeTransform,
  poseGeometry,
  readNsbca,
  readNsbmd,
  sampleAnimation,
} from '@minstrel/nitro-gfx'

/**
 * The characters standing in a map, and how they are drawn.
 *
 * A map's cast is named by `<map>npc.bin` and placed by `<map>place.bin`. What
 * each one is drawn *as* is the `kind` byte on its entry, and the split is
 * exact across the village's 33 names: `kind` 2 is a 3D model in
 * `/data/chara_sub/<name>.chr`, `kind` 0 is a 2D sprite in `/data/ani`.
 *
 * **Only the models are drawn here.** The sprites need a decoder and a
 * billboarding pass that this repository does not have, and drawing them as
 * something else would put 24 of the village's 33 characters on screen wearing
 * a body that is not theirs. They are counted and reported instead.
 */

/** A character drawn as a billboard, from its `.spr` sheet. */
export interface CastSprite {
  readonly name: string
  /** Re-read when the cut changes, which is why this one is not readonly. */
  sprite: Sprite
  readonly placement: NpcPlacement
  /** The sheet as it came off the cartridge, so it can be cut again. */
  readonly bytes: Uint8Array
}

/** One character with a model, placed. */
export interface CastMember {
  readonly name: string
  readonly model: Model
  /** The character's own idle, from the archive beside its model. */
  readonly motion: Animation | undefined
  /** How far its motion holds it off its own origin, over the whole cycle. */
  readonly floor: number
  readonly placement: NpcPlacement
}

/** What a map's cast came to, including what could not be drawn. */
export interface Cast {
  readonly members: readonly CastMember[]
  /** Characters drawn as 2D billboards. */
  readonly sprites2d: readonly CastSprite[]
  /** Placed sprite characters whose sheet would not read. */
  readonly sprites: number
  /** Placed characters whose `kind` is neither, and unnamed records. */
  readonly unclassified: number
  /** Named `kind` 2 characters whose archive or model would not read. */
  readonly missing: readonly string[]
  /** Characters the map has no ground for at their own height. See `standsHere`. */
  readonly elsewhere: number
}

/**
 * Does this map have ground under a character, at the height it claims?
 *
 * **A map's cast list is not only the characters standing outside it.** The
 * village's file places five copies of `s097a` inside a circle 0.8 units
 * across, all at the same height, and that height is 0.157 above the ground
 * beneath them — about nine tenths of a character. They are not hovering over
 * the green; they are standing on a shop floor, in the shop's own coordinates,
 * and the shop is a different map archive.
 *
 * Nothing in the file says which map a placement belongs to, so the map's own
 * collision is asked instead. The split it gives is not a fine judgement: the
 * characters that belong outside miss the ground by 0.006 to 0.030, and the
 * rest by 0.156 to 0.175. A threshold anywhere in that gap gives the same
 * answer, so half a character's height is used and nothing turns on the number.
 */
export type GroundAt = (x: number, z: number) => number | undefined

/**
 * Gather the drawable cast.
 *
 * Every character is scaled by the *same* factor as the player, not resized to
 * a common height. The cartridge models its characters in one space — the
 * village's cast runs from 9.00 units to 22.96 against the player's 22.9 — so a
 * single scale is what keeps a child a child.
 */
export function cast(
  placed: readonly { entry: NpcEntry; placement: NpcPlacement }[],
  members: ReadonlyMap<string, ReadonlyMap<string, Uint8Array>>,
  groundAt: GroundAt,
  characterHeight: number,
  sheets: ReadonlyMap<string, Uint8Array> = new Map(),
): Cast {
  const out: CastMember[] = []
  const drawn2d: CastSprite[] = []
  const missing: string[] = []
  let sprites = 0
  let unclassified = 0
  let elsewhere = 0

  // Read each archive once: `s097a` stands in the village five times.
  const loaded = new Map<string, { model: Model; motion: Animation | undefined } | undefined>()

  for (const { entry, placement } of placed) {
    if (entry.name === undefined) {
      unclassified++
      continue
    }
    if (entry.kind === NPC_KIND.SPRITE) {
      const ground = groundAt(placement.x, placement.z)
      if (ground === undefined || Math.abs(placement.y - ground) > characterHeight / 2) {
        elsewhere++
        continue
      }
      const sheet = sheetFor(entry.name, sheets)
      if (!sheet) {
        sprites++
        continue
      }
      drawn2d.push({
        name: entry.name,
        sprite: sheet,
        placement,
        bytes: sheets.get(entry.name.toLowerCase()) as Uint8Array,
      })
      continue
    }
    if (entry.kind !== NPC_KIND.MODEL) {
      unclassified++
      continue
    }

    let found = loaded.get(entry.name)
    if (!loaded.has(entry.name)) {
      found = read(entry.name, members)
      loaded.set(entry.name, found)
      if (!found) missing.push(entry.name)
    }
    if (!found) continue

    const ground = groundAt(placement.x, placement.z)
    if (ground === undefined || Math.abs(placement.y - ground) > characterHeight / 2) {
      elsewhere++
      continue
    }

    out.push({
      name: entry.name,
      model: found.model,
      motion: found.motion,
      floor: floorOf(found.model, found.motion),
      placement,
    })
  }
  return { members: out, sprites2d: drawn2d, sprites, unclassified, missing, elsewhere }
}

/** A character's model and idle, out of the `.chr` archive named for it. */
function read(
  name: string,
  members: ReadonlyMap<string, ReadonlyMap<string, Uint8Array>>,
): { model: Model; motion: Animation | undefined } | undefined {
  const wanted = `/${name.toLowerCase()}.chr`
  for (const [archive, files] of members) {
    if (!archive.toLowerCase().endsWith(wanted)) continue
    let model: Model | undefined
    let idle: Animation | undefined
    const others: Animation[] = []
    for (const [file, bytes] of files) {
      if (!model && isNsbmd(bytes)) {
        try {
          const read = readNsbmd(bytes).models[0]
          if (read?.numShapes) model = read
        } catch {
          // A model that will not read simply is not drawn.
        }
        continue
      }
      if (!isNsbca(bytes)) continue
      try {
        const animations = readNsbca(bytes).animations
        // Most characters name their idle. Some do not: `s097` and `s097a`
        // carry one animation called `0`, and **their bind pose is not a
        // pose** — `s097` collapses to a single point, all sixteen vertices at
        // one place, so a character drawn without its animation is a character
        // that is not there. Any animation beats no animation.
        if (!idle && file.toLowerCase().startsWith('stand')) idle = animations[0]
        else others.push(...animations)
      } catch {
        // An animation that will not read leaves the others.
      }
    }
    if (!model) return undefined
    const drives = (a: Animation | undefined) =>
      a !== undefined && a.boneCount === model.nodes.length
    const motion = drives(idle) ? idle : others.find(drives)
    return { model, motion }
  }
  return undefined
}

/**
 * How far a motion holds a character off its own origin, over the whole cycle.
 *
 * The same rule the player uses, and for the same reason: measured once per
 * motion rather than once per frame, so a foot leaving the ground lifts the
 * foot instead of translating the whole body.
 */
function floorOf(model: Model, motion: Animation | undefined): number {
  let lowest = Number.POSITIVE_INFINITY
  const frames = motion ? loopFrames(motion) : 1
  for (let frame = 0; frame < frames; frame++) {
    const stacks = stacksOf(model, motion, frame)
    for (let shape = 0; shape < model.numShapes; shape++) {
      const geometry = poseGeometry(
        model.geometry(model.shapes[shape] as (typeof model.shapes)[number]),
        stacks[shape] ?? model.matrices,
      )
      lowest = Math.min(lowest, measureBounds([geometry]).minY)
    }
  }
  return Number.isFinite(lowest) ? lowest : 0
}

function stacksOf(
  model: Model,
  motion: Animation | undefined,
  frame: number,
): readonly (readonly Mat4[])[] {
  if (!motion || motion.boneCount !== model.nodes.length) return model.shapeMatrices
  const local = sampleAnimation(motion, frame % Math.max(1, motion.frameCount))
  const nodes: NodeTransform[] = model.nodes.map((node, i) => {
    const posed = local[i]
    return posed ? { ...node, local: posed } : node
  })
  return model.pose(nodes)
}

/**
 * One character, posed for a frame and put where the map stands it.
 *
 * Scaled into the world, turned to face the way the placement says, and set
 * down at its feet by one offset for the whole motion.
 */
export function castPieces(
  member: CastMember,
  cat: Catalogue,
  scale: number,
  frame: number,
): Piece[] {
  const { model, placement } = member
  const sin = Math.sin(placement.facing)
  const cos = Math.cos(placement.facing)
  const stacks = stacksOf(model, member.motion, frame)

  const out: Piece[] = []
  model.shapes.forEach((shape, index) => {
    const posed: Geometry = poseGeometry(model.geometry(shape), stacks[index] ?? model.matrices)
    const vertices = posed.vertices.map((v) => {
      const x = v.x * scale
      const y = (v.y - member.floor) * scale
      const z = v.z * scale
      return {
        ...v,
        x: placement.x + x * cos + z * sin,
        y: placement.y + y,
        z: placement.z - x * sin + z * cos,
      }
    })
    const geometry = { ...posed, vertices }
    const materialIndex = model.shapeMaterials[index]
    const material = materialIndex === undefined ? undefined : model.materials[materialIndex]
    const texture: DecodedTexture | undefined = material ? textureFor(cat, material) : undefined
    out.push(texture ? { geometry, ...texture } : { geometry })
  })
  return out
}

/** A character's sprite sheet, read once and kept. */
/**
 * How the sheets are being cut, while it is being worked out.
 *
 * Empty is the reading in `game-formats`. The game can move these live — see
 * `spriteKeys` in `main.ts` — because where a frame begins is settled for the
 * horizontal reading and not the vertical one, and every attempt to fit it by
 * measurement has chosen a cut that renders wrong. Moving it by hand against
 * the picture is the way left.
 */
let cut: SpriteCut = {}

export function spriteCut(): SpriteCut {
  return cut
}

/**
 * Cut every sheet again, and hand back the numbers.
 *
 * The frames already decoded are thrown away with them: they were cut the old
 * way.
 */
export function setSpriteCut(next: SpriteCut, cast: Cast): SpriteCut {
  cut = next
  readSheets.clear()
  decoded.clear()
  for (const member of cast.sprites2d) {
    try {
      member.sprite = readSprite(member.bytes, cut)
    } catch {
      // A cut that will not read leaves the character as it was.
    }
  }
  return cut
}

const readSheets = new Map<string, Sprite | undefined>()
function sheetFor(name: string, sheets: ReadonlyMap<string, Uint8Array>): Sprite | undefined {
  const key = name.toLowerCase()
  if (readSheets.has(key)) return readSheets.get(key)
  const bytes = sheets.get(key)
  let sprite: Sprite | undefined
  if (bytes && isSprite(bytes)) {
    try {
      sprite = readSprite(bytes, cut)
    } catch {
      // A sheet that will not read leaves its character undrawn rather than
      // drawn wrong.
    }
  }
  readSheets.set(key, sprite)
  return sprite
}

/** Forget the sheets and frames read for a previous map. */
export function forgetSheets(): void {
  readSheets.clear()
  decoded.clear()
}

/**
 * A sprite character as a billboard: one quad facing the camera.
 *
 * The DS drew these as 2D sprites over a 3D world, so they always face the
 * viewer. Turning the quad by the camera's yaw is what reproduces that — a
 * fixed quad would vanish edge-on as you walked around it.
 *
 * The sheet's own frame is used as the texture. A frame is `width` by its own
 * row count, so the quad is sized from the decoded frame rather than from the
 * header's nominal height, which is a row short.
 */
export function spritePieces(
  member: CastSprite,
  characterHeight: number,
  yaw: number,
  frame: number,
): Piece[] {
  const { placement } = member
  const image = decodedFrame(member, frame)
  // **A sprite is not in the models' space**, so the models' scale does not
  // apply: at that scale a 41-row villager stands 0.31 units against a person's
  // 0.18. The cell is the character — ink fills 33 to 41 of its 41 rows across
  // the village's cast — so one frame tall is one person tall.
  const scale = characterHeight / image.height
  const halfW = (image.width * scale) / 2
  const tall = image.height * scale
  // Face the camera: the quad's width runs across the view.
  const sin = Math.sin(yaw)
  const cos = Math.cos(yaw)
  // Texture coordinates are in texels, as the display list gives them. Half a
  // texel in from each edge, so a nearest-neighbour sample lands on the middle
  // of the first and last pixel rather than on the seam between them.
  const inset = 0.5
  const corner = (u: number, v: number, s: number, t: number) => ({
    x: placement.x + u * cos,
    y: placement.y + v,
    z: placement.z - u * sin,
    s,
    t,
    r: 1,
    g: 1,
    b: 1,
    matrixId: 0,
  })
  const geometry: Geometry = {
    vertices: [
      corner(-halfW, tall, inset, inset),
      corner(halfW, tall, image.width - inset, inset),
      corner(halfW, 0, image.width - inset, image.height - inset),
      corner(-halfW, 0, inset, image.height - inset),
    ],
    indices: [0, 1, 2, 0, 2, 3],
    matrixIds: [],
    scales: [],
  }
  return [
    { geometry, pixels: image.pixels, width: image.width, height: image.height, cutout: true },
  ]
}

/**
 * Which frame of a sheet to show.
 *
 * **Not a clock.** The sixteen frames of a villager are its *facings* and its
 * walk, not a loop: `walk_down`, `walk_left`, `walk_up`, `walk_right` and eight
 * `stand_*` are named in the file. Driving the frame from elapsed time spins
 * every villager through all eight directions twice a second.
 *
 * Which frame is which facing needs the animation tables at the end of the
 * sheet, and those are not decoded — so this holds the first frame, and every
 * character stands still until they are.
 */
/**
 * The eight standing facings, in the order the sheet lists them.
 *
 * They go round: facing the viewer, then through the character's left to
 * facing away, then through its right and back. `down` is toward the camera.
 */
const FACINGS = [
  'stand_down',
  'stand_l_down',
  'stand_left',
  'stand_l_up',
  'stand_up',
  'stand_r_up',
  'stand_right',
  'stand_r_down',
] as const

/**
 * Which frame of a sheet to show a character standing in.
 *
 * **A sheet's frames are its facings, not a loop.** The animation table names
 * twelve: four walks of four frames, and eight one-frame stands. Driving the
 * frame from elapsed time spins a villager through every direction twice a
 * second, which is what it used to do.
 *
 * The direction shown is the character's own facing *relative to the camera*,
 * because a billboard is drawn from wherever you happen to be standing. A
 * character facing the same way the camera looks has its back to you — that is
 * `stand_up`, which is why zero lands four steps into the list.
 *
 * **The list runs against the angle, not with it.** `down` and `up` are the
 * same either way, so only a side-on character shows the difference: taken the
 * other way round, the village dog stood with its head where its tail should
 * be. Negating the step swaps every `l_*` with its `r_*` and leaves the two
 * ends alone, which is exactly that mirror.
 */
export function standingFrame(member: CastSprite, cameraYaw: number): number {
  const away = member.placement.facing - cameraYaw
  const step = Math.PI / 4
  const index = (((4 - Math.round(away / step)) % 8) + 8) % 8
  const wanted = FACINGS[index] as string
  const found = member.sprite.animation(wanted) ?? member.sprite.animation('stand_down')
  return found?.steps[0]?.frame ?? 0
}

/**
 * A decoded frame, kept.
 *
 * Decoding allocates an RGBA buffer per frame, and the renderer uploads a fresh
 * texture for every piece it is given. Doing either per frame for fourteen
 * villagers is 70 KB of garbage and fourteen texture creations every time the
 * screen is drawn, which is what made them flicker.
 */
const decoded = new Map<string, { width: number; height: number; pixels: Uint8Array }>()
function decodedFrame(member: CastSprite, frame: number) {
  const key = `${member.name}#${frame}`
  let found = decoded.get(key)
  if (!found) {
    found = member.sprite.decode(frame)
    decoded.set(key, found)
  }
  return found
}
