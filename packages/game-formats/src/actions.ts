import { GameFormatError } from './errors.ts'

/**
 * Actions — what a fighter or an item does: the attack, the spells, the
 * abilities, the monsters' moves and every usable item's effect. The table is
 * in two halves, `/data/prm/actdt_a.gp2/actdt_a_<lang>.nat` (63 actions: the
 * spells, the healing items) and `actdt_b.gp2/actdt_b_<lang>.nat` (618: the
 * attack, the monsters' moves and the rest), and beside each half is the table
 * of ranges its actions draw from, `actdamage_a.nat` and `actdamage_b.nat`.
 * Both archives' members are stored whole — see the l5-gpc FORMAT.md. See
 * FORMAT.md, "Actions".
 *
 * **An action table** opens with the head word the system strings share — the
 * record count in the low 12 bits, the strings' size in the upper 20 — then
 * 60-byte records, then the strings.
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `u32` | the name's offset from the strings, on every record |
 * | `+0x04` | bits 0–9 | the action's number, the one `actname.nat` names it by — Heal 30, the medicinal herb 255; no two alike in a table |
 * | `+0x08` | bits 14–21 | its range, an index into the range table beside it, or 0 for none — **every one is there**, 37 in `_a` and 117 in `_b`, and every range is some action's |
 * | `+0x24` | `u8` | what it does, INFERRED — see {@link ActionEffect} |
 * | `+0x34` | `u32` | the plural's offset — `medicinal herbs` |
 *
 * The rest of each record is carried as it is.
 *
 * **A range table** opens with a word holding its record count, then 8-byte
 * records:
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `u8` | the range's index |
 * | `+0x01` | `u8` | spread: how far either side of the base the value drawn may fall — INFERRED: Heal's is 5, and the reference draws Heal as `FUN_021e8458_typeD(5, 35)`, 35 ± 5 |
 * | `+0x02` | `u16` | 0 on every record |
 * | `+0x04` | bits 0–9 | base, INFERRED: Heal 35, Midheal 85, Moreheal 185 — the reference's own bases for the three |
 * | `+0x04` | bits 10–19 | not established — equal to the base on 78 of 124 |
 * | `+0x04` | bits 20–29 | peak, INFERRED: the base at magical mending 999 — the reference's Midheal, 85 + (mending − 100) × 0.2392, and Moreheal, 185 + (mending − 200) × 0.5194, come to 300 and 600 there, and those are theirs |
 * | `+0x04` | bits 30–31 | 0 on every record |
 *
 * The reference is DQIX/BattleEmulator (MIT, © 2024 DaisukeDaisuke).
 */

const HEAD = 4
const ACTION_RECORD = 60
const RANGE_RECORD = 8

/**
 * What an action does, by the byte at `+0x24` — the values whose meaning the
 * table itself shows. INFERRED, each by the actions that carry it and no
 * others in the field half (`_a`):
 *
 * - `0x16` restores HP: Heal, Midheal, Moreheal, Fullheal, Multiheal,
 *   Omniheal, Meditation, the medicinal herb, the medicines, the antidotes that
 *   also heal, the panaceas, Yggdrasil dew and the foods — and the monsters'
 *   own medicinal herb in `_b`;
 * - `0x6A` restores MP: magic water, sage's elixir, elfin elixir;
 * - `0x54` cures poison: the antidotal herb, Squelch;
 * - `0x20` brings back the fallen: Zing, Kazing, the Yggdrasil leaf;
 * - `0x00` the seeds, which raise a number for good.
 *
 * Other values are carried as they are.
 */
export const ActionEffect = {
  RestoresHp: 0x16,
  RestoresMp: 0x6a,
  CuresPoison: 0x54,
  Revives: 0x20,
} as const

export interface Action {
  /** Its number, as `actname.nat` and the item tables name it. */
  readonly id: number
  readonly name: string
  readonly plural: string
  /** Its range's index in the range table beside it; 0 for none. */
  readonly range: number
  /** What it does — see {@link ActionEffect}. INFERRED. */
  readonly effect: number
  /** The whole record, for what is not read. */
  readonly raw: Uint8Array
}

export interface ActionRange {
  readonly index: number
  /** How far either side of the base the value drawn may fall. INFERRED. */
  readonly spread: number
  /** INFERRED — see above. */
  readonly base: number
  /** Bits 10 to 19 of the packed word, not established. */
  readonly unknown_bits10: number
  /** The base at the top of its scale, INFERRED — see above. */
  readonly peak: number
}

/** Parse one half of the action table. */
export function readActions(bytes: Uint8Array): Action[] {
  if (bytes.length < HEAD) {
    throw new GameFormatError(`action table is ${bytes.length} bytes, shorter than its head`)
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const word = view.getUint32(0, true)
  const count = word & 0xfff
  const size = word >>> 12
  const strings = HEAD + count * ACTION_RECORD
  if (strings + size !== bytes.length) {
    throw new GameFormatError(
      `action table says ${count} records and ${size} bytes of strings, which is not its ${bytes.length} bytes`,
      0,
    )
  }
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
  const out: Action[] = []
  for (let r = 0; r < count; r++) {
    const at = HEAD + r * ACTION_RECORD
    out.push({
      id: view.getUint32(at + 4, true) & 0x3ff,
      name: text(view.getUint32(at, true), at),
      plural: text(view.getUint32(at + 0x34, true), at + 0x34),
      range: (view.getUint32(at + 8, true) >>> 14) & 0xff,
      effect: bytes[at + 0x24] as number,
      raw: bytes.subarray(at, at + ACTION_RECORD),
    })
  }
  return out
}

/** Parse a range table: each range by its index. */
export function readActionRanges(bytes: Uint8Array): Map<number, ActionRange> {
  if (bytes.length < HEAD) {
    throw new GameFormatError(`range table is ${bytes.length} bytes, shorter than its head`)
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint32(0, true)
  if (HEAD + count * RANGE_RECORD !== bytes.length) {
    throw new GameFormatError(
      `range table says ${count} records, which is not its ${bytes.length} bytes`,
      0,
    )
  }
  const out = new Map<number, ActionRange>()
  for (let r = 0; r < count; r++) {
    const at = HEAD + r * RANGE_RECORD
    const packed = view.getUint32(at + 4, true)
    const index = bytes[at] as number
    out.set(index, {
      index,
      spread: bytes[at + 1] as number,
      base: packed & 0x3ff,
      unknown_bits10: (packed >>> 10) & 0x3ff,
      peak: (packed >>> 20) & 0x3ff,
    })
  }
  return out
}
