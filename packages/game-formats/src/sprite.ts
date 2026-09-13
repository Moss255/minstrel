import { GameFormatError } from './errors.ts'

/**
 * `.spr` — the 2D characters, most of a village's cast, and the pots and
 * barrels. See FORMAT.md, "`.spr`".
 *
 * 1,316 of them in `/data/ani`. **24 of the slice's 33 villagers are sprites**,
 * not models: every `kind` 0 character in a map's cast list has a
 * `<name>.spr` here and no 3D model anywhere on the cartridge, and every
 * `kind` 2 has a model and no sprite.
 *
 * **A frame is built of parts**, as the DS's own hardware sprites are:
 * rectangles 8, 16, 32 or 64 pixels on a side, each placed in the frame, each
 * with its own pixels.
 *
 * | at | type | meaning |
 * |---|---|---|
 * | `+0x00` | `u16` | frame count |
 * | `+0x02` | `u16` | version; `3` on 1,315 of 1,316 |
 * | `+0x04` | frames | each a `u16` width, `u16` height, `u16` part count and a `u16` of 0; then each part an `s16` x and y in the frame, a `u16` width and height as powers — `8 << n` — and its 4bpp pixels, a row at a time |
 * | after | `u32` | the palette's colour count: 16 on 1,288 sheets, 14, 12, 10 or 8 on the rest |
 * | | `u16` × count | the colours, BGR555 |
 * | after | | the animations: names, then one record each |
 *
 * **Read so, 1,314 of the 1,316 sheets land exactly on their palette's count
 * word**; the `u16` after each frame's part count is 0 on all 4,251 frames;
 * and every part but one lies inside its frame. The two that do not read are
 * `n001a_test`, whose palette count is 0, and one whose parts run past the
 * file. The villagers' frames are 32x40 of two parts — the top eight rows and
 * the 32x32 below — and the breaking barrel's three frames are 56x32 of three,
 * 8, 16 and 32 wide side by side.
 */

const HEADER = 4
const FRAME_HEADER = 8
const PART_HEADER = 8
/** The largest part side seen is 128 pixels, `8 << 4`; anything past `8 << 6` is not a part. */
const MOST_POWER = 6
const MOST_COLOURS = 256
/** A 4bpp pixel can name sixteen colours, whatever the palette holds. */
const PALETTE_SIZE = 16

/** One step of an animation: a sheet frame, held for a while. */
export interface SpriteStep {
  readonly frame: number
  /** How long to hold it. `8` on a walk step, `60` on a stand. */
  readonly duration: number
  /** First value of the record's leading run; meaning not established. */
  readonly order: number
}

/** A named animation: `walk_down`, `stand_r_up`, `taruware` … */
export interface SpriteAnimation {
  readonly name: string
  readonly steps: readonly SpriteStep[]
}

/** A rectangle of a frame's pixels, and where it goes in the frame. */
export interface SpritePart {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /** Where its pixels begin in the file. */
  readonly offset: number
}

export interface SpriteFrame {
  readonly width: number
  readonly height: number
  readonly parts: readonly SpritePart[]
}

export interface Sprite {
  readonly frames: number
  readonly version: number
  /** The widest frame's width. */
  readonly width: number
  /** The tallest frame's height. */
  readonly height: number
  /** Each frame's size and parts. */
  readonly layout: readonly SpriteFrame[]
  /** 16 colours, `0xAABBGGRR`: entry 0 is transparent, and entries past the palette's count are too. */
  readonly palette: Uint32Array
  /** The palette's own colour count. */
  readonly colours: number
  /** The sheet's animations, in file order. */
  readonly animations: readonly SpriteAnimation[]
  /** An animation by name, if the sheet has one. */
  animation(name: string): SpriteAnimation | undefined
  /** One frame as RGBA, its parts put together; index 0 comes back with zero alpha. */
  decode(frame: number): { width: number; height: number; pixels: Uint8Array }
}

function u16(d: Uint8Array, at: number): number {
  return (d[at] as number) | ((d[at + 1] as number) << 8)
}
function s16(d: Uint8Array, at: number): number {
  const v = u16(d, at)
  return v & 0x8000 ? v - 0x10000 : v
}
function u32(d: Uint8Array, at: number): number {
  return (
    ((d[at] as number) |
      ((d[at + 1] as number) << 8) |
      ((d[at + 2] as number) << 16) |
      ((d[at + 3] as number) << 24)) >>>
    0
  )
}

/** The frames, part by part, and where the palette begins after them. */
function readLayout(data: Uint8Array): { layout: SpriteFrame[]; paletteAt: number } {
  if (data.length < HEADER + FRAME_HEADER) {
    throw new GameFormatError(`file is ${data.length} bytes, shorter than a header and a frame`)
  }
  const frames = u16(data, 0)
  if (frames === 0) throw new GameFormatError('sprite declares 0 frames')
  const layout: SpriteFrame[] = []
  let at = HEADER
  for (let f = 0; f < frames; f++) {
    if (at + FRAME_HEADER > data.length) {
      throw new GameFormatError(`frame ${f} begins past the end of the file`, at)
    }
    const width = u16(data, at)
    const height = u16(data, at + 2)
    const count = u16(data, at + 4)
    at += FRAME_HEADER
    const parts: SpritePart[] = []
    for (let p = 0; p < count; p++) {
      if (at + PART_HEADER > data.length) {
        throw new GameFormatError(`frame ${f} part ${p} begins past the end of the file`, at)
      }
      const wide = u16(data, at + 4)
      const tall = u16(data, at + 6)
      if (wide > MOST_POWER || tall > MOST_POWER) {
        throw new GameFormatError(`frame ${f} part ${p} is sized ${wide}, ${tall}`, at + 4)
      }
      const part = {
        x: s16(data, at),
        y: s16(data, at + 2),
        width: 8 << wide,
        height: 8 << tall,
        offset: at + PART_HEADER,
      }
      at = part.offset + (part.width * part.height) / 2
      if (at > data.length) {
        throw new GameFormatError(`frame ${f} part ${p}'s pixels run past the end`, part.offset)
      }
      parts.push(part)
    }
    layout.push({ width, height, parts })
  }
  return { layout, paletteAt: at }
}

