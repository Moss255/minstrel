import { describe, expect, it } from 'vitest'
import {
  FLIGHT_HEIGHT,
  FLIGHT_SPEED,
  fieldOf,
  flightFrame,
  PI,
  regionIndexOf,
  skyOf,
  skyRegionOf,
  TURN_STEP,
  takeOff,
  WRAP,
} from '../src/flight.ts'

describe('the Starflight Express in flight', () => {
  it('flies at its height, along its facing, never stopping', () => {
    const start = takeOff(0, 0)
    expect(start.y).toBe(FLIGHT_HEIGHT)
    // Facing π, it goes toward −z; with nothing held the facing stays.
    const next = flightFrame(start, undefined, 0)
    expect(next.facing).toBe(PI)
    expect(next.x).toBe(0)
    expect(next.z).toBe(-FLIGHT_SPEED)
  })

  it('turns toward the direction held by at most its step a frame, and takes it when near', () => {
    const start = takeOff(0, 0)
    // Down is 0 against a camera at 0: from π, the long way is no nearer, so it turns by a step.
    const turned = flightFrame(start, 'right', 0)
    expect(Math.abs(turned.facing - PI)).toBe(TURN_STEP)
    let state = start
    for (let i = 0; i < 200; i++) state = flightFrame(state, 'right', 0)
    expect(state.facing).toBe(6434)
  })

  it('wraps the world at its edges', () => {
    const near = { ...takeOff(0, 0), z: -WRAP.z + 10 }
    const wrapped = flightFrame(near, undefined, 0)
    expect(wrapped.z).toBe(-WRAP.z + 10 - FLIGHT_SPEED + WRAP.spanZ)
  })

  it('meets the field at a sixth, each way', () => {
    // Angel Falls's doorway in F01, (−69.4, −16), with F01 at (−528, −128) in the world.
    const local = { x: Math.round(-69.4 * 4096), z: -16 * 4096 }
    const sky = skyOf({ x: -528, z: -128 }, local)
    expect(sky.x / 4096).toBeCloseTo(-99.57, 1)
    const back = fieldOf({ x: -528, z: -128 }, sky)
    expect(Math.abs(back.x - local.x)).toBeLessThan(8)
    expect(Math.abs(back.z - local.z)).toBeLessThan(8)
  })

  it('reads a region of the sky: its field map, and whether the Express may land', () => {
    expect(skyRegionOf(Uint8Array.of(0x00, 0x04, 0x20, 0x00))).toEqual({ map: 20001, land: true })
    expect(skyRegionOf(Uint8Array.of(0x60, 0x10, 0x20, 0x00))).toEqual({ map: 20034, land: true })
    expect(skyRegionOf(new Uint8Array(8))).toEqual({ map: undefined, land: false })
    expect(regionIndexOf(0x70_000000)).toBe(56)
  })
})
