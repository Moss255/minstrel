import { type Bag, drop, take } from './bag.ts'

/**
 * What the Hero wears: one item to a slot, each slot taking one item table's
 * category (FORMAT.md, "Items").
 *
 * **Equipment changes no numbers yet.** Where an item's attack and defence are
 * kept is not established — see `readItemTable` — so wearing something takes
 * it out of the bag and puts it on, and that is all. Who may wear what, by
 * vocation, is not read either: anything of the slot's category goes.
 */

export type Slot = 'weapon' | 'shield' | 'head' | 'body' | 'arms' | 'legs' | 'feet' | 'accessory'

/** The slots in the order the equip panel lists them, with the item table each takes. */
export const SLOTS: readonly {
  readonly slot: Slot
  readonly label: string
  readonly table: string
}[] = [
  { slot: 'weapon', label: 'Weapon', table: 'w' },
  { slot: 'shield', label: 'Shield', table: 's' },
  { slot: 'head', label: 'Head', table: 'h' },
  { slot: 'body', label: 'Body', table: 'b' },
  { slot: 'arms', label: 'Arms', table: 'a' },
  { slot: 'legs', label: 'Legs', table: 'u' },
  { slot: 'feet', label: 'Feet', table: 'l' },
  { slot: 'accessory', label: 'Accessory', table: 'd' },
]

export type Equipped = ReadonlyMap<Slot, number>

export const NOTHING_EQUIPPED: Equipped = new Map()

/** The slot an item goes in, by the table it is listed in; undefined for what is not worn. */
export function slotOf(table: string | undefined): Slot | undefined {
  return SLOTS.find((s) => s.table === table)?.slot
}

/**
 * What can go in a slot: nothing, to take off what is there, then each item in
 * the bag of the slot's category, in the bag's order.
 */
export function choicesFor(
  slot: Slot,
  bag: Bag,
  tableOf: (id: number) => string | undefined,
): (number | undefined)[] {
  return [undefined, ...[...bag.items.keys()].filter((id) => slotOf(tableOf(id)) === slot)]
}

/**
 * Put an item on, from the bag, or take off what is worn with `undefined`.
 * What was in the slot goes back into the bag. Undefined when the bag has no
 * such item to put on.
 */
export function equip(
  bag: Bag,
  equipped: Equipped,
  slot: Slot,
  item: number | undefined,
): { bag: Bag; equipped: Equipped } | undefined {
  let after = bag
  if (item !== undefined) {
    const taken = drop(after, item)
    if (!taken) return undefined
    after = taken
  }
  const worn = equipped.get(slot)
  if (worn !== undefined) after = take(after, { item: worn })
  const next = new Map(equipped)
  if (item === undefined) next.delete(slot)
  else next.set(slot, item)
  return { bag: after, equipped: next }
}
