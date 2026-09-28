import type { QuestGiver } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import {
  deliverAll,
  giversFor,
  LOG_MOST,
  newQuestBook,
  offerFor,
  questNibble,
  questsAfter,
} from '../src/quests.ts'

const giver = (quest: number, over: Partial<QuestGiver> = {}): QuestGiver => ({
  quest,
  map: 109,
  character: 10,
  major: 3,
  minor: 1,
  unknown_9: true,
  after: undefined,
  unknown_11: false,
  downloaded: false,
  unknown_12: false,
  unknown_13: false,
  conditions: [],
  ...over,
})

describe('the quests', () => {
  it('keeps a map’s givers from their stage on, their prerequisite cleared, the Rest’s on all its floors', () => {
    const givers = [
      giver(3),
      giver(4, { after: 3 }),
      giver(5, { major: 4 }),
      giver(174, { map: 50101 }),
      giver(6, { map: 1100 }),
    ]
    const book = newQuestBook()
    expect(giversFor(book, givers, 109, 3, 1).map((g) => g.quest)).toEqual([3])
    const cleared = questsAfter(book, [{ does: 'clear', quest: 3 }], 'then')
    expect(giversFor(cleared, givers, 109, 4, 1).map((g) => g.quest)).toEqual([3, 4, 5])
    expect(giversFor(book, givers, 50301, 19, 2).map((g) => g.quest)).toEqual([174])
  })

  it('offers the first quest whose conditions hold, at 0 or 1, and takes others back to 0', () => {
    const givers = [giver(3), giver(4), giver(5, { character: 11 })]
    let book = questsAfter(newQuestBook(), [{ does: 'offer', quest: 4 }], 'then')
    // Quest 3's conditions do not hold: back to 0 (it was 0); quest 4's do: on offer.
    const first = offerFor(book, givers, 10, (g) => g.quest !== 3)
    expect(first.offered).toBe(4)
    book = first.book
    expect([questNibble(book, 3), questNibble(book, 4), questNibble(book, 5)]).toEqual([0, 1, 0])
    // Taken, 3 is passed; 4 is on offer again only if its conditions hold.
    book = questsAfter(book, [{ does: 'accept', quest: 3 }], 'then')
    const second = offerFor(book, givers, 10, (g) => g.quest === 3)
    expect(second.offered).toBeUndefined()
    expect(questNibble(second.book, 4)).toBe(0)
    expect(questNibble(second.book, 3)).toBe(2)
  })

  it('passes a downloadable quest until it is delivered', () => {
    const givers = [giver(174, { downloaded: true })]
    expect(offerFor(newQuestBook(), givers, 10, () => true).offered).toBeUndefined()
    const delivered = deliverAll(newQuestBook(), givers)
    expect(offerFor(delivered, givers, 10, () => true).offered).toBe(174)
  })

  it('accepts into a log of eight, sets progress while taken, and clears out of it', () => {
    let book = newQuestBook()
    for (let q = 10; q < 10 + LOG_MOST + 1; q++)
      book = questsAfter(book, [{ does: 'accept', quest: q }], 'then')
    expect(book.log.map((e) => e.quest)).toEqual([10, 11, 12, 13, 14, 15, 16, 17])
    expect(questNibble(book, 18)).toBe(0)
    book = questsAfter(book, [{ does: 'progress', quest: 12, value: 9 }], 'then')
    expect(book.log.find((e) => e.quest === 12)?.progress).toBe(1)
    book = questsAfter(book, [{ does: 'clear', quest: 12 }], 'Saturday')
    expect(book.log.map((e) => e.quest)).not.toContain(12)
    expect([questNibble(book, 12), book.cleared.get(12)]).toEqual([3, 'Saturday'])
    // Progress on one not taken does nothing.
    const after = questsAfter(book, [{ does: 'progress', quest: 12, value: 2 }], 'then')
    expect(after.log).toEqual(book.log)
  })
})
