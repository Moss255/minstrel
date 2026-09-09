/**
 * 4x4 column-major matrices, as WebGL expects them.
 *
 * Floats, for rendering only. The DS computes these in fixed point; gameplay
 * maths lives in `@minstrel/fixed` and must never take a value from here.
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

/**
 * Invert a matrix whose bottom row is `0 0 0 1`.
 *
 * That covers every transform a model or an animation builds — rotation, scale
 * and translation — and lets the inverse be taken from a 3x3 inverse and one
 * transformed translation rather than a general 4x4 solve.
 *
 * A singular 3x3 — a bone scaled to nothing on some axis — has no inverse; the
 * identity is returned instead, which leaves the vertex where it was rather
 * than sending it to infinity.
 */
export function invertAffine(m: Mat4, out: Mat4 = new Float32Array(16)): Mat4 {
  const a = m[0] as number
  const b = m[4] as number
  const c = m[8] as number
  const d = m[1] as number
  const e = m[5] as number
  const f = m[9] as number
  const g = m[2] as number
  const h = m[6] as number
  const i = m[10] as number

  const A = e * i - f * h
  const B = f * g - d * i
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  if (det === 0 || !Number.isFinite(det)) return identity(out)
  const s = 1 / det

  out[0] = A * s
  out[1] = B * s
  out[2] = C * s
  out[3] = 0
  out[4] = (c * h - b * i) * s
  out[5] = (a * i - c * g) * s
  out[6] = (b * g - a * h) * s
  out[7] = 0
  out[8] = (b * f - c * e) * s
  out[9] = (c * d - a * f) * s
  out[10] = (a * e - b * d) * s
  out[11] = 0

  const x = m[12] as number
  const y = m[13] as number
  const z = m[14] as number
  out[12] = -((out[0] as number) * x + (out[4] as number) * y + (out[8] as number) * z)
  out[13] = -((out[1] as number) * x + (out[5] as number) * y + (out[9] as number) * z)
  out[14] = -((out[2] as number) * x + (out[6] as number) * y + (out[10] as number) * z)
  out[15] = 1
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
