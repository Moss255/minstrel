import { u16, u32 } from './bytes.ts'
import { NitroGfxError } from './errors.ts'
import { fx16ToFloat, fx32ToFloat } from './fixed.ts'
import { identity, type Mat4 } from './matrix.ts'

/**
 * A model's objects — its bones — and the local transform each carries.
 *
 * Layout, established by observation. A node's size depends on its flags, and
 * three consecutive nodes of different shapes each land exactly where the
 * object dictionary says the next one begins, which is what pins it down:
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `u16` | flags |
 * | `+0x02` | `u16` | the rotation's first cell, as `fx16` — see below |
 * | then | `fx32[3]` | translation, unless flag bit 0 |
 * | then | | rotation, unless flag bit 1 — pivot form if bit 3, else a 3x3 |
 * | then | `fx32[3]`×2 | scale and its reciprocal, unless flag bit 2 |
 *
 * | flag bit | meaning |
 * |---|---|
 * | 0 | translation is zero |
 * | 1 | rotation is the identity |
 * | 2 | scale is one |
 * | 3 | rotation is stored in the compact "pivot" form |
 * | 4–7 | pivot index: which cell of the 3x3 holds ±1 |
 * | 8, 9 | set on pivot nodes; they do **not** affect the rotation (see below) |
 *
 * **A full 3x3 rotation is stored as eight cells, not nine.** The ninth — cell
 * `[0][0]` — lives in the `u16` at `+0x02`, which is otherwise mistaken for
 * padding. Reading nine consecutive cells instead makes every such node two
 * bytes too long, and the 4,578 nodes on the reference cartridge that use this
 * form then land off the dictionary's offsets.
 */

export interface NodeTransform {
  readonly index: number
  readonly name: string
  readonly flags: number
  /** Local transform, ready to compose with a parent's. */
  readonly local: Mat4
}

/**
 * Build the 3x3 of a pivot rotation.
 *
 * The compact form stores a rotation about one axis: a single cell is ±1, its
 * row and column are otherwise zero, and the two remaining rows and columns
 * carry `[[a, b], [-b, a]]`, where `a` and `b` are the cosine and sine of the
 * angle. The pivot index selects the cell in row-major order.
 *
 * **The pivot cell's sign is not free.** Expanding the determinant along that
 * cell gives `det = (-1)^(row + col) * sign * 1`, so a rotation — determinant
 * +1 — forces `sign = (-1)^(row + col)`. That, with the fixed 2x2 above, makes
 * every one of the reference cartridge's 4,644 pivot nodes come out orthonormal
 * with determinant +1. Flag bits 8 and 9 are set on many of them and turn out
 * not to affect the rotation at all; what they mean is not established.
 *
 * `a * a + b * b == 1` holds for all 4,644, which is what confirms the two
 * values are read correctly and only their placement was ever in question.
 */
function pivotRotation(out: Mat4, pivot: number, a: number, b: number): void {
  const row = Math.floor(pivot / 3)
  const col = pivot % 3
  const set = (r: number, c: number, v: number) => {
    out[c * 4 + r] = v
  }

  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) set(r, c, 0)
  set(row, col, (row + col) % 2 === 0 ? 1 : -1)

  const rows = [0, 1, 2].filter((r) => r !== row)
  const cols = [0, 1, 2].filter((c) => c !== col)
  set(rows[0] as number, cols[0] as number, a)
  set(rows[0] as number, cols[1] as number, b)
  set(rows[1] as number, cols[0] as number, -b)
  set(rows[1] as number, cols[1] as number, a)
}

/** Read one node's transform, returning it and the number of bytes it occupied. */
export function readNode(
  data: Uint8Array,
  at: number,
  index: number,
  name: string,
): { node: NodeTransform; size: number } {
  const flags = u16(data, at, `node[${index}].flags`)
  // Doubles as the rotation's [0][0] when a full 3x3 follows.
  const firstRotationCell = u16(data, at + 2, `node[${index}].rot00`)
  let cursor = at + 4

  const local = identity()

  if ((flags & 0x01) === 0) {
    local[12] = fx32ToFloat(u32(data, cursor + 0, `node[${index}].tx`))
    local[13] = fx32ToFloat(u32(data, cursor + 4, `node[${index}].ty`))
    local[14] = fx32ToFloat(u32(data, cursor + 8, `node[${index}].tz`))
    cursor += 12
  }

  if ((flags & 0x02) === 0) {
    if ((flags & 0x08) !== 0) {
      const a = fx16ToFloat(u16(data, cursor + 0, `node[${index}].pivotA`))
      const b = fx16ToFloat(u16(data, cursor + 2, `node[${index}].pivotB`))
      pivotRotation(local, (flags >> 4) & 0x0f, a, b)
      cursor += 4
    } else {
      // Cell [0][0] came from the header word; the other eight follow in
      // row-major order.
      local[0] = fx16ToFloat(firstRotationCell)
      const cells: [number, number][] = [
        [0, 1],
        [0, 2],
        [1, 0],
        [1, 1],
        [1, 2],
        [2, 0],
        [2, 1],
        [2, 2],
      ]
      for (const [r, c] of cells) {
        local[c * 4 + r] = fx16ToFloat(u16(data, cursor, `node[${index}].rot`))
        cursor += 2
      }
    }
  }

  if ((flags & 0x04) === 0) {
    const sx = fx32ToFloat(u32(data, cursor + 0, `node[${index}].sx`))
    const sy = fx32ToFloat(u32(data, cursor + 4, `node[${index}].sy`))
    const sz = fx32ToFloat(u32(data, cursor + 8, `node[${index}].sz`))
    cursor += 24 // scale, then its reciprocal
    for (let r = 0; r < 3; r++) {
      local[0 * 4 + r] = (local[0 * 4 + r] as number) * sx
      local[1 * 4 + r] = (local[1 * 4 + r] as number) * sy
      local[2 * 4 + r] = (local[2 * 4 + r] as number) * sz
    }
  }

  if (cursor > data.length) {
    throw new NitroGfxError(`node[${index}] '${name}' runs past the end of the model`, at)
  }
  return { node: { index, name, flags, local }, size: cursor - at }
}
