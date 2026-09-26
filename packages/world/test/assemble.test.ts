import { readMapManifest } from '@minstrel/game-formats'
import { buildCollision, buildManifest } from '@minstrel/game-formats/test/fixture.ts'
import type { Geometry } from '@minstrel/nitro-gfx'
import { buildNsbmd, triangleList } from '@minstrel/nitro-gfx/test/fixture.ts'
import { describe, expect, it } from 'vitest'
import {
  assembleMap,
  inMarsh,
  inWater,
  type MarshArea,
  placeGeometry,
  type WaterArea,
  WORLD_SCALE,
} from '../src/assemble.ts'

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

describe('assembleMap', () => {
  // `D03M06`'s shape, and the Hexagon's: a door model placed twice with its
  // collision placed twice — each hanging off one of the door's placements —
  // and a sliding piece placed at each end of its slide, likewise.
  const model = () =>
    buildNsbmd([{ name: 'm', shapes: [{ name: 's', displayList: triangleList() }] }])
  // A floor triangle, so it is a wall rather than a doorway's marker.
  const collision = () =>
    buildCollision(
      [
        {
          points: [
            [0, 0, 0],
            [100, 0, 0],
            [0, 0, 100],
          ],
          normal: [0, 1, 0],
          attributes: 0,
        },
      ],
      [[0]],
    )
  const members = new Map([
    ['M00M0602.nsbmd', model()],
    ['M00A0602.col2', collision()],
    ['M00M00S1.nsbmd', model()],
    ['M00A00S1.col2', collision()],
  ])
  const manifest = readMapManifest(
    buildManifest(['M00M0602.imd', 'M00A0602.imd', 'M00M00S1.imd', 'M00A00S1.imd'], {
      places: [
        { slot: 2, names: 0, at: [8, 0, 96] },
        { slot: 6, names: 1, parent: 2 },
        { slot: 4, names: 0, at: [8, 0, 144] },
        { slot: 8, names: 1, parent: 4 },
        { slot: 10, names: 2, at: [-24, 0, 0] },
        { slot: 11, names: 3, parent: 10 },
        { slot: 12, names: 2, at: [0, 0, 8] },
        { slot: 13, names: 3, parent: 12 },
      ],
    }),
  )
  const sliding = (stem: string) => stem.endsWith('S1')

  it('builds a piece for every placement of a resource', () => {
    const doors = assembleMap(manifest, members).pieces.filter((p) => p.source === 'M00M0602')
    expect(doors.map((p) => p.place.z)).toEqual([96 * WORLD_SCALE, 144 * WORLD_SCALE])
    expect(doors.map((p) => p.instance)).toEqual([2, 4])
  })

  it("stands each collision on its own placement's parent", () => {
    // Resolved through the door's last placement, both collisions would stand
    // in the second doorway and the first would have none.
    const walls = assembleMap(manifest, members).meshes.filter((m) => m.source === 'M00A0602')
    expect(walls.map((m) => m.attachedTo)).toEqual([2, 4])
    expect(walls.map((m) => (m.offset?.z ?? 0) / 4096)).toEqual([
      96 * WORLD_SCALE,
      144 * WORLD_SCALE,
    ])
  })

  it('builds a piece the caller says moves once, at its last placement', () => {
    const map = assembleMap(manifest, members, { once: sliding })
    const piece = map.pieces.filter((p) => p.source === 'M00M00S1')
    const wall = map.meshes.filter((m) => m.source === 'M00A00S1')
    expect(piece.map((p) => p.place.z)).toEqual([8 * WORLD_SCALE])
    expect(piece.map((p) => p.instance)).toEqual([12])
    expect(wall.map((m) => m.attachedTo)).toEqual([12])
    // And the doors are still two.
    expect(map.pieces.filter((p) => p.source === 'M00M0602')).toHaveLength(2)
  })

  it('builds every placement of it when not told', () => {
    const map = assembleMap(manifest, members)
    expect(map.pieces.filter((p) => p.source === 'M00M00S1')).toHaveLength(2)
  })
})
