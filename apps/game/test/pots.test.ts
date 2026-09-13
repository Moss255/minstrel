import { readFileSync } from 'node:fs'
import type { Treasure } from '@minstrel/game-formats'
import { measureBounds } from '@minstrel/nitro-gfx'
import { describe, expect, it } from 'vitest'
import { FRAME_ROWS, propPieces } from '../src/cast.ts'
import { load } from '../src/load.ts'
import {
  BARREL_KIND,
  breakingFrame,
  isPotOrBarrel,
  POT_KIND,
  type Prop,
  propSprites,
} from '../src/pots.ts'

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

  it('break a step at a time, each held its sixtieths of a second, and then are gone', () => {
    // A stand-in sheet: only its breaking animation is asked for.
    const animation = {
      name: 'tsuboware',
      steps: [0, 1, 2].map((frame) => ({ frame, duration: 4, order: frame })),
    }
    const sprite = { animation: (name: string) => (name === 'tsuboware' ? animation : undefined) }
    const placement = { id: 1, map: 0, x: 0, y: 0, z: 0, facing: 0, offset: 0 }
    const prop = {
      name: 'tsubo_01',
      sprite,
      bytes: new Uint8Array(),
      placement,
      slot: 0,
      treasure: treasure(POT_KIND),
      breaking: { name: 'tsubo_02', sprite, bytes: new Uint8Array(), placement },
    } as unknown as Prop
    const step = 4000 / 60
    expect(breakingFrame(prop, 0)).toBe(0)
    expect(breakingFrame(prop, step + 1)).toBe(1)
    expect(breakingFrame(prop, 2 * step + 1)).toBe(2)
    expect(breakingFrame(prop, 3 * step + 1)).toBeUndefined()
    expect(breakingFrame({ ...prop, breaking: undefined }, 0)).toBeUndefined()
  })

  it('stop once every frame of the breaking has shown, not where the animation would go round', () => {
    // The barrel's breaking goes on past its shards: its first frame again,
    // held twice for a second. Played out, the shards hung in the air.
    const animation = {
      name: 'taruware',
      steps: [
        { frame: 0, duration: 4, order: 1 },
        { frame: 1, duration: 4, order: 2 },
        { frame: 2, duration: 4, order: 3 },
        { frame: 0, duration: 60, order: 4 },
        { frame: 0, duration: 60, order: 0 },
      ],
    }
    const sprite = { animation: (name: string) => (name === 'taruware' ? animation : undefined) }
    const placement = { id: 2, map: 0, x: 0, y: 0, z: 0, facing: 0, offset: 0 }
    const barrel = {
      name: 'taru_01',
      sprite,
      bytes: new Uint8Array(),
      placement,
      slot: 1,
      treasure: treasure(BARREL_KIND),
      breaking: { name: 'taru_02', sprite, bytes: new Uint8Array(), placement },
    } as unknown as Prop
    const step = 4000 / 60
    expect(breakingFrame(barrel, 2 * step + 1)).toBe(2)
    expect(breakingFrame(barrel, 3 * step + 1)).toBeUndefined()
    expect(breakingFrame(barrel, 1500)).toBeUndefined()
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
