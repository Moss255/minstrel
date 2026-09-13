import { GameFormatError } from './errors.ts'
import { readDataTable } from './table.ts'

/**
 * How each monster behaves on the field: `/data/prm/fld_mondata.bin`, a tagged
 * data table with a `0x64` record holding 438 — the monster count — and a
 * `0x65` record for each monster, seven values:
 *
 * | value | reading |
 * |---|---|
 * | 0 | the monster's number |
 * | 1, 2 | not established: 1 and 5 on the slime, −99 and −99 on the metal slime, 99 on many |
 * | 3 | a packed word, not established |
 * | 4 | a float: 0.40 on the slimes, 0.70 the drackies, 0.90 the funghouls, 1.20 the meowgician — INFERRED, a speed |
 * | 5, 6 | attack and defence — equal to the battle data's (see FORMAT.md, "Encounters") |
 *
 * See FORMAT.md, "Field monsters".
 */

const MONSTER_TAG = 0x65

export interface FieldMonster {
  readonly number: number
  readonly unknown_1: number
  readonly unknown_2: number
  readonly unknown_3: number
  /** INFERRED: how fast it moves on the field. */
  readonly speed: number
  readonly attack: number
  readonly defence: number
}

/** Parse the field monster table, by monster number. */
export function readFieldMonsters(bytes: Uint8Array): Map<number, FieldMonster> {
  const out = new Map<number, FieldMonster>()
  for (const record of readDataTable(bytes).withTag(MONSTER_TAG)) {
    if (record.values.length !== 7 || record.kinds[4] !== 2) {
      throw new GameFormatError(
        `field monster record at 0x${record.offset.toString(16)} is not seven values with a float fifth`,
        record.offset,
      )
    }
    const v = (i: number) => (record.values[i] as number) | 0
    out.set(v(0), {
      number: v(0),
      unknown_1: v(1),
      unknown_2: v(2),
      unknown_3: (record.values[3] as number) >>> 0,
      speed: record.floats[4] as number,
      attack: v(5),
      defence: v(6),
    })
  }
  return out
}
