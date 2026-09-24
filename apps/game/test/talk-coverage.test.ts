import { readFileSync } from 'node:fs'
import { parseMarkup } from '@minstrel/game-formats'
import { beforeAll, describe, expect, it } from 'vitest'
import { load } from '../src/load.ts'
import { pickLine, runLine } from '../src/talk.ts'

const romPath = process.env.MINSTREL_TEST_ROM

/**
 * **Can anyone be talked to, anywhere?**
 *
 * `docs/beyond-the-slice.md`'s Phase 1 is done when an area outside the slice
 * "loads, walks, talks and plays its events without new code". Three of those
 * four now have a measurement — `maps.test.ts` for loading,
 * `event-coverage.test.ts` for the events, `text-coverage.test.ts` for what
 * the messages ask for. **Talking had none**, and the whole talk system had
 * only ever been exercised in Angel Falls.
 *
 * So this asks every area: stand in each of its maps, at each story stage its
 * own cast records mention, and ask every character standing there what they
 * would say. It counts who answers, who does not, and what comes out.
 *
 * It is a measurement as much as a test. The assertions pin what is known so
 * that a regression shows up as a worse number; the table is what the work is
 * read from.
 *
 * **What it does not cover**, so the number is not read for more than it says:
 *
 * - **Only each area's own map**, not the buildings inside it. Most of a
 *   town's people are indoors, so the real count of talkers is far higher
 *   than the 1,135 here.
 * - **Only by day.** `night: false` throughout; a line may differ after dark.
 * - **No story flags, marks or step.** `pickLine` reads all three when given
 *   them, and a conversation gated behind a flag will pick a different line —
 *   or none — in a real game.
 * - **It asks, it does not converse.** Prompts, answers and the branches they
 *   lead to are not walked; only the first line each character offers.
 *
 * Local-only: skipped without a dump.
 */
