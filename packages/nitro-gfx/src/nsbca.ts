import { checkRange, resourceName, u8, u16, u32 } from './bytes.ts'
import { readDict } from './dict.ts'
import { NitroGfxError } from './errors.ts'
import { fx16ToFloat, fx32ToFloat, signExtend } from './fixed.ts'
import { identity, type Mat4 } from './matrix.ts'
import { basisRotation, pivotRotation } from './rotation.ts'

/**
 * NSBCA — joint animation. One `JNT0` block holding named animations, each
 * driving a model's bones frame by frame.
 *
 * Container, established by observation:
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `char[4]` | `BCA0` |
 * | `+0x06` | `u16` | version |
 * | `+0x08` | `u32` | file size |
 * | `+0x0C` | `u16` | header size; the block offset table follows |
 *
 * Each animation:
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `u8[4]` | `4A 00 41 43` |
 * | `+0x04` | `u16` | frame count |
 * | `+0x06` | `u16` | bone count |
 * | `+0x08` | `u32` | unknown |
 * | `+0x0C` | `u32` | offset of the pivot rotation pool |
 * | `+0x10` | `u32` | offset of the basis rotation pool |
 * | `+0x14` | `u16[bones]` | per-bone entry offsets, relative to the animation |
 *
 * All offsets within an animation are relative to the animation's own start.
 */
export const NSBCA_MAGIC = 'BCA0'

/** The four bytes every animation begins with on the reference cartridge. */
export const ANIMATION_STAMP = [0x4a, 0x00, 0x41, 0x43] as const

/** Bytes per entry in the pivot rotation pool: `u16 pivot`, then two `fx16`. */
export const PIVOT_ENTRY_SIZE = 6

/** Bytes per entry in the basis rotation pool: five 1.0.15 values. */
export const BASIS_ENTRY_SIZE = 10

/**
 * A stored curve: one value per sampled frame.
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `u16` | first frame the curve covers |
 * | `+0x02` | `u16` | last frame in bits 0–12; a three-bit code above it |
 * | `+0x04` | `u32` | where the samples begin, relative to the animation |
 *
 * The code's low bit selects the sample width and the two above it a frame
 * step. Codes 0 and 1 — step 1, 32- and 16-bit — are what the cartridge almost
 * always uses and are the two that are established; see `FORMAT.md`.
 */
export interface CurveHeader {
  readonly startFrame: number
  readonly endFrame: number
  /** Samples are 16-bit rather than 32-bit. Rotation samples are always 16-bit. */
  readonly narrow: boolean
  /** Frames between stored samples. */
  readonly step: number
  /** Bits 13–15 of the header's second word, kept because only 0 and 1 are established. */
  readonly code: number
  /** Where the samples begin, relative to the animation. */
  readonly offset: number
  /** How many samples are stored. */
  readonly count: number
}

/**
 * One animated quantity: either the same every frame, or a curve.
 *
 * `at` is the field's own byte offset within the animation. A constant scale
 * axis and an animated one occupy the same eight bytes, so which they are is
 * decided by a flag bit rather than by size, and `at` is what lets that be
 * checked against the bytes rather than taken on trust.
 */
export type Channel =
  | {
      readonly kind: 'constant'
      readonly at: number
      readonly value: number
      /** Present on scale, which stores each value beside its reciprocal. */
      readonly reciprocal?: number
    }
  | { readonly kind: 'curve'; readonly at: number; readonly curve: CurveHeader }

/** A rotation channel's samples are references into the animation's two pools. */
export type RotationChannel =
  | { readonly kind: 'constant'; readonly ref: number }
  | { readonly kind: 'curve'; readonly curve: CurveHeader }

export type Axes = readonly [Channel, Channel, Channel]

export interface BoneTrack {
  /** Index within the animation; equals the bone this track drives. */
  readonly index: number
  readonly flags: number
  /** Byte offset of the entry within the animation. */
  readonly offset: number
  /** Bytes the entry occupies. */
  readonly size: number
  /** Absent when the animation holds no translation for this bone. */
  readonly translation?: Axes
  /** Absent when the animation holds no rotation for this bone. */
  readonly rotation?: RotationChannel
  /** Absent when the animation holds no scale for this bone. */
  readonly scale?: Axes
}

