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
 * | `+0x08` | `u8` | its cost in MP, INFERRED: Heal 2, Midheal 4, Frizz 2, Crack 3; 0 on the 488 actions that are no spell, and 255 on the four that take all a caster's MP — Magic Burst and Kerplunk among them |
 * | `+0x08` | bits 14–21 | its range, an index into the range table beside it, or 0 for none — **every one is there**, 37 in `_a` and 117 in `_b`, and every range is some action's |
 * | `+0x20` | bits 20–31 | what it says, INFERRED: a message in `actmsg` — 22 "wounds are healed" on Heal and the herb, 84 "no longer poisoned" on the antidotal herb and Squelch, 32 "returns to life" on the leaf and Zing, 2 "takes damage" on the attack spells, and 157 to 166 on the seeds, each naming the number it raises; 0 for none |
 * | `+0x17` | high nibble | whom it reaches, INFERRED — see {@link ActionReach} |
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
 * | `+0x04` | bits 10–19 | the amount a party member's action draws around, INFERRED: the reference's own for Heal 35, Crack 30, Crackle 50 and Woosh 16, where the base is 35, 17, 33 and 14; equal to the base on 78 of 124, the heals and the items among them |
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
 * - `0x00` the seeds, which raise a number for good;
 * - `0x05` deals damage: the attack and every attack spell, Frizz to Kaboom,
 *   each saying `actmsg` 2, `takes <val_1> points of damage`.
 *
 * Other values are carried as they are.
 */
export const ActionEffect = {
  Damages: 0x05,
  RestoresHp: 0x16,
  RestoresMp: 0x6a,
  CuresPoison: 0x54,
  Revives: 0x20,
} as const

/**
 * Whom an action reaches, by the high nibble of its byte at `+0x17`. INFERRED,
 * from the actions carrying each: 1 Defend and Psyche Up; 2 Heal, Frizz,
 * Crack, Zam, Buff and the herbs; 4 Crackle, Woosh, Swoosh, Snooze and Thwack;
 * 3 Multiheal, Bang, Boom, Kathwack and the breaths; 7 Evac, Zoom and the
 * seeds. The Ka- spells step up one: Buff and Sap (2) to Kabuff and Kasap (4),
 * Snooze and Thwack (4) to Kasnooze and Kathwack (3) — so 4 reaches further
 * than 2 and less far than 3: a group. 5 is the attack alone; 6 and 8 are
 * carried.
 */
