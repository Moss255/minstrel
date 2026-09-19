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

  it('shows nothing before the page exists, rather than all but a character', () => {
    // A page raised inside a frame is stamped later than the frame's own
    // timestamp, so the first reveal is asked about a negative elapsed. Without
    // the clamp this returned -1, and `slice(0, -1)` flashed the whole page.
    expect(revealedCharacters('normal', -1, 40)).toBe(0)
    expect(revealedCharacters('normal', -30, 40)).toBe(0)
    expect(revealedCharacters('slow', -1000, 40)).toBe(0)
    // `instant` has no time in it at all, so it stays whole.
    expect(revealedCharacters('instant', -30, 40)).toBe(40)
  })
})
