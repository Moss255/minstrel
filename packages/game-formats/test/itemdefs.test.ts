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

  it('reads how many shades of skin a part takes, by sex, from its block', () => {
    // Three records — plain clothes, a sword, the bare body — then their blocks.
    const records = [
      { id: 13005, word: 2, block: 0, shades: (2 << 15) | (2 << 23) },
      { id: 20004, word: 0, block: 1, shades: (2 << 15) | (2 << 23) },
      { id: 1000, word: 11, block: 2, shades: (1 << 15) | (4 << 23) },
    ]
    const out = new Uint8Array(0x0c + records.length * 64)
    const view = new DataView(out.buffer)
    view.setUint16(0, records.length, true)
    for (const [r, { id, word, block, shades }] of records.entries()) {
      view.setInt32(0x0c + r * 32, block, true)
      view.setUint32(0x0c + r * 32 + 8, word, true)
      view.setUint16(0x0c + r * 32 + 0x18, id, true)
      view.setUint32(0x0c + records.length * 32 + block * 32, shades, true)
    }
    const defs = readItemDefs(out)
    expect(defs.get(13005)?.skinShades).toEqual({ man: 2, woman: 2 })
    // A weapon is of a kind the recolour takes; a kind-11 part too.
    expect(defs.get(20004)?.skinShades).toEqual({ man: 2, woman: 2 })
    expect(defs.get(1000)?.skinShades).toEqual({ man: 1, woman: 4 })
  })

  it('gives no shades to an everyday item, or to a record with no block', () => {
    const defs = readItemDefs(table([{ id: 22000, word: 8 }]))
    expect(defs.get(22000)?.skinShades).toEqual({ man: 0, woman: 0 })
  })

  it('throws on a table shorter than its count says', () => {
    expect(() => readItemDefs(table([{ id: 1, word: 0 }]).subarray(0, 20))).toThrow(GameFormatError)
    expect(() => readItemDefs(new Uint8Array(4))).toThrow(GameFormatError)
  })
})
