import {
  type Animation,
  type Geometry,
  loopFrames,
  type Mat4,
  type Model,
  measureBounds,
  type NodeTransform,
  poseGeometry,
  resolvePose,
  sampleAnimation,
} from '@minstrel/nitro-gfx'
import { ATTACHMENT_BONES, type Library, RIG_BONES } from './library.ts'

/** One figure: the parts that carry the rig, and the ones hung from it. */
export interface Figure {
  /** Rigged parts. They pose themselves against the motion. */
  readonly rigged: readonly Model[]
  /** Unrigged parts, each with the bone it hangs from. */
  readonly attachments: readonly { readonly model: Model; readonly bone: string }[]
  readonly motions: ReadonlyMap<string, Animation>
}

/** One shape of one part, unposed, so a frame change is one pass over it. */
export interface FigurePiece {
  readonly model: Model
  readonly shape: number
  readonly geometry: Geometry
}

/**
 * Pick one figure out of the cartridge's 796 parts.
 *
 * **Which parts make the Hero is not known** — the preset table has not been
 * found — so this takes the first of each kind by name, which is arbitrary but
 * reproducible, and gives a complete figure: a body and legs that carry the rig
 * and pose themselves, and a face and hair hung from the `head` bone.
 *
 * The `p_test` parts are skipped. They are a half-scale test figure — 7.68
 * units where a real body reaches 16.57 — and they have no head at all.
 */
export function chooseFigure(lib: Library): Figure {
  const names = [...lib.parts.keys()].sort()
  const rig = lib.motions.get('walk')?.[0]?.boneCount ?? RIG_BONES

  const firstOf = (prefix: string, rigged: boolean): Model | undefined => {
    const name = names.find((candidate) => {
      if (!candidate.startsWith(`p_${prefix}`) || candidate.startsWith('p_test')) return false
      const model = lib.parts.get(candidate) as Model
      return rigged ? model.nodes.length === rig : model.nodes.length < rig
    })
    return name === undefined ? undefined : lib.parts.get(name)
  }

  const rigged: Model[] = []
  for (const prefix of ['b', 'p']) {
    const model = firstOf(prefix, true)
    if (model) rigged.push(model)
  }
  const attachments: { model: Model; bone: string }[] = []
  for (const [prefix, bone] of Object.entries(ATTACHMENT_BONES)) {
    const model = firstOf(prefix, false)
    if (model) attachments.push({ model, bone })
  }

  const figure: Figure = { rigged, attachments, motions: new Map() }
  const motions = new Map<string, Animation>()
  for (const [name, variants] of lib.motions) {
    const chosen = variants.length === 1 ? variants[0] : inPlace(figure, variants)
    if (chosen) motions.set(name, chosen)
  }
  return { rigged, attachments, motions }
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
  const index = part.nodes.findIndex((node) => node.name === bone)
  if (index < 0) return undefined
  const nodes: readonly NodeTransform[] =
    motion && motion.boneCount === part.nodes.length ? posedNodes(part, motion, frame) : part.nodes
  return resolvePose(part.renderCommands, nodes).world[index]
}

/** One shape of an unrigged part, put where its bone is. */
export function attachedGeometry(model: Model, shape: number, at: Mat4): Geometry {
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
  // A head is not part of the rig; it hangs from it.
  for (const { model, bone } of figure.attachments) {
    const at = boneWorld(figure, motion, frame, bone)
    if (!at) continue
    for (let shape = 0; shape < model.numShapes; shape++) {
      posed.push({
        piece: { model, shape, geometry: model.geometry(shape) },
        posed: attachedGeometry(model, shape, at),
      })
    }
  }
  return posed
}
