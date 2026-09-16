import { scanCartridge } from '@minstrel/cartridge'
import {
  isMinimapPicture,
  type LatinFont,
  type MinimapLayout,
  type MinimapMark,
  minimapPixels,
  minimapPoint,
  readLatinFont,
  readMinimapLayout,
  readMinimapPicture,
} from '@minstrel/game-formats'
import { drawCell, readNcer, readNcgr, readNclr } from '@minstrel/nitro-gfx'
import { setText } from './latin-text.ts'

/**
 * The DS's top screen — the map of where the party is — drawn in a corner.
 *
 * From the cartridge: which picture a map is drawn on, the picture, the
 * backdrop behind it, where the Hero stands on it — see game-formats'
 * FORMAT.md, "The mini-map"; where he stands is INFERRED there — and the
 * party's dots and name panels, the game's own pictures.
 *
 * **Ours**, not the game's:
 * - the corner, its size and the `m` key — the DS gives it a screen of its own;
 * - how the window moves: a picture larger than the 256 × 192 screen follows
 *   the Hero, never past its own edge, and a smaller one sits in the middle. How
 *   the DS scrolls one is not known;
 * - the backdrop tiled behind the picture: it is 64 × 64 pixels, which reads as
 *   a pattern, but how the DS lays it is not known;
 * - the party's dots on a room's mark. That a room is shown on its area's
 *   picture is observed — a screenshot inside Stornway's church shows the
 *   town's map with the party on the church — but not exactly where on it they
 *   stand; see {@link partyDots};
 * - which colour is whose: each takes the dot and panel of their place in the
 *   party, the Hero the first, blue. The same screenshot shows each member in a
 *   colour of their own, the first one green, and the rule is not found — see
 *   FORMAT.md, "The markers are coloured dots";
 * - the names' face: `fd_s7`, the plainer of the game's two Latin fonts
 *   (FORMAT.md, "The Latin fonts"), chosen by how the party's names look in
 *   that screenshot, and set a pixel apart — see `latin-text.ts`. A name the
 *   font cannot set, one with a space in it, falls back to the browser's
 *   letters, as does a cartridge whose font will not read.
 */

export const MINIMAP_ARCHIVE = '/data/pack_lv5/minimap.gp2'

/**
 * The party's dots, a member each: the first four of the archive's five
 * coloured markers — blue, green, pink and yellow — in the order the party
 * panels' colours come in.
 */
export const PARTY_MARKERS = ['marker0', 'marker1', 'marker2', 'marker3'] as const

/** The Hero's dot: the first, blue. **Ours** — see above. */
export const HERO_MARKER = PARTY_MARKERS[0]

/** The sprite file the party's panels are in: `obj_minimap.NCER`, `.NCGR` and `.NCLR`, loose in `/data/ani`. */
export const PARTY_SPRITES = '/data/ani/obj_minimap'

/** A party member's panel: cell 2, 64 × 64 — a name strip, then HP, MP and the level. */
export const PANEL_CELL = 2

/**
 * How much of the panel stands along the screen's foot: the name strip, down
 * to and with the white line under it, rows 0 to 15 of the cell. Only that
 * shows in a screenshot of a party of four — four such strips, side by side,
 * across the foot.
 */
export const PANEL_STRIP = 16

/** The panel's colours: palette slots 0 to 3 give its end bars blue, green, pink and orange. */
export const PANEL_COLOURS = 4

/** Where a name goes in its strip: the dark between the end bars, columns 7 to 56 and rows 2 to 14. */
const NAME_LEFT = 7
const NAME_WIDTH = 50
const NAME_MIDDLE = 8.5

/** Where the names' glyphs stand in the strip: their 12-row cell from row 2, the dark's own top. **Ours.** */
const NAME_TOP = 2

/** The names' face, the plainer Latin font: its strip and its index in `/data/pack_lv5`. **Ours**, see above. */
export const NAME_FONT_FILES = { strip: 'fd_s7.bin', index: 'fi_s7.bin' } as const

/** The letters a name falls back on when the game's cannot set it — **ours**: the browser's, bold and white. */
const FALLBACK_FONT = 'bold 9px system-ui, sans-serif'

/** The DS's screen, in pixels. */
export const SCREEN_WIDTH = 256
export const SCREEN_HEIGHT = 192

/** A picture's pixels, RGBA, as `minimapPixels` gives them. */
export interface MinimapSheet {
  readonly width: number
  readonly height: number
  readonly rgba: Uint8Array
}

export interface Minimaps {
  /** Every layout that reads, by its file's name — `M01` — upper-cased. */
  readonly layouts: ReadonlyMap<string, MinimapLayout>
  /** A picture by name, decoded the first time it is asked for. */
  picture(name: string): MinimapSheet | undefined
  /** The party's name strip in each of its colours, in order; none when the sprite file will not read. */
  readonly panels: readonly MinimapSheet[]
  /** The face the names are set in — see {@link NAME_FONT_FILES}; undefined when it will not read. */
  readonly nameFont: LatinFont | undefined
}

