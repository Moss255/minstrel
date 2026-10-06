import type { BattleRng } from './rng.ts'

/**
 * A fighter's changes of state in battle. What is translated from
 * DQIX/BattleEmulator (MIT — see `damage.ts`), which reproduces the game's
 * code, and what is the game's own, read since:
 *
 * - **defence and agility levels**, −2 to +2, multiplying the stat by 0.25,
 *   0.5, 1, 1.5 and 2 — the game's own multipliers, and the product **rounded
 *   half up** as its `RoundUp` does (see {@link levelled});
 * - **how a level runs down — the game's** (read 6 October 2026, task 18;
 *   `docs/readings/T18-handlers.md` §10): a count set with it — {@link
 *   LEVEL_COUNTS} — less one on each of its **holder's own action passes**
 *   (`func_ov000_021599f4`), and at 0 a second count of 4; from then, on each
 *   of the holder's passes, that count less one and a draw of the battle's,
 *   `R(100) / 100`, against a table by it — the level clears where the table
 *   is above the draw (`func_ov000_0215858c`). See {@link countDown} and
 *   {@link runDown};
 * - **sleep** for {@link SLEEP_TURNS} turns, a turn off on each of the
 *   sleeper's own, then waking on it by 37, 62, 87 and 100 in 100 — its
 *   `sleepTable`;
 * - **poison** taking a sixteenth of maximum HP, `maxHp >> 4`, at every round's
 *   end.
 *
 * The reference keeps them for its one player; the battle gives them to every
 * fighter alike — see `battle.ts` for that and the rest that is ours.
 */

export interface Level {
  /** From −2 to +2. */
  readonly level: number
  /**
   * Its count — the status's byte at `+0x5c` and on (attack's `+0x6e`):
   * its holder's action passes left before it may wear off. See
   * {@link countDown}.
   */
  readonly turns: number
  /**
   * Its second count, once the first is out — the byte `0x23` further on
   * (attack's `+0x91`): 0 until then, and the wear-off table's index after
   * each pass takes one off. See {@link runDown}.
   */
  readonly wearing?: number
}

export interface States {
  /** Turns of sleep left, counted as the reference does — to 0 and past it; undefined awake. */
  readonly sleep: number | undefined
  readonly poisoned: boolean
  /**
   * **Envenomated** — the stronger poison, status `+0x22` low bits at 2 where
   * plain poison is 1 (`func_02088560`, `func_02088624`): what a poison rider
   * or kind 6 with levels above 0 gives — Toxic Dagger, Venom Mist, the poison
   * attack 275. **It is the one a battle tolls** (`func_ov000_0215a23c`); see
   * {@link poisonDamage}.
   */
  readonly envenomed?: boolean
  readonly defence: Level
  readonly agility: Level
  /**
   * Its attack's level, −2 to +2 — status `+0x58` bits 0–2, which Oomph,
   * Blunt and their like move (kind 3, `func_ov024_021db5ec`). None is level 0.
   */
  readonly attack?: Level
  /** Its tension's level, 0 to 4 — see `tension.ts`; none when not given. */
  readonly tension?: number
  /**
   * Its magical might's and magical mending's levels, −2 to +2 — status
   * `+0x58` bits 12–14 and 15–17, which Channel Anger and Caster Sugar (kind
   * 42, `func_ov024_021df284`) and Care Prayer (kind 38, `021dee84`) move;
   * the stat is worked out again from it (`UpdateCombatantMagicalMight`,
   * `…Mending`) — see {@link buffedMagic}. None is level 0.
   */
  readonly might?: Level
  readonly mending?: Level
  /**
   * Its **resistance to spells** and **to breaths**, −2 to +2 — status
   * `+0x58` bits 18–20, set with flag `+0x14` bit 16 (Wizard Ward and Spooky
   * Aura, kind 22, `func_ov024_021dd968`), and bits 21–23 with bit 17
   * (Insulate, Insulatle, Mind Over Matter, kind 23, `021ddaa0`). The final
   * damage multiplies a spell, and a breath, by {@link wardMultiplier} of it
   * (`func_ov024_021e6a90`, `0x021e7534`–`0x021e75c8`). None is level 0.
   */
  readonly spells?: Level
  readonly breaths?: Level
  /**
   * **Fizzled** — status `+0x14` bit 8, with a count of 6 at `+0x60`
   * (Antimagic, kind 16, `func_020888a4`): its spells are put out as action
   * 914, "tries to cast … but can't cast spells at the moment"
   * (`func_ov024_021eaa50`, `0x021eacc4`–`0x021ead08`). Kept as a level of
   * 1 so it runs down as the levels do — **ours**; see `battle.ts`.
   */
  readonly fizzled?: Level
  /**
   * **Paralysed** — status `+0x14` bit 3, which Tingle clears (kind 20,
   * `func_020882dc`). **Nothing here sets it yet**: what does — rider 11,
   * INFERRED — is not read.
   */
  readonly paralysed?: boolean
  /**
   * **0 Zone** — status `+0x18` bit 9, with a count of 5 at `+0x78` (kind 68,
   * `func_ov024_021e1580`; `func_020890d4`): no MP is asked of its holder's
   * actions (`func_ov024_021eadfc`, read by `func_ov024_021eaa50` at
   * `0x021eabd8`). Kept as a level of 1, to run down as the game runs it.
   */
  readonly zeroZone?: Level
  /**
   * **Rough 'n' Tumble** — status `+0x18` bit 10, with a count of 5 at
   * `+0x79` (kind 70, `func_ov024_021e1824`; `func_02089124`). What it does
   * is read by `func_ov000_02156404`'s callers — see `battle.ts`. Kept as a
   * level of 1.
   */
  readonly tumble?: Level
}

