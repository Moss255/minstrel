import { describe, expect, it } from 'vitest'
import { isTranslucent, TRANSLUCENT_SHARE, translucentShare } from '../src/alpha.ts'

/** A texture of so many pixels at each alpha. */
function texture(alphas: Record<number, number>): Uint8Array {
  const list = Object.entries(alphas).flatMap(([alpha, count]) => Array(count).fill(Number(alpha)))
  const pixels = new Uint8Array(list.length * 4)
  list.forEach((alpha, i) => {
    pixels[i * 4] = 10
    pixels[i * 4 + 3] = alpha
  })
  return pixels
}

describe('translucency', () => {
  it('counts only pixels neither clear nor solid', () => {
    expect(translucentShare(texture({ 0: 50, 255: 50 }))).toBe(0)
    expect(translucentShare(texture({ 0: 25, 128: 50, 255: 25 }))).toBe(0.5)
    expect(translucentShare(new Uint8Array())).toBe(0)
  })

  it('draws a soft shadow see-through and a cut-out solid', () => {
    expect(isTranslucent(texture({ 0: 60, 64: 30, 160: 10 }))).toBe(true)
    expect(isTranslucent(texture({ 0: 40, 255: 60 }))).toBe(false)
  })

  it('leaves a solid texture with a thin antialiased edge solid', () => {
    const edge = Math.floor(1000 * TRANSLUCENT_SHARE) - 25
    expect(isTranslucent(texture({ 255: 1000 - edge, 128: edge }))).toBe(false)
  })
})
