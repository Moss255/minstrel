import { scanCartridge } from '@minstrel/cartridge'
import {
  drawBnsc,
  type LatinFont,
  readBncg,
  readBncl,
  readBnsc,
  readLatinFont,
  readStaffRoll,
  type StaffRoll,
  type StaffRollLine,
} from '@minstrel/game-formats'
import { membersOf } from './equip-screen.ts'

/**
 * **The staff roll**, as overlay 28 runs it — read 6 October 2026, USA;
 * `docs/readings/T11-ending.md` has every address. `811` starts it, `812`
 * stops it, and `838` reads its stopwatch, which is what the ending's scenes
 * keep time by: `ev29352` to `ev29373` each wait for a set number of
 * milliseconds since `811`, and `ev29373` stops the roll at 268,550.
 *
 * - **Set-up** (state 0, `func_ov028_021d8dd0`), a step a frame: ask for
 *   something not followed; wait for it; ready the bottom screen; queue
 *   `staffroll.bin`; run it once loaded; begin a 30-frame fade to normal
 *   brightness; wait for the fade. Then the scroll's clock starts.
 * - **Each frame** (the V-count alarm, `021d9668`), by turns: the roll moves
 *   on by the frames its clock says have passed — 60 a second — and the
 *   stopwatch is renewed; or what it drew is put on the screen.
 * - **Moving on** (`021d9208`, `021d942c`): the scroll goes `speed` pixels a
 *   frame, in `fx32`, through the game's own float sums. A line of the same
 *   group as the one before is placed at once at the same height; a new
 *   group waits until the scroll is within a screen of `next + gap`, then
 *   goes there. When the lines run out, the scroll goes on until the last is
 *   16 px off the top, and then stands.
 *
 * **Ours**: a frame is a 60th of a second, so the clock's frames are this
 * engine's ticks; the loads the set-up waits on take a frame each here; the
 * bitmap the game draws into is a ring of 256 rows, cleared 32 rows at a
 * time behind the scroll, and drawn here as the strip it stands for.
 */

/** The set-up's steps: 0 to 4 a frame each here, 5 starts the fade, 6 waits for it. */
const SETUP_LAST = 6
/** The fade the set-up waits for, in frames — `SetBrightness(…, 0, 0x1E)`. */
export const FADE_FRAMES = 30
/** The bottom screen's height, which a new group waits to come within. */
const SCREEN = 192
/** How far the last line goes off the top before the roll stands — `021d942c`. */
const RUN_OUT = 16
/** The band the game clears behind the scroll, in pixels — `021d8ad4`. */
const BAND = 32
/** `fx32`'s one. */
const ONE = 4096

/** The roll's file — `data_ov028_021d9aa0`. */
export const STAFF_ROLL_FILE = '/data/evspt_lv5/staffroll.bin'

/** The roll's file and the two fonts, off a cartridge; each undefined where it will not read. */
export function readRollFiles(rom: Uint8Array): { roll: StaffRoll | undefined; fonts: RollFonts } {
  const files = new Map<string, Uint8Array>()
  // Two narrow walks: the whole of /data would open every archive on it.
  for (const filter of [STAFF_ROLL_FILE, '/data/pack_lv5/f']) {
    for (const leaf of scanCartridge(rom, { pathFilter: filter })) {
      files.set(leaf.path.toLowerCase(), leaf.bytes)
    }
  }
  const font = (name: string): LatinFont | undefined => {
    const strip = files.get(`/data/pack_lv5/fd_${name}.bin`)
    const index = files.get(`/data/pack_lv5/fi_${name}.bin`)
    if (!strip || !index) return undefined
    try {
      return readLatinFont(strip, index)
    } catch {
      return undefined
    }
  }
  let roll: StaffRoll | undefined
  const bytes = files.get(STAFF_ROLL_FILE)
  try {
    roll = bytes ? readStaffRoll(bytes) : undefined
  } catch {
    roll = undefined
  }
  return { roll, fonts: [font('s7'), font('me')] }
}

