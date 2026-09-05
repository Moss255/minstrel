import type { Mat4 } from './matrix.ts'

/**
 * The two compact 3x3 rotations Nitro files store.
 *
 * Both appear twice over: in a model's nodes (`node.ts`) and in an animation's
 * rotation pools (`nsbca.ts`). The encodings are identical in each place, which
 * is part of what confirms them — see `FORMAT.md`.
 */

function set(out: Mat4, row: number, col: number, value: number): void {
  out[col * 4 + row] = value
}

/**
 * Build the 3x3 of a *pivot* rotation: a rotation about one axis.
 *
 * A single cell is ±1, its row and column are otherwise zero, and the two
 * remaining rows and columns carry `[[a, b], [-b, a]]`, where `a` and `b` are
 * the cosine and sine of the angle. `pivot` selects the ±1 cell in row-major
 * order.
 *
 * **The pivot cell's sign is not free.** Expanding the determinant along that
 * cell gives `det = (-1)^(row + col) * sign`, so a rotation — determinant +1 —
 * forces `sign = (-1)^(row + col)`.
 */
export function pivotRotation(out: Mat4, pivot: number, a: number, b: number): void {
  const row = Math.floor(pivot / 3)
  const col = pivot % 3

  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) set(out, r, c, 0)
  set(out, row, col, (row + col) % 2 === 0 ? 1 : -1)

  const rows = [0, 1, 2].filter((r) => r !== row)
  const cols = [0, 1, 2].filter((c) => c !== col)
  set(out, rows[0] as number, cols[0] as number, a)
  set(out, rows[0] as number, cols[1] as number, b)
  set(out, rows[1] as number, cols[0] as number, -b)
  set(out, rows[1] as number, cols[1] as number, a)
}

/**
 * Build the 3x3 of a *basis* rotation from the five values stored for it.
 *
 * The five are the whole of row 0 and the first two cells of row 1. Row 1's
 * third cell is recovered from the two constraints a rotation must satisfy:
 * `|row1| == 1` fixes its magnitude and `row0 . row1 == 0` fixes its sign.
 * Row 2 is then the cross product of the first two.
 *
 * Solving for the magnitude rather than straight from `row0 . row1 == 0` is
 * what makes this stable: the direct solution divides by `row0[2]`, and on the
 * reference cartridge 525 of 6,963 stored rotations have a `row0[2]` small
 * enough for that to lose the matrix. Taking the magnitude first brings all
 * 6,963 out orthonormal.
 */
export function basisRotation(
  out: Mat4,
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
): void {
  const magnitude = Math.sqrt(Math.max(0, 1 - d * d - e * e))
  const error = (f: number) => Math.abs(a * d + b * e + c * f)
  const f = error(magnitude) <= error(-magnitude) ? magnitude : -magnitude

  set(out, 0, 0, a)
  set(out, 0, 1, b)
  set(out, 0, 2, c)
  set(out, 1, 0, d)
  set(out, 1, 1, e)
  set(out, 1, 2, f)
  set(out, 2, 0, b * f - c * e)
  set(out, 2, 1, c * d - a * f)
  set(out, 2, 2, a * e - b * d)
}
