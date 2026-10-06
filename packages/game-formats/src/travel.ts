import { GameFormatError } from './errors.ts'
import { type DataTable, readDataTable, type TableRecord } from './table.ts'

/**
 * **Travel**: the places Zoom and the chimaera wing offer, where Evac takes
 * the party, and what the priest says to a party that wakes in a church —
 * three of the game's `Script` command files (see `table.ts`) and one table
 * of map ids in overlay 17's code. Read 6 October 2026 from the decomp's US
 * build; the whole reading, with addresses, is `docs/readings/T12-travel.md`,
 * and the files' layouts are in FORMAT.md, "Travel".
 */

/** A value's type in a command file: a string's offset, an integer, a float. */
const STRING = 0
const INT = 1
const FLOAT = 2

/** The game-wide flag that offers place n is `PLACE_FLAG + n` (`func_020a8458`, `0x020a849c`). */
export const PLACE_FLAG = 0x200

/** `loola`'s opcode for a place (`func_020a7f88`, through `data_020f1b6c`). */
const OP_PLACE = 0x67
/** A place's values: number, value 1, name, revival map, map, facing, x, y, z, the ship's map, value 10, its x and z. */
const PLACE_VALUES = 13

/** One of the places Zoom and the chimaera wing can take the party to — a `loola` entry. */
export interface ZoomPlace {
  /**
   * Its number, value 0: the game-wide flag {@link PLACE_FLAG} `+ n` offers
   * it, and the list is in its order.
   */
  readonly number: number
  /** Value 1, 1 to 6 on the cartridge; nothing found reads it. */
  readonly unknown_1: number
  /** What the list calls it, value 2. */
  readonly name: string
  /**
   * Value 3: the map a party wiped out comes round in, when it is this
   * town's — the lookup `func_020a83fc` makes by it.
   */
  readonly revivalMap: number
  /** Value 4: the map Zoom lands on, by its id. */
  readonly map: number
  /** Value 5, the facing on landing — kept × 4096 at `+0x0A`. 0 on every place on the cartridge. */
  readonly facing: number
  /** Values 6 to 8: where on the map, in the map's own units. */
  readonly x: number
  readonly y: number
  readonly z: number
  /**
   * Values 9 to 12: where the ship is put when the party has one (flag
   * `0x2b`) — its map, a number handed with it (not read), and its x and z.
   */
  readonly ship: {
    readonly map: number
    readonly unknown_10: number
    readonly x: number
    readonly z: number
  }
}

/** A value read as the game's `Script::Parameter::ToInt` reads it: a float truncated. */
function int(record: TableRecord, i: number): number {
  const kind = record.kinds[i]
  if (kind === FLOAT) return Math.trunc(record.floats[i] as number)
  return (record.values[i] as number) | 0
}

/** A value read as `ToFloat` reads it: an integer made a float. */
function float(record: TableRecord, i: number): number {
  const kind = record.kinds[i]
  if (kind === FLOAT) return record.floats[i] as number
  return (record.values[i] as number) | 0
}

/** A value read as `ToString` reads it: the string at its offset; undefined for one that is not a string. */
function text(table: DataTable, record: TableRecord, i: number): string | undefined {
  if (record.kinds[i] !== STRING) return undefined
  return table.stringAt(record.values[i] as number)
}

/**
 * Read **`data/map/loola.gp2` › `loola_<LG>.bin`**, Zoom's list: every place,
 * in the file's order. Throws on a place record of the wrong length or with
 * no name.
 */
export function readZoomPlaces(bytes: Uint8Array): ZoomPlace[] {
  const table = readDataTable(bytes)
  return table.withTag(OP_PLACE).map((record) => {
    if (record.values.length < PLACE_VALUES) {
      throw new GameFormatError(
        `loola: a place has ${record.values.length} values, not ${PLACE_VALUES}`,
        record.offset,
      )
    }
    const name = text(table, record, 2)
    if (name === undefined) throw new GameFormatError('loola: a place has no name', record.offset)
    return {
      number: int(record, 0),
      unknown_1: int(record, 1),
      name,
      revivalMap: int(record, 3),
      map: int(record, 4),
      facing: float(record, 5),
      x: float(record, 6),
      y: float(record, 7),
      z: float(record, 8),
      ship: {
        map: int(record, 9),
        unknown_10: int(record, 10),
        x: float(record, 11),
        z: float(record, 12),
      },
    }
  })
}

/**
 * **The places offered** (`func_020a8304`, `func_020a8458`): those whose flag
 * is set, the lowest number first — the game places the unplaced entry with
 * the lowest number whose flag is set, again and again.
 */
export function placesOffered(
  places: readonly ZoomPlace[],
  reached: (flag: number) => boolean,
): ZoomPlace[] {
  return places
    .filter((place) => reached(PLACE_FLAG + place.number))
    .sort((a, b) => a.number - b.number)
}

