import { scanCartridge } from '@minstrel/cartridge'
import {
  type Bncl,
  type Bnsc,
  drawBnsc,
  type LatinFont,
  readBncg,
  readBncl,
  readBnsc,
} from '@minstrel/game-formats'
import { type CellImage, drawCell, readNcer, readNcgr, readNclr } from '@minstrel/nitro-gfx'
import { membersOf } from './equip-screen.ts'
import { setText } from './latin-text.ts'
import {
  attributeRowY,
  experienceRowsY,
  type ResultsWindow,
  rowsShown,
  TILE,
  windowAt,
  windowPixels,
  windowTiles,
} from './results-window.ts'

/**
 * **The battle's bottom screen** — the party's panels and the command
 * windows, as overlay 0 draws them on the DS's sub engine
 * (`func_ov000_02173954`, every frame; built by `func_ov000_021729ac`). Read 2
 * October 2026 (USA).
 *
 * **From the cartridge**: the parchment backdrop, the two panels, the target
 * line and the "Lv" label (`data/ani/bg_btl3.pac`), each panel in its member's
 * palette, 2 + their party place; the hand, the digits, the HP and MP bars, the
 * "OK!" and the status icons (`data/ani/obj_bt3.gp2/obj_bt3_en.pac`, cells 0–5,
 * 7–16, 17–18, 6 and 21–31); the text in the game's Latin font.
 *
 * **Read**: the panels stacked down the screen in party order from y 0 when one
 * is large, else 32 — the member choosing a large one of 72 px, everyone else
 * 40 (`func_ov000_02174b14`); every place on a panel (`func_ov000_02170538`,
 * `0x02173b9c`…, `data_ov000_021833c8`…); the bars' length, the value over the
 * most times 1.52 of the 32-px sprite on the large panel and 1.28 on the small
 * (`func_ov000_021741e0`); the "HP"/"MP" letters by the HP left — white, then
 * yellow at a quarter, orange at 8 %, red at none (`func_ov000_02170c7c`,
 * `021750e4`); the small panel's box, saying a status, else a tactic other
 * than Follow Orders, else what was chosen, else "Waiting..."; the menus in the
 * large panel's coloured part at tile (9, 1) of it (`func_ov000_02176634`), the
 * hand 8 px left of and 2 px above the line it points at (`0x021755ac`).
 *
 * **Ours**, each marked: a menu's line pitch, 16 px, and the second column at
 * 69 px (`<X=69>`), its frame left out — how the window's frame tiles are laid
 * is not read; the bars drawn from their left, their anchor not read; a space
 * between words, 4 px, which the font does not give; the text white — the
 * text engine's palette is not read — and a name centred on its place.
 */

export const SCREEN_WIDTH = 256
export const SCREEN_HEIGHT = 192

/** Each panel's height, and the screen's start when none is large (`0x02174ba4`–`0x02174bfc`). */
const LARGE_HEIGHT = 72
const SMALL_HEIGHT = 40
const SMALL_START = 32

/** Places on a panel, in pixels from its corner — the game's tables, cited on each. */
const PLACES = {
  large: {
    name: { x: 37, y: 11 },
    hp: { x: 55, y: 28, pitch: 10 },
    mp: { x: 55, y: 44, pitch: 10 },
    hpBar: { x: 13, y: 40 },
    mpBar: { x: 13, y: 56 },
    bar: 1.52,
    icon: { x: 36, y: 22 },
  },
  small: {
    name: { x: 40, y: 8 },
    hp: { x: 106, y: 1, pitch: 9 },
    mp: { x: 106, y: 15, pitch: 9 },
    hpBar: { x: 72, y: 13 },
    mpBar: { x: 72, y: 27 },
    bar: 1.28,
    icon: { x: 40, y: 22 },
  },
} as const

/** The small panel's box: its middle, on one line (`0x02170640`–`0x021707dc`). */
const BOX = { x: 179, y: 15 }
/** "OK!", on a member whose command is chosen (`0x02180d84`). */
const CHOSEN_BADGE = { x: 224, y: 7 }

/** The sprite cells by use — `obj_bt.NCER`. */
const CELLS = { hand: 0, chosen: 6, digit: 7, hpBar: 17, mpBar: 18, dead: 21, asleep: 23 } as const

/** The "HP"/"MP" letters by the HP left (`data_ov000_021833a0`), BGR555. */
const DANGER_COLOURS = [0x7fff, 0x031f, 0x19df, 0x001f] as const

