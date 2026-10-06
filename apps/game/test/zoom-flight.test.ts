import { describe, expect, it } from 'vitest'
import {
  CEILING_DROP,
  type FlightEvent,
  flightDone,
  flightPass,
  flownHidden,
  SHAKE_SIZE,
  startFlight,
} from '../src/zoom-flight.ts'

/** Run a flight to its end: the pass each event came on. */
function run(ceiling: boolean): Map<FlightEvent, number> {
  const flight = startFlight(ceiling)
  const at = new Map<FlightEvent, number>()
  for (let pass = 1; pass < 500 && !flightDone(flight); pass++) {
    for (const event of flightPass(flight)) if (!at.has(event)) at.set(event, pass)
  }
  return at
}

describe('the flight of Zoom and the wing — func_ov017_021acdf4', () => {
  it('flies off: the rise, hidden past 40 vblanks, black past 100, the map past 140', () => {
    const at = run(false)
    // States 0 and 14 a pass each (ours), 1 the third.
    expect(at.get('rise')).toBe(3)
    // Two vblanks a pass from state 2: 42 > 40 on its 21st pass.
    expect(at.get('hide')).toBe(3 + 21)
    expect(at.get('fade')).toBe(3 + 51)
    expect(at.get('go')).toBe(3 + 71)
    expect(at.get('done')).toBe(3 + 72)
    expect(at.has('drop')).toBe(false)
  })

  it('bumps the ceiling: shown again past 55, dropped 9.8, landed, 10 more, done', () => {
    const at = run(true)
    expect(at.get('hide')).toBe(24)
    expect(at.has('fade')).toBe(false)
    expect(at.has('go')).toBe(false)
    // The count runs on from 42: 56 > 55 seven passes later.
    expect(at.get('drop')).toBe(31)
    // 9.8 at 81/4096 gathering each pass: 81 × 31 × 32 / 2 = 40,176 > 40,140,
    // below the ground on the 31st pass of the fall — the drop's own the
    // first — and seen landed on the pass after.
    const fall = (at.get('landed') as number) - (at.get('drop') as number)
    expect(fall).toBe(31)
    expect(at.get('done')).toBe((at.get('landed') as number) + 7)
  })

  it('falls as func_0203348c does, and hides only while flown', () => {
    const flight = startFlight(true)
    const heights: number[] = []
    let hiddenSeen = false
    while (!flightDone(flight)) {
      const events = flightPass(flight)
      if (flownHidden(flight)) hiddenSeen = true
      if (events.includes('drop')) heights.push(flight.above)
      else if (heights.length > 0 && flight.state === 11) heights.push(flight.above)
    }
    expect(hiddenSeen).toBe(true)
    // The first pass of the fall is already taken on the pass of the drop.
    expect(heights[0]).toBe(CEILING_DROP - 0x51)
    expect(heights[1]).toBe(CEILING_DROP - 0x51 - 2 * 0x51)
  })

  it('shakes the camera 0.05 over a second, the size down 33 ms at a time', () => {
    const flight = startFlight(true)
    while (!flightPass(flight).includes('drop')) {}
    // The drop's own pass has already taken a step: 1000 − 33 left, and
    // 204 − ⌊33 × 204 / 967⌋ = 198.
    expect(flight.shakeLeft).toBe(967)
    expect(flight.shake).toBe(SHAKE_SIZE - Math.trunc((33 * SHAKE_SIZE) / 967))
    let passes = 1
    while (flight.shakeLeft > 0) {
      flightPass(flight)
      passes++
    }
    expect(flight.shake).toBe(0)
    expect(passes).toBe(31)
  })
})
