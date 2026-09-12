import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { LEVEL_TAG, levelAt, readLevelTable } from '../src/levels.ts'

/**
 * Build a tagged data table of integer records. Fixtures may not contain
 * cartridge bytes, so the layout is implemented here from `FORMAT.md`: the
 * head, then records of a tag, a count and two type bits per value, padded with
 * 0xFF to a word, then the values; no strings.
 */
function build(records: { tag: number; values: number[]; kind?: number }[]): Uint8Array {
  const body: number[] = []
  for (const { tag, values, kind = 1 } of records) {
    const typeBytes = Math.ceil(values.length / 4)
    const head = Math.ceil((3 + typeBytes) / 4) * 4
    body.push(tag & 0xff, (tag >>> 8) & 0xff, values.length)
    for (let b = 0; b < typeBytes; b++) {
      let bits = 0
      for (let i = 0; i < 4 && b * 4 + i < values.length; i++) bits |= kind << (i * 2)
      body.push(bits)
    }
    for (let i = 3 + typeBytes; i < head; i++) body.push(0xff)
    for (const v of values) body.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, v >>> 24)
  }
  const out = new Uint8Array(16 + body.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, records.length, true)
  view.setUint32(4, 16 + body.length, true)
  out.set(body, 16)
  return out
}

const row = (exp: number, first: number) => ({
  tag: LEVEL_TAG,
  values: [exp, ...Array.from({ length: 10 }, (_, i) => first + i)],
})

describe('level tables', () => {
  it('reads each level record in column order, numbering them from 1', () => {
    const table = readLevelTable(
      build([{ tag: 0x65, values: [0] }, row(0, 10), row(17, 20), { tag: 0x67, values: [100, 2] }]),
    )
    expect(table.levels).toHaveLength(2)
    expect(table.levels[0]).toEqual({
      level: 1,
      exp: 0,
      strength: 10,
      resilience: 11,
      agility: 12,
      deftness: 13,
      charm: 14,
      magicalMight: 15,
      magicalMending: 16,
      maxHp: 17,
      maxMp: 18,
      unknown_10: 19,
    })
    expect(table.levels[1]?.level).toBe(2)
    expect(table.unknown.map((record) => record.tag)).toEqual([0x65, 0x67])
  })

  it('says which level a sum of experience has reached', () => {
    const table = readLevelTable(build([row(0, 1), row(17, 2), row(44, 3)]))
    expect(levelAt(table, 0).level).toBe(1)
    expect(levelAt(table, 16).level).toBe(1)
    expect(levelAt(table, 17).level).toBe(2)
    expect(levelAt(table, 1_000_000).level).toBe(3)
  })

  it('refuses a level that is not eleven integers, levels out of order, or none at all', () => {
    expect(() => readLevelTable(build([{ tag: LEVEL_TAG, values: [0, 1, 2] }]))).toThrow(
      GameFormatError,
    )
    expect(() => readLevelTable(build([{ ...row(0, 1), kind: 2 }]))).toThrow(/integers/)
    expect(() => readLevelTable(build([row(50, 1), row(10, 2)]))).toThrow(/before level/)
    expect(() => readLevelTable(build([{ tag: 0x65, values: [0] }]))).toThrow(/no levels/)
    expect(() => readLevelTable(new Uint8Array(8))).toThrow(GameFormatError)
  })
})
