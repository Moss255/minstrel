import { describe, expect, it } from 'vitest'
import { ATTENDING_TAG, readAttendingCharacters } from '../src/attnpc.ts'
import { GameFormatError } from '../src/errors.ts'

/**
 * Build a tagged data table with a string section. Fixtures may not contain
 * cartridge bytes, so the layout is implemented here from `FORMAT.md`: the
 * head, then records of a tag, a count and two kind bits per value — 0 a
 * string offset, 1 an integer — padded with 0xFF to a word, then the values,
 * then the NUL-terminated strings.
 */
function build(records: { tag: number; values: number[]; kinds: number[] }[], strings: string[]) {
  const body: number[] = []
  for (const { tag, values, kinds } of records) {
    const typeBytes = Math.ceil(values.length / 4)
    const head = Math.ceil((3 + typeBytes) / 4) * 4
    body.push(tag & 0xff, (tag >>> 8) & 0xff, values.length)
    for (let b = 0; b < typeBytes; b++) {
      let bits = 0
      for (let i = 0; i < 4 && b * 4 + i < values.length; i++) {
        bits |= (kinds[b * 4 + i] ?? 1) << (i * 2)
      }
      body.push(bits)
    }
    for (let i = 3 + typeBytes; i < head; i++) body.push(0xff)
    for (const v of values)
      body.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  }
  const text = strings.flatMap((s) => [...s].map((c) => c.charCodeAt(0)).concat(0))
  const out = new Uint8Array(16 + body.length + text.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, records.length, true)
  view.setUint32(4, 16 + body.length, true)
  view.setUint32(8, text.length, true)
  view.setUint32(12, strings.length, true)
  out.set(body, 16)
  out.set(text, 16 + body.length)
  return out
}

const NONE = 0xffffffff
const kinds = Array.from({ length: 19 }, (_, i) => (i === 2 ? 0 : 1))
const character = (id: number, model: number, name: number, rest: number[]) => ({
  tag: ATTENDING_TAG,
  values: [id, model, name, ...rest],
  kinds,
})

describe('the attending characters', () => {
  it('reads each one: its number, model, name, level, numbers and what it carries', () => {
    const table = build(
      [
        character(2, 17, 0, [1, 0, 3, 0, 15, 13, 16, 22, 10, 0, 0, 25, 0, NONE, 20004, 21296]),
        character(4, 51, 5, [0, NONE, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      ],
      ['Ivor', 'Sterling'],
    )
    const [ivor, sterling] = readAttendingCharacters(table)
    expect(ivor).toEqual({
      id: 2,
      model: 17,
      name: 'Ivor',
      unknown_3: 1,
      unknown_4: 0,
      level: 3,
      unknown_6: 0,
      numbers: {
        strength: 15,
        resilience: 13,
        agility: 16,
        deftness: 22,
        charm: 10,
        magicalMight: 0,
        magicalMending: 0,
        maxHp: 25,
        maxMp: 0,
      },
      unknown_16: -1,
      weapon: 20004,
      shield: 21296,
    })
    expect(sterling?.name).toBe('Sterling')
    expect(sterling?.unknown_4).toBe(-1)
    expect(sterling?.weapon).toBeUndefined()
    expect(sterling?.shield).toBeUndefined()
  })

  it('refuses a record of the wrong size, or with no name where the name goes', () => {
    expect(() =>
      readAttendingCharacters(
        build([{ tag: ATTENDING_TAG, values: [1, 2, 0], kinds: [1, 1, 0] }], ['A']),
      ),
    ).toThrow(GameFormatError)
    const allIntegers = { ...character(1, 19, 0, Array(16).fill(0)), kinds: Array(19).fill(1) }
    expect(() => readAttendingCharacters(build([allIntegers], ['A']))).toThrow(/name at 2/)
    expect(() =>
      readAttendingCharacters(build([character(1, 19, 99, Array(16).fill(0))], ['A'])),
    ).toThrow(/no string/)
  })

  it('reads none from a table that holds none', () => {
    expect(readAttendingCharacters(build([{ tag: 0x65, values: [0], kinds: [1] }], []))).toEqual([])
  })
})
