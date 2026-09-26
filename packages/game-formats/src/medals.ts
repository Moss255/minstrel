import { GameFormatError } from './errors.ts'

/**
 * Mini medals: what Cap'n Max Meddlin' gives for them — read out of overlay 4,
 * the medal service's own code, where the two tables sit back to back.
 *
 * **Read 27 September 2026.** Two arrays of `(u16 medals, u16 item)`:
 *
 * - **six exchanges** — the booty picked for yourself once every milestone is
 *   passed; bounded in code by `cmp r4, #6`. On the reference cartridge 3
 *   medals for item 18023 up to 20 for 17170.
 * - **ten milestones** straight after — the booty for handing in a total of
 *   4, 8, 13 … 80; bounded by `cmp r3, #0xa`. The code that reads them is
 *   `func_ov004_0216794c` (US, overlay 4 `0x1c930`): the next milestone is the
 *   first whose count is above the total handed in.
 *
 * Found by shape, as the build and weight tables are, so another release
 * yields them or says they are not there: six pairs whose counts rise, each
 * naming an item, and ten more whose counts rise and end at 80. See FORMAT.md,
 * "Mini medals".
 */
export interface MedalReward {
  readonly medals: number
  readonly item: number
}

export interface MedalRewards {
  readonly exchanges: readonly MedalReward[]
  readonly milestones: readonly MedalReward[]
}

/** The mini medal itself, as an item. */
export const MINI_MEDAL = 22039
/** The most the game counts as handed in: `func_ov004_02167a0c` caps the total at `0x1f4`. */
export const MEDALS_MOST = 500

const EXCHANGES = 6
const MILESTONES = 10
/** The last milestone's count — the one the service's own lines turn on, "all these mini medals". */
const LAST_MILESTONE = 80

/** Whether the pairs at `at` rise in their counts and each names an item. */
function rising(view: DataView, at: number, count: number): boolean {
  let before = 0
  for (let i = 0; i < count; i++) {
    const medals = view.getUint16(at + 4 * i, true)
    const item = view.getUint16(at + 4 * i + 2, true)
    if (medals <= before || item < 10000 || item >= 30000) return false
    before = medals
  }
  return true
}

/** Find and read the two tables in overlay 4's bytes. Throws if they are not there. */
export function readMedalRewards(overlay: Uint8Array): MedalRewards {
  const view = new DataView(overlay.buffer, overlay.byteOffset, overlay.byteLength)
  const span = 4 * (EXCHANGES + MILESTONES)
  for (let at = 0; at + span <= overlay.length; at += 2) {
    const milestones = at + 4 * EXCHANGES
    if (view.getUint16(milestones + 4 * (MILESTONES - 1), true) !== LAST_MILESTONE) continue
    if (!rising(view, at, EXCHANGES) || !rising(view, milestones, MILESTONES)) continue
    const read = (from: number, count: number) =>
      Array.from({ length: count }, (_, i) => ({
        medals: view.getUint16(from + 4 * i, true),
        item: view.getUint16(from + 4 * i + 2, true),
      }))
    return { exchanges: read(at, EXCHANGES), milestones: read(milestones, MILESTONES) }
  }
  throw new GameFormatError(
    'no mini medal tables: six rising exchanges then ten milestones ending at 80',
  )
}
