import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { isSprite, readSprite } from '../src/sprite.ts'

/**
 * Fixtures are built here, never taken from a cartridge.
 *
 * A `.spr` is a 16-byte header, 4bpp pixel rows, then a palette behind a count
 * word. The pixels are written to end exactly where the count word begins,
 * which is the relationship the reader uses to find the palette at all.
 */
function build(options: {
  frames: number
  width: number
  height: number
  /** Sheet rows, which need not be `frames * height` — the real files differ. */
  rows?: number
  indices?: (x: number, y: number) => number
  colours?: number[]
  count?: number
  lead?: number
  version?: number
  /** Animation names and the sheet frames each step shows. */
  animations?: { name: string; frames: number[]; duration?: number }[]
  /** Written into the header instead of the real width, to fake a wrong one. */
  claimWidth?: number
}): Uint8Array {
  const { frames, width, height } = options
  const rows = options.rows ?? frames * height
  const lead = options.lead ?? 0
  const colours = options.colours ?? Array.from({ length: 16 }, (_, i) => (i * 0x111) & 0x7fff)
  const pixelBytes = (rows * width) / 2
  const out = new Uint8Array(0x10 + lead + pixelBytes + 4 + colours.length * 2)
  const view = new DataView(out.buffer)
  view.setUint16(0, frames, true)
  view.setUint16(2, options.version ?? 3, true)
  view.setUint16(4, options.claimWidth ?? width, true)
  view.setUint16(6, height, true)
  view.setUint32(8, 2, true)

  const at = 0x10 + lead
  const ink = options.indices ?? (() => 1)
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const value = ink(x, y) & 0x0f
      const byte = at + (i >> 1)
      out[byte] =
        i & 1
          ? ((out[byte] as number) & 0x0f) | (value << 4)
          : ((out[byte] as number) & 0xf0) | value
    }
  }
  const palAt = at + pixelBytes
  view.setUint32(palAt, options.count ?? 16, true)
  colours.forEach((c, i) => {
    view.setUint16(palAt + 4 + i * 2, c, true)
  })
  if (!options.animations) return out

  // Names in 30-byte slots, then one record each. The real files leave
  // fragments of a longer string between the names; this leaves zeroes, and the
  // reader must not mind either way.
  const slot = 30
  const tables = options.animations.reduce((n, a) => n + 4 + a.frames.length * 12, 0)
  const grown = new Uint8Array(out.length + options.animations.length * slot + tables)
  grown.set(out)
  const gview = new DataView(grown.buffer)
  let cursor = out.length
  options.animations.forEach((a, i) => {
    for (let c = 0; c < a.name.length; c++) grown[cursor + i * slot + c] = a.name.charCodeAt(c)
  })
  cursor += options.animations.length * slot
  for (const a of options.animations) {
    const steps = a.frames.length
    gview.setUint32(cursor, steps, true)
    for (let i = 0; i < steps; i++) gview.setUint32(cursor + 4 + i * 4, i, true)
    for (let i = 0; i < steps; i++) {
      gview.setUint32(cursor + 4 + steps * 4 + i * 4, a.duration ?? 8, true)
    }
    a.frames.forEach((f, i) => {
      gview.setUint32(cursor + 4 + steps * 8 + i * 4, f, true)
    })
    cursor += 4 + steps * 12
  }
  return grown
}

/** The village's villagers: 16 frames, 32 wide, 663 rows rather than 640. */
const VILLAGER = { frames: 16, width: 32, height: 40, rows: 663 }

