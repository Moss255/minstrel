import { readFileSync } from 'node:fs'
import { readItemKinds, readItemNames, readRecipes } from '@minstrel/game-formats'
import { readGpc } from '@minstrel/l5-gpc'
import { decompressIfNeeded } from '@minstrel/nitro-comp'
import { readNitroFs, walkFiles } from '@minstrel/nitrofs'
import { describe, expect, it } from 'vitest'

/**
 * The alchemy recipes, on a real cartridge.
 *
 * `/data/bin/recipe.gp2` was found on 24 September 2026 by reading overlay 6 —
 * the Krak Pot — which carries the path beside `renkin` and the pot's own art.
 *
 * **The game's own reader was not found for this file**, unlike the skill
 * panels: no per-tag handler table in the ARM9 or any of the 35 overlays
 * belongs to it. So the reading rests on the data and on two outside
 * witnesses, and this is where both are held to the cartridge.
 *
 * Local-only: skipped without a dump, and nothing it reads is committed.
 */
const romPath = process.env.MINSTREL_TEST_ROM
const RECIPES = '/data/bin/recipe.gp2'

function member(rom: Uint8Array, path: string, want: RegExp): Uint8Array | undefined {
  const fs = readNitroFs(rom)
  for (const file of walkFiles(fs.root)) {
    if (file.path !== path) continue
    const archive = readGpc(fs.read(file))
    for (const one of archive.members) {
      if (want.test(one.name)) return decompressIfNeeded(archive.read(one))
    }
  }
  return undefined
}

