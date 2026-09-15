import { describe, expect, it } from 'vitest'
import {
  afterBattle,
  entryEvent,
  eventOutcome,
  flagsHold,
  KIND_ENTRY,
  KIND_EVENT,
  KIND_LOST,
  KIND_WON,
  marksSet,
  OP_IF_FLAG,
  OP_UNLESS_FLAG,
  triggerWords,
} from '../src/story.ts'
import type { Trigger, TriggerStage } from '../src/triggers.ts'

/** A trigger record built in code: a map, its kind, its words as operation and argument, and its span. */
function trigger(
  map: number,
  kind: number,
  words: [number, number][],
  floats = 0,
  span: [TriggerStage, TriggerStage] = [
    { major: 2, minor: 1 },
    { major: 2, minor: 1 },
  ],
): Trigger {
  const values = Uint32Array.from([
    ...words.map(([op, arg]) => ((op << 16) | arg) >>> 0),
    ...Array(floats).fill(0x3f800000),
  ])
  const kinds = new Uint8Array(values.length)
  kinds.fill(1, 0, words.length)
  kinds.fill(2, words.length)
  return {
    map,
    from: span[0],
    to: span[1],
    unknown_5: kind,
    values,
    floats: new Float32Array(values.length),
    kinds,
    offset: 0x40,
  }
}

describe('what entering a map plays', () => {
  const at22: TriggerStage = { major: 2, minor: 2 }
  const only22: [TriggerStage, TriggerStage] = [at22, at22]
  // The pass's own: on entering it at 2.2, while flag 2 is not set, play 2300.
  const pass = trigger(
    5101,
    KIND_ENTRY,
    [
      [9, 5101],
      [5, 2],
      [203, 1],
      [119, 2300],
    ],
    0,
    only22,
  )

  it('plays the event a map’s entry record names, over its stage, while its flags hold', () => {
    expect(entryEvent([pass], 5101, at22, new Set())).toBe(2300)
    // Its event sets flag 2, so it plays once.
    expect(entryEvent([pass], 5101, at22, new Set([2]))).toBeUndefined()
    expect(entryEvent([pass], 5101, { major: 2, minor: 1 }, new Set())).toBeUndefined()
    expect(entryEvent([pass], 1100, at22, new Set())).toBeUndefined()
  })

  it('is not a character’s record, and plays nothing when its record names no event', () => {
    const character = trigger(
      5101,
      0,
      [
        [9, 5101],
        [119, 2300],
      ],
      0,
      only22,
    )
    expect(entryEvent([character], 5101, at22, new Set())).toBeUndefined()
    const quiet = trigger(
      1107,
      KIND_ENTRY,
      [
        [9, 1107],
        [4, 5],
        [118, 98],
        [196, 0],
      ],
      0,
      only22,
    )
    expect(entryEvent([quiet], 1107, at22, new Set([5]))).toBeUndefined()
  })
})

