import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { glyphStride, isBitmapFont, readBitmapFont } from '../src/font.ts'
import { buildFont, LETTER_L } from './fixture.ts'

const font = () =>
  buildFont(
    [
      { code: 0x8140 }, // blank, as the real fonts' first glyph is
      { code: 0x824c, rows: LETTER_L },
      {
        code: 0x817c,
        rows: [
          '........',
          '........',
          '........',
          '######..',
          '........',
          '........',
          '........',
          '........',
        ],
      },
    ],
    { lineHeight: 10, trailingPadding: 4 },
  )

describe('glyphStride', () => {
  it('packs continuously, without row padding', () => {
    // 10x10 is 100 bits, so 13 bytes — not the 20 that row alignment needs.
    expect(glyphStride(10, 10)).toBe(13)
    expect(glyphStride(8, 8)).toBe(8)
    expect(glyphStride(12, 12)).toBe(18)
  })
})

describe('readBitmapFont', () => {
  it('reads the header', () => {
    const f = readBitmapFont(font())
    expect(f.lineHeight).toBe(10)
    expect(f.width).toBe(8)
    expect(f.height).toBe(8)
    expect(f.glyphCount).toBe(3)
  })

  it('reads codepoints as big-endian', () => {
    // Byte-swapped, 0x8140 would read as 0x4081 and mean nothing.
    expect(Array.from(readBitmapFont(font()).codes)).toEqual([0x8140, 0x824c, 0x817c])
  })

  it('decodes a glyph most significant bit first', () => {
    const f = readBitmapFont(font())
    expect(f.toText(0x824c)).toBe(LETTER_L.map((r) => r.replaceAll(' ', '.')).join('\n'))
  })

  it('decodes a glyph to a pixel mask of the right size', () => {
    const glyph = readBitmapFont(font()).glyph(0x817c)
    expect(glyph.pixels).toHaveLength(64)
    expect(glyph.code).toBe(0x817c)
    // The bar sits on row 3, columns 0..5.
    expect(Array.from(glyph.pixels.subarray(24, 32))).toEqual([1, 1, 1, 1, 1, 1, 0, 0])
  })

  it('treats a blank glyph as blank rather than missing', () => {
    const glyph = readBitmapFont(font()).glyph(0x8140)
    expect(glyph.pixels.every((p) => p === 0)).toBe(true)
  })

  it('looks a glyph up by index or by codepoint', () => {
    const f = readBitmapFont(font())
    expect(f.glyph(1).code).toBe(0x824c)
    expect(f.glyph(0x824c).index).toBe(1)
    expect(f.indexOf(0x817c)).toBe(2)
    expect(f.indexOf(0x9999)).toBe(-1)
  })

  it('handles a 12x12 cell, where a glyph spans a non-whole number of bytes per row', () => {
    const rows = Array.from({ length: 12 }, (_, y) => (y === 0 ? '############' : '.'.repeat(12)))
    const f = readBitmapFont(buildFont([{ code: 0x41, rows }], { width: 12, height: 12 }))
    expect(f.toText(0x41).split('\n')[0]).toBe('############')
    expect(f.toText(0x41).split('\n')[1]).toBe('............')
  })

  it('reads an empty font, which real cartridges contain', () => {
    const f = readBitmapFont(buildFont([]))
    expect(f.glyphCount).toBe(0)
    expect(Array.from(f.codes)).toEqual([])
  })

  it('tolerates padding between the sections', () => {
    const f = readBitmapFont(
      buildFont([{ code: 0x41, rows: LETTER_L }], { mapPadding: 6, trailingPadding: 20 }),
    )
    expect(f.toText(0x41)).toBe(LETTER_L.join('\n'))
  })
})

describe('isBitmapFont', () => {
  it('accepts a well-formed font, empty ones included', () => {
    expect(isBitmapFont(font())).toBe(true)
    expect(isBitmapFont(buildFont([]))).toBe(true)
  })

  it('rejects a buffer too short to hold a header', () => {
    expect(isBitmapFont(new Uint8Array(8))).toBe(false)
  })

  it('rejects a buffer whose reserved bytes are not zero', () => {
    const data = font()
    data[1] = 9
    expect(isBitmapFont(data)).toBe(false)
  })

  it('rejects a buffer whose repeated width disagrees', () => {
    const data = font()
    data[4] = 99
    expect(isBitmapFont(data)).toBe(false)
  })

  it('rejects a buffer whose glyphs would run past the end', () => {
    const data = font()
    new DataView(data.buffer).setUint16(6, 9999, true)
    expect(isBitmapFont(data)).toBe(false)
  })
})

describe('readBitmapFont on malformed input', () => {
  it('rejects a truncated header', () => {
    expect(() => readBitmapFont(new Uint8Array(8))).toThrow(/shorter than its header/)
  })

  it('rejects a zero cell size', () => {
    const data = font()
    data[2] = 0
    expect(() => readBitmapFont(data)).toThrow(/cell/)
  })

  it('rejects a character map running past the end', () => {
    const data = font()
    new DataView(data.buffer).setUint32(8, data.length - 2, true)
    expect(() => readBitmapFont(data)).toThrow(/character map/)
  })

  it('rejects glyphs running past the end', () => {
    const data = font()
    new DataView(data.buffer).setUint32(12, data.length - 4, true)
    expect(() => readBitmapFont(data)).toThrow(/bytes of glyphs/)
  })

  it('reports an unknown codepoint rather than returning a blank glyph', () => {
    expect(() => readBitmapFont(font()).glyph(0x9999)).toThrow(GameFormatError)
  })
})
