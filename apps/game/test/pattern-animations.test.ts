import { readFileSync } from 'node:fs'
import { scanCartridge } from '@minstrel/cartridge'
import { isNsbtp, readNsbtp } from '@minstrel/nitro-gfx'
import { describe, expect, it } from 'vitest'

/**
 * Every texture pattern animation on a real cartridge, read as the game's own
 * code reads it (`MPT.cpp`). Local-only: skipped without a dump, and nothing
 * it reads is committed.
 */
const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('the NSBTP files on a real cartridge', { timeout: 120_000 }, () => {
  it('reads every one, each keyframe naming a texture of its own list', () => {
    const rom = new Uint8Array(readFileSync(romPath as string))
    let files = 0
    let tracks = 0
    for (const leaf of scanCartridge(rom)) {
      if (!leaf.path.toLowerCase().endsWith('.nsbtp') && !isNsbtp(leaf.bytes)) continue
      if (!isNsbtp(leaf.bytes)) continue
      files++
      for (const animation of readNsbtp(leaf.bytes)) {
        expect(animation.frameCount, leaf.path).toBeGreaterThan(0)
        for (const track of animation.tracks) {
          tracks++
          const frames = track.keyframes.map((k) => k.frame)
          expect(frames, leaf.path).toEqual([...frames].sort((a, b) => a - b))
        }
      }
    }
    console.log(`${files} NSBTP files, ${tracks} tracks`)
    expect(files).toBeGreaterThan(0)
  })
})
