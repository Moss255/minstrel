import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { ITEM_RECORD_SIZE, ITEM_TABLE_HEAD, itemPrice, readItemTable } from '../src/itemtable.ts'

/** An item table built in code, from `FORMAT.md`: a 32-byte head with the count first, then 32-byte records. */
function build(
  records: {
    id: number
    price: number
    flag?: number
    actions?: [number, number]
    rarity?: number
  }[],
): Uint8Array {
  const out = new Uint8Array(ITEM_TABLE_HEAD + records.length * ITEM_RECORD_SIZE)
  const view = new DataView(out.buffer)
  view.setUint16(0, records.length, true)
  view.setUint16(2, records.length | 0x8000, true)
  for (const [
    r,
    { id, price, flag = 0xffff, actions = [252, 252] as [number, number], rarity = 0 },
  ] of records.entries()) {
    const at = ITEM_TABLE_HEAD + r * ITEM_RECORD_SIZE
    view.setUint16(at, actions[0], true)
    view.setUint16(at + 2, actions[1], true)
    view.setUint16(at + 4, id, true)
    view.setUint16(at + 6, price, true)
    view.setUint16(at + 8, flag, true)
    // The rarity in bits 1–3 of the byte at 0x15, with its neighbours set so they must not leak in.
    out[at + 0x15] = 0x51 | (rarity << 1)
    out[at + 31] = r + 1
  }
  return out
}

describe('what an item is worth having', () => {
  it('reads the rarity out of its byte, and nothing round it', () => {
    const table = build([
      { id: 20004, price: 15, rarity: 1 },
      { id: 20024, price: 0, rarity: 4 },
      { id: 22000, price: 4, rarity: 0 },
      { id: 20999, price: 1500, rarity: 5 },
    ])
    expect(readItemTable(table).map((r) => r.rarity)).toEqual([1, 4, 0, 5])
  })
})

describe('what an item costs', () => {
  it('is its price word, scaled as the word after it says', () => {
    expect(itemPrice({ price: 4, unknown_0x08: 0xffff })).toBe(8)
    expect(itemPrice({ price: 12, unknown_0x08: 0xfffe })).toBe(25)
    expect(itemPrice({ price: 48, unknown_0x08: 0xfffd })).toBe(95)
    expect(itemPrice({ price: 15, unknown_0x08: 0xfffc })).toBe(150)
    // Another value there is taken at twice, as most are.
    expect(itemPrice({ price: 8, unknown_0x08: 0x55 })).toBe(16)
  })
})

describe('item tables', () => {
  it('reads each record: its actions, id and price, and the rest carried as it is', () => {
    const [first, second] = readItemTable(
      build([
        { id: 0x55f0, price: 4, actions: [255, 255] },
        { id: 0x4a6b, price: 100, flag: 0 },
      ]),
    )
    expect(first?.id).toBe(0x55f0)
    expect(first?.price).toBe(4)
    expect(first?.actions).toEqual([255, 255])
    expect(first?.unknown_0x08).toBe(0xffff)
    expect(first?.unknown_0x0a).toHaveLength(22)
    expect(first?.unknown_0x0a[21]).toBe(1)
    expect(second?.price).toBe(100)
    expect(second?.actions).toEqual([252, 252])
    expect(second?.unknown_0x08).toBe(0)
  })

  it('refuses a head that is cut short, or records that run past the end', () => {
    expect(() => readItemTable(new Uint8Array(10))).toThrow(GameFormatError)
    expect(() => readItemTable(build([{ id: 1, price: 1 }]).subarray(0, 50))).toThrow(
      /past the end/,
    )
    expect(readItemTable(build([]))).toEqual([])
  })
})
