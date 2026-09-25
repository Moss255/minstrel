import { readFileSync } from 'node:fs'
import { OP_EVENT, readMapList, readTriggers, triggerWords } from '@minstrel/game-formats'
import { readNitroFs, walkFiles } from '@minstrel/nitrofs'
import { describe, expect, it } from 'vitest'

const romPath = process.env.MINSTREL_TEST_ROM

/**
 * **A scene happens in a map, and the triggers say which.**
 *
 * `?event=` used to play a scene in whatever map was loaded. `ev03030` was
 * driven with `?map=C01`, which is not where it happens, and the resulting
 * camera-in-a-wall was chased into the renderer, the collision scale and the
 * decomp before anyone checked the map — see `docs/still-open.md`.
 *
 * `goToEventsMap` in `main.ts` now reads `Trigger.map` and goes there first.
 * This pins the fact it stands on, for the five scenes that mistake was
 * measured across: each is named by a trigger, and the map is not `C01`.
 */
describe.skipIf(!romPath)('the map a scene happens in', () => {
  const expected: Record<number, string> = {
    3030: 'C01M16',
    20780: 'C01M19',
    20800: 'C01M14',
    3050: 'C01M18',
    3031: 'C01M15',
  }

  it('is named by a trigger, and is not the area map they were driven in', () => {
    const rom = new Uint8Array(readFileSync(romPath as string))
    const fs = readNitroFs(rom)
    const index = fs.file('/data/map/maplist9.bin')
    const codeOf = new Map(
      readMapList(fs.read(index as NonNullable<typeof index>))
        .maps.filter((m) => m.id !== 0)
        .map((m) => [m.id, m.code]),
    )

    const found = new Map<number, Set<string>>()
    for (const file of walkFiles(fs.root)) {
      if (!/\/trigger[A-Z]\d\d\.bin$/i.test(file.path)) continue
      let triggers: ReturnType<typeof readTriggers>
      try {
        triggers = readTriggers(fs.read(file))
      } catch {
        continue
      }
      for (const trigger of triggers) {
        for (const word of triggerWords(trigger)) {
          if (word.op !== OP_EVENT || !(word.arg in expected)) continue
          const set = found.get(word.arg) ?? new Set<string>()
          const code = codeOf.get(trigger.map)
          if (code) set.add(code)
          found.set(word.arg, set)
        }
      }
    }

    for (const [id, code] of Object.entries(expected)) {
      const maps = found.get(Number(id))
      expect(maps, `ev${id} is named by no trigger`).toBeDefined()
      expect([...(maps as Set<string>)], `ev${id}`).toContain(code)
      // The point of the fix: driving these in `C01` was driving them
      // somewhere they do not happen.
      expect([...(maps as Set<string>)], `ev${id} should not be C01 itself`).not.toContain('C01')
    }
  })
})
