import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { readMotionTable } from '../src/motion.ts'

/** A value and its two type bits: 0 a string offset, 1 an integer, 2 a float. */
interface Field {
  readonly kind: 0 | 1 | 2
  readonly value: number
}
const int = (value: number): Field => ({ kind: 1, value })
const float = (value: number): Field => ({ kind: 2, value })
const text = (offset: number): Field => ({ kind: 0, value: offset })

/**
 * Build a motion table. Fixtures may not contain cartridge bytes, so the layout
 * is implemented here from `FORMAT.md`: the tagged table's head, records of a
 * tag, a count and two type bits per value padded with 0xFF, the values, then
 * the strings.
 */
function build(records: { tag: number; fields: Field[] }[], strings: string[]): Uint8Array {
  const body: number[] = []
  const word = (v: number) =>
    body.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  for (const { tag, fields } of records) {
    const typeBytes = Math.max(1, Math.ceil(fields.length / 4))
    const head = Math.ceil((3 + typeBytes) / 4) * 4
    body.push(tag & 0xff, (tag >>> 8) & 0xff, fields.length)
    for (let b = 0; b < typeBytes; b++) {
      let bits = 0
      for (let i = 0; i < 4 && b * 4 + i < fields.length; i++) {
        bits |= (fields[b * 4 + i] as Field).kind << (i * 2)
      }
      body.push(bits)
    }
    for (let i = 3 + typeBytes; i < head; i++) body.push(0xff)
    for (const field of fields) {
      if (field.kind === 2) {
        const view = new DataView(new ArrayBuffer(4))
        view.setFloat32(0, field.value, true)
        word(view.getUint32(0, true))
      } else word(field.value)
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
  view.setUint32(0, records.length, true)
  view.setUint32(4, stringOffset, true)
  view.setUint32(8, stringBytes.length, true)
  view.setUint32(12, strings.length, true)
  out.set(body, 16)
  out.set(stringBytes, stringOffset)
  return out
}

describe('readMotionTable', () => {
  it('reads each motion by name, with its frames and speed, and keeps the other records', () => {
    const table = readMotionTable(
      build(
        [
          { tag: 0x64, fields: [int(3)] },
          { tag: 0x66, fields: [text(0), float(0), float(12), float(1)] },
          { tag: 0x66, fields: [text(5), float(0), float(0), float(1)] },
          { tag: 0x66, fields: [text(10), int(12), int(12), float(0.5)] },
          { tag: 0x65, fields: [] },
        ],
        ['wave', 'rest', 'done'],
      ),
    )
    expect(table.motions).toEqual([
      { name: 'wave', start: 0, end: 12, speed: 1 },
      { name: 'rest', start: 0, end: 0, speed: 1 },
      { name: 'done', start: 12, end: 12, speed: 0.5 },
    ])
    expect(table.others.map((r) => r.tag)).toEqual([0x64, 0x65])
  })

  it('leaves a 0x66 record of another shape among the others', () => {
    const table = readMotionTable(
      build([{ tag: 0x66, fields: [int(1), float(0), float(0), float(0)] }], []),
    )
    expect(table.motions).toEqual([])
    expect(table.others).toHaveLength(1)
  })

  it('refuses a motion whose name is not in the table', () => {
    const bytes = build([{ tag: 0x66, fields: [text(3), float(0), float(1), float(1)] }], ['walk'])
    expect(() => readMotionTable(bytes)).toThrow(GameFormatError)
    expect(() => readMotionTable(bytes)).toThrow(/names no string/)
  })

  it('refuses a truncated file', () => {
    expect(() => readMotionTable(new Uint8Array(6))).toThrow(GameFormatError)
  })
})