/**
 * A menu's lines in the large panel: its window's corner, tile (9, 1); the
 * line's start within it, our pitch and the second column (`<X=69>`). Where a
 * window's text begins is not read — **ours**: the line's point 16 px in, the
 * hand 8 px left of it as read, and the text begun 2 px past the hand.
 */
const MENU = { x: 72, y: 8, indent: 16, pitch: 16, column: 69 } as const
/** How far below its record's y a bar's top is drawn — **ours**, see `bar`. */
const BAR_DROP = 4
/** A space between words — **ours**: the font's own space is not read. */
const SPACE = 4
/** What a message leaves clear at the window's right — **ours**. */
const MESSAGE_MARGIN = 10

/** A picture's pixels, RGBA. */
interface Picture {
  readonly width: number
  readonly height: number
  readonly rgba: Uint8Array
}

/** What the screen is drawn from, read once. */
export interface BattleScreenArt {
  readonly back: Picture
  /** A panel in a member's palette, 2 + their place; its "HP"/"MP" letters in a danger colour, its border (colour 15) in `border`. */
  panel(large: boolean, place: number, danger: number, border?: number): Picture
  readonly lv: (place: number) => Picture
  readonly cell: (index: number) => CellImage
  readonly font: LatinFont | undefined
  /** A results window's frame and body, w × h tiles — see `results-window.ts`; undefined without `windata3.bncg`. */
  readonly window: ((w: number, h: number) => Picture) | undefined
  /** Colour `index` of the battle palette's first row, as CSS — INFERRED the window's (`bg_bt.bncl`). */
  readonly colour: (index: number) => string
}

export function readBattleScreenArt(rom: Uint8Array, font: LatinFont | undefined): BattleScreenArt {
  const bg = membersOf(rom, '/data/ani/bg_btl3.pac', 'bg_btl3.pac')
  const need = (name: string) => {
    const found = bg.get(name)
    if (!found) throw new Error(`the battle's ${name} is not on this cartridge`)
    return found
  }
  const tiles = readBncg(need('bg_bt.bncg'))
  const palette = readBncl(need('bg_bt.bncl'))
  const screen = (name: string) => readBnsc(need(name))
  const back = drawBnsc(screen('bg_bt.bnsc'), tiles, palette)
  const large = screen('bg_bt_large.bnsc')
  const small = screen('bg_bt_small.bnsc')
  const lv = screen('bg_bt_lv_en.bnsc')
  // Each screen copied with its palette nibble replaced (`func_0204b620`).
  const inPalette = (s: Bnsc, p: number): Bnsc => ({
    ...s,
    entries: s.entries.map((e) => (e & 0x0fff) | (p << 12)),
  })
  const tinted = (p: number, danger: number): Bncl => {
    const colours = new Uint16Array(palette.colours)
    colours[p * 16 + 10] = DANGER_COLOURS[danger] ?? 0x7fff
    return { ...palette, colours }
  }
  const panels = new Map<string, Picture>()
  const obj = membersOf(rom, '/data/ani/obj_bt3.gp2', 'obj_bt3_en.pac')
  const objNeed = (name: string) => {
    const found = obj.get(name)
    if (!found) throw new Error(`the battle's ${name} is not on this cartridge`)
    return found
  }
  const bank = readNcer(objNeed('obj_bt.ncer'))
  const chars = readNcgr(objNeed('obj_bt.ncgr'))
  const colours = readNclr(objNeed('obj_bt.nclr'))
  const cells = new Map<number, CellImage>()
  // The windows' frame tiles, a file of their own (`func_020421c4`).
  const windata = [...scanCartridge(rom, { pathFilter: '/data/ani/windata3.bncg' })].find((leaf) =>
    leaf.path.toLowerCase().endsWith('/windata3.bncg'),
  )
  const frameTiles = windata ? readBncg(windata.bytes).tiles : undefined
  const rgbOf = (index: number): [number, number, number] => {
    const c = palette.colours[index] ?? 0
    const to8 = (v: number) => Math.round((v * 255) / 31)
    return [to8(c & 31), to8((c >> 5) & 31), to8((c >> 10) & 31)]
  }
  const windows = new Map<string, Picture>()
  return {
    back,
    panel(isLarge, place, danger, border) {
      const key = `${isLarge}:${place}:${danger}:${border ?? ''}`
      let picture = panels.get(key)
      if (!picture) {
        const p = 2 + place
        const colours = tinted(p, danger)
        if (border !== undefined) (colours.colours as Uint16Array)[p * 16 + 15] = border
        picture = drawBnsc(inPalette(isLarge ? large : small, p), tiles, colours)
        panels.set(key, picture)
      }
      return picture
    },
    lv: (place) => drawBnsc(inPalette(lv, 2 + place), tiles, palette),
    cell(index) {
      let image = cells.get(index)
      if (!image) {
        const cell = bank.cells[index]
        image = cell
          ? drawCell(cell, bank.mapping, chars, colours)
          : { left: 0, top: 0, width: 0, height: 0, rgba: new Uint8Array(0) }
        cells.set(index, image)
      }
      return image
    },
    font,
    window: frameTiles
      ? (w, h) => {
          const key = `${w}x${h}`
          let picture = windows.get(key)
          if (!picture) {
            const indices = windowPixels(frameTiles, w, h)
            const rgba = new Uint8Array(indices.length * 4)
            for (const [i, c] of indices.entries()) {
              if (c === 0) continue
              const [r, g, b] = rgbOf(c)
              rgba.set([r, g, b, 255], i * 4)
            }
            picture = { width: w * TILE, height: h * TILE, rgba }
            windows.set(key, picture)
          }
          return picture
        }
      : undefined,
    colour(index) {
      const [r, g, b] = rgbOf(index)
      return `rgb(${r} ${g} ${b})`
    },
  }
}

