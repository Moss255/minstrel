import { GameFormatError } from './errors.ts'

/**
 * **Overlay 26's fixed shots** — the camera's eye and look-at for the
 * command phase of a fight with certain monsters, in place of the side shot's
 * (`data_ov026_021de87c`, read 6 October 2026 from the USA build; see
 * `docs/readings/T15-presentation.md`).
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `s32` | the key: a monster's kind, `mon_data` `+0x10` — or 0, for monster 801 |
 * | `+0x04` | `fx32` ×3 | the eye |
 * | `+0x10` | `fx32` ×3 | the look-at |
 *
 * 28 bytes a record, ended by a key of −1 (`func_ov026_021d8aac`). The table
 * is code's data, not a file's, so it is found by its shape: a run of at least
 * {@link LEAST} records whose keys are 0 to `0x1ff`, whose coordinates are all
 * within ±64, and which ends in −1. Throws when no run has the shape, or more
 * than one.
 */
export interface FixedShot {
  readonly key: number
  /** The eye and look-at, `fx32`, in the stage's own space. */
  readonly eye: readonly [number, number, number]
  readonly look: readonly [number, number, number]
}

const RECORD = 28
/** Fewer than this is not taken for the table: 47 are on the cartridge. */
const LEAST = 32
const KEY_MOST = 0x1ff
const REACH = 64 * 4096

export function readFixedShots(overlay: Uint8Array): FixedShot[] {
  const view = new DataView(overlay.buffer, overlay.byteOffset, overlay.byteLength)
  const recordAt = (at: number): FixedShot | undefined => {
    if (at + RECORD > overlay.length) return undefined
    const key = view.getInt32(at, true)
    if (key < 0 || key > KEY_MOST) return undefined
    const w = (k: number) => view.getInt32(at + 4 + 4 * k, true)
    const coords = [0, 1, 2, 3, 4, 5].map(w)
    if (coords.some((c) => c < -REACH || c > REACH)) return undefined
    return {
      key,
      eye: [coords[0] as number, coords[1] as number, coords[2] as number],
      look: [coords[3] as number, coords[4] as number, coords[5] as number],
    }
  }
  const runs: FixedShot[][] = []
  for (let at = 0; at + 4 <= overlay.length; at += 4) {
    // A run starts where the record before it is not one.
    if (at >= RECORD && recordAt(at - RECORD)) continue
    const run: FixedShot[] = []
    let p = at
    for (let r = recordAt(p); r; r = recordAt(p)) {
      run.push(r)
      p += RECORD
    }
    if (run.length < LEAST) continue
    if (p + 4 > overlay.length || view.getInt32(p, true) !== -1) continue
    runs.push(run)
  }
  if (runs.length !== 1) {
    throw new GameFormatError(`fixed shots: ${runs.length} runs have the table's shape, not one`)
  }
  return runs[0] as FixedShot[]
}

/** The key that holds for monster 801 alone (`func_ov000_0215fc60` giving 2). */
export const FIXED_SHOT_ANY = 0
/** The monster whose fight takes key 0: the battle's first group is it (`battle+0x81fe` = `0x321`). */
export const FIXED_SHOT_MONSTER = 801
/** The kind whose three records the round picks among, mod 3 (`0x021d8b54`). */
export const FIXED_SHOT_BY_ROUND = 0x115

/**
 * **Which fixed shot a fight takes** (`func_ov026_021d8aac`), in the table's
 * order, the first that holds: a key of 0 when the battle's first group is
 * monster 801; any other when a monster of that kind is in the fight — and for
 * {@link FIXED_SHOT_BY_ROUND}, the round mod 3 picks among its three. Undefined
 * when none holds, and the side shot stands.
 */
export function fixedShotFor(
  shots: readonly FixedShot[],
  kinds: readonly number[],
  firstNumber: number | undefined,
  round: number,
): FixedShot | undefined {
  for (const [i, shot] of shots.entries()) {
    if (shot.key === FIXED_SHOT_ANY) {
      if (firstNumber === FIXED_SHOT_MONSTER) return shot
      continue
    }
    if (!kinds.includes(shot.key)) continue
    if (shot.key === FIXED_SHOT_BY_ROUND) return shots[i + (round % 3)] ?? shot
    return shot
  }
  return undefined
}
