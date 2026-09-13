import { GameFormatError } from './errors.ts'
import { type DataTable, readDataTable, type TableRecord } from './table.ts'

/**
 * The lower screen's map of an area — the members of
 * `/data/pack_lv5/minimap.gp2`.
 *
 * Two kinds of member go together. A `.obg` is a picture; a `.bmmp` says which
 * picture a map is shown on, and where the map's ground falls on it.
 * Established by observation; the evidence is in `FORMAT.md`, "The mini-map".
 *
 * A `.obg`:
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `u8` | width, in 8×8 tiles |
 * | `+0x01` | `u8` | height, in tiles |
 * | `+0x02` | `u8` | `unknown_0x02` — 0 on all 268 |
 * | `+0x03` | `u8` | `unknown_0x03` — eleven values, 137 and 247 commonest |
 * | `+0x04` | `u16` | tile count |
 * | `+0x06` | `u16` | `unknown_0x06` — 0 on all 268 |
 * | `+0x08` | `u16` × 16 | the colours, BGR555 |
 * | `+0x28` | 32 bytes × count | the tiles, four bits a pixel |
 * | then | `u16` × width × height | which tile fills each cell, row by row |
 *
 * All 268 are exactly that long.
 */

/** The head before the colours. */
const PICTURE_HEAD = 8
/** One palette of sixteen. */
export const MINIMAP_COLOURS = 16
/** An 8×8 tile at four bits a pixel. */
const TILE_BYTES = 32
/** Where the tiles start: past the head and the colours. */
const TILES_AT = PICTURE_HEAD + MINIMAP_COLOURS * 2

export interface MinimapPicture {
  /** Width in 8×8 tiles. */
  readonly width: number
  /** Height in 8×8 tiles. */
  readonly height: number
  readonly unknown_0x02: number
  readonly unknown_0x03: number
  readonly unknown_0x06: number
  /** The sixteen colours as stored, BGR555. */
  readonly colours: Uint16Array
  /** The tiles, 32 bytes each: eight rows of four bytes, the low nibble the left pixel. */
  readonly tiles: Uint8Array
  /** Which tile fills each cell, row by row. */
  readonly cells: Uint16Array
}

function pictureLength(width: number, height: number, count: number): number {
  return TILES_AT + count * TILE_BYTES + width * height * 2
}

/** Whether these bytes are as long as a picture of their own head's size would be. */
export function isMinimapPicture(data: Uint8Array): boolean {
  if (data.length < TILES_AT) return false
  const width = data[0] as number
  const height = data[1] as number
  const count = (data[4] as number) | ((data[5] as number) << 8)
  return width > 0 && height > 0 && pictureLength(width, height, count) === data.length
}

