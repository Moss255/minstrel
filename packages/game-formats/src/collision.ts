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
 * | `+0x1C` | `u32` | grid width in cells; `gridX * cellSize` covers the box |
 * | `+0x20` | `u32` | grid depth in cells; `gridZ * cellSize` covers the box |
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
   * There are `floor(gridZ * (gridX + 1/2))` of them — `gridX * gridZ` plus one
   * more on every other row, so the rows alternate `gridX` and `gridX + 1`
   * wide.
   *
   * **Where cell (0, 0) sits is not established**, and the staggering is
   * probably why: taking the grid's corner as the mesh's own minimum and
   * reading it as a plain rectangle puts only 36% of the index references
   * inside the cell that names them, and column-major or an origin at zero do
   * worse. So the cells are read and carried, and nothing here uses them to
   * look a position up.
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
  const gridX = u32(0x1c)
  const gridZ = u32(0x20)

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

  // **How many cells there are follows from the header**, and it is not
  // `gridX * gridZ`: it is `floor(gridZ * (gridX + 1/2))`, which holds on all
  // **1,154** collision meshes of the reference cartridge. That is
  // `gridX * gridZ + floor(gridZ / 2)` — one extra cell on every other row, so
  // the rows alternate `gridX` and `gridX + 1` wide. `gridX * gridZ` accounts
  // for fewer than half the files, which is what made this look underivable.
  //
  // The count is still checked against the data rather than trusted: the starts
  // must tile the counts, and the total must fit the index list.
  const indexCount = (trailingAt - indicesAt) / 2
  const wanted = Math.floor(gridZ * (gridX + 0.5))
  const room = countsAt + wanted <= startsAt && startsAt + wanted * 2 <= indicesAt
  const cells: CollisionCell[] = []
  if (room) {
    let start = 0
    for (let i = 0; i < wanted; i++) {
      if (view.getUint16(startsAt + i * 2, true) !== start) {
        // A file that does not tile is not read past the point it stops.
        cells.length = 0
        break
      }
      const count = data[countsAt + i] as number
      cells.push({ start, count })
      start += count
    }
    if (start > indexCount) cells.length = 0
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
    gridX,
    gridZ,
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

/**
 * Whether a collision mesh is a **marker volume** rather than ground.
 *
 * **INFERRED**, and worth stating plainly because it decides what a character
 * can walk through.
 *
 * A map's collision arrives as several meshes. Most are terrain. A few are two
 * triangles — one quad — standing vertically with no surface anyone could stand
 * on, and in the slice's village there are eleven of them: one across each of
 * the ten doorways, plus a quad four units by six standing 2.5 units tall in
 * the middle of the map. They are taller than any building on that map, they
 * are invisible, and each doorway one is attached by the manifest to its own
 * doorway model.
 *
 * Treated as walls they are catastrophic: the village goes from **93% of its
 * walkable ground reachable to 24%**, because every doorway is sealed and the
 * map is cut in half. Treated as volumes to pass through, nothing is lost —
 * they hold no standable surface, so no ground disappears with them — and
 * across the cartridge's 124 maps that have one, reachable ground rises from
 * 66.8% to 72.7%.
 *
 * What they *are* is not established. Doorways are the obvious guess for the
 * ten, and a trigger of some kind for the eleventh, but nothing read so far
 * says so, and the attribute word does not distinguish them: the values on
 * these are drawn from the same set as the terrain's, and look like packed
 * orderings — `0x543210` and its permutations — rather than surface flags.
 *
 * So this is a rule about **shape**, not meaning: two triangles or fewer, and
 * nothing to stand on.
 */
export function isMarkerVolume(mesh: CollisionMesh): boolean {
  return mesh.triangles.length <= 2 && !mesh.triangles.some((t) => t.normal[1] !== 0)
}
