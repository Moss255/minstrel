import { describe, expect, it } from 'vitest'
import { NitroGfxError } from '../src/errors.ts'
import { ANIMATION_STAMP, boneTrackSize, isNsbca, readNsbca } from '../src/nsbca.ts'

/** Build an NSBCA holding one animation with the given per-bone flags. */
function buildNsbca(name: string, frames: number, trackFlags: number[]): Uint8Array {
  const bones = trackFlags.length
  const bytes: number[] = []
  const u16 = (v: number) => bytes.push(v & 0xff, (v >>> 8) & 0xff)
  const u32 = (v: number) =>
    bytes.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)

  // --- the animation, built first so its size is known ---
  const anim: number[] = []
  const au16 = (v: number) => anim.push(v & 0xff, (v >>> 8) & 0xff)
  const au32 = (v: number) =>
    anim.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  anim.push(...ANIMATION_STAMP)
  au16(frames)
  au16(bones)
  au32(0)
  const endOffsetAt = anim.length
  au32(0) // patched: end of the track entries
  au32(0)
  const trackOffsetsAt = anim.length
  for (let i = 0; i < bones; i++) au16(0)
  const trackOffsets: number[] = []
  trackFlags.forEach((flags, i) => {
    trackOffsets.push(anim.length)
    const size = boneTrackSize(flags)
    anim.push(flags & 0xff, (flags >>> 8) & 0xff, 0, i)
    for (let k = 4; k < size; k++) anim.push(k & 0xff)
  })
  const tracksEnd = anim.length
  trackOffsets.forEach((offset, i) => {
    anim[trackOffsetsAt + i * 2] = offset & 0xff
    anim[trackOffsetsAt + i * 2 + 1] = (offset >>> 8) & 0xff
  })
  for (let k = 0; k < 4; k++) anim[endOffsetAt + k] = (tracksEnd >>> (k * 8)) & 0xff

  // --- the JNT0 dictionary ---
  const dict: number[] = []
  const du16 = (v: number) => dict.push(v & 0xff, (v >>> 8) & 0xff)
  const du32 = (v: number) =>
    dict.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  const patricia = 4 + 8 + 4
  const dictSize = patricia + 4 + 4 + 16
  dict.push(0, 1)
  du16(dictSize)
  du16(8)
  du16(patricia)
  du32(0x0000017f)
  du32(0)
  du16(4)
  du16(8)
  const animOffsetAt = dict.length
  du32(0) // patched once the animation's position is known
  for (let i = 0; i < 16; i++) dict.push(i < name.length ? name.charCodeAt(i) : 0)

  const blockHeader = 8
  const animOffset = blockHeader + dict.length
  for (let k = 0; k < 4; k++) dict[animOffsetAt + k] = (animOffset >>> (k * 8)) & 0xff

  const blockSize = blockHeader + dict.length + anim.length
  const total = 0x14 + blockSize

  bytes.push(0x42, 0x43, 0x41, 0x30) // 'BCA0'
  u16(0xfeff)
  u16(1)
  u32(total)
  u16(0x10)
  u16(1)
  u32(0x14)
  bytes.push(0x4a, 0x4e, 0x54, 0x30) // 'JNT0'
  u32(blockSize)
  bytes.push(...dict, ...anim)
  return Uint8Array.from(bytes)
}

describe('boneTrackSize', () => {
  it('is 60 bytes with no flag bits set', () => {
    expect(boneTrackSize(0)).toBe(60)
  })

  it('subtracts a 12-byte block for bit 1 and 24 for bit 9', () => {
    expect(boneTrackSize(1 << 1)).toBe(48)
    expect(boneTrackSize(1 << 9)).toBe(36)
    expect(boneTrackSize((1 << 1) | (1 << 9))).toBe(24)
  })

  it('subtracts four bytes for each of bits 3, 4, 5, 6 and 8', () => {
    for (const bit of [3, 4, 5, 6, 8]) expect(boneTrackSize(1 << bit), `bit ${bit}`).toBe(56)
    expect(boneTrackSize((1 << 3) | (1 << 4) | (1 << 5) | (1 << 6) | (1 << 8))).toBe(40)
  })

  it('ignores bits that carry no size', () => {
    for (const bit of [0, 2, 7, 10, 11, 12, 13, 14, 15]) {
      expect(boneTrackSize(1 << bit), `bit ${bit}`).toBe(60)
    }
  })

  it('reproduces lengths seen on real animations', () => {
    // Flag values taken from the reference cartridge, with the lengths its own
    // track offsets imply.
    expect(boneTrackSize(0x3b7b)).toBe(4)
    expect(boneTrackSize(0x3a3a)).toBe(12)
    expect(boneTrackSize(0x3b78)).toBe(16)
    expect(boneTrackSize(0x3b38)).toBe(20)
    expect(boneTrackSize(0x3a38)).toBe(24)
    expect(boneTrackSize(0x3a28)).toBe(28)
    expect(boneTrackSize(0x3a00)).toBe(36)
    expect(boneTrackSize(0x0178)).toBe(40)
  })
})

