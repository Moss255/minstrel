/**
 * Fixed-point conversions for the DS geometry engine.
 *
 * These produce **floats, for rendering only**. Gameplay maths lives in
 * `@vesper/fixed` and must never take a value from here.
 */

/** fx16 is 1.3.12: one sign bit, three integer bits, twelve fractional. */
export const FX16_ONE = 1 << 12

/** fx32 is 1.19.12. */
export const FX32_ONE = 1 << 12

/** Sign-extend an n-bit two's-complement value held in the low bits of `value`. */
export function signExtend(value: number, bits: number): number {
  const shift = 32 - bits
  return (value << shift) >> shift
}

/** Convert a raw fx16 (1.3.12) to a float. */
export function fx16ToFloat(raw: number): number {
  return signExtend(raw & 0xffff, 16) / FX16_ONE
}

/** Convert a raw fx32 (1.19.12) to a float. */
export function fx32ToFloat(raw: number): number {
  return (raw | 0) / FX32_ONE
}

/** Convert a 10-bit 1.0.9 fixed-point value, as used by texture coordinates' siblings. */
export function fx10ToFloat(raw: number): number {
  return signExtend(raw & 0x3ff, 10) / 64
}
