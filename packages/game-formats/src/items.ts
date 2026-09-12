import { GameFormatError } from './errors.ts'

/**
 * Item names: `/data/prm/itemname.gp2/itemname_<lang>.nat`, one per language.
 *
 * Established by observation; the evidence is in `FORMAT.md`, "Items".
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `u16` | record count — 1,178 in English |
 * | `+0x02` | `u16` | `unknown_0x02`; differs by language |
 * | `+0x04` | 16 bytes × count | a record: singular, plural, `unknown_0x08`, id |
 * | after | | the strings, NUL-terminated; a record's offsets count from here |
 *
 * **The id is the item's.** It is the number each item table's records open
 * with — medicinal herb is `0x55F0`, and the tools table's first record opens
 * `F0 55` — and the number a chest's contents name. The names are ASCII with
 * the text's own markup (`veteran<1>s helm`), left for the caller to render.
 */

export interface ItemName {
  readonly id: number
  readonly singular: string
  readonly plural: string
  /** The record's third word: it differs by language, and is not established. */
  readonly unknown_0x08: number
}

/** Parse an item-name table. */
export function readItemNames(bytes: Uint8Array): ItemName[] {
  if (bytes.length < 4)
    throw new GameFormatError(`item names are ${bytes.length} bytes, shorter than a header`)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint16(0, true)
  const strings = 4 + count * 16
  if (strings > bytes.length) {
    throw new GameFormatError(`${count} item-name records run past the end of the file`, 0)
  }
  const text = (offset: number, at: number): string => {
    const start = strings + offset
    const end = bytes.indexOf(0, start)
    if (start >= bytes.length || end < 0) {
      throw new GameFormatError(
        `item name at 0x${start.toString(16)} is outside the file or has no end`,
        at,
      )
    }
    let out = ''
    for (let i = start; i < end; i++) out += String.fromCharCode(bytes[i] as number)
    return out
  }
  const names: ItemName[] = []
  for (let i = 0; i < count; i++) {
    const at = 4 + i * 16
    names.push({
      singular: text(view.getUint32(at, true), at),
      plural: text(view.getUint32(at + 4, true), at + 4),
      unknown_0x08: view.getUint32(at + 8, true),
      id: view.getUint32(at + 12, true),
    })
  }
  return names
}
