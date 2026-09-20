/**
 * The game's own battle arithmetic, translated from its decompilation, in the
 * 32-bit floats it actually computes in.
 *
 * **This is a test oracle and lives in the test tree on purpose.** The
 * simulation keeps floats out of gameplay arithmetic (`CLAUDE.md`, "Fixed-point
 * in simulation"), and the game does not: its damage, its draws below a
 * maximum and its critical chance all pass through `float`. So the simulation's
 * integer forms are held to this, function by function, and where the two part
 * the conformance tests say how often and by how much rather than letting
 * either quietly win.
 *
 * `Math.fround` is IEEE-754 single precision and the same on every platform,
 * so this is as reproducible as the integers are. Each function cites the
 * decomp's source file and symbol; addresses are the USA build's.
 */

const f = Math.fround

const MULTIPLIER = 0x5d588b656c078965n
const INCREMENT = 0x269ec3n
const MASK = (1n << 64n) - 1n

/** `struct Random` — `src/Util/Random.cpp`. */
export class GameRandom {
  state: bigint
  drawn = 0

  /** `SeedRandom`: the state as given; the multiplier and increment are fixed. */
  constructor(state: bigint) {
    this.state = state & MASK
  }

  /**
   * `NextRandom` (0x020742c0): **steps first**, then hands back the new
   * state's top 32 bits. The simulation's `BattleRng.top32` hands back the
   * seed's own top first and steps after, so the two are the same sequence one
   * step apart — see `BattleRng.fromGameState`.
   */
  next(): number {
    this.state = (this.state * MULTIPLIER + INCREMENT) & MASK
    this.drawn++
    return Number(this.state >> 32n)
  }

  /** `NextRandomFloat01` (0x0207434c): `NextRandom / (double) 0xFFFFFFFF`, narrowed to float. */
  float01(): number {
    return f(this.next() / 0xffffffff)
  }

  /**
   * `NextRandomMax` (0x020742fc): `maximum * NextRandomFloat01`, truncated, and
   * held below the maximum — the float reaches 1.0 when every bit is set.
   */
  max(maximum: number): number {
    if (maximum <= 0) return 0
    const result = Math.trunc(f(f(maximum) * this.float01()))
    return result >= maximum ? maximum - 1 : result
  }

  /** `NextRandomFloatBetween` (0x02074388): `(max − min) × float01 + min`, each step a float. */
  floatBetween(minimum: number, maximum: number): number {
    return f(f(f(f(maximum) - f(minimum)) * this.float01()) + f(minimum))
  }

  /** `NextRandomBetween` (0x02074478): `NextRandomMax(max − min + 1) + min`, both ends included. */
  between(minimum: number, maximum: number): number {
    return this.max(maximum - minimum + 1) + minimum
  }
}

/** `RoundUp` (0x020744a8) — `0.5f + x`, truncated by its `int` return. Despite the name, round-half-up. */
export function roundUp(value: number): number {
  return Math.trunc(f(0.5 + f(value)))
}

/**
 * `CalculatePhysicalDamage` (0x020744c0) — `src/Combat/Main/BasicAttackCalculation.cpp`.
 *
 * Returns the game's float. Its caller, `GetAttackBaseDamage` in overlay 24,
 * returns it as an `int`, which **truncates** — `RoundUp` is called sixteen
 * bytes before it, on a stat after its multiplier, not on the damage.
 */
export function calculatePhysicalDamage(
  attack: number,
  defence: number,
  random: GameRandom,
): number {
  let damage = f(f(f(attack) - f(f(defence) / 2)) / 2)
  if (damage <= 0) return 0
  const minimum = f(f(attack) / 16)
  if (damage <= minimum) {
    damage = random.floatBetween(0, minimum)
  } else {
    const limit = f(damage / 16)
    const percentage = random.floatBetween(f(0 - limit), limit)
    const flat = random.floatBetween(-1, 1)
    damage = f(f(damage + percentage) + flat)
  }
  return damage < 0 ? 0 : damage
}

/**
 * `CalculateCritRate` — `src/Combat/Main/CritRateCalculation.cpp`. A percentage.
 *
 * Two in a hundred to begin with; deftness counts only past 150, a hundredth
 * of a point each, through a `short`; an accessory's and a book's bonus are
 * added, a skill's multiplies, and a move of several hits shares it out.
 */
export function calculateCritRate(
  deftness: number,
  accessoryBonus = 0,
  bookBonus = 0,
  skillBonus = 1,
  hitCount = 1,
): number {
  // The `short` conversion the assembly's shifts point to.
  const base = Math.max(0, ((deftness - 150) << 16) >> 16)
  const baseChance = f(f(2) + f(f(0.01) * f(base)))
  let chance = f(f(accessoryBonus) + baseChance)
  chance = f(f(bookBonus) + chance)
  chance = f(f(skillBonus) * chance)
  return f(f(f(1) / f(hitCount)) * chance)
}

/**
 * `CalculateTensionBonus` — `src/Combat/Main/TensionBonusCalculation.cpp`.
 * The level is divided by ten **as an integer** before it becomes a float, so
 * levels 10 to 19 all give 2.0.
 */
export function calculateTensionBonus(tension: number, attackerLevel: number): number {
  const levelMultiplier = f(1 + f(Math.trunc(attackerLevel / 10)))
  return f(levelMultiplier * f(tension))
}

