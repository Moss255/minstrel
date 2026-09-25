import { type Recipe, shortFor } from '@minstrel/game-formats'
import { type Bag, drop, take } from './bag.ts'

/**
 * The Krak Pot — what the bag can be cooked into.
 *
 * The recipes are read (`readRecipes`, and the cartridge tests beside it);
 * what is here is the *using* of them, which the game's own code was not found
 * for. Each piece below says which it is.
 *
 * **The pot's own words are on the cartridge** — `str_ren`, `Loaded.potWords`
 * — and three of them are why the recipe fields are read as they are: 18 names
 * the per-cent chance, 19 says an alchemiracle gives something better than the
 * recipe shows, and 20 that a failed one still hands something over.
 */

/** What the Krak Pot says, by its number in `str_ren`. */
export const POT_SAYS = {
  /** "So, how will you be conducting your alchemy, hm?" */
  greeting: 0,
  /** "Choose the recipe for the item you're hoping to cook up." */
  chooseRecipe: 1,
  /** "…you're lacking the necessary ingredients for that…" */
  lacking: 2,
  /** "I'll toil and trouble myself to make …, then!" */
  willMake: 8,
  /** "…I don't seem to be able to make anything with that particular combination." */
  cannot: 11,
  /** "Wow! …!" — what came out. */
  behold: 12,
  /** "…there's a `<val_2>` per cent chance of success in this case…" */
  chanceIs: 18,
  /** "A successful alchemiracle results in an item superior to the one indicated…" */
  aboutMiracles: 19,
  /** "…even if you fail to work an alchemiracle, you shan't go away empty-handed." */
  notEmptyHanded: 20,
  /** "Qu-Quite remarkable! An alchemiracle!" */
  miracle: 27,
  /** "Oh, humbug! No, it seems an alchemiracle wasn't to be." */
  noMiracle: 31,
} as const

/**
 * The pot's own labels, by their number in `bm_rrb` — a `0x67` table of 48,
 * read like `sta_skl`. **Not copied here**: `Loaded.potLabels` holds the
 * text, and these are only the numbers to look it up by.
 */
export const POT_LABELS = {
  title: 0,
  useRecipe: 1,
  tryLuck: 2,
  cancel: 3,
  yes: 14,
  no: 15,
  howMany: 16,
  byType: 41,
  byName: 42,
  alchenomicon: 43,
} as const

/**
 * The Alchenomicon's own categories, in its order, each with the `itemsort`
 * categories it covers.
 *
 * **Read off the cartridge, 25 September 2026.** `bm_rrb` names six — All
 * Recipes, Weapons, Armour, Accessories, Items, ??? — and the 470 recipes
 * partition across `itemsort`'s nine categories exactly: 185 weapons, 30
 * shields, 70 armour, 23 legwear, 51 headgear, 25 gloves, 25 footwear, 30
 * accessories, 31 tools. Grouping them the way the labels do accounts for
 * every one, with **none left over** — which is what makes this the book's
 * grouping and not a guess.
 *
 * **`???` gets nothing here**, and what it is for is **not established**.
 * Every recipe on the cartridge falls in one of the other five.
 */
export const POT_CATEGORIES: readonly {
  /** Its label's number in `bm_rrb`. */
  readonly label: number
  /** The `itemsort` categories it covers; empty means all of them. */
  readonly categories: readonly number[]
}[] = [
  { label: 17, categories: [] },
  { label: 18, categories: [0] },
  { label: 19, categories: [1, 2, 3, 4, 5, 6] },
  { label: 20, categories: [7] },
  { label: 21, categories: [8, 9] },
  { label: 22, categories: [-1] },
]

/**
 * The **By Type** headings, each with the `itemsort` subtypes it covers.
 *
 * The twelve weapon types then the six places armour goes, which is the order
 * `bm_rrb` lists them in. The subtype numbers are FORMAT.md's, "Item kinds",
 * and each heading's recipes add up to its category's count exactly — Torso's
 * 13, 14 and 15 make the 70 of `itemsort` category 2, Legs's 16 and 17 the 23
 * of category 3, and so on for all six.
 */
