import { GameFormatError } from './errors.ts'

/**
 * The European build's Latin fonts: a strip of glyphs, `/data/pack_lv5/fd_<n>.bin`,
 * and its index, `fi_<n>.bin`, for `me` and `s7`. See FORMAT.md, "The Latin fonts".
 *
 * **The strip**, 16 bytes of head and then its pixels, one bit each, row after
 * row, the most significant bit of each byte on the left:
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | 4 bytes | `1.0` and a zero — a version, INFERRED |
 * | `+0x04` | `u16` | width, in pixels |
 * | `+0x06` | `u16` | height |
 * | `+0x08` | `u32` | the pixels' size in bytes: width × height ÷ 8 |
 * | `+0x0C` | `u32` | where they start |
 *
 * **The index**: a head, the kerning pairs, the glyphs, and the glyphs' names.
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | 4 bytes | `1.1` and a zero — a version, INFERRED |
 * | `+0x04` | `u32` | glyph count |
 * | `+0x08` | `u32` | kerning pair count |
 * | `+0x0C` | `u32` | where the pairs start |
 * | `+0x10` | `u32` | where the glyphs start |
 * | `+0x14` | `u32` | where the names start |
 *
 * A pair is four bytes: the left glyph, the right glyph, a signed byte of
 * pixels between them, and a byte not established. A glyph is eight: its
 * name's offset (`u32`), its width, its flags, and where it stands in the
 * strip (`u16`). A name is the character, spelled as the game's text spells
 * it — `A`, or `<'A>` for Á — and ends with a zero.
 */

export interface LatinGlyph {
  /** The character it draws, spelled as the game's text spells it. */
  readonly name: string
  /** Where it stands in the strip, from the left, in pixels. */
  readonly x: number
  readonly width: number
  /**
   * INFERRED: a small letter whose capital is in the font — bit 7 of its
   * flags, set on exactly those 51 in both fonts; ß, with no capital here, is
   * the one small letter without it.
   */
  readonly hasCapital: boolean
  /**
   * The flags' other seven bits, not established. Bit 6 is on the vowels,
   * capital and small, plain and accented, and on Æ and æ — and on ñ, though
   * not Ñ, Œ or œ; the low six are 1 on the letters and digits and 3 or 4 on
   * most of the rest.
   */
  readonly unknown_flags: number
}

export interface KerningPair {
  /** The glyphs, by their place in the index. */
  readonly left: number
  readonly right: number
  /** Pixels added between the two — −1 on every pair on the cartridge. */
  readonly adjust: number
  /** The pair's fourth byte, not established: 0 on every pair on the cartridge. */
  readonly unknown_3: number
}

export interface LatinFont {
  /** The strip's size, in pixels. */
  readonly width: number
  readonly height: number
  readonly glyphs: readonly LatinGlyph[]
  readonly kerning: readonly KerningPair[]
  /** A glyph's place by its name, or −1. */
  indexOf(name: string): number
  /** One byte a pixel, 0 or 1, row by row: `width × height` of the glyph. */
  pixels(index: number): Uint8Array
}

const STRIP_HEAD = 0x10
const INDEX_HEAD = 0x18
const PAIR_SIZE = 4
const GLYPH_SIZE = 8

function view(data: Uint8Array): DataView {
  return new DataView(data.buffer, data.byteOffset, data.byteLength)
}

/** Read a font from its strip and its index. Throws on anything out of bounds. */
export function readLatinFont(strip: Uint8Array, index: Uint8Array): LatinFont {
  if (strip.length < STRIP_HEAD) {
    throw new GameFormatError(`font strip is ${strip.length} bytes, shorter than its head`)
  }
  const s = view(strip)
  const width = s.getUint16(0x04, true)
  const height = s.getUint16(0x06, true)
  const size = s.getUint32(0x08, true)
  const start = s.getUint32(0x0c, true)
  if (size * 8 !== width * height) {
    throw new GameFormatError(`font strip of ${width} × ${height} pixels holds ${size} bytes`, 0x08)
  }
  if (start < STRIP_HEAD || start + size > strip.length) {
    throw new GameFormatError(`font strip's pixels run past its end`, 0x0c)
  }

  if (index.length < INDEX_HEAD) {
    throw new GameFormatError(`font index is ${index.length} bytes, shorter than its head`)
  }
  const d = view(index)
  const count = d.getUint32(0x04, true)
  const pairCount = d.getUint32(0x08, true)
  const pairsAt = d.getUint32(0x0c, true)
  const glyphsAt = d.getUint32(0x10, true)
  const namesAt = d.getUint32(0x14, true)
  if (pairsAt < INDEX_HEAD || pairsAt + pairCount * PAIR_SIZE > glyphsAt) {
    throw new GameFormatError(`font index's kerning pairs run into its glyphs`, 0x0c)
  }
  if (glyphsAt + count * GLYPH_SIZE > namesAt || namesAt > index.length) {
    throw new GameFormatError(`font index's glyphs run past their names`, 0x10)
  }

  const glyphs: LatinGlyph[] = []
  for (let k = 0; k < count; k++) {
    const at = glyphsAt + k * GLYPH_SIZE
    const offset = d.getUint32(at, true)
    if (offset < namesAt || offset >= index.length) {
      throw new GameFormatError(`glyph ${k}'s name is outside the names`, at)
    }
    let end = offset
    while (end < index.length && index[end] !== 0) end++
    if (end >= index.length) throw new GameFormatError(`glyph ${k}'s name does not end`, offset)
    let name = ''
    for (let i = offset; i < end; i++) name += String.fromCharCode(index[i] as number)
    const glyphWidth = index[at + 4] as number
    const flags = index[at + 5] as number
    const x = d.getUint16(at + 6, true)
    if (x + glyphWidth > width) {
      throw new GameFormatError(`glyph ${k} runs past the strip's ${width} pixels`, at)
    }
    glyphs.push({
      name,
      x,
      width: glyphWidth,
      hasCapital: (flags & 0x80) !== 0,
      unknown_flags: flags & 0x7f,
    })
  }

  const kerning: KerningPair[] = []
  for (let k = 0; k < pairCount; k++) {
    const at = pairsAt + k * PAIR_SIZE
    const left = index[at] as number
    const right = index[at + 1] as number
    if (left >= count || right >= count) {
      throw new GameFormatError(`kerning pair ${k} names a glyph past the ${count}`, at)
    }
    kerning.push({ left, right, adjust: d.getInt8(at + 2), unknown_3: index[at + 3] as number })
  }

  const byName = new Map<string, number>()
  for (const [k, glyph] of glyphs.entries()) if (!byName.has(glyph.name)) byName.set(glyph.name, k)

  return {
    width,
    height,
    glyphs,
    kerning,
    indexOf: (name) => byName.get(name) ?? -1,
    pixels(k) {
      const glyph = glyphs[k]
      if (!glyph) throw new GameFormatError(`no glyph ${k} of ${glyphs.length}`)
      const out = new Uint8Array(glyph.width * height)
      for (let y = 0; y < height; y++) {
        for (let c = 0; c < glyph.width; c++) {
          const bit = y * width + glyph.x + c
          const byte = strip[start + (bit >> 3)] as number
          out[y * glyph.width + c] = (byte >> (7 - (bit & 7))) & 1
        }
      }
      return out
    },
  }
}
