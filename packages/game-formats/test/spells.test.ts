import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { LEARNT_TAG, readSpellTable, SPELL_TAG, spellsLearnt } from '../src/spells.ts'

/**
 * A tagged data table built in code, from FORMAT.md: a 16-byte head, records of
 * a tag, a count and two bits of kind a value — integers, here — then a string.
 */
function table(records: { tag: number; values: number[]; kind?: number }[]): Uint8Array {
  const body: number[] = []
  const push32 = (v: number) =>
    body.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  for (const { tag, values, kind = 1 } of records) {
    let kinds = 0
    for (let i = 0; i < values.length; i++) kinds |= kind << (i * 2)
    body.push(tag & 0xff, tag >>> 8, values.length, kinds)
    for (const v of values) push32(v)
  }
  const strings = [0x31, 0x30, 0]
  const out = new Uint8Array(16 + body.length + strings.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, records.length, true)
  view.setUint32(4, 16 + body.length, true)
  view.setUint32(8, strings.length, true)
  view.setUint32(12, 1, true)
  out.set(body, 16)
  out.set(strings, 16 + body.length)
  return out
}

const spells = [
  { tag: 0x65, values: [0] },
  { tag: 0x64, values: [20] },
  { tag: SPELL_TAG, values: [0, 9] },
  { tag: SPELL_TAG, values: [1, 30] },
  { tag: LEARNT_TAG, values: [6, 1, 3] },
  { tag: LEARNT_TAG, values: [3, 0, 1] },
  { tag: LEARNT_TAG, values: [6, 0, 8] },
]

describe('the spell table', () => {
  it('reads the spell list, and who learns which spell at what level', () => {
    const read = readSpellTable(table(spells))
    expect(read.list.get(1)).toBe(30)
    expect(read.learnt).toContainEqual({ vocation: 6, place: 1, action: 30, level: 3 })
    expect(read.unknown.map((r) => r.tag)).toEqual([0x65, 0x64])
  })

  it('says what a vocation has learnt by a level, in the order it learns them', () => {
    const read = readSpellTable(table(spells))
    expect(spellsLearnt(read, 6, 2)).toEqual([])
    expect(spellsLearnt(read, 6, 3).map((s) => s.action)).toEqual([30])
    expect(spellsLearnt(read, 6, 99).map((s) => s.action)).toEqual([30, 9])
    expect(spellsLearnt(read, 3, 1).map((s) => s.action)).toEqual([9])
  })

  it('refuses a spell learnt at a place the list does not have, or a record of the wrong shape', () => {
    expect(() =>
      readSpellTable(
        table([
          { tag: SPELL_TAG, values: [0, 9] },
          { tag: LEARNT_TAG, values: [6, 4, 3] },
        ]),
      ),
    ).toThrow(/place 4/)
    expect(() => readSpellTable(table([{ tag: SPELL_TAG, values: [0, 9, 1] }]))).toThrow(
      GameFormatError,
    )
    expect(() => readSpellTable(table([{ tag: SPELL_TAG, values: [0, 9], kind: 2 }]))).toThrow(
      /not 2 integers/,
    )
    expect(() =>
      readSpellTable(
        table([
          { tag: SPELL_TAG, values: [0, 9] },
          { tag: SPELL_TAG, values: [0, 10] },
        ]),
      ),
    ).toThrow(/twice/)
  })
})
