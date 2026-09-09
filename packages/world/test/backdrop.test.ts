import { FX32_ONE } from '@minstrel/fixed'
import type { CollisionBounds } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { backdrop } from '../src/backdrop.ts'

/** Collision bounds are in whole `fx32` words; the pieces are in units. */
function ground(minX: number, maxX: number, minZ: number, maxZ: number): CollisionBounds {
  return {
    minX: minX * FX32_ONE,
    maxX: maxX * FX32_ONE,
    minY: 0,
    maxY: FX32_ONE,
    minZ: minZ * FX32_ONE,
    maxZ: maxZ * FX32_ONE,
  }
}

const walkable = ground(-6, 6, -4.5, 4.5)

describe('backdrop', () => {
  it('catches a piece that reaches past the map on all four sides', () => {
    // The village's sky: 15.70 by 12.08 around ground of 12.0 by 9.1.
    const sky = { minX: -7.85, maxX: 7.85, minZ: -6.04, maxZ: 6.04 }
    expect(backdrop([sky], walkable)).toEqual([true])
  })

  it('leaves a room ceiling alone, because it sits within its own walls', () => {
    const ceiling = { minX: -2, maxX: 2, minZ: -2, maxZ: 2 }
    expect(backdrop([ceiling], walkable)).toEqual([false])
  })

  it('needs all four sides, not three', () => {
    // Past the map on x and on one side of z only: a long wall, not a sky.
    const wall = { minX: -9, maxX: 9, minZ: -9, maxZ: 0 }
    expect(backdrop([wall], walkable)).toEqual([false])
  })

  it('does not catch a piece exactly the size of the map', () => {
    // Strictly past, not level with: a ground plane matching its own collision
    // is the floor, and calling the floor a backdrop leaves nothing indoors.
    const floor = { minX: -6, maxX: 6, minZ: -4.5, maxZ: 4.5 }
    expect(backdrop([floor], walkable)).toEqual([false])
  })

  it('calls nothing a backdrop when the map has no collision to measure against', () => {
    const sky = { minX: -7.85, maxX: 7.85, minZ: -6.04, maxZ: 6.04 }
    expect(backdrop([sky], undefined)).toEqual([false])
  })

  it('answers one per piece, in order', () => {
    const sky = { minX: -9, maxX: 9, minZ: -9, maxZ: 9 }
    const room = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 }
    expect(backdrop([room, sky, room], walkable)).toEqual([false, true, false])
  })
})
