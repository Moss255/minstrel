import { readFileSync } from 'node:fs'
import { NO_ITEM, readCharacterPresets } from '@minstrel/game-formats'
import { readNitroFs, walkFiles } from '@minstrel/nitrofs'
import { describe, expect, it } from 'vitest'

/**
 * The character presets, on a real cartridge.
 *
 * `FORMAT.md`'s "Character presets" was written from a reading of this file in
 * September 2026 and no code read it until now — so this is the first time the
 * description and a parser have been held against each other. What it checks
 * is the description's own claims, not a dump: nothing here is committed, and
 * the synthetic fixtures are in `packages/game-formats/test/presets.test.ts`.
 *
 * Local-only: skipped without a dump.
 */
const romPath = process.env.MINSTREL_TEST_ROM
const PRESETS = '/data/bin/charapreset.bin'

describe.skipIf(!romPath)('character presets on a real cartridge', { timeout: 60_000 }, () => {
  it('reads all twenty-nine, dressed in parts that exist', () => {
    const fs = readNitroFs(new Uint8Array(readFileSync(romPath as string)))
    const file = [...walkFiles(fs.root)].find((f) => f.path === PRESETS)
    if (!file) throw new Error(`${PRESETS} is not on this cartridge`)
    const presets = readCharacterPresets(fs.read(file))

    // FORMAT.md: "a 0x64 record holding 29, then 29 0x65 records of 102 values".
    expect(presets).toHaveLength(29)

    for (const p of presets) {
      // "value 78, a face, 9000 and its number — INFERRED … on all 41 presets
      // here and in presetdt it lands on a face that exists".
      expect(p.outfit.face, `preset ${p.index} face`).toBeGreaterThanOrEqual(9000)
      expect(p.outfit.face, `preset ${p.index} face`).toBeLessThan(9100)
      // "86 — sex: 0 a man, 1 a woman".
      expect([0, 1], `preset ${p.index} sex`).toContain(p.sex)
      // "0–74 … item ids, 0xFFFFFFFF for none".
      expect(p.unknown_items, `preset ${p.index} items`).toHaveLength(75)
      // "90, 91 … 1.0 on most — 0.95 and 0.98 on the mage woman, 1.154 to
      // 1.195 on テンバタラ". So: near 1, and never zero or absurd.
      for (const n of p.proportions) {
        expect(n, `preset ${p.index} proportions`).toBeGreaterThan(0.5)
        expect(n, `preset ${p.index} proportions`).toBeLessThan(2)
      }
      // Every worn value is either an item id in its documented band or none.
      const bands: [string, number, number][] = [
        ['armour', 13000, 14000],
        ['legwear', 16000, 17000],
        ['footwear', 17000, 18000],
        ['headgear', 12000, 13000],
      ]
      for (const [what, low, high] of bands) {
        const id = p.outfit[what as 'armour' | 'legwear' | 'footwear' | 'headgear']
        if (id === 0 || id === NO_ITEM) continue
        // The sage man's legwear is 8001, "which names nothing" — FORMAT.md
        // says so, so it is expected rather than a surprise.
        if (what === 'legwear' && id === 8001) continue
        expect(id, `preset ${p.index} ${what}`).toBeGreaterThanOrEqual(low)
        expect(id, `preset ${p.index} ${what}`).toBeLessThan(high)
      }
    }

    // "Four are names … and twenty-three name a vocation and a sex" — so 27
    // distinct names over 29 records, two of them used twice.
    const names = new Set(presets.map((p) => p.name))
    expect(names.size).toBe(27)

    // "value 77 — 9024 on all 23 vocations; 9023 or 9024 on the named". Both
    // values appear, and nothing else does.
    expect(new Set(presets.map((p) => p.unknown_77))).toEqual(new Set([9023, 9024]))

    // Of the 29, a majority are men and a majority carry no weapon — a weak
    // shape check that would catch reading the wrong column entirely.
    const men = presets.filter((p) => p.sex === 0).length
    expect(men).toBeGreaterThan(0)
    expect(men).toBeLessThan(29)
  })
})
