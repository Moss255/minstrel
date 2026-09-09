import { GameFormatError } from './errors.ts'

/**
 * `.spr` — the 2D characters, and most of a village's cast.
 *
 * 1,316 of them in `/data/ani`. **24 of the slice's 33 villagers are sprites**,
 * not models: every `kind` 0 character in a map's cast list has a
 * `<name>.spr` here and no 3D model anywhere on the cartridge, and every
 * `kind` 2 has a model and no sprite.
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `0x00` | `u16` | frame count |
 * | `0x02` | `u16` | version; `3` on 1,315 of 1,316 |
 * | `0x04` | `u16` | frame width |
 * | `0x06` | `u16` | nominal frame height — see below |
 * | `0x08` | `u32` | `unknown_0x08` |
 * | `0x0C` | `u32` | zero on every file seen |
 *
 * Pixels are 4bpp indices, one row of `width` pixels at a time. A string table
 * near the end names the animations — `walk_down`, `walk_left`, `walk_up`,
 * `walk_right` and eight `stand_*` — so these are eight-direction characters.
 */

/** How the palette is marked: a count word, then that many BGR555 entries. */
const PALETTE_COLOURS = 16
const HEADER_SIZE = 0x10

/** One step of an animation: a sheet frame, held for a while. */
export interface SpriteStep {
  readonly frame: number
  /** How long to hold it. `8` on a walk step, `60` on a stand. */
  readonly duration: number
  /** First value of the record's leading run; meaning not established. */
  readonly order: number
}

/** A named animation: `walk_down`, `stand_r_up`, and ten others. */
export interface SpriteAnimation {
  readonly name: string
  readonly steps: readonly SpriteStep[]
}

export interface Sprite {
  readonly frames: number
  /**
   * Pixels across a row of the sheet.
   *
   * Measured rather than taken from the header, which overstates it by eight on
   * most files — see `strideOf`.
   */
  readonly width: number
  /** Rows in one frame. Frames differ by a row — see {@link frameRows}. */
  readonly height: number
  /** `0x08`, whose meaning is not established. */
  readonly unknown_0x08: number
  /** 16 colours, `0xAABBGGRR`, entry 0 being the transparent index. */
  readonly palette: Uint32Array
  /**
   * The sheet's animations, in file order: the four walks, then the eight
   * stands.
   */
  readonly animations: readonly SpriteAnimation[]
  /** An animation by name, if the sheet has one. */
  animation(name: string): SpriteAnimation | undefined
  /** First and last row of a frame, in sheet rows. */
  frameRows(frame: number): { readonly from: number; readonly to: number }
  /**
   * One frame as RGBA, `width` by its own row count. Index 0 comes back with
   * zero alpha, which is what the DS treats it as.
   */
  decode(frame: number): { width: number; height: number; pixels: Uint8Array }
}