export function readMinimapPicture(data: Uint8Array): MinimapPicture {
  if (data.length < TILES_AT) {
    throw new GameFormatError(
      `mini-map picture is ${data.length} bytes, shorter than its head and colours`,
    )
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const width = data[0] as number
  const height = data[1] as number
  if (width === 0 || height === 0) {
    throw new GameFormatError(`mini-map picture is ${width}×${height} tiles`, 0)
  }
  const count = view.getUint16(4, true)
  const wanted = pictureLength(width, height, count)
  if (wanted !== data.length) {
    throw new GameFormatError(
      `mini-map picture of ${width}×${height} cells and ${count} tiles wants ${wanted} bytes, not ${data.length}`,
      4,
    )
  }
  const colours = new Uint16Array(MINIMAP_COLOURS)
  for (let i = 0; i < MINIMAP_COLOURS; i++) colours[i] = view.getUint16(PICTURE_HEAD + i * 2, true)
  const cellsAt = TILES_AT + count * TILE_BYTES
  const cells = new Uint16Array(width * height)
  for (let i = 0; i < cells.length; i++) {
    const cell = view.getUint16(cellsAt + i * 2, true)
    // No cell on the cartridge sets a bit above the tile number, so there is no
    // flip or palette bit to honour; one that did would not be this format.
    if (cell >= count) {
      throw new GameFormatError(
        `mini-map cell ${i} names tile ${cell} of ${count}`,
        cellsAt + i * 2,
      )
    }
    cells[i] = cell
  }
  return {
    width,
    height,
    unknown_0x02: data[2] as number,
    unknown_0x03: data[3] as number,
    unknown_0x06: view.getUint16(6, true),
    colours,
    tiles: data.subarray(TILES_AT, cellsAt),
    cells,
  }
}

/**
 * A picture as RGBA, eight pixels a tile each way.
 *
 * Colour 0 is left clear. INFERRED: it is the DS's rule for a sixteen-colour
 * background, and on the cartridge colour 0 lies only outside the pictures'
 * torn paper edge — 5,735 pixels of the village's, none of the field's, whose
 * paper fills its rectangle.
 */
export function minimapPixels(picture: MinimapPicture): Uint8Array {
  const wide = picture.width * 8
  const out = new Uint8Array(wide * picture.height * 8 * 4)
  const rgb = [...picture.colours].map((c) => [
    Math.round(((c & 31) * 255) / 31),
    Math.round((((c >> 5) & 31) * 255) / 31),
    Math.round((((c >> 10) & 31) * 255) / 31),
  ])
  for (let ty = 0; ty < picture.height; ty++) {
    for (let tx = 0; tx < picture.width; tx++) {
      const base = (picture.cells[ty * picture.width + tx] as number) * TILE_BYTES
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const byte = picture.tiles[base + y * 4 + (x >> 1)] as number
          const index = x & 1 ? byte >> 4 : byte & 15
          if (index === 0) continue
          const [r, g, b] = rgb[index] as number[]
          const at = ((ty * 8 + y) * wide + tx * 8 + x) * 4
          out[at] = r as number
          out[at + 1] = g as number
          out[at + 2] = b as number
          out[at + 3] = 255
        }
      }
    }
  }
  return out
}

/**
 * A `.bmmp`: a tagged table — see `table.ts` — saying how one map is shown.
 *
 * | tag | values | meaning |
 * |---|---|---|
 * | `0x64` | 2 numbers | the picture's corner, in tiles from the map's origin |
 * | `0x66` | number, string | `unknown`, 0 on all 279; the picture's name |
 * | `0x69` | number | pixels per unit of the map's own |
 * | `0x6a` | string | the picture behind it, `minimapbg2` … — absent on fields |
 * | `0x6b` | number, one or more records | the maps it is drawn for, by index id |
 * | `0x6c` | 2 numbers, then numbers | a mark: where, and the maps it stands for |
 * | `0x70` | (number, string) pairs | those maps' codes, by id |
 *
 * `0x65`, `0x67`, `0x68` and `0x6d` are carried as `unknown`. The corner and
 * the scale are INFERRED — see {@link minimapPoint}.
 */
export const LAYOUT_CORNER = 0x64
export const LAYOUT_PICTURE = 0x66
export const LAYOUT_SCALE = 0x69
export const LAYOUT_BACKDROP = 0x6a
export const LAYOUT_OWN = 0x6b
export const LAYOUT_MARK = 0x6c
export const LAYOUT_PLACES = 0x70

const READ_TAGS = new Set([
  LAYOUT_CORNER,
  LAYOUT_PICTURE,
  LAYOUT_SCALE,
  LAYOUT_BACKDROP,
  LAYOUT_OWN,
  LAYOUT_MARK,
  LAYOUT_PLACES,
])

/** The kinds a table value can be — see `TableRecord.kinds`. */
const KIND_STRING = 0
const KIND_INTEGER = 1
const KIND_FLOAT = 2

export interface MinimapMark {
  /** Where it stands, in the map's own units — the units a doorway is in. */
  readonly x: number
  readonly z: number
  /** The maps it stands for, by their id in the map index. */
  readonly maps: readonly number[]
}

export interface MinimapLayout {
  /** The `.obg` it is drawn on, without the extension. */
  readonly picture: string
  /** `0x66`'s first value: 0 on all 279. */
  readonly unknown_pictureFirst: number
  /** The picture behind it, where there is one. */
  readonly backdrop: string | undefined
  /** Pixels per unit of the map's own. INFERRED. */
  readonly scale: number
  /** The picture's top-left corner, in tiles from the map's origin. INFERRED. */
  readonly corner: { readonly x: number; readonly y: number }
  /** The maps it is drawn for, by index id. */
  readonly own: readonly number[]
  readonly marks: readonly MinimapMark[]
  /** Map codes by index id, for the ids the marks name. */
  readonly places: ReadonlyMap<number, string>
  /** Every record of a tag not read above, as it stands. */
  readonly unknown: readonly TableRecord[]
}

