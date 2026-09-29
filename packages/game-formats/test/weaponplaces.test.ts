import { describe, expect, it } from 'vitest'
import { BONE_SLOTS, GameFormatError, readWeaponPlaces } from '../src/index.ts'
import { build, type Value } from './table-builder.ts'

const n = (v: number): Value => ({ n: v })
const f = (v: number): Value => ({ f: v })

describe('where a weapon is carried', () => {
  it('reads a kind’s two placements: a bone slot, an offset and a turn each', () => {
    const [sword] = readWeaponPlaces(
      build([
        {
          tag: 100,
          values: [n(0), n(2), f(-4.5), f(4.75), f(-3), f(1.5), f(0), f(1)].concat([
            n(4),
            f(-2.5),
            f(-0.5),
            f(0),
            f(0),
            f(0),
            f(0),
          ]),
        },
      ]),
    )
    expect(sword?.kind).toBe(0)
    expect(sword?.back).toEqual({ slot: 2, offset: [-4.5, 4.75, -3], turn: [1.5, 0, 1] })
    expect(sword?.hands).toEqual({ slot: 4, offset: [-2.5, -0.5, 0], turn: [0, 0, 0] })
    expect(BONE_SLOTS[2]).toBe('chest')
    expect(BONE_SLOTS[4]).toBe('arm1R')
  })

  it('refuses a record short of its fifteen values', () => {
    expect(() => readWeaponPlaces(build([{ tag: 100, values: [n(0), n(2)] }]))).toThrow(
      GameFormatError,
    )
  })
})
