import { describe, expect, it } from 'vitest'
import {
  churchChoices,
  curePrice,
  INN_CANCEL,
  INN_REST,
  INN_STAY,
  innChoices,
  innPrice,
} from '../src/keepers.ts'

describe('the inn', () => {
  it('charges a head’s price for each of the living, its own line 10000', () => {
    expect(innPrice('5', 3)).toEqual({ perHead: 5, total: 15 })
    expect(innPrice('12', 4).total).toBe(48)
    // The bed's: free.
    expect(innPrice('0', 4).total).toBe(0)
    // No such line: a head's price of 1.
    expect(innPrice(undefined, 2)).toEqual({ perHead: 1, total: 2 })
  })

  it('offers Rest only by day', () => {
    expect(innChoices(false)).toEqual([INN_STAY, INN_REST, INN_CANCEL])
    expect(innChoices(true)).toEqual([INN_STAY, INN_CANCEL])
  })
})

describe('the church', () => {
  it('prices each cure by the member’s level', () => {
    expect([1, 10, 30, 99].map((l) => curePrice('resurrection', l))).toEqual([10, 60, 460, 4910])
    expect(curePrice('purification', 50)).toBe(5)
    expect([1, 10, 99].map((l) => curePrice('benediction', l))).toEqual([30, 300, 2970])
  })

  it('leaves out a service its file has no words for', () => {
    // The Observatory's: no Resurrection or Purification.
    const words = ['Confession (Save)', 'Divination', '', '', 'Benediction', 'Nothing']
    expect(churchChoices((n) => words[n])).toEqual([0, 1, 4, 5])
  })
})
