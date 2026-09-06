import { GameFormatError } from './errors.ts'

/**
 * `.col2` — the map collision mesh.
 *
 * A triangle soup with a per-triangle normal and attribute word, plus a grid
 * index that lists which triangles fall in each cell. Established by
 * observation; the evidence is in `FORMAT.md`.
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `u32` | `3` on every file seen |
 * | `+0x04` | `u32` | `unknown_0x04` |
 * | `+0x08` | `s16[6]` | bounding box: min x, y, z then max x, y, z |
 * | `+0x14` | `u32` | triangle count |
 * | `+0x18` | `u16` | grid cell size, always a power of two |
 * | `+0x1A` | `u16` | `unknown_0x1a` |
 * | `+0x1C` | `u32` | `gridX` |
 * | `+0x20` | `u32` | `gridZ` |
 * | `+0x24` | `u32` | offset of the triangles |
 * | `+0x28` | `u32` | offset of the per-cell counts, `u8` each |
 * | `+0x2C` | `u32` | offset of the per-cell starts, `u16` each |
 * | `+0x30` | `u32` | offset of the triangle indices, `u16` each |
 * | `+0x34` | `u32` | count of the trailing records |
 * | `+0x38` | `u32` | offset of them, eight bytes each |
 *
 * The five offsets are in ascending order on every file but one, and the
 * trailing records run to the end.
 */
export const COLLISION_KIND = 3

/** A collision triangle. Positions are the file's own integer units. */
export interface CollisionTriangle {
  readonly vertices: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ]
  /**
   * Face normal, from `fx16`. Equal to the normalised cross product of the
   * triangle's own edges wherever the triangle has area.
   */
  readonly normal: readonly [number, number, number]
  /**
   * Trailing word. Its fields are not established — the values look like packed
   * nibbles, and reading them would take the runtime work this repository does
   * not do. Carried through whole.
   */
  readonly attributes: number
}

/** Where one grid cell's triangles sit in {@link CollisionMesh.cellTriangles}. */
export interface CollisionCell {
  readonly start: number
  readonly count: number
}

export interface CollisionBounds {
  readonly minX: number
  readonly minY: number
  readonly minZ: number
  readonly maxX: number
  readonly maxY: number
  readonly maxZ: number
}

export interface CollisionMesh {
  readonly kind: number
  /** Encloses every triangle; on most files it is exactly their extent. */
  readonly bounds: CollisionBounds
  /** Grid cell size. Always a power of two. */
  readonly cellSize: number
  readonly gridX: number
  readonly gridZ: number
  readonly triangles: readonly CollisionTriangle[]
  /**
   * The grid's cells, in file order.
   *
   * How many there are is **read from the data, not computed**: the starts and
   * counts tile the index list, so walking until the tiling stops finds the
   * end. `gridX * gridZ` predicts it for fewer than half the files and no other
   * formula tried accounts for the rest, so deriving it would be a guess where
   * the file already says.
   */
  readonly cells: readonly CollisionCell[]
  /** Triangle indices, addressed through {@link CollisionMesh.cells}. */
  readonly cellTriangles: readonly number[]
  /** Eight-byte records after the index. Their meaning is not established. */
  readonly trailing: readonly Uint8Array[]
  readonly unknown_0x04: number
  readonly unknown_0x1a: number
  /** The triangles one cell holds. */
  cell(index: number): CollisionTriangle[]
}

/**
 * Cheap check for a `.col2` body.
 *
 * The format has no magic, so this tests the two header fields that are
 * constant across the cartridge: the leading `3`, and a cell size that is a
 * non-zero power of two.
 */
export function isCollisionMesh(data: Uint8Array): boolean {
  if (data.length < 0x3c) return false
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  if (view.getUint32(0, true) !== COLLISION_KIND) return false
  const cellSize = view.getUint16(0x18, true)
  return cellSize !== 0 && (cellSize & (cellSize - 1)) === 0
}