/** The buff multipliers of `BasicAttackCalculation.cpp`, by level. */
export const buffMultiplier = {
  /** A quarter a level, either way. */
  attack: (level: number): number => f(1 + f(0.25 * level)),
  /** Half again a level up; down, a half at −1 and three quarters at −2. Agility's is the same. */
  defence: (level: number): number =>
    level >= 0 ? f(1 + f(level * 0.5)) : f(1 + f(f((level + 1) * 0.25) - 0.5)),
  /** Half again a level up, and nothing taken off going down. */
  charm: (level: number): number => (level < 0 ? 1 : f(1 + f(0.5 * level))),
  /** Magical might and mending alike: half a level, either way. */
  magic: (level: number): number => f(1 + f(0.5 * level)),
}

/**
 * Whether a blow is a critical — `func_ov000_02156cc4`, overlay 0, the one
 * caller `CalculateCritRate` has.
 *
 * The percentage is multiplied by 100 **as a float**, truncated by `_ffix`,
 * and a draw below 10,000 has to come in under it:
 *
 *     NextRandomMax(random, 10000) < (int)(100.0f * rate)
 *
 * The truncation matters, because `0.01f` is not a hundredth: at 151 of the
 * 850 deftness values past 150 the threshold comes out one lower than
 * `200 + (deftness − 150)`.
 */
export function criticalThreshold(ratePercent: number): number {
  return Math.trunc(f(f(100) * f(ratePercent)))
}

/** The roll itself: one draw, whatever the outcome. */
export function rollsCritical(random: GameRandom, ratePercent: number): boolean {
  return random.max(10_000) < criticalThreshold(ratePercent)
}

/**
 * A monster's critical rate — `func_020748f8`, which overlay 0 calls instead
 * of `CalculateCritRate` for a combatant that is not one of the party's four.
 *
 * `(1 / hits) × (0.0 × skill)`: the base is a literal zero, so **a monster's
 * rate is nothing whatever its skill says**, and it never criticals through
 * this roll. The draw is still spent.
 */
export function calculateMonsterCritRate(skillBonus: number, hitCount = 1): number {
  return f(f(f(1) / f(hitCount)) * f(f(0) * f(skillBonus)))
}

/**
 * The party's rate doubles — `× 2.0f` — when the character has trait `0x11d`
 * and `func_ov000_02155a04` of them is under `0.25f`. What the trait is and
 * what the quarter is a quarter *of* are not read; a quarter of the HP left is
 * the obvious guess and is only that.
 */
export const CRITICAL_DOUBLING = { trait: 0x11d, below: 0.25, times: 2 } as const

/**
 * The surprise round — in `ProcessCombatTurn`, overlay 0. `[battle + 0xe49]`
 * says how the fight opened: at 1 the monsters sit the first round out; at 2
 * the party does, the first monster always acts, and **each monster after it
 * acts only on a draw below 100 coming in under 67**.
 */
export const AMBUSH_FOLLOWER_ACTS_BELOW = 67
export function ambushFollowerActs(random: GameRandom): boolean {
  return random.max(100) < AMBUSH_FOLLOWER_ACTS_BELOW
}

/**
 * The order a blow's draws are made in — `func_ov024_021eb5d0`, the resolver
 * of a blow, overlay 24:
 *
 *   1. **the critical roll**, always — once for the whole action when
 *      `func_ov024_021ea4d0` or `021ea500` says so, else once a target. It
 *      spends its draw for a monster too, whose rate is nothing; only an
 *      action that is always a critical skips it;
 *   2. **the evasion roll**, if the action can be dodged;
 *   3. **the block roll**, if it can be blocked;
 *   4. `func_ov000_02156648` — a percent, a die of four and a die of eight,
 *      **not read**;
 *   5. the damage, `GetAttackBaseDamage`.
 */
export const BLOW_ORDER = ['critical', 'evade', 'block', 'unread', 'damage'] as const

/** A monster's chance of dodging, in a hundred, by the grade in its record — the table at 0x020e88e4. */
export const MONSTER_EVASION = [0, 2, 4, 8, 25] as const

/**
 * A target's chance of dodging, a percentage — `func_ov000_02156270`.
 *
 * One of the party: two, and an accessory's and a skill's bonus. A monster: by
 * its grade. Either doubles under one status and is fifty flat under another;
 * one of the party's doubles again with trait `0xA6` when `func_ov000_02155a04`
 * of them is under `0.08f`, which is not understood.
 */
export function evasionRate(
  target: { party: true; accessory?: number; skill?: number } | { party: false; grade: number },
  status: { doubled?: boolean; fifty?: boolean } = {},
): number {
  let rate: number
  if (target.party) rate = f(f(target.skill ?? 0) + f(f(2) + f(target.accessory ?? 0)))
  else rate = target.grade < 0 || target.grade > 4 ? 0 : (MONSTER_EVASION[target.grade] as number)
  if (status.doubled) rate = f(f(2) * rate)
  return status.fifty ? 50 : rate
}

/** The evasion roll — `func_ov000_02156f98`: a draw below 100 under the rate **truncated**. No draw unless the action can be dodged. */
export function rollsEvade(random: GameRandom, evadable: boolean, ratePercent: number): boolean {
  if (!evadable) return false
  return random.max(100) < Math.trunc(f(ratePercent))
}

/** The block roll — `func_ov000_02156e30`: the draw **as a float** under the rate, untruncated. No draw unless the action can be blocked. */
export function rollsBlock(random: GameRandom, blockable: boolean, ratePercent: number): boolean {
  if (!blockable) return false
  return f(random.max(100)) < f(ratePercent)
}
