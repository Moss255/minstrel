import { checkRange, u16, u32 } from './bytes.ts'
import { NitroGfxError } from './errors.ts'

/**
 * The file shape the DS's 2D graphics share — NCLR palettes, NCGR characters,
 * NCER cells. Sources and evidence in `FORMAT.md`, "2D graphics".
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `char[4]` | magic, stored reversed: `RLCN` for an NCLR |
 * | `+0x04` | `u16` | byte-order mark, `0xFEFF` |
 * | `+0x06` | `u16` | version |
 * | `+0x08` | `u32` | file size |
 * | `+0x0C` | `u16` | header size, 16 |
 * | `+0x0E` | `u16` | block count |
 *
 * The blocks follow one another from the header's end, each a reversed stamp
 * and a `u32` size that counts its own eight-byte head. NSBMD lists its blocks
 * by offset instead; these do not.
 */

const BYTE_ORDER = 0xfeff
const HEADER_SIZE = 16
const BLOCK_HEAD = 8

export interface G2dBlock {
  /** The stamp as stored — reversed, so `TTLP` for PLTT. */
  readonly stamp: string
  /** Where the block starts in the file. */
  readonly offset: number
  /** Its size, its own eight-byte head included. */
  readonly size: number
  /** Its content, past the head. Offsets inside a block count from here. */
  readonly data: Uint8Array
}

export interface G2dFile {
  readonly magic: string
  readonly version: number
  readonly blocks: readonly G2dBlock[]
}

export function stampAt(d: Uint8Array, at: number): string {
  checkRange(d, at, 4, 'stamp')
  return String.fromCharCode(
    d[at] as number,
    d[at + 1] as number,
    d[at + 2] as number,
    d[at + 3] as number,
  )
}

/** Whether these bytes start as a 2D file with this magic would. */
export function isG2dFile(data: Uint8Array, magic: string): boolean {
  return data.length >= HEADER_SIZE && stampAt(data, 0) === magic && u16(data, 4) === BYTE_ORDER
}

/** The header and the blocks, checked to lie inside the file its header describes. */
export function readG2dFile(data: Uint8Array, magic: string): G2dFile {
  checkRange(data, 0, HEADER_SIZE, `${magic} header`)
  const found = stampAt(data, 0)
  if (found !== magic) throw new NitroGfxError(`not a ${magic}: it starts '${found}'`, 0)
  const order = u16(data, 4)
  if (order !== BYTE_ORDER) {
    throw new NitroGfxError(`${magic}: byte-order mark 0x${order.toString(16)}, not 0xfeff`, 4)
  }
  const size = u32(data, 8)
  if (size > data.length) {
    throw new NitroGfxError(`${magic}: says it is ${size} bytes, but ${data.length} are here`, 8)
  }
  const file = data.subarray(0, size)
  const count = u16(data, 14)
  const blocks: G2dBlock[] = []
  let at = u16(data, 12)
  for (let i = 0; i < count; i++) {
    checkRange(file, at, BLOCK_HEAD, `${magic} block ${i}`)
    const stamp = stampAt(file, at)
    const length = u32(file, at + 4)
    if (length < BLOCK_HEAD || at + length > file.length) {
      throw new NitroGfxError(
        `${magic} block ${i} ('${stamp}') of ${length} bytes runs past the file's ${file.length}`,
        at,
      )
    }
    blocks.push({
      stamp,
      offset: at,
      size: length,
      data: file.subarray(at + BLOCK_HEAD, at + length),
    })
    at += length
  }
  return { magic, version: u16(data, 6), blocks }
}

/** A block the file must have. */
export function requireBlock(file: G2dFile, stamp: string): G2dBlock {
  const found = file.blocks.find((block) => block.stamp === stamp)
  if (!found) throw new NitroGfxError(`${file.magic} has no '${stamp}' block`)
  return found
}

/**
 * The depth field palettes and characters share, as bits a pixel: 3 is four
 * and 4 is eight — NitroPaint reads it as `1 << (depth - 1)`.
 */
export function bitsOfDepth(depth: number, what: string, at: number): 4 | 8 {
  if (depth === 3) return 4
  if (depth === 4) return 8
  throw new NitroGfxError(`${what}: depth ${depth}, neither 3 (four bits) nor 4 (eight)`, at)
}

/** A DS colour, BGR555, as red, green and blue bytes. Bit 15 is not part of it. */
export function rgbOfColour(colour: number): [number, number, number] {
  return [
    Math.round(((colour & 31) * 255) / 31),
    Math.round((((colour >> 5) & 31) * 255) / 31),
    Math.round((((colour >> 10) & 31) * 255) / 31),
  ]
}
