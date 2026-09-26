import type { Trigger } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { conditionsFor, firstWay, sceneIndex, stageText } from '../src/scenes.ts'

/** A trigger record built in code: its map, span, value 5, and words as `op:arg`. */
function record(
  map: number,
  from: [number, number],
  to: [number, number],
  kind: number,
  words: readonly [number, number][],
): Trigger {
  return {
    map,
    from: { major: from[0], minor: from[1] },
    to: { major: to[0], minor: to[1] },
    unknown_5: kind,
    values: Uint32Array.from(words.map(([op, arg]) => ((op << 16) | arg) >>> 0)),
    floats: new Float32Array(words.length),
    kinds: new Uint8Array(words.length).fill(1),
    offset: 0,
  }
}

// The shapes the Hexagon and Angel Falls use, from `FORMAT.md`, "Triggers".
const hexagon = [
  // Talking to Patty (character 7) at step 4 with flag 3 set and 5 not.
  record(1405, [2, 4], [2, 4], 1, [
    [6, 7],
    [35, 4],
    [4, 3],
    [5, 5],
    [119, 22510],
  ]),
  // Winning set battle 2 plays her thanks.
  record(1405, [2, 4], [2, 4], 15, [
    [12, 2],
    [119, 2550],
  ]),
  // Her thanks' own record hands on to map 100, scene 2560.
  record(1405, [2, 4], [2, 4], 11, [
    [8, 2550],
    [133, 100],
    [2560, 0],
  ]),
]
const village = [
  // Entering map 100 plays 2560 too, earlier in the story.
  record(100, [2, 1], [2, 3], 3, [
    [9, 100],
    [119, 2560],
  ]),
  // Walking into area 15 plays the mayor's scene.
  record(105, [2, 1], [2, 1], 2, [
    [7, 15],
    [119, 2120],
  ]),
]

const index = sceneIndex([
  { code: 'D01', triggers: hexagon },
  { code: 'M01', triggers: village },
])

describe('the scene index', () => {
  it('lists each scene a record gets to, in event order', () => {
    expect(index.map((entry) => entry.event)).toEqual([2120, 2550, 2560, 22510])
  })

  it('reads a talk record: its map, span, character, step and flags', () => {
    const [way] = index.find((entry) => entry.event === 22510)?.ways ?? []
    expect(way).toMatchObject({
      kind: 'talk',
      area: 'D01',
      map: 1405,
      who: 7,
      step: 4,
      flags: [3],
      unless: [5],
    })
  })

  it('knows a scene won, an area walked into and a map entered', () => {
    expect(index.find((entry) => entry.event === 2550)?.ways[0]?.kind).toBe('won')
    expect(index.find((entry) => entry.event === 2120)?.ways[0]?.kind).toBe('area')
    expect(index.find((entry) => entry.event === 2560)?.ways.map((w) => w.kind)).toEqual([
      'handed',
      'entry',
    ])
  })

  it('reads a handing-on as the map it goes to, and which scene hands on', () => {
    const handed = index.find((entry) => entry.event === 2560)?.ways[0]
    expect(handed).toMatchObject({ kind: 'handed', map: 100, who: 2550, area: 'D01' })
  })

  it('plays a scene by the way that comes first in the story', () => {
    const entry = index.find((e) => e.event === 2560)
    expect(entry && firstWay(entry)?.kind).toBe('entry')
  })

  it('sets the map, the first stage of the span, the step and the flags wanted', () => {
    const way = index.find((entry) => entry.event === 22510)?.ways[0]
    if (!way) throw new Error('no way')
    const wanted = conditionsFor(22510, way)
    expect(wanted).toEqual({
      event: 22510,
      map: 1405,
      stage: { major: 2, minor: 4 },
      step: 4,
      flags: [3],
    })
    expect(stageText(wanted.stage)).toBe('2.4')
  })
})
