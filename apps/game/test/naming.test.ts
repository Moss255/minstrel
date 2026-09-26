import { describe, expect, it } from 'vitest'
import { givenNamesOf, NAME_MOST, rollName, tidyName } from '../src/naming.ts'

/** A string table as `str_cm` gives one, built in code: a few names each side and a menu path. */
const strings = new Map<number, string>([
  [0, 'data/ani/bg_cm_ms.gp2'],
  [20000, 'Irving'],
  [20001, 'Armin'],
  [20100, 'Wayne'],
  [21000, 'Iris'],
  [21100, 'Wanda'],
  [22000, 'not a name'],
])

describe('the name screen', () => {
  it('takes the given names by sex from their two runs, and nothing else', () => {
    expect(givenNamesOf(strings)).toEqual({
      male: ['Irving', 'Armin', 'Wayne'],
      female: ['Iris', 'Wanda'],
    })
  })

  it('keeps a name to eight letters, the game’s eight slots', () => {
    expect(NAME_MOST).toBe(8)
    expect(tidyName('Abcdefghijk')).toBe('Abcdefgh')
    // Letters, not UTF-16 units: an accented one counts once.
    expect(tidyName('Élodieéé!')).toBe('Élodieéé')
  })

  it('takes spaces off its ends and makes a run of them one', () => {
    expect(tidyName('  Al   Bo  ')).toBe('Al Bo')
    expect(tidyName('   ')).toBe('')
    // A cut that would end on a space does not keep it.
    expect(tidyName('Abcdefg hij')).toBe('Abcdefg')
  })

  it('rolls from the list for the character’s sex, at the place drawn', () => {
    const names = givenNamesOf(strings)
    expect(rollName(names, 0, () => 1)).toBe('Armin')
    expect(rollName(names, 1, () => 0)).toBe('Iris')
    // A draw out of range is held to the list.
    expect(rollName(names, 1, () => 99)).toBe('Wanda')
    expect(rollName({ male: [], female: [] }, 0, () => 0)).toBeUndefined()
  })
})
