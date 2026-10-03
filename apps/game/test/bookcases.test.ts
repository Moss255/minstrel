import { readFileSync } from 'node:fs'
import { BOOK_FLAG, inArea, shelfAt } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { learnRecipe, recipeKnown } from '../src/alchemy.ts'
import { load } from '../src/load.ts'

describe('the recipes known', () => {
  it('learns a recipe as known, and as made when made, never unlearning', () => {
    const known = new Map<number, number>()
    expect(recipeKnown(known, 440)).toBe(false)
    learnRecipe(known, 440)
    expect(known.get(440)).toBe(1)
    learnRecipe(known, 440, true)
    expect(known.get(440)).toBe(3)
    learnRecipe(known, 440)
    expect(known.get(440)).toBe(3)
    learnRecipe(known, 0)
    expect(known.has(0)).toBe(false)
  })
})

const romPath = process.env.MINSTREL_TEST_ROM
describe.skipIf(!romPath)('the bookcases, on the cartridge', () => {
  it('finds the inn’s lore book on its shelf, and the library’s recipe books', () => {
    const rom = new Uint8Array(readFileSync(romPath as string))
    const inn = load(rom, { map: 'R01M01' })
    expect(inn.mapId).toBe(50101)
    // The shelf on the west wall, read facing three quarters of a turn.
    const shelf0 = inn.bookcases.find((c) => c.index === 0)
    expect(shelf0?.facing).toBeCloseTo((3 * Math.PI) / 2, 3)
    expect(shelf0 && inArea(shelf0.area, -6.206, 0, 2.932)).toBe(true)
    const essentials = shelfAt(inn.bookshelves, 50101, 0)
    expect(essentials?.recipeBook).toBe(false)
    expect(essentials?.text0).toMatch(/Alchemical Essentials/)
    // The R maps' shelves hold four recipe books, all in the library: books
    // 2, 26, 39 and 54, each on a shelf of R03M06 and of R04M06.
    const books = new Set(inn.bookshelves.filter((s) => s.recipeBook).map((s) => s.book))
    expect([...books].sort((a, b) => a - b)).toEqual([2, 26, 39, 54])
    expect(BOOK_FLAG).toBe(0x114c)
    const library = load(rom, { map: 'R03M06' })
    const moths = shelfAt(library.bookshelves, library.mapId ?? -1, 0)
    expect(moths?.recipeBook).toBe(true)
    expect(moths?.recipes).toEqual([39, 348, 354])
  }, 120_000)
})