export interface Animation {
  readonly name: string
  readonly index: number
  readonly frameCount: number
  readonly boneCount: number
  readonly unknown_0x08: number
  readonly tracks: readonly BoneTrack[]
  /** The animation's own bytes. Every offset above indexes into this. */
  readonly data: Uint8Array
  /** Offset of the pivot rotation pool, whose entries are six bytes. */
  readonly pivotPool: number
  /** Offset of the basis rotation pool, whose entries are ten bytes. */
  readonly basisPool: number
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
 * | flag bit | meaning |
 * |---|---|
 * | 0 | the bone is not animated at all — set exactly when 1, 6 and 9 all are |
 * | 1 | no translation |
 * | 3, 4, 5 | translation X, Y, Z is constant: one `fx32` rather than a curve |
 * | 6 | no rotation |
 * | 8 | rotation is constant: one pool reference rather than a curve |
 * | 9 | no scale |
 * | 11, 12, 13 | scale X, Y, Z is constant: a value and its reciprocal |
 *
 * Bits 2, 7, 10, 14 and 15 are never set on the reference cartridge.
 *
 * Note that bits 11–13 do not change the length — a constant scale axis and an
 * animated one both take eight bytes — which is why the fit could not see them
 * and they had to be established separately. See `FORMAT.md`.
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

function readCurve(data: Uint8Array, at: number, narrowAlways: boolean, what: string): CurveHeader {
  const startFrame = u16(data, at, `${what}.startFrame`)
  const word = u16(data, at + 2, `${what}.endFrame`)
  const offset = u32(data, at + 4, `${what}.offset`)
  const code = word >>> 13
  const endFrame = word & 0x1fff
  const step = 1 << (code >>> 1)
  const frames = Math.max(0, endFrame - startFrame)
  // Step 1 stores one sample per frame and stops short of the last; the wider
  // steps store one past. Only step 1 is established — see `FORMAT.md`.
  const count = step === 1 ? frames : Math.floor(frames / step) + 1
  return {
    startFrame,
    endFrame,
    narrow: narrowAlways || (code & 1) === 1,
    step,
    code,
    offset,
    count,
  }
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
    const body = block.subarray(at)

    const tracks: BoneTrack[] = []
    for (let i = 0; i < boneCount; i++) {
      const offset = u16(body, 0x14 + i * 2, 'animation.trackOffset')
      checkRange(body, offset, 4, `animation '${entry.name}' track ${i}`)
      const flags = u16(body, offset, 'track.flags')
      const size = boneTrackSize(flags)
      checkRange(body, offset, size, `animation '${entry.name}' track ${i} payload`)
      const boneIndex = u8(body, offset + 3, 'track.boneIndex')
      const bit = (k: number) => (flags & (1 << k)) !== 0
      let cursor = offset + 4

      let translation: Axes | undefined
      if (!bit(1)) {
        const axes: Channel[] = []
        for (const axis of [0, 1, 2]) {
          if (bit(3 + axis)) {
            axes.push({
              kind: 'constant',
              at: cursor,
              value: fx32ToFloat(u32(body, cursor, 'track.translation')),
            })
            cursor += 4
          } else {
            axes.push({
              kind: 'curve',
              at: cursor,
              curve: readCurve(body, cursor, false, 'track.translation'),
            })
            cursor += 8
          }
        }
        translation = axes as unknown as Axes
      }

      let rotation: RotationChannel | undefined
      if (!bit(6)) {
        if (bit(8)) {
          rotation = { kind: 'constant', ref: u16(body, cursor, 'track.rotation') }
          cursor += 4
        } else {
          rotation = { kind: 'curve', curve: readCurve(body, cursor, true, 'track.rotation') }
          cursor += 8
        }
      }

      let scale: Axes | undefined
      if (!bit(9)) {
        const axes: Channel[] = []
        for (const axis of [0, 1, 2]) {
          if (bit(11 + axis)) {
            axes.push({
              kind: 'constant',
              at: cursor,
              value: fx32ToFloat(u32(body, cursor, 'track.scale')),
              reciprocal: fx32ToFloat(u32(body, cursor + 4, 'track.scaleReciprocal')),
            })
          } else {
            axes.push({
              kind: 'curve',
              at: cursor,
              curve: readCurve(body, cursor, false, 'track.scale'),
            })
          }
          cursor += 8
        }
        scale = axes as unknown as Axes
      }

      const track: BoneTrack = { index: boneIndex, flags, offset, size }
      tracks.push({
        ...track,
        ...(translation && { translation }),
        ...(rotation && { rotation }),
        ...(scale && { scale }),
      })
    }

    return {
      name: entry.name,
      index,
      frameCount,
      boneCount,
      unknown_0x08: u32(body, 0x08, 'animation.unknown_0x08'),
      tracks,
      data: body,
      pivotPool: u32(body, 0x0c, 'animation.pivotPool'),
      basisPool: u32(body, 0x10, 'animation.basisPool'),
    }
  })

  const byName = new Map(animations.map((a) => [a.name, a]))
  return { version, animations, animation: (name) => byName.get(name) }
}

