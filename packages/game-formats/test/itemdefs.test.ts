import { describe, expect, it } from 'vitest'
import { GameFormatError, readItemDefs } from '../src/index.ts'

/** A table of two records written here — no cartridge. */
function table(records: { id: number; word: number }[]): Uint8Array {
  const out = new Uint8Array(0x0c + records.length * 32)
  const view = new DataView(out.buffer)
  view.setUint16(0, records.length, true)
  for (const [r, { id, word }] of records.entries()) {
    view.setUint32(0x0c + r * 32 + 8, word >>> 0, true)
    view.setUint16(0x0c + r * 32 + 0x18, id, true)
  }
  return out
}

describe('the items as the code holds them', () => {
  it('reads each record’s kind and its three bits', () => {
    const defs = readItemDefs(
      table([
        { id: 22000, word: 8 | (1 << 19) },
        { id: 22265, word: 8 | (1 << 20) | (1 << 25) },
      ]),
    )
    expect(defs.get(22000)).toMatchObject({ kind: 8, usedUp: true, kept: false, toBag: false })
    expect(defs.get(22265)).toMatchObject({ kind: 8, usedUp: false, kept: true, toBag: true })
  })

  it('throws on a table shorter than its count says', () => {
    expect(() => readItemDefs(table([{ id: 1, word: 0 }]).subarray(0, 20))).toThrow(GameFormatError)
    expect(() => readItemDefs(new Uint8Array(4))).toThrow(GameFormatError)
  })
})
