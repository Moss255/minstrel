import { describe, expect, it } from 'vitest'
import { EMPTY_BAG, take } from '../src/bag.ts'
import {
  backItems,
  chooseItems,
  type ItemsView,
  itemsRows,
  selectItems,
} from '../src/items-menu.ts'

const view = (names: string[]): ItemsView => ({
  members: names.map((name) => ({ name, carried: [] })),
  bag: take(EMPTY_BAG, { item: 22000 }),
  kindOf: () => 8,
  standard: (n) => ({ 26: 'Whole Party', 27: 'Yes', 28: 'No' })[n],
})

describe('Organise Items in the Items panel', () => {
  it('is the whose list’s last row, asking whose and then Yes or No', () => {
    const party = view(['Hero', 'Rosa'])
    expect(itemsRows({ at: 'whose' }, party).at(-1)).toEqual({ word: 1102 })
    const who = chooseItems({ at: 'whose' }, 3, party)
    expect(who.where).toEqual({ at: 'organiseWho', from: 3 })
    expect(itemsRows({ at: 'organiseWho', from: 3 }, party).at(-1)).toEqual({ name: 'Whole Party' })
    const ask = chooseItems({ at: 'organiseWho', from: 3 }, 2, party)
    expect(ask.where).toEqual({ at: 'organiseAsk', who: 'all', from: 3 })
    const yes = chooseItems({ at: 'organiseAsk', who: 'all', from: 3 }, 0, party)
    expect(yes).toEqual({ where: { at: 'whose' }, row: 3, organise: 'all' })
    const no = chooseItems({ at: 'organiseAsk', who: 1, from: 3 }, 1, party)
    expect(no.organise).toBeUndefined()
    expect(backItems({ at: 'organiseWho', from: 3 })).toEqual({ where: { at: 'whose' }, row: 3 })
  })

  it('asks at once with a party of one', () => {
    expect(chooseItems({ at: 'whose' }, 2, view(['Hero'])).where).toEqual({
      at: 'organiseAsk',
      who: 0,
      from: 2,
    })
  })

  it('sorts the bag with SELECT on the Bag’s row, the way given', () => {
    const party = view(['Hero', 'Rosa'])
    expect(selectItems({ at: 'whose' }, 0, party, 'type')).toBeUndefined()
    const asked = selectItems({ at: 'whose' }, 2, party, 'name')
    expect(asked?.where).toEqual({ at: 'sortAsk', by: 'name', from: 2 })
    expect(chooseItems({ at: 'sortAsk', by: 'name', from: 2 }, 0, party)).toEqual({
      where: { at: 'whose' },
      row: 2,
      sort: 'name',
    })
  })
})
