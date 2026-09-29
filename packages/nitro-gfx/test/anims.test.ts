import { describe, expect, it } from 'vitest'
import {
  NitroGfxError,
  readNsbma,
  readNsbta,
  sampleMatChannel,
  sampleMatTrack,
  sampleTexChannel,
  sampleTexTrack,
} from '../src/index.ts'

/**
 * NSBTA and NSBMA files built in code — never taken from a cartridge — to the
 * layout `texanim.ts` and `matanim.ts` read: a Nitro container, one block of
 * one animation, a name list of tracks, and the samples after it, their
 * offsets from the animation's stamp.
 */
const le16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff]
const le32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]
const name16 = (name: string) => Array.from({ length: 16 }, (_, i) => name.charCodeAt(i) || 0)

/** A name list of items, each `itemSize` bytes. */
function dict(items: { name: string; data: number[] }[], itemSize: number): number[] {
  const count = items.length
  const patricia = 12 + count * 4
  const size = patricia + 4 + count * itemSize + count * 16
  return [
    0,
    count,
    ...le16(size),
    ...le16(8),
    ...le16(patricia),
    ...le32(0x17f),
    ...items.flatMap(() => le32(0)),
    ...le16(itemSize),
    ...le16(4 + count * itemSize),
    ...items.flatMap((item) => item.data),
    ...items.flatMap((item) => name16(item.name)),
  ]
}

/** A container of one block of one animation: `tracks` word lists, `samples` bytes after them. */
function file(
  stamp: string,
  block: string,
  kind: string,
  frames: number,
  tracks: { name: string; words: (at: number) => number[] }[],
  trackSize: number,
  samples: number[],
): Uint8Array {
  // The animation: its stamp, frames, a halfword, the track list, then the samples.
  const listSize = dict(
    tracks.map((t) => ({ name: t.name, data: new Array(trackSize).fill(0) })),
    trackSize,
  ).length
  const samplesAt = 8 + listSize
  const animation = [
    0x4d,
    0,
    kind.charCodeAt(0),
    kind.charCodeAt(1),
    ...le16(frames),
    ...le16(0x0303),
    ...dict(
      tracks.map((t) => ({ name: t.name, data: t.words(samplesAt) })),
      trackSize,
    ),
    ...samples,
  ]
  const blockList = dict([{ name: 'anim', data: le32(0) }], 4)
  const animationAt = 8 + blockList.length
  const blockBytes = [
    ...[...block].map((c) => c.charCodeAt(0)),
    ...le32(animationAt + animation.length),
    ...dict([{ name: 'anim', data: le32(animationAt) }], 4),
    ...animation,
  ]
  const total = 0x14 + blockBytes.length
  return Uint8Array.from([
    ...[...stamp].map((c) => c.charCodeAt(0)),
    0xff,
    0xfe,
    1,
    0,
    ...le32(total),
    ...le16(0x10),
    ...le16(1),
    ...le32(0x14),
    ...blockBytes,
  ])
}

describe('texture animation, NSBTA', () => {
  // A track: scale S 1, scale T ½, no turn, translate S 0, translate T sampled as s16 every frame.
  const nsbta = () =>
    file(
      'BTA0',
      'SRT0',
      'AT',
      4,
      [
        {
          name: 'Material1',
          words: (at) => [
            ...le32(0x20000000),
            ...le32(0x1000),
            ...le32(0x20000000),
            ...le32(0x800),
            ...le32(0x20000000),
            ...le32(0x10000000),
            ...le32(0x20000000),
            ...le32(0),
            ...le32(0x10000000 | 4),
            ...le32(at),
          ],
        },
      ],
      40,
      [...le16(0), ...le16(0), ...le16(-1024 & 0xffff), ...le16(-2048 & 0xffff)],
    )

  it('reads a track’s five channels, held values and samples', () => {
    const [animation] = readNsbta(nsbta())
    expect(animation?.frameCount).toBe(4)
    const track = animation?.tracks[0]
    expect(track?.material).toBe('Material1')
    const at = (f: number) => (track ? sampleTexTrack(track, f) : undefined)
    expect(at(0)).toMatchObject({ scaleS: 4096, scaleT: 2048, sin: 0, cos: 4096, translateT: 0 })
    expect(at(3)?.translateT).toBe(-2048)
  })

  it('fills the frames between every second or fourth sample as the game does', () => {
    const halves = { samples: [0, 400, 800], rate: 2 as const, end: 4 }
    expect([0, 1, 2, 3, 4].map((f) => sampleTexChannel(halves, f))).toEqual([0, 200, 400, 600, 800])
    const quarters = { samples: [0, 400, 800], rate: 4 as const, end: 8 }
    // Quarter-way three to one toward the nearer, half-way the mean.
    expect([1, 2, 3, 4].map((f) => sampleTexChannel(quarters, f))).toEqual([100, 200, 300, 400])
  })

  it('refuses what is not one, and a track that runs off the end', () => {
    expect(() => readNsbta(new Uint8Array(32))).toThrow(NitroGfxError)
    const cut = nsbta()
    expect(() => readNsbta(cut.subarray(0, cut.length - 6))).toThrow(NitroGfxError)
  })
})

describe('material animation, NSBMA', () => {
  // Diffuse white and ambient grey held; specular, emission black; alpha sampled every frame.
  const nsbma = () =>
    file(
      'BMA0',
      'MAT0',
      'AM',
      4,
      [
        {
          name: 'Material1',
          words: (at) => [
            ...le32(0x20000000 | 0x7fff),
            ...le32(0x20000000 | 0x2529),
            ...le32(0x20000000),
            ...le32(0x20000000),
            ...le32((4 << 16) | at),
          ],
        },
      ],
      20,
      [0, 31, 20, 10],
    )

  it('reads a track’s colours and alpha, frame by frame', () => {
    const [animation] = readNsbma(nsbma())
    const track = animation?.tracks[0]
    expect(track?.material).toBe('Material1')
    expect(track && sampleMatTrack(track, 1)).toEqual({
      diffuse: 0x7fff,
      ambient: 0x2529,
      specular: 0,
      emission: 0,
      alpha: 31,
    })
    expect(track && [0, 1, 2, 3].map((f) => sampleMatTrack(track, f).alpha)).toEqual([
      0, 31, 20, 10,
    ])
  })

  it('mixes colours channel by channel between samples', () => {
    const red = 0x001f
    const blue = 0x7c00
    const mixed = sampleMatChannel({ samples: [red, blue], rate: 2, frames: 2 }, 1, true)
    expect(mixed & 0x1f).toBe(15)
    expect((mixed >> 10) & 0x1f).toBe(15)
  })

  it('refuses what is not one', () => {
    expect(() => readNsbma(new Uint8Array(32))).toThrow(NitroGfxError)
    const cut = nsbma()
    expect(() => readNsbma(cut.subarray(0, cut.length - 3))).toThrow(NitroGfxError)
  })
})
