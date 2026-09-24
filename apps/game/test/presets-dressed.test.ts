import { readFileSync } from 'node:fs'
import { partName } from '@minstrel/game-formats'
import { beforeAll, describe, expect, it } from 'vitest'
import { outfitOfPreset } from '../src/hero.ts'
import { type Loaded, load } from '../src/load.ts'

const romPath = process.env.MINSTREL_TEST_ROM

/**
 * **Every character preset, dressed from the parts the game has.**
 *
 * `readCharacterPresets` proves the file reads; this asks the question after
 * it — whether each of the twenty-nine ready-made characters can actually be
 * built out of `chara_pc.gp2`, which is what character creation will need.
 *
 * It is a measurement as much as a test, like `event-coverage.test.ts`: the
 * numbers are pinned so that dressing one more shows up as a smaller failure
 * list, and the failures are named so the next person can chase them.
 *
 * Local-only: skipped without a dump.
 */
describe.skipIf(!romPath)('the presets, dressed', () => {
  let loaded: Loaded
  /** For each preset, the outfit it came to, or why it did not. */
  let tried: { index: number; dressed: boolean; why: string }[] = []

  beforeAll(() => {
    const rom = new Uint8Array(readFileSync(romPath as string))
    loaded = load(rom, { map: 'C01' })
    const has = (name: string) =>
      loaded.wardrobe.parts.has(name) || loaded.wardrobe.textures.has(name)
    tried = loaded.presets.map((preset) => {
      const outfit = outfitOfPreset(preset.outfit, 'back', has)
      const want = (id: number) => `${id}(${partName(id) ?? '—'})`
      return {
        index: preset.index,
        dressed: outfit !== undefined,
        why: outfit
          ? `${outfit.body} ${outfit.legs}`
          : `armour ${want(preset.outfit.armour)} legwear ${want(preset.outfit.legwear)}`,
      }
    })
    console.log(`${tried.filter((t) => t.dressed).length} of ${tried.length} presets dress`)
    for (const t of tried.filter((one) => !one.dressed)) console.log(`  ${t.index}: ${t.why}`)
  }, 120_000)

  it('reads all twenty-nine off the cartridge', () => {
    expect(loaded.presets).toHaveLength(29)
  })

  it('dresses all twenty-nine', () => {
    // **Sixteen, until the reason for the thirteen was read.** The message
    // said "armour X legwear Y — not in this wardrobe" and named both when
    // only one was wrong: every missing armour is in `chara_pc.gp2`, and the
    // legwear is not in `chara_pc.gp2` *or* `chara_pd.gp2`.
    //
    // The presets genuinely name legwear the cartridge has not got — `p_p190`
    // while `p_p191` is there, `p_p201` while `p_p200` and `p_p202` are — so
    // the rig falls back to the underclothes, which is the rule `outfitOf`
    // has always used for an empty slot. It is the file's arrangement, not a
    // gap papered over.
    expect(tried.filter((t) => t.dressed)).toHaveLength(29)
  })

  it('says which wear the underclothes because their legwear is not there', () => {
    const has = (name: string) =>
      loaded.wardrobe.parts.has(name) || loaded.wardrobe.textures.has(name)
    const borrowed: { index: number; wanted: string }[] = []
    for (const preset of loaded.presets) {
      const outfit = outfitOfPreset(preset.outfit, 'back', has)
      const wanted = partName(preset.outfit.legwear)
      if (outfit && outfit.legs !== wanted) {
        borrowed.push({ index: preset.index, wanted: wanted ?? `${preset.outfit.legwear}` })
      }
    }
    // **Thirteen of twenty-nine**, wanting seven legwear parts between them —
    // six that could exist and do not, and `8001`, which is in no part band
    // at all and is the one `FORMAT.md` already calls out by hand.
    expect(borrowed.map((b) => b.index)).toEqual([3, 5, 10, 11, 16, 18, 20, 23, 24, 25, 26, 27, 28])
    expect([...new Set(borrowed.map((b) => b.wanted))].sort()).toEqual([
      '8001',
      'p_p101',
      'p_p102',
      'p_p110',
      'p_p112',
      'p_p190',
      'p_p201',
    ])
    // Every one falls back to the underclothes rather than to the Hero's, so
    // `p_p090` is on the cartridge and the second fallback never runs here.
    for (const preset of loaded.presets) {
      const outfit = outfitOfPreset(preset.outfit, 'back', has)
      const wanted = partName(preset.outfit.legwear)
      if (outfit && outfit.legs !== wanted) expect(outfit.legs).toBe('p_p090')
    }
  })

  it('gives every dressed preset a body, legs and a face', () => {
    const has = (name: string) =>
      loaded.wardrobe.parts.has(name) || loaded.wardrobe.textures.has(name)
    for (const preset of loaded.presets) {
      const outfit = outfitOfPreset(preset.outfit, 'back', has)
      if (!outfit) continue
      expect(outfit.body, `preset ${preset.index}`).toMatch(/^p_b\d{3}$/)
      expect(outfit.legs, `preset ${preset.index}`).toMatch(/^p_p\d{3}$/)
      // A face is INFERRED from value 78 and lands on one that exists.
      expect(outfit.face, `preset ${preset.index}`).toMatch(/^p_f\d{3}$/)
      // Hair is **ours** — the file names none, so every one wears the Hero's.
      expect(outfit.hair, `preset ${preset.index}`).toBe('p_h000a')
    }
  })
})
