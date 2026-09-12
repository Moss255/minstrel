import { describe, expect, it } from 'vitest'
import { bagLines, EMPTY_BAG, take } from '../src/bag.ts'

describe('the bag', () => {
  it('adds gold, and counts each item in the order first found', () => {
    let bag = take(EMPTY_BAG, { gold: 50 })
    bag = take(bag, { item: 7 })
    bag = take(bag, { item: 3 })
    bag = take(bag, { item: 7 })
    bag = take(bag, {})
    expect(bag.gold).toBe(50)
    expect([...bag.items]).toEqual([
      [7, 2],
      [3, 1],
    ])
    expect(EMPTY_BAG.items.size).toBe(0)
  })

  it('lists the gold and then the items, with how many', () => {
    const bag = take(take(take(EMPTY_BAG, { gold: 1 }), { item: 7 }), { item: 7 })
    expect(bagLines(bag, (id) => `thing ${id}`)).toEqual(['1 gold coin', 'thing 7 ×2'])
    expect(bagLines(EMPTY_BAG, String)).toEqual([
      '0 gold coins',
      'Nothing in the bag yet — open some treasure.',
    ])
  })
})
