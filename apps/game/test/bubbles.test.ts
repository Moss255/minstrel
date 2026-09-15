import type { MapTransition, SpriteAnimation } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { BUBBLE_SHEETS, bubbleFrame, doorAhead } from '../src/bubbles.ts'

/** A doorway as the reader gives one, written out for the test; no cartridge bytes. */
const door = (x: number, z: number): MapTransition =>
  ({
    tag: 0x72,
    to: 'M01M02',
    x,
    y: 0,
    z,
    width: 0.2,
    height: 0.25,
    depth: 0.05,
    angle: 0,
    arriveX: 0,
    arriveY: 0,
    arriveZ: 0,
    arriveFacing: 0,
  }) as MapTransition

describe('the mark over the Hero’s head', () => {
  it('names a sheet for talking, examining and going through a door', () => {
    expect(BUBBLE_SHEETS).toEqual({ talk: 'fuki_com', examine: 'fuki_hkn', door: 'fuki_in' })
  })

  it('goes round its sheet’s animation, a step for as many sixtieths as it says', () => {
    // As `com_fuki` is: frames 0, 1, 2 and 1, for 10 each.
    const animations = [
      {
        name: 'com_fuki',
        steps: [
          { frame: 0, duration: 10 },
          { frame: 1, duration: 10 },
          { frame: 2, duration: 10 },
          { frame: 1, duration: 10 },
        ],
      },
    ] as unknown as SpriteAnimation[]
    expect([0, 9, 10, 25, 35, 40].map((t) => bubbleFrame(animations, t))).toEqual([
      0, 0, 1, 2, 1, 0,
    ])
    expect(bubbleFrame([], 12)).toBe(0)
  })

  it('finds the doorway just ahead, and not the one already stood in', () => {
    const doors = [door(0, 1)]
    // Facing along +z, a step short of it.
    expect(doorAhead(doors, { x: 0, z: 0.85, facing: 0 }, 0.12)?.to).toBe('M01M02')
    // Facing away, or too far off.
    expect(doorAhead(doors, { x: 0, z: 0.85, facing: Math.PI }, 0.12)).toBeUndefined()
    expect(doorAhead(doors, { x: 0, z: 0.5, facing: 0 }, 0.12)).toBeUndefined()
    // Standing in it already: that is the way they came.
    expect(doorAhead(doors, { x: 0, z: 1, facing: 0 }, 0.12)).toBeUndefined()
  })
})
