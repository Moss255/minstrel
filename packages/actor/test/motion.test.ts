import { describe, expect, it } from 'vitest'
import { ANIMATION_FPS, motionAdvance, strideOf, TICK_RATE } from '../src/motion.ts'

/** The village's walk cycle and the speed the character walks it at. */
const frameCount = 9
const unitsPerTick = 0.012
/** Ground one cycle covers. A length, not a rate — see `STRIDE_HEIGHTS`. */
const stride = strideOf(0.18)

describe('standing', () => {
  it('runs at the rate the hardware plays an animation, not the simulation rate', () => {
    // The bug: one frame per tick ran a nine-frame idle nearly seven times a
    // second, which reads as the character shaking rather than breathing.
    const perSecond = motionAdvance({
      moving: false,
      ticks: TICK_RATE,
      travelled: 0,
      frameCount,
      stride,
    })
    expect(perSecond).toBeCloseTo(ANIMATION_FPS, 6)
    expect(perSecond / frameCount).toBeLessThan(4)
  })

  it('ignores any distance it is given', () => {
    const still = motionAdvance({ moving: false, ticks: 6, travelled: 0, frameCount, stride })
    const shoved = motionAdvance({
      moving: false,
      ticks: 6,
      travelled: 5,
      frameCount,
      stride,
    })
    expect(shoved).toBe(still)
  })
})

describe('walking', () => {
  it('plays one cycle per stride', () => {
    const advance = motionAdvance({
      moving: true,
      ticks: 60,
      travelled: stride,
      frameCount,
      stride,
    })
    expect(advance).toBeCloseTo(frameCount, 6)
  })

  it('steps faster when the character moves faster', () => {
    // The property the old stride could not have. It was derived from the
    // character's speed, so the speed cancelled and the walk played at exactly
    // `ANIMATION_FPS` however fast the character went — which is why an
    // eight-frame cycle ran 7.5 steps a second and slowing the character down
    // did nothing to it. A stride is a length, so the cadence follows the pace.
    const ticks = TICK_RATE
    const brisk = motionAdvance({
      moving: true,
      ticks,
      travelled: unitsPerTick * ticks,
      frameCount,
      stride,
    })
    const strolling = motionAdvance({
      moving: true,
      ticks,
      travelled: unitsPerTick * ticks * 0.5,
      frameCount,
      stride,
    })
    expect(strolling).toBeCloseTo(brisk / 2, 6)
  })

  it('covers one stride of ground per cycle, whatever the frame rate is', () => {
    // The cadence is ground over stride, and nothing else: two strides of
    // ground is two cycles of animation.
    const advance = motionAdvance({
      moving: true,
      ticks: 999,
      travelled: stride * 2,
      frameCount,
      stride,
    })
    expect(advance).toBeCloseTo(frameCount * 2, 6)
  })

  it('stops stepping when a wall stops the character', () => {
    // Pressed into a wall: the keys are down and the ticks pass, but no ground
    // is covered, so the legs stop rather than running on the spot.
    expect(motionAdvance({ moving: true, ticks: 60, travelled: 0, frameCount, stride })).toBe(0)
  })

  it('slows with the character rather than with the clock', () => {
    const full = motionAdvance({
      moving: true,
      ticks: 60,
      travelled: unitsPerTick * 60,
      frameCount,
      stride,
    })
    const half = motionAdvance({
      moving: true,
      ticks: 60,
      travelled: unitsPerTick * 30,
      frameCount,
      stride,
    })
    expect(half).toBeCloseTo(full / 2, 6)
  })
})

describe('a motion with no frames', () => {
  it('advances by nothing rather than dividing by zero', () => {
    expect(motionAdvance({ moving: true, ticks: 60, travelled: 1, frameCount: 0, stride })).toBe(0)
    expect(motionAdvance({ moving: false, ticks: 60, travelled: 0, frameCount: 0, stride })).toBe(0)
  })

  it('does not divide by a stride of nothing', () => {
    expect(motionAdvance({ moving: true, ticks: 60, travelled: 1, frameCount, stride: 0 })).toBe(0)
  })
})

describe('what decides which motion plays', () => {
  /**
   * The frame count resets when the motion changes, so anything that flips the
   * motion spuriously restarts the cycle. Whether the character is walking is a
   * fact about the keys held, not about whether a simulation tick happened to
   * fall inside this rendered frame — and at a 60Hz tick with 60Hz rendering,
   * most other frames run no tick at all.
   */
  it('runs no simulation tick on a frame shorter than one', () => {
    // The shape of the bug: 8ms of real time at a 60Hz tick is no ticks.
    const tickMs = 1000 / 60
    let carry = 0
    const ticksIn = (ms: number) => {
      carry += ms
      let n = 0
      while (carry >= tickMs) {
        carry -= tickMs
        n++
      }
      return n
    }
    const counts = [8, 8, 8, 8, 8, 8].map(ticksIn)
    expect(counts).toContain(0)
    expect(counts).toContain(1)
  })

  it('advances an idle by the same amount however the ticks fall', () => {
    // Driven by elapsed time rather than whole ticks, so the quantisation
    // above cannot reach the animation.
    const frameCount = 17
    /** Ground one cycle covers. A length, not a rate — see `STRIDE_HEIGHTS`. */
    const stride = strideOf(0.18)
    const one = motionAdvance({
      moving: false,
      ticks: (16 * 60) / 1000,
      travelled: 0,
      frameCount,
      stride,
    })
    const split =
      motionAdvance({
        moving: false,
        ticks: (8 * 60) / 1000,
        travelled: 0,
        frameCount,
        stride,
      }) +
      motionAdvance({
        moving: false,
        ticks: (8 * 60) / 1000,
        travelled: 0,
        frameCount,
        stride,
      })
    expect(split).toBeCloseTo(one, 9)
  })
})
