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
 * | `0x06` | `u16` | **what a shop gives for it** — its selling price; 0 on 140 items, which no shop will buy. See {@link ItemRecord.price} |
 * | `0x08` | `u16` | **what a shop asks for it**: the price itself, or `0xFFFF` to `0xFFFC` for one made from the selling price — see {@link itemPrice} |
 * | `0x15`, bits 1–3 | | **rarity**, the equipment screen's stars, 0 to 5 — INFERRED, see {@link ItemRecord.rarity} |
 * | `0x0A` | 22 bytes | `unknown_0x0a`, carried as they are, the rarity's byte among them |
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
 * **What equipment does is not in its record** — no field of it climbs with
 * the price as attack or defence would — but in the table after the records:
 * see `itemstats.ts`. That table's first entry shares its 32 bytes with the
 * last record, so the last record's `buy` and `unknown_0x0a` are that
 * entry's bytes, not the record's own.
 */

export const ITEM_TABLE_HEAD = 0x20
export const ITEM_RECORD_SIZE = 32
/** The action number that does nothing: what almost every piece of equipment names. */
export const NO_ACTION = 252

export interface ItemRecord {
  readonly id: number
  /**
   * What a shop gives for it: its selling price, `+0x06`. From a published
   * guide's item lists, which give a buying and a selling price for each: the
   * bamboo lance sells for 8 and the halberd for 6,600, the words here, where
   * half what a shop asks would be 42 and 5,600; the copper sword for 15, a
   * tenth of its 150. Items no shop sells have one too: the star's suit
   * 11,750, the stud poker 24,000. 0 on 140 items, the quest pieces and the
   * celestial suit among them.
   */
  readonly price: number
  /** What using it does: an action number in the field, then in battle — INFERRED; 252 for nothing. */
  readonly actions: readonly [field: number, battle: number]
  /** What a shop asks for it, or how to make that from {@link price}: `+0x08` — see {@link itemPrice}. */
  readonly buy: number
  /**
   * The rarity, 0 to 5: the stars the equipment screen shows. INFERRED, from
   * bits 1–3 of the byte at `0x15`: the copper sword and the flame shield
   * carry 1, as two captures of the screen show one star for each; the tools
   * carry 0 or 1 and show none; of the 268 weapons, 120 carry 1 and the 12
   * that cost 30,000 G carry 5, with the tiers between in price order — the
   * rank correlation with price is 0.67 — and the rusty sword and shield,
   * the legendary bases, 4. The byte's other bits are not read.
   */
  readonly rarity: number
  readonly unknown_0x0a: Uint8Array
}

/**
 * What an item costs in a shop at its full rate, from `+0x08`: the price itself,
 * or one of four codes that make it from the selling price, `+0x06`.
 *
 * | `+0x08` | costs | the village shop's |
 * |---|---|---|
 * | `0xFFFF` | twice the selling price | 11 of 11 |
 * | `0xFFFE` | twice, and one | 2 of 2: the chimaera wing, 25; the bandana, 45 |
 * | `0xFFFD` | twice, less one | the leather whip, 95 |
 * | `0xFFFC` | ten times | 4 of 4: the copper sword, 150 |
 * | anything else | itself | — the bamboo lance, 85, and the halberd, 11,200, in the guide |
 *
 * The four codes were INFERRED from what a let's play of the European release
 * shows the village shop asking for all 18 of its items, and a published
 * guide's table of the same shop (printed page 57) gives the same 18. The last
 * row is the guide's: of the 330 items shops sell, the two with another value
 * there are the bamboo lance, `0x55`, and the halberd, `0x2BC0` — 85 and
 * 11,200, as the guide's item lists price them — and the guide gives their
 * selling prices, 8 and 6,600, as the words at `+0x06`. So `+0x06` is what a
 * shop gives and `+0x08` what it asks. 0 is on some items no shop sells, and
 * is taken as twice, as most are: **ours**, with nothing riding on it.
 */
export function itemPrice(record: Pick<ItemRecord, 'price' | 'buy'>): number {
  switch (record.buy) {
    case 0:
    case 0xffff:
      return record.price * 2
    case 0xfffe:
      return record.price * 2 + 1
    case 0xfffd:
      return record.price * 2 - 1
    case 0xfffc:
      return record.price * 10
    default:
      return record.buy
  }
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
      rarity: ((bytes[at + 0x15] as number) >> 1) & 7,
      buy: view.getUint16(at + 8, true),
      unknown_0x0a: bytes.subarray(at + 0x0a, at + ITEM_RECORD_SIZE),
    })
  }
  return records
}
