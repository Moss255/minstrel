import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { PERSONAL_COLOURS, readPersonalColours } from '../src/personalcolours.ts'
import { buildTable } from './fixture.ts'

const run = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i)

/** `percol.bin` as its handler takes it: a version, then a 0x65 record a colour, number first. */
function colours(order: number[] = run(0, PERSONAL_COLOURS)) {
  return buildTable([
    { tag: 0x64, values: [0x10] },
    ...order.map((n) => ({ tag: 0x65, values: [n, 0x7c1f, ...run(n * 0x100, 15)] })),
  ])
}

describe('the personal colours', () => {
  it('reads a palette a colour, by the number each record gives', () => {
    const read = readPersonalColours(colours([...run(0, PERSONAL_COLOURS)].reverse()))
    expect(read.palettes).toHaveLength(16)
    expect(read.palettes[0]).toEqual([0x7c1f, ...run(0, 15)])
    expect(read.palettes[12]?.[1]).toBe(0xc00)
    expect(read.palettes[15]).toHaveLength(16)
  })

  it('keeps the number a byte and each colour a halfword, as the handler does', () => {
    const wide = buildTable(
      run(0, PERSONAL_COLOURS).map((n) => ({
        tag: 0x65,
        values: [0x300 + n, 0x12347c1f, ...run(0, 15)],
      })),
    )
    expect(readPersonalColours(wide).palettes[3]?.[0]).toBe(0x7c1f)
  })

  it('refuses a short record, a number past sixteen, or a colour missing', () => {
    const short = buildTable([{ tag: 0x65, values: [0, 1, 2] }])
    expect(() => readPersonalColours(short)).toThrow(/not 17/)
    expect(() => readPersonalColours(colours([16]))).toThrow(GameFormatError)
    expect(() => readPersonalColours(colours(run(0, 15)))).toThrow(/15 has no record/)
  })
})
