import { u16, u32 } from './bytes.ts'
import { NitroGfxError } from './errors.ts'
import { type G2dBlock, readG2dFile, requireBlock, rgbOfColour } from './g2d.ts'
import type { Ncgr } from './ncgr.ts'
import type { Nclr } from './nclr.ts'

/**
 * NCER — 2D cells: sprites, each made of parts laid out as the DS's OAM lays
 * them. See `FORMAT.md`, "2D graphics".
 *
 * `KBEC` (CEBK) — offsets from the block's content:
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `u16` | cell count |
 * | `+0x02` | `u16` | 1 when each cell carries a bounding box |
 * | `+0x04` | `u32` | where the cells start |
 * | `+0x08` | `u32` | mapping: 0 to 3 one-dimensional, 32K to 256K; 4 two-dimensional |
 * | `+0x0C` | `u32` | where VRAM transfer data starts; 0 for none |
 * | `+0x10` | `u32` | `unknown_0x10` |
 * | `+0x14` | `u32` | where user-extended attributes start; 0 for none |
 *
 * A cell is a `u16` part count, a `u16` attribute, and a `u32` offset to its
 * parts, counted from the end of the cell table; with bounding boxes, then
 * `i16` max x, max y, min x, min y. A part is three `u16` OAM attributes, read
 * as GBATEK describes them.
 */

export const NCER_MAGIC = 'RECN'
const CEBK = 'KBEC'
const PART_SIZE = 6
/** Width and height by shape, then size — GBATEK, "LCD OBJ - OAM Attributes". */
const DIMENSIONS: readonly (readonly (readonly [number, number])[])[] = [
  [
    [8, 8],
    [16, 16],
    [32, 32],
    [64, 64],
  ],
  [
    [16, 8],
    [32, 8],
    [32, 16],
    [64, 32],
  ],
  [
    [8, 16],
    [8, 32],
    [16, 32],
    [32, 64],
  ],
]

export interface CellPart {
  /** Where the part sits from the cell's origin: nine bits of x, eight of y, signed. */
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly shape: number
  readonly size: number
  /** The character name: the first tile, in the mapping's units. */
  readonly tile: number
  readonly priority: number
  /** The palette slot. */
  readonly palette: number
  readonly flipX: boolean
  readonly flipY: boolean
  /** Rotated and scaled by an OAM matrix, which is set at run time, not in the file. */
  readonly affine: boolean
  readonly doubleSize: boolean
  readonly matrix: number
  /** Not displayed. */
  readonly disabled: boolean
  readonly mode: number
  readonly mosaic: boolean
  /** Four bits a pixel, sixteen colours from a slot; or eight, 256 from one. */
  readonly bits: 4 | 8
  /** The three attributes as stored. */
  readonly attributes: readonly [number, number, number]
}

export interface Cell {
  /** The cell's own `u16` attribute, as stored — what it says is not read here. */
  readonly attribute: number
  readonly parts: readonly CellPart[]
  readonly bounds:
    | { readonly maxX: number; readonly maxY: number; readonly minX: number; readonly minY: number }
    | undefined
}

export interface Ncer {
  readonly version: number
  readonly cells: readonly Cell[]
  /** 0 to 3: one-dimensional, tile numbers in units of 32 bytes shifted left by it. 4: two-dimensional. */
  readonly mapping: number
  /** `+0x02` of CEBK, as stored: 1 when cells carry bounding boxes. */
  readonly bankAttributes: number
  readonly vramTransfer: number
  readonly unknown_0x10: number
  readonly userExtended: number
  /** Blocks other than CEBK — labels, extensions — as they stand. */
  readonly other: readonly G2dBlock[]
}

const signed16 = (v: number) => (v << 16) >> 16

function readPart(d: Uint8Array, at: number): CellPart {
  const a0 = u16(d, at, 'OAM attribute 0')
  const a1 = u16(d, at + 2, 'OAM attribute 1')
  const a2 = u16(d, at + 4, 'OAM attribute 2')
  const shape = a0 >> 14
  const size = a1 >> 14
  const dimensions = DIMENSIONS[shape]?.[size]
  if (!dimensions)
    throw new NitroGfxError(`cell part of shape ${shape}, which GBATEK calls prohibited`, at)
  const affine = ((a0 >> 8) & 1) === 1
  const bit9 = ((a0 >> 9) & 1) === 1
  const x = a1 & 0x1ff
  const y = a0 & 0xff
  return {
    x: x >= 256 ? x - 512 : x,
    y: y >= 128 ? y - 256 : y,
    width: dimensions[0],
    height: dimensions[1],
    shape,
    size,
    tile: a2 & 0x3ff,
    priority: (a2 >> 10) & 3,
    palette: a2 >> 12,
    flipX: !affine && ((a1 >> 12) & 1) === 1,
    flipY: !affine && ((a1 >> 13) & 1) === 1,
    affine,
    doubleSize: affine && bit9,
    matrix: affine ? (a1 >> 9) & 31 : 0,
    disabled: !affine && bit9,
    mode: (a0 >> 10) & 3,
    mosaic: ((a0 >> 12) & 1) === 1,
    bits: ((a0 >> 13) & 1) === 1 ? 8 : 4,
    attributes: [a0, a1, a2],
  }
}

