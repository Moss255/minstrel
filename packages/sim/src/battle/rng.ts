/**
 * The battle's random numbers: a 64-bit linear congruential generator.
 *
 * Translated from DQIX/BattleEmulator's `lcg.cpp` (MIT, © 2024 DaisukeDaisuke),
 * which reproduces the game's own: the state steps as
 * `state × 0x5d588b656c078965 + 0x269ec3`, modulo 2⁶⁴, and each draw is the
 * state's top 32 bits — the first draw the seed's own, before any step. A value
 * below `max` is `(top × max) >> 32`, its `getPercent`.
 *
 * `BigInt` keeps the 64-bit state exact: a battle draws a handful of numbers a
 * turn, not a frame's worth. What is *made* of a draw is the game's own 32-bit
 * float arithmetic, each step through `Math.fround` — `below`, `float01`,
 * `floatBetween` — because that rounding is part of the answer.
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

  /**
   * A float from 0 to 1 — the game's `NextRandomFloat01` (0x0207434c): the
   * draw over `(double) 0xFFFFFFFF`, narrowed to a 32-bit float. It reaches
   * 1.0 exactly when every bit of the draw is set.
   */
  float01(): number {
    return Math.fround(this.top32() / 0xffffffff)
  }

  /**
   * A whole number from 0 to `max − 1` — the game's `NextRandomMax`
   * (0x020742fc): `max × float01`, **the product a 32-bit float's**, truncated,
   * and held below the maximum for the draw that makes the float 1.0.
   *
   * It was `(top × max) >> 32`, the reference emulator's `getPercent` and
   * exact. The two agree on every draw for a coin or a die and part about once
   * in four thousand at 10,000, by one, because the game's float has 24
   * significant bits. The game's is the one a battle is replayed against — see
   * `CLAUDE.md`, "Fixed-point in simulation", for why a float is allowed here.
   */
  below(max: number): number {
    if (max <= 0) {
      // The game hands back 0 without drawing; a caller asking is a bug here.
      return 0
    }
    const result = Math.trunc(Math.fround(Math.fround(max) * this.float01()))
    return result >= max ? max - 1 : result
  }

  /**
   * A float between two — the game's `NextRandomFloatBetween` (0x02074388):
   * `(max − min) × float01 + min`, each step a 32-bit float's.
   */
  floatBetween(min: number, max: number): number {
    const f = Math.fround
    return f(f(f(f(max) - f(min)) * this.float01()) + f(min))
  }
}
