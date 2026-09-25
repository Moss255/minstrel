import type { Recipe } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import {
  cook,
  cookMany,
  couldMake,
  heldIn,
  POT_CATEGORIES,
  POT_TYPES,
  potList,
  tryYourLuck,
} from '../src/alchemy.ts'
import { EMPTY_BAG, take } from '../src/bag.ts'

/**
 * The Krak Pot — see `apps/game/src/alchemy.ts`.
 *
 * The recipes here are made up; fixtures may hold no cartridge bytes, and what
 * this is about is the *using*, which is ours. What the cartridge's 470 really
 * say is held to it by `tools/harness/test/recipes.test.ts`.
 */

const recipe = (over: Partial<Recipe>): Recipe => ({
  id: 1,
  makes: 20004,
  ingredients: [{ item: 22010, count: 1 }],
  chance: 100,
  instead: undefined,
  fallback: undefined,
  category: 0,
  subtype: 0,
  order: 1,
  alphabetical: 1,
  unknown_8: 0,
  unknown_10: 100,
  unknown_11: 0,
  unknown_12: 0,
  unknown_13: 1,
  ...over,
})

/** A sword from an ore and two herbs. */
const SWORD = recipe({
  id: 1,
  makes: 20004,
  order: 2,
  alphabetical: 3,
  ingredients: [
    { item: 22010, count: 1 },
    { item: 22011, count: 2 },
  ],
})
/** A shield from something the bag will not have. */
const SHIELD = recipe({
  id: 2,
  makes: 21000,
  order: 1,
  alphabetical: 5,
  ingredients: [{ item: 22099, count: 1 }],
})
/** The ordinary grade, which points at a better one. */
const NEBULA = recipe({ id: 17, makes: 20500, order: 3, alphabetical: 1, instead: 18 })
/** The better grade, reached only by an alchemiracle: a one-in-ten chance of its own. */
const HYPER = recipe({ id: 18, makes: 20501, order: 4, alphabetical: 2, chance: 10, fallback: 17 })

const RECIPES = [SWORD, SHIELD, NEBULA, HYPER]
const name = (item: number) => `item ${item}`

describe('the pot’s list', () => {
  it('puts what can be cooked first, then the book’s own order', () => {
    let bag = take(take(EMPTY_BAG, { item: 22010 }), { item: 22011 })
    bag = take(bag, { item: 22011 })
    const list = potList(RECIPES, bag, name)
    // The sword and both nebula grades can be made from this bag, in the
    // book's own order — 2, 3, 4; the shield cannot, so it goes last even
    // though the book puts it first. That reordering is ours, see `potList`.
    expect(list.map((entry) => entry.recipe.id)).toEqual([1, 17, 18, 2])
    expect(list.map((entry) => entry.ready)).toEqual([true, true, true, false])
  })

  it('says what each unready recipe is short of', () => {
    const bag = take(EMPTY_BAG, { item: 22010 })
    const list = potList([SWORD], bag, name)
    expect(list[0]?.ready).toBe(false)
    expect(list[0]?.short).toEqual([{ item: 22011, short: 2 }])
  })

  it('counts what the bag holds', () => {
    const bag = take(take(EMPTY_BAG, { item: 22010 }), { item: 22010 })
    expect(heldIn(bag, 22010)).toBe(2)
    expect(heldIn(bag, 22011)).toBe(0)
  })
})

describe('cooking', () => {
  const full = () => {
    let bag = take(EMPTY_BAG, { item: 22010 })
    bag = take(bag, { item: 22011 })
    bag = take(bag, { item: 22011 })
    return take(bag, { item: 22011 })
  }

  it('takes the ingredients out and puts the result in', () => {
    const made = cook(SWORD, full(), RECIPES)
    expect(made?.item).toBe(20004)
    expect(heldIn(made?.bag as never, 22010)).toBe(0)
    // Three herbs in, two taken: the spare stays.
    expect(heldIn(made?.bag as never, 22011)).toBe(1)
    expect(heldIn(made?.bag as never, 20004)).toBe(1)
    expect(made?.miracle).toBe(false)
  })

  it('will not cook what the bag cannot cover, and takes nothing trying', () => {
    const bag = take(EMPTY_BAG, { item: 22010 })
    expect(cook(SWORD, bag, RECIPES)).toBeUndefined()
    expect(heldIn(bag, 22010)).toBe(1)
  })

  it('works the alchemiracle on the better recipe’s own odds', () => {
    const bag = take(EMPTY_BAG, { item: 22010 })
    // The better grade's chance is 10, so a roll under 0.10 makes it …
    const lucky = cook(NEBULA, bag, RECIPES, () => 0.05)
    expect(lucky?.miracle).toBe(true)
    expect(lucky?.item).toBe(20501)
    expect(lucky?.made.id).toBe(18)
    // … and anything else still hands over what was asked for, which is what
    // "you shan't go away empty-handed" means.
    const plain = cook(NEBULA, bag, RECIPES, () => 0.5)
    expect(plain?.miracle).toBe(false)
    expect(plain?.item).toBe(20500)
  })

  it('never works a miracle on a recipe that has none', () => {
    const made = cook(SWORD, full(), RECIPES, () => 0)
    expect(made?.miracle).toBe(false)
    expect(made?.item).toBe(20004)
  })
})

