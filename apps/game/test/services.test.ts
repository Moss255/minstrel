import type { Shop } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { EMPTY_BAG, take } from '../src/bag.ts'
import {
  buyPrice,
  type Counter,
  chooseInVisit,
  INN_PRICE,
  leaveVisit,
  moveVisit,
  viewOf,
  visitChurch,
  visitInn,
  visitShop,
} from '../src/services.ts'

const shop: Shop = { id: 32, unknown_1: 3, items: [1, 2], rate: 100, kind: 3 }
const prices = new Map([
  [1, 15],
  [2, 120],
  [3, 0],
])
/** What the shop gives: the item's own selling price — thing 1's a tenth of its asking, as the copper sword's is. */
const gives = new Map([
  [1, 2],
  [2, 60],
  [3, 0],
])
const counter: Counter = {
  name: (id) => `thing ${id}`,
  price: (id) => prices.get(id),
  sells: (id) => gives.get(id),
  divination: () => 'Soon.',
}

describe('the shop', () => {
  it('asks the price at its rate', () => {
    expect(buyPrice(shop, 15)).toBe(15)
    expect(buyPrice({ ...shop, rate: 500 }, 15)).toBe(75)
  })

  it('buys: takes the gold and puts the item in the bag, or says it cannot be afforded', () => {
    const buying = chooseInVisit(visitShop(shop), EMPTY_BAG, counter).visit
    if (!buying) throw new Error('no buying')
    expect(viewOf(buying, EMPTY_BAG, counter).rows).toEqual(['thing 1 — 15 G', 'thing 2 — 120 G'])
    const rich = take(EMPTY_BAG, { gold: 100 })
    const bought = chooseInVisit(buying, rich, counter)
    expect(bought.bag.gold).toBe(85)
    expect(bought.bag.items.get(1)).toBe(1)
    expect(bought.visit?.kind === 'shop' && bought.visit.said).toBe('You buy the thing 1 for 15 G.')
    const dear = chooseInVisit(moveVisit(buying, 1, rich, counter), rich, counter)
    expect(dear.bag).toBe(rich)
    expect(dear.visit?.kind === 'shop' && dear.visit.said).toContain('cannot afford')
  })

  it('sells what the bag holds for its own selling price, and will not buy what has none', () => {
    const bag = take(take(take(EMPTY_BAG, { item: 1 }), { item: 1 }), { item: 3 })
    const selling = chooseInVisit(moveVisit(visitShop(shop), 1, bag, counter), bag, counter).visit
    if (!selling) throw new Error('no selling')
    expect(viewOf(selling, bag, counter).rows).toEqual(['thing 1 ×2 — 2 G', 'thing 3 — not bought'])
    const sold = chooseInVisit(selling, bag, counter)
    expect(sold.bag.gold).toBe(2)
    expect(sold.bag.items.get(1)).toBe(1)
    const refused = chooseInVisit(moveVisit(selling, 1, bag, counter), bag, counter)
    expect(refused.bag).toBe(bag)
    expect(viewOf(selling, EMPTY_BAG, counter).rows).toEqual(['Nothing to sell'])
  })

  it('goes back from buying or selling to its first list, and from there out of the shop', () => {
    const buying = chooseInVisit(visitShop(shop), EMPTY_BAG, counter).visit
    if (!buying) throw new Error('no buying')
    const top = leaveVisit(buying)
    expect(top?.kind === 'shop' && top.mode).toBe('top')
    expect(top && leaveVisit(top)).toBeUndefined()
    const leave = moveVisit(visitShop(shop), -1, EMPTY_BAG, counter)
    expect(chooseInVisit(leave, EMPTY_BAG, counter).visit).toBeUndefined()
  })
})

describe('the inn and the church', () => {
  it('takes the price for a night, and rests', () => {
    const rich = take(EMPTY_BAG, { gold: INN_PRICE + 5 })
    const stayed = chooseInVisit(visitInn(2), rich, counter)
    expect(stayed.rested).toBe(true)
    expect(stayed.bag.gold).toBe(5)
    const poor = chooseInVisit(visitInn(2), EMPTY_BAG, counter)
    expect(poor.rested).toBeUndefined()
    expect(poor.bag).toBe(EMPTY_BAG)
  })

  it('records progress on confession, and tells how far the next level is', () => {
    const church = visitChurch(1)
    expect(chooseInVisit(church, EMPTY_BAG, counter).confessed).toBe(true)
    const told = chooseInVisit(moveVisit(church, 1, EMPTY_BAG, counter), EMPTY_BAG, counter)
    expect(told.visit?.said).toBe('Soon.')
    const left = chooseInVisit(moveVisit(church, 2, EMPTY_BAG, counter), EMPTY_BAG, counter)
    expect(left.visit).toBeUndefined()
  })
})
