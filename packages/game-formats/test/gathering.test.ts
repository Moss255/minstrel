import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import {
  gatheringFile,
  readFountain,
  readGatheringBias,
  readGatheringSpots,
} from '../src/gathering.ts'
import { build, type Value } from './table-builder.ts'

// Every number here is made up; only the shapes are the game's.
const n = (v: number): Value => ({ n: v })
const f = (v: number): Value => ({ f: v })
const s = (v: string): Value => ({ s: v })

const head = [
  { tag: 0x65, values: [s('stamp')] },
  { tag: 0x64, values: [n(20)] },
]
/** Eight places, the first `used` set, the rest zero. */
const places = (used: number): Value[] =>
  Array.from({ length: 8 }, (_, p) =>
    p < used ? [n(p), f(0.5), n(-p)] : [n(0), n(0), n(0)],
  ).flat()

describe('F<nn>flditem.bin, a field’s spots', () => {
  const bytes = build([
    ...head,
    {
      tag: 0x66,
      values: [n(4), n(0x5600), n(1), n(1), n(8), n(60), n(1), n(3), ...places(3)],
    },
    { tag: 0x66, values: [n(5), n(0x5601), n(3), n(1), n(2), n(0), n(0), n(0), ...places(8)] },
  ])

  it('reads each spot: id, item, when, timing and its eight places', () => {
    const [first, second] = readGatheringSpots(bytes)
    expect(first).toMatchObject({ id: 4, item: 0x5600, when: 1, unknown_3: 1, timing: 8 })
    expect(first?.own).toEqual({ minutes: 60, fewest: 1, most: 3 })
    expect(first?.places).toHaveLength(8)
    expect(first?.places[2]).toEqual({ x: 2, y: 0.5, z: -2 })
    expect(first?.places[3]).toEqual({ x: 0, y: 0, z: 0 })
    expect(second).toMatchObject({ id: 5, when: 3, timing: 2 })
  })

  it('throws on a short spot', () => {
    const short = build([...head, { tag: 0x66, values: [n(4), n(0x5600)] }])
    expect(() => readGatheringSpots(short)).toThrow(GameFormatError)
  })

  it('names a field’s member as the game does', () => {
    expect(gatheringFile(3)).toBe('F03flditem.bin')
    expect(gatheringFile(57)).toBe('F57flditem.bin')
  })
})

describe('fldbias.bin, the timings by variant', () => {
  it('reads each row: eight (minutes, fewest, most)', () => {
    const row = (k: number) => ({
      tag: 0x67,
      values: [
        n(k),
        ...Array.from({ length: 8 }, (_, v) => [n(30 * (v + 1)), n(1), n(k + 2)]).flat(),
      ],
    })
    const rows = readGatheringBias(build([...head, row(0), row(5)]))
    expect([...rows.keys()]).toEqual([0, 5])
    expect(rows.get(5)?.[3]).toEqual({ minutes: 120, fewest: 1, most: 7 })
  })

  it('throws on a short row', () => {
    expect(() => readGatheringBias(build([{ tag: 0x67, values: [n(0), n(60)] }]))).toThrow(
      GameFormatError,
    )
  })
})

describe('izmitm.bin, the Fountain', () => {
  it('reads its spots’ seven places and each variant’s sixteen items', () => {
    const spot = (id: number) => ({
      tag: 0x66,
      values: [n(id), ...Array.from({ length: 7 }, (_, p) => [f(p + 0.25), f(-0.5), f(-p)]).flat()],
    })
    const items = (v: number) => ({
      tag: 0x68,
      values: [n(v), ...Array.from({ length: 16 }, (_, i) => n(0x5600 + v * 16 + i))],
    })
    const fountain = readFountain(build([spot(98), spot(99), items(0), items(1)]))
    expect(fountain.spots.map((x) => x.id)).toEqual([98, 99])
    expect(fountain.spots[1]?.places[6]).toEqual({ x: 6.25, y: -0.5, z: -6 })
    expect(fountain.items.get(1)?.[15]).toBe(0x5600 + 31)
  })
})
