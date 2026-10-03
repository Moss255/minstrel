import { describe, expect, it } from 'vitest'
import {
  attributeRowY,
  experienceRowsY,
  type ResultsWindow,
  rowsShown,
  windowAt,
  windowPixels,
  windowTiles,
} from '../src/results-window.ts'

const earners = (n: number): ResultsWindow => ({
  kind: 'experience',
  rows: Array.from({ length: n }, (_, i) => ({ name: `m${i}`, share: 10 })),
})
const levelled: ResultsWindow = {
  kind: 'attributes',
  rows: Array.from({ length: 9 }, () => ({ before: 10, after: 12 })),
}

describe('a victory’s results windows — overlay 23', () => {
  it('sizes the experience window by its earners, and centres it to the tile', () => {
    expect([0, 1, 2, 3, 4].map((n) => windowTiles(earners(n)).h)).toEqual([5, 5, 7, 10, 12])
    expect(windowAt(earners(4))).toEqual({ x: 32, y: 48 })
    expect(windowAt(earners(1))).toEqual({ x: 32, y: 72 })
    expect(windowTiles(levelled)).toEqual({ w: 26, h: 20 })
    expect(windowAt(levelled)).toEqual({ x: 24, y: 16 })
  })

  it('brings its rows in one every 5 ticks: the first window from one, the second from none', () => {
    const tick = 1000 / 60
    expect(rowsShown(earners(4), 0)).toBe(1)
    expect(rowsShown(earners(4), 5 * tick)).toBe(2)
    expect(rowsShown(earners(4), 60 * tick)).toBe(4)
    expect(rowsShown(levelled, 0)).toBe(0)
    expect(rowsShown(levelled, 45 * tick)).toBe(9)
  })

  it('spaces the experience rows by the window’s own gap, and the attributes 15 apart', () => {
    // 7 for two, 10 for three, 9 for four.
    const gaps = [2, 3, 4].map((n) => {
      const ys = experienceRowsY(n, windowTiles(earners(n)).h)
      return (ys[1] ?? 0) - (ys[0] ?? 0) - 10
    })
    expect(gaps).toEqual([7, 10, 9])
    expect([0, 8].map(attributeRowY)).toEqual([21, 141])
  })

  it('fills the body with colour 1, rounds the corners, and stamps the frame round it', () => {
    // A synthetic windata: tile 1 (the top edge) all colour 2, the corner
    // mask 0x15 colour 1 only in its bottom-right quarter.
    const tiles = new Uint8Array(0x19 * 32)
    tiles.fill(0x22, 1 * 32, 2 * 32)
    for (let y = 4; y < 8; y++) tiles[0x15 * 32 + y * 4 + 2] = 0x11
    const px = windowPixels(tiles, 4, 3)
    const at = (x: number, y: number) => px[y * 32 + x]
    expect(at(12, 12)).toBe(1) // the body
    expect(at(10, 2)).toBe(2) // the top edge
    expect(at(0, 0)).toBe(0) // a corner, cleared
    expect(at(5, 5)).toBe(1) // the corner's mask
  })
})
