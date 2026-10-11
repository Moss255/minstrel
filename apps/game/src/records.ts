/**
 * **The Defeated Monster List** — what the Battle Records keep of each
 * monster, read 11 October 2026 from the US build.
 *
 * - **Where**: `GameState+0x75f0`, a word a monster for numbers 1 to 308
 *   (`0x134`) — the monster's own number, the one its name and battle record
 *   are keyed by; one past 308 is not kept (`func_020ac020`,
 *   `func_020abe84`).
 * - **The word**: bits 0–9 **how many have been defeated**, held at 999; bit
 *   10 a flag the victory sets from each kind's record (`+6`) and
 *   `func_020abf60` from a list of its own — what it means is not read; bits
 *   11–17 and 18–24 **how many times each of its two drops has dropped**, held
 *   at 99.
 * - **The victory adds** (`func_ov023_021edf54`): for each kind beaten, its
 *   count in the battle (the kind's record at battle `+0x8d66`, bits 3–13)
 *   added to its word. Under which of the battle's flags it does so
 *   (`0x2000`, `0x4000`, `0x8000`) is not read; here, a battle won, and a
 *   monster that fled is not counted — **ours**, as is whether the game's
 *   count takes those that got away.
 * - **A drop counts** as the victory's loot is given (`func_ov023_021f2a48`):
 *   the drop's slot, 1 or 2, adds one to the first or the second count. A
 *   theft in battle does the same (`func_ov024_021df924`). That slot 1 is the
 *   ordinary drop and 2 the rare is INFERRED from the battle record's order.
 * - **A kind defeated for the first time** adds one to a count in the
 *   records (`func_020a0460`), not kept here.
 *
 * The list's words are overlay 14's, `str_sml`: the families 0–13, "All
 * Monsters" 18, "By Name" 19, "By Number" 20, "?????????" 21 for one not yet
 * defeated. **Ours**: the families' pages, the monster drawn and its
 * description (`mons_info2.nat`, not read) are not built.
 */

/** The highest monster number the list keeps (`0x134`). */
export const LISTED_MOST = 308
/** The most each count holds: defeated (bits 0–9), each drop (7 bits). */
export const DEFEATED_MOST = 999
export const DROPPED_MOST = 99

/** What is kept of one monster. */
export interface Defeated {
  count: number
  /** Times its ordinary drop and its rare drop have dropped. */
  drops: [number, number]
}

/** Each monster's, by its number. */
export type DefeatedList = Map<number, Defeated>

/** `str_sml`'s words for the list. */
export const MONSTER_LIST_WORDS = {
  all: 18,
  byName: 19,
  byNumber: 20,
  unknown: 21,
} as const

const entry = (list: DefeatedList, number: number): Defeated | undefined => {
  if (number < 1 || number > LISTED_MOST) return undefined
  let one = list.get(number)
  if (!one) {
    one = { count: 0, drops: [0, 0] }
    list.set(number, one)
  }
  return one
}

/** A battle won: each monster number beaten, as many times as it was, added to its count. */
export function countDefeated(list: DefeatedList, beaten: readonly number[]): void {
  for (const number of beaten) {
    const one = entry(list, number)
    if (one) one.count = Math.min(DEFEATED_MOST, one.count + 1)
  }
}

/** A monster's drop given: one more for its ordinary drop, or its rare. */
export function countDropped(list: DefeatedList, number: number, rare: boolean): void {
  const one = entry(list, number)
  if (!one) return
  const slot = rare ? 1 : 0
  one.drops[slot] = Math.min(DROPPED_MOST, one.drops[slot] + 1)
}

/** One row of the list, as it is shown. */
export interface MonsterRow {
  readonly number: number
  /** Its name, once one has been defeated; undefined before. */
  readonly name: string | undefined
  readonly count: number
  readonly drops: readonly [number, number]
}

/**
 * The list's rows: **by number**, every number with a name, one not yet
 * defeated without it; **by name**, those defeated, by name. **Ours**: that
 * the order by name leaves out those not yet defeated, and sorts by the
 * English name as the browser compares it.
 */
export function monsterRows(
  list: DefeatedList,
  names: ReadonlyMap<number, string>,
  by: 'number' | 'name',
): MonsterRow[] {
  const rows: MonsterRow[] = []
  for (let number = 1; number <= LISTED_MOST; number++) {
    const name = names.get(number)
    if (name === undefined) continue
    const one = list.get(number)
    const count = one?.count ?? 0
    rows.push({
      number,
      name: count > 0 ? name : undefined,
      count,
      drops: one ? [one.drops[0], one.drops[1]] : [0, 0],
    })
  }
  if (by === 'number') return rows
  return rows
    .filter((row) => row.name !== undefined)
    .sort((a, b) => (a.name as string).localeCompare(b.name as string))
}

/** The list as a save keeps it: `[number, count, ordinary, rare]`, those with anything. */
export function defeatedSaved(list: DefeatedList): [number, number, number, number][] {
  return [...list]
    .filter(([, one]) => one.count > 0 || one.drops[0] > 0 || one.drops[1] > 0)
    .sort((a, b) => a[0] - b[0])
    .map(([number, one]) => [number, one.count, one.drops[0], one.drops[1]])
}

/** The list a save holds. */
export function defeatedRestored(
  kept: readonly (readonly [number, number, number, number])[] | undefined,
): DefeatedList {
  return new Map(
    (kept ?? []).map(([number, count, a, b]) => [number, { count, drops: [a, b] }] as const),
  )
}
