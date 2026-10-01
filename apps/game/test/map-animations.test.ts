import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { load } from '../src/load.ts'

/**
 * A map's material animations on a real cartridge: the texture, material and
 * pattern animations compiled from the same resource as a piece's model,
 * picked up beside it. Local-only: skipped without a dump.
 */
const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('a map’s own material animations', { timeout: 120_000 }, () => {
  it('are found beside the village’s pieces', () => {
    const rom = new Uint8Array(readFileSync(romPath as string))
    const village = load(rom, { map: 'M01' })
    const animated = village.map.pieces.filter((p) => p.materialAnimations)
    const kinds = animated.flatMap((p) =>
      [
        p.materialAnimations?.texAnim && 'nsbta',
        p.materialAnimations?.matAnim && 'nsbma',
        p.materialAnimations?.patAnim && 'nsbtp',
      ].filter(Boolean),
    )
    console.log(`${animated.length} of ${village.map.pieces.length} pieces animate:`, [
      ...new Set(kinds),
    ])
    expect(animated.length).toBeGreaterThan(0)
  })
})
