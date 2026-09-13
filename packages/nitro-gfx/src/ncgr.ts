import { checkRange, u16, u32 } from './bytes.ts'
import { NitroGfxError } from './errors.ts'
import { bitsOfDepth, type G2dBlock, readG2dFile, requireBlock } from './g2d.ts'

/**
 * NCGR — 2D character data, the tiles a cell or a screen is built from. See
 * `FORMAT.md`, "2D graphics".
 *
 * `RAHC` (CHAR) — offsets from the block's content:
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `u16` | height in tiles; `0xFFFF` for none |
 * | `+0x02` | `u16` | width in tiles; `0xFFFF` for none |
 * | `+0x04` | `u32` | depth: 3 for four bits a pixel, 4 for eight |
 * | `+0x08` | `u32` | `mapping`: the SDK's OBJ VRAM mode, as NitroPaint keeps it |
 * | `+0x0C` | `u32` | `type`: 1 for bitmap data, as NitroPaint reads it |
 * | `+0x10` | `u32` | the character data's size |
 * | `+0x14` | `u32` | where it starts |
 *
 * A tile is 8×8: at four bits, eight rows of four bytes, the low nibble the
 * left pixel; at eight, a byte a pixel.
 */

export const NCGR_MAGIC = 'RGCN'
const CHAR = 'RAHC'
const NO_SIZE = 0xffff

export interface Ncgr {
  readonly version: number
  readonly bits: 4 | 8
  /** Width in tiles; undefined where the file gives none, as sprites' do. */
  readonly width: number | undefined
  /** Height in tiles; undefined where the file gives none. */
  readonly height: number | undefined
  /**
   * `+0x08` of CHAR, as stored: the OBJ VRAM mode — `0x10` beside cells of
   * mapping 0 and `0x200010` beside mapping 2, on every pairing seen.
   */
  readonly mapping: number
  /** `+0x0C` of CHAR, as stored: 1 marks bitmap data rather than tiles. */
  readonly type: number
  /** The character data: 8×8 tiles, 32 bytes each at four bits, 64 at eight. */
  readonly characters: Uint8Array
  readonly tileCount: number
  /** Blocks other than CHAR, as they stand. */
  readonly other: readonly G2dBlock[]
}

export function readNcgr(data: Uint8Array): Ncgr {
  const file = readG2dFile(data, NCGR_MAGIC)
  const char = requireBlock(file, CHAR)
  const d = char.data
  const height = u16(d, 0, 'CHAR.height')
  const width = u16(d, 2, 'CHAR.width')
  const bits = bitsOfDepth(u32(d, 4, 'CHAR.depth'), 'NCGR', char.offset + 8)
  const size = u32(d, 16, 'CHAR.size')
  const start = u32(d, 20, 'CHAR.dataOffset')
  checkRange(d, start, size, 'CHAR data')
  const tileBytes = bits * 8
  if (size % tileBytes !== 0) {
    throw new NitroGfxError(
      `NCGR: ${size} bytes of characters is no whole number of tiles`,
      char.offset,
    )
  }
  return {
    version: file.version,
    bits,
    width: width === NO_SIZE ? undefined : width,
    height: height === NO_SIZE ? undefined : height,
    mapping: u32(d, 8, 'CHAR.mapping'),
    type: u32(d, 12, 'CHAR.type'),
    characters: d.subarray(start, start + size),
    tileCount: size / tileBytes,
    other: file.blocks.filter((block) => block.stamp !== CHAR),
  }
}
