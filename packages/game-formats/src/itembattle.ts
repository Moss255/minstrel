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
 * | `+0x08`–`+0x13` | 6-bit fields | **a weapon's killer bonus by monster family**, in tenths — see {@link FAMILY_BONUS_FIELDS} |
 * | `+0x14` | `i8` ×20 | **what it adds to a resistance**, one an element — see {@link RESISTANCE_ELEMENTS} |
 * | `+0x28` | `i16` | the item's id, as the item tables give it; the records are in its order, which is how the game finds one |
 * | the rest | | carried, not read: the flags' other bits |
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

/**
 * **Where each monster family's killer bonus sits** in a record — read 6
 * October 2026 (task 17b) from the twelve accessors the party's damage
 * forecast calls (`func_ov024_021fa7ec`, `0x021faa20`–`0x021fac98`): for
 * family *n*, 1 to 12, it asks `func_ov000_02156068(battle, target, n, 0)` —
 * the target a monster whose `mon_data +0x0A` bits 7–10 are *n* — and then
 * multiplies by the worn weapon's field over `10.0f`. Each accessor reads the
 * record copied into the character at `+0x2f4` (`func_02085968`, `02085818`,
 * `02085a10`, `02085a48`, `020859d8`, `020859a0`, `02085930`, `02085850`,
 * `020858f8`, `02085a80`, `020858c0`, `02085888`, in family order) and gives
 * 1.0 with no weapon. Each entry is (the word's offset, the field's low bit);
 * a field is six bits, signed.
 *
 * On the cartridge 928 records hold 10 in all twelve — no bonus — and 245
 * hold nothing, which are the 245 the run at `+0x08` was seen empty on; the
 * rest hold 11 or 12 for one or two families.
 */
export const FAMILY_BONUS_FIELDS: readonly (readonly [number, number])[] = [
  [0x0c, 6],
  [0x08, 0],
  [0x0c, 24],
  [0x10, 0],
  [0x0c, 18],
  [0x0c, 12],
  [0x0c, 0],
  [0x08, 6],
  [0x08, 24],
  [0x10, 6],
  [0x08, 18],
  [0x08, 12],
]

/**
 * **A weapon's element**: bits 23–25 of the flags (`func_02085748`), which
 * the party's AI turns into the element it asks a target's resistance to
 * (`func_ov024_021f7478`, `0x021f7c98`–`0x021f7ce0`, by the pairs at
 * `0x021fefb0`): 1 to 7 stand for themselves and 0 for 8, the plain Attack's.
 * 23 records on the cartridge carry one, 1 to 5. Which elements those are is
 * the element table's (FORMAT.md, "The elements"); that the field is the
 * weapon's element is INFERRED from that use — nothing else was read using
 * it.
 */
export function weaponElement(flags: number): number {
  const bits = (flags >>> 23) & 7
  return bits === 0 ? 8 : bits
}

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
  /**
   * Its killer bonus against each monster family, 1 to 12 at 0 to 11, in
   * tenths — 10 is none; see {@link FAMILY_BONUS_FIELDS}. Only a weapon's is
   * asked.
   */
  readonly familyTenths: readonly number[]
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
    const familyTenths = FAMILY_BONUS_FIELDS.map(([word, low]) => {
      const field = (view.getUint32(at + word, true) >>> low) & 0x3f
      return field & 0x20 ? field - 0x40 : field
    })
    out.push({
      id: view.getInt16(at + 0x28, true),
      flags: view.getUint32(at, true),
      resistances,
      familyTenths,
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
