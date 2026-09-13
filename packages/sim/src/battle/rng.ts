/**
 * The battle's random numbers: a 64-bit linear congruential generator.
 *
 * Translated from DQIX/BattleEmulator's `lcg.cpp` (MIT, © 2024 DaisukeDaisuke),
 * which reproduces the game's own: the state steps as
 * `state × 0x5d588b656c078965 + 0x269ec3`, modulo 2⁶⁴, and each draw is the
 * state's top 32 bits — the first draw the seed's own, before any step. A value
 * below `max` is `(top × max) >> 32`, its `getPercent`.
 *
 * `BigInt` keeps the 64-bit arithmetic exact, and no float enters: a battle
 * draws a handful of numbers a turn, not a frame's worth.
 */

const MULTIPLIER = 0x5d588b656c078965n
const INCREMENT = 0x269ec3n
const MASK = (1n << 64n) - 1n

export class BattleRng {
  #state: bigint
  #drawn = 0

  constructor(seed: bigint) {
    this.#state = seed & MASK
  }

  /** How many numbers have been drawn: the reference's `position`. */
  get drawn(): number {
    return this.#drawn
  }

  /** The next draw: the state's top 32 bits, then a step. */
  top32(): number {
    const top = Number(this.#state >> 32n)
    this.#state = (this.#state * MULTIPLIER + INCREMENT) & MASK
    this.#drawn++
    return top
  }

  /** A whole number from 0 to `max − 1` — the reference's `getPercent`. */
  below(max: number): number {
    return Number((BigInt(this.top32()) * BigInt(max)) >> 32n)
  }
}
