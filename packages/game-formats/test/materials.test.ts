import { describe, expect, it } from 'vitest'
import { isMarshTexture, isWaterTexture, textureTag } from '../src/materials.ts'

describe('map texture tags', () => {
  it('reads the three letters before the number', () => {
    expect(textureTag('m01m00wtr01')).toBe('wtr')
    expect(textureTag('d01dok02')).toBe('dok')
    expect(textureTag('a_b000_00')).toBeUndefined()
  })

  it('tells water and marsh by their tags, and nothing else as either', () => {
    expect(isWaterTexture('m01m00wtr01')).toBe(true)
    expect(isMarshTexture('d01dok01')).toBe(true)
    expect(isMarshTexture('f01mud01')).toBe(false)
    expect(isMarshTexture('m01m00wtr01')).toBe(false)
    expect(isWaterTexture('d01dok01')).toBe(false)
  })
})
