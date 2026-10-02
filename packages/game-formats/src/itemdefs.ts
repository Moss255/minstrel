import { GameFormatError } from './errors.ts'

/**
 * **The items as the game's code holds them** — `/data/prm/itemdt.gp2/
 * itemdt_<lang>.nat`, one table for every item, which the code looks an item
 * up in (`func_020dedd0`, by its id, `func_020de56c`). Read 2 October 2026
 * (USA code; the European file read beside it).
 *
 * | offset | | |
 * |---|---|---|
 * | `0x00` | `u16` | the record count — 1,423 |
 * | `0x0C` | 32 bytes a record | |
 *
 * A record, as the code reads it:
 *
 * | offset | meaning | evidence |
 * |---|---|---|
 * | `+0x08` bits 0–3 | its **kind**: 0 weapon, 1 shield, 2 armour, 3 legwear, 4 headgear, 5 gloves, 6 footwear, 7 accessory, **8 everyday**, **9 important**; 10–15 not read | kind ≤ 7 is equipment everywhere (`func_0207d300`, `func_0207ccf0`); the worn place by kind, `func_0208358c` |
 * | `+0x08` bit 19 | **used up when used** | `func_020ddb20`, the gate of every path that spends an item |
 * | `+0x08` bit 20 | **kept by its carrier** when everything is put in the bag | `func_ov002_0215a658` |
 * | `+0x08` bit 25 | **goes to the bag**, never to a member, when it is obtained | `func_0207d300` `0x0207d3ac` |
 * | `+0x08` bits 4–8 | 31 on a **skill book** | the battle's grant, `func_ov026_021dc8fc` `0x021dc980` |
 * | `+0x14` | on a skill book, the skill panel it grants while carried | `func_ov026_021dc8fc` `0x021dc9e4` |
 * | `+0x18` | `u16`, its id | `func_020de56c` |
 *
 * The rest is carried as it is.
 */
export interface ItemDef {
  readonly id: number
  readonly kind: number
  readonly usedUp: boolean
  readonly kept: boolean
  readonly toBag: boolean
  /** A skill book, whose {@link panel} its carrier holds while they carry it. */
  readonly book: boolean
  /** On a skill book, the skill panel it grants while carried; otherwise what `+0x14` holds. */
  readonly panel: number
  readonly raw: Uint8Array
}

/** An everyday item's kind, and an important item's. */
export const ITEM_KIND_EVERYDAY = 8
export const ITEM_KIND_IMPORTANT = 9

const HEAD = 0x0c
const RECORD = 32

export function readItemDefs(bytes: Uint8Array): Map<number, ItemDef> {
  if (bytes.length < HEAD)
    throw new GameFormatError(`item defs are ${bytes.length} bytes, shorter than their head`)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint16(0, true)
  if (HEAD + count * RECORD > bytes.length) {
    throw new GameFormatError(
      `item defs name ${count} records, more than ${bytes.length} bytes hold`,
    )
  }
  const out = new Map<number, ItemDef>()
  for (let r = 0; r < count; r++) {
    const at = HEAD + r * RECORD
    const word = view.getUint32(at + 8, true)
    const id = view.getUint16(at + 0x18, true)
    out.set(id, {
      id,
      kind: word & 15,
      usedUp: ((word >>> 19) & 1) === 1,
      kept: ((word >>> 20) & 1) === 1,
      toBag: ((word >>> 25) & 1) === 1,
      book: ((word >>> 4) & 31) === 31,
      panel: view.getUint16(at + 0x14, true),
      raw: bytes.subarray(at, at + RECORD),
    })
  }
  return out
}