export const NO_STATES: States = {
  sleep: undefined,
  poisoned: false,
  defence: { level: 0, turns: 0 },
  agility: { level: 0, turns: 0 },
}

/**
 * **The count a level is set with** — what each setter stores at its byte
 * (USA ARM9): attack 5 at `+0x6e` (`func_020877c0`),
 * defence 6 at `+0x6f` (`func_020878b4`, `0x02087900`), agility 6 at `+0x70`,
 * charm 6 at `+0x71`, magical might 5 at `+0x72`, mending 5 at `+0x73`, the
 * resistance to spells 5 at `+0x74`, to breaths 5 at `+0x75` (`func_02087e6c`); Fizzle 6 at
 * `+0x60` (`func_020888a4`); 0 Zone 5 at `+0x78` (`func_020890d4`), Rough 'n'
 * Tumble 5 at `+0x79` (`func_02089124`). Every setter stores its second count
 * 0 beside it.
 */
export const LEVEL_COUNTS = {
  attack: 5,
  defence: 6,
  agility: 6,
  might: 5,
  mending: 5,
  spells: 5,
  breaths: 5,
  fizzled: 6,
  zeroZone: 5,
  tumble: 5,
} as const

/** The kinds of count {@link LEVEL_COUNTS} names. */
export type Counted = keyof typeof LEVEL_COUNTS

/**
 * **The two wear-off tables**, by the second count after it has taken one
 * off (`func_ov000_0215858c`): `0x02182ad4` — 1.0, 0.875, 0.75, 0.625 — and
 * `0x02182bd4` — 1.0, 0.875, 0.625, 0.375 — each with a fifth word of
 * `0x0000ffff`, a float a shade above nothing that a second count never
 * reaches (it starts at 4 and is taken one from before it is looked up).
 */
const DENORMAL = Math.fround(9.183409485952689e-41)
export const WEAR_TABLE = [1, 0.875, 0.75, 0.625, DENORMAL].map(Math.fround)
export const WEAR_TABLE_SLOW = [1, 0.875, 0.625, 0.375, DENORMAL].map(Math.fround)

/**
 * Which table each runs down by, and what its second count starts at
 * (`data_ov000_02182efc`, read by `func_ov000_021599f4`): the levels and
 * Fizzle 4, by the first table — but the resistance to spells by the second
 * (its block, `0x02159428` on); 0 Zone and Rough 'n' Tumble 1, by the second, so they
 * go on the pass after their count runs out, a draw spent all the same.
 */
