import { readFileSync } from 'node:fs'
import { parseMarkup, readEventMessages } from '@minstrel/game-formats'
import { isGpc, readGpc } from '@minstrel/l5-gpc'
import { readNitroFs, walkFiles } from '@minstrel/nitrofs'
import { describe, expect, it } from 'vitest'

/**
 * Event text, on a real cartridge.
 *
 * Local-only: skipped without a dump, and nothing it reads is committed. The
 * fixtures in `packages/game-formats/test/events.test.ts` are built in code;
 * this holds the reader and the markup splitter to every event there is.
 */
const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('event text on a real cartridge', { timeout: 120_000 }, () => {
  it('reads every event in every language, and the markup of every message', () => {
    const fs = readNitroFs(new Uint8Array(readFileSync(romPath as string)))
    const failures: string[] = []
    const unaligned: string[] = []
    let events = 0
    let files = 0
    let messages = 0
    let conditionals = 0
    let strayBackslashes = 0

    for (const file of walkFiles(fs.root)) {
      if (!/^\/data\/event\/ev\d+\.gp2$/i.test(file.path)) continue
      const bytes = fs.read(file)
      if (!isGpc(bytes)) continue
      events++
      // Every language of an event should carry the same message numbers.
      const numberings = new Set<string>()
      for (const member of readGpc(bytes).members) {
        if (!/_[a-z]{2}\.bin$/.test(member.name)) continue
        files++
        const where = `${file.path}#${member.name}`
        try {
          const read = readEventMessages(readGpc(bytes).read(member))
          numberings.add(read.map((m) => m.id).join(','))
          for (const { id, text } of read) {
            messages++
            if (text === undefined) continue
            strayBackslashes += (text.match(/\\(?!n)/g) ?? []).length
            // Conditions have to nest: an IF closed by its own ENDIF, with any
            // ELSE between them.
            const open: string[] = []
            let any = false
            for (const token of parseMarkup(text)) {
              if (token.kind !== 'tag') continue
              const condition = /^(IF|ELSE|ENDIF)_(.+)$/.exec(token.name)
              if (!condition) continue
              any = true
              if (condition[1] === 'IF') open.push(condition[2] as string)
              else if (condition[1] === 'ELSE' && open.length === 0) {
                failures.push(`${where} ${id}: <${token.name}> outside any condition`)
              } else if (condition[1] === 'ENDIF' && open.pop() !== condition[2]) {
                failures.push(`${where} ${id}: <${token.name}> closes the wrong condition`)
              }
            }
            if (open.length > 0)
              failures.push(`${where} ${id}: <IF_${open.join('>, <IF_')}> left open`)
            if (any) conditionals++
          }
        } catch (error) {
          failures.push(`${where}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      if (numberings.size > 1) unaligned.push(file.path)
    }

    expect(failures.slice(0, 10)).toEqual([])
    expect(events).toBeGreaterThan(500)
    expect(files).toBe(events * 5)
    expect(unaligned).toEqual([])
    expect(messages).toBeGreaterThan(18_000)
    expect(conditionals).toBeGreaterThan(1_000)
    expect(strayBackslashes, 'a backslash that is not a line break').toBe(0)
  })
})