export function readNcer(data: Uint8Array): Ncer {
  const file = readG2dFile(data, NCER_MAGIC)
  const bank = requireBlock(file, CEBK)
  const d = bank.data
  const count = u16(d, 0, 'CEBK.count')
  const bankAttributes = u16(d, 2, 'CEBK.attributes')
  const cellsAt = u32(d, 4, 'CEBK.cellOffset')
  const entry = bankAttributes === 1 ? 16 : 8
  const partsAt = cellsAt + count * entry
  const cells: Cell[] = []
  for (let i = 0; i < count; i++) {
    const at = cellsAt + i * entry
    const parts = u16(d, at, `cell ${i}.parts`)
    const first = u32(d, at + 4, `cell ${i}.offset`)
    const read: CellPart[] = []
    for (let p = 0; p < parts; p++) read.push(readPart(d, partsAt + first + p * PART_SIZE))
    cells.push({
      attribute: u16(d, at + 2, `cell ${i}.attribute`),
      parts: read,
      bounds:
        entry === 16
          ? {
              maxX: signed16(u16(d, at + 8, 'bounds')),
              maxY: signed16(u16(d, at + 10, 'bounds')),
              minX: signed16(u16(d, at + 12, 'bounds')),
              minY: signed16(u16(d, at + 14, 'bounds')),
            }
          : undefined,
    })
  }
  return {
    version: file.version,
    cells,
    mapping: u32(d, 8, 'CEBK.mapping'),
    bankAttributes,
    vramTransfer: u32(d, 12, 'CEBK.vramTransfer'),
    unknown_0x10: u32(d, 16, 'CEBK.unknown_0x10'),
    userExtended: u32(d, 20, 'CEBK.userExtended'),
    other: file.blocks.filter((block) => block.stamp !== CEBK),
  }
}

/** A cell drawn: RGBA, its top-left corner `left, top` from the cell's origin. */
export interface CellImage {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
  readonly rgba: Uint8Array
}

/**
 * A cell's parts drawn together, as the DS would lay them over one another:
 * part 0 in front — GBATEK, "OBJ0 is always having priority above OBJ1-127" —
 * and colour 0 clear — "Color 0 of all BG and OBJ palettes is transparent".
 * Tiles are one-dimensional: a part's tiles follow one another from its first,
 * row by row, and its first is its character name times 32 bytes shifted left
 * by the mapping.
 *
 * Not drawn as the DS would: an affine part is drawn without its rotation,
 * whose matrix is set at run time, and without its double-size area; a disabled
 * part is left out; priority against the backgrounds, modes and mosaic are not
 * applied. Two-dimensional mapping and 256-colour parts are refused.
 */
export function drawCell(cell: Cell, mapping: number, characters: Ncgr, palettes: Nclr): CellImage {
  if (mapping > 3) {
    throw new NitroGfxError(`cell mapping ${mapping} is not one-dimensional; 0 to 3 are drawn`)
  }
  const shown = cell.parts.filter((part) => !part.disabled)
  if (shown.length === 0) return { left: 0, top: 0, width: 0, height: 0, rgba: new Uint8Array(0) }
  const left = Math.min(...shown.map((part) => part.x))
  const top = Math.min(...shown.map((part) => part.y))
  const width = Math.max(...shown.map((part) => part.x + part.width)) - left
  const height = Math.max(...shown.map((part) => part.y + part.height)) - top
  const rgba = new Uint8Array(width * height * 4)
  const unit = 32 << mapping
  const chars = characters.characters
  // The last part first, so that each one before it is drawn over it.
  for (let k = shown.length - 1; k >= 0; k--) {
    const part = shown[k] as CellPart
    if (part.bits !== 4 || characters.bits !== 4) {
      throw new NitroGfxError('a cell part of 256 colours is not drawn')
    }
    const colours = palettes.palettes.get(part.palette)
    if (!colours)
      throw new NitroGfxError(`a cell part names palette slot ${part.palette}, which holds none`)
    const across = part.width / 8
    const first = part.tile * unit
    if (first + across * (part.height / 8) * 32 > chars.length) {
      throw new NitroGfxError(
        `a cell part's tiles, from 0x${first.toString(16)}, run past ${chars.length} bytes of characters`,
      )
    }
    for (let py = 0; py < part.height; py++) {
      for (let px = 0; px < part.width; px++) {
        const tile = (py >> 3) * across + (px >> 3)
        const byte = chars[first + tile * 32 + (py & 7) * 4 + ((px & 7) >> 1)] as number
        const index = px & 1 ? byte >> 4 : byte & 15
        if (index === 0) continue
        const dx = part.flipX ? part.width - 1 - px : px
        const dy = part.flipY ? part.height - 1 - py : py
        const at = ((part.y + dy - top) * width + (part.x + dx - left)) * 4
        const [r, g, b] = rgbOfColour(colours[index] as number)
        rgba[at] = r
        rgba[at + 1] = g
        rgba[at + 2] = b
        rgba[at + 3] = 255
      }
    }
  }
  return { left, top, width, height, rgba }
}
