import { describe, expect, it } from 'vitest'
import {
  EVENING_AFTER_S,
  lightingFor,
  NIGHT_AFTER_S,
  timeOfDay,
  ZONE_KIND_BY_TIME,
} from '../src/daytime.ts'

describe('the time of day', () => {
  it('is day at every stage but 2.2', () => {
    expect(timeOfDay({ major: 2, minor: 1 }, 1000)).toBe('day')
    expect(timeOfDay({ major: 2, minor: 3 }, 1000)).toBe('day')
    expect(timeOfDay(undefined, 1000)).toBe('day')
  })

  it('turns with the seconds in the field at 2.2', () => {
    const at = (s: number) => timeOfDay({ major: 2, minor: 2 }, s)
    expect(at(0)).toBe('day')
    expect(at(EVENING_AFTER_S - 1)).toBe('day')
    expect(at(EVENING_AFTER_S)).toBe('evening')
    expect(at(NIGHT_AFTER_S - 1)).toBe('evening')
    expect(at(NIGHT_AFTER_S)).toBe('night')
  })

  it('lights the night pieces by night only, and roams each kind in turn', () => {
    expect(lightingFor('day')).toBe('day')
    expect(lightingFor('evening')).toBe('day')
    expect(lightingFor('night')).toBe('night')
    expect([ZONE_KIND_BY_TIME.day, ZONE_KIND_BY_TIME.evening, ZONE_KIND_BY_TIME.night]).toEqual([
      0, 1, 2,
    ])
  })
})
