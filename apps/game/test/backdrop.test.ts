import { describe, expect, it } from 'vitest'
import { gradientOf, horizonRow } from '../src/backdrop.ts'

describe('the gradient behind a map', () => {
  it('puts the horizon on the row a level point far ahead falls on', () => {
    expect(horizonRow(0, Math.PI / 8)).toBe(0.5)
    // Looking down, the horizon rises; far enough, it leaves the top, and is the top.
    expect(horizonRow(0.1, Math.PI / 8)).toBeLessThan(0.5)
    expect(horizonRow(1.2, Math.PI / 8)).toBe(0)
    expect(horizonRow(-1.2, Math.PI / 8)).toBe(1)
    expect(horizonRow(0, Math.PI / 8, 0.1)).toBeCloseTo(0.6)
  })

  it('blends a whole change per half screen, the far end the background', () => {
    // The day at Angel Falls' field stage: background 0x7dc0, horizon 0x7fe0.
    const slot = { background: 0x7dc0, horizon: 0x7fe0 }
    const middle = gradientOf(slot, 0.5)
    expect(middle.top).toEqual([0, 14 / 31, 1])
    expect(middle.middle).toEqual([0, 1, 1])
    // Half a screen below the row is the background again.
    expect(middle.bottom).toEqual([0, 14 / 31, 1])
    // The horizon high up: the top, a fifth of a screen above it, only part of the way.
    const high = gradientOf(slot, 0.2)
    expect(high.bottom).toEqual([0, 14 / 31, 1])
    expect(high.top[1]).toBeCloseTo((31 + Math.trunc(((14 - 31) / 0.5) * 0.2)) / 31)
  })
})