/** Parse a `.col2` collision mesh. Returns views into `data`; nothing is copied. */
export function readCollisionMesh(data: Uint8Array): CollisionMesh {
  if (data.length < 0x3c) {
    throw new GameFormatError(`collision mesh is ${data.length} bytes, too short for its header`)
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const u32 = (at: number) => view.getUint32(at, true)
  const s16 = (at: number) => view.getInt16(at, true)

  const kind = u32(0)
  if (kind !== COLLISION_KIND) {
    throw new GameFormatError(`collision mesh has kind ${kind}, expected ${COLLISION_KIND}`, 0)
  }

  const triangleCount = u32(0x14)
  const triangleAt = u32(0x24)
  const countsAt = u32(0x28)
  const startsAt = u32(0x2c)
  const indicesAt = u32(0x30)
  const trailingCount = u32(0x34)
  const trailingAt = u32(0x38)

  const need = (at: number, length: number, what: string) => {
    if (at < 0 || length < 0 || at + length > data.length) {
      throw new GameFormatError(
        `${what} reads ${length} bytes at 0x${at.toString(16)}, past the end of ${data.length}`,
        at,
      )
    }
  }
  need(triangleAt, triangleCount * 28, 'triangles')
  need(trailingAt, trailingCount * 8, 'trailing records')
  if (!(countsAt <= startsAt && startsAt <= indicesAt && indicesAt <= trailingAt)) {
    throw new GameFormatError('collision index sections are not in order', 0x28)
  }

  const triangles: CollisionTriangle[] = []
  for (let i = 0; i < triangleCount; i++) {
    const at = triangleAt + i * 28
    const point = (k: number): readonly [number, number, number] => [
      s16(at + k * 6),
      s16(at + k * 6 + 2),
      s16(at + k * 6 + 4),
    ]
    triangles.push({
      vertices: [point(0), point(1), point(2)],
      normal: [s16(at + 18) / 4096, s16(at + 20) / 4096, s16(at + 22) / 4096],
      attributes: u32(at + 24),
    })
  }

  // Walk the (start, count) pairs for as long as they tile the index list.
  // Both arrays are padded to a word, so their sizes bound the walk but do not
  // end it; the tiling does.
  const indexCount = (trailingAt - indicesAt) / 2
  const limit = Math.min(
    countsAt === startsAt ? 0 : startsAt - countsAt,
    (indicesAt - startsAt) / 2,
  )
  const cells: CollisionCell[] = []
  if (limit > 0 && view.getUint16(startsAt, true) === 0) {
    let start = 0
    for (let i = 0; i < limit; i++) {
      if (view.getUint16(startsAt + i * 2, true) !== start) break
      const count = data[countsAt + i] as number
      cells.push({ start, count })
      start += count
    }
    // The list may carry one u16 of alignment padding; anything more means the
    // walk ran past the real end.
    while (cells.length > 0 && start > indexCount) {
      const last = cells.pop() as CollisionCell
      start = last.start
    }
  }

  const cellTriangles: number[] = []
  for (let i = 0; i < indexCount; i++) cellTriangles.push(view.getUint16(indicesAt + i * 2, true))

  const trailing: Uint8Array[] = []
  for (let i = 0; i < trailingCount; i++) {
    trailing.push(data.subarray(trailingAt + i * 8, trailingAt + i * 8 + 8))
  }

  return {
    kind,
    bounds: {
      minX: s16(0x08),
      minY: s16(0x0a),
      minZ: s16(0x0c),
      maxX: s16(0x0e),
      maxY: s16(0x10),
      maxZ: s16(0x12),
    },
    cellSize: view.getUint16(0x18, true),
    gridX: u32(0x1c),
    gridZ: u32(0x20),
    triangles,
    cells,
    cellTriangles,
    trailing,
    unknown_0x04: u32(0x04),
    unknown_0x1a: view.getUint16(0x1a, true),
    cell(index) {
      const entry = cells[index]
      if (!entry) return []
      const out: CollisionTriangle[] = []
      for (let i = 0; i < entry.count; i++) {
        const triangle = triangles[cellTriangles[entry.start + i] as number]
        if (triangle) out.push(triangle)
      }
      return out
    },
  }
}
