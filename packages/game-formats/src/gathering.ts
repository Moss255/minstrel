import { GameFormatError } from './errors.ts'
import { readDataTable, type TableRecord } from './table.ts'

/**
 * **Gathering spots**: where ingredients lie on a field and come back —
 * `data/scenario/flditem.pac`'s `F<nn>flditem.bin` and `fldbias.bin`, and
 * Stornway's Guardian Fountain's `data/bin/izmitm.bin`. Three of the game's
 * `Script` command files (see `table.ts`). Read 6 October 2026 from the
 * decomp's US build (`func_0208e520` loads them, `func_0208e0c4`,
 * `func_0208e2c0`, `func_0208e35c` and `func_0208e444` read them); the whole
 * reading, with addresses, is `docs/readings/T13-gathering.md`, and the
 * files' layouts are in FORMAT.md, "Gathering spots".
 */

const INT = 1
const FLOAT = 2

/** `F<nn>flditem.bin`'s opcode for a spot (`func_0208e0c4`, through `data_020f1290`). */
const OP_SPOT = 0x66
/** `fldbias.bin`'s opcode for a row (`func_0208e2c0`). */
const OP_BIAS = 0x67
/** `izmitm.bin`'s opcodes: a Fountain spot (`func_0208e35c`) and a variant's items (`func_0208e444`). */
const OP_FOUNTAIN_SPOT = 0x66
const OP_FOUNTAIN_ITEMS = 0x68

/** Every spot lists eight places (`func_0208e0c4`, `0x0208e258`–`0x0208e280`). */
export const SPOT_PLACES = 8
/** A Fountain spot lists seven (`func_0208e35c`, `0x0208e408`). */
export const FOUNTAIN_PLACES = 7
/** The Fountain's two spots' ids. */
export const FOUNTAIN_SPOTS: readonly number[] = [98, 99]
/** Value 4 when the spot's minutes, fewest and most are its own rather than `fldbias.bin`'s. */
export const OWN_TIMING = 8
/** A `fldbias.bin` row's eight variants, one of which a game uses. */
export const VARIANTS = 8
/** Items in a Fountain variant's row. */
const FOUNTAIN_ITEMS = 16

