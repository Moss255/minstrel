import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { ITEM_RECORD_SIZE, ITEM_TABLE_HEAD, readItemTable } from '../src/itemtable.ts'

/** An item table built in code, from `FORMAT.md`: a 36-byte head with the count first, then 32-byte records. */
function build(records: { id: number; price: number; flag?: number }[]): Uint8Array {
  const out = new Uint8Array(ITEM_TABLE_HEAD + records.length * ITEM_RECORD_SIZE)
  const view = new DataView(out.buffer)
  view.setUint16(0, records.length, true)
  view.setUint16(2, records.length | 0x8000, true)
  for (const [r, { id, price, flag = 0xffff }] of records.entries()) {
    const at = ITEM_TABLE_HEAD + r * ITEM_RECORD_SIZE
    view.setUint16(at, id, true)
    view.setUint16(at + 2, price, true)
    view.setUint16(at + 4, flag, true)
    out[at + 31] = r + 1
  }
  return out
}

describe('item tables', () => {
  it('reads each record: id, price, and the rest carried as it is', () => {
    const [first, second] = readItemTable(
      build([
        { id: 0x4a6a, price: 7 },
        { id: 0x4a6b, price: 100, flag: 0 },
      ]),
    )
    expect(first?.id).toBe(0x4a6a)
    expect(first?.price).toBe(7)
    expect(first?.unknown_0x04).toBe(0xffff)
    expect(first?.unknown_0x06).toHaveLength(26)
    expect(first?.unknown_0x06[25]).toBe(1)
    expect(second?.price).toBe(100)
    expect(second?.unknown_0x04).toBe(0)
  })

  it('refuses a head that is cut short, or records that run past the end', () => {
    expect(() => readItemTable(new Uint8Array(10))).toThrow(GameFormatError)
    expect(() => readItemTable(build([{ id: 1, price: 1 }]).subarray(0, 50))).toThrow(
      /past the end/,
    )
    expect(readItemTable(build([]))).toEqual([])
  })
})