export const ActionReach = {
  Actor: 1,
  One: 2,
  All: 3,
  Group: 4,
  Outside: 7,
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
  /** Its cost in MP: 0 for none, 255 for all there is. INFERRED. */
  readonly cost: number
  /** What it says: its message's number in `actmsg`, 0 for none. INFERRED. */
  readonly message: number
  /**
   * How it opens: a message in `actmsg` said before the action's own, 0 for
   * none — `+0x20`, bits 10–19, INFERRED: 1 `attacks` on the attack, 45
   * `flees` on fleeing, 46 `casts <ACTION>` on 83 spells, 70 `uses <item>`
   * on the herbs, 15 `does the <ACTION>!` on the dances, and on the monsters'
   * unnamed moves their own lines — 394 `sends rubble raining down` on the
   * hexagoon's, 350 `is just fluffing around`. 669 of 681 index a message.
   */
  readonly opening: number
  /** Whom it reaches — see {@link ActionReach}. INFERRED. */
  readonly reach: number
  /**
   * Whether its target may dodge it — `+0x10`, bit 5.
   *
   * **Read from the code that reads it**, not inferred from the values: the
   * battle's evasion roll (`func_ov000_02156f98` in the decomp's overlay 0)
   * opens with `tst [action + 0x10], #0x20` and makes no draw when it is
   * clear. The witness is on the cartridge: the plain Attack has it, and
   * fleeing and the medicinal herb do not. 156 of 681 actions have it.
   */
  readonly evadable: boolean
  /** Whether a shield may block it — `+0x10`, bit 6, read the same way by `func_ov000_02156e30`. 162 of 681. */
  readonly blockable: boolean
  /**
   * Whether it is a critical hit without a roll — `+0x08`, bit 29. The
   * critical roll (`func_ov000_02156cc4`) hands back 1 at once when it is set,
   * **and spends no draw**. Set on 18 of 681, and the cartridge names the
   * witness: one is `Critical Claim`. Two more are 244 and 245, which the block
   * roll also singles out; the other fifteen are a second copy of each
   * attacking spell, Frizz to Kaboom — INFERRED: the spell as it goes haywire.
   */
  readonly alwaysCritical: boolean
  /**
   * What the critical chance is multiplied by, in hundredths — `+0x14`, bits
   * 21 to 27. The roll divides it by `100.0f` and hands it to
   * `CalculateCritRate` as the skill's multiplier.
   */
  readonly criticalPercent: number
  /**
   * Whether a status on the attacker spoils it — `+0x10`, bit 3. The accuracy
   * roll (`func_ov000_02156648`) throws a die of eight for such an action when
   * the attacker is under that status, and it misses on five faces. On 110 of
   * 681, **every one a blow that can be dodged**: the plain Attack has it and
   * Heal, Frizz and the medicinal herb do not. INFERRED: the status is dazzle.
   */
  readonly spoiltBySight: boolean
  /**
   * How its accuracy is come by — `+0x18`, bits 16 and 17. At 1 the accuracy
   * scales between the two percentages below by one of the attacker's
   * numbers, or is drawn between them when none is named; otherwise it stands
   * at a hundred. 202 of 681 scale; the plain Attack does not.
   */
  readonly accuracyMode: number
  /**
   * Which of the battle's 67 damage handlers its damage goes through after the
   * base is worked out — `+0x18`, bits 18 to 26. The game indexes a table of
   * member-function pointers by it (`func_ov024_021da55c`), and slot 0 is
   * empty: the damage passes as it is. **570 of 681 actions are on 0, the plain
   * Attack among them**; the rest are the skills, mostly one apiece — Dragon
   * Slash on 1, Metal Slash on 2, Thunder Thrust and Hatchet Man sharing 45.
   */
  readonly damageHandler: number
  /**
   * What kind of thing it does — `+0x18`, bits 5 to 11. Read from the one test
   * the game's final-damage function makes of it (`func_ov024_021e6a90`,
   * 0x021e7a68): **1 is halved** when the target carries a certain status, and
   * nothing else is. On the cartridge 1 is what does damage — the plain
   * Attack, Frizz, 242 in all — and the others sort by effect: 2 heals, 8 puts
   * to sleep, 82 is Zoom. Only 1's meaning is from code; the rest are
   * INFERRED from which actions carry them, and carried as the number.
   */
  readonly kind: number
  /**
   * The most it can deal — `+0x1C`, the low 14 bits; 0 is no limit. The game
   * takes the lower of this and the damage once it is a whole number
   * (0x021e7b2c–0x021e7b44).
   */
  readonly damageCap: number
  /**
   * Whether it works on a metal body — `+0x10`, bit 24. Without it a blow that
   * comes to nothing on such a target gets no 0-or-1 (0x021e78e8); what makes
   * a body metal is the target's, `func_ov000_02156068`, and not read here.
   */
  readonly worksOnMetal: boolean
  /** The least and the most a scaling action's accuracy can be, in a hundred — `+0x14`, bits 7–13 and 14–20. */
  readonly accuracyRange: { readonly min: number; readonly max: number }
  /** The whole record, for what is not read. */
  readonly raw: Uint8Array
}

export interface ActionRange {
  readonly index: number
  /** How far either side of the base the value drawn may fall. INFERRED. */
  readonly spread: number
  /** INFERRED — see above. */
  readonly base: number
  /** The amount a party member's action draws around, INFERRED — see above. */
  readonly party: number
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
      cost: bytes[at + 8] as number,
      message: view.getUint32(at + 0x20, true) >>> 20,
      opening: (view.getUint32(at + 0x20, true) >>> 10) & 0x3ff,
      reach: (bytes[at + 0x17] as number) >> 4,
      evadable: (view.getUint32(at + 0x10, true) & 0x20) !== 0,
      blockable: (view.getUint32(at + 0x10, true) & 0x40) !== 0,
      alwaysCritical: ((view.getUint32(at + 8, true) >>> 29) & 1) === 1,
      criticalPercent: (view.getUint32(at + 0x14, true) >>> 21) & 0x7f,
      spoiltBySight: (view.getUint32(at + 0x10, true) & 8) !== 0,
      accuracyMode: (view.getUint32(at + 0x18, true) >>> 16) & 3,
      damageHandler: (view.getUint32(at + 0x18, true) >>> 18) & 0x1ff,
      kind: (view.getUint32(at + 0x18, true) >>> 5) & 0x7f,
      damageCap: view.getUint32(at + 0x1c, true) & 0x3fff,
      worksOnMetal: (view.getUint32(at + 0x10, true) & 0x1000000) !== 0,
      accuracyRange: {
        min: (view.getUint32(at + 0x14, true) >>> 7) & 0x7f,
        max: (view.getUint32(at + 0x14, true) >>> 14) & 0x7f,
      },
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
      party: (packed >>> 10) & 0x3ff,
      peak: (packed >>> 20) & 0x3ff,
    })
  }
  return out
}
