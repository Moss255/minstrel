import { describe, expect, it } from 'vitest'
import { chasePose, followChase, startChase } from '../src/battle-camera.ts'

const hero = { index: 0, x: 0, z: 3, facing: Math.PI, height: 1.8, radius: 0.5, party: true }
const slime = { index: 0xc0, x: 0, z: -3, facing: 0, height: 0.8, radius: 0.8, party: false }

describe('the chase shot, as `0216ea38` aims it', () => {
  it('on a low draw: 1 up, and the larger of 1.6 times the gap and 7 away', () => {
    const chase = startChase(0, 0xc0, 10, false, 0)
    const pose = chasePose(hero, slime, chase, 0)
    expect(pose.orbit.height).toBe(1)
    expect(pose.orbit.distance).toBeCloseTo(Math.max(1.6 * 6, 7))
  })

  it('looks at the actor’s side, carried 2 toward the target, no higher than 1', () => {
    // An even draw takes the actor's side; a gap of 7 halves past 3, so 2.
    const far = { ...slime, z: -4 }
    const pose = chasePose(hero, far, startChase(0, 0xc0, 40, false, 0), 0)
    expect(pose.look[2]).toBeCloseTo(1)
    expect(pose.look[1]).toBe(1)
  })

  it('turns 162° off the line, whichever way is nearer the yaw it has', () => {
    const pose = chasePose(hero, slime, startChase(0, 0xc0, 40, false, 0), 0)
    const along = Math.atan2(0, -1)
    const off = Math.abs(pose.orbit.yaw - along)
    expect(Math.min(off, 2 * Math.PI - off)).toBeCloseTo((162 * Math.PI) / 180)
  })

  it('takes distance and height by the pair’s indices mod 3 on a draw of 30 or more', () => {
    // 0 + 0xc0 = 192, which is 0 mod 3: 10 away, 1 up.
    const pose = chasePose(hero, slime, startChase(0, 0xc0, 50, false, 0), 0)
    expect(pose.orbit).toMatchObject({ distance: 10, height: 1 })
  })

  it('cuts on its first tick, then follows a part of the way', () => {
    const chase = startChase(0, 0xc0, 50, false, 0)
    const want = chasePose(hero, slime, chase, 0)
    followChase(chase, want)
    expect(chase.now?.orbit.distance).toBe(10)
    followChase(chase, { ...want, orbit: { ...want.orbit, distance: 20 } })
    expect(chase.now?.orbit.distance).toBeCloseTo(10 + 10 * 0.02)
  })
})
