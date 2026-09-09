import { GameFormatError } from './errors.ts'

/**
 * `.bmbl` — a map's textures, and the maps it connects to.
 *
 * One per map archive, in the `.ambl` beside the `.amdj` that holds the
 * geometry. It shares the tagged container of `.bmdj` and `.bats` (see
 * `table.ts`): a 16-byte header, a record stream, then a string table.
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `0x00` | `u32` | `unknown_0x00` |
 * | `0x04` | `u32` | string table offset |
 * | `0x08` | `u32` | string table size |
 * | `0x0C` | `u32` | string count |
 * | `0x10` | | the record stream, running up to the string table |
 *
 * **Only the header and the string table are read here.** The record stream is
 * not decoded: a walk of `M01M0000.bmbl` desynchronises after five records, and
 * the shared `readDataTable` throws on 387 of the cartridge's 667 `.bmbl` for
 * that reason. The string table, by contrast, reads on **667 of 667**, with the
 * header's declared count matching the names found on 667 of 667 — so this
 * parses what is established and leaves the rest alone rather than failing on a
 * part it does not need.
 *
 * That is also why this does not go through `readDataTable`: doing so would
 * make a file whose useful half is intact throw on its undecoded half.
 *
 * ## What the names are
 *
 * `M01M0000.bmbl` names twelve: its own two textures (`M01M00T1`, `M01M00T2`),
 * the map itself (`M01M0000`), and **nine other map codes** — `M01M01`..`M01M08`
 * and `F01`, every one a code the map index knows and an archive that ships.
 *
 * Cartridge-wide, **858 of 898 such links are reciprocal**: each interior names
 * exactly its exterior and nothing else, and `F01` names `M01`, `D01` and
 * `S01M01`. That is a connectivity graph, and it is the only thing found so far
 * that says which maps reach which — the map index carries no link field.
 *
 * ## What it is not
 *
 * **Adjacency, not per-door targeting.** `M01` has ten doorway models
 * (`M01M00D1`..`DA`) against nine named maps, and across the cartridge the two
 * counts agree on only 60 of the 172 maps that have both. Which doorway leads
 * to which neighbour is not here, and would have to come from the record
 * stream.
 */

/** A `.bmbl`: the header fields that are established, and its names. */
export interface MapLinks {
  /** Header word at `0x00`. Meaning not established. */
  readonly unknown_0x00: number
  /** Every name in the string table, in table order. */
  readonly names: readonly string[]
  /**
   * The name beginning at `offset` bytes into the string section.
   *
   * Kept because the undecoded records address strings by byte offset rather
   * than by ordinal, so anything that later reads them needs this.
   */
  nameAt(offset: number): string | undefined
  /**
   * The maps this one connects to.
   *
   * A name cannot be told from the file alone: `M01M00T1` is this map's texture
   * and `M01M01` is a neighbouring map, and both begin with the map's own code.
   * So the caller supplies what counts as a map code — in practice
   * `readMapList`'s index — and its own code, which is dropped.
   *
   * Matching is case-insensitive. Duplicates are removed, and order follows the
   * string table.
   */
  linksTo(ownCode: string, isMapCode: (name: string) => boolean): string[]
}

const HEADER_SIZE = 16

function u32(data: Uint8Array, at: number, what: string): number {
  if (at + 4 > data.length) throw new GameFormatError(`${what}: read past end of file`, at)
  return (
    ((data[at] as number) |
      ((data[at + 1] as number) << 8) |
      ((data[at + 2] as number) << 16) |
      ((data[at + 3] as number) << 24)) >>>
    0
  )
}

/**
 * Cheap check for the shape. There is no magic number, so this tests that the
 * string section is inside the file and its own extent is consistent.
 *
 * This is the same shape every file of the shared container has, so a true here
 * means "could be"; it does not distinguish a `.bmbl` from a `.bmdj`. The
 * extension is what does that.
 */
export function isMapLinks(data: Uint8Array): boolean {
  if (data.length < HEADER_SIZE) return false
  const offset = u32(data, 4, 'maplinks.stringOffset')
  const size = u32(data, 8, 'maplinks.stringSize')
  if (offset < HEADER_SIZE || offset > data.length) return false
  return offset + size <= data.length
}

/** Read a `.bmbl`'s header and string table. */
export function readMapLinks(data: Uint8Array): MapLinks {
  if (data.length < HEADER_SIZE) {
    throw new GameFormatError(`file is ${data.length} bytes, shorter than its header`)
  }
  const unknown_0x00 = u32(data, 0, 'maplinks.unknown_0x00')
  const stringOffset = u32(data, 4, 'maplinks.stringOffset')
  const stringSize = u32(data, 8, 'maplinks.stringSize')
  const stringCount = u32(data, 12, 'maplinks.stringCount')

  if (stringOffset < HEADER_SIZE || stringOffset > data.length) {
    throw new GameFormatError(
      `string section starts at 0x${stringOffset.toString(16)}, outside the ${data.length}-byte file`,
      4,
    )
  }
  if (stringOffset + stringSize > data.length) {
    throw new GameFormatError(
      `string section of ${stringSize} bytes runs past the end of the file`,
      8,
    )
  }

  const names: string[] = []
  const byOffset = new Map<number, string>()
  let start = stringOffset
  for (let i = stringOffset; i < stringOffset + stringSize; i++) {
    if (data[i] !== 0) continue
    if (i > start) {
      let name = ''
      for (let j = start; j < i; j++) name += String.fromCharCode(data[j] as number)
      names.push(name)
      byOffset.set(start - stringOffset, name)
    }
    start = i + 1
  }
  // A section that does not end on its terminator still holds a last name.
  if (start < stringOffset + stringSize) {
    let name = ''
    for (let j = start; j < stringOffset + stringSize; j++) {
      name += String.fromCharCode(data[j] as number)
    }
    names.push(name)
    byOffset.set(start - stringOffset, name)
  }

  if (names.length !== stringCount) {
    throw new GameFormatError(
      `file declares ${stringCount} names but its string section holds ${names.length}`,
      12,
    )
  }

  return {
    unknown_0x00,
    names,
    nameAt: (offset) => byOffset.get(offset),
    linksTo(ownCode, isMapCode) {
      const own = ownCode.toLowerCase()
      const out: string[] = []
      const seen = new Set<string>()
      for (const name of names) {
        const key = name.toLowerCase()
        if (key === own || seen.has(key) || !isMapCode(name)) continue
        seen.add(key)
        out.push(name)
      }
      return out
    },
  }
}
