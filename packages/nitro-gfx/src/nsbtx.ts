import { checkRange, resourceName, u16, u32 } from './bytes.ts'
import { readDict } from './dict.ts'
import { NitroGfxError } from './errors.ts'

/**
 * NSBTX — the Nitro texture container, stamp `BTX0`, and the `TEX0` block that
 * also appears inside some NSBMD files.
 *
 * References: the Nintendo DS file formats wiki (NSBTX), and GBATEK's
 * "DS 3D Texture Formats" and `TEXIMAGE_PARAM` for the pixel formats.
 *
 * `TEX0` layout, confirmed by arithmetic — each section's declared offset and
 * size lands exactly on the start of the next, and the last on the end of the
 * block:
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `char[4]` | `TEX0` |
 * | `+0x04` | `u32` | section size |
 * | `+0x0C` | `u16` | texture data size, in 8-byte units |
 * | `+0x0E` | `u16` | offset of the texture dictionary |
 * | `+0x14` | `u32` | offset of the texture data |
 * | `+0x1C` | `u16` | 4x4-compressed data size, in 8-byte units |
 * | `+0x24` | `u32` | offset of the 4x4-compressed texel data |
 * | `+0x28` | `u32` | offset of the 4x4-compressed block-palette indices |
 * | `+0x30` | `u32` | palette data size, in 8-byte units |
 * | `+0x34` | `u32` | offset of the palette dictionary |
 * | `+0x38` | `u32` | offset of the palette data |
 */

export const NSBTX_MAGIC = 'BTX0'

/** DS texture formats, as `TEXIMAGE_PARAM` numbers them. */
export const TextureFormat = {
  None: 0,
  /** 8 bits: a 5-bit palette index and 3 bits of alpha. */
  A3I5: 1,
  /** 2 bits per texel. */
  Palette4: 2,
  /** 4 bits per texel. */
  Palette16: 3,
  /** 8 bits per texel. */
  Palette256: 4,
  /** 4x4 texel blocks with per-block palettes. */
  Compressed4x4: 5,
  /** 8 bits: a 3-bit palette index and 5 bits of alpha. */
  A5I3: 6,
  /** 16 bits of direct colour. */
  Direct: 7,
} as const

export const TEXTURE_FORMAT_NAMES: readonly string[] = [
  'none',
  'A3I5',
  'palette4',
  'palette16',
  'palette256',
  'compressed4x4',
  'A5I3',
  'direct',
]

export interface TextureInfo {
  readonly name: string
  readonly index: number
  readonly width: number
  readonly height: number
  readonly format: number
  /** True when palette entry 0 is transparent rather than a colour. */
  readonly color0Transparent: boolean
  /** Offset of the texel data within the texture data region. */
  readonly dataOffset: number
  /** Bytes of texel data, from the format and dimensions. */
  readonly dataSize: number
  /** Raw parameter word, for bits this package does not interpret. */
  readonly params: number
}

export interface PaletteInfo {
  readonly name: string
  readonly index: number
  /** Offset within the palette data region. */
  readonly dataOffset: number
  /** Bytes available before the next palette, or the end of the region. */
  readonly dataSize: number
}

export interface TextureSet {
  readonly textures: readonly TextureInfo[]
  readonly palettes: readonly PaletteInfo[]
  texture(name: string): TextureInfo | undefined
  palette(name: string): PaletteInfo | undefined
  /** Raw texel bytes for one texture. */
  texels(texture: TextureInfo): Uint8Array
  /** Raw palette bytes, 16-bit BGR555 entries. */
  paletteBytes(palette: PaletteInfo): Uint8Array
  /**
   * Decode to straight RGBA, four bytes per pixel.
   *
   * A texture and its palette are separate resources; by convention a
   * texture's palette carries the same name with `_pl` appended, but nothing
   * enforces that, so the caller passes the one it wants.
   */
  decode(texture: TextureInfo, palette?: PaletteInfo): Uint8Array
}