/** The archive's layouts, its pictures to decode when wanted, and the party's panels. */
export function readMinimaps(rom: Uint8Array): Minimaps {
  const layouts = new Map<string, MinimapLayout>()
  const pictures = new Map<string, Uint8Array>()
  for (const leaf of scanCartridge(rom, { pathFilter: MINIMAP_ARCHIVE })) {
    const name = leaf.path.slice(leaf.path.lastIndexOf('/') + 1)
    const dot = name.lastIndexOf('.')
    if (dot < 0) continue
    const stem = name.slice(0, dot).toUpperCase()
    const kind = name.slice(dot).toLowerCase()
    try {
      // Four layouts on the cartridge are empty files.
      if (kind === '.bmmp' && leaf.bytes.length > 0)
        layouts.set(stem, readMinimapLayout(leaf.bytes))
      else if (kind === '.obg' && isMinimapPicture(leaf.bytes)) pictures.set(stem, leaf.bytes)
    } catch {
      // A layout that will not read leaves its map without a mini-map.
    }
  }
  const decoded = new Map<string, MinimapSheet | undefined>()
  return {
    layouts,
    picture(name) {
      const stem = name.toUpperCase()
      if (decoded.has(stem)) return decoded.get(stem)
      const bytes = pictures.get(stem)
      let sheet: MinimapSheet | undefined
      try {
        if (bytes) {
          const read = readMinimapPicture(bytes)
          sheet = { width: read.width * 8, height: read.height * 8, rgba: minimapPixels(read) }
        }
      } catch {
        sheet = undefined
      }
      decoded.set(stem, sheet)
      return sheet
    },
    panels: readPanels(rom),
    nameFont: readNameFont(rom),
  }
}

/** The names' face, from its strip and index; undefined when either is missing or will not read. */
function readNameFont(rom: Uint8Array): LatinFont | undefined {
  const files = new Map<string, Uint8Array>()
  for (const leaf of scanCartridge(rom, { pathFilter: '/data/pack_lv5/f' })) {
    files.set(leaf.path.slice(leaf.path.lastIndexOf('/') + 1).toLowerCase(), leaf.bytes)
  }
  const strip = files.get(NAME_FONT_FILES.strip)
  const index = files.get(NAME_FONT_FILES.index)
  if (!strip || !index) return undefined
  try {
    return readLatinFont(strip, index)
  } catch {
    return undefined
  }
}

/** Each name set once, white, by the font it was set in. */
const setNames = new WeakMap<LatinFont, Map<string, HTMLCanvasElement | undefined>>()

/** A name set in the game's letters, white on clear; undefined when the font cannot set it. */
function nameImage(font: LatinFont, name: string): HTMLCanvasElement | undefined {
  let names = setNames.get(font)
  if (!names) {
    names = new Map()
    setNames.set(font, names)
  }
  if (names.has(name)) return names.get(name)
  const set = setText(font, name)
  let image: HTMLCanvasElement | undefined
  if (set && set.width > 0) {
    const rgba = new Uint8Array(set.width * set.height * 4)
    for (let i = 0; i < set.pixels.length; i++) {
      if (set.pixels[i]) rgba.fill(255, i * 4, i * 4 + 4)
    }
    image = canvasOf({ width: set.width, height: set.height, rgba })
  }
  names.set(name, image)
  return image
}

/** The place's name in its tab at the top right — see `TAB`. */
function drawTab(
  context: CanvasRenderingContext2D,
  font: LatinFont | undefined,
  title: string,
): void {
  const name = font ? nameImage(font, title) : undefined
  context.font = FALLBACK_FONT
  const width = (name ? name.width : Math.ceil(context.measureText(title).width)) + TAB.pad * 2
  const x = SCREEN_WIDTH - TAB.right - width
  const y = TAB.top
  context.fillStyle = TAB.fill
  context.strokeStyle = TAB.edge
  context.lineWidth = 1
  context.beginPath()
  context.roundRect(x + 0.5, y + 0.5, width - 1, TAB.height - 1, 3)
  context.fill()
  context.stroke()
  if (name) {
    context.drawImage(name, x + TAB.pad, y + Math.floor((TAB.height - name.height) / 2))
    return
  }
  context.fillStyle = '#fff'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(title, x + width / 2, y + TAB.height / 2)
}

