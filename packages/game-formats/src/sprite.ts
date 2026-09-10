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
/**
 * How far apart a sheet's frames are, beyond the pixels a frame draws.
 *
 * **A frame is not a whole number of sheet rows**, which is why reading the
 * sheet as a grid of rows and dividing it evenly cut alternate frames in half
 * and swapped the halves — a horizontal wrap, and the reason a villager came
 * apart as the camera turned around them.
 *
 * The unit is `width x height / 2 + 24` bytes, which on the village's 32x40
 * characters is **664 — 41.5 rows**. That is the same 41.5 the empty rows give:
 * they fall every 83 rows, two frames apart.
 *
 * **Measured, not derived.** The period of the byte stream was taken directly,
 * by scoring the sheet against itself at every candidate lag over the positions
 * where either copy has ink. 664 wins on every 32x40 sheet surveyed — 182 of
 * 187 multi-frame sheets, at 8, 11, 16 and 20 frames alike, so it is a constant
 * of the geometry rather than a division of the file. The margin is not
 * marginal: 0.47 against 0.32 for the runner-up on `n003a`.
 *
 * It was 8 rather than 24, which is 16 bytes — **exactly one row** — short. A
 * pitch one row short does not wrap; it walks the figure a row further down its
 * cell with every frame, which is what put a stray fragment above the character
 * and cut its hem off by the end of the sheet. Rendered at 664 the figures hold
 * still across all sixteen.
 *
 * What the last 24 bytes hold is not established. They are not read.
 */
const FRAME_GAP = 24

/**
 * Rows of the flattened strip that stands in front of every figure.
 *
 * A frame's 664 bytes are **an eight-row strip, then the figure**, and the
 * header's `height` of 40 is the two together: 8 and 32. Cut at 32 rows, eight
 * rows in, every frame of the village's characters is a whole figure with
 * nothing above it.
 *
 * **What the strip is has not been established.** It is a squashed copy of the
 * figure — `n017a`'s carries the blue of her dress above the grey of her apron,
 * and turns as she does, so it is not a constant blob — and a shadow and a
 * reflection are both consistent with that. It is separate from the figure
 * either way: eight rows of it, then a row with almost no ink in it, then the
 * character. Read as part of the frame it drew as debris floating over the
 * cast, which is what it looked like in a crowded room.
 */
const SHADOW_ROWS = 8

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
  /**
   * The cut this sheet was read with.
   *
   * Reported so that a caller moving the cut live starts from the reading in
   * this file rather than from its own copy of the arithmetic. Both apps held
   * such a copy and both went stale the moment the reading changed.
   *
   * On the handful of sheets the packed reading does not fit, the frames come
   * from the even division instead and these are the numbers a live cut would
   * start from rather than the ones it used.
   */
  readonly cut: {
    readonly start: number
    readonly pitch: number
    readonly height: number
    readonly oddShift: number
  }
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
/**
 * Overrides for how a sheet is cut into frames.
 *
 * **A development affordance, and deliberately not a guess.** Where a frame
 * begins and how far apart frames are is settled for the horizontal reading and
 * not for the vertical one — see `FORMAT.md` — and six statistical criteria all
 * chose a cut that renders wrong. Rather than keep fitting it blind, the game
 * can move these three numbers live and the answer can be read off the screen.
 *
 * Nothing in the engine passes them. Omitted, the reading in this file applies.
 */
export interface SpriteCut {
  /** Byte offset of the first frame's pixels. */
  readonly start?: number
  /** Bytes from one frame's pixels to the next. */
  readonly pitch?: number
  /** Rows in a frame, when the header's height is not it. */
  readonly height?: number
  /**
   * Bytes added to every *odd* frame's start.
   *
   * A frame occupies **41.5 rows**, measured three ways, and a half row of a
   * 32-pixel sheet is eight bytes — sixteen pixels. If frames really are spaced
   * by a half row then odd frames begin mid-row and their pixels land sixteen
   * across from where an even frame's do, which is what a head sitting at a
   * different offset from its body looks like.
   *
   * `8` or `-8` tested that, and the answer is that nothing needs shifting: a
   * frame is read from its own byte start, so the half row falls between frames
   * rather than inside one. The knob is kept because it costs nothing and the
   * question comes back whenever a sheet looks wrong.
   */
  readonly oddShift?: number
}