/** The palette behind its count word, or an error saying why there is none. */
function readPalette(data: Uint8Array, at: number): { palette: Uint32Array; colours: number } {
  if (at + 4 > data.length) throw new GameFormatError('no room for a palette', at)
  const colours = u32(data, at)
  if (colours === 0 || colours > MOST_COLOURS || at + 4 + colours * 2 > data.length) {
    throw new GameFormatError(`no palette: its count word says ${colours}`, at)
  }
  const palette = new Uint32Array(PALETTE_SIZE)
  for (let i = 0; i < Math.min(colours, PALETTE_SIZE); i++) {
    // Bit 15 is not part of a DS colour; a few sheets set it.
    const c = u16(data, at + 4 + i * 2)
    const r = Math.round(((c & 31) * 255) / 31)
    const g = Math.round((((c >> 5) & 31) * 255) / 31)
    const b = Math.round((((c >> 10) & 31) * 255) / 31)
    palette[i] = ((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0
  }
  return { palette, colours }
}

/**
 * The animation names, and then the records that go with them.
 *
 * The names sit in fixed-size slots that were written over a longer string, so
 * fragments of "…create an Animation" survive between them. A name proper has
 * an underscore in it — or is the one word the breaking sheets carry,
 * `taruware`, `tsuboware` — and those fragments are neither.
 *
 * The records follow, each `[steps, order[steps], duration[steps],
 * frame[steps]]`. They are found by trying every start two bytes apart — a
 * palette of an odd number of pairs of colours leaves them on a two-byte
 * boundary, as the breaking barrel's twelve do — and keeping the run that
 * consumes the file exactly, names one frame that exists for every step, and
 * produces as many records as there are names: three constraints that a wrong
 * start fails on the first record or two.
 */
function readAnimations(data: Uint8Array, from: number, frames: number): SpriteAnimation[] {
  const names: string[] = []
  let word = ''
  for (let at = from; at <= data.length; at++) {
    const c = at < data.length ? (data[at] as number) : 0
    if ((c >= 0x61 && c <= 0x7a) || c === 0x5f) {
      word += String.fromCharCode(c)
      continue
    }
    if (/^[a-z]+_[a-z_]+$/.test(word) || /^[a-z]+ware$/.test(word)) names.push(word)
    word = ''
  }
  if (names.length === 0) return []

  const parse = (start: number): SpriteAnimation[] | undefined => {
    const out: SpriteAnimation[] = []
    let at = start
    while (at + 4 <= data.length) {
      const steps = u32(data, at)
      if (steps < 1 || steps > 64) return undefined
      const end = at + 4 + steps * 12
      if (end > data.length) return undefined
      const parsed: SpriteStep[] = []
      for (let i = 0; i < steps; i++) {
        const frame = u32(data, at + 4 + steps * 8 + i * 4)
        if (frame >= frames) return undefined
        parsed.push({
          order: u32(data, at + 4 + i * 4),
          duration: u32(data, at + 4 + steps * 4 + i * 4),
          frame,
        })
      }
      out.push({ name: names[out.length] ?? `#${out.length}`, steps: parsed })
      at = end
    }
    return at === data.length && out.length === names.length ? out : undefined
  }

  for (let at = from; at + 4 <= data.length; at += 2) {
    const found = parse(at)
    if (found) return found
  }
  return []
}

/** Cheap check: a version-3 sheet whose frames lead to a palette. */
export function isSprite(data: Uint8Array): boolean {
  if (data.length < HEADER + FRAME_HEADER || u16(data, 2) !== 3) return false
  try {
    const { paletteAt } = readLayout(data)
    readPalette(data, paletteAt)
    return true
  } catch {
    return false
  }
}

/** Read a sprite sheet. */
export function readSprite(data: Uint8Array): Sprite {
  const { layout, paletteAt } = readLayout(data)
  const { palette, colours } = readPalette(data, paletteAt)
  const frames = layout.length
  const animations = readAnimations(data, paletteAt + 4 + colours * 2, frames)
  return {
    frames,
    version: u16(data, 2),
    width: Math.max(...layout.map((f) => f.width)),
    height: Math.max(...layout.map((f) => f.height)),
    layout,
    palette,
    colours,
    animations,
    animation: (name) => animations.find((a) => a.name === name),
    decode(frame) {
      const shape = layout[frame]
      if (!shape) throw new GameFormatError(`frame ${frame} of a ${frames}-frame sprite`)
      const { width, height } = shape
      const pixels = new Uint8Array(width * height * 4)
      for (const part of shape.parts) {
        for (let y = 0; y < part.height; y++) {
          const to = part.y + y
          if (to < 0 || to >= height) continue
          for (let x = 0; x < part.width; x++) {
            const across = part.x + x
            if (across < 0 || across >= width) continue
            const i = y * part.width + x
            const byte = data[part.offset + (i >> 1)] as number
            const index = i & 1 ? byte >> 4 : byte & 0x0f
            if (index === 0) continue
            const c = palette[index] as number
            if (c >>> 24 === 0) continue
            const at = (to * width + across) * 4
            pixels[at] = c & 0xff
            pixels[at + 1] = (c >> 8) & 0xff
            pixels[at + 2] = (c >> 16) & 0xff
            pixels[at + 3] = 0xff
          }
        }
      }
      return { width, height, pixels }
    },
  }
}
