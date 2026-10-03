import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { load } from '../src/load.ts'
import { fyggsFound, STORY_START, storySoFarAfter, wrapPage } from '../src/story-so-far.ts'

describe('the Story So Far', () => {
  it('starts at 1 and takes the last 197 a record carries, forwards or back', () => {
    expect(STORY_START).toBe(1)
    expect(storySoFarAfter(undefined, 6)).toBe(6)
    expect(storySoFarAfter([{ op: 104, arg: 4 }], 6)).toBe(6)
    // The Hexagoon lost: `12:2 104:4 197:10`.
    expect(
      storySoFarAfter(
        [
          { op: 104, arg: 4 },
          { op: 197, arg: 10 },
        ],
        9,
      ),
    ).toBe(10)
    // No forward-only rule, unlike `132`.
    expect(storySoFarAfter([{ op: 197, arg: 3 }], 12)).toBe(3)
    // A `197:0` is a talk label, never this action.
    expect(storySoFarAfter([{ op: 197, arg: 0 }], 12)).toBe(12)
  })

  it('counts the fyggs as game-wide flags 4 to 10', () => {
    expect(fyggsFound(new Set())).toBe(0)
    expect(fyggsFound(new Set([3, 4, 10, 11, 900]))).toBe(2)
  })

  it('breaks the page at its own breaks and between words', () => {
    const width = (words: string) => words.length * 6
    expect(wrapPage('one two three four', width, 6 * 9)).toEqual(['one two', 'three', 'four'])
    expect(wrapPage('first\nsecond line', width, 600)).toEqual(['first', 'second line'])
  })
})

const romPath = process.env.MINSTREL_TEST_ROM
describe.skipIf(!romPath)('the Story So Far, on the cartridge', () => {
  it('reads its pages, and the Hexagoon’s two are the lost and the won', () => {
    const rom = new Uint8Array(readFileSync(romPath as string))
    const words = load(rom, { map: 'M01' }).storySoFarWords
    expect(words.size).toBeGreaterThan(140)
    expect(words.get(10)).toMatch(/defeated/)
    expect(words.get(11)).toMatch(/After defeating/)
    expect(words.get(35)).toMatch(/^Returning to Coffinwell/)
  }, 60_000)
})
