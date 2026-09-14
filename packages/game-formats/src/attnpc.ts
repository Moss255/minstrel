import { GameFormatError } from './errors.ts'
import { readDataTable } from './table.ts'

/**
 * `/data/bin/attnpc.gp2/attnpc_<lang>.bin` — the characters who go along with
 * the Hero for a stretch of the story: in English Aquila, Ivor, Dr Phlegming,
 * Sterling and Erinn.
 *
 * A tagged data table (FORMAT.md, "The tagged data table") of five `0x64`
 * records of 19 values, value 2 a string and the rest integers; the values are
 * the same in every language but the name's offset. See FORMAT.md, "Attending
 * characters", for what each value is and how sure the reading is.
 */

export const ATTENDING_TAG = 0x64
const ATTENDING_VALUES = 19
/** A value's kind when it is a string offset — see `TableRecord.kinds`. */
const STRING_KIND = 0

/**
 * A character's numbers — INFERRED to be in the level tables' column order
 * (FORMAT.md, "Level tables" and "Attending characters"): on the two who cast
 * nothing both magic values are 0 and the largest value is where maximum HP
 * is. Aquila's agility reads 0, which fits nothing, so the order is not
 * settled.
 */
export interface AttendingNumbers {
  readonly strength: number
  readonly resilience: number
  readonly agility: number
  readonly deftness: number
  readonly charm: number
  readonly magicalMight: number
  readonly magicalMending: number
  readonly maxHp: number
  readonly maxMp: number
}

export interface AttendingCharacter {
  /** Its number, 1 to 5. */
  readonly id: number
  /**
   * Its model, `/data/chara_sub/s<nnn>.chr`: Ivor's 17 is the `s017.chr` the
   * event introducing him loads, Erinn's 16 the `s016.chr` of her morning.
   * INFERRED for the other three.
   */
  readonly model: number
  readonly name: string
  readonly unknown_3: number
  /** −1 on the two who neither fight nor have numbers. */
  readonly unknown_4: number
  /** A level — INFERRED: Aquila 20, Ivor 3, the rest 1. */
  readonly level: number
  readonly unknown_6: number
  readonly numbers: AttendingNumbers
  readonly unknown_16: number
  /** A weapon's item id, or `undefined` for none. */
  readonly weapon: number | undefined
  /** A shield's item id, or `undefined` for none. */
  readonly shield: number | undefined
}

/** Parse an attending-character table. */
export function readAttendingCharacters(bytes: Uint8Array): AttendingCharacter[] {
  const table = readDataTable(bytes)
  return table.withTag(ATTENDING_TAG).map((record) => {
    if (record.values.length !== ATTENDING_VALUES || record.kinds[2] !== STRING_KIND) {
      throw new GameFormatError(
        `attending character at 0x${record.offset.toString(16)} is not ${ATTENDING_VALUES} values with a name at 2`,
        record.offset,
      )
    }
    // Stored as words; −1 is 0xFFFFFFFF.
    const v = [...record.values].map((value) => value | 0)
    const at = (i: number) => v[i] as number
    const name = table.stringAt(at(2))
    if (name === undefined) {
      throw new GameFormatError(
        `attending character at 0x${record.offset.toString(16)} names no string at ${at(2)}`,
        record.offset,
      )
    }
    const item = (i: number) => (at(i) > 0 ? at(i) : undefined)
    return {
      id: at(0),
      model: at(1),
      name,
      unknown_3: at(3),
      unknown_4: at(4),
      level: at(5),
      unknown_6: at(6),
      numbers: {
        strength: at(7),
        resilience: at(8),
        agility: at(9),
        deftness: at(10),
        charm: at(11),
        magicalMight: at(12),
        magicalMending: at(13),
        maxHp: at(14),
        maxMp: at(15),
      },
      unknown_16: at(16),
      weapon: item(17),
      shield: item(18),
    }
  })
}
