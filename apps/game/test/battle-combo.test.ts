import { describe, expect, it } from 'vitest'
import {
  type Combo,
  comboPieces,
  leaveCombo,
  NO_COMBO,
  startCombo,
  tickCombo,
} from '../src/battle-combo.ts'

const fresh = (): Combo => ({ ...NO_COMBO })
const piece = (c: Combo, sheet: string) => comboPieces(c).find((p) => p.sheet === sheet)
const frames = (c: Combo, n: number) => {
  for (let i = 0; i < n; i++) tickCombo(c)
}

describe('the combo display, as overlay 0 draws it', () => {
  it('slides the first level in from the left by the table read at 0x02182590', () => {
    const c = fresh()
    expect(startCombo(c, 1)).toBe(true)
    const xs: number[] = []
    for (let t = 0; t <= 6; t++) {
      xs.push((piece(c, 'bt_combo_line')?.x ?? 0) - 2)
      tickCombo(c)
    }
    expect(xs).toEqual([-64, -44, -28, -16, -7, -1, 0])
  })

  it('holds the first level’s bottom row back until its sixth frame', () => {
    const c = fresh()
    startCombo(c, 1)
    frames(c, 5)
    expect(piece(c, 'bt_combo_dama')).toBeUndefined()
    tickCombo(c)
    expect(piece(c, 'bt_combo_dama')?.x).toBe(3 - 44)
    frames(c, 10)
    expect(comboPieces(c).map((p) => [p.sheet, p.x, p.y])).toEqual([
      ['bt_combo_line', 2, 31],
      ['bt_combo2', 11, 8],
      ['bt_combo1_en', 28, 20],
      ['bt_combo_dama', 3, 33],
      ['bt_combo_x', 36, 34],
      ['bt_combo_12', 48, 33],
    ])
  })

  it('brings a higher count in over the last, fading it, and the bottom row from −215', () => {
    const c = fresh()
    startCombo(c, 1)
    frames(c, 30)
    expect(startCombo(c, 2)).toBe(true)
    expect(piece(c, 'bt_combo3')?.x).toBe(11 - 16)
    expect(piece(c, 'bt_combo2')?.alpha).toBe(31)
    expect(piece(c, 'bt_combo_dama')?.x).toBe(3 - 215)
    tickCombo(c)
    expect(piece(c, 'bt_combo2')?.alpha).toBe(25)
    frames(c, 5)
    expect(piece(c, 'bt_combo2')).toBeUndefined()
  })

  it('words the top of the chain its own way, with ×2 at 51', () => {
    const c = fresh()
    startCombo(c, 7)
    frames(c, 30)
    expect(piece(c, 'bt_combo2_en')).toBeDefined()
    expect(piece(c, 'bt_combo4')).toBeDefined()
    expect(piece(c, 'bt_combo_2')?.x).toBe(51)
  })

  it('lets its coming in finish, then leaves left by 2, 10, 23 and 40 and is gone', () => {
    const c = fresh()
    startCombo(c, 1)
    frames(c, 30)
    leaveCombo(c)
    const xs: number[] = []
    for (let i = 0; i < 5; i++) {
      xs.push((piece(c, 'bt_combo_line')?.x ?? Number.NaN) - 2)
      tickCombo(c)
    }
    expect(xs).toEqual([0, -2, -10, -23, -40])
    expect(comboPieces(c)).toEqual([])
  })

  it('does not restart the same level while it is coming in, and leaves on a 0', () => {
    const c = fresh()
    startCombo(c, 1)
    frames(c, 3)
    expect(startCombo(c, 1)).toBe(false)
    expect(startCombo(c, 0)).toBe(false)
    expect(c.leave).toBe(27 + 5)
  })
})
