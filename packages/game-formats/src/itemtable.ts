import { GameFormatError } from './errors.ts'

/**
 * An item table, `/data/prm/itemdt_<c>.gp2/itemdt_<c>_<lang>.nat` — one per
 * category: `w` weapons, `s` shields, `h` helms, `b` body, `a` gloves, `u`
 * legwear, `l` footwear, `d` accessories, `t` tools. See FORMAT.md, "Items".
 *
 * A 32-byte head, whose first `u16` is the record count, then 32-byte records:
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `0x00` | `u16` ×2 | what using it does, as two action numbers — in the field and in battle, INFERRED; 252 for nothing. See below |
 * | `0x04` | `u16` | the item's id, as the item names and the treasure use it |
 * | `0x06` | `u16` | its price — INFERRED: every one of the 330 items a shop sells has one above 0, and none of the 140 at 0 is sold anywhere |
 * | `0x08` | `u16` | `unknown_0x08`: `0xFFFF` on most, `0xFFFC` and 0 on others |
 * | `0x0A` | 22 bytes | `unknown_0x0a`, carried as they are |
 *
 * **A record begins four bytes before its id.** Read from the id, each
 * record's last four bytes held the next item's actions: the medicinal herb's
 * ended (256, 256), strong medicine's number, and the head's own last four were
 * (255, 255), the herb's.
 *
 * **The actions** are numbers in the action table (`readActions`). 36 of the
 * 234 tools name one called what they are — the herb 255 in both, holy water
 * 259 and 260, the chimaera wing 261 — and 179 name 252, which has no name, as
 * almost all the equipment does. Which is which, INFERRED: the chimaera wing,
 * the Evac-u-bell and the nine seeds, which the series uses only outside
 * battle, have 252 second; the swords and shields that do something when used
 * have 252 first and an action second. The skill books name actions that are
 * not theirs, and are not read.
 *
 * **What equipment does is not here.** No field climbs with the price as a
 * weapon's attack or a shield's defence would, and no other file on the
 * cartridge — the code included — holds the weapons' ids at a fixed spacing
 * beside numbers that do. Where attack and defence are kept is not established.
 */

export const ITEM_TABLE_HEAD = 0x20
export const ITEM_RECORD_SIZE = 32
/** The action number that does nothing: what almost every piece of equipment names. */
export const NO_ACTION = 252

export interface ItemRecord {
  readonly id: number
  readonly price: number
  /** What using it does: an action number in the field, then in battle — INFERRED; 252 for nothing. */
  readonly actions: readonly [field: number, battle: number]
  readonly unknown_0x08: number
  readonly unknown_0x0a: Uint8Array
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
      actions: [view.getUint16(at, true), view.getUint16(at + 2, true)],
      id: view.getUint16(at + 4, true),
      price: view.getUint16(at + 6, true),
      unknown_0x08: view.getUint16(at + 8, true),
      unknown_0x0a: bytes.subarray(at + 0x0a, at + ITEM_RECORD_SIZE),
    })
  }
  return records
}
