import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  COPPER_SWORD,
  HERO_VOCATION_NUMBER,
  STARTING_EQUIPMENT,
  STARTING_GOLD,
} from '../src/hero.ts'
import { load } from '../src/load.ts'

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)(
  'what the Hero starts with, on a real cartridge',
  { timeout: 60_000 },
  () => {
    const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

    it('is a copper sword, by the cartridge’s own name, worn as the weapon', () => {
      expect(STARTING_EQUIPMENT.get('weapon')).toBe(COPPER_SWORD)
      const names = load(rom, { map: 'M01M10' }).itemNames
      expect(names.get(COPPER_SWORD)).toMatch(/copper sword/i)
    })

    it('wears the celestial suit, stockings and shoes too — defence 14 at level 1 — and has 180 gold', () => {
      const here = load(rom, { map: 'M01M10' })
      expect(here.itemNames.get(STARTING_EQUIPMENT.get('body') ?? 0)).toMatch(/celestial suit/i)
      expect(here.itemNames.get(STARTING_EQUIPMENT.get('legs') ?? 0)).toMatch(/stockings/i)
      expect(here.itemNames.get(STARTING_EQUIPMENT.get('feet') ?? 0)).toMatch(/celestial shoes/i)
      const worn = [...STARTING_EQUIPMENT.values()].reduce(
        (sum, id) => sum + (here.itemStats.get(id)?.defence ?? 0),
        0,
      )
      // As a let's play's status shows: resilience 8, and 14 with it all on.
      const minstrel = here.levels.get(HERO_VOCATION_NUMBER)
      expect((minstrel?.levels[0]?.resilience ?? 0) + worn).toBe(14)
      expect(STARTING_GOLD).toBe(180)
      // **All thirteen are read now**, not only the Hero's — a party can hold
      // more than one vocation, which is what this phase is for.
      expect([...here.levels.keys()].sort((a, b) => a - b)).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
      ])
    })
  },
)
