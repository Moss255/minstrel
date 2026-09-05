import { GameFormatError } from './errors.ts'

/**
 * The bitmap font found in this cartridge's `font.gp2` archives, under names
 * like `f8.mes` and `f12C01B.mes`.
 *
 * Not a Nintendo format: there is no NFTR resource anywhere on the cartridge.
 * Everything below was established by observation; the evidence is in
 * `FORMAT.md`.
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `u8`  | line height |
 * | `+0x01` | `u8`  | `unknown_0x01`, always 0 |
 * | `+0x02` | `u8`  | cell width |
 * | `+0x03` | `u8`  | cell height |
 * | `+0x04` | `u8`  | `unknown_0x04`, always equal to the cell width |
 * | `+0x05` | `u8`  | `unknown_0x05`, always 0 |
 * | `+0x06` | `u16` | glyph count |
 * | `+0x08` | `u32` | offset of the character map |
 * | `+0x0C` | `u32` | offset of the glyph bitmaps |
 *
 * The character map is `count` **big-endian** `u16` codepoints, in the same
 * order as the glyphs. Big-endian is not a guess: the values read as Shift-JIS
 * that way (`0x8140`, `0x824F`) and as nothing at all byte-swapped.
 *
 * Glyphs are one bit per pixel, most significant bit first, packed
 * **continuously with no row padding** — a glyph occupies exactly
 * `ceil(width * height / 8)` bytes, so a 10×10 cell takes 13 bytes rather than
 * the 20 that row alignment would need.
 */

export interface Glyph {
  readonly index: number
  /** Codepoint from the character map. */
  readonly code: number
  /** One byte per pixel, 0 or 1, row-major, `width * height` long. */
  readonly pixels: Uint8Array
}

export interface BitmapFont {
  readonly lineHeight: number
  readonly width: number
  readonly height: number
  readonly glyphCount: number
  /** Codepoints, in glyph order. */
  readonly codes: Uint16Array
  readonly unknown_0x01: number
  readonly unknown_0x04: number
  readonly unknown_0x05: number

  /** Decode one glyph to a pixel mask. */
  glyph(indexOrCode: number): Glyph
  /** Glyph index for a codepoint, or -1. */
  indexOf(code: number): number
  /** Render a glyph as text, for debugging and tests. */
  toText(indexOrCode: number, on?: string, off?: string): string
}

function u16le(d: Uint8Array, at: number, what: string): number {
  if (at + 2 > d.length) throw new GameFormatError(`${what}: read past end of font`, at)
  return (d[at] as number) | ((d[at + 1] as number) << 8)
}

function u32le(d: Uint8Array, at: number, what: string): number {
  if (at + 4 > d.length) throw new GameFormatError(`${what}: read past end of font`, at)
  return (
    ((d[at] as number) |
      ((d[at + 1] as number) << 8) |
      ((d[at + 2] as number) << 16) |
      ((d[at + 3] as number) << 24)) >>>
    0
  )
}

/** Bytes one glyph occupies: 1bpp, packed with no row padding. */
export function glyphStride(width: number, height: number): number {
  return Math.ceil((width * height) / 8)
}

/**
 * Cheap check for the font's header shape.
 *
 * There is no magic number, so this tests the structure instead: the two
 * reserved bytes are zero, the repeated width agrees, and both section offsets
 * are consistent with the declared glyph count. Across every file on the
 * reference cartridge this accepts all 529 fonts, empty ones included, and
 * nothing else.
 */
export function isBitmapFont(data: Uint8Array): boolean {
  if (data.length < 16) return false
  if (data[1] !== 0 || data[5] !== 0) return false
  const width = data[2] as number
  const height = data[3] as number
  if (width === 0 || height === 0 || width !== data[4]) return false
  // A glyph count of zero is legitimate: 17 fonts on the reference cartridge
  // are empty, belonging to scenarios that need no extra glyphs.
  const count = u16le(data, 6, 'font.glyphCount')
  const mapOffset = u32le(data, 8, 'font.mapOffset')
  const glyphOffset = u32le(data, 12, 'font.glyphOffset')
  if (mapOffset < 16 || mapOffset + count * 2 > glyphOffset) return false
  return glyphOffset + count * glyphStride(width, height) <= data.length
}

/** Parse a bitmap font. Returns views into `data`; glyphs decode on demand. */
export function readBitmapFont(data: Uint8Array): BitmapFont {
  if (data.length < 16) {
    throw new GameFormatError(`font is ${data.length} bytes, shorter than its header`)
  }
  const lineHeight = data[0] as number
  const width = data[2] as number
  const height = data[3] as number
  const glyphCount = u16le(data, 6, 'font.glyphCount')
  const mapOffset = u32le(data, 8, 'font.mapOffset')
  const glyphOffset = u32le(data, 12, 'font.glyphOffset')

  if (width === 0 || height === 0) {
    throw new GameFormatError(`font declares a ${width}x${height} cell`, 2)
  }
  const stride = glyphStride(width, height)
  if (mapOffset + glyphCount * 2 > data.length) {
    throw new GameFormatError(
      `font character map of ${glyphCount} entries runs past the end of the file`,
      8,
    )
  }
  if (glyphOffset + glyphCount * stride > data.length) {
    throw new GameFormatError(
      `font needs ${glyphCount * stride} bytes of glyphs at 0x${glyphOffset.toString(16)} but only ${data.length - glyphOffset} remain`,
      12,
    )
  }

  // Codepoints are big-endian; see the note above.
  const codes = new Uint16Array(glyphCount)
  for (let i = 0; i < glyphCount; i++) {
    codes[i] = ((data[mapOffset + i * 2] as number) << 8) | (data[mapOffset + i * 2 + 1] as number)
  }

  const byCode = new Map<number, number>()
  for (let i = 0; i < glyphCount; i++) {
    const code = codes[i] as number
    if (!byCode.has(code)) byCode.set(code, i)
  }

  const resolve = (indexOrCode: number): number => {
    if (indexOrCode >= 0 && indexOrCode < glyphCount) return indexOrCode
    const found = byCode.get(indexOrCode)
    if (found === undefined) {
      throw new GameFormatError(`font has no glyph ${indexOrCode} (0x${indexOrCode.toString(16)})`)
    }
    return found
  }

  const glyph = (indexOrCode: number): Glyph => {
    const index = resolve(indexOrCode)
    const base = glyphOffset + index * stride
    const pixels = new Uint8Array(width * height)
    for (let bit = 0; bit < width * height; bit++) {
      const byte = data[base + (bit >> 3)] as number
      pixels[bit] = (byte >> (7 - (bit & 7))) & 1
    }
    return { index, code: codes[index] as number, pixels }
  }

  return {
    lineHeight,
    width,
    height,
    glyphCount,
    codes,
    unknown_0x01: data[1] as number,
    unknown_0x04: data[4] as number,
    unknown_0x05: data[5] as number,
    glyph,
    indexOf: (code) => byCode.get(code) ?? -1,
    toText: (indexOrCode, on = '#', off = '.') => {
      const { pixels } = glyph(indexOrCode)
      const rows: string[] = []
      for (let y = 0; y < height; y++) {
        let row = ''
        for (let x = 0; x < width; x++) row += pixels[y * width + x] ? on : off
        rows.push(row)
      }
      return rows.join('\n')
    },
  }
}
