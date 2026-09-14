import type { AttendingCharacter } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { alongAt, companionFighter, companionLook } from '../src/companion.ts'

/** Ivor's record as the reader gives it, written out for the test; no cartridge bytes. */
const ivor: AttendingCharacter = {
  id: 2,
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

describe('Ivor beside the Hero', () => {
  it('goes along over story stages 2.2 and 2.3, and not before or after', () => {
    expect(alongAt({ major: 2, minor: 1 })).toBe(false)
    expect(alongAt({ major: 2, minor: 2 })).toBe(true)
    expect(alongAt({ major: 2, minor: 3 })).toBe(true)
    expect(alongAt({ major: 2, minor: 4 })).toBe(false)
    expect(alongAt({ major: 3, minor: 2 })).toBe(false)
    expect(alongAt(undefined)).toBe(false)
  })

  it('fights with his own numbers, strength and resilience standing in for attack and defence', () => {
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

  it('is drawn in his own model, with the packs he fights with', () => {
    expect(companionLook(ivor)).toEqual({
      model: 'chara_sub/s017.chr',
      packs: ['chara_sub/s017b.chr', 'chara_sub/s017be.chr'],
    })
  })
})
