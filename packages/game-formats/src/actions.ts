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
  /**
   * Whom it reaches — see {@link ActionReach}. INFERRED. Overlay 25's action
   * loop reads it (`func_ov000_021627fc`): at 2 or 5 the action goes to state
   * 6, its line up once the chase shot has settled (read 6 October 2026).
   */
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
  /**
   * What sort of action it is — `+0x10`, bits 0 to 2: a **spell** (bit 0), a
   * **dance** (bit 1), a **breath** (bit 2). The final-damage function reads
   * bits 0 and 2 (`func_ov024_021e6a90`, `0x021e7534` and `0x021e7588`): a
   * spell is lessened by the target's resistance to spells, Wizard Ward's
   * level, and a breath by its resistance to breaths, Insulate's. Borne out
   * on the cartridge: bit 0 on 85 — Heal, Frizz, Zoom and every spell; bit 1
   * on 10, every one a dance; bit 2 on 19, the breaths, Hot Lick and Venom
   * Mist among them (read 6 October 2026).
   */
  readonly spell: boolean
  readonly dance: boolean
  readonly breath: boolean
  /**
   * Whether defending halves it — `+0x10`, bit 4. `CalculateFinalDamage`
   * (`0x021e75d0`) looks at this before it reads the target's guard level:
   * without it, defending does nothing against the action.
   */
  readonly defendable: boolean
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
   * Heal, Frizz and the medicinal herb do not. The status is **dazzle**,
   * `+0x14` bit 6 (`func_ov000_02156b20`, `0x02156aa8`), which Flower Power
   * and Scandal Eyes set (kind 19, `func_02088854`) — read 7 October 2026.
   */
  readonly spoiltBySight: boolean
  /**
   * Whether a wall of light turns it back on its actor — `+0x10`, bit 10.
   * The resolver's redirection (`func_ov024_021e9f68`,
   * `0x021ea008`–`0x021ea074`) swaps the actor and the target of such an
   * action aimed at the other side, at one under Bounce (`+0x14` bit 9) who
   * is not its actor. Read 7 October 2026.
   */
  readonly reflectable: boolean
  /**
   * Whether a stance turns it — `+0x10`, bit 7: the resolver's redirection
   * (`func_ov024_021e9f68`, `0x021ea1c0`–`0x021ea1c8`) counters such an
   * action at one in Counter Wait or Back Atcha's stance. 78 of 681 — the
   * plain Attack, the monsters' attacks and the party's slashes and thrusts.
   * Read 7 October 2026.
   */
  readonly counterable: boolean
  /**
   * Whether an ally may take it in its target's place — `+0x10`, bit 12: the
   * resolver's cover (`func_ov024_021e9b74`, `0x021e9bd8`–`0x021e9be8`) hands
   * such an action to one in Forbearance's, Selflessness's or Whipping Boy's
   * stance. 305 of 681 — every harmful action. Read 7 October 2026.
   */
  readonly coverable: boolean
  /**
   * Whether it may shake its target out of sleep or confusion — `+0x10`, bit
   * 11: after a pass of it that dealt something, unturned, the resolver
   * (`func_ov024_021eb5d0`, `0x021ecc90`–`0x021ecca8`) calls
   * `func_ov000_02157288`, which leaves at once without it
   * (`0x0215728c`–`0x021572a0`). Read 7 October 2026.
   */
  readonly rouses: boolean
  /**
   * Whether it is taken up as the round begins — `+0x08`, bit 28: its MP is
   * spent then, and its stance set (`func_ov000_021537b8`, called for each
   * such action by `func_ov000_0215f110`, `0x0215f174`–`0x0215f194`), and the
   * turn asks no MP of it (`func_ov024_021eaa50`, `0x021eabe8`–`0x021eabf4`).
   * 12 of 681: Defend, Blockenspiel, the six stances, Pincushion and three
   * nameless. Read 7 October 2026.
   */
  readonly atRoundStart: boolean
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
  /**
   * Whether its blows chain into a combo — `+0x2C`, bit 27 (read 1 October
   * 2026). The chain counter (`func_ov024_021ea584`) counts only such an
   * action's blows, and the resolver multiplies their damage by the combo
   * table (`0x021e7a8c`); any other action resets the chain. The plain Attack
   * has it, and Frizz; Heal does not. 112 of 681.
   */
  readonly combos: boolean
  /**
   * Whether tension works on it, and is spent by it — `+0x10`, bit `0x2000`
   * (read 1 October 2026: `func_ov024_021e6a90` multiplies by it, the
   * resolver spends it after an action carrying it, `0x021ed48c`). The plain
   * Attack, the attack spells and six heals; not Defend, nor Psyche Up. 223
   * of 681.
   */
  readonly tensed: boolean
  /**
   * Whom it is aimed at — `+0x08`, bits 8–9: 1 the monsters, 2 the party
   * (`func_ov000_02171210`, which picks the target choice by it and by
   * {@link reach}; read 2 October 2026).
   */
  readonly side: number
  /**
   * Which battle list it is in — `+0x18`, bits 12–15: 2 Spells, 1 Abilities,
   * anything else neither (`func_ov026_021dc8fc`, `0x021dcba4`). The same
   * bits pick its script's archive.
   */
  readonly list: number
  /**
   * `+0x08`, bits 10–11. An action is listed in battle only with bit 1 set
   * (`func_ov026_021dc8fc`), so a field-only spell never appears there —
   * INFERRED: usable in battle. Bit 0 is not established.
   */
  readonly usableIn: number
  /**
   * Its **hit code**, `+0x1C` bits 14–18: 1, 6 and 9 strike the targets two,
   * four and five times over; 3, 4, 5, 7, 8, 10 and 11 strike a number of
   * random picks among them (`func_ov024_021e8dc0`, `func_ov000_0215fbe0`;
   * read 2 October 2026).
   */
  readonly hitCode: number
  /**
   * What runs once after it, `+0x2C` bits 10–13 (the table at `0x021ff3f8`):
   * 1 MP back, 2 the guard, 3 recoil, 4 HP back, 5 the actor's fall, 6 gold
   * spent.
   */
  readonly afterStep: number
  /** Whether it weakens over its passes, `+0x10` bit 17: 1.0, 0.8, 0.6, 0.4, 0.2. */
  readonly fallsOff: boolean
  /**
   * The targeting handler a monster's AI takes for it, by its mode — `+0x0C`
   * in mode 1, `+0x0E` in mode 2; mode 0 always the first (read 3 October
   * 2026; `func_ov024_021f66cc`, the table at `0x021ff790`). Heal 11 and 11,
   * Frizz 7 and 2, Buff 18 and 19, the Attack 0 and 1.
   */
  readonly aiTargets: readonly [mode1: number, mode2: number]
  /**
   * Whether its *amount* scales by a number of the user's — the same two bits
   * as {@link accuracyMode}, at 2. `GetAttackBaseDamage` (overlay 24,
   * `0x021e7c0c`) tests them for one of the party: at 2, and with a number
   * named by {@link scalesBy}, the amount runs from the range's least to its
   * most as that number runs from {@link scaleRange}'s `lo` to its `hi`.
   * **It means something only with a {@link range}**: the plain Attack has the
   * 2 and no range, and the game works its damage out as a blow's without
   * looking at this.
   */
  readonly amountScales: boolean
  /** The number it scales by — `+0x10` bit 14 magical might, bit 15 magical mending; the first tested wins. */
  readonly scalesBy: 'might' | 'mending' | undefined
  /** Between what the number scales it — `+0x04` bits 12–21 and 22–31. Frizz's 50 and 999. */
  readonly scaleRange: { readonly lo: number; readonly hi: number }
  /**
   * The element of what it deals — `+0x08`, bits 22 to 26. The final-damage
   * function multiplies the damage by the target's resistance to it
   * (`func_ov024_021e6a90`, `0x021e6e8c`). 8 on the plain Attack, 1 Frizz, 2
   * Crack, 3 Woosh, 4 Bang, 6 Zam; 0 where there is none, which is whole.
   */
  readonly element: number
  /**
   * The element its landing is resisted by — `+0x18`, bits 27 to 31, which the
   * accuracy roll hands to the same function. 19 on Kasap, 20 Deceleratle, 10
   * Snooze and Sweet Breath, 16 Poison Breath; and on a blow with a rider, the
   * rider's — Toxic Dagger's 16, Helm Splitter's 19.
   */
  readonly landingElement: number
  /**
   * **A monster's chance with it**, in a hundred — `+0x14`, bits 0 to 6. Two
   * readers, both the game's: the accuracy roll (`func_ov000_02156648`) takes it
   * as the accuracy of an action whose accuracy scales ({@link accuracyMode}
   * at 1) when a monster uses it — Kasap's 75, Sweet Breath's 25, which is
   * the whole of whether such an action lands, since its handler makes no draw
   * of its own; and the {@link rider}'s handler takes it as the rider's chance.
   * One of the party's is {@link accuracyRange}, least to most by their might.
   */
  readonly foeChance: number
  /**
   * What rides on its blow — `+0x18`, bits 0 to 4: a slot of 22 in the table
   * `func_ov024_021e4b14` dispatches by, 0 for none. Each makes one draw below
   * a hundred once the blow has dealt something, and lands under the action's
   * chance times a hundredth of a byte of the *target's*. Read from the
   * handlers: 2 lowers attack, 8 lowers defence; INFERRED from who carries
   * them: 4 poisons (Toxic Dagger, Venomissile), 7 sleep (Hit the Hay), 11
   * paralysis, 20 death (Assassin's Stab). Carried as the number.
   */
  readonly rider: number
  /**
   * How many levels it moves what it changes — `+0x30`, signed, held to two
   * either way by the handlers that read it (`func_ov024_021db7c0` for
   * defence): Buff 1, Sap −1, Oomph 2, Blunt −2. The rider's own is at `+0x32`.
   */
  readonly levels: number
  readonly riderLevels: number
  /** The least and the most a scaling action's accuracy can be, in a hundred — `+0x14`, bits 7–13 and 14–20. */
  readonly accuracyRange: { readonly min: number; readonly max: number }
  /**
   * **Its lines in `actmsg`**, by whom it reaches — ten bits each of `+0x20`,
   * `+0x24` and `+0x28` (read 6 October 2026 from the handlers that pick
   * them, `func_ov024_021da644`, which takes the first of a pair for a target
   * of the party): what it says done (`+0x20` bits 20–29 at one of the party,
   * `+0x24` bits 0–9 at a monster), failed (`+0x24` bits 10–19, 20–29) and
   * killing (`+0x28` bits 0–9, 10–19). The Attack's are 2 and 5, 4 and 7, 8
   * and 9; Whack's fail 621 and 27, kill 8 and 69.
   */
  readonly lines: {
    readonly done: readonly [party: number, foe: number]
    readonly failed: readonly [party: number, foe: number]
    readonly killed: readonly [party: number, foe: number]
  }
  /** The whole record, for what is not read. */
  readonly raw: Uint8Array
}

