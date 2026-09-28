import { describe, expect, it } from 'vitest'
import { castAtPoint, flagBit, readPlaceRecords } from '../src/npc.ts'

/**
 * Who stands where, as the game's placement script decides it — see
 * `castAtPoint` and FORMAT.md, "Who stands where, read from the game's code".
 * Fixtures are built here, never taken from a cartridge: a `place.bin` is a
 * tagged table — a tag, a value count, two type bits a value, the values.
 */
interface Field {
  readonly value: number
  /** 1 an integer, 2 a float. */
  readonly kind: 1 | 2
}
const int = (value: number): Field => ({ value, kind: 1 })
const float = (value: number): Field => ({ value, kind: 2 })

function build(records: { tag: number; fields: Field[] }[]): Uint8Array {
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
  const out = new Uint8Array(16 + body.length)
  const view = new DataView(out.buffer)
  view.setUint32(4, 16 + body.length, true)
  out.set(body, 16)
  return out
}

const at = (x: number, z: number) => [float(x), float(0), float(z), float(0)]
/** A block: map, character, where. */
const block = (map: number, id: number, where?: [number, number]) => ({
  tag: 3,
  fields: [int(map), int(id), ...(where ? at(...where) : [])],
})
/** A span: from and to as stage, sub-stage and step, the time of day, map, character, where. */
const span = (
  from: [number, number, number],
  to: [number, number, number],
  time: number,
  map: number,
  id: number,
  where?: [number, number],
) => ({
  tag: 5,
  fields: [...from, ...to, time, map, id].map(int).concat(where ? at(...where) : []),
})
const point = (major: number, minor: number, step: number) => ({ major, minor, step })

describe('who stands where', () => {
  it('stands a character at their block until a record over the story says otherwise', () => {
    const records = readPlaceRecords(
      build([block(1100, 7, [1, 1]), span([2, 2, 1], [2, 2, 4], 2, 1100, 7, [5, 5])]),
    )
    expect(castAtPoint(records, 1100, point(2, 1, 1), false).get(7)?.x).toBeCloseTo(1, 5)
    expect(castAtPoint(records, 1100, point(2, 2, 3), false).get(7)?.x).toBeCloseTo(5, 5)
    // Weighed as major × 1000 + minor × 10 + step: 2.2 step 5 is past it.
    expect(castAtPoint(records, 1100, point(2, 2, 5), false).get(7)?.x).toBeCloseTo(1, 5)
  })

  it('takes a character away where a record puts them in another map, or nowhere', () => {
    // Ivor's shape: his block is the village, and at 2.1 a record puts him in
    // the mayor's house — which takes him out of the village.
    const records = readPlaceRecords(
      build([
        block(1100, 7, [1, 1]),
        span([2, 1, 1], [2, 1, 9], 2, 1105, 7, [3, 3]),
        span([2, 3, 1], [2, 3, 9], 2, 1100, 7),
      ]),
    )
    expect(castAtPoint(records, 1100, point(2, 1, 1), false).has(7)).toBe(false)
    expect(castAtPoint(records, 1105, point(2, 1, 1), false).has(7)).toBe(true)
    expect(castAtPoint(records, 1100, point(2, 2, 1), false).has(7)).toBe(true)
    expect(castAtPoint(records, 1100, point(2, 3, 1), false).has(7)).toBe(false)
  })

  it('reads the time of day: 0 by day, 1 by night, 2 either', () => {
    const records = readPlaceRecords(
      build([
        block(1104, 15, [1, 1]),
        span([2, 1, 1], [2, 5, 1], 0, 1104, 15, [2, 2]),
        span([2, 2, 1], [2, 5, 1], 1, 1100, 15, [9, 9]),
      ]),
    )
    // By day in the stable; by night in the village, and so out of the stable.
    expect(castAtPoint(records, 1104, point(2, 3, 1), false).get(15)?.x).toBeCloseTo(2, 5)
    expect(castAtPoint(records, 1100, point(2, 3, 1), false).has(15)).toBe(false)
    expect(castAtPoint(records, 1100, point(2, 3, 1), true).get(15)?.x).toBeCloseTo(9, 5)
  })

  it('keeps the span that starts earliest, and drops one that comes after', () => {
    const records = readPlaceRecords(
      build([
        span([2, 1, 1], [2, 9, 9], 2, 1, 5, [1, 0]),
        span([2, 4, 1], [2, 9, 9], 2, 1, 5, [2, 0]),
      ]),
    )
    expect(castAtPoint(records, 1, point(2, 5, 1), false).get(5)?.x).toBeCloseTo(1, 5)
  })

  it('places while game-wide flags hold, before anything else', () => {
    // The Quarantomb's shape: `17`, flag 89 set (operation 1), any time, the map, the character.
    const records = readPlaceRecords(
      build([
        block(7401, 29, [1, 1]),
        { tag: 17, fields: [int((1 << 16) | 89), int(1), int(2), int(7402), int(29), ...at(4, 4)] },
        span([4, 3, 1], [4, 3, 9], 2, 7402, 29, [7, 7]),
      ]),
    )
    const set = (bits: number[]) => (bit: number, wanted: boolean) => bits.includes(bit) === wanted
    expect(castAtPoint(records, 7402, point(4, 3, 1), false, set([])).get(29)?.x).toBeCloseTo(7, 5)
    expect(castAtPoint(records, 7402, point(4, 3, 1), false, set([89])).get(29)?.x).toBeCloseTo(
      4,
      5,
    )
    // By number, an id from 0x400 is displaced as the scripts' flags are.
    expect(flagBit(0x3ff)).toBe(0x3ff)
    expect(flagBit(0x400)).toBe(0x400 + 1786)
  })

  it('reads a block with no place as taking the character away', () => {
    const records = readPlaceRecords(build([block(5602, 22, [1, 1]), block(5602, 22)]))
    expect(castAtPoint(records, 5602, point(10, 2, 1), false).has(22)).toBe(false)
  })
})
