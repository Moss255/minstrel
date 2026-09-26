import { COLLISION_KIND } from '../src/collision.ts'
import { glyphStride } from '../src/font.ts'

/**
 * Builds valid bitmap fonts in memory.
 *
 * Fixtures may not contain cartridge bytes, so the layout is implemented here
 * from the description in `FORMAT.md`, independently of the reader.
 */

export interface FixtureGlyph {
  code: number
  /** Rows of a picture; any character other than the `off` one is ink. */
  rows?: string[]
}

export interface FontFixtureOptions {
  lineHeight?: number
  width?: number
  height?: number
  /** Extra padding between the character map and the glyphs. */
  mapPadding?: number
  /** Extra bytes after the glyphs, as real fonts carry. */
  trailingPadding?: number
}

export function buildFont(glyphs: FixtureGlyph[], options: FontFixtureOptions = {}): Uint8Array {
  const width = options.width ?? 8
  const height = options.height ?? 8
  const lineHeight = options.lineHeight ?? height
  const stride = glyphStride(width, height)

  const mapOffset = 16
  const glyphOffset = mapOffset + glyphs.length * 2 + (options.mapPadding ?? 0)
  const total = glyphOffset + glyphs.length * stride + (options.trailingPadding ?? 0)

  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  out[0] = lineHeight
  out[1] = 0
  out[2] = width
  out[3] = height
  out[4] = width
  out[5] = 0
  view.setUint16(6, glyphs.length, true)
  view.setUint32(8, mapOffset, true)
  view.setUint32(12, glyphOffset, true)

  glyphs.forEach((glyph, i) => {
    // Codepoints are big-endian.
    out[mapOffset + i * 2] = (glyph.code >>> 8) & 0xff
    out[mapOffset + i * 2 + 1] = glyph.code & 0xff

    if (!glyph.rows) return
    const base = glyphOffset + i * stride
    let bit = 0
    for (let y = 0; y < height; y++) {
      const row = glyph.rows[y] ?? ''
      for (let x = 0; x < width; x++) {
        const on = row[x] !== undefined && row[x] !== '.' && row[x] !== ' '
        if (on) out[base + (bit >> 3)] = (out[base + (bit >> 3)] as number) | (0x80 >> (bit & 7))
        bit++
      }
    }
  })

  return out
}

/** A recognisable 8x8 letter, for asserting the bit order comes out right. */
export const LETTER_L = [
  '#.......',
  '#.......',
  '#.......',
  '#.......',
  '#.......',
  '#.......',
  '######..',
  '........',
]

export interface TriangleSpec {
  readonly points: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ]
  readonly normal: readonly [number, number, number]
  readonly attributes: number
}

/**
 * Build a `.col2` from a triangle list and a per-cell index.
 *
 * Everything is assembled here from the format's own rules, so the fixture is
 * synthetic — no cartridge bytes. The two arrays that describe the grid are
 * padded to a word, as the real files pad them, because the parser has to find
 * the end of the cell list by the tiling rather than by their length.
 */
export function buildCollision(
  triangles: readonly TriangleSpec[],
  perCell: readonly (readonly number[])[],
  options: { kind?: number; cellSize?: number; gridX?: number; gridZ?: number } = {},
): Uint8Array {
  const bytes: number[] = []
  const u8 = (v: number) => bytes.push(v & 0xff)
  const u16 = (v: number) => bytes.push(v & 0xff, (v >>> 8) & 0xff)
  const u32 = (v: number) =>
    bytes.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  const pad = () => {
    while (bytes.length % 4 !== 0) u8(0)
  }

  const points = triangles.flatMap((t) => t.points)
  const axis = (k: number) => points.map((p) => p[k] as number)
  const box = points.length
    ? [
        Math.min(...axis(0)),
        Math.min(...axis(1)),
        Math.min(...axis(2)),
        Math.max(...axis(0)),
        Math.max(...axis(1)),
        Math.max(...axis(2)),
      ]
    : [0, 0, 0, 0, 0, 0]

  u32(options.kind ?? COLLISION_KIND)
  u32(0)
  for (const v of box) u16(v)
  u32(triangles.length)
  u16(options.cellSize ?? 4096)
  u16(0)
  u32(options.gridX ?? perCell.length)
  u32(options.gridZ ?? 1)
  const offsets = bytes.length
  for (let i = 0; i < 4; i++) u32(0)
  u32(perCell.length ? 1 : 0)
  u32(0)

  const patch = (slot: number, value: number) => {
    for (let k = 0; k < 4; k++) bytes[offsets + slot * 4 + k] = (value >>> (k * 8)) & 0xff
  }

  patch(0, bytes.length)
  for (const t of triangles) {
    for (const p of t.points) for (const c of p) u16(c)
    for (const c of t.normal) u16(Math.round(c * 4096))
    u32(t.attributes)
  }

  patch(1, bytes.length)
  for (const cell of perCell) u8(cell.length)
  pad()

  patch(2, bytes.length)
  let start = 0
  for (const cell of perCell) {
    u16(start)
    start += cell.length
  }
  pad()

  patch(3, bytes.length)
  for (const cell of perCell) for (const index of cell) u16(index)
  pad()

  // One trailing record, so the index list has a bound.
  const trailingAt = bytes.length
  for (let i = 0; i < 8; i++) u8(i)
  for (let k = 0; k < 4; k++) bytes[offsets + 5 * 4 + k] = (trailingAt >>> (k * 8)) & 0xff

  return Uint8Array.from(bytes)
}