describe('readSprite', () => {
  it('reads the header', () => {
    const s = readSprite(build(VILLAGER))
    expect(s.frames).toBe(16)
    expect(s.width).toBe(32)
    // The header's 40 rows are the strip and the figure together; what a frame
    // draws is the 32 the figure occupies.
    expect(s.height).toBe(32)
  })

  it('cuts the frames 664 bytes apart, eight rows into each', () => {
    // The pitch is the measured one — `width x height / 2 + 24`, which is 41.5
    // rows on a 32x40 sheet — and the eight rows in front of the figure are the
    // strip, which is not part of it.
    //
    // Every pixel here carries its own place in the sheet, so where a frame was
    // read from can be read back out of the frame. The palette is a ramp, so
    // the index comes back out of the red channel.
    const ramp = Array.from({ length: 16 }, (_, i) => i)
    const mark = (nibble: number) => (nibble % 15) + 1
    const s = readSprite(
      build({
        ...VILLAGER,
        colours: ramp,
        indices: (x, y) => mark(y * 32 + x),
      }),
    )
    expect(s.height).toBe(32)

    const red = (index: number) => Math.round(((ramp[index] as number) & 31) * (255 / 31))
    for (const frame of [0, 1, 7, 15]) {
      const { pixels, width, height } = s.decode(frame)
      expect(width).toBe(32)
      expect(height).toBe(32)
      // Frame `f` begins at byte 16 + 8 rows + f * 664, and the pixels start at
      // byte 16 — so its first nibble is (128 + f * 664) * 2 into them.
      const first = (128 + frame * 664) * 2
      for (const [x, y] of [
        [0, 0],
        [17, 0],
        [5, 13],
        [31, 31],
      ]) {
        const expected = mark(first + (y as number) * 32 + (x as number))
        const at = ((y as number) * 32 + (x as number)) * 4
        expect(pixels[at], `frame ${frame} at ${x},${y}`).toBe(red(expected))
      }
    }
  })

  it('falls back to the even division when the packed frames do not fit', () => {
    // A sheet with no room in front of the palette for the packed reading is
    // still cut, by the sheet's own rows — which is what the handful whose
    // stride is not their declared width need.
    const s = readSprite(build({ frames: 4, width: 8, height: 4, rows: 16 }))
    expect(s.height).toBe(4)
    expect(s.decode(0).height).toBe(4)
  })

  it('divides the sheet across the frames rather than by the nominal height', () => {
    // 663 rows over 16 frames is 41.4375, so the frames alternate 41 and 42.
    // Cutting at the header's 40 would drift a row every other frame and slice
    // figures in half by the end of the sheet.
    const s = readSprite(build(VILLAGER))
    const tall = Array.from({ length: 16 }, (_, f) => {
      const { from, to } = s.frameRows(f)
      return to - from
    })
    expect(tall).toEqual([41, 42, 41, 42, 41, 42, 41, 42, 41, 41, 42, 41, 42, 41, 42, 41])
    expect(tall.reduce((a, b) => a + b)).toBe(663)
  })

  it('leaves no row of the sheet in two frames or in none', () => {
    const s = readSprite(build(VILLAGER))
    expect(s.frameRows(0).from).toBe(0)
    for (let f = 1; f < 16; f++) {
      expect(s.frameRows(f).from, `frame ${f}`).toBe(s.frameRows(f - 1).to)
    }
    expect(s.frameRows(15).to).toBe(663)
  })

  it('decodes a frame to RGBA, with index 0 transparent', () => {
    // Index 0 is the DS's transparent entry whatever colour the palette gives
    // it, so a sprite drawn without that is a character in a solid box.
    const data = build({
      frames: 1,
      width: 4,
      height: 2,
      indices: (x) => (x < 2 ? 0 : 5),
      colours: [0x7fff, 0, 0, 0, 0, 0x001f, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    })
    const { pixels, width, height } = readSprite(data).decode(0)
    expect(width).toBe(4)
    expect(height).toBe(2)
    expect(pixels[3]).toBe(0) // index 0 -> alpha 0
    expect(pixels[7]).toBe(0)
    expect(pixels[11]).toBe(255) // index 5 -> opaque
    expect(pixels[8]).toBe(255) // ...and red, from 0x001f
    expect(pixels[9]).toBe(0)
  })

  it('reads the palette as BGR555', () => {
    const s = readSprite(
      build({ ...VILLAGER, colours: [0, 0x001f, 0x03e0, 0x7c00, ...Array(12).fill(0)] }),
    )
    // Uint32Array indexing is checked, so read through a copy.
    const colours = Array.from(s.palette)
    expect(colours[1]).toBe(0xff0000ff) // red
    expect(colours[2]).toBe(0xff00ff00) // green
    expect(colours[3]).toBe(0xffff0000) // blue
  })

  it('finds the palette past a count word that is only a coincidence', () => {
    // The tables at the end of a real file carry stray 16s. Requiring that the
    // pixels fit between the header and the candidate is what rules them out.
    const data = build({ frames: 1, width: 8, height: 4, lead: 0 })
    const view = new DataView(data.buffer)
    view.setUint32(0x10, 16, true) // a 16 sitting inside the pixels
    expect(() => readSprite(data)).not.toThrow()
    expect(readSprite(data).frames).toBe(1)
  })

  it('reads a sheet with padding before the pixels', () => {
    const s = readSprite(build({ ...VILLAGER, lead: 372 }))
    expect(s.frames).toBe(16)
    expect(() => s.decode(15)).not.toThrow()
  })
})

describe('readSprite on malformed input', () => {
  it('throws when the file is shorter than its header', () => {
    expect(() => readSprite(new Uint8Array(8))).toThrow(GameFormatError)
  })

  it('throws when the header declares nothing to draw', () => {
    expect(() => readSprite(build({ frames: 0, width: 32, height: 40, rows: 40 }))).toThrow(
      /0 frames/,
    )
  })

  it('throws when no palette can be located', () => {
    const data = build(VILLAGER)
    new DataView(data.buffer).setUint32(data.length - 36, 99, true)
    expect(() => readSprite(data)).toThrow(/no palette/)
  })

  it('throws for a frame that is not in the sheet', () => {
    const s = readSprite(build(VILLAGER))
    expect(() => s.decode(16)).toThrow(/frame 16/)
    expect(() => s.decode(-1)).toThrow(GameFormatError)
  })
})

describe('isSprite', () => {
  it('accepts a well-formed sheet', () => {
    expect(isSprite(build(VILLAGER))).toBe(true)
  })

  it('rejects another version', () => {
    expect(isSprite(build({ ...VILLAGER, version: 2 }))).toBe(false)
  })

  it('rejects a file too short to hold a header', () => {
    expect(isSprite(new Uint8Array(12))).toBe(false)
  })

  it('rejects one whose palette cannot be found', () => {
    const data = build(VILLAGER)
    new DataView(data.buffer).setUint32(data.length - 36, 99, true)
    expect(isSprite(data)).toBe(false)
  })
})

/** What a villager's sheet actually carries, from the reference cartridge. */
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
  const sheet = () => readSprite(build({ ...VILLAGER, animations: VILLAGER_ANIMS }))

  it('reads every animation, in file order', () => {
    expect(sheet().animations.map((a) => a.name)).toEqual(VILLAGER_ANIMS.map((a) => a.name))
  })

  it('reads the sheet frame each step shows', () => {
    // This is the mapping that lets a character face a direction rather than
    // cycle through all of them.
    const s = sheet()
    expect(s.animation('walk_down')?.steps.map((x) => x.frame)).toEqual([0, 1, 2, 1])
    expect(s.animation('stand_up')?.steps.map((x) => x.frame)).toEqual([4])
    expect(s.animation('stand_r_down')?.steps.map((x) => x.frame)).toEqual([13])
  })

  it('reads how long a step is held', () => {
    const s = sheet()
    expect(s.animation('walk_left')?.steps.every((x) => x.duration === 8)).toBe(true)
    expect(s.animation('stand_left')?.steps[0]?.duration).toBe(60)
  })

  it('gives a character all eight standing directions', () => {
    const stands = sheet().animations.filter((a) => a.name.startsWith('stand_'))
    expect(stands).toHaveLength(8)
  })

  it('accounts for every frame of the sheet between them', () => {
    // Nothing in a villager's sixteen frames is unreachable, which is the check
    // that the table is being read rather than something else being decoded.
    const used = new Set(sheet().animations.flatMap((a) => a.steps.map((x) => x.frame)))
    expect([...used].sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ])
  })

  it('answers with nothing for an animation the sheet lacks', () => {
    expect(sheet().animation('cartwheel')).toBeUndefined()
  })

  it('leaves the list empty rather than guessing when there is no table', () => {
    expect(readSprite(build(VILLAGER)).animations).toEqual([])
  })

  it('does not read a record that names a frame outside the sheet', () => {
    // A wrong start would parse rubbish; naming a frame that does not exist is
    // what rules it out.
    const data = build({
      ...VILLAGER,
      animations: [{ name: 'stand_down', frames: [1] }],
    })
    new DataView(data.buffer).setUint32(data.length - 4, 999, true)
    expect(readSprite(data).animations).toEqual([])
  })
})

