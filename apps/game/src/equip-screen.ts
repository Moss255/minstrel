import { scanCartridge } from '@minstrel/cartridge'
import {
  drawBnsc,
  isPac,
  readBncg,
  readBncl,
  readBnsc,
  readPac,
  readSprite,
} from '@minstrel/game-formats'
import { drawCell, readNcer, readNcgr, readNclr } from '@minstrel/nitro-gfx'
import type { Bag } from './bag.ts'
import { type Equipped, SLOTS, type Slot } from './equipment.ts'

/**
 * The equipment screen, on the DS's two screens, built from the game's own art.
 *
 * **From the cartridge**: every picture — the top screen's parchment
 * (`bgii21_en.pac`, `eq.bnsc`), the bottom's backdrop, frame, tabs, name plate
 * and sort label (`bg_eq_en.pac`), the slot boxes, row ends and selection
 * corners (`spr_eq.pac`), the button hints, L, R and the pointing hand
 * (`clmm_en.pac`), the slots' small icons (`oiij_en.pac`), and the items' own
 * icons (`/data/ani/d_*.spr`, by {@link itemIconName}). Where the art
 * says where, it is measured from its own pixels: the frame's grid of 4×4
 * cells of 24 at a pitch of 26 from (13, 52), its equipped bar, its tab row of
 * 16-pixel tabs, and where a raised tab sits — see {@link tabAt}.
 *
 * **From the screenshots** of the game (kept locally, not committed): what goes
 * where — the eight slots down the right with the hand beside the chosen one,
 * its name in green; the frame there once a slot is open; the plate, L, R and
 * the hints along the foot; the details of the chosen item on the top screen.
 *
 * **Ours**:
 * - the exact places the screenshots show only roughly;
 * - the text, in the browser's font: the game's Latin font is not read;
 * - the icon of an item that has none under the rule — see {@link itemIconName} —
 *   which is its slot's small icon;
 * - "Nothing Equipped", which none of the string tables read holds;
 * - where the description's lines break;
 * - what is left out: the Hero's figure, and the item's numbers, rarity and
 *   who can use it — none of them read yet;
 * - the grid shows its page of sixteen, and ↑/↓ go through it in order.
 */

export const SCREEN_WIDTH = 256
export const SCREEN_HEIGHT = 192

/** Where the frame sits on the bottom screen: its right half, from the top. */
export const FRAME = { x: 128, y: 0 } as const
/** A grid of 4 × 4 cells, 24 pixels square at a pitch of 26 — measured from `eq_frame`. */
const GRID = { x: 13, y: 52, pitch: 26, cell: 24, across: 4, perPage: 16 } as const
/** The overview's rows: eight of 24 pixels, down the right half. */
const ROW = { x: 128, height: 24 } as const

/** A grid cell's top-left on the bottom screen, for the n-th item on its page. */
export function gridCell(index: number): { x: number; y: number } {
  const k = index % GRID.perPage
  return {
    x: FRAME.x + GRID.x + (k % GRID.across) * GRID.pitch,
    y: FRAME.y + GRID.y + Math.floor(k / GRID.across) * GRID.pitch,
  }
}

/**
 * Where a slot's raised tab is drawn: 32 pixels wide, centred on its 16-pixel
 * tab, which is 16 × slot − 8 into the frame. The first tab's picture leaves
 * its first column blank and the last its last, and centred so both fall
 * outside the frame — which is how the placement was found.
 */
export function tabAt(slot: number): { x: number; y: number } {
  return { x: FRAME.x + slot * 16 - 8, y: FRAME.y }
}

/** The page of sixteen a choice is on, from 0, and how many pages. Choice 0 is the equipped bar. */
export function pageOf(row: number, items: number): { page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items / GRID.perPage))
  return { page: row === 0 ? 0 : Math.floor((row - 1) / GRID.perPage), pages }
}

/**
 * The thousands of an item's id, and the letter of its icons: 12 helms `m`,
 * 13 armour `b`, 15 gloves `g`, 16 legwear `p`, 17 footwear `r`, 18
 * accessories `c`, 19 and 20 weapons `w`, 21 shields `s`, 22 tools `i`.
 */
const ICON_LETTERS: ReadonlyMap<number, string> = new Map([
  [12, 'm'],
  [13, 'b'],
  [15, 'g'],
  [16, 'p'],
  [17, 'r'],
  [18, 'c'],
  [19, 'w'],
  [20, 'w'],
  [21, 's'],
  [22, 'i'],
])

