/**
 * The bag: the gold and the items the Hero has picked up — M4's inventory, as
 * far as treasure fills it.
 *
 * **Ours, not the game's.** How the game keeps its bag — its size, its order,
 * how many of one thing it holds — is not read; this one keeps a count of each
 * item in the order they were found. It is not saved yet.
 */

export interface Bag {
  readonly gold: number
  /** A count of each item, by id, in the order first found. */
  readonly items: ReadonlyMap<number, number>
}

export const EMPTY_BAG: Bag = { gold: 0, items: new Map() }

/** What a treasure gave: gold, an item, or neither. */
export interface Takings {
  readonly gold?: number
  readonly item?: number
}

/** The bag with a treasure's takings added. */
export function take(bag: Bag, takings: Takings): Bag {
  const items = new Map(bag.items)
  if (takings.item !== undefined) items.set(takings.item, (items.get(takings.item) ?? 0) + 1)
  return { gold: bag.gold + (takings.gold ?? 0), items }
}

/** What the items panel lists: the gold, then each item and how many. */
export function bagLines(bag: Bag, nameOf: (id: number) => string): string[] {
  const lines = [`${bag.gold} gold coin${bag.gold === 1 ? '' : 's'}`]
  if (bag.items.size === 0) lines.push('Nothing in the bag yet — open some treasure.')
  for (const [id, count] of bag.items)
    lines.push(count > 1 ? `${nameOf(id)} ×${count}` : nameOf(id))
  return lines
}