describe('the Alchenomicon’s own grouping', () => {
  // `itemsort` says a sword is category 0 subtype 0, a shield 1/12, a hat
  // 4/19, a medicine 8/25 — see FORMAT.md, "Item kinds".
  const kindOf = (item: number) =>
    ({
      20004: { category: 0, subtype: 0 },
      21000: { category: 1, subtype: 12 },
      20500: { category: 0, subtype: 0 },
      20501: { category: 0, subtype: 0 },
    })[item]
  const bag = take(EMPTY_BAG, { item: 22010 })

  it('narrows to a category, All Recipes being all of them', () => {
    const weapons = potList(RECIPES, bag, name, { category: 1, kindOf })
    expect(weapons.map((e) => e.recipe.id).sort((a, b) => a - b)).toEqual([1, 17, 18])
    const armour = potList(RECIPES, bag, name, { category: 2, kindOf })
    expect(armour.map((e) => e.recipe.id)).toEqual([2])
    // Place 0 is All Recipes, whose category list is empty.
    expect(POT_CATEGORIES[0]?.categories).toEqual([])
    expect(potList(RECIPES, bag, name, { category: 0, kindOf })).toHaveLength(RECIPES.length)
  })

  it('narrows again to a By Type heading', () => {
    // Place 0 of the types is Swords, subtype 0.
    expect(POT_TYPES[0]?.subtypes).toEqual([0])
    const swords = potList(RECIPES, bag, name, { category: 1, type: 0, kindOf })
    expect(swords.map((e) => e.recipe.id).sort((a, b) => a - b)).toEqual([1, 17, 18])
    // Shields are type 12 in the pot's order, subtype 12.
    expect(POT_TYPES[12]?.subtypes).toEqual([12])
    expect(potList(RECIPES, bag, name, { category: 2, type: 12, kindOf })).toHaveLength(1)
  })

  it('does not filter at all without a way to ask an item’s kind', () => {
    // Better the whole book than a book silently emptied by a missing lookup.
    expect(potList(RECIPES, bag, name, { category: 1 })).toHaveLength(RECIPES.length)
  })

  it('orders by the book’s two ranks, inside the ready-first split', () => {
    // **Ready-first is ours and wins**, so a rank rises within each half
    // rather than over the whole list — see `potList`.
    const rises = (
      list: ReturnType<typeof potList>,
      rank: (e: (typeof list)[number]) => number,
    ) => {
      for (let i = 1; i < list.length; i++) {
        const before = list[i - 1] as (typeof list)[number]
        const after = list[i] as (typeof list)[number]
        if (before.ready !== after.ready) continue
        if (rank(after) < rank(before)) return false
      }
      return true
    }
    const byType = potList(RECIPES, bag, name, { sort: 'type' })
    const byName = potList(RECIPES, bag, name, { sort: 'name' })
    expect(rises(byType, (e) => e.recipe.order)).toBe(true)
    expect(rises(byName, (e) => e.recipe.alphabetical)).toBe(true)
    // **And the two really are different orders**, which needs the fixture to
    // give them different ranks — with every `alphabetical` the same, a stable
    // sort makes this pass for no reason, and so does a bag that happens to
    // make the two agree. This bag makes 17 and 18 ready; the other two then
    // fall the opposite way round under each rank.
    expect(byType.map((e) => e.recipe.id)).toEqual([17, 18, 2, 1])
    expect(byName.map((e) => e.recipe.id)).toEqual([17, 18, 1, 2])
  })
})

describe('Try Your Luck', () => {
  it('matches a recipe whose ingredients are exactly what went in', () => {
    expect(tryYourLuck(RECIPES, [22010, 22011, 22011])?.id).toBe(1)
    expect(tryYourLuck(RECIPES, [22011, 22010, 22011])?.id).toBe(1)
  })

  it('makes nothing of a handful no recipe wants', () => {
    // One short, one over, and one of nothing at all — each a different
    // attempt rather than a near miss. `str_ren` 11 is what the pot says.
    expect(tryYourLuck(RECIPES, [22010, 22011])).toBeUndefined()
    expect(tryYourLuck(RECIPES, [22010, 22011, 22011, 22099])).toBeUndefined()
    expect(tryYourLuck(RECIPES, [])).toBeUndefined()
  })
})

describe('how many', () => {
  const stocked = () => {
    let bag = EMPTY_BAG
    for (let n = 0; n < 3; n++) bag = take(bag, { item: 22010 })
    for (let n = 0; n < 5; n++) bag = take(bag, { item: 22011 })
    return bag
  }

  it('counts how many times the bag goes round', () => {
    // Three ores and five herbs, wanting one and two: twice.
    expect(couldMake(SWORD, stocked())).toBe(2)
    expect(couldMake(SHIELD, stocked())).toBe(0)
  })

  it('cooks a batch and stops when the bag runs out', () => {
    const asked = cookMany(SWORD, stocked(), RECIPES, 5)
    expect(asked.made).toHaveLength(2)
    expect(heldIn(asked.bag, 20004)).toBe(2)
    expect(heldIn(asked.bag, 22010)).toBe(1)
    expect(heldIn(asked.bag, 22011)).toBe(1)
  })

  it('rolls each one of a batch separately', () => {
    let bag = EMPTY_BAG
    for (let n = 0; n < 4; n++) bag = take(bag, { item: 22010 })
    // Lucky, then not, then lucky, then not.
    const rolls = [0.05, 0.5, 0.05, 0.5]
    let at = 0
    const batch = cookMany(NEBULA, bag, RECIPES, 4, () => rolls[at++] as number)
    expect(batch.made.map((one) => one.miracle)).toEqual([true, false, true, false])
  })
})
