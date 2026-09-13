import { describe, expect, it } from 'vitest'
import { readGrammar } from '../src/grammar.ts'

const pack = (fields: [number, number, number, number], top = 0) =>
  ((top << 24) | (fields[3] << 18) | (fields[2] << 12) | (fields[1] << 6) | fields[0]) >>> 0

describe('a name’s grammar', () => {
  it('names its articles by their numbers in the article table', () => {
    // An ordinary name: `a`, `the`, and `some` and `the` in the plural.
    expect(readGrammar(pack([1, 1, 1, 1], 2))).toEqual({
      indefinite: 101,
      indefinitePlural: 301,
      definite: 1,
      definitePlural: 201,
      gender: 2,
      unknown_bits26: 0,
    })
    // A book: `a book called`, `the book called`.
    const book = readGrammar(pack([19, 1, 3, 1]))
    expect(book.indefinite).toBe(119)
    expect(book.definite).toBe(3)
  })

  it('keeps the gender apart from the bits above it', () => {
    const word = pack([1, 1, 1, 1], 0b100001)
    expect(readGrammar(word).gender).toBe(1)
    expect(readGrammar(word).unknown_bits26).toBe(0b1000)
  })
})
