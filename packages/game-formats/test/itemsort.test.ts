import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { ITEM_KIND_TAG, readItemKinds } from '../src/itemsort.ts'

/**
 * A tagged table built from FORMAT.md, never from a cartridge: a 16-byte head,
 * then records of a tag, a count, two bits of kind a value — integers here —
 * padded to a word, and the values.
 */
function table(records: { tag: number; values: number[] }[]): Uint8Array {
  const body: number[] = []
  const push32 = (v: number) =>
    body.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  for (const { tag, values } of records) {
    const kinds = new Array<number>(Math.ceil(values.length / 4)).fill(0)
    for (let i = 0; i < values.length; i++)
      kinds[i >> 2] = (kinds[i >> 2] as number) | (1 << ((i & 3) * 2))
    const head = [tag & 0xff, tag >>> 8, values.length, ...kinds]
    while (head.length % 4 !== 0) head.push(0)
    body.push(...head)
    for (const v of values) push32(v)
  }
  const out = new Uint8Array(16 + body.length)
  const view = new DataView(out.buffer)
  view.setUint32(4, 16 + body.length, true)
  out.set(body, 16)
  return out
}

describe('the item kinds', () => {
  it('reads each item by id: its category and subtype, and the two values not read', () => {
    const kinds = readItemKinds(
      table([
        { tag: ITEM_KIND_TAG, values: [20004, 1, 225, 0, 0] },
        { tag: ITEM_KIND_TAG, values: [21390, 288, 371, 1, 12] },
        { tag: 0x65, values: [7] },
      ]),
    )
    expect(kinds.size).toBe(2)
    expect(kinds.get(20004)).toEqual({ category: 0, subtype: 0, unknown_1: 1, unknown_2: 225 })
    expect(kinds.get(21390)?.subtype).toBe(12)
  })

  it('refuses a record of the wrong length, and a table with none', () => {
    expect(() => readItemKinds(table([{ tag: ITEM_KIND_TAG, values: [1, 2, 3, 4] }]))).toThrow(
      /4 values, not 5/,
    )
    expect(() => readItemKinds(table([{ tag: 0x65, values: [7] }]))).toThrow(GameFormatError)
  })
})
