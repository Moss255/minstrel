import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { readTreasureMapTables, TMAP_TABLES } from '../src/tmap.ts'

/** A `.pac` of seventeen offsets and some bytes after them; the numbers are made up. */
function pac(count = 17, size = 200): Uint8Array {
  const bytes = new Uint8Array(size)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, count, true)
  for (let i = 0; i < count; i++) view.setUint32(4 + 4 * i, 0x48 + i * 4, true)
  return bytes
}

describe('the treasure maps’ tables, tdata_<LG>.pac', () => {
  it('reads the seventeen offsets, by the decomp’s names', () => {
    const tables = readTreasureMapTables(pac())
    expect(Object.keys(tables.offsets)).toEqual([...TMAP_TABLES])
    expect(tables.offsets.bossRangesByQuality).toBe(0x48)
    expect(tables.offsets.legacyBossData).toBe(0x48 + 16 * 4)
  })

  it('refuses another count, an offset past the end, or a file too short', () => {
    expect(() => readTreasureMapTables(pac(16))).toThrow(GameFormatError)
    expect(() => readTreasureMapTables(pac(17, 0x60))).toThrow(GameFormatError)
    expect(() => readTreasureMapTables(new Uint8Array(8))).toThrow(GameFormatError)
  })
})
