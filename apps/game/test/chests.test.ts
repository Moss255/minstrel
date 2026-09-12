import { readFileSync } from 'node:fs'
import { textureFor } from '@minstrel/cartridge'
import type { Treasure } from '@minstrel/game-formats'
import { measureBounds } from '@minstrel/nitro-gfx'
import { WORLD_SCALE } from '@minstrel/world'
import { describe, expect, it } from 'vitest'
import { chestLook, chestPieces, isChest, SECOND_CHEST_KIND } from '../src/chests.ts'
import { load } from '../src/load.ts'

function treasure(over: Partial<Treasure>): Treasure {
  return {
    index: 0,
    unknown_0: 0,
    kind: 0x8,
    position: { x: 0, y: 0, z: 0 },
    facing: 0,
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

describe('a chest', () => {
  it('is placed treasure that faces a way', () => {
    expect(isChest(treasure({}))).toBe(true)
    expect(isChest(treasure({ facing: undefined }))).toBe(false)
    expect(isChest(treasure({ position: undefined }))).toBe(false)
  })

  it('takes the second look for its kind, and the first for any other', () => {
    expect(chestLook(treasure({ kind: SECOND_CHEST_KIND }))).toBe(1)
    expect(chestLook(treasure({ kind: 0x8 }))).toBe(0)
  })

  it('draws nothing without its models', () => {
    expect(
      chestPieces(
        [treasure({})],
        [],
        () => false,
        () => undefined,
      ),
    ).toEqual([])
  })
})

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('chests on a real cartridge', { timeout: 60_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

  it('finds both chests, shut and open, and stands one in its room, textured', () => {
    const room = load(rom, { map: 'M01M08' })
    expect(room.chests.map((look) => [look.shut?.name, look.open?.name])).toEqual([
      ['T00GDS01', 'T00GDS02'],
      ['T00GDS03', 'T00GDS04'],
    ])
    const chests = room.treasures.filter(isChest)
    expect(chests.length).toBeGreaterThan(0)
    const texture = (material: Parameters<typeof textureFor>[1]) =>
      textureFor(room.catalogue, material)
    const shut = chestPieces(room.treasures, room.chests, () => false, texture)
    const open = chestPieces(room.treasures, room.chests, () => true, texture)
    expect(shut.length).toBeGreaterThan(0)
    expect(shut.every((piece) => piece.pixels !== undefined)).toBe(true)
    const box = measureBounds(shut.map((piece) => piece.geometry))
    const at = chests[0]?.position
    if (!at) throw new Error('no chest position')
    // Standing on its spot, 0.41 of the files' units tall.
    expect(box.minY).toBeCloseTo(at.y, 6)
    expect(box.maxY - box.minY).toBeCloseTo(0.41 * WORLD_SCALE, 2)
    // Open, the lid is thrown back: lower than shut.
    const lid = measureBounds(open.map((piece) => piece.geometry))
    expect(lid.maxY).toBeLessThan(box.maxY)
  })
})
