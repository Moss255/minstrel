import { checkRange, resourceName, u8, u16, u32 } from './bytes.ts'
import { readDict } from './dict.ts'
import { NitroGfxError } from './errors.ts'

/**
 * NSBCA — the Nitro joint-animation container, stamp `BCA0`, holding a `JNT0`
 * block.
 *
 * Container and animation headers are established by observation; the per-bone
 * *track* contents are not, and are exposed as raw bytes. See "What is not
 * established" below — this reads an animation's structure, it does not play
 * one.
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `char[4]` | `JNT0` |
 * | `+0x04` | `u32` | block size |
 * | `+0x08` | | animation dictionary |
 *
 * Each animation:
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `u8[4]` | `4A 00 41 43` — the only stamp observed |
 * | `+0x04` | `u16` | frame count |
 * | `+0x06` | `u16` | bone count |
 * | `+0x08` | `u32` | `unknown_0x08` |
 * | `+0x0C` | `u32` | end of the per-bone entries, and the start of a value pool |
 * | `+0x10` | `u32` | a second pool offset |
 * | `+0x14` | `u16[bones]` | per-bone entry offsets, relative to the animation |
 *
 * Each per-bone entry begins `u16 flags`, `u8 unknown` (always 0), `u8 bone
 * index`, and the index always equals the entry's own position.
 */

export const NSBCA_MAGIC = 'BCA0'

/** The four bytes every animation begins with on the reference cartridge. */
export const ANIMATION_STAMP = [0x4a, 0x00, 0x41, 0x43] as const

export interface BoneTrack {
  /** Index within the animation; equals the bone this track drives. */
  readonly index: number
  readonly flags: number
  /** Byte offset of the entry within the animation. */
  readonly offset: number
  /**
   * The entry's bytes after its four-byte header.
   *
   * Not interpreted: which fields the flags select is established, but what
   * they contain is not.
   */
  readonly payload: Uint8Array
}

export interface Animation {
  readonly name: string
  readonly index: number
  readonly frameCount: number
  readonly boneCount: number
  readonly unknown_0x08: number
  readonly tracks: readonly BoneTrack[]
}

export interface Nsbca {
  readonly version: number
  readonly animations: readonly Animation[]
  animation(name: string): Animation | undefined
}

/**
 * Bytes a per-bone entry occupies, from its flags.
 *
 * **Fitted, and exact.** A least-squares fit of entry length against the flag
 * bits over every distinct flags value on the reference cartridge gives whole
 * numbers, and they reproduce the length for all 202 of them:
 *
 * ```
 * length = 60 - 12*bit1 - 4*(bit3 + bit4 + bit5 + bit6 + bit8) - 24*bit9
 * ```
 *
 * The weights say what the sections are — a 12-byte block, five 4-byte fields
 * and a 24-byte block — without saying what they hold.
 */
export function boneTrackSize(flags: number): number {
  let size = 60
  if (flags & (1 << 1)) size -= 12
  for (const bit of [3, 4, 5, 6, 8]) if (flags & (1 << bit)) size -= 4
  if (flags & (1 << 9)) size -= 24
  return size
}

/** Cheap check for the `BCA0` stamp; does not validate the body. */
export function isNsbca(data: Uint8Array): boolean {
  return (
    data.length >= 4 && data[0] === 0x42 && data[1] === 0x43 && data[2] === 0x41 && data[3] === 0x30
  )
}

/** Parse an NSBCA container. Returns views into `data`; nothing is copied. */
export function readNsbca(data: Uint8Array): Nsbca {
  if (!isNsbca(data)) {
    const stamp = Array.from(data.subarray(0, 4), (c) =>
      c >= 0x20 && c <= 0x7e ? String.fromCharCode(c) : '.',
    ).join('')
    throw new NitroGfxError(`not an NSBCA: stamp is '${stamp}'`, 0)
  }
  const version = u16(data, 0x06, 'nsbca.version')
  const declaredSize = u32(data, 0x08, 'nsbca.fileSize')
  if (declaredSize > data.length) {
    throw new NitroGfxError(
      `nsbca declares ${declaredSize} bytes but only ${data.length} are present`,
      0x08,
    )
  }
  const image = data.subarray(0, declaredSize)
  const headerSize = u16(image, 0x0c, 'nsbca.headerSize')
  const blockOffset = u32(image, headerSize, 'nsbca.blockOffset')

  const stamp = resourceName(image, blockOffset, 4)
  if (stamp !== 'JNT0') {
    throw new NitroGfxError(`nsbca block has stamp '${stamp}', expected 'JNT0'`, blockOffset)
  }
  const block = image.subarray(blockOffset)
  const dict = readDict(block, 8, 'JNT0')

  const animations: Animation[] = dict.entries.map((entry, index) => {
    const at = u32(entry.data, 0, `animation[${index}] offset`)
    checkRange(block, at, 0x14, `animation[${index}] header`)

    for (let i = 0; i < 4; i++) {
      if (block[at + i] !== ANIMATION_STAMP[i]) {
        throw new NitroGfxError(
          `animation '${entry.name}' does not begin with the expected stamp`,
          at,
        )
      }
    }

    const frameCount = u16(block, at + 0x04, 'animation.frameCount')
    const boneCount = u16(block, at + 0x06, 'animation.boneCount')
    checkRange(block, at + 0x14, boneCount * 2, `animation '${entry.name}' track offsets`)

    const tracks: BoneTrack[] = []
    for (let i = 0; i < boneCount; i++) {
      const offset = u16(block, at + 0x14 + i * 2, `animation.trackOffset[${i}]`)
      const start = at + offset
      checkRange(block, start, 4, `animation '${entry.name}' track ${i}`)
      const flags = u16(block, start, 'track.flags')
      const size = boneTrackSize(flags)
      checkRange(block, start, size, `animation '${entry.name}' track ${i} payload`)
      const boneIndex = u8(block, start + 3, 'track.boneIndex')
      tracks.push({
        index: boneIndex,
        flags,
        offset,
        payload: block.subarray(start + 4, start + size),
      })
    }

    return {
      name: entry.name,
      index,
      frameCount,
      boneCount,
      unknown_0x08: u32(block, at + 0x08, 'animation.unknown_0x08'),
      tracks,
    }
  })

  const byName = new Map(animations.map((a) => [a.name, a]))
  return { version, animations, animation: (name) => byName.get(name) }
}
