import { describe, expect, it } from 'vitest'
import { NitroGfxError } from '../src/errors.ts'
import { drawCell, readNcer } from '../src/ncer.ts'
import { readNcgr } from '../src/ncgr.ts'
import { readNclr } from '../src/nclr.ts'

/**
 * 2D files built in code from the layouts in FORMAT.md, "2D graphics" — never
 * from a cartridge: a sixteen-byte header, then blocks one after another.
 */
const le16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff]
const le32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))

function g2d(magic: string, blocks: { stamp: string; content: number[] }[]): Uint8Array {
  const body: number[] = []
  for (const block of blocks)
    body.push(...ascii(block.stamp), ...le32(8 + block.content.length), ...block.content)
  const size = 16 + body.length
  return Uint8Array.from([
    ...ascii(magic),
    ...le16(0xfeff),
    ...le16(0x0100),
    ...le32(size),
    ...le16(16),
    ...le16(blocks.length),
    ...body,
  ])
}

/** Palettes of sixteen BGR555 colours; with `slots`, a PMCP placing them. */
function nclr(
  palettes: number[][],
  options: { slots?: number[]; sizeField?: number } = {},
): Uint8Array {
  const colours = palettes.flatMap((p) =>
    Array.from({ length: 16 }, (_, i) => le16(p[i] ?? 0)).flat(),
  )
  const pltt = [
    ...le32(3),
    ...le32(0),
    ...le32(options.sizeField ?? colours.length),
    ...le32(0x10),
    ...colours,
  ]
  const blocks = [{ stamp: 'TTLP', content: pltt }]
  if (options.slots) {
    blocks.push({
      stamp: 'PMCP',
      content: [
        ...le16(options.slots.length),
        ...le16(0xbeef),
        ...le32(8),
        ...options.slots.flatMap(le16),
      ],
    })
  }
  return g2d('RLCN', blocks)
}

/** Tiles given as 64 colour indices each, packed four bits a pixel, low nibble left. */
function ncgr(tiles: number[][], mapping = 0x10): Uint8Array {
  const packed: number[] = []
  for (const tile of tiles)
    for (let i = 0; i < 64; i += 2) packed.push(((tile[i + 1] ?? 0) << 4) | (tile[i] ?? 0))
  const content = [
    ...le16(0xffff),
    ...le16(0xffff),
    ...le32(3),
    ...le32(mapping),
    ...le32(0),
    ...le32(packed.length),
    ...le32(0x18),
    ...packed,
  ]
  return g2d('RGCN', [{ stamp: 'RAHC', content }])
}

/** Cells of OAM attribute triples, without bounding boxes. */
function ncer(cells: [number, number, number][][], mapping = 0): Uint8Array {
  const table: number[] = []
  const parts: number[] = []
  for (const cell of cells) {
    table.push(...le16(cell.length), ...le16(0), ...le32(parts.length))
    for (const [a0, a1, a2] of cell) parts.push(...le16(a0), ...le16(a1), ...le16(a2))
  }
  const content = [
    ...le16(cells.length),
    ...le16(0),
    ...le32(0x18),
    ...le32(mapping),
    ...le32(0),
    ...le32(0),
    ...le32(0),
    ...table,
    ...parts,
  ]
  return g2d('RECN', [
    { stamp: 'KBEC', content },
    { stamp: 'LBAL', content: [0, 0, 0, 0] },
  ])
}

const fill = (index: number) => new Array<number>(64).fill(index)
/** Red, green, blue and white, BGR555, in colours 1 to 4. */
const PALETTE = [0, 0x001f, 0x03e0, 0x7c00, 0x7fff]

describe('an NCLR', () => {
  it('fills the slots from 0 without a PMCP', () => {
    const read = readNclr(nclr([PALETTE, [0, 0x7fff]]))
    expect([...read.palettes.keys()]).toEqual([0, 1])
    expect(read.palettes.get(0)?.[1]).toBe(0x001f)
    expect(read.bits).toBe(4)
    expect(read.placed).toBe(false)
  })

  it('puts the stored palettes in the slots a PMCP names, whatever the size field says', () => {
    // Sixteen palettes' worth less the two stored, as NitroPaint notes it.
    const read = readNclr(nclr([PALETTE, [0, 0x7fff]], { slots: [3, 8], sizeField: 14 * 32 }))
    expect([...read.palettes.keys()]).toEqual([3, 8])
    expect(read.palettes.get(8)?.[1]).toBe(0x7fff)
    expect(read.sizeField).toBe(448)
    expect(read.unknown_pcmp_0x02).toBe(0xbeef)
  })

  it('refuses a wrong magic, a wrong byte order, a block past the end, and a PMCP past its colours', () => {
    const good = nclr([PALETTE])
    expect(() => readNclr(ncgr([fill(1)]))).toThrow(/not a RLCN/)
    // 0xFEFF is stored FF FE; stored the other way round it reads 0xFFFE.
    const swapped = good.slice()
    swapped[4] = 0xfe
    swapped[5] = 0xff
    expect(() => readNclr(swapped)).toThrow(/byte-order/)
    const long = good.slice()
    long.set(le32(4096), 16 + 4)
    expect(() => readNclr(long)).toThrow(NitroGfxError)
    expect(() => readNclr(nclr([PALETTE], { slots: [0, 1] }))).toThrow(/places 2 palettes/)
  })
})

