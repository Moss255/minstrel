import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { isMapLinks, readMapLinks } from '../src/maplinks.ts'

/**
 * Fixtures are built here, never taken from a cartridge.
 *
 * A `.bmbl` is a 16-byte header, a record stream, then a NUL-separated string
 * table. The record stream is deliberately filled with bytes this parser must
 * *not* read: the real files carry records it cannot walk, and the point of
 * this parser is that they do not stop it.
 */
function build(
  names: string[],
  options: { records?: Uint8Array; declaredCount?: number; stringOffset?: number } = {},
): Uint8Array {
  const encoded = names.map((n) =>
    Uint8Array.from(
      [...n].map((c) => c.charCodeAt(0)),
      (c) => c,
    ),
  )
  const stringSize = encoded.reduce((n, e) => n + e.length + 1, 0)
  const records = options.records ?? new Uint8Array(0)
  const stringOffset = options.stringOffset ?? 16 + records.length

  const out = new Uint8Array(stringOffset + stringSize)
  const view = new DataView(out.buffer)
  view.setUint32(0, 39, true)
  view.setUint32(4, stringOffset, true)
  view.setUint32(8, stringSize, true)
  view.setUint32(12, options.declaredCount ?? names.length, true)
  out.set(records, 16)

  let at = stringOffset
  for (const name of encoded) {
    out.set(name, at)
    at += name.length
    out[at] = 0
    at += 1
  }
  return out
}

/** The village's own names, in the order its file lists them. */
const M01 = [
  'M01M00T2',
  'M01M00T1',
  'M01M0000',
  'M01M01',
  'M01M06',
  'M01M04',
  'M01M07',
  'M01M02',
  'M01M03',
  'M01M08',
  'M01M05',
  'F01',
]

/** Stands in for the map index: a code is a code if the index knows it. */
const known = new Set([
  'M01',
  'M01M01',
  'M01M02',
  'M01M03',
  'M01M04',
  'M01M05',
  'M01M06',
  'M01M07',
  'M01M08',
  'F01',
])
const isMapCode = (name: string) => known.has(name.toUpperCase())

describe('readMapLinks', () => {
  it('reads the header and every name', () => {
    const links = readMapLinks(build(M01))
    expect(links.unknown_0x00).toBe(39)
    expect(links.names).toEqual(M01)
  })

  it('resolves a name by its byte offset into the string section', () => {
    // The undecoded records address strings this way, so the mapping is kept.
    const links = readMapLinks(build(M01))
    expect(links.nameAt(0)).toBe('M01M00T2')
    expect(links.nameAt(9)).toBe('M01M00T1')
    expect(links.nameAt(18)).toBe('M01M0000')
    expect(links.nameAt(83)).toBe('F01')
    expect(links.nameAt(4)).toBeUndefined()
  })

  it('reads a file whose records it cannot walk', () => {
    // The whole reason this does not go through `readDataTable`: a record
    // stream that desynchronises must not take the string table with it.
    const rubbish = new Uint8Array(64).fill(0xaa)
    const links = readMapLinks(build(M01, { records: rubbish }))
    expect(links.names).toEqual(M01)
  })

  it('names the maps the village connects to, and not its own files', () => {
    const links = readMapLinks(build(M01))
    expect(links.linksTo('M01', isMapCode)).toEqual([
      'M01M01',
      'M01M06',
      'M01M04',
      'M01M07',
      'M01M02',
      'M01M03',
      'M01M08',
      'M01M05',
      'F01',
    ])
  })

  it('drops the map itself, however it is cased', () => {
    const links = readMapLinks(build(['M01', 'F01']))
    expect(links.linksTo('m01', isMapCode)).toEqual(['F01'])
  })

  it('drops duplicates but keeps string-table order', () => {
    const links = readMapLinks(build(['F01', 'M01M01', 'F01']))
    expect(links.linksTo('M01', isMapCode)).toEqual(['F01', 'M01M01'])
  })

  it('cannot tell a texture from a neighbour without the index', () => {
    // `M01M00T1` and `M01M01` both begin with the map's own code, which is why
    // the caller has to say what counts as a code.
    const links = readMapLinks(build(['M01M00T1', 'M01M01']))
    expect(links.linksTo('M01', () => true)).toEqual(['M01M00T1', 'M01M01'])
    expect(links.linksTo('M01', isMapCode)).toEqual(['M01M01'])
  })

  it('reads a file that names nothing', () => {
    const links = readMapLinks(build([]))
    expect(links.names).toEqual([])
    expect(links.linksTo('M01', isMapCode)).toEqual([])
  })
})

describe('readMapLinks on malformed input', () => {
  it('throws when the file is shorter than its header', () => {
    expect(() => readMapLinks(new Uint8Array(8))).toThrow(GameFormatError)
  })

  it('throws when the string section starts inside the header', () => {
    const data = build(M01)
    new DataView(data.buffer).setUint32(4, 4, true)
    expect(() => readMapLinks(data)).toThrow(/outside the/)
  })

  it('throws when the string section starts past the end', () => {
    const data = build(M01)
    new DataView(data.buffer).setUint32(4, data.length + 16, true)
    expect(() => readMapLinks(data)).toThrow(/outside the/)
  })

  it('throws when the string section runs past the end', () => {
    const data = build(M01)
    new DataView(data.buffer).setUint32(8, data.length, true)
    expect(() => readMapLinks(data)).toThrow(/runs past the end/)
  })

  it('throws when the declared count disagrees with the names found', () => {
    // The check that makes the reading trustworthy: it holds on 667 of 667.
    expect(() => readMapLinks(build(M01, { declaredCount: 11 }))).toThrow(/declares 11 names/)
  })

  it('reports the offset it failed at', () => {
    try {
      readMapLinks(build(M01, { declaredCount: 11 }))
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as GameFormatError).offset).toBe(12)
    }
  })

  it('does not throw on a truncated file that is merely small', () => {
    expect(readMapLinks(build(['F01'])).names).toEqual(['F01'])
  })
})

describe('isMapLinks', () => {
  it('accepts a well-formed file', () => {
    expect(isMapLinks(build(M01))).toBe(true)
  })

  it('rejects one too short to hold a header', () => {
    expect(isMapLinks(new Uint8Array(15))).toBe(false)
  })

  it('rejects a string section outside the file', () => {
    const data = build(M01)
    new DataView(data.buffer).setUint32(4, data.length + 1, true)
    expect(isMapLinks(data)).toBe(false)
  })

  it('rejects a string section that overruns the end', () => {
    const data = build(M01)
    new DataView(data.buffer).setUint32(8, data.length, true)
    expect(isMapLinks(data)).toBe(false)
  })
})
