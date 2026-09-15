import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { readItemStats, STATS_GAP } from '../src/itemstats.ts'

/**
 * An equipment table built in code from FORMAT.md — no cartridge bytes: the
 * head, N records (left empty), N entries from 32 × N, the gap, and the names.
 */
function table(entries: { name: string; word5: number }[]): Uint8Array {
  const n = entries.length
  const names = entries.flatMap((e) => [...e.name].map((c) => c.charCodeAt(0)).concat(0))
  const namesAt = 32 * n + 32 * n + STATS_GAP
  const out = new Uint8Array(namesAt + names.length)
  const d = new DataView(out.buffer)
  d.setUint16(0, n, true)
  d.setUint32(8, names.length, true)
  entries.forEach((e, k) => {
    d.setUint32(32 * n + 32 * k, 0xaa, true)
    d.setUint32(32 * n + 32 * k + 20, e.word5, true)
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
