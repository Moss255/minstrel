import { readFileSync } from 'node:fs'
import { parseMarkup, readNpcList, readTalk } from '@minstrel/game-formats'
import { isGpc, readGpc } from '@minstrel/l5-gpc'
import { tryDecompressLz10 } from '@minstrel/nitro-comp'
import { isNarc, readNarc, readNitroFs, walkFiles } from '@minstrel/nitrofs'
import { describe, expect, it } from 'vitest'

/**
 * What characters say, on a real cartridge.
 *
 * Local-only: skipped without a dump, and nothing it reads is committed. Holds
 * `readTalk` to every talk file there is, and holds the reading that a talk
 * file's number is a character of its area's cast.
 */
const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('talk text on a real cartridge', { timeout: 120_000 }, () => {
  it("reads every character's talk file, numbered by its area's cast", () => {
    const fs = readNitroFs(new Uint8Array(readFileSync(romPath as string)))
    const cast = new Map<string, Set<number>>()
    const talk: { area: string; id: number; where: string; bytes: Uint8Array }[] = []

    for (const file of walkFiles(fs.root)) {
      const npc = /^\/data\/scenario\/([A-Z]\d\d)\.npc$/i.exec(file.path)
      if (npc) {
        const bytes = fs.read(file)
        if (!isNarc(bytes)) continue
        for (const member of readNarc(bytes).entries()) {
          if (
            !String(member.name ?? member.index)
              .toLowerCase()
              .endsWith('npc.bin')
          )
            continue
          try {
            const list = readNpcList(tryDecompressLz10(member.data) ?? member.data)
            cast.set((npc[1] as string).toUpperCase(), new Set(list.map((e) => e.id)))
          } catch {
            // One area's list is zero bytes; the cast test reports it.
          }
        }
        continue
      }
      const chapter = /^\/data\/scenario\/([A-Z]\d\d)[A-Z]\d\.gp2$/i.exec(file.path)
      if (!chapter) continue
      const bytes = fs.read(file)
      if (!isGpc(bytes)) continue
      const archive = readGpc(bytes)
      for (const member of archive.members) {
        const number = /^(\d+)_en\.bin$/.exec(member.name)
        if (!number) continue
        talk.push({
          area: (chapter[1] as string).toUpperCase(),
          id: Number(number[1]),
          where: `${file.path}#${member.name}`,
          bytes: archive.read(member),
        })
      }
    }

    const failures: string[] = []
    let lines = 0
    let withCast = 0
    let inCast = 0
    for (const file of talk) {
      try {
        for (const line of readTalk(file.bytes)) {
          lines++
          if (line.text !== undefined) parseMarkup(line.text)
        }
      } catch (error) {
        failures.push(`${file.where}: ${error instanceof Error ? error.message : String(error)}`)
      }
      const ids = cast.get(file.area)
      if (!ids) continue
      withCast++
      if (ids.has(file.id)) inCast++
    }

    expect(failures.slice(0, 10)).toEqual([])
    expect(talk.length).toBeGreaterThan(8000)
    expect(lines).toBeGreaterThan(30_000)
    expect(inCast / withCast, `${inCast} of ${withCast}`).toBeGreaterThan(0.99)
  })
})
