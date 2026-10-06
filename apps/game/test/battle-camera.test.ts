import { describe, expect, it } from 'vitest'
import { chasePose, followChase, startChase } from '../src/battle-camera.ts'

const hero = { index: 0, x: 0, z: 3, facing: Math.PI, height: 1.8, radius: 0.5, party: true }
const slime = { index: 0xc0, x: 0, z: -3, facing: 0, height: 0.8, radius: 0.8, party: false }
const plain = () => ({ action: 1, kept: { height: 0, yaw: 0 }, tall: false, tallDraws: () => 0 })

describe('the chase shot, as `0216ea38` aims it', () => {
  it('on a low draw: 1 up, and the larger of 1.6 times the gap and 7 away', () => {
    const chase = startChase(0, 0xc0, 10, false, plain())
    const pose = chasePose(hero, slime, chase, 0)
    expect(pose.orbit.height).toBe(1)
    expect(pose.orbit.distance).toBeCloseTo(Math.max(1.6 * 6, 7))
  })

  it('looks at the actor’s side, carried 2 toward the target, no higher than 1', () => {
    // An even draw takes the actor's side; a gap of 7 halves past 3, so 2.
    const far = { ...slime, z: -4 }
    const pose = chasePose(hero, far, startChase(0, 0xc0, 40, false, plain()), 0)
    expect(pose.look[2]).toBeCloseTo(1)
    expect(pose.look[1]).toBe(1)
  })

  it('turns 162° off the line, whichever way is nearer the yaw it has', () => {
    const pose = chasePose(hero, slime, startChase(0, 0xc0, 40, false, plain()), 0)
    const along = Math.atan2(0, -1)
    const off = Math.abs(pose.orbit.yaw - along)
    expect(Math.min(off, 2 * Math.PI - off)).toBeCloseTo((162 * Math.PI) / 180)
  })

  it('takes distance and height by the pair’s indices mod 3 on a draw of 30 or more', () => {
    // 0 + 0xc0 = 192, which is 0 mod 3: 10 away, 1 up.
    const pose = chasePose(hero, slime, startChase(0, 0xc0, 50, false, plain()), 0)
    expect(pose.orbit).toMatchObject({ distance: 10, height: 1 })
  })

  it('cuts on its first tick, then follows a part of the way', () => {
    const chase = startChase(0, 0xc0, 50, false, plain())
    const want = chasePose(hero, slime, chase, 0)
    followChase(chase, want)
    expect(chase.now?.orbit.distance).toBe(10)
    followChase(chase, { ...want, orbit: { ...want.orbit, distance: 20 } })
    expect(chase.now?.orbit.distance).toBeCloseTo(10 + 10 * 0.02)
  })

  it('keeps a forced start’s tall height and yaw offset for the chases after', () => {
    const giant = { ...slime, height: 4 }
    const kept = { height: 0, yaw: 0 }
    const draws = [0.5, 0.25]
    const first = startChase(0, 0xc0, 50, true, {
      action: 1,
      kept,
      tall: true,
      tallDraws: () => draws.shift() ?? 0,
    })
    expect(kept.height).toBeCloseTo(-1.6)
    expect(kept.yaw).toBeCloseTo(Math.PI * (0.35 - 0.7 * 0.25))
    const flat = chasePose(hero, giant, { ...first, kept: { height: -1.6, yaw: 0 } }, 0)
    const turned = chasePose(hero, giant, first, 0)
    expect(turned.orbit.height).toBeCloseTo(-1.6)
    const turn = turned.orbit.yaw - flat.orbit.yaw
    expect(Math.atan2(Math.sin(turn), Math.cos(turn))).toBeCloseTo(kept.yaw)
    expect(turned.orbit.distance).toBeGreaterThanOrEqual(8)
    expect(turned.look[1]).toBe(2.5)
    // Unforced, nothing is drawn; the kept ones still apply.
    const later = startChase(0, 0xc0, 50, false, {
      action: 1,
      kept,
      tall: true,
      tallDraws: () => 1,
    })
    expect(kept.height).toBeCloseTo(-1.6)
    expect(chasePose(hero, giant, later, 0).orbit.height).toBeCloseTo(-1.6)
  })

  it('leaves the yaw offset off for Frizz, Frizzle and Kafrizz', () => {
    const kept = { height: -1.2, yaw: 1 }
    const giant = { ...slime, height: 4 }
    const frizz = startChase(0, 0xc0, 50, false, {
      action: 9,
      kept,
      tall: true,
      tallDraws: () => 0,
    })
    const attack = startChase(0, 0xc0, 50, false, {
      action: 1,
      kept,
      tall: true,
      tallDraws: () => 0,
    })
    const a = chasePose(hero, giant, frizz, 0).orbit.yaw
    const b = chasePose(hero, giant, attack, 0).orbit.yaw
    const turn = Math.abs(b - a)
    expect(Math.min(turn, 2 * Math.PI - turn)).toBeCloseTo(1)
  })

  it('settles once its count is out and the look-at is within 5', () => {
    const forced = startChase(0, 0xc0, 50, true, plain())
    const want = chasePose(hero, slime, forced, 0)
    for (let i = 0; i < 5; i++) followChase(forced, want)
    expect(forced.settled).toBe(false)
    followChase(forced, want)
    expect(forced.settled).toBe(true)
    const unforced = startChase(0, 0xc0, 50, false, plain())
    followChase(unforced, want)
    expect(unforced.settled).toBe(true)
  })
})
