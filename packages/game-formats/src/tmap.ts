import { GameFormatError } from './errors.ts'

/**
 * **The treasure maps' tables** — `data/tmap/tdata.gp2` › `tdata_<LG>.pac`,
 * one for each language. Read 11 October 2026 from the decomp's
 * `DetailedTreasureMapData.cpp` and `TreasureMapDataStructs.cpp` (complete):
 * a count, 17, and that many byte offsets into the file, which the game keeps
 * as `TreasureMapLanguageDataOffsets`; every table it reads from there is
 * read byte by byte, little-endian, from the offset on.
 *
 * This reader gives the file and its offsets; what each table holds is read
 * where it is used (`packages/sim/src/grotto/map.ts`), as the game reads it.
 */

/** The offsets' order, as the decomp names them. */
export const TMAP_TABLES = [
  'bossRangesByQuality',
  'bossIDsAndWeights',
  'environs',
  'prefixRangesByMonsterRank',
  'prefixNames',
  'floorRangesByQuality',
  'unknown_18',
  'startingMonsterRanksByQuality',
  'mapLocations',
  'chestRanksByMonsterRank',
  'localeRankRangesByFloorCount',
  'localeNames',
  'suffixRangesByBoss',
  'suffixNames',
  'grottoBossDrops',
  'legacyBossDrops',
  'legacyBossData',
] as const

export type TmapTable = (typeof TMAP_TABLES)[number]

/** A `tdata_<LG>.pac`: its bytes, and where each table starts. */
export interface TreasureMapTables {
  readonly bytes: Uint8Array
  readonly offsets: Readonly<Record<TmapTable, number>>
}

/** Read a `tdata_<LG>.pac`'s offsets. Throws on a count that is not 17 or an offset outside the file. */
export function readTreasureMapTables(bytes: Uint8Array): TreasureMapTables {
  if (bytes.length < 4 + 4 * TMAP_TABLES.length) {
    throw new GameFormatError(`tdata: ${bytes.length} bytes is too short for its offsets`, 0)
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint32(0, true)
  if (count !== TMAP_TABLES.length) {
    throw new GameFormatError(`tdata: ${count} offsets, not ${TMAP_TABLES.length}`, 0)
  }
  const offsets = {} as Record<TmapTable, number>
  TMAP_TABLES.forEach((name, i) => {
    const at = view.getUint32(4 + 4 * i, true)
    if (at >= bytes.length) {
      throw new GameFormatError(
        `tdata: ${name} at ${at}, past the file's ${bytes.length} bytes`,
        4 + 4 * i,
      )
    }
    offsets[name] = at
  })
  return { bytes, offsets }
}
