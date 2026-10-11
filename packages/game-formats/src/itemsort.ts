import { GameFormatError } from './errors.ts'
import { readDataTable } from './table.ts'

/**
 * `itemsort_<lang>.bin` — each item's kind: a tagged table (see `table.ts`)
 * of one record a item, tag `0x67`, five integers:
 *
 * | value | meaning |
 * |---|---|
 * | 0 | the item's id |
 * | 1 | `byType` — **the bag's order by type**, each category a run of its own: the weapons 1 to 268, the shields 269 to 313 and on; 9,999 on the blarney stone alone |
 * | 2 | `byName` — 1 to 1,178, each once: **the bag's order by name**, the English names rising along it at 1,159 of 1,177 steps |
 *
 * Which is which is read from the code (11 October 2026): the record's
 * handler (`func_ov023_021e11ec`) keeps value 1 at an entry's `+0xa` and value
 * 2 at `+0xc`, and the bag's two sorts (`func_ov002_0215b458`) take the least
 * by `+0xa` (`func_ov023_021e18cc`) and by `+0xc` (`func_ov023_021e19ec`),
 * asking `str_tm` 9103 "by type?" and 9104 "by name?".
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
  /** Its place when the bag is sorted by type, category by category. Neither this nor the next follows price. */
  readonly byType: number
  /** Its place when the bag is sorted by name. */
  readonly byName: number
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
    const [id, byType, byName, category, subtype] = [...record.values] as number[]
    kinds.set(id as number, {
      category: category as number,
      subtype: subtype as number,
      byType: byType as number,
      byName: byName as number,
    })
  }
  if (kinds.size === 0) throw new GameFormatError('no item kind records')
  return kinds
}
