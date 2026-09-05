import { describe, expect, it } from 'vitest'
import { NitroGfxError } from '../src/errors.ts'
import { readTex0, TextureFormat, texelDataSize } from '../src/nsbtx.ts'

/**
 * Build a TEX0 block. Fixtures may not contain cartridge bytes, so the layout
 * is constructed here from the description in `FORMAT.md`.
 */
interface FixtureTexture {
  name: string
  width: number
  height: number
  format: number
  color0Transparent?: boolean
  texels: number[]
}

function writeDict(items: { name: string; data: number[] }[], itemSize: number): number[] {
  const count = items.length
  const patricia = 4 + 8 + count * 4
  const size = patricia + 4 + count * itemSize + count * 16
  const out: number[] = []
  const u16 = (v: number) => out.push(v & 0xff, (v >>> 8) & 0xff)
  const u32 = (v: number) =>
    out.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  out.push(0, count)
  u16(size)
  u16(8)
  u16(patricia)
  u32(0x0000017f)
  for (let i = 0; i < count; i++) u32(0)
  u16(itemSize)
  u16(4 + count * itemSize)
  for (const item of items) out.push(...item.data)
  for (const item of items) {
    for (let i = 0; i < 16; i++) out.push(i < item.name.length ? item.name.charCodeAt(i) : 0)
  }
  return out
}

function buildTex0(
  textures: FixtureTexture[],
  palettes: { name: string; colours: number[] }[],
): Uint8Array {
  const align8 = (n: number) => (n + 7) & ~7

  // Texel data, each texture 8-byte aligned as the offset field requires.
  const texelBytes: number[] = []
  const texOffsets: number[] = []
  for (const t of textures) {
    while (texelBytes.length % 8 !== 0) texelBytes.push(0)
    texOffsets.push(texelBytes.length)
    texelBytes.push(...t.texels)
  }
  while (texelBytes.length % 8 !== 0) texelBytes.push(0)

  const paletteBytes: number[] = []
  const palOffsets: number[] = []
  for (const p of palettes) {
    while (paletteBytes.length % 8 !== 0) paletteBytes.push(0)
    palOffsets.push(paletteBytes.length)
    for (const c of p.colours) paletteBytes.push(c & 0xff, (c >>> 8) & 0xff)
  }
  while (paletteBytes.length % 8 !== 0) paletteBytes.push(0)

  const texDict = writeDict(
    textures.map((t, i) => {
      const params =
        (((texOffsets[i] as number) >> 3) & 0) |
        (Math.log2(t.width / 8) << 4) |
        (Math.log2(t.height / 8) << 7) |
        (t.format << 10) |
        (t.color0Transparent ? 1 << 13 : 0)
      const off = (texOffsets[i] as number) >> 3
      return {
        name: t.name,
        data: [off & 0xff, (off >>> 8) & 0xff, params & 0xff, (params >>> 8) & 0xff, 0, 0, 0, 0],
      }
    }),
    8,
  )
  const palDict = writeDict(
    palettes.map((p, i) => {
      const off = (palOffsets[i] as number) >> 3
      return { name: p.name, data: [off & 0xff, (off >>> 8) & 0xff, 0, 0] }
    }),
    4,
  )

  const header = 0x3c
  const texDictOffset = header
  const palDictOffset = align8(texDictOffset + texDict.length)
  const texDataOffset = align8(palDictOffset + palDict.length)
  const palDataOffset = align8(texDataOffset + texelBytes.length)
  const total = palDataOffset + paletteBytes.length

  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  out.set([0x54, 0x45, 0x58, 0x30], 0) // 'TEX0'
  view.setUint32(0x04, total, true)
  view.setUint16(0x0c, texelBytes.length >> 3, true)
  view.setUint16(0x0e, texDictOffset, true)
  view.setUint32(0x14, texDataOffset, true)
  view.setUint32(0x30, paletteBytes.length >> 3, true)
  view.setUint32(0x34, palDictOffset, true)
  view.setUint32(0x38, palDataOffset, true)
  out.set(Uint8Array.from(texDict), texDictOffset)
  out.set(Uint8Array.from(palDict), palDictOffset)
  out.set(Uint8Array.from(texelBytes), texDataOffset)
  out.set(Uint8Array.from(paletteBytes), palDataOffset)
  return out
}

/** BGR555 for a colour given in 0..31 components. */
const bgr = (r: number, g: number, b: number) => r | (g << 5) | (b << 10)

