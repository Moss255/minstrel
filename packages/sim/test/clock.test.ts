import { describe, expect, it } from 'vitest'
import {
  DAY_TICKS,
  isNight,
  newClock,
  PHASE,
  phaseOf,
  REST_TICKS,
  STAY_TICKS,
  setPhase,
  tickClock,
} from '../src/index.ts'

describe('the day’s clock', () => {
  it('divides a 420-second day into night, morning, day and evening', () => {
    expect(DAY_TICKS).toBe(25_200)
    expect(phaseOf(0)).toBe(PHASE.night)
    expect(phaseOf(180 * 60 - 1)).toBe(PHASE.night)
    expect(phaseOf(180 * 60)).toBe(PHASE.morning)
    expect(phaseOf(210 * 60)).toBe(PHASE.day)
    expect(phaseOf(390 * 60)).toBe(PHASE.evening)
    expect(phaseOf(DAY_TICKS - 1)).toBe(PHASE.evening)
  })

  it('starts a new game at the day’s start, running', () => {
    const clock = newClock()
    expect(clock).toEqual({ ticks: 210 * 60, running: true })
    expect(isNight(clock)).toBe(false)
  })

  it('runs only on a field, the ocean or the sky, and only when running', () => {
    const clock = newClock()
    tickClock(clock, 0)
    tickClock(clock, 7)
    expect(clock.ticks).toBe(STAY_TICKS + 2)
    tickClock(clock, 1)
    tickClock(clock, undefined)
    expect(clock.ticks).toBe(STAY_TICKS + 2)
    clock.running = false
    tickClock(clock, 0)
    expect(clock.ticks).toBe(STAY_TICKS + 2)
  })

  it('wraps from the evening into the night', () => {
    const clock = { ticks: DAY_TICKS - 1, running: true }
    tickClock(clock, 0)
    expect(clock.ticks).toBe(0)
    expect(isNight(clock)).toBe(true)
  })

  it('is set to a phase’s start, and by the inn to the day’s or the night’s', () => {
    const clock = newClock()
    setPhase(clock, PHASE.evening)
    expect(clock.ticks).toBe(390 * 60)
    setPhase(clock, 9)
    expect(clock.ticks).toBe(390 * 60)
    expect(STAY_TICKS).toBe(210 * 60)
    expect(REST_TICKS).toBe(0)
  })
})