function u16(d: Uint8Array, at: number): number {
  return (d[at] as number) | ((d[at + 1] as number) << 8)
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

/**
 * Where the palette is.
 *
 * **Found by the size equation, not by scanning.** A backward search for the
 * count word lands on stray `16`s in the animation tables at the end of the
 * file. Requiring that the pixels implied by the header fit between the header
 * and the candidate picks the right one on 1,265 of the 1,316 files.
 */
function findPalette(data: Uint8Array, frames: number, width: number, height: number): number {
  const need = (frames * width * height) / 2
  for (let at = HEADER_SIZE; at + 4 + PALETTE_COLOURS * 2 <= data.length; at += 4) {
    if (u32(data, at) !== PALETTE_COLOURS) continue
    let plausible = true
    for (let i = 0; i < PALETTE_COLOURS; i++) {
      // BGR555 leaves bit 15 clear; anything else is not a colour table.
      if (u16(data, at + 4 + i * 2) & 0x8000) {
        plausible = false
        break
      }
    }
    if (plausible && at - need >= HEADER_SIZE) return at
  }
  return -1
}

/**
 * The animation names, and then the records that go with them.
 *
 * The names sit in fixed-size slots that were written over a longer string, so
 * fragments of "…create an Animation" survive between them. A name proper has
 * an underscore in it and those fragments do not, which is what separates them.
 *
 * The records follow, each `[steps, order[steps], duration[steps],
 * frame[steps]]`. They are found by trying every aligned start and keeping the
 * run that consumes the file exactly, names one frame that exists for every
 * step, and produces as many records as there are names — three constraints
 * that a wrong start fails on the first record or two.
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
    if (/^[a-z]+_[a-z_]+$/.test(word)) names.push(word)
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

  for (let at = from; at + 4 <= data.length; at += 4) {
    const found = parse(at)
    if (found) return found
  }
  return []
}

/**
 * How wide the sheet really is.
 *
 * **The header's width is not always the stride.** On sheets whose `0x08` is
 * `2` it is: 186 of the 187 such files read cleanly at it. On the rest it
 * overstates by exactly eight pixels — 1,001 of the 1,063 files with `0x08` of
 * `4` are coherent at `width - 8` and none at `width`, and the village's one
 * such character, `n099a`, is a 32-wide sheet claiming 40.
 *
 * Rather than key off `0x08` and be wrong on the sixty-odd exceptions, the two
 * candidates are put to the data. A sheet read at its true stride has pixels
 * that agree with the one below far more often than one read at the wrong
 * stride, where each row is offset from the last and the image shears. The
 * difference is not marginal: `n099a` scores 0.79 at 32 against 0.53 at 40.
 */
function strideOf(data: Uint8Array, palAt: number, width: number): number {
  const coherence = (candidate: number): number => {
    if (candidate < 4 || candidate % 2 !== 0) return -1
    const rowBytes = candidate / 2
    const start = palAt - Math.floor((palAt - HEADER_SIZE) / rowBytes) * rowBytes
    const rows = Math.floor(((palAt - start) * 2) / candidate)
    if (rows < 8) return -1
    const at = (x: number, y: number) => {
      const i = y * candidate + x
      const byte = data[start + (i >> 1)] as number
      return i & 1 ? byte >> 4 : byte & 0x0f
    }
    let same = 0
    let seen = 0
    for (let y = 0; y + 1 < rows; y++) {
      for (let x = 0; x < candidate; x++) {
        if (at(x, y) === at(x, y + 1)) same++
        seen++
      }
    }
    return seen === 0 ? -1 : same / seen
  }
  const wide = coherence(width)
  const narrow = coherence(width - 8)
  return narrow > wide ? width - 8 : width
}

/** Cheap check: a version-3 header whose palette can be located. */
export function isSprite(data: Uint8Array): boolean {
  if (data.length < HEADER_SIZE + 4) return false
  if (u16(data, 2) !== 3) return false
  const frames = u16(data, 0)
  const width = u16(data, 4)
  const height = u16(data, 6)
  if (frames === 0 || width === 0 || height === 0) return false
  return findPalette(data, frames, width, height) >= 0
}

/**
 * Read a sprite sheet.
 *
 * **The frames are not all the same height, and that is the whole difficulty.**
 * `n003a` holds 663 rows for 16 frames — 41.4375 each — and every fixed pitch
 * drifts across the sheet. Cutting on the rows where the sheet goes quiet gives
 * seams at 40, 81, 124, 164, 206 and so on, whose spacings run 40, 41, 43, 40,
 * 42 … averaging 41.4; and those seams sit within two rows of `k x rows /
 * frames` for every one of the fifteen, with a *constant* offset rather than a
 * drifting one.
 *
 * So the sheet is divided evenly in the only sense it can be: frame `k` runs
 * from `round(k x rows / frames)` to `round((k + 1) x rows / frames)`, which
 * alternates 41 and 42. `height` in the header is the nominal size and is one
 * short of the pitch on every character checked, so it is reported but not used
 * to cut.
 *
 * **INFERRED**, and marked as such: nothing in the file has been found that
 * states the per-frame rows. It is a reading that agrees with the measured
 * seams and puts a complete, correctly coloured villager in every cell for 22
 * of the village's 24 sprite characters.
 */
export function readSprite(data: Uint8Array): Sprite {
  if (data.length < HEADER_SIZE + 4) {
    throw new GameFormatError(`file is ${data.length} bytes, shorter than its header`)
  }
  const frames = u16(data, 0)
  const width = u16(data, 4)
  const height = u16(data, 6)
  const unknown_0x08 = u32(data, 8)
  if (frames === 0 || width === 0 || height === 0) {
    throw new GameFormatError(`sprite declares ${frames} frames of ${width}x${height}`)
  }

  const palAt = findPalette(data, frames, width, height)
  if (palAt < 0) {
    throw new GameFormatError('no palette: no count word of 16 leaves room for the pixels')
  }

  const palette = new Uint32Array(PALETTE_COLOURS)
  for (let i = 0; i < PALETTE_COLOURS; i++) {
    const c = u16(data, palAt + 4 + i * 2)
    const r = Math.round(((c & 31) * 255) / 31)
    const g = Math.round((((c >> 5) & 31) * 255) / 31)
    const b = Math.round((((c >> 10) & 31) * 255) / 31)
    palette[i] = ((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0
  }

  // The pixels end at the palette's count word. They begin a whole number of
  // rows before it — anything else shears the sheet sideways instead of
  // shifting it up, which is the mistake that made this look unreadable.
  const stride = strideOf(data, palAt, width)
  const rowBytes = stride / 2
  const start = palAt - Math.floor((palAt - HEADER_SIZE) / rowBytes) * rowBytes
  const rows = Math.floor(((palAt - start) * 2) / stride)
  if (rows < frames) {
    throw new GameFormatError(`sprite has ${rows} rows for ${frames} frames`, palAt)
  }

  const bound = (frame: number) => Math.round((frame * rows) / frames)
  const animations = readAnimations(data, palAt + 4 + PALETTE_COLOURS * 2, frames)

  return {
    width: stride,
    animations,
    animation: (name) => animations.find((a) => a.name === name),
    frames,
    height,
    unknown_0x08,
    palette,
    frameRows: (frame) => ({ from: bound(frame), to: bound(frame + 1) }),
    decode(frame) {
      if (frame < 0 || frame >= frames) {
        throw new GameFormatError(`frame ${frame} of a ${frames}-frame sprite`)
      }
      const from = bound(frame)
      const to = bound(frame + 1)
      const tall = to - from
      const pixels = new Uint8Array(stride * tall * 4)
      for (let y = 0; y < tall; y++) {
        for (let x = 0; x < stride; x++) {
          const i = (from + y) * stride + x
          const byte = data[start + (i >> 1)] as number
          const index = i & 1 ? byte >> 4 : byte & 0x0f
          const at = (y * stride + x) * 4
          if (index === 0) continue
          const c = palette[index] as number
          pixels[at] = c & 0xff
          pixels[at + 1] = (c >> 8) & 0xff
          pixels[at + 2] = (c >> 16) & 0xff
          pixels[at + 3] = 0xff
        }
      }
      return { width: stride, height: tall, pixels }
    },
  }
}