export const WEAR_OF: Readonly<Record<Counted, { table: readonly number[]; start: number }>> = {
  attack: { table: WEAR_TABLE, start: 4 },
  defence: { table: WEAR_TABLE, start: 4 },
  agility: { table: WEAR_TABLE, start: 4 },
  might: { table: WEAR_TABLE, start: 4 },
  mending: { table: WEAR_TABLE, start: 4 },
  spells: { table: WEAR_TABLE_SLOW, start: 4 },
  breaths: { table: WEAR_TABLE, start: 4 },
  fizzled: { table: WEAR_TABLE, start: 4 },
  zeroZone: { table: WEAR_TABLE_SLOW, start: 1 },
  tumble: { table: WEAR_TABLE_SLOW, start: 1 },
}
/** How long sleep holds before its sleeper may wake — the reference's Sweet Breath. */
export const SLEEP_TURNS = 2

/**
 * Each level's multiplier — the game's `CalculateDefenceBuffMultiplier` and
 * the agility one beside it (`src/Combat/Main/BasicAttackCalculation.cpp`):
 * half again a level up, and going down a half at −1 and a quarter at −2.
 * Worked in the game's floats, as `docs/conformance.md` says these are.
 */
function multiplier(level: number): number {
  return level >= 0
    ? Math.fround(1 + Math.fround(level * 0.5))
    : Math.fround(1 + Math.fround(Math.fround((level + 1) * 0.25) - 0.5))
}
/** Waking, in 100, as the turns run past — `sleepTable`. */
const WAKE = [37, 62, 87, 100]

/**
 * A stat at a level: its value times the level's multiplier, **rounded half
 * up** — the game's `RoundUp` (`0.5f + x`, truncated), which it applies to a
 * stat after its multiplier and before the blow is worked out. It was
 * truncated here, the reference's way, which is a point low on every odd
 * half: a defence of 41 at −1 is 21 to the game and was 20 to us.
 */
export function levelled(value: number, level: number): number {
  const level2 = Math.max(-2, Math.min(2, level))
  return Math.trunc(Math.fround(0.5 + Math.fround(Math.fround(value) * multiplier(level2))))
}

/**
 * **An attack at its level** — `UpdateCombatantAttack` (decompiled,
 * `src/Combat/Overlay_0/UpdateCombatantBuffs.cpp`): the base times
 * `CalculateAttackBuffMultiplier`, `1 + 0.25 × level` — a quarter a level,
 * not defence's half — **truncated** to a whole number, and at most 999 for
 * one of the party.
 */
export function buffedAttack(value: number, level: number, party: boolean): number {
  const f = Math.fround
  const multiplier = f(1 + f(0.25 * Math.max(-2, Math.min(2, level))))
  const buffed = Math.trunc(f(multiplier * f(value))) & 0xffff
  return party && buffed > 999 ? 999 : buffed
}

/**
 * **Magical might or mending at its level** — `UpdateCombatantMagicalMight`
 * and `UpdateCombatantMagicalMending` (decompiled,
 * `src/Combat/Overlay_0/UpdateCombatantBuffs.cpp`): the base times
 * `1 + 0.5 × level` (`CalculateMagicalMightBuffMultiplier`, `…Mending…`, in
 * `src/Combat/Main/BasicAttackCalculation.cpp`), truncated to the stat's
 * sixteen bits, and at most 999 — for anyone, the code asks no side.
 */
export function buffedMagic(value: number, level: number): number {
  const f = Math.fround
  const multiplier = f(1 + f(0.5 * Math.max(-2, Math.min(2, level))))
  const buffed = Math.trunc(f(multiplier * f(value))) & 0xffff
  return buffed > 999 ? 999 : buffed
}

/**
 * **What a resistance level leaves of a spell or a breath** — `func_020748d0`
 * (spells) and `func_020748a8` (breaths), the same two lines: `1 + (−0.25 ×
 * level)`, in floats (the literal `0xbe800000` at `0x020748cc` and
 * `0x020748f4`). A level of 2 halves it; −2, which Spooky Aura can bring a
 * monster to, makes it half again.
 */
