import { describe, expect, it } from 'vitest'
import { lightingFor, timeOfPhase, ZONE_KIND_BY_TIME } from '../src/daytime.ts'

describe('the time of day, as drawn', () => {
  it('draws the clock’s four phases as three looks, the morning as the day', () => {
    // Night 0, morning 1, day 2, evening 3 — see `Clock` in the sim.
    expect([0, 1, 2, 3].map(timeOfPhase)).toEqual(['night', 'day', 'day', 'evening'])
  })

  it('lights the night pieces by night only', () => {
    expect(lightingFor('day')).toBe('day')
    expect(lightingFor('evening')).toBe('day')
    expect(lightingFor('night')).toBe('night')
  })

  it('roams a field’s day zone by day and evening, its night zone by night', () => {
    // encfld's kinds: 0 not at night, 1 only at night, 2 at all hours.
    expect([ZONE_KIND_BY_TIME.day, ZONE_KIND_BY_TIME.evening, ZONE_KIND_BY_TIME.night]).toEqual([
      0, 0, 1,
    ])
  })
})
