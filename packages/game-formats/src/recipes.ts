import { GameFormatError } from './errors.ts'
import { readDataTable, type TableRecord } from './table.ts'

/**
 * `/data/bin/recipe.gp2` — the alchemy recipes, what the Krak Pot makes.
 *
 * A [tagged data table](FORMAT.md, "The tagged data table") of one `0x66`
 * record holding the count and **470 `0x67` records of twenty integers**.
 * There is no string table: a recipe has no name of its own and is shown by
 * the name of the item it makes.
 *
 * **Where it was:** overlay 6 is the Krak Pot, and carries the strings
 * `renkin`, `data/bin/recipe.gp2`, `recipe_<LG>.bin` and the pot's own art
 * beside them. The five language members are the same length and give the
 * same records — the file holds no text, so `_<LG>` is convention only.
 *
 * **The reading is confirmed against a file this one does not point at.**
 * `/data/prm/itemsort.gp2` gives every item a category and a subtype, and
 * {@link Recipe.category} matches the result's on **470 of 470** and
 * {@link Recipe.subtype} on **469** — the miss is the leather kilt, a skirt
 * filed under trousers. That only holds if value 1 really is what the recipe
 * makes. A published strategy guide agrees on the eight recipes sampled from
 * it, counts included.
 *
 * **Unlike the skill panels, the game's own reader was not found**: no per-tag
 * handler table in the ARM9 or any of the 35 overlays belongs to this file, so
 * the field meanings below are read from the data and from those two outside
 * witnesses rather than from an instruction. The fields that could not be
 * pinned that way are named `unknown_*` and carried.
 */

export const RECIPE_COUNT_TAG = 0x66
export const RECIPE_TAG = 0x67
const RECIPE_VALUES = 20
/** A value's kind when it is an integer — see `TableRecord.kinds`. */
const KIND_NUMBER = 1

/** The most ingredients a recipe takes. The empty slots are always a suffix. */
export const INGREDIENTS_MOST = 3

/** One thing a recipe wants, and how many of it. */
export interface Ingredient {
  readonly item: number
  readonly count: number
}

export interface Recipe {
  /**
   * Its number, 1 to 471. **470 records for 471 numbers** — 359 is absent
   * from the cartridge, and nothing here fills the gap.
   */
  readonly id: number
  /** The item it makes. Every one of the 470 is a distinct, valid item id. */
  readonly makes: number
  /** What it takes, in the file's order, the empty slots dropped. */
  readonly ingredients: readonly Ingredient[]
  /**
   * The chance **this** recipe is what comes out, in per cent: 100 on 448,
   * and 10 or 20 on the 22 that are only ever reached by an alchemiracle.
   * `str_ren` 18 — "there's a `<val_2>` per cent chance of success" — is what
   * this is read as. INFERRED.
   *
   * So the odds a caller wants are **the better recipe's**, not the one being
   * attempted: 17 makes the supernova sword at 100 and points at 18, which
   * makes the hypernova sword at 10 and points back at 17.
   */
  readonly chance: number
  /**
   * The recipe you get **instead** when an alchemiracle works, by its
   * {@link id}; undefined where there is none. 22 recipes carry one.
   *
   * INFERRED, from `str_ren` 19 — "A successful alchemiracle results in an
   * item superior to the one indicated in the recipe" — and from the pairing:
   * each of the 22 has a twin taking the same ingredients and making a better
   * grade of the same thing, supernova sword to hypernova sword.
   */
  readonly instead: number | undefined
  /**
   * The recipe you fall back to when one fails, by its {@link id}; undefined
   * where there is none. The other 22 of the pairing above, and INFERRED the
   * same way — `str_ren` 20, "Even if you fail … you shan't go away
   * empty-handed".
   */
  readonly fallback: number | undefined
  /** The result's own item category, which `itemsort` gives it: 470 of 470. */
  readonly category: number
  /** The result's own subtype: 469 of 470, the leather kilt excepted. */
  readonly subtype: number
  /** A rank 1 to 471 in the Alchenomicon's own order, by equipment slot. */
  readonly order: number
  /** A rank 1 to 471, **alphabetical by the result's name** — it rises with `itemsort`'s own order on all 469 steps. */
  readonly alphabetical: number
  /** 0 on 448 and 1 to 7 on the 22 alchemiracles. Not established. */
  readonly unknown_8: number
  /** 100 on 448, 40 on 12, 50 on 10 — a second chance of some kind. Not established. */
  readonly unknown_10: number
  /** 0, or 300 on the 22. Not established. */
  readonly unknown_11: number
  /** 0, or 999 on the ten-per-cent ones and 700 on the twenty. Not established. */
  readonly unknown_12: number
  /** 0 on 131 and 1 on 339. Not established — shop stock, being an ingredient elsewhere and having a price were all tested and none fits. */
  readonly unknown_13: number
}

