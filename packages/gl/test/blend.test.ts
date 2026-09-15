import { describe, expect, it } from 'vitest'
import { blended } from '../src/alpha.ts'

describe('which pass a piece is drawn in', () => {
  it('blends a see-through texture, and anything showing less than whole', () => {
    expect(blended(1, false)).toBe(false)
    expect(blended(1, true)).toBe(true)
    expect(blended(0.5, false)).toBe(true)
    expect(blended(0, false)).toBe(true)
  })
})
