import { FX32_ONE, fx32 } from '@minstrel/fixed'
import type { CollisionMesh } from '@minstrel/game-formats'
import type { Geometry, Model } from '@minstrel/nitro-gfx'
import { createCollisionWorld, onOpenGround } from '@minstrel/sim'
import { describe, expect, it } from 'vitest'
import type { MapPiece } from '../src/assemble.ts'
import { DRAWN_WITHIN, GROUND_SHIFT, HEADROOM, openGround } from '../src/footing.ts'

/** Built in code: collision is 4096 to the unit, drawn geometry plain numbers. */
const K = FX32_ONE
const at = (x: number, y: number, z: number): [number, number, number] => [
  Math.round(x * K),
  Math.round(y * K),
  Math.round(z * K),
]

/** A flat square of collision, as two triangles, level at `y`. */
function slab(x0: number, z0: number, x1: number, z1: number, y = 0) {
  const up: [number, number, number] = [0, 1, 0]
  return [
    { vertices: [at(x0, y, z0), at(x1, y, z0), at(x1, y, z1)], normal: up, attributes: 0 },
    { vertices: [at(x0, y, z0), at(x1, y, z1), at(x0, y, z1)], normal: up, attributes: 0 },
  ]
}

function world(...slabs: ReturnType<typeof slab>[]) {
  const triangles = slabs.flat()
  const ys = triangles.flatMap((t) => t.vertices.map((v) => v[1]))
  const xs = triangles.flatMap((t) => t.vertices.map((v) => v[0]))
  const zs = triangles.flatMap((t) => t.vertices.map((v) => v[2]))
  const bounds = {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    minZ: Math.min(...zs),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
    maxZ: Math.max(...zs),
  }
  return createCollisionWorld({
    kind: 3,
    bounds,
    cellSize: 4096,
    gridX: 1,
    gridZ: 1,
    triangles,
    cells: [],
  } as unknown as CollisionMesh)
}

/** A piece that draws one flat square at `y`, as two triangles. */
function drawnSquare(x0: number, z0: number, x1: number, z1: number, y: number): MapPiece {
  const vertex = (x: number, z: number) => ({ x, y, z, matrixId: 0 })
  const geometry = {
    vertices: [vertex(x0, z0), vertex(x1, z0), vertex(x1, z1), vertex(x0, z1)],
    indices: [0, 1, 2, 0, 2, 3],
    matrixIds: [0],
    scales: [],
  } as unknown as Geometry
  const model = { numShapes: 1, posedGeometry: () => geometry } as unknown as Model
  return { model, place: { x: 0, y: 0, z: 0 }, scale: 1 } as unknown as MapPiece
}

/** Whether the grid calls a point open, the point in world units. */
function openAt(ground: ReturnType<typeof openGround>, x: number, z: number): boolean {
  return onOpenGround(ground, fx32(Math.round(x * K)), fx32(Math.round(z * K)))
}

describe('openGround', () => {
  it('opens the ground the map draws, and not a floor with only water drawn well below it', () => {
    // Land from x 0 to 4, drawn at its floor; a river from 4 to 8 whose floor
    // runs on at 0 but whose surface is drawn a quarter of a unit down.
    const walked = world(slab(0, 0, 8, 4))
    const ground = openGround([drawnSquare(0, 0, 4, 4, 0), drawnSquare(4, 0, 8, 4, -0.26)], walked)
    expect(openAt(ground, 2, 2)).toBe(true)
    expect(openAt(ground, 3.8, 1)).toBe(true)
    expect(openAt(ground, 4.2, 1)).toBe(false)
    expect(openAt(ground, 6, 2)).toBe(false)
  })

  it('takes a drawn surface within the tolerance as the floor’s, and one past it as not', () => {
    const walked = world(slab(0, 0, 4, 4))
    expect(openAt(openGround([drawnSquare(0, 0, 4, 4, DRAWN_WITHIN * 0.9)], walked), 2, 2)).toBe(
      true,
    )
    expect(openAt(openGround([drawnSquare(0, 0, 4, 4, DRAWN_WITHIN * 1.5)], walked), 2, 2)).toBe(
      false,
    )
  })

  it('closes a floor with something drawn over it within the headroom', () => {
    // Grass drawn at the floor, and a forest block's top over its left half.
    const walked = world(slab(0, 0, 8, 4))
    const grass = drawnSquare(0, 0, 8, 4, 0)
    const ground = openGround([grass, drawnSquare(0, 0, 4, 4, 0.15)], walked)
    expect(openAt(ground, 2, 2)).toBe(false)
    expect(openAt(ground, 6, 2)).toBe(true)
    const high = openGround([grass, drawnSquare(0, 0, 4, 4, HEADROOM * 2)], walked)
    expect(openAt(high, 2, 2)).toBe(true)
  })

  it('cuts cells an eighth of a unit across, and opens nothing with nothing drawn', () => {
    const walked = world(slab(0, 0, 4, 4))
    const ground = openGround([], walked)
    expect(ground.shift).toBe(GROUND_SHIFT)
    expect(ground.cellsX).toBe(32)
    expect(ground.cells.every((cell) => cell === 0)).toBe(true)
    expect(openAt(ground, -1, 2)).toBe(false)
  })
})