function integer(record: TableRecord, at: number, what: string): number {
  if (record.kinds[at] !== KIND_NUMBER) {
    throw new GameFormatError(
      `recipe at 0x${record.offset.toString(16)} has ${what} of kind ${String(record.kinds[at])}, not an integer`,
      record.offset,
    )
  }
  return record.values[at] as number
}

/** `0xFFFFFFFF` is "no recipe" in the two cross-references. */
const NONE = 0xffffffff
const linked = (value: number) => (value === NONE ? undefined : value)

/** Read the alchemy recipes, in the file's own order. */
export function readRecipes(data: Uint8Array): Recipe[] {
  const table = readDataTable(data)
  const rows = table.withTag(RECIPE_TAG)
  if (rows.length === 0) throw new GameFormatError('no recipes in this table')
  return rows.map((record) => {
    if (record.values.length !== RECIPE_VALUES) {
      throw new GameFormatError(
        `recipe at 0x${record.offset.toString(16)} has ${record.values.length} values, not ${RECIPE_VALUES}`,
        record.offset,
      )
    }
    const ingredients: Ingredient[] = []
    for (let slot = 0; slot < INGREDIENTS_MOST; slot++) {
      const item = integer(record, 2 + slot * 2, `ingredient ${slot + 1}`)
      const count = integer(record, 3 + slot * 2, `ingredient ${slot + 1}'s count`)
      // An empty slot is a zero item and a zero count, and the empty slots are
      // always a suffix — checked on all 470. A count without an item, or an
      // item without a count, is a file this reading does not fit.
      if (item === 0 && count === 0) continue
      if (item === 0 || count === 0) {
        throw new GameFormatError(
          `recipe at 0x${record.offset.toString(16)} has ingredient ${slot + 1} as item ${item} × ${count}`,
          record.offset,
        )
      }
      ingredients.push({ item, count })
    }
    if (ingredients.length === 0) {
      throw new GameFormatError(
        `recipe at 0x${record.offset.toString(16)} takes nothing`,
        record.offset,
      )
    }
    return {
      id: integer(record, 0, 'an id'),
      makes: integer(record, 1, 'what it makes'),
      ingredients,
      unknown_8: integer(record, 8, 'value 8'),
      chance: integer(record, 9, 'a chance'),
      unknown_10: integer(record, 10, 'value 10'),
      unknown_11: integer(record, 11, 'value 11'),
      unknown_12: integer(record, 12, 'value 12'),
      unknown_13: integer(record, 13, 'value 13'),
      category: integer(record, 14, 'a category'),
      subtype: integer(record, 15, 'a subtype'),
      instead: linked(integer(record, 16, 'an alchemiracle')),
      fallback: linked(integer(record, 17, 'a fallback')),
      order: integer(record, 18, 'an order'),
      alphabetical: integer(record, 19, 'an alphabetical order'),
    }
  })
}

/**
 * Whether a recipe can be made from what is held, and what is short.
 *
 * `held` is asked how many of an item there are. What comes back is every
 * ingredient that is short, with how many more it wants — empty when the
 * recipe can be made.
 */
export function shortFor(
  recipe: Recipe,
  held: (item: number) => number,
): { item: number; short: number }[] {
  return recipe.ingredients.flatMap(({ item, count }) => {
    const short = count - held(item)
    return short > 0 ? [{ item, short }] : []
  })
}
