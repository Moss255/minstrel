import { describe, expect, it } from 'vitest'
import {
  type Draws,
  FOUNTAIN_FIRST,
  FOUNTAIN_SECOND,
  fountainItem,
  isLying,
  lyingCount,
  MINUTE_TICKS,
  NO_VARIANT,
  newGathering,
  pickUp,
  type SpotSetup,
  startPlay,
  tick,
  timingOf,
  WORD,
  withField,
  wordField,
} from '../src/gathering.ts'

/** Draws the test chooses, each taken modulo what is asked — as `rand() % n`. */
function scripted(...values: number[]): Draws & { asked: number[] } {
  const asked: number[] = []
  return {
    asked,
    below(n: number) {
      asked.push(n)
      return (values.shift() ?? 0) % n
    },
  }
}

// Every number here is made up; only the rules are the game's.
const own: SpotSetup = { id: 3, when: 1, timing: 8, own: { minutes: 30, fewest: 1, most: 4 } }
const biased: SpotSetup = {
  id: 7,
  when: 1,
  timing: 2,
  own: { minutes: 0, fewest: 0, most: 0 },
}
const late: SpotSetup = { id: 9, when: 3, timing: 8, own: { minutes: 60, fewest: 2, most: 3 } }
const bias = new Map([
  [
    2,
    Array.from({ length: 8 }, (_, v) => ({ minutes: 60 * (v + 1), fewest: 1, most: 3 + (v % 2) })),
  ],
])

/** Run the field until spot `id` has had its next turn. */
function untilTurn(
  state: ReturnType<typeof newGathering>,
  id: number,
  draws: Draws,
  flags = new Set<number>(),
) {
  for (let i = 0; i < MINUTE_TICKS * 2; i++) {
    const was = state.cursor
    tick(state, flags, draws)
    if (was === id && state.cursor !== was) return
  }
  throw new Error(`spot ${id} never had a turn`)
}

