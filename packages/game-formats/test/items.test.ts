import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { readItemNames } from '../src/items.ts'

/**
 * Build an item-name table. Fixtures may not contain cartridge bytes, so the
 * layout is implemented here from `FORMAT.md`: a count, records of two string
 * offsets, a word and an id, then the strings.
 */
function build(
  items: { id: number; singular: string; plural: string; word?: number }[],
): Uint8Array {
  const strings: number[] = []
  const records = items.map((item) => {
    const one = strings.length
    for (const c of `${item.singular}\0`) strings.push(c.charCodeAt(0))
    const many = strings.length
    for (const c of `${item.plural}\0`) strings.push(c.charCodeAt(0))
    return [one, many, item.word ?? 0, item.id]
  })
  const out = new Uint8Array(4 + items.length * 16 + strings.length)
  const view = new DataView(out.buffer)
  view.setUint16(0, items.length, true)
  view.setUint16(2, 0x1234, true)
  records.forEach((words, i) => {
    for (const [k, w] of words.entries()) view.setUint32(4 + i * 16 + k * 4, w, true)
  })
  out.set(strings, 4 + items.length * 16)
  return out
}

describe('readItemNames', () => {
  it('reads each record: its id, singular and plural', () => {
    const names = readItemNames(
      build([
        { id: 0x5000, singular: 'pebble', plural: 'pebbles', word: 7 },
        { id: 0x5001, singular: 'hero<1>s cap', plural: 'hero<1>s caps' },
      ]),
    )
    expect(names).toEqual([
      { id: 0x5000, singular: 'pebble', plural: 'pebbles', unknown_0x08: 7 },
      { id: 0x5001, singular: 'hero<1>s cap', plural: 'hero<1>s caps', unknown_0x08: 0 },
    ])
  })

  it('refuses records that run past the end', () => {
    const bytes = build([{ id: 1, singular: 'a', plural: 'b' }])
    new DataView(bytes.buffer).setUint16(0, 50, true)
    expect(() => readItemNames(bytes)).toThrow(GameFormatError)
  })

  it('refuses a name outside the file', () => {
    const bytes = build([{ id: 1, singular: 'a', plural: 'b' }])
    new DataView(bytes.buffer).setUint32(4, 999, true)
    expect(() => readItemNames(bytes)).toThrow(/outside the file/)
  })
})
