import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import {
  evacDestination,
  PLACE_FLAG,
  placeFlagOf,
  placeOfRevivalMap,
  placesOffered,
  readEvacTable,
  readPlaceMaps,
  readRevivalWords,
  readZoomPlaces,
  revivalVoice,
  revivalWordsFile,
} from '../src/travel.ts'
import { build, type Value } from './table-builder.ts'

// Every number here is made up; only the shapes are the game's.
const n = (v: number): Value => ({ n: v })
const f = (v: number): Value => ({ f: v })
const s = (v: string): Value => ({ s: v })

/** A `loola` place: number, value 1, name, revival map, map, facing, x, y, z, the ship's four. */
const place = (number: number, name: string, revival: number, map: number) => ({
  tag: 0x67,
  values: [
    n(number),
    n(1),
    s(name),
    n(revival),
    n(map),
    n(0),
    f(1.5),
    f(0.25),
    f(-2),
    n(map),
    n(2),
    n(-57),
    f(-31.5),
  ],
})

const loola = build([
  { tag: 0x65, values: [s('stamp')] },
  { tag: 0x64, values: [s('version')] },
  { tag: 0x66, values: [n(3)] },
  place(0, 'Hamlet', 901, 30001),
  place(2, 'Port', 1702, 30002),
  place(1, 'Abbey', 4401, 30003),
])

describe("Zoom's list, loola", () => {
  it('reads each place, its numbers as the game takes them', () => {
    const places = readZoomPlaces(loola)
    expect(places.map((p) => p.name)).toEqual(['Hamlet', 'Port', 'Abbey'])
    expect(places[0]).toEqual({
      number: 0,
      unknown_1: 1,
      name: 'Hamlet',
      revivalMap: 901,
      map: 30001,
      facing: 0,
      x: 1.5,
      y: 0.25,
      z: -2,
      ship: { map: 30001, unknown_10: 2, x: -57, z: -31.5 },
    })
  })

  it('offers the places whose flags are set, lowest number first', () => {
    const places = readZoomPlaces(loola)
    const set = new Set([PLACE_FLAG + 2, PLACE_FLAG + 0])
    expect(placesOffered(places, (flag) => set.has(flag)).map((p) => p.name)).toEqual([
      'Hamlet',
      'Port',
    ])
    expect(placesOffered(places, () => false)).toEqual([])
  })

  it('looks a place up by its revival map, with 5801 and 4506 standing for 1800', () => {
    const places = readZoomPlaces(
      build([place(0, 'Hamlet', 901, 30001), place(7, 'Bridge', 1800, 30009)]),
    )
    expect(placeOfRevivalMap(places, 901)?.name).toBe('Hamlet')
    expect(placeOfRevivalMap(places, 5801)?.name).toBe('Bridge')
    expect(placeOfRevivalMap(places, 4506)?.name).toBe('Bridge')
    expect(placeOfRevivalMap(places, 1234)).toBeUndefined()
  })

  it('refuses a place with too few values or no name', () => {
    expect(() => readZoomPlaces(build([{ tag: 0x67, values: [n(0), n(1), s('x')] }]))).toThrow(
      GameFormatError,
    )
    const nameless = place(0, 'x', 1, 2)
    nameless.values[2] = n(5)
    expect(() => readZoomPlaces(build([nameless]))).toThrow(GameFormatError)
  })
})

describe('the maps that mark a place reached', () => {
  const halfwords = (list: number[]) => list.flatMap((v) => [v & 0xff, v >> 8])
  const places = readZoomPlaces(loola)
  // Revival maps' towns: 901 → 900, 1702 → 1700, 4401 → 4400.
  const areaOf = (map: number) => Math.trunc(map / 100) * 100

  it("finds the run whose n-th is the n-th place's town or Zoom map", () => {
    // By number: Hamlet (0), Abbey (1) by its Zoom map, Port (2).
    const overlay = Uint8Array.from([
      ...halfwords([900, 1700, 7]),
      ...halfwords([900, 30003, 1700]),
      0xee,
      0xee,
    ])
    const maps = readPlaceMaps(overlay, places, areaOf)
    expect(maps).toEqual([900, 30003, 1700])
    expect(placeFlagOf(maps, 30003)).toBe(PLACE_FLAG + 1)
    expect(placeFlagOf(maps, 4400)).toBeUndefined()
  })

  it('refuses bytes where no run, or two, have the shape', () => {
    expect(() => readPlaceMaps(new Uint8Array(32), places, areaOf)).toThrow(GameFormatError)
    const twice = Uint8Array.from([
      ...halfwords([900, 4400, 1700]),
      ...halfwords([900, 30003, 1700]),
    ])
    expect(() => readPlaceMaps(twice, places, areaOf)).toThrow(GameFormatError)
  })
})