/** Bytes of texel data a format needs for the given dimensions. */
export function texelDataSize(format: number, width: number, height: number): number {
  const texels = width * height
  switch (format) {
    case TextureFormat.Palette4:
      return texels >> 2
    case TextureFormat.Palette16:
      return texels >> 1
    case TextureFormat.A3I5:
    case TextureFormat.Palette256:
    case TextureFormat.A5I3:
      return texels
    case TextureFormat.Direct:
      return texels * 2
    case TextureFormat.Compressed4x4:
      // Four texels per byte, plus a 16-bit index per 4x4 block held elsewhere.
      return texels >> 2
    default:
      return 0
  }
}

/** Expand a 15-bit BGR555 colour to 8 bits per channel. */
function bgr555(value: number, out: Uint8Array, at: number, alpha: number): void {
  const r = value & 0x1f
  const g = (value >> 5) & 0x1f
  const b = (value >> 10) & 0x1f
  // Replicate the high bits into the low ones so 31 maps to 255, not 248.
  out[at] = (r << 3) | (r >> 2)
  out[at + 1] = (g << 3) | (g >> 2)
  out[at + 2] = (b << 3) | (b >> 2)
  out[at + 3] = alpha
}

/** Cheap check for the `BTX0` stamp; does not validate the body. */
export function isNsbtx(data: Uint8Array): boolean {
  return (
    data.length >= 4 && data[0] === 0x42 && data[1] === 0x54 && data[2] === 0x58 && data[3] === 0x30
  )
}

/**
 * Parse an NSBTX file: the `TEX0` block its head names.
 *
 * The head is the one every Nitro file shares — the stamp, a byte-order mark,
 * a version, the file's size, the head's size, a block count at `0x0E`, then
 * each block's offset from `0x10` (FORMAT.md, "Container"). A
 * `BTX0` holds one block, `TEX0`, whose own size is at its `+0x04`.
 */
export function readNsbtx(data: Uint8Array): TextureSet {
  if (!isNsbtx(data)) throw new NitroGfxError('not an NSBTX file: no BTX0 stamp', 0)
  checkRange(data, 0, 0x14, 'nsbtx head')
  if (u16(data, 0x0e, 'nsbtx.blockCount') < 1) {
    throw new NitroGfxError('NSBTX file holds no block', 0x0e)
  }
  const offset = u32(data, 0x10, 'nsbtx.blockOffset')
  checkRange(data, offset, 8, 'nsbtx TEX0 head')
  const size = u32(data, offset + 4, 'tex0.size')
  checkRange(data, offset, size, 'nsbtx TEX0 block')
  return readTex0(data.subarray(offset, offset + size))
}

