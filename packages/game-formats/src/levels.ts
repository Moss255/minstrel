import { GameFormatError } from './errors.ts'
import { readDataTable, type TableRecord } from './table.ts'

/**
 * `/data/prm/level<n>.bin` — a vocation's numbers at each level.
 *
 * Thirteen files, `level0` to `level12`, each a tagged data table (see "Tagged
 * data tables" in FORMAT.md) of 102 records: one `0x65`, one `0x64`, 99 `0x66`
 * — a level each — and one `0x67`. A level's record is eleven integers.
 *
 * What the columns are — see FORMAT.md, "Level tables". **Columns 1 to 10 are
 * confirmed** against a published strategy guide: its Minstrel attribute table
 * agrees with `level6` at all 72 of the values it gives, and its table of skill
 * points by level with column 10 on all twelve vocations' files at every level.
 * Column 0 is still INFERRED.
 *
 * | column | meaning |
 * |---|---|
 * | 0 | the experience the level is reached at: 0 at level 1, rising to millions — INFERRED |
 * | 1 | strength |
 * | 2 | resilience |
 * | 3 | agility |
 * | 4 | deftness |
 * | 5 | charm |
 * | 6 | magical might |
 * | 7 | magical mending |
 * | 8 | maximum HP |
 * | 9 | maximum MP |
 * | 10 | the skill points gained by this level, all told: 200 at 99 |
 *
 * The `0x64`, `0x65` and `0x67` records are carried as they are.
 */

/** A level's record. */
export const LEVEL_TAG = 0x66
/** The integers in a level's record. */
const LEVEL_VALUES = 11

/** One level of a vocation — see the module's table; the experience is INFERRED. */
export interface LevelRow {
  /** 1 for the first record, and on by one: the records are in order of experience. */
  readonly level: number
  readonly exp: number
  readonly strength: number
  readonly resilience: number
  readonly agility: number
  readonly deftness: number
  readonly charm: number
  readonly magicalMight: number
  readonly magicalMending: number
  readonly maxHp: number
  readonly maxMp: number
  /**
   * Column 10: the skill points gained by this level, all told — 0 at level 1,
   * 12 at 10 and 200 at 99 on the twelve vocations' files; 350 on `level0`.
   */
  readonly skillPoints: number
}

export interface LevelTable {
  /** The levels, first to last. */
  readonly levels: readonly LevelRow[]
  /** The records that are not a level — `0x64`, `0x65`, `0x67` — not established. */
  readonly unknown: readonly TableRecord[]
}

/** Parse a vocation's level table. */
export function readLevelTable(bytes: Uint8Array): LevelTable {
  const table = readDataTable(bytes)
  const levels: LevelRow[] = []
  const unknown: TableRecord[] = []
  for (const record of table.records) {
    if (record.tag !== LEVEL_TAG) {
      unknown.push(record)
      continue
    }
    if (record.values.length !== LEVEL_VALUES || record.kinds.some((kind) => kind !== 1)) {
      throw new GameFormatError(
        `level record at 0x${record.offset.toString(16)} is not ${LEVEL_VALUES} integers`,
        record.offset,
      )
    }
    const v = (i: number) => record.values[i] as number
    const exp = v(0)
    const before = levels.at(-1)
    if (before && exp < before.exp) {
      throw new GameFormatError(
        `level ${levels.length + 1} is reached at ${exp} experience, before level ${levels.length} at ${before.exp}`,
        record.offset,
      )
    }
    levels.push({
      level: levels.length + 1,
      exp,
      strength: v(1),
      resilience: v(2),
      agility: v(3),
      deftness: v(4),
      charm: v(5),
      magicalMight: v(6),
      magicalMending: v(7),
      maxHp: v(8),
      maxMp: v(9),
      skillPoints: v(10),
    })
  }
  if (levels.length === 0) throw new GameFormatError('level table has no levels')
  return { levels, unknown }
}

/** The level reached with this much experience: the last whose threshold it meets. */
export function levelAt(table: LevelTable, exp: number): LevelRow {
  let reached = table.levels[0] as LevelRow
  for (const row of table.levels) {
    if (row.exp > exp) break
    reached = row
  }
  return reached
}
