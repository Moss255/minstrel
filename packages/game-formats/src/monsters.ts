import { GameFormatError } from './errors.ts'

/**
 * The monster list, `/data/prm/mon_list.gp2/mon_list_<lang>.nat`: each
 * monster's number, code and name.
 *
 * A head word, then 32-byte records, then the strings. The head word's low 12
 * bits are the record count and its upper 20 the size of the string section:
 * 345 and 5,445 in English, 345 and 5,785 in German — on all five languages the
 * strings start at `4 + 345 × 32` and run exactly to the end of the file. (In
 * English the word happens to read `YQT`.)
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `u32` | `unknown_0x00`: 0 on every record |
 * | `+0x04` | `u32` | the code's offset from the strings — `z009a` |
 * | `+0x08` | `u32` | the name's offset from the strings |
 * | `+0x0C` | `u16` | the monster's number: 1 to 64, then 75 on, with gaps |
 * | `+0x0E` | `u16` | `unknown_0x0e` |
 * | `+0x10` | 16 bytes | `unknown_0x10`, carried as they are |
 */

const HEAD = 4
const RECORD = 32

export interface MonsterEntry {
  readonly number: number
  readonly code: string
  readonly name: string
  readonly unknown_0x00: number
  readonly unknown_0x0e: number
  readonly unknown_0x10: Uint8Array
}

/** Parse the monster list. */
export function readMonsterList(bytes: Uint8Array): MonsterEntry[] {
  if (bytes.length < HEAD) {
    throw new GameFormatError(`monster list is ${bytes.length} bytes, shorter than its head`)
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const head = view.getUint32(0, true)
  const count = head & 0xfff
  const size = head >>> 12
  const strings = HEAD + count * RECORD
  if (strings + size !== bytes.length) {
    throw new GameFormatError(
      `monster list says ${count} records and ${size} bytes of strings, which is not its ${bytes.length} bytes`,
      0,
    )
  }

  const text = (offset: number, what: string, at: number): string => {
    const start = strings + offset
    if (start >= bytes.length || (offset > 0 && bytes[start - 1] !== 0)) {
      throw new GameFormatError(`${what} offset ${offset} does not start a string`, at)
    }
    let end = start
    while (end < bytes.length && bytes[end] !== 0) end++
    if (end === bytes.length) throw new GameFormatError(`${what} at ${offset} runs off the end`, at)
    let out = ''
    for (let i = start; i < end; i++) out += String.fromCharCode(bytes[i] as number)
    return out
  }

  const entries: MonsterEntry[] = []
  for (let r = 0; r < count; r++) {
    const at = HEAD + r * RECORD
    entries.push({
      unknown_0x00: view.getUint32(at, true),
      code: text(view.getUint32(at + 4, true), 'code', at + 4),
      name: text(view.getUint32(at + 8, true), 'name', at + 8),
      number: view.getUint16(at + 12, true),
      unknown_0x0e: view.getUint16(at + 14, true),
      unknown_0x10: bytes.subarray(at + 16, at + RECORD),
    })
  }
  return entries
}