export const POT_TYPES: readonly {
  readonly label: number
  readonly subtypes: readonly number[]
}[] = [
  { label: 29, subtypes: [0] },
  { label: 30, subtypes: [1] },
  { label: 31, subtypes: [2] },
  { label: 32, subtypes: [3] },
  { label: 33, subtypes: [4] },
  { label: 34, subtypes: [5] },
  { label: 35, subtypes: [6] },
  { label: 36, subtypes: [7] },
  { label: 37, subtypes: [8] },
  { label: 38, subtypes: [9] },
  { label: 39, subtypes: [10] },
  { label: 40, subtypes: [11] },
  { label: 23, subtypes: [12] },
  { label: 24, subtypes: [18, 19] },
  { label: 25, subtypes: [13, 14, 15] },
  { label: 26, subtypes: [20, 21] },
  { label: 27, subtypes: [16, 17] },
  { label: 28, subtypes: [22, 23] },
]

/**
 * How the Alchenomicon is ordered — its own two buttons.
 *
 * **This is what the recipe record's two ranks are for**, which is worth
 * saying because this repository called them "two display ranks" and left it
 * there: value 18 is **By Type**, the book's order by equipment slot, and
 * value 19 is **By Name**, alphabetical by what the recipe makes.
 */
export type PotSort = 'type' | 'name'

/** A recipe as the pot's list shows it. */
export interface PotEntry {
  readonly recipe: Recipe
  /** What it makes, named; its id where nothing names it. */
  readonly name: string
  /** What the bag is short of, and by how many — empty when it can be cooked. */
  readonly short: readonly { readonly item: number; readonly short: number }[]
  /** Whether the bag holds everything it wants. */
  readonly ready: boolean
}

/** How many of an item a bag holds. */
export const heldIn = (bag: Bag, item: number): number => bag.items.get(item) ?? 0

/**
 * The recipes, as the pot's list shows them: **what can be cooked first**, and
 * then the rest, each in the Alchenomicon's own order.
 *
 * The ordering within each half is `Recipe.order`, which is the book's; that
 * the ready ones come first is **ours**, and is what makes a list of 470
 * usable at all before the recipe-book system exists. The game shows only the
 * recipes whose book you have found, and **where a book is found is not read**
 * — a published guide says bookcases, rooms and quest rewards, which are
 * event-script work. See `docs/party-and-vocations.md`.
 */
export function potList(
  recipes: readonly Recipe[],
  bag: Bag,
  nameOf: (item: number) => string,
  within: {
    /** Which of {@link POT_CATEGORIES}, by its place; undefined is all of them. */
    readonly category?: number | undefined
    /** Which of {@link POT_TYPES} within it, by its place; undefined is all. */
    readonly type?: number | undefined
    /** The book's own two orders — see {@link PotSort}. */
    readonly sort?: PotSort | undefined
    /** An item's `itemsort` category and subtype; without it nothing is filtered. */
    readonly kindOf?:
      | ((item: number) => { category: number; subtype: number } | undefined)
      | undefined
  } = {},
): PotEntry[] {
  const wanted = within.category === undefined ? undefined : POT_CATEGORIES[within.category]
  const subtypes = within.type === undefined ? undefined : POT_TYPES[within.type]?.subtypes
  const entries = recipes.flatMap((recipe) => {
    if (wanted && within.kindOf) {
      const kind = within.kindOf(recipe.makes)
      // An empty category list is "All Recipes"; anything else must match.
      if (wanted.categories.length > 0 && !wanted.categories.includes(kind?.category ?? -1))
        return []
      if (subtypes && !subtypes.includes(kind?.subtype ?? -1)) return []
    }
    const short = shortFor(recipe, (item) => heldIn(bag, item))
    return [{ recipe, name: nameOf(recipe.makes), short, ready: short.length === 0 }]
  })
  const rank = (entry: PotEntry) =>
    within.sort === 'name' ? entry.recipe.alphabetical : entry.recipe.order
  return entries.sort((a, b) => {
    if (a.ready !== b.ready) return a.ready ? -1 : 1
    return rank(a) - rank(b)
  })
}

