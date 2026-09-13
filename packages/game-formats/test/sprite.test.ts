import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { isSprite, readSprite } from '../src/sprite.ts'

/**
 * Fixtures are built here, never taken from a cartridge.
 *
 * A `.spr` is a frame count and a version, then each frame — its size, its
 * part count and a zero — and each part — where it goes, its size as powers of
 * two times eight, and its 4bpp pixels a row at a time — then a palette behind
 * its count word, then the animations.
 */
interface PartSpec {
  x: number
  y: number
  /** Powers: the part is `8 << w` by `8 << h`. */
  w: number
  h: number
  ink?: (x: number, y: number) => number
}
function build(options: {
  frames: { width: number; height: number; parts: PartSpec[] }[]
  colours?: number[]
  count?: number
  version?: number
  animations?: { name: string; frames: number[]; duration?: number }[]
}): Uint8Array {
  const bytes: number[] = []
  const push16 = (v: number) => bytes.push(v & 0xff, (v >>> 8) & 0xff)
  const push32 = (v: number) => {
    push16(v & 0xffff)
    push16(v >>> 16)
  }
  push16(options.frames.length)
  push16(options.version ?? 3)
  for (const frame of options.frames) {
    push16(frame.width)
    push16(frame.height)
    push16(frame.parts.length)
    push16(0)
    for (const part of frame.parts) {
      push16(part.x & 0xffff)
      push16(part.y & 0xffff)
      push16(part.w)
      push16(part.h)
      const pw = 8 << part.w
      const ph = 8 << part.h
      const ink = part.ink ?? (() => 1)
      for (let i = 0; i < pw * ph; i += 2) {
        const at = (n: number) => ink(n % pw, Math.floor(n / pw)) & 0x0f
        bytes.push(at(i) | (at(i + 1) << 4))
      }
    }
  }
  const colours = options.colours ?? Array.from({ length: 16 }, (_, i) => (i * 0x111) & 0x7fff)
  push32(options.count ?? colours.length)
  for (const c of colours) push16(c)
  if (options.animations) {
    // Names in 30-byte slots, then one record each.
    for (const a of options.animations) {
      const slot = new Array(30).fill(0)
      for (let c = 0; c < a.name.length; c++) slot[c] = a.name.charCodeAt(c)
      bytes.push(...slot)
    }
    for (const a of options.animations) {
      push32(a.frames.length)
      for (let i = 0; i < a.frames.length; i++) push32(i)
      for (let i = 0; i < a.frames.length; i++) push32(a.duration ?? 8)
      for (const f of a.frames) push32(f)
    }
  }
  return Uint8Array.from(bytes)
}

/** A villager's frame: 32x40, the top eight rows one part and the 32x32 below another. */
const villagerFrame = (topInk = 2, bodyInk = 3) => ({
  width: 32,
  height: 40,
  parts: [
    { x: 0, y: 0, w: 2, h: 0, ink: () => topInk },
    { x: 0, y: 8, w: 2, h: 2, ink: () => bodyInk },
  ],
})

describe('readSprite', () => {
  it('reads each frame as its parts put together', () => {
    const s = readSprite(build({ frames: [villagerFrame(), villagerFrame(4, 5)] }))
    expect(s.frames).toBe(2)
    expect(s.width).toBe(32)
    expect(s.height).toBe(40)
    expect(s.layout[0]?.parts.map((p) => [p.x, p.y, p.width, p.height])).toEqual([
      [0, 0, 32, 8],
      [0, 8, 32, 32],
    ])
    const { width, height, pixels } = s.decode(1)
    expect([width, height]).toEqual([32, 40])
    // Row 0 is the top part's, row 8 on the body's: the whole figure, top and all.
    const red = (index: number) => Math.round((((index * 0x111) & 0x7fff & 31) * 255) / 31)
    expect(pixels[0]).toBe(red(4))
    expect(pixels[(8 * 32 + 5) * 4]).toBe(red(5))
    expect(pixels[(39 * 32 + 31) * 4 + 3]).toBe(255)
  })

  it('lays parts of different sizes side by side, each its own rows', () => {
    // The breaking barrel's shape: 8, 16 and 32 wide across a 56x32 frame.
    const s = readSprite(
      build({
        frames: [
          {
            width: 56,
            height: 32,
            parts: [
              { x: 0, y: 0, w: 0, h: 2, ink: () => 1 },
              { x: 8, y: 0, w: 1, h: 2, ink: (x) => (x < 8 ? 2 : 3) },
              { x: 24, y: 0, w: 2, h: 2, ink: (_, y) => (y < 16 ? 4 : 5) },
            ],
          },
        ],
        colours: Array.from({ length: 16 }, (_, i) => i),
      }),
    )
    const { width, pixels } = s.decode(0)
    const indexAt = (x: number, y: number) =>
      Math.round(((pixels[(y * width + x) * 4] as number) * 31) / 255)
    expect(width).toBe(56)
    expect(indexAt(3, 20)).toBe(1)
    expect(indexAt(8 + 2, 5)).toBe(2)
    expect(indexAt(8 + 12, 5)).toBe(3)
    expect(indexAt(24 + 31, 3)).toBe(4)
    expect(indexAt(24, 31)).toBe(5)
  })

  it('places a part by its signed position, and drops what falls outside the frame', () => {
    const s = readSprite(
      build({ frames: [{ width: 8, height: 8, parts: [{ x: -4, y: 0, w: 0, h: 0 }] }] }),
    )
    const { pixels } = s.decode(0)
    expect(s.layout[0]?.parts[0]?.x).toBe(-4)
    expect(pixels[3 * 4 + 3]).toBe(255)
    expect(pixels[4 * 4 + 3]).toBe(0)
  })

  it('decodes index 0 as transparent, and reads the palette as BGR555', () => {
    const s = readSprite(
      build({
        frames: [{ width: 8, height: 8, parts: [{ x: 0, y: 0, w: 0, h: 0, ink: (x) => x % 4 }] }],
        colours: [0x7fff, 0x001f, 0x03e0, 0x7c00, ...Array(12).fill(0)],
      }),
    )
    const colours = Array.from(s.palette)
    expect(colours[1]).toBe(0xff0000ff)
    expect(colours[2]).toBe(0xff00ff00)
    expect(colours[3]).toBe(0xffff0000)
    const { pixels } = s.decode(0)
    expect(pixels[3]).toBe(0)
    expect(pixels[4 + 3]).toBe(255)
  })

  it('reads a palette of fewer than sixteen colours, and ignores bit 15', () => {
    const s = readSprite(
      build({
        frames: [villagerFrame()],
        colours: [0, 0x801f, ...Array(10).fill(0x03e0)],
      }),
    )
    expect(s.colours).toBe(12)
    expect(Array.from(s.palette)[1]).toBe(0xff0000ff)
    // Past the count there is no colour: an index there is not drawn.
    expect(Array.from(s.palette)[13]).toBe(0)
  })
})

