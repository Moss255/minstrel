/**
 * 4x4 column-major matrices, as WebGL expects them.
 *
 * Floats, for rendering only. The DS computes these in fixed point; gameplay
 * maths lives in `@vesper/fixed` and must never take a value from here.
 */

export type Mat4 = Float32Array

export function identity(out: Mat4 = new Float32Array(16)): Mat4 {
  out.fill(0)
  out[0] = 1
  out[5] = 1
  out[10] = 1
  out[15] = 1
  return out
}

/** `out = a * b`, applying `b` first. */
export function multiply(a: Mat4, b: Mat4, out: Mat4 = new Float32Array(16)): Mat4 {
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + row] as number) * (b[col * 4 + k] as number)
      out[col * 4 + row] = sum
    }
  }
  return out
}

/** Transform a point, assuming the matrix's bottom row is `0 0 0 1`. */
export function transformPoint(m: Mat4, x: number, y: number, z: number): [number, number, number] {
  return [
    (m[0] as number) * x + (m[4] as number) * y + (m[8] as number) * z + (m[12] as number),
    (m[1] as number) * x + (m[5] as number) * y + (m[9] as number) * z + (m[13] as number),
    (m[2] as number) * x + (m[6] as number) * y + (m[10] as number) * z + (m[14] as number),
  ]
}

/** Weighted sum of matrices, as the geometry engine's blend does. */
export function blend(
  sources: readonly Mat4[],
  weights: readonly number[],
  out: Mat4 = new Float32Array(16),
): Mat4 {
  out.fill(0)
  for (let i = 0; i < sources.length; i++) {
    const m = sources[i] as Mat4
    const w = weights[i] as number
    for (let k = 0; k < 16; k++) out[k] = (out[k] as number) + (m[k] as number) * w
  }
  return out
}
