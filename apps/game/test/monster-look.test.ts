import { readFileSync } from 'node:fs'
import { measureBounds } from '@minstrel/nitro-gfx'
import { describe, expect, it } from 'vitest'
import { load } from '../src/load.ts'
import { monsterLookOf, monsterPieces } from '../src/monsters.ts'

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('monsters on a real cartridge', { timeout: 60_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

  it('reads the slime and Hexagoon: a model, a stand, and more motions', () => {
    for (const code of ['z000a', 'b003a']) {
      const look = monsterLookOf(rom, code)
      if (!look) throw new Error(`${code} did not read`)
      expect(look.motions.has('stand'), code).toBe(true)
      expect(look.motions.has('attack1a'), code).toBe(true)
      const pieces = monsterPieces(look, { x: 1, y: 0.5, z: -2 }, 0, 0.01, 'stand', 3)
      expect(pieces.length, code).toBeGreaterThan(0)
      const box = measureBounds(pieces.map((p) => p.geometry))
      expect(box.minY, code).toBeGreaterThan(0.4)
      expect((box.minX + box.maxX) / 2, code).toBeCloseTo(1, 0)
    }
    expect(monsterLookOf(rom, 'zzzzz')).toBeUndefined()
  })

  it('knows each monster by its code, with its battle numbers', () => {
    const village = load(rom, { map: 'M01M07' })
    const slime = village.monsterCodes.get('z000a')
    if (!slime) throw new Error('no slime')
    const numbers = village.monsterBattle.get(slime.number)
    expect(numbers?.maxHp).toBeGreaterThan(0)
    // A code can name several records — story versions of one monster — and
    // the first, the lowest number, is the one kept: the slime is number 1.
    expect(slime.number).toBe(1)
    expect(village.monsterCodes.size).toBeGreaterThan(300)
    expect(village.monsterCodes.size).toBeLessThan(438)
  })
})
