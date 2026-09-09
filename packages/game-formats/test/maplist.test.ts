import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { isMapList, readMapList } from '../src/maplist.ts'

interface EntrySpec {
  readonly region?: string
  readonly code: string
  readonly label?: string
}

/**
 * Build a `maplist9.bin`: a record stream then a string table.
 *
 * The first string is the build stamp, and a field that means "none" is zero —
 * which is also the offset of that stamp. The fixture keeps that arrangement,
 * because reading zero as a reference is exactly the mistake worth testing.
 */
function buildMapList(
  entries: readonly EntrySpec[],
  options: { declared?: number } = {},
): Uint8Array {
  const strings: number[] = []
  const offsets = new Map<string, number>()
  const intern = (text: string): number => {
    const existing = offsets.get(text)
    if (existing !== undefined) return existing
    const at = strings.length
    for (const ch of text) strings.push(ch.charCodeAt(0))
    strings.push(0)
    offsets.set(text, at)
    return at
  }
  intern('2009/09/02 10:39:39')

  const records: number[] = []
  const u16 = (v: number) => records.push(v & 0xff, (v >>> 8) & 0xff)
  const u32 = (v: number) =>
    records.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  const record = (tag: number, type: number, values: readonly number[]) => {
    u16(tag)
    // Tag, count, then two bits of type per value, padded to a word: a record
    // of five or more values has an eight-byte head, not four.
    const typeBytes = Math.max(1, Math.ceil(values.length / 4))
    const header = Math.ceil((3 + typeBytes) / 4) * 4
    records.push(values.length, type)
    for (let i = 4; i < header; i++) records.push(0)
    for (const v of values) u32(v)
  }

  record(0x66, 1, [options.declared ?? entries.length])
  for (const entry of entries) {
    // Where the strings really sit, now the header's six type bytes are counted
    // rather than being read as two leading values.
    const values = new Array(22).fill(0)
    values[2] = entry.region === undefined ? 0 : intern(entry.region)
    values[4] = intern(entry.code)
    values[5] = entry.label === undefined ? 0 : intern(entry.label)
    record(0x67, 69, values)
  }
  record(0x6e, 0xff, [])

  const header: number[] = []
  const h32 = (v: number) =>
    header.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  h32(0)
  h32(16 + records.length)
  h32(strings.length)
  h32(offsets.size)
  return Uint8Array.from([...header, ...records, ...strings])
}

const sample = () =>
  buildMapList([
    { region: 'Angel Falls', code: 'M01', label: 'Exterior' },
    { region: 'Angel Falls', code: 'M01M02', label: 'Inn' },
    { region: 'Angel Falls', code: 'M01M06', label: 'Church' },
    { region: 'Gleeba', code: 'C02', label: 'Exterior' },
    { code: 'K01' },
  ])

describe('readMapList', () => {
  it('reads every map, in order', () => {
    const list = readMapList(sample())
    expect(list.maps.map((m) => m.code)).toEqual(['M01', 'M01M02', 'M01M06', 'C02', 'K01'])
    expect(list.maps.map((m) => m.index)).toEqual([0, 1, 2, 3, 4])
  })

  it('reads the region and the name a person wrote', () => {
    const inn = readMapList(sample()).maps[1]
    expect(inn?.region).toBe('Angel Falls')
    expect(inn?.label).toBe('Inn')
  })

  it('treats an empty field as empty, not as the first string', () => {
    // Zero is both "none" and the offset of the build stamp; reading it as a
    // reference turns every blank field into a date.
    const bare = readMapList(sample()).maps[4]
    expect(bare?.code).toBe('K01')
    expect(bare?.region).toBeUndefined()
    expect(bare?.label).toBeUndefined()
  })

  it('groups maps by region', () => {
    const list = readMapList(sample())
    expect(list.region('Angel Falls').map((m) => m.label)).toEqual(['Exterior', 'Inn', 'Church'])
    expect(list.region('Nowhere')).toEqual([])
  })

  it('finds a map by its code', () => {
    const list = readMapList(sample())
    expect(list.map('M01M06')?.label).toBe('Church')
    expect(list.map('nope')).toBeUndefined()
  })

  it('rejects a list whose declared count disagrees with its entries', () => {
    expect(() => readMapList(buildMapList([{ code: 'A' }], { declared: 9 }))).toThrow(
      GameFormatError,
    )
  })
})

describe('isMapList', () => {
  it('accepts a table carrying map entries', () => {
    expect(isMapList(sample())).toBe(true)
  })

  it('rejects one that does not', () => {
    expect(isMapList(buildMapList([]))).toBe(false)
    expect(isMapList(new Uint8Array(8))).toBe(false)
  })
})
