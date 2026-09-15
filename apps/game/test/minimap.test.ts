import { readFileSync } from 'node:fs'
import { type MinimapLayout, type MinimapMark, minimapPoint } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { setText } from '../src/latin-text.ts'
import {
  HERO_MARKER,
  type MinimapSheet,
  type Minimaps,
  minimapFor,
  PANEL_COLOURS,
  PANEL_STRIP,
  PARTY_MARKERS,
  partyDots,
  pictureOffset,
  ROOM_CLUSTER,
  readMinimaps,
} from '../src/minimap.ts'

/** A layout as `readMinimapLayout` gives one, built by hand. */
function layout(picture: string, own: number[], rooms: [number, string][] = []): MinimapLayout {
  return {
    picture,
    unknown_pictureFirst: 0,
    backdrop: undefined,
    scale: 2,
    corner: { x: -10, y: -10 },
    own,
    marks: rooms.map(([id], i) => ({ x: i, z: -i, maps: [id] })),
    places: new Map(rooms),
    unknown: [],
  }
}

describe('which mini-map a map is shown on', () => {
  const layouts = new Map([
    ['FIELD', layout('FIELD01', [200], [])],
    [
      'TOWN',
      layout(
        'TOWN01',
        [100],
        [
          [101, 'TOWNHOUSE'],
          [102, 'TOWNINN'],
        ],
      ),
    ],
    // A field's mark may name a town's rooms too; the field's own list does not.
    ['WIDE', { ...layout('WIDE01', [300]), marks: [{ x: 0, z: 0, maps: [100, 101, 102] }] }],
  ])

  it('takes the layout drawn for the map, by its id', () => {
    expect(minimapFor(layouts, 100, 'SOMEWHERE')?.layout.picture).toBe('TOWN01')
    expect(minimapFor(layouts, 100, 'SOMEWHERE')?.room).toBeUndefined()
  })

  it('falls back on the layout named for the map', () => {
    expect(minimapFor(layouts, 999, 'field')?.layout.picture).toBe('FIELD01')
    expect(minimapFor(layouts, undefined, 'field')?.layout.picture).toBe('FIELD01')
  })

  it('shows a room on the layout that lists it, at its mark', () => {
    const shown = minimapFor(layouts, 102, 'TOWNINN')
    expect(shown?.layout.picture).toBe('TOWN01')
    expect(shown?.room).toEqual({ x: 1, z: -1, maps: [102] })
  })

  it('has none for a map nothing names', () => {
    expect(minimapFor(layouts, 555, 'NOWHERE')).toBeUndefined()
    expect(minimapFor(layouts, undefined, 'NOWHERE')).toBeUndefined()
  })
})

describe('where the picture sits on the screen — ours', () => {
  it('puts a picture that fits in the middle', () => {
    expect(pictureOffset(168, 256, 40)).toBe(44)
  })

  it('follows the point across one that does not, stopping at its edges', () => {
    expect(pictureOffset(280, 256, 140)).toBe(-12)
    expect(pictureOffset(280, 256, 10)).toBe(0)
    expect(pictureOffset(280, 256, 275)).toBe(-24)
  })
})

