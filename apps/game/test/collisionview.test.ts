import type { CollisionMesh } from '@minstrel/game-formats'
import type { PlacedMesh } from '@minstrel/sim'
import { describe, expect, it } from 'vitest'
import { fitFrom, fitMeshes, NO_FIT } from '../src/collisionview.ts'

/** A mesh with a grid and a shift of its own, as every mesh on the cartridge has. */
const mesh = {
  kind: 3,
  bounds: { minX: 0, minY: 0, minZ: 0, maxX: 4096, maxY: 4096, maxZ: 4096 },
  cellSize: 4096,
  gridX: 1,
  gridZ: 1,
  triangles: [
    {
      vertices: [
        [0, 0, 0],
        [0, 0, 4096],
        [4096, 0, 0],
      ],
      normal: [0, 1, 0],
      attributes: 0,
    },
  ],
  cells: [{ start: 0, count: 1 }],
  cellTriangles: [0],
  trailing: [],
  shift: 3,
  unknown_0x1a: 0,
  cell: () => [],
} as unknown as CollisionMesh

const placed: PlacedMesh = { mesh, offset: { x: 1, y: 2, z: 3 }, scale: 1 }

describe('the development fit of a map’s collision', () => {
  it('hands the meshes on untouched when it changes nothing, whichever object says so', () => {
    // The game builds its fit afresh, scaled by the world's, so an unchanged
    // fit is never `NO_FIT` itself — and a mesh rebuilt would keep its file's
    // grid and shift while its corners moved, which the walls look up through.
    const fresh = { ...NO_FIT, sx: NO_FIT.sx * 1 }
    expect(fresh).not.toBe(NO_FIT)
    const [out] = fitMeshes([placed], fresh)
    expect(out).toBe(placed)
  })

  it('drops the file’s grid and shift from a mesh it stretches', () => {
    const [out] = fitMeshes([placed], fitFrom('2,0,0,0'))
    expect(out?.mesh.cells).toEqual([])
    expect(out?.mesh.shift).toBe(0)
    expect(out?.mesh.triangles[0]?.vertices[1]).toEqual([0, 0, 8192])
  })
})
