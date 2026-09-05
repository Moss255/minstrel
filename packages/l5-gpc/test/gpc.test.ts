import { describe, expect, it } from 'vitest'
import { crc32, crc32OfName } from '../src/crc32.ts'
import { GpcError } from '../src/errors.ts'
import { isGpc, readGpc } from '../src/gpc.ts'
import { buildGpc, fill, repeating } from './fixture.ts'

const members = [
  { name: 'ev01320.stb', data: repeating(400, 1) },
  { name: 'ev01320_de.bin', data: repeating(120, 2) },
  { name: 'ev01320_en.bin', data: fill(64, 3), stored: true },
  { name: 'ev01320_fr.bin', data: repeating(900, 4) },
]

describe('crc32', () => {
  it('matches the published IEEE check value', () => {
    // CRC-32/ISO-HDLC check value over "123456789" is 0xCBF43926.
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('is empty-input safe', () => {
    expect(crc32(new Uint8Array(0))).toBe(0)
  })

  it('hashes names byte-transparently', () => {
    expect(crc32OfName('123456789')).toBe(0xcbf43926)
  })
})

describe('readGpc', () => {
  it('lists every member with its name', () => {
    const archive = readGpc(buildGpc(members))
    expect(archive.header.count).toBe(4)
    expect(archive.header.version).toBe(5)
    expect([...archive.members].map((m) => m.name).sort()).toEqual(
      members.map((m) => m.name).sort(),
    )
  })

  it('round-trips every member body', () => {
    const archive = readGpc(buildGpc(members))
    for (const m of members) {
      expect(Array.from(archive.read(m.name)), m.name).toEqual(Array.from(m.data))
    }
  })

  it('reads stored and compressed members alike', () => {
    const archive = readGpc(buildGpc(members))
    const stored = archive.member('ev01320_en.bin')
    const packed = archive.member('ev01320_fr.bin')
    expect(stored?.method).toBe(0)
    expect(packed?.method).toBe(1)
    expect(stored?.size).toBe(64)
    expect(packed?.size).toBe(900)
  })

  it('indexes members by the CRC-32 of their name', () => {
    const archive = readGpc(buildGpc(members))
    for (const m of archive.members) {
      expect(m.hash, m.name).toBe(crc32OfName(m.name))
    }
  })

  it('keeps the index sorted ascending by hash, as real archives are', () => {
    const archive = readGpc(buildGpc(members))
    const hashes = archive.members.map((m) => m.hash)
    expect(hashes).toEqual([...hashes].sort((a, b) => a - b))
  })

  it('reads by name, by index and by member alike', () => {
    const archive = readGpc(buildGpc(members))
    const first = archive.members[0]
    if (!first) throw new Error('fixture is empty')
    expect(Array.from(archive.read(0))).toEqual(Array.from(archive.read(first.name)))
    expect(Array.from(archive.read(first))).toEqual(Array.from(archive.read(first.name)))
  })

  it('handles an empty archive', () => {
    const archive = readGpc(buildGpc([]))
    expect(archive.members).toEqual([])
    expect(archive.member('anything')).toBeUndefined()
    expect(() => archive.read('anything')).toThrow(GpcError)
  })

  it('handles a single-member archive', () => {
    const one = [{ name: 'f8.mes', data: repeating(50, 9) }]
    const archive = readGpc(buildGpc(one))
    expect(archive.members).toHaveLength(1)
    expect(Array.from(archive.read('f8.mes'))).toEqual(Array.from(one[0]?.data as Uint8Array))
  })

  it('reports the stored length including the region prefix', () => {
    const archive = readGpc(buildGpc(members))
    for (const m of archive.members) {
      expect(m.storedLength, m.name).toBeGreaterThan(4)
    }
  })
})

describe('isGpc', () => {
  it('recognises the stamp without validating the body', () => {
    expect(isGpc(buildGpc(members))).toBe(true)
    expect(isGpc(Uint8Array.from([0x47, 0x50, 0x43, 0x32, 0xff]))).toBe(true)
    expect(isGpc(fill(32, 1))).toBe(false)
    expect(isGpc(new Uint8Array(2))).toBe(false)
  })
})

describe('readGpc on malformed input', () => {
  it('rejects a non-GPC2 buffer', () => {
    expect(() => readGpc(fill(64, 1))).toThrow(/not a GPC2 archive/)
  })

  it('rejects a buffer shorter than the header', () => {
    expect(() => readGpc(buildGpc(members).subarray(0, 8))).toThrow(GpcError)
  })

  it('rejects an entry-word count inconsistent with the member count', () => {
    expect(() => readGpc(buildGpc(members, { entryWords: 99 }))).toThrow(/entry words/)
  })

  it('rejects an entry whose hash does not match its name', () => {
    const archive = buildGpc(members)
    new DataView(archive.buffer).setUint32(0x18, 0xdeadbeef, true)
    expect(() => readGpc(archive)).toThrow(/does not match CRC-32/)
  })

  it('rejects an entry pointing at a byte that is not a name', () => {
    const archive = buildGpc(members)
    const view = new DataView(archive.buffer)
    const packed = view.getUint32(0x18 + 4, true)
    view.setUint32(0x18 + 4, ((0x7f << 24) | (packed & 0xffffff)) >>> 0, true)
    expect(() => readGpc(archive)).toThrow(/not a name-table entry/)
  })

  it('rejects a member starting past the end of the archive', () => {
    const archive = buildGpc(members)
    const view = new DataView(archive.buffer)
    const packed = view.getUint32(0x18 + 4, true)
    view.setUint32(0x18 + 4, ((packed & 0xff000000) | 0x00ffff) >>> 0, true)
    expect(() => readGpc(archive)).toThrow(/past the archive/)
  })

  it('reports an unidentified codec instead of returning garbage', () => {
    const archive = buildGpc(members)
    const first = readGpc(archive).members[0]
    if (!first) throw new Error('fixture is empty')
    const view = new DataView(archive.buffer)
    const prefix = view.getUint32(first.offset, true)
    view.setUint32(first.offset, ((prefix & ~7) | 5) >>> 0, true)

    const reparsed = readGpc(archive)
    const broken = reparsed.members.find((m) => m.offset === first.offset)
    expect(broken?.readable).toBe(false)
    expect(broken?.method).toBe(5)
    expect(() => reparsed.read(broken as never)).toThrow(/not identified/)
  })

  it('reports an unknown member rather than returning empty bytes', () => {
    const archive = readGpc(buildGpc(members))
    expect(archive.member('nope')).toBeUndefined()
    expect(() => archive.read('nope')).toThrow(/no such member/)
    expect(() => archive.read(99)).toThrow(/outside the/)
  })
})