/** Where a line was placed, in the strip's own pixels. */
export interface PlacedLine {
  readonly line: StaffRollLine
  readonly x: number
  readonly y: number
}

/** The two fonts by the game's numbers — 0 `s7`, 1 `me` (`func_02042944`). */
export type RollFonts = readonly [LatinFont | undefined, LatinFont | undefined]

/** A space's width, and a character no glyph names: `data_020e7bd8[font] + 1`. */
export const SPACE_WIDTH = [3, 4] as const

/** The font a line is set in: 1 at size 12, else 0 (`func_ov028_021d9208`). */
export const fontOf = (line: StaffRollLine): 0 | 1 => (line.size === 12 ? 1 : 0)

/**
 * The glyph the text at `from` begins with — the first whose name it starts
 * with, in the font's order (`func_0204254c`); −1 for none.
 */
export function glyphAt(font: LatinFont, text: string, from: number): number {
  for (const [i, glyph] of font.glyphs.entries()) {
    if (glyph.name.length > 0 && text.startsWith(glyph.name, from)) return i
  }
  return -1
}

/**
 * A text's width as the game measures it (`func_020420e8`): each glyph's
 * width + 1 and the kerning between it and the glyph before, a space or a
 * character with no glyph its font's space and no pair, and 1 off the end.
 */
export function measure(font: LatinFont | undefined, which: 0 | 1, text: string): number {
  if (!font) return 0
  const kerning = new Map(font.kerning.map((pair) => [`${pair.left},${pair.right}`, pair.adjust]))
  let width = 0
  let before = -1
  for (let at = 0; at < text.length; ) {
    const glyph = glyphAt(font, text, at)
    if (glyph < 0) {
      width += SPACE_WIDTH[which]
      before = -1
      at++
      continue
    }
    const found = font.glyphs[glyph]
    width += (found?.width ?? 0) + 1 + (before < 0 ? 0 : (kerning.get(`${before},${glyph}`) ?? 0))
    before = glyph
    at += found?.name.length ?? 1
  }
  return width - 1
}

/** Where a line of width `w` begins — `func_ov028_021d9208`'s alignments. */
export function lineX(align: number, w: number): number {
  if (align === 0) return 0
  if (align === 1) return (256 - w) >> 1
  if (align === 2) return 120 - w
  return 136
}

/** `ffix(2 × (d × speed × 0.5) × 4096)`, one float step at a time — `021d9208` into `021d8a74`. */
export function scrollStep(frames: number, speed: number): number {
  const half = Math.fround(Math.fround(Math.fround(frames) * speed) * 0.5)
  return Math.trunc(Math.fround(Math.fround(2 * half) * ONE))
}

/** The roll from `811` to `812`. */
export class StaffRollRun {
  /** 0 setting up, 1 placing lines, 2 running out, 3 stood still. */
  state = 0
  /** The set-up's step. */
  private step = 0
  /** Frames of fade still to go; while it runs, the bottom screen comes up out of black. */
  fadeLeft = -1
  /** How far it has scrolled, `fx32`; and since the last band was cleared. */
  private scroll = 0
  private band = 0
  /** Where the next group goes, `fx32`. */
  private next = 0
  private index = 0
  /** Frames since `811`, and since the scroll's clock began. */
  private ticks = 0
  private started = -1
  private framesBefore = 0
  /** Which job the next V-blank does: move on, or show what was drawn. */
  private show = false
  /** The scroll the screen shows, in whole pixels. */
  shown = 0
  /** What `838` answers: milliseconds since `811`, renewed as the roll moves. */
  stopwatch = 0
  readonly placed: PlacedLine[] = []

  constructor(
    private readonly roll: StaffRoll | undefined,
    private readonly fonts: RollFonts = [undefined, undefined],
  ) {}

