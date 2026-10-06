import { GameFormatError } from './errors.ts'
import { readDataTable } from './table.ts'

/**
 * **The accolades** — `/data/bin/ttldata.gp2/ttldata_<LG>.bin`, a command file
 * (the tagged data table, run as the game's `Script`), and their names, which
 * are a pair of system string files: `/data/bin/ttlname0.gp2/ttlname0_<LG>.nat`
 * for a man and `ttlname1` for a woman, keyed by the accolade's number. Read
 * 6 October 2026: the ARM9 loads the data (`func_020a13c4`, the name at
 * `0x020a1470`) and looks a record up by number (`func_020a15bc`); every
 * reader of a name builds `ttlname%d` from the Hero's sex, bit 0 of
 * `+0x49c` of the protagonist's data (overlay 23 `0x021f3d58`).
 *
 * | tag | values | what |
 * |---|---|---|
 * | `0x65` | a string | a date, `2010/04/08 23:52:59` |
 * | `0x64` | a string | `091205` |
 * | `0x66` | four integers | `unknown_0x66`: 151, 21, 260, 12 on the European cartridge |
 * | `0x67` | five integers and a string | one accolade, below |
 *
 * An accolade's record: its number; **where its man's name falls and where its
 * woman's falls in alphabetical order**, 1 up, 0 when that sex has no name for
 * it (observed: the English names sorted give exactly these, both sexes, 442
 * of 442 — the list's "By Name"); two values not read, kept as they are; and
 * the line that describes it. 445 records, numbered 2 to 454 with gaps.
 *
 * See FORMAT.md, "Accolades", and `docs/readings/T14-records.md`.
 */
export interface Accolade {
  /** Its number: what the earned bits, the scripts and the names are keyed by. */
  readonly id: number
  /** Where a man's name for it falls in alphabetical order, from 1; 0 when there is none. */
  readonly orderMale: number
  /** The same for a woman's. */
  readonly orderFemale: number
  /** Value 3: 0, 1, 2, 6 or 7 — 6 on the Abbey's revocation titles, 7 on the skills'. Not read. */
  readonly unknown_3: number
  /** Value 4: 0, 1 or 2. Not read. */
  readonly unknown_4: number
  /** The line describing it, its markup unread — `<ADDRESSEE>`, `<IF_ADDRESSEE_MALE>`. */
  readonly text: string
}

export interface AccoladeData {
  /** Tag `0x66`'s four values, kept as they are. */
  readonly unknown_0x66: readonly number[]
  /** The accolades, by number. */
  readonly accolades: ReadonlyMap<number, Accolade>
}

const TAG_HEAD = 0x66
const TAG_ACCOLADE = 0x67
const KIND_STRING = 0
const KIND_INT = 1

/** Parse `ttldata`. Throws on a record that is not five integers and a string. */
export function readAccoladeData(bytes: Uint8Array): AccoladeData {
  const table = readDataTable(bytes)
  const head = table.withTag(TAG_HEAD)[0]
  const accolades = new Map<number, Accolade>()
  for (const record of table.withTag(TAG_ACCOLADE)) {
    const kinds = Array.from(record.kinds)
    if (
      kinds.length !== 6 ||
      kinds.slice(0, 5).some((kind) => kind !== KIND_INT) ||
      kinds[5] !== KIND_STRING
    ) {
      throw new GameFormatError(
        `accolade record is not five integers and a string (${kinds.join(',')})`,
        record.offset,
      )
    }
    const value = (i: number) => record.values[i] as number
    const text = table.stringAt(value(5))
    if (text === undefined) {
      throw new GameFormatError(`accolade ${value(0)}'s text is outside the strings`, record.offset)
    }
    accolades.set(value(0), {
      id: value(0),
      orderMale: value(1),
      orderFemale: value(2),
      unknown_3: value(3),
      unknown_4: value(4),
      text,
    })
  }
  if (accolades.size === 0) throw new GameFormatError('no accolades in the table', 0)
  return { unknown_0x66: head ? Array.from(head.values) : [], accolades }
}
