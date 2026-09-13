import { describe, expect, it } from 'vitest'
import {
  bagOf,
  decodeSave,
  encodeSave,
  equippedOf,
  equippedRecord,
  readSave,
  SAVE_KEY,
  SAVE_VERSION,
  type SaveGame,
  type SaveStore,
  writeSave,
} from '../src/save.ts'

const game: SaveGame = {
  version: SAVE_VERSION,
  savedAt: '2026-09-13T10:00:00.000Z',
  map: 'M01M02',
  at: { x: 1.5, y: 0.25, z: -2, facing: 3.1 },
  stage: { major: 2, minor: 1 },
  gold: 85,
  items: [
    [20004, 1],
    [22000, 3],
  ],
  equipped: { weapon: 20004 },
  opened: ['#21', 'M01M07/3'],
  exp: 0,
  hp: 12,
  mp: null,
  gains: { maxHp: 3, skillPoints: 2 },
}

function memory(): SaveStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
  }
}

describe('saves', () => {
  it('come back as they went in, bag and equipment included', () => {
    const back = decodeSave(encodeSave(game))
    expect(back).toEqual(game)
    expect([...bagOf(back).items]).toEqual([
      [20004, 1],
      [22000, 3],
    ])
    expect(equippedOf(back).get('weapon')).toBe(20004)
    expect(equippedRecord(equippedOf(back))).toEqual({ weapon: 20004 })
  })

  it('are refused whole, saying why, when a field does not read', () => {
    expect(() => decodeSave('not json')).toThrow(/not JSON/)
    expect(() => decodeSave(encodeSave({ ...game, version: 3 as 2 }))).toThrow(/version 3/)
    expect(() => decodeSave(JSON.stringify({ ...game, hp: -1 }))).toThrow(/HP/)
    expect(() => decodeSave(JSON.stringify({ ...game, mp: 'lots' }))).toThrow(/MP/)
    expect(() => decodeSave(JSON.stringify({ ...game, gains: { luck: 1 } }))).toThrow(/gains/)
    expect(() => decodeSave(JSON.stringify({ ...game, map: '' }))).toThrow(/no map/)
    expect(() => decodeSave(JSON.stringify({ ...game, at: { x: 1 } }))).toThrow(/spot/)
    expect(() => decodeSave(JSON.stringify({ ...game, gold: -1 }))).toThrow(/gold/)
    expect(() => decodeSave(JSON.stringify({ ...game, items: [[1]] }))).toThrow(/bag/)
    expect(() => decodeSave(JSON.stringify({ ...game, equipped: { hat: 1 } }))).toThrow(/wears hat/)
    expect(() => decodeSave(JSON.stringify({ ...game, opened: [1] }))).toThrow(/opened/)
    expect(decodeSave(JSON.stringify({ ...game, stage: null })).stage).toBeNull()
  })

  it('read from version 1, before HP, MP and seeds were kept, with the Hero whole and unseeded', () => {
    const { hp: _hp, mp: _mp, gains: _gains, ...older } = game
    const back = decodeSave(JSON.stringify({ ...older, version: 1 }))
    expect(back).toEqual({ ...game, version: SAVE_VERSION, hp: null, mp: null, gains: {} })
  })

  it('are kept in storage under their key, and read back, or not, or say why not', () => {
    const store = memory()
    expect(readSave(store)).toBeUndefined()
    expect(writeSave(store, game)).toBe(true)
    expect(store.data.has(SAVE_KEY)).toBe(true)
    expect(readSave(store)).toEqual({ game })
    store.data.set(SAVE_KEY, '{}')
    expect(readSave(store)).toEqual({ error: expect.stringContaining('version') })
    expect(writeSave(undefined, game)).toBe(false)
    const refusing: SaveStore = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('full')
      },
    }
    expect(writeSave(refusing, game)).toBe(false)
    expect(readSave(refusing)).toBeUndefined()
  })
})
