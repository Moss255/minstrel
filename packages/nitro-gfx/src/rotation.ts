import type { Mat4 } from './matrix.ts'

/**
 * The two compact 3x3 rotations Nitro files store.
 *
 * Both appear twice over: in a model's nodes (`node.ts`) and in an animation's
 * rotation pools (`nsbca.ts`). The encodings are identical in each place, which
 * is part of what confirms them — see `FORMAT.md`.
 */

/**
 * Place a cell of the 3x3.
 *
 * **The file's five stored values are a column and part of the next, not a row
 * and part of the next.** The DS keeps a matrix column by column, and reading
 * the same bytes as rows builds the transpose — which, a rotation being
 * orthonormal, is its inverse. Nothing about the shape of the data says which
 * way round it is: both readings are orthonormal, both have determinant one,
 * and a model whose node rotations are all identity — as the slice's character
 * is — poses identically either way.
 *
 * What says it is the animation. Read as rows, the character's idle raises its
 * arms straight over its head and stands 9.71 units where its bind pose is
 * 7.68; read as columns it stands at 7.89 with its arms at its sides. Every
 * `mp0200` motion is nearer the bind pose's height read this way, which is what
 * `FORMAT.md` records.
 *
 * So `row` and `col` here name the cell of the logical matrix, and the callers
 * hand their stored values in transposed.
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
  // Stored column-major, so the selected cell and the block around it are
  // placed transposed — see `set`.
  set(out, col, row, (row + col) % 2 === 0 ? 1 : -1)

  const rows = [0, 1, 2].filter((r) => r !== row)
  const cols = [0, 1, 2].filter((c) => c !== col)
  set(out, cols[0] as number, rows[0] as number, a)
  set(out, cols[1] as number, rows[0] as number, b)
  set(out, cols[0] as number, rows[1] as number, -b)
  set(out, cols[1] as number, rows[1] as number, a)
}

/**
 * Build the 3x3 of a *basis* rotation from the five values stored for it.
 *
 * The five are the whole of row 0 and the first two cells of row 1. Row 1's
 * third cell is not stored, and a rotation gives two ways to recover it:
 * `row0 . row1 == 0` fixes it directly, and `|row1| == 1` fixes its magnitude
 * with the dot product supplying only the sign.
 *
 * **Both are unstable, in opposite regimes, and the values are quantised.**
 * Solving from the dot product divides by `row0[2]`, so it loses the matrix
 * when that cell is near zero — 525 of the cartridge's stored rotations.
 * Solving from the magnitude divides the error by `f` itself, so it fails when
 * the true `f` is near zero: a rotation about one axis stores the neighbouring
 * cell as 0.9998, the closest 1.0.15 comes to 1, and `sqrt(1 - d² - e²)` turns
 * that quantisation into a spurious 0.022 where the dot product says 0.0001.
 * That accounts for 300 more.
 *
 * So pick by conditioning: whichever of `|row0[2]|` and the magnitude estimate
 * is larger is the better-conditioned denominator, and where they are equal —
 * both zero, on a rotation about the z axis whose `d² + e²` quantises to just
 * over one — the magnitude form gives the right answer of zero while the other
 * divides by it. Then normalise, because the stored values are a quantised
 * rotation and the nearest true rotation is what they mean; row 2 is the cross
 * product of the first two either way.
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
  let f: number
  if (Math.abs(c) > magnitude && c !== 0) f = -(a * d + b * e) / c
  else f = error(magnitude) <= error(-magnitude) ? magnitude : -magnitude

  const r0 = normalise(a, b, c)
  const r1 = normalise(d, e, f)
  const r2: [number, number, number] = [
    r0[1] * r1[2] - r0[2] * r1[1],
    r0[2] * r1[0] - r0[0] * r1[2],
    r0[0] * r1[1] - r0[1] * r1[0],
  ]

  // The stored triples are columns of the rotation, so they go down the
  // matrix rather than across it.
  for (let k = 0; k < 3; k++) {
    set(out, k, 0, r0[k] as number)
    set(out, k, 1, r1[k] as number)
    set(out, k, 2, r2[k] as number)
  }
}

/** Scale a vector to unit length, leaving a zero vector alone. */
function normalise(x: number, y: number, z: number): [number, number, number] {
  const length = Math.hypot(x, y, z)
  if (length === 0 || !Number.isFinite(length)) return [x, y, z]
  return [x / length, y / length, z / length]
}
