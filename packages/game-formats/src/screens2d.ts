import { GameFormatError } from './errors.ts'

/**
 * This cartridge's own 2D background files — `.bncg` tiles, `.bncl` palettes
 * and `.bnsc` screens — which the menus' backgrounds are built from, packed in
 * `.pac` files beside Nitro ones. Established by observation; the evidence is
 * in `FORMAT.md`, "`.bncg`, `.bncl` and `.bnsc`".
 *
 * `.bncg`:
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `char[4]` | `CHAR` |
 * | `+0x04` | `u16` | tile count |
 * | `+0x06` | `u16` | width in tiles |
 * | `+0x08` | `u16` | height in tiles — width × height is the count on all 408 |
 * | `+0x0A` | `u16` | `unknown_0x0a` — `0x7C00` beside four-bit tiles, `0x7C01` beside eight |
 * | `+0x0C` | `u32` | the tiles' size: 32 bytes a tile at four bits, 64 at eight |
 * | `+0x10` | | the tiles |
 *
 * `.bncl`: `PALT`, a `u32` `unknown_0x04`, a `u32` size, then BGR555 colours.
 *
 * `.bnsc`:
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `char[4]` | `SCRN` |
 * | `+0x04` | `u16` | width in tiles |
 * | `+0x06` | `u16` | height in tiles |
 * | `+0x08` | `u16` | `unknown_0x08` |
 * | `+0x0A` | `u16` | `unknown_0x0a` |
 * | `+0x0C` | `u32` | the entries' size, width × height × 2 |
 * | `+0x10` | `u16` × width × height | the entries, row by row |
 *
 * An entry is the DS's text background entry — GBATEK, "LCD VRAM BG Screen
 * Data Format (BG Map)": bits 0–9 the tile, 10 a horizontal flip, 11 a
 * vertical one, 12–15 the palette, unused at 256 colours.
 */

export interface Bncg {
  readonly count: number
  readonly width: number
  readonly height: number
  /** Bits a pixel, from the tiles' size against their count. */
  readonly bits: 4 | 8
  readonly unknown_0x0a: number
  readonly tiles: Uint8Array
}

export interface Bncl {
  readonly unknown_0x04: number
  /** The colours as stored, BGR555. */
  readonly colours: Uint16Array
}

export interface Bnsc {
  readonly width: number
  readonly height: number
  readonly unknown_0x08: number
  readonly unknown_0x0a: number
  /** The entries, row by row. */
  readonly entries: Uint16Array
}

function viewOf(data: Uint8Array): DataView {
  return new DataView(data.buffer, data.byteOffset, data.byteLength)
}

function checkMagic(data: Uint8Array, magic: string, head: number): void {
  if (data.length < head) {
    throw new GameFormatError(`${magic} file is ${data.length} bytes, shorter than its head`)
  }
  const found = String.fromCharCode(...data.subarray(0, 4))
  if (found !== magic) throw new GameFormatError(`not a ${magic} file: it starts '${found}'`, 0)
}

const hasMagic = (data: Uint8Array, magic: string) =>
  data.length >= 16 && String.fromCharCode(...data.subarray(0, 4)) === magic

export const isBncg = (data: Uint8Array): boolean => hasMagic(data, 'CHAR')
export const isBncl = (data: Uint8Array): boolean => hasMagic(data, 'PALT')
export const isBnsc = (data: Uint8Array): boolean => hasMagic(data, 'SCRN')

export function readBncg(data: Uint8Array): Bncg {
  checkMagic(data, 'CHAR', 16)
  const view = viewOf(data)
  const count = view.getUint16(4, true)
  const size = view.getUint32(12, true)
  if (16 + size > data.length) {
    throw new GameFormatError(
      `CHAR says ${size} bytes of tiles, but ${data.length - 16} follow`,
      12,
    )
  }
  const bits = size === count * 32 ? 4 : size === count * 64 ? 8 : undefined
  if (bits === undefined) {
    throw new GameFormatError(
      `CHAR: ${size} bytes for ${count} tiles is neither four bits a pixel nor eight`,
      12,
    )
  }
  return {
    count,
    width: view.getUint16(6, true),
    height: view.getUint16(8, true),
    bits,
    unknown_0x0a: view.getUint16(10, true),
    tiles: data.subarray(16, 16 + size),
  }
}

