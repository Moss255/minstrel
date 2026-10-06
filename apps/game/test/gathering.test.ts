import { readFileSync } from 'node:fs'
import { newGathering, startPlay, WORD, withField, wordField } from '@minstrel/sim'
import { describe, expect, it } from 'vitest'
import { gatheringOf } from '../src/load.ts'
import { PICK_REACH, SPARKLE_LIFT, sparklesOf, sparkleWithin } from '../src/sparkles.ts'

// Every number here is made up; only the rules are the game's.
const spot = {
  id: 2,
  item: 0x5600,
  places: [
    { x: 1, y: 0, z: 1 },
    { x: 4, y: 0, z: 4 },
    { x: 9, y: 5, z: 9 },
  ],
}
const word = (lying: number) =>
  withField(withField(withField(0, WORD.setUp, 1), WORD.most, 3), WORD.lying, lying)

describe('the sparkles on a map', () => {
  it('stands one at each place with an item, 0.1 above the floor found under it', () => {
    const words = []
    words[2] = word(0b101)
    const out = sparklesOf([spot], words, (x) => (x === 9 ? -20 : 0.5))
    expect(out.map((s) => s.place)).toEqual([0, 2])
    expect(out[0]?.y).toBeCloseTo(0.5 + SPARKLE_LIFT)
    // A floor more than 10 below the place is not its floor: it keeps its own height.
    expect(out[1]?.y).toBe(5)
  })

  it('shows nothing of a spot not set up', () => {
    expect(sparklesOf([spot], [], () => 0)).toEqual([])
  })

  it('lets the Hero pick up within 0.7 in x and in z, not on the edge', () => {
    const words = []
    words[2] = word(0b011)
    const out = sparklesOf([spot], words, () => 0)
    expect(sparkleWithin(out, { x: 4.5, z: 3.6 })?.place).toBe(1)
    expect(sparkleWithin(out, { x: 1 + PICK_REACH, z: 1 })).toBeUndefined()
  })
})

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('gathering, on a real cartridge', { timeout: 120_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

  it("reads the 40 fields' 87 spots, the timings, and the Fountain", () => {
    const data = gatheringOf(rom, 'F01')
    expect(data.all).toHaveLength(87)
    expect(new Set(data.all.map((s) => s.id)).size).toBe(87)
    expect(data.here.map((s) => s.id)).toEqual([1, 3, 4])
    // The Angel Falls region's first: a medicinal herb, every 30 minutes, 1 to 4 of 4 places.
    expect(data.all[0]).toMatchObject({ id: 1, item: 22000, timing: 8 })
    expect(data.all[0]?.own).toEqual({ minutes: 30, fewest: 1, most: 4 })
    expect([...data.bias.keys()]).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(data.bias.get(0)?.[0]).toEqual({ minutes: 60, fewest: 1, most: 3 })
    expect(data.fountain?.spots.map((s) => s.id)).toEqual([98, 99])
    expect(data.fountain?.items.get(0)?.[0]).toBe(22000)
    expect(gatheringOf(rom, 'R01M07').here.map((s) => s.id)).toEqual([98, 99])
  })

  it('sets every spot up at a new game, by its own timing or its row at the variant', () => {
    const data = gatheringOf(rom, '')
    const state = newGathering()
    startPlay(state, data.all, data.bias, { below: () => 3 })
    expect(state.variant).toBe(3)
    // Spot 6 takes fldbias row 3 at variant 3: (180, 5, 6).
    const six = state.words[6] as number
    expect([
      wordField(six, WORD.every),
      wordField(six, WORD.fewest),
      wordField(six, WORD.most),
    ]).toEqual([6, 5, 6])
    expect(state.words.filter((w) => wordField(w, WORD.setUp)).length).toBe(89)
  })
})