/** Parse a `TEX0` block, given the block's own bytes. */
export function readTex0(block: Uint8Array): TextureSet {
  const stamp = resourceName(block, 0, 4)
  if (stamp !== 'TEX0') {
    throw new NitroGfxError(`not a TEX0 block: stamp is '${stamp}'`, 0)
  }

  const textureDataSize = u16(block, 0x0c, 'tex0.textureDataSize') << 3
  const textureDictOffset = u16(block, 0x0e, 'tex0.textureDictOffset')
  const textureDataOffset = u32(block, 0x14, 'tex0.textureDataOffset')
  const compressedDataOffset = u32(block, 0x24, 'tex0.compressedDataOffset')
  const compressedIndexOffset = u32(block, 0x28, 'tex0.compressedIndexOffset')
  const paletteDataSize = u32(block, 0x30, 'tex0.paletteDataSize') << 3
  const paletteDictOffset = u32(block, 0x34, 'tex0.paletteDictOffset')
  const paletteDataOffset = u32(block, 0x38, 'tex0.paletteDataOffset')

  checkRange(block, textureDataOffset, textureDataSize, 'tex0 texture data')
  checkRange(block, paletteDataOffset, paletteDataSize, 'tex0 palette data')

  const textureDict = readDict(block, textureDictOffset, 'tex0.textures')
  const paletteDict = readDict(block, paletteDictOffset, 'tex0.palettes')

  const textures: TextureInfo[] = textureDict.entries.map((entry, index) => {
    const dataOffset = u16(entry.data, 0, `texture[${index}].offset`) << 3
    const params = u16(entry.data, 2, `texture[${index}].params`)
    const width = 8 << ((params >> 4) & 7)
    const height = 8 << ((params >> 7) & 7)
    const format = (params >> 10) & 7
    return {
      name: entry.name,
      index,
      width,
      height,
      format,
      color0Transparent: ((params >> 13) & 1) === 1,
      dataOffset,
      dataSize: texelDataSize(format, width, height),
      params,
    }
  })

  // A palette's size is not recorded; it runs to the next palette, or to the
  // end of the region. Palettes are not necessarily in offset order.
  const paletteOffsets = paletteDict.entries.map(
    (entry, index) => u16(entry.data, 0, `palette[${index}].offset`) << 3,
  )
  const sortedOffsets = [...new Set(paletteOffsets)].sort((a, b) => a - b)
  const palettes: PaletteInfo[] = paletteDict.entries.map((entry, index) => {
    const dataOffset = paletteOffsets[index] as number
    const next = sortedOffsets.find((o) => o > dataOffset) ?? paletteDataSize
    return { name: entry.name, index, dataOffset, dataSize: next - dataOffset }
  })

  const byTexture = new Map(textures.map((t) => [t.name, t]))
  const byPalette = new Map(palettes.map((p) => [p.name, p]))

  const texels = (texture: TextureInfo): Uint8Array => {
    const base =
      texture.format === TextureFormat.Compressed4x4 ? compressedDataOffset : textureDataOffset
    checkRange(block, base + texture.dataOffset, texture.dataSize, `texture '${texture.name}'`)
    return block.subarray(base + texture.dataOffset, base + texture.dataOffset + texture.dataSize)
  }

  const paletteBytes = (palette: PaletteInfo): Uint8Array =>
    block.subarray(
      paletteDataOffset + palette.dataOffset,
      paletteDataOffset + palette.dataOffset + palette.dataSize,
    )

  const decode = (texture: TextureInfo, palette?: PaletteInfo): Uint8Array => {
    const { width, height, format } = texture
    const out = new Uint8Array(width * height * 4)
    const data = texels(texture)
    const pal = palette ? paletteBytes(palette) : new Uint8Array(0)
    const colour = (i: number): number =>
      i * 2 + 1 < pal.length ? (pal[i * 2] as number) | ((pal[i * 2 + 1] as number) << 8) : 0

    switch (format) {
      case TextureFormat.Palette4:
      case TextureFormat.Palette16:
      case TextureFormat.Palette256: {
        const bits =
          format === TextureFormat.Palette4 ? 2 : format === TextureFormat.Palette16 ? 4 : 8
        const mask = (1 << bits) - 1
        const perByte = 8 / bits
        for (let i = 0; i < width * height; i++) {
          const byte = data[Math.floor(i / perByte)] as number
          const index = (byte >> ((i % perByte) * bits)) & mask
          const transparent = texture.color0Transparent && index === 0
          bgr555(colour(index), out, i * 4, transparent ? 0 : 255)
        }
        break
      }
      case TextureFormat.A3I5:
      case TextureFormat.A5I3: {
        const indexBits = format === TextureFormat.A3I5 ? 5 : 3
        const indexMask = (1 << indexBits) - 1
        const alphaBits = 8 - indexBits
        const alphaMax = (1 << alphaBits) - 1
        for (let i = 0; i < width * height; i++) {
          const byte = data[i] as number
          const index = byte & indexMask
          const alpha = byte >> indexBits
          bgr555(colour(index), out, i * 4, Math.round((alpha * 255) / alphaMax))
        }
        break
      }
      case TextureFormat.Direct: {
        for (let i = 0; i < width * height; i++) {
          const value = (data[i * 2] as number) | ((data[i * 2 + 1] as number) << 8)
          bgr555(value, out, i * 4, value & 0x8000 ? 255 : 0)
        }
        break
      }
      case TextureFormat.Compressed4x4:
        decode4x4(texture, data, out, block, compressedIndexOffset, paletteDataOffset, palette)
        break
      default:
        throw new NitroGfxError(
          `texture '${texture.name}' has format ${format}, which is not decodable`,
        )
    }
    return out
  }

  return {
    textures,
    palettes,
    texture: (name) => byTexture.get(name),
    palette: (name) => byPalette.get(name),
    texels,
    paletteBytes,
    decode,
  }
}

