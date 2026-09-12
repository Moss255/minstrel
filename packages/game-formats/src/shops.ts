import { GameFormatError } from './errors.ts'
import { readDataTable } from './table.ts'

/**
 * `/data/bin/menu/shopdata1.bin` — what each shop sells.
 *
 * A tagged data table (see FORMAT.md, "Tagged data tables"): a date string, a
 * version string, one `0x66` record holding 37 — the number of shops — and a
 * `0x67` record for each shop, 22 integers:
 *
 * | value | meaning |
 * |---|---|
 * | 0 | the shop's number, which a talk line's `<SHOP=n>` names — the village shopkeeper's is 32 |
 * | 1 | `unknown_1`: 1 to 5 |
 * | 2–19 | eighteen item ids, 0 for an empty slot |
 * | 20 | the price rate in percent — INFERRED: 100 on 36 shops and 500 on one |
 * | 21 | the kind of shop — INFERRED: 0 on every shop of weapons only, 1 on armour, 2 on tools and accessories, 3 to 5 on a mix |
 *
 * See FORMAT.md, "Shops".
 */

export const SHOP_TAG = 0x67
const SHOP_VALUES = 22
/** Item slots in a shop's record. */
export const SHOP_SLOTS = 18

export interface Shop {
  readonly id: number
  readonly unknown_1: number
  /** What it sells, in the record's order, empty slots left out. */
  readonly items: readonly number[]
  readonly rate: number
  readonly kind: number
}

/** Parse the shop table. */
export function readShops(bytes: Uint8Array): Shop[] {
  return readDataTable(bytes)
    .withTag(SHOP_TAG)
    .map((record) => {
      if (record.values.length !== SHOP_VALUES || record.kinds.some((kind) => kind !== 1)) {
        throw new GameFormatError(
          `shop record at 0x${record.offset.toString(16)} is not ${SHOP_VALUES} integers`,
          record.offset,
        )
      }
      const v = [...record.values]
      return {
        id: v[0] as number,
        unknown_1: v[1] as number,
        items: v.slice(2, 2 + SHOP_SLOTS).filter((id) => id !== 0),
        rate: v[2 + SHOP_SLOTS] as number,
        kind: v[3 + SHOP_SLOTS] as number,
      }
    })
}
