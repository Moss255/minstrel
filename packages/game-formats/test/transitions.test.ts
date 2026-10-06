import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { inArea } from '../src/story.ts'
import {
  mapAreas,
  mapBookcases,
  mapDoorways,
  mapLadders,
  mapMoorings,
  mapStart,
  readMapTransitions,
} from '../src/transitions.ts'

/**
 * Fixtures are built here, never taken from a cartridge.
 *
 * A record is a tag, a value count, two bits of type per value, and the values
 * — see `table.ts`. The type bits matter to this parser: they are what says a
 * slot holds a name rather than a number.
 */
interface Field {
  readonly value: number
  /** 0 a string offset, 1 an integer, 2 a float. */
  readonly kind: 0 | 1 | 2
}

const int = (value: number): Field => ({ value, kind: 1 })
const float = (value: number): Field => ({ value, kind: 2 })
const name = (offset: number): Field => ({ value: offset, kind: 0 })

function build(records: { tag: number; fields: Field[] }[], strings: string[]): Uint8Array {
  const body: number[] = []
  const push32 = (v: number) =>
    body.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  for (const record of records) {
    const count = record.fields.length
    const typeBytes = Math.max(1, Math.ceil(count / 4))
    const header = Math.ceil((3 + typeBytes) / 4) * 4
    const bits = new Uint8Array(header - 3)
    record.fields.forEach((f, i) => {
      bits[i >> 2] = (bits[i >> 2] as number) | (f.kind << ((i & 3) * 2))
    })
    body.push(record.tag & 0xff, (record.tag >>> 8) & 0xff, count, ...bits)
    for (const f of record.fields) {
      if (f.kind === 2) {
        const view = new DataView(new ArrayBuffer(4))
        view.setFloat32(0, f.value, true)
        push32(view.getUint32(0, true))
      } else push32(f.value)
    }
  }
  const stringBytes: number[] = []
  for (const s of strings) {
    for (let i = 0; i < s.length; i++) stringBytes.push(s.charCodeAt(i) & 0xff)
    stringBytes.push(0)
  }
  const stringOffset = 16 + body.length
  const out = new Uint8Array(stringOffset + stringBytes.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, 0, true)
  view.setUint32(4, stringOffset, true)
  view.setUint32(8, stringBytes.length, true)
  view.setUint32(12, strings.length, true)
  out.set(body, 16)
  out.set(stringBytes, stringOffset)
  return out
}

/** A `0x72`: trigger, size, angle, a flag, the destination, then the arrival. */
function doorway(
  to: number,
  at: [number, number, number],
  arrive: [number, number, number, number],
) {
  return {
    tag: 0x72,
    fields: [
      float(at[0]),
      float(at[1]),
      float(at[2]),
      float(1),
      float(2),
      float(3),
      float(0.5),
      int(1),
      name(to),
      int(-1),
      int(-1),
      float(arrive[0]),
      float(arrive[1]),
      float(arrive[2]),
      float(arrive[3]),
      ...Array.from({ length: 10 }, () => float(0)),
    ] as Field[],
  }
}

/** A `0x73` trigger and the `0x74` that says where it goes. */
function pair(to: number, at: [number, number, number], arrive: [number, number, number, number]) {
  return [
    {
      tag: 0x73,
      fields: [
        int(2),
        float(at[0]),
        float(at[1]),
        float(at[2]),
        float(4),
        float(5),
        float(6),
        float(0.25),
        float(0),
      ] as Field[],
    },
    {
      tag: 0x74,
      fields: [
        int(0),
        int(0),
        int(0),
        int(0),
        name(to),
        int(-1),
        int(-1),
        float(arrive[0]),
        float(arrive[1]),
        float(arrive[2]),
        float(arrive[3]),
        ...Array.from({ length: 13 }, () => int(0)),
      ] as Field[],
    },
  ]
}

const NAMES = ['M01M01', 'F01']
const AT_M01M01 = 0
const AT_F01 = 7

