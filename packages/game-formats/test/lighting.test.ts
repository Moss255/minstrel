import { describe, expect, it } from 'vitest'
import { bgr555, GameFormatError, readLighting } from '../src/index.ts'
import { build, type Value } from './table-builder.ts'

const n = (v: number): Value => ({ n: v })
const f = (v: number): Value => ({ f: v })

/** An advanced slot as a `106` record: index, light 1, light 0, seven colours. */
const advanced = (index: number, background: number, horizon: number) => ({
  tag: 106,
  values: [
    n(index),
    ...[n(1), f(-1), f(-1), f(1), n(18723)],
    ...[n(1), f(1), f(-1), f(-1), n(30644)],
    n(background),
    n(horizon),
    n(15685),
    n(11586),
    n(32767),
    n(32767),
    n(32767),
  ],
})

describe('a map’s lighting', () => {
  it('reads an advanced map’s slots by time of day, with their gradient colours', () => {
    const lighting = readLighting(
      build([{ tag: 100, values: [f(0.25)] }, advanced(2, 0x7dc0, 0x7fe0), advanced(0, 0x2800, 0)]),
    )
    expect(lighting.mode).toBe('advanced')
    expect(lighting.gradientCentreOffset).toBe(0.25)
    const day = lighting.slots.get(2)
    expect(day?.background).toBe(0x7dc0)
    expect(day?.horizon).toBe(0x7fe0)
    expect(day?.light1).toEqual({ on: true, direction: [-1, -1, 1], colour: 18723 })
    expect(day?.light0?.colour).toBe(30644)
    expect(day?.ambient).toBe(15685)
    expect(lighting.slots.get(0)?.background).toBe(0x2800)
  })

  it('reads a basic map’s slots and a fog slot', () => {
    const lighting = readLighting(
      build([
        { tag: 103, values: [f(0)] },
        {
          tag: 104,
          values: [n(1), f(0), f(1), f(0), n(0x1234), n(0x0421), n(0x7fff), f(1), f(0.5)].concat([
            n(1),
            n(2),
            n(3),
          ]),
        },
        {
          tag: 105,
          values: [n(2), n(1), n(32729), n(0), n(1), n(21760), ...Array(8).fill(n(0)), n(31)],
        },
      ]),
    )
    expect(lighting.mode).toBe('basic')
    expect(lighting.slots.get(1)).toMatchObject({ background: 0x1234, horizon: 0x0421, edge: 3 })
    expect(lighting.fog.get(2)).toMatchObject({ on: true, colour: 32729, offset: 21760, alpha: 31 })
  })

  it('passes an index past 6, as the game’s script does', () => {
    expect(readLighting(build([advanced(7, 1, 2)])).slots.size).toBe(0)
  })

  it('refuses a slot that is short of its values', () => {
    expect(() => readLighting(build([{ tag: 106, values: [n(0), n(1)] }]))).toThrow(GameFormatError)
  })

  it('splits a BGR555 colour red first', () => {
    expect(bgr555(0x7fe0)).toEqual([0, 31, 31])
    expect(bgr555(0x001f)).toEqual([31, 0, 0])
  })
})
