import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { readItemStats, STATS_GAP } from '../src/itemstats.ts'

/**
 * An equipment table built in code from FORMAT.md — no cartridge bytes: the
 * head, N records (left empty), N entries from 32 × N, the gap, and the names.
 */
function table(
  entries: {
    name: string
    word5: number
    word3?: number
    word4?: number
    word6?: number
    word7?: number
  }[],
): Uint8Array {
  const n = entries.length
  const names = entries.flatMap((e) => [...e.name].map((c) => c.charCodeAt(0)).concat(0))
  const namesAt = 32 * n + 32 * n + STATS_GAP
  const out = new Uint8Array(namesAt + names.length)
  const d = new DataView(out.buffer)
  d.setUint16(0, n, true)
  d.setUint32(8, names.length, true)
  entries.forEach((e, k) => {
    const at = 32 * n + 32 * k
    d.setUint32(at, 0xaa, true)
    d.setUint32(at + 12, e.word3 ?? 0, true)
    d.setUint32(at + 16, e.word4 ?? 0, true)
    d.setUint32(at + 20, e.word5, true)
    d.setUint32(at + 24, e.word6 ?? 0, true)
    d.setUint32(at + 28, e.word7 ?? 0, true)
  })
  out.set(names, namesAt)
  return out
}

describe('an equipment table’s stats', () => {
  it('reads each entry’s name, attack and defence, in the names’ order', () => {
    const stats = readItemStats(
      table([
        { name: 'copper blade', word5: 7 },
        { name: 'tin lid', word5: (12 << 10) | 3 },
      ]),
    )
    expect(stats.map(({ name, attack, defence }) => ({ name, attack, defence }))).toEqual([
      { name: 'copper blade', attack: 7, defence: 0 },
      { name: 'tin lid', attack: 3, defence: 12 },
    ])
    // Ten bits each: what stands above them is not theirs.
    expect(
      readItemStats(table([{ name: 'x', word5: (1 << 20) | (5 << 10) | 9 }]))[0],
    ).toMatchObject({ attack: 9, defence: 5 })
  })

  it('reads the rest of an entry: word 7’s three, word 6’s three, the kind and who may wear it', () => {
    const [ring] = readItemStats(
      table([
        {
          name: 'ring',
          word5: 0,
          word3: (4 << 7) | 1,
          word4: 0x18000ebe,
          // Three ten-bit fields: the block, the evasion, the critical.
          word6: (40 << 20) | (30 << 10) | 25,
          word7: (8 << 20) | (20 << 10) | 25,
        },
      ]),
    )
    expect(ring).toMatchObject({
      deftness: 25,
      agility: 20,
      magicalMight: 8,
      block: 25,
      evasion: 30,
      critical: 40,
      kind: 4,
      usedBy: 0xebe,
    })
  })

  it('carries each entry whole', () => {
    const [first] = readItemStats(table([{ name: 'a', word5: 1 }]))
    expect(first?.unknown_entry).toHaveLength(32)
    expect(first?.unknown_entry[0]).toBe(0xaa)
  })

  it('reads the numbers but names none when the names are not one to an entry', () => {
    const merged = table([
      { name: 'a', word5: 1 },
      { name: 'b', word5: 2 },
    ])
    // "a", then "b": the zero between them made a letter leaves one name for two entries.
    merged[merged.length - 3] = 0x2d
    const stats = readItemStats(merged)
    expect(stats.map((s) => [s.name, s.attack])).toEqual([
      [undefined, 1],
      [undefined, 2],
    ])
  })

  it('refuses a table whose entries do not meet its names, and a name that does not end', () => {
    const wrong = table([{ name: 'a', word5: 1 }])
    new DataView(wrong.buffer).setUint16(0, 3, true)
    expect(() => readItemStats(wrong)).toThrow(GameFormatError)
    const past = table([{ name: 'a', word5: 1 }])
    new DataView(past.buffer).setUint32(8, 100_000, true)
    expect(() => readItemStats(past)).toThrow(/no stats here/)
    const unended = table([{ name: 'ab', word5: 1 }])
    unended[unended.length - 1] = 0x63
    expect(() => readItemStats(unended)).toThrow(/does not end/)
    expect(() => readItemStats(new Uint8Array(8))).toThrow(GameFormatError)
  })
})
