import { readFileSync } from 'node:fs'
import { readTreasureMapTables, type TreasureMapTables } from '@minstrel/game-formats'
import { readGpc } from '@minstrel/l5-gpc'
import { readNitroFs, walkFiles } from '@minstrel/nitrofs'
import { grottoDetails, grottoPlace } from '@minstrel/sim'
import { beforeAll, describe, expect, it } from 'vitest'

const romPath = process.env.MINSTREL_TEST_ROM

/**
 * **A treasure map's grotto, on the cartridge** — `packages/sim/src/grotto/map.ts`
 * against the decomp's own `RegularMapData::Populate`, built by
 * `tools/grotto-oracle` over this cartridge's `tdata_en.pac`: every one of the
 * 65,536 seeds at every quality agreed on 11 October 2026. The checksum here
 * is the oracle's over a sample of them.
 */
describe.skipIf(!romPath)('a treasure map’s grotto, on the cartridge', () => {
  let tables: TreasureMapTables
  beforeAll(() => {
    const fs = readNitroFs(new Uint8Array(readFileSync(romPath as string)))
    const file = [...walkFiles(fs.root)].find((f) => f.path === '/data/tmap/tdata.gp2')
    if (!file) throw new Error('no /data/tmap/tdata.gp2 in this cartridge')
    tables = readTreasureMapTables(readGpc(fs.read(file)).read('tdata_en.pac'))
  })

  it('makes a map’s grotto from its seed and quality as the game does', () => {
    expect(grottoDetails(tables, 1, 50)).toMatchObject({
      environment: 4,
      floors: 2,
      monsterRank: 3,
      boss: 3,
      level: 11,
      name: 'Iron Cave of Glee',
    })
    expect(grottoDetails(tables, 777, 120)).toMatchObject({ environment: 2, floors: 12, level: 52 })
    // A quality no row holds makes nothing but the environment's draw.
    expect(grottoDetails(tables, 12345, 1)).toMatchObject({ floors: 0, boss: 0, name: '' })
  })

  it('agrees with the game’s own over a sample of seeds and every quality', () => {
    let hash = 2166136261
    const mix = (byte: number) => {
      hash = Math.imul(hash ^ (byte & 0xff), 16777619) >>> 0
    }
    for (let seed = 0; seed < 65536; seed += 97) {
      for (let quality = 0; quality < 256; quality++) {
        const d = grottoDetails(tables, seed, quality)
        for (const b of [
          d.environment,
          d.floors,
          d.monsterRank,
          d.boss,
          d.bossMonster,
          d.bossMonster >> 8,
          d.prefix,
          d.suffix,
          d.locale,
          d.level,
          d.unknown_66,
        ]) {
          mix(b)
        }
        for (const c of d.name) mix(c.charCodeAt(0))
      }
    }
    expect(hash).toBe(135908608)
  }, 60_000)

  it('finds a map’s place among the 150, a field and a spot on it', () => {
    const first = grottoPlace(tables, 1)
    expect(first?.image).toBe('mapt_001')
    expect(first?.map).toBe(20001)
    expect(grottoPlace(tables, 150)?.image).toBe('mapt_150')
  })
})