describe('texelDataSize', () => {
  it('sizes each format from its bits per texel', () => {
    expect(texelDataSize(TextureFormat.Palette4, 8, 8)).toBe(16)
    expect(texelDataSize(TextureFormat.Palette16, 8, 8)).toBe(32)
    expect(texelDataSize(TextureFormat.Palette256, 8, 8)).toBe(64)
    expect(texelDataSize(TextureFormat.A3I5, 8, 8)).toBe(64)
    expect(texelDataSize(TextureFormat.A5I3, 8, 8)).toBe(64)
    expect(texelDataSize(TextureFormat.Direct, 8, 8)).toBe(128)
  })
})

describe('readTex0', () => {
  const simple = () =>
    buildTex0(
      [
        {
          name: 'grass',
          width: 8,
          height: 8,
          format: TextureFormat.Palette16,
          // Two texels per byte: index 1 then index 2, repeated.
          texels: new Array(32).fill(0x21),
        },
      ],
      [{ name: 'grass_pl', colours: [bgr(0, 0, 0), bgr(31, 0, 0), bgr(0, 31, 0), 0] }],
    )

  it('reads texture dimensions and format from the parameter word', () => {
    const set = readTex0(simple())
    const texture = set.texture('grass')
    expect(texture?.width).toBe(8)
    expect(texture?.height).toBe(8)
    expect(texture?.format).toBe(TextureFormat.Palette16)
    expect(texture?.dataSize).toBe(32)
  })

  it('names palettes separately from textures', () => {
    const set = readTex0(simple())
    expect(set.palettes.map((p) => p.name)).toEqual(['grass_pl'])
    expect(set.palette('grass_pl')?.dataOffset).toBe(0)
  })

  it('decodes 4-bit indices through the palette to RGBA', () => {
    const set = readTex0(simple())
    const texture = set.texture('grass')
    const palette = set.palette('grass_pl')
    if (!texture || !palette) throw new Error('fixture is incomplete')
    const pixels = set.decode(texture, palette)

    expect(pixels).toHaveLength(8 * 8 * 4)
    // Byte 0x21 is index 1 in the low nibble, index 2 in the high one.
    expect(Array.from(pixels.subarray(0, 4))).toEqual([255, 0, 0, 255])
    expect(Array.from(pixels.subarray(4, 8))).toEqual([0, 255, 0, 255])
  })

  it('expands 5-bit colour components so full scale reaches 255', () => {
    const set = readTex0(simple())
    const pixels = set.decode(set.texture('grass') as never, set.palette('grass_pl') as never)
    // 31 must map to 255, not 248.
    expect(pixels[0]).toBe(255)
  })

  it('makes palette entry 0 transparent when the flag is set', () => {
    const data = buildTex0(
      [
        {
          name: 't',
          width: 8,
          height: 8,
          format: TextureFormat.Palette16,
          color0Transparent: true,
          texels: new Array(32).fill(0x10),
        },
      ],
      [{ name: 't_pl', colours: [bgr(31, 31, 31), bgr(31, 0, 0)] }],
    )
    const set = readTex0(data)
    const pixels = set.decode(set.texture('t') as never, set.palette('t_pl') as never)
    // Low nibble is index 0 — transparent; high nibble is index 1 — opaque.
    expect(pixels[3]).toBe(0)
    expect(pixels[7]).toBe(255)
  })

  it('decodes A5I3, splitting each byte into alpha and index', () => {
    const data = buildTex0(
      [
        {
          name: 'a',
          width: 8,
          height: 8,
          format: TextureFormat.A5I3,
          // Alpha 31 (full) with index 1.
          texels: new Array(64).fill((31 << 3) | 1),
        },
      ],
      [{ name: 'a_pl', colours: [0, bgr(0, 0, 31)] }],
    )
    const set = readTex0(data)
    const pixels = set.decode(set.texture('a') as never, set.palette('a_pl') as never)
    expect(Array.from(pixels.subarray(0, 4))).toEqual([0, 0, 255, 255])
  })

  it('decodes direct colour, taking alpha from the top bit', () => {
    const opaque = 0x8000 | bgr(0, 31, 0)
    const texels: number[] = []
    for (let i = 0; i < 64; i++) texels.push(opaque & 0xff, (opaque >>> 8) & 0xff)
    const set = readTex0(
      buildTex0([{ name: 'd', width: 8, height: 8, format: TextureFormat.Direct, texels }], []),
    )
    const pixels = set.decode(set.texture('d') as never)
    expect(Array.from(pixels.subarray(0, 4))).toEqual([0, 255, 0, 255])
  })

  it('rejects a block that is not TEX0', () => {
    expect(() => readTex0(new Uint8Array(64))).toThrow(/not a TEX0/)
  })

  it('rejects texture data outside the block', () => {
    const data = simple()
    new DataView(data.buffer).setUint32(0x14, 0x7fff_0000, true)
    expect(() => readTex0(data)).toThrow(NitroGfxError)
  })
})
