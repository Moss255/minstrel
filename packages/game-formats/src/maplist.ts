import { GameFormatError } from './errors.ts'
import { type DataTable, readDataTable } from './table.ts'

/**
 * `maplist9.bin` — the cartridge's own index of every map.
 *
 * Another tagged data table (see `table.ts`), and the one that says what the
 * maps *are*: a region, a code, and a name a person wrote. The code is what
 * names the map's archive, so this is the bridge from "the village inn" to the
 * files that draw it.
 *
 * | tag | meaning |
 * |---|---|
 * | `0x66` | number of map entries |
 * | `0x67` | one per map, 22 values |
 *
 * Four of those values are byte offsets into the string table. The rest are
 * numbers whose meaning is **not** established — see below.
 */
const TAG_ENTRY = 0x67
const TAG_COUNT = 0x66

/**
 * Value slots in an entry that hold a string offset.
 *
 * Each is **two** lower than it was while the record header was being read as
 * four bytes. How far the slots move depends on the value count: two bits of
 * type per value, padded to a word, so an entry's 22 values need six type bytes
 * and a twelve-byte header. What looked like two leading values were those type
 * bytes. See `table.ts`.
 */
/**
 * The map's own id, which is how the rest of the cartridge names it.
 *
 * **Established exactly**: every one of the **1,289** placement blocks in
 * `/data/scenario` carries a map word, and all 1,289 of them are the value of
 * this slot on some entry here. Angel Falls runs 1100 for the village and 1101
 * to 1112 for its interiors, which is why the decimal reading of a placement's
 * map word looked like `area x 100 + sub-map` — but that is a habit of the
 * numbering rather than a rule, and ids elsewhere run to 20001.
 *
 * `0` on 139 entries, which are maps the cartridge does not ship.
 */
const SLOT_ID = 0
const SLOT_UNKNOWN_2 = 0
const SLOT_REGION = 2
const SLOT_CODE = 4
const SLOT_LABEL = 5
const SLOT_UNKNOWN_13 = 11
/**
 * Which space the map is built in. `1` indoors, `2` outdoors, `0` neither.
 *
 * Established by what the labels say. Of the 520 entries with `1`, the labels
 * are "Interior", "Church", "Well", "Inn", "Item Shop", "Interior - B1",
 * "Treasure Map - Lv 1"; of the 119 with `2` they are "Exterior" (34 of them)
 * and the named regions. The remaining 371 carry `0` and are mostly entries for
 * maps that do not ship.
 *
 * **It is a scale, not a label.** See {@link MapEntry.indoors}.
 */
const SLOT_SPACE = 17
/** The value of {@link SLOT_SPACE} that means indoors. */
const SPACE_INDOORS = 1

/** One map. */
export interface MapEntry {
  /** Position in the list. Not how anything refers to a map — see {@link id}. */
  readonly index: number
  /**
   * The map's own id, which **is** how the rest of the cartridge names it.
   *
   * A character's placement says which map it stands in by this number, and
   * every one of the cartridge's 1,289 placements names an id that is here.
   * Zero on the 139 entries for maps that do not ship.
   */
  readonly id: number
  /**
   * The map's code, and the name of its archive: `M01` is `M01.amdj`.
   *
   * Present on every entry. 667 of the 872 distinct codes name an archive that
   * ships; the rest are development maps the cartridge kept an entry for.
   */
  readonly code: string
  /** The region it belongs to — "Angel Falls", "Gleeba". */
  readonly region: string | undefined
  /** What it is, in the words of whoever built it — "Inn", "Church". */
  readonly label: string | undefined
  /**
   * A second code, which usually names a real attribute table (722 of the 731
   * entries that carry one) but is **not this map's own**. What it refers to is
   * not established.
   */
  readonly unknown_13: string | undefined
  /** Occasionally another map's code. Not established. */
  readonly unknown_2: string | undefined
  /**
   * Whether the map is built indoors, which decides **how big it is**.
   *
   * An indoor map is authored in the same space a placed piece is — the one an
   * order of magnitude larger than the map goes into — so the whole of it wants
   * `PLACED_PIECE_SCALE` before a character can stand in it. An outdoor map is
   * authored at its final size and only its placed pieces are scaled.
   *
   * Undivided, the village inn's floor covers **1,395 square character-heights
   * against the whole village's 796**, and one of its houses covers 4,627 — a
   * single room with nearly six times the floor of the village around it.
   *
   * Three independent references say the same eighth, and none of them is the
   * doorway table, which cannot answer it: scaling a map and its own doorways
   * together changes nothing either can see, and reads 95.6% both ways.
   *
   * - **The furniture.** A stool in the inn stands 1.9 character-heights tall
   *   as shipped and 0.24 divided; its beds go from 7.3 x 9.7 to 0.9 x 1.2.
   * - **The doorway models**, which are placed and so already divided: the inn
   *   is 36 of its own doors wide as shipped, and 4.5 divided.
   * - **The village around it**, whose own props are already right undivided —
   *   its fences stand 0.9 of a character — so the two cannot share a space.
   */
  readonly indoors: boolean
  /** The whole record, for anything the fields above do not cover. */
  readonly values: Uint32Array
}

export interface MapList {
  readonly maps: readonly MapEntry[]
  readonly table: DataTable
  /** The maps of one region, in list order. */
  region(name: string): MapEntry[]
  /** The map with a given code, if there is one. */
  map(code: string): MapEntry | undefined
}

/** Cheap check for a map list: a data table carrying map entries. */
export function isMapList(data: Uint8Array): boolean {
  try {
    return readDataTable(data).withTag(TAG_ENTRY).length > 0
  } catch {
    return false
  }
}

/** Read the cartridge's map index. */
export function readMapList(data: Uint8Array): MapList {
  const table = readDataTable(data)
  const entries = table.withTag(TAG_ENTRY)

  const declared = table.withTag(TAG_COUNT)[0]?.values[0]
  if (declared !== undefined && declared !== entries.length) {
    throw new GameFormatError(`map list declares ${declared} maps but holds ${entries.length}`)
  }

  // Offset zero is the first string, which is the build stamp. A field that is
  // zero is empty, not a reference to it — reading it as one turns every blank
  // field into a date.
  const at = (slot: number, record: (typeof entries)[number]): string | undefined => {
    const offset = record.values[slot]
    return offset === undefined || offset === 0 ? undefined : table.stringAt(offset)
  }

  const maps = entries.map((record, index) => {
    const code = at(SLOT_CODE, record)
    if (code === undefined) {
      throw new GameFormatError(`map ${index} has no code`)
    }
    return {
      index,
      code,
      region: at(SLOT_REGION, record),
      label: at(SLOT_LABEL, record),
      id: record.values[SLOT_ID] as number,
      unknown_13: at(SLOT_UNKNOWN_13, record),
      unknown_2: at(SLOT_UNKNOWN_2, record),
      indoors: record.values[SLOT_SPACE] === SPACE_INDOORS,
      values: record.values,
    }
  })

  const byCode = new Map<string, MapEntry>()
  for (const entry of maps) if (!byCode.has(entry.code)) byCode.set(entry.code, entry)

  return {
    maps,
    table,
    region: (name) => maps.filter((entry) => entry.region === name),
    map: (code) => byCode.get(code),
  }
}
