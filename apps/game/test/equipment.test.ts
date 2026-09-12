import { describe, expect, it } from 'vitest'
import { EMPTY_BAG, take } from '../src/bag.ts'
import { choicesFor, equip, NOTHING_EQUIPPED, slotOf } from '../src/equipment.ts'

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
