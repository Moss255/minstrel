import { describe, expect, it } from 'vitest'
import { adjacency, floorSize, grottoFloor } from '../src/grotto/floor.ts'

/**
 * The grotto floor generator against the game's own: every expected value
 * here is what the decomp's `FloorMapGenerator.cpp` and `FloorMap.cpp` —
 * marked complete, so the C++ the ARM9 was built from — give when compiled for
 * this machine by `tools/grotto-oracle`, with the two things the C++ leaves to
 * the DS as the binary has them: `RandRange` dividing as `_s32_div_f` does,
 * and `RoutineK`'s four unset locals given the caller's registers. Over all
 * 65,536 seeds and floors 1 to 16 the two agree on every tile.
 */

/** The floor as the oracle prints it: the tiles row by row, the rest on one line. */
function picture(seed: number, floor: number): string[] {
  const f = grottoFloor(seed, floor)
  const head = `${f.width}x${f.height} up ${f.up.x},${f.up.y} down ${f.down.x},${f.down.y} chests${f.chests
    .map((c) => ` ${c.x},${c.y}`)
    .join('')}`
  const rows: string[] = []
  for (let y = 0; y < 16; y++) rows.push([...f.tiles.subarray(y * 16, y * 16 + 16)].join(''))
  return [head, ...rows]
}

describe('a grotto floor, by the game’s generator', () => {
  it('lays out seed 12345’s first floor as the game does', () => {
    expect(picture(12345, 1)).toEqual([
      '11x11 up 7,7 down 8,2 chests',
      '1111111111111111',
      '1111311011111111',
      '1108210850111111',
      '1188210000111111',
      '1112228108111111',
      '1222333333111111',
      '1211384011111111',
      '1808280481111111',
      '1880308001111111',
      '1111300001111111',
      '1111111111111111',
      '1111111111111111',
      '1111111111111111',
      '1111111111111111',
      '1111111111111111',
      '1111111111111111',
    ])
  })

  it('puts chests from floor 3, after the hundred tries floor 3 throws away', () => {
    expect(picture(12345, 3)[0]).toBe('13x13 up 10,2 down 7,4 chests 9,8 7,8')
    expect(grottoFloor(12345, 2).chests).toEqual([])
  })

  it('agrees with the game’s on thirty-two thousand floors', () => {
    // FNV-1a over each floor's tiles and adjacency, its stairs and chests, for
    // the seeds 131·n mod 65,536, n below 2,000, on floors 1 to 16.
    let hash = 2166136261
    const mix = (byte: number) => {
      hash = Math.imul(hash ^ (byte & 0xff), 16777619) >>> 0
    }
    for (let n = 0; n < 2000; n++) {
      for (let floor = 1; floor <= 16; floor++) {
        const f = grottoFloor((n * 131) % 65536, floor)
        for (const b of f.tiles) mix(b)
        for (const b of f.adjacency) mix(b)
        for (const b of [f.up.x, f.up.y, f.down.x, f.down.y, f.chests.length]) mix(b)
        for (const c of f.chests) {
          mix(c.x)
          mix(c.y)
        }
      }
    }
    expect(hash).toBe(404180363)
  }, 60_000)

  it('sizes a floor by its band, from the seed and floor, square', () => {
    expect(floorSize(0, 1)).toBe(11)
    expect(floorSize(0, 4)).toBe(14)
    expect(floorSize(0, 5)).toBe(13)
    expect(floorSize(3, 9)).toBe(14)
    expect(floorSize(0, 13)).toBe(16)
    const f = grottoFloor(777, 6)
    expect(f.width).toBe(f.height)
  })

  it('marks a tile’s rock neighbours as the game packs them', () => {
    const tiles = new Uint8Array(256).fill(1)
    // A floor tile at (5, 5) open to the east and south only.
    tiles[5 * 16 + 5] = 0
    tiles[5 * 16 + 6] = 0
    tiles[6 * 16 + 5] = 0
    tiles[6 * 16 + 6] = 0
    // North and west rock, and with them the corners beside them.
    expect(adjacency(tiles, 5, 5, 0)).toBe(0x80 | 0x40 | 0x20 | 0x02 | 0x01)
    expect(adjacency(tiles, 4, 4, 0)).toBe(0xff)
  })
})
