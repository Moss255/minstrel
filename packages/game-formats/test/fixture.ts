import { glyphStride } from '../src/font.ts'

/**
 * Builds valid bitmap fonts in memory.
 *
 * Fixtures may not contain cartridge bytes, so the layout is implemented here
 * from the description in `FORMAT.md`, independently of the reader.
 */

export interface FixtureGlyph {
  code: number
  /** Rows of a picture; any character other than the `off` one is ink. */
  rows?: string[]
}

export interface FontFixtureOptions {
  lineHeight?: number
  width?: number
  height?: number
  /** Extra padding between the character map and the glyphs. */
  mapPadding?: number
  /** Extra bytes after the glyphs, as real fonts carry. */
  trailingPadding?: number
}

export function buildFont(glyphs: FixtureGlyph[], options: FontFixtureOptions = {}): Uint8Array {
  const width = options.width ?? 8
  const height = options.height ?? 8
  const lineHeight = options.lineHeight ?? height
  const stride = glyphStride(width, height)

  const mapOffset = 16
  const glyphOffset = mapOffset + glyphs.length * 2 + (options.mapPadding ?? 0)
  const total = glyphOffset + glyphs.length * stride + (options.trailingPadding ?? 0)

  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  out[0] = lineHeight
  out[1] = 0
  out[2] = width
  out[3] = height
  out[4] = width
  out[5] = 0
  view.setUint16(6, glyphs.length, true)
  view.setUint32(8, mapOffset, true)
  view.setUint32(12, glyphOffset, true)

  glyphs.forEach((glyph, i) => {
    // Codepoints are big-endian.
    out[mapOffset + i * 2] = (glyph.code >>> 8) & 0xff
    out[mapOffset + i * 2 + 1] = glyph.code & 0xff

    if (!glyph.rows) return
    const base = glyphOffset + i * stride
    let bit = 0
    for (let y = 0; y < height; y++) {
      const row = glyph.rows[y] ?? ''
      for (let x = 0; x < width; x++) {
        const on = row[x] !== undefined && row[x] !== '.' && row[x] !== ' '
        if (on) out[base + (bit >> 3)] = (out[base + (bit >> 3)] as number) | (0x80 >> (bit & 7))
        bit++
      }
    }
  })

  return out
}

/** A recognisable 8x8 letter, for asserting the bit order comes out right. */
export const LETTER_L = [
  '#.......',
  '#.......',
  '#.......',
  '#.......',
  '#.......',
  '#.......',
  '######..',
  '........',
]
