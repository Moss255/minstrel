import { readFileSync } from 'node:fs'
import { scanCartridge } from '@minstrel/cartridge'
import { parseMarkup, readEventMessages } from '@minstrel/game-formats'
import { beforeAll, describe, expect, it } from 'vitest'
import { runLine } from '../src/talk.ts'

const romPath = process.env.MINSTREL_TEST_ROM

/**
 * **Every event text on the cartridge, through the game's own renderer.**
 *
 * The plan's Phase 1 asks for "text and talk at scale: 1,646 event texts, with
 * the markup fully read". This is the measurement half. `runLine` already
 * keeps what it could not make sense of — the game puts it on the status line
 * as `not shown: <TAG>` — so the question is only ever asked one message at a
 * time, by whoever happens to be looking. This asks it of all of them at once.
 *
 * It is a measurement as much as a test, like `event-coverage.test.ts` beside
 * it. The assertions pin what is known so that reading a tag shows up as a
 * smaller number and losing one as a larger; the table is the worklist.
 *
 * Local-only: skipped without a dump.
 */
describe.skipIf(!romPath)('what the event texts ask for that the host has not got', () => {
  /** Each unread tag: how often, in how many events, and a text that uses it. */
  const unread = new Map<number, never>() as unknown as Map<
    string,
    { uses: number; events: Set<number>; example: string }
  >
  let texts = 0
  let events = 0
  let empty = 0

  beforeAll(() => {
    const rom = new Uint8Array(readFileSync(romPath as string))
    const seen = new Map<number, string[]>()
    // An event's English text lives beside its script in its own `ev#####.gp2`.
    for (const folder of ['/data/event', '/data/evspt_lv5']) {
      for (const leaf of scanCartridge(rom, { pathFilter: folder })) {
        if (!/_en\.bin$/i.test(leaf.path)) continue
        const named = /ev(\d{5})\.gp2/i.exec(leaf.archive)
        if (!named) continue
        try {
          seen.set(
            Number(named[1]),
            readEventMessages(leaf.bytes).flatMap((m) => (m.text === undefined ? [] : [m.text])),
          )
        } catch {
          // A text file that will not read is the event-format's problem, not
          // the markup's; `cartridge.test.ts` is where that would show.
        }
      }
    }

    events = seen.size
    for (const [event, lines] of seen) {
      for (const text of lines) {
        texts++
        const run = runLine(parseMarkup(text))
        if (run.pages.every((page) => page.text.trim() === '')) empty++
        for (const name of run.unhandled) {
          const found = unread.get(name) ?? { uses: 0, events: new Set<number>(), example: text }
          found.uses++
          found.events.add(event)
          unread.set(name, found)
        }
      }
    }

    const worst = [...unread].sort((a, b) => b[1].events.size - a[1].events.size)
    console.log(`${texts} texts in ${events} events · ${empty} come out empty`)
    console.log(`${unread.size} tags the renderer does not read:`)
    for (const [name, { uses, events: where, example }] of worst.slice(0, 30)) {
      const shown = example.replace(/\s+/g, ' ').slice(0, 64)
      console.log(`  <${name}>\t${where.size} events, ${uses} uses · ${shown}`)
    }
  }, 300_000)

  it('reads every event’s English text', () => {
    expect(events).toBeGreaterThan(600)
    expect(texts).toBeGreaterThan(1600)
  })

  it('counts the texts that come out empty', () => {
    // A text rendering to nothing is worse than one with a tag missing: the
    // player gets a blank box and nothing says why. **Nine of 5,157** do, and
    // which they are has not been looked at.
    expect(empty).toBe(9)
  })

  it('counts the markup the renderer does not read', () => {
    // **The worklist.** Pinned by name so that reading one shows up as a
    // shorter list and losing one as a longer. The game's own vocabulary is
    // 127 tags — see `docs/event-scripts.md` §7a for where it is and what is
    // in it — so this is the part of it the texts actually use and this
    // renderer does not yet know.
    expect([...unread.keys()].sort()).toEqual([
      '.|',
      '.|.|',
      '/QUEST',
      'ADD',
      'ALL_RECOVER',
      'CEN',
      'ME_004',
      'ME_007',
      'ME_008',
      'ME_015',
      'ME_018',
      'N_TURN',
      'PAD_WAIT_NOCUR',
      'QUEST',
      'QUEST_HAN',
      'QUEST_SE',
      'SE_014',
      'SHAKE',
      'TIME',
      'str_5',
      'tmap_sec1',
      'tmap_sec2',
      'tmap_sec3',
    ])
    // **`<ADD>` is most of the problem on its own**: 429 of the 687 events use
    // it, 1,724 times. Whatever it does, it is the single cheapest thing to
    // read next.
    expect(unread.get('ADD')?.events.size).toBe(429)
  })
})
