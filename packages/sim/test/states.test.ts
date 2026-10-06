import { describe, expect, it } from 'vitest'
import type { BattleRng } from '../src/battle/rng.ts'
import {
  countDown,
  LEVEL_COUNTS,
  levelled,
  moved,
  poisonDamage,
  runDown,
  sleptThrough,
  WEAR_OF,
  WEAR_TABLE,
  WEAR_TABLE_SLOW,
  wakes,
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

  it('moves a level, its count set again, and not past two either way', () => {
    expect(moved({ level: 0, turns: 0 }, -1, 6)).toEqual({ level: -1, turns: 6 })
    expect(moved({ level: -2, turns: 3 }, -1, 6)).toBeUndefined()
    // A setter clears the second count (`func_020878b4`, `0x02087908`).
    expect(moved({ level: 1, turns: 0, wearing: 2 }, 1, 5)).toEqual({ level: 2, turns: 5 })
    // Brought back to 0, it is cleared (`0x020878e0`).
    expect(moved({ level: 1, turns: 4 }, -1, 6)).toEqual({ level: 0, turns: 0 })
  })
})

describe('how a status runs down — the game’s (`func_ov000_0215858c`, `021599f4`)', () => {
  it('sets the counts its setters store', () => {
    // `func_020877c0` 5, `020878b4` 6, the agility and charm setters 6, might,
    // mending and the wards 5, Fizzle 6, 0 Zone and Rough 'n' Tumble 5.
    expect(LEVEL_COUNTS).toEqual({
      attack: 5,
      defence: 6,
      agility: 6,
      might: 5,
      mending: 5,
      spells: 5,
      breaths: 5,
      fizzled: 6,
      // `func_02088854`, dazzle's; `02088994`, Vanish's.
      dazzled: 4,
      vanished: 5,
      // `func_02088a34`, Rotstopper's.
      rotstop: 4,
      zeroZone: 5,
      tumble: 5,
      // `func_0208826c`, rider 11's.
      paralysed: 3,
    })
  })

  it('takes a pass off the count, and at 0 starts the second (`0x02159c14`)', () => {
    expect(countDown({ level: -1, turns: 6 }, 4)).toEqual({ level: -1, turns: 5 })
    expect(countDown({ level: -1, turns: 1 }, 4)).toEqual({ level: -1, turns: 0, wearing: 4 })
    // Nothing held, or the second already running: left as it is.
    const running = { level: 2, turns: 0, wearing: 3 }
    expect(countDown(running, 4)).toBe(running)
    expect(countDown({ level: 0, turns: 0 }, 4)).toEqual({ level: 0, turns: 0 })
  })

  it('wears it off where the table by the second count is above the draw', () => {
    // The tables at `0x02182ad4` and `0x02182bd4`, with their fifth word.
    expect(WEAR_TABLE.slice(0, 4)).toEqual([1, 0.875, 0.75, 0.625])
    expect(WEAR_TABLE_SLOW.slice(0, 4)).toEqual([1, 0.875, 0.625, 0.375])
    expect(WEAR_TABLE[4]).toBeGreaterThan(0)
    expect(WEAR_TABLE[4]).toBeLessThan(1e-38)
    // Its odds over the passes: 63, 75, 88 and 100 in 100 by the first; the
    // spells' ward 38, 63, 88, 100 by the second.
    const odds = (wearing: number, table: readonly number[]) =>
      Array.from({ length: 100 }, (_, d) => d).filter(
        (d) => runDown({ level: 1, turns: 0, wearing }, table, drawing(d)).wore,
      ).length
    expect([4, 3, 2, 1].map((w) => odds(w, WEAR_TABLE))).toEqual([63, 75, 88, 100])
    expect([4, 3, 2, 1].map((w) => odds(w, WEAR_TABLE_SLOW))).toEqual([38, 63, 88, 100])
    expect(WEAR_OF.spells.table).toBe(WEAR_TABLE_SLOW)
    // 0 Zone's second count starts at 1: gone on the next pass, whatever the draw.
    expect(WEAR_OF.zeroZone.start).toBe(1)
    expect(odds(1, WEAR_OF.zeroZone.table)).toBe(100)
  })

  it('keeps it where the draw is not under, the second count a pass less', () => {
    expect(runDown({ level: -1, turns: 0, wearing: 4 }, WEAR_TABLE, drawing(70))).toEqual({
      level: { level: -1, turns: 0, wearing: 3 },
      wore: false,
    })
    // No second count running: no draw, nothing changed.
    let drawn = 0
    const counting = {
      below: () => {
        drawn++
        return 0
      },
    } as unknown as BattleRng
    const held = { level: 1, turns: 3 }
    expect(runDown(held, WEAR_TABLE, counting)).toEqual({ level: held, wore: false })
    expect(drawn).toBe(0)
  })
  it('keeps a sleeper asleep two turns, then wakes it by 37, 62, 87 and 100 in 100', () => {
    expect(sleptThrough(2, drawing(0))).toEqual({ sleep: 1, woke: false })
    expect(sleptThrough(1, drawing(37))).toEqual({ sleep: undefined, woke: true })
    expect(sleptThrough(1, drawing(38))).toEqual({ sleep: 0, woke: false })
    expect(sleptThrough(0, drawing(62)).woke).toBe(true)
    expect(sleptThrough(-5, drawing(99)).woke).toBe(true)
  })

  it('takes a sixteenth of maximum HP for envenomation, at least 1 and at most 999', () => {
    // `func_ov000_0215a23c`, `0x0215a5dc`–`0x0215a5f4`.
    expect([15, 16, 20, 33, 999, 65_535].map(poisonDamage)).toEqual([1, 1, 1, 2, 62, 999])
  })
})

describe('waking, the game’s way', () => {
  it('has no chance on the first sleeping turn, then 38, 63, 88 and 100 in 100', () => {
    expect(wakes(0, 0)).toBe(false)
    const odds = (turns: number) =>
      Array.from({ length: 100 }, (_, d) => d).filter((d) => wakes(turns, d)).length
    expect([1, 2, 3, 4, 9].map(odds)).toEqual([38, 63, 88, 100, 100])
  })
})
