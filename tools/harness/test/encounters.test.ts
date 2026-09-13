import { readFileSync } from 'node:fs'
import {
  isMapList,
  readBattleEncounters,
  readFieldEncounters,
  readFieldMonsters,
  readMapList,
  readMonsterBattle,
} from '@minstrel/game-formats'
import { decompressIfNeeded } from '@minstrel/nitro-comp'
import { readNitroFs, walkFiles } from '@minstrel/nitrofs'
import { describe, expect, it } from 'vitest'

/**
 * The encounter tables and the field monster table, on a real cartridge.
 *
 * Local-only: skipped without a dump, and nothing it reads is committed — the
 * assertions are about how the files agree with each other. The fixtures in
 * `packages/game-formats/test/encounters.test.ts` are built in code.
 */
const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('encounters on a real cartridge', { timeout: 60_000 }, () => {
  it('names a map for every group, the same roamers in both tables, and the battle numbers', () => {
    const fs = readNitroFs(new Uint8Array(readFileSync(romPath as string)))
    const files = new Map<string, Uint8Array>()
    for (const file of walkFiles(fs.root)) {
      const name = file.path.split('/').pop() ?? ''
      if (/^(encfld|encbtl|fld_mondata)\.bin$|^mon_btldata\.nat$|^maplist9\.bin$/i.test(name)) {
        files.set(name.toLowerCase(), decompressIfNeeded(fs.read(file)))
      }
    }
    const list = files.get('maplist9.bin') as Uint8Array
    expect(isMapList(list)).toBe(true)
    const mapIds = new Set(readMapList(list).maps.map((m) => m.id))
    const field = readFieldEncounters(files.get('encfld.bin') as Uint8Array)
    const battle = readBattleEncounters(files.get('encbtl.bin') as Uint8Array)

    expect(field.size).toBe(210)
    for (const id of field.keys()) expect(mapIds.has(id), `map ${id}`).toBe(true)

    let zones = 0
    for (const map of field.values()) {
      for (const zone of map) {
        zones++
        const roamers = battle.get(zone.zone)?.roamers.map((r) => r.number)
        expect(new Set(roamers), `zone ${zone.zone}`).toEqual(
          new Set(zone.monsters.map((m) => m.number)),
        )
      }
    }
    expect(zones).toBe(287)

    const monsters = readFieldMonsters(files.get('fld_mondata.bin') as Uint8Array)
    const numbers = readMonsterBattle(files.get('mon_btldata.nat') as Uint8Array)
    expect(monsters.size).toBe(numbers.length)
    let agree = 0
    for (const n of numbers) {
      const f = monsters.get(n.number)
      if (f && f.attack === n.attack && f.defence === n.defence) agree++
    }
    // Attack and defence agree between the field table and the battle data.
    expect(agree).toBe(numbers.length)
  })
})
