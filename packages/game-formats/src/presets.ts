import { GameFormatError } from './errors.ts'
import { readDataTable, type TableRecord } from './table.ts'

/**
 * `/data/bin/charapreset.bin` — the ready-made characters the game can build:
 * twenty-three naming a vocation and a sex, and four named people.
 *
 * A loose tagged data table (FORMAT.md, "The tagged data table"): one `0x64`
 * record holding a count, then that many `0x65` records of 102 values. Value
 * 76 is a string, 90 and 91 are floats, and the rest are integers. See
 * FORMAT.md, "Character presets", for what each value is and how sure the
 * reading is — **most of them are not read**, and are carried through as
 * `unknown_*` rather than skipped.
 *
 * This reads the file; **what a preset is for is a separate question.** The
 * vocation records are named for a vocation and a sex in Shift-JIS, and the
 * numbering of those names has not been matched to the level tables' order
 * here. What is read is the parts each one is dressed in, which is what
 * `@minstrel/actor`'s `dressFigure` takes.
 */

export const PRESET_COUNT_TAG = 0x64
export const PRESET_TAG = 0x65
const PRESET_VALUES = 102

/** A value's kind — see `TableRecord.kinds`. */
const KIND_STRING = 0
const KIND_NUMBER = 1
const KIND_FLOAT = 2

/** An item id meaning "none": every value in the lists uses it. */
export const NO_ITEM = 0xffffffff

/** What a preset is dressed in — the values FORMAT.md names, 78 to 87. */
export interface PresetOutfit {
  /** A face: 9000 and its number — INFERRED. */
  readonly face: number
  readonly armour: number
  /** 8001 on the sage man, which names nothing. */
  readonly legwear: number
  /** Gloves, or the arms when there are none: 15xxx or 14xxx. */
  readonly gloves: number
  readonly footwear: number
  readonly headgear: number
  readonly weapon: number
  readonly shield: number
  /** The arms, 14xxx, numbered as the armour on 28 of the 29. */
  readonly arms: number
}

export interface CharacterPreset {
  /** Its place in the file, from 0. */
  readonly index: number
  /**
   * Its name, **one code point per byte and not decoded**.
   *
   * These names are Shift-JIS, unlike every other string this package reads,
   * and the table reader turns each byte into one character. That is lossless
   * — `charCodeAt` gives the bytes back — but it is not text. Decoding is the
   * caller's, because the encoding is this file's and not the table's.
   */
  readonly name: string
  readonly outfit: PresetOutfit
  /** 0 a man, 1 a woman — on all 23 vocation records, as their names say. */
  readonly sex: number
  /**
   * Values 90 and 91: 1.0 on most, 0.95 and 0.98 on the mage woman, 1.154 to
   * 1.195 on one of the named four. **A figure's proportions, INFERRED.**
   */
  readonly proportions: readonly [number, number]
  /**
   * Values 0 to 74: item ids in runs — weapons, then shields, legwear,
   * footwear, gloves, armour, then headgear — with {@link NO_ITEM} for none.
   * Every one is an item's id; **what the lists are for is not established**,
   * so they are handed over whole.
   */
  readonly unknown_items: readonly number[]
  readonly unknown_75: number
  readonly unknown_77: number
  readonly unknown_88: number
  readonly unknown_89: number
  /** Values 92 to 101: the same ten on most vocation records. */
  readonly unknown_92: readonly number[]
}

function value(record: TableRecord, at: number, kind: number, what: string): number {
  if (record.kinds[at] !== kind) {
    throw new GameFormatError(
      `character preset at 0x${record.offset.toString(16)} has ${what} of kind ${String(record.kinds[at])}, not ${kind}`,
      record.offset,
    )
  }
  return kind === KIND_FLOAT ? (record.floats[at] as number) : (record.values[at] as number)
}

const numberAt = (record: TableRecord, at: number, what: string) =>
  value(record, at, KIND_NUMBER, what)

/**
 * Read the character presets.
 *
 * The count record is checked against the number of preset records: a file
 * that says 29 and holds another number is a file this does not understand,
 * and saying so beats dressing somebody in whatever was there.
 */
export function readCharacterPresets(data: Uint8Array): CharacterPreset[] {
  const table = readDataTable(data)
  const counts = table.withTag(PRESET_COUNT_TAG)
  const records = table.withTag(PRESET_TAG)
  const said = counts[0]
  if (counts.length !== 1 || said === undefined || said.values.length !== 1) {
    throw new GameFormatError(
      `character presets have ${counts.length} count records, not one of one value`,
    )
  }
  const count = said.values[0] as number
  if (count !== records.length) {
    throw new GameFormatError(
      `character presets say there are ${count} of them and hold ${records.length}`,
      said.offset,
    )
  }
  return records.map((record, index) => {
    if (record.values.length !== PRESET_VALUES) {
      throw new GameFormatError(
        `character preset ${index} has ${record.values.length} values, not ${PRESET_VALUES}`,
        record.offset,
      )
    }
    return {
      index,
      name: table.stringAt(value(record, 76, KIND_STRING, 'a name')) ?? '',
      outfit: {
        face: numberAt(record, 78, 'a face'),
        armour: numberAt(record, 79, 'armour'),
        legwear: numberAt(record, 80, 'legwear'),
        gloves: numberAt(record, 81, 'gloves'),
        footwear: numberAt(record, 82, 'footwear'),
        headgear: numberAt(record, 83, 'headgear'),
        weapon: numberAt(record, 84, 'a weapon'),
        shield: numberAt(record, 85, 'a shield'),
        arms: numberAt(record, 87, 'arms'),
      },
      sex: numberAt(record, 86, 'a sex'),
      proportions: [
        value(record, 90, KIND_FLOAT, 'a proportion'),
        value(record, 91, KIND_FLOAT, 'a proportion'),
      ],
      unknown_items: [...record.values.subarray(0, 75)],
      unknown_75: numberAt(record, 75, 'value 75'),
      unknown_77: numberAt(record, 77, 'value 77'),
      unknown_88: numberAt(record, 88, 'value 88'),
      unknown_89: numberAt(record, 89, 'value 89'),
      unknown_92: [...record.values.subarray(92, PRESET_VALUES)],
    }
  })
}
