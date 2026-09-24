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
  type Member,
  PARTY_MOST,
  partyAfter,
  partyRestored,
  partySaved,
} from '../src/companion.ts'
import { decodeSave, encodeSave, SAVE_VERSION, type SaveGame } from '../src/save.ts'

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

/** A place with nothing in it, as `main.ts`'s `freshMember` makes one. */
const place = (attnpc: number | undefined): Member => ({
  attnpc,
  hp: undefined,
  mp: undefined,
  exp: 0,
  gains: {},
  equipped: new Map(),
})
/** The party at the start: the Hero, and nobody behind them. */
const alone: Member[] = [place(undefined)]

/** A save with nothing in it but a party, for the round trip below. */
const blank = {
  version: SAVE_VERSION,
  savedAt: '2026-09-24T10:00:00.000Z',
  map: 'C01',
  at: { x: 0, y: 0, z: 0, facing: 0 },
  stage: null,
  members: [],
  gold: 0,
  items: [],
  opened: [],
} as unknown as SaveGame

describe('the party, the Hero first', () => {
  it('counts an event’s joining word from the table’s first place', () => {
    expect(joinerOf(1)).toBe(IVOR)
    expect(joinerOf(2)).toBe(3)
  })

  it('takes Ivor in and sends him away as the events’ records say, in the slice’s order', () => {
    const joined = partyAfter(alone, { joins: [1], leaves: false }, place)
    expect(companionsAt(attending, joined)).toEqual([ivor])
    // **The Hero is member 0 and stays.** A record that sends the party away
    // sends away whoever is behind them.
    const ahead = partyAfter(joined, { joins: [], leaves: true }, place)
    expect(ahead).toHaveLength(1)
    expect(companionsAt(attending, ahead)).toEqual([])
    const again = partyAfter(ahead, { joins: [1], leaves: false }, place)
    expect(companionsAt(attending, again)).toEqual([ivor])
    // An event with neither word leaves the party as it was.
    expect(partyAfter(again, { joins: [], leaves: false }, place)).toEqual(again)
  })

  it('brings whoever joined, in the order they joined, and no more than fits', () => {
    expect(companionsAt(attending, alone)).toEqual([])
    // Joined last first: Erinn (5), Sterling (4), Dr Phlegming (3), then two
    // who do not fit. **The order is the party's, not the table's.**
    const everyone = companionsAt(
      attending,
      partyAfter(alone, { joins: [4, 3, 2, 1, 0], leaves: false }, place),
    )
    expect(everyone).toHaveLength(PARTY_MOST - 1)
    expect(everyone.map((w) => w.name)).toEqual(['Erinn', 'Sterling', 'Dr Phlegming'])
    // The same five in the other order give the other three, which is the
    // whole of the change: this used to be the table's order and said so,
    // marked "ours" because nothing decided it. The game has ordered slots,
    // so joining decides. With one companion — the slice's party — the two
    // are the same, which is why nothing in the slice could tell them apart.
    const reversed = companionsAt(
      attending,
      partyAfter(alone, { joins: [0, 1, 2, 3, 4], leaves: false }, place),
    )
    expect(reversed.map((w) => w.name)).toEqual(['Aquila', 'Ivor', 'Dr Phlegming'])
  })

  it('goes into a save and comes back the same party', () => {
    // **The phase's done-when is "can be saved and loaded"**, and until this
    // the round trip was two anonymous blocks in `main.ts` that nothing could
    // reach. A party of three, each with something of their own.
    const before: Member[] = [
      {
        attnpc: undefined,
        hp: 12,
        mp: undefined,
        exp: 340,
        gains: { maxHp: 3 },
        equipped: new Map([['weapon', 20004]]),
      },
      {
        attnpc: IVOR,
        hp: undefined,
        mp: 4,
        exp: 40,
        gains: {},
        equipped: new Map([['shield', 22000]]),
      },
      { attnpc: 5, hp: 1, mp: 0, exp: 0, gains: { skillPoints: 2 }, equipped: new Map() },
    ]
    const after = partyRestored(
      decodeSave(encodeSave({ ...blank, members: partySaved(before) })).members,
    )
    expect(after).toEqual(before)
    // The Hero is the one in no table, and JSON has no `undefined` — so the
    // save writes null and the game reads it back as nothing.
    expect(partySaved(before)[0]?.attnpc).toBeNull()
    expect(after[0]?.attnpc).toBeUndefined()
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
      // Their own, for a spell's amount to scale by — the fixture's Ivor has none.
      might: ivor.numbers.magicalMight,
      mending: ivor.numbers.magicalMending,
      shield: true,
      exp: 0,
      gold: 0,
      level: ivor.level,
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
