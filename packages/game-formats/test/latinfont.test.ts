import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { readLatinFont } from '../src/latinfont.ts'

/**
 * A strip and its index, built in code from FORMAT.md — no cartridge bytes.
 * The strip is 16 × 2: an `A` three pixels wide at x 0, a `b` two wide at x 4.
 */
function strip(rows: string[], width = 16): Uint8Array {
  const height = rows.length
  const size = (width * height) / 8
  const out = new Uint8Array(16 + size)
  const d = new DataView(out.buffer)
  out.set([0x31, 0x2e, 0x30, 0x00])
  d.setUint16(4, width, true)
  d.setUint16(6, height, true)
  d.setUint32(8, size, true)
  d.setUint32(12, 16, true)
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      if (row[x] !== '#') continue
      const bit = y * width + x
      out[16 + (bit >> 3)] = (out[16 + (bit >> 3)] as number) | (0x80 >> (bit & 7))
    }
  })
  return out
}

function index(
  glyphs: { name: string; width: number; flags: number; x: number }[],
  pairs: [number, number, number, number][] = [],
): Uint8Array {
  const pairsAt = 24
  const glyphsAt = pairsAt + pairs.length * 4
  const namesAt = glyphsAt + glyphs.length * 8
  const names = glyphs.map((g) => [...g.name].map((c) => c.charCodeAt(0)).concat(0))
  const out = new Uint8Array(namesAt + names.reduce((n, name) => n + name.length, 0))
  const d = new DataView(out.buffer)
  out.set([0x31, 0x2e, 0x31, 0x00])
  d.setUint32(4, glyphs.length, true)
  d.setUint32(8, pairs.length, true)
  d.setUint32(12, pairsAt, true)
  d.setUint32(16, glyphsAt, true)
  d.setUint32(20, namesAt, true)
  pairs.forEach(([l, r, adjust, fourth], k) => {
    out.set([l, r, adjust & 0xff, fourth], pairsAt + k * 4)
  })
  let at = namesAt
  glyphs.forEach((g, k) => {
    d.setUint32(glyphsAt + k * 8, at, true)
    out[glyphsAt + k * 8 + 4] = g.width
    out[glyphsAt + k * 8 + 5] = g.flags
    d.setUint16(glyphsAt + k * 8 + 6, g.x, true)
    out.set(names[k] as number[], at)
    at += (names[k] as number[]).length
  })
  return out
}

const rows = ['.#..#...........', '#.#.##..........']
const two = [
  { name: 'A', width: 3, flags: 0x41, x: 0 },
  { name: 'b', width: 2, flags: 0x81, x: 4 },
]

describe('a Latin font', () => {
  it('reads its glyphs: name, place, width and flags', () => {
    const font = readLatinFont(strip(rows), index(two))
    expect([font.width, font.height]).toEqual([16, 2])
    expect(font.glyphs).toEqual([
      { name: 'A', x: 0, width: 3, hasCapital: false, unknown_flags: 0x41 },
      { name: 'b', x: 4, width: 2, hasCapital: true, unknown_flags: 1 },
    ])
    expect(font.indexOf('b')).toBe(1)
    expect(font.indexOf('z')).toBe(-1)
  })

  it('cuts each glyph out of the strip, the high bit on the left', () => {
    const font = readLatinFont(strip(rows), index(two))
    expect([...font.pixels(0)]).toEqual([0, 1, 0, 1, 0, 1])
    expect([...font.pixels(1)]).toEqual([1, 0, 1, 1])
  })

  it('reads kerning pairs, the adjustment signed', () => {
    const font = readLatinFont(strip(rows), index(two, [[0, 1, -1, 0]]))
    expect(font.kerning).toEqual([{ left: 0, right: 1, adjust: -1, unknown_3: 0 }])
  })

  it('refuses a strip whose size is not its pixels', () => {
    const bad = strip(rows)
    new DataView(bad.buffer).setUint32(8, 5, true)
    expect(() => readLatinFont(bad, index(two))).toThrow(GameFormatError)
    expect(() => readLatinFont(strip(rows).subarray(0, 8), index(two))).toThrow(GameFormatError)
  })

  it('refuses a glyph past the strip, a name past the end, and a pair past the glyphs', () => {
    expect(() =>
      readLatinFont(strip(rows), index([{ name: 'W', width: 9, flags: 1, x: 10 }])),
    ).toThrow(/runs past the strip/)
    const unended = index(two)
    unended[unended.length - 1] = 0x21
    expect(() => readLatinFont(strip(rows), unended)).toThrow(/does not end/)
    expect(() => readLatinFont(strip(rows), index(two, [[0, 5, -1, 0]]))).toThrow(
      /names a glyph past/,
    )
    expect(() => readLatinFont(strip(rows), index(two).subarray(0, 10))).toThrow(GameFormatError)
  })
})
