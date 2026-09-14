import { describe, expect, it } from 'vitest'
import {
  eventOutcome,
  flagsHold,
  KIND_EVENT,
  OP_IF_FLAG,
  OP_UNLESS_FLAG,
  triggerWords,
} from '../src/story.ts'
import type { Trigger } from '../src/triggers.ts'

/** A trigger record built in code: a map, its kind, and its words as operation and argument. */
function trigger(map: number, kind: number, words: [number, number][], floats = 0): Trigger {
  const values = Uint32Array.from([
    ...words.map(([op, arg]) => ((op << 16) | arg) >>> 0),
    ...Array(floats).fill(0x3f800000),
  ])
  const kinds = new Uint8Array(values.length)
  kinds.fill(1, 0, words.length)
  kinds.fill(2, words.length)
  return {
    map,
    from: { major: 2, minor: 1 },
    to: { major: 2, minor: 1 },
    unknown_5: kind,
    values,
    floats: new Float32Array(values.length),
    kinds,
    offset: 0x40,
  }
}

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
})
