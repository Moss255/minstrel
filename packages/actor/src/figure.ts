import {
  type Animation,
  type Geometry,
  loopFrames,
  type Mat4,
  type Model,
  measureBounds,
  multiply,
  type NodeTransform,
  poseGeometry,
  resolvePose,
  sampleAnimation,
  type TextureSet,
} from '@minstrel/nitro-gfx'
import type { Library } from './library.ts'

/** One figure: the parts that carry the rig, the ones hung from it, and what dresses them. */
export interface Figure {
  /** Rigged parts. They pose themselves against the motion. */
  readonly rigged: readonly Model[]
  /**
   * Unrigged parts, each with the bone it hangs from — and, where it hangs
   * turned, how: a matrix in the bone's space, applied before the bone's own.
   */
  readonly attachments: readonly {
    readonly model: Model
    readonly bone: string
    readonly turn?: Mat4
  }[]
  readonly motions: ReadonlyMap<string, Animation>
  /**
   * Textures this figure takes before any other of the same name.
   *
   * A character's arms, gloves, footwear and hair colour are texture files,
   * and the files of a kind name their one texture alike — see
   * `CHARACTER_TEXTURES`. The body and legs bind that name; which file supplies
   * it is what the character wears. Resolved by name across the whole
   * cartridge, the first file walked would dress everyone.
   */
  readonly textures: ReadonlyMap<string, { readonly set: TextureSet; readonly name: string }>
}

/** What a figure is dressed in, by part and file name — see `partName` in `@minstrel/game-formats`. */
export interface Outfit {
  /** The body, on the rig: armour, `p_b<nnn>`. */
  readonly body: string
  /** The legs, on the rig: legwear, `p_p<nnn>`. */
  readonly legs: string
  readonly face?: string
  readonly hair?: string
  readonly headgear?: string
  /** Texture files: arms or gloves (`p_a`, `p_g`), footwear (`p_r`), hair colour (`p_h`). */
  readonly textures?: readonly string[]
  /**
   * Parts hung from a bone of the rig by name, and turned in its space if a
   * turn is given: a weapon (`p_w<nnn>`), a shield (`p_s<nnn>`).
   */
  readonly attached?: readonly {
    readonly part: string
    readonly bone: string
    readonly turn?: Mat4
  }[]
}

/** One shape of one part, unposed, so a frame change is one pass over it. */
export interface FigurePiece {
  readonly model: Model
  readonly shape: number
  readonly geometry: Geometry
}

/**
 * Dress a figure in named parts.
 *
 * The body and legs carry the rig and pose themselves. The face, hair and
 * headgear carry one bone of their own and hang from the rig's `head`: the
 * face and hair confirmed by where they land (`docs/M2-village.md`), the
 * headgear INFERRED — `p_m200` spans y 1.82 to 7.93 about its origin, as hair
 * spans −0.73 to 7.41 and a face −0.32 to 4.00, so all three are modelled in
 * the head's space. Whatever the outfit hangs elsewhere hangs from the bone it
 * names.
 *
 * A part or file the library does not have is refused by name rather than left
 * out, so a figure is never quietly missing its legs.
 */
export function dressFigure(lib: Library, outfit: Outfit): Figure {
  const need = (name: string): Model => {
    const model = lib.parts.get(name)
    if (!model) throw new Error(`no character part '${name}' on the cartridge`)
    return model
  }
  const rigged = [need(outfit.body), need(outfit.legs)]
  const attachments = [
    ...[outfit.face, outfit.hair, outfit.headgear]
      .filter((name): name is string => name !== undefined)
      .map((name) => ({ model: need(name), bone: 'head' })),
    ...(outfit.attached ?? []).map(({ part, bone, turn }) => ({
      model: need(part),
      bone,
      ...(turn ? { turn } : {}),
    })),
  ]

  const textures = new Map<string, { set: TextureSet; name: string }>()
  for (const file of outfit.textures ?? []) {
    const set = lib.textures.get(file)
    if (!set) throw new Error(`no character texture file '${file}' on the cartridge`)
    for (const texture of set.textures) textures.set(texture.name, { set, name: texture.name })
  }

  const bare: Figure = { rigged, attachments, motions: new Map(), textures }
  const motions = new Map<string, Animation>()
  for (const [name, variants] of lib.motions) {
    const chosen = variants.length === 1 ? variants[0] : inPlace(bare, variants)
    if (chosen) motions.set(name, chosen)
  }
  return { rigged, attachments, motions, textures }
}

/**
 * Of several animations sharing a name, the one that keeps the figure on the
 * floor.
 *
 * A character is placed by putting the lowest point of its whole motion at its
 * feet, so a motion that carries the figure bodily upwards spends most of its
 * cycle in the air. That is not a stylistic difference between two idles: of
 * the three animations called `stand`, one holds the figure still to within
 * 0.009 model units, another moves it 0.227, and the third lifts it 1.706 —
 * 7.5% of the figure's own height, which reads exactly as feet not touching the
 * ground.
 *
 * **Measured, not assumed.** Which pack holds the idle a character should use
 * is not established anywhere in the data, so this asks the animations instead:
 * the one that translates the figure least is the one authored to be played in
 * place. It compares whole-figure lows rather than a root bone, because the
 * lift shows up in every part at once and a root translation is not what
 * carries it — the rig's root is still on every frame.
 */