export function readSprite(data: Uint8Array, cut: SpriteCut = {}): Sprite {
  if (data.length < HEADER_SIZE + 4) {
    throw new GameFormatError(`file is ${data.length} bytes, shorter than its header`)
  }
  const frames = u16(data, 0)
  const width = u16(data, 4)
  // The header's own height finds the palette; an override only moves the cut.
  // Feeding an override into the search makes it demand more pixels than the
  // file holds and the palette is never found.
  const declaredHeight = u16(data, 6)
  const height = cut.height ?? declaredHeight
  const unknown_0x08 = u32(data, 8)
  if (frames === 0 || width === 0 || declaredHeight === 0) {
    throw new GameFormatError(`sprite declares ${frames} frames of ${width}x${declaredHeight}`)
  }

  const palAt = findPalette(data, frames, width, declaredHeight)
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

  // Frames packed back to back, each behind an eight-byte record. Only when the
  // sheet's declared width really is its stride — a sheet read at width - 8 is
  // not described by this arithmetic — and when the frames fit in front of the
  // palette.
  // The unit a frame occupies, which is more than the figure it draws: the
  // strip in front of it, the figure, and a row and a half of nothing.
  const pitch = cut.pitch ?? (stride * declaredHeight) / 2 + FRAME_GAP
  // What the figure itself is. The header's height covers the strip as well,
  // so the rows drawn are what is left after it.
  const figureRows = cut.height ?? Math.max(1, declaredHeight - SHADOW_ROWS)
  const figureBytes = (stride * figureRows) / 2
  const pixelsAt = cut.start ?? HEADER_SIZE + SHADOW_ROWS * rowBytes
  const packed =
    cut.start !== undefined ||
    cut.pitch !== undefined ||
    cut.height !== undefined ||
    (stride === width && pixelsAt + (frames - 1) * pitch + figureBytes <= palAt)
  const animations = readAnimations(data, palAt + 4 + PALETTE_COLOURS * 2, frames)

  return {
    width: stride,
    animations,
    animation: (name) => animations.find((a) => a.name === name),
    frames,
    height: packed ? figureRows : height,
    cut: { start: pixelsAt, pitch, height: figureRows, oddShift: cut.oddShift ?? 0 },
    unknown_0x08,
    palette,
    frameRows: (frame) => ({ from: bound(frame), to: bound(frame + 1) }),
    decode(frame) {
      if (frame < 0 || frame >= frames) {
        throw new GameFormatError(`frame ${frame} of a ${frames}-frame sprite`)
      }
      // Packed frames when the file's own arithmetic allows them, which it does
      // on 1,257 of the cartridge's 1,264 sheets; the even division otherwise,
      // which is what a sheet whose stride is not its declared width still
      // needs.
      const tall = packed ? figureRows : bound(frame + 1) - bound(frame)
      const odd = frame % 2 === 1 ? (cut.oddShift ?? 0) : 0
      const at = packed ? pixelsAt + frame * pitch + odd : start + bound(frame) * (stride / 2)
      const pixels = new Uint8Array(stride * tall * 4)
      for (let y = 0; y < tall; y++) {
        for (let x = 0; x < stride; x++) {
          const i = y * stride + x
          const byte = data[at + (i >> 1)] as number
          if (byte === undefined) continue
          const index = i & 1 ? byte >> 4 : byte & 0x0f
          const to = (y * stride + x) * 4
          if (index === 0) continue
          const c = palette[index] as number
          pixels[to] = c & 0xff
          pixels[to + 1] = (c >> 8) & 0xff
          pixels[to + 2] = (c >> 16) & 0xff
          pixels[to + 3] = 0xff
        }
      }
      return { width: stride, height: tall, pixels }
    },
  }
}
