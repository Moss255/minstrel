import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import {
  isMapManifest,
  placementOf,
  readMapManifest,
  resolveMapResources,
} from '../src/mapmanifest.ts'
import { buildManifest } from './fixture.ts'

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

  // A door placed twice, its collision placed twice — each hanging off one of
  // the door's instances — and a ground plane with no placement.
  const twoDoors = () =>
    buildManifest(['M00M0602.imd', 'M00A0602.imd', 'M00M0600.imd'], {
      places: [
        { slot: 2, names: 0, at: [1, 0, 12] },
        { slot: 6, names: 1, parent: 2 },
        { slot: 4, names: 0, at: [1, 0, 18] },
        { slot: 8, names: 1, parent: 4 },
      ],
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

  it('pairs a placement with the resource it names, not with its position', () => {
    // **The counts need not match.** Fifty-six manifests carry more placements
    // than resources, and every piece of those maps used to be left at the
    // origin — a door standing as a slab through the floor. They carry more
    // because a resource can be placed more than once, and `values[1]` says
    // which resource, so the pairing never needed the counts to agree.
    const uneven = buildManifest(['a.imd', 'b.imd'], {
      places: [
        { slot: 0, names: 1, at: [3, 0, 4] },
        { slot: 1, names: 0, at: [1, 0, 2] },
      ],
    })
    const manifest = readMapManifest(uneven)
    // Out of order on purpose: pairing by position would swap them.
    expect(manifest.resources[0]?.placement).toMatchObject({ x: 1, z: 2 })
    expect(manifest.resources[1]?.placement).toMatchObject({ x: 3, z: 4 })
  })

  it('takes the last of several placements of one resource', () => {
    // **The Hexagon's sliding statue is placed twice**, at one end of its
    // slide and at the other, each with its own collision. The later is where
    // it rests and where the step-5 record stands on it; taking the first put
    // it 0.431 out and `story.test.ts` caught it.
    const twice = buildManifest(['a.imd'], {
      places: [
        { slot: 0, names: 0, at: [-3.45, 0, 0] },
        { slot: 1, names: 0, at: [0, 0, 0] },
      ],
    })
    const manifest = readMapManifest(twice)
    expect(manifest.resources[0]?.placement).toMatchObject({ x: 0, z: 0 })
  })

  it('keeps every placement of a resource placed more than once', () => {
    const manifest = readMapManifest(twoDoors())
    const door = manifest.resources[0] as (typeof manifest.resources)[number]
    expect(door.instances.map((i) => i.slot)).toEqual([2, 4])
    expect(door.instances.map((i) => i.placement.z)).toEqual([12, 18])
    expect(manifest.resources[2]?.instances).toEqual([])
  })

  it("places an attached resource by its own instance's parent", () => {
    // `D03M06`'s shape: a door placed twice, and its collision placed twice,
    // each collision hanging off one instance of the door. Resolved through the
    // door's last instance, both collisions would stand in the second doorway.
    const manifest = readMapManifest(twoDoors())
    const collision = manifest.resources[1] as (typeof manifest.resources)[number]
    expect(placementOf(manifest, collision, 6).z).toBe(12)
    expect(placementOf(manifest, collision, 8).z).toBe(18)
    // With no instance named, the last, as before.
    expect(placementOf(manifest, collision).z).toBe(18)
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
