import { describe, expect, it } from 'vitest'
import { dangerOf, type PanelView, panelsPlaced, pulseColour } from '../src/battle-screen.ts'

const panel = (large: boolean): PanelView => ({
  place: 0,
  name: 'Hero',
  hp: 10,
  maxHp: 10,
  mp: 0,
  maxMp: 0,
  large,
  box: '',
  chosen: false,
  status: undefined,
  level: 1,
})

describe('the battle’s bottom screen', () => {
  it('stacks the panels from the top with one large, from 32 with none (`func_ov000_02174b14`)', () => {
    expect(panelsPlaced([panel(true), panel(false), panel(false), panel(false)])).toEqual([
      { y: 0, large: true },
      { y: 72, large: false },
      { y: 112, large: false },
      { y: 152, large: false },
    ])
    expect(panelsPlaced([panel(false), panel(false)]).map((p) => p.y)).toEqual([32, 72])
  })

  it('colours the HP by what is left: a quarter, 8 % and none (`func_ov000_02170c7c`)', () => {
    expect([dangerOf(100, 100), dangerOf(25, 100), dangerOf(8, 100), dangerOf(0, 100)]).toEqual([
      0, 1, 2, 3,
    ])
    expect(dangerOf(26, 100)).toBe(0)
  })

  it('pulses the acting member’s border from yellow to grey (`func_ov000_02170b0c`)', () => {
    // sin 0 = 0: t = 1, red and green 31, blue 0 — yellow.
    expect(pulseColour(0)).toBe(31 | (31 << 5))
    // sin π/2 = 1: t = 0, grey (10, 10, 10).
    expect(pulseColour(Math.PI / 2)).toBe(10 | (10 << 5) | (10 << 10))
  })
})
