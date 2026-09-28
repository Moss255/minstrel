import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { eventListFor, readEventList } from '../src/eventlist.ts'
import { build, type Value } from './table-builder.ts'

/**
 * The event lists — see `readEventList`. Fixtures are built here, never taken
 * from a cartridge: a tagged table of scenes, each a record of 23 values with
 * two strings — a name and a script file — four floats, and a font name.
 */
const n = (value: number): Value => ({ n: value })
const f = (value: number): Value => ({ f: value })
const s = (value: string): Value => ({ s: value })

/** A scene's record: its map and number, its script, and its flags. */
const scene = (map: number, event: number, flags: number): { tag: number; values: Value[] } => ({
  tag: 102,
  values: [
    n(5),
    n(1),
    n(5),
    n(100),
    n(map),
    n(event),
    n(event),
    s('a name'),
    s(`ev${String(event).padStart(5, '0')}.stb`),
    n(100),
    n(200),
    n(300),
    f(1),
    f(0),
    f(-2),
    f(3),
    n(1),
    n(1),
    n(2),
    n(1),
    s('a font'),
    n(flags),
    n(0),
  ],
})

describe('the event lists', () => {
  it('gives each scene the map it plays in', () => {
    const list = readEventList(
      build([{ tag: 101, values: [n(0)] }, scene(4507, 5110, 320), scene(6401, 24598, 64)]),
    )
    expect(list.map(({ event, map, here, script }) => ({ event, map, here, script }))).toEqual([
      { event: 5110, map: 4507, here: false, script: 'ev05110.stb' },
      { event: 24598, map: 6401, here: false, script: 'ev24598.stb' },
    ])
  })

  it('reads flag 0x80 as playing wherever the Hero is', () => {
    const [entry] = readEventList(build([scene(40001, 20741, 0x80)]))
    expect(entry?.here).toBe(true)
    expect(entry?.unknown_flags).toBe(0x80)
  })

  it('says which list a scene is in, by its number', () => {
    expect(eventListFor(5110)).toBe('eventlist6')
    expect(eventListFor(23189)).toBe('eventlist_lv5')
    expect(eventListFor(50410)).toBe('evl_quest')
  })

  it('lists nothing for an empty file, and refuses a record that is not a scene', () => {
    expect(readEventList(new Uint8Array())).toEqual([])
    expect(() => readEventList(build([{ tag: 102, values: [n(1), n(2)] }]))).toThrow(
      GameFormatError,
    )
  })
})
