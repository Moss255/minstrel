import { GameFormatError } from './errors.ts'
import { type Grammar, readGrammar } from './grammar.ts'

/**
 * The monsters' battle numbers and names: `/data/prm/mon_btldata.nat` and
 * `/data/prm/mon_data.gp2/mon_data_<lang>.nat`. Both open with the head word
 * the monster list does — the record count in its low 12 bits, the strings'
 * size in its upper 20 — and both hold 438 records, one a monster, in the same
 * order: each record's monster number agrees on all 438. See FORMAT.md,
 * "Monster data".
 *
 * **Battle numbers**, 132-byte records. What is read, and on what evidence:
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `u16` | the monster's number, with bit 15 set on all 438 |
 * | `+0x04` | `u16` ×2 | two item ids — its drops, INFERRED: every one names an item |
 * | `+0x08` | `u32` | experience — INFERRED: the metal family's 4,096, 40,200 and 120,040 stand out as the series' own |
 * | `+0x0C` | `u16` | gold — INFERRED: far higher on bosses and the chest monsters |
 * | `+0x18` | `u16` ×6 | six action words, not established |
 * | `+0x5C` | `u16` | maximum HP — INFERRED: a median of 6,500 on the bosses against 134, and the metal slime's 4 |
 * | `+0x5E` | `u16` | maximum MP — INFERRED: 255 on most bosses and the metal family |
 * | `+0x60` | `u16` | attack — INFERRED, by order |
 * | `+0x62` | `u16` | defence — INFERRED: the metal family's 256 and 512 |
 * | `+0x64` | `u16` | agility — INFERRED, by order |
 * | `+0x6C` | `u8` ×22 | **resistances**, a hundredth each, one an element — from the game's code |
 * | `+0x82` | `u8` ×2 | copied along with them, not established; 0 on every monster looked at |
 *
 * **The five numbers from `+0x5C` and the resistances are no longer only
 * INFERRED.** The game builds a monster's battle status from this record at
 * `+0x2C` (`func_02089630`, called at overlay 0 `0x0215eed0`), reading HP at
 * that block's `+0x30`, MP `+0x32`, three more `u16`s to `+0x38`, and copying
 * 24 bytes from its `+0x40` — which are this record's `+0x5C` to `+0x64` and
 * `+0x6C`. See FORMAT.md, "Monster data", "Resistances".
 *
 * The rest of each record is carried as it is.
 */

const HEAD = 4
const BATTLE_RECORD = 132
const DATA_RECORD = 28

export interface MonsterBattle {
  readonly number: number
  readonly drops: readonly [number, number]
  readonly exp: number
  readonly gold: number
  readonly actions: readonly number[]
  readonly maxHp: number
  readonly maxMp: number
  readonly attack: number
  readonly defence: number
  readonly agility: number
  /**
   * What it takes of each of the game's 21 elements, in hundredths — index
   * `element − 1`; 22 bytes, the last not reached by any element. 100 is
   * whole, 0 immune, 125 a quarter more. The battle's `func_ov000_02156b38`
   * reads the byte for an action's element and divides by `100.0f`: a spell's
   * damage is multiplied by it, a change of state's accuracy likewise, and
   * what rides on a blow lands under its chance times it.
   *
   * From the actions that carry them: 1 fire (Frizz), 2 ice (Crack), 3 wind
   * (Woosh), 4 blast (Bang), 6 dark (Zam), **8 the plain Attack's**, 9 Dazzle,
   * 10 sleep, 13 Fuddle, 16 poison, 19 defence down (Kasap), 20 agility down.
   * 18 is attack down, from its rider's handler. The rest INFERRED or unknown.
   */
  readonly resistances: readonly number[]
  /**
   * Whether it fights as a boss does: bit 4 of the byte at `+0x27`. INFERRED
   * from where it is set: on 144 of the 159 boss-coded monsters and on the
   * five grotto bosses that carry ordinary codes (Equinox, Atlas, Shogum,
   * Trauminator, Nemean), and clear on the bosses' minions (scarlet fever,
   * octagoon, cannibelle …) and every other ordinary monster. The reference
   * battle emulator draws its own boss's ways, Ragin' Contagion's, by the
   * falling weight table and every other monster's by the even one; this bit
   * is set on it. See FORMAT.md, "Battle weight tables".
   */
  readonly bossAi: boolean
  /** The whole record, for what is not read. */
  readonly raw: Uint8Array
}

