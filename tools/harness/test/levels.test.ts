import { readFileSync } from 'node:fs'
import { readLevelTable } from '@minstrel/game-formats'
import { readNitroFs, walkFiles } from '@minstrel/nitrofs'
import { describe, expect, it } from 'vitest'

/**
 * The level tables, on a real cartridge.
 *
 * Local-only: skipped without a dump, and nothing it reads is committed. The
 * fixtures in `packages/game-formats/test/levels.test.ts` are built in code.
 */
const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('level tables on a real cartridge', { timeout: 60_000 }, () => {
  it('reads all thirteen, 99 levels each, from nothing to millions', () => {
    const fs = readNitroFs(new Uint8Array(readFileSync(romPath as string)))
    let files = 0
    for (const file of walkFiles(fs.root)) {
      if (!/^\/data\/prm\/level\d+\.bin$/.test(file.path)) continue
      const table = readLevelTable(fs.read(file))
      files++
      expect(table.levels, file.path).toHaveLength(99)
      expect(table.levels[0]?.exp, file.path).toBe(0)
      expect(table.levels[98]?.exp, file.path).toBeGreaterThan(4_000_000)
      // What is read as maximum HP is every vocation's largest number at level 1.
      const first = table.levels[0]
      if (!first) throw new Error(`${file.path} has no first level`)
      const others = [first.strength, first.resilience, first.agility, first.deftness, first.charm]
      expect(first.maxHp, file.path).toBeGreaterThanOrEqual(Math.max(...others))
    }
    expect(files).toBe(13)
  })
})
