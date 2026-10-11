import { FX32_ONE, fx32 } from '@minstrel/fixed'
import type { CollisionMesh, CollisionTriangle } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { type CharacterState, PERSON, step } from '../src/character.ts'
import { createCollisionWorld } from '../src/collision.ts'
import { sweep } from '../src/walls.ts'

/**
 * The walls as the game resolves them — `walls.ts`. Fixtures are built in
 * code, in the world's units (4096 to one), placed at the world's scale: the
 * game's units are eight times these, as on every map.
 */
const U = FX32_ONE

type Point = readonly [number, number, number]

function triangle(a: Point, b: Point, c: Point): CollisionTriangle {
  const ux = b[0] - a[0]
  const uy = b[1] - a[1]
  const uz = b[2] - a[2]
  const vx = c[0] - a[0]
  const vy = c[1] - a[1]
  const vz = c[2] - a[2]
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  const length = Math.hypot(nx, ny, nz) || 1
  return {
    vertices: [a, b, c] as unknown as CollisionTriangle['vertices'],
    normal: [nx / length, ny / length, nz / length],
    attributes: 0,
  }
}

/** A floor over `-n..n`, facing up. */
function floor(n: number): CollisionTriangle[] {
  const s = n * U
  return [
    triangle([-s, 0, -s], [-s, 0, s], [s, 0, -s]),
    triangle([s, 0, -s], [-s, 0, s], [s, 0, s]),
  ]
}

/** A wall from `(x0, z0)` to `(x1, z1)`, a unit tall, facing left as seen walking from the first end to the second. */
function wall(x0: number, z0: number, x1: number, z1: number): CollisionTriangle[] {
  const a: Point = [x0 * U, 0, z0 * U]
  const b: Point = [x1 * U, 0, z1 * U]
  const c: Point = [x0 * U, U, z0 * U]
  const d: Point = [x1 * U, U, z1 * U]
  return [triangle(a, c, b), triangle(c, d, b)]
}

/**
 * A world from triangles, as a map's mesh placed at the world's scale: stored
 * at eight times the world's size, as the game's units are, and placed at an
 * eighth.
 */
function world(triangles: CollisionTriangle[]) {
  const stored = triangles.map((t) => ({
    ...t,
    vertices: t.vertices.map((v) =>
      v.map((c) => c * 8),
    ) as unknown as CollisionTriangle['vertices'],
  }))
  const points = stored.flatMap((t) => t.vertices)
  const axis = (k: number) => points.map((p) => p[k] as number)
  const mesh = {
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
    triangles: stored,
    cells: [],
    cellTriangles: [],
    trailing: [],
    shift: 0,
    unknown_0x1a: 0,
    cell: () => [],
  } as CollisionMesh
  return createCollisionWorld({ mesh, offset: undefined, scale: 1 / 8 })
}

const standing = (x: number, z: number): CharacterState => ({
  x: fx32(Math.round(x * U)),
  y: fx32(0),
  z: fx32(Math.round(z * U)),
  fallSpeed: fx32(0),
  grounded: true,
})

/** Walking pace, as `apps/game` walks: 0.009 a tick. */
const PACE = 0.009 * U

describe('the walls, as the game resolves them', () => {
  it('holds a corner shut that two walls close between them', () => {
    // Two walls meeting at the origin about 131 degrees apart, both facing the
    // wedge between them — the shape of the corner `F01`'s Hero slipped out
    // of, behind the Hexagon, with the old push.
    // Each wall runs on further than the 3.6 units a walk below covers, so no
    // heading can round either one's far end.
    const corner = world([...floor(8), ...wall(-5.22, 1.32, 0, 0), ...wall(0, 0, 1.89, -3.66)])
    const inside = (s: CharacterState) => {
      const x = s.x / U
      const z = s.z / U
      // In front of both walls: the side each one's normal points to.
      const first = 5.22 * z + 1.32 * x
      const second = 1.89 * z + 3.66 * x
      return first <= 0 && second <= 0
    }
    expect(inside(standing(-0.2, -0.5))).toBe(true)
    for (let heading = 0; heading < 32; heading++) {
      const angle = (heading * Math.PI) / 16
      let s: CharacterState = standing(-0.2, -0.5)
      for (let tick = 0; tick < 400; tick++) {
        s = step(
          corner,
          s,
          fx32(Math.round(Math.cos(angle) * PACE)),
          fx32(Math.round(Math.sin(angle) * PACE)),
          PERSON,
        )
        expect(inside(s), `heading ${heading}, tick ${tick}`).toBe(true)
      }
    }
  })

  it('holds a character a radius off a wall it walks into', () => {
    const plain = world([...floor(4), ...wall(1, 2, 1, -2)])
    let s: CharacterState = standing(0, 0)
    for (let tick = 0; tick < 300; tick++)
      s = step(plain, s, fx32(Math.round(PACE)), fx32(0), PERSON)
    expect(s.x / U).toBeCloseTo(1 - PERSON.radius / U, 3)
  })

  it('lets a character through a wall from behind: a wall has one face', () => {
    // The game pushes only off the side a wall's normal points to; the
    // cartridge's walls face the ground they hem in.
    const plain = world([...floor(4), ...wall(1, 2, 1, -2)])
    let s: CharacterState = standing(2, 0)
    for (let tick = 0; tick < 300; tick++)
      s = step(plain, s, fx32(-Math.round(PACE)), fx32(0), PERSON)
    expect(s.x / U).toBeLessThan(0)
  })
})

describe('the sweep', () => {
  it('puts the centre back a radius off a face it has pushed into, in the game’s own arithmetic', () => {
    // One wall in the plane x = 0x4000, facing −x; the centre 0x300 in front
    // of it, so 0x500 into a radius of 0x800. The face pass puts it back on
    // the plane and 0x800 out: x = 0x3800 exactly.
    const hits = new Int32Array(12)
    hits.set([0x4000, 0, -0x4000, 0x4000, 0, 0x4000, 0x4000, 0x4000, -0x4000, -4096, 0, 0])
    const centre = new Int32Array([0x3d00, 0x800, 0])
    const decided = sweep(hits, 1, 0x800, centre, undefined)
    expect(decided).toBe(0)
    expect([...centre]).toEqual([0x3800, 0x800, 0])
  })

  it('leaves a centre alone that no wall reaches', () => {
    const hits = new Int32Array(12)
    hits.set([0x4000, 0, -0x4000, 0x4000, 0, 0x4000, 0x4000, 0x4000, -0x4000, -4096, 0, 0])
    const centre = new Int32Array([0x3000, 0x800, 0])
    expect(sweep(hits, 1, 0x800, centre, undefined)).toBe(-1)
    expect([...centre]).toEqual([0x3000, 0x800, 0])
  })

  it('takes a floor for no wall', () => {
    // A stored normal with y over 0x800 — steeper than 60 degrees from upright.
    const hits = new Int32Array(12)
    hits.set([-0x4000, 0x700, -0x4000, -0x4000, 0x700, 0x4000, 0x4000, 0x700, -0x4000, 0, 4096, 0])
    const centre = new Int32Array([0, 0x800, 0])
    expect(sweep(hits, 1, 0x800, centre, undefined)).toBe(-1)
  })
})
