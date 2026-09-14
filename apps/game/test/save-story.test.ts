import { describe, expect, it } from 'vitest'
import { decodeSave, encodeSave, SAVE_VERSION, type SaveGame } from '../src/save.ts'

const game: SaveGame = {
  version: SAVE_VERSION,
  savedAt: '2026-09-15T10:00:00.000Z',
  map: 'M01M07',
  at: { x: 0.2, y: 0, z: 0.4, facing: 0 },
  stage: { major: 2, minor: 2 },
  step: 2,
  flags: [0],
  gold: 100,
  items: [],
  equipped: {},
  opened: [],
  exp: 0,
  hp: null,
  mp: null,
  gains: {},
}

describe('the story in a save', () => {
  it('keeps the step within the stage and the flags set', () => {
    const back = decodeSave(encodeSave(game))
    expect(back.step).toBe(2)
    expect(back.flags).toEqual([0])
  })

  it('reads a save from before they were kept, with no step and no flags', () => {
    const { step: _step, flags: _flags, ...older } = game
    const back = decodeSave(JSON.stringify(older))
    expect(back.step).toBeUndefined()
    expect(back.flags).toBeUndefined()
  })

  it('refuses a step or flags that do not read, saying which', () => {
    expect(() => decodeSave(JSON.stringify({ ...game, step: -1 }))).toThrow(/step/)
    expect(() => decodeSave(JSON.stringify({ ...game, flags: ['x'] }))).toThrow(/flags/)
  })
})
