import { describe, expect, it } from 'vitest'
import { readBattleEncounters, readFieldEncounters } from '../src/encounters.ts'
import { GameFormatError } from '../src/errors.ts'
import { readFieldMonsters } from '../src/fieldmonsters.ts'

type Kind = 1 | 2
/**
 * Build a tagged data table. Fixtures may not contain cartridge bytes, so the
 * layout is implemented here from `FORMAT.md`: the head, then records of a tag,
 * a count and two type bits per value, padded with 0xFF to a word, then the
 * values; no strings. A value given as `[number, 2]` is a float.
 */
function build(records: { tag: number; values: (number | [number, Kind])[] }[]): Uint8Array {
  const body: number[] = []
  for (const { tag, values } of records) {
    const kinds = values.map((v) => (Array.isArray(v) ? v[1] : 1))
    const typeBytes = Math.ceil(values.length / 4)
    const head = Math.ceil((3 + typeBytes) / 4) * 4
    body.push(tag & 0xff, (tag >>> 8) & 0xff, values.length)
    for (let b = 0; b < typeBytes; b++) {
      let bits = 0
      for (let i = 0; i < 4 && b * 4 + i < values.length; i++)
        bits |= (kinds[b * 4 + i] as Kind) << (i * 2)
      body.push(bits)
    }
    for (let i = 3 + typeBytes; i < head; i++) body.push(0xff)
    for (const value of values) {
      const view = new DataView(new ArrayBuffer(4))
      if (Array.isArray(value) && value[1] === 2) view.setFloat32(0, value[0], true)
      else view.setUint32(0, (Array.isArray(value) ? value[0] : value) >>> 0, true)
      body.push(...new Uint8Array(view.buffer))
    }
  }
  const out = new Uint8Array(16 + body.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, records.length, true)
  view.setUint32(4, 16 + body.length, true)
  out.set(body, 16)
  return out
}

const roam = (number: number, weight: number) => ({
  tag: 0x67,
  values: [(weight << 12) | number, 1],
})

describe('encounters', () => {
  it("reads each map's zones by the map's id, with who roams them and how often", () => {
    const table = readFieldEncounters(
      build([
        { tag: 0x69, values: [20001, 0, 0, 0, 0] },
        { tag: 0x68, values: [12] },
        { tag: 0x66, values: [0xe02810] },
        roam(1, 7),
        roam(56, 6),
        { tag: 0x68, values: [14] },
        { tag: 0x66, values: [0xe02819] },
        roam(1, 4),
        { tag: 0x69, values: [7102, 0, 0, 0, 0] },
        { tag: 0x68, values: [32] },
        { tag: 0x66, values: [0x80082a] },
        roam(4, 7),
      ]),
    )
    expect([...table.keys()]).toEqual([20001, 7102])
    const [first, second] = table.get(20001) ?? []
    expect(first).toEqual({
      zone: 12,
      kind: 0,
      unknown_head: 0xe02810,
      monsters: [
        { number: 1, weight: 7, unknown_1: 1 },
        { number: 56, weight: 6, unknown_1: 1 },
      ],
    })
    expect(second?.zone).toBe(14)
    expect(table.get(7102)?.[0]?.monsters[0]?.number).toBe(4)
  })

  it("reads a zone's kind from the low three bits of its word: a field's pair, and the rest", () => {
    const table = readFieldEncounters(
      build([
        { tag: 0x69, values: [20001, 0, 0, 0, 0] },
        { tag: 0x68, values: [12] },
        { tag: 0x66, values: [0xe02810] },
        { tag: 0x68, values: [14] },
        { tag: 0x66, values: [0xe02819] },
        { tag: 0x68, values: [15] },
        { tag: 0x66, values: [0x60481a] },
        { tag: 0x69, values: [7102, 0, 0, 0, 0] },
        { tag: 0x68, values: [32] },
        { tag: 0x66, values: [0x80082a] },
      ]),
    )
    expect(table.get(20001)?.map((z) => z.kind)).toEqual([0, 1, 2])
    expect(table.get(7102)?.map((z) => z.kind)).toEqual([2])
    // The word is still carried whole.
    expect(table.get(20001)?.[1]?.unknown_head).toBe(0xe02819)
  })

  it("reads each zone's roamers and battle company", () => {
    const zones = readBattleEncounters(
      build([
        { tag: 0x68, values: [12] },
        { tag: 0x66, values: [(92 << 16) | (9 << 12) | 1, 0] },
        { tag: 0x67, values: [(4 << 16) | (13 << 12) | 32] },
      ]),
    )
    expect(zones.get(12)).toEqual({
      zone: 12,
      roamers: [{ number: 1, unknown_bits: (92 << 4) | 9, unknown_1: 0 }],
      // 77: weight 5, and one of it, at least and at most.
      company: [
        {
          number: 32,
          unknown_bits: (4 << 4) | 13,
          unknown_1: 0,
          weight: 5,
          least: 1,
          most: 1,
        },
      ],
    })
  })

  it('reads a companion’s weight and how many of it join, three bits each', () => {
    const word = (weight: number, least: number, most: number, number: number) =>
      (((most << 6) | (least << 3) | weight) << 12) | number
    const zone = readBattleEncounters(
      build([
        { tag: 0x68, values: [7] },
        { tag: 0x67, values: [word(3, 1, 4, 56)] },
        { tag: 0x67, values: [word(7, 2, 5, 57)] },
      ]),
    ).get(7)
    expect(
      zone?.company.map(({ number, weight, least, most }) => [number, weight, least, most]),
    ).toEqual([
      [56, 3, 1, 4],
      [57, 7, 2, 5],
    ])
  })

  it('refuses zones and monsters out of order', () => {
    expect(() => readFieldEncounters(build([{ tag: 0x68, values: [1] }]))).toThrow(GameFormatError)
    expect(() => readFieldEncounters(build([{ tag: 0x69, values: [1] }, roam(1, 1)]))).toThrow(
      /before any zone/,
    )
    expect(() => readBattleEncounters(build([{ tag: 0x67, values: [1] }]))).toThrow(
      /before any zone/,
    )
  })
})

describe('field monsters', () => {
  it('reads each monster: its number, speed, attack and defence, and the rest carried', () => {
    const table = readFieldMonsters(
      build([
        { tag: 0x64, values: [2] },
        { tag: 0x65, values: [1, 1, 5, 0x3c0251, [0.4, 2], 10, 7] },
        { tag: 0x65, values: [3, -99, -99, 0x3c2699, [0.4, 2], 35, 256] },
      ]),
    )
    expect(table.get(1)).toEqual({
      number: 1,
      unknown_1: 1,
      unknown_2: 5,
      unknown_3: 0x3c0251,
      speed: expect.closeTo(0.4, 5),
      attack: 10,
      defence: 7,
    })
    expect(table.get(3)?.unknown_1).toBe(-99)
    expect(() => readFieldMonsters(build([{ tag: 0x65, values: [1, 2, 3] }]))).toThrow(
      GameFormatError,
    )
  })
})
