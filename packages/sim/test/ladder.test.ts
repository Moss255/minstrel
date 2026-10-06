import { describe, expect, it } from 'vitest'
import {
  CLIMB_STEP,
  type Climb,
  climbPass,
  type End,
  type Hero,
  type LadderMotion,
  type MotionLength,
  tryClimb,
} from '../src/ladder.ts'

/**
 * Synthetic: a ladder of the shape Dourbridge's has, its facing π — climbing
 * up, the Hero faces −z — bottom at y 0.665 and top 4.377, in words.
 */
const W = (n: number) => Math.round(n * 4096)
const PI = 0x3244
const bottom: End = {
  id: 0,
  partner: 1,
  top: false,
  x: W(9),
  y: W(0.665),
  z: W(19),
  facing: PI,
  leaves: false,
}
const top: End = {
  id: 1,
  partner: 0,
  top: true,
  x: W(9),
  y: W(4.377),
  z: W(19),
  facing: PI,
  leaves: false,
}
const lengths = (m: LadderMotion): MotionLength => ({
  frames: m === 'hasigo_loop' ? 9 : 13,
  speed: W(0.25),
})
const inBox = () => true
/** The pad pushed toward the ladder: along its facing, (sin π, cos π). */
const toward = { x: 0, z: -4096 }

describe('starting a climb', () => {
  const below: Hero = { x: W(9), y: W(0.665), z: W(19.4), facing: PI }

  it('starts on the third pass in a row of pushing toward it', () => {
    let count = 0
    const climbs: (Climb | undefined)[] = []
    for (let pass = 0; pass < 3; pass++) {
      const r = tryClimb([bottom, top], inBox, below, toward, true, true, count)
      count = r.count
      climbs.push(r.climb)
    }
    expect(climbs.map((c) => c !== undefined)).toEqual([false, false, true])
    expect(count).toBe(0)
  })

  it('does not start facing away from it at the bottom, nor standing still, nor held', () => {
    const away = { ...below, facing: 0 }
    expect(tryClimb([bottom], inBox, away, toward, true, true, 2).climb).toBeUndefined()
    expect(tryClimb([bottom, top], inBox, below, toward, false, true, 1).count).toBe(0)
    expect(tryClimb([bottom, top], inBox, below, toward, true, false, 2).climb).toBeUndefined()
  })

  it('at the top wants the Hero facing away from the ladder', () => {
    const above: Hero = { x: W(9), y: W(4.377), z: W(18.6), facing: 0 }
    const r = tryClimb([top, bottom], inBox, above, { x: 0, z: 4096 }, true, true, 2)
    expect(r.climb?.fromTop).toBe(true)
    // The record: the top one lower, and the places it is left at.
    expect(r.climb?.top.y).toBe(top.y - 4096)
    expect(r.climb?.topExit.z).toBe(top.z - 4096)
    expect(r.climb?.bottomExit.z).toBe(bottom.z + 1024)
  })
})

describe('climbing', () => {
  const start = (from: Hero, ends: [End, End] = [bottom, top]) =>
    tryClimb(ends, inBox, from, toward, true, true, 2).climb as Climb

  it('gets on, climbs 0xf5 a pass with Up, gets off at the top and walks off', () => {
    let hero: Hero = { x: W(9), y: W(0.665), z: W(19.4), facing: PI }
    let climb: Climb | undefined = start(hero)
    const steps: number[] = []
    let ys: number[] = []
    for (let pass = 0; pass < 400 && climb; pass++) {
      const r = climbPass(climb, hero, 'up', false, lengths)
      if (r.climb?.step === 2 && climb.step === 2) ys.push(r.hero.y - hero.y)
      hero = r.hero
      climb = r.climb
      if (climb && steps[steps.length - 1] !== climb.step) steps.push(climb.step)
    }
    expect(steps).toEqual([1, 2, 4, 5])
    expect(climb).toBeUndefined()
    ys = [...new Set(ys)]
    expect(ys).toEqual([CLIMB_STEP])
    // Off at the top, one on from it the way the ladder faces.
    expect(hero.y).toBe(top.y)
    expect(hero.z).toBe(top.z - 4096)
  })

  it('keeps x and z on the line from bottom to top', () => {
    const slanted: End = { ...top, x: W(10) }
    let hero: Hero = { x: W(9), y: W(0.665), z: W(19.4), facing: PI }
    let climb = start(hero, [bottom, slanted])
    for (let pass = 0; pass < 30; pass++) {
      const r = climbPass(climb, hero, 'up', false, lengths)
      hero = r.hero
      climb = r.climb as Climb
    }
    expect(climb.step).toBe(2)
    const along = (hero.y - bottom.y) / (slanted.y - 4096 - bottom.y)
    expect(hero.x).toBeCloseTo(W(9) + along * W(1), -1)
  })

  it('holds still, and the loop with it, when nothing is pressed or the field is busy', () => {
    let hero: Hero = { x: W(9), y: W(0.665), z: W(19.4), facing: PI }
    let climb = start(hero)
    for (let pass = 0; pass < 40 && climb.step !== 2; pass++) {
      const r = climbPass(climb, hero, undefined, false, lengths)
      hero = r.hero
      climb = r.climb as Climb
    }
    const was = hero.y
    const a = climbPass(climb, hero, undefined, false, lengths)
    expect(a.hero.y).toBe(was)
    expect(a.climb?.paused).toBe(true)
    const b = climbPass(a.climb as Climb, a.hero, 'up', true, lengths)
    expect(b.hero.y).toBe(was)
  })

  it('leaves the map by an end that leads out, a pass after passing it', () => {
    const out: End = { ...top, leaves: true }
    let hero: Hero = { x: W(9), y: W(0.665), z: W(19.4), facing: PI }
    let climb: Climb | undefined = start(hero, [bottom, out])
    let left: End | undefined
    for (let pass = 0; pass < 400 && climb && !left; pass++) {
      const r = climbPass(climb, hero, 'up', false, lengths)
      hero = r.hero
      climb = r.climb
      left = r.leave
    }
    expect(left?.id).toBe(1)
  })
})
