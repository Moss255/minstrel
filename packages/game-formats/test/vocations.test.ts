import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { readVocationTrees, vocationsWielding } from '../src/vocations.ts'

/** A binary with the table's shape somewhere in it: twelve rows of four weapon trees and the vocation's own. */
function binaryWith(rows: readonly (readonly number[])[], before = 37): Uint8Array {
  const out = new Uint8Array(before + rows.length * 5 + 20)
  for (let i = 0; i < out.length; i++) out[i] = (i * 7) & 0xff
  rows.forEach((row, r) => {
    out.set(row, before + r * 5)
  })
  return out
}

const rows = [
  [1, 2, 3, 13, 15],
  [2, 4, 6, 13, 16],
  [4, 3, 5, 13, 17],
  [7, 6, 8, 14, 18],
  [3, 1, 7, 14, 19],
  [1, 5, 8, 13, 20],
  [9, 10, 1, 14, 21],
  [12, 1, 4, 13, 22],
  [10, 2, 4, 13, 23],
  [4, 12, 11, 13, 24],
  [8, 5, 11, 13, 25],
  [11, 9, 12, 14, 26],
]

describe('the vocations’ skill trees', () => {
  it('finds the table by its shape, wherever it lies', () => {
    const found = readVocationTrees(binaryWith(rows, 1234))
    expect(found.offset).toBe(1234)
    expect(found.rows).toEqual(rows)
  })

  it('refuses a binary without it, and a row that repeats a tree or ends wrong', () => {
    expect(() => readVocationTrees(new Uint8Array(200))).toThrow(GameFormatError)
    const repeated = rows.map((row, r) => (r === 3 ? [7, 7, 8, 14, 18] : row))
    expect(() => readVocationTrees(binaryWith(repeated))).toThrow(GameFormatError)
    const misordered = rows.map((row, r) => (r === 5 ? [1, 5, 8, 13, 21] : row))
    expect(() => readVocationTrees(binaryWith(misordered))).toThrow(GameFormatError)
  })

  it('says who wields a kind, a bit a vocation', () => {
    const trees = readVocationTrees(binaryWith(rows))
    // Swords: warrior, thief, minstrel, gladiator, armamentalist.
    expect(vocationsWielding(trees, 1)).toBe(0b000011110001)
    // Shields: every vocation but the martial artist, thief, gladiator and ranger.
    expect(vocationsWielding(trees, 13)).toBe(0b011110100111)
    expect(vocationsWielding(trees, 14)).toBe(0b100001011000)
    expect(vocationsWielding(trees, 27)).toBe(0)
  })
})
