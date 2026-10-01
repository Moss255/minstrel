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
 * **Searched, it opens and shuts again**, as the map's own driver plays it
 * (`func_02015554`, USA; read 1 October 2026): `open` forward and once, at
 * 1.5 times its record's rate, held 500 ms, then `close` in reverse, held at
 * its end. Until it is searched it stands in its rest pose, with no
 * animation on it. `closed` and `opend` are named in the files and by no code.
 * Played the way every other piece's animation is, on a loop, its doors would
 * swing open and shut for ever.
 */

/** The treasure kind that has no position: what a cabinet holds. */
export const CABINET_KIND = 0x30
/** The motions a cabinet's table names that the game plays — or a gate's, `open2` and `close2`. */
export const CABINET_OPENING = 'open'
export const CABINET_CLOSING = 'close'
/** The rate the driver plays them at (`SetAnimationPlaybackSpeed`, 1.5). */
export const CABINET_RATE = 1.5
/** How long it holds open, in the game's 17 ms frames: 500 ms. */
export const CABINET_HOLD = 500 / 17

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
  /** When it was searched, in the map's 17 ms frames; undefined for never. */
  searched: number | undefined
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

/** The map's cabinets, each standing in its rest pose. */
export function cabinetsOf(map: AssembledMap, treasures: readonly Treasure[]): Cabinet[] {
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
      searched: undefined,
    }
  })
}

/**
 * **The frame a searched cabinet stands at**, `elapsed` 17 ms frames after it
 * was searched — see the module: its opening, the hold, its closing played
 * backwards, then held. Undefined for one whose table names neither.
 */
export function searchedFrame(motions: readonly Motion[], elapsed: number): number | undefined {
  const named = (name: string) =>
    motions.find((m) => m.name === name) ?? motions.find((m) => m.name === `${name}2`)
  const opening = named(CABINET_OPENING)
  const closing = named(CABINET_CLOSING) ?? opening
  if (!opening || !closing) return undefined
  const rateOf = (m: Motion) => Math.max(1e-6, m.speed * CABINET_RATE)
  const opens = (opening.end - opening.start) / rateOf(opening)
  if (elapsed < opens) return opening.start + elapsed * rateOf(opening)
  const shutting = elapsed - opens - CABINET_HOLD
  if (shutting < 0) return opening.end
  return Math.max(closing.start, closing.end - shutting * rateOf(closing))
}

/** The cabinets as things the Hero can walk up to: reach and facing are talk's. Each `id` is its place in the list. */
export function cabinetTargets(cabinets: readonly Cabinet[]): Talker[] {
  return cabinets.map((cabinet, id) => ({ id, name: 'cabinet', x: cabinet.x, z: cabinet.z }))
}
