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

/** Value slots in an entry that hold a string offset. */
const SLOT_UNKNOWN_2 = 2
const SLOT_REGION = 4
const SLOT_CODE = 6
const SLOT_LABEL = 7
const SLOT_UNKNOWN_13 = 13

/** One map. */
export interface MapEntry {
  /** Position in the list, which is how other tables would refer to it. */
  readonly index: number
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
      unknown_13: at(SLOT_UNKNOWN_13, record),
      unknown_2: at(SLOT_UNKNOWN_2, record),
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
