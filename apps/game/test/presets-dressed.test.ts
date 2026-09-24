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

  it('dresses sixteen of them out of the parts this archive holds', () => {
    // **Sixteen of twenty-nine**, and the thirteen are almost all one problem.
    //
    // Twelve name parts that are perfectly well-formed — `p_b501`, `p_p201`,
    // `p_p190` — and are simply **not in `chara_pc.gp2`**. Whether they live
    // in `chara_pd.gp2`, the larger rig the parts documentation mentions, is
    // **not established**; see `docs/party-and-vocations.md`. Five of them
    // want the same `p_p190`, which is the single most valuable one to find.
    //
    // The thirteenth is the file being odd in a way `FORMAT.md` already
    // records by hand: preset 23's legwear is `8001`, which is in no part
    // band at all and names nothing.
    expect(tried.filter((t) => t.dressed)).toHaveLength(16)
  })

  it('names the ones it cannot, and every one is a missing part rather than a crash', () => {
    const failed = tried.filter((t) => !t.dressed).map((t) => t.index)
    expect(failed).toEqual([3, 5, 10, 11, 16, 18, 20, 23, 24, 25, 26, 27, 28])
    // Exactly one is a legwear id in no part band: preset 23's `8001`, which
    // `FORMAT.md` calls out by hand. Every other failure names a part that
    // could exist and does not, here.
    const nameless = tried.filter((t) => !t.dressed && t.why.includes('—'))
    expect(nameless.map((t) => t.index)).toEqual([23])
    // The same missing legwear accounts for five of the thirteen.
    const wantP190 = tried.filter((t) => !t.dressed && t.why.includes('p_p190'))
    expect(wantP190.map((t) => t.index)).toEqual([11, 16, 24, 26, 28])
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
