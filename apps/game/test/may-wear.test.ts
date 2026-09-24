import { readFileSync } from 'node:fs'
import { vocationsWielding } from '@minstrel/game-formats'
import { beforeAll, describe, expect, it } from 'vitest'
import { mayWear, SEX, WEAR_WITH_ALL } from '../src/equipment.ts'
import { type Loaded, load } from '../src/load.ts'

const romPath = process.env.MINSTREL_TEST_ROM

/**
 * **Who may wear what, on a real cartridge.**
 *
 * `mayWear` is `func_020dd4c4`'s two rules — a 12-bit mask on armour, the
 * skill trees on weapons and shields — and both halves come from data this
 * repository reads rather than from anything written down here. So the
 * question worth asking of a dump is whether the two rules together say
 * something sensible about *every* piece of equipment, not whether one item
 * behaves.
 *
 * The numbers below are pinned so that a change to either reading shows up as
 * a different count rather than as silence.
 *
 * Local-only: skipped without a dump, and nothing it reads is committed.
 */
describe.skipIf(!romPath)('who may wear what', { timeout: 120_000 }, () => {
  let loaded: Loaded
  /** Every item with stats, by whether it is a weapon or shield. */
  let arms: number[] = []
  let armour: number[] = []

  beforeAll(() => {
    loaded = load(new Uint8Array(readFileSync(romPath as string)), { map: 'M01' })
    for (const [id, numbers] of loaded.itemStats) {
      if (numbers.kind > 0) arms.push(id)
      else if (numbers.usedBy !== 0) armour.push(id)
    }
    arms = arms.sort((a, b) => a - b)
    armour = armour.sort((a, b) => a - b)
  }, 120_000)

  const wielding = (tree: number) =>
    loaded.vocationTrees ? vocationsWielding(loaded.vocationTrees, tree) : 0

  it('reads both halves of the rule off this cartridge', () => {
    expect(loaded.vocationTrees).toBeDefined()
    // 313 weapons and shields with a kind and 631 pieces of armour with a
    // mask, and **nothing in between**: every one of the 944 pieces of
    // equipment whose stats read is decided by one rule or the other.
    expect(arms).toHaveLength(313)
    expect(armour).toHaveLength(631)
    expect(arms.length + armour.length).toBe(loaded.itemStats.size)
    // And every kind is a tree the ARM9 table names — 1 to 13, no 16. That
    // number was what showed `kind` had been read a bit too wide; see
    // `ItemStats.kind`.
    for (const id of arms) {
      expect(loaded.itemStats.get(id)?.kind, `item ${id}`).toBeLessThanOrEqual(13)
    }
  })

  it('gives every vocation something to wear and something it may not', () => {
    for (let vocation = 1; vocation <= 12; vocation++) {
      const canArm = arms.filter((id) =>
        mayWear(loaded.itemStats.get(id), { vocation }, { wielding }),
      )
      const canWear = armour.filter((id) =>
        mayWear(loaded.itemStats.get(id), { vocation }, { wielding }),
      )
      // A vocation holds four of the fourteen weapon trees, so it wields some
      // weapons and not others — and no vocation is barred from all armour.
      expect(canArm.length, `vocation ${vocation} wields`).toBeGreaterThan(0)
      expect(canArm.length, `vocation ${vocation} wields all`).toBeLessThan(arms.length)
      expect(canWear.length, `vocation ${vocation} wears`).toBeGreaterThan(0)
      expect(canWear.length, `vocation ${vocation} wears all`).toBeLessThan(armour.length)
    }
  })

  it('agrees with the vocation presets, which is where the bit order came from', () => {
    // Each of the ready-made vocation characters dresses in pieces carrying
    // **one** vocation's bit — armour, legwear, gloves, footwear and headgear
    // all the same — which is the evidence `readItemStats` inferred the bit
    // order from in the first place. `charapreset.bin` does not *say* which
    // vocation a preset is, so the kit is what names it.
    //
    // So the check is: where a preset's kit agrees on a single bit, `mayWear`
    // says that vocation may wear every piece of it and some other vocation
    // may not.
    let checked = 0
    for (const preset of loaded.presets) {
      const masks = [
        preset.outfit.armour,
        preset.outfit.legwear,
        preset.outfit.gloves,
        preset.outfit.footwear,
        preset.outfit.headgear,
      ].flatMap((id) => {
        const numbers = loaded.itemStats.get(id)
        return numbers && numbers.usedBy !== 0 ? [numbers] : []
      })
      if (masks.length < 3) continue
      const shared = masks.reduce((all, one) => all & one.usedBy, 0xfff)
      // A kit that shares exactly one bit names its vocation; `0xfff` pieces,
      // which any vocation wears, cannot narrow it and are why this is an
      // intersection rather than an equality.
      if (shared === 0 || (shared & (shared - 1)) !== 0) continue
      const vocation = Math.log2(shared) + 1
      checked++
      for (const numbers of masks) {
        expect(mayWear(numbers, { vocation }, { wielding }), `preset ${preset.index}`).toBe(true)
      }
      const other = vocation === 1 ? 2 : 1
      expect(
        masks.some((numbers) => !mayWear(numbers, { vocation: other }, { wielding })),
        `preset ${preset.index} is not everybody's`,
      ).toBe(true)
    }
    // **Twenty-seven of the twenty-nine** name a vocation this way, which is
    // more than `charapreset.bin`'s own description claims (23 vocation
    // presets and four named people): two of the four named characters are
    // dressed in a vocation's kit too. The two that do not are the ones whose
    // clothes are `0xfff` — anyone's.
    expect(checked).toBe(27)
  })

  it('splits the sexes the way the names do', () => {
    // **This is what settles which sex is which**, and it is worth doing on
    // the cartridge rather than in a fixture, because the evidence *is* the
    // cartridge's own words: the game pairs its sex-locked armour by name.
    const named = (want: string) =>
      [...loaded.itemWords].find(([, word]) => word.singular === want)?.[0]
    const sexOf = (want: string) => {
      const id = named(want)
      expect(id, want).toBeDefined()
      return loaded.itemStats.get(id as number)?.wornBySex
    }
    for (const [his, hers] of [
      ['holy mail', 'holy femail'],
      ['rogue<1>s robes', 'roguess<1>s robes'],
    ] as const) {
      expect(sexOf(his), his).toBe(1 << SEX.male)
      expect(sexOf(hers), hers).toBe(1 << SEX.female)
    }
    // And the shape of it: most of the cartridge is open to both, **nothing
    // is closed to both**, and the rest divides as the wardrobe suggests.
    const counts = { both: 0, male: 0, female: 0, neither: 0 }
    for (const [, numbers] of loaded.itemStats) {
      const bits = numbers.wornBySex
      if (bits === 0b11) counts.both++
      else if (bits === 1 << SEX.male) counts.male++
      else if (bits === 1 << SEX.female) counts.female++
      else counts.neither++
    }
    expect(counts).toEqual({ both: 823, male: 40, female: 81, neither: 0 })
  })

  it('agrees with the sex each ready-made character’s record names', () => {
    // `charapreset.bin` carries a `sex` field of its own, and the presets are
    // dressed. **33 of 33** sex-restricted pieces they wear allow the sex
    // their record names — an independent check that the two numberings are
    // the same one.
    let checked = 0
    for (const preset of loaded.presets) {
      for (const id of Object.values(preset.outfit)) {
        const numbers = loaded.itemStats.get(id)
        if (!numbers || numbers.wornBySex === 0b11) continue
        checked++
        expect(
          mayWear(numbers, { vocation: 0, sex: preset.sex }),
          `preset ${preset.index} (sex ${preset.sex}) wears ${id}`,
        ).toBe(true)
      }
    }
    expect(checked).toBe(33)
  })

  it('names the wear-with-all award, and what it cannot lift', () => {
    // `0x020dd6b8`'s literal is 18048, and on this cartridge that id is the
    // **wear-with-all award**, an accessory — which is exactly the item whose
    // job is lifting the sex rule.
    expect(loaded.itemWords.get(WEAR_WITH_ALL)?.singular).toBe('wear-with-all award')
    expect(loaded.goods.get(WEAR_WITH_ALL)?.table).toBe('d')
    // 20 of the 121 sex-restricted pieces carry the lock that says the award
    // does not help — the bikini tops and bustiers among them.
    const locked = [...loaded.itemStats].filter(
      ([, numbers]) => numbers.wornBySex !== 0b11 && numbers.sexLock,
    )
    expect(locked).toHaveLength(20)
    const dress = [...loaded.itemWords].find(([, w]) => w.singular === 'plain dress')?.[0]
    const bikini = [...loaded.itemWords].find(([, w]) => w.singular === 'hot bikini top')?.[0]
    const male = { vocation: 0, sex: SEX.male, wearWithAll: true }
    expect(mayWear(loaded.itemStats.get(dress as number), male)).toBe(true)
    expect(mayWear(loaded.itemStats.get(bikini as number), male)).toBe(false)
  })

  it('lets a weapon tree’s Omnivocational panel override the vocation', () => {
    // The hundred-point panel of each weapon tree is the game's own way past
    // this rule — `0x020dd200`, asked *before* the trees are. Whichever
    // weapon the first vocation may not hold, that panel lets it.
    const barred = arms.find(
      (id) => !mayWear(loaded.itemStats.get(id), { vocation: 1 }, { wielding }),
    )
    expect(barred, 'some weapon the warrior may not hold').toBeDefined()
    const tree = loaded.itemStats.get(barred as number)?.kind as number
    expect(
      mayWear(
        loaded.itemStats.get(barred as number),
        { vocation: 1 },
        { wielding, regardless: (t) => t === tree },
      ),
    ).toBe(true)
  })
})
