import { readFileSync } from 'node:fs'
import { scanCartridge } from '@minstrel/cartridge'
import { isUnread, readActionScript } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'

/**
 * Every action script on a real cartridge — the fighters', the spells', the
 * skills', `default.bact` — read as the game's builders read them. Local-only:
 * skipped without a dump, and nothing it reads is committed.
 */
const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('the action scripts on a real cartridge', { timeout: 120_000 }, () => {
  const scripts = () => {
    const rom = new Uint8Array(readFileSync(romPath as string))
    return [...scanCartridge(rom)].filter((leaf) => leaf.path.toLowerCase().endsWith('.bact'))
  }

  it('reads all 930, every one into at least one section', () => {
    const all = scripts()
    expect(all).toHaveLength(930)
    for (const leaf of all) {
      const script = readActionScript(leaf.bytes)
      expect(script.sections.length, leaf.path).toBeGreaterThan(0)
    }
  })

  it('carries unread only the tags whose builders or players are not read, or do nothing to show', () => {
    const unread = new Set<number>()
    for (const leaf of scripts())
      for (const section of readActionScript(leaf.bytes).sections)
        for (const command of section.commands) if (isUnread(command)) unread.add(command.tag)
    expect([...unread].sort((a, b) => a - b)).toEqual([
      6, 36, 37, 58, 73, 74, 75, 80, 90, 94, 98, 99, 100, 101, 103, 105, 107, 111, 114, 119, 120,
      121, 122, 124, 125, 126, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 141, 142,
    ])
  })

  it('finds the Hero’s blow and default.bact’s Defend where the game looks', () => {
    const all = scripts()
    const hero = all.find((l) => l.path.endsWith('/mp0200.bact'))
    const def = all.find((l) => l.path.endsWith('/actdef.nsarc/default.bact'))
    const blow = readActionScript(hero?.bytes ?? new Uint8Array()).sections[0]
    expect(blow?.keys).toEqual([1, 2, 219])
    expect(blow?.commands).toContainEqual({ tag: 77, gap: 0.75 })
    const sections = readActionScript(def?.bytes ?? new Uint8Array()).sections
    const guard = sections
      .flatMap((s) => s.commands)
      .find((c) => c.tag === 3 && 'name' in c && c.name === 'guard')
    expect(guard).toEqual({ tag: 3, who: 7, name: 'guard', flags: 1, fx: 2 })
  })
})
