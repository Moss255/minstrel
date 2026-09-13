import { readFileSync } from 'node:fs'
import { scanCartridge } from '@minstrel/cartridge'
import { isPac, readPac } from '@minstrel/game-formats'
import {
  drawCell,
  NCER_MAGIC,
  NCGR_MAGIC,
  NCLR_MAGIC,
  readNcer,
  readNcgr,
  readNclr,
  stampAt,
} from '@minstrel/nitro-gfx'
import { describe, expect, it } from 'vitest'

const romPath = process.env.MINSTREL_TEST_ROM

/** Every pack, and every 2D file whether in a pack or standing alone. */
function walk(rom: Uint8Array) {
  const packs: { path: string; length: number; end?: number; error?: string }[] = []
  const files: { path: string; magic: string; bytes: Uint8Array }[] = []
  const groups: { path: string; members: { name: string; magic: string; bytes: Uint8Array }[] }[] =
    []
  const magicOf = (b: Uint8Array) => (b.length >= 4 ? stampAt(b, 0) : '')
  for (const leaf of scanCartridge(rom, { pathFilter: '/data/' })) {
    const magic = magicOf(leaf.bytes)
    if (magic === NCLR_MAGIC || magic === NCGR_MAGIC || magic === NCER_MAGIC) {
      files.push({ path: leaf.path, magic, bytes: leaf.bytes })
    }
    if (!leaf.path.toLowerCase().endsWith('.pac')) continue
    try {
      if (!isPac(leaf.bytes)) throw new Error('not a pack')
      const pac = readPac(leaf.bytes)
      packs.push({ path: leaf.path, length: leaf.bytes.length, end: pac.end })
      const members = pac.members.map((m) => ({
        name: m.name,
        magic: magicOf(m.data),
        bytes: m.data,
      }))
      for (const m of members) {
        if (m.magic === NCLR_MAGIC || m.magic === NCGR_MAGIC || m.magic === NCER_MAGIC) {
          files.push({ path: `${leaf.path}/${m.name}`, magic: m.magic, bytes: m.bytes })
        }
      }
      groups.push({ path: leaf.path, members })
    } catch (error) {
      packs.push({ path: leaf.path, length: leaf.bytes.length, error: String(error) })
    }
  }
  return { packs, files, groups }
}

describe.skipIf(!romPath)(
  'the 2D files and packs, on a real cartridge',
  { timeout: 600_000 },
  () => {
    const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()
    // Walked only when there is a cartridge: the body runs to collect the tests even when they skip.
    const found = romPath ? walk(rom) : { packs: [], files: [], groups: [] }

    it('reads every pack but the five treasure-map data files, each ending at its end', () => {
      const refused = found.packs.filter((p) => p.error !== undefined).map((p) => p.path)
      expect(refused).toHaveLength(5)
      expect(refused.every((path) => /\/tdata_[a-z]{2}\.pac$/.test(path))).toBe(true)
      const read = found.packs.filter((p) => p.error === undefined)
      expect(read).toHaveLength(463)
      expect(read.filter((p) => p.end !== p.length)).toEqual([])
    })

    it('reads all 139 palette files, 224 character files and 138 cell files', () => {
      const count = (magic: string, read: (b: Uint8Array) => unknown) => {
        const of = found.files.filter((f) => f.magic === magic)
        for (const f of of) expect(() => read(f.bytes), f.path).not.toThrow()
        return of.length
      }
      expect(count(NCLR_MAGIC, readNclr)).toBe(139)
      expect(count(NCGR_MAGIC, readNcgr)).toBe(224)
      expect(count(NCER_MAGIC, readNcer)).toBe(138)
    })

    it('draws every cell of every pack holding one each of cells, characters and palettes', () => {
      let packs = 0
      let cells = 0
      for (const group of found.groups) {
        const one = (magic: string) => group.members.filter((m) => m.magic === magic)
        const [cer, cgr, clr] = [one(NCER_MAGIC), one(NCGR_MAGIC), one(NCLR_MAGIC)]
        if (cer.length !== 1 || cgr.length !== 1 || clr.length !== 1) continue
        const bank = readNcer(cer[0]?.bytes as Uint8Array)
        const chars = readNcgr(cgr[0]?.bytes as Uint8Array)
        const palettes = readNclr(clr[0]?.bytes as Uint8Array)
        packs++
        for (const [i, cell] of bank.cells.entries()) {
          expect(
            () => drawCell(cell, bank.mapping, chars, palettes),
            `${group.path} cell ${i}`,
          ).not.toThrow()
          cells++
        }
      }
      expect(packs).toBeGreaterThan(100)
      expect(cells).toBeGreaterThan(1000)
    })

    it("draws the mini-map pack's cell 5 as an 8×8 dot, light blue within a black rim", () => {
      const group = found.groups.find((g) => g.path === '/data/ani/obj_mm.pac')
      const member = (magic: string) =>
        group?.members.find((m) => m.magic === magic)?.bytes as Uint8Array
      const bank = readNcer(member(NCER_MAGIC))
      const cell = bank.cells[5]
      if (!cell) throw new Error('no cell 5')
      const dot = drawCell(
        cell,
        bank.mapping,
        readNcgr(member(NCGR_MAGIC)),
        readNclr(member(NCLR_MAGIC)),
      )
      expect([dot.width, dot.height]).toEqual([8, 8])
      const pixel = (x: number, y: number) => [
        ...dot.rgba.subarray((y * 8 + x) * 4, (y * 8 + x) * 4 + 4),
      ]
      expect(pixel(3, 3)).toEqual([115, 189, 230, 255])
      expect(pixel(0, 0)[3]).toBe(0)
    })
  },
)
