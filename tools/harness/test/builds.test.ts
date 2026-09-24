import { readFileSync } from 'node:fs'
import { BUILD_ONE, BUILDS_A_SEX, buildFor, readBuildTable } from '@minstrel/game-formats'
import { decompressBlz, looksBlz } from '@minstrel/nitro-comp'
import { parseRomHeader } from '@minstrel/nitrofs'
import { describe, expect, it } from 'vitest'

/**
 * The build table, on a real cartridge.
 *
 * It is in the **ARM9 binary**, which is BLZ-packed on the cartridge — the
 * same reason the vocations' skill trees were missed by every search of the
 * cartridge's own bytes. `readBuildTable` finds it by shape, not at an offset.
 *
 * Local-only: skipped without a dump, and nothing it reads is committed.
 */
const romPath = process.env.MINSTREL_TEST_ROM

function arm9Of(rom: Uint8Array): Uint8Array {
  const header = parseRomHeader(rom)
  const packed = rom.subarray(header.arm9.romOffset, header.arm9.romOffset + header.arm9.size)
  return looksBlz(packed) ? decompressBlz(packed) : packed
}

describe.skipIf(!romPath)('the build table on a real cartridge', { timeout: 60_000 }, () => {
  const arm9 = () => arm9Of(new Uint8Array(readFileSync(romPath as string)))

  it('is in the binary exactly once', () => {
    const binary = arm9()
    expect(() => readBuildTable(binary)).not.toThrow()
    // **Once is the point.** The shape is two tests — a band around 4096 and
    // widths falling in fives — and a second match anywhere in a megabyte
    // would mean it is not distinctive enough to trust. Counted by looking
    // again past each hit.
    let matches = 0
    let from = 0
    for (;;) {
      let found: ReturnType<typeof readBuildTable>
      try {
        found = readBuildTable(binary.subarray(from))
      } catch {
        break
      }
      matches++
      from += found.offset + 2
      if (matches > 4) break
    }
    expect(matches).toBe(1)
  })

  it('is the ten pairs the USA build has, which is a second witness', () => {
    // These twenty numbers were read out of the **USA** build at
    // `0x020E6D98`, through the code that indexes them with `sex * 5 + rand(5)`.
    // A European dump giving the same twenty, found by shape alone, is two
    // builds agreeing — which is what makes the reading more than a pattern
    // that happened to fit.
    const table = readBuildTable(arm9())
    expect(table.builds).toEqual([
      { height: 3768, width: 4255 },
      { height: 3637, width: 4136 },
      { height: 3850, width: 4014 },
      { height: 4132, width: 3891 },
      { height: 3870, width: 3764 },
      { height: 3768, width: 4177 },
      { height: 3641, width: 4091 },
      { height: 3809, width: 3973 },
      { height: 4132, width: 3891 },
      { height: 3768, width: 3764 },
    ])
  })

  it('gives each sex five builds, none of them a giant', () => {
    const table = readBuildTable(arm9())
    for (let sex = 0; sex < 2; sex++) {
      for (let which = 0; which < BUILDS_A_SEX; which++) {
        const one = buildFor(table, sex, which)
        expect(one, `sex ${sex} build ${which}`).toBeDefined()
        // 0.888 to 1.039 on this cartridge: a person, not a scale factor
        // somebody found in a fog table.
        expect((one as { height: number }).height / BUILD_ONE).toBeGreaterThan(0.85)
        expect((one as { height: number }).height / BUILD_ONE).toBeLessThan(1.1)
      }
    }
    // The two sexes share the middle build and differ elsewhere, which is what
    // makes it a table of ten rather than five used twice.
    expect(buildFor(table, 0, 3)).toEqual(buildFor(table, 1, 3))
    expect(buildFor(table, 0, 0)).not.toEqual(buildFor(table, 1, 0))
  })
})
