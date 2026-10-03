import { describe, expect, it } from 'vitest'
import { BOOK_FLAG, readBookshelves, shelfAt } from '../src/bookshelves.ts'
import { buildTable } from './fixture.ts'

const NONE = 0xffffffff

describe('the bookshelves', () => {
  // Strings, and their offsets in the table: each ends at a NUL.
  const strings = [
    'Nothing of interest.',
    'A book of moths. Finds recipes.',
    'Already knows them.',
    'A lore book.',
  ]
  const at = (i: number) => strings.slice(0, i).reduce((o, s) => o + s.length + 1, 0)
  const bytes = buildTable(
    [
      { tag: 0x64, values: [0] },
      // A recipe book, number 2, teaching three recipes, on shelf 0 of map 50306.
      { tag: 0x66, values: [50306, 0, 1, 2, at(0), at(1), at(2), 39, 348, 354] },
      // A plain book on shelf 0 of map 50101: one text, no others.
      { tag: 0x66, values: [50101, 0, 0, 0, at(3), NONE, NONE] },
    ],
    strings,
  )

  it('reads each shelf: its map and index, its book, its three texts and its recipes', () => {
    const shelves = readBookshelves(bytes)
    expect(shelves).toHaveLength(2)
    const [moths, lore] = shelves
    expect(moths).toMatchObject({ map: 50306, index: 0, recipeBook: true, book: 2 })
    expect(moths?.recipes).toEqual([39, 348, 354])
    expect(moths?.text1).toBe('A book of moths. Finds recipes.')
    expect(moths?.text2).toBe('Already knows them.')
    expect(lore).toMatchObject({ recipeBook: false, book: 0, text0: 'A lore book.' })
    expect(lore?.text1).toBeUndefined()
    expect(lore?.recipes).toEqual([])
  })

  it('finds a map’s shelf by its index, and a recipe book’s flag', () => {
    const shelves = readBookshelves(bytes)
    expect(shelfAt(shelves, 50101, 0)?.text0).toBe('A lore book.')
    expect(shelfAt(shelves, 50101, 1)).toBeUndefined()
    expect(BOOK_FLAG + 2).toBe(0x114e)
  })
})
