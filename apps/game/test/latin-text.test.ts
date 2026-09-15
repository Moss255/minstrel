import type { LatinFont, LatinGlyph } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { GLYPH_GAP, glyphNameOf, setText } from '../src/latin-text.ts'

/** A font built in code: every glyph solid, two pixels tall, `A` and `T` kerned together. */
function font(): LatinFont {
  const glyph = (name: string, width: number): LatinGlyph => ({
    name,
    x: 0,
    width,
    hasCapital: false,
    unknown_flags: 0,
  })
  const glyphs = [glyph('A', 2), glyph('T', 3), glyph("<'E>", 1), glyph('<ss>', 2)]
  return {
    width: 16,
    height: 2,
    glyphs,
    kerning: [{ left: 0, right: 1, adjust: -1, unknown_3: 0 }],
    indexOf: (name) => glyphs.findIndex((g) => g.name === name),
    pixels: (k) => new Uint8Array((glyphs[k]?.width ?? 0) * 2).fill(1),
  }
}

describe('text in the game’s letters', () => {
  it('names each character as the text’s tags spell it', () => {
    expect(glyphNameOf('a')).toBe('a')
    expect(glyphNameOf('É')).toBe("<'E>")
    expect(glyphNameOf('ñ')).toBe('<~n>')
    expect(glyphNameOf('ß')).toBe('<ss>')
    expect(glyphNameOf('<')).toBe('<<>')
    expect(glyphNameOf(' ')).toBeUndefined()
    expect(glyphNameOf('漢')).toBeUndefined()
  })

  it('sets glyph after glyph a pixel apart, kerned where the font says', () => {
    expect(GLYPH_GAP).toBe(1)
    // T then A: three, a gap, two.
    const ta = setText(font(), 'TA')
    expect(ta?.width).toBe(6)
    expect([...(ta?.pixels ?? new Uint8Array()).subarray(0, 6)]).toEqual([1, 1, 1, 0, 1, 1])
    // A then T are kerned by one: the gap closes.
    const at = setText(font(), 'AT')
    expect(at?.width).toBe(5)
    expect([...(at?.pixels ?? new Uint8Array()).subarray(0, 5)]).toEqual([1, 1, 1, 1, 1])
    expect(setText(font(), 'Éß')?.width).toBe(4)
  })

  it('leaves unset what the font cannot draw, a space among it', () => {
    expect(setText(font(), 'A T')).toBeUndefined()
    expect(setText(font(), 'Az')).toBeUndefined()
    expect(setText(font(), '')?.width).toBe(0)
  })
})
