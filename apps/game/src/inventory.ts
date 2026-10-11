import { ITEM_KIND_EVERYDAY, type ItemDef } from '@minstrel/game-formats'
import { type Bag, drop, take } from './bag.ts'

/**
 * **Each member's own items, and the party's bag** — as the game keeps them.
 * Read 2 October 2026 (USA): see game-formats' FORMAT.md, "Who carries an
 * item".
 *
 * - A member carries up to **eight** everyday items, one to a slot, kept
 *   packed: a new one takes the first empty slot (`func_02083834`), and one
 *   taken out closes the list up (`func_0208386c`). The character record's
 *   `+0x454`, eight ids.
 * - The party's stores are the Bag (everyday items), the equipment bag and the
 *   important items (`party + 0x000`, `+0x1d4`, `+0xe04`), each id with a count
 *   to 99. **Here they are one `Bag`**, told apart by the item's kind where the
 *   menus show them; their capacities (152, the eight equipment lists', 94)
 *   are not kept — **ours**.
 * - What is worn is neither carried nor in the bag (`Member.outfits`).
 */
export const CARRIED_MOST = 8

/** What the party is, for an item to find a carrier among: each member's carried items, in party order. */
export interface Carriers {
  /** Each member's carried items, packed — the arrays are the members' own and are changed in place. */
  readonly carried: readonly number[][]
  /** Whether a member has fallen — passed over by a monster's drop. */
  readonly fallen?: (member: number) => boolean
  /** Whether a member is one no item is given to — a guest. **Ours**: who that is, is not read. */
  readonly passed?: (member: number) => boolean
}

/** Where an item obtained went: the bag, by count, and each member, by count. */
export interface Obtained {
  readonly bag: Bag
  readonly toBag: number
  readonly toMembers: readonly number[]
}

/**
 * **An item obtained** — the game's `func_0207d300`, which chests, pots and
 * barrels, an event's `114`, alchemy and a monster's drop all go through:
 * equipment and important items to the party's stores; an item marked for the
 * bag (`+0x08` bit 25) to the bag; any other everyday item **one at a time to
 * the first member in party order with a slot free**, then the next, and
 * whatever is left to the bag. A drop passes over the fallen (`skipFallen`).
 * An item with no record goes to the bag.
 */
export function obtain(
  bag: Bag,
  carriers: Carriers,
  def: ItemDef | undefined,
  id: number,
  count = 1,
  skipFallen = false,
): Obtained {
  const toMembers = carriers.carried.map(() => 0)
  let left = count
  if (def && def.kind === ITEM_KIND_EVERYDAY && !def.toBag) {
    for (const [m, list] of carriers.carried.entries()) {
      if (carriers.passed?.(m)) continue
      if (skipFallen && carriers.fallen?.(m)) continue
      while (left > 0 && list.length < CARRIED_MOST) {
        list.push(id)
        toMembers[m] = (toMembers[m] ?? 0) + 1
        left--
      }
      if (left === 0) break
    }
  }
  let after = bag
  for (let i = 0; i < left; i++) after = take(after, { item: id })
  return { bag: after, toBag: left, toMembers }
}

/**
 * **One of an item taken from the party** — `func_02086d88`, as alchemy, an
 * event's `115` and the mini medals take: from the bag first, then each
 * member's carried items in party order. Undefined when nobody has one.
 */
export function takeOne(bag: Bag, carriers: Carriers, id: number): Bag | undefined {
  const fromBag = drop(bag, id)
  if (fromBag) return fromBag
  for (const list of carriers.carried) {
    const at = list.indexOf(id)
    if (at >= 0) {
      list.splice(at, 1)
      return bag
    }
  }
  return undefined
}

/** How many of an item the party has, in the bag and carried. */
export function heldAll(bag: Bag, carriers: Carriers, id: number): number {
  let n = bag.items.get(id) ?? 0
  for (const list of carriers.carried) for (const held of list) if (held === id) n++
  return n
}

/** Whose an item is, in the menus: a member by their place, or the bag. */
export type Owner = number | 'bag'

/**
 * **An item moved** — the field menu's Transfer (`func_ov002_02164748`,
 * `02163bd0`): to an empty row of the receiver's, it is added in their first
 * empty slot; to an occupied row, the two change places — from the bag, the
 * receiver's old item going into the bag; to the bag, one more in the bag.
 * Returns the bag after; the carried lists are changed in place. Undefined
 * when the move cannot be made.
 */
