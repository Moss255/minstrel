/**
 * **A victory's results windows** — read 3 October 2026 from overlay 23
 * (`battle+0x5588`, `func_ov023_021d8a40`–`021d994c`): the window that comes
 * up on the bottom screen as the experience is shared, and the one that
 * replaces it for each member who levels. The message box says the lines;
 * the amounts are only ever shown here.
 *
 * - **Experience Earned** (`021d8f2c`, `021d9290`): 24 tiles wide, 5, 5, 7,
 *   10 or 12 tall for 0 to 4 earners; its title (`str_btl` 30200), then one
 *   row an earner — the name at x 8, "+n" set so that the "+" begins at
 *   148 less the number's width, then "Exp." 4 px on. None: "None" (30202).
 * - **Attributes Increased** (`021d90d0`, `021d94e4`): 26 × 20 tiles; its
 *   title (30210), then nine rows 15 px apart from y 21 — the stat's name
 *   (30220–30228), the old value, an arrow and the new, in colour 5 when it
 *   rose and 15 when not.
 * - **Where** (`021d921c`): centred, at ((32 − w) >> 1, (24 − h) >> 1)
 *   tiles. **Its rows come one every 5 ticks** (`+0x11d`), the first window
 *   from one row (four for none), the second from none.
 * - **Its frame** (`func_0204cd60`): a 4-bit bitmap filled with colour 1, its
 *   corners cleared and stamped with `windata3.bncg`'s tiles 0x15–0x18, then
 *   the frame's tiles 0–7 round the edge, colour 0 clear.
 *
 * **INFERRED**, each where it is used: a tick as a 60th of a second; the
 * title line's 16 px and the rows' 10 px pitch from the text's tags (`<TITLE=16>`,
 * `+0xcc`); a value set right-aligned in three digits.
 */

/** A result window's content. */
export type ResultsWindow =
  | {
      readonly kind: 'experience'
      /** Each earner with a share, in the party's order. */
      readonly rows: readonly { readonly name: string; readonly share: number }[]
    }
  | {
      readonly kind: 'attributes'
      /** The nine attributes, Strength to Max. MP, before and after. */
      readonly rows: readonly { readonly before: number; readonly after: number }[]
    }

/** A tile's pixels. */
export const TILE = 8

/** How many rows the experience window shows, by its earners — `021d8fcc`'s heights, by count. */
const EXPERIENCE_HEIGHTS = [5, 5, 7, 10, 12] as const

/** The window's size in tiles. */
export function windowTiles(window: ResultsWindow): { readonly w: number; readonly h: number } {
  if (window.kind === 'attributes') return { w: 26, h: 20 }
  return {
    w: 24,
    h: EXPERIENCE_HEIGHTS[Math.min(window.rows.length, 4)] ?? 12,
  }
}

/** Where the window stands on the bottom screen, in pixels: centred to the tile (`021d921c`). */
export function windowAt(window: ResultsWindow): { readonly x: number; readonly y: number } {
  const { w, h } = windowTiles(window)
  return { x: ((32 - w) >> 1) * TILE, y: ((24 - h) >> 1) * TILE }
}

/** A tick, ms — INFERRED a 60th of a second. */
const TICK_MS = 1000 / 60
/** The ticks between one row and the next (`+0x11d`). */
const ROW_TICKS = 5

/** How many of its rows are up, `ms` after it opened. */
export function rowsShown(window: ResultsWindow, ms: number): number {
  // Whole ticks first, so that a time on a tick is not a hair short of it.
  const ticks = Math.floor(Math.max(0, ms) / TICK_MS + 1e-6)
  const steps = Math.floor(ticks / ROW_TICKS)
  if (window.kind === 'attributes') return Math.min(9, steps)
  const first = window.rows.length === 0 ? 4 : 1
  return Math.min(window.rows.length, first + steps)
}

/** Where the text begins in a window, and its line pitch (`+0xc8`–`+0xce`). */
const ORIGIN_Y = 5
const LINE = 10
/** The title's line, from `<TITLE=16>` — INFERRED its height. */
const TITLE_LINE = 16

/** Each experience row's top, by the window's own gap (`_s32_div_f`): 7 for two, 10 for three, 9 for four. */
export function experienceRowsY(count: number, h: number): number[] {
  const gap = count > 1 ? Math.trunc((h * TILE - (count * LINE + 29)) / (count - 1)) : 0
  return Array.from({ length: count }, (_, i) => ORIGIN_Y + 1 + TITLE_LINE + i * (LINE + gap))
}

/** Each attribute row's top: 15 px apart from y 21 (`<XY=10, 15r + 21>`). */
export const attributeRowY = (row: number): number => 15 * row + 21

/** The windata tiles the frame is stamped from, by part (`func_0204ecb4`, `0204ea5c`). */
const FRAME = { tl: 0, top: 1, tr: 2, left: 3, right: 4, bl: 5, bottom: 6, br: 7 } as const
const CORNER = { tl: 0x15, tr: 0x16, br: 0x17, bl: 0x18 } as const

/**
 * The window's frame and body as colour numbers, one a pixel — `func_0204cd60`:
 * filled with 1, each corner cleared to 0 and stamped with its rounded mask,
 * then the frame's tiles round the edge. `tiles` is `windata3.bncg`'s 4-bit
 * data; a tile's colour 0 leaves what is under it.
 */
export function windowPixels(tiles: Uint8Array, w: number, h: number): Uint8Array {
  const wide = w * TILE
  const out = new Uint8Array(wide * h * TILE).fill(1)
  const pixel = (tile: number, x: number, y: number): number => {
    const byte = tiles[tile * 32 + y * 4 + (x >> 1)] ?? 0
    return x & 1 ? byte >> 4 : byte & 0xf
  }
  const stamp = (tile: number, tx: number, ty: number, clear = false) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const at = (ty * TILE + y) * wide + tx * TILE + x
        if (clear) out[at] = 0
        const c = pixel(tile, x, y)
        if (c !== 0) out[at] = c
      }
    }
  }
  stamp(CORNER.tl, 0, 0, true)
  stamp(CORNER.tr, w - 1, 0, true)
  stamp(CORNER.bl, 0, h - 1, true)
  stamp(CORNER.br, w - 1, h - 1, true)
  stamp(FRAME.tl, 0, 0)
  stamp(FRAME.tr, w - 1, 0)
  stamp(FRAME.bl, 0, h - 1)
  stamp(FRAME.br, w - 1, h - 1)
  for (let x = 1; x < w - 1; x++) {
    stamp(FRAME.top, x, 0)
    stamp(FRAME.bottom, x, h - 1)
  }
  for (let y = 1; y < h - 1; y++) {
    stamp(FRAME.left, 0, y)
    stamp(FRAME.right, w - 1, y)
  }
  return out
}
