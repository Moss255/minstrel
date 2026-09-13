import { u16, u32 } from './bytes.ts'
import { NitroGfxError } from './errors.ts'
import { bitsOfDepth, type G2dBlock, readG2dFile, requireBlock } from './g2d.ts'

/**
 * NCLR — a 2D palette file. See `FORMAT.md`, "2D graphics".
 *
 * `TTLP` (PLTT), the colours — offsets from the block's content:
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `u32` | depth: 3 for sixteen-colour palettes, 4 for 256 |
 * | `+0x04` | `u32` | extended-palette flag |
 * | `+0x08` | `u32` | the colours' size, as stored — not to be trusted, below |
 * | `+0x0C` | `u32` | where the colours start |
 *
 * `PMCP` (PCMP), when present — the slots the stored palettes fill:
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `u16` | how many palettes are stored |
 * | `+0x02` | `u16` | `unknown` — `0xBEEF` on every one seen |
 * | `+0x04` | `u32` | where the slot numbers start |
 * | then | `u16` × count | the slot each stored palette fills, in order |
 *
 * The colours run from their start to the block's end. The size at `+0x08`
 * disagrees with that on most files that have a `PMCP`: NitroPaint notes it as
 * sixteen palettes' worth less the ones stored. So it is carried, not used.
 */

export const NCLR_MAGIC = 'RLCN'
const PLTT = 'TTLP'
const PCMP = 'PMCP'
/** The slots a part's four-bit palette number can name. */
const SLOTS = 16

export interface Nclr {
  readonly version: number
  /** Bits a pixel the palettes serve: 4, sixteen colours each, or 8, 256. */
  readonly bits: 4 | 8
  /** `+0x04` of PLTT, the extended-palette flag, as stored. */
  readonly extended: number
  /** `+0x08` of PLTT, the colours' size as stored — see above. */
  readonly sizeField: number
  /** The palettes by the slot a part's palette number names: BGR555 colours. */
  readonly palettes: ReadonlyMap<number, Uint16Array>
  /** Whether a PMCP placed them; without one they fill the slots from 0. */
  readonly placed: boolean
  /** `+0x02` of PMCP, as stored; undefined without one. */
  readonly unknown_pcmp_0x02: number | undefined
  /** Blocks other than PLTT and PCMP, as they stand. */
  readonly other: readonly G2dBlock[]
}

export function readNclr(data: Uint8Array): Nclr {
  const file = readG2dFile(data, NCLR_MAGIC)
  const pltt = requireBlock(file, PLTT)
  const d = pltt.data
  const bits = bitsOfDepth(u32(d, 0, 'PLTT.depth'), 'NCLR', pltt.offset + 8)
  const start = u32(d, 12, 'PLTT.dataOffset')
  if (start > d.length) {
    throw new NitroGfxError(
      `NCLR: colours start at 0x${start.toString(16)}, past the block`,
      pltt.offset,
    )
  }
  const colours = d.subarray(start)
  const perPalette = bits === 4 ? 16 : 256
  const paletteBytes = perPalette * 2
  const read = (index: number): Uint16Array => {
    const out = new Uint16Array(perPalette)
    for (let i = 0; i < perPalette; i++)
      out[i] = u16(colours, index * paletteBytes + i * 2, 'colour')
    return out
  }
  const palettes = new Map<number, Uint16Array>()
  const pcmp = file.blocks.find((block) => block.stamp === PCMP)
  if (pcmp) {
    const p = pcmp.data
    const count = u16(p, 0, 'PCMP.count')
    const listAt = u32(p, 4, 'PCMP.offset')
    if (count * paletteBytes > colours.length) {
      throw new NitroGfxError(
        `NCLR: PCMP places ${count} palettes, but the colours hold ${Math.floor(colours.length / paletteBytes)}`,
        pcmp.offset,
      )
    }
    for (let i = 0; i < count; i++) {
      const slot = u16(p, listAt + i * 2, 'PCMP.slot')
      if (slot >= SLOTS || palettes.has(slot)) {
        throw new NitroGfxError(`NCLR: PCMP puts palette ${i} in slot ${slot}`, pcmp.offset)
      }
      palettes.set(slot, read(i))
    }
  } else {
    if (colours.length % paletteBytes !== 0) {
      throw new NitroGfxError(
        `NCLR: ${colours.length} bytes of colours is no whole number of ${perPalette}-colour palettes`,
        pltt.offset,
      )
    }
    for (let i = 0; i < colours.length / paletteBytes; i++) palettes.set(i, read(i))
  }
  return {
    version: file.version,
    bits,
    extended: u32(d, 4, 'PLTT.extended'),
    sizeField: u32(d, 8, 'PLTT.size'),
    palettes,
    placed: pcmp !== undefined,
    unknown_pcmp_0x02: pcmp ? u16(pcmp.data, 2, 'PCMP.unknown') : undefined,
    other: file.blocks.filter((block) => block.stamp !== PLTT && block.stamp !== PCMP),
  }
}
