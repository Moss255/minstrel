import { describe, expect, it } from 'vitest'
import { armsFor, PART_LETTERS, partName } from '../src/parts.ts'

describe('character parts', () => {
  it('names the part an item is worn as by its id, as its icon is named', () => {
    expect(partName(13007)).toBe('p_b007')
    expect(partName(20004)).toBe('p_w004')
    expect(partName(21000)).toBe('p_s000')
    expect(partName(12805)).toBe('p_m805')
    expect(partName(17120)).toBe('p_r120')
  })

  it('takes the other archive by its prefix', () => {
    expect(partName(16215, 'd')).toBe('d_p215')
  })

  it('names no part for what is not worn, or is not an id', () => {
    expect(partName(22000)).toBeUndefined() // a tool
    expect(partName(18024)).toBeUndefined() // an accessory
    expect(partName(9006)).toBeUndefined()
    expect(partName(-1)).toBeUndefined()
    expect(partName(13007.5)).toBeUndefined()
  })

  it('has one letter to a category, none shared', () => {
    const letters = Object.values(PART_LETTERS)
    expect(new Set(letters).size).toBe(letters.length)
  })

  it('pairs a piece of armour with the arms of its number, and nothing else', () => {
    expect(armsFor(13007)).toBe(14007)
    expect(armsFor(13622)).toBe(14622)
    expect(armsFor(16215)).toBeUndefined()
    expect(armsFor(13007.5)).toBeUndefined()
  })
})
