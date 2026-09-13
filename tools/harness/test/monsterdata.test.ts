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
})
