import type { BattleRng } from './rng.ts'

/**
 * A fighter's changes of state in battle, translated from DQIX/BattleEmulator
 * (MIT — see `damage.ts`), which reproduces the game's code:
 *
 * - **defence and agility levels**, −2 to +2, multiplying the stat by 0.25,
 *   0.5, 1, 1.5 and 2 — the game's own multipliers, and the product **rounded
 *   half up** as its `RoundUp` does (see {@link levelled});
 * - a level lasting {@link LEVEL_TURNS} turns, a turn off after each of its
 *   holder's turns, then wearing off by 62, 75, 87 and 100 in 100 as the turns
 *   run past — the reference's `0x0215a8a8`, whose 75 wants the draw one lower;
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
  /** Turns left before it may wear off; 0 and below once they are out. */
  readonly turns: number
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
}

export const NO_STATES: States = {
  sleep: undefined,
  poisoned: false,
  defence: { level: 0, turns: 0 },
  agility: { level: 0, turns: 0 },
}

/** How long a level holds before it may wear off — the reference's Kasap and Deceleratle. */
export const LEVEL_TURNS = 7
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
/** A level wearing off, in 100, as the turns run past. */
const WEAR = [62, 75, 87, 100]

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

/** A level moved by `by` for {@link LEVEL_TURNS} — undefined when it is already at the end it moves toward. */
export function moved(level: Level, by: number): Level | undefined {
  const next = Math.max(-2, Math.min(2, level.level + by))
  return next === level.level ? undefined : { level: next, turns: LEVEL_TURNS }
}

/** A level after its holder's turn: a turn less, and worn off by the reference's odds once they are out. */
export function wornAfterTurn(level: Level, rng: BattleRng): { level: Level; wore: boolean } {
  const turns = level.turns - 1
  if (level.level === 0 || turns > 0) return { level: { level: level.level, turns }, wore: false }
  const odds = WEAR[Math.min(3, -turns)] as number
  const draw = rng.below(100)
  const wore = odds >= draw + (odds === 75 ? 1 : 0)
  return { level: { level: wore ? 0 : level.level, turns }, wore }
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