/**
 * The place a revival map is a town's (`func_020a83fc`): the entry whose
 * {@link ZoomPlace.revivalMap} is the map — save that **5801, Slurry Quay's
 * inn, and 4506, the Observatory, both look up 1800**, Dourbridge
 * (`0x020a844c`–`0x020a8454`).
 */
export function placeOfRevivalMap(
  places: readonly ZoomPlace[],
  map: number,
): ZoomPlace | undefined {
  const sought = map === 5801 || map === 4506 ? 1800 : map
  return places.find((place) => place.revivalMap === sought)
}

/**
 * **The maps that mark a place reached** — overlay 17's table
 * (`data_ov017_021d6638` in the US build), read by `func_ov017_0219e290` as a
 * map is loaded: entering the n-th map sets flag {@link PLACE_FLAG} `+ n`.
 *
 * Found by shape, as the other code tables are: a run of halfwords, as many
 * as the places, where **the n-th is either the town of the n-th place's
 * revival map or that place's own Zoom map** — true of all 18 on the
 * cartridge, the Abbey's being Newid Isle, its Zoom map. `townOf` gives the
 * map a revival map stands in: the one whose code is its first three letters,
 * `M01` for `M01M06`. Throws when no run, or more than one, has the shape.
 */
export function readPlaceMaps(
  overlay: Uint8Array,
  places: readonly ZoomPlace[],
  townOf: (map: number) => number | undefined,
): number[] {
  const sorted = [...places].sort((a, b) => a.number - b.number)
  if (sorted.length === 0) throw new GameFormatError('place maps: there are no places to look for')
  const wanted = sorted.map((place) => {
    const town = townOf(place.revivalMap)
    return town === undefined ? [place.map] : [town, place.map]
  })
  const view = new DataView(overlay.buffer, overlay.byteOffset, overlay.byteLength)
  const span = 2 * sorted.length
  const found: number[] = []
  for (let at = 0; at + span <= overlay.length; at += 2) {
    let all = true
    for (let n = 0; n < sorted.length && all; n++) {
      all = (wanted[n] as number[]).includes(view.getUint16(at + 2 * n, true))
    }
    if (all) found.push(at)
  }
  if (found.length !== 1) {
    throw new GameFormatError(
      `place maps: ${found.length} runs of ${sorted.length} halfwords have the shape, not one`,
    )
  }
  const at = found[0] as number
  return sorted.map((_, n) => view.getUint16(at + 2 * n, true))
}

/** The flag entering a map sets, if it marks a place reached — see {@link readPlaceMaps}. */
export function placeFlagOf(placeMaps: readonly number[], map: number): number | undefined {
  // The last match wins (`0x0219e2b8`: `moveq r4, r3` over the whole table).
  const n = placeMaps.lastIndexOf(map)
  return n < 0 ? undefined : PLACE_FLAG + n
}

/** Riremito's opcode for a record (`func_ov017_021ab6b0`, through `data_ov017_021d78a4`). */
const OP_EVAC = 0x66
/** A destination's values: its map, facing, x, y, z. */
const DESTINATION_VALUES = 5

/** Where Evac can take the party: a map, the facing there, and where. */
export interface EvacDestination {
  readonly map: number
  readonly facing: number
  readonly x: number
  readonly y: number
  readonly z: number
}

/** One of Evac's records — `data/map/riremito.bin`. */
export interface EvacRecord {
  /** The area it holds in — a map's `maplist9.bin` value 1. */
  readonly area: number
  /** The one map it holds in, or 0 for any of the area's. */
  readonly map: number
  readonly destinations: readonly EvacDestination[]
}

/** Read **`data/map/riremito.bin`**, Evac's table, in the file's order. */
export function readEvacTable(bytes: Uint8Array): EvacRecord[] {
  const table = readDataTable(bytes)
  return table.withTag(OP_EVAC).map((record) => {
    if (record.values.length < 2) {
      throw new GameFormatError('riremito: a record has no area and map', record.offset)
    }
    const destinations: EvacDestination[] = []
    // As the game counts them: (values − 2) ÷ 5, the rest dropped (`0x021ab744`).
    const count = Math.trunc((record.values.length - 2) / DESTINATION_VALUES)
    for (let d = 0; d < count; d++) {
      const at = 2 + d * DESTINATION_VALUES
      destinations.push({
        map: int(record, at) & 0xffff,
        facing: float(record, at + 1),
        x: float(record, at + 2),
        y: float(record, at + 3),
        z: float(record, at + 4),
      })
    }
    return { area: int(record, 0) & 0xffff, map: int(record, 1) & 0xffff, destinations }
  })
}