/**
 * Build a `.bmdj`: a tagged record stream then a string table.
 *
 * The resource records address their names by **byte offset** into the string
 * section, which is the detail the reader exists to get right — an ordinal
 * would work on the first name and drift on every one after it.
 */
export function buildManifest(
  names: readonly string[],
  options: {
    declared?: number
    /** One per name: where the map puts it, and what it hangs off. */
    places?: readonly {
      at?: [number, number, number]
      slot: number
      parent?: number
      /** The resource this places, by index. Defaults to the slot. */
      names?: number
    }[]
  } = {},
): Uint8Array {
  const strings: number[] = []
  const offsets: number[] = []
  for (const name of names) {
    offsets.push(strings.length)
    for (const ch of name) strings.push(ch.charCodeAt(0))
    strings.push(0)
  }

  const records: number[] = []
  const u16 = (v: number) => records.push(v & 0xff, (v >>> 8) & 0xff)
  const u32 = (v: number) =>
    records.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  const record = (tag: number, type: number, values: readonly number[]) => {
    u16(tag)
    // Tag, count, then two bits of type per value, padded to a word: a record
    // of five or more values has an eight-byte head, not four.
    const typeBytes = Math.max(1, Math.ceil(values.length / 4))
    const header = Math.ceil((3 + typeBytes) / 4) * 4
    records.push(values.length, type)
    for (let i = 4; i < header; i++) records.push(0)
    for (const v of values) u32(v)
  }

  record(0x6a, 1, [options.declared ?? names.length])
  names.forEach((_, i) => {
    record(0x6c, 81, [i, offsets[i] as number, 0, 0])
  })
  if (options.places) {
    const asWord = (value: number) => {
      const buffer = new ArrayBuffer(4)
      new DataView(buffer).setFloat32(0, value, true)
      return new DataView(buffer).getUint32(0, true)
    }
    for (const place of options.places) {
      const [x, y, z] = place.at ?? [0, 0, 0]
      // The real layout, now that the record's header is counted properly: the
      // slot leads, the translation is at 2 to 4 and the parent at 5. What used
      // to look like a leading value was the record's second type byte.
      record(0x6f, 165, [
        place.slot,
        place.names ?? place.slot,
        asWord(x),
        asWord(y),
        asWord(z),
        place.parent ?? 0xffffffff,
        0,
        asWord(1),
        asWord(1),
        asWord(1),
        0,
        0,
        0,
        0,
      ])
    }
  }
  record(0x6e, 0xff, [])

  const header: number[] = []
  const h32 = (v: number) =>
    header.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  h32(0)
  h32(16 + records.length)
  h32(strings.length)
  h32(names.length)
  return Uint8Array.from([...header, ...records, ...strings])
}

/**
 * Build a tagged table. Fixtures may not contain cartridge bytes, so the layout
 * is implemented here from the description in `FORMAT.md`.
 */
export interface FixtureRecord {
  tag: number
  type?: number
  values?: number[]
  floats?: number[]
  /** Emit a word of 0xFF fill before this record. */
  padBefore?: boolean
}

export function buildTable(records: FixtureRecord[], strings: string[] = []): Uint8Array {
  const body: number[] = []
  const push32 = (v: number) =>
    body.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)

  for (const record of records) {
    if (record.padBefore) body.push(0xff, 0xff, 0xff, 0xff)
    const values = record.values ?? []
    const floats = record.floats ?? []
    const count = values.length + floats.length
    // Tag, count, then two bits of type per value, padded to a word. A record
    // of five or more values therefore has an eight-byte head, not four.
    const typeBytes = Math.max(1, Math.ceil(count / 4))
    const header = Math.ceil((3 + typeBytes) / 4) * 4
    body.push(record.tag & 0xff, (record.tag >>> 8) & 0xff, count, record.type ?? 0)
    for (let i = 4; i < header; i++) body.push(0)
    for (const v of values) push32(v)
    for (const f of floats) {
      const buf = new DataView(new ArrayBuffer(4))
      buf.setFloat32(0, f, true)
      push32(buf.getUint32(0, true))
    }
  }

  const stringBytes: number[] = []
  for (const s of strings) {
    for (let i = 0; i < s.length; i++) stringBytes.push(s.charCodeAt(i) & 0xff)
    stringBytes.push(0)
  }

  const stringOffset = 16 + body.length
  const out = new Uint8Array(stringOffset + stringBytes.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, 0, true)
  view.setUint32(4, stringOffset, true)
  view.setUint32(8, stringBytes.length, true)
  view.setUint32(12, strings.length, true)
  out.set(Uint8Array.from(body), 16)
  out.set(Uint8Array.from(stringBytes), stringOffset)
  return out
}
