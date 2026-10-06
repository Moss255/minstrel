import { describe, expect, it } from 'vitest'
import { readAccoladeData } from '../src/accolades.ts'
import { buildTable } from './fixture.ts'

/** Five integers and a string, two bits of type each: 1 1 1 1, then 1 0. */
const ACCOLADE_TYPES = 0x155

describe('the accolades', () => {
  const strings = ['Awarded to <ADDRESSEE> for one thing.', 'Presented for another.']
  const at = (i: number) => strings.slice(0, i).reduce((o, s) => o + s.length + 1, 0)

  it('reads each accolade: its number, its two places in the order, two values kept, its line', () => {
    const data = readAccoladeData(
      buildTable(
        [
          { tag: 0x66, type: 0x55, values: [151, 21, 260, 12] },
          { tag: 0x67, type: ACCOLADE_TYPES, values: [2, 79, 75, 2, 2, at(0)] },
          // A woman's accolade only: no man's name, so no place in his order.
          { tag: 0x67, type: ACCOLADE_TYPES, values: [117, 0, 194, 0, 0, at(1)] },
        ],
        strings,
      ),
    )
    expect(data.unknown_0x66).toEqual([151, 21, 260, 12])
    expect([...data.accolades.keys()]).toEqual([2, 117])
    expect(data.accolades.get(2)).toEqual({
      id: 2,
      orderMale: 79,
      orderFemale: 75,
      unknown_3: 2,
      unknown_4: 2,
      text: strings[0],
    })
    expect(data.accolades.get(117)).toMatchObject({ orderMale: 0, orderFemale: 194 })
  })

  it('throws on a record of the wrong shape, and on a table with none', () => {
    const wrong = buildTable([{ tag: 0x67, type: 0x55, values: [2, 79, 75, 2] }])
    expect(() => readAccoladeData(wrong)).toThrow(/five integers and a string/)
    expect(() => readAccoladeData(buildTable([{ tag: 0x66, type: 0x55, values: [1, 2, 3, 4] }]))).toThrow(
      /no accolades/,
    )
    expect(() => readAccoladeData(new Uint8Array(8))).toThrow()
  })
})
