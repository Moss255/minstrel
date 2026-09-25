import { describe, expect, it } from 'vitest'
import type { Member } from '../src/companion.ts'
import { HERO_VOCATION_NUMBER } from '../src/hero.ts'
import {
  applyFor,
  callUp,
  dropOff,
  LIST_MOST,
  listHasRoom,
  PATTY_SAYS,
  partWith,
  partyHasRoom,
  RECRUIT_VOCATIONS,
  type Roster,
} from '../src/recruit.ts'

/**
 * Patty's Party Planning Place — see `apps/game/src/recruit.ts`.
 *
 * The rules here are read from her sixteen-step flow; what this pins is that
 * the model moves characters between the party and the list the way those
 * steps do, and refuses in her own words where she refuses.
 */

let next = 0
const someone = (over: Partial<Member> = {}): Member => ({
  attnpc: undefined,
  hp: undefined,
  mp: undefined,
  exp: new Map(),
  vocation: HERO_VOCATION_NUMBER,
  held: new Set([HERO_VOCATION_NUMBER]),
  appearance: undefined,
  look: undefined,
  sex: undefined,
  name: `made ${next++}`,
  gains: {},
  outfits: new Map(),
  skillPool: 0,
  treePoints: new Map(),
  revocations: new Map(),
  ...over,
})

const roster = (party: number, kept: number): Roster => ({
  party: Array.from({ length: party }, () => someone()),
  kept: Array.from({ length: kept }, () => someone()),
})

describe('what Patty offers', () => {
  it('is the six vocations a game begins with', () => {
    // Her window 8 lists Warrior, Priest, Mage, Martial Artist, Thief,
    // Minstrel — the same six Alltrades writes in with no gate, which two
    // flows read apart agreeing on is a check on the numbering.
    expect(RECRUIT_VOCATIONS).toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe('room', () => {
  it('holds four in the party and twelve on the list', () => {
    expect(partyHasRoom(roster(3, 0))).toBe(true)
    expect(partyHasRoom(roster(4, 0))).toBe(false)
    expect(listHasRoom(roster(1, LIST_MOST - 1))).toBe(true)
    expect(listHasRoom(roster(1, LIST_MOST))).toBe(false)
  })
})

describe('applying for a new party member', () => {
  it('puts them on the list, not into the party', () => {
    // **This is the part that is easy to get wrong.** Overlay 9 files the
    // character with Patty; joining is a separate question she asks after.
    const before = roster(1, 0)
    const made = someone({ name: 'Brittany' })
    const { roster: after, refused } = applyFor(before, made)
    expect(refused).toBeUndefined()
    expect(after.kept.map((one) => one.name)).toEqual(['Brittany'])
    expect(after.party).toHaveLength(1)
  })

  it('refuses in her own words when the list is full', () => {
    const { roster: after, refused } = applyFor(roster(1, LIST_MOST), someone())
    expect(refused).toBe(PATTY_SAYS.listFull)
    expect(after.kept).toHaveLength(LIST_MOST)
  })
})

describe('calling somebody up', () => {
  it('moves them off the list and into the party', () => {
    const before = roster(2, 3)
    const wanted = before.kept[1]?.name
    const { roster: after, refused } = callUp(before, 1)
    expect(refused).toBeUndefined()
    expect(after.party).toHaveLength(3)
    expect(after.party[2]?.name).toBe(wanted)
    expect(after.kept).toHaveLength(2)
    expect(after.kept.map((one) => one.name)).not.toContain(wanted)
  })

  it('refuses when the party is already four', () => {
    const before = roster(4, 2)
    const { roster: after, refused } = callUp(before, 0)
    expect(refused).toBe(PATTY_SAYS.partyFull)
    expect(after).toEqual(before)
  })

  it('does nothing for somebody who is not on the list', () => {
    const before = roster(1, 1)
    expect(callUp(before, 7).roster).toEqual(before)
  })
})

describe('dropping somebody off', () => {
  it('moves them out of the party and onto the list', () => {
    const before = roster(3, 0)
    const left = before.party[2]?.name
    const { roster: after, refused } = dropOff(before, 2)
    expect(refused).toBeUndefined()
    expect(after.party).toHaveLength(2)
    expect(after.kept.map((one) => one.name)).toEqual([left])
  })

  it('will not take the Hero, who is slot 0 and cannot leave', () => {
    const before = roster(3, 0)
    const { roster: after, refused } = dropOff(before, 0)
    expect(refused).toBeUndefined()
    expect(after).toEqual(before)
  })

  it('will not take somebody who is down, and says why', () => {
    // "Does this place look like a morgue? Take him to a church and do the
    // right thing first, honey."
    const before = roster(3, 0)
    const { roster: after, refused } = dropOff(before, 1, (who) => who === before.party[1])
    expect(refused).toBe(PATTY_SAYS.notWhileDown)
    expect(after).toEqual(before)
  })

  it('refuses when her list is full', () => {
    const before = roster(3, LIST_MOST)
    const { refused } = dropOff(before, 1)
    expect(refused).toBe(PATTY_SAYS.listFullToDrop)
  })
})

describe('parting with somebody', () => {
  it('takes them off the list for good', () => {
    const before = roster(1, 3)
    const gone = before.kept[1]?.name
    const { roster: after } = partWith(before, 1)
    expect(after.kept).toHaveLength(2)
    expect(after.kept.map((one) => one.name)).not.toContain(gone)
    // And they do not reappear in the party, which is what "for good" means.
    expect(after.party.map((one) => one.name)).not.toContain(gone)
  })

  it('does nothing for somebody who is not there', () => {
    const before = roster(1, 1)
    expect(partWith(before, 9).roster).toEqual(before)
  })
})

describe('a character is in one place or the other, never both', () => {
  it('holds through a round trip', () => {
    // Make one, call them up, drop them off, and they are on the list again —
    // with the party and the list never sharing a name at any point.
    let r: Roster = roster(1, 0)
    const names = (one: Roster) => [...one.party, ...one.kept].map((m) => m.name)
    const unique = (one: Roster) => new Set(names(one)).size === names(one).length
    r = applyFor(r, someone({ name: 'Brittany' })).roster
    expect(unique(r)).toBe(true)
    r = callUp(r, 0).roster
    expect(r.party.map((one) => one.name)).toContain('Brittany')
    expect(r.kept).toHaveLength(0)
    expect(unique(r)).toBe(true)
    r = dropOff(r, 1).roster
    expect(r.kept.map((one) => one.name)).toEqual(['Brittany'])
    expect(r.party).toHaveLength(1)
    expect(unique(r)).toBe(true)
  })
})
