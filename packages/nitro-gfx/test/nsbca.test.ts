import { describe, expect, it } from 'vitest'
import { NitroGfxError } from '../src/errors.ts'
import { identity } from '../src/matrix.ts'
import {
  ANIMATION_STAMP,
  type Animation,
  type BoneTrack,
  boneTrackSize,
  isNsbca,
  readNsbca,
  sampleAnimation,
} from '../src/nsbca.ts'
import { basisRotation } from '../src/rotation.ts'

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

  it('sizes each track from its flags', () => {
    const animation = readNsbca(sample()).animations[0]
    expect(animation?.tracks.map((t) => t.size)).toEqual([
      boneTrackSize(0x3a38),
      boneTrackSize(0x3b7b),
      boneTrackSize(0x3a00),
    ])
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

/**
 * An animation with content rather than filler: three bones covering a constant
 * transform, curves of both kinds, and a bone the animation does not touch.
 *
 * Everything is assembled here from the format's own rules, so the fixture is
 * synthetic — no cartridge bytes.
 */
function buildAnimated(): Uint8Array {
  const anim: number[] = []
  const au16 = (v: number) => anim.push(v & 0xff, (v >>> 8) & 0xff)
  const au32 = (v: number) =>
    anim.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  const fx32 = (v: number) => au32(Math.round(v * 4096) >>> 0)
  const fx16 = (v: number) => au16(Math.round(v * 4096) & 0xffff)
  const unit = (v: number) => au16(Math.round(v * 32768) & 0xffff)

  const flags = [
    // constant translation, constant rotation, constant scale
    (1 << 3) | (1 << 4) | (1 << 5) | (1 << 8) | (1 << 11) | (1 << 12) | (1 << 13),
    // X translation on a curve, Y and Z constant; rotation on a curve; no scale
    (1 << 4) | (1 << 5) | (1 << 9),
    // untouched
    0x3b7b,
  ]

  anim.push(...ANIMATION_STAMP)
  au16(4) // frames
  au16(3) // bones
  au32(0)
  const poolsAt = anim.length
  au32(0)
  au32(0)
  const trackOffsetsAt = anim.length
  for (let i = 0; i < 3; i++) au16(0)

  const patch32 = (at: number, v: number) => {
    for (let k = 0; k < 4; k++) anim[at + k] = (v >>> (k * 8)) & 0xff
  }
  const trackOffsets: number[] = []
  const holes: Record<string, number> = {}

  // bone 0
  trackOffsets.push(anim.length)
  au16(flags[0] as number)
  anim.push(0, 0)
  fx32(1)
  fx32(2)
  fx32(3)
  au16(0x8000) // pivot pool entry 0
  au16(0)
  for (let axis = 0; axis < 3; axis++) {
    fx32(2)
    fx32(0.5)
  }

  // bone 1
  trackOffsets.push(anim.length)
  au16(flags[1] as number)
  anim.push(0, 1)
  au16(0) // curve start frame
  au16(4) // curve end frame, code 0
  holes.translationX = anim.length
  au32(0)
  fx32(-1)
  fx32(-2)
  au16(0)
  au16(4)
  holes.rotation = anim.length
  au32(0)

  // bone 2
  trackOffsets.push(anim.length)
  au16(flags[2] as number)
  anim.push(0, 2)

  trackOffsets.forEach((offset, i) => {
    anim[trackOffsetsAt + i * 2] = offset & 0xff
    anim[trackOffsetsAt + i * 2 + 1] = (offset >>> 8) & 0xff
  })

  patch32(poolsAt, anim.length)
  au16(4) // pivot index: the centre cell
  fx16(0)
  fx16(1)

  // A turn of 60 degrees about z. 1.0.15 cannot hold 1, so an axis-aligned
  // basis would not round-trip; this one does.
  patch32(poolsAt + 4, anim.length)
  unit(0.5)
  unit(-Math.sqrt(3) / 2)
  unit(0)
  unit(Math.sqrt(3) / 2)
  unit(0.5)

  patch32(holes.rotation as number, anim.length)
  au16(0) // basis pool entry 0
  au16(0x8000) // pivot pool entry 0
  au16(0x8000)
  au16(0)

  patch32(holes.translationX as number, anim.length)
  for (const v of [10, 20, 30, 40]) fx32(v)

  // --- wrap it in a JNT0 block and a BCA0 container ---
  const name = 'anim'
  const dict: number[] = []
  const du16 = (v: number) => dict.push(v & 0xff, (v >>> 8) & 0xff)
  const du32 = (v: number) =>
    dict.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  const patricia = 4 + 8 + 4
  dict.push(0, 1)
  du16(patricia + 4 + 4 + 16)
  du16(8)
  du16(patricia)
  du32(0x0000017f)
  du32(0)
  du16(4)
  du16(8)
  const animOffsetAt = dict.length
  du32(0)
  for (let i = 0; i < 16; i++) dict.push(i < name.length ? name.charCodeAt(i) : 0)
  const animOffset = 8 + dict.length
  for (let k = 0; k < 4; k++) dict[animOffsetAt + k] = (animOffset >>> (k * 8)) & 0xff

  const blockSize = 8 + dict.length + anim.length
  const bytes: number[] = []
  const u16 = (v: number) => bytes.push(v & 0xff, (v >>> 8) & 0xff)
  const u32 = (v: number) =>
    bytes.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  bytes.push(0x42, 0x43, 0x41, 0x30)
  u16(0xfeff)
  u16(1)
  u32(0x14 + blockSize)
  u16(0x10)
  u16(1)
  u32(0x14)
  bytes.push(0x4a, 0x4e, 0x54, 0x30)
  u32(blockSize)
  bytes.push(...dict, ...anim)
  return Uint8Array.from(bytes)
}

describe('bone track fields', () => {
  const animation = () => readNsbca(buildAnimated()).animations[0] as Animation

  it('reads a constant transform', () => {
    const track = animation().tracks[0] as BoneTrack
    expect(track.translation?.map((c) => c.kind === 'constant' && c.value)).toEqual([1, 2, 3])
    expect(track.rotation).toEqual({ kind: 'constant', ref: 0x8000 })
    expect(track.scale?.map((c) => c.kind === 'constant' && c.reciprocal)).toEqual([0.5, 0.5, 0.5])
  })

  it('mixes curves and constants across the axes', () => {
    const track = animation().tracks[1] as BoneTrack
    expect(track.translation?.map((c) => c.kind)).toEqual(['curve', 'constant', 'constant'])
    expect(track.rotation?.kind).toBe('curve')
    expect(track.scale).toBeUndefined()
  })

  it('leaves an untouched bone with no components', () => {
    const track = animation().tracks[2] as BoneTrack
    expect(track.translation).toBeUndefined()
    expect(track.rotation).toBeUndefined()
    expect(track.scale).toBeUndefined()
  })

  it('takes the sample count and width from the curve header', () => {
    const track = animation().tracks[1] as BoneTrack
    const channel = track.translation?.[0]
    if (channel?.kind !== 'curve') throw new Error('expected a curve')
    expect(channel.curve).toMatchObject({ startFrame: 0, endFrame: 4, count: 4, step: 1 })
    expect(channel.curve.narrow).toBe(false)
  })
})

/** A matrix's 3x3 applied to a vector, column-major. */
function apply(m: ArrayLike<number>, v: readonly [number, number, number]): number[] {
  const at = (r: number, c: number) => m[c * 4 + r] as number
  return [0, 1, 2].map((r) => at(r, 0) * v[0] + at(r, 1) * v[1] + at(r, 2) * v[2])
}

describe('sampleAnimation', () => {
  const animation = () => readNsbca(buildAnimated()).animations[0] as Animation

  it('holds a constant transform across every frame', () => {
    const anim = animation()
    for (const frame of [0, 1, 2, 3]) {
      const local = sampleAnimation(anim, frame)[0] as Float32Array
      expect([local[12], local[13], local[14]]).toEqual([1, 2, 3])
      // Pivot 4 with a = 0, b = 1 turns the x and z axes into each other, and
      // the scale of 2 goes with them. Asserted by what the matrix does to a
      // vector rather than by which cells hold what, so it says the same thing
      // whichever way round the file stores its rotations.
      // A quarter turn about y, carrying the scale of 2 with it: x goes to z,
      // z comes back as -x, and y is left where it was.
      expect(apply(local, [1, 0, 0]).map(Math.round)).toEqual([0, 0, 2])
      expect(apply(local, [0, 1, 0]).map(Math.round)).toEqual([0, 2, 0])
      expect(apply(local, [0, 0, 1]).map(Math.round)).toEqual([-2, 0, 0])
    }
  })

  it('walks a translation curve one sample per frame', () => {
    const anim = animation()
    expect([0, 1, 2, 3].map((f) => (sampleAnimation(anim, f)[1] as Float32Array)[12])).toEqual([
      10, 20, 30, 40,
    ])
  })

  it('clamps past the end of a curve rather than reading beyond it', () => {
    const anim = animation()
    expect((sampleAnimation(anim, 99)[1] as Float32Array)[12]).toBe(40)
    expect((sampleAnimation(anim, -5)[1] as Float32Array)[12]).toBe(10)
  })

  it('resolves rotation samples through whichever pool the reference names', () => {
    const anim = animation()
    // Frame 0 names the basis pool, whose only entry turns 60 degrees about z.
    // Asserted by what the rotation does rather than by which cells hold what.
    const first = sampleAnimation(anim, 0)[1] as Float32Array
    const turned = apply(first, [1, 0, 0])
    expect(Math.hypot(turned[0] as number, turned[1] as number, turned[2] as number)).toBeCloseTo(
      1,
      4,
    )
    expect(turned[2]).toBeCloseTo(0, 4)
    // The axis it turns about is untouched, and it is the one the pool encodes.
    const axis = apply(first, [0, 0, 1])
    expect(axis.map((v) => Math.round(v))).toEqual([0, 0, 1])
    // Frame 1 names the pivot pool, and gives a different rotation.
    const second = sampleAnimation(anim, 1)[1] as Float32Array
    expect(Array.from(second.subarray(0, 3))).not.toEqual(Array.from(first.subarray(0, 3)))
  })

  it('leaves an untouched bone at the identity', () => {
    const local = sampleAnimation(animation(), 2)[2] as Float32Array
    expect(Array.from(local)).toEqual(Array.from(identity()))
  })
})

describe('basisRotation', () => {
  const build = (a: number, b: number, c: number, d: number, e: number) => {
    const out = identity()
    basisRotation(out, a, b, c, d, e)
    return out
  }
  const orthonormal = (m: Float32Array) => {
    const col = (i: number) => [m[i * 4] as number, m[i * 4 + 1] as number, m[i * 4 + 2] as number]
    const dot = (x: number[], y: number[]) =>
      (x[0] as number) * (y[0] as number) +
      (x[1] as number) * (y[1] as number) +
      (x[2] as number) * (y[2] as number)
    const [u, v, w] = [col(0), col(1), col(2)]
    return (
      Math.abs(dot(u, u) - 1) < 1e-3 &&
      Math.abs(dot(v, v) - 1) < 1e-3 &&
      Math.abs(dot(w, w) - 1) < 1e-3 &&
      Math.abs(dot(u, v)) < 1e-3 &&
      Math.abs(dot(u, w)) < 1e-3 &&
      Math.abs(dot(v, w)) < 1e-3
    )
  }

  it('recovers the cell the format does not store', () => {
    // A turn of 60 degrees about z: row 1's third cell is zero.
    const s = Math.sqrt(3) / 2
    const m = build(0.5, -s, 0, s, 0.5)
    expect(orthonormal(m)).toBe(true)
    expect(m[8]).toBeCloseTo(0, 5)
    expect(m[9]).toBeCloseTo(0, 5)
    expect(m[10]).toBeCloseTo(1, 5)
  })

  it('holds up when the row it would divide by is zero', () => {
    // row0[2] == 0 makes the dot-product solve divide by zero; the magnitude
    // form has to carry it.
    expect(orthonormal(build(-0.2456, 0.9695, 0, -0.9695, -0.2456))).toBe(true)
  })

  it('holds up when the cell it recovers is zero and the inputs are quantised', () => {
    // A turn about y, with the neighbouring cell quantised to 0.9998 — the
    // closest 1.0.15 comes to one. Taking the magnitude there would invent a
    // third cell of 0.02 out of the rounding.
    const m = build(0.0776, 0, 0.9971, -0.0015, 0.9998)
    expect(orthonormal(m)).toBe(true)
    expect(m[9]).toBeCloseTo(0, 2)
  })

  it('returns a rotation even where both solves are degenerate', () => {
    expect(orthonormal(build(0.9988, -0.05, 0, 0.0502, 0.9988))).toBe(true)
  })
})
