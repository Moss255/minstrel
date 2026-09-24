import { describe, expect, it } from 'vitest'
import { EMPTY_BAG, take } from '../src/bag.ts'
import {
  choicesFor,
  equip,
  mayWear,
  NOTHING_EQUIPPED,
  SEX,
  slotOf,
  WEAR_WITH_ALL,
} from '../src/equipment.ts'

const sword = 1
const club = 2
const herb = 3
const tableOf = (id: number) => (id === herb ? 't' : 'w')

describe('equipment', () => {
  it('goes in the slot its item table names, and tools go nowhere', () => {
    expect(slotOf('w')).toBe('weapon')
    expect(slotOf('l')).toBe('feet')
    expect(slotOf('t')).toBeUndefined()
    expect(slotOf(undefined)).toBeUndefined()
  })

  it('offers nothing, then what the bag holds for the slot', () => {
    const bag = take(take(take(EMPTY_BAG, { item: sword }), { item: herb }), { item: club })
    expect(choicesFor('weapon', bag, tableOf)).toEqual([undefined, sword, club])
    expect(choicesFor('shield', bag, tableOf)).toEqual([undefined])
  })

  it('moves an item from the bag to the slot, and what was worn back to the bag', () => {
    const bag = take(take(EMPTY_BAG, { item: sword }), { item: club })
    const first = equip(bag, NOTHING_EQUIPPED, 'weapon', sword)
    if (!first) throw new Error('not put on')
    expect(first.equipped.get('weapon')).toBe(sword)
    expect(first.bag.items.has(sword)).toBe(false)
    const second = equip(first.bag, first.equipped, 'weapon', club)
    expect(second?.equipped.get('weapon')).toBe(club)
    expect(second?.bag.items.get(sword)).toBe(1)
    const off = second && equip(second.bag, second.equipped, 'weapon', undefined)
    expect(off?.equipped.has('weapon')).toBe(false)
    expect(off?.bag.items.get(club)).toBe(1)
    expect(equip(EMPTY_BAG, NOTHING_EQUIPPED, 'weapon', sword)).toBeUndefined()
  })
})

/**
 * Who may wear what — see `mayWear`, which is `func_020dd4c4`'s two rules.
 *
 * The numbers here are made up; what the cartridge's own look like is held to
 * it by `apps/game/test/item-stats.test.ts` and the vocation presets.
 */
describe('who may wear it', () => {
  /** Armour the warrior (1) and the paladin (9) may wear, and nobody else. */
  const armour = { usedBy: (1 << 0) | (1 << 8), kind: 0 }
  /** A sword: the mask is 0, and its kind is the sword tree's number. */
  const blade = { usedBy: 0, kind: 1 }
  /** Warrior holds trees 1, 2, 9, 10; the mage (3) holds 4, 6, 3, 13. */
  const wielding = (tree: number) =>
    tree === 1 || tree === 2 ? 0b0000_0000_0001 : tree === 4 ? 0b0000_0000_0100 : 0

  it('goes by the twelve-bit mask on armour', () => {
    expect(mayWear(armour, { vocation: 1 })).toBe(true)
    expect(mayWear(armour, { vocation: 9 })).toBe(true)
    expect(mayWear(armour, { vocation: 3 })).toBe(false)
    // An empty mask is worn by nobody, which is what the mask says.
    expect(mayWear({ usedBy: 0, kind: 0 }, { vocation: 1 })).toBe(false)
  })

  it('goes by the skill trees on a weapon, not by the mask', () => {
    expect(mayWear(blade, { vocation: 1 }, { wielding })).toBe(true)
    expect(mayWear(blade, { vocation: 3 }, { wielding })).toBe(false)
  })

  it('lets the tree’s Omnivocational panel override the vocation', () => {
    expect(mayWear(blade, { vocation: 3 }, { wielding, regardless: (t) => t === 1 })).toBe(true)
  })

  it('refuses nobody where the rule cannot be applied', () => {
    // No stats read for the item, no trees read, and a vocation out of range.
    expect(mayWear(undefined, { vocation: 1 }, { wielding })).toBe(true)
    expect(mayWear(blade, { vocation: 3 })).toBe(true)
    expect(mayWear(armour, { vocation: 0 })).toBe(true)
  })

  it('leaves out of the equip panel what the vocation may not wear', () => {
    const bag = take(take(EMPTY_BAG, { item: sword }), { item: club })
    const wearable = (id: number) => id !== club
    expect(choicesFor('weapon', bag, tableOf, wearable)).toEqual([undefined, sword])
  })
})

/**
 * The sex rule — `func_020dd4c4`'s third, and the one the wear-with-all award
 * exists to lift. See `SEX` for how the numbering was settled.
 */
describe('which sex may wear it', () => {
  /** A dress: sex 1 only, and the award may lift it. */
  const dress = { usedBy: 0xfff, kind: 0, wornBySex: 1 << SEX.female, sexLock: false }
  /** A bikini top: sex 1 only, and the award may **not**. */
  const bikini = { usedBy: 0xfff, kind: 0, wornBySex: 1 << SEX.female, sexLock: true }
  /** What most of the cartridge is: both sexes, no lock. */
  const anyone = { usedBy: 0xfff, kind: 0, wornBySex: 0b11, sexLock: false }

  it('lets the sex the item names wear it, and refuses the other', () => {
    expect(mayWear(dress, { vocation: 1, sex: SEX.female })).toBe(true)
    expect(mayWear(dress, { vocation: 1, sex: SEX.male })).toBe(false)
    expect(mayWear(anyone, { vocation: 1, sex: SEX.male })).toBe(true)
    expect(mayWear(anyone, { vocation: 1, sex: SEX.female })).toBe(true)
  })

  it('is not applied to somebody with no sex, which is nobody’s fault', () => {
    // The Hero has none until character creation asks, and a story companion
    // is in no table that says. Unapplied beats guessed.
    expect(mayWear(dress, { vocation: 1 })).toBe(true)
  })

  it('is lifted by the wear-with-all award, except where the item says not', () => {
    expect(mayWear(dress, { vocation: 1, sex: SEX.male, wearWithAll: true })).toBe(true)
    expect(mayWear(bikini, { vocation: 1, sex: SEX.male, wearWithAll: true })).toBe(false)
    // And it does nothing for a vocation that may not wear the piece anyway.
    const theirs = { usedBy: 1 << 0, kind: 0, wornBySex: 0b11, sexLock: false }
    expect(mayWear(theirs, { vocation: 3, sex: SEX.male, wearWithAll: true })).toBe(false)
  })

  it('names the award’s own item id', () => {
    // 18048 — `0x020dd6b8` loads it as a literal and compares it with what is
    // in equipment slot 9. On the cartridge it is the wear-with-all award.
    expect(WEAR_WITH_ALL).toBe(18048)
  })
})