export function wardMultiplier(level: number): number {
  const f = Math.fround
  return f(1 + f(f(-0.25) * f(level)))
}

/**
 * A level moved by `by`, its count set again and its second cleared, as
 * every setter does (`func_020878b4`) — undefined when it is already at the
 * end it moves toward. A level brought to 0 is cleared (`0x020878e0`).
 */
export function moved(level: Level, by: number, count: number): Level | undefined {
  const next = Math.max(-2, Math.min(2, level.level + by))
  if (next === level.level) return undefined
  return next === 0 ? { level: 0, turns: 0 } : { level: next, turns: count }
}

/**
 * **A status's count, on its holder's pass** — `func_ov000_021599f4`: one
 * less, and at 0 the second count set to its start (`0x02159c14`–
 * `0x02159c30`). No draw. A status not held is left as it is.
 */
export function countDown(level: Level, start: number): Level {
  if (level.level === 0 || level.turns <= 0) return level
  const turns = level.turns - 1
  return turns === 0 ? { level: level.level, turns: 0, wearing: start } : { ...level, turns }
}

/**
 * **A status wearing off, on its holder's pass** — one block of
 * `func_ov000_0215858c` (attack's at `0x02159050`–`0x021590ac`): held, with a
 * second count, that count less one, a draw `R(100) / 100` of the battle's,
 * and cleared where the table by the count is above it. No draw for one
 * whose second count is not running.
 */
export function runDown(
  level: Level,
  table: readonly number[],
  rng: BattleRng,
): { level: Level; wore: boolean } {
  if (level.level === 0 || !level.wearing) return { level, wore: false }
  const wearing = level.wearing - 1
  const draw = Math.fround(Math.fround(rng.below(100)) / 100)
  const wore = (table[wearing] as number) > draw
  return wore
    ? { level: { level: 0, turns: 0 }, wore: true }
    : { level: { level: level.level, turns: 0, wearing }, wore: false }
}

/**
 * **Waking, the game's way** (read 3 October 2026; `func_ov000_0215833c`,
 * `021599f4`): a sleeper's turns are counted from 0 as it falls asleep. Its
 * first sleeping turn has no chance; from the second, the turn-start draw
 * `R(100) / 100` wakes it when under 0.375, then 0.625, 0.875, and at last
 * always (the table at `0x02182bd4`, walked back from 4). `turns` is how many of
 * its sleeping turns have passed.
 */
export const WAKE_TABLE = [1, 0.875, 0.625, 0.375].map(Math.fround)
export function wakes(turns: number, draw: number): boolean {
  if (turns <= 0) return false
  const counter = Math.max(0, 4 - turns)
  return (WAKE_TABLE[counter] as number) > Math.fround(Math.fround(draw) / 100)
}

/** A sleeper's turn: a turn less of sleep, and awake by the reference's odds once it is out. */
export function sleptThrough(
  sleep: number,
  rng: BattleRng,
): { sleep: number | undefined; woke: boolean } {
  const left = sleep - 1
  if (left > 0) return { sleep: left, woke: false }
  const odds = WAKE[Math.min(3, -left)] as number
  return odds >= rng.below(100) ? { sleep: undefined, woke: true } : { sleep: left, woke: false }
}

/**
 * **What envenomation takes at a round's end** — `func_ov000_0215a23c`,
 * `0x0215a5c8`–`0x0215a5f4`: a sixteenth of the most HP, at most 999 and at
 * least 1. Read 6 October 2026, and it corrects what stood here: the toll is
 * envenomation's (`func_02088514`, `+0x22` at 2). **Plain poison takes
 * nothing in a battle** — no code in the ARM9 or any overlay asks for it
 * there but to cure it, to multiply Victimiser's blow, and in the AI; the
 * reference's "poison" is the poison attack 275's, whose record's levels make
 * it envenomation.
 */
export const poisonDamage = (maxHp: number): number => Math.max(1, Math.min(999, maxHp >> 4))
