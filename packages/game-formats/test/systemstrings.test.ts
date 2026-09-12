import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { readSystemStrings } from '../src/systemstrings.ts'

/** System strings built in code, from `FORMAT.md`: the head word, (number, offset) records, strings. */
function build(messages: [number, string][]): Uint8Array {
  const strings: number[] = []
  const offsets = messages.map(([, text]) => {
    const offset = strings.length
    for (const c of text) strings.push(c.charCodeAt(0))
    strings.push(0)
    return offset
  })
  const out = new Uint8Array(4 + messages.length * 8 + strings.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, (messages.length | (strings.length << 12)) >>> 0, true)
  for (const [r, [id]] of messages.entries()) {
    view.setUint32(4 + r * 8, id, true)
    view.setUint32(8 + r * 8, offsets[r] as number, true)
  }
  out.set(strings, 4 + messages.length * 8)
  return out
}

describe('the system strings', () => {
  it('reads each message by its number, however the numbers skip', () => {
    const read = readSystemStrings(
      build([
        [27, 'Yes'],
        [42, 'The box was <str_1>!'],
        [1000, 'none'],
      ]),
    )
    expect([...read]).toEqual([
      [27, 'Yes'],
      [42, 'The box was <str_1>!'],
      [1000, 'none'],
    ])
  })

  it('refuses a head that disagrees with the file, or an offset into a word', () => {
    const good = build([[1, 'Yes']])
    expect(() => readSystemStrings(good.subarray(0, 3))).toThrow(GameFormatError)
    expect(() => readSystemStrings(good.subarray(0, good.length - 1))).toThrow(/not their/)
    const astray = good.slice()
    new DataView(astray.buffer).setUint32(8, 1, true)
    expect(() => readSystemStrings(astray)).toThrow(/does not start a string/)
  })
})