describe('readNsbca', () => {
  const sample = () => buildNsbca('walk', 30, [0x3a38, 0x3b7b, 0x3a00])

  it('reads the animation list', () => {
    const nsbca = readNsbca(sample())
    expect(nsbca.animations).toHaveLength(1)
    expect(nsbca.animation('walk')?.frameCount).toBe(30)
    expect(nsbca.animation('walk')?.boneCount).toBe(3)
  })

  it('gives each track its bone index and flags', () => {
    const animation = readNsbca(sample()).animations[0]
    expect(animation?.tracks.map((t) => t.index)).toEqual([0, 1, 2])
    expect(animation?.tracks.map((t) => t.flags)).toEqual([0x3a38, 0x3b7b, 0x3a00])
  })

  it('sizes each track payload from its flags', () => {
    const animation = readNsbca(sample()).animations[0]
    expect(animation?.tracks[0]?.payload).toHaveLength(boneTrackSize(0x3a38) - 4)
    expect(animation?.tracks[1]?.payload).toHaveLength(0)
    expect(animation?.tracks[2]?.payload).toHaveLength(boneTrackSize(0x3a00) - 4)
  })

  it('lays tracks end to end', () => {
    const animation = readNsbca(sample()).animations[0]
    const tracks = animation?.tracks ?? []
    for (let i = 0; i < tracks.length - 1; i++) {
      const here = tracks[i] as (typeof tracks)[number]
      const next = tracks[i + 1] as (typeof tracks)[number]
      expect(here.offset + boneTrackSize(here.flags)).toBe(next.offset)
    }
  })

  it('handles an animation with no bones', () => {
    const animation = readNsbca(buildNsbca('still', 1, [])).animations[0]
    expect(animation?.tracks).toEqual([])
  })
})

describe('isNsbca', () => {
  it('recognises the stamp without validating the body', () => {
    expect(isNsbca(buildNsbca('a', 1, [0]))).toBe(true)
    expect(isNsbca(new Uint8Array(16))).toBe(false)
  })
})

describe('readNsbca on malformed input', () => {
  it('rejects a buffer that is not an NSBCA', () => {
    expect(() => readNsbca(new Uint8Array(32))).toThrow(/not an NSBCA/)
  })

  it('rejects a declared size larger than the buffer', () => {
    const data = buildNsbca('a', 1, [0x3a38])
    new DataView(data.buffer).setUint32(0x08, data.length + 4096, true)
    expect(() => readNsbca(data)).toThrow(/only \d+ are present/)
  })

  it('rejects a block that is not JNT0', () => {
    const data = buildNsbca('a', 1, [0x3a38])
    data.set([0x58, 0x58, 0x58, 0x58], 0x14)
    expect(() => readNsbca(data)).toThrow(/expected 'JNT0'/)
  })

  it('rejects an animation without the expected stamp', () => {
    const data = buildNsbca('a', 1, [0x3a38])
    // Find the animation through the file's own dictionary rather than by
    // arithmetic, then corrupt its stamp.
    const view = new DataView(data.buffer)
    const blockOffset = view.getUint32(0x10, true)
    let animOffset = -1
    for (let at = blockOffset; at < data.length - 4; at++) {
      if (
        data[at] === 0x4a &&
        data[at + 1] === 0x00 &&
        data[at + 2] === 0x41 &&
        data[at + 3] === 0x43
      ) {
        animOffset = at
        break
      }
    }
    expect(animOffset).toBeGreaterThan(0)
    data[animOffset + 1] = 0xff
    expect(() => readNsbca(data)).toThrow(NitroGfxError)
  })
})
