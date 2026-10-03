import { drawBnsc, type LatinFont, readBncg, readBncl, readBnsc } from '@minstrel/game-formats'
import { membersOf } from './equip-screen.ts'
import { setText } from './latin-text.ts'

/**
 * **The Story So Far** — what the Y Button shows. Read 4 October 2026 (US
 * code; the European cartridge's files):
 *
 * - **One number for the whole game**, `GameState+0x5CBC` (getter
 *   `func_0201081c`, setter `func_02010810`): 1 on a new game
 *   (`func_0200f3a4`, `0x0200f4d4`), saved and loaded with it, and **set only
 *   by the trigger action `197 : n`** (`func_02061c04`, case 97,
 *   `0x020636b4`) — to `n`, at once, with no forward-only rule. It is not one
 *   of the five threads' fields.
 * - **The page is message `n` of `str_ol`** (`/data/scenario/str_ol.gp2`,
 *   tag `0x67`), its `<val_1>` the fyggs found — how many of game-wide flags
 *   4 to 10 are set (the table at `0x02170138`).
 * - **Y in the field** (`func_ov017_021a51a4`, `0x021a544c`) opens service 45
 *   with `story.stb`: the bottom screen fades to the parchment
 *   `menu/bg_strdw.pac` with the page on it, and the top screen to the world
 *   map. **B** closes it (`story.stb` section 999).
 *
 * The decisive witness: the Hexagoon's lost battle's record sets 10, "…he was
 * defeated", and the won one's 11; and the strategy guide's screenshot shows
 * message 35 word for word.
 *
 * **Ours**: the world map on the top screen, not drawn — this engine's map
 * stays; the fade, which is instant here; the line pitch, 16 px, and the
 * page's colours, INFERRED below.
 */

/** The number a new game starts at (`func_0200f3a4`). */
export const STORY_START = 1

/** The trigger action that sets it. */
export const OP_STORY_SO_FAR = 197

/** The number after a record's actions: the last `197 : n` among them, or as it was. */
export function storySoFarAfter(
  actions: readonly { readonly op: number; readonly arg: number }[] | undefined,
  current: number,
): number {
  let now = current
  for (const action of actions ?? [])
    if (action.op === OP_STORY_SO_FAR && action.arg > 0) now = action.arg
  return now
}

/** The game-wide flags that are the seven fyggs, in the table at `0x02170138`. */
export const FYGG_FLAGS = [4, 5, 6, 7, 8, 9, 10] as const

/** How many fyggs have been found — the page's `<val_1>` (`func_ov004_0216aaec`). */
export const fyggsFound = (globals: ReadonlySet<number>): number =>
  FYGG_FLAGS.filter((flag) => globals.has(flag)).length

/** Where the page's text begins and how wide it may run — `story.stb`'s text object 50 and handler 1's wrap, 215. INFERRED pixels. */
export const PAGE_TEXT = { x: 20, y: 35, width: 215 } as const
/** The pitch of its lines — INFERRED: the message window's default cell height, `<MOJI>`'s 16. */
export const PAGE_LINE = 16

/**
 * The page's text broken into lines no wider than `width`, at its own breaks
 * and then between words. `widthOf` measures a run of words.
 */
export function wrapPage(
  text: string,
  widthOf: (words: string) => number,
  width: number,
): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(' ').filter((w) => w !== '')) {
      const tried = line === '' ? word : `${line} ${word}`
      if (line !== '' && widthOf(tried) > width) {
        lines.push(line)
        line = word
      } else line = tried
    }
    lines.push(line)
  }
  return lines
}

/** The parchment, and the two colours the page is written in. */
export interface StoryArt {
  readonly width: number
  readonly height: number
  readonly rgba: Uint8Array
  /**
   * Colours 15 and 12 of the parchment's palette — text object 50's two
   * nibbles, `+0x44`. INFERRED which is which from the colours themselves:
   * 15 is the dark brown (88, 64, 24) the guide's screenshot is written in,
   * 12 a light parchment tone, taken as its shadow and not drawn here.
   */
  readonly ink: string
  readonly shadow: string
}

const css = (bgr: number): string =>
  `rgb(${((bgr & 31) * 255) / 31} ${(((bgr >> 5) & 31) * 255) / 31} ${(((bgr >> 10) & 31) * 255) / 31})`

/** `menu/bg_strdw.pac`'s picture, `st_01`, drawn whole — the English title is its own. */
export function readStoryArt(rom: Uint8Array): StoryArt | undefined {
  try {
    const members = membersOf(rom, '/data/menu/bg_strdw.pac', 'bg_strdw.pac')
    const get = (name: string) => members.get(name)
    const screen = get('st_01.bnsc')
    const tiles = get('st_01.bncg')
    const palette = get('st_01.bncl')
    if (!screen || !tiles || !palette) return undefined
    const colours = readBncl(palette)
    const picture = drawBnsc(readBnsc(screen), readBncg(tiles), colours)
    return {
      ...picture,
      ink: css(colours.colours[15] ?? 0),
      shadow: css(colours.colours[12] ?? 0x7fff),
    }
  } catch {
    return undefined
  }
}

/** The pixels between words — **ours**, the battle screen's own figure; the font has no space glyph. */
export const WORD_SPACE = 4

/** Draw the page: the parchment, then its lines in the game's letters, word by word. */
export function drawStoryPage(
  context: CanvasRenderingContext2D,
  art: StoryArt,
  font: LatinFont | undefined,
  text: string,
): void {
  const image = context.createImageData(art.width, art.height)
  image.data.set(art.rgba)
  context.putImageData(image, 0, 0)
  context.font = '11px system-ui, sans-serif'
  context.textBaseline = 'top'
  const wordWidth = (word: string): number =>
    (font ? setText(font, word)?.width : undefined) ?? context.measureText(word).width
  const measure = (words: string): number =>
    words
      .split(' ')
      .reduce((width, word, i) => width + wordWidth(word) + (i > 0 ? WORD_SPACE : 0), 0)
  const [r, g, b] = inkOf(art.ink)
  wrapPage(text, measure, PAGE_TEXT.width).forEach((line, i) => {
    const y = PAGE_TEXT.y + i * PAGE_LINE
    let x = PAGE_TEXT.x
    for (const word of line.split(' ')) {
      const set = font && word !== '' ? setText(font, word) : undefined
      if (set && set.width > 0) {
        const glyphs = context.createImageData(set.width, set.height)
        for (let p = 0; p < set.pixels.length; p++) {
          if (set.pixels[p]) glyphs.data.set([r, g, b, 255], p * 4)
        }
        const canvas = document.createElement('canvas')
        canvas.width = glyphs.width
        canvas.height = glyphs.height
        canvas.getContext('2d')?.putImageData(glyphs, 0, 0)
        context.drawImage(canvas, x, y)
      } else {
        // A word the font cannot set: the browser's letters, in the same ink.
        context.fillStyle = art.ink
        context.fillText(word, x, y)
      }
      x += wordWidth(word) + WORD_SPACE
    }
  })
}

function inkOf(colour: string): [number, number, number] {
  const m = /rgb\(([\d.]+) ([\d.]+) ([\d.]+)\)/.exec(colour)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0]
}
