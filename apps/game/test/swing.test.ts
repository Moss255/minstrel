import { readFileSync } from 'node:fs'
import { FX32_ONE, fx32, toFloat } from '@minstrel/fixed'
import type { Geometry } from '@minstrel/nitro-gfx'
import { type CollisionWorld, createCollisionWorld, groundBelow, PERSON, step } from '@minstrel/sim'
import { describe, expect, it } from 'vitest'
import { load } from '../src/load.ts'
import { WALK_SPEED } from '../src/player.ts'
import {
  awayFrom,
  DOOR_CLOSE_FAR,
  doorCollisionName,
  doorShut,
  doorsOf,
  moveDoors,
  type SwingDoor,
  swingGeometry,
} from '../src/swing.ts'

function door(over: Partial<SwingDoor> = {}): SwingDoor {
  return {
    stem: 'M01M00D1',
    piece: 0,
    mesh: undefined,
    hinge: { x: 0, z: 0 },
    leaf: { x: 0.2, z: 0 },
    angle: 0,
    target: 0,
    ...over,
  }
}

describe('a door', () => {
  it('finds its collision by name, and is not every piece', () => {
    expect(doorCollisionName('M01M00D1')).toBe('M01A00D1')
    expect(doorCollisionName('M01M10DA')).toBe('M01A10DA')
    expect(doorCollisionName('M01M0000')).toBeUndefined()
    expect(doorCollisionName('M01M00E1')).toBeUndefined()
  })

  it('turns about its hinge', () => {
    const geometry: Geometry = {
      vertices: [{ x: 1, y: 0.5, z: 0, s: 0, t: 0, r: 1, g: 1, b: 1, matrixId: 0 }],
      indices: [],
      matrixIds: [],
      scales: [],
    }
    expect(swingGeometry(geometry, 0)).toBe(geometry)
    const turned = swingGeometry(geometry, Math.PI / 2).vertices[0]
    expect(turned?.x).toBeCloseTo(0, 9)
    expect(turned?.y).toBe(0.5)
    expect(turned?.z).toBeCloseTo(1, 9)
  })

  it('swings away from whoever opens it', () => {
    // A leaf along +x swings its far edge towards +z for a positive turn.
    expect(awayFrom(door(), { x: 0.1, z: -0.1 })).toBeGreaterThan(0)
    expect(awayFrom(door(), { x: 0.1, z: 0.1 })).toBeLessThan(0)
  })

  it('opens as the Hero comes near, stands open, and shuts once they have gone', () => {
    const doors = [door()]
    const near = { x: 0.1, z: -0.1 }
    expect(moveDoors(doors, near, 0.1)).toBe(true)
    expect(doorShut(doors[0] as SwingDoor)).toBe(false)
    moveDoors(doors, near, 1)
    expect(doors[0]?.angle).toBeCloseTo(Math.PI / 2, 9)
    expect(moveDoors(doors, near, 1)).toBe(false)
    const gone = { x: 0.1, z: -(DOOR_CLOSE_FAR + 0.1) }
    moveDoors(doors, gone, 0.1)
    expect(doorShut(doors[0] as SwingDoor)).toBe(false)
    moveDoors(doors, gone, 1)
    expect(doorShut(doors[0] as SwingDoor)).toBe(true)
  })

  it('opens again the way it was going when caught shutting', () => {
    const doors = [door({ angle: -0.5, target: 0 })]
    moveDoors(doors, { x: 0.1, z: 0.1 }, 0)
    expect(doors[0]?.target).toBeCloseTo(-Math.PI / 2, 9)
  })
})

const romPath = process.env.MINSTREL_TEST_ROM

/** Walk straight from one point for a while; where the character got to, or undefined with no floor to start on. */
function walk(
  world: CollisionWorld,
  from: { x: number; z: number },
  way: { x: number; z: number },
  ticks: number,
): { x: number; z: number } | undefined {
  const above = fx32(Math.round(world.bounds.maxY + FX32_ONE))
  const x = fx32(Math.round(from.x * FX32_ONE))
  const z = fx32(Math.round(from.z * FX32_ONE))
  const floor = groundBelow(world, x, z, above)
  if (!floor) return undefined
  let state: Parameters<typeof step>[1] = { x, y: floor.y, z, fallSpeed: fx32(0), grounded: true }
  const dx = fx32(Math.round(way.x * WALK_SPEED))
  const dz = fx32(Math.round(way.z * WALK_SPEED))
  for (let i = 0; i < ticks; i++) state = step(world, state, dx, dz, PERSON)
  return { x: toFloat(state.x), z: toFloat(state.z) }
}

describe.skipIf(!romPath)('doors on a real cartridge', { timeout: 60_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

  it("finds the village's ten doors, none of them a wall once the loader is done", () => {
    const doors = doorsOf(load(rom, { map: 'M01' }).map)
    expect(doors).toHaveLength(10)
    expect(doors.every((d) => d.mesh === undefined)).toBe(true)
  })

  it("lets the Hero through Erinn's house's doors open, and not shut", () => {
    const house = load(rom, { map: 'M01M10' })
    const doors = doorsOf(house.map)
    expect(doors.map((d) => d.stem)).toEqual(['M01M10D1', 'M01M10D2'])
    for (const d of doors) {
      if (d.mesh === undefined) throw new Error(`${d.stem} has no collision of its own`)
      const shut = createCollisionWorld(house.map.meshes)
      const open = createCollisionWorld(house.map.meshes.filter((_, i) => i !== d.mesh))
      const length = Math.hypot(d.leaf.x, d.leaf.z)
      const middle = { x: d.hinge.x + d.leaf.x / 2, z: d.hinge.z + d.leaf.z / 2 }
      const across = { x: -d.leaf.z / length, z: d.leaf.x / length }
      let tried = 0
      for (const side of [1, -1]) {
        const way = { x: across.x * side, z: across.z * side }
        const from = { x: middle.x - way.x * 0.12, z: middle.z - way.z * 0.12 }
        const beyond = (to: { x: number; z: number }) =>
          (to.x - middle.x) * way.x + (to.z - middle.z) * way.z > 0.06
        const through = walk(open, from, way, 90)
        const stopped = walk(shut, from, way, 90)
        if (!through || !stopped) continue
        tried++
        expect(beyond(through), `${d.stem} open, from side ${side}`).toBe(true)
        expect(beyond(stopped), `${d.stem} shut, from side ${side}`).toBe(false)
      }
      expect(tried, `${d.stem}: floor on neither side`).toBeGreaterThan(0)
    }
  })
})
