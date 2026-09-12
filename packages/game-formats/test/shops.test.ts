import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { readShops, SHOP_SLOTS, SHOP_TAG } from '../src/shops.ts'

/**
 * Build a tagged data table of integer records. Fixtures may not contain
 * cartridge bytes, so the layout is implemented here from `FORMAT.md`: the
 * head, then records of a tag, a count and two type bits per value, padded with
 * 0xFF to a word, then the values; no strings.
 */
function build(records: { tag: number; values: number[]; kind?: number }[]): Uint8Array {
  const body: number[] = []
  for (const { tag, values, kind = 1 } of records) {
    const typeBytes = Math.ceil(values.length / 4)
    const head = Math.ceil((3 + typeBytes) / 4) * 4
    body.push(tag & 0xff, (tag >>> 8) & 0xff, values.length)
    for (let b = 0; b < typeBytes; b++) {
      let bits = 0
      for (let i = 0; i < 4 && b * 4 + i < values.length; i++) bits |= kind << (i * 2)
      body.push(bits)
    }
    for (let i = 3 + typeBytes; i < head; i++) body.push(0xff)
    for (const v of values) body.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, v >>> 24)
  }
  const out = new Uint8Array(16 + body.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, records.length, true)
  view.setUint32(4, 16 + body.length, true)
  out.set(body, 16)
  return out
}

const shop = (id: number, items: number[], rate = 100, kind = 3) => ({
  tag: SHOP_TAG,
  values: [id, 2, ...items, ...Array(SHOP_SLOTS - items.length).fill(0), rate, kind],
})

describe('the shop table', () => {
  it('reads each shop: its number, what it sells without the empty slots, its rate and kind', () => {
    const shops = readShops(
      build([{ tag: 0x66, values: [2] }, shop(32, [22000, 20004]), shop(34, [22000], 500, 2)]),
    )
    expect(shops).toEqual([
      { id: 32, unknown_1: 2, items: [22000, 20004], rate: 100, kind: 3 },
      { id: 34, unknown_1: 2, items: [22000], rate: 500, kind: 2 },
    ])
  })

  it('refuses a shop that is not 22 integers', () => {
    expect(() => readShops(build([{ tag: SHOP_TAG, values: [1, 2, 3] }]))).toThrow(GameFormatError)
    expect(() => readShops(build([{ ...shop(1, [5]), kind: 2 }]))).toThrow(/integers/)
    expect(readShops(build([{ tag: 0x66, values: [0] }]))).toEqual([])
  })
})
