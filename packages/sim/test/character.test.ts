import { add, FX32_ONE, fromInt, fx32, toFloat } from '@vesper/fixed'
import type { CollisionMesh, CollisionTriangle } from '@vesper/game-formats'
import { describe, expect, it } from 'vitest'
import {
  type CharacterShape,
  type CharacterState,
  PERSON,
  type StepResult,
  step,
} from '../src/character.ts'
import { createCollisionWorld } from '../src/collision.ts'

type Point = readonly [number, number, number]
const U = FX32_ONE

/** A mesh in the units the format uses: whole `fx32` words, so a unit is 4096. */
function mesh(triangles: readonly (readonly [Point, Point, Point])[]): CollisionMesh {
  const points = triangles.flat()
  const axis = (k: number) => points.map((p) => p[k] as number)
  const built: CollisionTriangle[] = triangles.map((vertices) => {
    const [a, b, c] = vertices
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
      vertices: vertices as CollisionTriangle['vertices'],
      normal: [nx / length, ny / length, nz / length],
      attributes: 0,
    }
  })
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

/** A flat square covering `-n..n` on both axes, at height `y`. */
function floor(n: number, y = 0): readonly [Point, Point, Point][] {
  const s = n * U
  const h = y * U
  return [
    [
      [-s, h, -s],
      [s, h, -s],
      [-s, h, s],
    ],
    [
      [s, h, -s],
      [s, h, s],
      [-s, h, s],
    ],
  ]
}

/** A vertical wall across x, running from `z0` to `z1`, `height` tall. */
function wall(x: number, z0: number, z1: number, height: number): readonly [Point, Point, Point][] {
  const wx = x * U
  return [
    [
      [wx, 0, z0 * U],
      [wx, height * U, z0 * U],
      [wx, 0, z1 * U],
    ],
    [
      [wx, height * U, z0 * U],
      [wx, height * U, z1 * U],
      [wx, 0, z1 * U],
    ],
  ]
}

const shape: CharacterShape = {
  ...PERSON,
  radius: fromInt(1),
  height: fromInt(2),
  stepUp: fx32(U / 2),
  snapDown: fromInt(1),
  gravity: fx32(U / 8),
  terminalSpeed: fromInt(4),
}

const standing = (x: number, y: number, z: number): CharacterState => ({
  x: fromInt(x),
  y: fromInt(y),
  z: fromInt(z),
  fallSpeed: fx32(0),
  grounded: true,
})

describe('walking', () => {
  const world = createCollisionWorld(mesh(floor(20)))

  it('stays on the floor while moving across it', () => {
    let state: CharacterState = standing(0, 0, 0)
    for (let i = 0; i < 10; i++) {
      state = step(world, state, fromInt(1), fx32(0), shape)
    }
    expect(state.grounded).toBe(true)
    expect(state.y).toBe(0)
    expect(toFloat(state.x)).toBeCloseTo(10, 3)
  })

  it('moves exactly as far as it is asked to, over open ground', () => {
    const after = step(world, standing(0, 0, 0), fromInt(3), fromInt(4), shape)
    expect(after.x).toBe(fromInt(3))
    expect(after.z).toBe(fromInt(4))
    expect(after.hitWall).toBe(false)
  })

  it('reports the ground it is standing on as flat', () => {
    expect(step(world, standing(0, 0, 0), fx32(0), fx32(0), shape).slope).toBe(FX32_ONE)
  })
})

describe('walls', () => {
  // A floor with a wall at x = 5, spanning the middle.
  const world = createCollisionWorld(mesh([...floor(20), ...wall(5, -10, 10, 4)]))

  it('stops a character walking into one', () => {
    let state: StepResult = step(world, standing(0, 0, 0), fx32(0), fx32(0), shape)
    for (let i = 0; i < 20; i++) state = step(world, state, fromInt(1), fx32(0), shape)
    expect(state.hitWall).toBe(true)
    // Held a radius clear of the wall rather than pushed through it.
    expect(toFloat(state.x)).toBeLessThan(5)
    expect(toFloat(state.x)).toBeCloseTo(4, 0)
  })

  it('slides along one rather than sticking to it', () => {
    // Pressed into the wall and along it at the same time.
    let state: CharacterState = standing(0, 0, 0)
    for (let i = 0; i < 10; i++) state = step(world, state, fromInt(1), fromInt(1), shape)
    expect(toFloat(state.x)).toBeLessThan(5)
    // The part of the movement the wall does not oppose is kept.
    expect(toFloat(state.z)).toBeGreaterThan(8)
  })

  it('lets a character walk away from one it is against', () => {
    let state: CharacterState = standing(0, 0, 0)
    for (let i = 0; i < 20; i++) state = step(world, state, fromInt(1), fx32(0), shape)
    const against = toFloat(state.x)
    for (let i = 0; i < 3; i++) state = step(world, state, fromInt(-1), fx32(0), shape)
    expect(toFloat(state.x)).toBeLessThan(against - 2)
  })

  it('walks over a lip lower than the step-up height', () => {
    const low = createCollisionWorld(mesh([...floor(20), ...wall(5, -10, 10, 0.25)]))
    let state: CharacterState = standing(0, 0, 0)
    for (let i = 0; i < 20; i++) state = step(low, state, fromInt(1), fx32(0), shape)
    expect(toFloat(state.x)).toBeGreaterThan(5)
  })
})

