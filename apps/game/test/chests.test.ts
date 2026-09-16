import { readFileSync } from 'node:fs'
import { textureFor } from '@minstrel/cartridge'
import type { Treasure } from '@minstrel/game-formats'
import { measureBounds } from '@minstrel/nitro-gfx'
import { WORLD_SCALE } from '@minstrel/world'
import { describe, expect, it } from 'vitest'
import {
  chestLook,
  chestPieces,
  isChest,
  LID_OPEN_ANGLE,
  SECOND_CHEST_KIND,
  seatLid,
} from '../src/chests.ts'
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
        () => 0,
        () => undefined,
      ),
    ).toEqual([])
  })

  it('seats its lid on the body at the hinge, and turns it back about it', () => {
    // A lid one unit long from its hinge along +z, flat.
    const lid = {
      vertices: [
        { x: 0, y: 0, z: 0, matrixId: 0 },
        { x: 0, y: 0, z: 1, matrixId: 0 },
      ],
      indices: [],
      matrixIds: [],
      scales: [],
    } as unknown as Parameters<typeof seatLid>[0]
    const hinge = { y: 0.41, z: -0.34 }
    const shut = seatLid(lid, 0, hinge).vertices
    expect(shut[0]).toMatchObject({ y: 0.41, z: -0.34 })
    expect(shut[1]?.y).toBeCloseTo(0.41, 9)
    expect(shut[1]?.z).toBeCloseTo(0.66, 9)
    // Upright at a quarter turn: the free edge straight over the hinge.
    const upright = seatLid(lid, Math.PI / 2, hinge).vertices[1]
    expect(upright?.y).toBeCloseTo(1.41, 9)
    expect(upright?.z).toBeCloseTo(-0.34, 9)
    // Open, a little past upright: behind the hinge.
    const open = seatLid(lid, LID_OPEN_ANGLE, hinge).vertices[1]
    expect(open?.z).toBeLessThan(-0.34)
    // The hinge itself never moves.
    expect(seatLid(lid, LID_OPEN_ANGLE, hinge).vertices[0]).toMatchObject(hinge)
  })
})

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('chests on a real cartridge', { timeout: 60_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

  it('finds both chests, body and lid, and stands one in its room, textured', () => {
    const room = load(rom, { map: 'M01M08' })
    expect(room.chests.map((look) => [look.body?.name, look.lid?.name])).toEqual([
      ['T00GDS01', 'T00GDS02'],
      ['T00GDS03', 'T00GDS04'],
    ])
    const chests = room.treasures.filter(isChest)
    expect(chests.length).toBeGreaterThan(0)
    const texture = (material: Parameters<typeof textureFor>[1]) =>
      textureFor(room.catalogue, material)
    const shut = chestPieces(room.treasures, room.chests, () => 0, texture)
    const open = chestPieces(room.treasures, room.chests, () => 1, texture)
    expect(shut.length).toBeGreaterThan(0)
    expect(shut.every((piece) => piece.pixels !== undefined)).toBe(true)
    const box = measureBounds(shut.map((piece) => piece.geometry))
    const at = chests[0]?.position
    if (!at) throw new Error('no chest position')
    // Standing on its spot: the body's 0.41 and the lid's dome on top of it.
    expect(box.minY).toBeCloseTo(at.y, 6)
    expect(box.maxY - box.minY).toBeGreaterThan(0.41 * WORLD_SCALE)
    // Shut, the lid lies over the body, no wider than it; open, it stands up behind.
    const opened = measureBounds(open.map((piece) => piece.geometry))
    expect(opened.maxY).toBeGreaterThan(box.maxY)
  })
})
