import { readFileSync } from 'node:fs'
import { readMonsterList } from '@minstrel/game-formats'
import { isGpc, readGpc } from '@minstrel/l5-gpc'
import { decompressIfNeeded } from '@minstrel/nitro-comp'
import { readNitroFs, walkFiles } from '@minstrel/nitrofs'
import { describe, expect, it } from 'vitest'

/**
 * The monster list, on a real cartridge.
 *
 * Local-only: skipped without a dump, and nothing it reads is committed — the
 * assertions are about the file's shape, not its names. The fixtures in
 * `packages/game-formats/test/monsters.test.ts` are built in code.
 */
const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('the monster list on a real cartridge', { timeout: 60_000 }, () => {
  it('reads 345 monsters in every language, each numbered once, with a code', () => {
    const fs = readNitroFs(new Uint8Array(readFileSync(romPath as string)))
    let files = 0
    for (const file of walkFiles(fs.root)) {
      if (file.path !== '/data/prm/mon_list.gp2') continue
      const bytes = fs.read(file)
      if (!isGpc(bytes)) continue
      const archive = readGpc(bytes)
      for (const member of archive.members) {
        if (!/mon_list_[a-z]{2}\.nat$/.test(member.name)) continue
        // Some languages' copies are stored compressed in the archive.
        const list = readMonsterList(decompressIfNeeded(archive.read(member)))
        files++
        expect(list, member.name).toHaveLength(345)
        expect(new Set(list.map((m) => m.number)).size, member.name).toBe(list.length)
        // A letter, three digits, a letter: `z` on the first 278, `b` on 67 more.
        for (const monster of list) expect(monster.code, member.name).toMatch(/^[zb]\d{3}[a-z]$/)
        // The chest monsters a random row can give, 38 to 40, are one monster's
        // three variants: one code stem, lettered a to c.
        const chest = [38, 39, 40].map((n) => list.find((m) => m.number === n)?.code)
        expect(new Set(chest.map((code) => code?.slice(0, 4))).size, member.name).toBe(1)
        expect(
          chest.map((code) => code?.slice(4)),
          member.name,
        ).toEqual(['a', 'b', 'c'])
      }
    }
    expect(files).toBe(5)
  })
})