describe('the story in trigger records', () => {
  it('reads a record’s words, leaving out its floats', () => {
    const record = trigger(
      1110,
      KIND_EVENT,
      [
        [8, 2130],
        [132, 0],
      ],
      2,
    )
    expect(triggerWords(record)).toEqual([
      { op: 8, arg: 2130 },
      { op: 132, arg: 0 },
    ])
  })

  it('reads the point an event moves the story to, and the flags it sets', () => {
    const morning = trigger(1110, KIND_EVENT, [
      [8, 2130],
      [132, 0],
      [0, 2],
      [0, 2],
      [0, 1],
      [197, 6],
    ])
    expect(eventOutcome([morning], 2130)).toEqual({
      stage: { major: 2, minor: 2, step: 1 },
      flags: [],
      onward: undefined,
    })
    const outside = trigger(1100, KIND_EVENT, [
      [8, 2210],
      [104, 0],
      [132, 0],
      [0, 2],
      [0, 2],
      [0, 2],
      [141, 1],
    ])
    expect(eventOutcome([morning, outside], 2210)).toMatchObject({
      stage: { major: 2, minor: 2, step: 2 },
      flags: [0],
    })
  })

  it('goes on to the map and event an event’s record names', () => {
    const greeting = trigger(1107, KIND_EVENT, [
      [8, 2200],
      [133, 1100],
      [2210, 0],
    ])
    expect(eventOutcome([greeting], 2200)).toEqual({
      stage: undefined,
      flags: [],
      onward: { map: 1100, event: 2210 },
    })
  })

  it('takes the event’s record in the map asked for, and knows nothing of an event with none', () => {
    const here = trigger(1107, KIND_EVENT, [
      [8, 2360],
      [104, 5],
    ])
    const there = trigger(1100, KIND_EVENT, [
      [8, 2360],
      [104, 6],
    ])
    expect(eventOutcome([there, here], 2360, 1107)?.flags).toEqual([5])
    expect(eventOutcome([there, here], 2360)?.flags).toEqual([6])
    expect(eventOutcome([here], 9999)).toBeUndefined()
    // A character's record that names the event is not the event's own.
    expect(
      eventOutcome(
        [
          trigger(1107, 0, [
            [6, 7],
            [119, 2200],
          ]),
        ],
        2200,
      ),
    ).toBeUndefined()
  })

  it('does not read a stage from a 132 without its three values', () => {
    const short = trigger(1100, KIND_EVENT, [
      [8, 1],
      [132, 0],
      [0, 2],
      [197, 6],
    ])
    expect(eventOutcome([short], 1)?.stage).toBeUndefined()
  })

  it('holds a record’s flag conditions against the flags set', () => {
    const before = [{ op: OP_UNLESS_FLAG, arg: 0 }]
    const after = [
      { op: OP_IF_FLAG, arg: 0 },
      { op: OP_UNLESS_FLAG, arg: 1 },
    ]
    expect(flagsHold(before, new Set())).toBe(true)
    expect(flagsHold(before, new Set([0]))).toBe(false)
    expect(flagsHold(after, new Set([0]))).toBe(true)
    expect(flagsHold(after, new Set([0, 1]))).toBe(false)
    expect(flagsHold([{ op: 6, arg: 8 }], new Set())).toBe(true)
  })

  it('holds a record to the story’s step only when a step is given', () => {
    const atFour = [{ op: 35, arg: 4 }]
    expect(flagsHold(atFour, new Set(), undefined, 4)).toBe(true)
    expect(flagsHold(atFour, new Set(), undefined, 5)).toBe(false)
    expect(flagsHold(atFour, new Set())).toBe(true)
  })

  it('reads the set battle an event starts, and what winning or losing it plays', () => {
    const talk = trigger(7105, KIND_EVENT, [
      [8, 22510],
      [120, 2],
    ])
    expect(eventOutcome([talk], 22510)?.battle).toBe(2)
    expect(eventOutcome([talk], 22510)?.stage).toBeUndefined()
    const won = trigger(7105, KIND_WON, [
      [12, 2],
      [119, 2550],
    ])
    const lost = trigger(7105, KIND_LOST, [
      [12, 2],
      [104, 4],
      [197, 10],
    ])
    const records = [talk, won, lost]
    expect(afterBattle(records, 2, true, 7105)).toEqual({ event: 2550, flags: [] })
    expect(afterBattle(records, 2, false, 7105)).toEqual({ event: undefined, flags: [4] })
    expect(afterBattle(records, 3, true, 7105)).toBeUndefined()
    expect(afterBattle(records, 2, true, 7101)).toBeUndefined()
  })

  it('holds the second set’s conditions, the marks, only when they are given', () => {
    const firstTime = [
      { op: 3, arg: 7 },
      { op: 102, arg: 7 },
    ]
    const after = [{ op: 2, arg: 7 }]
    expect(flagsHold(firstTime, new Set(), new Set())).toBe(true)
    expect(flagsHold(firstTime, new Set(), new Set([7]))).toBe(false)
    expect(flagsHold(after, new Set(), new Set())).toBe(false)
    expect(flagsHold(after, new Set(), new Set([7]))).toBe(true)
    // Without the marks, as before: not read.
    expect(flagsHold(after, new Set())).toBe(true)
    expect(marksSet(firstTime)).toEqual([7])
  })
})
