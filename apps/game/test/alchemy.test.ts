import type { Recipe } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { cook, heldIn, potList } from '../src/alchemy.ts'
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
  ingredients: [
    { item: 22010, count: 1 },
    { item: 22011, count: 2 },
  ],
})
/** A shield from something the bag will not have. */
const SHIELD = recipe({ id: 2, makes: 21000, order: 1, ingredients: [{ item: 22099, count: 1 }] })
/** The ordinary grade, which points at a better one. */
const NEBULA = recipe({ id: 17, makes: 20500, order: 3, instead: 18 })
/** The better grade, reached only by an alchemiracle: a one-in-ten chance of its own. */
const HYPER = recipe({ id: 18, makes: 20501, order: 4, chance: 10, fallback: 17 })

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