describe('readMapTransitions', () => {
  it('reads a doorway record', () => {
    const t = readMapTransitions(
      build([doorway(AT_M01M01, [-30.4, -8, 28.4], [-28.4, 3.36, 6.56, 2.3])], NAMES),
    )
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ tag: 0x72, to: 'M01M01' })
  })

  it("gives the doorway and the arrival in the file's own units", () => {
    // Nothing is scaled here: the file counts in the units its map's placements
    // do, and the engine takes both into the world the same way.
    const t = readMapTransitions(
      build([doorway(AT_M01M01, [-30.4, -8, 28.4], [-28.4, 3.36, 6.56, 2.3])], NAMES),
    )
    expect(t[0]?.x).toBeCloseTo(-30.4, 4)
    expect(t[0]?.z).toBeCloseTo(28.4, 4)
    expect(t[0]?.arriveX).toBeCloseTo(-28.4, 4)
    expect(t[0]?.arriveZ).toBeCloseTo(6.56, 4)
  })

  it('leaves both angles alone, because an angle has no scale', () => {
    const t = readMapTransitions(build([doorway(AT_M01M01, [0, 0, 0], [0, 0, 0, 2.3])], NAMES))
    expect(t[0]?.angle).toBeCloseTo(0.5, 5)
    expect(t[0]?.arriveFacing).toBeCloseTo(2.3, 5)
  })

  it('reads a trigger and the action behind it as one doorway', () => {
    const t = readMapTransitions(build(pair(AT_F01, [8, 0, 16], [80, 1.6, -8, 3.14]), NAMES))
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ tag: 0x74, to: 'F01' })
    // The volume comes from the trigger, which leads with an integer.
    expect(t[0]?.x).toBeCloseTo(8, 4)
    expect(t[0]?.arriveX).toBeCloseTo(80, 4)
  })

  it('reads both forms out of one map, in file order', () => {
    const t = readMapTransitions(
      build(
        [doorway(AT_M01M01, [0, 0, 0], [0, 0, 0, 0]), ...pair(AT_F01, [0, 0, 0], [0, 0, 0, 0])],
        NAMES,
      ),
    )
    expect(t.map((x) => x.to)).toEqual(['M01M01', 'F01'])
  })

  it('ignores an action that is not a map change', () => {
    // Most `0x74` do something else. Only the ones naming a map are doorways,
    // and a slot the type bits call an integer is not a name.
    const [trigger, action] = pair(AT_F01, [0, 0, 0], [0, 0, 0, 0])
    const notAName = {
      tag: 0x74,
      fields: (action as { fields: Field[] }).fields.map((f, i) => (i === 4 ? int(99) : f)),
    }
    expect(readMapTransitions(build([trigger as never, notAName], NAMES))).toEqual([])
  })

  it('ignores a trigger with no action after it', () => {
    const [trigger] = pair(AT_F01, [0, 0, 0], [0, 0, 0, 0])
    expect(readMapTransitions(build([trigger as never], NAMES))).toEqual([])
  })

  it('ignores an action too short to hold an arrival', () => {
    const [trigger] = pair(AT_F01, [0, 0, 0], [0, 0, 0, 0])
    const stunted = { tag: 0x74, fields: [int(0), int(0), int(0), int(0), name(AT_F01)] }
    expect(readMapTransitions(build([trigger as never, stunted], NAMES))).toEqual([])
  })

  it('reads nothing from a map with no doorways', () => {
    expect(readMapTransitions(build([{ tag: 0x6c, fields: [int(1), int(2)] }], NAMES))).toEqual([])
  })
})

