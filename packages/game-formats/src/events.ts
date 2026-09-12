import { GameFormatError } from './errors.ts'
import { type DataTable, readDataTable, type TableRecord } from './table.ts'

/**
 * `ev#####_<lang>.bin` — an event's text, one file per language.
 *
 * Each event unpacks from its own `/data/event/ev#####.gp2` to a `.stb` — the
 * script, magic `SB2\0`, not read here — and five text files, `_de`, `_en`,
 * `_es`, `_fr` and `_it`. A text file is an ordinary tagged data table (see
 * `table.ts`): every record is tag `0x64`, carrying a message's number and the
 * string it says. The evidence is in `FORMAT.md`.
 */

/** The tag every message record carries: 18,245 of 18,245 on the reference cartridge. */
const TAG_MESSAGE = 0x64
/** The type bits of a value: a number, or a string offset. */
export const KIND_NUMBER = 1
export const KIND_STRING = 0
/** A message with no text stores this where its string offset would be. */
const NO_STRING = 0xffffffff

/**
 * The text a record's string offset names: undefined for `NO_STRING`, and an
 * error for an offset that is not the start of a string.
 */
export function textAt(
  table: DataTable,
  data: Uint8Array,
  record: TableRecord,
  at: number,
): string | undefined {
  if (at === NO_STRING) return undefined
  const text = table.stringAt(at)
  if (text !== undefined) return text
  // The table lists only strings with something in them, so an empty one is a
  // terminator standing where the offset points. No record on the reference
  // cartridge does this — silent ones use `NO_STRING` — but it is a valid file,
  // and one that did should read rather than throw.
  const strings = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(4, true)
  if (data[strings + at] === 0) return ''
  throw new GameFormatError(
    `record at 0x${record.offset.toString(16)} names string offset ${at}, which is not the start of a string`,
    record.offset,
  )
}

/** One thing an event can say. */
export interface EventMessage {
  /**
   * The message's number within its event. Every language of an event carries
   * the same numbers in the same order — 518 of 518 events.
   */
  readonly id: number
  /** What it says, markup and all — see {@link parseMarkup}. Undefined when it says nothing. */
  readonly text: string | undefined
}

/**
 * Read an event's messages in one language.
 *
 * An empty file is an event with nothing to say — 25 of the reference
 * cartridge's 2,615 are zero bytes — and reads as no messages.
 *
 * **The text is ASCII.** Not one byte of 0x80 or above appears in any
 * language's strings, because accents are markup (`<'e>`, `` <`a> ``, `<:u>`),
 * so the table's byte-per-character decoding is exact.
 */
export function readEventMessages(data: Uint8Array): EventMessage[] {
  if (data.length === 0) return []
  const table = readDataTable(data)
  return table.records.map((record) => {
    if (
      record.tag !== TAG_MESSAGE ||
      record.values.length !== 2 ||
      record.kinds[0] !== KIND_NUMBER ||
      record.kinds[1] !== KIND_STRING
    ) {
      throw new GameFormatError(
        `event text record at 0x${record.offset.toString(16)} is tag 0x${record.tag.toString(16)} with ${record.values.length} values, not a message`,
        record.offset,
      )
    }
    return {
      id: record.values[0] as number,
      text: textAt(table, data, record, record.values[1] as number),
    }
  })
}

/** A piece of a message: some text, a line break, or a markup tag. */
export type MarkupToken =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'break' }
  | { readonly kind: 'tag'; readonly name: string; readonly args: readonly string[] }

/**
 * Split a message into its text, its line breaks and its markup.
 *
 * **Structure only; what a tag means is left to the caller**, because most of
 * the vocabulary is not established — see `FORMAT.md`. A tag is `<name>` or
 * `<name=a,b,c>`. A line break is the two characters `\` and `n`, which is how
 * the file writes one. Across the cartridge's text no `<` is left open and no
 * `>` stands alone, so either one here is an error rather than something to
 * guess past.
 */
export function parseMarkup(message: string): MarkupToken[] {
  const out: MarkupToken[] = []
  let text = ''
  const flush = () => {
    if (text) out.push({ kind: 'text', text })
    text = ''
  }
  for (let i = 0; i < message.length; i++) {
    const c = message[i] as string
    if (c === '\\' && message[i + 1] === 'n') {
      flush()
      out.push({ kind: 'break' })
      i++
      continue
    }
    if (c === '<') {
      const end = message.indexOf('>', i + 1)
      const reopened = message.indexOf('<', i + 1)
      if (end < 0 || (reopened >= 0 && reopened < end)) {
        throw new GameFormatError(
          `markup opened at ${i} and not closed: ${JSON.stringify(message.slice(i, i + 24))}`,
        )
      }
      flush()
      const body = message.slice(i + 1, end)
      const equals = body.indexOf('=')
      out.push(
        equals < 0
          ? { kind: 'tag', name: body, args: [] }
          : { kind: 'tag', name: body.slice(0, equals), args: body.slice(equals + 1).split(',') },
      )
      i = end
      continue
    }
    if (c === '>') {
      throw new GameFormatError(
        `'>' at ${i} closes no markup: ${JSON.stringify(message.slice(Math.max(0, i - 12), i + 12))}`,
      )
    }
    text += c
  }
  flush()
  return out
}
