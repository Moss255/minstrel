import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { readMonsterList } from '../src/monsters.ts'

/**
 * A monster list built in code, from `FORMAT.md`: a head word holding the
 * record count and the strings' size, 32-byte records, then NUL-terminated
 * strings.
 */
function build(monsters: { number: number; code: string; name: string }[]): Uint8Array {
  const strings: number[] = []
  const offsets = monsters.map(({ code, name }) => {
    const at = (s: string) => {
      const offset = strings.length
      for (const c of s) strings.push(c.charCodeAt(0))
      strings.push(0)
      return offset
    }
    return [at(code), at(name)] as const
  })
  const out = new Uint8Array(4 + monsters.length * 32 + strings.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, (monsters.length | (strings.length << 12)) >>> 0, true)
  for (const [r, { number }] of monsters.entries()) {
    const at = 4 + r * 32
    const [code, name] = offsets[r] as readonly [number, number]
    view.setUint32(at + 4, code, true)
    view.setUint32(at + 8, name, true)
    view.setUint16(at + 12, number, true)
    view.setUint16(at + 14, 7, true)
  }
  out.set(strings, 4 + monsters.length * 32)
  return out
}

describe('the monster list', () => {
  it('reads each record: its number, code and name', () => {
    const list = readMonsterList(
      build([
        { number: 1, code: 'z000a', name: 'blob' },
        { number: 75, code: 'b010a', name: 'box<1>s lid' },
      ]),
    )
    expect(list.map(({ number, code, name }) => ({ number, code, name }))).toEqual([
      { number: 1, code: 'z000a', name: 'blob' },
      { number: 75, code: 'b010a', name: 'box<1>s lid' },
    ])
    expect(list[0]?.unknown_0x0e).toBe(7)
    expect(list[0]?.unknown_0x10).toHaveLength(16)
  })

  it('refuses a head that disagrees with the file, or an offset into a word', () => {
    const good = build([{ number: 1, code: 'z000a', name: 'blob' }])
    expect(() => readMonsterList(good.subarray(0, 2))).toThrow(GameFormatError)
    expect(() => readMonsterList(good.subarray(0, good.length - 1))).toThrow(/not its/)
    const astray = good.slice()
    new DataView(astray.buffer).setUint32(4 + 8, 2, true)
    expect(() => readMonsterList(astray)).toThrow(/does not start a string/)
    expect(readMonsterList(build([]))).toEqual([])
  })
})