/** Where Evac is cast from: the map, its area, and the last field the Hero stood in. */
export interface EvacFrom {
  readonly map: number
  /** The map's area, `maplist9.bin` value 1 — the map record's `+0x02`, 15 bits. */
  readonly area: number
  /** The protagonist's `+0x566`: the last map entered whose kind is 0, a field; 0 for none. */
  readonly lastField: number
}

/**
 * **Where Evac takes the party** (`func_ov017_021ab6b0`, each record in the
 * file's order), or undefined when it goes nowhere — "But nothing happens."
 * A record holds when its area is the map's, it names this map or none, and
 * the area was not already taken by a record naming a map. It takes the first
 * of its destinations on the last field, or else its last; one with none
 * clears the answer when it names this map.
 */
export function evacDestination(
  records: readonly EvacRecord[],
  from: EvacFrom,
): EvacDestination | undefined {
  let area = 0
  let map = 0
  let to: EvacDestination | undefined
  for (const record of records) {
    if (record.area !== (from.area & 0x7fff)) continue
    if (record.area === area && map !== 0) continue
    if (record.map !== 0 && record.map !== from.map) continue
    if (record.destinations.length === 0) {
      if (record.map === from.map) to = undefined
      continue
    }
    const chosen =
      record.destinations.find((d) => d.map === from.lastField) ??
      (record.destinations[record.destinations.length - 1] as EvacDestination)
    area = record.area
    map = record.map
    to = chosen.map === 0 ? undefined : chosen
  }
  return to
}

/** `chur_messet`'s opcode for a church (`func_0207267c`, through `data_020f0cc8`). */
const OP_CHURCH = 0x67
/** Three spans of the story, four strings each. */
const SPANS = 3

/** One span of a revival church's words: the story majors it holds over, and the voice by day and by night. */
export interface RevivalSpan {
  /** Its lowest and highest story major; both 0 holds always. */
  readonly from: number
  readonly to: number
  /**
   * The voice, by `atoi` — **1 where the string is empty** (`strcmp` against
   * `""` first, `0x0219c4b0`), and 0 where it says 0, which the church takes as
   * 1 (`0x021baaa8`, `movlt r0, #0`).
   */
  readonly day: number
  readonly night: number
}

/** **`data/scenario/chur_messet.bin`**: each revival map's spans, by the map's id. */
export type RevivalWords = ReadonlyMap<number, readonly RevivalSpan[]>

/** `atoi` as the game uses it here (`func_02005a94`, `strtol` base 10): 0 for an empty or wordless string. */
function atoi(s: string | undefined): number {
  const n = Number.parseInt(s ?? '', 10)
  return Number.isNaN(n) ? 0 : n
}

/** A voice's string as the game reads it: 1 when empty, else `atoi`. */
function voiceOf(s: string | undefined): number {
  return s === undefined || s === '' ? 1 : atoi(s)
}

/** Read **`data/scenario/chur_messet.bin`**. */
export function readRevivalWords(bytes: Uint8Array): RevivalWords {
  const table = readDataTable(bytes)
  const out = new Map<number, RevivalSpan[]>()
  for (const record of table.withTag(OP_CHURCH)) {
    if (record.kinds[0] !== INT || record.values.length < 1 + 4 * SPANS) {
      throw new GameFormatError(
        'chur_messet: a record is not a map and twelve strings',
        record.offset,
      )
    }
    const field = (i: number) => text(table, record, 1 + i)
    const spans: RevivalSpan[] = []
    for (let s = 0; s < SPANS; s++) {
      spans.push({
        from: atoi(field(4 * s)),
        to: atoi(field(4 * s + 1)),
        day: voiceOf(field(4 * s + 2)),
        night: voiceOf(field(4 * s + 3)),
      })
    }
    out.set(int(record, 0), spans)
  }
  return out
}

/** The voice that says nothing (`0x0219c4d0`: `cmp r4, #3`). */
export const REVIVAL_SILENT = 3

/** The church's words a voice speaks in: `str_ch<k>`, k = voice − 1, never below 0 (`0x021baa98`–`0x021baaa8`). */
export function revivalWordsFile(voice: number): number {
  return Math.max(0, voice - 1)
}

/**
 * **Which voice greets a party that wakes in a church** (`func_ov017_0219bfb4`,
 * `0x0219c308`–`0x0219c4f4`): the first span holding the story's major — both
 * bounds 0, or the major between them — gives its day or night value; with
 * none, or the map not listed, 1. **3 says nothing**; any other is the
 * church's voice, `str_ch<voice − 1>`.
 */
export function revivalVoice(
  words: RevivalWords,
  map: number,
  major: number,
  night: boolean,
): number {
  for (const span of words.get(map) ?? []) {
    const holds = (span.from === 0 && span.to === 0) || (major >= span.from && major <= span.to)
    if (holds) return night ? span.night : span.day
  }
  return 1
}
