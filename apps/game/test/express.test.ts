import { describe, expect, it } from 'vitest'
import {
  CONDUCTOR,
  conductorLine,
  EXPRESS_PLACES,
  EXPRESS_WORDS,
  rideScenes,
  stopsOf,
} from '../src/express.ts'
import { back, choose, moveCursor, openMenu, panelLines } from '../src/menu.ts'

describe('the Starflight Express', () => {
  it('reads the stops a 215 record names, high half first, without the empty ones', () => {
    // `215:0 1:2 0:0` — Stella's at 6.1 to 10.8: the Observatory and the Abbey.
    expect(stopsOf([(1 << 16) | 2, 0])).toEqual([1, 2])
    // `215:1 1:2 3:4` — Sterling's at 15.3: the four, in facility 11's order.
    expect(stopsOf([(1 << 16) | 2, (3 << 16) | 4])).toEqual([1, 2, 3, 4])
    // `215:1 1:2 5:4` at 17.1: the Realm beyond in the third place.
    expect(stopsOf([(1 << 16) | 2, (5 << 16) | 4])).toEqual([1, 2, 5, 4])
  })

  it("gives Sterling's lines 100 on from Stella's, and only those", () => {
    expect(conductorLine(EXPRESS_WORDS.whichStop, 0)).toBe(100)
    expect(conductorLine(EXPRESS_WORDS.whichStop, 1)).toBe(200)
    expect(conductorLine(EXPRESS_WORDS.undecided, 1)).toBe(203)
    // The stops' names and Cancel are the same for both.
    expect(conductorLine(EXPRESS_WORDS.cancel, 1)).toBe(6)
    expect(CONDUCTOR).toEqual([2, 203])
  })

  it('leaves by the stop it is at and arrives by the stop chosen', () => {
    // From the Observatory to the Abbey: 29506, then 29501.
    expect(rideScenes(1, 2, 0, undefined)).toEqual({ leave: 29506, arrive: 29501 })
    // The Abbey's leaving depends on where to: Gittingham, or anywhere else.
    expect(rideScenes(2, 4, 1, undefined)).toEqual({ leave: 29500, arrive: 29504 })
    expect(rideScenes(2, 1, 1, undefined)).toEqual({ leave: 29515, arrive: 29507 })
    // And Gittingham's: the Abbey, or anywhere else.
    expect(rideScenes(4, 2, 1, undefined)).toEqual({ leave: 29503, arrive: 29501 })
    expect(rideScenes(4, 3, 1, undefined)).toEqual({ leave: 29516, arrive: 29510 })
    // At no stop, the arrival plays alone.
    expect(rideScenes(0, 5, 1, undefined)).toEqual({ leave: undefined, arrive: 29513 })
  })

  it("plays the story's own scene in place of the arrival, only exactly so", () => {
    const fyggs = new Set([4, 5, 6, 7, 8, 9, 10])
    const at = (major: number, minor: number, step: number, globals: ReadonlySet<number>) => ({
      major,
      minor,
      step,
      globals,
    })
    // Stella, to the Observatory, at 10.8 step 1 with the seven flags: ev28800.
    expect(rideScenes(2, 1, 0, at(10, 8, 1, fyggs)).arrive).toBe(28800)
    // One flag short, another step, Sterling, or another stop: the ride's own.
    expect(rideScenes(2, 1, 0, at(10, 8, 1, new Set([4, 5, 6, 7, 8, 9]))).arrive).toBe(29507)
    expect(rideScenes(2, 1, 0, at(10, 8, 2, fyggs)).arrive).toBe(29507)
    expect(rideScenes(2, 1, 1, at(10, 8, 1, fyggs)).arrive).toBe(29507)
    expect(rideScenes(1, 2, 0, at(10, 8, 1, fyggs)).arrive).toBe(29501)
    // Sterling, to the Realm, at 17.1 step 1 with flag 21: ev29210.
    expect(rideScenes(1, 3, 1, at(17, 1, 1, new Set([21]))).arrive).toBe(29210)
    expect(rideScenes(1, 3, 0, at(17, 1, 1, new Set([21]))).arrive).toBe(29510)
  })

  it("puts the Hero down at a stop's own place when it is the one the Express is at", () => {
    // The Abbey's field stop, as the task's request has it — within a unit
    // of where ev29501's `807` puts the Hero on a ride, (−42.93, 1.28, −34.69).
    const abbey = EXPRESS_PLACES.get(2)
    expect(abbey).toEqual({ map: 20007, x: -43, y: 0x14cc / 4096, z: -34, facing: 0 })
    // The Realm's two face the other way: 0x3244 is π in 1.19.12.
    expect(EXPRESS_PLACES.get(3)?.facing).toBeCloseTo(Math.PI, 3)
    expect([...EXPRESS_PLACES.keys()]).toEqual([1, 2, 3, 4, 5])
  })

  it('lists the stops offered and Cancel, rides to one, and closes on Cancel', () => {
    const words = new Map([
      [100, 'Which stop?'],
      [1, 'The Observatory'],
      [2, 'Alltrades Abbey'],
      [6, 'Cancel'],
    ])
    const context = { hero: 'Hero', map: undefined, stage: undefined, expressWords: words }
    const open = {
      ...openMenu(),
      panel: 'express' as const,
      express: { mode: 0 as const, stops: [1, 2] },
    }
    expect(panelLines('express', context, open)).toEqual([
      'Which stop?',
      '▶ The Observatory',
      '   Alltrades Abbey',
      '   Cancel',
    ])
    // A stop is taken and the list closes; Cancel closes it with none.
    expect(choose({ ...open, row: 1 }, context)).toEqual({ state: undefined, talk: false, stop: 2 })
    expect(choose({ ...open, row: 2 }, context)).toEqual({ state: undefined, talk: false })
    // The cursor wraps over the stops and Cancel; going back closes it whole.
    expect(moveCursor({ ...open, row: 2 }, 1, context).row).toBe(0)
    expect(back(open)).toBeUndefined()
  })
})
