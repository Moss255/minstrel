import { checkRange, resourceName, u16, u32 } from './bytes.ts'
import { readDict } from './dict.ts'
import { NitroGfxError } from './errors.ts'

/**
 * **NSBTA** — texture animation: a material's texture scaled, turned and slid
 * over time. One `SRT0` block of animations, each stamped `M\0AT`.
 *
 * Sources, and what each settles:
 * - scurest, [nsbmd_docs](https://github.com/scurest/nsbmd_docs) ("Material
 *   Animations") and apicula's `src/nitro/material_animation.rs`: the block,
 *   the `M\0AT` animation with its frame count, a name list of tracks by
 *   material, five channels a track. Both say it is incomplete, and both read
 *   the translation samples as 1.10.5 — which the game's code does not.
 * - The game's own code, as the dqix decompilation gives it
 *   (`src/Graphics/NSBXX/MAT.cpp`: `SampleScalarFromMATTrack`,
 *   `SampleSinCosFromMATTrack`, `CalculateTextureTransformFromMAT`; US ARM9
 *   `0x020b9278`, `0x020b9378`, `0x020b9484`): the channels' order — scale S,
 *   scale T, rotation, translate S, translate T, each a metadata word and a
 *   value word — the metadata's bits, the samples' format, and how a frame is
 *   sampled. Checked against the effects on the reference cartridge. FORMAT.md,
 *   "NSBTA and NSBMA".
 */

/** One channel of a track: a value held, or samples at 1, 2 or 4 frames each. */
export type TexChannel =
  | { readonly constant: number }
  | {
      readonly samples: readonly number[]
      /** Frames a sample: 1, 2 or 4 — bits 30 and 31 of the metadata, as a power of two. */
      readonly rate: 1 | 2 | 4
      /** Bits 0–15 of the metadata: the last frame the samples are read to. */
      readonly end: number
    }

/** A material's texture over an animation: each channel ×4096, the rotation as sine and cosine packed. */
export interface TexTrack {
  readonly material: string
  readonly scaleS: TexChannel
  readonly scaleT: TexChannel
  /** Sine in the low 16 bits, cosine in the high, each `fx16`. */
  readonly rotation: TexChannel
  readonly translateS: TexChannel
  readonly translateT: TexChannel
}

export interface TextureAnimation {
  readonly name: string
  readonly frameCount: number
  /** The halfword after the frame count, not read by the game's code here. */
  readonly unknown_0x06: number
  readonly tracks: readonly TexTrack[]
}

const CONSTANT = 0x20000000
const SHORT = 0x10000000
const TRACK_SIZE = 40

/** Whether bytes open as an NSBTA. */
export function isNsbta(data: Uint8Array): boolean {
  return data.length >= 4 && resourceName(data, 0, 4) === 'BTA0'
}

/** Read an NSBTA's animations. Throws on anything malformed. */
export function readNsbta(data: Uint8Array): TextureAnimation[] {
  if (!isNsbta(data)) throw new NitroGfxError('not an NSBTA: its stamp is not BTA0', 0)
  const headerSize = u16(data, 0x0c, 'nsbta.headerSize')
  const blockAt = u32(data, headerSize, 'nsbta.blockOffset')
  if (resourceName(data, blockAt, 4) !== 'SRT0') {
    throw new NitroGfxError(`nsbta block is not SRT0`, blockAt)
  }
  const block = data.subarray(blockAt)
  return readDict(block, 8, 'SRT0').entries.map((entry, index) => {
    const at = u32(entry.data, 0, `animation[${index}] offset`)
    checkRange(block, at, 8, `animation '${entry.name}' header`)
    if (block[at] !== 0x4d || block[at + 1] !== 0 || resourceName(block, at + 2, 2) !== 'AT') {
      throw new NitroGfxError(`animation '${entry.name}' is not stamped M\\0AT`, blockAt + at)
    }
    const animation = block.subarray(at)
    const tracks = readDict(animation, 8, `animation '${entry.name}' tracks`)
    if (tracks.entries.length > 0 && tracks.itemSize !== TRACK_SIZE) {
      throw new NitroGfxError(
        `animation '${entry.name}': a track is ${tracks.itemSize} bytes, not ${TRACK_SIZE}`,
        blockAt + at,
      )
    }
    return {
      name: entry.name,
      frameCount: u16(animation, 4, 'animation.frameCount'),
      unknown_0x06: u16(animation, 6, 'animation.unknown_0x06'),
      tracks: tracks.entries.map((track) => {
        const channel = (i: number, sinCos: boolean): TexChannel => {
          const meta = u32(track.data, i * 8, 'channel metadata')
          const value = u32(track.data, i * 8 + 4, 'channel value')
          if (meta & CONSTANT) return { constant: sinCos ? value : value | 0 }
          // Bit 30 is tested first: every second frame; then bit 31, every fourth.
          const rate = meta & 0x40000000 ? 2 : meta & 0x80000000 ? 4 : 1
          const end = meta & 0xffff
          const short = !sinCos && (meta & SHORT) !== 0
          const size = short ? 2 : 4
          // The samples to the end at the rate, and one past where the file has it —
          // an in-between near the end reads it, as the game's does.
          const needed = Math.max(1, Math.ceil(end / rate))
          checkRange(animation, value, needed * size, `track '${track.name}' samples`)
          const count = value + (needed + 1) * size <= animation.length ? needed + 1 : needed
          const samples = Array.from({ length: count }, (_, k) => {
            const byte = value + k * size
            if (short) return (u16(animation, byte, 'sample') << 16) >> 16
            const word = u32(animation, byte, 'sample')
            return sinCos ? word : word | 0
          })
          return { samples, rate: rate as 1 | 2 | 4, end }
        }
        return {
          material: track.name,
          scaleS: channel(0, false),
          scaleT: channel(1, false),
          rotation: channel(2, true),
          translateS: channel(3, false),
          translateT: channel(4, false),
        }
      }),
    }
  })
}

