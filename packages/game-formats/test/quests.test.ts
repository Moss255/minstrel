import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { readQuestGivers, readQuestIds, readQuestTexts } from '../src/quests.ts'
import { conditionsOfWords, flagsHold, questHolds } from '../src/story.ts'
import { build, type Value } from './table-builder.ts'

const n = (value: number): Value => ({ n: value })
const s = (value: string): Value => ({ s: value })
/** A trigger word, `op : arg`, as the files hold it. */
const word = (op: number, arg: number) => ((op << 16) | arg) >>> 0

describe('the quests’ files', () => {
  it('reads a giver: the quest, where, who, when, the prerequisite, the bits and the conditions', () => {
    const data = build([
      // Quest 0's placeholder, six values: left out.
      { tag: 0x66, values: [0, 1, 201, 1, 1, 1].map(n) },
      { tag: 0x66, values: [3, 109, 10, 3, 1, 1, -1, 0, 0, 1, 0].map(n) },
      {
        tag: 0x66,
        values: [175, 50101, 98, 19, 3, 0, 174, 1, 1, 0, 1, word(27, 1127), word(0, 15)].map(n),
      },
    ])
    const [ricki, patty, ...rest] = readQuestGivers(data)
    expect(rest).toEqual([])
    expect(ricki).toEqual({
      quest: 3,
      map: 109,
      character: 10,
      major: 3,
      minor: 1,
      unknown_9: true,
      after: undefined,
      unknown_11: false,
      downloaded: false,
      unknown_12: true,
      unknown_13: false,
      conditions: [],
    })
    expect(patty?.after).toBe(174)
    expect(patty?.downloaded).toBe(true)
    expect(patty?.unknown_11).toBe(true)
    // Its conditions read as a record's: flag 1127 clear, game-wide 15 set.
    const conditions = conditionsOfWords(patty?.conditions ?? [])
    expect(conditions.map((c) => [c.op, c.arg])).toEqual([
      [27, 1127],
      [0, 15],
    ])
    expect(flagsHold(conditions, new Set(), undefined, undefined, { globals: new Set([15]) })).toBe(
      true,
    )
    expect(flagsHold(conditions, new Set(), undefined, undefined, { globals: new Set() })).toBe(
      false,
    )
  })

  it('refuses a file with no givers in it', () => {
    expect(() => readQuestGivers(build([{ tag: 0x67, values: [n(1)] }]))).toThrow(GameFormatError)
  })

  it('pairs each quest with its number in questmsg, and reads the texts by it', () => {
    const ids = readQuestIds(
      build([
        { tag: 0x68, values: [n(3), n(2)] },
        { tag: 0x68, values: [n(4), n(3)] },
      ]),
    )
    expect([...ids]).toEqual([
      [3, 2],
      [4, 3],
    ])
    const texts = readQuestTexts(
      build([
        {
          tag: 0x67,
          values: [n(2), s('Pleased as Punch'), s('Ricki wants egging on.'), n(-1), s('Cleared.')],
        },
      ]),
    )
    expect(texts.get(2)).toEqual({
      number: 2,
      name: 'Pleased as Punch',
      texts: ['Ricki wants egging on.', undefined, 'Cleared.'],
    })
  })
})

describe('the quest conditions', () => {
  it('tests a quest by the composites’ modes', () => {
    // −1 and 5 at 0, 0 at 2, 1 its first flag, 2 at 3, 3 at 1, any other never.
    expect([-1, 0, 1, 2, 3, 4, 5].map((mode) => questHolds(0, mode))).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      true,
    ])
    expect([-1, 0, 1, 2, 3].map((mode) => questHolds(2, mode))).toEqual([
      false,
      true,
      false,
      false,
      false,
    ])
    expect([-1, 0, 1, 2, 3].map((mode) => questHolds(3 | 4, mode))).toEqual([
      false,
      false,
      true,
      true,
      false,
    ])
    expect(questHolds(1, 3)).toBe(true)
  })

  it('holds 20, 21 and 22 on a quest taken, flagged and cleared, and a composite by its test', () => {
    const quests = new Map([
      [3, 2],
      [4, 3 | 4],
    ])
    const quest = (q: number) => quests.get(q) ?? 0
    const holds = (op: number, arg: number) =>
      flagsHold([{ op, arg }], new Set(), undefined, undefined, { quest })
    expect([holds(20, 3), holds(20, 4), holds(21, 4), holds(22, 4), holds(22, 3)]).toEqual([
      true,
      false,
      true,
      true,
      false,
    ])
    // `55:10` with quest 3 in its high half and mode 0, taken: holds; mode 2, cleared: not.
    const composite = (mode: number) => ({
      op: 55,
      arg: 10,
      params: [((3 << 16) | (mode & 0xffff)) >>> 0],
    })
    expect(flagsHold([composite(0)], new Set(), undefined, undefined, { quest })).toBe(true)
    expect(flagsHold([composite(2)], new Set(), undefined, undefined, { quest })).toBe(false)
    // Without quests given, they hold, as before quests were kept.
    expect(flagsHold([composite(2)], new Set())).toBe(true)
  })
})