export function readBncl(data: Uint8Array): Bncl {
  checkMagic(data, 'PALT', 12)
  const view = viewOf(data)
  const size = view.getUint32(8, true)
  if (12 + size > data.length || size % 2 !== 0) {
    throw new GameFormatError(
      `PALT says ${size} bytes of colours, but ${data.length - 12} follow`,
      8,
    )
  }
  const colours = new Uint16Array(size / 2)
  for (let i = 0; i < colours.length; i++) colours[i] = view.getUint16(12 + i * 2, true)
  return { unknown_0x04: view.getUint32(4, true), colours }
}

export function readBnsc(data: Uint8Array): Bnsc {
  checkMagic(data, 'SCRN', 16)
  const view = viewOf(data)
  const width = view.getUint16(4, true)
  const height = view.getUint16(6, true)
  const size = view.getUint32(12, true)
  if (size !== width * height * 2) {
    throw new GameFormatError(`SCRN of ${width}×${height} tiles says ${size} bytes of entries`, 12)
  }
  if (16 + size > data.length) {
    throw new GameFormatError(`SCRN's ${size} bytes of entries run past its ${data.length}`, 12)
  }
  const entries = new Uint16Array(width * height)
  for (let i = 0; i < entries.length; i++) entries[i] = view.getUint16(16 + i * 2, true)
  return {
    width,
    height,
    unknown_0x08: view.getUint16(8, true),
    unknown_0x0a: view.getUint16(10, true),
    entries,
  }
}

/** A screen drawn: RGBA, eight pixels a tile each way. */
export interface ScreenImage {
  readonly width: number
  readonly height: number
  readonly rgba: Uint8Array
}

/**
 * A screen drawn with its tiles and palette: each entry's tile, flipped as it
 * says, in its palette of sixteen at four bits, or the whole palette at eight.
 * Colour 0 is left clear — GBATEK, "Color 0 of all BG and OBJ palettes is
 * transparent". A four-bit tile's low nibble is its left pixel — "the lower 4
 * bits define the color for the left (!) dot".
 */
export function drawBnsc(screen: Bnsc, tiles: Bncg, palette: Bncl): ScreenImage {
  const wide = screen.width * 8
  const rgba = new Uint8Array(wide * screen.height * 8 * 4)
  const tileBytes = tiles.bits * 8
  for (let ty = 0; ty < screen.height; ty++) {
    for (let tx = 0; tx < screen.width; tx++) {
      const entry = screen.entries[ty * screen.width + tx] as number
      const tile = entry & 0x3ff
      if (tile >= tiles.count) {
        throw new GameFormatError(`SCRN entry at ${tx}, ${ty} names tile ${tile} of ${tiles.count}`)
      }
      const flipX = (entry >> 10) & 1
      const flipY = (entry >> 11) & 1
      const base = tile * tileBytes
      const paletteStart = tiles.bits === 4 ? (entry >> 12) * 16 : 0
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const sx = flipX ? 7 - x : x
          const sy = flipY ? 7 - y : y
          let index: number
          if (tiles.bits === 4) {
            const byte = tiles.tiles[base + sy * 4 + (sx >> 1)] as number
            index = sx & 1 ? byte >> 4 : byte & 15
          } else {
            index = tiles.tiles[base + sy * 8 + sx] as number
          }
          if (index === 0) continue
          const colour = palette.colours[paletteStart + index]
          if (colour === undefined) {
            throw new GameFormatError(
              `SCRN entry at ${tx}, ${ty} names colour ${paletteStart + index} of ${palette.colours.length}`,
            )
          }
          const at = ((ty * 8 + y) * wide + tx * 8 + x) * 4
          rgba[at] = Math.round(((colour & 31) * 255) / 31)
          rgba[at + 1] = Math.round((((colour >> 5) & 31) * 255) / 31)
          rgba[at + 2] = Math.round((((colour >> 10) & 31) * 255) / 31)
          rgba[at + 3] = 255
        }
      }
    }
  }
  return { width: wide, height: screen.height * 8, rgba }
}
