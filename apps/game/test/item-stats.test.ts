import { readFileSync } from 'node:fs'
import { scanCartridge } from '@minstrel/cartridge'
import { readItemKinds, readItemStats, readItemTable } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { load } from '../src/load.ts'

/**
 * Equipment's numbers, on a real cartridge — see game-formats' FORMAT.md,
 * "Items", "The stats". Nothing here is committed; it reads the tester's dump.
 */
const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('equipment’s numbers, on a real cartridge', { timeout: 120_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()
  const files = new Map<string, Uint8Array>()
  let kinds = new Map<number, { subtype: number }>()
  if (romPath) {
    for (const leaf of scanCartridge(rom, { pathFilter: '/data/prm/itemdt_' })) {
      const m = /itemdt_([a-z])_([a-z]{2})\.nat$/.exec(leaf.path)
      if (m) files.set(`${m[1]}_${m[2]}`, leaf.bytes)
    }
    for (const leaf of scanCartridge(rom, { pathFilter: '/data/prm/itemsort' })) {
      if (/_en\.bin$/.test(leaf.path)) kinds = readItemKinds(leaf.bytes)
    }
  }
  const names = romPath ? load(rom, { map: 'M01' }).itemNames : new Map<number, string>()
  const idByName = new Map([...names].map(([id, name]) => [name, id]))
  const table = (cat: string, lang = 'en'): Uint8Array => {
    const found = files.get(`${cat}_${lang}`)
    if (!found) throw new Error(`no itemdt_${cat}_${lang}`)
    return found
  }

  /** The sign test over neighbours in price order within each kind: (up − down) / pairs. */
  function followsPrice(cat: string, stat: 'attack' | 'defence'): number {
    const price = new Map(readItemTable(table(cat)).map((r) => [r.id, r.price]))
    const rows = readItemStats(table(cat)).map((s) => {
      const id = (s.name !== undefined && idByName.get(s.name)) || 0
      return { price: price.get(id) ?? 0, kind: kinds.get(id)?.subtype ?? -1, v: s[stat] }
    })
    let up = 0
    let down = 0
    let pairs = 0
    for (const kind of new Set(rows.map((r) => r.kind))) {
      const sorted = rows
        .filter((r) => r.kind === kind && r.price > 0)
        .sort((a, b) => a.price - b.price)
      for (let k = 1; k < sorted.length; k++) {
        const [a, b] = [sorted[k - 1], sorted[k]]
        if (!a || !b || b.price === a.price) continue
        pairs++
        if (b.v > a.v) up++
        else if (b.v < a.v) down++
      }
    }
    return (up - down) / pairs
  }

  it('reads all eight equipment tables, every entry an item by name, and not the tools', () => {
    for (const cat of ['w', 's', 'h', 'b', 'a', 'u', 'l', 'd']) {
      const stats = readItemStats(table(cat))
      expect(stats).toHaveLength(readItemTable(table(cat)).length)
      expect(
        stats.every((s) => s.name !== undefined && idByName.has(s.name)),
        cat,
      ).toBe(true)
    }
    expect(() => readItemStats(table('t'))).toThrow()
  })

  it('has weapons’ attack rising with price within each kind, and their defence nil', () => {
    expect(followsPrice('w', 'attack')).toBeGreaterThan(0.55)
    expect(readItemStats(table('w')).every((s) => s.defence === 0)).toBe(true)
  })

  it('has shields’ defence rising with price, the Flame shield’s 18', () => {
    expect(followsPrice('s', 'defence')).toBeGreaterThan(0.3)
    const flame = readItemStats(table('s')).find((s) => s.name === 'flame shield')
    expect(flame).toMatchObject({ attack: 0, defence: 18 })
  })

  it('reads the rest of an entry: a weapon’s kind as itemsort has it, who may wear an accessory, and each field’s witness', () => {
    for (const s of readItemStats(table('w'))) {
      const id = s.name === undefined ? undefined : idByName.get(s.name)
      expect(s.kind, s.name).toBe((kinds.get(id ?? -1)?.subtype ?? -2) + 1)
    }
    expect(readItemStats(table('s')).every((s) => s.kind === 13)).toBe(true)
    expect(readItemStats(table('d')).every((s) => s.usedBy === 0xfff)).toBe(true)
    const named = (cat: string, name: string) => {
      const found = readItemStats(table(cat)).find((s) => s.name === name)
      if (!found) throw new Error(`no ${name}`)
      return found
    }
    expect(named('d', 'utility belt').deftness).toBeGreaterThan(0)
    expect(named('d', 'agility ring').agility).toBeGreaterThan(0)
    expect(named('d', 'sorcerer<1>s stone').magicalMight).toBeGreaterThan(0)
    expect(named('b', 'cloak of evasion').evasion).toBeGreaterThan(0)
    expect(named('d', 'critical acclaim').critical).toBeGreaterThan(0)
  })

  it('gives a shield its chance of blocking, and nothing else one', () => {
    // Word 6's low ten bits, in tenths — read from `func_02084ee8`, which sums
    // them over all that is worn; the cartridge says only a shield has any.
    for (const cat of ['w', 'h', 'b', 'a', 'u', 'l', 'd']) {
      expect(
        readItemStats(table(cat)).every((s) => s.block === 0),
        cat,
      ).toBe(true)
    }
    const shields = readItemStats(table('s'))
    expect(shields.filter((s) => s.block > 0).length).toBe(42)
    expect(shields.length).toBe(45)
    const block = (name: string) => shields.find((s) => s.name === name)?.block
    // Half a hundredth to begin with, rising with the shield.
    expect(['bronze shield', 'iron shield', 'steel shield'].map(block)).toEqual([5, 10, 15])
    expect(block('metal king shield')).toBe(85)
  })

  it('keeps the same numbers in every language', () => {
    for (const cat of ['w', 's', 'b']) {
      const en = readItemStats(table(cat)).map((s) => [s.attack, s.defence])
      for (const lang of ['fr', 'de', 'it', 'es']) {
        expect(
          readItemStats(table(cat, lang)).map((s) => [s.attack, s.defence]),
          `${cat} ${lang}`,
        ).toEqual(en)
      }
    }
  })
})
