import { GameFormatError } from './errors.ts'
import { KIND_NUMBER } from './events.ts'
import { readDataTable } from './table.ts'

/**
 * `trigger<area>.bin` — what applies where, over which span of the story.
 *
 * One file per area under `/data/scenario`, 75 on the reference cartridge: a
 * tagged data table whose 5,805 records are all tag 1. The evidence is in
 * `FORMAT.md`.
 *
 * | value | meaning |
 * |---|---|
 * | 0 | the map, by its own id — an id `maplist9.bin` carries, on 5,805 of 5,805 |
 * | 1–4 | a span of the story, from (1).(2) to (3).(4), 99 for "to the end" — in the form the cast's records use, and never backwards, on 5,805 of 5,805 |
 * | 5 | not established — 0, 1, 11, 17, 3, 20 and more |
 * | 6 on | not established: words, and on 1,266 records floats among them |
 *
 * This reads the first six and carries the rest as the table gives them.
 */

const TAG_TRIGGER = 1
/** The values every record carries before its words: map, span and value 5. */
const HEAD = 6

/** A point in the story, as a trigger's span gives it. */
export interface TriggerStage {
  readonly major: number
  readonly minor: number
}

export interface Trigger {
  /** The map the record applies in, by the map's own id. */
  readonly map: number
  /** Where its span of the story starts and ends. INFERRED — see `FORMAT.md`. */
  readonly from: TriggerStage
  readonly to: TriggerStage
  readonly unknown_5: number
  /** Everything after value 5, as the table gives it: raw words, the same read as floats, and each one's type bits. */
  readonly values: Uint32Array
  readonly floats: Float32Array
  readonly kinds: Uint8Array
  /** Byte offset of the record, for anything that wants the rest of it. */
  readonly offset: number
}

/** Read an area's triggers. An empty file has none. */
export function readTriggers(data: Uint8Array): Trigger[] {
  if (data.length === 0) return []
  const table = readDataTable(data)
  return table.records.map((record) => {
    const count = record.values.length
    if (
      record.tag !== TAG_TRIGGER ||
      count < HEAD ||
      Array.from(record.kinds.subarray(0, HEAD)).some((k) => k !== KIND_NUMBER)
    ) {
      throw new GameFormatError(
        `trigger record at 0x${record.offset.toString(16)} is tag 0x${record.tag.toString(16)} with ${count} values, not a map, a span and a word`,
        record.offset,
      )
    }
    const v = record.values
    return {
      map: v[0] as number,
      from: { major: v[1] as number, minor: v[2] as number },
      to: { major: v[3] as number, minor: v[4] as number },
      unknown_5: v[5] as number,
      values: v.subarray(HEAD),
      floats: record.floats.subarray(HEAD),
      kinds: record.kinds.subarray(HEAD, count),
      offset: record.offset,
    }
  })
}
