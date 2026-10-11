import { describe, expect, it } from 'vitest'
import { back, choose, type MenuContext, moveAcross, moveCursor, panelLines } from '../src/menu.ts'
import { DEFAULT_VOLUMES, gainOf, stepVolume, VOLUME_GAIN } from '../src/volume.ts'

const context: MenuContext = {
  hero: 'Hero',
  map: undefined,
  stage: undefined,
  volume: { music: 3, effects: 5 },
}
const misc = {
  member: 0,
  cursor: 0,
  panel: 'misc' as const,
  row: 5,
  picking: undefined,
}

describe('the volumes', () => {
  it('start at 3, step between 1 and 5, and are heard by the game’s table', () => {
    expect(DEFAULT_VOLUMES).toEqual({ music: 3, effects: 3 })
    expect(stepVolume(5, 1)).toBe(5)
    expect(stepVolume(1, -1)).toBe(1)
    expect(stepVolume(3, -1)).toBe(2)
    // `data_020e8ec4`: level 1 is silent, 5 is full.
    expect(VOLUME_GAIN).toHaveLength(5)
    expect(gainOf(1)).toBe(0)
    expect(gainOf(3)).toBeCloseTo(85 / 127, 6)
    expect(gainOf(5)).toBe(1)
  })

  it('opens from the Misc. menu on the levels kept, and steps them with left and right', () => {
    const opened = choose(misc, context).state
    if (opened?.panel !== 'volume') throw new Error('no Volume screen')
    expect(opened.volume).toEqual({ music: 3, effects: 5 })
    expect(panelLines('volume', { ...context, words: new Map() }, opened)[1]).toContain(
      'Quiet 1 2 [3] 4 5 Loud',
    )
    const louder = moveAcross(opened, 1, context)
    expect(louder.volume).toEqual({ music: 4, effects: 5 })
    // The effects' row, already at its loudest, stays there.
    const effects = moveAcross(moveCursor(louder, 1, context), 1, context)
    expect(effects.volume).toEqual({ music: 4, effects: 5 })
    // Confirm goes back to the Misc. menu, on Volume Settings' row.
    const confirm = moveCursor(louder, -1, context)
    expect(moveAcross(confirm, 1, context)).toBe(confirm)
    expect(choose(confirm, context).state).toMatchObject({ panel: 'misc', row: 5 })
    expect(back(louder)).toMatchObject({ panel: 'misc', row: 5, volume: undefined })
  })

  it('asks before a quick save, Yes or No in the standard words', () => {
    const words = new Map([[4700, 'Do you want to make a quick save log?']])
    const standardWords = new Map([
      [27, 'Yes'],
      [28, 'No'],
    ])
    const asking = choose({ ...misc, row: 6 }, { ...context, words }).state
    if (asking?.panel !== 'quickSave') throw new Error('no Quick Save')
    expect(panelLines('quickSave', { ...context, words, standardWords }, asking)).toEqual([
      'Do you want to make a quick save log?',
      '▶ Yes',
      '   No',
    ])
    expect(choose(asking, context).quickSave).toBe(true)
    expect(choose(moveCursor(asking, 1, context), context).state).toMatchObject({
      panel: 'misc',
      row: 6,
    })
  })
})
