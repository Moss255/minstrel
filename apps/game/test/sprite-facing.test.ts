import { describe, expect, it } from 'vitest'
import { type CastSprite, standingFrame, walkingFrame } from '../src/cast.ts'

/**
 * Which way a sprite character shows itself, against the camera.
 *
 * `yaw` is where the eye sits from the focus — `cameraEye` puts it at
 * `(sin yaw, cos yaw)` — so a character whose facing equals it looks at you.
 * These were the other way round until 26 September 2026, and a villager
 * turned to talk showed the back of their head.
 */
const NAMES = [
  'stand_down',
  'stand_l_down',
  'stand_left',
  'stand_l_up',
  'stand_up',
  'stand_r_up',
  'stand_right',
  'stand_r_down',
  'walk_down',
  'walk_left',
  'walk_up',
  'walk_right',
]

/** A sheet whose every animation is one step, on a frame numbered for its name. */
function member(facing: number): CastSprite {
  const sprite = {
    animation: (name: string) => {
      const frame = NAMES.indexOf(name)
      return frame < 0 ? undefined : { steps: [{ frame, duration: 8, order: 0 }] }
    },
  }
  return { placement: { facing } as CastSprite['placement'], sprite } as unknown as CastSprite
}
const shown = (facing: number, yaw: number) => NAMES[standingFrame(member(facing), yaw)]
const walking = (facing: number, yaw: number) => NAMES[walkingFrame(member(facing), yaw, 0)]

describe('a sprite character’s facing, against the camera', () => {
  const yaw = 0.3

  it('shows its face when it faces where the eye is', () => {
    expect(shown(yaw, yaw)).toBe('stand_down')
    expect(walking(yaw, yaw)).toBe('walk_down')
  })

  it('shows its back when it faces the way the camera looks', () => {
    expect(shown(yaw + Math.PI, yaw)).toBe('stand_up')
    expect(walking(yaw + Math.PI, yaw)).toBe('walk_up')
  })

  it('keeps the sides as they were — the village dog’s head at its front', () => {
    // Unchanged by the fix: the old reading had these right, by accident.
    expect(shown(yaw + Math.PI / 2, yaw)).toBe('stand_left')
    expect(shown(yaw - Math.PI / 2, yaw)).toBe('stand_right')
    expect(walking(yaw + Math.PI / 2, yaw)).toBe('walk_left')
    expect(walking(yaw - Math.PI / 2, yaw)).toBe('walk_right')
  })

  it('goes round all eight with the angle', () => {
    const round = Array.from({ length: 8 }, (_, i) => shown(yaw + (i * Math.PI) / 4, yaw))
    expect(round).toEqual(NAMES.slice(0, 8))
  })
})
