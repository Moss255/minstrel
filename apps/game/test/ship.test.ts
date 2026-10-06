import { describe, expect, it } from 'vitest'
import { PI, WRAP } from '../src/flight.ts'
import {
  BLOOMINGDALE,
  GANGWAY,
  keptFromGangway,
  LEG,
  legsSailed,
  mooringFor,
  newShipKeep,
  putToSea,
  type Sailing,
  SEA_START,
  SHORE_VBLANKS,
  SPEED_STEP,
  sailVblank,
  shoreVblank,
  TOP_SPEED,
  TURN_RATE,
  wrapped,
} from '../src/ship.ts'

const still: Sailing = putToSea({ ...newShipKeep(), x: 0, y: 0, z: 0, facing: 0 })

describe('what the game keeps of the ship', () => {
  it('starts a new game in Bloomingdale, mooring 0, on the ocean at (25, 0.1, 56.8)', () => {
    const keep = newShipKeep()
    expect(keep.map).toBe(BLOOMINGDALE)
    expect(keep.mooring).toBe(0)
    expect(keep.atSea).toBe(false)
    expect([keep.x, keep.y, keep.z]).toEqual([SEA_START.x, SEA_START.y, SEA_START.z])
    expect(keep.count).toBe(0x50)
  })
})

describe('sailing — the mover and the steering', () => {
  it('speeds up by 10 a vblank to 0x106, and moves by the speed it had', () => {
    let s = sailVblank(still, 'down', 0)
    // Steered: going, facing 0 wanted; it has not moved yet.
    expect(s.going).toBe(true)
    expect(s.z).toBe(0)
    // The mover runs before the steering, so the speed rises from the next.
    s = sailVblank(s, 'down', 0)
    expect(s.speed).toBe(SPEED_STEP)
    expect(s.z).toBe(0)
    s = sailVblank(s, 'down', 0)
    expect(s.speed).toBe(SPEED_STEP * 2)
    // The vblank's speed before was 10: it moved 10 along z (facing 0).
    expect(s.z).toBe(SPEED_STEP)
    for (let i = 0; i < 40; i++) s = sailVblank(s, 'down', 0)
    expect(s.speed).toBe(TOP_SPEED)
  })

  it('coasts to a stop when nothing is held', () => {
    let s: Sailing = { ...still, going: true, speed: TOP_SPEED }
    s = sailVblank(s, undefined, 0)
    expect(s.going).toBe(false)
    s = sailVblank(s, undefined, 0)
    expect(s.speed).toBe(TOP_SPEED - SPEED_STEP)
    for (let i = 0; i < 40; i++) s = sailVblank(s, undefined, 0)
    expect(s.speed).toBe(0)
  })

  it('turns by at most 0xc9 a vblank, and slows while it turns', () => {
    let s: Sailing = { ...still, going: true, speed: TOP_SPEED, want: PI }
    const before = s.z
    s = sailVblank(s, 'up', 0)
    expect(s.facing).toBe(TURN_RATE)
    // Most of a half turn still to make: a little of the most speed.
    expect(s.z - before).toBeLessThan(TOP_SPEED / 10)
  })

  it('turns the direction by the camera', () => {
    const s = sailVblank(still, 'down', 0x1922)
    expect(s.want).toBe(0x1922)
  })

  it('wraps at the edges, as the sky does', () => {
    const s = wrapped({ ...still, x: WRAP.x + 5, z: -WRAP.z - 1 })
    expect(s.x).toBe(WRAP.x + 5 - WRAP.spanX)
    expect(s.z).toBe(-WRAP.z - 1 + WRAP.spanZ)
  })

  it('counts a leg each 3 units sailed', () => {
    const one = legsSailed(still, LEG - 1)
    expect(one.legs).toBe(0)
    const two = legsSailed(one.state, LEG * 2)
    expect(two.legs).toBe(2)
    expect(two.state.sailed).toBe(LEG - 1)
  })
})

describe('reaching a shore', () => {
  const shore = { land: true, map: 20002, kind: 0, normalX: 0, normalZ: -4096 }

  it('is reached after 40 vblanks steering into a landing shore', () => {
    let s = still
    let reached: number | undefined
    for (let i = 0; i < SHORE_VBLANKS && reached === undefined; i++) {
      const r = shoreVblank(s, true, shore)
      s = r.state
      reached = r.reached
      if (i < SHORE_VBLANKS - 1) expect(reached).toBeUndefined()
    }
    expect(reached).toBe(20002)
  })

  it('starts again when the ship stops steering, turns away, or the shore has no land', () => {
    const r = shoreVblank({ ...still, ashore: 30 }, false, shore)
    expect(r.state.ashore).toBe(0)
    expect(
      shoreVblank({ ...still, ashore: 30 }, true, { ...shore, normalZ: 4096 }).state.ashore,
    ).toBe(0)
    expect(
      shoreVblank({ ...still, ashore: 30 }, true, { ...shore, land: false }).state.ashore,
    ).toBe(0)
  })

  it('takes kind 1 for Bloomingdale', () => {
    const r = shoreVblank({ ...still, ashore: SHORE_VBLANKS - 1 }, true, {
      ...shore,
      kind: 1,
      map: 20000,
    })
    expect(r.reached).toBe(BLOOMINGDALE)
  })
})

describe('the mooring the ship comes in at', () => {
  const moorings = [
    { id: 0, x: 0, y: -1, z: -80, reach: 15 },
    { id: 1, x: 40, y: -1, z: -80, reach: 15 },
    { id: 2, x: 100, y: -1, z: 100, reach: 5 },
  ]
  const world = { x: -300, z: -100 }
  const sea = (x: number, z: number) => ({
    x: ((x + world.x) / 6) * 4096,
    y: 0,
    z: ((z + world.z) / 6) * 4096,
  })

  it('takes the nearest within its reach', () => {
    expect(mooringFor(moorings, sea(30, -80), world)?.id).toBe(1)
  })

  it('takes the nearest of all when none is within reach', () => {
    expect(mooringFor(moorings, sea(80, 60), world)?.id).toBe(2)
    expect(mooringFor([], sea(0, 0), world)).toBeUndefined()
  })
})

describe('the deck’s gangway at sea', () => {
  it('puts the Hero back from it', () => {
    expect(keptFromGangway({ x: -0x7000, z: 0x7000 })).toEqual(GANGWAY.back)
    expect(keptFromGangway({ x: 0, z: 0x7000 })).toBeUndefined()
    expect(keptFromGangway({ x: -0x7000, z: 0x5000 })).toBeUndefined()
  })
})
