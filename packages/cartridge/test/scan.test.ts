import { buildNarc, buildRom, fill } from '@minstrel/nitrofs/test/fixture.ts'
import { describe, expect, it } from 'vitest'
import { scanCartridge } from '../src/scan.ts'

/**
 * Fixtures are built in code, never taken from a cartridge. `buildRom` and
 * `buildNarc` emit the published NitroROM and NARC layouts from a plain
 * description, so a scan can be tested against structures whose contents are
 * known exactly.
 */

const loose = fill(32, 1)
const inner = { name: 'inner.bin', data: fill(16, 2) }
const other = { name: 'other.bin', data: fill(24, 3) }

function romWithArchive(): Uint8Array {
  return buildRom({
    name: '',
    files: [{ name: 'loose.bin', data: loose }],
    dirs: [
      {
        name: 'data',
        files: [{ name: 'pack.narc', data: buildNarc([inner, other]) }],
      },
    ],
  })
}

describe('scanCartridge', () => {
  it('reports a cartridge file that is not a container as one leaf', () => {
    const leaves = [...scanCartridge(romWithArchive(), { pathFilter: 'loose' })]

    expect(leaves).toHaveLength(1)
    expect(leaves[0]?.path).toBe('/loose.bin')
    expect(leaves[0]?.archive).toBe('')
    expect(leaves[0]?.depth).toBe(0)
    expect(Array.from(leaves[0]?.bytes ?? [])).toEqual(Array.from(loose))
  })

  it('opens an archive and reports its members, not the archive itself', () => {
    const leaves = [...scanCartridge(romWithArchive(), { pathFilter: 'pack' })]

    expect(leaves.map((leaf) => leaf.path)).toEqual([
      '/data/pack.narc/inner.bin',
      '/data/pack.narc/other.bin',
    ])
    // Every member names the container it came out of, which is what lets a
    // resource list find its siblings.
    expect(leaves.every((leaf) => leaf.archive === '/data/pack.narc')).toBe(true)
    expect(leaves.every((leaf) => leaf.depth === 1)).toBe(true)
  })

  it('leaves an archive closed when `enter` declines it', () => {
    const leaves = [...scanCartridge(romWithArchive(), { pathFilter: 'pack', enter: () => false })]

    // Declined, so it is reported as a leaf in its own right rather than
    // dropped: the bytes are still whatever they are.
    expect(leaves).toHaveLength(1)
    expect(leaves[0]?.path).toBe('/data/pack.narc')
    expect(leaves[0]?.depth).toBe(0)
  })

  it('stops opening containers at maxDepth', () => {
    const leaves = [...scanCartridge(romWithArchive(), { pathFilter: 'pack', maxDepth: 0 })]

    expect(leaves.map((leaf) => leaf.path)).toEqual(['/data/pack.narc'])
  })

  it('filters by path, case-insensitively', () => {
    expect([...scanCartridge(romWithArchive(), { pathFilter: '/DATA/' })]).toHaveLength(2)
    expect([...scanCartridge(romWithArchive(), { pathFilter: 'nothing' })]).toHaveLength(0)
  })

  it('walks the whole cartridge when nothing is filtered', () => {
    const paths = [...scanCartridge(romWithArchive())].map((leaf) => leaf.path)
    expect(paths).toContain('/loose.bin')
    expect(paths).toContain('/data/pack.narc/inner.bin')
  })

  it('reports an unreadable container as a leaf rather than dropping it', () => {
    // A NARC stamp on bytes that are not a NARC. The walk must not lose them.
    const broken = new Uint8Array(64)
    broken.set([0x4e, 0x41, 0x52, 0x43])
    const rom = buildRom({ name: '', files: [{ name: 'broken.narc', data: broken }] })

    const leaves = [...scanCartridge(rom, { pathFilter: 'broken' })]
    expect(leaves).toHaveLength(1)
    expect(leaves[0]?.path).toBe('/broken.narc')
  })

  it('yields nothing rather than throwing for an empty archive', () => {
    const rom = buildRom({ name: '', files: [{ name: 'empty.narc', data: buildNarc([]) }] })
    expect([...scanCartridge(rom, { pathFilter: 'empty' })]).toEqual([])
  })
})
