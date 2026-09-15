import type { AttendingCharacter } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import {
  companionFighter,
  companionLook,
  companionModel,
  companionNamed,
  companionsAt,
  IVOR,
  joinerOf,
  PARTY_MOST,
  partyAfter,
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
  it('counts an event’s joining word from the table’s first place', () => {
    expect(joinerOf(1)).toBe(IVOR)
    expect(joinerOf(2)).toBe(3)
  })

  it('takes Ivor in and sends him away as the events’ records say, in the slice’s order', () => {
    const joined = partyAfter(new Set(), { joins: [1], leaves: false })
    expect(companionsAt(attending, joined)).toEqual([ivor])
    const ahead = partyAfter(joined, { joins: [], leaves: true })
    expect(companionsAt(attending, ahead)).toEqual([])
    const again = partyAfter(ahead, { joins: [1], leaves: false })
    expect(companionsAt(attending, again)).toEqual([ivor])
    // An event with neither word leaves the party as it was.
    expect(partyAfter(again, { joins: [], leaves: false })).toEqual(again)
  })

  it('brings whoever is in the party, in the table’s order, and no more than the party holds', () => {
    expect(companionsAt(attending, new Set())).toEqual([])
    const everyone = companionsAt(attending, new Set([5, 4, 3, 2, 1]))
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