describe('gathering spots, as func_0208ea10 and func_0208ec78 keep them', () => {
  it("packs a spot's word as the game does", () => {
    let word = withField(0, WORD.setUp, 1)
    word = withField(word, WORD.every, 12)
    word = withField(word, WORD.lying, 0b101)
    expect(word >>> 0).toBe((0x80000000 | (12 << 25) | (0b101 << 17)) >>> 0)
    expect(wordField(word, WORD.every)).toBe(12)
    expect(lyingCount(word)).toBe(2)
    expect(isLying(word, 2)).toBe(true)
    expect(isLying(word, 1)).toBe(false)
  })

  it("takes a spot's timing from its own values, or its fldbias row at the game's variant", () => {
    expect(timingOf(own, bias, 5)).toEqual(own.own)
    expect(timingOf(biased, bias, 5)).toEqual({ minutes: 360, fewest: 1, most: 4 })
  })

  it('draws a variant at the first start, and sets every spot up empty, its refill due', () => {
    const state = newGathering()
    expect(state.variant).toBe(NO_VARIANT)
    const draws = scripted(13)
    startPlay(state, [own, biased], bias, draws)
    expect(draws.asked).toEqual([8])
    expect(state.variant).toBe(5)
    const word = state.words[7] as number
    expect(wordField(word, WORD.setUp)).toBe(1)
    expect(wordField(word, WORD.most)).toBe(4)
    expect(wordField(word, WORD.every)).toBe(12)
    expect(wordField(word, WORD.minutesLeft)).toBe(0)
    expect(wordField(word, WORD.lying)).toBe(0)
    // The Fountain's two: most 1, fewest 1, every 60 minutes, there always.
    for (const id of [FOUNTAIN_FIRST, FOUNTAIN_SECOND]) {
      const f = state.words[id] as number
      expect([f >>> 31, wordField(f, WORD.most), wordField(f, WORD.fewest)]).toEqual([1, 1, 1])
      expect([wordField(f, WORD.every), wordField(f, WORD.when)]).toEqual([2, 1])
    }
    // A spot no file names is not set up.
    expect(state.words[4]).toBe(0)
  })

  it('refills an empty spot with at least its fewest, at free places from a drawn one on', () => {
    const state = newGathering()
    startPlay(state, [own], bias, scripted(0))
    // rand() % 5 gives 0, raised to the fewest, 1; the place drawn is 2.
    const draws = scripted(0, 2)
    untilTurn(state, 3, draws)
    const word = state.words[3] as number
    expect(draws.asked).toEqual([5, 4])
    expect(wordField(word, WORD.lying)).toBe(0b0100)
    // Its minutes start again, and a minute comes off as it is not full.
    expect(wordField(word, WORD.minutesLeft)).toBe(29)
  })

  it('wraps round the places, skipping those already taken', () => {
    const state = newGathering()
    startPlay(state, [own], bias, scripted(0))
    const draws = scripted(3, 3)
    untilTurn(state, 3, draws)
    expect(wordField(state.words[3] as number, WORD.lying)).toBe(0b1011)
  })

  it("adds up to what is missing to a part-full spot, and a full one's minutes wait", () => {
    const state = newGathering()
    startPlay(state, [own], bias, scripted(0))
    state.words[3] = withField(state.words[3] as number, WORD.lying, 0b0001)
    const draws = scripted(3, 0)
    untilTurn(state, 3, draws)
    // 4 − 1 + 1 = 4 asked: 3 added, and the spot is full.
    expect(draws.asked).toEqual([4, 4])
    const word = state.words[3] as number
    expect(wordField(word, WORD.lying)).toBe(0b1111)
    expect(wordField(word, WORD.minutesLeft)).toBe(30)
    untilTurn(state, 3, scripted())
    expect(wordField(state.words[3] as number, WORD.minutesLeft)).toBe(30)
  })

  it('takes a minute off at each sweep, and sweeps once a minute, one spot a tick', () => {
    const state = newGathering()
    startPlay(state, [own], bias, scripted(0))
    untilTurn(state, 3, scripted(0, 0))
    expect(wordField(state.words[3] as number, WORD.minutesLeft)).toBe(29)
    // The sweep finishes, then waits out the minute — counted from the sweep's start.
    for (let i = 0; i < 96; i++) tick(state, new Set(), scripted())
    expect(state.cursor).toBe(0)
    for (let i = 0; i < MINUTE_TICKS - 100; i++) tick(state, new Set(), scripted())
    expect(state.cursor).toBe(0)
    tick(state, new Set(), scripted())
    expect(state.cursor).toBe(1)
    untilTurn(state, 3, scripted())
    expect(wordField(state.words[3] as number, WORD.minutesLeft)).toBe(28)
  })

  it('passes over a spot until the flag its value 2 asks for is set', () => {
    const state = newGathering()
    startPlay(state, [late], bias, scripted(0))
    untilTurn(state, 9, scripted(2, 0))
    expect(lyingCount(state.words[9] as number)).toBe(0)
    untilTurn(state, 9, scripted(2, 0), new Set([0x796]))
    expect(lyingCount(state.words[9] as number)).toBe(2)
  })

  it('empties a picked place and starts its minutes again', () => {
    const state = newGathering()
    startPlay(state, [own], bias, scripted(0))
    state.words[3] = withField(
      withField(state.words[3] as number, WORD.lying, 0b11),
      WORD.minutesLeft,
      4,
    )
    expect(pickUp(state, 3, 2)).toBe(false)
    expect(pickUp(state, 3, 1)).toBe(true)
    expect(wordField(state.words[3] as number, WORD.lying)).toBe(0b01)
    expect(wordField(state.words[3] as number, WORD.minutesLeft)).toBe(30)
  })

  it('at a later start, empties what lies and puts its refill a tenth of its minutes off', () => {
    const state = newGathering()
    startPlay(state, [own, late], bias, scripted(0))
    state.words[3] = withField(state.words[3] as number, WORD.lying, 0b11)
    const draws = scripted()
    startPlay(state, [own, late], bias, draws)
    expect(draws.asked).toEqual([])
    expect(wordField(state.words[3] as number, WORD.lying)).toBe(0)
    expect(wordField(state.words[3] as number, WORD.minutesLeft)).toBe(3)
    // An empty spot keeps its minutes.
    expect(wordField(state.words[9] as number, WORD.minutesLeft)).toBe(0)
  })

  it("fills the Fountain by the guests canvassed: 4 with none, at spot 98's turn", () => {
    const state = newGathering()
    startPlay(state, [], bias, scripted(0))
    untilTurn(state, FOUNTAIN_SECOND, scripted(0, 0, 0, 0))
    expect(wordField(state.words[FOUNTAIN_FIRST] as number, WORD.lying)).toBe(0b1111)
    expect(wordField(state.words[FOUNTAIN_SECOND] as number, WORD.lying)).toBe(0)
  })

  it("gives one of the Fountain row's first eight, or all sixteen from story 19", () => {
    const row = Array.from({ length: 16 }, (_, i) => 100 + i)
    expect(fountainItem(row, 18, scripted(11))).toBe(103)
    expect(fountainItem(row, 19, scripted(11))).toBe(111)
  })
})
