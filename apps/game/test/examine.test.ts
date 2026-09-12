import { readFileSync } from 'node:fs'
import {
  NPC_KIND,
  type NpcEntry,
  type NpcPlacement,
  type RandomTreasure,
  type Treasure,
} from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { cast } from '../src/cast.ts'
import { load } from '../src/load.ts'
import { DRAWN_FROM, drawRow, findInside, standInRoll } from '../src/treasure.ts'

const placement = (id: number): NpcPlacement => ({
  id,
  map: 1,
  x: 1,
  y: 0,
  z: 2,
  facing: 0,
  offset: 0,
})
const entry = (id: number, kind: number, name?: string): NpcEntry => ({
  id,
  kind,
  name,
  values: new Uint32Array(),
})

describe('something to examine', () => {
  it('is a placed record of kind 1, kept as a spot rather than dropped', () => {
    const found = cast(
      [
        { entry: entry(7, NPC_KIND.SPOT), placement: placement(7) },
        { entry: entry(8, 9), placement: placement(8) },
      ],
      new Map(),
      () => 0,
      1,
    )
    expect(found.spots.map((spot) => spot.placement.id)).toEqual([7])
    expect(found.unclassified).toBe(1)
  })
})

function treasure(kind: number, value: number, index = 3): Treasure {
  return {
    index,
    unknown_0: (0x0120 << 16) | value,
    kind,
    position: { x: 0, y: 0, z: 0 },
    facing: undefined,
    unknown_2: undefined,
    record: {
      tag: 0x67,
      type: 0,
      offset: 0,
      values: new Uint32Array(),
      floats: new Float32Array(),
      kinds: new Uint8Array(),
    },
  }
}

const NAMES = new Map([
  [0x5000, 'pebble'],
  [0x5001, 'hero<1>s cap'],
])
const ROWS: RandomTreasure[] = [
  { rank: 1, kind: 2, value: 0x5000, weight: 30 },
  { rank: 1, kind: 1, value: 40, weight: 20 },
  { rank: 2, kind: 2, value: 0x5001, weight: 100 },
]
const RANDOMS = new Map([
  ['randTTT', ROWS],
  ['randTBox', ROWS],
])

describe('what is inside', () => {
  it('names a chest’s item by its id, rendering the markup', () => {
    expect(findInside(treasure(0x8, 0x5001), RANDOMS, NAMES).text).toBe('Inside: hero’s cap.')
    expect(findInside(treasure(0x9, 0x7777), RANDOMS, NAMES).text).toBe('Inside: item 0x7777.')
  })

  it('counts gold, and finds nothing in a zero', () => {
    expect(findInside(treasure(0x4, 1500), RANDOMS, NAMES).text).toBe('Inside: 1500 gold coins.')
    expect(findInside(treasure(0x10, 0), RANDOMS, NAMES).text).toBe('There is nothing inside.')
    expect(findInside(treasure(0x0, 0), RANDOMS, NAMES).text).toBe('There is nothing inside.')
  })

  it('draws from the right table by rank and weight, and past the weights finds nothing', () => {
    expect(DRAWN_FROM.get(0x30)).toBe('randTTT')
    expect(drawRow(ROWS, 1, 0)?.value).toBe(0x5000)
    expect(drawRow(ROWS, 1, 29)?.value).toBe(0x5000)
    expect(drawRow(ROWS, 1, 30)?.value).toBe(40)
    expect(drawRow(ROWS, 1, 50)).toBeUndefined()
    const pot = treasure(0x10, 1)
    expect(findInside(pot, RANDOMS, NAMES, 10).text).toBe('Inside: pebble.')
    expect(findInside(pot, RANDOMS, NAMES, 40).text).toBe('Inside: 40 gold coins.')
    const empty = findInside(pot, RANDOMS, NAMES, 80)
    expect(empty.text).toBe('There is nothing inside.')
    expect(empty.note).toContain('weights coming to 50')
  })

  it('rolls the same for the same treasure every time', () => {
    expect(standInRoll(treasure(0x10, 1, 21))).toBe(standInRoll(treasure(0x10, 1, 21)))
    expect(standInRoll(treasure(0x10, 1, 21))).toBeLessThan(100)
  })
})

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('examining on a real cartridge', { timeout: 60_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

  it("finds the village's things to examine, and what examining the statue says", () => {
    const village = load(rom, { map: 'M01' })
    const ids = village.cast.spots.map((spot) => spot.placement.id)
    expect(ids).toEqual(expect.arrayContaining([93, 96]))
    const said = village.letters.flatMap((letter) => village.linesOf(96, letter))
    expect(said.length).toBeGreaterThan(0)
  })

  it('reads the item names and the random tables, and says what a room’s treasure holds', () => {
    const room = load(rom, { map: 'M01M07' })
    expect(room.itemNames.size).toBe(1178)
    expect([...room.randoms.keys()].sort()).toEqual(['randTBox', 'randTD', 'randTTT'])
    for (const t of room.treasures) {
      const found = findInside(t, room.randoms, room.itemNames)
      expect(found.text).toMatch(/^(Inside: |There is nothing inside\.)/)
      expect(found.text).not.toContain('item 0x')
    }
  })
})
