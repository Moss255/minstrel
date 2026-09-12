import { GameFormatError } from './errors.ts'

/**
 * An item table, `/data/prm/itemdt_<c>.gp2/itemdt_<c>_<lang>.nat` — one per
 * category: `w` weapons, `s` shields, `h` helms, `b` body, `a` gloves, `u`
 * legwear, `l` footwear, `d` accessories, `t` tools. See FORMAT.md, "Items".
 *
 * A 36-byte head, whose first `u16` is the record count, then 32-byte records:
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `0x00` | `u16` | the item's id, as the item names and the treasure use it |
 * | `0x02` | `u16` | its price — INFERRED: every one of the 330 items a shop sells has one above 0, and none of the 140 at 0 is sold anywhere |
 * | `0x04` | `u16` | `unknown_0x04`: `0xFFFF` on most, `0xFFFC` and 0 on others |
 * | `0x06` | 26 bytes | `unknown_0x06`, carried as they are |
 *
 * **What an item does is not here.** No field climbs with the price as a
 * weapon's attack or a shield's defence would, and no other file on the
 * cartridge — the code included — holds the weapons' ids at a fixed spacing
 * beside numbers that do. Where attack and defence are kept is not established.
 */

export const ITEM_TABLE_HEAD = 0x24
export const ITEM_RECORD_SIZE = 32

export interface ItemRecord {
  readonly id: number
  readonly price: number
  readonly unknown_0x04: number
  readonly unknown_0x06: Uint8Array
}

/** Parse one category's item table. */
export function readItemTable(bytes: Uint8Array): ItemRecord[] {
  if (bytes.length < ITEM_TABLE_HEAD) {
    throw new GameFormatError(`item table is ${bytes.length} bytes, shorter than its head`)
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint16(0, true)
  const end = ITEM_TABLE_HEAD + count * ITEM_RECORD_SIZE
  if (end > bytes.length) {
    throw new GameFormatError(`${count} item records run past the end of the table`, 0)
  }
  const records: ItemRecord[] = []
  for (let r = 0; r < count; r++) {
    const at = ITEM_TABLE_HEAD + r * ITEM_RECORD_SIZE
    records.push({
      id: view.getUint16(at, true),
      price: view.getUint16(at + 2, true),
      unknown_0x04: view.getUint16(at + 4, true),
      unknown_0x06: bytes.subarray(at + 6, at + ITEM_RECORD_SIZE),
    })
  }
  return records
}
