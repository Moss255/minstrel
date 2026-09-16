import { attachedGeometry, modelBoneWorld } from '@minstrel/actor'
import type { Catalogue, DecodedTexture } from '@minstrel/cartridge'
import { textureFor } from '@minstrel/cartridge'
import {
  isSprite,
  NPC_KIND,
  type NpcEntry,
  type NpcPlacement,
  readSprite,
  type Sprite,
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
  /** Placed characters whose `kind` is none of these, and unnamed records. */
  readonly unclassified: number
  /**
   * Things to examine: records of kind 1, placed but never drawn — see
   * `NPC_KIND.SPOT`. They are talked to like anyone else, and what their talk
   * files say is what examining them says.
   */
  readonly spots: readonly { readonly placement: NpcPlacement }[]
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
 * **This used to decide which map a character belonged to, and no longer does.**
 * The file says: a placement carries the id of its own map, and every one of the
 * cartridge's 1,289 names an id the index knows. So the cast is narrowed before
 * it gets here, and the ground is only asked about *where* a character stands.
 *
 * Keeping it as a filter cost real characters. It drops anyone standing where
 * the collision does not reach, and an interior's collision does not always
 * reach its own room — the item shop places three characters and two of them
 * stand 0.05 and 0.10 beyond the edge of its floor, so the shop had no
 * shopkeeper. A character the file puts in this map is in this map.
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

  /**
   * Whether the map's collision reaches where this character stands.
   *
   * Counted for the status line and nothing else: it says something about the
   * *map*, not about the character, and an interior whose collision stops short
   * of its own room will report several.
   */
  const standsOnFloor = (placement: NpcPlacement): boolean => {
    const ground = groundAt(placement.x, placement.z)
    return ground !== undefined && Math.abs(placement.y - ground) <= characterHeight / 2
  }

  const spots: { placement: NpcPlacement }[] = []
  for (const { entry, placement } of placed) {
    if (entry.kind === NPC_KIND.SPOT) {
      spots.push({ placement })
      continue
    }
    if (entry.name === undefined) {
      unclassified++
      continue
    }
    if (entry.kind === NPC_KIND.SPRITE) {
      if (!standsOnFloor(placement)) elsewhere++
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

    if (!standsOnFloor(placement)) elsewhere++

    out.push({
      name: entry.name,
      model: found.model,
      motion: found.motion,
      floor: floorOf(found.model, found.motion),
      placement,
    })
  }
  return { members: out, sprites2d: drawn2d, sprites, unclassified, spots, missing, elsewhere }
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
export function floorOf(model: Model, motion: Animation | undefined): number {
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

/**
 * A model's matrix stacks posed by a motion for a frame, each node taking the
 * bone of its own index.
 *
 * **A motion one or two bones off the model still drives it.** 186 of the
 * 4,197 motions in `enemy.gp2` have a bone more or fewer than their own
 * model's nodes — Teeny Sanguini's field model `z061c_f` has 20 nodes and its
 * motions 21, the battle model's count, whose first 19 nodes it shares by
 * name; `z063a` and `z063a_f` have 24 nodes and 25 bones. Requiring the counts
 * to agree left every one of those monsters in its rest pose. Pairing by index
 * is INFERRED from that shared prefix, and from the posed models' size: across
 * the frames, the 186 grow to at most 2.6 times their rest size and the 4,011
 * whose counts agree to 8.5, so the pairing tears nothing apart. A bone past
 * the last node is dropped; a node past the last bone keeps its rest.
 */
function stacksOf(
  model: Model,
  motion: Animation | undefined,
  frame: number,
): readonly (readonly Mat4[])[] {
  if (!motion) return model.shapeMatrices
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

/**
 * What a character drawn as a single model holds — Ivor's copper sword and pot
 * lid in battle — each part hung from the bone it names, as the pose puts that
 * bone, and then placed, scaled and faced with the character as
 * {@link castPieces} places it.
 */
export function heldPieces(
  member: CastMember,
  held: readonly { readonly model: Model; readonly bone: string }[],
  cat: Catalogue,
  scale: number,
  frame: number,
): Piece[] {
  const { model, placement } = member
  const sin = Math.sin(placement.facing)
  const cos = Math.cos(placement.facing)
  const out: Piece[] = []
  for (const part of held) {
    const at = modelBoneWorld(model, member.motion, frame, part.bone)
    if (!at) continue
    for (let shape = 0; shape < part.model.numShapes; shape++) {
      const posed = attachedGeometry(part.model, shape, at)
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
      const materialIndex = part.model.shapeMaterials[shape]
      const material = materialIndex === undefined ? undefined : part.model.materials[materialIndex]
      const texture: DecodedTexture | undefined = material ? textureFor(cat, material) : undefined
      out.push(texture ? { geometry, ...texture } : { geometry })
    }
  }
  return out
}

/** Each character's sprite sheet, read once and kept. */
const readSheets = new Map<string, Sprite | undefined>()
export function sheetFor(
  name: string,
  sheets: ReadonlyMap<string, Uint8Array>,
): Sprite | undefined {
  const key = name.toLowerCase()
  if (readSheets.has(key)) return readSheets.get(key)
  const bytes = sheets.get(key)
  let sprite: Sprite | undefined
  if (bytes && isSprite(bytes)) {
    try {
      sprite = readSprite(bytes)
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
 * The sheet's own frame is used as the texture, its parts put together, and
 * the quad is sized from it.
 */
export function spritePieces(
  member: CastSprite,
  characterHeight: number,
  yaw: number,
  frame: number,
  /** How much of it shows, from 0 to 1 — a figure fading in or out. */
  opacity = 1,
): Piece[] {
  const { placement } = member
  const image = decodedFrame(member, frame)
  // **A sprite is not in the models' space**, so the models' scale does not
  // apply: at that scale a villager stands 0.31 units against a person's 0.18.
  // The frame is the character — a villager's 40 rows, its top eight a part of
  // their own — so one frame tall is one person tall.
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
    {
      geometry,
      pixels: image.pixels,
      width: image.width,
      height: image.height,
      cutout: true,
      ...(opacity < 1 ? { opacity } : {}),
    },
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
/** The four walks, in the order the sheet lists them: every other facing of {@link FACINGS}. */
const WALKS = ['walk_down', 'walk_left', 'walk_up', 'walk_right'] as const

/**
 * Which frame of a sheet to show a character walking, `ticks` into the walk:
 * the walk whose facing is nearest its own relative to the camera, its steps
 * taken round in the order the sheet names them, each held for its own
 * duration — 8 ticks a step on a villager's walk. The sheet's walks and
 * durations are read; that a scene's walk runs on the scene's own frames is
 * ours. Standing, where the sheet has no walk.
 */
export function walkingFrame(member: CastSprite, cameraYaw: number, ticks: number): number {
  const away = member.placement.facing - cameraYaw
  const quarter = Math.PI / 2
  const index = (((2 - Math.round(away / quarter)) % 4) + 4) % 4
  const walk = member.sprite.animation(WALKS[index] as string)
  if (!walk || walk.steps.length === 0) return standingFrame(member, cameraYaw)
  // Round the chain from the first step, each naming the next — see `SpriteStep.order`.
  const chain: (typeof walk.steps)[number][] = []
  const seen = new Set<number>()
  for (let at = 0; !seen.has(at) && chain.length < walk.steps.length; ) {
    const step = walk.steps[at]
    if (!step) break
    seen.add(at)
    chain.push(step)
    at = step.order
  }
  const total = chain.reduce((sum, step) => sum + Math.max(1, step.duration), 0)
  let left = ((Math.floor(ticks) % total) + total) % total
  for (const step of chain) {
    left -= Math.max(1, step.duration)
    if (left < 0) return step.frame
  }
  return chain[0]?.frame ?? 0
}

/** The rows of a villager's frame: one frame tall is one person tall — see `spritePieces`. */
export const FRAME_ROWS = 40

/**
 * A thing drawn as a sprite — a pot, a barrel — at the characters' own pixel
 * scale rather than stretched to a person's height: a frame of 32 rows is four
 * fifths of a person, as 32 rows of a villager's 40 would be.
 */
export function propPieces(
  prop: CastSprite,
  personHeight: number,
  yaw: number,
  frame = 0,
): Piece[] {
  const image = decodedFrame(prop, frame)
  return spritePieces(prop, (personHeight * image.height) / FRAME_ROWS, yaw, frame)
}

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