/** The party's panel in each of its colours, cut to its name strip; none when the sprite file will not read. */
function readPanels(rom: Uint8Array): MinimapSheet[] {
  const files = new Map<string, Uint8Array>()
  for (const leaf of scanCartridge(rom, { pathFilter: PARTY_SPRITES })) {
    files.set(leaf.path.slice(leaf.path.lastIndexOf('.') + 1).toUpperCase(), leaf.bytes)
  }
  const cells = files.get('NCER')
  const characters = files.get('NCGR')
  const colours = files.get('NCLR')
  if (!cells || !characters || !colours) return []
  try {
    const bank = readNcer(cells)
    const tiles = readNcgr(characters)
    const palettes = readNclr(colours)
    const cell = bank.cells[PANEL_CELL]
    if (!cell) return []
    const panels: MinimapSheet[] = []
    for (let slot = 0; slot < PANEL_COLOURS; slot++) {
      // The cell is one part, in slot 0; each colour is the same part in another.
      const recoloured = { ...cell, parts: cell.parts.map((part) => ({ ...part, palette: slot })) }
      const drawn = drawCell(recoloured, bank.mapping, tiles, palettes)
      const height = Math.min(PANEL_STRIP, drawn.height)
      panels.push({
        width: drawn.width,
        height,
        rgba: drawn.rgba.subarray(0, drawn.width * height * 4),
      })
    }
    return panels
  } catch {
    return []
  }
}

/** Which layout a map is shown on, and — for a room — the mark that stands for it. */
export interface MinimapFor {
  readonly layout: MinimapLayout
  /** Where a room is on its area's picture; undefined on a map drawn for itself. */
  readonly room: MinimapMark | undefined
}

/**
 * The layout a map is shown on. Its own first: the one whose `0x6b` names its
 * id — true of 242 of the 279 layouts — or failing that the one named for it.
 * Then, for a room, the layout that lists it among its places and has a mark
 * standing for it. Layouts are taken in name order, so the answer is the same
 * every time.
 */
export function minimapFor(
  layouts: ReadonlyMap<string, MinimapLayout>,
  mapId: number | undefined,
  code: string,
): MinimapFor | undefined {
  const inOrder = [...layouts].sort(([a], [b]) => a.localeCompare(b)).map(([, layout]) => layout)
  if (mapId !== undefined) {
    const own = inOrder.find((layout) => layout.own.includes(mapId))
    if (own) return { layout: own, room: undefined }
  }
  const named = layouts.get(code.toUpperCase())
  if (named) return { layout: named, room: undefined }
  if (mapId === undefined) return undefined
  for (const layout of inOrder) {
    if (!layout.places.has(mapId)) continue
    const room = layout.marks.find((mark) => mark.maps.includes(mapId))
    if (room) return { layout, room }
  }
  return undefined
}

/**
 * Where a picture's left (or top) edge goes on a screen so that `point` on it
 * is in view: in the middle when the picture fits, and otherwise with the
 * point centred, as far as the picture's own edge allows. **Ours.**
 */
export function pictureOffset(size: number, screen: number, point: number): number {
  if (size <= screen) return Math.floor((screen - size) / 2)
  return Math.round(Math.max(Math.min(screen / 2 - point, 0), screen - size))
}

/**
 * A room's party on its mark, a dot each, two by two a dot apart: the first
 * top left, the second bottom right, the third bottom left and the fourth top
 * right — as the screenshot in Stornway's church has its party of four. That
 * one screenshot is all the evidence.
 */
export const ROOM_CLUSTER: readonly (readonly [number, number])[] = [
  [-4, -4],
  [4, 4],
  [-4, 4],
  [4, -4],
]

/**
 * Where each member's dot goes, in the picture's pixels, the Hero first: each
 * where they stand, or — in a room — on its mark, one alone on it, and more in
 * {@link ROOM_CLUSTER}. The lone dot on the mark is ours.
 */
export function partyDots(
  layout: MinimapLayout,
  room: MinimapMark | undefined,
  party: readonly { readonly x: number; readonly z: number }[],
): { x: number; y: number }[] {
  if (!room) return party.map((member) => minimapPoint(layout, member.x, member.z))
  const mark = minimapPoint(layout, room.x, room.z)
  if (party.length === 1) return [mark]
  return party.map((_, place) => {
    const [dx, dy] = ROOM_CLUSTER[place % ROOM_CLUSTER.length] as readonly [number, number]
    return { x: mark.x + dx, y: mark.y + dy }
  })
}

/** A sheet on a canvas of its own, ready to be drawn from. */
function canvasOf(sheet: MinimapSheet): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = sheet.width
  canvas.height = sheet.height
  const context = canvas.getContext('2d')
  if (context) {
    const image = context.createImageData(sheet.width, sheet.height)
    image.data.set(sheet.rgba)
    context.putImageData(image, 0, 0)
  }
  return canvas
}

