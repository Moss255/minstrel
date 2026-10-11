import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { readTilePlacements } from '../src/grotto.ts'
import { build, type Value } from './table-builder.ts'

// Every number here is made up; only the shapes are the game's.
const n = (v: number): Value => ({ n: v })
const s = (v: string): Value => ({ s: v })

const kind = (number: number, name: string, masks: readonly number[]) => ({
  tag: 0x7e,
  values: [n(number), s(name), ...masks.map(n)],
})

describe('a grotto’s tile places, .bpos', () => {
  it('reads each kind’s number, name and nine masks', () => {
    const bytes = build([
      { tag: 0x7d, values: [n(2)] },
      kind(3, 'R04A', [1, 2, 4, 8, 15, 0, 0, 0, 5]),
      kind(0, 'E01A', [0, 0, 0, 0, 4, 0, 0, 0, 0]),
    ])
    expect(readTilePlacements(bytes)).toEqual([
      { unknown_0: 3, name: 'R04A', directions: [1, 2, 4, 8, 15, 0, 0, 0, 5] },
      { unknown_0: 0, name: 'E01A', directions: [0, 0, 0, 0, 4, 0, 0, 0, 0] },
    ])
  })

  it('refuses a kind with too few values or no name', () => {
    expect(() =>
      readTilePlacements(build([{ tag: 0x7e, values: [n(1), s('R04A'), n(0)] }])),
    ).toThrow(GameFormatError)
    expect(() =>
      readTilePlacements(build([{ tag: 0x7e, values: [n(1), n(7), ...Array(9).fill(n(0))] }])),
    ).toThrow(GameFormatError)
  })
})
