import { readFileSync } from 'node:fs'
import { FX32_ONE, fx32, toFloat } from '@minstrel/fixed'
import { RANDOM_ITEM, RANDOM_MONSTER, type Treasure } from '@minstrel/game-formats'
import { groundBelow } from '@minstrel/sim'
import { describe, expect, it } from 'vitest'
import { load } from '../src/load.ts'
import {
  findInside,
  nearestTreasure,
  treasureKey,
  treasurePieces,
  treasureTargets,
  treasureText,
} from '../src/treasure.ts'

function treasure(over: Partial<Treasure> = {}): Treasure {
  return {
    index: 21,
    unknown_0: 0x01220002,
    kind: 0x10,
    position: { x: 1, y: 0.02, z: 2 },
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
    ...over,
  }
}

describe('treasure', () => {
  it('is remembered by its game-wide number, or by where it is without one', () => {
    expect(treasureKey('M01M07', 0, treasure())).toBe('#21')
    expect(treasureKey('M01M07', 3, treasure({ index: undefined }))).toBe('M01M07/3')
  })

  it('can be walked up to only when it has a position', () => {
    const targets = treasureTargets([treasure({ position: undefined }), treasure()])
    expect(targets).toEqual([{ id: 1, name: 'treasure', x: 1, z: 2 }])
  })

  it('says which treasure was opened and where its contents must be, and that an open one is open', () => {
    expect(treasureText(treasure(), false)).toBe(
      'You open treasure #21.\nWhat is inside is not read yet: its first value is 0x01220002.',
    )
    expect(treasureText(treasure(), true)).toBe('You have already opened treasure #21.')
  })

  it('marks shut and open treasure apart, each cube standing on its treasure', () => {
    const pieces = treasurePieces(
      [treasure(), treasure({ position: undefined }), treasure({ position: { x: 5, y: 1, z: 5 } })],
      (_, slot) => slot === 2,
      0.1,
    )
    expect(pieces).toHaveLength(2)
    const [shut, open] = pieces.map((piece) => piece.geometry)
    expect(shut?.vertices).toHaveLength(8)
    expect(open?.vertices).toHaveLength(8)
    expect(shut?.vertices[0]?.g).toBeGreaterThan(open?.vertices[0]?.g ?? 1)
    const ys = open?.vertices.map((v) => v.y) ?? []
    expect(Math.min(...ys)).toBe(1)
    expect(Math.max(...ys)).toBeCloseTo(1.1, 9)
    // Twelve triangles, each both ways round.
    expect(open?.indices).toHaveLength(72)
    expect(Math.max(...(open?.indices ?? []))).toBe(7)
  })

  it('says which is nearest, ignoring treasure with no position', () => {
    const far = treasure({ index: 1, position: { x: 3, y: 0, z: 4 } })
    const near = treasure({ index: 2, position: { x: 0, y: 0, z: 1 } })
    const found = nearestTreasure([treasure({ position: undefined }), far, near], { x: 0, z: 0 })
    expect(found?.treasure).toBe(near)
    expect(found?.distance).toBe(1)
    expect(nearestTreasure([treasure({ position: undefined })], { x: 0, z: 0 })).toBeUndefined()
  })

  it('says when a chest was really a monster, by its number, and that nothing follows', () => {
    const chest = treasure({ kind: 0x40, unknown_0: 4 })
    const randoms = new Map([
      [
        'randTBox',
        [
          { rank: 4, kind: RANDOM_ITEM, value: 7, weight: 90 },
          { rank: 4, kind: RANDOM_MONSTER, value: 38, weight: 10 },
        ],
      ],
    ])
    const found = findInside(chest, randoms, new Map(), 95)
    expect(found.text).toBe(
      'The chest was really a monster — number 38 in the monster list!\nThere are no battles yet.',
    )
    expect(found.note).toContain('monster 38')
    expect(found.takings).toEqual({})
    const named = findInside(chest, randoms, new Map(), 95, new Map([[38, 'box<1>s bite']]))
    expect(named.text).toBe(
      'The chest was really a monster — box’s bite!\nThere are no battles yet.',
    )
    const herb = findInside(chest, randoms, new Map([[7, 'medicinal herb']]), 5)
    expect(herb.text).toBe('Inside: medicinal herb.')
    expect(herb.takings).toEqual({ item: 7 })
    expect(findInside(treasure({ kind: 0x4, unknown_0: 50 }), randoms, new Map()).takings).toEqual({
      gold: 50,
    })
  })

  it('draws nothing where nothing has a position', () => {
    expect(treasurePieces([treasure({ position: undefined })], () => false, 0.1)).toEqual([])
  })
})

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('treasure on a real cartridge', { timeout: 60_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

  it("puts the village's treasure on its floors, each numbered once", () => {
    const seen: number[] = []
    let placed = 0
    let unplaced = 0
    for (const code of ['M01M03', 'M01M04', 'M01M07', 'M01M08', 'M01M09', 'M01M10']) {
      const at = load(rom, { map: code })
      expect(at.treasures.length, code).toBeGreaterThan(0)
      const world = at.world
      if (!world) throw new Error(`${code} has no collision`)
      const above = fx32(Math.round(world.bounds.maxY + FX32_ONE))
      for (const t of at.treasures) {
        if (t.index === undefined) throw new Error(`${code} names no first treasure`)
        seen.push(t.index)
        if (!t.position) {
          unplaced++
          continue
        }
        placed++
        const hit = groundBelow(
          world,
          fx32(Math.round(t.position.x * FX32_ONE)),
          fx32(Math.round(t.position.z * FX32_ONE)),
          above,
        )
        if (!hit) throw new Error(`${code} treasure #${t.index} has no floor under it`)
        const lift = t.position.y - toFloat(hit.y)
        expect(lift, `${code} treasure #${t.index}`).toBeGreaterThanOrEqual(0)
        expect(lift, `${code} treasure #${t.index}`).toBeLessThan(0.05)
      }
    }
    expect(placed).toBe(8)
    expect(unplaced).toBe(4)
    // One run of numbers across the village, none twice.
    const sorted = [...seen].sort((a, b) => a - b)
    expect(new Set(sorted).size).toBe(sorted.length)
    expect((sorted.at(-1) ?? 0) - (sorted[0] ?? 0)).toBe(sorted.length - 1)
  })
})
