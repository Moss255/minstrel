import type { BattleRng } from './rng.ts'

/**
 * A battle's arithmetic, in whole numbers.
 *
 * Translated from DQIX/BattleEmulator's `BattleEmulator.cpp` (MIT, © 2024
 * DaisukeDaisuke), which reproduces the game's own and names the functions by
 * their addresses in it. Where the reference uses a double, the same quantity
 * is computed here exactly in integers; the golden test holds each to the
 * reference's own output.
 *
 * **What has since been read from the game's own code is the game's instead**,
 * in the 32-bit floats it computes in — `physicalDamage` and `criticalChance`
 * so far — and held to `packages/sim/test/game-oracle.ts`. See `CLAUDE.md`,
 * "Fixed-point in simulation", and `docs/conformance.md`.
 */

/**
 * Physical damage — the game's `CalculatePhysicalDamage` (0x020744c0,
 * `src/Combat/Main/BasicAttackCalculation.cpp` in the decomp), in the 32-bit
 * floats it computes in, truncated as its caller `GetAttackBaseDamage` does by
 * returning it as an `int`.
 *
 * `(attack − defence / 2) / 2`, and nothing when that is not positive. If it
 * is more than attack/16, spread by up to a sixteenth of itself either way and
 * then by up to one more (two draws); if it is not, anything from 0 to
 * attack/16 (one draw).
 *
 * It was the reference emulator's fixed-point version, exact in 32.32, and
 * that agreed with this to a case in a million. This is the game's.
 */
export function physicalDamage(rng: BattleRng, attack: number, defence: number): number {
  const f = Math.fround
  let damage = f(f(f(attack) - f(f(defence) / 2)) / 2)
  if (damage <= 0) return 0
  const minimum = f(f(attack) / 16)
  if (damage <= minimum) {
    damage = rng.floatBetween(0, minimum)
  } else {
    const limit = f(damage / 16)
    const percentage = rng.floatBetween(f(0 - limit), limit)
    const flat = rng.floatBetween(-1, 1)
    damage = f(f(damage + percentage) + flat)
  }
  return damage <= 0 ? 0 : Math.trunc(damage)
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
 * The chance of a critical hit on an ordinary blow, in 10,000 — what a draw
 * below 10,000 has to come in under.
 *
 * The game's `CalculateCritRate` (`src/Combat/Main/CritRateCalculation.cpp` in
 * the decomp) for one hit with no accessory, book or skill behind it, and then
 * its caller's `(int)(100.0f × rate)`: two in a hundred to begin with, and
 * **deftness counts only past 150**, a hundredth of a point each.
 *
 * **In the game's floats, because the rounding is part of the answer.** `0.01f`
 * is not a hundredth and the `int` truncates, so at 151 of the 850 values past
 * 150 this is one under `200 + (deftness − 150)`: deftness 159 gives 208. The
 * reference emulator's 200 is this at any deftness up to 150; its 500s are a
 * bonus the function adds, not a level.
 *
 * The three bonuses and the sharing-out over a move of several hits are in the
 * game's function and not here: nothing the slice plays has one.
 * `packages/sim/test/game-oracle.ts` has the whole of it.
 */
export function criticalChance(deftness: number): number {
  const f = Math.fround
  // The `short` the game narrows to before it looks at the sign.
  const past = Math.max(0, ((deftness - 150) << 16) >> 16)
  const rate = f(f(2) + f(f(0.01) * f(past)))
  return Math.trunc(f(f(100) * rate))
}
