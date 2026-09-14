import type { Geometry } from '@minstrel/nitro-gfx'
import { describe, expect, it } from 'vitest'
import { inMarsh, inWater, type MarshArea, placeGeometry, type WaterArea } from '../src/assemble.ts'

const river: WaterArea = { minX: -2, maxX: 2, minZ: -1, maxZ: 1, surface: -0.31 }
/** The character's height, which is what "knee-deep" is measured against. */
const HEIGHT = 0.18

describe('inWater', () => {
  it('is true for a spot below the surface inside the footprint', () => {
    expect(inWater([river], 0, -0.5, 0, HEIGHT)).toBe(true)
  })

  it('is true for a sandbank standing above the surface but not clear of it', () => {
    // The village's spawn: ground at 0.17 over a surface at -0.31 is 0.48
    // above it, which for a character 0.18 tall is knee-deep.
    expect(inWater([river], 0, 0.17, 0, HEIGHT)).toBe(false)
    // …and within a character's height of it, it is.
    expect(inWater([river], 0, -0.2, 0, HEIGHT)).toBe(true)
  })

  it('is false outside the footprint however low the ground is', () => {
    expect(inWater([river], 9, -9, 9, HEIGHT)).toBe(false)
  })

  it('is false when the map has no water', () => {
    expect(inWater([], 0, -9, 0, HEIGHT)).toBe(false)
  })
})

describe('inMarsh', () => {
  // One triangle, (0, 0), (2, 0), (0, 2) on the ground plane, its surface at 0.
  const marsh: MarshArea = { triangles: new Float32Array([0, 0, 2, 0, 0, 2]), surface: 0 }

  it('is true over the triangle, on its surface or a little above it', () => {
    expect(inMarsh([marsh], 0.5, 0, 0.5, HEIGHT)).toBe(true)
    expect(inMarsh([marsh], 0.5, 0.1, 0.5, HEIGHT)).toBe(true)
    expect(inMarsh([marsh], 0, 0, 0, HEIGHT)).toBe(true)
  })

  it('is false inside its box but off the triangle, which a box would not tell', () => {
    expect(inMarsh([marsh], 1.8, 0, 1.8, HEIGHT)).toBe(false)
  })

  it('is false standing clear above it, and on a map with none', () => {
    expect(inMarsh([marsh], 0.5, 0.5, 0.5, HEIGHT)).toBe(false)
    expect(inMarsh([], 0.5, 0, 0.5, HEIGHT)).toBe(false)
  })

  it('takes a triangle wound either way', () => {
    const backwards: MarshArea = { triangles: new Float32Array([0, 0, 0, 2, 2, 0]), surface: 0 }
    expect(inMarsh([backwards], 0.5, 0, 0.5, HEIGHT)).toBe(true)
  })
})

function geometry(...ys: number[]): Geometry {
  return {
    vertices: ys.map((y) => ({ x: 1, y, z: 2, r: 0, g: 0, b: 0, u: 0, v: 0 })),
    triangles: [],
  } as unknown as Geometry
}

describe('placeGeometry', () => {
  it('leaves a piece the map does not move exactly where it is', () => {
    const at = geometry(3)
    expect(placeGeometry(at, { x: 0, y: 0, z: 0 }, 1)).toBe(at)
  })

  it('scales a piece standing at the origin, when it is told to', () => {
    // The contract that changed. Deciding the scale here from whether the piece
    // had moved was wrong for an indoor map: its own geometry sits at the
    // origin *and* is authored in the larger space, so a rule keyed on having
    // moved could never shrink it. `assembleMap` decides now, and this applies
    // what it decided.
    const at = geometry(3)
    const scaled = placeGeometry(at, { x: 0, y: 0, z: 0 }, 1 / 8)
    expect(scaled).not.toBe(at)
    expect(scaled.vertices[0]).toMatchObject({ x: 0.125, y: 0.375, z: 0.25 })
  })

  it('leaves a piece alone when there is nothing to do to it', () => {
    const at = geometry(3)
    expect(placeGeometry(at, { x: 0, y: 0, z: 0 }, 1)).toBe(at)
  })

  it('moves a placed piece to where the map puts it', () => {
    const moved = placeGeometry(geometry(3), { x: 10, y: 20, z: 30 }, 1)
    expect(moved.vertices[0]).toMatchObject({ x: 11, y: 23, z: 32 })
  })

  it('scales a placed piece about its own base, not its centre', () => {
    // Scaled first, then translated: a door twice the size grows upwards from
    // the doorway rather than sinking half of itself into the ground.
    const moved = placeGeometry(geometry(3), { x: 0, y: 5, z: 0 }, 2)
    expect(moved.vertices[0]).toMatchObject({ x: 2, y: 11, z: 4 })
  })

  it('keeps everything else about a vertex', () => {
    const moved = placeGeometry(geometry(3), { x: 1, y: 0, z: 0 }, 1)
    expect(moved.vertices[0]).toMatchObject({ r: 0, g: 0, b: 0, u: 0, v: 0 })
  })
})
