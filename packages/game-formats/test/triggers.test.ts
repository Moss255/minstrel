import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { readTriggers } from '../src/triggers.ts'

/**
 * Fixtures are built here, never taken from a cartridge. A trigger file is a
 * tagged data table — see `table.ts`.
 */
interface Field {
  readonly value: number
  /** 0 a string offset, 1 an integer, 2 a float. */
  readonly kind: 0 | 1 | 2
}

const int = (value: number): Field => ({ value, kind: 1 })
const float = (value: number): Field => ({ value, kind: 2 })
const name = (offset: number): Field => ({ value: offset, kind: 0 })

function build(records: { tag: number; fields: Field[] }[], strings: string[] = []): Uint8Array {
  const body: number[] = []
  const push32 = (v: number) =>
    body.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  for (const record of records) {
    const count = record.fields.length
    const typeBytes = Math.max(1, Math.ceil(count / 4))
    const header = Math.ceil((3 + typeBytes) / 4) * 4
    const bits = new Uint8Array(header - 3)
    for (const [i, f] of record.fields.entries()) {
      bits[i >> 2] = (bits[i >> 2] as number) | (f.kind << ((i & 3) * 2))
    }
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
  view.setUint32(4, stringOffset, true)
  view.setUint32(8, stringBytes.length, true)
  view.setUint32(12, strings.length, true)
  out.set(body, 16)
  out.set(stringBytes, stringOffset)
  return out
}

/** A map, a span, value 5, then whatever follows. */
const record = (head: [number, number, number, number, number, number], rest: Field[]) => ({
  tag: 1,
  fields: [...head.map(int), ...rest],
})

describe('readTriggers', () => {
  it('reads the map, the span and value 5, and carries the rest as it is', () => {
    const [trigger] = readTriggers(
      build([record([1100, 2, 1, 2, 3, 1], [int(0x00060005), int(0x000b00c0)])]),
    )
    expect(trigger).toMatchObject({
      map: 1100,
      from: { major: 2, minor: 1 },
      to: { major: 2, minor: 3 },
      unknown_5: 1,
    })
    expect(Array.from(trigger?.values ?? [])).toEqual([0x00060005, 0x000b00c0])
    expect(Array.from(trigger?.kinds ?? [])).toEqual([1, 1])
  })

  it('carries floats among the words with their type bits', () => {
    const [trigger] = readTriggers(
      build([record([1101, 1, 1, 19, 99, 0], [int(7), float(1.5), float(-2.25), int(0)])]),
    )
    expect(Array.from(trigger?.kinds ?? [])).toEqual([1, 2, 2, 1])
    expect(trigger?.floats[1]).toBeCloseTo(1.5)
    expect(trigger?.floats[2]).toBeCloseTo(-2.25)
  })

  it('reads an empty file as none', () => {
    expect(readTriggers(new Uint8Array(0))).toEqual([])
  })

  it('refuses a record that is not a map, a span and value 5', () => {
    expect(() => readTriggers(build([{ tag: 2, fields: [1100, 1, 1, 1, 1, 0].map(int) }]))).toThrow(
      GameFormatError,
    )
    expect(() => readTriggers(build([{ tag: 1, fields: [1100, 1, 1, 1].map(int) }]))).toThrow(
      GameFormatError,
    )
    expect(() =>
      readTriggers(build([{ tag: 1, fields: [name(0), ...[1, 1, 1, 1, 0].map(int)] }], ['a'])),
    ).toThrow(GameFormatError)
  })
})
