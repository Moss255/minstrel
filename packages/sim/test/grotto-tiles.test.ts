import { describe, expect, it } from 'vitest'
import { grottoFloor } from '../src/grotto/floor.ts'
import { floorTiles, placeOnTile, turnPlaces } from '../src/grotto/tiles.ts'

describe('a grotto floor’s tiles, as func_02019728 gives them their pieces', () => {
  it('names every adjacency the generator makes, and makes every one it names', () => {
    // 47 bytes in the switch's cases; across these floors the generator makes
    // those 47 and no others, so no tile ever keeps the last tile's piece.
    const seen = new Set<number>()
    const unnamed = new Set<number>()
    for (let seed = 0; seed < 65536; seed += 97) {
      for (let floor = 1; floor <= 16; floor++) {
        const floorMap = grottoFloor(seed, floor)
        const tiles = floorTiles(floorMap)
        for (let i = 0; i < 256; i++) {
          const bits = floorMap.adjacency[i] as number
          seen.add(bits)
          if ((tiles[i] as { name: string }).name === '') unnamed.add(bits)
        }
      }
    }
    expect(seen.size).toBe(47)
    expect([...unnamed]).toEqual([])
  }, 60_000)

  it('gives seed 12345’s first floor its pieces and turns', () => {
    const tiles = floorTiles(grottoFloor(12345, 1))
    const at = (x: number, y: number) => tiles[y * 16 + x]
    // Rock all round the floor, and beyond it to the grid's edge.
    expect(at(0, 0)).toMatchObject({ name: 'F01A', kind: 12, turn: 0 })
    expect(at(15, 15)).toMatchObject({ name: 'F01A' })
    // Row 7, whose adjacency the game's generator makes `ff a3 e0 e8 ee 82 00
    // 20 f8 ff ff` (tools/grotto-oracle): each byte's piece and turn.
    expect(tiles.filter((t) => t.y === 7 && t.x < 11).map((t) => `${t.name}${t.turn}`)).toEqual([
      'F01A0',
      'D02A0',
      'R01A0',
      'D02A3',
      'W01A1',
      'D01A1',
      'R04A0',
      'R03A3',
      'R02A3',
      'F01A0',
      'F01A0',
    ])
  })
})

describe('the places on a tile', () => {
  it('turns the nine places and the ways to face with the tile', () => {
    // One place, the north-west corner, facing up only.
    const places = [1, 0, 0, 0, 0, 0, 0, 0, 0]
    // A quarter turn takes it to the south-west, facing left.
    expect(turnPlaces(places, 1)).toEqual([0, 0, 0, 0, 0, 0, 8, 0, 0])
    // A half turn, to the south-east facing down.
    expect(turnPlaces(places, 2)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 4])
    // Three quarters, to the north-east facing right.
    expect(turnPlaces(places, 3)).toEqual([0, 0, 2, 0, 0, 0, 0, 0, 0])
    expect(turnPlaces(places, 0)).toEqual(places)
  })

  it('puts an object on one of a tile’s places, by the game’s draws', () => {
    const draws = [4, 1]
    const rand = () => draws.shift() ?? 0
    // Places 1, 4 and 7 — the middle column — the second facing right or left.
    const places = [0, 5, 0, 0, 10, 0, 0, 5, 0]
    // The draw 4 picks the second of three valid places, then 1 its second way.
    expect(placeOnTile('W01A', places, 2, 3, rand, false)).toEqual({
      x: 2 * 8 * 4096,
      z: 3 * 8 * 4096,
      facing: 3,
    })
  })

  it('faces down, then right, then left when asked to, without a draw', () => {
    const rand = () => 0
    expect(placeOnTile('R04A', [0, 0, 0, 0, 0b1111, 0, 0, 0, 0], 0, 0, rand, true)?.facing).toBe(2)
    expect(placeOnTile('R04A', [0, 0, 0, 0, 0b1010, 0, 0, 0, 0], 0, 0, rand, true)?.facing).toBe(1)
  })

  it('stands an R02A’s corner places further out', () => {
    const object = placeOnTile('R02A', [0, 0, 0, 0, 0, 0, 0, 0, 0b1111], 1, 1, () => 0, false)
    expect(object).toMatchObject({ x: 8 * 4096 + 0x34cc, z: 8 * 4096 + 0x34cc })
  })

  it('puts nothing on a tile with no place', () => {
    expect(placeOnTile('S01A', [0, 0, 0, 0, 0, 0, 0, 0, 0], 0, 0, () => 0, false)).toBeUndefined()
  })
})