function numberIn(record: TableRecord, i: number): number {
  const kind = record.kinds[i]
  if (kind === KIND_FLOAT) return record.floats[i] as number
  if (kind === KIND_INTEGER) return (record.values[i] as number) | 0
  throw new GameFormatError(
    `mini-map layout tag 0x${record.tag.toString(16)}: value ${i} is of kind ${kind}, not a number`,
    record.offset,
  )
}

function stringIn(table: DataTable, record: TableRecord, i: number): string {
  const found =
    record.kinds[i] === KIND_STRING ? table.stringAt(record.values[i] as number) : undefined
  if (found === undefined) {
    throw new GameFormatError(
      `mini-map layout tag 0x${record.tag.toString(16)}: value ${i} names no string`,
      record.offset,
    )
  }
  return found
}

function onlyOne(table: DataTable, tag: number, least: number): TableRecord {
  const found = table.withTag(tag)
  if (found.length !== 1) {
    throw new GameFormatError(
      `mini-map layout has ${found.length} records of tag 0x${tag.toString(16)}, not one`,
    )
  }
  const record = found[0] as TableRecord
  if (record.values.length < least) {
    throw new GameFormatError(
      `mini-map layout tag 0x${tag.toString(16)} has ${record.values.length} values, not ${least}`,
      record.offset,
    )
  }
  return record
}

export function readMinimapLayout(data: Uint8Array): MinimapLayout {
  const table = readDataTable(data)
  const picture = onlyOne(table, LAYOUT_PICTURE, 2)
  const scale = numberIn(onlyOne(table, LAYOUT_SCALE, 1), 0)
  if (!(scale > 0)) throw new GameFormatError(`mini-map layout scale is ${scale}`)
  const corner = onlyOne(table, LAYOUT_CORNER, 2)
  const backdrop = table.withTag(LAYOUT_BACKDROP)[0]
  const places = new Map<number, string>()
  for (const record of table.withTag(LAYOUT_PLACES)) {
    for (let i = 0; i + 1 < record.values.length; i += 2) {
      places.set(numberIn(record, i), stringIn(table, record, i + 1))
    }
  }
  return {
    picture: stringIn(table, picture, 1),
    unknown_pictureFirst: numberIn(picture, 0),
    backdrop: backdrop ? stringIn(table, backdrop, 0) : undefined,
    scale,
    corner: { x: numberIn(corner, 0), y: numberIn(corner, 1) },
    own: table.withTag(LAYOUT_OWN).map((record) => numberIn(record, 0)),
    marks: table.withTag(LAYOUT_MARK).map((record) => {
      if (record.values.length < 2) {
        throw new GameFormatError(`mini-map mark has ${record.values.length} values`, record.offset)
      }
      const maps: number[] = []
      for (let i = 2; i < record.values.length; i++) maps.push(numberIn(record, i))
      return { x: numberIn(record, 0), z: numberIn(record, 1), maps }
    }),
    places,
    unknown: table.records.filter((record) => !READ_TAGS.has(record.tag)),
  }
}

/**
 * Where a point of the map — in its own units — falls on its picture, in pixels
 * from the top-left: its position times the scale, less the corner's.
 *
 * INFERRED from where the marks fall: drawn this way, the village's eight house
 * marks land on its eight houses and the road's on the road out, the field's on
 * the village and the pass, the pass's on its two ends. The units are the
 * map's own, as a doorway's are: each of the village's marks is within four
 * units of its doorway to the same map, eight of the nine within three.
 */
export function minimapPoint(
  layout: MinimapLayout,
  x: number,
  z: number,
): { x: number; y: number } {
  return { x: x * layout.scale - layout.corner.x * 8, y: z * layout.scale - layout.corner.y * 8 }
}