describe('slopes', () => {
  /** A ramp climbing `rise` units over 10, from x = 0 to x = 10. */
  const ramp = (rise: number) =>
    createCollisionWorld(
      mesh([
        ...floor(20),
        [
          [0, 0, -10 * U],
          [10 * U, rise * U, -10 * U],
          [0, 0, 10 * U],
        ],
        [
          [10 * U, rise * U, -10 * U],
          [10 * U, rise * U, 10 * U],
          [0, 0, 10 * U],
        ],
      ]),
    )

  it('climbs a gentle one', () => {
    // The ramp rises 4 over 10, so ten steps reach the top; an eleventh walks
    // off it, which is a fall rather than a climb.
    const world = ramp(4)
    let state: CharacterState = standing(0, 0, 0)
    for (let i = 0; i < 10; i++) state = step(world, state, fromInt(1), fx32(0), shape)
    expect(state.grounded).toBe(true)
    expect(toFloat(state.y)).toBeCloseTo(4, 1)
  })

  it('is stopped by one too steep to stand on', () => {
    // Rising 40 over 10 is about 76 degrees, well past the limit.
    const world = ramp(40)
    let state: StepResult = step(world, standing(-5, 0, 0), fx32(0), fx32(0), shape)
    for (let i = 0; i < 20; i++) state = step(world, state, fromInt(1), fx32(0), shape)
    expect(state.hitWall).toBe(true)
    expect(toFloat(state.y)).toBeLessThan(2)
  })

  it('follows a downward slope instead of stepping off it', () => {
    const world = ramp(4)
    let state: CharacterState = standing(0, 0, 0)
    for (let i = 0; i < 10; i++) state = step(world, state, fromInt(1), fx32(0), shape)
    const top = state.y
    for (let i = 0; i < 10; i++) {
      state = step(world, state, fromInt(-1), fx32(0), shape)
      // Never leaves the surface on the way down.
      expect(state.grounded).toBe(true)
    }
    expect(state.y).toBeLessThan(top)
  })
})

describe('falling', () => {
  // A platform from -4..4, with nothing beyond it.
  const world = createCollisionWorld(mesh(floor(4, 0)))

  it('falls off the edge', () => {
    let state: CharacterState = standing(0, 0, 0)
    for (let i = 0; i < 8; i++) state = step(world, state, fromInt(1), fx32(0), shape)
    expect(state.grounded).toBe(false)
    expect(toFloat(state.y)).toBeLessThan(0)
  })

  it('accelerates while falling, up to the terminal speed', () => {
    let state: CharacterState = { ...standing(20, 40, 0), grounded: false }
    let previous = fx32(0)
    for (let i = 0; i < 5; i++) {
      state = step(world, state, fx32(0), fx32(0), shape)
      expect(state.fallSpeed).toBeGreaterThan(previous)
      previous = state.fallSpeed
    }
    for (let i = 0; i < 200; i++) state = step(world, state, fx32(0), fx32(0), shape)
    expect(state.fallSpeed).toBe(shape.terminalSpeed)
  })

  it('lands on the floor rather than passing through it', () => {
    let state: CharacterState = { ...standing(0, 30, 0), grounded: false }
    for (let i = 0; i < 200; i++) {
      state = step(world, state, fx32(0), fx32(0), shape)
      if (state.grounded) break
    }
    expect(state.grounded).toBe(true)
    expect(state.y).toBe(0)
    expect(state.fallSpeed).toBe(0)
  })
})

describe('determinism', () => {
  const world = createCollisionWorld(mesh([...floor(20), ...wall(5, -10, 10, 4)]))

  it('gives the same path every time it is walked', () => {
    const walk = () => {
      let state: CharacterState = standing(0, 0, 0)
      const path: string[] = []
      for (let i = 0; i < 50; i++) {
        state = step(world, state, fx32(Math.round(U / 3)), fx32(Math.round(U / 7)), shape)
        path.push(`${state.x},${state.y},${state.z}`)
      }
      return path.join(' ')
    }
    expect(walk()).toBe(walk())
  })

  it('never leaves a position that is not a whole fx32 word', () => {
    let state: CharacterState = standing(0, 0, 0)
    for (let i = 0; i < 50; i++) {
      state = step(world, state, fx32(Math.round(U / 3)), fx32(Math.round(U / 7)), shape)
      for (const value of [state.x, state.y, state.z, state.fallSpeed]) {
        expect(Number.isInteger(value)).toBe(true)
      }
    }
  })
})

describe('a badly shaped character', () => {
  const world = createCollisionWorld(mesh(floor(20)))

  it('is rejected rather than behaving oddly', () => {
    expect(() =>
      step(world, standing(0, 0, 0), fx32(0), fx32(0), { ...shape, height: fx32(0) }),
    ).toThrow(/positive height/)
    expect(() =>
      step(world, standing(0, 0, 0), fx32(0), fx32(0), { ...shape, radius: fromInt(-1) }),
    ).toThrow(/non-negative radius/)
  })
})

describe('PERSON', () => {
  it('is about half the height of the rooms it walks through', () => {
    // Every interior in the village has a ceiling at almost exactly two units,
    // which is what puts a person at one.
    expect(toFloat(PERSON.height)).toBeGreaterThan(0.8)
    expect(toFloat(PERSON.height)).toBeLessThan(1.3)
  })

  it('has proportions a person would have', () => {
    const height = toFloat(PERSON.height)
    expect(toFloat(PERSON.radius) / height).toBeGreaterThan(0.1)
    expect(toFloat(PERSON.radius) / height).toBeLessThan(0.35)
    expect(toFloat(PERSON.stepUp)).toBeLessThan(height / 2)
    expect(add(PERSON.gravity, fx32(0))).toBeGreaterThan(0)
  })

  it('fits through a two-unit doorway with room to spare', () => {
    expect(toFloat(PERSON.height)).toBeLessThan(2)
    expect(toFloat(PERSON.radius) * 2).toBeLessThan(1)
  })
})
