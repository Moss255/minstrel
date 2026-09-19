import type { BattleRng } from './rng.ts'

/**
 * A battle's arithmetic, in whole numbers.
 *
 * Translated from DQIX/BattleEmulator's `BattleEmulator.cpp` (MIT, © 2024
 * DaisukeDaisuke), which reproduces the game's own and names the functions by
 * their addresses in it. Where the reference uses a double, the same quantity
 * is computed here exactly in integers, so no float enters the simulation; the
 * golden test holds each to the reference's own output.
 */

/**
 * Physical damage — the game's `FUN_0207564c`, from the reference's
 * fixed-point version, in 32.32 fixed point.
 *
 * With `base = 2 × attack − defence`: nothing when `base` is not positive.
 * Otherwise a quarter of `base` — attack/2 − defence/4 — if that is more than
 * attack/16, spread by up to a sixteenth of itself either way and then by up to
 * one more (two draws); if it is not, anything from 0 to attack/16 (one draw).
 * The whole part is the damage.
 */
export function physicalDamage(rng: BattleRng, attack: number, defence: number): number {
  const base = 2 * attack - defence
  if (base <= 0) return 0
  const quarter = BigInt(base) << 30n
  const sixteenth = BigInt(attack) << 28n
  let result: bigint
  if (quarter > sixteenth) {
    const spreadLimit = quarter >> 4n
    // floatRand(−limit, limit): −limit + top/2³² × 2·limit.
    const spread = ((BigInt(rng.top32()) * spreadLimit) >> 31n) - spreadLimit
    // floatRandAttack: −1 + top/2³¹, in [−1, 1).
    const offset = (BigInt(rng.top32()) << 1n) - (1n << 32n)
    result = quarter + spread + offset
  } else {
    // floatRand(0, attack/16).
    result = (BigInt(rng.top32()) * sixteenth) >> 32n
  }
  if (result <= 0n) return 0
  return Number(result >> 32n)
}

/**
 * Who goes first: agility times a draw from 0.51 to 1.0 — the reference's
 * `speed × floatRand(0.51, 1.0)` — kept as the exact integer
 * `agility × (51·2³² + 49·top)`, which is that product scaled by 100·2³².
 * Compare two with `>`; the reference goes first on a strictly greater one.
 */
export function initiative(rng: BattleRng, agility: number): bigint {
  return BigInt(agility) * (51n * (1n << 32n) + 49n * BigInt(rng.top32()))
}

/**
 * An ordinary attack's critical hit: the attacker's own attack power times a
 * draw from 0.95 to 1.05, whatever the defence — the reference's
 * `OffensivePower × floatRand(0.95, 1.05)` on `ATTACK_ALLY`, truncated — kept
 * as the exact integer `attack × (95·2³² + 10·top) / (100·2³²)`.
 */
export function criticalBlow(rng: BattleRng, attack: number): number {
  const scale = 100n * (1n << 32n)
  return Number((BigInt(attack) * (95n * (1n << 32n) + 10n * BigInt(rng.top32()))) / scale)
}

/**
 * An amount drawn as a base give or take a spread — the reference's
 * `FUN_021e8458_typeD`, `floatRand(−spread, spread) + base`, truncated — kept
 * as the exact integer `((base − spread)·2³² + top·2·spread) / 2³²`, truncated
 * toward zero as the reference's cast is. One draw. What a healing item
 * restores is drawn so: the medicinal herb's 35 ± 5.
 */
export function drawnAmount(rng: BattleRng, base: number, spread: number): number {
  const scaled = (BigInt(base - spread) << 32n) + BigInt(rng.top32()) * BigInt(2 * spread)
  return Number(scaled / (1n << 32n))
}

/**
 * A skill's critical hit: the damage times a draw from 1.5 to 2.0 — the
 * reference's `baseDamage × floatRand(1.5, 2.0)`, truncated — kept as the
 * exact integer `damage × (3·2³² + top) / 2³³`.
 */
export function criticalDamage(rng: BattleRng, damage: number): number {
  return Number((BigInt(damage) * (3n * (1n << 32n) + BigInt(rng.top32()))) >> 33n)
}

/**
 * The chance of a critical hit on an ordinary blow, in 10,000 — the game's
 * `CalculateCritRate` (`src/Combat/Main/CritRateCalculation.cpp` in the
 * decomp), for one hit and with no accessory, book or skill behind it.
 *
 * Two in a hundred to begin with, and **deftness counts only past 150**, a
 * hundredth of a point each — which in 10,000ths is exactly one a point, so
 * nothing is lost keeping it whole. The reference emulator's 200 is this at
 * any deftness up to 150; its 500s are a bonus the function adds, not a level.
 *
 * The three bonuses and the sharing-out over a move of several hits are in the
 * game's function and not here: nothing the slice plays has one, and they are
 * floats there. `packages/sim/test/game-oracle.ts` has the whole of it.
 */
export function criticalChance(deftness: number): number {
  return 200 + Math.max(0, deftness - 150)
}
