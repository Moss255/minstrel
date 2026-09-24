import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { INGREDIENTS_MOST, RECIPE_TAG, readRecipes, shortFor } from '../src/recipes.ts'

/**
 * A synthetic `recipe.bin`. Fixtures may hold no cartridge bytes, so the
 * layout is built here from `FORMAT.md`, "The tagged data table".
 */
const KIND_NUMBER = 1
const NONE = 0xffffffff

function build(records: { tag: number; values: number[]; kinds?: number[] }[]): Uint8Array {
  const body: number[] = []
  const push32 = (v: number) =>
    body.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  for (const record of records) {
    const count = record.values.length
    const kindBytes = Math.max(1, Math.ceil(count / 4))
    const header = Math.ceil((3 + kindBytes) / 4) * 4
    const kinds = new Uint8Array(header - 3)
    for (let i = 0; i < count; i++) {
      const kind = record.kinds?.[i] ?? KIND_NUMBER
      kinds[i >> 2] = (kinds[i >> 2] as number) | ((kind & 3) << ((i & 3) * 2))
    }
    body.push(record.tag & 0xff, (record.tag >>> 8) & 0xff, count)
    for (const byte of kinds) body.push(byte)
    for (const v of record.values) push32(v)
  }
  const out = new Uint8Array(16 + body.length)
  new DataView(out.buffer).setUint32(4, 16 + body.length, true)
  out.set(Uint8Array.from(body), 16)
  return out
}

/** One recipe, in the file's twenty values. */
const recipe = (over: Partial<Record<number, number>> = {}) => {
  //        id makes i1  n1 i2 n2 i3 n3  8 chance 10 11 12 13 cat sub instead  fall  ord alpha
  const v = [1, 20004, 20001, 1, 22010, 2, 0, 0, 0, 100, 100, 0, 0, 1, 0, 0, NONE, NONE, 1, 7]
  for (const [at, value] of Object.entries(over)) v[Number(at)] = value as number
  return { tag: RECIPE_TAG, values: v }
}

describe('readRecipes', () => {
  it('reads what a recipe makes and what it takes', () => {
    const [one] = readRecipes(build([recipe()]))
    expect(one?.id).toBe(1)
    expect(one?.makes).toBe(20004)
    expect(one?.ingredients).toEqual([
      { item: 20001, count: 1 },
      { item: 22010, count: 2 },
    ])
    expect(one?.chance).toBe(100)
    // The empty third slot is dropped rather than carried as item 0.
    expect(one?.ingredients.length).toBeLessThanOrEqual(INGREDIENTS_MOST)
  })

  it('reads all three slots, and drops only the empty ones', () => {
    const [full] = readRecipes(build([recipe({ 6: 22011, 7: 3 })]))
    expect(full?.ingredients).toHaveLength(3)
    const [one] = readRecipes(build([recipe({ 4: 0, 5: 0 })]))
    expect(one?.ingredients).toEqual([{ item: 20001, count: 1 }])
  })

  it('reads the alchemiracle’s two ways, and nothing where there are none', () => {
    const [plain] = readRecipes(build([recipe()]))
    expect(plain?.instead).toBeUndefined()
    expect(plain?.fallback).toBeUndefined()
    const [miracle] = readRecipes(build([recipe({ 9: 10, 16: 18 })]))
    expect(miracle?.chance).toBe(10)
    expect(miracle?.instead).toBe(18)
    const [down] = readRecipes(build([recipe({ 17: 17 })]))
    expect(down?.fallback).toBe(17)
  })

  it('carries what is not established rather than dropping it', () => {
    const [one] = readRecipes(build([recipe({ 8: 5, 10: 40, 11: 300, 12: 999, 13: 0 })]))
    expect(one?.unknown_8).toBe(5)
    expect(one?.unknown_10).toBe(40)
    expect(one?.unknown_11).toBe(300)
    expect(one?.unknown_12).toBe(999)
    expect(one?.unknown_13).toBe(0)
  })

  it('refuses a table with no recipes, a short record, or a half-empty slot', () => {
    expect(() => readRecipes(build([{ tag: 0x66, values: [470] }]))).toThrow(/no recipes/)
    expect(() => readRecipes(build([{ tag: RECIPE_TAG, values: [1, 2, 3] }]))).toThrow(
      /has 3 values, not 20/,
    )
    // An item with no count, or a count with no item, is a reading that does
    // not fit — the cartridge has neither on any of its 470.
    expect(() => readRecipes(build([recipe({ 5: 0 })]))).toThrow(/ingredient 2 as item 22010 × 0/)
    expect(() => readRecipes(build([recipe({ 2: 0, 3: 0, 4: 0, 5: 0 })]))).toThrow(/takes nothing/)
    // And a value of the wrong kind: a string offset where a number belongs.
    const wrong = build([{ ...recipe(), kinds: [1, 0, ...Array(18).fill(1)] }])
    expect(() => readRecipes(wrong)).toThrow(GameFormatError)
    expect(() => readRecipes(wrong)).toThrow(/what it makes of kind 0/)
  })
})

describe('what a recipe is short of', () => {
  const [one] = readRecipes(build([recipe({ 6: 22011, 7: 3 })]))

  it('is nothing when the bag holds enough', () => {
    expect(shortFor(one as NonNullable<typeof one>, () => 9)).toEqual([])
  })

  it('names each ingredient and how many more it wants', () => {
    const held = (item: number) => (item === 22010 ? 1 : item === 22011 ? 0 : 5)
    expect(shortFor(one as NonNullable<typeof one>, held)).toEqual([
      { item: 22010, short: 1 },
      { item: 22011, short: 3 },
    ])
  })
})