/**
 * An item's icon, `/data/ani/d_<letter><nnn>.spr`: its id in decimal, the
 * thousands choosing the letter and the rest the number — the copper sword,
 * 20004, is `d_w004`. 985 of the 1,178 items have an icon so; see
 * game-formats' FORMAT.md, "Item icons". Undefined outside those thousands.
 */
export function itemIconName(id: number): string | undefined {
  const letter = ICON_LETTERS.get(Math.floor(id / 1000))
  return letter === undefined ? undefined : `d_${letter}${String(id % 1000).padStart(3, '0')}`
}

/** Pixels, RGBA. */
export interface Picture {
  readonly width: number
  readonly height: number
  readonly rgba: Uint8Array
}

export interface EquipPieces {
  readonly top: Picture
  readonly back: Picture
  readonly frame: Picture
  /** The raised tabs, in slot order. */
  readonly tabs: readonly Picture[]
  readonly nameTag: Picture
  readonly sortLabel: Picture
  readonly rowEnd: Picture
  readonly rowMiddle: Picture
  readonly blank: Picture
  /** Each slot's greyed box, for a slot with nothing in it. */
  readonly slotBoxes: readonly Picture[]
  /** Each slot's small icon, 16 × 16. */
  readonly slotIcons: readonly Picture[]
  /** The green corners: top left, top right, bottom left, bottom right. */
  readonly corners: readonly Picture[]
  /** The item icons' sprites by name, `d_w004` and so on, to be decoded when shown. */
  readonly icons: ReadonlyMap<string, Uint8Array>
  readonly hints: {
    readonly change: Picture
    readonly back: Picture
    readonly l: Picture
    readonly r: Picture
    readonly sort: Picture
    readonly hand: Picture
  }
}

/** The raised tabs' files, in slot order, spelt as on the cartridge. */
const TAB_FILES = [
  'eq_tab_weqpon',
  'eq_tab_shield',
  'eq_tab_helm',
  'eq_tab_body',
  'eq_tab_arm',
  'eq_tab_leg',
  'eq_tab_feet',
  'eq_tab_accessory',
]
/** The greyed slot boxes in slot order: `pnts` is the legs', `leg` the feet's. */
const SLOT_BOXES = [
  'eq0_wpn',
  'eq0_shld',
  'eq0_helm',
  'eq0_body',
  'eq0_glove',
  'eq0_pnts',
  'eq0_leg',
  'eq0_acce',
]
/** `obj_iteminfo`'s cells for each slot: sword, shield, helmet, tunic, glove, trousers, boot, ring. */
const SLOT_ICON_CELLS = [1, 13, 16, 14, 17, 15, 18, 19]
/** `eq_cell`'s cells for the hints. */
const HINT_CELLS = { change: 0, back: 1, l: 2, r: 3, sort: 8, hand: 9 } as const

/**
 * A pack's members by name, lower-cased: read from the pack, or — where the
 * cartridge walk opens the pack itself — taken from its leaves.
 */
function membersOf(rom: Uint8Array, filter: string, pack: string): Map<string, Uint8Array> {
  const members = new Map<string, Uint8Array>()
  const marker = `/${pack.toLowerCase()}`
  for (const leaf of scanCartridge(rom, { pathFilter: filter })) {
    const path = leaf.path.toLowerCase()
    const at = path.indexOf(marker)
    if (at < 0) continue
    const rest = path.slice(at + marker.length)
    if (rest === '' && isPac(leaf.bytes)) {
      for (const m of readPac(leaf.bytes).members) members.set(m.name.toLowerCase(), m.data)
    } else if (rest.startsWith('/')) {
      members.set(rest.slice(1), leaf.bytes)
    }
  }
  return members
}

function need(members: ReadonlyMap<string, Uint8Array>, name: string): Uint8Array {
  const found = members.get(name.toLowerCase())
  if (!found) throw new Error(`the equipment screen's ${name} is not on this cartridge`)
  return found
}