describe("Evac's table, riremito", () => {
  /** A record: area, map, then destinations of map, facing, x, y, z. */
  const record = (area: number, map: number, ...to: number[][]) => ({
    tag: 0x66,
    values: [n(area), n(map), ...to.flatMap(([m, ...rest]) => [n(m as number), ...rest.map(f)])],
  })
  const table = readEvacTable(
    build([
      { tag: 0x65, values: [s('stamp')] },
      record(500, 0, [30001, 0, 50.5, 0.25, 28]),
      // Two ways out of area 600: the first when the Hero came from 30005.
      record(600, 0, [30005, 0, 1, 2, 3], [30006, 2.5, 4, 5, 6]),
      // Area 700's own top map goes nowhere.
      record(700, 0, [700, 0, 0, 0.5, -20]),
      record(700, 700, [0, 0, 0, 0, 0]),
      // A map-specific record taken first keeps a later general one out.
      record(800, 801, [30008, 0, 1, 1, 1]),
      record(800, 0, [30009, 0, 2, 2, 2]),
    ]),
  )

  it('reads each record and its destinations', () => {
    expect(table).toHaveLength(6)
    expect(table[1]?.destinations.map((d) => d.map)).toEqual([30005, 30006])
    expect(table[1]?.destinations[1]).toEqual({ map: 30006, facing: 2.5, x: 4, y: 5, z: 6 })
  })

  it('takes the destination on the last field, or else the last', () => {
    expect(evacDestination(table, { map: 601, area: 600, lastField: 30005 })?.map).toBe(30005)
    expect(evacDestination(table, { map: 601, area: 600, lastField: 30001 })?.map).toBe(30006)
    expect(evacDestination(table, { map: 501, area: 500, lastField: 0 })).toMatchObject({
      map: 30001,
      x: 50.5,
    })
  })

  it('goes nowhere from a map the table sends to 0, or an area it does not name', () => {
    expect(evacDestination(table, { map: 701, area: 700, lastField: 0 })?.map).toBe(700)
    expect(evacDestination(table, { map: 700, area: 700, lastField: 0 })).toBeUndefined()
    expect(evacDestination(table, { map: 901, area: 900, lastField: 0 })).toBeUndefined()
  })

  it('keeps a map-specific record over a later one for any map of the area', () => {
    expect(evacDestination(table, { map: 801, area: 800, lastField: 0 })?.map).toBe(30008)
    expect(evacDestination(table, { map: 802, area: 800, lastField: 0 })?.map).toBe(30009)
  })

  it('refuses a record with no area and map', () => {
    expect(() => readEvacTable(build([{ tag: 0x66, values: [n(1)] }]))).toThrow(GameFormatError)
  })
})

describe("the priest's words on waking, chur_messet", () => {
  const church = (map: number, ...fields: string[]) => ({
    tag: 0x67,
    values: [n(map), ...fields.map(s)],
  })
  const words = readRevivalWords(
    build([
      { tag: 0x66, values: [n(2)] },
      church(1106, '1', '1', '3', '3', '2', '17', '1', '1', '0', '0', '0', '0'),
      church(216, '1', '16', '1', '2', '17', '17', '1', '1', '0', '0', '5', '5'),
    ]),
  )

  it('chooses the voice by the story major, by day or night', () => {
    expect(revivalVoice(words, 1106, 1, false)).toBe(3)
    expect(revivalVoice(words, 1106, 9, true)).toBe(1)
    expect(revivalVoice(words, 216, 4, false)).toBe(1)
    expect(revivalVoice(words, 216, 4, true)).toBe(2)
    expect(revivalVoice(words, 216, 17, true)).toBe(1)
  })

  it('takes a span of 0 to 0 as always, and a "0" as 0', () => {
    // 1106 past 17: its third span, "0" "0" — always — and voice "0".
    expect(revivalVoice(words, 1106, 18, false)).toBe(0)
    expect(revivalWordsFile(0)).toBe(0)
    expect(revivalVoice(words, 216, 18, false)).toBe(5)
    // A map not listed: 1.
    expect(revivalVoice(words, 9999, 5, false)).toBe(1)
    expect(revivalWordsFile(7)).toBe(6)
  })

  it('refuses a record that is not a map and twelve strings', () => {
    expect(() => readRevivalWords(build([church(1, '1', '2')]))).toThrow(GameFormatError)
  })
})