/**
 * A range, as the game's `GetAttackBaseDamage` reads it (overlay 24,
 * `0x021e7bc0`) — what was INFERRED here from the reference is now from the
 * code, and it bore the inference out.
 */
export interface ActionRange {
  readonly index: number
  /**
   * How far either side the amount may fall: a draw between ∓ this is added
   * last, whoever uses the action. Word 0 bits 8–17 — ten bits; it was read as
   * the byte at `+0x01`, and no range on the cartridge goes past it.
   */
  readonly spread: number
  /** **A monster's** amount — word 1, bits 0–9. */
  readonly base: number
  /** **One of the party's least** — word 1, bits 10–19: what it is until the user's number passes the action's `lo`. */
  readonly party: number
  /** **One of the party's most** — word 1, bits 20–29: what it is from the action's `hi`. */
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
      spell: (view.getUint32(at + 0x10, true) & 1) !== 0,
      dance: (view.getUint32(at + 0x10, true) & 2) !== 0,
      breath: (view.getUint32(at + 0x10, true) & 4) !== 0,
      blockable: (view.getUint32(at + 0x10, true) & 0x40) !== 0,
      defendable: (view.getUint32(at + 0x10, true) & 0x10) !== 0,
      alwaysCritical: ((view.getUint32(at + 8, true) >>> 29) & 1) === 1,
      criticalPercent: (view.getUint32(at + 0x14, true) >>> 21) & 0x7f,
      spoiltBySight: (view.getUint32(at + 0x10, true) & 8) !== 0,
      reflectable: (view.getUint32(at + 0x10, true) & 0x400) !== 0,
      counterable: (view.getUint32(at + 0x10, true) & 0x80) !== 0,
      coverable: (view.getUint32(at + 0x10, true) & 0x1000) !== 0,
      rouses: (view.getUint32(at + 0x10, true) & 0x800) !== 0,
      atRoundStart: ((view.getUint32(at + 8, true) >>> 28) & 1) === 1,
      accuracyMode: (view.getUint32(at + 0x18, true) >>> 16) & 3,
      damageHandler: (view.getUint32(at + 0x18, true) >>> 18) & 0x1ff,
      kind: (view.getUint32(at + 0x18, true) >>> 5) & 0x7f,
      damageCap: view.getUint32(at + 0x1c, true) & 0x3fff,
      worksOnMetal: (view.getUint32(at + 0x10, true) & 0x1000000) !== 0,
      combos: (view.getUint32(at + 0x2c, true) & 0x8000000) !== 0,
      tensed: (view.getUint32(at + 0x10, true) & 0x2000) !== 0,
      side: (view.getUint32(at + 8, true) >>> 8) & 3,
      list: (view.getUint32(at + 0x18, true) >>> 12) & 0xf,
      usableIn: (view.getUint32(at + 8, true) >>> 10) & 3,
      hitCode: (view.getUint32(at + 0x1c, true) >>> 14) & 31,
      afterStep: (view.getUint32(at + 0x2c, true) >>> 10) & 15,
      fallsOff: (view.getUint32(at + 0x10, true) & 0x20000) !== 0,
      aiTargets: [view.getUint16(at + 0x0c, true), view.getUint16(at + 0x0e, true)],
      element: (view.getUint32(at + 8, true) >>> 22) & 0x1f,
      landingElement: view.getUint32(at + 0x18, true) >>> 27,
      foeChance: view.getUint32(at + 0x14, true) & 0x7f,
      rider: view.getUint32(at + 0x18, true) & 0x1f,
      levels: view.getInt16(at + 0x30, true),
      riderLevels: view.getInt16(at + 0x32, true),
      amountScales: ((view.getUint32(at + 0x18, true) >>> 16) & 3) === 2,
      scalesBy:
        (view.getUint32(at + 0x10, true) & 0x4000) !== 0
          ? 'might'
          : (view.getUint32(at + 0x10, true) & 0x8000) !== 0
            ? 'mending'
            : undefined,
      scaleRange: {
        lo: (view.getUint32(at + 4, true) >>> 12) & 0x3ff,
        hi: view.getUint32(at + 4, true) >>> 22,
      },
      accuracyRange: {
        min: (view.getUint32(at + 0x14, true) >>> 7) & 0x7f,
        max: (view.getUint32(at + 0x14, true) >>> 14) & 0x7f,
      },
      lines: {
        done: [
          (view.getUint32(at + 0x20, true) >>> 20) & 0x3ff,
          view.getUint32(at + 0x24, true) & 0x3ff,
        ],
        failed: [
          (view.getUint32(at + 0x24, true) >>> 10) & 0x3ff,
          (view.getUint32(at + 0x24, true) >>> 20) & 0x3ff,
        ],
        killed: [
          view.getUint32(at + 0x28, true) & 0x3ff,
          (view.getUint32(at + 0x28, true) >>> 10) & 0x3ff,
        ],
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
      spread: (view.getUint32(at, true) >>> 8) & 0x3ff,
      base: packed & 0x3ff,
      party: (packed >>> 10) & 0x3ff,
      peak: (packed >>> 20) & 0x3ff,
    })
  }
  return out
}
