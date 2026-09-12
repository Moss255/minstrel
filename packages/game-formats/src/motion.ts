import { GameFormatError } from './errors.ts'
import { readDataTable, type TableRecord } from './table.ts'

/**
 * A motion table: the `.bcfg` beside a model, naming stretches of its animation.
 *
 * A tagged data table (see `table.ts`) whose `0x66` records are the motions: a
 * name, the first and the last frame, and a speed. A cabinet's reads `open` 0
 * to 25, `closed` 0 to 0, `opend` (sic) 25 to 25 and `close` 0 to 25, each at
 * speed 1. **2,844 of the cartridge's 2,854 `.bcfg` files carry them** — the
 * characters', the effects', the events' and the maps' pieces alike. Evidence
 * in `FORMAT.md`, "Motion tables".
 *
 * Every other record is carried through as the table gave it: `0x64` holds the
 * motion count on the cabinets, and the rest are not established.
 */

/** The record that names a motion. */
export const MOTION_TAG = 0x66

export interface Motion {
  readonly name: string
  /** The first frame of the model's animation it plays. */
  readonly start: number
  /** The last, which is `start` for a motion that holds a pose. */
  readonly end: number
  /** Frames of animation per frame played, as stored. */
  readonly speed: number
}

export interface MotionTable {
  readonly motions: readonly Motion[]
  /** Every other record, as the table gave it. */
  readonly others: readonly TableRecord[]
}

/** Parse a `.bcfg` motion table. */
export function readMotionTable(bytes: Uint8Array): MotionTable {
  const table = readDataTable(bytes)
  const motions: Motion[] = []
  const others: TableRecord[] = []
  for (const record of table.records) {
    const numeric = [1, 2, 3].every((i) => record.kinds[i] === 1 || record.kinds[i] === 2)
    if (
      record.tag !== MOTION_TAG ||
      record.values.length !== 4 ||
      record.kinds[0] !== 0 ||
      !numeric
    ) {
      others.push(record)
      continue
    }
    const name = table.stringAt(record.values[0] as number)
    if (name === undefined) {
      throw new GameFormatError(
        `motion at 0x${record.offset.toString(16)} names no string in the table`,
        record.offset,
      )
    }
    // A whole number may be stored as an integer, as in the treasure tables.
    const number = (i: number) =>
      record.kinds[i] === 2 ? (record.floats[i] as number) : (record.values[i] as number) | 0
    motions.push({ name, start: number(1), end: number(2), speed: number(3) })
  }
  return { motions, others }
}
