import { readFileSync } from 'node:fs'
import { readSystemStrings } from '@minstrel/game-formats'
import { isGpc, readGpc } from '@minstrel/l5-gpc'
import { decompressIfNeeded } from '@minstrel/nitro-comp'
import { readNitroFs, walkFiles } from '@minstrel/nitrofs'
import { describe, expect, it } from 'vitest'

/**
 * The system strings, on a real cartridge.
 *
 * Local-only: skipped without a dump, and nothing it reads is committed — the
 * assertions are about the file's shape. The fixtures in
 * `packages/game-formats/test/systemstrings.test.ts` are built in code.
 */
const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('the system strings on a real cartridge', { timeout: 60_000 }, () => {
  it('reads the same 81 message numbers in every language', () => {
    const fs = readNitroFs(new Uint8Array(readFileSync(romPath as string)))
    const numbers: string[] = []
    for (const file of walkFiles(fs.root)) {
      if (file.path !== '/data/bin/strstd.gp2') continue
      const bytes = fs.read(file)
      if (!isGpc(bytes)) continue
      const archive = readGpc(bytes)
      for (const member of archive.members) {
        if (!/strstd_[a-z]{2}\.nat$/.test(member.name)) continue
        const read = readSystemStrings(decompressIfNeeded(archive.read(member)))
        expect(read.size, member.name).toBe(81)
        numbers.push([...read.keys()].join(','))
      }
    }
    expect(numbers).toHaveLength(5)
    expect(new Set(numbers).size).toBe(1)
  })
})
