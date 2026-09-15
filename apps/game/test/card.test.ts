import { describe, expect, it } from 'vitest'
import { closesTheSlice } from '../src/card.ts'

describe('the title card', () => {
  it('closes the slice on reaching 2.5, and at no other stage', () => {
    expect(closesTheSlice({ major: 2, minor: 5 })).toBe(true)
    expect(closesTheSlice({ major: 2, minor: 4 })).toBe(false)
    expect(closesTheSlice({ major: 3, minor: 5 })).toBe(false)
    expect(closesTheSlice(undefined)).toBe(false)
  })
})
