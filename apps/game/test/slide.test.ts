import { describe, expect, it } from 'vitest'
import {
  aimSlides,
  moveSlides,
  SLIDE_SPEED,
  type SlidingPiece,
  slideCollisionName,
  startSlides,
} from '../src/slide.ts'

/** A statue like the Hexagon's: at home from step 5, 0.432 to the left before. */
const statue: SlidingPiece = {
  stem: 'D01M01S1',
  piece: 14,
  mesh: 1,
  id: 202,
  home: { x: 0.435, z: -1.709 },
}

describe('sliding pieces', () => {
  it('names a sliding piece’s collision as a door’s is, with S for D', () => {
    expect(slideCollisionName('D01M01S1')).toBe('D01A01S1')
    expect(slideCollisionName('M01M00D1')).toBeUndefined()
    expect(slideCollisionName('D01M0100')).toBeUndefined()
  })

  it('stands a piece where its character stands, from the start', () => {
    const [slide] = startSlides([statue], () => ({ x: 0.003, z: -1.705 }))
    expect(slide?.offset.x).toBeCloseTo(-0.432, 3)
    expect(slide?.offset.z).toBeCloseTo(0.004, 3)
    // Nobody to follow: where the map puts it.
    expect(startSlides([statue], () => undefined)[0]?.offset).toEqual({ x: 0, z: 0 })
  })

  it('slides it home at its speed once its character stands there', () => {
    const slides = startSlides([statue], () => ({ x: 0.003, z: -1.709 }))
    aimSlides(slides, () => statue.home)
    expect(moveSlides(slides, 0.5)).toBe(true)
    expect(slides[0]?.offset.x).toBeCloseTo(-0.432 + SLIDE_SPEED * 0.5, 3)
    moveSlides(slides, 10)
    expect(slides[0]?.offset).toEqual({ x: 0, z: 0 })
    expect(moveSlides(slides, 1)).toBe(false)
  })
})