/** What a results window's words are, from `str_btl`. */
export interface ResultsWords {
  /** 30200 or 30210. */
  readonly title: string
  /** 30202, the experience window's "None". */
  readonly none: string
  /** 30220 to 30228, Strength to Max. MP. */
  readonly attributes: readonly string[]
}

/**
 * **A results window** over the backdrop, its rows as many as are up `ms`
 * after it opened — see `results-window.ts`. The party's panels and the
 * sprites are not drawn while it is up (sub `DISPCNT` OBJ off, `021d8ea0`).
 */
export function drawResults(
  context: CanvasRenderingContext2D,
  art: BattleScreenArt,
  window: ResultsWindow,
  words: ResultsWords,
  ms: number,
): void {
  context.imageSmoothingEnabled = false
  context.putImageData(imageOf(art.back), 0, 0)
  const { w, h } = windowTiles(window)
  const at = windowAt(window)
  const frame = art.window?.(w, h)
  if (frame) blit(context, frame, at.x, at.y)
  const font = art.font
  const white = art.colour(15)
  const width = (words: string) => measure(font, words)
  // The title, centred in its line (`<TITLE=16>`; INFERRED, its text 3 px down).
  const title = (y: number) =>
    text(
      context,
      font,
      words.title,
      at.x + Math.round((w * TILE - width(words.title)) / 2),
      at.y + y,
      'left',
      white,
    )
  const shown = rowsShown(window, ms)
  if (window.kind === 'experience') {
    title(9)
    if (window.rows.length === 0) {
      text(
        context,
        font,
        words.none,
        at.x + Math.round((w * TILE - width(words.none)) / 2),
        at.y + Math.round((h * TILE - 26) / 2) + 16,
        'left',
        white,
      )
      return
    }
    const ys = experienceRowsY(window.rows.length, h)
    for (const [i, row] of window.rows.slice(0, shown).entries()) {
      const y = at.y + (ys[i] ?? 0)
      text(context, font, row.name, at.x + 8, y, 'left', white)
      // "+" at 148 less the number's width, then the number, 4 px, "Exp." (`str_btl` 30201).
      const n = String(row.share)
      const plus = at.x + 148 - width(n)
      text(context, font, '+', plus, y, 'left', white)
      const nx = plus + width('+')
      text(context, font, n, nx, y, 'left', white)
      text(context, font, 'Exp.', nx + width(n) + 4, y, 'left', white)
    }
    return
  }
  title(4)
  // Three digits wide, right-aligned — INFERRED from `func_020465f0(…, 3)`.
  const field = width('999')
  for (const [r, row] of window.rows.slice(0, shown).entries()) {
    const y = at.y + attributeRowY(r)
    text(context, font, words.attributes[r] ?? '', at.x + 10 + 24, y, 'left', white)
    const old = String(row.before)
    const oldX = at.x + 10 + 106
    text(context, font, old, oldX + field - width(old), y, 'left', white)
    const arrowX = oldX + field + 8
    text(context, font, '→', arrowX, y, 'left', white)
    const neu = String(row.after)
    const newX = arrowX + width('→') + 8
    // Colour 5 when it rose, 15 when not (`<PLTT=%d>`, `0x021d95b0`).
    const colour = art.colour(row.after > row.before ? 5 : 15)
    text(context, font, neu, newX + field - width(neu), y, 'left', colour)
  }
}

