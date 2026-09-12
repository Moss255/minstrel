import { readFileSync } from 'node:fs'
import type { TalkLine, Trigger } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { load } from '../src/load.ts'
import {
  DEFAULT_CONTEXT,
  letterForStage,
  nextPage,
  OPENING_STAGE,
  pickLine,
  renderLine,
  startConversation,
  type Talker,
  talkTarget,
} from '../src/talk.ts'

/**
 * Talking to a character. Every string here is written for the test — none is
 * the cartridge's text, which never belongs in a fixture.
 */

const someone = (id: number, x: number, z: number): Talker => ({ id, name: `n${id}`, x, z })

describe('talkTarget', () => {
  // Facing 0 looks along +z, the player's own convention.
  const hero = { x: 0, z: 0, facing: 0 }

  it('finds the character in front, near enough to talk to', () => {
    expect(talkTarget(hero, [someone(1, 0, 0.2)])?.id).toBe(1)
  })

  it('does not talk to someone behind, or too far away', () => {
    expect(talkTarget(hero, [someone(1, 0, -0.2)])).toBeUndefined()
    expect(talkTarget(hero, [someone(1, 0, 1)])).toBeUndefined()
    // Off to the side by more than 60 degrees.
    expect(talkTarget(hero, [someone(1, 0.2, 0.05)])).toBeUndefined()
  })

  it('takes the nearest of those in front', () => {
    expect(talkTarget(hero, [someone(1, 0, 0.3), someone(2, 0.05, 0.15)])?.id).toBe(2)
  })

  it('turns with the Hero', () => {
    expect(talkTarget({ x: 0, z: 0, facing: Math.PI / 2 }, [someone(1, 0.2, 0)])?.id).toBe(1)
  })
})

describe('letterForStage', () => {
  const letters = ['A0', 'B0', 'C0', 'Q0']

  it('reads the first letter with no stage, and the stage major as the letter', () => {
    expect(letterForStage(letters, undefined)).toBe('A0')
    expect(letterForStage(letters, { major: 1, minor: 1 })).toBe('A0')
    expect(letterForStage(letters, { major: 2, minor: 6 })).toBe('B0')
  })

  it('takes the latest letter before a stage the area has none for', () => {
    expect(letterForStage(letters, { major: 5, minor: 1 })).toBe('C0')
    expect(letterForStage(letters, { major: 19, minor: 2 })).toBe('Q0')
  })

  it('has nothing to say for an area with no talk at all', () => {
    expect(letterForStage([], { major: 1, minor: 1 })).toBeUndefined()
  })
})

describe('renderLine', () => {
  it('reads accents, apostrophes and the pause as the characters they are', () => {
    expect(renderLine("*: Cr<`e>me br<^u>l<'e>e<,> na<:i>ve<1>s").pages).toEqual([
      { speaker: undefined, text: 'Crème brûlée, naïve’s' },
    ])
  })

  it('puts the Hero in, capitalised when asked, and names a speaker', () => {
    const line = renderLine('//Mira// Evening<,> <HERO>!<ADD>')
    expect(line.pages).toEqual([{ speaker: 'Mira', text: 'Evening, Hero!' }])
    expect(renderLine('<Cap><HERO>? Is that you?').pages[0]?.text).toBe('Hero? Is that you?')
    expect(
      renderLine('*: Hi<,> <Cap>hero.', { ...DEFAULT_CONTEXT, heroName: 'x' }).pages[0]?.text,
    ).toBe('Hi, Hero.')
  })

  it('leaves out what it does not know, and says so', () => {
    const line = renderLine('*: Will you come?<YESNO>')
    expect(line.pages[0]?.text).toBe('Will you come?')
    expect(line.unhandled).toEqual(['YESNO'])
  })

  it('splits pages, and keeps line breaks within a page', () => {
    expect(renderLine('*: One.\\nStill one.<PAGE>*: Two.').pages).toEqual([
      { speaker: undefined, text: 'One.\nStill one.' },
      { speaker: undefined, text: 'Two.' },
    ])
  })

  it('takes the branch a condition holds for, however deep', () => {
    const text =
      '*: A <IF_HERO_MALE>lad<IF_SOLO> alone<ENDIF_SOLO><ELSE_HERO_NOT_MALE>lass<ENDIF_HERO_MALE>.'
    expect(renderLine(text).pages[0]?.text).toBe('A lad alone.')
    const her = {
      ...DEFAULT_CONTEXT,
      conditions: { ...DEFAULT_CONTEXT.conditions, HERO_MALE: false },
    }
    expect(renderLine(text, her).pages[0]?.text).toBe('A lass.')
  })

  it('reads the quotation marks by the shapes they are named for', () => {
    expect(renderLine('*: <66>Hello<99><-->she said').pages[0]?.text).toBe('“Hello”—she said')
  })
})

describe('a conversation', () => {
  const who = someone(3, 0, 0.1)
  const texts = ['*: First.<PAGE>*: Second.', undefined, '*: Third.']

  it('goes page by page, skips a text with nothing in it, and ends', () => {
    let at = startConversation(who, 'chapter B0', texts)
    const seen: string[] = []
    while (at) {
      seen.push(at.rendered.pages[at.page]?.text ?? '')
      at = nextPage(at)
    }
    expect(seen).toEqual(['First.', 'Second.', 'Third.'])
  })

  it('does not start with someone who has nothing to say', () => {
    expect(startConversation(who, 'chapter B0', [undefined])).toBeUndefined()
  })
})