describe('mapDoorways', () => {
  /** The village's measurement: the two forms of one door stand a unit apart. */
  const APART = 1

  it('keeps a doorway only one form describes', () => {
    const bytes = build([doorway(AT_M01M01, [8, 0, 8], [0, 0, 0, 0])], NAMES)
    expect(mapDoorways(bytes).map((t) => t.to)).toEqual(['M01M01'])
  })

  it('keeps one door when both forms describe it', () => {
    const bytes = build(
      [
        doorway(AT_F01, [8, 0, 8], [16, 0, 16, 0]),
        ...pair(AT_F01, [8 + APART, 0, 8], [24, 0, 24, 1]),
      ],
      NAMES,
    )
    expect(mapDoorways(bytes)).toHaveLength(1)
  })

  it('keeps the arrival of the form that lands you better', () => {
    // Measured, not assumed: the `0x74` arrival stands within half a unit of
    // the door back on 95.3% of the cartridge's, against 80.7% for `0x72`.
    const bytes = build(
      [
        doorway(AT_F01, [8, 0, 8], [16, 0, 16, 0]),
        ...pair(AT_F01, [8 + APART, 0, 8], [24, 0, 24, 1]),
      ],
      NAMES,
    )
    expect(mapDoorways(bytes)[0]).toMatchObject({ tag: 0x74, arriveX: 24, arriveFacing: 1 })
  })

  it('keeps the better arrival whichever order the forms come in', () => {
    const bytes = build(
      [
        ...pair(AT_F01, [8 + APART, 0, 8], [24, 0, 24, 1]),
        doorway(AT_F01, [8, 0, 8], [16, 0, 16, 0]),
      ],
      NAMES,
    )
    expect(mapDoorways(bytes)).toHaveLength(1)
    expect(mapDoorways(bytes)[0]).toMatchObject({ tag: 0x74, arriveX: 24 })
  })

  it('drops a doorway a form repeats within itself', () => {
    const bytes = build(
      [...pair(AT_F01, [8, 0, 8], [24, 0, 24, 1]), ...pair(AT_F01, [8, 0, 8], [24, 0, 24, 1])],
      NAMES,
    )
    expect(mapDoorways(bytes)).toHaveLength(1)
  })

  it('keeps two doors to the same map when they stand apart', () => {
    // A house with a front and a back door, which several maps have: of the
    // cartridge's 196 same-destination pairs, 109 are this rather than a repeat.
    const bytes = build(
      [doorway(AT_F01, [8, 0, 8], [16, 0, 16, 0]), doorway(AT_F01, [80, 0, 8], [16, 0, 16, 0])],
      NAMES,
    )
    expect(mapDoorways(bytes)).toHaveLength(2)
  })

  it('keeps doors that stand together but lead to different maps', () => {
    const bytes = build(
      [doorway(AT_M01M01, [8, 0, 8], [0, 0, 0, 0]), doorway(AT_F01, [8, 0, 8], [0, 0, 0, 0])],
      NAMES,
    )
    expect(mapDoorways(bytes).map((t) => t.to)).toEqual(['M01M01', 'F01'])
  })

  it('leaves the file as it found it', () => {
    const bytes = build([doorway(AT_M01M01, [8, 0, 8], [0, 0, 0, 0])], NAMES)
    const before = bytes.slice()
    mapDoorways(bytes)
    expect(bytes).toEqual(before)
  })
})

describe('a file that is not a map link table', () => {
  const good = build([doorway(AT_M01M01, [8, 0, 8], [0, 0, 0, 0])], NAMES)

  it('refuses a file cut short of its header', () => {
    expect(() => readMapTransitions(good.subarray(0, 12))).toThrow(GameFormatError)
  })

  it('refuses a file whose records are cut off', () => {
    // The names still say where they start; the records no longer reach it.
    expect(() => readMapTransitions(good.subarray(0, 40))).toThrow(GameFormatError)
  })

  it('refuses a file pointing its names past the end', () => {
    const bad = good.slice()
    new DataView(bad.buffer).setUint32(4, 0x100000, true)
    expect(() => readMapTransitions(bad)).toThrow(GameFormatError)
  })

  it('says where the trouble is rather than returning nothing', () => {
    expect(() => readMapTransitions(new Uint8Array(4))).toThrow(/shorter than its header/)
  })
})

describe("a map's own areas", () => {
  /** A `0x73` region: its type, centre, size and angle, and one value past the angle. */
  const region = (
    type: number,
    at: [number, number, number],
    size: [number, number, number],
    angle = 0,
  ) => ({
    tag: 0x73,
    fields: [int(type), ...at.map(float), ...size.map(float), float(angle), float(0)],
  })
  // Stornway's throne room has this shape: two type-3 regions, areas 0 and 1,
  // and a doorway, type 2, that is not an area.
  const table = build(
    [
      region(3, [0, 0.8, -2.1], [3, 2, 1]),
      { tag: 0x74, fields: [int(0)] },
      region(3, [0, 0.8, -0.9], [3, 2, 1]),
      { tag: 0x74, fields: [int(1)] },
      region(2, [0, 0, 7.8], [2, 4, 1]),
      { tag: 0x74, fields: [int(0), int(5), int(10), int(1)] },
      region(3, [10, 0, 0], [4, 2, 1], Math.PI / 2),
      { tag: 0x74, fields: [int(7)] },
    ],
    [],
  )

  it('reads the type-3 regions as areas, numbered by the 0x74 after each', () => {
    const areas = mapAreas(table)
    expect(areas.map((a) => a.id)).toEqual([0, 1, 7])
    const [first] = areas
    expect(first?.max.x).toBeCloseTo(1.5, 5)
    expect(first?.min.z).toBeCloseTo(-2.6, 5)
    expect(first?.angle).toBe(0)
    // The quick refusal is across the ground: half the width and half the depth.
    expect(first?.reach).toBeCloseTo(1.5 ** 2 + 0.5 ** 2, 5)
  })

  it('turns a region by its angle', () => {
    const turned = mapAreas(table)[2]
    if (!turned) throw new Error('no area')
    // Four wide across x and one deep along z, turned a quarter: now one wide
    // across x and four deep along z.
    expect(inArea(turned, 10, 0, 1.8)).toBe(true)
    expect(inArea(turned, 11.8, 0, 0)).toBe(false)
  })
})

