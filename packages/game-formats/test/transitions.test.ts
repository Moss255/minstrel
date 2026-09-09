import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { PLACEMENT_SCALE } from '../src/mapmanifest.ts'
import { mapDoorways, readMapTransitions } from '../src/transitions.ts'

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

  it('puts the doorway and the arrival in world units', () => {
    // The file counts in the same eighths the map's own placements do.
    const t = readMapTransitions(
      build([doorway(AT_M01M01, [-30.4, -8, 28.4], [-28.4, 3.36, 6.56, 2.3])], NAMES),
    )
    expect(t[0]?.x).toBeCloseTo(-30.4 / PLACEMENT_SCALE, 4)
    expect(t[0]?.z).toBeCloseTo(28.4 / PLACEMENT_SCALE, 4)
    expect(t[0]?.arriveX).toBeCloseTo(-28.4 / PLACEMENT_SCALE, 4)
    expect(t[0]?.arriveZ).toBeCloseTo(6.56 / PLACEMENT_SCALE, 4)
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
    expect(t[0]?.x).toBeCloseTo(1, 4)
    expect(t[0]?.arriveX).toBeCloseTo(10, 4)
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
    expect(mapDoorways(bytes)[0]).toMatchObject({ tag: 0x74, arriveX: 3, arriveFacing: 1 })
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
    expect(mapDoorways(bytes)[0]).toMatchObject({ tag: 0x74, arriveX: 3 })
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
