import { readFileSync } from 'node:fs'
import { evacDestination, revivalVoice } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { type Loaded, load } from '../src/load.ts'

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('travel, on a real cartridge', { timeout: 120_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()
  const here = romPath ? load(rom, { map: 'D01M01' }) : (undefined as unknown as Loaded)

  it("has Zoom's eighteen places, in the order the code's table marks them", () => {
    const { places, placeMaps } = here.travel
    expect(places.map((p) => p.name).slice(0, 4)).toEqual([
      'Angel Falls',
      'Zere',
      'Stornway',
      'Coffinwell',
    ])
    expect(places).toHaveLength(18)
    expect(placeMaps).toHaveLength(18)
    // Angel Falls' exterior, Stornway's, and Newid Isle for the Abbey.
    expect(placeMaps.slice(0, 5)).toEqual([1100, 1200, 100, 1300, 20007])
    expect(places[0]).toMatchObject({ revivalMap: 1106, map: 20001 })
  })

  it('takes Evac from the Hexagon to the Angel Falls region, and from Zere Rocks nowhere', () => {
    const { evac } = here.travel
    expect(here.mapArea).toBe(7100)
    expect(here.mapZoom).toBe(1)
    const out = evacDestination(evac, { map: 7101, area: 7100, lastField: 0 })
    expect(out?.map).toBe(20001)
    expect(out?.x).toBeCloseTo(50.93, 2)
    expect(evacDestination(evac, { map: 7700, area: 7700, lastField: 0 })).toBeUndefined()
  })

  it("says nothing on waking in Angel Falls' church at 1, and in voice 1 after", () => {
    const words = here.travel.revivalWords
    expect(revivalVoice(words, 1106, 1, false)).toBe(3)
    expect(revivalVoice(words, 1106, 2, false)).toBe(1)
    expect(revivalVoice(words, 216, 5, true)).toBe(2)
  })

  it('names item 22019 the chimaera wing, which the field menu tests for', () => {
    expect(here.itemNames.get(22019)).toBe('chimaera wing')
  })
})
