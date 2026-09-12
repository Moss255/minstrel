import { GameFormatError } from './errors.ts'

/**
 * The system strings, `/data/bin/strstd.gp2/strstd_<lang>.nat`: the engine's
 * own short messages — the chest's, the prompts' answers, the menus' odd words
 * — each by a message number.
 *
 * A head word, then 8-byte records, then the strings. The head word is the one
 * the monster list opens with (see `readMonsterList`): its low 12 bits the
 * record count, 81, and its upper 20 the size of the string section, which runs
 * exactly to the end of the file in every language. A record is two `u32`s:
 *
 * | offset | meaning |
 * |---|---|
 * | `+0x00` | the message's number: 0 to 69, 83 to 86, 200 to 202, 1000 on — not contiguous |
 * | `+0x04` | its offset from the strings |
 *
 * Every offset lands at the start of a string on English and German.
 */

const HEAD = 4
const RECORD = 8

/** Parse the system strings: each message's text, by its number. */
export function readSystemStrings(bytes: Uint8Array): Map<number, string> {
  if (bytes.length < HEAD) {
    throw new GameFormatError(`system strings are ${bytes.length} bytes, shorter than their head`)
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const head = view.getUint32(0, true)
  const count = head & 0xfff
  const size = head >>> 12
  const strings = HEAD + count * RECORD
  if (strings + size !== bytes.length) {
    throw new GameFormatError(
      `system strings say ${count} records and ${size} bytes of strings, which is not their ${bytes.length} bytes`,
      0,
    )
  }
  const out = new Map<number, string>()
  for (let r = 0; r < count; r++) {
    const at = HEAD + r * RECORD
    const id = view.getUint32(at, true)
    const offset = view.getUint32(at + 4, true)
    const start = strings + offset
    if (start >= bytes.length || (offset > 0 && bytes[start - 1] !== 0)) {
      throw new GameFormatError(`message ${id}'s offset ${offset} does not start a string`, at + 4)
    }
    let text = ''
    let end = start
    for (; end < bytes.length && bytes[end] !== 0; end++)
      text += String.fromCharCode(bytes[end] as number)
    if (end === bytes.length) throw new GameFormatError(`message ${id} runs off the end`, at + 4)
    out.set(id, text)
  }
  return out
}
