import { checkRange, resourceName, u8, u16, u32 } from './bytes.ts'
import { readDict } from './dict.ts'
import { NitroGfxError } from './errors.ts'

/**
 * **NSBMA** — material animation: a material's colours and its polygon alpha
 * over time. One `MAT0` block of animations, each stamped `M\0AM`.
 *
 * No published description reads it: scurest's nsbmd_docs list NSBMA as
 * undocumented. It is read from **the game's own code**, as the dqix
 * decompilation gives it (`src/Graphics/NSBXX/MAM.cpp`:
 * `GetColorFromMaterialAnimation`, `GetAlphaFromMaterialAnimation`,
 * `MAMAnimationProcessingCallback`; US ARM9 `0x020b8e60`, `0x020b8fc8`,
 * `0x020b9188`), and checked against the effects on the reference cartridge:
 * the container and name lists as every Nitro file's; the animation `M\0AM`,
 * a frame count and a halfword, then a name list of tracks by material; a
 * track five words — diffuse, ambient, specular, emission, alpha — each bits
 * 0–15 an offset to its samples or the value itself, 16–28 a frame count, 29
 * whether it is a value held, 30–31 how many frames a sample. Colours are
 * `BGR555` in a `u16`; alpha is a `u8`, 0 to 31. FORMAT.md, "NSBTA and NSBMA".
 */

/** One channel: a value held, or samples at 1, 2 or 4 frames each. */
export type MatChannel =
  | { readonly constant: number }
  | {
      readonly samples: readonly number[]
      readonly rate: 1 | 2 | 4
      /** Bits 16–28 of the word: the frames the samples cover. */
      readonly frames: number
    }

/** A material's colours and alpha over an animation. */
export interface MatTrack {
  readonly material: string
  /** `BGR555` each. */
  readonly diffuse: MatChannel
  readonly ambient: MatChannel
  readonly specular: MatChannel
  readonly emission: MatChannel
  /** 0 to 31, the polygon's alpha. */
  readonly alpha: MatChannel
}

export interface MaterialAnimation {
  readonly name: string
  readonly frameCount: number
  /** The halfword after the frame count, not read by the game's code here. */
  readonly unknown_0x06: number
  readonly tracks: readonly MatTrack[]
}

const CONSTANT = 0x20000000
const TRACK_SIZE = 20

/** Whether bytes open as an NSBMA. */
export function isNsbma(data: Uint8Array): boolean {
  return data.length >= 4 && resourceName(data, 0, 4) === 'BMA0'
}

/** Read an NSBMA's animations. Throws on anything malformed. */
export function readNsbma(data: Uint8Array): MaterialAnimation[] {
  if (!isNsbma(data)) throw new NitroGfxError('not an NSBMA: its stamp is not BMA0', 0)
  const headerSize = u16(data, 0x0c, 'nsbma.headerSize')
  const blockAt = u32(data, headerSize, 'nsbma.blockOffset')
  if (resourceName(data, blockAt, 4) !== 'MAT0') {
    throw new NitroGfxError('nsbma block is not MAT0', blockAt)
  }
  const block = data.subarray(blockAt)
  return readDict(block, 8, 'MAT0').entries.map((entry, index) => {
    const at = u32(entry.data, 0, `animation[${index}] offset`)
    checkRange(block, at, 8, `animation '${entry.name}' header`)
    if (block[at] !== 0x4d || block[at + 1] !== 0 || resourceName(block, at + 2, 2) !== 'AM') {
      throw new NitroGfxError(`animation '${entry.name}' is not stamped M\\0AM`, blockAt + at)
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
        const channel = (i: number, alpha: boolean): MatChannel => {
          const word = u32(track.data, i * 4, 'channel')
          if (word & CONSTANT) return { constant: word & 0xffff }
          const rate = word & 0x40000000 ? 2 : word & 0x80000000 ? 4 : 1
          const frames = (word >>> 16) & 0x1fff
          const offset = word & 0xffff
          const size = alpha ? 1 : 2
          // The field holds the frame count on the cartridge — 16 for `eb0500`'s 16 — though
          // the decompilation names it the last frame: the samples it covers, at the rate.
          const needed = Math.max(1, Math.ceil(frames / rate))
          checkRange(animation, offset, needed * size, `track '${track.name}' samples`)
          const count = offset + (needed + 1) * size <= animation.length ? needed + 1 : needed
          const samples = Array.from({ length: count }, (_, k) =>
            alpha ? u8(animation, offset + k, 'alpha') : u16(animation, offset + k * 2, 'colour'),
          )
          return { samples, rate: rate as 1 | 2 | 4, frames }
        }
        return {
          material: track.name,
          diffuse: channel(0, false),
          ambient: channel(1, false),
          specular: channel(2, false),
          emission: channel(3, false),
          alpha: channel(4, true),
        }
      }),
    }
  })
}

/** Two `BGR555` colours mixed, `a` weighted `wa` of four — red and blue, green, as the game masks them. */
function mixColour(a: number, b: number, wa: number): number {
  const wb = 4 - wa
  const rb = (((a & 0x7c1f) * wa + (b & 0x7c1f) * wb) >> 2) & 0x7c1f
  const g = (((a & 0x3e0) * wa + (b & 0x3e0) * wb) >> 2) & 0x3e0
  return rb | g
}

/**
 * A channel's value at a whole frame, as the game's samplers take it — see
 * `sampleTexChannel` for the in-betweens; colours mix channel by channel.
 */
export function sampleMatChannel(channel: MatChannel, frame: number, colour: boolean): number {
  if ('constant' in channel) return channel.constant
  const at = (i: number) =>
    channel.samples[Math.max(0, Math.min(i, channel.samples.length - 1))] ?? 0
  const mix = (a: number, b: number, wa: number) =>
    colour ? mixColour(a, b, wa) : (a * wa + b * (4 - wa)) >> 2
  const f = Math.max(0, Math.floor(frame))
  if (channel.rate === 1) return at(f)
  if (channel.rate === 2) {
    if ((f & 1) === 0) return at(f >> 1)
    if (f > channel.frames) return at((channel.frames >> 1) + 1)
    return mix(at(f >> 1), at((f >> 1) + 1), 2)
  }
  const quarter = f & 3
  if (quarter === 0) return at(f >> 2)
  if (f > channel.frames) return at((channel.frames >> 2) + quarter)
  if (quarter === 2) return mix(at(f >> 2), at((f >> 2) + 1), 2)
  const [near, far] = quarter === 3 ? [(f >> 2) + 1, f >> 2] : [f >> 2, (f >> 2) + 1]
  return mix(at(near), at(far), 3)
}

/** A track's colours and alpha at a frame. */
export function sampleMatTrack(
  track: MatTrack,
  frame: number,
): {
  readonly diffuse: number
  readonly ambient: number
  readonly specular: number
  readonly emission: number
  readonly alpha: number
} {
  return {
    diffuse: sampleMatChannel(track.diffuse, frame, true),
    ambient: sampleMatChannel(track.ambient, frame, true),
    specular: sampleMatChannel(track.specular, frame, true),
    emission: sampleMatChannel(track.emission, frame, true),
    alpha: sampleMatChannel(track.alpha, frame, false),
  }
}
