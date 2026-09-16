import { describe, expect, it } from 'vitest'
import { EVEN_TABLE, readWeightTables } from '../src/battle-tables.ts'
import { GameFormatError } from '../src/errors.ts'

function binaryWith(tables: readonly (readonly number[])[], before = 99): Uint8Array {
  const out = new Uint8Array(before + tables.length * 6 + 16)
  for (let i = 0; i < out.length; i++) out[i] = (i * 13 + 5) & 0xff
  tables.forEach((table, t) => {
    out.set(table, before + t * 6)
  })
  return out
}

describe('the battle weight tables', () => {
  it('reads the run from the even table to the last that sums to 256', () => {
    const found = readWeightTables(
      binaryWith([
        EVEN_TABLE,
        [68, 58, 48, 38, 27, 17],
        [210, 29, 10, 4, 2, 1],
        [1, 2, 3, 4, 5, 6],
      ]),
    )
    expect(found.offset).toBe(99)
    expect(found.tables).toEqual([EVEN_TABLE, [68, 58, 48, 38, 27, 17], [210, 29, 10, 4, 2, 1]])
  })

  it('wants the even table, and one more after it', () => {
    expect(() => readWeightTables(new Uint8Array(300))).toThrow(GameFormatError)
    expect(() => readWeightTables(binaryWith([EVEN_TABLE, [1, 2, 3, 4, 5, 6]]))).toThrow(
      GameFormatError,
    )
  })
})
