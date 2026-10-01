import { checkRange, resourceName, u8, u16, u32 } from './bytes.ts'
import { readDict } from './dict.ts'
import { NitroGfxError } from './errors.ts'

/**
 * **NSBTP** — texture pattern animation: a material's texture, and its
 * palette, swapped for another of the model's as frames pass. One `PAT0`
 * block of animations, each stamped `M\0PT`.
 *
 * Read from the game's own code, as the dqix decompilation gives it — the
 * animation's layout (`NSBXXAnimationMPT`, `include/Graphics/NSBXX/NSBXX.h`)
 * and its use (`src/Graphics/NSBXX/MPT.cpp`: `InitializeModelAnimationFromMPT`
 * ties each track to the material of its name, `MPTAnimationProcessingCallback`
 * sets the texture and palette a frame's keyframe names;
 * `src/Graphics/NSBXX/PatternAnimation.cpp`: `NSBXX_PatternAnimation_GetKeyframe`,
 * `_GetTextureName`, `_GetPaletteName`, `_GetTrack`). The container is the
 * same shape as NSBTA's and NSBMA's: a stamp, a header, one block, a name
 * list of animations. Checked against the effects on the reference
 * cartridge. FORMAT.md, "NSBTP".
 *
 * An animation is:
 *
 * | offset | | |
 * |---|---|---|
 * | `+0x00` | 4 | `M\0PT` |
 * | `+0x04` | u16 | its frame count |
 * | `+0x06` | u8 | how many texture names |
 * | `+0x07` | u8 | how many palette names |
 * | `+0x08` | u16 | where the texture names are, from the animation, 16 bytes each |
 * | `+0x0a` | u16 | where the palette names are |
 * | `+0x0c` | | the tracks: a name list by material, 8 bytes an item |
 *
 * A track: u16 how many keyframes, u16 `unknown_0x02` (loaded and not
 * used), s16 an index guess (`fx16`: keyframes per frame), u16 where its
 * keyframes are, from the animation. A keyframe: u16 its frame, u8 the
 * texture's index, u8 the palette's — `0xff` for none.
 */

export interface PatternKeyframe {
  /** The frame it takes effect from. */
  readonly frame: number
  /** The texture's name, by the animation's own list. */
  readonly texture: string
  /** The palette's name, or undefined to leave the palette as it is (`0xff`). */
  readonly palette: string | undefined
}

/** A material's textures over an animation, in frame order. */
export interface PatternTrack {
  readonly material: string
  readonly keyframes: readonly PatternKeyframe[]
  /** The track's second halfword, loaded and not used by the game. */
  readonly unknown_0x02: number
  /** Where the game starts its search, keyframes a frame (`fx16`) — not needed to sample. */
  readonly guess: number
}

export interface PatternAnimation {
  readonly name: string
  readonly frameCount: number
  readonly tracks: readonly PatternTrack[]
}

const TRACK_SIZE = 8
const KEYFRAME_SIZE = 4
const NAME_SIZE = 16
const NO_PALETTE = 0xff

/** Whether bytes open as an NSBTP. */
export function isNsbtp(data: Uint8Array): boolean {
  return data.length >= 4 && resourceName(data, 0, 4) === 'BTP0'
}

/** A 16-byte, NUL-padded name. */
function nameAt(data: Uint8Array, at: number, what: string): string {
  checkRange(data, at, NAME_SIZE, what)
  let out = ''
  for (let i = 0; i < NAME_SIZE; i++) {
    const c = data[at + i] as number
    if (c === 0) break
    out += String.fromCharCode(c)
  }
  return out
}

/** Read an NSBTP's animations. Throws on anything malformed. */
export function readNsbtp(data: Uint8Array): PatternAnimation[] {
  if (!isNsbtp(data)) throw new NitroGfxError('not an NSBTP: its stamp is not BTP0', 0)
  const headerSize = u16(data, 0x0c, 'nsbtp.headerSize')
  const blockAt = u32(data, headerSize, 'nsbtp.blockOffset')
  checkRange(data, blockAt, 4, 'nsbtp block')
  if (resourceName(data, blockAt, 4) !== 'PAT0') {
    throw new NitroGfxError('nsbtp block is not PAT0', blockAt)
  }
  const block = data.subarray(blockAt)
  return readDict(block, 8, 'PAT0').entries.map((entry, index) => {
    const at = u32(entry.data, 0, `animation[${index}] offset`)
    checkRange(block, at, 0x0c, `animation '${entry.name}' header`)
    if (block[at] !== 0x4d || block[at + 1] !== 0 || resourceName(block, at + 2, 2) !== 'PT') {
      throw new NitroGfxError(`animation '${entry.name}' is not stamped M\\0PT`, blockAt + at)
    }
    const animation = block.subarray(at)
    const textureCount = u8(animation, 6, 'animation.textureCount')
    const paletteCount = u8(animation, 7, 'animation.paletteCount')
    const texturesAt = u16(animation, 8, 'animation.textureNames')
    const palettesAt = u16(animation, 0x0a, 'animation.paletteNames')
    const textures = Array.from({ length: textureCount }, (_, i) =>
      nameAt(animation, texturesAt + i * NAME_SIZE, `texture name ${i}`),
    )
    const palettes = Array.from({ length: paletteCount }, (_, i) =>
      nameAt(animation, palettesAt + i * NAME_SIZE, `palette name ${i}`),
    )
    const tracks = readDict(animation, 0x0c, `animation '${entry.name}' tracks`)
    if (tracks.entries.length > 0 && tracks.itemSize !== TRACK_SIZE) {
      throw new NitroGfxError(
        `animation '${entry.name}': a track is ${tracks.itemSize} bytes, not ${TRACK_SIZE}`,
        blockAt + at,
      )
    }
    return {
      name: entry.name,
      frameCount: u16(animation, 4, 'animation.frameCount'),
      tracks: tracks.entries.map((track) => {
        const count = u16(track.data, 0, 'track.keyframes')
        const keysAt = u16(track.data, 6, 'track.keyframeArray')
        checkRange(animation, keysAt, count * KEYFRAME_SIZE, `track '${track.name}' keyframes`)
        const keyframes = Array.from({ length: count }, (_, k) => {
          const byte = keysAt + k * KEYFRAME_SIZE
          const textureIndex = u8(animation, byte + 2, 'keyframe.texture')
          const paletteIndex = u8(animation, byte + 3, 'keyframe.palette')
          const texture = textures[textureIndex]
          if (texture === undefined) {
            throw new NitroGfxError(
              `track '${track.name}' names texture ${textureIndex} of ${textureCount}`,
              blockAt + at + byte,
            )
          }
          return {
            frame: u16(animation, byte, 'keyframe.frame'),
            texture,
            palette: paletteIndex === NO_PALETTE ? undefined : palettes[paletteIndex],
          }
        })
        return {
          material: track.name,
          keyframes,
          unknown_0x02: u16(track.data, 2, 'track.unknown_0x02'),
          guess: (u16(track.data, 4, 'track.guess') << 16) >> 16,
        }
      }),
    }
  })
}

/**
 * **A track's keyframe at a frame** — the last whose frame is not past it, as
 * `NSBXX_PatternAnimation_GetKeyframe` settles on from its guess; the first
 * before any. Undefined for a track with none.
 */
export function patternAt(track: PatternTrack, frame: number): PatternKeyframe | undefined {
  const keys = track.keyframes
  let found = keys[0]
  for (const key of keys) {
    if (key.frame > frame) break
    found = key
  }
  return found
}
