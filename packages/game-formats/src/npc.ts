import { GameFormatError } from './errors.ts'
import { PLACEMENT_SCALE } from './mapmanifest.ts'
import { readDataTable } from './table.ts'

/**
 * `<map>.npc` — who stands in a map, and where.
 *
 * A NARC holding two files: `<map>npc.bin` names the cast, and
 * `<map>place.bin` puts them. 74 archives on the cartridge, 1,385 names and
 * 1,285 placements between them.
 *
 * The two are joined by an id: **every placement's id is the id of an entry in
 * the list, on 73 of the 74 archives**. There are fewer placements than names,
 * never more, which is what you would expect if some characters are placed by
 * events rather than by the file.
 */

/** The list is a tagged data table; its character records carry this tag. */
const TAG_ENTRY = 3

/**
 * Value slots in a character record.
 *
 * One lower than they were while the record header was being read as four
 * bytes: a character carries five values, so its header is eight. Slot 0 is
 * `0xFFFFFF01` on every record of the cartridge.
 */
const SLOT_ID = 0
const SLOT_KIND = 1
const SLOT_NAME = 3

/** An unset slot. */
const UNSET = 0xffffffff

/**
 * What a character is drawn as.
 *
 * **Established, and it is the byte that decides.** Across the 33 distinct
 * names of the slice's village the split is exact: every `kind` 0 has a `.spr`
 * in `/data/ani` and no 3D model anywhere on the cartridge, and every `kind` 2
 * has a `.chr` archive in `/data/chara_sub` and no `.spr`. Cartridge-wide the
 * byte takes 0 (901), 1 (317), 2 (132) and 5 (35).
 *
 * `kind` 1 is carried by records with no name at all. What 5 is, is not
 * established — the village's one example, `z015d`, has neither a sprite nor a
 * model under that name.
 */
export const NPC_KIND = {
  /** Drawn as a 2D sprite from `/data/ani/<name>.spr`. */
  SPRITE: 0,
  /** Drawn as a 3D model from `/data/chara_sub/<name>.chr`. */
  MODEL: 2,
} as const

/** One character the map's cast names. */
export interface NpcEntry {
  /** Joins this entry to its placement. Not a position in the list. */
  readonly id: number
  /** See {@link NPC_KIND}. Values other than 0 and 2 are not established. */
  readonly kind: number
  /** The character's name, absent on records that carry no string offset. */
  readonly name: string | undefined
  /** The whole record, for anything the fields above do not cover. */
  readonly values: Uint32Array
}

/** Where one character stands, in world units. */
export interface NpcPlacement {
  /** The id of the {@link NpcEntry} this places. */
  readonly id: number
  /** Position, the file's value divided by {@link PLACEMENT_SCALE}. */
  readonly x: number
  readonly y: number
  readonly z: number
  /**
   * Which way it faces, in radians about the vertical.
   *
   * **Established beyond reasonable doubt.** Across all 1,285 blocks on the
   * cartridge the value is within 0 to 2π, and 71% of them sit on an exact
   * multiple of 90°. That is authored data, not bytes that happen to decode.
   */
  readonly facing: number
  /** Byte offset of the block, for anything that wants the rest of it. */
  readonly offset: number
}

/**
 * The word a placement block opens with, and the word after it.
 *
 * Two words rather than one because the blocks are **variable length** — the
 * gaps between them run from 76 to 924 bytes — so they are found by scanning
 * rather than by stride, and a single word is a weaker signature than the
 * scan deserves.
 */
const BLOCK_MARK = 0xa5060003
const BLOCK_MARK_2 = 0xffffff0a
/** Header words before the four floats. */
const BLOCK_HEADER = 16

function u32(data: Uint8Array, at: number): number {
  return (
    ((data[at] as number) |
      ((data[at + 1] as number) << 8) |
      ((data[at + 2] as number) << 16) |
      ((data[at + 3] as number) << 24)) >>>
    0
  )
}

/** Cheap check for a cast list: a data table carrying character records. */
export function isNpcList(data: Uint8Array): boolean {
  try {
    return readDataTable(data).withTag(TAG_ENTRY).length > 0
  } catch {
    return false
  }
}

/** Read a map's cast. */
export function readNpcList(data: Uint8Array): NpcEntry[] {
  const table = readDataTable(data)
  const entries: NpcEntry[] = []
  for (const record of table.withTag(TAG_ENTRY)) {
    if (record.values.length <= SLOT_NAME) {
      throw new GameFormatError(
        `character record at 0x${record.offset.toString(16)} carries ${record.values.length} values, fewer than the ${SLOT_NAME + 1} a character needs`,
        record.offset,
      )
    }
    const nameAt = record.values[SLOT_NAME] as number
    entries.push({
      id: record.values[SLOT_ID] as number,
      kind: record.values[SLOT_KIND] as number,
      name: nameAt === UNSET ? undefined : table.stringAt(nameAt),
      values: record.values,
    })
  }
  return entries
}

/**
 * Cheap check for a placement file.
 *
 * **`isDataTable` says yes to one of these and it is wrong**: a placement
 * file's string offset happens to equal its length, which is exactly what that
 * check tests. This looks for the block signature instead.
 */
export function isNpcPlacements(data: Uint8Array): boolean {
  for (let at = 0; at + BLOCK_HEADER <= data.length; at += 4) {
    if (u32(data, at) === BLOCK_MARK && u32(data, at + 4) === BLOCK_MARK_2) return true
  }
  return false
}

/**
 * Read where a map's characters stand.
 *
 * Blocks are variable length, so they are found by their two-word signature and
 * read from there. The four floats follow the header; what comes after them
 * before the next block is not decoded and is not needed to place anybody.
 */
export function readNpcPlacements(data: Uint8Array): NpcPlacement[] {
  const out: NpcPlacement[] = []
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  for (let at = 0; at + BLOCK_HEADER <= data.length; at += 4) {
    if (u32(data, at) !== BLOCK_MARK || u32(data, at + 4) !== BLOCK_MARK_2) continue
    if (at + BLOCK_HEADER + 16 > data.length) {
      throw new GameFormatError(
        `placement block at 0x${at.toString(16)} runs past the end of the file`,
        at,
      )
    }
    out.push({
      id: u32(data, at + 12),
      x: view.getFloat32(at + BLOCK_HEADER + 0, true) / PLACEMENT_SCALE,
      y: view.getFloat32(at + BLOCK_HEADER + 4, true) / PLACEMENT_SCALE,
      z: view.getFloat32(at + BLOCK_HEADER + 8, true) / PLACEMENT_SCALE,
      facing: view.getFloat32(at + BLOCK_HEADER + 12, true),
      offset: at,
    })
    at += BLOCK_HEADER + 12
  }
  return out
}

/** The cast, with each character's placement where the file gives one. */
export function placeNpcs(
  entries: readonly NpcEntry[],
  placements: readonly NpcPlacement[],
): { entry: NpcEntry; placement: NpcPlacement }[] {
  const byId = new Map<number, NpcPlacement>()
  // First placement wins: an id is not repeated on the cartridge, and taking
  // the first is the reproducible answer if one ever is.
  for (const placement of placements) if (!byId.has(placement.id)) byId.set(placement.id, placement)

  const out: { entry: NpcEntry; placement: NpcPlacement }[] = []
  for (const entry of entries) {
    const placement = byId.get(entry.id)
    // No placement means the character is put somewhere by an event instead.
    if (placement) out.push({ entry, placement })
  }
  return out
}
