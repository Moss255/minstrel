import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import {
  isMapManifest,
  placementOf,
  readMapManifest,
  resolveMapResources,
} from '../src/mapmanifest.ts'

/**
 * Build a `.bmdj`: a tagged record stream then a string table.
 *
 * The resource records address their names by **byte offset** into the string
 * section, which is the detail the reader exists to get right — an ordinal
 * would work on the first name and drift on every one after it.
 */
function buildManifest(
  names: readonly string[],
  options: {
    declared?: number
    /** One per name: where the map puts it, and what it hangs off. */
    places?: readonly { at?: [number, number, number]; slot: number; parent?: number }[]
  } = {},
): Uint8Array {
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
    // Tag, count, then two bits of type per value, padded to a word: a record
    // of five or more values has an eight-byte head, not four.
    const typeBytes = Math.max(1, Math.ceil(values.length / 4))
    const header = Math.ceil((3 + typeBytes) / 4) * 4
    records.push(values.length, type)
    for (let i = 4; i < header; i++) records.push(0)
    for (const v of values) u32(v)
  }

  record(0x6a, 1, [options.declared ?? names.length])
  names.forEach((_, i) => {
    record(0x6c, 81, [i, offsets[i] as number, 0, 0])
  })
  if (options.places) {
    const asWord = (value: number) => {
      const buffer = new ArrayBuffer(4)
      new DataView(buffer).setFloat32(0, value, true)
      return new DataView(buffer).getUint32(0, true)
    }
    for (const place of options.places) {
      const [x, y, z] = place.at ?? [0, 0, 0]
      // The real layout, now that the record's header is counted properly: the
      // slot leads, the translation is at 2 to 4 and the parent at 5. What used
      // to look like a leading value was the record's second type byte.
      record(0x6f, 165, [
        place.slot,
        0,
        asWord(x),
        asWord(y),
        asWord(z),
        place.parent ?? 0xffffffff,
        0,
        asWord(1),
        asWord(1),
        asWord(1),
        0,
        0,
        0,
        0,
      ])
    }
  }
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

describe('placement', () => {
  // A map with a ground plane at the origin, a door placed away from it, and
  // the door's collision, which carries no placement of its own and hangs off
  // the door by slot.
  const placedManifest = () =>
    buildManifest(['M00M0000.imd', 'M00M00D1.imd', 'M00A00D1.imd'], {
      places: [{ slot: 0 }, { slot: 7, at: [-28.56, -0.5, -9.472] }, { slot: 9, parent: 7 }],
    })

  it("reads a placement in the file's own units", () => {
    const manifest = readMapManifest(placedManifest())
    const door = manifest.resources[1] as (typeof manifest.resources)[number]
    expect(door.placement?.x).toBeCloseTo(-28.56, 5)
    expect(door.placement?.y).toBeCloseTo(-0.5, 5)
    expect(door.placement?.z).toBeCloseTo(-9.472, 5)
    expect(door.placement?.scaleX).toBe(1)
  })

  it('gives a piece attached to another the place that other one has', () => {
    // The bug this exists for: the door stands in the doorway and its collision
    // stays at the origin, so there is a wall in the middle of the map and none
    // in the doorway.
    const manifest = readMapManifest(placedManifest())
    const collision = manifest.resources[2] as (typeof manifest.resources)[number]
    expect(collision.placement?.x).toBe(0)
    expect(placementOf(manifest, collision).x).toBeCloseTo(-28.56, 5)
    expect(placementOf(manifest, collision).z).toBeCloseTo(-9.472, 5)
  })

  it('leaves a piece with no placement at the origin', () => {
    const manifest = readMapManifest(placedManifest())
    const ground = manifest.resources[0] as (typeof manifest.resources)[number]
    expect(placementOf(manifest, ground)).toMatchObject({ x: 0, y: 0, z: 0 })
  })

  it('is happy with a manifest that carries no placements at all', () => {
    const manifest = readMapManifest(sample())
    expect(manifest.resources[0]?.placement).toBeUndefined()
    expect(
      placementOf(manifest, manifest.resources[0] as (typeof manifest.resources)[number]),
    ).toMatchObject({ x: 0, y: 0, z: 0 })
  })

  it('places nothing when the placements do not pair with the resources', () => {
    // Placements pair by position, so one extra or one missing would put every
    // piece after it in the wrong place with complete confidence. Some of the
    // cartridge's maps carry more placements than resources.
    const uneven = buildManifest(['a.imd', 'b.imd'], { places: [{ slot: 0 }] })
    const manifest = readMapManifest(uneven)
    expect(manifest.placementsPair).toBe(false)
    expect(manifest.resources[0]?.placement).toBeUndefined()
    expect(manifest.resources[1]?.placement).toBeUndefined()
  })

  it('does not hang on a chain that names itself', () => {
    const cyclic = buildManifest(['a.imd', 'b.imd'], {
      places: [
        { slot: 1, parent: 2 },
        { slot: 2, parent: 1 },
      ],
    })
    const manifest = readMapManifest(cyclic)
    expect(
      placementOf(manifest, manifest.resources[0] as (typeof manifest.resources)[number]),
    ).toMatchObject({ x: 0, z: 0 })
  })
})
