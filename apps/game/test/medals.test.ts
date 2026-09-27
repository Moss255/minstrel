import type { MedalRewards } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { exchangeLine, medalText, visitMax } from '../src/medals.ts'

// The reference cartridge's counts, with made-up items numbered for their count.
const rewards: MedalRewards = {
  exchanges: [3, 5, 8, 10, 15, 20].map((medals) => ({ medals, item: 20000 + medals })),
  milestones: [4, 8, 13, 18, 25, 32, 40, 50, 62, 80].map((medals) => ({
    medals,
    item: 12000 + medals,
  })),
}
const said = (visit: ReturnType<typeof visitMax>) => visit.lines.map((line) => line.message)

describe('handing mini medals to Cap’n Max', () => {
  it('introduces himself, and on a first visit with nothing to give says no more', () => {
    const visit = visitMax(rewards, 0, 0)
    expect(said(visit)).toEqual([10, 11])
    expect(visit.handed).toBe(0)
  })

  it('takes them all when the next milestone is out of reach, and names it', () => {
    const visit = visitMax(rewards, 0, 3)
    expect(said(visit)).toEqual([10, 11, 20, 21, 51])
    expect(visit).toMatchObject({ handed: 3, given: 3, gifts: [] })
    // "when it reaches 4, ye'll have the thief's key to boot"
    expect(visit.lines.at(-1)?.values.next).toBe(4)
    expect(visit.lines.at(-1)?.item).toBe(12004)
  })

  it('takes only what a milestone needs, gives its reward, and goes on with the rest', () => {
    // 5 held, 0 given: 4 for the first milestone, then 1 more towards 8.
    const visit = visitMax(rewards, 0, 5)
    expect(said(visit)).toEqual([10, 11, 20, 40, 41, 21, 51])
    expect(visit).toMatchObject({ handed: 5, given: 5, gifts: [12004] })
  })

  it('pays each milestone passed in one visit, one at a time', () => {
    const visit = visitMax(rewards, 3, 11)
    expect(visit.gifts).toEqual([12004, 12008, 12013])
    expect(visit.given).toBe(14)
    expect(said(visit)).toEqual([30, 31, 40, 41, 40, 41, 40, 41, 32, 50, 51])
  })

  it('on a later visit with nothing to give, says the tally and the next target', () => {
    expect(said(visitMax(rewards, 9, 0))).toEqual([30, 50, 51])
  })

  it('says when every milestone is passed, and the scene is due', () => {
    const visit = visitMax(rewards, 75, 5)
    expect(visit.gifts).toEqual([12080])
    expect(visit.allPassed).toBe(true)
  })

  it('opens at the exchange once all are passed: the list follows with medals held', () => {
    expect(said(visitMax(rewards, 80, 2))).toEqual([110, 120])
    expect(said(visitMax(rewards, 80, 0))).toEqual([110, 151])
  })

  it('puts the price and the item picked in the exchange’s lines', () => {
    const line = exchangeLine(130, 80, 9, { medals: 5, item: 22017 })
    expect(medalText('cost ye <val_3> mini medals', line, () => '')).toBe('cost ye 5 mini medals')
    expect(
      medalText(
        '<DEF_ART_SGL_I_NAME><IF_I_NAME_PLRNOUN> are<ELSE_NOT_PLRNOUN>’s<ENDIF_PLRNOUN> yours',
        line,
        () => 'elfin elixir',
      ),
    ).toBe('the elfin elixir’s yours')
  })

  it('fills the numbers, settles singular and plural, and names the item', () => {
    const line = visitMax(rewards, 0, 1).lines.find((l) => l.message === 21)
    if (!line) throw new Error('no line 21')
    expect(
      medalText(
        "That's <val_4> mini medal<IF_SING val_4><ELSE_NOT_SING>s<ENDIF_SING>!",
        line,
        () => '',
      ),
    ).toBe("That's 1 mini medal!")
    const reward = visitMax(rewards, 0, 4).lines.find((l) => l.message === 40)
    if (!reward) throw new Error('no line 40')
    expect(
      medalText('For <val_3> medals, ye get <INDEF_ART_SGL_I_NAME>!', reward, () => 'orichalcum'),
    ).toBe('For 4 medals, ye get an orichalcum!')
  })
})
