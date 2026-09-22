import { describe, expect, it } from 'vitest'
import type { BattleRng } from '../src/battle/rng.ts'
import {
  LEVEL_TURNS,
  levelled,
  moved,
  poisonDamage,
  sleptThrough,
  wornAfterTurn,
} from '../src/battle/states.ts'

/** A generator that always draws the same, below any bound: the odds, tested at their edge. */
const drawing = (value: number) => ({ below: () => value }) as unknown as BattleRng

describe('changes of state, as the reference keeps them', () => {
  it('multiplies a stat by its level — a quarter, a half, as it is, one and a half, twice', () => {
    expect([-2, -1, 0, 1, 2].map((level) => levelled(10, level))).toEqual([3, 5, 10, 15, 20])
    // Rounded half up, as the game's `RoundUp` does: 9 at a level and a half
    // is 13.5, and 10 at a quarter is 2.5.
    expect(levelled(9, 1)).toBe(14)
    expect(levelled(10, -2)).toBe(3)
    expect(levelled(9, 5)).toBe(18)
  })

  it('moves a level for seven turns, and not past two either way', () => {
    expect(moved({ level: 0, turns: 0 }, -1)).toEqual({ level: -1, turns: LEVEL_TURNS })
    expect(moved({ level: -2, turns: 3 }, -1)).toBeUndefined()
    expect(moved({ level: 1, turns: 3 }, 1)).toEqual({ level: 2, turns: LEVEL_TURNS })
  })

  it('wears a level off only once its turns are out, by 62, 75, 87 and 100 in 100', () => {
    expect(wornAfterTurn({ level: -1, turns: 2 }, drawing(0))).toEqual({
      level: { level: -1, turns: 1 },
      wore: false,
    })
    expect(wornAfterTurn({ level: -1, turns: 1 }, drawing(62)).wore).toBe(true)
    expect(wornAfterTurn({ level: -1, turns: 1 }, drawing(63)).wore).toBe(false)
    // The 75 wants the draw one lower: 74 wears it off, 75 does not.
    expect(wornAfterTurn({ level: 1, turns: 0 }, drawing(74)).wore).toBe(true)
    expect(wornAfterTurn({ level: 1, turns: 0 }, drawing(75)).wore).toBe(false)
    expect(wornAfterTurn({ level: 1, turns: -5 }, drawing(99)).wore).toBe(true)
  })

  it('keeps a sleeper asleep two turns, then wakes it by 37, 62, 87 and 100 in 100', () => {
    expect(sleptThrough(2, drawing(0))).toEqual({ sleep: 1, woke: false })
    expect(sleptThrough(1, drawing(37))).toEqual({ sleep: undefined, woke: true })
    expect(sleptThrough(1, drawing(38))).toEqual({ sleep: 0, woke: false })
    expect(sleptThrough(0, drawing(62)).woke).toBe(true)
    expect(sleptThrough(-5, drawing(99)).woke).toBe(true)
  })

  it('takes a sixteenth of maximum HP for poison', () => {
    expect([15, 16, 20, 33].map(poisonDamage)).toEqual([0, 1, 1, 2])
  })
})
