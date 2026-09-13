import type { BattleRng } from './rng.ts'

/**
 * A fighter's changes of state in battle, translated from DQIX/BattleEmulator
 * (MIT — see `damage.ts`), which reproduces the game's code:
 *
 * - **defence and agility levels**, −2 to +2, multiplying the stat by 0.25,
 *   0.5, 1, 1.5 and 2 — `RecalculateBuff` — the product truncated;
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
  readonly defence: Level
  readonly agility: Level
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

/** Each level's multiplier, in quarters: 0.25, 0.5, 1, 1.5, 2. */
const QUARTERS = [1, 2, 4, 6, 8]
/** Waking, in 100, as the turns run past — `sleepTable`. */
const WAKE = [37, 62, 87, 100]
/** A level wearing off, in 100, as the turns run past. */
const WEAR = [62, 75, 87, 100]

/** A stat at a level: its value times the level's multiplier, truncated. */
export function levelled(value: number, level: number): number {
  const quarters = QUARTERS[Math.max(-2, Math.min(2, level)) + 2] as number
  return Math.trunc((value * quarters) / 4)
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

/** What poison takes at a round's end: a sixteenth of maximum HP. */
export const poisonDamage = (maxHp: number): number => maxHp >> 4
