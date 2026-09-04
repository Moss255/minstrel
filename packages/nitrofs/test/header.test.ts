import { describe, expect, it } from 'vitest'
import { NitroFsError } from '../src/errors.ts'
import { checkHeaderIntegrity, gameCodeRegion, parseRomHeader } from '../src/header.ts'
import { buildRom, fill } from './fixture.ts'

const simple = () => buildRom({ name: '', files: [{ name: 'a.bin', data: fill(4, 1) }] })

describe('parseRomHeader', () => {
  it('reads the documented fields', () => {
    const rom = buildRom(
      { name: '', files: [{ name: 'a.bin', data: fill(4, 1) }] },
      { title: 'TESTTITLE', gameCode: 'ABCD', makerCode: '42' },
    )
    const header = parseRomHeader(rom)

    expect(header.title).toBe('TESTTITLE')
    expect(header.gameCode).toBe('ABCD')
    expect(header.makerCode).toBe('42')
    expect(header.headerSize).toBe(0x4000)
    expect(header.arm9.ramAddress).toBe(0x02000000)
    expect(header.fnt.size).toBeGreaterThan(0)
    expect(header.fat.size % 8).toBe(0)
  })

  it('derives chip size from the capacity exponent', () => {
    // The fixture writes deviceCapacity = 9, i.e. 128 KiB << 9 = 64 MiB.
    expect(parseRomHeader(simple()).chipSize).toBe(64 * 1024 * 1024)
  })

  it('throws on an image shorter than the header', () => {
    expect(() => parseRomHeader(simple().subarray(0, 0x100))).toThrow(NitroFsError)
  })

  it('throws when the FNT is declared empty', () => {
    const rom = simple()
    new DataView(rom.buffer).setUint32(0x044, 0, true)
    expect(() => parseRomHeader(rom)).toThrow(/empty File Name Table/)
  })

  it('throws when a declared region falls outside the image', () => {
    const rom = simple()
    new DataView(rom.buffer).setUint32(0x048, 0x7fff_0000, true)
    expect(() => parseRomHeader(rom)).toThrow(/past end of/)
  })

  it('reports a non-ASCII game code rather than mojibake', () => {
    const rom = simple()
    rom[0x00d] = 0xff
    expect(() => parseRomHeader(rom)).toThrow(/not printable ASCII/)
  })
})

describe('checkHeaderIntegrity', () => {
  it('accepts a well-formed header', () => {
    const integrity = checkHeaderIntegrity(simple())
    expect(integrity.headerOk).toBe(true)
    expect(integrity.computedHeaderChecksum).toBe(integrity.computedHeaderChecksum & 0xffff)
  })

  it('detects a corrupted header checksum', () => {
    const rom = buildRom({ name: '', files: [] }, { corruptChecksums: true })
    expect(checkHeaderIntegrity(rom).headerOk).toBe(false)
  })
})

describe('gameCodeRegion', () => {
  it('returns the trailing region letter', () => {
    expect(gameCodeRegion('ABCP')).toBe('P')
    expect(gameCodeRegion('ABCE')).toBe('E')
    expect(gameCodeRegion('short')).toBe('')
  })
})