/** Read sample `index` of a curve, as a float. */
function sampleCurve(data: Uint8Array, curve: CurveHeader, index: number, stride: number): number {
  const at = curve.offset + index * stride * (curve.narrow ? 2 : 4)
  return curve.narrow
    ? fx16ToFloat(u16(data, at, 'curve.sample'))
    : fx32ToFloat(u32(data, at, 'curve.sample'))
}

/** Which sample of a curve covers `frame`, clamped to the samples that exist. */
function sampleIndex(curve: CurveHeader, frame: number): number {
  const offset = Math.floor((frame - curve.startFrame) / curve.step)
  return Math.min(Math.max(offset, 0), Math.max(curve.count - 1, 0))
}

function channelAt(data: Uint8Array, channel: Channel, frame: number, stride: number): number {
  if (channel.kind === 'constant') return channel.value
  return sampleCurve(data, channel.curve, sampleIndex(channel.curve, frame), stride)
}

/**
 * Build the 3x3 a rotation reference names.
 *
 * The reference's top bit chooses the pool: set for a pivot rotation, clear for
 * a basis rotation. The remaining fifteen bits index it.
 */
export function rotationFromRef(animation: Animation, ref: number, out: Mat4): Mat4 {
  const index = ref & 0x7fff
  if (ref & 0x8000) {
    const at = animation.pivotPool + index * PIVOT_ENTRY_SIZE
    const pivot = u16(animation.data, at, 'pivot.index') & 0x0f
    if (pivot > 8) throw new NitroGfxError(`rotation pivot index ${pivot} is out of range`, at)
    pivotRotation(
      out,
      pivot,
      fx16ToFloat(u16(animation.data, at + 2, 'pivot.a')),
      fx16ToFloat(u16(animation.data, at + 4, 'pivot.b')),
    )
  } else {
    const at = animation.basisPool + index * BASIS_ENTRY_SIZE
    // 1.0.15, not the 1.3.12 the geometry engine takes: every one of the
    // reference cartridge's stored rows is a unit vector at this scale.
    const v = (k: number) => signExtend(u16(animation.data, at + k * 2, 'basis.value'), 16) / 32768
    basisRotation(out, v(0), v(1), v(2), v(3), v(4))
  }
  return out
}

/**
 * The local transform one track gives its bone on `frame`.
 *
 * A component the animation does not carry is the identity: no translation,
 * no rotation, unit scale. That is what the cartridge's own data says for
 * translation and scale — where a track omits them, the model's bind pose has
 * them at zero and one respectively, for all but one of 5,884 and all 7,828
 * cases. Rotation is less clear cut and is noted in `FORMAT.md`.
 */
export function sampleTrack(
  animation: Animation,
  track: BoneTrack,
  frame: number,
  out: Mat4 = new Float32Array(16),
): Mat4 {
  identity(out)
  const data = animation.data

  if (track.rotation) {
    const ref =
      track.rotation.kind === 'constant'
        ? track.rotation.ref
        : u16(
            data,
            track.rotation.curve.offset + sampleIndex(track.rotation.curve, frame) * 2,
            'rotation.sample',
          )
    rotationFromRef(animation, ref, out)
  }

  if (track.scale) {
    for (let axis = 0; axis < 3; axis++) {
      // Each stored sample is a value followed by its reciprocal; take the value.
      const s = channelAt(data, track.scale[axis] as Channel, frame, 2)
      for (let row = 0; row < 3; row++) out[axis * 4 + row] = (out[axis * 4 + row] as number) * s
    }
  }

  if (track.translation) {
    for (let axis = 0; axis < 3; axis++) {
      out[12 + axis] = channelAt(data, track.translation[axis] as Channel, frame, 1)
    }
  }
  return out
}

/** Every bone's local transform on `frame`, indexed by bone. */
export function sampleAnimation(animation: Animation, frame: number, out: Mat4[] = []): Mat4[] {
  for (let i = out.length; i < animation.boneCount; i++) out.push(identity())
  for (const track of animation.tracks) {
    const target = out[track.index]
    if (target) sampleTrack(animation, track, frame, target)
  }
  return out
}
