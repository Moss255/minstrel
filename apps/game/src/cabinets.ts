import type { Motion, Treasure } from '@minstrel/game-formats'
import { measureBounds, poseGeometry } from '@minstrel/nitro-gfx'
import type { AssembledMap } from '@minstrel/world'
import type { Talker } from './talk.ts'

/**
 * Cabinets: the treasure a room keeps in its furniture.
 *
 * A cabinet is a map piece whose resource ends in `G` and a number —
 * `M01M03G1`, `M01M03G2` in the shop — and whose motion table (see
 * `readMotionTable`) names `open`, `closed` and `opend` (sic) over the model's
 * own animation, which swings its two doors a little over a quarter turn each.
 * What is inside is a treasure record of kind `0x30`, the kind with no
 * position. **The map's cabinets and those records are paired in order** —
 * INFERRED: in the village each record's third value is its cabinet's number
 * less one, but elsewhere that value runs on across an area, and it is only the
 * count that agrees. See `FORMAT.md`, "Treasure".
 *
 * A cabinet stands `closed` until it is opened, plays `open` once, and then
 * holds its last frame. Played the way every other piece's animation is, on a
 * loop, its doors swung open and shut for ever.
 */

/** The treasure kind that has no position: what a cabinet holds. */
export const CABINET_KIND = 0x30
/** The motions a cabinet's table names — the last as the file spells it. */
export const CABINET_SHUT = 'closed'
export const CABINET_OPENING = 'open'
export const CABINET_OPEN = 'opend'

export interface Cabinet {
  /** The piece's resource, `M01M03G1`. */
  readonly stem: string
  /** Which of the map's pieces it is. */
  readonly piece: number
  /** Which of the map's treasures is inside, by its place in the list; undefined when none is paired. */
  readonly slot: number | undefined
  /** Its middle, in world units: what the Hero walks up to. */
  readonly x: number
  readonly z: number
  readonly motions: readonly Motion[]
  /** The motion it is playing, and the map frame that motion began on. */
  motion: string
  since: number
}

/** The number in a cabinet's name — `M01M03G2` is 2 — or undefined for a piece that is not one. */
export function cabinetNumber(stem: string): number | undefined {
  const found = /G(\d+)$/i.exec(stem)
  return found ? Number(found[1]) : undefined
}

/**
 * Which treasure each cabinet holds: the map's cabinet-kind records, in their
 * order, against the cabinets in the order of their numbers. Undefined where
 * the records run out.
 */
export function pairCabinets(
  numbers: readonly number[],
  treasures: readonly Treasure[],
): (number | undefined)[] {
  const slots: number[] = []
  for (const [slot, treasure] of treasures.entries()) {
    if (treasure.kind === CABINET_KIND && !treasure.position) slots.push(slot)
  }
  const byNumber = [...numbers.keys()].sort((a, b) => (numbers[a] ?? 0) - (numbers[b] ?? 0))
  const paired: (number | undefined)[] = numbers.map(() => undefined)
  byNumber.forEach((index, rank) => {
    paired[index] = slots[rank]
  })
  return paired
}

/** The map's cabinets, each standing shut or, if its treasure has been taken, open. */
export function cabinetsOf(
  map: AssembledMap,
  treasures: readonly Treasure[],
  isOpen: (slot: number) => boolean,
): Cabinet[] {
  const found: { index: number; stem: string; number: number }[] = []
  for (const [index, piece] of map.pieces.entries()) {
    const stem = piece.source ?? piece.model.name
    const number = cabinetNumber(stem)
    if (number === undefined) continue
    if (!piece.motions?.some((motion) => motion.name === CABINET_OPENING)) continue
    found.push({ index, stem, number })
  }
  const slots = pairCabinets(
    found.map((f) => f.number),
    treasures,
  )
  return found.map(({ index, stem }, i) => {
    const piece = map.pieces[index] as AssembledMap['pieces'][number]
    const { model } = piece
    const bounds = measureBounds(
      model.shapes.map((shape, s) =>
        poseGeometry(model.geometry(shape), model.shapeMatrices[s] ?? model.matrices),
      ),
    )
    const slot = slots[i]
    return {
      stem,
      piece: index,
      slot,
      x: piece.place.x + ((bounds.minX + bounds.maxX) / 2) * piece.scale,
      z: piece.place.z + ((bounds.minZ + bounds.maxZ) / 2) * piece.scale,
      motions: piece.motions ?? [],
      motion: slot !== undefined && isOpen(slot) ? CABINET_OPEN : CABINET_SHUT,
      since: 0,
    }
  })
}

/**
 * The frame of a model's own animation a motion stands at, `elapsed` map
 * frames after it began: from its first frame at its speed, holding its last.
 * A motion the table does not name stands at the first frame.
 */
export function motionFrame(
  motions: readonly Motion[],
  name: string,
  elapsed: number,
  frameCount: number,
): number {
  const motion = motions.find((m) => m.name === name)
  if (!motion) return 0
  const run = Math.max(0, Math.min(elapsed * motion.speed, motion.end - motion.start))
  return Math.max(0, Math.min(Math.floor(motion.start + run), frameCount - 1))
}

/** The cabinets as things the Hero can walk up to: reach and facing are talk's. Each `id` is its place in the list. */
export function cabinetTargets(cabinets: readonly Cabinet[]): Talker[] {
  return cabinets.map((cabinet, id) => ({ id, name: 'cabinet', x: cabinet.x, z: cabinet.z }))
}