/** What the corner shows: a map's picture, its backdrop, the party's dots and panels, and how it was chosen. */
export interface MinimapShown {
  readonly chosen: MinimapFor
  readonly picture: HTMLCanvasElement
  readonly backdrop: HTMLCanvasElement | undefined
  /** A dot for each place in the party, by {@link PARTY_MARKERS}. */
  readonly markers: readonly (HTMLCanvasElement | undefined)[]
  /** A name strip for each place in the party. */
  readonly panels: readonly HTMLCanvasElement[]
  /** The face the names are set in, if it read. */
  readonly nameFont: LatinFont | undefined
}

/** A map's mini-map, its pictures made ready; undefined when it has none. */
export function showMinimap(
  minimaps: Minimaps,
  mapId: number | undefined,
  code: string,
): MinimapShown | undefined {
  const chosen = minimapFor(minimaps.layouts, mapId, code)
  if (!chosen) return undefined
  const picture = minimaps.picture(chosen.layout.picture)
  if (!picture) return undefined
  const backdrop = chosen.layout.backdrop ? minimaps.picture(chosen.layout.backdrop) : undefined
  return {
    chosen,
    picture: canvasOf(picture),
    backdrop: backdrop ? canvasOf(backdrop) : undefined,
    markers: PARTY_MARKERS.map((name) => {
      const marker = minimaps.picture(name)
      return marker ? canvasOf(marker) : undefined
    }),
    panels: minimaps.panels.map(canvasOf),
    nameFont: minimaps.nameFont,
  }
}

/** One of the party as the corner shows them: where they stand, in the map's own units, and their name. */
export interface PartyShown {
  readonly x: number
  readonly z: number
  readonly name: string
}

/**
 * Draw the screen: the backdrop, the picture where `pictureOffset` puts it —
 * about the Hero, the party's first, or a room's mark — each member's dot, and
 * their name panels along the foot, left to right in their places.
 */
/**
 * The tab naming the place at the picture's top right — "Stornway" on the
 * capture of its church, dark with a light edge and the name in white. Its
 * place, size and colours are taken from that capture by eye; the name is
 * the map index's region. Ours.
 */
const TAB = { right: 6, top: 5, height: 12, pad: 5, fill: '#2a2a2e', edge: '#c8c8c8' } as const

export function drawMinimap(
  context: CanvasRenderingContext2D,
  shown: MinimapShown,
  party: readonly PartyShown[],
  title?: string,
): void {
  const { layout, room } = shown.chosen
  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT)
  if (shown.backdrop) {
    for (let y = 0; y < SCREEN_HEIGHT; y += shown.backdrop.height) {
      for (let x = 0; x < SCREEN_WIDTH; x += shown.backdrop.width)
        context.drawImage(shown.backdrop, x, y)
    }
  } else {
    context.fillStyle = '#000'
    context.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT)
  }
  const dots = partyDots(layout, room, party)
  const at = dots[0] ?? { x: 0, y: 0 }
  const centre = room ? minimapPoint(layout, room.x, room.z) : at
  const left = pictureOffset(shown.picture.width, SCREEN_WIDTH, centre.x)
  const top = pictureOffset(shown.picture.height, SCREEN_HEIGHT, centre.y)
  context.drawImage(shown.picture, left, top)

  // The last first, so the Hero's dot is on top of whoever follows. Ours.
  for (let place = dots.length - 1; place >= 0; place--) {
    const dot = dots[place] as { x: number; y: number }
    const x = Math.round(left + dot.x)
    const y = Math.round(top + dot.y)
    const marker = shown.markers[place]
    if (marker) {
      context.drawImage(marker, x - (marker.width >> 1), y - (marker.height >> 1))
      continue
    }
    // A cartridge whose marker will not read still shows where they are. **Ours.**
    context.fillStyle = '#008484'
    context.beginPath()
    context.arc(x, y, 3.5, 0, Math.PI * 2)
    context.fill()
  }

  if (title) drawTab(context, shown.nameFont, title)

  if (shown.panels.length === 0) return
  context.font = FALLBACK_FONT
  context.fillStyle = '#fff'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  for (const [place, member] of party.entries()) {
    const panel = shown.panels[place % shown.panels.length] as HTMLCanvasElement
    const x = place * panel.width
    const y = SCREEN_HEIGHT - panel.height
    context.drawImage(panel, x, y)
    const name = shown.nameFont ? nameImage(shown.nameFont, member.name) : undefined
    if (name) {
      // Centred in the dark, and cut at its edge if it is wider. Ours.
      const across = Math.min(name.width, NAME_WIDTH)
      const left = x + NAME_LEFT + Math.floor((NAME_WIDTH - across) / 2)
      context.drawImage(name, 0, 0, across, name.height, left, y + NAME_TOP, across, name.height)
      continue
    }
    context.fillText(member.name, x + NAME_LEFT + NAME_WIDTH / 2, y + NAME_MIDDLE, NAME_WIDTH)
  }
}
