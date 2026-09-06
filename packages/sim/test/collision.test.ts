import { FX32_ONE, fromInt, fx32, toFloat } from '@vesper/fixed'
import type { CollisionMesh, CollisionTriangle } from '@vesper/game-formats'
import { describe, expect, it } from 'vitest'
import { createCollisionWorld, groundBelow, triangleAt } from '../src/collision.ts'

type Point = readonly [number, number, number]

/**
 * A collision mesh built in code, in the units the format uses: whole `fx32`
 * words, so one world unit is 4096.
 */
function mesh(triangles: readonly (readonly [Point, Point, Point])[]): CollisionMesh {
  const points = triangles.flat()
  const axis = (k: number) => points.map((p) => p[k] as number)
  const built: CollisionTriangle[] = triangles.map((vertices) => ({
    vertices: vertices as CollisionTriangle['vertices'],
    normal: [0, 1, 0],
    attributes: 0,
  }))
  return {
    kind: 3,
    bounds: {
      minX: Math.min(...axis(0)),
      minY: Math.min(...axis(1)),
      minZ: Math.min(...axis(2)),
      maxX: Math.max(...axis(0)),
      maxY: Math.max(...axis(1)),
      maxZ: Math.max(...axis(2)),
    },
    cellSize: 4096,
    gridX: 1,
    gridZ: 1,
    triangles: built,
    cells: [],
    cellTriangles: [],
    trailing: [],
    unknown_0x04: 0,
    unknown_0x1a: 0,
    cell: () => [],
  }
}

const U = FX32_ONE

/** A flat square from (0,0) to (n,n) world units, at height `y`. */
function floor(n: number, y: number): readonly [Point, Point, Point][] {
  const s = n * U
  const h = y * U
  return [
    [
      [0, h, 0],
      [s, h, 0],
      [0, h, s],
    ],
    [
      [s, h, 0],
      [s, h, s],
      [0, h, s],
    ],
  ]
}

describe('groundBelow', () => {
  const world = createCollisionWorld(mesh(floor(10, 0)))

  it('finds the floor under a point on it', () => {
    const hit = groundBelow(world, fromInt(5), fromInt(5), fromInt(10))
    expect(hit).toBeDefined()
    expect(hit?.y).toBe(0)
  })

  it('finds nothing outside the floor', () => {
    expect(groundBelow(world, fromInt(50), fromInt(5), fromInt(10))).toBeUndefined()
    expect(groundBelow(world, fromInt(-5), fromInt(5), fromInt(10))).toBeUndefined()
  })

  it('finds the floor from a point on the seam between two triangles', () => {
    // The diagonal runs from (0,0) to (10,10); a point on it must belong to
    // one of the two triangles rather than falling between them.
    for (let i = 0; i <= 10; i++) {
      expect(groundBelow(world, fromInt(i), fromInt(i), fromInt(10))).toBeDefined()
    }
  })

  it('ignores a floor above the query', () => {
    expect(groundBelow(world, fromInt(5), fromInt(5), fromInt(-1))).toBeUndefined()
  })

  it('accepts a floor within the step-up allowance', () => {
    const hit = groundBelow(world, fromInt(5), fromInt(5), fromInt(-1), fromInt(2))
    expect(hit?.y).toBe(0)
  })
})

describe('groundBelow with layers', () => {
  // A bridge at height 4 over ground at height 0, both covering the same area.
  const world = createCollisionWorld(mesh([...floor(10, 0), ...floor(10, 4)]))

  it('stands on the higher surface when starting above it', () => {
    expect(groundBelow(world, fromInt(5), fromInt(5), fromInt(10))?.y).toBe(fromInt(4))
  })

  it('stands on the lower surface when starting between them', () => {
    expect(groundBelow(world, fromInt(5), fromInt(5), fromInt(2))?.y).toBe(0)
  })

  it('does not drop through the bridge it is standing on', () => {
    expect(groundBelow(world, fromInt(5), fromInt(5), fromInt(4))?.y).toBe(fromInt(4))
  })
})

describe('slopes', () => {
  it('reports a flat floor as flat', () => {
    const world = createCollisionWorld(mesh(floor(10, 0)))
    expect(groundBelow(world, fromInt(5), fromInt(5), fromInt(10))?.slope).toBe(FX32_ONE)
  })

  it('reports a 45-degree ramp at the cosine of its tilt', () => {
    // Rises 10 over 10, so the surface normal is 45 degrees from vertical.
    const ramp = mesh([
      [
        [0, 0, 0],
        [10 * U, 10 * U, 0],
        [0, 0, 10 * U],
      ],
      [
        [10 * U, 10 * U, 0],
        [10 * U, 10 * U, 10 * U],
        [0, 0, 10 * U],
      ],
    ])
    const world = createCollisionWorld(ramp)
    const hit = groundBelow(world, fromInt(5), fromInt(5), fromInt(20))
    expect(toFloat(hit?.slope ?? fx32(0))).toBeCloseTo(Math.cos(Math.PI / 4), 3)
  })

  it('never stands on a vertical wall', () => {
    const wall = mesh([
      [
        [0, 0, 0],
        [0, 10 * U, 0],
        [10 * U, 0, 0],
      ],
    ])
    const world = createCollisionWorld(wall)
    expect(groundBelow(world, fromInt(2), fx32(0), fromInt(20))).toBeUndefined()
  })
})

describe('interpolation', () => {
  it('reads the height off a slope rather than off its corners', () => {
    // Rises from y=0 at x=0 to y=8 at x=8.
    const ramp = mesh([
      [
        [0, 0, 0],
        [8 * U, 8 * U, 0],
        [0, 0, 8 * U],
      ],
      [
        [8 * U, 8 * U, 0],
        [8 * U, 8 * U, 8 * U],
        [0, 0, 8 * U],
      ],
    ])
    const world = createCollisionWorld(ramp)
    for (const x of [1, 2, 4, 6, 7]) {
      const hit = groundBelow(world, fromInt(x), fromInt(1), fromInt(20))
      expect(toFloat(hit?.y ?? fx32(0))).toBeCloseTo(x, 2)
    }
  })
})

describe('the world index', () => {
  it('files a triangle under every cell it touches', () => {
    // One triangle spanning the whole map must be found from any corner.
    const wide = mesh([
      [
        [0, 0, 0],
        [200 * U, 0, 0],
        [0, 0, 200 * U],
      ],
    ])
    const world = createCollisionWorld(wide)
    expect(triangleAt(world, fromInt(1), fromInt(1))).toContain(0)
    expect(triangleAt(world, fromInt(150), fromInt(20))).toContain(0)
    expect(groundBelow(world, fromInt(150), fromInt(20), fromInt(10))).toBeDefined()
  })

  it('keeps its grid bounded on a large map', () => {
    const huge = mesh([
      [
        [-30000, 0, -30000],
        [30000, 0, -30000],
        [-30000, 0, 30000],
      ],
    ])
    const world = createCollisionWorld(huge)
    expect(world.cellsX).toBeLessThanOrEqual(64)
    expect(world.cellsZ).toBeLessThanOrEqual(64)
    expect(groundBelow(world, fx32(0), fx32(-1000), fromInt(10))).toBeDefined()
  })
})