describe('where the party’s dots go', () => {
  const town = layout('TOWN01', [100], [[101, 'TOWNHOUSE']])

  it('puts each where they stand, the Hero first', () => {
    const party = [
      { x: 1, z: 2 },
      { x: 3, z: 4 },
    ]
    expect(partyDots(town, undefined, party)).toEqual([
      minimapPoint(town, 1, 2),
      minimapPoint(town, 3, 4),
    ])
  })

  it('puts one alone on a room’s mark, and a party two by two about it', () => {
    const mark = town.marks[0] as MinimapMark
    const at = minimapPoint(town, mark.x, mark.z)
    expect(partyDots(town, mark, [{ x: 9, z: 9 }])).toEqual([at])
    const four = partyDots(
      town,
      mark,
      Array.from({ length: 4 }, () => ({ x: 9, z: 9 })),
    )
    expect(four).toEqual(ROOM_CLUSTER.map(([dx, dy]) => ({ x: at.x + dx, y: at.y + dy })))
    expect(new Set(four.map((dot) => `${dot.x},${dot.y}`)).size).toBe(4)
  })
})

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('the mini-map, on a real cartridge', { timeout: 120_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()
  // Read only when there is a cartridge: the body runs to collect the tests even when they skip.
  const minimaps = romPath ? readMinimaps(rom) : (undefined as unknown as Minimaps)

  it('reads every layout but the four empty files', () => {
    expect(minimaps.layouts.size).toBe(279)
  })

  it('draws the village on its own picture, and the Hero at the road out on its bottom edge', () => {
    const village = minimapFor(minimaps.layouts, 1100, 'M01')
    expect(village?.layout.picture).toBe('M01M0001')
    expect(village?.room).toBeUndefined()
    const picture = minimaps.picture('M01M0001')
    expect([picture?.width, picture?.height]).toEqual([280, 152])
    if (!village) return
    const road = minimapPoint(village.layout, -7.16, 16.31)
    expect(Math.round(road.y)).toBe(148)
  })

  it('shows the church on the village, at its mark', () => {
    const church = minimapFor(minimaps.layouts, 1106, 'M01M06')
    expect(church?.layout.picture).toBe('M01M0001')
    expect(church?.room?.maps).toContain(1106)
  })

  it('draws the field and the pass on theirs', () => {
    expect(minimapFor(minimaps.layouts, 20001, 'F01')?.layout.picture).toBe('F01M0001')
    expect(minimapFor(minimaps.layouts, 5101, 'S01M01')?.layout.picture).toBe('S01M0100')
    expect(minimaps.picture('F01M0001')?.width).toBe(256)
  })

  it('has a blue dot for the Hero, one tile of marker0', () => {
    const dot = minimaps.picture(HERO_MARKER)
    expect([dot?.width, dot?.height]).toEqual([8, 8])
  })

  it('has a dot for each place in the party', () => {
    for (const name of PARTY_MARKERS) expect(minimaps.picture(name)?.width, name).toBe(8)
  })

  it('has the party’s name strip in four colours, the same but for its end bars', () => {
    const pixel = (sheet: MinimapSheet, x: number, y: number) => {
      const at = (y * sheet.width + x) * 4
      return [...sheet.rgba.subarray(at, at + 4)]
    }
    const [first] = minimaps.panels
    if (!first) throw new Error('no party panels')
    expect(minimaps.panels).toHaveLength(PANEL_COLOURS)
    for (const panel of minimaps.panels) {
      expect([panel.width, panel.height]).toEqual([64, PANEL_STRIP])
      // The dark strip the name goes on, and the white line under it.
      expect(pixel(panel, 30, 8)).toEqual(pixel(first, 30, 8))
      expect(
        pixel(panel, 30, 15)
          .slice(0, 3)
          .every((v) => v > 200),
      ).toBe(true)
    }
    expect(new Set(minimaps.panels.map((panel) => pixel(panel, 4, 8).join())).size).toBe(4)
    expect(pixel(first, 4, 8)).toEqual([115, 189, 230, 255])
  })

  it('reads the names’ face, fd_s7, and sets a name in it a pixel apart', () => {
    const font = minimaps.nameFont
    if (!font) throw new Error('no face for the names')
    expect(font.glyphs).toHaveLength(245)
    const across = (c: string) => font.glyphs[font.indexOf(c)]?.width ?? 0
    const ivor = setText(font, 'Ivor')
    // fd_s7 kerns none of these four together.
    expect(ivor?.width).toBe([...'Ivor'].reduce((sum, c) => sum + across(c), 0) + 3)
    expect(ivor?.height).toBe(12)
    // A space's width is not read, so a name with one is not set.
    expect(setText(font, 'Hero and Ivor')).toBeUndefined()
  })
})