/** How wide words are set in the font, or a stand-in's guess without it. */
function measure(font: LatinFont | undefined, words: string): number {
  const parts = words.split(' ').map((word) => (font ? setWord(font, word, 'white') : undefined))
  if (!font || parts.some((p) => p === undefined && words !== '')) return words.length * 6
  return parts.reduce((w, p, i) => w + (p?.width ?? 0) + (i > 0 ? SPACE : 0), 0)
}

/** One member's panel, as the screen shows it. */
export interface PanelView {
  /** Their party place, 0 to 3: their colour. */
  readonly place: number
  readonly name: string
  readonly hp: number
  readonly maxHp: number
  readonly mp: number
  readonly maxMp: number
  /** The member now choosing, whose panel is large and holds the menu. */
  readonly large: boolean
  /** What the small panel's box says. */
  readonly box: string
  /** Their command chosen: "OK!". */
  readonly chosen: boolean
  readonly status: 'dead' | 'asleep' | undefined
  /** Their level in their vocation, drawn where no status icon is. */
  readonly level: number | undefined
  /** The border's colour, BGR555, while the acting member's pulse is on — see {@link pulseColour}. */
  readonly border?: number | undefined
}

/**
 * **The acting member's pulse** (`func_ov000_02170b0c`): a phase growing 0.2
 * a vblank, round at π; t = 1 − sin(phase); red and green 10 + ⌊21t⌋, blue
 * 10 + ⌊−10t⌋ — grey (10, 10, 10) to yellow (31, 31, 0) — as BGR555, into
 * colour 15 of the member's panel palette.
 */
export function pulseColour(phase: number): number {
  const t = Math.fround(1 - Math.sin(phase))
  const rg = 10 + Math.trunc(21 * t)
  const b = 10 + Math.trunc(-10 * t)
  return rg | (rg << 5) | (b << 10)
}
/** The pulse's phase a vblank, and where it goes round. */
export const PULSE_STEP = 0.2
export const PULSE_ROUND = 3.1415925
/** Where a panel's level stands: a 16-pixel sprite at (44, 22), the number right-aligned in it (`func_ov000_021811f4`, `func_ov000_02174738`). */
const LEVEL = { x: 44, y: 22, width: 16 } as const

/** The menu in the large panel: its lines, its columns, and which the hand points at. */
export interface MenuView {
  readonly rows: readonly (
    | string
    | { readonly text: string; readonly right: string; readonly at: number }
    | { readonly text: string; readonly colour: string }
  )[]
  readonly columns: 1 | 2
  readonly cursor: number
}

export interface BottomView {
  readonly panels: readonly PanelView[]
  readonly menu: MenuView | undefined
}

/** The "danger" by HP left (`func_ov000_02170c7c`): 0 well, 1 a quarter, 2 8 %, 3 none. */
export function dangerOf(hp: number, max: number): number {
  const ratio = max > 0 ? hp / max : 0
  return ratio <= 0 ? 3 : ratio <= 0.08 ? 2 : ratio <= 0.25 ? 1 : 0
}

/** The panels' places, top to bottom (`func_ov000_02174b14`). */
export function panelsPlaced(panels: readonly PanelView[]): { y: number; large: boolean }[] {
  let y = panels.some((p) => p.large) ? 0 : SMALL_START
  return panels.map((p) => {
    const at = { y, large: p.large }
    y += p.large ? LARGE_HEIGHT : SMALL_HEIGHT
    return at
  })
}

