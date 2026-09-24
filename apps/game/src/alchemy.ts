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
): PotEntry[] {
  const entries = recipes.map((recipe) => {
    const short = shortFor(recipe, (item) => heldIn(bag, item))
    return { recipe, name: nameOf(recipe.makes), short, ready: short.length === 0 }
  })
  return entries.sort((a, b) => {
    if (a.ready !== b.ready) return a.ready ? -1 : 1
    return a.recipe.order - b.recipe.order
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
