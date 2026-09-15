import type { LatinFont } from '@minstrel/game-formats'

/**
 * Text set in one of the game's Latin fonts — see game-formats' FORMAT.md,
 * "The Latin fonts". Each character is drawn with the glyph the font names as
 * the game's text spells it: `A` itself, é `<'e>`, ß `<ss>`. Kerning is the
 * font's own.
 *
 * **Ours**: the pixel between one glyph and the next, {@link GLYPH_GAP} — the
 * strip's own gap suggests it, nothing read says it. And a character the font
 * has no glyph for leaves the text unset rather than guessed at — a space
 * among them, since its width is not read.
 */

/** Pixels between one glyph and the next, before kerning — **ours**, as the strip's own gap. */
export const GLYPH_GAP = 1

/** A combining mark and the sign the text's tags give it: é is `<'e>`. */
const MARKS: Readonly<Record<string, string>> = {
  '́': "'",
  '̀': '`',
  '̂': '^',
  '̈': ':',
  '̃': '~',
  '̧': ',',
}

/** Characters the text spells with a tag of their own. */
const TAGGED: Readonly<Record<string, string>> = {
  ß: '<ss>',
  æ: '<ae>',
  Æ: '<AE>',
  œ: '<oe>',
  Œ: '<OE>',
  // The font's names are tags, so the two brackets are tags too.
  '<': '<<>',
  '>': '<>>',
}

/** The name of the glyph a character is drawn with; undefined when the text has no way to spell it. */
export function glyphNameOf(char: string): string | undefined {
  const tagged = TAGGED[char]
  if (tagged !== undefined) return tagged
  if (/^[!-~]$/.test(char)) return char
  const [base, mark, ...rest] = [...char.normalize('NFD')]
  if (base === undefined || mark === undefined || rest.length > 0 || !/^[A-Za-z]$/.test(base)) {
    return undefined
  }
  const sign = MARKS[mark]
  return sign === undefined ? undefined : `<${sign}${base}>`
}

/** Text set: its size in pixels, and one byte a pixel, 0 or 1, row by row. */
export interface SetText {
  readonly width: number
  readonly height: number
  readonly pixels: Uint8Array
}

/** Set `text` in `font`, glyph after glyph; undefined when a character has no glyph. */
export function setText(font: LatinFont, text: string): SetText | undefined {
  const glyphs: number[] = []
  for (const char of text) {
    const name = glyphNameOf(char)
    const index = name === undefined ? -1 : font.indexOf(name)
    if (index < 0) return undefined
    glyphs.push(index)
  }
  const kerning = new Map(font.kerning.map((pair) => [`${pair.left},${pair.right}`, pair.adjust]))
  const at: number[] = []
  let width = 0
  for (const [i, glyph] of glyphs.entries()) {
    if (i > 0) width += GLYPH_GAP + (kerning.get(`${glyphs[i - 1]},${glyph}`) ?? 0)
    at.push(width)
    width += font.glyphs[glyph]?.width ?? 0
  }
  const pixels = new Uint8Array(width * font.height)
  for (const [i, glyph] of glyphs.entries()) {
    const across = font.glyphs[glyph]?.width ?? 0
    const drawn = font.pixels(glyph)
    const left = at[i] as number
    for (let y = 0; y < font.height; y++) {
      for (let x = 0; x < across; x++) {
        if (drawn[y * across + x]) pixels[y * width + left + x] = 1
      }
    }
  }
  return { width, height: font.height, pixels }
}
