import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { eventListFor, readEventList } from '../src/eventlist.ts'

/**
 * The event lists — see `readEventList`. Fixtures are built here, never taken
 * from a cartridge: a tagged table of scenes, each a record of 23 values with
 * two strings — a name and a script file — four floats, and a font name.
 */
type Value = { readonly n: number } | { readonly f: number } | { readonly s: string }

function build(records: { tag: number; values: Value[] }[]): Uint8Array {
  const strings: string[] = []
  const offsets = new Map<string, number>()
  let at = 0
  const offsetOf = (text: string) => {
    const known = offsets.get(text)
    if (known !== undefined) return known
    offsets.set(text, at)
    strings.push(text)
    at += text.length + 1
    return offsets.get(text) as number
  }
  const body: number[] = []
  const push32 = (v: number) =>
    body.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  for (const record of records) {
    const count = record.values.length
    const typeBytes = Math.max(1, Math.ceil(count / 4))
    const header = Math.ceil((3 + typeBytes) / 4) * 4
    const bits = new Uint8Array(header - 3)
    record.values.forEach((v, i) => {
      const kind = 'n' in v ? 1 : 'f' in v ? 2 : 0
      bits[i >> 2] = (bits[i >> 2] as number) | (kind << ((i & 3) * 2))
    })
    body.push(record.tag & 0xff, (record.tag >>> 8) & 0xff, count, ...bits)
    for (const v of record.values) {
      if ('n' in v) push32(v.n)
      else if ('f' in v) {
        const view = new DataView(new ArrayBuffer(4))
        view.setFloat32(0, v.f, true)
        push32(view.getUint32(0, true))
      } else push32(offsetOf(v.s))
    }
  }
  const bytes = strings.flatMap((s) => [...s].map((c) => c.charCodeAt(0)).concat(0))
  const start = 16 + body.length
  const out = new Uint8Array(start + bytes.length)
  const view = new DataView(out.buffer)
  view.setUint32(4, start, true)
  view.setUint32(8, bytes.length, true)
  view.setUint32(12, strings.length, true)
  out.set(body, 16)
  out.set(bytes, start)
  return out
}

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
