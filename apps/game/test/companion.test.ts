import type { AttendingCharacter } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import {
  attendingStanding,
  changeVocation,
  companionFighter,
  companionLook,
  companionModel,
  companionNamed,
  companionsAt,
  expOf,
  IVOR,
  joinerOf,
  type Member,
  PARTY_MOST,
  partyAfter,
  partyRestored,
  partySaved,
  VOCATION_FLAG,
  vocationsOffered,
} from '../src/companion.ts'
import { HERO_VOCATION_NUMBER } from '../src/hero.ts'
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
  exp: new Map(),
  vocation: HERO_VOCATION_NUMBER,
  held: new Set([HERO_VOCATION_NUMBER]),
  appearance: undefined,
  name: undefined,
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

  it('changes vocation without losing what the last one earned', () => {
    // **The whole reason the data shape was read first.** The game keeps
    // thirteen experiences and thirteen levels, so changing vocation moves an
    // index: a Minstrel with 900 who becomes a Warrior starts the Warrior at
    // nothing, and finds the 900 again when they change back.
    const who = place(undefined)
    who.exp.set(6, 900)
    expect(expOf(who)).toBe(900)

    // To the Warrior, 1 — vocation 0 is the Guardian and the Abbey refuses it.
    changeVocation(who, 1)
    expect(who.vocation).toBe(1)
    expect(expOf(who)).toBe(0)
    // Untouched, not overwritten.
    expect(expOf(who, 6)).toBe(900)
    // And both are remembered as held, the way the game's mask does.
    expect([...who.held].sort()).toEqual([1, HERO_VOCATION_NUMBER])

    who.exp.set(1, 40)
    changeVocation(who, HERO_VOCATION_NUMBER)
    expect(expOf(who)).toBe(900)
    expect(expOf(who, 1)).toBe(40)
  })

  it('offers the six, then whichever of the other six are unlocked', () => {
    // Read from the Abbey's own list builder: six written with no gate, then
    // a table of six each behind a flag — and **in the Abbey's order**, which
    // is not numeric.
    expect(vocationsOffered(() => false)).toEqual([1, 2, 3, 4, 5, 6])
    expect(vocationsOffered(() => true)).toEqual([1, 2, 3, 4, 5, 6, 7, 9, 8, 12, 10, 11])
    // One flag, one vocation: 7 is 0x1146.
    expect(vocationsOffered((flag) => flag === VOCATION_FLAG + 9)).toEqual([1, 2, 3, 4, 5, 6, 9])
  })

  it('refuses a number that is not a vocation, zero among them', () => {
    // **Zero is the Guardian**, which the game writes when it makes the Hero
    // and the Abbey's bounds check rejects — it is what you are before the
    // game, not a trade to take up.
    const who = place(undefined)
    expect(changeVocation(who, 0)).toBeUndefined()
    expect(changeVocation(who, 13)).toBeUndefined()
    expect(changeVocation(who, -1)).toBeUndefined()
    expect(who.vocation).toBe(HERO_VOCATION_NUMBER)
    expect(changeVocation(who, 12)?.vocation).toBe(12)
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
        exp: new Map([[6, 340]]),
        vocation: HERO_VOCATION_NUMBER,
        held: new Set([HERO_VOCATION_NUMBER]),
        appearance: undefined,
        name: undefined,
        gains: { maxHp: 3 },
        equipped: new Map([['weapon', 20004]]),
      },
      {
        attnpc: IVOR,
        hp: undefined,
        mp: 4,
        exp: new Map([[0, 40]]),
        // **A vocation that is not the Hero's** — the whole point of it being
        // a member's field rather than a constant.
        vocation: 0,
        held: new Set([0]),
        appearance: 4,
        name: undefined,
        gains: {},
        equipped: new Map([['shield', 22000]]),
      },
      {
        attnpc: 5,
        hp: 1,
        mp: 0,
        exp: new Map(),
        vocation: 11,
        held: new Set([11]),
        appearance: 12,
        name: 'Brittany',
        gains: { skillPoints: 2 },
        equipped: new Map(),
      },
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

  it('gives a companion their own numbers, not a level table’s', () => {
    // **Ivor is level 3 with 25 hit points in `attnpc`**, and the battle
    // already fights with those. The menu read him against the Minstrel's
    // level table instead and showed level 1 with the Hero's 20 — wrong in
    // the menu and right nowhere.
    const s = attendingStanding(ivor)
    expect(s.level.level).toBe(3)
    expect(s.level.maxHp).toBe(ivor.numbers.maxHp)
    expect(s.level.strength).toBe(ivor.numbers.strength)
    // They do not gain levels or experience, and `attnpc` names no vocation.
    expect(s.next).toBeUndefined()
    expect(s.exp).toBe(0)
    expect(s.vocation).toBeUndefined()
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
      // A Fighter's `exp` is what beating it awards, not a Member's.
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
