import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { isMapManifest, readMapManifest, resolveMapResources } from '../src/mapmanifest.ts'

/**
 * Build a `.bmdj`: a tagged record stream then a string table.
 *
 * The resource records address their names by **byte offset** into the string
 * section, which is the detail the reader exists to get right — an ordinal
 * would work on the first name and drift on every one after it.
 */
function buildManifest(names: readonly string[], options: { declared?: number } = {}): Uint8Array {
  const strings: number[] = []
  const offsets: number[] = []
  for (const name of names) {
    offsets.push(strings.length)
    for (const ch of name) strings.push(ch.charCodeAt(0))
    strings.push(0)
  }

  const records: number[] = []
  const u16 = (v: number) => records.push(v & 0xff, (v >>> 8) & 0xff)
  const u32 = (v: number) =>
    records.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  const record = (tag: number, type: number, values: readonly number[]) => {
    u16(tag)
    records.push(values.length, type)
    for (const v of values) u32(v)
  }

  record(0x6a, 1, [options.declared ?? names.length])
  names.forEach((_, i) => {
    record(0x6c, 81, [i, offsets[i] as number, 0, 0])
  })
  record(0x6e, 0xff, [])

  const header: number[] = []
  const h32 = (v: number) =>
    header.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  h32(0)
  h32(16 + records.length)
  h32(strings.length)
  h32(names.length)
  return Uint8Array.from([...header, ...records, ...strings])
}

const sample = () => buildManifest(['C01M0300.imd', 'C01A0300.imd', 'C01M03L1.imd', 'C01M03G1.imd'])

describe('readMapManifest', () => {
  it("lists a map's resources in order", () => {
    const manifest = readMapManifest(sample())
    expect(manifest.resources.map((r) => r.name)).toEqual([
      'C01M0300.imd',
      'C01A0300.imd',
      'C01M03L1.imd',
      'C01M03G1.imd',
    ])
    expect(manifest.resources.map((r) => r.index)).toEqual([0, 1, 2, 3])
  })

  it('resolves each name by its byte offset, not by its ordinal', () => {
    // Names of differing length, so an ordinal reading would pick the wrong
    // one for everything after the first.
    const manifest = readMapManifest(buildManifest(['a.imd', 'longer_name.imd', 'b.imd']))
    expect(manifest.resources.map((r) => r.name)).toEqual(['a.imd', 'longer_name.imd', 'b.imd'])
  })

  it('strips the authoring extension to give the stem', () => {
    expect(readMapManifest(sample()).resources.map((r) => r.stem)).toEqual([
      'C01M0300',
      'C01A0300',
      'C01M03L1',
      'C01M03G1',
    ])
  })

  it('rejects a manifest whose declared count disagrees with its list', () => {
    expect(() => readMapManifest(buildManifest(['a.imd'], { declared: 5 }))).toThrow(
      GameFormatError,
    )
  })
})

describe('resolveMapResources', () => {
  const files = [
    'C01M0300.nsbmd',
    'C01A0300.col2',
    'C01M03L1.nsbmd',
    'C01M0300.bmdj',
    'unrelated.nsbtx',
  ]

  it('matches a resource to everything it was built to', () => {
    // C01M0300 is both the map's geometry and, by coincidence of stem, the
    // manifest describing it. Returning one file would have to choose, and on
    // the cartridge choosing the first loses the geometry.
    const resolved = resolveMapResources(readMapManifest(sample()), files)
    expect(resolved[0]?.files).toEqual(['C01M0300.nsbmd', 'C01M0300.bmdj'])
    expect(resolved[1]?.files).toEqual(['C01A0300.col2'])
    expect(resolved[2]?.files).toEqual(['C01M03L1.nsbmd'])
  })

  it('reports a missing resource rather than dropping it', () => {
    const resolved = resolveMapResources(readMapManifest(sample()), files)
    expect(resolved).toHaveLength(4)
    expect(resolved[3]?.resource.stem).toBe('C01M03G1')
    expect(resolved[3]?.files).toEqual([])
  })

  it('matches without regard to case', () => {
    const resolved = resolveMapResources(readMapManifest(sample()), ['c01m0300.NSBMD'])
    expect(resolved[0]?.files).toEqual(['c01m0300.NSBMD'])
  })
})

describe('isMapManifest', () => {
  it('accepts a table carrying a resource list', () => {
    expect(isMapManifest(sample())).toBe(true)
  })

  it('rejects one that does not', () => {
    expect(isMapManifest(buildManifest([]))).toBe(false)
    expect(isMapManifest(new Uint8Array(8))).toBe(false)
  })
})
