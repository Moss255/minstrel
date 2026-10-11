import { describe, expect, it } from 'vitest'
import { grottoFloor } from '../src/grotto/floor.ts'
import { arrivalAt, downBox, grottoStairs, upBox } from '../src/grotto/stairs.ts'
import { floorTiles } from '../src/grotto/tiles.ts'

/**
 * A floor's ways, as `func_0201a600` puts them — `stairs.ts`. Every place of
 * every tile is offered every way to face (`0xf`): a synthetic `.bpos`.
 */
const everywhere = () => [0xf, 0xf, 0xf, 0xf, 0xf, 0xf, 0xf, 0xf, 0xf]

describe("a grotto floor's ways up and down", () => {
  const floor = grottoFloor(12345, 1)
  const tiles = floorTiles(floor)

  it('stands each on its own tile, the way up turned to its facing and the way down not', () => {
    const { up, down } = grottoStairs(floor, tiles, everywhere, 12345, 1)
    if (!up || !down) throw new Error('no ways')
    const tileOf = (x: number) => Math.trunc((x + 0x4000) / 0x8000)
    expect([tileOf(up.x), tileOf(up.z)]).toEqual([floor.up.x, floor.up.y])
    expect([tileOf(down.x), tileOf(down.z)]).toEqual([floor.down.x, floor.down.y])
    expect(up.turn).toBe([2, 1, 0, 3][up.facing])
    expect(down.turn).toBe(0)
    expect(up.y).toBe(0)
  })

  it('draws again for each from the map’s seed, so the same seed puts them the same', () => {
    expect(grottoStairs(floor, tiles, everywhere, 12345, 1)).toEqual(
      grottoStairs(floor, tiles, everywhere, 12345, 1),
    )
  })

  it('raises them in the ruins on a corridor or a dead end only', () => {
    const plain = grottoStairs(floor, tiles, everywhere, 12345, 1)
    const ruins = grottoStairs(floor, tiles, everywhere, 12345, 2)
    for (const which of ['up', 'down'] as const) {
      const at = which === 'up' ? floor.up : floor.down
      const byte = floor.adjacency[(at.y << 4) + at.x] as number
      const raised = [
        0xbb, 0xee, 0xeb, 0xaf, 0xbe, 0xfa, 0xaa, 0xea, 0xab, 0xae, 0xba, 0xfb, 0xef, 0xbf, 0xfe,
      ].includes(byte)
      expect(ruins[which]?.y).toBe(raised ? 0x666 : 0)
      expect(plain[which]?.y).toBe(0)
    }
  })

  it('puts an arrival 1.5 units in front of a way, facing away, and its boxes about it', () => {
    const at = { x: 0x10000, y: 0, z: 0x20000, turn: 0, angle: 0 }
    expect(arrivalAt({ ...at, facing: 0 })).toEqual({
      x: 0x10000,
      z: 0x20000 - 0x1800,
      angle: 0x3243,
    })
    expect(arrivalAt({ ...at, facing: 1 })).toEqual({ x: 0x11800, z: 0x20000, angle: 0x1921 })
    expect(arrivalAt({ ...at, facing: 2 })).toEqual({ x: 0x10000, z: 0x21800, angle: 0 })
    expect(arrivalAt({ ...at, facing: 3 })).toEqual({
      x: 0x10000 - 0x1800,
      z: 0x20000,
      angle: 0x4b65,
    })
    expect(upBox({ ...at, facing: 2 })).toMatchObject({
      halfX: 0x800,
      halfZ: 0x400,
      bottom: 0,
      top: 0x3000,
    })
    expect(downBox({ ...at, facing: 2 })).toMatchObject({
      halfX: 0xc00,
      halfZ: 0xc00,
      bottom: -0x1000,
      top: 0x2000,
    })
  })
})
