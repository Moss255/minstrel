import { describe, expect, it } from 'vitest'
import { BUILD_ONE, BUILD_SEXES, BUILDS_A_SEX, buildFor, readBuildTable } from '../src/builds.ts'
import { GameFormatError } from '../src/errors.ts'

/**
 * A synthetic build table. Fixtures may hold no cartridge bytes, so the twenty
 * halfwords are made up here — shaped like the real one (a band around 4096,
 * the widths falling across each row of five) without being it.
 * `tools/harness/test/builds.test.ts` is what holds the real one to a dump.
 */
function build(values: number[], before = 0, after = 0): Uint8Array {
  const out = new Uint8Array(before + values.length * 2 + after)
  const view = new DataView(out.buffer)
  values.forEach((value, i) => {
    view.setInt16(before + i * 2, value, true)
  })
  return out
}

/** Ten pairs: heights that wander, widths that fall in fives. */
const TABLE = [
  3800, 4200, 3700, 4100, 3900, 4000, 4100, 3900, 3850, 3800, 3800, 4150, 3700, 4050, 3900, 3950,
  4100, 3880, 3800, 3790,
]

describe('readBuildTable', () => {
  it('reads ten pairs and says where they were', () => {
    const table = readBuildTable(build(TABLE, 8))
    expect(table.offset).toBe(8)
    expect(table.builds).toHaveLength(BUILDS_A_SEX * BUILD_SEXES)
    expect(table.builds[0]).toEqual({ height: 3800, width: 4200 })
    expect(table.builds[9]).toEqual({ height: 3800, width: 3790 })
  })

  it('finds it whatever it is buried in, as long as the shape is there', () => {
    // Bytes on either side that are not the table: out of the band.
    const around = [1, 2, 3, 60000]
    const bytes = build([...around, ...TABLE, ...around])
    expect(readBuildTable(bytes).offset).toBe(around.length * 2)
  })

  it('refuses a run whose widths do not fall', () => {
    const rising = [...TABLE]
    rising[3] = 3900 // the second width of the first five, now below the third
    expect(() => readBuildTable(build(rising))).toThrow(GameFormatError)
    expect(() => readBuildTable(build(rising))).toThrow(/no build table/)
  })

  it('refuses a run outside the band, and bytes with no table at all', () => {
    const wild = [...TABLE]
    wild[0] = 12_000
    expect(() => readBuildTable(build(wild))).toThrow(/no build table/)
    expect(() => readBuildTable(new Uint8Array(8))).toThrow(/no build table/)
  })
})

describe('picking a build', () => {
  const table = readBuildTable(build(TABLE))

  it('is the game’s own sex times five plus the choice', () => {
    expect(buildFor(table, 0, 0)).toEqual({ height: 3800, width: 4200 })
    // Sex 1's first is the sixth pair.
    expect(buildFor(table, 1, 0)).toEqual({ height: 3800, width: 4150 })
    expect(buildFor(table, 1, 4)).toEqual({ height: 3800, width: 3790 })
  })

  it('hands back nothing rather than a build nobody chose', () => {
    expect(buildFor(table, 2, 0)).toBeUndefined()
    expect(buildFor(table, -1, 0)).toBeUndefined()
    expect(buildFor(table, 0, BUILDS_A_SEX)).toBeUndefined()
    expect(buildFor(table, 0, -1)).toBeUndefined()
    expect(buildFor(table, 0, 1.5)).toBeUndefined()
  })

  it('scales around fx16’s one', () => {
    // Every build is near 1.0 — a person, not a giant.
    for (const one of table.builds) {
      expect(one.height / BUILD_ONE).toBeGreaterThan(0.8)
      expect(one.height / BUILD_ONE).toBeLessThan(1.2)
      expect(one.width / BUILD_ONE).toBeGreaterThan(0.8)
      expect(one.width / BUILD_ONE).toBeLessThan(1.2)
    }
  })
})