describe('a map’s bookcases', () => {
  const shelf = (index: number, at: [number, number, number], facing: number) => [
    {
      tag: 0x73,
      fields: [int(8), ...at.map(float), float(1), float(1), float(1), float(0), float(facing)],
    },
    { tag: 0x74, fields: [int(index)] },
  ]
  // Stornway's inn has this shape: two shelves on its west wall, read facing
  // three quarters of a turn; and an area, type 3, that is not a bookcase.
  const table = build(
    [
      ...shelf(0, [-6.206, 0, 2.932], (3 * Math.PI) / 2),
      ...shelf(1, [-6.206, 0, 4.308], (3 * Math.PI) / 2),
      {
        tag: 0x73,
        fields: [int(3), ...[0, 0, 0].map(float), ...[2, 2, 2].map(float), float(0), float(0)],
      },
      { tag: 0x74, fields: [int(4)] },
    ],
    [],
  )

  it('reads the type-8 regions, numbered by the 0x74 after each, with the way to face', () => {
    const cases = mapBookcases(table)
    expect(cases.map((c) => c.index)).toEqual([0, 1])
    expect(cases[0]?.facing).toBeCloseTo((3 * Math.PI) / 2, 5)
    expect(cases[0]?.area.min.x).toBeCloseTo(-6.706, 3)
    expect(cases[1]?.area.max.z).toBeCloseTo(4.808, 3)
    // And an area is not one.
    expect(mapAreas(table).map((a) => a.id)).toEqual([4])
  })
})

describe("a map's ladders — the type-9 regions", () => {
  const end = (
    at: [number, number, number],
    facing: number,
    values: { tag: number; fields: Field[] }['fields'],
  ) => [
    {
      tag: 0x73,
      fields: [
        int(9),
        ...at.map(float),
        float(1.3),
        float(1.7),
        float(1.7),
        float(0),
        float(facing),
      ],
    },
    { tag: 0x74, fields: values },
  ]
  // Dourbridge's shape: a bottom and a top, numbering each other; and a pair
  // whose top leads out of the map, as the Heights of Loneliness's do.
  const leaving = [
    int(2),
    int(1),
    int(0),
    int(3),
    name(0),
    int(-1),
    int(-1),
    ...[-13.66, 5.2, 7.16].map(float),
    float(0),
    int(0),
    ...Array.from({ length: 9 }, () => float(0)),
    float(0),
    int(0),
  ]
  const table = build(
    [
      ...end([8.917, 0.665, 19.203], Math.PI, [int(0), int(1), int(0), int(0)]),
      ...end([8.917, 4.377, 19.203], Math.PI, [int(1), int(0), int(0), int(1)]),
      ...end([4.146, -5, 2.333], 3.491, [int(1), int(2), int(0), int(0)]),
      ...end([4.146, -1.4, 2.333], 3.491, leaving),
    ],
    ['D07M02'],
  )

  it('reads each end with its partner, which is the top, its box and its facing', () => {
    const ends = mapLadders(table)
    expect(ends.map((e) => [e.id, e.partner, e.top])).toEqual([
      [0, 1, false],
      [1, 0, true],
      [1, 2, false],
      [2, 1, true],
    ])
    expect(ends[1]?.y).toBeCloseTo(4.377, 3)
    expect(ends[0]?.facing).toBeCloseTo(Math.PI, 5)
    expect(ends[0]?.area.min.x).toBeCloseTo(8.917 - 0.65, 3)
    expect(inArea(ends[0]?.area as never, 8.9, 0.7, 19.2)).toBe(true)
  })

  it('reads where an end that leads out goes, by flag bit 1', () => {
    const ends = mapLadders(table)
    expect(ends[0]?.exit).toBeUndefined()
    expect(ends[3]?.exit?.map).toBe('D07M02')
    expect(ends[3]?.exit?.x).toBeCloseTo(-13.66, 3)
    expect(ends[3]?.exit?.onLadder).toBeUndefined()
  })

  it("is not read as a doorway, though it names a map in the doorway's slot", () => {
    expect(readMapTransitions(table)).toEqual([])
  })
})

