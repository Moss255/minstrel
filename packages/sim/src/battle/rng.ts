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

  /**
   * A generator that draws what the game would from the state `state`.
   *
   * **The game steps before it draws and this draws before it steps.** Its
   * `NextRandom` (0x020742c0 in the decomp's `src/Util/Random.cpp`) advances
   * the state and hands back the new one's top 32 bits; `top32` here hands
   * back the seed's own top first, as the reference emulator does. The two are
   * one sequence a step apart, so a state read out of the running game —
   * `GetRandomStateHi` and `Lo` — has to be stepped once to seed this.
   */
  static fromGameState(state: bigint): BattleRng {
    return new BattleRng(((state & MASK) * MULTIPLIER + INCREMENT) & MASK)
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