/** Every picture the screen is built from, read from the cartridge. */
export function readEquipPieces(rom: Uint8Array): EquipPieces {
  const eq = membersOf(rom, '/data/ani/bg_eq.gp2', 'bg_eq_en.pac')
  const eqTiles = readBncg(need(eq, 'eq_chara.bncg'))
  const eqPalette = readBncl(need(eq, 'eq_pltt.bncl'))
  const screen = (name: string): Picture =>
    drawBnsc(readBnsc(need(eq, `${name}.bnsc`)), eqTiles, eqPalette)

  const detail = membersOf(rom, '/data/ani/bgii21.gp2', 'bgii21_en.pac')
  const top = drawBnsc(
    readBnsc(need(detail, 'eq.bnsc')),
    readBncg(need(detail, 'detail.bncg')),
    readBncl(need(detail, 'detail0.bncl')),
  )

  const spr = membersOf(rom, '/data/ani/spr_eq.pac', 'spr_eq.pac')
  const sprite = (name: string): Picture => {
    const frame = readSprite(need(spr, `${name}.spr`)).decode(0)
    return { width: frame.width, height: frame.height, rgba: frame.pixels }
  }

  const cellsOf = (
    members: ReadonlyMap<string, Uint8Array>,
    stem: string,
    chars: string,
    colours: string,
  ) => {
    const bank = readNcer(need(members, `${stem}.NCER`))
    const tiles = readNcgr(need(members, chars))
    const palettes = readNclr(need(members, colours))
    return (index: number): Picture => {
      const cell = bank.cells[index]
      if (!cell) throw new Error(`${stem} has no cell ${index}`)
      return drawCell(cell, bank.mapping, tiles, palettes)
    }
  }
  const hint = cellsOf(
    membersOf(rom, '/data/ani/clmm.gp2', 'clmm_en.pac'),
    'eq_cell',
    'eq_obj_chara.NCGR',
    'eq_obj_pltt.NCLR',
  )
  const info = cellsOf(
    membersOf(rom, '/data/ani/oiij.gp2', 'oiij_en.pac'),
    'obj_iteminfo',
    'obj_iteminfo.NCGR',
    'obj_iteminfo.NCLR',
  )

  // The item icons: 1,021 sprites of 24 × 24, loose in /data/ani.
  const icons = new Map<string, Uint8Array>()
  for (const leaf of scanCartridge(rom, { pathFilter: '/data/ani/d_' })) {
    const found = /\/(d_[a-z]\d+)\.spr$/i.exec(leaf.path)
    if (found) icons.set((found[1] as string).toLowerCase(), leaf.bytes)
  }

  return {
    icons,
    top,
    back: screen('eq_back'),
    frame: screen('eq_frame'),
    tabs: TAB_FILES.map(screen),
    nameTag: screen('eq_name_tag'),
    sortLabel: screen('eq_sort_none'),
    rowEnd: sprite('eq0_00'),
    rowMiddle: sprite('eq0_01'),
    blank: sprite('eq0_blank'),
    slotBoxes: SLOT_BOXES.map(sprite),
    slotIcons: SLOT_ICON_CELLS.map(info),
    corners: ['eq_curs01', 'eq_curs02', 'eq_curs03', 'eq_curs04'].map(sprite),
    hints: {
      change: hint(HINT_CELLS.change),
      back: hint(HINT_CELLS.back),
      l: hint(HINT_CELLS.l),
      r: hint(HINT_CELLS.r),
      sort: hint(HINT_CELLS.sort),
      hand: hint(HINT_CELLS.hand),
    },
  }
}

/** What the screen shows: the Hero, what is worn and carried, and where the cursor is. */
export interface EquipView {
  readonly hero: string
  readonly level: number | undefined
  readonly equipped: Equipped
  readonly bag: Bag
  readonly itemName: (id: number) => string
  /** The menu's row: a slot in the overview, a choice once a slot is open. */
  readonly row: number
  /** The slot open, if one is. */
  readonly picking: Slot | undefined
  /** What can go in it: nothing, then the bag's items of its kind — see `choicesFor`. */
  readonly choices: readonly (number | undefined)[] | undefined
  /** An item's description, as text; undefined where it has none. */
  readonly describe?: ((id: number) => string | undefined) | undefined
}

export interface EquipScreens {
  draw(top: CanvasRenderingContext2D, bottom: CanvasRenderingContext2D, view: EquipView): void
}

/** **Ours**: the text's font, and its colours taken by eye from the screenshots. */
const FONT = '10px ui-sans-serif, system-ui, sans-serif'
const INK = '#f2eee4'
const CHOSEN = '#7fe07a'
const DIM = '#8f8b84'
/** The parchment's text, dark on light as the screenshots show it. **Ours**: the shade. */
const INK_DARK = '#3a2a16'
/** **Ours**: the game's words for an empty slot are not found. */
const NOTHING = 'Nothing Equipped'

function canvasOf(picture: Picture): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, picture.width)
  canvas.height = Math.max(1, picture.height)
  const context = canvas.getContext('2d')
  if (context && picture.width > 0 && picture.height > 0) {
    const image = context.createImageData(picture.width, picture.height)
    image.data.set(picture.rgba)
    context.putImageData(image, 0, 0)
  }
  return canvas
}