describe.skipIf(!romPath)('whether anyone can be talked to, anywhere', () => {
  interface Tally {
    areas: number
    maps: number
    /** Every (map, character, stage) asked. */
    asked: number
    /** Those that chose a line with text. */
    spoke: number
    /** Those that chose an event to play instead. */
    events: number
    /** Those that chose a line whose text is empty or absent. */
    silent: number
    /** Those with nothing at all to say. */
    nothing: number
    /** Lines whose rendering came out blank. */
    blank: number
    /** Characters who answered in at least one map, and areas with at least one. */
    speakers: Set<string>
    areasWithSpeech: Set<string>
    /** Markup the renderer did not read, met through talk rather than events. */
    unread: Map<string, number>
    /** How each spoken line would have the speaker facing — see `Run.turn`. */
    turns: Map<string, number>
  }

  const t: Tally = {
    areas: 0,
    maps: 0,
    asked: 0,
    spoke: 0,
    events: 0,
    silent: 0,
    nothing: 0,
    blank: 0,
    speakers: new Set(),
    areasWithSpeech: new Set(),
    unread: new Map(),
    turns: new Map(),
  }
  /** Areas with people in them where none of them speaks. */
  const quiet: string[] = []
  /** Areas with nobody standing in the map at all — a dungeon has monsters, not villagers. */
  const empty: string[] = []

  beforeAll(() => {
    const rom = new Uint8Array(readFileSync(romPath as string))
    // The areas that have triggers are the ones with talk; a map with no area
    // has nobody to ask. `load` gives both, so the areas come from the maps.
    const areas = new Map<string, string[]>()
    for (const code of AREA_CODES) areas.set(code, [])

    for (const area of areas.keys()) {
      let opened: ReturnType<typeof load>
      try {
        opened = load(rom, { map: area })
      } catch {
        continue
      }
      t.areas++
      t.maps++
      // Every stage this map's own cast records mention, so a character is
      // asked where and when they actually stand.
      const stages = opened.stages.length > 0 ? opened.stages : [{ major: 1, minor: 1 }]
      let spokeHere = 0
      let askedHere = 0
      for (const stage of stages) {
        const cast = opened.castAt(stage)
        for (const who of [...cast.members, ...cast.sprites2d]) {
          const id = (who as { placement: { id: number } }).placement.id
          // **Every chapter the area has**, not just the first: a character
          // silent in one may speak in another, and asking only `letters[0]`
          // made half the cartridge look mute.
          const lines = opened.letters.flatMap((letter) => opened.linesOf(id, letter))
          t.asked++
          askedHere++
          const choice = pickLine({
            triggers: opened.triggers,
            map: opened.mapId,
            stage,
            night: false,
            id,
            lines,
          })
          if (!choice) {
            t.nothing++
            continue
          }
          if (choice.kind === 'event') {
            t.events++
            continue
          }
          const text = choice.line.text
          if (text === undefined || text.trim() === '') {
            t.silent++
            continue
          }
          t.spoke++
          spokeHere++
          t.speakers.add(`${area}#${id}`)
          const run = runLine(parseMarkup(text))
          if (run.pages.every((page) => page.text.trim() === '')) t.blank++
          for (const name of run.unhandled) t.unread.set(name, (t.unread.get(name) ?? 0) + 1)
          t.turns.set(run.turn.kind, (t.turns.get(run.turn.kind) ?? 0) + 1)
        }
      }
      if (spokeHere > 0) t.areasWithSpeech.add(area)
      else if (askedHere === 0) empty.push(area)
      else quiet.push(area)
    }

    console.log(
      `${t.areas} areas · ${t.asked} asked · ${t.spoke} spoke · ${t.events} play an event · ${t.silent} chose a line with no text · ${t.nothing} had nothing`,
    )
    console.log(`  ${t.areasWithSpeech.size} areas where somebody speaks`)
    console.log(`  ${empty.length} areas with nobody standing in them: ${empty.join(' ')}`)
    if (quiet.length > 0)
      console.log(`  ${quiet.length} with people who say nothing: ${quiet.join(' ')}`)
    console.log(`  ${t.blank} lines rendered blank`)
    console.log(
      `  the speaker would face: ${[...t.turns]
        .sort((a, b) => b[1] - a[1])
        .map(([kind, n]) => `${kind} ${n}`)
        .join(' · ')}`,
    )
    const worst = [...t.unread].sort((a, b) => b[1] - a[1])
    console.log(`  ${worst.length} tags unread through talk:`)
    for (const [name, n] of worst.slice(0, 15)) console.log(`    <${name}>\t${n}`)
  }, 600_000)

  it('asks every area', () => {
    expect(t.areas).toBe(AREA_CODES.length)
  })

  it('finds somebody to talk to in every area that has anybody in it', () => {
    // **The split that matters.** 27 of the 70 have nobody standing in the
    // area's own map — they are the dungeons, and a dungeon has monsters
    // rather than villagers — and in **every one of the other 43 somebody
    // speaks**. No area has people in it who say nothing, which is the shape a
    // fault here would take.
    expect(t.areasWithSpeech.size + empty.length).toBe(AREA_CODES.length)
    expect(quiet).toEqual([])
    expect(empty.length).toBe(27)
  })

  it('gets an answer from nearly everyone it asks', () => {
    // 1,116 of 1,135. Of the rest, 17 play an event instead of speaking — the
    // trigger chose a scene over a line, which is the system working — and
    // **two have nothing at all**. Two is small enough to be worth naming one
    // day and too small to chase now.
    expect(t.spoke).toBe(1116)
    expect(t.events).toBe(17)
    expect(t.nothing).toBe(2)
    expect(t.silent).toBe(0)
  })

  it('renders every line it gets to something', () => {
    // Not one of the 1,116 comes out blank, where nine of the 5,157 event
    // texts do. Talk and event text go through the same renderer, so the
    // difference is in what the two kinds of text use.
    expect(t.blank).toBe(0)
  })

  it('counts the markup talk asks for that events do not', () => {
    // **A different tail from `text-coverage.test.ts`.** There `<ADD>` led by
    // a distance; here it was third, behind `<N_TURN>` and `<END_R_TURN>`,
    // which barely show up in event text at all. Reading the markup had to
    // satisfy both, and this was the half that would otherwise be invisible —
    // `<N_TURN>` alone was 208 of the cartridge's turns, and it turned out not
    // to be a turn: it is *no* turn, suppressing the face-the-player every
    // message otherwise does. See `docs/event-scripts.md` §7a.
    //
    // Fourteen became five, and what is left is honest residue:
    // `<WIN_ON>`/`<WIN_OFF>` are codes whose **direction is not established**
    // — `<WIN>` writes 0 to the frame byte and the pair plainly toggles it,
    // but plainly is not read — and `<val_2>` is a value the engine supplies.
    const worst = [...t.unread].sort((a, b) => b[1] - a[1]).map(([name]) => name)
    expect(worst).toEqual(['-', 'WIN_OFF', 'WIN_ON', 'val_2', '.|'])
    expect(t.unread.size).toBe(5)
  })

  it('knows which speakers should stay put', () => {
    // **Nearly a third of spoken lines are not the default.** Every message
    // the game shows turns the speaker to face the player — the pass at
    // 0x0206a3c0 does it before reading a tag — and 336 of the 1,116 override
    // that: 198 `<N_TURN>` say stay as you are, 138 `<R_TURN>`/`<END_R_TURN>`
    // send them back to the facing they had. See `docs/event-scripts.md` §7a.
    //
    // Before this was read, `apps/game` turned nobody, so all 1,116 were
    // wrong in the same direction and the 336 were invisible. The numbers are
    // pinned because getting the default right and the exceptions wrong would
    // look like an improvement and be a town of swivelling villagers.
    expect([...t.turns].sort((a, b) => b[1] - a[1])).toEqual([
      ['player', 780],
      ['keep', 198],
      ['back', 138],
    ])
    expect([...t.turns.values()].reduce((a, b) => a + b, 0)).toBe(t.spoke)
  })
})

/** The cartridge's areas — those with a `trigger<CODE>.bin`. */
const AREA_CODES = [
  'C01',
  'C02',
  'C04',
  'D01',
  'D03',
  'D04',
  'D06',
  'D07',
  'D08',
  'D09',
  'D12',
  'D13',
  'D14',
  'D16',
  'D17',
  'H01',
  'H02',
  'H03',
  'H04',
  'H05',
  'H06',
  'H07',
  'H08',
  'H09',
  'H10',
  'H11',
  'H12',
  'H13',
  'H14',
  'H15',
  'H16',
  'H17',
  'H18',
  'H19',
  'H20',
  'M01',
  'M02',
  'M03',
  'M05',
  'M07',
  'M08',
  'M09',
  'M10',
  'M11',
  'M12',
  'M13',
  'O00',
  'O01',
  'R01',
  'R02',
  'R03',
  'R04',
  'R05',
  'S01',
  'S02',
  'S03',
  'S04',
  'S05',
  'S06',
  'S07',
  'S08',
  'S09',
  'S10',
  'S11',
  'S12',
  'S13',
  'S14',
  'S15',
  'T01',
  'T02',
]
