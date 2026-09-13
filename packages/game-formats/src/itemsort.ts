import { GameFormatError } from './errors.ts'
import { readDataTable } from './table.ts'

/**
 * `itemsort_<lang>.bin` — each item's kind: a tagged table (see `table.ts`)
 * of one record a item, tag `0x67`, five integers:
 *
 * | value | meaning |
 * |---|---|
 * | 0 | the item's id |
 * | 1 | `unknown_1` — different for every item, 1 to 9,999 |
 * | 2 | `unknown_2` — 1 to 1,178, each once |
 * | 3 | the category: 0 weapons, 1 shields, 2 armour, 3 legwear, 4 headgear, 5 gloves, 6 footwear, 7 accessories, 8 and 9 tools |
 * | 4 | the subtype: 0 to 11 the weapon kinds, 12 shields, and on through armour, headgear, gloves, footwear, accessories and tools |
 *
 * The evidence is in `FORMAT.md`, "Item kinds".
 */

export const ITEM_KIND_TAG = 0x67
/** Values a kind record holds. */
const VALUES = 5

export interface ItemKind {
  readonly category: number
  readonly subtype: number
  readonly unknown_1: number
  readonly unknown_2: number
}

/** Each item's kind, by id. */
export function readItemKinds(data: Uint8Array): Map<number, ItemKind> {
  const table = readDataTable(data)
  const kinds = new Map<number, ItemKind>()
  for (const record of table.withTag(ITEM_KIND_TAG)) {
    if (record.values.length !== VALUES) {
      throw new GameFormatError(
        `item kind record of ${record.values.length} values, not ${VALUES}`,
        record.offset,
      )
    }
    const [id, unknown_1, unknown_2, category, subtype] = [...record.values] as number[]
    kinds.set(id as number, {
      category: category as number,
      subtype: subtype as number,
      unknown_1: unknown_1 as number,
      unknown_2: unknown_2 as number,
    })
  }
  if (kinds.size === 0) throw new GameFormatError('no item kind records')
  return kinds
}
