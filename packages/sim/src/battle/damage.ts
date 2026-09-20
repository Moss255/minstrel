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
 * in the 32-bit floats it computes in — `physicalDamage`, `criticalChance`,
 * `criticalBlow`, `criticalHit`, `criticalDamage`, `drawnAmount`, `partyAmount` and
 * `blockChance` so far — and held to `packages/sim/test/game-oracle.ts`. See `CLAUDE.md`,
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
 * What a critical is worth when it is an attack's — the game's
 * `func_02074838` with its flag set: the attacker's attack power times a draw
 * from 0.95 to 1.05, in the game's floats. The reference emulator's
 * `OffensivePower × floatRand(0.95, 1.05)`, now read from the game.
 */
export function criticalBlow(rng: BattleRng, attack: number): number {
  return Math.trunc(Math.fround(Math.fround(attack) * rng.floatBetween(0.95, 1.05)))
}

/**
 * An ordinary blow's critical hit, whole — the game's, from the head of
 * `func_ov024_021e6a90`: **the greatest of three**. The blow's own damage and
 * a fifth; the attacker's attack power times a draw from 0.95 to 1.05; and the
 * blow's own damage, as a floor.
 *
 * `base` is the damage already worked out, whose draws the game spends first;
 * this spends the one more. With any attack worth the name the middle one
 * wins, which is why the reference has only that — and with an attack of two
 * or three against no defence, it does not.
 */
export function criticalHit(rng: BattleRng, base: number, attack: number): number {
  const f = Math.fround
  const boosted = f(f(1.2) * f(base))
  const drawn = f(f(attack) * rng.floatBetween(0.95, 1.05))
  let damage = boosted < drawn ? drawn : boosted
  if (damage < f(base)) damage = f(base)
  return Math.trunc(damage)
}

/**
 * An amount drawn as a base give or take a spread — the game's, from
 * `GetAttackBaseDamage` (overlay 24, `0x021e7bc0`) for an action with a range:
 * `base + NextRandomFloatBetween(−spread, spread)` in its floats, and the
 * `_ffix` it returns through, which truncates toward nothing. One draw.
 *
 * **This is a monster's amount whole**, the base its own (the range's low ten
 * bits), and the last step of one of the party's — see {@link partyAmount}.
 * The reference's `FUN_021e8458_typeD` is this. What a healing item restores
 * *outside* a battle is drawn so too, which is ours: that is not this function.
 */
export function drawnAmount(rng: BattleRng, base: number, spread: number): number {
  const f = Math.fround
  const low = f(f(-1) * f(spread))
  return Math.trunc(f(f(base) + rng.floatBetween(low, f(spread))))
}

/** What one of the party's amount is made from — a range's party half, and how the action scales. */
export interface PartyAmount {
  /** The least: the range's second ten bits. */
  readonly min: number
  /** The most: its third. */
  readonly max: number
  /**
   * The number of the user's it scales by, and between what — for an action
   * whose record says it scales (`+0x18` bits 16–17 at 2) and names a number
   * (`+0x10` bit 14 magical might, bit 15 magical mending). `lo` and `hi` are
   * the record's `+0x04` bits 12–21 and 22–31: Frizz's 50 and 999.
   */
  readonly scales?: { readonly stat: number; readonly lo: number; readonly hi: number }
}

/**
 * One of the party's amount — the same function's other arm.
 *
 * **Scaling by a number of the user's**: at or under `lo` the least, at or over
 * `hi` the most, and between them `(stat − lo) × ((max − min) / (hi − lo))`,
 * truncated, on top of the least — then give or take the spread. One draw.
 *
 * **Not scaling** — a medicinal herb — the base is *drawn* between the least
 * and the most, and then give or take the spread. **Two draws**, the first
 * spent even when the least and the most are the same, as the herb's 35 and
 * 35 are.
 *
 * Not here: six skills (Gigaslash among them) that scale by a number put
 * together from the user's and what they hold, by a table at `0x021fe8b6`.
 */
export function partyAmount(rng: BattleRng, amount: PartyAmount, spread: number): number {
  const f = Math.fround
  const { min, max, scales } = amount
  if (!scales) {
    const base = rng.floatBetween(min, max)
    const low = f(f(-1) * f(spread))
    return Math.trunc(f(base + rng.floatBetween(low, f(spread))))
  }
  const { stat, lo, hi } = scales
  let base: number
  if (stat <= lo) base = min
  else if (stat >= hi) base = max
  else base = Math.trunc(f(f(stat - lo) * f(f(max - min) / f(hi - lo)))) + min
  return drawnAmount(rng, base, spread)
}

/**
 * What a critical is worth when it is not an attack's — a spell going haywire
 * — the game's `func_02074838` with its flag clear: the amount times a draw
 * from 1.5 to 2.0, in the game's floats. The reference's
 * `baseDamage × floatRand(1.5, 2.0)`, now read from the game. The game then
 * takes the greater of this and the amount and a fifth, which this always is.
 */
export function criticalDamage(rng: BattleRng, damage: number): number {
  return Math.trunc(Math.fround(Math.fround(damage) * rng.floatBetween(1.5, 2)))
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

/**
 * One of the party's chance of blocking, in a hundred — the game's
 * `func_ov000_02156118` for a character: **nothing without a shield**, and with
 * one, what every piece worn says of blocking, each a number of tenths divided
 * by `10.0f` and summed in the game's floats (`func_02084ee8`, over the eleven
 * places in their order).
 *
 * Not here, and in the game's: a whole-number bonus from three of the shield
 * skill's traits (`func_02085b88`), and a doubling under a status not
 * established (`func_ov000_02156258`). Nothing the slice plays has either.
 *
 * It is not truncated, and the draw it meets is a float: the bronze shield's
 * 0.5 blocks on a draw of 0 — once in a hundred — and the steel shield's 1.5
 * on 0 or 1.
 */
export function blockChance(hasShield: boolean, tenths: readonly number[]): number {
  if (!hasShield) return 0
  const f = Math.fround
  let sum = f(0)
  for (const each of tenths) sum = f(sum + f(f(each) / f(10)))
  return sum
}
