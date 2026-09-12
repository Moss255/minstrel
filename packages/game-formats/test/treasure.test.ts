import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { readRandomTreasure, readTreasure } from '../src/treasure.ts'

/** A value and its two type bits: 0 a string offset, 1 an integer, 2 a float. */
interface Field {
  readonly kind: 0 | 1 | 2
  readonly value: number
}
const int = (value: number): Field => ({ kind: 1, value })
const float = (value: number): Field => ({ kind: 2, value })
const text = (offset: number): Field => ({ kind: 0, value: offset })

/**
 * Build a treasure file. Fixtures may not contain cartridge bytes, so the layout
 * is implemented here from `FORMAT.md`: the tagged table's head, then records of
 * a tag, a count and two type bits per value, padded with 0xFF to a word, then
 * the values; the strings last.
 */
function build(records: { tag: number; fields: Field[] }[], strings: string[] = []): Uint8Array {
  const body: number[] = []
  const word = (v: number) =>
    body.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  for (const { tag, fields } of records) {
    const typeBytes = Math.ceil(fields.length / 4)
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

const dated = [
  { tag: 0x65, fields: [text(0)] },
  { tag: 0x64, fields: [text(11)] },
]
const DATES = ['1999/01/02', '990102']

describe('readRandomTreasure', () => {
  const row = (rank: number, kind: number, value: number, weight: number) =>
    int(((rank << 26) | (kind << 23) | (value << 7) | weight) >>> 0)

  it('unpacks each row: rank, kind, value and weight', () => {
    const rows = readRandomTreasure(
      build(
        [
          ...dated,
          { tag: 0x6a, fields: [int(2)] },
          { tag: 0x69, fields: [row(1, 2, 0x5123, 25)] },
          { tag: 0x69, fields: [row(20, 1, 3000, 5)] },
        ],
        DATES,
      ),
    )
    expect(rows).toEqual([
      { rank: 1, kind: 2, value: 0x5123, weight: 25 },
      { rank: 20, kind: 1, value: 3000, weight: 5 },
    ])
  })

  it('refuses a row that is not one integer', () => {
    expect(() => readRandomTreasure(build([{ tag: 0x69, fields: [int(1), int(2)] }]))).toThrow(
      /not one integer/,
    )
  })
})

describe('readTreasure', () => {
  it('numbers each treasure on from the first, and reads all three shapes', () => {
    const file = readTreasure(
      build(
        [
          ...dated,
          { tag: 0x66, fields: [int(40)] },
          { tag: 0x67, fields: [int(0x00050003), int(0x30), int(12)] },
          {
            tag: 0x67,
            fields: [int(0x01000007), int(0x10), float(-2.5), float(0.25), float(4.75)],
          },
          {
            tag: 0x67,
            fields: [
              int(0x02000001),
              int(0x40),
              float(1.5),
              float(0.25),
              float(-3.5),
              float(Math.PI),
            ],
          },
        ],
        DATES,
      ),
    )
    expect(file.first).toBe(40)
    const [drawer, pot, chest] = file.treasures
    expect(file.treasures.map((t) => t.index)).toEqual([40, 41, 42])
    expect(drawer).toMatchObject({ kind: 0x30, unknown_0: 0x00050003, unknown_2: 12 })
    expect(drawer?.position).toBeUndefined()
    expect(drawer?.facing).toBeUndefined()
    expect(pot).toMatchObject({ kind: 0x10, position: { x: -2.5, y: 0.25, z: 4.75 } })
    expect(pot?.facing).toBeUndefined()
    expect(chest?.kind).toBe(0x40)
    expect(chest?.position).toEqual({ x: 1.5, y: 0.25, z: -3.5 })
    expect(chest?.facing).toBeCloseTo(Math.PI, 5)
  })

  it('reads a whole number stored as an integer, negatives included', () => {
    const [treasure] = readTreasure(
      build([
        { tag: 0x66, fields: [int(0)] },
        { tag: 0x67, fields: [int(1), int(0x8), int(-2), float(0.25), int(0), int(1)] },
      ]),
    ).treasures
    expect(treasure?.position).toEqual({ x: -2, y: 0.25, z: 0 })
    expect(treasure?.facing).toBe(1)
  })

  it('leaves the numbers out when the file names no first', () => {
    const file = readTreasure(
      build([{ tag: 0x67, fields: [int(1), int(0x10), float(0), float(0), float(0)] }]),
    )
    expect(file.first).toBeUndefined()
    expect(file.treasures[0]?.index).toBeUndefined()
  })

  it('finds no treasure in a table of other records', () => {
    const file = readTreasure(
      build([...dated, { tag: 0x6a, fields: [int(4)] }, { tag: 0x69, fields: [int(9)] }], DATES),
    )
    expect(file.first).toBeUndefined()
    expect(file.treasures).toEqual([])
  })

  it('refuses a treasure of a shape not seen', () => {
    const bytes = build([{ tag: 0x67, fields: [int(1), int(0x10), float(0), float(0)] }])
    expect(() => readTreasure(bytes)).toThrow(GameFormatError)
    expect(() => readTreasure(bytes)).toThrow(/4 values/)
  })

  it('refuses a string where a coordinate belongs', () => {
    const bytes = build(
      [...dated, { tag: 0x67, fields: [int(1), int(0x10), text(0), float(0), float(0)] }],
      DATES,
    )
    expect(() => readTreasure(bytes)).toThrow(/not a number/)
  })

  it('refuses a truncated file', () => {
    expect(() => readTreasure(new Uint8Array(8))).toThrow(GameFormatError)
  })
})
