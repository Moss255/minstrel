import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { readTalk } from '../src/talk.ts'

/**
 * Fixtures are built here, never taken from a cartridge. A talk file is a
 * tagged data table — see `table.ts` — whose records carry numbers and then
 * the offset of a string.
 */
interface Field {
  readonly value: number
  /** 0 a string offset, 1 an integer. */
  readonly kind: 0 | 1
}

const int = (value: number): Field => ({ value, kind: 1 })
const text = (offset: number): Field => ({ value: offset, kind: 0 })

function build(records: { tag: number; fields: Field[] }[], strings: string[]): Uint8Array {
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
    for (const f of record.fields) push32(f.value)
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

describe('readTalk', () => {
  it('reads each line as its tag, its numbers and what it says', () => {
    const first = '*: Oh!'
    const bytes = build(
      [
        { tag: 1, fields: [int(1), int(1), int(16), text(0)] },
        { tag: 2, fields: [int(2), int(4), int(1), int(16), text(first.length + 1)] },
        { tag: 4, fields: [int(1), int(99), int(16), text(0xffffffff)] },
      ],
      [first, '*: Well<,> well.'],
    )
    expect(readTalk(bytes)).toEqual([
      { tag: 1, unknown_numbers: [1, 1, 16], text: '*: Oh!' },
      { tag: 2, unknown_numbers: [2, 4, 1, 16], text: '*: Well<,> well.' },
      { tag: 4, unknown_numbers: [1, 99, 16], text: undefined },
    ])
  })

  it('reads an empty file as a character with nothing to say', () => {
    expect(readTalk(new Uint8Array(0))).toEqual([])
  })

  it('refuses a record that is not numbers and then a string', () => {
    // A string in the middle.
    expect(() => readTalk(build([{ tag: 1, fields: [text(0), int(1)] }], ['a']))).toThrow(
      GameFormatError,
    )
    // Nothing but a string.
    expect(() => readTalk(build([{ tag: 1, fields: [text(0)] }], ['a']))).toThrow(GameFormatError)
  })

  it('refuses a string offset that lands inside a string', () => {
    expect(() =>
      readTalk(build([{ tag: 1, fields: [int(1), int(1), int(16), text(2)] }], ['hello'])),
    ).toThrow(GameFormatError)
  })
})
