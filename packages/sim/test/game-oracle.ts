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
