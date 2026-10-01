import { describe, expect, it } from 'vitest'
import { isUnread, readActionScript, sectionFor, sectionsFor } from '../src/index.ts'
import { build, type Value } from './table-builder.ts'

const n = (v: number): Value => ({ n: v })
const f = (v: number): Value => ({ f: v })
const s = (v: string): Value => ({ s: v })
const r = (tag: number, ...values: Value[]) => ({ tag, values })

/** A blow in the shape a weapon set's script has, written here, not taken from a cartridge. */
const BLOW = build([
  r(16),
  r(9, n(3), n(2), f(2)),
  r(77, f(0.75)),
  r(10, n(3)),
  r(3, n(7), s('attack1a')),
  r(5, n(60), n(330), f(0.25)),
  r(26, n(7), n(60)),
  r(26, n(7), f(0.61)),
  r(116, f(0.1), n(200), n(100)),
  r(61),
  r(93, n(1)),
  r(80, f(0.2), n(300)),
  r(62),
  r(67),
  r(11),
  r(17),
])

describe('an action script', () => {
  it('reads sections keyed by action numbers, a blow section keyed 1, 2 and 219', () => {
    const script = readActionScript(
      build([r(1, n(503), n(221)), r(8, n(300)), r(2), r(1, n(1)), r(8, n(50)), r(2)]),
    )
    expect(script.sections.map((x) => x.keys)).toEqual([
      [503, 221],
      [1, 2, 219],
    ])
    expect(sectionFor(script, 221)?.commands).toEqual([{ tag: 8, ms: 300, hold: 0 }])
    expect(sectionFor(script, 219)?.commands).toEqual([{ tag: 8, ms: 50, hold: 0 }])
    expect(readActionScript(BLOW).sections[0]?.keys).toEqual([1, 2, 219])
  })

  it('takes a section to run on past a 2, and drops what comes before any section', () => {
    const script = readActionScript(
      build([r(8, n(10)), r(1, n(5)), r(8, n(20)), r(2), r(8, n(30)), r(1, n(6))]),
    )
    expect(sectionFor(script, 5)?.commands.map((c) => ('ms' in c ? c.ms : -1))).toEqual([20, 30])
    expect(sectionsFor(script, 6)[0]?.commands).toEqual([])
  })

  it('builds each command as the game does: who, fractions in thousandths, defaults', () => {
    const [blow] = readActionScript(BLOW).sections
    expect(blow?.commands[0]).toEqual({ tag: 9, id: 3, type: 2, bound: 2, ints: [] })
    expect(blow?.commands[2]).toEqual({ tag: 10, id: 3 })
    expect(blow?.commands[3]).toEqual({ tag: 3, who: 7, name: 'attack1a', flags: 1, fx: 0 })
    expect(blow?.commands[4]).toEqual({ tag: 5, from: 0.06, to: 0.33, gap: 0.25 })
    // `26 7 60` is 60 thousandths; `26 7 0.61f` the float, both held as a 4096th.
    expect(blow?.commands[5]).toMatchObject({ tag: 26, who: 7 })
    const point = (i: number) => (blow?.commands[i] as { point: number } | undefined)?.point ?? -1
    expect(point(5)).toBeCloseTo(0.06, 3)
    expect(point(6)).toBeCloseTo(0.61, 3)
    expect(blow?.commands[7]).toMatchObject({ tag: 116, ms: 200, after: 100 })
    // 80's values are kept, and nothing that reads them has been found.
    const kept = blow?.commands[10]
    expect(kept && isUnread(kept)).toBe(true)
  })

  it('gives a value a record lacks from the record before it, as the game’s Script does', () => {
    const script = readActionScript(
      build([r(1, n(1)), r(6, f(0.77), f(0.91)), r(26), r(10, n(4)), r(10)]),
    )
    const commands = sectionFor(script, 1)?.commands ?? []
    // A bare 26 after a float: the one acting, to the motion's end.
    expect(commands[1]).toEqual({ tag: 26, who: 7, point: 1 })
    // A bare 10 repeats the id before it.
    expect(commands[2]).toEqual({ tag: 10, id: 4 })
    expect(commands[3]).toEqual({ tag: 10, id: 4 })
  })

  it('reads a motion named first as the one acting’s, and its flags and effects bits', () => {
    const script = readActionScript(
      build([r(1, n(1)), r(3, s('guard'), n(1), n(2)), r(3, n(15), s('appear'), n(0), n(2))]),
    )
    expect(sectionFor(script, 1)?.commands).toEqual([
      { tag: 3, who: 7, name: 'guard', flags: 1, fx: 2 },
      { tag: 3, who: 15, name: 'appear', flags: 0, fx: 2 },
    ])
  })

  it('places an effect by slot, the value less 26, and reads the camera’s close-up defaults', () => {
    const script = readActionScript(
      build([
        r(1, n(1)),
        r(21, n(100), n(26), s('0')),
        r(21, n(103), n(29), s('close'), n(0), n(1)),
        r(12, n(5)),
        r(12, n(5), n(0), f(0), f(0.21), f(1.1)),
        r(55, n(0)),
        r(55, n(-1), n(-1)),
        r(66, n(-1)),
        r(79, n(2), n(15), n(1)),
      ]),
    )
    const commands = sectionFor(script, 1)?.commands ?? []
    expect(commands[0]).toEqual({
      tag: 21,
      id: 100,
      slot: 0,
      motion: '0',
      flags: 1,
      overlay: false,
    })
    expect(commands[1]).toMatchObject({ slot: 3, flags: 0, overlay: true })
    expect(commands[2]).toEqual({ tag: 12, mode: 5, variant: 0, floats: [0, 0, 1.8] })
    expect((commands[3] as { floats?: readonly number[] } | undefined)?.floats?.[1]).toBeCloseTo(
      0.21,
      5,
    )
    expect(commands[4]).toEqual({ tag: 55, effect: 1, sound: 30, ownSound: -1 })
    expect(commands[5]).toEqual({ tag: 55, effect: 0, sound: -1, ownSound: -1 })
    // A negative 66 builds nothing.
    expect(commands[6]).toEqual({ tag: 79, mode: 2, who: 15, face: true })
  })

  it('throws on a truncated file rather than returning half a script', () => {
    expect(() => readActionScript(BLOW.subarray(0, 40))).toThrow()
  })
})