  /** One frame: the field's step of the set-up, then the V-blank's job. */
  tick(): void {
    this.ticks++
    if (this.fadeLeft > 0) this.fadeLeft--
    if (this.state === 0) this.setUp()
    if (this.show) {
      this.shown = (this.scroll >> 12) | 0
      this.show = false
      return
    }
    if (this.state === 0) return
    const frames = this.ticks - this.started
    if (frames === this.framesBefore) return
    const d = frames - this.framesBefore
    this.framesBefore = frames
    if (this.state === 1) this.place(d)
    else if (this.state === 2) this.runOut(d)
    this.show = true
    // `+0xA8`, ticks since `811`, read as milliseconds and truncated (`021d9748`).
    this.stopwatch = Math.floor((this.ticks * 1000) / 60)
  }

  /** How far it has scrolled, in whole pixels — ahead of {@link shown} by the frame the game takes to show it. */
  get scrolled(): number {
    return this.scroll >> 12
  }

  /** How dark the bottom screen is, 1 black to 0 — the set-up's fade. */
  get darkness(): number {
    if (this.state !== 0) return 0
    return this.fadeLeft < 0 ? 1 : this.fadeLeft / FADE_FRAMES
  }

  private setUp(): void {
    if (this.step === 5) {
      this.fadeLeft = FADE_FRAMES
      this.step++
      return
    }
    if (this.step === SETUP_LAST) {
      if (this.fadeLeft > 0) return
      this.state = 1
      this.started = this.ticks
      this.framesBefore = 0
      return
    }
    this.step++
  }

  private moveOn(d: number): void {
    const by = scrollStep(d, this.roll?.speed ?? 1)
    this.scroll += by
    this.band += by
    // The band behind is cleared for the ring's reuse — the strip here needs nothing.
    if (this.band >> 12 >= BAND) this.band -= BAND * ONE
  }

  private place(d: number): void {
    this.moveOn(d)
    const lines = this.roll?.lines ?? []
    let before = -1
    for (;;) {
      const line = lines[this.index]
      if (!line) {
        this.state = 2
        return
      }
      if (line.group !== before) {
        if ((this.scroll >> 12) + SCREEN < line.gap + (this.next >> 12)) return
        this.next += line.gap * ONE
      }
      const which = fontOf(line)
      const w = line.align === 0 ? 0 : measure(this.fonts[which], which, line.text ?? '')
      this.placed.push({ line, x: lineX(line.align, w), y: this.next >> 12 })
      this.index++
      before = line.group
    }
  }

  private runOut(d: number): void {
    this.moveOn(d)
    if ((this.next >> 12) + RUN_OUT <= this.scroll >> 12) this.state = 3
  }
}

/** Colour 5, which the set-up writes into the bottom screen's palette (`021d8dd0`). */
export const HEADING_COLOUR = 0x67f5
/**
 * Colours 1, the ground, and 15, the names' ink — **ours**: the game's come
 * with the window colours from the resource at `GameResources+0x2C`, which
 * was not followed. Black and white, BGR555.
 */
export const OUR_COLOURS: Readonly<Record<number, number>> = { 1: 0x0000, 15: 0x7fff }

/** A BGR555 colour as CSS. */
function css(colour: number): string {
  const to8 = (v: number) => Math.round((v * 255) / 31)
  return `rgb(${to8(colour & 31)} ${to8((colour >> 5) & 31)} ${to8((colour >> 10) & 31)})`
}

/** A palette colour of the roll's: 5 the game's, 1 and 15 ours. */
export function rollColour(index: number): string {
  return css(index === 5 ? HEADING_COLOUR : (OUR_COLOURS[index] ?? 0x7fff))
}

/**
 * Draw what the bottom screen shows: the ground, then each line placed in
 * view at its height less the scroll, set glyph by glyph as `func_0204f41c`
 * sets them — each glyph's width + 1 on, **no kerning**, a space or a
 * character with no glyph the font's space, the latter drawn as glyph 0.
 */
