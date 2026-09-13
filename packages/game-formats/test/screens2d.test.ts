import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { drawBnsc, isBnsc, readBncg, readBncl, readBnsc } from '../src/screens2d.ts'

/**
 * Tiles, palettes and screens built from FORMAT.md, never from a cartridge.
 */
const le16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff]
const le32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))

/** Four-bit tiles given as 64 colour indices each, low nibble left. */
function bncg(tiles: number[][], width = tiles.length): Uint8Array {
  const packed: number[] = []
  for (const tile of tiles)
    for (let i = 0; i < 64; i += 2) packed.push(((tile[i + 1] ?? 0) << 4) | (tile[i] ?? 0))
  const height = Math.ceil(tiles.length / width)
  return Uint8Array.from([
    ...ascii('CHAR'),
    ...le16(tiles.length),
    ...le16(width),
    ...le16(height),
    ...le16(0x7c00),
    ...le32(packed.length),
    ...packed,
  ])
}

/** Eight-bit tiles, a byte a pixel. */
function bncg8(tiles: number[][]): Uint8Array {
  const bytes = tiles.flatMap((t) => Array.from({ length: 64 }, (_, i) => t[i] ?? 0))
  return Uint8Array.from([
    ...ascii('CHAR'),
    ...le16(tiles.length),
    ...le16(tiles.length),
    ...le16(1),
    ...le16(0x7c01),
    ...le32(bytes.length),
    ...bytes,
  ])
}

function bncl(colours: number[]): Uint8Array {
  return Uint8Array.from([
    ...ascii('PALT'),
    ...le32(0),
    ...le32(colours.length * 2),
    ...colours.flatMap(le16),
  ])
}

function bnsc(width: number, height: number, entries: number[]): Uint8Array {
  return Uint8Array.from([
    ...ascii('SCRN'),
    ...le16(width),
    ...le16(height),
    ...le16(0),
    ...le16(0x0f0),
    ...le32(width * height * 2),
    ...entries.flatMap(le16),
  ])
}

/** A tile whose first pixel is clear and whose second is colour 2, the rest colour 1. */
const MARKED = [0, 2, ...new Array<number>(62).fill(1)]
const fill = (index: number) => new Array<number>(64).fill(index)
/** Palette 0: red, green; palette 1: blue in colour 1. */
const COLOURS = [0, 0x001f, 0x03e0, ...new Array<number>(13).fill(0), 0, 0x7c00]

describe('the background files', () => {
  it('read their heads and their contents', () => {
    const tiles = readBncg(bncg([fill(1), MARKED], 2))
    expect([tiles.count, tiles.width, tiles.height, tiles.bits, tiles.unknown_0x0a]).toEqual([
      2, 2, 1, 4, 0x7c00,
    ])
    expect(readBncg(bncg8([fill(5)])).bits).toBe(8)
    expect([...readBncl(bncl(COLOURS)).colours.subarray(0, 3)]).toEqual([0, 0x001f, 0x03e0])
    const screen = readBnsc(bnsc(2, 1, [1, 0x1000]))
    expect([screen.width, screen.height, screen.unknown_0x0a, ...screen.entries]).toEqual([
      2, 1, 0x0f0, 1, 0x1000,
    ])
    expect(isBnsc(bnsc(1, 1, [0]))).toBe(true)
  })

  it('draw a screen: each entry its tile, its flips and its palette, colour 0 clear', () => {
    // Tile 1 as it is; tile 1 mirrored across; tile 0 in palette 1.
    const image = drawBnsc(
      readBnsc(bnsc(3, 1, [1, 0x0401, 0x1000])),
      readBncg(bncg([fill(1), MARKED])),
      readBncl(bncl(COLOURS)),
    )
    const at = (x: number, y: number) => [
      ...image.rgba.subarray((y * 24 + x) * 4, (y * 24 + x) * 4 + 4),
    ]
    expect([image.width, image.height]).toEqual([24, 8])
    expect(at(0, 0)).toEqual([0, 0, 0, 0])
    expect(at(1, 0)).toEqual([0, 255, 0, 255])
    expect(at(2, 0)).toEqual([255, 0, 0, 255])
    expect(at(15, 0)).toEqual([0, 0, 0, 0])
    expect(at(14, 0)).toEqual([0, 255, 0, 255])
    expect(at(16, 0)).toEqual([0, 0, 255, 255])
  })

  it('take the byte of an eight-bit tile as the colour, and no palette from the entry', () => {
    const image = drawBnsc(
      readBnsc(bnsc(1, 1, [0xf000])),
      readBncg(bncg8([fill(2)])),
      readBncl(bncl(COLOURS)),
    )
    expect([...image.rgba.subarray(0, 4)]).toEqual([0, 255, 0, 255])
  })

  it('refuse a wrong magic, sizes that do not add up, and a tile past the tiles', () => {
    expect(() => readBncg(bncl(COLOURS))).toThrow(/not a CHAR/)
    const short = bncg([fill(1)])
    expect(() => readBncg(short.subarray(0, short.length - 1))).toThrow(GameFormatError)
    // Forty bytes of tiles, all present, for one tile: neither 32 nor 64.
    const odd = new Uint8Array(16 + 40)
    odd.set(bncg([fill(1)]))
    odd.set(le32(40), 12)
    expect(() => readBncg(odd)).toThrow(/neither four bits/)
    const wrong = bnsc(2, 1, [0, 0]).slice()
    wrong.set(le32(6), 12)
    expect(() => readBnsc(wrong)).toThrow(/says 6 bytes/)
    expect(() =>
      drawBnsc(readBnsc(bnsc(1, 1, [9])), readBncg(bncg([fill(1)])), readBncl(bncl(COLOURS))),
    ).toThrow(/tile 9 of 1/)
  })
})
