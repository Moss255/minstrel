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
 * | 1 | the monster's level — INFERRED, see below |
 * | 2 | how far the party's level must pass it for the monster to run — INFERRED, see below |
 * | 3 | a packed word, not established |
 * | 4 | a float: 0.40 on the slimes, 0.70 the drackies, 0.90 the funghouls, 1.20 the meowgician — INFERRED, a speed |
 * | 5, 6 | attack and defence — equal to the battle data's (see FORMAT.md, "Encounters") |
 *
 * **Values 1 and 2, a level and a margin — INFERRED.** Leaving out the 149
 * monsters whose value 2 is 0 — every one of them a boss (`MonsterBattle.bossAi`)
 * — value 1 rises with the monster's strength: its rank agrees with maximum HP's
 * at 0.84 and experience's at 0.88 over the other 280 with a value above 0.
 * Slime 1, teeny sanguini 2, dracky 3, bodkin archer 4, spirit 5, skeleton 12.
 * Value 2 is −99 on the metal family, whose value 1 is −99 too, and 99 on 185
 * monsters — 24 of them with Flee among their six ways; 5 to 22 on most of the
 * rest. Read as: a monster runs only from a party whose level has reached value
 * 1 plus value 2 — at once for the metal family, never at 99. How the game
 * applies it is not read; the sim takes a drawn Flee as an attack below it.
 *
 * See FORMAT.md, "Field monsters".
 */

const MONSTER_TAG = 0x65

export interface FieldMonster {
  readonly number: number
  /** INFERRED: its level — see above. */
  readonly level: number
  /** INFERRED: how far past its level the party's must be before it runs — see above. */
  readonly runsFromMargin: number
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
      level: v(1),
      runsFromMargin: v(2),
      unknown_3: (record.values[3] as number) >>> 0,
      speed: record.floats[4] as number,
      attack: v(5),
      defence: v(6),
    })
  }
  return out
}
