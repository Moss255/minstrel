import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { load } from '../src/load.ts'
import { monsterLookOf } from '../src/monsters.ts'

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('the field on a real cartridge', { timeout: 120_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

  it('gives Angel Falls Region its zones, whose monsters have a code, a field model and a speed', () => {
    const field = load(rom, { map: 'F01' })
    expect(field.fieldZones).toHaveLength(3)
    const first = field.fieldZones[0]
    if (!first) throw new Error('no zone')
    expect(first.monsters.length).toBeGreaterThan(0)
    for (const monster of first.monsters) {
      const code = field.monsterCodeOf.get(monster.number)
      if (!code) throw new Error(`no code for ${monster.number}`)
      expect(monsterLookOf(rom, `${code}_f`)?.motions.has('run'), code).toBe(true)
      expect(field.fieldMonsters.get(monster.number)?.speed, code).toBeGreaterThan(0)
    }
    // The battle table knows the zone, with the same roamers.
    const battle = field.battleZones.get(first.zone)
    expect(new Set(battle?.roamers.map((r) => r.number))).toEqual(
      new Set(first.monsters.map((m) => m.number)),
    )
  })

  it('has no monsters roaming the village', () => {
    expect(load(rom, { map: 'M01' }).fieldZones).toEqual([])
  })
})
