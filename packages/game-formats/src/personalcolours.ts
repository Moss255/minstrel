import { GameFormatError } from './errors.ts'
import { readDataTable } from './table.ts'

/**
 * `/data/bin/percol.bin` — **the personal colours**, the sixteen a party
 * member may be given on the field menu's Tactics screen (Misc. → Tactics,
 * its third column) and are drawn in on the field's screens.
 *
 * **Read from the game's code**, 11 October 2026 (US ARM9): the file is a
 * tagged data table run as a `Script` (see `table.ts`), its one opcode table
 * at `0x020f1b04` holding a single handler, `0x65` → `func_020a6090`: the
 * record's first value, masked to a byte, is the colour's number, and the
 * sixteen after it are halfwords written to `data_02109dcc + number × 0x20` —
 * one DS palette of sixteen BGR555 colours a personal colour, which
 * `func_020dc70c` loads for a party member by their colour, the character
 * record's `+0x56a`. Tag `0x64` is the file's version and is not run.
 *
 * Each palette's colour 0 is `0x7c1f`, the magenta a DS palette leaves clear.
 * What each of the other fifteen is drawn on is not read.
 */
export interface PersonalColours {
  /** The sixteen palettes, by colour number: sixteen BGR555 halfwords each. */
  readonly palettes: readonly (readonly number[])[]
}

const TAG_COLOUR = 0x65
/** How many colours the menu offers — its 4 × 4 grid (`func_ov002_02161cf0`, state 28). */
export const PERSONAL_COLOURS = 16

/** Read `percol.bin`. Throws on a record that is not a number and sixteen colours, or a colour missing. */
export function readPersonalColours(bytes: Uint8Array): PersonalColours {
  const table = readDataTable(bytes)
  const palettes: (number[] | undefined)[] = new Array(PERSONAL_COLOURS).fill(undefined)
  for (const record of table.withTag(TAG_COLOUR)) {
    if (record.values.length !== 17) {
      throw new GameFormatError(
        `personal colour record holds ${record.values.length} values, not 17`,
        record.offset,
      )
    }
    // As the handler takes them: the number a byte, each colour a halfword.
    const number = (record.values[0] as number) & 0xff
    if (number >= PERSONAL_COLOURS) {
      throw new GameFormatError(`personal colour ${number} is past the sixteen`, record.offset)
    }
    palettes[number] = [...record.values.subarray(1)].map((value) => value & 0xffff)
  }
  const missing = palettes.indexOf(undefined)
  if (missing >= 0) throw new GameFormatError(`personal colour ${missing} has no record`)
  return { palettes: palettes as number[][] }
}