describe("a map's start point — 0x6E", () => {
  it('reads x, y, z and the facing, four floats', () => {
    // Shaped like Angel Falls' church, `M01M06`: (0, 0.15, −2.64), facing π.
    const table = build(
      [
        { tag: 0x6a, fields: [int(1)] },
        { tag: 0x6e, fields: [float(0), float(0.15), float(-2.64), float(Math.PI)] },
      ],
      [],
    )
    const start = mapStart(table)
    expect(start?.x).toBe(0)
    expect(start?.y).toBeCloseTo(0.15, 5)
    expect(start?.z).toBeCloseTo(-2.64, 5)
    expect(start?.facing).toBeCloseTo(Math.PI, 5)
  })

  it('is undefined with none, or with values that are not floats', () => {
    expect(mapStart(build([{ tag: 0x6a, fields: [int(1)] }], []))).toBeUndefined()
    expect(
      mapStart(build([{ tag: 0x6e, fields: [int(0), int(0), int(0), int(0)] }], [])),
    ).toBeUndefined()
  })

  it('throws on a table that does not read', () => {
    expect(() => mapStart(new Uint8Array(8))).toThrow(GameFormatError)
  })
})

describe("a map's moorings — the type-10 regions", () => {
  // Shaped like F02's first: a box 6 × 10 × 2 turned 1.396, the ship moored
  // facing the same way, the party put ashore at (0, 5, −79) facing 0, a reach
  // of 15 and the ocean's (−52, 0, −32) facing 3 — integers, as on the cartridge.
  const mooring = (values: Field[]) => [
    {
      tag: 0x73,
      fields: [
        int(10),
        ...[0, -1, -81.597].map(float),
        ...[6, 10, 2].map(float),
        float(1.396),
        float(1.396),
      ],
    },
    { tag: 0x74, fields: values },
  ]

  it('reads the ship’s place, the shore, the reach and the sea', () => {
    const table = build(
      [
        ...mooring([0, 0, 5, -79, 0, 15, -52, 0, -32, 3].map(int)),
        // A doorway region is not one.
        {
          tag: 0x73,
          fields: [int(2), ...[0, 0, 0].map(float), ...[1, 1, 1].map(float), float(0), float(0)],
        },
        { tag: 0x74, fields: [int(0), int(1)] },
      ],
      [],
    )
    const [one, ...rest] = mapMoorings(table)
    expect(rest).toEqual([])
    expect(one?.id).toBe(0)
    expect(one?.z).toBeCloseTo(-81.597, 3)
    expect(one?.facing).toBeCloseTo(1.396, 3)
    expect(one?.ashore).toEqual({ x: 0, y: 5, z: -79 })
    expect(one?.ashoreFacing).toBe(0)
    expect(one?.reach).toBe(15)
    expect(one?.sea).toEqual({ x: -52, y: 0, z: -32, facing: 3 })
    expect(one?.area.angle).toBeCloseTo(1.396, 3)
  })

  it('reads a float as a float, and leaves the sea out of a record of six values', () => {
    const [one] = mapMoorings(
      build(mooring([int(4), float(1.5), int(0), int(2), float(-1), int(9)]), []),
    )
    expect(one?.id).toBe(4)
    expect(one?.ashore.x).toBeCloseTo(1.5, 5)
    expect(one?.ashoreFacing).toBeCloseTo(-1, 5)
    expect(one?.sea).toBeUndefined()
  })

  it('passes over a region with too few values, and throws on a table that does not read', () => {
    expect(mapMoorings(build(mooring([int(0), int(1)]), []))).toEqual([])
    expect(() => mapMoorings(new Uint8Array(8))).toThrow(GameFormatError)
  })
})