describe('an NCGR', () => {
  it('reads its tiles, and no size where it gives none', () => {
    const read = readNcgr(ncgr([fill(1), fill(2), fill(3)], 0x200010))
    expect(read.tileCount).toBe(3)
    expect(read.bits).toBe(4)
    expect(read.width).toBeUndefined()
    expect(read.mapping).toBe(0x200010)
    expect(read.characters[32]).toBe(0x22)
  })

  it('refuses characters that run past the block', () => {
    const bytes = ncgr([fill(1)])
    bytes.set(le32(64), 16 + 8 + 0x10)
    expect(() => readNcgr(bytes)).toThrow(NitroGfxError)
  })
})

describe('an NCER', () => {
  it('reads each part: signed place, size, tile, palette and flips', () => {
    // 32×8 at (−16, −4): shape 1, size 1; tile 5, palette 2, flipped across.
    const read = readNcer(ncer([[[0x4000 | 0xfc, 0x4000 | 0x1000 | 0x1f0, 0x2000 | 5]], []], 2))
    const part = read.cells[0]?.parts[0]
    expect(read.cells).toHaveLength(2)
    expect(read.mapping).toBe(2)
    expect(part).toMatchObject({
      x: -16,
      y: -4,
      width: 32,
      height: 8,
      tile: 5,
      palette: 2,
      flipX: true,
      flipY: false,
      affine: false,
    })
    expect(read.other.map((block) => block.stamp)).toEqual(['LBAL'])
  })

  it('refuses a part of the prohibited shape', () => {
    expect(() => readNcer(ncer([[[0xc000, 0, 0]]]))).toThrow(/prohibited/)
  })
})

describe('drawing a cell', () => {
  const chars = readNcgr(
    ncgr([fill(1), fill(2), [0, 3, ...new Array<number>(62).fill(1)], fill(0), fill(4)]),
  )
  const palettes = readNclr(nclr([PALETTE, PALETTE, PALETTE]))
  const at = (image: { width: number; rgba: Uint8Array }, x: number, y: number) => [
    ...image.rgba.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4),
  ]

  it('lays part 0 over part 1, and lets colour 0 show what is behind', () => {
    // Part 0: tile 2 at (0, 0), its first pixel clear. Part 1: tile 1, green, at (4, 0).
    const cell = readNcer(
      ncer([
        [
          [0, 0, 2],
          [0, 4, 1],
        ],
      ]),
    ).cells[0]
    if (!cell) throw new Error('no cell')
    const image = drawCell(cell, 0, chars, palettes)
    expect([image.left, image.top, image.width, image.height]).toEqual([0, 0, 12, 8])
    expect(at(image, 0, 0)).toEqual([0, 0, 0, 0])
    expect(at(image, 1, 0)).toEqual([0, 0, 255, 255])
    expect(at(image, 5, 1)).toEqual([255, 0, 0, 255])
    expect(at(image, 10, 0)).toEqual([0, 255, 0, 255])
  })

  it('mirrors a flipped part', () => {
    const cell = readNcer(ncer([[[0, 0x1000, 2]]])).cells[0]
    if (!cell) throw new Error('no cell')
    const image = drawCell(cell, 0, chars, palettes)
    expect(at(image, 7, 0)).toEqual([0, 0, 0, 0])
    expect(at(image, 6, 0)).toEqual([0, 0, 255, 255])
  })

  it('counts tile numbers in the units of the mapping: in mode 2, four tiles to one', () => {
    const cell = readNcer(ncer([[[0, 0, 1]]], 2)).cells[0]
    if (!cell) throw new Error('no cell')
    expect(at(drawCell(cell, 2, chars, palettes), 0, 0)).toEqual([255, 255, 255, 255])
  })

  it('refuses tiles past the characters, an empty palette slot, and two-dimensional mapping', () => {
    const past = readNcer(ncer([[[0, 0, 9]]])).cells[0]
    const slot = readNcer(ncer([[[0, 0, 0x7000]]])).cells[0]
    if (!past || !slot) throw new Error('no cell')
    expect(() => drawCell(past, 0, chars, palettes)).toThrow(/run past/)
    expect(() => drawCell(slot, 0, chars, palettes)).toThrow(/slot 7/)
    expect(() => drawCell(slot, 4, chars, palettes)).toThrow(/not one-dimensional/)
  })
})
