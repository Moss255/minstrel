import { describe, expect, it } from 'vitest'
import { DS_HEIGHT, DS_WIDTH, placement } from '../src/reference.ts'

describe('reference-mode placement', () => {
  it('uses the DS screen size', () => {
    expect(DS_WIDTH).toBe(256)
    expect(DS_HEIGHT).toBe(192)
  })

  it('scales by a whole number, so a hardware pixel stays a square block', () => {
    // 1000/256 is 3.9 and 700/192 is 3.6; the smaller, floored, is 3.
    const place = placement(1000, 700)
    expect(place.scale).toBe(3)
    expect(place.width).toBe(DS_WIDTH * 3)
    expect(place.height).toBe(DS_HEIGHT * 3)
  })

  it('centres the image', () => {
    const place = placement(1000, 700)
    expect(place.x).toBe(Math.floor((1000 - place.width) / 2))
    expect(place.y).toBe(Math.floor((700 - place.height) / 2))
  })

  it('fits exactly at a whole multiple', () => {
    const place = placement(DS_WIDTH * 4, DS_HEIGHT * 4)
    expect(place.scale).toBe(4)
    expect(place.x).toBe(0)
    expect(place.y).toBe(0)
  })

  it('is limited by whichever axis is tighter', () => {
    // Very wide but short: height decides.
    expect(placement(4000, DS_HEIGHT * 2).scale).toBe(2)
    // Very tall but narrow: width decides.
    expect(placement(DS_WIDTH * 2, 4000).scale).toBe(2)
  })

  it('never scales below one, even on a canvas smaller than a DS screen', () => {
    const place = placement(100, 80)
    expect(place.scale).toBe(1)
    expect(place.width).toBe(DS_WIDTH)
  })

  it('keeps the DS aspect ratio at every size', () => {
    for (const [w, h] of [
      [1920, 1080],
      [800, 600],
      [1280, 800],
      [640, 480],
    ] as const) {
      const place = placement(w, h)
      expect(place.width / place.height, `${w}x${h}`).toBeCloseTo(DS_WIDTH / DS_HEIGHT, 6)
    }
  })
})
