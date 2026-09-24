import { readFileSync } from 'node:fs'
import { parseMarkup, type TalkLine, type Trigger } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { load } from '../src/load.ts'
import {
  branchOf,
  DEFAULT_CONTEXT,
  letterForStage,
  moveChoice,
  nextPage,
  OPENING_STAGE,
  pickLine,
  promptOf,
  renderLine,
  runLine,
  startConversation,
  type Talker,
  facingToward,
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

describe('facingToward', () => {
  /**
   * **Held against `talkTarget`, not against a number I wrote down.** Both
   * sides use the same convention — facing `f` is `(sin f, cos f)` — and a
   * sign error in either would be invisible on its own and obvious here: if
   * the speaker is turned to look at the Hero, then from where the speaker
   * stands, looking that way, the Hero is who they would be talking to.
   *
   * This is the geometry every message applies. The game does it in the pass
   * at 0x0206a3c0, before it reads a tag; `<N_TURN>` is what suppresses it.
   */
  it('looks the way it is pointed, by the same rule talkTarget reads', () => {
    const npc = { x: 3, z: 7 }
    for (const hero of [
      { x: 3, z: 7.2 },
      { x: 3, z: 6.8 },
      { x: 3.2, z: 7 },
      { x: 2.8, z: 7 },
      { x: 3.15, z: 7.15 },
      { x: 2.9, z: 7.2 },
    ]) {
      const facing = facingToward(npc, hero)
      const seen = talkTarget({ ...npc, facing }, [{ id: 9, name: 'Hero', ...hero }])
      expect(seen?.id, `facing ${facing.toFixed(3)} from the npc should see the Hero`).toBe(9)
    }
  })

  it('is a quarter turn apart for the four compass points', () => {
    const at = { x: 0, z: 0 }
    expect(facingToward(at, { x: 0, z: 1 })).toBeCloseTo(0)
    expect(facingToward(at, { x: 1, z: 0 })).toBeCloseTo(Math.PI / 2)
    expect(facingToward(at, { x: 0, z: -1 })).toBeCloseTo(Math.PI)
    expect(facingToward(at, { x: -1, z: 0 })).toBeCloseTo(-Math.PI / 2)
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
      { speaker: undefined, text: 'Crème brûlée, naïve’s', centred: false },
    ])
  })

  it('puts the Hero in, capitalised when asked, and names a speaker', () => {
    const line = renderLine('//Mira// Evening<,> <HERO>!<ADD>')
    expect(line.pages).toEqual([{ speaker: 'Mira', text: 'Evening, Hero!', centred: false }])
    expect(renderLine('<Cap><HERO>? Is that you?').pages[0]?.text).toBe('Hero? Is that you?')
    expect(
      renderLine('*: Hi<,> <Cap>hero.', { ...DEFAULT_CONTEXT, heroName: 'x' }).pages[0]?.text,
    ).toBe('Hi, Hero.')
  })

  it('leaves out what it does not know, and says so', () => {
    // `<.|>` is one of the six the cartridge uses that the game's own markup
    // compiler has no entry for — see `text-coverage.test.ts`. The stand-in
    // here has had to be changed twice as tags were read; picking one from
    // outside the compiled vocabulary should end that.
    const line = renderLine('*: Will you come?<.|>')
    expect(line.pages[0]?.text).toBe('Will you come?')
    expect(line.unhandled).toEqual(['.|'])
  })

  it('reads the commonest tag on the cartridge, and the turn that is not one', () => {
    // `<ADD>` leaves the window standing for the next message; `<N_TURN>` is
    // "no turn", suppressing the face-the-player every message otherwise does.
    const add = runLine(parseMarkup('*: Anything else?<ADD>'))
    expect(add.continues).toBe(true)
    expect(add.unhandled).toEqual([])
    expect(runLine(parseMarkup('*: Morning.')).turn).toEqual({ kind: 'player' })
    expect(runLine(parseMarkup('<N_TURN>*: Morning.')).turn).toEqual({ kind: 'keep' })
    // `<END_R_TURN>` ends the message as `<END>` does, and sends them back.
    const back = runLine(parseMarkup('*: Bye.<END_R_TURN>*: never read'))
    expect(back.pages.map((p) => p.text)).toEqual(['Bye.'])
    expect(back.turn).toEqual({ kind: 'back' })
  })

  it('takes a sound out of the line rather than putting it in the text', () => {
    // `<ME_n>` and `<SE_n>` are not formatting: the game's markup compiler
    // turns them into control codes carried in the message, so they sound
    // where they stand. See `docs/event-scripts.md` §7a.
    const line = runLine(parseMarkup('*: Ta-daa!<ME_008><PAGE>*: And off.<SE_014>'))
    expect(line.pages.map((p) => p.text)).toEqual(['Ta-daa!', 'And off.'])
    expect(line.unhandled).toEqual([])
    // **The id is the game's request id, not the tag's number.** `<ME_n>`
    // compiles to 0xFF34 + n and the interpreter asks for `code - 0xFF03`, so
    // 8 becomes 57; `<SE_n>` compiles to a flat 0xFF4B, which the interpreter
    // answers with a flat 14 whatever the tag said. See `SoundCue`.
    expect(line.cues).toEqual([
      { kind: 'ME', id: 57, page: 0 },
      { kind: 'SE', id: 14, page: 1 },
    ])
  })

  it('centres a narration card, and stops when told to', () => {
    // `<CEN>` writes 1 to the window's byte at +0x9b8 and nothing writes it
    // back, so it holds for the rest of the message.
    const card = renderLine('<CEN>Some days later<,> the rains came.<PAGE>*: Morning!')
    expect(card.pages.map((p) => p.centred)).toEqual([true, true])
    const off = renderLine('<CEN_ON>Later.<PAGE><CEN_OFF>*: Morning!')
    expect(off.pages.map((p) => p.centred)).toEqual([true, false])
  })

  it('splits pages, and keeps line breaks within a page', () => {
    expect(renderLine('*: One.\\nStill one.<PAGE>*: Two.').pages).toEqual([
      { speaker: undefined, text: 'One.\nStill one.', centred: false },
      { speaker: undefined, text: 'Two.', centred: false },
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

  /** Read texts out to the end, answering each prompt with the next of `answers` — 0 the first. */
  const readOut = (texts: (string | undefined)[], answers: number[] = []) => {
    const queue = [...answers]
    let at = startConversation(who, 'chapter B0', texts)
    const seen: string[] = []
    for (let guard = 0; at && guard < 50; guard++) {
      seen.push(at.run.pages[at.page]?.text ?? '')
      const prompt = promptOf(at)
      if (prompt) {
        const pick = queue.shift() ?? 0
        seen.push(`[${prompt.answers[pick]?.label}]`)
        at = moveChoice(at, pick)
      }
      at = nextPage(at)
    }
    return seen
  }

  it('goes page by page, skips a text with nothing in it, and ends', () => {
    expect(readOut(['*: First.<PAGE>*: Second.', undefined, '*: Third.'])).toEqual([
      'First.',
      'Second.',
      'Third.',
    ])
  })

  it('does not start with someone who has nothing to say', () => {
    expect(startConversation(who, 'chapter B0', [undefined])).toBeUndefined()
  })

  it('asks yes or no, and says the branch for the answer', () => {
    const text = '*: Coming along?<YESNO><YES>*: Good.<END><NO>*: A pity.<END>'
    expect(readOut([text], [0])).toEqual(['Coming along?', '[Yes]', 'Good.'])
    expect(readOut([text], [1])).toEqual(['Coming along?', '[No]', 'A pity.'])
  })

  it('keeps which answer was given, for what goes on after the talk', () => {
    const text = '*: Coming along?<YESNO><YES>*: Good.<END><NO>*: A pity.<END>'
    let at = startConversation(who, 'chapter B0', [text])
    expect(at?.answered).toBeUndefined()
    if (!at) throw new Error('no conversation')
    at = nextPage(moveChoice(at, 1))
    expect(at?.answered).toBe(1)
  })

  it('offers to accept or decline, with the branches in either order', () => {
    const text = '*: Will you take it on?<UKEYAME><YAME>*: Another time.<END><UKE>*: Thanks!<CLOSE>'
    expect(readOut([text], [0])).toEqual(['Will you take it on?', '[Accept]', 'Thanks!'])
    expect(readOut([text], [1])).toEqual(['Will you take it on?', '[Decline]', 'Another time.'])
  })

  it('asks again when a branch jumps back', () => {
    const text = '<LB_A>*: Sure?<YESNO><NO><JP_A><YES>*: Right.<END>'
    expect(readOut([text], [1, 0])).toEqual(['Sure?', '[No]', 'Sure?', '[Yes]', 'Right.'])
  })

  it('asks a prompt inside a branch, and stops a branch at the next one', () => {
    const nested =
      '*: A?<YESNO><NO>*: Not A.<END><YES>*: B?<UKEYAME><YAME>*: Not B.<END><UKE>*: B!<CLOSE>'
    expect(readOut([nested], [0, 0])).toEqual(['A?', '[Yes]', 'B?', '[Accept]', 'B!'])
    expect(readOut(['*: Q?<YESNO><YES>*: y.<NO>*: n.'], [0])).toEqual(['Q?', '[Yes]', 'y.'])
  })

  it('moves on, and says why, when the line has no branch for the answer', () => {
    let at = startConversation(who, 'chapter B0', ['*: Ready?<YESNO><END>', '*: Off we go.'])
    at = at && nextPage(at)
    expect(at?.run.pages[0]?.text).toBe('Off we go.')
    expect(at?.aside).toContain('no branch')
  })

  it('chooses round and round', () => {
    const at = startConversation(who, 'chapter B0', ['*: Q?<YESNO>'])
    expect(at && moveChoice(at, -1).choice).toBe(1)
    expect(at && moveChoice(at, 2).choice).toBe(0)
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

  it("runs every prompt in the village's talk to an end, whichever way it is answered", () => {
    const village = load(rom, { map: 'M01' })
    let prompts = 0
    let branches = 0
    /** Every path through a line from one point, answering every prompt both ways. */
    const explore = (tokens: ReturnType<typeof parseMarkup>, from: number, depth: number) => {
      expect(depth, 'prompts nested deeper than the cartridge has them').toBeLessThan(6)
      const run = runLine(tokens, from)
      if (!run.prompt) return
      prompts++
      for (const answer of run.prompt.answers) {
        const next = branchOf(tokens, run.prompt, answer)
        if (next === undefined) continue
        branches++
        // A jump back asks the same prompt again; that path is already walked.
        const again = runLine(tokens, next).prompt
        if (again && again.at <= run.prompt.at) continue
        explore(tokens, next, depth + 1)
      }
    }
    for (const letter of village.letters) {
      for (const member of [...village.cast.members, ...village.cast.sprites2d]) {
        for (const line of village.linesOf(member.placement.id, letter)) {
          explore(parseMarkup(line.text ?? ''), 0, 0)
        }
      }
    }
    expect(prompts).toBeGreaterThan(10)
    expect(branches).toBeGreaterThan(10)
  })
})
