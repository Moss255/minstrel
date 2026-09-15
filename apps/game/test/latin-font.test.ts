import { readFileSync } from 'node:fs'
import { scanCartridge } from '@minstrel/cartridge'
import { type LatinFont, readLatinFont } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'

/**
 * The European build's Latin fonts, on a real cartridge: `fd_me`/`fi_me` and
 * `fd_s7`/`fi_s7` in `/data/pack_lv5`. See game-formats' FORMAT.md, "The
 * Latin fonts". Nothing here is committed; it reads the tester's own dump.
 */
const romPath = process.env.MINSTREL_TEST_ROM

/** The tags the text spells characters with, as `talk.ts` reads them. */
const TEXT_TAGS = [
  '1',
  ',',
  '6',
  '9',
  '66',
  '99',
  'DE66',
  'DE99',
  '--',
  '...',
  '!',
  '?',
  ':',
  '^!',
  '^?',
  'ss',
  'oe',
  "'e",
  '`a',
  '^o',
  ':u',
  '~n',
  ',c',
]

describe.skipIf(!romPath)('the Latin fonts, on a real cartridge', { timeout: 60_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()
  const files = new Map<string, Uint8Array>()
  if (romPath) {
    for (const leaf of scanCartridge(rom, { pathFilter: '/data/pack_lv5/f' })) {
      files.set(leaf.path.slice(leaf.path.lastIndexOf('/') + 1), leaf.bytes)
    }
  }
  const font = (name: 'me' | 's7'): LatinFont => {
    const strip = files.get(`fd_${name}.bin`)
    const index = files.get(`fi_${name}.bin`)
    if (!strip || !index) throw new Error(`no fd_${name}/fi_${name} on this cartridge`)
    return readLatinFont(strip, index)
  }

  it('reads both, every glyph packed a pixel apart to the strip’s end', () => {
    for (const [name, count, width] of [
      ['me', 242, 1600],
      ['s7', 245, 1312],
    ] as const) {
      const read = font(name)
      expect([read.glyphs.length, read.width, read.height]).toEqual([count, width, 12])
      for (let k = 1; k < read.glyphs.length; k++) {
        const [before, glyph] = [read.glyphs[k - 1], read.glyphs[k]]
        expect(glyph?.x, `${name} ${glyph?.name}`).toBe((before?.x ?? 0) + (before?.width ?? 0) + 1)
      }
      const last = read.glyphs.at(-1)
      expect((last?.x ?? 0) + (last?.width ?? 0)).toBe(width)
    }
  })

  it('has every letter and digit, and a glyph for every tag the text spells with', () => {
    for (const name of ['me', 's7'] as const) {
      const read = font(name)
      for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
        expect(read.indexOf(c), `${name} ${c}`).toBeGreaterThanOrEqual(0)
      }
      for (const tag of TEXT_TAGS) {
        expect(read.indexOf(`<${tag}>`), `${name} <${tag}>`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('marks exactly the small letters that have their capital in the font', () => {
    /** A small letter's capital as the font names it; undefined for anything else. */
    const capitalOf = (glyph: string): string | undefined => {
      if (/^[a-z]$/.test(glyph)) return glyph.toUpperCase()
      if (/^<[`'^:~,][a-z]>$/.test(glyph)) {
        return `${glyph.slice(0, 2)}${(glyph[2] as string).toUpperCase()}>`
      }
      return glyph === '<ae>' ? '<AE>' : glyph === '<oe>' ? '<OE>' : undefined
    }
    for (const name of ['me', 's7'] as const) {
      const read = font(name)
      let marked = 0
      for (const glyph of read.glyphs) {
        const capital = capitalOf(glyph.name)
        const has = capital !== undefined && read.indexOf(capital) >= 0
        expect(glyph.hasCapital, `${name} ${glyph.name}`).toBe(has)
        if (has) marked++
      }
      expect(marked, name).toBe(51)
      // ß is a small letter with no capital here, and goes unmarked.
      expect(read.glyphs[read.indexOf('<ss>')]?.hasCapital).toBe(false)
    }
  })

  it('sets bit 6 on every vowel and on ñ, and on no other letter', () => {
    const vowel = (n: string) =>
      /^[AEIOUaeiou]$/.test(n) || /^<[`'^:~][AEIOUaeiou]>$/.test(n) || n === '<AE>' || n === '<ae>'
    for (const name of ['me', 's7'] as const) {
      const glyphs = font(name).glyphs
      const bit6 = glyphs.filter((g) => (g.unknown_flags & 0x40) !== 0).map((g) => g.name)
      expect(
        bit6.filter((n) => !vowel(n)),
        name,
      ).toEqual(['<~n>'])
      expect(
        glyphs.filter((g) => vowel(g.name)).every((g) => (g.unknown_flags & 0x40) !== 0),
        name,
      ).toBe(true)
    }
  })

  it('kerns by one pixel, A before T among them', () => {
    const me = font('me')
    const [a, t] = [me.indexOf('A'), me.indexOf('T')]
    expect(me.kerning).toContainEqual({ left: a, right: t, adjust: -1, unknown_3: 0 })
    expect(me.kerning.every((pair) => pair.adjust === -1 && pair.unknown_3 === 0)).toBe(true)
  })
})