describe.skipIf(!romPath)('the alchemy recipes on a real cartridge', { timeout: 60_000 }, () => {
  const rom = () => new Uint8Array(readFileSync(romPath as string))

  it('is 470 recipes of twenty values, numbered 1 to 471 with one gone', () => {
    const file = member(rom(), RECIPES, /recipe_en\.bin/i)
    if (!file) throw new Error(`${RECIPES} is not on this cartridge`)
    const recipes = readRecipes(file)
    expect(recipes).toHaveLength(470)

    // Numbered 1 to 471 with none twice — and **359 is missing**, which is
    // why there are 470 records for 471 numbers. Nothing here fills the gap.
    const ids = new Set(recipes.map((one) => one.id))
    expect(ids.size).toBe(recipes.length)
    expect(Math.min(...ids)).toBe(1)
    expect(Math.max(...ids)).toBe(471)
    expect(ids.has(359)).toBe(false)

    // Every result is a distinct item; no recipe makes what another makes.
    expect(new Set(recipes.map((one) => one.makes)).size).toBe(recipes.length)

    // At most three ingredients, at least one, and the empty slots are always
    // a suffix — which `readRecipes` enforces, so reaching here proves it.
    for (const one of recipes) {
      expect(one.ingredients.length).toBeGreaterThan(0)
      expect(one.ingredients.length).toBeLessThanOrEqual(3)
      for (const { count } of one.ingredients) expect(count).toBeGreaterThan(0)
    }
  })

  /**
   * **The check that makes the reading trustworthy.** `/data/prm/itemsort.gp2`
   * gives every item a category and a subtype, and the recipe file does not
   * point at it. If value 1 were not the result, these would not line up.
   */
  it('agrees with itemsort about what each recipe makes', () => {
    const cartridge = rom()
    const file = member(cartridge, RECIPES, /recipe_en\.bin/i)
    const sorted = member(cartridge, '/data/prm/itemsort.gp2', /itemsort_en\.bin/i)
    if (!file || !sorted) throw new Error('the cartridge is missing a file this needs')
    const recipes = readRecipes(file)
    const kinds = readItemKinds(sorted)

    let category = 0
    let subtype = 0
    for (const one of recipes) {
      const kind = kinds.get(one.makes)
      expect(kind, `recipe ${one.id} makes ${one.makes}`).toBeDefined()
      if (kind?.category === one.category) category++
      if (kind?.subtype === one.subtype) subtype++
    }
    // 470 of 470 on the category, and 469 on the subtype — the one miss is
    // the leather kilt, a skirt filed under trousers, which is the file's
    // own disagreement and not this reading's.
    expect(category).toBe(470)
    expect(subtype).toBe(469)
  })

  it('names its ingredients in the item tables', () => {
    const cartridge = rom()
    const file = member(cartridge, RECIPES, /recipe_en\.bin/i)
    const named = member(cartridge, '/data/prm/itemname.gp2', /itemname_en\.nat/i)
    if (!file || !named) throw new Error('the cartridge is missing a file this needs')
    const recipes = readRecipes(file)
    const names = new Map(readItemNames(named).map((one) => [one.id, one.singular]))

    // Every result and every ingredient is an item with a name.
    for (const one of recipes) {
      expect(names.has(one.makes), `recipe ${one.id} makes ${one.makes}`).toBe(true)
      for (const { item } of one.ingredients) {
        expect(names.has(item), `recipe ${one.id} wants ${item}`).toBe(true)
      }
    }

    // And one read out in full, because a recipe that reads right reads
    // *obviously* right, which no count of valid ids can show.
    const first = recipes.find((one) => one.id === 1)
    expect(first?.ingredients.map(({ item, count }) => `${count}x ${names.get(item)}`)).toEqual([
      '1x soldier<1>s sword',
      '1x raging ruby',
      '1x warrior<1>s helm',
    ])
    expect(names.get(first?.makes as number)).toBe('warrior<1>s sword')
  })

  it('pairs the alchemiracles, which is what the two cross-references are', () => {
    const file = member(rom(), RECIPES, /recipe_en\.bin/i)
    if (!file) throw new Error(`${RECIPES} is not on this cartridge`)
    const recipes = readRecipes(file)
    const byId = new Map(recipes.map((one) => [one.id, one]))

    // 448 are certain; 22 are not, and those 22 are exactly the ones naming a
    // better recipe to reach instead.
    expect(recipes.filter((one) => one.chance === 100)).toHaveLength(448)
    expect(new Set(recipes.map((one) => one.chance))).toEqual(new Set([100, 10, 20]))

    const up = recipes.filter((one) => one.instead !== undefined)
    const down = recipes.filter((one) => one.fallback !== undefined)
    expect(up).toHaveLength(22)
    expect(down).toHaveLength(22)

    // Each pairs with the other, both ways, and **takes the same ingredients**
    // — which is what makes "the same attempt at two grades" the reading
    // rather than two unrelated recipes.
    for (const one of up) {
      const better = byId.get(one.instead as number)
      expect(better, `recipe ${one.id} points at ${one.instead}`).toBeDefined()
      expect(better?.fallback).toBe(one.id)
      expect(better?.ingredients).toEqual(one.ingredients)
      expect(better?.chance).toBeLessThan(100)
    }
  })

  it('orders its second rank alphabetically by what it makes', () => {
    const cartridge = rom()
    const file = member(cartridge, RECIPES, /recipe_en\.bin/i)
    const sorted = member(cartridge, '/data/prm/itemsort.gp2', /itemsort_en\.bin/i)
    if (!file || !sorted) throw new Error('the cartridge is missing a file this needs')
    const recipes = readRecipes(file)
    const kinds = readItemKinds(sorted)

    // `itemsort`'s own second value is alphabetical by English name — see
    // FORMAT.md. Ordering the recipes by their `alphabetical` rank should
    // therefore order their results by that too, and it does at every step.
    const byRank = [...recipes].sort((a, b) => a.alphabetical - b.alphabetical)
    let rising = 0
    for (let i = 1; i < byRank.length; i++) {
      const before = kinds.get(byRank[i - 1]?.makes as number)?.unknown_2
      const after = kinds.get(byRank[i]?.makes as number)?.unknown_2
      if (before !== undefined && after !== undefined && after > before) rising++
    }
    expect(rising).toBe(byRank.length - 1)
  })
})
