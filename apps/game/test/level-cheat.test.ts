import { describe, expect, it } from 'vitest'
import { expAtLevel, expLevelledBy, levelGainsText, standing } from '../src/hero.ts'

/** A level's row, with the numbers growing by the level so a change is readable. */
const row = (level: number, exp: number) => ({
  level,
  exp,
  strength: 8 + level,
  resilience: 7 + level,
  agility: 6 + level,
  deftness: 5,
  charm: 4,
  magicalMight: 3,
  magicalMending: 2,
  maxHp: 20 + level * 5,
  maxMp: 2 + level,
  unknown_10: 0,
})

const table = { levels: [row(1, 0), row(2, 17), row(3, 44)], unknown: [] }

describe('the level key’s own arithmetic — ours, a testing aid', () => {
  it('gives the experience a level stands at, clamped to the table’s ends', () => {
    expect(expAtLevel(table, 1)).toBe(0)
    expect(expAtLevel(table, 3)).toBe(44)
    expect(expAtLevel(table, 0)).toBe(0)
    expect(expAtLevel(table, -5)).toBe(0)
    expect(expAtLevel(table, 99)).toBe(44)
    expect(expAtLevel(table, 2.7)).toBe(17)
  })

  it('moves a level from wherever the experience stands, not from the threshold', () => {
    // Part-way to level 2 counts as level 1, so a level on is level 2's own threshold.
    expect(expLevelledBy(table, 10, 1)).toBe(17)
    expect(expLevelledBy(table, 17, 1)).toBe(44)
    expect(expLevelledBy(table, 44, -1)).toBe(17)
    // The ends hold: no level 0, and none past the last.
    expect(expLevelledBy(table, 0, -1)).toBe(0)
    expect(expLevelledBy(table, 44, 1)).toBe(44)
  })

  it('keeps the level and the experience consistent, which is why it sets the experience', () => {
    const at = expLevelledBy(table, 0, 2)
    const now = standing(table, at)
    expect(now.level.level).toBe(3)
    expect(now.exp).toBe(44)
    expect(now.next).toBeUndefined()
  })

  it('says what a level brought, signed, so a level given back reads as a loss', () => {
    const one = row(1, 0)
    const two = row(2, 17)
    expect(levelGainsText(one, two)).toBe(
      'Max HP +5 · Max MP +1 · Strength +1 · Resilience +1 · Agility +1',
    )
    expect(levelGainsText(two, one)).toBe(
      'Max HP -5 · Max MP -1 · Strength -1 · Resilience -1 · Agility -1',
    )
    expect(levelGainsText(one, one)).toBe(
      'Max HP +0 · Max MP +0 · Strength +0 · Resilience +0 · Agility +0',
    )
  })

  it('counts the seeds’ gains into the level it reports', () => {
    const now = standing(table, expAtLevel(table, 2), { strength: 4 })
    expect(now.level.strength).toBe(row(2, 17).strength + 4)
  })
})