export function drawStaffRoll(
  context: CanvasRenderingContext2D,
  run: StaffRollRun,
  fonts: RollFonts,
): void {
  context.fillStyle = rollColour(1)
  context.fillRect(0, 0, 256, 192)
  for (const { line, x, y } of run.placed) {
    const top = y - run.shown
    if (top < -16 || top >= 192) continue
    const which = fontOf(line)
    const font = fonts[which]
    if (!font || !line.text) continue
    context.fillStyle = rollColour(line.colour)
    let pen = x
    for (let at = 0; at < line.text.length; ) {
      const found = glyphAt(font, line.text, at)
      const glyph = found < 0 && line.text[at] !== ' ' ? 0 : found
      if (glyph >= 0) {
        const { width } = font.glyphs[glyph] ?? { width: 0 }
        const pixels = font.pixels(glyph)
        for (let gy = 0; gy < font.height; gy++) {
          for (let gx = 0; gx < width; gx++) {
            if (pixels[gy * width + gx]) context.fillRect(pen + gx, top + gy, 1, 1)
          }
        }
      }
      if (found < 0) {
        pen += SPACE_WIDTH[which]
        at++
      } else {
        pen += (font.glyphs[found]?.width ?? 0) + 1
        at += font.glyphs[found]?.name.length ?? 1
      }
    }
  }
  if (run.darkness > 0) {
    context.fillStyle = `rgb(0 0 0 / ${run.darkness})`
    context.fillRect(0, 0, 256, 192)
  }
}

/** A full-screen card, as `820` puts it on the top screen. */
export interface CreditCard {
  readonly width: number
  readonly height: number
  readonly rgba: Uint8Array
  /** What shows where the picture is clear, and after `826` blanks it: its palette's colour 0, as CSS. */
  readonly backdrop: string
}

/**
 * **A card of the ending's**, `820` — read from overlay 1
 * (`func_ov001_021624cc`): the `.pac` the script names, under `data/`, its
 * `CHAR`, `PALT` and `SCRN` loaded onto the top screen's fourth layer
 * (`func_0204b2e0`, `func_0204b3a0`), with that layer alone switched on
 * (`DISPCNT` `0x800`) — the 3D and the sprites off. **INFERRED**: that its
 * palette is loaded as the layers' first, so that its colour 0 is the
 * backdrop that shows through the clear and after `826`.
 */
export function readCard(rom: Uint8Array, path: string): CreditCard | undefined {
  const pack = path.slice(path.lastIndexOf('/') + 1)
  const members = membersOf(rom, `/${path}`, pack)
  const find = (ending: string) => [...members].find(([name]) => name.endsWith(ending))?.[1]
  const [tiles, palette, screen] = [find('.bncg'), find('.bncl'), find('.bnsc')]
  if (!tiles || !palette || !screen) return undefined
  try {
    const colours = readBncl(palette)
    const image = drawBnsc(readBnsc(screen), readBncg(tiles), colours)
    return { ...image, backdrop: css(colours.colours[0] ?? 0) }
  } catch {
    return undefined
  }
}

/** Draw a card on the top screen's canvas, or the backdrop alone when it has been blanked. */
export function drawCard(
  context: CanvasRenderingContext2D,
  card: CreditCard,
  blank: boolean,
): void {
  context.fillStyle = card.backdrop
  context.fillRect(0, 0, 256, 192)
  if (blank) return
  const image = context.createImageData(card.width, card.height)
  image.data.set(card.rgba)
  // Through a second canvas, so that the clear lets the backdrop show.
  const layer = document.createElement('canvas')
  layer.width = card.width
  layer.height = card.height
  layer.getContext('2d')?.putImageData(image, 0, 0)
  context.drawImage(layer, 0, 0)
}
