import { readFileSync } from 'node:fs'
import { FX32_ONE, fx32 } from '@minstrel/fixed'
import type { Motion, Treasure } from '@minstrel/game-formats'
import { groundBelow } from '@minstrel/sim'
import { describe, expect, it } from 'vitest'
import {
  CABINET_KIND,
  CABINET_OPEN,
  CABINET_OPENING,
  CABINET_SHUT,
  cabinetNumber,
  cabinetsOf,
  cabinetTargets,
  motionFrame,
  pairCabinets,
} from '../src/cabinets.ts'
import { load } from '../src/load.ts'
import { talkTarget } from '../src/talk.ts'

function treasure(kind: number, placed: boolean): Treasure {
  return {
    index: 0,
    unknown_0: 0,
    kind,
    position: placed ? { x: 0, y: 0, z: 0 } : undefined,
    facing: undefined,
    unknown_2: placed ? undefined : 0,
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

const MOTIONS: Motion[] = [
  { name: CABINET_OPENING, start: 0, end: 25, speed: 1 },
  { name: CABINET_SHUT, start: 0, end: 0, speed: 1 },
  { name: CABINET_OPEN, start: 25, end: 25, speed: 1 },
]

describe('a cabinet', () => {
  it('is a piece named for one', () => {
    expect(cabinetNumber('M01M03G2')).toBe(2)
    expect(cabinetNumber('M01M0300')).toBeUndefined()
  })

  it("holds the map's position-less treasure, in order of its number", () => {
    const treasures = [
      treasure(0x10, true),
      treasure(CABINET_KIND, false),
      treasure(CABINET_KIND, false),
    ]
    expect(pairCabinets([2, 1], treasures)).toEqual([2, 1])
    expect(pairCabinets([1, 2, 3], treasures)).toEqual([1, 2, undefined])
  })

  it('stands shut, plays its opening once and holds the last frame it can', () => {
    expect(motionFrame(MOTIONS, CABINET_SHUT, 40, 25)).toBe(0)
    expect(motionFrame(MOTIONS, CABINET_OPENING, 0, 25)).toBe(0)
    expect(motionFrame(MOTIONS, CABINET_OPENING, 10, 25)).toBe(10)
    expect(motionFrame(MOTIONS, CABINET_OPENING, 100, 25)).toBe(24)
    expect(motionFrame(MOTIONS, CABINET_OPEN, 0, 25)).toBe(24)
    expect(motionFrame(MOTIONS, 'wave', 5, 25)).toBe(0)
    expect(motionFrame([{ name: 'fast', start: 0, end: 20, speed: 2 }], 'fast', 5, 25)).toBe(10)
  })
})

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('cabinets on a real cartridge', { timeout: 60_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

  it("finds the shop's two cabinets, shut, each holding one of its treasures and in reach", () => {
    const shop = load(rom, { map: 'M01M03' })
    const cabinets = cabinetsOf(shop.map, shop.treasures, () => false)
    expect(cabinets.map((c) => c.stem)).toEqual(['M01M03G1', 'M01M03G2'])
    expect(cabinets.map((c) => c.motion)).toEqual([CABINET_SHUT, CABINET_SHUT])
    const held = cabinets.map((c) => (c.slot === undefined ? undefined : shop.treasures[c.slot]))
    expect(held.map((t) => t?.kind)).toEqual([CABINET_KIND, CABINET_KIND])
    expect(new Set(held.map((t) => t?.index)).size).toBe(2)

    const world = shop.world
    if (!world) throw new Error('the shop has no collision')
    const above = fx32(Math.round(world.bounds.maxY + FX32_ONE))
    for (const [id, cabinet] of cabinets.entries()) {
      // Somewhere on the floor just in front of it, facing it, the Hero can reach it.
      const reachable = [-0.15, 0.15].some((dz) => {
        const at = { x: cabinet.x, z: cabinet.z + dz }
        const floor = groundBelow(
          world,
          fx32(Math.round(at.x * FX32_ONE)),
          fx32(Math.round(at.z * FX32_ONE)),
          above,
        )
        const facing = Math.atan2(cabinet.x - at.x, cabinet.z - at.z)
        return (
          floor !== undefined && talkTarget({ ...at, facing }, cabinetTargets(cabinets))?.id === id
        )
      })
      expect(reachable, cabinet.stem).toBe(true)
    }
    const opened = cabinetsOf(shop.map, shop.treasures, () => true)
    expect(opened.map((c) => c.motion)).toEqual([CABINET_OPEN, CABINET_OPEN])
  })
})
