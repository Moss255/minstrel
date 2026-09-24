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
  type SaveMember,
  type SaveStore,
  writeSave,
} from '../src/save.ts'

const game: SaveGame = {
  version: SAVE_VERSION,
  savedAt: '2026-09-13T10:00:00.000Z',
  map: 'M01M02',
  at: { x: 1.5, y: 0.25, z: -2, facing: 3.1 },
  stage: { major: 2, minor: 1 },
  members: [
    {
      attnpc: null,
      exp: 0,
      hp: 12,
      mp: null,
      gains: { maxHp: 3, skillPoints: 2 },
      equipped: { weapon: 20004 },
    },
    { attnpc: 2, exp: 40, hp: 7, mp: null, gains: {}, equipped: { shield: 22000 } },
  ],
  gold: 85,
  items: [
    [20004, 1],
    [22000, 3],
  ],
  opened: ['#21', 'M01M07/3'],
}

/** The Hero's place, which most of these are about. */
const hero = game.members[0] as SaveMember
/** A version-2 save: the Hero's five loose fields, and a bare list of numbers. */
const v2 = {
  version: 2,
  savedAt: game.savedAt,
  map: game.map,
  at: game.at,
  stage: game.stage,
  gold: game.gold,
  items: game.items,
  opened: game.opened,
  party: [2],
  equipped: { weapon: 20004 },
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
    expect(equippedOf(back.members[0] as SaveMember).get('weapon')).toBe(20004)
    expect(equippedRecord(equippedOf(back.members[0] as SaveMember))).toEqual({ weapon: 20004 })
    // **The party goes round too**, which it never did before: the old format
    // kept companions as bare numbers, so a wounded Ivor with a shield came
    // back whole and empty-handed.
    expect(back.members).toHaveLength(2)
    expect(back.members[1]).toEqual({
      attnpc: 2,
      exp: 40,
      hp: 7,
      mp: null,
      gains: {},
      equipped: { shield: 22000 },
    })
  })

  it('are refused whole, saying why, when a field does not read', () => {
    expect(() => decodeSave('not json')).toThrow(/not JSON/)
    expect(() => decodeSave(encodeSave({ ...game, version: 4 as 3 }))).toThrow(/version 4/)
    const withHero = (over: Record<string, unknown>) =>
      JSON.stringify({ ...game, members: [{ ...hero, ...over }, game.members[1]] })
    expect(() => decodeSave(withHero({ hp: -1 }))).toThrow(/Hero has HP/)
    expect(() => decodeSave(withHero({ mp: 'lots' }))).toThrow(/Hero has MP/)
    expect(() => decodeSave(withHero({ gains: { luck: 1 } }))).toThrow(/Hero has seeds/)
    expect(() => decodeSave(withHero({ equipped: { hat: 1 } }))).toThrow(/Hero wears hat/)
    expect(() => decodeSave(withHero({ exp: -1 }))).toThrow(/Hero has no experience/)
    // **Which place is wrong is said**, because "HP that do not read" in a
    // party of four is not a thing anyone can act on.
    const broken = JSON.stringify({ ...game, members: [hero, { ...game.members[1], hp: -1 }] })
    expect(() => decodeSave(broken)).toThrow(/party place 1 has HP/)
    // A party with nobody in it, or one that does not begin with the Hero.
    expect(() => decodeSave(JSON.stringify({ ...game, members: [] }))).toThrow(/no party/)
    expect(() => decodeSave(JSON.stringify({ ...game, members: [game.members[1]] }))).toThrow(
      /begin with the Hero/,
    )
    expect(() => decodeSave(JSON.stringify({ ...game, map: '' }))).toThrow(/no map/)
    expect(() => decodeSave(JSON.stringify({ ...game, at: { x: 1 } }))).toThrow(/spot/)
    expect(() => decodeSave(JSON.stringify({ ...game, gold: -1 }))).toThrow(/gold/)
    expect(() => decodeSave(JSON.stringify({ ...game, items: [[1]] }))).toThrow(/bag/)
    expect(() => decodeSave(JSON.stringify({ ...game, opened: [1] }))).toThrow(/opened/)
    expect(decodeSave(JSON.stringify({ ...game, stage: null })).stage).toBeNull()
  })

  it('read from version 2, lifting the Hero’s loose fields into the party', () => {
    // **A person part-way through the slice has no other copy**, so the older
    // shapes are read rather than refused. Version 2 kept the Hero's five
    // fields at the top level and everyone else as a bare `attnpc` number, so
    // the companion comes back with exactly what version 2 gave them: nothing.
    const back = decodeSave(JSON.stringify(v2))
    expect(back.version).toBe(SAVE_VERSION)
    expect(back.members).toEqual([
      hero,
      { attnpc: 2, exp: 0, hp: null, mp: null, gains: {}, equipped: {} },
    ])
  })

  it('read from version 1, before HP, MP and seeds were kept, with the Hero whole and unseeded', () => {
    const { hp: _hp, mp: _mp, gains: _gains, party: _party, ...older } = v2
    const back = decodeSave(JSON.stringify({ ...older, version: 1 }))
    expect(back.members).toEqual([{ ...hero, hp: null, mp: null, gains: {} }])
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
