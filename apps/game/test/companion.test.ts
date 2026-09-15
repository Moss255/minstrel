import type { AttendingCharacter } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import {
  alongAt,
  companionFighter,
  companionLook,
  companionModel,
  companionNamed,
  companionsAt,
  IVOR,
  PARTY_MOST,
} from '../src/companion.ts'

/** Records as the reader gives them, written out for the test; no cartridge bytes. */
const ivor: AttendingCharacter = {
  id: IVOR,
  model: 17,
  name: 'Ivor',
  unknown_3: 1,
  unknown_4: 0,
  level: 3,
  unknown_6: 0,
  numbers: {
    strength: 15,
    resilience: 13,
    agility: 16,
    deftness: 22,
    charm: 10,
    magicalMight: 0,
    magicalMending: 0,
    maxHp: 25,
    maxMp: 0,
  },
  unknown_16: -1,
  weapon: 20004,
  shield: 21296,
}
const other = (id: number, name: string): AttendingCharacter => ({
  ...ivor,
  id,
  name,
  model: 10 + id,
})
const attending = [
  other(1, 'Aquila'),
  ivor,
  other(3, 'Dr Phlegming'),
  other(4, 'Sterling'),
  other(5, 'Erinn'),
]

describe('the party beside the Hero', () => {
  it('has Ivor go along over story stages 2.2 and 2.3, and not before or after', () => {
    expect(alongAt(ivor, { major: 2, minor: 1 })).toBe(false)
    expect(alongAt(ivor, { major: 2, minor: 2 })).toBe(true)
    expect(alongAt(ivor, { major: 2, minor: 3 })).toBe(true)
    expect(alongAt(ivor, { major: 2, minor: 4 })).toBe(false)
    expect(alongAt(ivor, { major: 3, minor: 2 })).toBe(false)
    expect(alongAt(ivor, undefined)).toBe(false)
  })

  it('has no one else go along in the slice', () => {
    for (const who of attending.filter((w) => w.id !== IVOR)) {
      expect(alongAt(who, { major: 2, minor: 2 }), who.name).toBe(false)
    }
    expect(companionsAt(attending, { major: 2, minor: 2 })).toEqual([ivor])
    expect(companionsAt(attending, { major: 2, minor: 1 })).toEqual([])
  })

  it('brings whoever is asked for, in the table’s order, and no more than the party holds', () => {
    expect(companionsAt(attending, undefined, [IVOR])).toEqual([ivor])
    const everyone = companionsAt(attending, undefined, [1, 2, 3, 4, 5])
    expect(everyone).toHaveLength(PARTY_MOST - 1)
    expect(everyone.map((w) => w.name)).toEqual(['Aquila', 'Ivor', 'Dr Phlegming'])
  })

  it('names Ivor as he, as his events do, and others by name alone', () => {
    expect(companionNamed(ivor)).toEqual({ name: 'Ivor', gender: 0 })
    expect(companionNamed(other(4, 'Sterling'))).toEqual({ name: 'Sterling' })
  })

  it('fights with their own numbers, strength and resilience standing in for attack and defence', () => {
    expect(companionFighter(ivor)).toEqual({
      name: 'Ivor',
      side: 'party',
      maxHp: 25,
      maxMp: 0,
      attack: 15,
      defence: 13,
      agility: 16,
      shield: true,
      exp: 0,
      gold: 0,
    })
    expect(companionFighter({ ...ivor, shield: undefined }).shield).toBe(false)
  })

  it('adds what their own weapon and shield carry, when their numbers are known', () => {
    const numbersOf = (id: number) =>
      id === 20004
        ? { attack: 7, defence: 0 }
        : id === 21296
          ? { attack: 0, defence: 1 }
          : undefined
    expect(companionFighter(ivor, numbersOf)).toMatchObject({ attack: 22, defence: 14 })
    // A piece whose numbers are not known adds nothing.
    expect(companionFighter(ivor, () => undefined)).toMatchObject({ attack: 15, defence: 13 })
    // Agility too, where a piece carries some.
    const swift = (id: number) => (id === 20004 ? { attack: 7, defence: 0, agility: 5 } : undefined)
    expect(companionFighter(ivor, swift)).toMatchObject({ attack: 22, agility: 21 })
  })

  it('is drawn in their own model, with the packs they fight with', () => {
    expect(companionLook(ivor)).toEqual({
      model: 'chara_sub/s017.chr',
      packs: ['chara_sub/s017b.chr', 'chara_sub/s017be.chr'],
    })
  })

  it('names their model as a map’s cast names the same character', () => {
    expect(companionModel(ivor)).toBe('s017')
    expect(companionModel({ ...ivor, model: 5 })).toBe('s005')
  })
})
