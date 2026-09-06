import { describe, expect, it } from 'vitest'
import { ANIMATION_FPS, motionAdvance, strideOf, TICK_RATE } from '../src/motion.ts'

/** The village's walk cycle and the speed the character walks it at. */
const frameCount = 9
const unitsPerTick = 0.012

describe('standing', () => {
  it('runs at the rate the hardware plays an animation, not the simulation rate', () => {
    // The bug: one frame per tick ran a nine-frame idle nearly seven times a
    // second, which reads as the character shaking rather than breathing.
    const perSecond = motionAdvance({
      moving: false,
      ticks: TICK_RATE,
      travelled: 0,
      frameCount,
      unitsPerTick,
    })
    expect(perSecond).toBeCloseTo(ANIMATION_FPS, 6)
    expect(perSecond / frameCount).toBeLessThan(4)
  })

  it('ignores any distance it is given', () => {
    const still = motionAdvance({ moving: false, ticks: 6, travelled: 0, frameCount, unitsPerTick })
    const shoved = motionAdvance({
      moving: false,
      ticks: 6,
      travelled: 5,
      frameCount,
      unitsPerTick,
    })
    expect(shoved).toBe(still)
  })
})

describe('walking', () => {
  it('plays one cycle per stride', () => {
    const stride = strideOf(frameCount, unitsPerTick)
    const advance = motionAdvance({
      moving: true,
      ticks: 60,
      travelled: stride,
      frameCount,
      unitsPerTick,
    })
    expect(advance).toBeCloseTo(frameCount, 6)
  })

  it('matches the standing rate when it is moving at full speed', () => {
    // The two cases are consistent by construction: at full speed the cycle
    // plays at the same frames a second as an idle does.
    const ticks = TICK_RATE
    const advance = motionAdvance({
      moving: true,
      ticks,
      travelled: unitsPerTick * ticks,
      frameCount,
      unitsPerTick,
    })
    expect(advance).toBeCloseTo(ANIMATION_FPS, 6)
  })

  it('stops stepping when a wall stops the character', () => {
    // Pressed into a wall: the keys are down and the ticks pass, but no ground
    // is covered, so the legs stop rather than running on the spot.
    expect(motionAdvance({ moving: true, ticks: 60, travelled: 0, frameCount, unitsPerTick })).toBe(
      0,
    )
  })

  it('slows with the character rather than with the clock', () => {
    const full = motionAdvance({
      moving: true,
      ticks: 60,
      travelled: unitsPerTick * 60,
      frameCount,
      unitsPerTick,
    })
    const half = motionAdvance({
      moving: true,
      ticks: 60,
      travelled: unitsPerTick * 30,
      frameCount,
      unitsPerTick,
    })
    expect(half).toBeCloseTo(full / 2, 6)
  })
})

describe('a motion with no frames', () => {
  it('advances by nothing rather than dividing by zero', () => {
    expect(
      motionAdvance({ moving: true, ticks: 60, travelled: 1, frameCount: 0, unitsPerTick }),
    ).toBe(0)
    expect(
      motionAdvance({ moving: false, ticks: 60, travelled: 0, frameCount: 0, unitsPerTick }),
    ).toBe(0)
  })

  it('does not divide by a standing-still speed', () => {
    expect(
      motionAdvance({ moving: true, ticks: 60, travelled: 1, frameCount, unitsPerTick: 0 }),
    ).toBe(0)
  })
})