function inPlace(figure: Figure, variants: readonly Animation[]): Animation | undefined {
  const pieces = figurePieces(figure)
  if (pieces.length === 0) return variants[0]

  let best: Animation | undefined
  let least = Number.POSITIVE_INFINITY
  for (const motion of variants) {
    if (motion.boneCount !== figure.rigged[0]?.nodes.length) continue
    let low = Number.POSITIVE_INFINITY
    let high = Number.NEGATIVE_INFINITY
    for (let frame = 0; frame < loopFrames(motion); frame++) {
      const drawn = poseFigure(figure, pieces, motion, frame).map((p) => p.posed)
      if (drawn.length === 0) continue
      const { minY } = measureBounds(drawn)
      low = Math.min(low, minY)
      high = Math.max(high, minY)
    }
    const travel = high - low
    if (Number.isFinite(travel) && travel < least) {
      least = travel
      best = motion
    }
  }
  return best ?? variants[0]
}

/**
 * The rigged parts worth drawing.
 *
 * A part is dropped when another already covers everything it covers. The three
 * `p_test` parts are the case this exists for: they are not three pieces of one
 * figure but a whole figure and its two halves — `p_test0` is four shapes,
 * `p_test1` its upper two and `p_test2` its lower two, to the same bounds
 * exactly — so drawing all three draws the character twice, which shows up
 * first on the head. On a real character, assembled one part per slot, nothing
 * is dropped.
 */
export function usefulParts(figure: Figure): Model[] {
  const measured = figure.rigged.map((model) => ({
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

/** Every drawable shape of the figure's rigged parts, unposed. */
export function figurePieces(figure: Figure): FigurePiece[] {
  return usefulParts(figure).flatMap((model) =>
    model.shapes.map((shape, index) => ({ model, shape: index, geometry: model.geometry(shape) })),
  )
}

/**
 * Every part's matrix stacks for one frame of a motion, or its bind pose.
 *
 * Each shape has its own stack, because a model reuses slots between shapes.
 */
export function figureStacks(
  figure: Figure,
  motion: Animation | undefined,
  frame: number,
): Map<Model, Mat4[][]> {
  const stacks = new Map<Model, Mat4[][]>()
  for (const part of usefulParts(figure)) {
    if (motion && motion.boneCount === part.nodes.length) {
      stacks.set(part, part.pose(posedNodes(part, motion, frame)))
    } else {
      stacks.set(part, part.shapeMatrices as Mat4[][])
    }
  }
  return stacks
}

function posedNodes(part: Model, motion: Animation, frame: number): NodeTransform[] {
  const local = sampleAnimation(motion, frame)
  return part.nodes.map((node, i) => {
    const posed = local[i]
    return posed ? { ...node, local: posed } : node
  })
}

/**
 * Where a rig bone is, in the space the posed parts are drawn in.
 *
 * The rigged parts all carry the same skeleton, so any of them answers for all
 * of them — and it is what an unrigged part needs to be hung from.
 */
export function boneWorld(
  figure: Figure,
  motion: Animation | undefined,
  frame: number,
  bone: string,
): Mat4 | undefined {
  const part = figure.rigged[0]
  if (!part) return undefined
  return modelBoneWorld(part, motion, frame, bone)
}

/**
 * Where a bone of one rigged model is, posed by a motion or in its bind pose —
 * for a character drawn as a single model, which has no figure: Ivor.
 */
export function modelBoneWorld(
  model: Model,
  motion: Animation | undefined,
  frame: number,
  bone: string,
): Mat4 | undefined {
  const index = model.nodes.findIndex((node) => node.name === bone)
  if (index < 0) return undefined
  const nodes: readonly NodeTransform[] =
    motion && motion.boneCount === model.nodes.length
      ? posedNodes(model, motion, frame)
      : model.nodes
  return resolvePose(model.renderCommands, nodes).world[index]
}

/** One shape of an unrigged part, put where its bone is — turned first, if a turn is given. */
export function attachedGeometry(model: Model, shape: number, bone: Mat4, turn?: Mat4): Geometry {
  const at = turn ? multiply(bone, turn) : bone
  const geometry = poseGeometry(model.geometry(shape), model.shapeMatrices[shape] ?? model.matrices)
  return {
    ...geometry,
    vertices: geometry.vertices.map((v) => ({
      ...v,
      x:
        (at[0] as number) * v.x +
        (at[4] as number) * v.y +
        (at[8] as number) * v.z +
        (at[12] as number),
      y:
        (at[1] as number) * v.x +
        (at[5] as number) * v.y +
        (at[9] as number) * v.z +
        (at[13] as number),
      z:
        (at[2] as number) * v.x +
        (at[6] as number) * v.y +
        (at[10] as number) * v.z +
        (at[14] as number),
    })),
  }
}

/**
 * The figure posed for one frame: rigged parts against the motion, unrigged
 * parts hung from the bones they belong to.
 */
export function poseFigure(
  figure: Figure,
  pieces: readonly FigurePiece[],
  motion: Animation | undefined,
  frame: number,
): { piece: FigurePiece; posed: Geometry }[] {
  const stacks = figureStacks(figure, motion, frame)
  const posed = pieces.map((piece) => ({
    piece,
    posed: poseGeometry(
      piece.geometry,
      stacks.get(piece.model)?.[piece.shape] ??
        piece.model.shapeMatrices[piece.shape] ??
        piece.model.matrices,
    ),
  }))
  // A head is not part of the rig; it hangs from it. So do a weapon and a shield.
  for (const { model, bone, turn } of figure.attachments) {
    const at = boneWorld(figure, motion, frame, bone)
    if (!at) continue
    for (let shape = 0; shape < model.numShapes; shape++) {
      posed.push({
        piece: { model, shape, geometry: model.geometry(shape) },
        posed: attachedGeometry(model, shape, at, turn),
      })
    }
  }
  return posed
}
