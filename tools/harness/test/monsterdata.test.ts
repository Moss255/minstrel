import { readFileSync } from 'node:fs'
import { readMonsterBattle, readMonsterNames } from '@minstrel/game-formats'
import { isGpc, readGpc } from '@minstrel/l5-gpc'
import { decompressIfNeeded } from '@minstrel/nitro-comp'
import { readNitroFs, walkFiles } from '@minstrel/nitrofs'
import { describe, expect, it } from 'vitest'

/**
 * The monsters' battle numbers and names, on a real cartridge.
 *
 * Local-only: skipped without a dump, and nothing it reads is committed — the
 * assertions are about how the two files agree, not their values. The fixtures
 * in `packages/game-formats/test/monsterdata.test.ts` are built in code.
 */
const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('monster data on a real cartridge', { timeout: 60_000 }, () => {
  it('reads 438 monsters in both files, the same monster in each record', () => {
    const fs = readNitroFs(new Uint8Array(readFileSync(romPath as string)))
    let battle: ReturnType<typeof readMonsterBattle> = []
    let named: ReturnType<typeof readMonsterNames> = []
    for (const file of walkFiles(fs.root)) {
      if (file.path === '/data/prm/mon_btldata.nat')
        battle = readMonsterBattle(decompressIfNeeded(fs.read(file)))
      if (file.path !== '/data/prm/mon_data.gp2') continue
      const bytes = fs.read(file)
      if (!isGpc(bytes)) continue
      const archive = readGpc(bytes)
      for (const member of archive.members) {
        if (member.name.endsWith('_en.nat'))
          named = readMonsterNames(decompressIfNeeded(archive.read(member)))
      }
    }
    expect(battle).toHaveLength(438)
    expect(named).toHaveLength(438)
    expect(battle.map((m) => m.number)).toEqual(named.map((m) => m.number))
    for (const m of named) expect(m.code).toMatch(/^[zb]\d{3}[a-z]$/)
    // What is read as HP is far larger on the bosses — `b` codes — than on the rest.
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0
    const hp = (boss: boolean) =>
      median(battle.filter((_, i) => named[i]?.code.startsWith('b') === boss).map((m) => m.maxHp))
    expect(hp(true)).toBeGreaterThan(10 * hp(false))
  })

  it('reads how each monster chooses its ways, which is not the boss bit', () => {
    const fs = readNitroFs(new Uint8Array(readFileSync(romPath as string)))
    let battle: ReturnType<typeof readMonsterBattle> = []
    let named: ReturnType<typeof readMonsterNames> = []
    for (const file of walkFiles(fs.root)) {
      if (file.path === '/data/prm/mon_btldata.nat')
        battle = readMonsterBattle(decompressIfNeeded(fs.read(file)))
      if (file.path !== '/data/prm/mon_data.gp2') continue
      const bytes = fs.read(file)
      if (!isGpc(bytes)) continue
      const archive = readGpc(bytes)
      for (const member of archive.members) {
        if (member.name.endsWith('_en.nat'))
          named = readMonsterNames(decompressIfNeeded(archive.read(member)))
      }
    }
    // Seven of the eight handlers are used, and the two commonest are the even
    // and the falling weights — see `MonsterBattle.aiType`.
    const counts = new Map<number, number>()
    for (const m of battle) counts.set(m.aiType, (counts.get(m.aiType) ?? 0) + 1)
    expect(counts.get(0)).toBe(96)
    expect(counts.get(1)).toBe(281)
    expect(counts.get(6)).toBe(3)
    expect(counts.has(7)).toBe(false)
    // It is not the boss bit: both of the commonest types stand on both sides
    // of it, and the slice's own boss draws by the even table.
    const kinds = (type: number, boss: boolean) =>
      battle.filter((m) => m.aiType === type && m.bossAi === boss).length
    for (const type of [0, 1]) {
      expect(kinds(type, true), `type ${type}`).toBeGreaterThan(0)
      expect(kinds(type, false), `type ${type}`).toBeGreaterThan(0)
    }
    const at = (name: string) => battle[named.findIndex((n) => n.name === name)]?.aiType
    expect(at('hexagoon')).toBe(0)
    expect(at('slime')).toBe(0)
    expect(at('batterfly')).toBe(1)
    expect(at('cruelcumber')).toBe(4)
  })

  it('reads what each monster takes of each element, as the game does', () => {
    const fs = readNitroFs(new Uint8Array(readFileSync(romPath as string)))
    let battle: ReturnType<typeof readMonsterBattle> = []
    let named: ReturnType<typeof readMonsterNames> = []
    for (const file of walkFiles(fs.root)) {
      if (file.path === '/data/prm/mon_btldata.nat')
        battle = readMonsterBattle(decompressIfNeeded(fs.read(file)))
      if (file.path !== '/data/prm/mon_data.gp2') continue
      const archive = readGpc(fs.read(file))
      for (const member of archive.members) {
        if (member.name.endsWith('_en.nat'))
          named = readMonsterNames(decompressIfNeeded(archive.read(member)))
      }
    }
    const of = (name: string) => {
      const i = named.findIndex((m) => m.name === name)
      const found = battle[i]
      if (!found) throw new Error(`no ${name}`)
      return found.resistances
    }
    // The 22 bytes at `+0x6C`, a hundredth each, by element − 1 — and the
    // names bear the reading out. A firespirit takes half of fire and half as
    // much again of ice.
    expect(of('firespirit').slice(0, 2)).toEqual([50, 150])
    // A slime takes a quarter more of all seven, and all of a plain blow.
    expect(of('slime').slice(0, 8)).toEqual([125, 125, 125, 125, 125, 125, 125, 100])
    // A metal slime takes all of every element — it is the actions that do not
    // work on metal — and nothing of sleep, poison, or a fall in defence.
    const metal = of('metal slime')
    expect(metal.slice(0, 8)).toEqual([100, 100, 100, 100, 100, 100, 100, 100])
    expect([10, 16, 19, 20].map((element) => metal[element - 1])).toEqual([0, 0, 0, 0])
    // The slice's boss cannot be put to sleep, and its defence falls three
    // times in four of what Kasap's chance says.
    const boss = of('Ragin<1> Contagion')
    expect([10, 19].map((element) => boss[element - 1])).toEqual([0, 75])
    // Every monster takes a plain blow whole: element 8 is 100 throughout.
    expect(battle.every((m) => m.resistances[7] === 100)).toBe(true)
    // And the values are hundredths, a handful of them.
    const values = new Set(battle.flatMap((m) => m.resistances))
    expect([...values].sort((a, b) => a - b)).toEqual([
      0, 1, 5, 10, 15, 25, 30, 35, 50, 60, 75, 100, 125, 150, 200,
    ])
  })
})
