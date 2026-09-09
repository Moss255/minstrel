import { GameFormatError } from './errors.ts'

/**
 * The tagged data table used by several of this cartridge's non-container
 * files — the map descriptors (`.bmdj`), the map attribute tables (`.bats`),
 * and standalone tables such as `mapbgm.bin`.
 *
 * Established by observation; the evidence is in `FORMAT.md`.
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `u32` | `unknown_0x00` |
 * | `+0x04` | `u32` | string table offset, or the file size when there is none |
 * | `+0x08` | `u32` | string table size |
 * | `+0x0C` | `u32` | string count |
 * | `+0x10` | | the record stream, running up to the string table |
 *
 * A record is a `u16` tag, a `u8` value count, then **two bits of type per
 * value**, then that many 4-byte values. The header is padded to a multiple of
 * four, so a record of up to four values has the familiar four-byte head and
 * one of five to eight values has an eight-byte one.
 *
 * The type bits were read as a single `u8` for a long time, which is right
 * whenever a record has four values or fewer — and on `.bmdj` it is right even
 * when it does not, by luck: the extra type word is read as a phantom record of
 * zero values, which consumes exactly the same four bytes and leaves the walk
 * back in step. `.bmbl` is not so forgiving, and **387 of its 667 files could
 * not be read at all** until the header was counted properly.
 *
 * With it counted, every file of all three kinds walks to its string table
 * exactly: **667 of 667 `.bmbl`, 755 of 755 `.bmdj`, 504 of 504 `.bats`**.
 *
 * `0xFF` fill appears both between records, as alignment padding, and after the
 * last one. It is skipped a word at a time rather than treated as an end: three
 * files on the reference cartridge carry eight bytes of it in the middle of
 * their stream and are truncated by a parser that stops at the first run. The
 * fill is `0xFF`, not zero, so stopping on zeroes reads rubbish instead.
 *
 * The stream proper ends on a record whose tag is `0x6E` and whose type is
 * `0xFF`, or by reaching the string table.
 *
 * **What the tags mean is not established.** They are exposed as numbers, and
 * values as raw `u32`s alongside their float reading, so a caller that works one
 * out can use it without this package having guessed. The one part that is
 * established is the string table: in a `.bmdj` it lists the map's resource
 * names.
 */

/** Type byte 2 marks a record whose values are IEEE floats. */
export const TABLE_TYPE_FLOAT = 0x02

/** A record's tag when it terminates the stream, paired with type `0xFF`. */
export const TABLE_TAG_END = 0x6e

export interface TableRecord {
  readonly tag: number
  /** Type byte. `0x02` means the values are floats; the rest are unidentified. */
  readonly type: number
  /** Byte offset of the record within the file. */
  readonly offset: number
  /** Raw values, one per 4 bytes. */
  readonly values: Uint32Array
  /** The same values read as IEEE floats, for records whose type is 2. */
  readonly floats: Float32Array
  /**
   * What each value is, two bits from the header per value.
   *
   * `0` is a byte offset into the string table, `1` an integer and `2` a float.
   * `3` has not been seen. Reading a record without this means guessing which
   * of its values are floats, which is why the map manifest used to.
   */
  readonly kinds: Uint8Array
}

export interface DataTable {
  readonly unknown_0x00: number
  /** NUL-separated names from the string table; empty when there is none. */
  readonly strings: readonly string[]
  readonly records: readonly TableRecord[]
  /** True when the stream ended on the terminator record rather than running out. */
  readonly terminated: boolean
  /** Every record with a given tag. */
  withTag(tag: number): TableRecord[]
  /**
   * The string beginning at `offset` bytes into the string section.
   *
   * Records name a string by its byte offset, not by its position in the list,
   * so this is how a record's reference is resolved.
   */
  stringAt(offset: number): string | undefined
}

function u32(d: Uint8Array, at: number, what: string): number {
  if (at + 4 > d.length) throw new GameFormatError(`${what}: read past end of table`, at)
  return (
    ((d[at] as number) |
      ((d[at + 1] as number) << 8) |
      ((d[at + 2] as number) << 16) |
      ((d[at + 3] as number) << 24)) >>>
    0
  )
}