/**
 * Decode the 4x4 compressed format.
 *
 * Texels are two bits each, in 4x4 blocks of one 32-bit word. A parallel array
 * of 16-bit entries — one per block — gives that block's palette: bits 0-13 are
 * the palette offset in 4-byte units from the palette region's start, and bits
 * 14-15 select how the four colours are derived. Modes 1 and 3 interpolate the
 * two stored colours; modes 0 and 2 make index 3 transparent.
 *
 * `// INFERRED:` the interpolation weights below (3/8 and 5/8 for mode 3) are
 * from GBATEK's description of the hardware's blend; they have not been checked
 * against a reference render.
 */
function decode4x4(
  texture: TextureInfo,
  data: Uint8Array,
  out: Uint8Array,
  block: Uint8Array,
  indexOffset: number,
  paletteDataOffset: number,
  palette?: PaletteInfo,
): void {
  const { width, height } = texture
  const blocksX = width >> 2
  const blocksY = height >> 2
  const paletteBase = paletteDataOffset + (palette?.dataOffset ?? 0)

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const blockIndex = by * blocksX + bx
      const texelWord =
        ((data[blockIndex * 4] as number) |
          ((data[blockIndex * 4 + 1] as number) << 8) |
          ((data[blockIndex * 4 + 2] as number) << 16) |
          ((data[blockIndex * 4 + 3] as number) << 24)) >>>
        0
      const at = indexOffset + texture.dataOffset / 2 + blockIndex * 2
      const info =
        at + 1 < block.length ? (block[at] as number) | ((block[at + 1] as number) << 8) : 0
      const paletteAt = paletteBase + ((info & 0x3fff) << 2)
      const mode = info >> 14

      const read = (i: number): number => {
        const p = paletteAt + i * 2
        return p + 1 < block.length ? (block[p] as number) | ((block[p + 1] as number) << 8) : 0
      }
      const colours: [number, number][] = [
        [read(0), 255],
        [read(1), 255],
        [0, 0],
        [0, 0],
      ]
      const mix = (a: number, b: number, wa: number, wb: number): number => {
        const c = (v: number, s: number) => ((v >> s) & 0x1f) as number
        const r = Math.min(31, Math.round((c(a, 0) * wa + c(b, 0) * wb) / 8))
        const g = Math.min(31, Math.round((c(a, 5) * wa + c(b, 5) * wb) / 8))
        const bl = Math.min(31, Math.round((c(a, 10) * wa + c(b, 10) * wb) / 8))
        return r | (g << 5) | (bl << 10)
      }
      if (mode === 0) {
        colours[2] = [read(2), 255]
        colours[3] = [0, 0]
      } else if (mode === 1) {
        colours[2] = [mix(read(0), read(1), 4, 4), 255]
        colours[3] = [0, 0]
      } else if (mode === 2) {
        colours[2] = [read(2), 255]
        colours[3] = [read(3), 255]
      } else {
        colours[2] = [mix(read(0), read(1), 5, 3), 255]
        colours[3] = [mix(read(0), read(1), 3, 5), 255]
      }

      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const index = (texelWord >>> ((y * 4 + x) * 2)) & 3
          const px = bx * 4 + x
          const py = by * 4 + y
          if (px >= width || py >= height) continue
          const entry = colours[index] as [number, number]
          bgr555(entry[0], out, (py * width + px) * 4, entry[1])
        }
      }
    }
  }
}
