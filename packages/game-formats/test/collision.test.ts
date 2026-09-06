import { describe, expect, it } from 'vitest'
import {
  COLLISION_KIND,
  type CollisionMesh,
  isCollisionMesh,
  readCollisionMesh,
} from '../src/collision.ts'
import { GameFormatError } from '../src/errors.ts'

interface TriangleSpec {
  readonly points: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ]
  readonly normal: readonly [number, number, number]
  readonly attributes: number
}

/**
 * Build a `.col2` from a triangle list and a per-cell index.
 *
 * Everything is assembled here from the format's own rules, so the fixture is
 * synthetic — no cartridge bytes. The two arrays that describe the grid are
 * padded to a word, as the real files pad them, because the parser has to find
 * the end of the cell list by the tiling rather than by their length.
 */
function buildCollision(
  triangles: readonly TriangleSpec[],
  perCell: readonly (readonly number[])[],
  options: { kind?: number; cellSize?: number; gridX?: number; gridZ?: number } = {},
): Uint8Array {
  const bytes: number[] = []
  const u8 = (v: number) => bytes.push(v & 0xff)
  const u16 = (v: number) => bytes.push(v & 0xff, (v >>> 8) & 0xff)
  const u32 = (v: number) =>
    bytes.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  const pad = () => {
    while (bytes.length % 4 !== 0) u8(0)
  }

  const points = triangles.flatMap((t) => t.points)
  const axis = (k: number) => points.map((p) => p[k] as number)
  const box = points.length
    ? [
        Math.min(...axis(0)),
        Math.min(...axis(1)),
        Math.min(...axis(2)),
        Math.max(...axis(0)),
        Math.max(...axis(1)),
        Math.max(...axis(2)),
      ]
    : [0, 0, 0, 0, 0, 0]

  u32(options.kind ?? COLLISION_KIND)
  u32(0)
  for (const v of box) u16(v)
  u32(triangles.length)
  u16(options.cellSize ?? 4096)
  u16(0)
  u32(options.gridX ?? perCell.length)
  u32(options.gridZ ?? 1)
  const offsets = bytes.length
  for (let i = 0; i < 4; i++) u32(0)
  u32(perCell.length ? 1 : 0)
  u32(0)

  const patch = (slot: number, value: number) => {
    for (let k = 0; k < 4; k++) bytes[offsets + slot * 4 + k] = (value >>> (k * 8)) & 0xff
  }

  patch(0, bytes.length)
  for (const t of triangles) {
    for (const p of t.points) for (const c of p) u16(c)
    for (const c of t.normal) u16(Math.round(c * 4096))
    u32(t.attributes)
  }

  patch(1, bytes.length)
  for (const cell of perCell) u8(cell.length)
  pad()

  patch(2, bytes.length)
  let start = 0
  for (const cell of perCell) {
    u16(start)
    start += cell.length
  }
  pad()

  patch(3, bytes.length)
  for (const cell of perCell) for (const index of cell) u16(index)
  pad()

  // One trailing record, so the index list has a bound.
  const trailingAt = bytes.length
  for (let i = 0; i < 8; i++) u8(i)
  for (let k = 0; k < 4; k++) bytes[offsets + 5 * 4 + k] = (trailingAt >>> (k * 8)) & 0xff

  return Uint8Array.from(bytes)
}

const flat: TriangleSpec = {
  points: [
    [0, 0, 0],
    [100, 0, 0],
    [0, 0, 100],
  ],
  // The cross product of those edges points along -y.
  normal: [0, -1, 0],
  attributes: 0x00513240,
}
const wall: TriangleSpec = {
  points: [
    [0, 0, 0],
    [0, 100, 0],
    [100, 0, 0],
  ],
  normal: [0, 0, -1],
  attributes: 0x00816240,
}

describe('readCollisionMesh', () => {
  const sample = () => readCollisionMesh(buildCollision([flat, wall], [[0], [1, 0]]))

  it('reads the header', () => {
    const mesh = sample()
    expect(mesh.kind).toBe(COLLISION_KIND)
    expect(mesh.cellSize).toBe(4096)
    expect(mesh.triangles).toHaveLength(2)
  })

  it('reads a triangle as three points, a normal and an attribute word', () => {
    const mesh = sample()
    const first = mesh.triangles[0] as CollisionMesh['triangles'][number]
    expect(first.vertices).toEqual(flat.points)
    expect(first.normal).toEqual([0, -1, 0])
    expect(first.attributes).toBe(0x00513240)
  })

  it('takes the bounding box from the header', () => {
    expect(sample().bounds).toEqual({
      minX: 0,
      minY: 0,
      minZ: 0,
      maxX: 100,
      maxY: 100,
      maxZ: 100,
    })
  })

  it('finds the cells by their tiling, not by the array lengths', () => {
    // Both per-cell arrays are padded to a word, so their sizes over-state the
    // count; only the tiling says where the list ends.
    const mesh = sample()
    expect(mesh.cells).toEqual([
      { start: 0, count: 1 },
      { start: 1, count: 2 },
    ])
    // The list itself is padded to a word, so it can carry one entry past the
    // end; the cells are what say how far it is read.
    expect(mesh.cellTriangles.slice(0, 3)).toEqual([0, 1, 0])
    expect(mesh.cells.reduce((n, c) => n + c.count, 0)).toBe(3)
  })

  it('resolves a cell to its triangles', () => {
    const mesh = sample()
    expect(mesh.cell(0).map((t) => t.attributes)).toEqual([0x00513240])
    expect(mesh.cell(1).map((t) => t.attributes)).toEqual([0x00816240, 0x00513240])
    expect(mesh.cell(9)).toEqual([])
  })

  it('handles a mesh with no cells at all', () => {
    const mesh = readCollisionMesh(buildCollision([flat], []))
    expect(mesh.cells).toEqual([])
    expect(mesh.triangles).toHaveLength(1)
  })

  it('keeps the trailing records whole', () => {
    expect(Array.from(sample().trailing[0] as Uint8Array)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })
})

describe('isCollisionMesh', () => {
  it('accepts a well-formed body', () => {
    expect(isCollisionMesh(buildCollision([flat], [[0]]))).toBe(true)
  })

  it('rejects a different leading word', () => {
    expect(isCollisionMesh(buildCollision([flat], [[0]], { kind: 4 }))).toBe(false)
  })

  it('rejects a cell size that is not a power of two', () => {
    expect(isCollisionMesh(buildCollision([flat], [[0]], { cellSize: 3000 }))).toBe(false)
  })

  it('rejects a buffer too short to hold a header', () => {
    expect(isCollisionMesh(new Uint8Array(16))).toBe(false)
  })
})

describe('readCollisionMesh on malformed input', () => {
  it('rejects a buffer too short to hold a header', () => {
    expect(() => readCollisionMesh(new Uint8Array(16))).toThrow(/too short/)
  })

  it('rejects a body whose leading word is not the kind it expects', () => {
    expect(() => readCollisionMesh(buildCollision([flat], [[0]], { kind: 9 }))).toThrow(
      GameFormatError,
    )
  })

  it('rejects triangles that run past the end', () => {
    const data = buildCollision([flat], [[0]])
    new DataView(data.buffer).setUint32(0x14, 4096, true)
    expect(() => readCollisionMesh(data)).toThrow(/past the end/)
  })

  it('rejects index sections that are out of order', () => {
    const data = buildCollision([flat], [[0]])
    new DataView(data.buffer).setUint32(0x28, data.length, true)
    expect(() => readCollisionMesh(data)).toThrow(/not in order/)
  })
})
