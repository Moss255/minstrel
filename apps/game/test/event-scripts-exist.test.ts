import { readFileSync } from 'node:fs'
import { scanCartridge } from '@minstrel/cartridge'
import { OP_EVENT, readTriggers, triggerWords } from '@minstrel/game-formats'
import { readNitroFs, walkFiles } from '@minstrel/nitrofs'
import { describe, expect, it } from 'vitest'

const romPath = process.env.MINSTREL_TEST_ROM

/**
 * **A trigger can name an event the cartridge has not got.**
 *
 * Found in Zere on 25 September 2026, by the witness: `ev03131` is named by a
 * trigger in `M02` and there is no `ev03131.gp2` anywhere. The host says
 * "will not read" and carries on, which is right — a scene that is not there
 * should not stop a town — but it is worth knowing how often it happens, so
 * that the next one is recognised as the cartridge's rather than chased as
 * ours. The same thing in the map index is the `M07` → `M07M07` doorway.
 *
 * **Twenty-three of the 512 trigger-named events have no script, and
 * twenty-one of those are `R02`, `R03` and `R04` in exact triples** — three
 * parallel areas whose parallel scenes were cut together. Only `ev00003`
 * (`H18`) and `ev03131` (`M02`) sit outside that pattern, which is what makes
 * the triples a shape rather than a coincidence.
 */
describe.skipIf(!romPath)('events a trigger names', () => {
  it('are on the cartridge, except for a known and shaped few', () => {
    const rom = new Uint8Array(readFileSync(romPath as string))
    const fs = readNitroFs(rom)

    const have = new Set<number>()
    for (const folder of ['/data/event', '/data/evspt_lv5']) {
      for (const leaf of scanCartridge(rom, { pathFilter: folder })) {
        if (!/\.stb$/i.test(leaf.path)) continue
        const named = /ev(\d{5})\.gp2/i.exec(leaf.archive)
        if (named) have.add(Number(named[1]))
      }
    }

    const missing = new Map<number, Set<string>>()
    const named = new Set<number>()
    for (const file of walkFiles(fs.root)) {
      const area = /\/trigger([A-Z]\d\d)\.bin$/i.exec(file.path)
      if (!area) continue
      let triggers: ReturnType<typeof readTriggers>
      try {
        triggers = readTriggers(fs.read(file))
      } catch {
        continue
      }
      for (const trigger of triggers) {
        for (const word of triggerWords(trigger)) {
          if (word.op !== OP_EVENT || word.arg <= 0) continue
          named.add(word.arg)
          if (have.has(word.arg)) continue
          const areas = missing.get(word.arg) ?? new Set<string>()
          areas.add((area[1] as string).toUpperCase())
          missing.set(word.arg, areas)
        }
      }
    }

    expect(have.size).toBe(687)
    expect(named.size).toBe(512)
    expect(missing.size).toBe(23)

    // The shape: all but two are the three parallel areas, and each of those
    // is wanted by exactly one of them.
    const odd = [...missing].filter(
      ([, areas]) => ![...areas].every((a) => ['R02', 'R03', 'R04'].includes(a)),
    )
    expect(odd.map(([id]) => id).sort((a, b) => a - b)).toEqual([3, 3131])
    for (const [, areas] of missing) expect(areas.size).toBe(1)
  }, 120_000)
})
