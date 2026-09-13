import { scanCartridge } from '@minstrel/cartridge'
import {
  isMinimapPicture,
  type MinimapLayout,
  type MinimapMark,
  minimapPixels,
  minimapPoint,
  readMinimapLayout,
  readMinimapPicture,
} from '@minstrel/game-formats'

/**
 * The DS's lower screen — the map of where the Hero is — drawn in a corner.
 *
 * From the cartridge: which picture a map is drawn on, the picture, the
 * backdrop behind it, and where the Hero stands on it — see game-formats'
 * FORMAT.md, "The mini-map". Where he stands is INFERRED there.
 *
 * **Ours**, not the game's:
 * - the corner, its size and the `m` key — the DS gives it a screen of its own;
 * - how the window moves: a picture larger than the 256 × 192 screen follows
 *   the Hero, never past its own edge, and a smaller one sits in the middle. How
 *   the DS scrolls one is not known;
 * - the backdrop tiled behind the picture: it is 64 × 64 pixels, which reads as
 *   a pattern, but how the DS lays it is not known;
 * - an interior shown on its area's picture, with the Hero's dot at the mark
 *   that stands for it. INFERRED: no interior has a layout of its own, and the
 *   village's marks and its own list of places name every one of its rooms.
 *
 * The Hero is the game's own blue dot, {@link HERO_MARKER}; that the blue one is
 * his is INFERRED — see FORMAT.md, "The markers are coloured dots".
 */

export const MINIMAP_ARCHIVE = '/data/pack_lv5/minimap.gp2'

/**
 * The Hero's dot: the first of the archive's five coloured markers, blue.
 * INFERRED — the same five dots, in the same order, sit beside the party panels
 * of `obj_minimap`, whose four colours run blue, green, pink, orange.
 */
export const HERO_MARKER = 'marker0'

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
}

/** The archive's layouts, and its pictures to decode when wanted. */
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

/** What the corner shows: a map's picture, its backdrop, the Hero's dot, and how it was chosen. */
export interface MinimapShown {
  readonly chosen: MinimapFor
  readonly picture: HTMLCanvasElement
  readonly backdrop: HTMLCanvasElement | undefined
  readonly hero: HTMLCanvasElement | undefined
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
  const hero = minimaps.picture(HERO_MARKER)
  return {
    chosen,
    picture: canvasOf(picture),
    backdrop: backdrop ? canvasOf(backdrop) : undefined,
    hero: hero ? canvasOf(hero) : undefined,
  }
}

/**
 * Draw the screen: the backdrop, the picture where `pictureOffset` puts it, and
 * the Hero's dot centred where he stands — or, in a room, on its mark. `x` and
 * `z` are in the map's own units.
 */
export function drawMinimap(
  context: CanvasRenderingContext2D,
  shown: MinimapShown,
  hero: { readonly x: number; readonly z: number },
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
  const at = room ? minimapPoint(layout, room.x, room.z) : minimapPoint(layout, hero.x, hero.z)
  const left = pictureOffset(shown.picture.width, SCREEN_WIDTH, at.x)
  const top = pictureOffset(shown.picture.height, SCREEN_HEIGHT, at.y)
  context.drawImage(shown.picture, left, top)
  const x = Math.round(left + at.x)
  const y = Math.round(top + at.y)
  if (shown.hero) {
    context.drawImage(shown.hero, x - (shown.hero.width >> 1), y - (shown.hero.height >> 1))
    return
  }
  // A cartridge whose marker will not read still shows where he is. **Ours.**
  context.fillStyle = '#008484'
  context.beginPath()
  context.arc(x, y, 3.5, 0, Math.PI * 2)
  context.fill()
}
