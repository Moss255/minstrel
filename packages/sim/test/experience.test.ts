import { describe, expect, it } from 'vitest'
import { bandAdd, experienceShares } from '../src/index.ts'

const bands = [
  { upTo: 10000, add: 4 },
  { upTo: 20000, add: 3 },
  { upTo: undefined, add: 2 },
]
const member = (level: number, rounds: number, down = false) => ({ level, rounds, down })

describe('sharing a battle’s experience', () => {
  it('goes by level plus the band’s number, times rounds, and rounds each share up', () => {
    // (4 + 1) × 5 = 25 and (4 + 3) × 5 = 35, of 60: 41.67 and 58.33.
    expect(experienceShares(100, [member(1, 5), member(3, 5)], bands)).toEqual([42, 59])
  })

  it('gives the whole to one alone', () => {
    expect(experienceShares(37, [member(12, 3)], bands)).toEqual([37])
  })

  it('gives nothing to one down, and leaves them out of the others’ weighing', () => {
    expect(experienceShares(90, [member(2, 4), member(9, 4, true), member(2, 4)], bands)).toEqual([
      45, 0, 45,
    ])
  })

  it('gives less to one who took part in fewer rounds', () => {
    // 6 × 4 = 24 and 6 × 2 = 12, of 36.
    expect(experienceShares(30, [member(2, 4), member(2, 2)], bands)).toEqual([20, 10])
  })

  it('leans on level more as the total climbs past a band', () => {
    // At 10,000 the band adds 4: (4+1) and (4+9), 5 : 13.
    expect(experienceShares(10000, [member(1, 1), member(9, 1)], bands)).toEqual([2778, 7223])
    // Past 20,000 it adds 2: (2+1) and (2+9), 3 : 11.
    expect(experienceShares(28000, [member(1, 1), member(9, 1)], bands)).toEqual([6000, 22000])
  })

  it('multiplies by 1.05 first for one whose record says so', () => {
    expect(experienceShares(100, [{ ...member(5, 1), bonus: true }], bands)).toEqual([105])
  })

  it('takes a sum of nothing as one, and pays nothing', () => {
    expect(experienceShares(50, [member(3, 0)], bands)).toEqual([0])
  })

  it('finds the band the game finds, and 4 without one', () => {
    expect(bandAdd(bands, 10000)).toBe(4)
    expect(bandAdd(bands, 10001)).toBe(3)
    expect(bandAdd(bands, 20001)).toBe(2)
    expect(bandAdd([], 5)).toBe(4)
    expect(bandAdd([{ upTo: 10, add: 7 }], 11)).toBe(4)
  })
})
