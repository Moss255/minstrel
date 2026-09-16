import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  nextTextSpeed,
  revealedCharacters,
  settingsFrom,
  settingsToJson,
} from '../src/settings.ts'

describe('settings', () => {
  it('round-trip through JSON and fall back on anything odd', () => {
    expect(settingsFrom(settingsToJson({ textSpeed: 'fast' }))).toEqual({ textSpeed: 'fast' })
    expect(settingsFrom(null)).toEqual(DEFAULT_SETTINGS)
    expect(settingsFrom('{"textSpeed":"glacial"}')).toEqual(DEFAULT_SETTINGS)
    expect(settingsFrom('not json')).toEqual(DEFAULT_SETTINGS)
    expect(settingsFrom('[]')).toEqual(DEFAULT_SETTINGS)
  })

  it('step the text speed round in both directions', () => {
    expect(nextTextSpeed('slow')).toBe('normal')
    expect(nextTextSpeed('instant')).toBe('slow')
    expect(nextTextSpeed('slow', -1)).toBe('instant')
  })

  it('reveal a page at the speed, or whole at instant', () => {
    expect(revealedCharacters('normal', 0, 40)).toBe(0)
    expect(revealedCharacters('normal', 1000, 40)).toBe(40)
    expect(revealedCharacters('normal', 200, 40)).toBe(9)
    expect(revealedCharacters('instant', 0, 40)).toBe(40)
    expect(revealedCharacters('fast', 100, 40)).toBe(9)
  })
})
