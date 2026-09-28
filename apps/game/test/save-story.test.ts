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
  members: [{ attnpc: null, exp: [], hp: null, mp: null, gains: {}, outfits: [] }],
  gold: 100,
  items: [],
  opened: [],
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

  it('keeps the marks, the live thread and every thread of the story', () => {
    const threads = [
      { stage: { major: 7, minor: 2 }, step: 1, flags: [3], marks: [0] },
      { stage: { major: 6, minor: 4 }, step: 2, flags: [], marks: [5] },
      { stage: null, step: 0, flags: [], marks: [] },
      { stage: { major: 0, minor: 0 }, step: 0, flags: [], marks: [] },
      { stage: { major: 12, minor: 1 }, step: 3, flags: [1, 2], marks: [] },
    ]
    const back = decodeSave(encodeSave({ ...game, marks: [7], globals: [92], thread: 1, threads }))
    expect(back.marks).toEqual([7])
    expect(back.globals).toEqual([92])
    expect(back.thread).toBe(1)
    expect(back.threads).toEqual(threads)
  })

  it('reads a save from before threads were kept as having none', () => {
    const back = decodeSave(encodeSave(game))
    expect(back.thread).toBeUndefined()
    expect(back.threads).toBeUndefined()
    expect(back.marks).toBeUndefined()
  })

  it('refuses marks, a thread or threads that do not read, saying which', () => {
    expect(() => decodeSave(JSON.stringify({ ...game, marks: [-2] }))).toThrow(/marks/)
    expect(() => decodeSave(JSON.stringify({ ...game, globals: [0.5] }))).toThrow(/game-wide/)
    expect(() => decodeSave(JSON.stringify({ ...game, thread: 'one' }))).toThrow(/thread/)
    const bad = [{ stage: { major: 1 }, step: 0, flags: [], marks: [] }]
    expect(() => decodeSave(JSON.stringify({ ...game, threads: bad }))).toThrow(/threads/)
  })
})