/**
 * A monster's names. **Names**, 28-byte records:
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `u32` | the name's offset from the strings |
 * | `+0x04` | `u32` | the code's |
 * | `+0x08` | `u16` | the monster's number |
 * | `+0x0A` | 10 bytes | not established |
 * | `+0x14` | `u32` | the plural's offset — `slimes`; a string's start on all 438 in all five languages |
 * | `+0x18` | `u32` | its grammar: articles and gender, see `readGrammar` |
 */
export interface MonsterName {
  readonly number: number
  readonly name: string
  readonly plural: string
  readonly code: string
  /** Its articles and gender — see `readGrammar`. */
  readonly grammar: Grammar
  /** The record from `+0x0A` to the plural, not established. */
  readonly unknown_0x0a: Uint8Array
}

function head(bytes: Uint8Array, record: number, what: string) {
  if (bytes.length < HEAD)
    throw new GameFormatError(`${what} is ${bytes.length} bytes, shorter than its head`)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const word = view.getUint32(0, true)
  const count = word & 0xfff
  const size = word >>> 12
  const strings = HEAD + count * record
  if (strings + size !== bytes.length) {
    throw new GameFormatError(
      `${what} says ${count} records and ${size} bytes of strings, which is not its ${bytes.length} bytes`,
      0,
    )
  }
  return { view, count, strings }
}

/** Parse the monsters' battle numbers. */
export function readMonsterBattle(bytes: Uint8Array): MonsterBattle[] {
  const { view, count } = head(bytes, BATTLE_RECORD, 'monster battle data')
  const out: MonsterBattle[] = []
  for (let r = 0; r < count; r++) {
    const at = HEAD + r * BATTLE_RECORD
    const u16 = (offset: number) => view.getUint16(at + offset, true)
    out.push({
      number: u16(0) & 0x7fff,
      drops: [u16(4), u16(6)],
      exp: view.getUint32(at + 8, true),
      gold: u16(12),
      actions: [0, 1, 2, 3, 4, 5].map((i) => u16(0x18 + i * 2)),
      maxHp: u16(0x5c),
      maxMp: u16(0x5e),
      attack: u16(0x60),
      defence: u16(0x62),
      agility: u16(0x64),
      resistances: [...bytes.subarray(at + 0x6c, at + 0x6c + 22)],
      bossAi: ((bytes[at + 0x27] as number) & 0x10) !== 0,
      raw: bytes.subarray(at, at + BATTLE_RECORD),
    })
  }
  return out
}

/** Parse the monsters' names: each one's number, name, plural, code and grammar. */
export function readMonsterNames(bytes: Uint8Array): MonsterName[] {
  const { view, count, strings } = head(bytes, DATA_RECORD, 'monster names')
  const text = (offset: number, at: number): string => {
    const start = strings + offset
    if (start >= bytes.length || (offset > 0 && bytes[start - 1] !== 0)) {
      throw new GameFormatError(`offset ${offset} does not start a string`, at)
    }
    let out = ''
    for (let i = start; i < bytes.length && bytes[i] !== 0; i++)
      out += String.fromCharCode(bytes[i] as number)
    return out
  }
  const out: MonsterName[] = []
  for (let r = 0; r < count; r++) {
    const at = HEAD + r * DATA_RECORD
    out.push({
      name: text(view.getUint32(at, true), at),
      code: text(view.getUint32(at + 4, true), at + 4),
      number: view.getUint16(at + 8, true),
      plural: text(view.getUint32(at + 0x14, true), at + 0x14),
      grammar: readGrammar(view.getUint32(at + 0x18, true)),
      unknown_0x0a: bytes.subarray(at + 0x0a, at + 0x14),
    })
  }
  return out
}
