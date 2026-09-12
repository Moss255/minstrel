import { readFileSync } from 'node:fs'
import type { Treasure } from '@minstrel/game-formats'
import { measureBounds } from '@minstrel/nitro-gfx'
import { describe, expect, it } from 'vitest'
import { FRAME_ROWS, propPieces } from '../src/cast.ts'
import { load } from '../src/load.ts'
import { BARREL_KIND, isPotOrBarrel, POT_KIND, propSprites } from '../src/pots.ts'

function treasure(kind: number, placed = true): Treasure {
  return {
    index: 1,
    unknown_0: 0,
    kind,
    position: placed ? { x: 0, y: 0, z: 0 } : undefined,
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

describe('pots and barrels', () => {
  it('are placed treasure of their two kinds', () => {
    expect(isPotOrBarrel(treasure(POT_KIND))).toBe(true)
    expect(isPotOrBarrel(treasure(BARREL_KIND))).toBe(true)
    expect(isPotOrBarrel(treasure(0x30, false))).toBe(false)
    expect(isPotOrBarrel(treasure(0x8))).toBe(false)
  })

  it('draw nothing without their sheets', () => {
    expect(propSprites([treasure(POT_KIND)], new Map())).toEqual([])
  })
})

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('pots and barrels on a real cartridge', { timeout: 60_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

  it("stands Erinn's pot and two barrels where the room places them, at the villagers' pixel scale", () => {
    const room = load(rom, { map: 'M01M07' })
    expect(room.props.map((prop) => prop.name)).toEqual(['tsubo_01', 'taru_01', 'taru_01'])
    const person = 0.18
    for (const prop of room.props) {
      const [piece] = propPieces(prop, person, 0)
      if (!piece) throw new Error(`${prop.name} draws nothing`)
      const box = measureBounds([piece.geometry])
      const rows = prop.sprite.decode(0).height
      expect(box.maxY - box.minY).toBeCloseTo((person * rows) / FRAME_ROWS, 6)
      expect(box.minY).toBeCloseTo(prop.placement.y, 6)
    }
  })
})
