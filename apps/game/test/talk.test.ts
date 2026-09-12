import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { load } from '../src/load.ts'
import {
  DEFAULT_CONTEXT,
  letterForStage,
  nextPage,
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
  const lines = [
    { tag: 1, unknown_numbers: [1, 1, 16], text: '*: First.<PAGE>*: Second.' },
    { tag: 1, unknown_numbers: [2, 2, 16], text: undefined },
    { tag: 1, unknown_numbers: [3, 3, 16], text: '*: Third.' },
  ]

  it('goes page by page, skips a line with nothing in it, and ends', () => {
    let at = startConversation(who, 'B0', lines)
    const seen: string[] = []
    while (at) {
      seen.push(at.rendered.pages[at.page]?.text ?? '')
      at = nextPage(at)
    }
    expect(seen).toEqual(['First.', 'Second.', 'Third.'])
  })

  it('does not start with someone who has nothing to say', () => {
    expect(startConversation(who, 'B0', [lines[1] as (typeof lines)[number]])).toBeUndefined()
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
})