/**
 * **Try Your Luck** — what comes out of a handful of ingredients, or nothing.
 *
 * The pot's other mode: rather than picking a recipe, you put things in and
 * see. A recipe matches when **its ingredients are exactly what was put in**,
 * counts and all — an extra ingredient is a different attempt, not a near
 * miss, which is what `str_ren` 11 says when nothing matches: "I don't seem
 * to be able to make anything with that particular combination of
 * ingredients."
 *
 * `picked` is item ids, repeated for a count — three agates is the id three
 * times, which is how a picker hands them over.
 *
 * **Ours**: the game's own matching was not found, and this is the reading
 * that its refusal message implies. Whether the game allows a superset is not
 * established.
 */
export function tryYourLuck(
  recipes: readonly Recipe[],
  picked: readonly number[],
): Recipe | undefined {
  if (picked.length === 0) return undefined
  const counted = new Map<number, number>()
  for (const item of picked) counted.set(item, (counted.get(item) ?? 0) + 1)
  return recipes.find((recipe) => {
    if (recipe.ingredients.length !== counted.size) return false
    return recipe.ingredients.every(({ item, count }) => counted.get(item) === count)
  })
}

/** What came out of the pot. */
export interface Cooked {
  readonly bag: Bag
  /** The item made. */
  readonly item: number
  /** Whether an alchemiracle worked — only ever true on a recipe that has one. */
  readonly miracle: boolean
  /** The recipe actually made, which is not the one asked for when a miracle works. */
  readonly made: Recipe
}

/**
 * Cook a recipe: take the ingredients out of the bag and put the result in.
 *
 * **The alchemiracle is rolled here**, and this is the one piece of the pot
 * that is ours rather than read. `Recipe.instead` names the better recipe, and
 * **that recipe's own `chance`** is the odds — a roll under it makes the
 * better one, anything else makes the one asked for, which is what
 * `str_ren` 20's "you shan't go away empty-handed" describes. **How the game draws that roll is not read**: it
 * does not go through the battle RNG this repository has, so `roll` is handed
 * in and the caller decides.
 *
 * Undefined when the bag will not cover it, which `potList` has already said.
 */
export function cook(
  recipe: Recipe,
  bag: Bag,
  recipes: readonly Recipe[],
  roll: () => number = Math.random,
): Cooked | undefined {
  if (shortFor(recipe, (item) => heldIn(bag, item)).length > 0) return undefined
  let after = bag
  for (const { item, count } of recipe.ingredients) {
    for (let n = 0; n < count; n++) {
      const taken = drop(after, item)
      // `shortFor` said the bag covers it, so this cannot fail — but a bag
      // that disagrees is a bug worth refusing rather than half-cooking.
      if (!taken) return undefined
      after = taken
    }
  }
  const better =
    recipe.instead === undefined ? undefined : recipes.find((one) => one.id === recipe.instead)
  // **The chance is the better recipe's, not this one's.** On the cartridge
  // the pair reads: 17 makes the supernova sword at 100 and points at 18; 18
  // makes the hypernova sword at 10 and points back at 17. So what is in
  // doubt is the better outcome, and its own record carries the odds — which
  // is also what `str_ren` 18 quotes when you pick the ordinary one.
  const miracle = better !== undefined && roll() * 100 < better.chance
  const made = miracle ? (better as Recipe) : recipe
  return { bag: take(after, { item: made.makes }), item: made.makes, miracle, made }
}

/**
 * How many of a recipe the bag could make at once — the pot's "How many?".
 *
 * The smallest number of times every ingredient goes round. Zero when the bag
 * is short of any of them.
 */
export function couldMake(recipe: Recipe, bag: Bag): number {
  return recipe.ingredients.reduce(
    (most, { item, count }) => Math.min(most, Math.floor(heldIn(bag, item) / count)),
    Number.POSITIVE_INFINITY,
  )
}

/**
 * Cook a recipe several times over — what "How many?" asks for.
 *
 * Each goes through {@link cook}, so each rolls its own alchemiracle: a batch
 * of ten can come out as some of each, which is what rolling per attempt
 * means. Stops early if the bag runs out, and says how many were made.
 */
export function cookMany(
  recipe: Recipe,
  bag: Bag,
  recipes: readonly Recipe[],
  times: number,
  roll: () => number = Math.random,
): { bag: Bag; made: Cooked[] } {
  let after = bag
  const made: Cooked[] = []
  for (let n = 0; n < times; n++) {
    const one = cook(recipe, after, recipes, roll)
    if (!one) break
    after = one.bag
    made.push(one)
  }
  return { bag: after, made }
}
