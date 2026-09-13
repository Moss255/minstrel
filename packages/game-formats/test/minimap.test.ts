import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import {
  isMinimapPicture,
  LAYOUT_BACKDROP,
  LAYOUT_CORNER,
  LAYOUT_MARK,
  LAYOUT_OWN,
  LAYOUT_PICTURE,
  LAYOUT_PLACES,
  LAYOUT_SCALE,
  minimapPixels,
  minimapPoint,
  readMinimapLayout,
  readMinimapPicture,
} from '../src/minimap.ts'

/**
 * A picture built from FORMAT.md, not from the cartridge: the head, sixteen
 * colours, the tiles at four bits a pixel, then a tile number a cell.
 */
function picture(
  width: number,
  height: number,
  tiles: number[][],
  cells: number[],
  colours: number[] = [],
): Uint8Array {
  const count = tiles.length
  const out = new Uint8Array(8 + 32 + count * 32 + width * height * 2)
  const view = new DataView(out.buffer)
  out[0] = width
  out[1] = height
  out[3] = 0x89
  view.setUint16(4, count, true)
  for (const [i, c] of colours.entries()) view.setUint16(8 + i * 2, c, true)
  for (const [t, pixels] of tiles.entries()) {
    for (const [p, index] of pixels.entries()) {
      const at = 40 + t * 32 + (p >> 1)
      out[at] = (out[at] as number) | (p & 1 ? index << 4 : index)
    }
  }
  for (const [i, cell] of cells.entries()) view.setUint16(40 + count * 32 + i * 2, cell, true)
  return out
}

/** Colour 1 red, 2 green, 3 blue, BGR555. */
const RGB = [0, 0x001f, 0x03e0, 0x7c00]
/** A tile of colour 1 whose first pixel is clear and whose second is colour 2. */
const MARKED = [0, 2, ...new Array<number>(62).fill(1)]
const BLUE = new Array<number>(64).fill(3)

describe('a mini-map picture', () => {
  it('reads its size, colours, tiles and cells', () => {
    const read = readMinimapPicture(picture(2, 1, [MARKED, BLUE], [1, 0], RGB))
    expect(read.width).toBe(2)
    expect(read.height).toBe(1)
    expect(read.unknown_0x03).toBe(0x89)
    expect([...read.colours.subarray(0, 4)]).toEqual(RGB)
    expect(read.tiles.length).toBe(64)
    expect([...read.cells]).toEqual([1, 0])
  })

  it('draws each cell with its tile, the low nibble on the left and colour 0 clear', () => {
    const pixels = minimapPixels(readMinimapPicture(picture(2, 1, [MARKED, BLUE], [1, 0], RGB)))
    const at = (x: number, y: number) => [
      ...pixels.subarray((y * 16 + x) * 4, (y * 16 + x) * 4 + 4),
    ]
    expect(pixels.length).toBe(16 * 8 * 4)
    expect(at(0, 0)).toEqual([0, 0, 255, 255])
    expect(at(8, 0)).toEqual([0, 0, 0, 0])
    expect(at(9, 0)).toEqual([0, 255, 0, 255])
    expect(at(10, 0)).toEqual([255, 0, 0, 255])
    expect(at(15, 7)).toEqual([255, 0, 0, 255])
  })

  it('is recognised by its length agreeing with its head', () => {
    const bytes = picture(2, 1, [MARKED, BLUE], [1, 0], RGB)
    expect(isMinimapPicture(bytes)).toBe(true)
    expect(isMinimapPicture(bytes.subarray(0, bytes.length - 1))).toBe(false)
    const flat = bytes.slice()
    flat[1] = 0
    expect(isMinimapPicture(flat)).toBe(false)
  })

  it('refuses one too short for its head, one of the wrong length, and a cell past the tiles', () => {
    expect(() => readMinimapPicture(new Uint8Array(20))).toThrow(GameFormatError)
    const bytes = picture(2, 1, [MARKED, BLUE], [1, 0], RGB)
    expect(() => readMinimapPicture(bytes.subarray(0, bytes.length - 2))).toThrow(/wants/)
    expect(() => readMinimapPicture(picture(2, 1, [MARKED, BLUE], [1, 2], RGB))).toThrow(
      /names tile 2 of 2/,
    )
  })
})

type Value = { s: string } | { i: number } | { f: number }

/**
 * A `.bmmp` built from FORMAT.md: a tagged table whose values carry their
 * kinds, two bits each — 0 a string's offset, 1 an integer, 2 a float.
 */