describe('the sheet stride', () => {
  /**
   * Vertical stripes with a 16-pixel period, so a stride wrong by eight
   * inverts them rather than leaving them looking the same. A four-pixel
   * period would survive the shear and tell the two strides apart not at all.
   */
  const stripes = (x: number) => (x % 16 < 8 ? 3 : 9)

  it('takes the header width when the pixels agree with it', () => {
    const s = readSprite(build({ frames: 4, width: 32, height: 40, rows: 220, indices: stripes }))
    expect(s.width).toBe(32)
    expect(s.decode(0).width).toBe(32)
  })

  it('takes eight fewer when the header overstates, as most sheets do', () => {
    // 1,001 of the cartridge's 1,063 sheets with `0x08` of 4 are like this, the
    // village's `n099a` among them: a 32-wide sheet whose header claims 40.
    // Read at 40 it is diagonal noise.
    const s = readSprite(
      build({ frames: 4, width: 32, height: 40, rows: 220, indices: stripes, claimWidth: 40 }),
    )
    expect(s.width).toBe(32)
    expect(s.decode(0).width).toBe(32)
  })

  it('decides by the pixels, not by a flag', () => {
    // The same header width is right on one sheet and wrong on another, so the
    // choice cannot be made from the header alone.
    const honest = readSprite(
      build({ frames: 4, width: 40, height: 40, rows: 180, indices: stripes }),
    )
    const overstated = readSprite(
      build({ frames: 4, width: 32, height: 40, rows: 220, indices: stripes, claimWidth: 40 }),
    )
    expect(honest.width).toBe(40)
    expect(overstated.width).toBe(32)
  })

  it('reports the stride as the decoded frame width', () => {
    const s = readSprite(
      build({ frames: 4, width: 32, height: 40, rows: 220, indices: stripes, claimWidth: 40 }),
    )
    const frame = s.decode(1)
    expect(frame.pixels.length).toBe(frame.width * frame.height * 4)
  })
})
