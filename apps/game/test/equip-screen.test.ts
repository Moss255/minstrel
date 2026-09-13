import { readFileSync } from 'node:fs'
import { readSprite } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import {
  type EquipPieces,
  gridCell,
  itemIconName,
  pageOf,
  readEquipPieces,
  tabAt,
} from '../src/equip-screen.ts'

describe('the equipment screen, laid out', () => {
  it('puts the grid in 4 × 4 cells of 24 at a pitch of 26, from the frame', () => {
    expect(gridCell(0)).toEqual({ x: 141, y: 52 })
    expect(gridCell(3)).toEqual({ x: 219, y: 52 })
    expect(gridCell(4)).toEqual({ x: 141, y: 78 })
    expect(gridCell(15)).toEqual({ x: 219, y: 130 })
    // The seventeenth is the next page's first.
    expect(gridCell(16)).toEqual(gridCell(0))
  })

  it('centres a raised tab on its own, 16 × slot − 8 into the frame', () => {
    expect(tabAt(0)).toEqual({ x: 120, y: 0 })
    expect(tabAt(7)).toEqual({ x: 232, y: 0 })
  })

  it('names an item icon by the id in decimal: the thousands a letter, the rest a number', () => {
    expect(itemIconName(20004)).toBe('d_w004')
    expect(itemIconName(19050)).toBe('d_w050')
    expect(itemIconName(12171)).toBe('d_m171')
    expect(itemIconName(15000)).toBe('d_g000')
    expect(itemIconName(22000)).toBe('d_i000')
    expect(itemIconName(14000)).toBeUndefined()
  })

  it('pages the grid in sixteens, the equipped bar on the first', () => {
    expect(pageOf(0, 20)).toEqual({ page: 0, pages: 2 })
    expect(pageOf(16, 20)).toEqual({ page: 0, pages: 2 })
    expect(pageOf(17, 20)).toEqual({ page: 1, pages: 2 })
    expect(pageOf(0, 0)).toEqual({ page: 0, pages: 1 })
  })
})

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('the equipment screen, on a real cartridge', { timeout: 300_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()
  // Read only when there is a cartridge: the body runs to collect the tests even when they skip.
  const pieces = romPath ? readEquipPieces(rom) : (undefined as unknown as EquipPieces)
  const size = (p: { width: number; height: number }) => `${p.width}×${p.height}`

  it('reads both screens whole, and every piece at its size', () => {
    expect(size(pieces.top)).toBe('256×192')
    expect(size(pieces.back)).toBe('256×192')
    expect(size(pieces.frame)).toBe('128×176')
    expect(pieces.tabs.map(size)).toEqual(new Array(8).fill('32×24'))
    expect(size(pieces.nameTag)).toBe('128×16')
    expect(size(pieces.sortLabel)).toBe('80×16')
    expect(pieces.slotBoxes.map(size)).toEqual(new Array(8).fill('24×24'))
    expect(pieces.slotIcons.map(size)).toEqual(new Array(8).fill('16×16'))
    expect(pieces.corners.map(size)).toEqual(new Array(4).fill('8×8'))
    expect([size(pieces.rowEnd), size(pieces.rowMiddle), size(pieces.blank)]).toEqual([
      '8×24',
      '8×24',
      '24×24',
    ])
    expect(
      [
        pieces.hints.change,
        pieces.hints.back,
        pieces.hints.l,
        pieces.hints.sort,
        pieces.hints.hand,
      ].map(size),
    ).toEqual(['88×16', '48×16', '16×16', '72×16', '16×16'])
  })

  it('has 1,021 item icons, the copper sword among them at 24 × 24', () => {
    expect(pieces.icons.size).toBe(1021)
    const copper = pieces.icons.get(itemIconName(20004) ?? '')
    if (!copper) throw new Error('no copper sword icon')
    const frame = readSprite(copper).decode(0)
    expect([frame.width, frame.height]).toEqual([24, 24])
  })
})
