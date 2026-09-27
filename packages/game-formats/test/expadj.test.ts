import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { readExperienceAdjust } from '../src/expadj.ts'

/** Words as the file lays them out, little-endian. */
const words = (list: readonly number[]) =>
  Uint8Array.from(list.flatMap((w) => [w & 0xff, (w >>> 8) & 0xff, (w >>> 16) & 0xff, w >>> 24]))
const band = (upTo: number, add: number) => ((add << 26) | upTo) >>> 0

describe('the experience adjust table', () => {
  it('reads each band: its bound, none for 0, and what it adds', () => {
    const read = readExperienceAdjust(words([3, band(500, 5), band(9000, 1), band(0, 63)]))
    expect(read.bands).toEqual([
      { upTo: 500, add: 5 },
      { upTo: 9000, add: 1 },
      { upTo: undefined, add: 63 },
    ])
    expect(read.unknown_tail).toHaveLength(0)
  })

  it('carries the second block the header sizes through as it is', () => {
    const bytes = Uint8Array.from([...words([1 | (3 << 12), band(0, 4)]), 7, 8, 9])
    expect([...readExperienceAdjust(bytes).unknown_tail]).toEqual([7, 8, 9])
  })

  it('refuses a file shorter than its header says', () => {
    expect(() => readExperienceAdjust(words([3, band(1, 1)]))).toThrow(GameFormatError)
    expect(() => readExperienceAdjust(words([1 | (4 << 12), band(1, 1)]))).toThrow(GameFormatError)
    expect(() => readExperienceAdjust(new Uint8Array(2))).toThrow(GameFormatError)
  })
})