describe('readSprite on malformed input', () => {
  it('throws when the file is shorter than a header and a frame', () => {
    expect(() => readSprite(new Uint8Array(8))).toThrow(GameFormatError)
  })

  it('throws when the sheet declares no frames', () => {
    expect(() => readSprite(build({ frames: [] }))).toThrow(/0 frames/)
  })

  it('throws when a part runs past the end, or is sized past any part', () => {
    const data = build({ frames: [villagerFrame()] })
    expect(() => readSprite(data.subarray(0, 100))).toThrow(/past the end/)
    const huge = build({ frames: [{ width: 8, height: 8, parts: [{ x: 0, y: 0, w: 0, h: 0 }] }] })
    new DataView(huge.buffer).setUint16(4 + 8 + 4, 9, true)
    expect(() => readSprite(huge)).toThrow(/sized 9/)
  })

  it('throws when the palette count says nothing', () => {
    expect(() => readSprite(build({ frames: [villagerFrame()], count: 0 }))).toThrow(/no palette/)
  })

  it('throws for a frame that is not in the sheet', () => {
    const s = readSprite(build({ frames: [villagerFrame()] }))
    expect(() => s.decode(1)).toThrow(/frame 1/)
    expect(() => s.decode(-1)).toThrow(GameFormatError)
  })
})

describe('isSprite', () => {
  it('accepts a sheet whose frames lead to its palette', () => {
    expect(isSprite(build({ frames: [villagerFrame()] }))).toBe(true)
  })

  it('rejects another version, a short file, and parts that run past the end', () => {
    expect(isSprite(build({ frames: [villagerFrame()], version: 2 }))).toBe(false)
    expect(isSprite(new Uint8Array(10))).toBe(false)
    expect(isSprite(build({ frames: [villagerFrame()] }).subarray(0, 300))).toBe(false)
  })
})

/** A villager's twelve animations, frames as a real sheet lays them out. */
const VILLAGER_ANIMS = [
  { name: 'walk_down', frames: [0, 1, 2, 1] },
  { name: 'walk_left', frames: [6, 7, 8, 7] },
  { name: 'walk_up', frames: [3, 4, 5, 4] },
  { name: 'walk_right', frames: [9, 10, 11, 10] },
  { name: 'stand_down', frames: [1], duration: 60 },
  { name: 'stand_l_down', frames: [12], duration: 60 },
  { name: 'stand_left', frames: [7], duration: 60 },
  { name: 'stand_l_up', frames: [14], duration: 60 },
  { name: 'stand_up', frames: [4], duration: 60 },
  { name: 'stand_r_up', frames: [15], duration: 60 },
  { name: 'stand_right', frames: [10], duration: 60 },
  { name: 'stand_r_down', frames: [13], duration: 60 },
]

describe('the animation table', () => {
  const sixteen = Array.from({ length: 16 }, () => villagerFrame())
  const sheet = () => readSprite(build({ frames: sixteen, animations: VILLAGER_ANIMS }))

  it('reads every animation, in file order, with the frame each step shows', () => {
    const s = sheet()
    expect(s.animations.map((a) => a.name)).toEqual(VILLAGER_ANIMS.map((a) => a.name))
    expect(s.animation('walk_down')?.steps.map((x) => x.frame)).toEqual([0, 1, 2, 1])
    expect(s.animation('stand_r_down')?.steps.map((x) => x.frame)).toEqual([13])
    expect(s.animation('stand_left')?.steps[0]?.duration).toBe(60)
  })

  it('reads the one-word name a breaking sheet gives its animation', () => {
    const s = readSprite(
      build({
        frames: [villagerFrame(), villagerFrame(), villagerFrame()],
        animations: [{ name: 'tsuboware', frames: [0, 1, 2], duration: 4 }],
      }),
    )
    expect(s.animation('tsuboware')?.steps.map((x) => [x.frame, x.duration])).toEqual([
      [0, 4],
      [1, 4],
      [2, 4],
    ])
  })

  it('leaves the list empty rather than guessing when there is no table', () => {
    expect(readSprite(build({ frames: sixteen })).animations).toEqual([])
    expect(sheet().animation('cartwheel')).toBeUndefined()
  })

  it('does not read a record that names a frame outside the sheet', () => {
    const data = build({ frames: sixteen, animations: [{ name: 'stand_down', frames: [1] }] })
    new DataView(data.buffer).setUint32(data.length - 4, 999, true)
    expect(readSprite(data).animations).toEqual([])
  })
})
