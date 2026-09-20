import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { readMonsterBattle, readMonsterNames } from '../src/monsterdata.ts'

/** Battle numbers built in code, from `FORMAT.md`: the head word, then 132-byte records. */
function battle(monsters: { number: number; hp: number; exp: number; gold: number }[]): Uint8Array {
  const out = new Uint8Array(4 + monsters.length * 132)
  const view = new DataView(out.buffer)
  view.setUint32(0, monsters.length, true)
  for (const [r, m] of monsters.entries()) {
    const at = 4 + r * 132
    view.setUint16(at, 0x8000 | m.number, true)
    view.setUint16(at + 4, 22000, true)
    view.setUint16(at + 6, 22019, true)
    view.setUint32(at + 8, m.exp, true)
    view.setUint16(at + 12, m.gold, true)
    for (let i = 0; i < 6; i++) view.setUint16(at + 0x18 + i * 2, i + 1, true)
    view.setUint16(at + 0x5c, m.hp, true)
    view.setUint16(at + 0x5e, 2, true)
    view.setUint16(at + 0x60, 10, true)
    view.setUint16(at + 0x62, 7, true)
    view.setUint16(at + 0x64, 6, true)
    // Neighbours either side of the 22 resistances, which must not leak in.
    out[at + 0x6b] = 0xee
    for (let i = 0; i < 22; i++) out[at + 0x6c + i] = 100 + i + r
    out[at + 0x82] = 0xdd
  }
  return out
}

/** Names built in code: the head word, 28-byte records, then the strings — name, plural, code. */
function names(
  monsters: { number: number; name: string; code: string; grammar?: number }[],
): Uint8Array {
  const strings: number[] = []
  const put = (s: string) => {
    const offset = strings.length
    for (const c of s) strings.push(c.charCodeAt(0))
    strings.push(0)
    return offset
  }
  const offsets = monsters.map(({ name, code }) => [put(name), put(`${name}s`), put(code)] as const)
  const out = new Uint8Array(4 + monsters.length * 28 + strings.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, (monsters.length | (strings.length << 12)) >>> 0, true)
  for (const [r, m] of monsters.entries()) {
    const at = 4 + r * 28
    const [name, plural, code] = offsets[r] as readonly [number, number, number]
    view.setUint32(at, name, true)
    view.setUint32(at + 4, code, true)
    view.setUint16(at + 8, m.number, true)
    view.setUint32(at + 0x14, plural, true)
    view.setUint32(at + 0x18, m.grammar ?? 0, true)
  }
  out.set(strings, 4 + monsters.length * 28)
  return out
}

describe('monster data', () => {
  it('reads the battle numbers: number, drops, experience, gold, actions and the five stats', () => {
    const [slime, big] = readMonsterBattle(
      battle([
        { number: 1, hp: 8, exp: 2, gold: 4 },
        { number: 900, hp: 32000, exp: 70000, gold: 600 },
      ]),
    )
    expect(slime).toMatchObject({
      number: 1,
      drops: [22000, 22019],
      exp: 2,
      gold: 4,
      actions: [1, 2, 3, 4, 5, 6],
      maxHp: 8,
      maxMp: 2,
      attack: 10,
      defence: 7,
      agility: 6,
    })
    expect(slime?.raw).toHaveLength(132)
    expect(big?.number).toBe(900)
    expect(big?.exp).toBe(70000)
  })

  it('reads 22 resistances from the record’s tail, and only those', () => {
    const [slime, big] = readMonsterBattle(
      battle([
        { number: 1, hp: 8, exp: 2, gold: 4 },
        { number: 2, hp: 9, exp: 2, gold: 4 },
      ]),
    )
    expect(slime?.resistances).toEqual(Array.from({ length: 22 }, (_, i) => 100 + i))
    expect(big?.resistances[0]).toBe(101)
    expect(big?.resistances).toHaveLength(22)
  })

  it('reads each monster’s name and code by its number', () => {
    expect(
      readMonsterNames(
        names([
          { number: 1, name: 'blob', code: 'z000a' },
          { number: 38, name: 'box', code: 'z009a' },
        ]),
      ).map(({ number, name, code }) => ({ number, name, code })),
    ).toEqual([
      { number: 1, name: 'blob', code: 'z000a' },
      { number: 38, name: 'box', code: 'z009a' },
    ])
  })

  it('reads each monster’s plural and grammar', () => {
    const [blob] = readMonsterNames(
      names([{ number: 1, name: 'blob', code: 'z000a', grammar: 0x02041041 }]),
    )
    expect(blob?.plural).toBe('blobs')
    expect(blob?.grammar).toMatchObject({ indefinite: 101, definite: 1, gender: 2 })
    expect(blob?.unknown_0x0a).toHaveLength(10)
  })

  it('refuses a head that disagrees with the file', () => {
    const good = battle([{ number: 1, hp: 8, exp: 2, gold: 4 }])
    expect(() => readMonsterBattle(good.subarray(0, good.length - 2))).toThrow(GameFormatError)
    const named = names([{ number: 1, name: 'blob', code: 'z000a' }])
    expect(() => readMonsterNames(named.subarray(0, named.length - 1))).toThrow(/not its/)
  })
})
