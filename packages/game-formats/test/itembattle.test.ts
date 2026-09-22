import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import {
  readItemBattleParams,
  RESISTANCE_ELEMENTS,
  wornResistances,
} from '../src/itembattle.ts'

/** Built in code, from FORMAT.md: a count word, then 44-byte records. */
function build(items: { id: number; resistances?: readonly number[] }[]): Uint8Array {
  const out = new Uint8Array(4 + items.length * 0x2c)
  const view = new DataView(out.buffer)
  view.setUint32(0, items.length, true)
  for (const [r, item] of items.entries()) {
    const at = 4 + r * 0x2c
    for (const [i, value] of (item.resistances ?? []).entries()) view.setInt8(at + 0x14 + i, value)
    view.setInt16(at + 0x28, item.id, true)
    // A neighbour either side, which must not leak into the twenty.
    out[at + 0x13] = 0x7f
  }
  return out
}

describe('what a worn thing does in a battle', () => {
  it('reads each record: its item, and the twenty numbers it adds to a resistance', () => {
    const [first, second] = readItemBattleParams(
      build([
        { id: 12170, resistances: [0, 0, 0, -30, 0, 0, 0, -30] },
        { id: 20004 },
      ]),
    )
    expect(first?.id).toBe(12170)
    expect(first?.resistances).toHaveLength(20)
    expect(first?.resistances[3]).toBe(-30)
    expect(first?.resistances[7]).toBe(-30)
    expect(second?.id).toBe(20004)
    expect(second?.resistances.every((value) => value === 0)).toBe(true)
    expect(first?.raw).toHaveLength(0x2c)
  })

  it('refuses a head cut short, and records that run past the end', () => {
    expect(() => readItemBattleParams(new Uint8Array(2))).toThrow(GameFormatError)
    expect(() => readItemBattleParams(build([{ id: 1 }]).subarray(0, 30))).toThrow(GameFormatError)
    expect(readItemBattleParams(build([]))).toEqual([])
  })

  it('sums what is worn onto a hundred, and never below nothing', () => {
    const fire = [25, ...Array(19).fill(0)]
    const colder = [-50, ...Array(19).fill(0)]
    expect(wornResistances([])[0]).toBe(100)
    expect(wornResistances([fire])[0]).toBe(125)
    expect(wornResistances([fire, colder])[0]).toBe(75)
    expect(wornResistances([colder, colder, colder])[0]).toBe(0)
  })

  it('leaves the plain attack’s element and the last alone, as the game’s loop does', () => {
    const every = Array(20).fill(-100)
    const resisted = wornResistances([every])
    // Elements 8 and 22 are not among the twenty, so they stay whole.
    expect(resisted[7]).toBe(100)
    expect(resisted[21]).toBe(100)
    expect(RESISTANCE_ELEMENTS).not.toContain(8)
    expect(resisted.filter((value) => value === 0)).toHaveLength(20)
  })
})
