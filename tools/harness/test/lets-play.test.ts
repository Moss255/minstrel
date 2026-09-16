import { readFileSync } from 'node:fs'
import {
  readItemStats,
  readLevelTable,
  readMonsterBattle,
  readMonsterNames,
} from '@minstrel/game-formats'
import { isGpc, readGpc } from '@minstrel/l5-gpc'
import { decompressIfNeeded } from '@minstrel/nitro-comp'
import { readNitroFs, walkFiles } from '@minstrel/nitrofs'
import { BattleRng, physicalDamage } from '@minstrel/sim'
import { describe, expect, it } from 'vitest'

/**
 * The battle's damage against a let's play of the European release, read
 * frame by frame (not kept in the repository). What the video shows is here;
 * every number it is checked against — the Hero's rows, the monsters', the
 * kit's — is read from the cartridge when the test runs.
 *
 * Local-only: skipped without a dump.
 */
const romPath = process.env.MINSTREL_TEST_ROM

/** The Minstrel's level table, as `hero.ts` names it. */
const HERO_LEVELS = '/data/prm/level6.bin'

/**
 * Seen in the video, the fourth part, in the Hexagon and at its boss. The
 * Hero fought the drackies at level 5 with the copper sword, the mecha-mynah
 * at level 6 with it, and the hexagoon at level 7 with the feather fan, the
 * bandana, the leather shield and the celestial suit, stockings and shoes.
 */
const SEEN = [
  {
    blow: 'Hero L5, copper sword → dracky',
    level: 5,
    weapon: 'copper sword',
    foe: 'dracky',
    damage: [8, 9],
  },
  {
    blow: 'Hero L6, copper sword → mecha-mynah',
    level: 6,
    weapon: 'copper sword',
    foe: 'mecha-mynah',
    damage: [4],
  },
  {
    blow: 'Hero L7, feather fan → hexagoon',
    level: 7,
    weapon: 'feather fan',
    foe: 'hexagoon',
    damage: [10],
  },
  { blow: 'dracky → Hero L6 in the kit', level: 6, foe: 'dracky', onHero: true, damage: [1] },
  { blow: 'hexagoon → Hero L7 in the kit', level: 7, foe: 'hexagoon', onHero: true, damage: [5] },
] as const

const KIT = [
  'celestial suit',
  'celestial stockings',
  'celestial shoes',
  'bandana',
  'leather shield',
]

describe.skipIf(!romPath)('the battle against a let’s play', { timeout: 120_000 }, () => {
  it('draws every blow the video shows within the formula’s spread', () => {
    const fs = readNitroFs(new Uint8Array(readFileSync(romPath as string)))
    let levels: ReturnType<typeof readLevelTable> | undefined
    let battle: ReturnType<typeof readMonsterBattle> = []
    let named: ReturnType<typeof readMonsterNames> = []
    const stats = new Map<string, { attack: number; defence: number }>()
    for (const file of walkFiles(fs.root)) {
      if (file.path === HERO_LEVELS) levels = readLevelTable(decompressIfNeeded(fs.read(file)))
      if (file.path === '/data/prm/mon_btldata.nat')
        battle = readMonsterBattle(decompressIfNeeded(fs.read(file)))
      if (!/\/data\/prm\/(mon_data|itemdt_[a-z])\.gp2$/.test(file.path)) continue
      const bytes = fs.read(file)
      if (!isGpc(bytes)) continue
      const archive = readGpc(bytes)
      for (const member of archive.members) {
        if (!member.name.endsWith('_en.nat')) continue
        const inner = decompressIfNeeded(archive.read(member))
        if (file.path.includes('mon_data')) {
          named = readMonsterNames(inner)
          continue
        }
        // The consumables' table carries no stats and says so.
        let entries: ReturnType<typeof readItemStats> = []
        try {
          entries = readItemStats(inner)
        } catch {
          continue
        }
        for (const entry of entries)
          if (entry.name) stats.set(entry.name, { attack: entry.attack, defence: entry.defence })
      }
    }
    expect(levels).toBeDefined()
    const numbersOf = (name: string) => {
      const who = named.find((m) => m.name === name)
      const found = who && battle.find((m) => m.number === who.number)
      expect(found, name).toBeDefined()
      return found as NonNullable<typeof found>
    }
    const kitDefence = KIT.reduce((sum, name) => sum + (stats.get(name)?.defence ?? 0), 0)
    expect(kitDefence).toBeGreaterThan(0)
    const rng = new BattleRng(0x6c657473706c6179n)
    for (const seen of SEEN) {
      const row = (levels as ReturnType<typeof readLevelTable>).levels[seen.level - 1]
      expect(row, `level ${seen.level}`).toBeDefined()
      const foe = numbersOf(seen.foe)
      const attack =
        'onHero' in seen
          ? foe.attack
          : (row as NonNullable<typeof row>).strength + (stats.get(seen.weapon)?.attack ?? 0)
      const defence =
        'onHero' in seen ? (row as NonNullable<typeof row>).resilience + kitDefence : foe.defence
      const drawn = new Set<number>()
      for (let i = 0; i < 20000; i++) drawn.add(physicalDamage(rng, attack, defence))
      for (const damage of seen.damage)
        expect(
          drawn.has(damage),
          `${seen.blow}: ${damage} among ${[...drawn].sort((a, b) => a - b).join(',')}`,
        ).toBe(true)
    }
  })
})