export function transfer(
  bag: Bag,
  carriers: Carriers,
  from: { readonly owner: Owner; readonly slot: number; readonly item: number },
  to: { readonly owner: Owner; readonly slot: number },
): Bag | undefined {
  const giver = from.owner === 'bag' ? undefined : carriers.carried[from.owner]
  const receiver = to.owner === 'bag' ? undefined : carriers.carried[to.owner]
  if (from.owner !== 'bag' && giver?.[from.slot] !== from.item) return undefined
  if (from.owner === 'bag' && !(bag.items.get(from.item) ?? 0)) return undefined
  if (to.owner === 'bag') {
    if (from.owner === 'bag') return bag
    giver?.splice(from.slot, 1)
    return take(bag, { item: from.item })
  }
  if (!receiver) return undefined
  const there = receiver[to.slot]
  if (there === undefined) {
    // An empty row: taken from the giver, put in the receiver's first empty slot.
    if (receiver.length >= CARRIED_MOST && receiver !== giver) return undefined
    if (giver) giver.splice(from.slot, 1)
    const after = from.owner === 'bag' ? (drop(bag, from.item) ?? bag) : bag
    receiver.push(from.item)
    return after
  }
  // An occupied row: the two change places.
  if (giver) {
    giver[from.slot] = there
    receiver[to.slot] = from.item
    return bag
  }
  const after = take(drop(bag, from.item) ?? bag, { item: there })
  receiver[to.slot] = from.item
  return after
}

/** An item taken out of a member's slot, the list closing up (`func_0208386c`). */
export function removeSlot(list: number[], slot: number): void {
  if (slot >= 0 && slot < list.length) list.splice(slot, 1)
}

/**
 * **Organise Items: everything put in the bag** — `func_ov002_0215a658`,
 * read 11 October 2026: for the member at `who`, or everyone (`'all'`, the
 * game's 4), each carried item goes into the bag, but one whose record keeps
 * it with its carrier (`+0x08` bit 20, `ItemDef.kept`), which stays and is
 * packed to the front. The words are `str_tm` 9101, "Put all of …'s
 * unimportant unequipped items in the bag?", and 9102 when it is done.
 *
 * Not modelled: item `0x570a`, when its carrier has it in use
 * (`func_02083994`), is first put out of use (`func_ov017_021c9e00`) — what
 * that item does in use is not read. Returns the bag after; the carried lists
 * are changed in place.
 */
export function organise(
  bag: Bag,
  carriers: Carriers,
  who: number | 'all',
  kept: (id: number) => boolean,
): Bag {
  let after = bag
  for (const [m, list] of carriers.carried.entries()) {
    if (who !== 'all' && who !== m) continue
    const staying: number[] = []
    for (const id of list) {
      if (kept(id)) staying.push(id)
      else after = take(after, { item: id })
    }
    list.splice(0, list.length, ...staying)
  }
  return after
}

/** Which order the bag is put in — see {@link sortBag}. */
export type BagSort = 'type' | 'name'

/**
 * **The bag's everyday items sorted** — the SELECT Button on the Bag's row
 * (`func_ov002_0215b458`, read 11 October 2026): by type, by `itemsort`'s
 * first order (`func_ov023_021e18cc`, the entry's `+0xa`), or by name, its
 * second (`func_ov023_021e19ec`, `+0xc`) — `ItemKind.byType` and
 * `byName`, which the record's handler (`func_ov023_021e11ec`) puts
 * there. The two take turns, by type first; the words are `str_tm` 9103
 * or 9104 to ask, 9105 when done.
 *
 * Only the everyday items are reordered; equipment and the important items
 * keep their order after them, which is **ours** — they are separate stores
 * in the game (see above), with a sort of their own on the equipment's side.
 * An item `itemsort` has no place for goes last.
 */
export function sortBag(
  bag: Bag,
  everyday: (id: number) => boolean,
  keyOf: (id: number) => number | undefined,
): Bag {
  const ids = [...bag.items.keys()]
  const sorted = ids
    .filter(everyday)
    .sort((a, b) => (keyOf(a) ?? Number.MAX_SAFE_INTEGER) - (keyOf(b) ?? Number.MAX_SAFE_INTEGER))
  const rest = ids.filter((id) => !everyday(id))
  return {
    ...bag,
    items: new Map([...sorted, ...rest].map((id) => [id, bag.items.get(id) ?? 0])),
  }
}
