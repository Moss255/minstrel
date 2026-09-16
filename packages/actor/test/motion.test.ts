import { describe, expect, it } from 'vitest'
import { ANIMATION_FPS, motionAdvance, TICK_RATE } from '../src/motion.ts'

describe('motionAdvance', () => {
  it('plays an idle on time, at the animation rate', () => {
    expect(motionAdvance({ moving: false, ticks: TICK_RATE, travelled: 0 })).toBe(ANIMATION_FPS)
    expect(motionAdvance({ moving: false, ticks: 1, travelled: 0 })).toBeCloseTo(0.5)
  })

  it('plays a gait on time too, however far each step carries', () => {
    expect(motionAdvance({ moving: true, ticks: 2, travelled: 0.01 })).toBe(1)
    expect(motionAdvance({ moving: true, ticks: 2, travelled: 0.5 })).toBe(1)
  })

  it('holds a character asked to move who covered no ground', () => {
    expect(motionAdvance({ moving: true, ticks: 2, travelled: 0 })).toBe(0)
  })
})