function layout(records: { tag: number; values: Value[] }[]): Uint8Array {
  const strings: string[] = []
  const offsets = new Map<string, number>()
  let size = 0
  for (const { values } of records) {
    for (const v of values) {
      if (!('s' in v) || offsets.has(v.s)) continue
      offsets.set(v.s, size)
      strings.push(v.s)
      size += v.s.length + 1
    }
  }
  const body: number[] = []
  const push32 = (v: number) =>
    body.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  for (const { tag, values } of records) {
    const kindBytes = Math.ceil(values.length / 4)
    const head = [tag & 0xff, tag >>> 8, values.length, ...new Array<number>(kindBytes).fill(0)]
    values.forEach((v, i) => {
      const kind = 's' in v ? 0 : 'i' in v ? 1 : 2
      head[3 + (i >> 2)] = (head[3 + (i >> 2)] as number) | (kind << ((i & 3) * 2))
    })
    while (head.length % 4 !== 0) head.push(0)
    body.push(...head)
    for (const v of values) {
      if ('s' in v) push32(offsets.get(v.s) as number)
      else if ('i' in v) push32(v.i >>> 0)
      else {
        const f = new DataView(new ArrayBuffer(4))
        f.setFloat32(0, v.f, true)
        push32(f.getUint32(0, true))
      }
    }
  }
  const out = new Uint8Array(16 + body.length + size)
  const view = new DataView(out.buffer)
  view.setUint32(4, 16 + body.length, true)
  view.setUint32(8, size, true)
  view.setUint32(12, strings.length, true)
  out.set(body, 16)
  let at = 16 + body.length
  for (const s of strings) {
    for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i)
    at += s.length + 1
  }
  return out
}

const VILLAGE = [
  { tag: LAYOUT_BACKDROP, values: [{ s: 'backdrop' }] },
  { tag: LAYOUT_SCALE, values: [{ f: 3.2 }] },
  { tag: LAYOUT_CORNER, values: [{ i: -18 }, { i: -12 }] },
  { tag: 0x65, values: [{ i: 1 }] },
  { tag: LAYOUT_PICTURE, values: [{ i: 0 }, { s: 'VILLAGE01' }] },
  { tag: LAYOUT_OWN, values: [{ i: 100 }] },
  { tag: LAYOUT_MARK, values: [{ f: -3.25 }, { f: 3.5 }, { i: 101 }] },
  { tag: LAYOUT_MARK, values: [{ f: 0 }, { f: 16 }, { i: 105 }, { i: 109 }] },
  { tag: LAYOUT_PLACES, values: [{ i: 100 }, { s: 'VIL' }, { i: 101 }, { s: 'VILHOUSE' }] },
]

describe('a mini-map layout', () => {
  it('reads the picture, the backdrop, the scale, the corner, its maps and its marks', () => {
    const read = readMinimapLayout(layout(VILLAGE))
    expect(read.picture).toBe('VILLAGE01')
    expect(read.unknown_pictureFirst).toBe(0)
    expect(read.backdrop).toBe('backdrop')
    expect(read.scale).toBeCloseTo(3.2, 5)
    expect(read.corner).toEqual({ x: -18, y: -12 })
    expect(read.own).toEqual([100])
    expect(read.marks).toEqual([
      { x: -3.25, z: 3.5, maps: [101] },
      { x: 0, z: 16, maps: [105, 109] },
    ])
    expect(read.places.get(101)).toBe('VILHOUSE')
    expect(read.unknown.map((r) => r.tag)).toEqual([0x65])
  })

  it('takes a number of either kind, and no backdrop where there is none', () => {
    const read = readMinimapLayout(
      layout([
        { tag: LAYOUT_SCALE, values: [{ i: 2 }] },
        { tag: LAYOUT_CORNER, values: [{ f: -10 }, { f: -13 }] },
        { tag: LAYOUT_PICTURE, values: [{ i: 0 }, { s: 'PASS' }] },
      ]),
    )
    expect(read.scale).toBe(2)
    expect(read.backdrop).toBeUndefined()
    expect(read.marks).toEqual([])
    expect(minimapPoint(read, 0, 0)).toEqual({ x: 80, y: 104 })
    expect(minimapPoint(read, 1.5, -2)).toEqual({ x: 83, y: 100 })
  })

  it('refuses one with no picture, two, or a string where a number belongs', () => {
    const without = VILLAGE.filter((r) => r.tag !== LAYOUT_PICTURE)
    expect(() => readMinimapLayout(layout(without))).toThrow(/0 records of tag 0x66/)
    const twice = [...VILLAGE, { tag: LAYOUT_PICTURE, values: [{ i: 0 }, { s: 'OTHER' }] }]
    expect(() => readMinimapLayout(layout(twice))).toThrow(/2 records of tag 0x66/)
    const worded = VILLAGE.map((r) =>
      r.tag === LAYOUT_SCALE ? { tag: r.tag, values: [{ s: 'big' }] } : r,
    )
    expect(() => readMinimapLayout(layout(worded))).toThrow(/not a number/)
  })
})
