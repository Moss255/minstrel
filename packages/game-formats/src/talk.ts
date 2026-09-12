import { GameFormatError } from './errors.ts'
import { KIND_NUMBER, KIND_STRING, textAt } from './events.ts'
import { readDataTable } from './table.ts'

/**
 * `<area><letter><digit>.gp2/<id>_<lang>.bin` — what one character says, in one
 * chapter of the story.
 *
 * Each area has an archive per letter under `/data/scenario` — Angel Falls has
 * `M01A0.gp2` to `M01Q0.gp2` — holding one text file per character and
 * language. **The file's number is the character's id** in the area's cast
 * list, on 7,974 of the 7,994 English talk files in areas that have one, and
 * the letters follow the story. The evidence is in `FORMAT.md`.
 *
 * A file is a tagged data table whose records carry three or four numbers and
 * then a string. The numbers are carried, not decoded.
 */

/** One thing a character can say. */
export interface TalkLine {
  /** The record's tag — 1, 2, 4 or 5 on the reference cartridge. Not established. */
  readonly tag: number
  /**
   * The numbers before the text, three or four. **Not established.** Within a
   * letter the first two often read as a range of sub-stages, with 99 for "to
   * the end", but nothing here relies on that.
   */
  readonly unknown_numbers: readonly number[]
  /** What it says, markup and all — see `parseMarkup`. Undefined when it says nothing. */
  readonly text: string | undefined
}

/**
 * Read one character's talk file in one language.
 *
 * An empty file says nothing and reads as no lines. A record that is not
 * numbers and then a string is an error rather than something to read round.
 */
export function readTalk(data: Uint8Array): TalkLine[] {
  if (data.length === 0) return []
  const table = readDataTable(data)
  return table.records.map((record) => {
    const count = record.values.length
    const numbers = Array.from(record.kinds.slice(0, count - 1))
    if (
      count < 2 ||
      record.kinds[count - 1] !== KIND_STRING ||
      numbers.some((k) => k !== KIND_NUMBER)
    ) {
      throw new GameFormatError(
        `talk record at 0x${record.offset.toString(16)} (tag 0x${record.tag.toString(16)}) is not numbers and then a string`,
        record.offset,
      )
    }
    return {
      tag: record.tag,
      unknown_numbers: Array.from(record.values.slice(0, count - 1)),
      text: textAt(table, data, record, record.values[count - 1] as number),
    }
  })
}
