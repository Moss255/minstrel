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
 * An entry is eight `u32`s. Words 5, 6 and 7 are three 10-bit fields each.
 * **Word 5's are attack and defence** — INFERRED, from what they do: within
 * each kind of weapon attack rises with price, and defence the same on shields,
 * headgear, armour, gloves, legwear and boots — and one not established.
 * **Word 7's are deftness, agility and magical might**, and word 6's second and
 * third evasion and the chance of a critical hit — INFERRED, from what the
 * items' own descriptions say they do. Word 3 gives a weapon's kind, and word 4
 * who may wear a piece. The rest of the entry is carried. See FORMAT.md.
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
  /** Word 7, bits 0–9 — INFERRED: deftness. The utility belt "does wonders for deftness"; set on most gloves. */
  readonly deftness: number
  /** Word 7, bits 10–19 — INFERRED: agility. The agility ring "accentuates agility". */
  readonly agility: number
  /** Word 7, bits 20–29 — INFERRED: magical might. The sorcerer's stone "jacks up magical might a little". */
  readonly magicalMight: number
  /**
   * Word 6, bits 0–9: **the chance of blocking, in tenths of a hundredth** —
   * read from the game's code. `func_02084ee8` sums this field over all eleven
   * pieces worn, each divided by `10.0f`, and the battle's block rate
   * (`func_ov000_02156118`) is that sum when a shield is worn. On the cartridge
   * it is set on 42 of the 45 shields and on nothing else in the eight tables:
   * the bronze shield's 5, the iron shield's 10, Erdrick's 90.
   */
  readonly block: number
  /**
   * Word 6, bits 10–19: evasion, in tenths of a hundredth. It was INFERRED from
   * the five body pieces whose descriptions say so; the game's `func_02084f58`
   * reads these bits and divides by `10.0f` as it does the block's, for the
   * evasion rate (`func_ov000_02156270`).
   */
  readonly evasion: number
  /** Word 6, bits 20–29 — INFERRED, on one witness: the chance of a critical hit. */
  readonly critical: number
  /**
   * Word 3, bits 7–11: a weapon's kind plus one — `itemsort`'s subtype + 1 on
   * every weapon — 13 on a shield, and 0 on the rest.
   */
  readonly kind: number
  /**
   * Word 4, bits 0–11 — INFERRED: who may wear it, a bit a vocation of the
   * twelve, **bit v − 1 for vocation v in the level tables' order** — warrior
   * 0, priest 1, mage 2, martial artist 3, thief 4, minstrel 5, gladiator 6,
   * armamentalist 7, paladin 8, sage 9, luminary 10, ranger 11: the 23
   * vocation presets (`charapreset.bin`) each dress in four or five pieces
   * that carry that one bit and no other — the warrior's armour, trousers,
   * gloves, boots and helm bit 0; the sage's robe, clogs and mitre bit 9 —
   * and the skill trees named for the vocations run in the same order.
   * `0xfff` on every accessory and most armour; 0 on weapons and shields,
   * whose use goes by the vocations' weapon skills, not read.
   */
  readonly usedBy: number
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
    const word3 = view.getUint32(entry + 12, true)
    const word4 = view.getUint32(entry + 16, true)
    const word5 = view.getUint32(entry + 20, true)
    const word6 = view.getUint32(entry + 24, true)
    const word7 = view.getUint32(entry + 28, true)
    stats.push({
      name: labelled ? names[k] : undefined,
      attack: word5 & 0x3ff,
      defence: (word5 >>> 10) & 0x3ff,
      deftness: word7 & 0x3ff,
      agility: (word7 >>> 10) & 0x3ff,
      magicalMight: (word7 >>> 20) & 0x3ff,
      block: word6 & 0x3ff,
      evasion: (word6 >>> 10) & 0x3ff,
      critical: (word6 >>> 20) & 0x3ff,
      kind: (word3 >>> 7) & 0x1f,
      usedBy: word4 & 0xfff,
      unknown_entry: bytes.subarray(entry, entry + ENTRY),
    })
  }
  return stats
}
