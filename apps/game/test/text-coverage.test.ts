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
  const blanks: string[] = []

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
        if (run.pages.every((page) => page.text.trim() === '')) {
          empty++
          // The count on its own is unchaseable. A blank box is worse than a
          // missing tag — nothing tells the player why — so say which event
          // and what the source was, and the next person can go and look.
          blanks.push(`ev${String(event).padStart(5, '0')}: ${JSON.stringify(text.slice(0, 96))}`)
        }
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
    for (const line of blanks) console.log(`  blank — ${line}`)
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
    // A text rendering to nothing would normally be worse than one with a tag
    // missing: the player gets a blank box and nothing says why. **Nine of
    // 5,157** do — and having finally looked at which, not one is a fault.
    //
    // Eight are the same string, `<PAD_WAIT_NOCUR></QUEST><CLOSE>`, in the
    // quest events `ev50160`–`ev50224`: all control and no words, by
    // construction. The ninth is `ev28792`'s `<ALL_RECOVER=0,0,999>`, which is
    // not a text at all but **an action carried down the message channel** —
    // the party healed by something written where a line would go.
    //
    // So the number to watch is not nine going up but a *tenth kind* showing
    // up, which is what the printed list beside it is for.
    expect(empty).toBe(9)
  })

  it('counts the markup the renderer does not read', () => {
    // **The worklist, and what is left of it.** It began at twenty-three.
    // Reading the game's own markup compiler — the tag table at 0x020e7f84 and
    // the prefix chain at 0x0206a3c0, see `docs/event-scripts.md` §7a — took it
    // to these six, and they are six of a different kind:
    //
    // - `<.|>` and `<.|.|>` are **not in the compiler's vocabulary at all**,
    //   so they belong to an earlier pass this has not found. Eleven of the
    //   twelve uses are Petra's and Fanny's songs, which is a hint.
    // - `<tmap_sec1>`–`<tmap_sec3>`, `<str_5>` are **values the engine
    //   supplies**, like `<val_1>`. `runLine` already puts them in when the
    //   context has them; nothing here has a treasure map to name, so they
    //   come out unread and would come out unread in the game too.
    //
    // So this is not the same list made shorter — it is the residue after the
    // compiled vocabulary was read out.
    expect([...unread.keys()].sort()).toEqual([
      '.|',
      '.|.|',
      'str_5',
      'tmap_sec1',
      'tmap_sec2',
      'tmap_sec3',
    ])
    // `<ADD>` was most of the problem on its own — 429 of the 687 events, 1,724
    // uses. It is a message terminator that leaves the window standing so the
    // next message is drawn into it; `Run.continues` carries it now.
    expect(unread.has('ADD')).toBe(false)
  })
})