/**
 * A channel's value at a whole frame, as `SampleScalarFromMATTrack` takes it:
 * a sample each frame read directly; every second frame, the frames between
 * the mean of their two; every fourth, the half-way frames the mean and the
 * quarter-way three to one toward the nearer. Past the last frame an
 * in-between frame reads a sample near the end, as the game's does.
 */
export function sampleTexChannel(channel: TexChannel, frame: number): number {
  if ('constant' in channel) return channel.constant
  const at = (i: number) =>
    channel.samples[Math.max(0, Math.min(i, channel.samples.length - 1))] ?? 0
  const f = Math.max(0, Math.floor(frame))
  if (channel.rate === 1) return at(f)
  if (channel.rate === 2) {
    if ((f & 1) === 0) return at(f >> 1)
    if (f > channel.end) return at((channel.end >> 1) + 1)
    return (at(f >> 1) + at((f >> 1) + 1)) >> 1
  }
  const quarter = f & 3
  if (quarter === 0) return at(f >> 2)
  if (f > channel.end) return at(quarter + (channel.end >> 2))
  if (quarter === 2) return (at(f >> 2) + at((f >> 2) + 1)) >> 1
  const [near, far] = quarter === 3 ? [(f >> 2) + 1, f >> 2] : [f >> 2, (f >> 2) + 1]
  return (at(near) * 3 + at(far)) >> 2
}

/**
 * The rotation channel's (sine, cosine) at a frame, `fx16` each, as
 * `SampleSinCosFromMATTrack` takes it — the same in-betweens, each half on
 * its own.
 */
export function sampleTexRotation(
  channel: TexChannel,
  frame: number,
): { sin: number; cos: number } {
  const split = (word: number) => ({ sin: (word << 16) >> 16, cos: word >> 16 })
  if ('constant' in channel) return split(channel.constant)
  const halves = (pick: (w: number) => number): TexChannel => ({
    samples: channel.samples.map(pick),
    rate: channel.rate,
    end: channel.end,
  })
  return {
    sin: sampleTexChannel(
      halves((w) => (w << 16) >> 16),
      frame,
    ),
    cos: sampleTexChannel(
      halves((w) => w >> 16),
      frame,
    ),
  }
}

/** A track's texture transform at a frame, each value ×4096: the game's order and names. */
export function sampleTexTrack(
  track: TexTrack,
  frame: number,
): {
  readonly scaleS: number
  readonly scaleT: number
  readonly sin: number
  readonly cos: number
  readonly translateS: number
  readonly translateT: number
} {
  const { sin, cos } = sampleTexRotation(track.rotation, frame)
  return {
    scaleS: sampleTexChannel(track.scaleS, frame),
    scaleT: sampleTexChannel(track.scaleT, frame),
    sin,
    cos,
    translateS: sampleTexChannel(track.translateS, frame),
    translateT: sampleTexChannel(track.translateT, frame),
  }
}
