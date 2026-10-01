import { describe, expect, it } from 'vitest'
import { NitroGfxError, patternAt, readNsbtp } from '../src/index.ts'

/**
 * An NSBTP built in code — never taken from a cartridge — to the layout
 * `patanim.ts` reads, the game's own (`NSBXXAnimationMPT`): a Nitro container,
 * one `PAT0` block of one `M\0PT` animation, its track list, the keyframes,
 * then the texture and palette names.
 */
const le16 = (v: number) => [v & 0xff, (v >>> 8) & 0xff]
const le32 = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]
const name16 = (name: string) => Array.from({ length: 16 }, (_, i) => name.charCodeAt(i) || 0)

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

/** A material `fire` that runs `tex0`, `tex1`, `tex0` at frames 0, 4 and 8, the last on palette `pal1`. */
function nsbtp(keyframeCount = 3): Uint8Array {
  const listSize = dict([{ name: 'fire', data: new Array(8).fill(0) }], 8).length
  const keysAt = 0x0c + listSize
  const keys = [
    [0, 0, 0xff],
    [4, 1, 0xff],
    [8, 0, 1],
  ].flatMap(([frame, tex, pal]) => [...le16(frame as number), tex as number, pal as number])
  const texturesAt = keysAt + keys.length
  const palettesAt = texturesAt + 2 * 16
  const animation = [
    0x4d,
    0,
    0x50,
    0x54,
    ...le16(12),
    2,
    2,
    ...le16(texturesAt),
    ...le16(palettesAt),
    ...dict(
      [
        {
          name: 'fire',
          data: [...le16(keyframeCount), ...le16(0), ...le16(0x555), ...le16(keysAt)],
        },
      ],
      8,
    ),
    ...keys,
    ...name16('tex0'),
    ...name16('tex1'),
    ...name16('pal0'),
    ...name16('pal1'),
  ]
  const blockList = dict([{ name: 'anim', data: le32(0) }], 4)
  const animationAt = 8 + blockList.length
  const block = [
    ...[...'PAT0'].map((c) => c.charCodeAt(0)),
    ...le32(animationAt + animation.length),
    ...dict([{ name: 'anim', data: le32(animationAt) }], 4),
    ...animation,
  ]
  return Uint8Array.from([
    ...[...'BTP0'].map((c) => c.charCodeAt(0)),
    0xff,
    0xfe,
    1,
    0,
    ...le32(0x14 + block.length),
    ...le16(0x10),
    ...le16(1),
    ...le32(0x14),
    ...block,
  ])
}

describe('texture pattern animation, NSBTP', () => {
  it('reads an animation’s tracks by material, each keyframe a texture and a palette by name', () => {
    const [animation] = readNsbtp(nsbtp())
    expect(animation?.name).toBe('anim')
    expect(animation?.frameCount).toBe(12)
    const track = animation?.tracks[0]
    expect(track?.material).toBe('fire')
    expect(track?.keyframes).toEqual([
      { frame: 0, texture: 'tex0', palette: undefined },
      { frame: 4, texture: 'tex1', palette: undefined },
      { frame: 8, texture: 'tex0', palette: 'pal1' },
    ])
  })

  it('takes, at a frame, the last keyframe not past it', () => {
    const track = readNsbtp(nsbtp())[0]?.tracks[0]
    if (!track) throw new Error('no track')
    expect(patternAt(track, 0)?.texture).toBe('tex0')
    expect(patternAt(track, 3.9)?.texture).toBe('tex0')
    expect(patternAt(track, 4)?.texture).toBe('tex1')
    expect(patternAt(track, 11)?.palette).toBe('pal1')
  })

  it('throws on a wrong stamp, a cut file, or keyframes past the end', () => {
    expect(() => readNsbtp(new Uint8Array(32))).toThrow(NitroGfxError)
    const whole = nsbtp()
    expect(() => readNsbtp(whole.subarray(0, whole.length - 70))).toThrow(NitroGfxError)
    expect(() => readNsbtp(nsbtp(400))).toThrow(NitroGfxError)
  })
})
