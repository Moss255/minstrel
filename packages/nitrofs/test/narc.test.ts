import { describe, expect, it } from 'vitest'
import { NitroFsError } from '../src/errors.ts'
import { isNarc, readNarc } from '../src/narc.ts'
import { buildNarc, fill } from './fixture.ts'

const members = [
  { name: 'hero.nsbmd', data: fill(300, 1) },
  { name: 'hero.nsbca', data: fill(64, 2) },
  { name: 'hero.bcfg', data: fill(7, 3) },
]

describe('readNarc', () => {
  it('reads a named archive', () => {
    const archive = readNarc(buildNarc(members))

    expect(archive.hasNames).toBe(true)
    expect(archive.length).toBe(3)
    expect(archive.files.map((f) => f.name)).toEqual(members.map((m) => m.name))
    for (const member of members) {
      expect(Array.from(archive.read(`/${member.name}`)), member.name).toEqual(
        Array.from(member.data),
      )
    }
  })

  it('reads a nameless archive by index', () => {
    const archive = readNarc(buildNarc(members, { nameless: true }))

    expect(archive.hasNames).toBe(false)
    expect(archive.files).toHaveLength(0)
    expect(archive.length).toBe(3)
    expect(Array.from(archive.read(1))).toEqual(Array.from(fill(64, 2)))
    expect(archive.entries().map((e) => e.data.length)).toEqual([300, 64, 7])
    expect(archive.entries().every((e) => e.name === undefined)).toBe(true)
  })

  it('preserves member sizes across 4-byte alignment padding', () => {
    // 7 and 300 are deliberately unaligned; the FAT, not the padding, defines
    // where a member ends.
    const archive = readNarc(buildNarc(members))
    expect(archive.entries().map((e) => e.data.length)).toEqual([300, 64, 7])
  })

  it('returns zero-copy views', () => {
    const narc = buildNarc(members)
    const view = readNarc(narc).read('/hero.nsbca')
    expect(view.buffer).toBe(narc.buffer)
  })

  it('accepts the reversed chunk stamps used by some references', () => {
    const archive = readNarc(buildNarc(members, { reversedStamps: true }))
    expect(archive.length).toBe(3)
    expect(Array.from(archive.read(0))).toEqual(Array.from(fill(300, 1)))
  })

  it('handles an empty archive', () => {
    const archive = readNarc(buildNarc([]))
    expect(archive.length).toBe(0)
    expect(archive.entries()).toEqual([])
  })
})

describe('isNarc', () => {
  it('recognises the stamp without validating the body', () => {
    expect(isNarc(buildNarc(members))).toBe(true)
    expect(isNarc(Uint8Array.from([0x4e, 0x41, 0x52, 0x43, 0xff]))).toBe(true)
    expect(isNarc(fill(64, 9))).toBe(false)
    expect(isNarc(new Uint8Array(2))).toBe(false)
  })
})

describe('readNarc on malformed input', () => {
  it('rejects a non-NARC', () => {
    expect(() => readNarc(fill(64, 9))).toThrow(NitroFsError)
  })

  it('rejects a big-endian byte-order mark', () => {
    expect(() => readNarc(buildNarc(members, { bom: 0xfeff }))).toThrow(/byte-order mark/)
  })

  it('rejects a truncated archive', () => {
    const narc = buildNarc(members)
    expect(() => readNarc(narc.subarray(0, 0x20))).toThrow(NitroFsError)
  })

  it('rejects a declared size larger than the buffer', () => {
    const narc = buildNarc(members)
    new DataView(narc.buffer).setUint32(0x08, narc.length + 0x1000, true)
    expect(() => readNarc(narc)).toThrow(/only \d+ are present/)
  })

  it('rejects a missing chunk', () => {
    const narc = buildNarc(members)
    // Rename the BTAF stamp so the archive no longer carries a FAT.
    narc.set(new TextEncoder().encode('XXXX'), 0x10)
    expect(() => readNarc(narc)).toThrow(/missing its BTAF chunk/)
  })

  it('rejects a chunk that overruns the archive', () => {
    const narc = buildNarc(members)
    new DataView(narc.buffer).setUint32(0x14, 0x7fff_0000, true)
    expect(() => readNarc(narc)).toThrow(NitroFsError)
  })

  it('rejects a zero-size chunk', () => {
    const narc = buildNarc(members)
    new DataView(narc.buffer).setUint32(0x14, 0, true)
    expect(() => readNarc(narc)).toThrow(/declares a 0-byte size/)
  })

  it('rejects a BTAF file count the chunk cannot hold', () => {
    const narc = buildNarc(members)
    new DataView(narc.buffer).setUint16(0x18, 0x1000, true)
    expect(() => readNarc(narc)).toThrow(/BTAF declares/)
  })

  it('rejects a member range past the end of the image', () => {
    const narc = buildNarc(members)
    // First BTAF entry's end offset sits at 0x10 + 8 (chunk header) + 4 + 4.
    new DataView(narc.buffer).setUint32(0x10 + 8 + 4 + 4, 0x7fff_0000, true)
    expect(() => readNarc(narc)).toThrow(/past the .*-byte limit/)
  })

  it('reports an unknown member rather than returning empty bytes', () => {
    const archive = readNarc(buildNarc(members))
    expect(archive.file('/nope')).toBeUndefined()
    expect(() => archive.read('/nope')).toThrow(/no such member/)
    expect(() => archive.read(99)).toThrow(/outside the/)
  })
})
