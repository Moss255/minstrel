import { GameFormatError } from './errors.ts'
import { readDataTable } from './table.ts'

/**
 * **Stella's comments** — `data/scenario/cmtFileTbl.bin` and the files it
 * names. Read 11 October 2026 (US build); `docs/readings/T14-records.md`,
 * "Stella's comments".
 *
 * `cmtFileTbl.bin` is a command file run as a `Script` (`func_020727f8`,
 * opcode table `0x020f0cc8`): tag `0x65` its date, `0x64` its version,
 * `0x66` a count (152), and **`0x67`, an entry**: its number and three
 * strings — the archive its lines are in (`data/scenario/cmtB13.gp2`), the
 * member there (`B13_<LG>.bin`) and its script (`data/scenario/cmtB13.stb`).
 * Entries 1 to 148 are numbered as the Story So Far's pages are; 1000 is the
 * header, 1001 Clear, 1002 TailC, 1003 TailG. An entry with no files has −1
 * where its strings would be.
 *
 * An entry's lines are a command file too: `0x65` a date, `0x64` a version,
 * `0x66` a count, and **`0x67`, a line**: its number, the line for a male
 * protagonist and for a female one — −1 where there is none for that sex
 * (two of the header's, 117 and 120, are a woman's alone).
 */
export interface CommentEntry {
  readonly number: number
  /** The archive and its member holding the lines, `<LG>` left as it is. */
  readonly archive: string
  readonly member: string
  readonly script: string
}

const TAG_ENTRY = 0x67
const TAG_LINE = 0x67

/** Read `cmtFileTbl.bin`: its entries by number; one with no files is left out. */
export function readCommentTable(bytes: Uint8Array): Map<number, CommentEntry> {
  const table = readDataTable(bytes)
  const out = new Map<number, CommentEntry>()
  for (const record of table.withTag(TAG_ENTRY)) {
    if (record.values.length !== 4) {
      throw new GameFormatError(
        `comment entry of ${record.values.length} values, not 4`,
        record.offset,
      )
    }
    const [number, archive, member, script] = [...record.values] as number[]
    const text = (offset: number) => table.stringAt(offset)
    const files = [text(archive as number), text(member as number), text(script as number)]
    if (files.some((one) => one === undefined)) continue
    out.set(number as number, {
      number: number as number,
      archive: files[0] as string,
      member: files[1] as string,
      script: files[2] as string,
    })
  }
  return out
}

/** The offset that means a sex has no line. */
const NO_LINE = 0xffffffff

/** Read an entry's lines: by number, the man's line and the woman's, markup unread; undefined for none. */
export function readCommentLines(
  bytes: Uint8Array,
): Map<number, readonly [string | undefined, string | undefined]> {
  const table = readDataTable(bytes)
  const out = new Map<number, readonly [string | undefined, string | undefined]>()
  for (const record of table.withTag(TAG_LINE)) {
    if (record.values.length !== 3) {
      throw new GameFormatError(
        `comment line of ${record.values.length} values, not 3`,
        record.offset,
      )
    }
    const [number, man, woman] = [...record.values] as number[]
    const text = (offset: number) => (offset === NO_LINE ? undefined : table.stringAt(offset))
    const a = text(man as number)
    const b = text(woman as number)
    if ((a === undefined && man !== NO_LINE) || (b === undefined && woman !== NO_LINE)) {
      throw new GameFormatError(
        `comment line ${number}'s text is outside the strings`,
        record.offset,
      )
    }
    out.set(number as number, [a, b])
  }
  return out
}