/** Draw the bottom screen. */
export function drawBottom(
  context: CanvasRenderingContext2D,
  art: BattleScreenArt,
  view: BottomView,
): void {
  context.imageSmoothingEnabled = false
  context.putImageData(imageOf(art.back), 0, 0)
  const placed = panelsPlaced(view.panels)
  for (const [k, p] of view.panels.entries()) {
    const { y, large } = placed[k] as { y: number; large: boolean }
    // Every panel's places are from x 0; the small one's art is laid a tile in
    // (`0x02174014`).
    const x = 0
    const danger = dangerOf(p.hp, p.maxHp)
    blit(context, art.panel(large, p.place, danger, p.border), large ? 0 : 8, y)
    const places = large ? PLACES.large : PLACES.small
    text(context, art.font, p.name, x + places.name.x, y + places.name.y, 'centre')
    digits(context, art, p.hp, x + places.hp.x, y + places.hp.y, places.hp.pitch)
    digits(context, art, p.mp, x + places.mp.x, y + places.mp.y, places.mp.pitch)
    bar(
      context,
      art.cell(CELLS.hpBar),
      x + places.hpBar.x,
      y + places.hpBar.y,
      p.hp,
      p.maxHp,
      places.bar,
    )
    bar(
      context,
      art.cell(CELLS.mpBar),
      x + places.mpBar.x,
      y + places.mpBar.y,
      p.mp,
      p.maxMp,
      places.bar,
    )
    if (p.status) {
      const icon = art.cell(p.status === 'dead' ? CELLS.dead : CELLS.asleep)
      sprite(context, icon, x + places.icon.x, y + places.icon.y)
    } else {
      blit(context, art.lv(p.place), x + 32, y + 24)
      if (p.level !== undefined) {
        const n = String(p.level)
        text(
          context,
          art.font,
          n,
          x + LEVEL.x + LEVEL.width - measure(art.font, n),
          y + LEVEL.y,
          'left',
        )
      }
    }
    if (!large) {
      text(context, art.font, p.box, BOX.x, y + BOX.y - 4, 'centre')
      if (p.chosen) sprite(context, art.cell(CELLS.chosen), CHOSEN_BADGE.x, y + CHOSEN_BADGE.y)
    }
    if (large && view.menu) drawMenu(context, art, view.menu, x, y)
  }
}

function drawMenu(
  context: CanvasRenderingContext2D,
  art: BattleScreenArt,
  menu: MenuView,
  x: number,
  y: number,
): void {
  // A message — one row, no cursor — broken between words at the window's
  // right edge, a line a pitch. **Ours**: the game says these in its message
  // box (`func_020421a0`), not in this window.
  const only = menu.rows[0]
  if (menu.cursor < 0 && menu.rows.length === 1 && typeof only === 'string') {
    const hand = art.cell(CELLS.hand)
    const start = x + MENU.x + MENU.indent + Math.max(0, hand.left + hand.width - 8 + 2)
    const room = SCREEN_WIDTH - MESSAGE_MARGIN - start
    const widthOf = (words: string) =>
      words
        .split(' ')
        .reduce(
          (w, word, i) =>
            w +
            (art.font ? (setWord(art.font, word, 'white')?.width ?? 0) : word.length * 6) +
            (i > 0 ? SPACE : 0),
          0,
        )
    const lines: string[] = []
    for (const paragraph of only.split('\n')) {
      let line = ''
      for (const word of paragraph.split(' ')) {
        const tried = line === '' ? word : `${line} ${word}`
        if (line !== '' && widthOf(tried) > room) {
          lines.push(line)
          line = word
        } else line = tried
      }
      lines.push(line)
    }
    for (const [i, line] of lines.entries())
      text(context, art.font, line, start, y + MENU.y + i * MENU.pitch, 'left')
    return
  }
  // A list shows four lines at a time, the page the cursor is on.
  const perPage = menu.columns === 2 ? menu.rows.length : 4
  const page = menu.cursor < 0 ? 0 : Math.floor(menu.cursor / perPage)
  const shown = menu.rows.slice(page * perPage, page * perPage + perPage)
  for (const [i, row] of shown.entries()) {
    const col = menu.columns === 2 ? i % 2 : 0
    const line = menu.columns === 2 ? Math.floor(i / 2) : i
    // The line's point, and its text begun clear of the hand.
    const lx = x + MENU.x + MENU.indent + col * MENU.column
    const ly = y + MENU.y + line * MENU.pitch
    const hand = art.cell(CELLS.hand)
    const start = lx + Math.max(0, hand.left + hand.width - 8 + 2)
    if (typeof row === 'string') text(context, art.font, row, start, ly, 'left')
    else if ('colour' in row) text(context, art.font, row.text, start, ly, 'left', row.colour)
    else {
      text(context, art.font, row.text, start, ly, 'left')
      // The tab is from the window's own left (`<X=118>`).
      text(context, art.font, row.right, x + MENU.x + row.at, ly, 'left')
    }
    if (page * perPage + i === menu.cursor) {
      // The hand, 8 px left of the line's point and 2 above (`0x021755ac`).
      sprite(context, hand, lx - 8, ly - 2)
    }
  }
}

function imageOf(p: Picture): ImageData {
  return new ImageData(new Uint8ClampedArray(p.rgba), p.width, p.height)
}

