import { GameFormatError } from './errors.ts'
import { readDataTable } from './table.ts'

/**
 * **What is on the bookshelves** — `/data/scenario/htana<L>.gp2` ›
 * `htana<L>_<lang>.bin`, one file for each first letter of a map's code (C,
 * D, H, M, R, S, X): "hon-dana", a bookshelf. Read 4 October 2026 from the
 * bookcase service (`func_ov017_021ac3b0`, overlay 17), which runs the file
 * as a script (`func_ov017_021acc8c`) whose tag-`0x66` records each name one
 * shelf (`func_ov017_021aca2c`); the last that matches wins.
 *
 * | value | what |
 * |---|---|
 * | 0 | the map, by its `maplist9` id |
 * | 1 | the bookcase's index — the `0x74` number of a type-8 region, see `mapBookcases` |
 * | 2 | 1 a recipe book, 0 a book to read |
 * | 3 | the recipe book's number: its flag is `0x114C` + it |
 * | 4 | text 0: a plain book's text; on a recipe book, "nothing of interest" |
 * | 5 | text 1, a string or none: the recipe book read for the first time |
 * | 6 | text 2, a string or none: read again |
 * | 7 on | the recipes it teaches, by `recipe.gp2` number |
 *
 * See FORMAT.md, "Bookshelves".
 */

/** One shelf's book. */
export interface Bookshelf {
  readonly map: number
  readonly index: number
  readonly recipeBook: boolean
  /** The recipe book's number, 0 on a plain book; its flag is {@link BOOK_FLAG} + it. */
  readonly book: number
  readonly text0: string | undefined
  readonly text1: string | undefined
  readonly text2: string | undefined
  readonly recipes: readonly number[]
}

/** The tag of a shelf's record. */
const TAG_SHELF = 0x66
/** A string value's kind, and "none" in a string's place. */
const KIND_STRING = 0
const NONE = 0xffffffff

/** The game-wide flag a recipe book sets once read: this plus its number (`0x021ac918`). */
export const BOOK_FLAG = 0x114c

/** Every shelf a bookshelf file names. */
export function readBookshelves(bytes: Uint8Array): Bookshelf[] {
  const table = readDataTable(bytes)
  const out: Bookshelf[] = []
  for (const record of table.withTag(TAG_SHELF)) {
    const v = record.values
    if (v.length < 7) {
      if (v.length >= 2) continue
      throw new GameFormatError(`a bookshelf record of ${v.length} values is too short to read`)
    }
    const text = (slot: number): string | undefined => {
      const value = v[slot] as number
      if (value === NONE || record.kinds[slot] !== KIND_STRING) return undefined
      return table.stringAt(value)
    }
    out.push({
      map: v[0] as number,
      index: (v[1] as number) | 0,
      recipeBook: v[2] === 1,
      book: v[3] as number,
      text0: text(4),
      text1: text(5),
      text2: text(6),
      recipes: [...v.slice(7)],
    })
  }
  return out
}

/** The shelf a map's bookcase holds — the last record naming both, as the script leaves it. */
export function shelfAt(
  shelves: readonly Bookshelf[],
  map: number,
  index: number,
): Bookshelf | undefined {
  let found: Bookshelf | undefined
  for (const shelf of shelves) if (shelf.map === map && shelf.index === index) found = shelf
  return found
}
