import { describe, expect, it } from 'vitest'
import { readCharaColours } from '../src/characolours.ts'
import { GameFormatError } from '../src/errors.ts'
import { buildTable } from './fixture.ts'

/** Colours numbered by table and place, so each lands where it should be seen to. */
const run = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i)

/** `palette.bin` as the game's handlers take it: six records, tags 0x64 to 0x69. */
function colours(skip?: number, short?: number) {
  const records = [
    { tag: 0x64, values: run(0x1000, 20) },
    { tag: 0x65, values: run(0x2000, 16) },
    { tag: 0x66, values: run(0x3000, 32) },
    { tag: 0x67, values: run(0x4000, 64) },
    { tag: 0x68, values: run(0x5000, 16) },
    { tag: 0x69, values: [0x1086] },
  ]
    .filter((r) => r.tag !== skip)
    .map((r) => (r.tag === short ? { ...r, values: r.values.slice(1) } : r))
  return buildTable(records)
}

describe('the character colours', () => {
  it('reads each table in rows of its own width', () => {
    const read = readCharaColours(colours())
    expect(read.brows).toHaveLength(10)
    expect(read.brows[1]).toEqual([0x1002, 0x1003])
    expect(read.skin2[7]).toEqual([0x200e, 0x200f])
    expect(read.skin4[3]).toEqual([0x300c, 0x300d, 0x300e, 0x300f])
    expect(read.skin8[0]).toEqual(run(0x4000, 8))
    expect(read.eyes[2]).toEqual([0x5004, 0x5005])
    expect(read.unknown_0x69).toBe(0x1086)
  })

  it('keeps each value as the game does: a halfword', () => {
    const wide = buildTable([
      { tag: 0x64, values: run(0x12340000, 20) },
      { tag: 0x65, values: run(0, 16) },
      { tag: 0x66, values: run(0, 32) },
      { tag: 0x67, values: run(0, 64) },
      { tag: 0x68, values: run(0, 16) },
      { tag: 0x69, values: [0] },
    ])
    expect(readCharaColours(wide).brows[0]).toEqual([0, 1])
  })

  it('refuses a missing table or one the wrong size', () => {
    expect(() => readCharaColours(colours(0x67))).toThrow(GameFormatError)
    expect(() => readCharaColours(colours(undefined, 0x68))).toThrow(/not 16/)
    expect(() => readCharaColours(colours(0x69))).toThrow(GameFormatError)
  })
})
