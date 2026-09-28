import { describe, expect, it } from 'vitest'
import {
  afterBattle,
  areaEvent,
  areasOf,
  conditionsOf,
  entryEvent,
  entryPlay,
  eventOutcome,
  FACILITY_MEDALS,
  facilityFor,
  flagsHold,
  holds,
  inArea,
  KIND_AREA_EVENT,
  KIND_ENTRY,
  KIND_EVENT,
  KIND_LOST,
  KIND_SETTINGS,
  KIND_WATCH,
  KIND_WON,
  marksSet,
  OP_IF_FLAG,
  OP_UNLESS_FLAG,
  outcomeOf,
  triggerWords,
  watchPlay,
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

/** A record built in code with words and floats interleaved, as area words are followed by theirs. */
function mixed(
  map: number,
  kind: number,
  entries: ([number, number] | number)[],
  span: [TriggerStage, TriggerStage],
): Trigger {
  const values = new Uint32Array(entries.length)
  const floats = new Float32Array(entries.length)
  const kinds = new Uint8Array(entries.length)
  entries.forEach((entry, i) => {
    if (typeof entry === 'number') {
      floats[i] = entry
      values[i] = new Uint32Array(Float32Array.of(entry).buffer)[0] as number
      kinds[i] = 2
    } else {
      values[i] = ((entry[0] << 16) | entry[1]) >>> 0
      kinds[i] = 1
    }
  })
  return { map, from: span[0], to: span[1], unknown_5: kind, values, floats, kinds, offset: 0x40 }
}

describe('areas, and what walking into one plays', () => {
  const at21: TriggerStage = { major: 2, minor: 1 }
  // The mayor's house at 2.1: area 15, and his scene on walking into it.
  const settings = mixed(
    1105,
    KIND_SETTINGS,
    [[9, 1105], [143, 15], 2.65, 2.04, 5.26, 1.35, -1.65, -5.93, [0, 0]],
    [at21, at21],
  )
  const mayor = trigger(
    1105,
    KIND_AREA_EVENT,
    [
      [7, 15],
      [5, 1],
      [119, 2120],
    ],
    0,
    [at21, at21],
  )

  it('reads an area as a box, its greater corner and then its lesser', () => {
    const [area] = areasOf([settings], 1105, at21)
    expect(area).toMatchObject({ id: 15, angle: 0 })
    expect(area?.max.x).toBeCloseTo(2.65, 5)
    expect(area?.min.z).toBeCloseTo(-5.93, 5)
    expect(areasOf([settings], 1105, { major: 2, minor: 2 })).toEqual([])
    if (!area) throw new Error('no area')
    expect(inArea(area, 2, 0, 0)).toBe(true)
    expect(inArea(area, 3, 0, 0)).toBe(false)
    expect(inArea(area, 2, 2.5, 0)).toBe(false)
    // A point, the Hero's feet: below the box is outside it.
    expect(inArea(area, 2, -2.5, 0)).toBe(false)
  })

  it('turns an area by the degrees after its box, and refuses by the game’s own reach', () => {
    // A box four wide across x, one deep along z and two high, turned 90°.
    const turned = trigger(
      1105,
      KIND_SETTINGS,
      [
        [143, 3],
        [0, 90],
      ],
      6,
      [at21, at21],
    )
    const floats = [2, 1, 0.5, -2, -1, -0.5]
    turned.values.set(
      floats.map((f) => new Uint32Array(new Float32Array([f]).buffer)[0] as number),
      1,
    )
    turned.floats.set(floats, 1)
    turned.kinds.set([1, 2, 2, 2, 2, 2, 2, 1])
    turned.values[7] = 90
    const [area] = areasOf([turned], 1105, at21)
    if (!area) throw new Error('no area')
    expect(area.id).toBe(3)
    expect(area.angle).toBeCloseTo(Math.PI / 2, 5)
    // Turned a quarter, it is one wide across x and four deep along z…
    expect(inArea(area, 0, 0, 1.8)).toBe(true)
    expect(inArea(area, 1.8, 0, 0)).toBe(false)
    // …but the game refuses before it turns, by the box's width and height:
    // 2² + 1² = 5, so a point √5 across the ground or more is out.
    expect(area.reach).toBeCloseTo(5, 5)
    expect(inArea(area, 0, 0, 1.9)).toBe(true)
    expect(inArea(area, 0.3, 0, 1.99)).toBe(true)
  })

  it('plays the event of an area walked into, while its flags hold', () => {
    const into15 = (area: number) => area === 15
    expect(areaEvent([mayor], 1105, at21, new Set(), undefined, into15)).toMatchObject({
      event: 2120,
      flags: [],
    })
    expect(areaEvent([mayor], 1105, at21, new Set([1]), undefined, into15)).toBeUndefined()
    expect(areaEvent([mayor], 1105, at21, new Set(), undefined, () => false)).toBeUndefined()
  })
})

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

  it('sets the flags an entry record names as its event plays, so it plays once', () => {
    const at21: TriggerStage = { major: 2, minor: 1 }
    const village = trigger(
      1100,
      KIND_ENTRY,
      [
        [9, 1100],
        [5, 0],
        [119, 22590],
        [104, 0],
      ],
      0,
      [at21, at21],
    )
    expect(entryPlay([village], 1100, at21, new Set())).toMatchObject({ event: 22590, flags: [0] })
    expect(entryPlay([village], 1100, at21, new Set([0]))).toBeUndefined()
    expect(entryPlay([pass], 5101, at22, new Set())).toMatchObject({ event: 2300, flags: [] })
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
    expect(eventOutcome([morning], 2130)).toMatchObject({
      stage: { major: 2, minor: 2, step: 1 },
      flags: [],
      onward: undefined,
      joins: [],
      leaves: false,
      threads: [],
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
    expect(eventOutcome([greeting], 2200)).toMatchObject({
      stage: undefined,
      flags: [],
      onward: { map: 1100, event: 2210 },
      joins: [],
      leaves: false,
      threads: [],
    })
  })

  it('reads the threads an event sets by number, as the Starflight Express’s does at 5.2', () => {
    // `ev25524`'s shape: five `214`s, each with its three values, and a word
    // after that is not a stage.
    const starts = trigger(6401, KIND_EVENT, [
      [8, 25524],
      [214, 0],
      [0, 7],
      [0, 1],
      [0, 1],
      [214, 3],
      [0, 11],
      [0, 1],
      [0, 1],
      [214, 4],
      [0, 12],
      [216, 2],
    ])
    const outcome = eventOutcome([starts], 25524)
    expect(outcome?.stage).toBeUndefined()
    // The last `214` has two values, not three, and moves nothing.
    expect(outcome?.threads).toEqual([
      { thread: 0, stage: { major: 7, minor: 1, step: 1 } },
      { thread: 3, stage: { major: 11, minor: 1, step: 1 } },
    ])
  })

  it('reads who an event brings into the party, and whether it sends them away', () => {
    const call = trigger(1100, KIND_EVENT, [
      [8, 2210],
      [104, 0],
      [205, 1],
    ])
    const home = trigger(1105, KIND_EVENT, [
      [8, 2400],
      [204, 1],
      [133, 1110],
      [2410, 0],
    ])
    expect(eventOutcome([call], 2210)).toMatchObject({ joins: [1], leaves: false })
    expect(eventOutcome([home], 2400)).toMatchObject({
      joins: [],
      leaves: true,
      onward: { map: 1110, event: 2410 },
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
    expect(afterBattle(records, 2, true, 7105)).toMatchObject({ event: 2550, flags: [] })
    expect(afterBattle(records, 2, false, 7105)).toMatchObject({ event: undefined, flags: [4] })
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

describe('a facility a character opens — 145', () => {
  const record = (
    map: number,
    from: [number, number],
    to: [number, number],
    words: [number, number][],
  ) => ({
    map,
    from: { major: from[0], minor: from[1] },
    to: { major: to[0], minor: to[1] },
    unknown_5: 0,
    values: Uint32Array.from(words.map(([op, arg]) => ((op << 16) | arg) >>> 0)),
    floats: new Float32Array(words.length),
    kinds: new Uint8Array(words.length).fill(1),
    offset: 0,
  })
  // Cap'n Max's own record, in his castle.
  const max = record(
    1807,
    [6, 1],
    [19, 9],
    [
      [6, 103],
      [145, 7],
    ],
  )

  it('opens the one the character’s record names, in its map and span', () => {
    expect(facilityFor([max], 1807, 103, { major: 8, minor: 1 })).toBe(FACILITY_MEDALS)
  })

  it('opens nothing for someone else, elsewhere, or outside the span', () => {
    expect(facilityFor([max], 1807, 102, { major: 8, minor: 1 })).toBeUndefined()
    expect(facilityFor([max], 1800, 103, { major: 8, minor: 1 })).toBeUndefined()
    expect(facilityFor([max], 1807, 103, { major: 5, minor: 1 })).toBeUndefined()
  })
})

/**
 * A record as the game's code runs it — see FORMAT.md, "How a record runs":
 * its words split into conditions and actions, each action taking its own
 * values, and every action run.
 */
describe('a record, run as the game runs it', () => {
  const at = (major: number, minor: number) => ({ major, minor })

  it('keeps an action’s own values out of its conditions', () => {
    // `132` takes three values; the `0 : 5` after them is a condition, a
    // game-wide flag.
    const record = trigger(1100, KIND_EVENT, [
      [8, 2130],
      [132, 0],
      [0, 2],
      [0, 2],
      [0, 1],
      [0, 5],
    ])
    expect(conditionsOf(record).map(({ op, arg }) => [op, arg])).toEqual([
      [8, 2130],
      [0, 5],
    ])
    expect(holds(record, { flags: new Set(), more: { globals: new Set([5]) } })).toBe(true)
    expect(holds(record, { flags: new Set(), more: { globals: new Set([2]) } })).toBe(false)
  })

  it('reads the time of day and, played alone, who is playing', () => {
    const night = [{ op: 17, arg: 1 }]
    expect(flagsHold(night, new Set(), undefined, undefined, { night: true })).toBe(true)
    expect(flagsHold(night, new Set(), undefined, undefined, { night: false })).toBe(false)
    expect(flagsHold([{ op: 17, arg: 0 }], new Set(), undefined, undefined, { night: false })).toBe(
      true,
    )
    const players = (arg: number) => flagsHold([{ op: 23, arg }], new Set())
    expect([0, 1, 2, 3].map(players)).toEqual([true, false, true, false])
  })

  it('takes the first of an event’s own records whose conditions hold', () => {
    // The Observatory at 15.3: the second of the two talked to moves on to step 4.
    const first = trigger(4504, KIND_EVENT, [
      [8, 15420],
      [5, 1],
      [5, 0],
      [104, 1],
      [132, 0],
      [0, 15],
      [0, 3],
      [0, 3],
    ])
    const second = trigger(4504, KIND_EVENT, [
      [8, 15420],
      [5, 1],
      [4, 0],
      [104, 1],
      [132, 0],
      [0, 15],
      [0, 3],
      [0, 4],
    ])
    const state = (flags: number[]) => ({ flags: new Set(flags) })
    expect(eventOutcome([first, second], 15420, 4504, state([]))?.stage?.step).toBe(3)
    expect(eventOutcome([first, second], 15420, 4504, state([0]))?.stage?.step).toBe(4)
    expect(eventOutcome([first, second], 15420, 4504, state([1]))).toBeUndefined()
  })

  it('goes on by 138 and 226 as by 133, and moves every thread by 148', () => {
    // Angel Falls at 2.7, on to Stornway's lobby.
    const onToStornway = trigger(100, KIND_EVENT, [
      [8, 2910],
      [138, 50101],
      [22500, 0],
      [104, 2],
    ])
    expect(outcomeOf(onToStornway).onward).toEqual({ map: 50101, event: 22500 })
    expect(outcomeOf(onToStornway).flags).toEqual([2])
    const academy = trigger(2100, KIND_EVENT, [
      [8, 12100],
      [226, 2103],
      [12101, 0],
    ])
    expect(outcomeOf(academy).onward).toEqual({ map: 2103, event: 12101 })
    const together = trigger(6401, KIND_EVENT, [
      [8, 28800],
      [148, 0],
      [0, 13],
      [0, 2],
      [0, 1],
    ])
    expect(outcomeOf(together).all).toEqual({ major: 13, minor: 2, step: 1 })
  })

  it('keeps the actions in the record’s order, with what each clears and sets', () => {
    const record = trigger(8612, KIND_EVENT, [
      [8, 14140],
      [104, 3],
      [132, 0],
      [0, 14],
      [0, 2],
      [0, 1],
      [105, 4],
      [102, 1],
      [103, 2],
      [100, 29],
      [101, 30],
    ])
    const outcome = outcomeOf(record)
    expect(outcome.actions?.map((a) => a.op)).toEqual([104, 132, 105, 102, 103, 100, 101])
    expect(outcome).toMatchObject({
      flags: [3],
      unflags: [4],
      marks: [1],
      unmarks: [2],
      globals: [29],
      unglobals: [30],
    })
  })

  it('runs a map’s watch: the first of its records whose conditions hold', () => {
    // Stornway's lobby at 2.7: flag 3 set, the story goes on to 3.1.
    const lobby = trigger(
      50101,
      KIND_WATCH,
      [
        [9, 50101],
        [23, 2],
        [4, 3],
        [132, 0],
        [0, 3],
        [0, 1],
        [0, 1],
      ],
      0,
      [at(2, 7), at(2, 7)],
    )
    const withFlag = watchPlay([lobby], 50101, at(2, 7), { flags: new Set([3]) })
    expect(withFlag?.stage).toEqual({ major: 3, minor: 1, step: 1 })
    expect(watchPlay([lobby], 50101, at(2, 7), { flags: new Set() })).toBeUndefined()
    expect(watchPlay([lobby], 50101, at(3, 1), { flags: new Set([3]) })).toBeUndefined()
    expect(watchPlay([lobby], 50201, at(2, 7), { flags: new Set([3]) })).toBeUndefined()
  })
})
