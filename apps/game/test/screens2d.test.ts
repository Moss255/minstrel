import { readFileSync } from 'node:fs'
import { scanCartridge } from '@minstrel/cartridge'
import {
  drawBnsc,
  isBncg,
  isBncl,
  isBnsc,
  isPac,
  readBncg,
  readBncl,
  readBnsc,
  readPac,
} from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'

const romPath = process.env.MINSTREL_TEST_ROM

type Found = { path: string; bytes: Uint8Array }

/** Every tile, palette and screen file; and, for each pack, those it holds. */
function walk(rom: Uint8Array) {
  const all: Found[] = []
  const groups: Found[][] = []
  const kind = (b: Uint8Array) => isBncg(b) || isBncl(b) || isBnsc(b)
  for (const leaf of scanCartridge(rom, { pathFilter: '/data/' })) {
    if (kind(leaf.bytes)) all.push({ path: leaf.path, bytes: leaf.bytes })
    if (!leaf.path.toLowerCase().endsWith('.pac') || !isPac(leaf.bytes)) continue
    try {
      const members = readPac(leaf.bytes)
        .members.filter((m) => kind(m.data))
        .map((m) => ({ path: `${leaf.path}/${m.name}`, bytes: m.data }))
      all.push(...members)
      if (members.length > 0) groups.push(members)
    } catch {
      // A pack that will not read is the pack reader's test's business.
    }
  }
  return { all, groups }
}

describe.skipIf(!romPath)('the background files, on a real cartridge', { timeout: 600_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()
  // Walked only when there is a cartridge: the body runs to collect the tests even when they skip.
  const found = romPath ? walk(rom) : { all: [], groups: [] }

  it('reads all 408 tile files, 370 palettes and 690 screens, each exactly as long as its head says', () => {
    const tiles = found.all.filter((f) => isBncg(f.bytes))
    const palettes = found.all.filter((f) => isBncl(f.bytes))
    const screens = found.all.filter((f) => isBnsc(f.bytes))
    expect([tiles.length, palettes.length, screens.length]).toEqual([408, 370, 690])
    for (const f of tiles) expect(16 + readBncg(f.bytes).tiles.length, f.path).toBe(f.bytes.length)
    for (const f of palettes)
      expect(12 + readBncl(f.bytes).colours.length * 2, f.path).toBe(f.bytes.length)
    for (const f of screens)
      expect(16 + readBnsc(f.bytes).entries.length * 2, f.path).toBe(f.bytes.length)
    expect(
      tiles.every((f) => {
        const t = readBncg(f.bytes)
        return t.width * t.height === t.count && t.unknown_0x0a === (t.bits === 4 ? 0x7c00 : 0x7c01)
      }),
    ).toBe(true)
  })

  it('draws every screen whose pack holds tiles and a palette, from its largest tile file', () => {
    let drawn = 0
    const flags: string[] = []
    for (const group of found.groups) {
      const tiles = group.filter((f) => isBncg(f.bytes)).map((f) => readBncg(f.bytes))
      const palette = group.find((f) => isBncl(f.bytes))
      if (tiles.length === 0 || !palette) continue
      const largest = tiles.reduce((a, b) => (b.count > a.count ? b : a))
      for (const f of group.filter((g) => isBnsc(g.bytes))) {
        const screen = readBnsc(f.bytes)
        expect(() => drawBnsc(screen, largest, readBncl(palette.bytes)), f.path).not.toThrow()
        flags.push(`${screen.unknown_0x08} with ${largest.bits}`)
        drawn++
      }
    }
    expect(drawn).toBe(659)
    // A screen's +0x08 is 1 exactly where its tiles are eight-bit.
    expect([...new Set(flags)].sort()).toEqual(['0 with 4', '1 with 8'])
  })
})
