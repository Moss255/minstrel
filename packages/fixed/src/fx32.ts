import { FixedError } from './errors.ts'

/**
 * `fx32` — the DS SDK's 1.19.12 fixed-point number.
 *
 * One sign bit, nineteen integer bits, twelve fractional. Every gameplay
 * quantity in this engine is one of these: positions, velocities, speeds,
 * anything an original constant would have been expressed in.
 *
 * **This is not a stylistic preference.** The cartridge's own world is laid out
 * in these units — a collision mesh stores its vertices as whole `fx32` values,
 * and a model's node translations are `fx32` too — so working in them is
 * working in the game's coordinates rather than in a conversion of them. And a
 * float that slips into a gameplay calculation does not announce itself: it
 * changes the low bits of a position, which changes what the RNG is asked
 * later, and the divergence surfaces months afterwards as a replay that no
 * longer matches.
 *
 * The brand is what enforces it. A plain `number` will not typecheck as an
 * `Fx32`, so a float can only enter through {@link fx32} or {@link fromInt},
 * both of which are deliberate.
 */
export type Fx32 = number & { readonly __fx32: unique symbol }

/** Fractional bits. */
export const FX32_SHIFT = 12

/** The value 1.0. */
export const FX32_ONE = (1 << FX32_SHIFT) as Fx32

/** The largest and smallest values a 32-bit `fx32` holds. */
const FX32_MAX = 0x7fffffff
const FX32_MIN = -0x80000000

/**
 * Take a raw `fx32` word as one.
 *
 * This is the entry point for values that are already in the format — a
 * collision vertex, a node translation — and it is a check, not a conversion.
 */
export function fx32(raw: number): Fx32 {
  if (!Number.isInteger(raw)) {
    throw new FixedError(`${raw} is not a whole fx32 word; use fromInt or scale it yourself`)
  }
  if (raw > FX32_MAX || raw < FX32_MIN) {
    throw new FixedError(`${raw} does not fit in a 32-bit fx32`)
  }
  return raw as Fx32
}

/** The whole number `value`, as an `fx32`. */
export function fromInt(value: number): Fx32 {
  if (!Number.isInteger(value)) throw new FixedError(`${value} is not a whole number`)
  const raw = value * FX32_ONE
  if (raw > FX32_MAX || raw < FX32_MIN) throw new FixedError(`${value} does not fit in an fx32`)
  return raw as Fx32
}

/**
 * The integer part, rounded towards zero.
 *
 * `toInt` and {@link floorToInt} differ for negative values, and which one a
 * calculation wants is rarely arbitrary — a grid cell index wants the floor.
 */
export function toInt(value: Fx32): number {
  return value < 0 ? -(-value >> FX32_SHIFT) : value >> FX32_SHIFT
}

/** The integer part, rounded towards negative infinity. */
export function floorToInt(value: Fx32): number {
  return value >> FX32_SHIFT
}

/**
 * As a float.
 *
 * **For rendering and for reporting only.** Nothing that feeds back into a
 * gameplay calculation may go through here.
 */
export function toFloat(value: Fx32): number {
  return value / FX32_ONE
}

export function add(a: Fx32, b: Fx32): Fx32 {
  return ((a + b) | 0) as Fx32
}

export function sub(a: Fx32, b: Fx32): Fx32 {
  return ((a - b) | 0) as Fx32
}

export function neg(a: Fx32): Fx32 {
  return (-a | 0) as Fx32
}

/**
 * `a * b`, in 1.19.12.
 *
 * The product of two 1.19.12 values has twenty-four fractional bits, so it is
 * shifted back down by twelve. The intermediate needs more than 32 bits, and
 * `Math.imul` gives exactly the low 32 — so the halves are multiplied
 * separately and recombined, which keeps the whole thing in integer arithmetic
 * rather than routing it through a double.
 */
export function mul(a: Fx32, b: Fx32): Fx32 {
  const aHigh = a >> FX32_SHIFT
  const aLow = a - (aHigh << FX32_SHIFT)
  const bHigh = b >> FX32_SHIFT
  const bLow = b - (bHigh << FX32_SHIFT)

  const high = Math.imul(aHigh, bHigh) << FX32_SHIFT
  const middle = Math.imul(aHigh, bLow) + Math.imul(aLow, bHigh)
  const low = Math.imul(aLow, bLow) >> FX32_SHIFT
  return ((high + middle + low) | 0) as Fx32
}

/**
 * `a / b`, in 1.19.12.
 *
 * Division has no integer-only form that stays exact in 32 bits, so this is the
 * one operation that goes through a double — but it starts and ends on whole
 * words, so the result is still a value the format can hold, and two runs of
 * the same inputs give the same output on every machine. Dividing by zero is a
 * bug in the caller, not a value to propagate.
 */
export function div(a: Fx32, b: Fx32): Fx32 {
  if (b === 0) throw new FixedError('division by zero')
  return (Math.trunc((a * FX32_ONE) / b) | 0) as Fx32
}

/** `value`, held between `low` and `high`. */
export function clamp(value: Fx32, low: Fx32, high: Fx32): Fx32 {
  if (low > high) throw new FixedError(`clamp range ${low}..${high} is inverted`)
  return (value < low ? low : value > high ? high : value) as Fx32
}

/**
 * The squared length of a 3-vector, as an `fx32`.
 *
 * Squared, because comparing two distances never needs a square root and taking
 * one costs precision. Reach for {@link length} only when the magnitude itself
 * is wanted.
 *
 * **Range.** The result is an `fx32` like any other, so it saturates the format
 * for vectors longer than about 724 units. Map coordinates run to ±8, so that
 * is not a limit anything here approaches — but a caller comparing large
 * distances should compare component-wise instead.
 */
export function lengthSquared(x: Fx32, y: Fx32, z: Fx32): Fx32 {
  return add(add(mul(x, x), mul(y, y)), mul(z, z))
}

/**
 * The length of a 3-vector.
 *
 * A neat property of the format makes this exact: squaring a raw word squares
 * the scale too, so the square root of the summed raw squares comes back out at
 * the original scale. No shifting, and no intermediate `fx32` to overflow —
 * which the squared length would, being an `fx32` itself.
 *
 * The root is taken by integer Newton iteration seeded from the value rather
 * than from `Math.sqrt`. That matters: `Math.sqrt` is only required to be
 * *approximately* correct, so two engines may seed differently, and Newton's
 * method on integers can settle into a two-cycle near convergence — meaning the
 * seed could decide the last bit. The descending form below provably lands on
 * `floor(sqrt(n))` from any start at or above it, so the answer is the same
 * everywhere.
 *
 * Every intermediate stays below 2^53, where a double is exact on integers, for
 * any component up to about thirteen thousand units.
 */
export function length(x: Fx32, y: Fx32, z: Fx32): Fx32 {
  const sum = x * x + y * y + z * z
  if (sum <= 0) return 0 as Fx32
  if (sum > Number.MAX_SAFE_INTEGER) {
    throw new FixedError('vector is too long to measure without losing precision')
  }
  return isqrt(sum) as Fx32
}

/** `floor(sqrt(n))` for a non-negative integer below 2^53. */
function isqrt(n: number): number {
  if (n < 2) return n
  let x = n
  let y = Math.floor((x + 1) / 2)
  while (y < x) {
    x = y
    y = Math.floor((x + Math.floor(n / x)) / 2)
  }
  return x
}