/**
 * Cheap check for the table's shape. There is no magic number, so this tests
 * that the string table is inside the file and its own extent is consistent.
 */
export function isDataTable(data: Uint8Array): boolean {
  if (data.length < 16) return false
  const stringOffset = u32(data, 4, 'table.stringOffset')
  const stringSize = u32(data, 8, 'table.stringSize')
  if (stringOffset < 16 || stringOffset > data.length) return false
  return stringOffset + stringSize <= data.length
}

/** Parse a tagged data table. */
export function readDataTable(data: Uint8Array): DataTable {
  if (data.length < 16) {
    throw new GameFormatError(`table is ${data.length} bytes, shorter than its header`)
  }
  const unknown_0x00 = u32(data, 0, 'table.unknown_0x00')
  const stringOffset = u32(data, 4, 'table.stringOffset')
  const stringSize = u32(data, 8, 'table.stringSize')
  const stringCount = u32(data, 12, 'table.stringCount')

  if (stringOffset < 16 || stringOffset > data.length) {
    throw new GameFormatError(
      `table string section starts at 0x${stringOffset.toString(16)}, outside the ${data.length}-byte file`,
      4,
    )
  }
  if (stringOffset + stringSize > data.length) {
    throw new GameFormatError(
      `table string section of ${stringSize} bytes runs past the end of the file`,
      8,
    )
  }

  // Strings are bytes, decoded byte-transparently; they are resource names.
  const strings: string[] = []
  // Where each string begins, relative to the section. Records address strings
  // by that offset rather than by ordinal, so both are kept.
  const byOffset = new Map<number, string>()
  let start = stringOffset
  for (let i = stringOffset; i < stringOffset + stringSize; i++) {
    if (data[i] !== 0) continue
    if (i > start) {
      let name = ''
      for (let j = start; j < i; j++) name += String.fromCharCode(data[j] as number)
      strings.push(name)
      byOffset.set(start - stringOffset, name)
    }
    start = i + 1
  }
  if (strings.length !== stringCount) {
    throw new GameFormatError(
      `table declares ${stringCount} strings but its section holds ${strings.length}`,
      12,
    )
  }

  /** True when the four bytes at `from` are 0xFF fill rather than a record. */
  const isPaddingWord = (from: number): boolean =>
    data[from] === 0xff &&
    data[from + 1] === 0xff &&
    data[from + 2] === 0xff &&
    data[from + 3] === 0xff

  const records: TableRecord[] = []
  let at = 16
  let terminated = false
  while (at + 4 <= stringOffset) {
    const tag = (data[at] as number) | ((data[at + 1] as number) << 8)
    const count = data[at + 2] as number
    const type = data[at + 3] as number
    // Tag, count, then two bits of type per value, rounded up to a word.
    const header = Math.ceil((3 + Math.ceil(count / 4)) / 4) * 4
    if (tag === TABLE_TAG_END && type === 0xff) {
      terminated = true
      at += 4
      break
    }
    if (isPaddingWord(at)) {
      at += 4
      continue
    }
    const end = at + header + count * 4
    if (end > stringOffset) {
      throw new GameFormatError(
        `table record at 0x${at.toString(16)} (tag 0x${tag.toString(16)}) needs ${count * 4} bytes but the record stream ends at 0x${stringOffset.toString(16)}`,
        at,
      )
    }
    const values = new Uint32Array(count)
    const floats = new Float32Array(count)
    const kinds = new Uint8Array(count)
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    for (let i = 0; i < count; i++) {
      values[i] = view.getUint32(at + header + i * 4, true)
      floats[i] = view.getFloat32(at + header + i * 4, true)
      // Two bits each, low pair first, running on into the following bytes.
      kinds[i] = ((data[at + 3 + (i >> 2)] as number) >> ((i & 3) * 2)) & 3
    }
    records.push({ tag, type, offset: at, values, floats, kinds })
    at = end
  }

  return {
    unknown_0x00,
    strings,
    stringAt: (offset) => byOffset.get(offset),
    records,
    terminated,
    withTag: (tag) => records.filter((r) => r.tag === tag),
  }
}
