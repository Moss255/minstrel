import { GameFormatError } from './errors.ts'
import { readDataTable } from './table.ts'

/**
 * **Where things may stand on a grotto's tiles** — `data/map/Z0nM01.ambl` ›
 * `Z0nM0100.bpos`, one for each of the five environments. Read 11 October 2026
 * from the game's code: the floor's tiles are each given their kind's record
 * by its name (`func_0201e434`, a `strstr` of the name over 16-byte records),
 * turned with the tile (`func_02019f6c`), and an object put on a tile — a
 * chest, the stairs — takes one of the record's nine places and one of the
 * ways it may face there (`GenerateGrottoObjectPositionOrientation`,
 * `ChooseTileFeaturePosition`, `ChooseTileFeatureOrientation` in the decomp,
 * all complete). The floor's generator does not read it.
 *
 * An ordinary tagged data table: a `0x7d` record holding 18, then 18 `0x7e`
 * records of eleven values each — a number, the kind's name, and nine masks.
 */

/** The tag of a tile kind's record. */
const OP_TILE = 0x7e
/** The value kinds a record's values are read by: a string's is 0. */
const STRING = 0
/** Values in a tile kind's record. */
const TILE_VALUES = 11

/** One tile kind's record. */
export interface TilePlacement {
  /**
   * Value 0: a number from 0 to 17, each once — and in another order in each
   * environment's file. The game copies it beside the masks (the record's
   * first two bytes) and nothing read uses it.
   */
  readonly unknown_0: number
  /** The kind, as the floor names its tiles: `R04A` open on all sides, `E01A` a dead end, and so on. */
  readonly name: string
  /**
   * Values 2 to 10: for each of the tile's nine places, its rows north to
   * south and each west to east, the ways something there may face — bit 0
   * up, 1 right, 2 down, 3 left. 0 where nothing may stand.
   */
  readonly directions: readonly number[]
}

/**
 * Read a `.bpos`: every tile kind, in the file's order. Throws on a record of
 * the wrong length or with no name.
 */
export function readTilePlacements(bytes: Uint8Array): TilePlacement[] {
  const table = readDataTable(bytes)
  return table.withTag(OP_TILE).map((record) => {
    if (record.values.length < TILE_VALUES) {
      throw new GameFormatError(
        `bpos: a tile kind has ${record.values.length} values, not ${TILE_VALUES}`,
        record.offset,
      )
    }
    const name = record.kinds[1] === STRING ? table.stringAt(record.values[1] as number) : undefined
    if (name === undefined)
      throw new GameFormatError('bpos: a tile kind has no name', record.offset)
    return {
      unknown_0: (record.values[0] as number) | 0,
      name,
      directions: [...record.values.subarray(2, TILE_VALUES)].map((v) => v & 0xff),
    }
  })
}