/** A place in the files' own units. */
export interface SpotPlace {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** How often a spot refills, and with how many. */
export interface SpotTiming {
  /** Minutes between refills. */
  readonly minutes: number
  /** The fewest items an empty spot refills with. */
  readonly fewest: number
  /** The most it holds. */
  readonly most: number
}

/** One gathering spot — a `0x66` record of `F<nn>flditem.bin`. */
export interface GatheringSpot {
  /** Value 0: its id, 0–97, game-wide — the spot's word in the save is `GameState+0x5cdc + 4·id`. */
  readonly id: number
  /** Value 1: the item it gives. */
  readonly item: number
  /** Value 2: when it is there — 1 always, 2 once flag `0x798` is set, 3 once `0x796` is (`0x0208ed80`). */
  readonly when: number
  /** Value 3: nothing found reads it; 1 on every spot on the cartridge. */
  readonly unknown_3: number
  /** Value 4: {@link OWN_TIMING} for its own timing, 0–7 for `fldbias.bin`'s row of that number. */
  readonly timing: number
  /** Values 5–7, the spot's own timing; meaningful only where {@link timing} is {@link OWN_TIMING}. */
  readonly own: SpotTiming
  /** Values 8–31: eight places, the unused ones at the origin. */
  readonly places: readonly SpotPlace[]
}

/** A value as `Script::Parameter::ToInt` reads it: a float truncated. */
function int(record: TableRecord, i: number): number {
  if (record.kinds[i] === FLOAT) return Math.trunc(record.floats[i] as number)
  if (record.kinds[i] === INT) return (record.values[i] as number) | 0
  return 0
}

/** A value as `ToFloat` reads it: an integer made a float. */
function float(record: TableRecord, i: number): number {
  if (record.kinds[i] === FLOAT) return record.floats[i] as number
  if (record.kinds[i] === INT) return (record.values[i] as number) | 0
  return 0
}

function placesOf(record: TableRecord, from: number, count: number): SpotPlace[] {
  const places: SpotPlace[] = []
  for (let p = 0; p < count; p++) {
    const at = from + p * 3
    places.push({ x: float(record, at), y: float(record, at + 1), z: float(record, at + 2) })
  }
  return places
}

function needs(record: TableRecord, count: number, what: string): void {
  if (record.values.length < count) {
    throw new GameFormatError(
      `${what} has ${record.values.length} values, not ${count}`,
      record.offset,
    )
  }
}

/**
 * Read a field's **`F<nn>flditem.bin`**: its spots, in the file's order.
 * Throws on a spot record shorter than its 32 values.
 */
export function readGatheringSpots(bytes: Uint8Array): GatheringSpot[] {
  const table = readDataTable(bytes)
  return table.withTag(OP_SPOT).map((record) => {
    needs(record, 8 + SPOT_PLACES * 3, 'a gathering spot')
    return {
      // Seven bits of the spot's word keep it (`0x0208e0f4`).
      id: int(record, 0) & 0x7f,
      item: int(record, 1) & 0xffff,
      when: int(record, 2) & 3,
      unknown_3: int(record, 3),
      timing: int(record, 4) & 0xf,
      own: { minutes: int(record, 5), fewest: int(record, 6), most: int(record, 7) },
      places: placesOf(record, 8, SPOT_PLACES),
    }
  })
}

/**
 * Read **`fldbias.bin`**: for each timing number 0–7, the eight variants'
 * timings — a game uses the one of its variant, `GameState+0x5cda`
 * (`func_0208e2c0`). Throws on a row shorter than its 25 values.
 */
export function readGatheringBias(bytes: Uint8Array): Map<number, SpotTiming[]> {
  const table = readDataTable(bytes)
  const rows = new Map<number, SpotTiming[]>()
  for (const record of table.withTag(OP_BIAS)) {
    needs(record, 1 + VARIANTS * 3, 'a fldbias row')
    const timings: SpotTiming[] = []
    for (let v = 0; v < VARIANTS; v++) {
      const at = 1 + v * 3
      timings.push({
        minutes: int(record, at) & 0xffff,
        fewest: int(record, at + 1) & 0xff,
        most: int(record, at + 2) & 0xff,
      })
    }
    rows.set(int(record, 0) & 0xff, timings)
  }
  return rows
}

/** Stornway's Guardian Fountain — `izmitm.bin`. */
export interface Fountain {
  /** Its two spots, 98 and 99, seven places each. */
  readonly spots: readonly { readonly id: number; readonly places: readonly SpotPlace[] }[]
  /** Each variant's 16 items, the first eight given before story 19 (`func_0208e7d0`). */
  readonly items: ReadonlyMap<number, readonly number[]>
}

/** Read **`izmitm.bin`**, the Fountain's spots and items. Throws on a short record. */
export function readFountain(bytes: Uint8Array): Fountain {
  const table = readDataTable(bytes)
  const spots = table.withTag(OP_FOUNTAIN_SPOT).map((record) => {
    needs(record, 1 + FOUNTAIN_PLACES * 3, 'a Fountain spot')
    return { id: int(record, 0), places: placesOf(record, 1, FOUNTAIN_PLACES) }
  })
  const items = new Map<number, number[]>()
  for (const record of table.withTag(OP_FOUNTAIN_ITEMS)) {
    needs(record, 1 + FOUNTAIN_ITEMS, "a Fountain variant's items")
    const row: number[] = []
    for (let i = 0; i < FOUNTAIN_ITEMS; i++) row.push(int(record, 1 + i) & 0xffff)
    items.set(int(record, 0) & 0xff, row)
  }
  return { spots, items }
}

/** The member of `flditem.pac` a field's spots are in: `F%02dflditem.bin` (`data_020f1356`). */
export function gatheringFile(field: number): string {
  return `F${String(field).padStart(2, '0')}flditem.bin`
}

/** The map the Fountain's spots are on (`data_020f12b8`, matched on six letters). */
export const FOUNTAIN_MAP = 'R01M07'
