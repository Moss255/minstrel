import { GameFormatError } from './errors.ts'

/**
 * What a piece of equipment does: the table after an equipment category's
 * records in `itemdt_<c>_<lang>.nat` — weapons, shields, headgear, armour,
 * gloves, legwear, footwear and accessories, not the tools. See FORMAT.md,
 * "Items", "The stats".
 *
 * | where | what |
 * |---|---|
 * | `32 × N` | N entries of 32 bytes, N the head's record count; the first shares its 32 bytes with the last record |
 * | then | {@link STATS_GAP} bytes, not read |
 * | the file's end, less the head's `u32` at `+0x08` | N names, each ending with a zero — the entries' own, in their order |
 *
 * An entry is eight `u32`s. **Word 5's bits 0–9 are attack and bits 10–19
 * defence** — INFERRED, from what they do: within each kind of weapon attack
 * rises with price, and defence the same on shields, headgear, armour, gloves,
 * legwear and boots. The rest of the entry is carried.
 */

export interface ItemStats {
  /**
   * The item's name, as the names at the table's end give it: the entry's own
   * label, where they are one to an entry — as in all eight English tables.
   * Undefined where they are not: the Spanish armour's hold 180 for 183.
   */
  readonly name: string | undefined
  /** Word 5, bits 0–9 — INFERRED. */
  readonly attack: number
  /** Word 5, bits 10–19 — INFERRED. */
  readonly defence: number
  /**
   * The entry's 32 bytes as they stand, for what is not read. The first
   * entry's first eight are the last record's actions, id and price.
   */
  readonly unknown_entry: Uint8Array
}

const HEAD = 0x20
const ENTRY = 32
/** Bytes between the entries and the names — 100 on all eight equipment tables. Not read. */
export const STATS_GAP = 100

/** Read an equipment table's stats, in the entries' order. Throws on a table without them, the tools among them. */
export function readItemStats(bytes: Uint8Array): ItemStats[] {
  if (bytes.length < HEAD) {
    throw new GameFormatError(`item table is ${bytes.length} bytes, shorter than its head`)
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint16(0, true)
  const namesLength = view.getUint32(0x08, true)
  const namesAt = bytes.length - namesLength
  const entriesAt = ENTRY * count
  if (namesLength > bytes.length || entriesAt + count * ENTRY + STATS_GAP !== namesAt) {
    throw new GameFormatError(
      `no stats here: ${count} entries from ${entriesAt} do not meet the names at ${namesAt}`,
      0x08,
    )
  }
  const names: string[] = []
  for (let at = namesAt; at < bytes.length; ) {
    let end = at
    while (end < bytes.length && bytes[end] !== 0) end++
    if (end >= bytes.length) throw new GameFormatError(`name ${names.length} does not end`, at)
    let name = ''
    for (let i = at; i < end; i++) name += String.fromCharCode(bytes[i] as number)
    names.push(name)
    at = end + 1
  }
  const labelled = names.length === count
  const stats: ItemStats[] = []
  for (let k = 0; k < count; k++) {
    const entry = entriesAt + k * ENTRY
    const word5 = view.getUint32(entry + 20, true)
    stats.push({
      name: labelled ? names[k] : undefined,
      attack: word5 & 0x3ff,
      defence: (word5 >>> 10) & 0x3ff,
      unknown_entry: bytes.subarray(entry, entry + ENTRY),
    })
  }
  return stats
}
