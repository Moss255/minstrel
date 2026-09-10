import { FX32_ONE, toFloat } from '@minstrel/fixed'
import type { CollisionMesh } from '@minstrel/game-formats'
import { createCollisionWorld, PERSON } from '@minstrel/sim'
import { describe, expect, it } from 'vitest'
import { findSpawn } from '../src/spawn.ts'

/**
 * Collision is integers, 4096 to the unit — the same fixed point the rest of
 * the simulation uses. Fixtures here are built in code, never from a cartridge.
 */
const K = FX32_ONE
const at = (x: number, y: number, z: number): [number, number, number] => [
  Math.round(x * K),
  Math.round(y * K),
  Math.round(z * K),
]

/** A flat square of ground, as two triangles, level at `y`. */
function slab(x0: number, z0: number, x1: number, z1: number, y = 0) {
  const up: [number, number, number] = [0, K, 0]
  return [
    { vertices: [at(x0, y, z0), at(x1, y, z0), at(x1, y, z1)], normal: up, attributes: 0 },
    { vertices: [at(x0, y, z0), at(x1, y, z1), at(x0, y, z1)], normal: up, attributes: 0 },
  ]
}

function world(...triangles: ReturnType<typeof slab>[number][][]) {
  const all = triangles.flat()
  const bounds = {
    minX: Math.min(...all.flatMap((t) => t.vertices.map((v) => v[0]))),
    minY: Math.min(...all.flatMap((t) => t.vertices.map((v) => v[1]))),
    minZ: Math.min(...all.flatMap((t) => t.vertices.map((v) => v[2]))),
    maxX: Math.max(...all.flatMap((t) => t.vertices.map((v) => v[0]))),
    maxY: Math.max(...all.flatMap((t) => t.vertices.map((v) => v[1]))),
    maxZ: Math.max(...all.flatMap((t) => t.vertices.map((v) => v[2]))),
  }
  const mesh = {
    kind: 3,
    bounds,
    cellSize: 4096,
    gridX: 1,
    gridZ: 1,
    triangles: all,
    cells: [],
  } as unknown as CollisionMesh
  return createCollisionWorld(mesh)
}

/** Enough to walk a character across the fixture in the probe's sixteen ticks. */
const options = { person: PERSON, speed: Math.round(0.01 * K) }

describe('findSpawn', () => {
  it('finds ground on a map whose scale leaves fractional bounds', () => {
    // An indoor map is built at `PLACED_PIECE_SCALE`, which divides its
    // collision by eight and leaves bounds that are not whole `fx32` words —
    // the village inn's `maxY` is 5235.5. Handing that to `fx32` threw, so
    // looking for somewhere to stand raised instead of answering, on exactly
    // the maps that need the fallback most: an interior whose doorway arrival
    // has no floor under it.
    const eighth = createCollisionWorld({
      mesh: {
        kind: 3,
        // 41,884 is the inn's own `maxY`, and an eighth of it is 5235.5.
        bounds: { minX: 0, minY: 0, minZ: 0, maxX: 41884, maxY: 41884, maxZ: 41884 },
        cellSize: 4096,
        gridX: 1,
        gridZ: 1,
        triangles: slab(-4, -4, 4, 4, 1),
        cells: [],
      } as unknown as CollisionMesh,
      offset: undefined,
      scale: 0.125,
    })
    expect(() => findSpawn(eighth, options)).not.toThrow()
    expect(findSpawn(eighth, options)).toBeDefined()
  })

  it('puts the character on the ground', () => {
    const spawn = findSpawn(world(slab(-4, -4, 4, 4, 1)), options)
    expect(spawn).toBeDefined()
    expect(toFloat((spawn as NonNullable<typeof spawn>).y)).toBeCloseTo(1, 2)
  })

  it('finds nowhere in a map with no ground', () => {
    expect(findSpawn(world(slab(0, 0, 0, 0)), options)).toBeUndefined()
  })

  it('starts near the middle when nowhere is asked for', () => {
    // Two islands, one either side of the origin. Neither is nearer the middle
    // than the other, so this only checks it lands on one of them.
    const spawn = findSpawn(world(slab(-9, -1, -5, 1), slab(5, -1, 9, 1)), options)
    expect(spawn).toBeDefined()
    expect(Math.abs(toFloat((spawn as NonNullable<typeof spawn>).x))).toBeGreaterThan(4)
  })
})

describe('findSpawn near a wanted spot', () => {
  /**
   * What a doorway needs. 136 of the cartridge's 1,132 doorways name an arrival
   * with no floor under it, 87 of them onto a field, and the character has to
   * go down somewhere. Nearest the arrival keeps which side of the map they
   * came in on; the middle of the map does not.
   */
  const twoIslands = world(slab(-9, -1, -5, 1), slab(5, -1, 9, 1))

  it('picks the ground nearest the spot, not the middle of the map', () => {
    const west = findSpawn(twoIslands, { ...options, near: { x: -20, z: 0 } })
    const east = findSpawn(twoIslands, { ...options, near: { x: 20, z: 0 } })
    expect(toFloat((west as NonNullable<typeof west>).x)).toBeLessThan(0)
    expect(toFloat((east as NonNullable<typeof east>).x)).toBeGreaterThan(0)
  })

  it('stands on the spot itself when the spot has ground', () => {
    const spawn = findSpawn(world(slab(-9, -9, 9, 9)), { ...options, near: { x: 6, z: -6 } })
    expect(toFloat((spawn as NonNullable<typeof spawn>).x)).toBeCloseTo(6, 2)
    expect(toFloat((spawn as NonNullable<typeof spawn>).z)).toBeCloseTo(-6, 2)
  })

  it('crosses the map rather than refusing, when the spot is far outside it', () => {
    // The field east of the village: the arrival is off the collision entirely.
    const spawn = findSpawn(world(slab(-9, -1, -5, 1)), { ...options, near: { x: 40, z: 40 } })
    expect(spawn).toBeDefined()
  })

  it('does not move a spawn that was asked for nothing', () => {
    // The map-opening case must be unchanged by any of this.
    const plain = world(slab(-4, -4, 4, 4))
    const a = findSpawn(plain, options)
    const b = findSpawn(plain, options)
    expect(a).toEqual(b)
  })
})