/** A picture laid over what is there, its clear pixels left clear. */
function blit(context: CanvasRenderingContext2D, p: Picture, x: number, y: number): void {
  if (p.width === 0) return
  context.drawImage(canvasOf(p), x, y)
}

/** A sprite cell at its origin. */
function sprite(context: CanvasRenderingContext2D, c: CellImage, x: number, y: number): void {
  if (c.width === 0) return
  context.drawImage(canvasOf(c), x + c.left, y + c.top)
}

/** A number, right-aligned to end at `x`, a digit a `pitch` (`func_ov000_02181164`). */
function digits(
  context: CanvasRenderingContext2D,
  art: BattleScreenArt,
  value: number,
  x: number,
  y: number,
  pitch: number,
): void {
  const text = String(Math.max(0, Math.trunc(value)))
  for (let i = 0; i < text.length; i++) {
    const digit = Number(text[text.length - 1 - i])
    sprite(context, art.cell(CELLS.digit + digit), x - (i + 1) * pitch, y)
  }
}

/**
 * A bar of a 32-px sprite stretched to value / most × its scale. How the game's
 * affine sprite is anchored is not read (`func_0205ac40`): **ours**, from the
 * panels' own gauges — drawn from the record's x, its top 4 px below the
 * record's y, which lays the full bar on each panel's groove.
 */
function bar(
  context: CanvasRenderingContext2D,
  c: CellImage,
  x: number,
  y: number,
  value: number,
  most: number,
  scale: number,
): void {
  if (c.width === 0 || most <= 0) return
  const length = Math.round(c.width * scale * Math.max(0, Math.min(1, value / most)))
  if (length <= 0) return
  context.drawImage(canvasOf(c), 0, 0, c.width, c.height, x, y + BAR_DROP, length, c.height)
}

/** Text in the game's letters, word by word; the browser's where the font cannot set a word. */
function text(
  context: CanvasRenderingContext2D,
  font: LatinFont | undefined,
  words: string,
  x: number,
  y: number,
  align: 'left' | 'centre',
  colour = 'white',
): void {
  const parts = words.split(' ').map((word) => (font ? setWord(font, word, colour) : undefined))
  if (!font || parts.some((p) => p === undefined)) {
    context.font = 'bold 10px system-ui, sans-serif'
    context.fillStyle = colour
    context.textBaseline = 'top'
    context.textAlign = align === 'centre' ? 'center' : 'left'
    context.fillText(words, x, y)
    context.textAlign = 'left'
    return
  }
  const width = parts.reduce((w, p, i) => w + (p?.width ?? 0) + (i > 0 ? SPACE : 0), 0)
  let at = align === 'centre' ? Math.round(x - width / 2) : x
  for (const p of parts) {
    if (!p) continue
    context.drawImage(p, at, y)
    at += p.width + SPACE
  }
}

const wordsSet = new WeakMap<LatinFont, Map<string, HTMLCanvasElement | undefined>>()

/** A word set in the game's letters in a colour, once; undefined when the font has no glyph for it. */
function setWord(font: LatinFont, word: string, colour = 'white'): HTMLCanvasElement | undefined {
  let set = wordsSet.get(font)
  if (!set) {
    set = new Map()
    wordsSet.set(font, set)
  }
  const key = `${colour}|${word}`
  if (set.has(key)) return set.get(key)
  const drawn = word === '' ? undefined : setText(font, word)
  let image: HTMLCanvasElement | undefined
  if (drawn && drawn.width > 0) {
    const rgba = new Uint8Array(drawn.width * drawn.height * 4)
    for (let i = 0; i < drawn.pixels.length; i++)
      if (drawn.pixels[i]) rgba.fill(255, i * 4, i * 4 + 4)
    image = canvasOf({ width: drawn.width, height: drawn.height, rgba })
    if (colour !== 'white') {
      const tint = image.getContext('2d')
      if (tint) {
        tint.globalCompositeOperation = 'source-in'
        tint.fillStyle = colour
        tint.fillRect(0, 0, image.width, image.height)
      }
    }
  }
  set.set(key, image)
  return image
}

const canvases = new WeakMap<object, HTMLCanvasElement>()

function canvasOf(p: Picture): HTMLCanvasElement {
  let canvas = canvases.get(p)
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.width = p.width
    canvas.height = p.height
    canvas.getContext('2d')?.putImageData(imageOf(p), 0, 0)
    canvases.set(p, canvas)
  }
  return canvas
}