/** The pieces made ready to draw, and the two screens drawn from them. */
export function makeEquipScreens(pieces: EquipPieces): EquipScreens {
  const c = (p: Picture) => canvasOf(p)
  const art = {
    top: c(pieces.top),
    back: c(pieces.back),
    frame: c(pieces.frame),
    tabs: pieces.tabs.map(c),
    nameTag: c(pieces.nameTag),
    sortLabel: c(pieces.sortLabel),
    rowEnd: c(pieces.rowEnd),
    rowMiddle: c(pieces.rowMiddle),
    blank: c(pieces.blank),
    slotBoxes: pieces.slotBoxes.map(c),
    slotIcons: pieces.slotIcons.map(c),
    corners: pieces.corners.map(c),
    hints: {
      change: c(pieces.hints.change),
      back: c(pieces.hints.back),
      l: c(pieces.hints.l),
      r: c(pieces.hints.r),
      sort: c(pieces.hints.sort),
      hand: c(pieces.hints.hand),
    },
  }

  const text = (
    g: CanvasRenderingContext2D,
    words: string,
    x: number,
    y: number,
    colour = INK,
    align: CanvasTextAlign = 'left',
  ) => {
    g.font = FONT
    g.textBaseline = 'middle'
    g.textAlign = align
    g.fillStyle = '#1a140c'
    g.fillText(words, x + 1, y + 1)
    g.fillStyle = colour
    g.fillText(words, x, y)
  }
  const at = (
    g: CanvasRenderingContext2D,
    picture: HTMLCanvasElement | undefined,
    x: number,
    y: number,
  ) => {
    if (picture) g.drawImage(picture, x, y)
  }
  /** The green corners round a box. */
  const corners = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    const [tl, tr, bl, br] = art.corners
    at(g, tl, x - 2, y - 2)
    at(g, tr, x + w - 6, y - 2)
    at(g, bl, x - 2, y + h - 6)
    at(g, br, x + w - 6, y + h - 6)
  }
  /** A small icon standing in for an item's own — **ours**, for the items that have none. */
  const standIn = (g: CanvasRenderingContext2D, slot: number, x: number, y: number) =>
    at(g, art.slotIcons[slot], x, y)
  /** Each item's icon, decoded the first time it is shown; null where it has none. */
  const iconCache = new Map<number, HTMLCanvasElement | null>()
  const iconOf = (id: number): HTMLCanvasElement | null => {
    const cached = iconCache.get(id)
    if (cached !== undefined) return cached
    const name = itemIconName(id)
    const bytes = name ? pieces.icons.get(name) : undefined
    let icon: HTMLCanvasElement | null = null
    try {
      if (bytes) {
        const frame = readSprite(bytes).decode(0)
        icon = canvasOf({ width: frame.width, height: frame.height, rgba: frame.pixels })
      }
    } catch {
      icon = null
    }
    iconCache.set(id, icon)
    return icon
  }
  /** An item in a 24-pixel box at x, y: its own icon, or its slot's standing in. */
  const drawItem = (
    g: CanvasRenderingContext2D,
    id: number,
    slot: number,
    x: number,
    y: number,
  ) => {
    const icon = iconOf(id)
    if (icon) g.drawImage(icon, x, y)
    else standIn(g, slot, x + 4, y + 4)
  }

  /** The foot of the bottom screen: the plate, L and R, and the hints. */
  function foot(g: CanvasRenderingContext2D, view: EquipView, sorting: boolean) {
    at(g, art.hints.l, 2, 144)
    at(g, art.hints.r, 110, 144)
    at(g, art.nameTag, 0, 160)
    text(g, view.hero, 10, 168)
    if (view.level !== undefined) text(g, `Lv. ${view.level}`, 118, 168, INK, 'right')
    // Where the screenshots put the hints; the label under "SELECT Sort", whose
    // cell is wider than its words.
    at(g, art.hints.back, 0, 176)
    at(g, art.hints.change, 40, 176)
    if (sorting) {
      at(g, art.sortLabel, 178, 176)
      at(g, art.hints.sort, 132, 176)
    }
  }

  function overview(g: CanvasRenderingContext2D, view: EquipView) {
    for (const [i, slot] of SLOTS.entries()) {
      const y = i * ROW.height
      // The row's bar: its rounded end, then `eq0_01`'s six filled columns —
      // its first and last are clear — as far as the edge, then the end mirrored.
      at(g, art.rowEnd, ROW.x + 18, y)
      for (let x = ROW.x + 18 + art.rowEnd.width; x < SCREEN_WIDTH - art.rowEnd.width; x += 6) {
        g.drawImage(art.rowMiddle, 1, 0, 6, ROW.height, x, y, 6, ROW.height)
      }
      g.save()
      g.scale(-1, 1)
      g.drawImage(art.rowEnd, -SCREEN_WIDTH, y)
      g.restore()
      const worn = view.equipped.get(slot.slot)
      if (worn === undefined) {
        at(g, art.slotBoxes[i], ROW.x, y)
      } else {
        at(g, art.blank, ROW.x, y)
        drawItem(g, worn, i, ROW.x, y)
      }
      const chosen = i === view.row
      const name = worn === undefined ? NOTHING : view.itemName(worn)
      text(g, name, ROW.x + 30, y + 12, chosen ? CHOSEN : worn === undefined ? DIM : INK)
    }
    at(g, art.hints.hand, ROW.x - 16, view.row * ROW.height + 4)
    foot(g, view, false)
  }

  function picking(g: CanvasRenderingContext2D, view: EquipView, slot: Slot) {
    const index = SLOTS.findIndex((s) => s.slot === slot)
    const choices = view.choices ?? [undefined]
    const items = choices.slice(1) as number[]
    at(g, art.frame, FRAME.x, FRAME.y)
    const tab = tabAt(index)
    at(g, art.tabs[index], tab.x, tab.y)
    // The equipped bar: what the slot holds now.
    const worn = view.equipped.get(slot)
    if (worn !== undefined) drawItem(g, worn, index, FRAME.x + 5, 22)
    text(
      g,
      worn === undefined ? NOTHING : view.itemName(worn),
      FRAME.x + 32,
      34,
      worn === undefined ? DIM : INK,
    )
    // The grid: the page the cursor is on.
    const { page, pages } = pageOf(view.row, items.length)
    for (let k = page * GRID.perPage; k < Math.min(items.length, (page + 1) * GRID.perPage); k++) {
      const cell = gridCell(k)
      const id = items[k] as number
      drawItem(g, id, index, cell.x, cell.y)
      const count = view.bag.items.get(id) ?? 0
      if (count > 1)
        text(g, String(count), cell.x + GRID.cell - 1, cell.y + GRID.cell - 5, INK, 'right')
    }
    if (view.row === 0) corners(g, FRAME.x + 6, 24, 22, 20)
    else {
      const cell = gridCell(view.row - 1)
      corners(g, cell.x, cell.y, GRID.cell, GRID.cell)
    }
    text(g, `${page + 1} / ${pages}`, FRAME.x + 64, 165, INK, 'center')
    foot(g, view, true)
  }

  /** The top screen: the chosen item's name and its stand-in picture on the parchment. */
  function details(g: CanvasRenderingContext2D, view: EquipView) {
    g.drawImage(art.top, 0, 0)
    const slotIndex = view.picking
      ? SLOTS.findIndex((s) => s.slot === view.picking)
      : Math.min(view.row, SLOTS.length - 1)
    const slot = SLOTS[slotIndex]?.slot
    const item = view.picking
      ? view.row === 0
        ? view.equipped.get(view.picking)
        : view.choices?.[view.row]
      : slot && view.equipped.get(slot)
    at(g, art.slotIcons[slotIndex], 15, 8)
    if (item === undefined) return
    text(g, view.itemName(item), 88, 16, INK, 'center')
    // The description, to the picture's right, wrapped to the panel: where the
    // screenshots start it and how far apart its lines are. **Ours**: the wrap.
    const words = view.describe?.(item)
    if (words) {
      g.font = FONT
      let line = ''
      let y = 48
      for (const word of words.split(' ')) {
        const tried = line ? `${line} ${word}` : word
        if (line && g.measureText(tried).width > 102) {
          text(g, line, 64, y, INK_DARK)
          line = word
          y += 12
        } else {
          line = tried
        }
      }
      if (line) text(g, line, 64, y, INK_DARK)
    }
    // The picture box, 32 pixels square from (24, 48): the icon at its own size, centred.
    const icon = iconOf(item)
    if (icon) g.drawImage(icon, 28, 52)
    else {
      const standing = art.slotIcons[slotIndex]
      if (standing) g.drawImage(standing, 24, 48, 32, 32)
    }
  }

  return {
    draw(top, bottom, view) {
      for (const g of [top, bottom]) {
        g.imageSmoothingEnabled = false
        g.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT)
      }
      details(top, view)
      bottom.drawImage(art.back, 0, 0)
      if (view.picking) picking(bottom, view, view.picking)
      else overview(bottom, view)
    },
  }
}
