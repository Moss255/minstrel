import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { isDataTable, readDataTable, TABLE_TAG_END } from '../src/table.ts'

/**
 * Build a tagged table. Fixtures may not contain cartridge bytes, so the layout
 * is implemented here from the description in `FORMAT.md`.
 */
interface FixtureRecord {
  tag: number
  type?: number
  values?: number[]
  floats?: number[]
  /** Emit a word of 0xFF fill before this record. */
  padBefore?: boolean
}

function buildTable(records: FixtureRecord[], strings: string[] = []): Uint8Array {
  const body: number[] = []
  const push32 = (v: number) =>
    body.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)

  for (const record of records) {
    if (record.padBefore) body.push(0xff, 0xff, 0xff, 0xff)
    const values = record.values ?? []
    const floats = record.floats ?? []
    const count = values.length + floats.length
    // Tag, count, then two bits of type per value, padded to a word. A record
    // of five or more values therefore has an eight-byte head, not four.
    const typeBytes = Math.max(1, Math.ceil(count / 4))
    const header = Math.ceil((3 + typeBytes) / 4) * 4
    body.push(record.tag & 0xff, (record.tag >>> 8) & 0xff, count, record.type ?? 0)
    for (let i = 4; i < header; i++) body.push(0)
    for (const v of values) push32(v)
    for (const f of floats) {
      const buf = new DataView(new ArrayBuffer(4))
      buf.setFloat32(0, f, true)
      push32(buf.getUint32(0, true))
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
  out.set(Uint8Array.from(body), 16)
  out.set(Uint8Array.from(stringBytes), stringOffset)
  return out
}

describe('readDataTable', () => {
  it('reads records and their values', () => {
    const table = readDataTable(
      buildTable([
        { tag: 0x6a, type: 1, values: [33] },
        { tag: 0x6c, type: 0x51, values: [0, 9, 4, 1] },
      ]),
    )
    expect(table.records).toHaveLength(2)
    expect(table.records[0]?.tag).toBe(0x6a)
    expect(Array.from(table.records[1]?.values as Uint32Array)).toEqual([0, 9, 4, 1])
  })

  it('reads a type-2 record as floats', () => {
    const table = readDataTable(buildTable([{ tag: 0x71, type: 2, floats: [1.2] }]))
    expect(table.records[0]?.floats[0]).toBeCloseTo(1.2, 5)
  })

  it('reads the string table and checks it against the header', () => {
    const table = readDataTable(
      buildTable([{ tag: 0x6a, type: 1, values: [1] }], ['M01M0000.imd', 'M01M00D1.imd']),
    )
    expect(table.strings).toEqual(['M01M0000.imd', 'M01M00D1.imd'])
  })

  it('stops on the terminator record', () => {
    const table = readDataTable(
      buildTable([
        { tag: 0x6a, type: 1, values: [1] },
        { tag: TABLE_TAG_END, type: 0xff },
        { tag: 0x99, type: 1, values: [0xdead] },
      ]),
    )
    expect(table.terminated).toBe(true)
    expect(table.records.map((r) => r.tag)).toEqual([0x6a])
  })

  it('skips 0xFF fill between records rather than stopping at it', () => {
    // Three files on the reference cartridge carry fill mid-stream; a parser
    // that treats the first run as the end truncates them.
    const table = readDataTable(
      buildTable([
        { tag: 0x6a, type: 1, values: [1] },
        { tag: 0x6f, type: 0xa5, values: [2], padBefore: true },
        { tag: 0x70, type: 0, values: [3], padBefore: true },
      ]),
    )
    expect(table.records.map((r) => r.tag)).toEqual([0x6a, 0x6f, 0x70])
  })

  it('reads a record with no values', () => {
    const table = readDataTable(buildTable([{ tag: 0x3f, type: 0 }]))
    expect(table.records[0]?.values).toHaveLength(0)
  })

  it('finds records by tag', () => {
    const table = readDataTable(
      buildTable([
        { tag: 0x6c, type: 1, values: [1] },
        { tag: 0x6a, type: 1, values: [2] },
        { tag: 0x6c, type: 1, values: [3] },
      ]),
    )
    expect(table.withTag(0x6c).map((r) => r.values[0])).toEqual([1, 3])
    expect(table.withTag(0x99)).toEqual([])
  })

  it('handles a table with no strings, as the attribute files have', () => {
    const table = readDataTable(buildTable([{ tag: 0x67, type: 2, floats: [0] }]))
    expect(table.strings).toEqual([])
    expect(table.records).toHaveLength(1)
  })

  it('handles an empty record stream', () => {
    const table = readDataTable(buildTable([], ['only.imd']))
    expect(table.records).toEqual([])
    expect(table.strings).toEqual(['only.imd'])
  })
})

describe('isDataTable', () => {
  it('accepts a well-formed table', () => {
    expect(isDataTable(buildTable([{ tag: 1, type: 1, values: [1] }], ['a']))).toBe(true)
  })

  it('rejects a buffer too short for a header', () => {
    expect(isDataTable(new Uint8Array(8))).toBe(false)
  })

  it('rejects a string section outside the file', () => {
    const data = buildTable([{ tag: 1, type: 1, values: [1] }])
    new DataView(data.buffer).setUint32(4, 0x7fff_0000, true)
    expect(isDataTable(data)).toBe(false)
  })
})

describe('readDataTable on malformed input', () => {
  it('rejects a truncated header', () => {
    expect(() => readDataTable(new Uint8Array(8))).toThrow(/shorter than its header/)
  })

  it('rejects a string section past the end', () => {
    const data = buildTable([{ tag: 1, type: 1, values: [1] }])
    new DataView(data.buffer).setUint32(8, 0x7fff_0000, true)
    expect(() => readDataTable(data)).toThrow(/runs past the end/)
  })

  it('rejects a string count that disagrees with the section', () => {
    const data = buildTable([{ tag: 1, type: 1, values: [1] }], ['a', 'b'])
    new DataView(data.buffer).setUint32(12, 9, true)
    expect(() => readDataTable(data)).toThrow(/declares 9 strings/)
  })

  it('rejects a record whose values overrun the stream', () => {
    const data = buildTable([{ tag: 1, type: 1, values: [1] }], ['a'])
    // Claim 200 values where only one fits.
    data[16 + 2] = 200
    expect(() => readDataTable(data)).toThrow(GameFormatError)
  })
})
