import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { COPPER_SWORD, STARTING_EQUIPMENT } from '../src/hero.ts'
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
  },
)
