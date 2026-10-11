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

/** One row of a Records table, as it is shown. */
export interface RecordsRow {
  /** Its number in the list: a monster's own, an item's list number. */
  readonly number: number
  /** Its name, once known; undefined before. */
  readonly name: string | undefined
  /** How many have been defeated, for a monster. */
  readonly count?: number
  /** Times its two drops have dropped, for a monster. */
  readonly drops?: readonly [number, number]
  /** The item, for an item's row. */
  readonly item?: number
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
): RecordsRow[] {
  const rows: RecordsRow[] = []
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
  return byName(rows)
}

/** Those known, by name. **Ours**: the order by name leaves out those not known, and sorts as the browser compares. */
const byName = (rows: readonly RecordsRow[]) =>
  rows
    .filter((row) => row.name !== undefined)
    .sort((a, b) => (a.name as string).localeCompare(b.name as string))

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

/**
 * **The Wardrobe and the Item List** — read 11 October 2026. Every item has a
 * list number, `itemdt` `+0x0C` bits 12–22 (`ItemDef.listNumber`): the 944
 * pieces of equipment 1 to 944, then the everyday and the important items to
 * 1,176. **Game-wide flag `0xc76 +` it is set the first time the item is
 * obtained** (`func_0207cc18`, which every way of obtaining one calls) and,
 * for equipment, worn (`func_0206e424`); the first time, a count in the
 * records goes up — the equipment's at `+0x14` bits 18–28 (to 1,500), the
 * items' at bits 9–17 (to 500). So the Wardrobe is the equipment found and
 * the Item List the items: INFERRED from the counts and the completions'
 * names, `str_jr` 131 and 132.
 *
 * **Ours**: the two orders, the list number (which rises with `itemsort`'s
 * order by type on every item) and by name, and what the lists show of an
 * item — its name, and for equipment its numbers; the game's "Found In" and
 * "Dropped By" are not read.
 */
export type ItemTable = 'wardrobe' | 'items'

/** An item's table: equipment the Wardrobe's, everyday and important items the Item List's. */
export const tableOfKind = (kind: number): ItemTable | undefined =>
  kind <= 7 ? 'wardrobe' : kind === 8 || kind === 9 ? 'items' : undefined

/** A table's rows: every item of it by list number, the unfound without a name; or the found by name. */
export function itemRows(
  defs: ReadonlyMap<number, { readonly kind: number; readonly listNumber: number }>,
  table: ItemTable,
  found: (listNumber: number) => boolean,
  nameOf: (id: number) => string,
  order: 'number' | 'name',
): RecordsRow[] {
  const rows: RecordsRow[] = []
  for (const [id, def] of defs) {
    if (def.listNumber === 0 || tableOfKind(def.kind) !== table) continue
    rows.push({
      number: def.listNumber,
      name: found(def.listNumber) ? nameOf(id) : undefined,
      item: id,
    })
  }
  rows.sort((a, b) => a.number - b.number)
  return order === 'number' ? rows : byName(rows)
}
