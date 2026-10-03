import { GameFormatError } from './errors.ts'

/**
 * `/data/prm/itembtlprm.nat` — what a worn thing does in a battle, the
 * resistances among it. See FORMAT.md, "What equipment does in a battle".
 *
 * A `u32` count — its low 12 bits, as the game masks it (`func_0209a088`,
 * `0x0209a0b0`) — and then that many 44-byte records, in
 * order of the item they belong to. `readItemBattleParams` reads them.
 *
 * **How the game uses it** (`func_ov017_021b3780`, overlay 17): for each of
 * the eight equipment places it keeps battle numbers for, it looks the worn
 * item's id up here and copies the whole record into the character's own
 * block; the stat recompute (`func_02083e28`) then sums the twenty signed
 * bytes at `+0x14` over the eight, onto a hundred, held at nothing below, and
 * that is what the battle copies into the fighter's resistances.
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `u32` | **flags**, which the game's accessors test a bit at a time. Bit 16 is the wearer's **experience ×1.05** — see {@link ITEM_EXPERIENCE_BONUS} |
 * | `+0x14` | `i8` ×20 | **what it adds to a resistance**, one an element — see {@link RESISTANCE_ELEMENTS} |
 * | `+0x28` | `i16` | the item's id, as the item tables give it; the records are in its order, which is how the game finds one |
 * | the rest | | carried, not read: the flags' other bits, and a run at `+0x08` that 1,178 of the records carry |
 */

/**
 * **Bit 16 of a record's flags: its wearer's share of a battle's experience
 * is multiplied by 1.05** — read 3 October 2026. `func_0208538c` walks the
 * eight worn places the battle keeps (pairs at `0x020e8b6c`), and for each
 * with an item tests this bit of the record copied into the character
 * (`record+0x2f4+entry×0x2c`, from overlay 17's `func_ov017_021b3780`); the
 * share (`func_ov023_021f4098`, `0x021f43a0`) multiplies by `1.05f` once if
 * any does. Of the 1,423 records, only the elevating shoes' carry it.
 */
export const ITEM_EXPERIENCE_BONUS = 1 << 16

/** The head, a `u32` whose low 12 bits are the count. */
const HEAD = 4
const RECORD = 0x2c
const DELTAS = 20

/**
 * Which element each of the twenty bytes at `+0x14` belongs to, in order —
 * the elements `GetResistance` numbers, 1 to 21.
 *
 * **8 and 22 are not among them**: the game's loop writes the eighth byte to
 * the ninth element's place and never touches the twenty-second, so the plain
 * attack's element — 8, which every monster takes whole — cannot be resisted
 * by anything worn.
 */
export const RESISTANCE_ELEMENTS = [
  1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
] as const

/** How many elements a fighter's resistances cover — see `readMonsterBattle`. */
export const RESISTANCE_COUNT = 22

/** What one worn thing does in a battle. */
export interface ItemBattleParams {
  /** The item's id, `+0x28`. */
  readonly id: number
  /** Its flags, `+0x00` — see {@link ITEM_EXPERIENCE_BONUS}. */
  readonly flags: number
  /** The twenty signed numbers it adds to a resistance, in {@link RESISTANCE_ELEMENTS}' order. */
  readonly resistances: readonly number[]
  /** The whole record, for what is not read. */
  readonly raw: Uint8Array
}

/** Parse `itembtlprm.nat`. */
export function readItemBattleParams(bytes: Uint8Array): ItemBattleParams[] {
  if (bytes.length < HEAD) {
    throw new GameFormatError(
      `item battle parameters are ${bytes.length} bytes, shorter than the head`,
    )
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint32(0, true) & 0xfff
  if (HEAD + count * RECORD > bytes.length) {
    throw new GameFormatError(`${count} item battle records run past the end`, 0)
  }
  const out: ItemBattleParams[] = []
  for (let r = 0; r < count; r++) {
    const at = HEAD + r * RECORD
    const resistances: number[] = []
    for (let i = 0; i < DELTAS; i++) resistances.push(view.getInt8(at + 0x14 + i))
    out.push({
      id: view.getInt16(at + 0x28, true),
      flags: view.getUint32(at, true),
      resistances,
      raw: bytes.subarray(at, at + RECORD),
    })
  }
  return out
}

/**
 * What a fighter takes of each element, from what they wear — the game's sum
 * (`func_02083e28`): a hundred each, every worn thing's numbers added on, and
 * nothing below nothing. The answer is 22 bytes, as a monster's record holds.
 */
export function wornResistances(worn: Iterable<readonly number[]>): number[] {
  const out = Array.from({ length: RESISTANCE_COUNT }, () => 100)
  for (const deltas of worn) {
    for (const [i, element] of RESISTANCE_ELEMENTS.entries()) {
      const delta = deltas[i]
      if (delta !== undefined) out[element - 1] = (out[element - 1] as number) + delta
    }
  }
  return out.map((value) => Math.max(0, value))
}