describe('pickLine', () => {
  const line = (numbers: number[], text: string, tag = 1): TalkLine => ({
    tag,
    unknown_numbers: numbers,
    text,
  })
  /** A trigger record built in code: a map, a span, and its words as operation and argument. */
  const trigger = (
    map: number,
    from: [number, number],
    to: [number, number],
    words: [number, number][],
  ): Trigger => ({
    map,
    from: { major: from[0], minor: from[1] },
    to: { major: to[0], minor: to[1] },
    unknown_5: 1,
    values: Uint32Array.from(words.map(([op, arg]) => ((op << 16) | arg) >>> 0)),
    floats: new Float32Array(words.length),
    kinds: new Uint8Array(words.length).fill(1),
    offset: 0x40,
  })
  const lines = [
    line([1, 1, 16], '*: Plain, by day.'),
    line([1, 1, 1, 16], '*: Plain, by night.'),
    line([1, 1, 192], '*: Labelled.'),
    line([2, 3, 16], '*: Later on.'),
    line([5, 6, 1, 16], '*: Only after dark.'),
    line([1, 99, 196], '*: Long afterwards.'),
    line([7, 0, 196], '*: About an errand.', 2),
  ]
  const asking = {
    triggers: [] as Trigger[],
    map: 1100,
    stage: { major: 2, minor: 1 },
    night: false,
    id: 5,
    lines,
  }
  const said = (choice: ReturnType<typeof pickLine>) =>
    choice?.kind === 'line' ? choice.line.text : undefined

  it('says the plain line for the sub-stage, by day or by night', () => {
    expect(said(pickLine(asking))).toBe('*: Plain, by day.')
    expect(said(pickLine({ ...asking, night: true }))).toBe('*: Plain, by night.')
    expect(said(pickLine({ ...asking, stage: { major: 2, minor: 3 } }))).toBe('*: Later on.')
  })

  it('takes the other time of day when there is no line for this one', () => {
    const choice = pickLine({ ...asking, stage: { major: 2, minor: 5 } })
    expect(said(choice)).toBe('*: Only after dark.')
    expect(choice?.why).toContain('night line')
  })

  it('says the line a trigger labels, and runs the event a trigger names instead', () => {
    const labelled = trigger(
      1100,
      [2, 1],
      [2, 1],
      [
        [6, 5],
        [11, 192],
      ],
    )
    expect(said(pickLine({ ...asking, triggers: [labelled] }))).toBe('*: Labelled.')
    const event = trigger(
      1100,
      [2, 1],
      [2, 1],
      [
        [6, 5],
        [11, 0],
        [119, 2110],
      ],
    )
    expect(pickLine({ ...asking, triggers: [event] })).toMatchObject({ kind: 'event', event: 2110 })
  })

  it('reads a label given the other way, as a word whose low half is 0', () => {
    const late = trigger(
      1100,
      [2, 1],
      [5, 99],
      [
        [6, 5],
        [36, 1],
        [118, 5],
        [196, 0],
      ],
    )
    expect(said(pickLine({ ...asking, triggers: [late] }))).toBe('*: Long afterwards.')
  })

  it('ignores a trigger in another map, for someone else, or outside its span', () => {
    const elsewhere = [
      trigger(
        1107,
        [2, 1],
        [2, 1],
        [
          [6, 5],
          [11, 192],
        ],
      ),
      trigger(
        1100,
        [2, 1],
        [2, 1],
        [
          [6, 9],
          [11, 192],
        ],
      ),
      trigger(
        1100,
        [2, 2],
        [2, 7],
        [
          [6, 5],
          [11, 192],
        ],
      ),
    ]
    expect(said(pickLine({ ...asking, triggers: elsewhere }))).toBe('*: Plain, by day.')
  })

  it('never says an errand line, and says when it has had to guess', () => {
    const choice = pickLine({ ...asking, stage: { major: 2, minor: 4 } })
    expect(said(choice)).toBe('*: Long afterwards.')
    expect(choice?.why).toContain('a guess')
    expect(pickLine({ ...asking, lines: [lines[6] as TalkLine] })).toBeUndefined()
  })
})

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('talk on a real cartridge', { timeout: 60_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

  it("reads the village's talk for every chapter, and every line renders", () => {
    const village = load(rom, { map: 'M01' })
    expect(village.letters[0]).toBe('A0')
    expect(village.letters.length).toBeGreaterThan(10)
    const cast = [...village.cast.members, ...village.cast.sprites2d]
    let said = 0
    for (const letter of village.letters) {
      for (const member of cast) {
        for (const line of village.linesOf(member.placement.id, letter)) {
          said++
          renderLine(line.text ?? '')
        }
      }
    }
    expect(said).toBeGreaterThan(100)
  })

  it('picks a line or an event for the village at the opening, and reads the event', () => {
    const village = load(rom, { map: 'M01' })
    expect(village.mapId).toBe(1100)
    expect(village.triggers.length).toBeGreaterThan(100)
    // The stages a village trigger starts at are among those `t`/`y` step through.
    expect(village.stages.some((s) => s.major === 2 && s.minor === 1)).toBe(true)
    let lines = 0
    let events = 0
    for (const member of [...village.cast.members, ...village.cast.sprites2d]) {
      const choice = pickLine({
        triggers: village.triggers,
        map: village.mapId,
        stage: OPENING_STAGE,
        night: false,
        id: member.placement.id,
        lines: village.linesOf(member.placement.id, 'B0'),
      })
      if (choice?.kind === 'line') lines++
      if (choice?.kind === 'event') {
        events++
        expect(village.eventMessages(choice.event).length, `event ${choice.event}`).toBeGreaterThan(
          0,
        )
      }
    }
    expect(lines).toBeGreaterThan(5)
    expect(events).toBeGreaterThan(0)
  })
})
