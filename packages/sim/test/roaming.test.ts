import { FX32_ONE, fx32 } from '@minstrel/fixed'
import type { CollisionMesh, CollisionTriangle } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { BattleRng } from '../src/battle/rng.ts'
import { PERSON } from '../src/character.ts'
import { createCollisionWorld } from '../src/collision.ts'
import {
  calmFor,
  headingAngle,
  type RoamerKind,
  type RoamRules,
  startRoaming,
  tickRoaming,
} from '../src/field/roaming.ts'

type Point = readonly [number, number, number]
const U = FX32_ONE

/** A flat square from (0,0) to (n,n) world units, as a collision mesh built in code. */
function floor(n: number): CollisionMesh {
  const s = n * U
  const triangles: (readonly [Point, Point, Point])[] = [
    [
      [0, 0, 0],
      [s, 0, 0],
      [0, 0, s],
    ],
    [
      [s, 0, 0],
      [s, 0, s],
      [0, 0, s],
    ],
  ]
  const built: CollisionTriangle[] = triangles.map((vertices) => ({
    vertices: vertices as CollisionTriangle['vertices'],
    normal: [0, 1, 0],
    attributes: 0,
  }))
  return {
    kind: 3,
    bounds: { minX: 0, minY: 0, minZ: 0, maxX: s, maxY: 0, maxZ: s },
    cellSize: 4096,
    gridX: 1,
    gridZ: 1,
    triangles: built,
    cells: [],
    cellTriangles: [],
    trailing: [],
    shift: 0,
    unknown_0x1a: 0,
    cell: () => [],
  }
}

const world = createCollisionWorld(floor(20))
const hero = { x: fx32(10 * U), y: fx32(0), z: fx32(10 * U) }
const kinds: RoamerKind[] = [
  { number: 1, weight: 7, speed: fx32(Math.round(0.01 * U)) },
  { number: 56, weight: 3, speed: fx32(Math.round(0.02 * U)) },
]
const rules: RoamRules = {
  most: 3,
  near: fx32(1 * U),
  far: fx32(2 * U),
  vanish: fx32(4 * U),
  touch: fx32(Math.round(0.1 * U)),
  spawnEvery: 30,
  turnEvery: 40,
  shape: PERSON,
}

function run(seed: bigint, ticks: number, at = hero) {
  const rng = new BattleRng(seed)
  let field = startRoaming()
  const touched = []
  for (let t = 0; t < ticks; t++) {
    const next = tickRoaming(field, world, kinds, at, rng, rules)
    field = next.roaming
    if (next.touched) touched.push(next.touched)
  }
  return { field, touched }
}

describe('monsters roaming a field', () => {
  it('turn up by the zone’s weights, in a ring round the Hero, never more than the most', () => {
    const { field } = run(1n, 200)
    expect(field.roamers.length).toBeGreaterThan(0)
    expect(field.roamers.length).toBeLessThanOrEqual(rules.most)
    for (const r of field.roamers) {
      expect(kinds.map((k) => k.number)).toContain(r.number)
      const d = Math.hypot(r.state.x - hero.x, r.state.z - hero.z)
      expect(d).toBeLessThanOrEqual(rules.vanish)
    }
  })

  it('is the same field from the same seed', () => {
    expect(run(9n, 300).field).toEqual(run(9n, 300).field)
    expect(run(9n, 300).field).not.toEqual(run(10n, 300).field)
  })

  it('hands back the one the Hero walks into, unless a calm is on', () => {
    const rng = new BattleRng(3n)
    let field = startRoaming()
    for (let t = 0; t < 40 && field.roamers.length === 0; t++) {
      field = tickRoaming(field, world, kinds, hero, rng, rules).roaming
    }
    const first = field.roamers[0]
    if (!first) throw new Error('nobody turned up')
    const onIt = { x: first.state.x, y: first.state.y, z: first.state.z }
    const calm = tickRoaming(calmFor(field, 10), world, kinds, onIt, new BattleRng(4n), rules)
    expect(calm.touched).toBeUndefined()
    const met = tickRoaming(field, world, kinds, onIt, new BattleRng(4n), rules)
    expect(met.touched?.id).toBe(first.id)
    expect(met.roaming.roamers.some((r) => r.id === first.id)).toBe(false)
  })

  it('lets those who wander too far go', () => {
    const { field } = run(5n, 120)
    const away = { x: fx32(19 * U), y: fx32(0), z: fx32(19 * U) }
    const next = tickRoaming(field, world, [], away, new BattleRng(6n), {
      ...rules,
      vanish: fx32(1 * U),
    })
    expect(next.roaming.roamers).toHaveLength(0)
  })

  it('faces a heading the Hero’s way round', () => {
    expect(headingAngle(0)).toBe(0)
    expect(headingAngle(4)).toBeCloseTo(Math.PI / 2, 12)
  })
})
