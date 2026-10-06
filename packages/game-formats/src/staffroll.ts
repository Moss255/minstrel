import { readDataTable } from './table.ts'

/**
 * **The staff roll** — `/data/evspt_lv5/staffroll.bin`, a command file
 * (the tagged data table, run as the game's `Script`). Read 6 October 2026
 * from overlay 28, which loads it (`func_ov028_021d8dd0`, step 3) and runs it
 * with three functions of its own (`data_ov028_021d9ac0`):
 *
 * | tag | values | does |
 * |---|---|---|
 * | `0x64` | count | makes room for that many lines, none yet (`func_ov028_021d97b0`) |
 * | `0x65` | group, flags, gap, text | adds a line while there is room (`021d97d8`, `021d999c`) |
 * | `0x66` | speed | the scroll's speed, pixels a frame (`021d9898`); 1 until set |
 *
 * A line's group and gap are kept as `s16`, its flags whole; the roll takes
 * the flags apart as below (`func_ov028_021d9208`). An integer handed where a
 * float is wanted is made one, and a float where an integer is, truncated —
 * `Script::Parameter`'s `ToInt` and `ToFloat`. A tag the roll has no function
 * for is passed over, as `Script` passes over one with no function.
 *
 * See FORMAT.md, "The staff roll", and `docs/readings/T11-ending.md`.
 */

/** One line of the roll. */
export interface StaffRollLine {
  /** Lines of a group stand side by side at one height; a new group starts a new height. */
  readonly group: number
  /** How far below the last group's height a new group's line goes, in pixels. */
  readonly gap: number
  /** The flags whole. */
  readonly flags: number
  /** Bits 0–3: 12 is set in font 1 (`me`), anything else in font 0 (`s7`). */
  readonly size: number
  /** Bits 4–5: 0 at the left, 1 centred, 2 ending at x 120, 3 beginning at x 136. */
  readonly align: number
  /** Bits 7–10: the colour its letters are drawn in. */
  readonly colour: number
  /**
   * The text, a byte a character as the fonts' glyph names spell it — `<:e>`
   * for ë. Undefined where the value was not a string. The roll copies it
   * with `sprintf`, as a format, so a `%` in it would be read as one; there
   * is none on the cartridge.
   */
  readonly text: string | undefined
}

export interface StaffRoll {
  /** Pixels the roll scrolls a frame. */
  readonly speed: number
  /** How many lines there was room for. */
  readonly room: number
  /** The lines, in the file's order. */
  readonly lines: readonly StaffRollLine[]
}

const TAG_ROOM = 0x64
const TAG_LINE = 0x65
const TAG_SPEED = 0x66
const KIND_STRING = 0
const KIND_INT = 1
const KIND_FLOAT = 2

const s16 = (value: number): number => (value << 16) >> 16

/** Run the staff roll's file as the roll runs it. */
export function readStaffRoll(bytes: Uint8Array): StaffRoll {
  const table = readDataTable(bytes)
  let speed = 1
  let room = 0
  let lines: StaffRollLine[] = []
  for (const record of table.records) {
    const int = (i: number): number =>
      record.kinds[i] === KIND_INT
        ? (record.values[i] as number) | 0
        : record.kinds[i] === KIND_FLOAT
          ? Math.trunc(record.floats[i] as number)
          : 0
    const float = (i: number): number =>
      record.kinds[i] === KIND_FLOAT
        ? (record.floats[i] as number)
        : record.kinds[i] === KIND_INT
          ? Math.fround((record.values[i] as number) | 0)
          : 0
    if (record.tag === TAG_SPEED) {
      speed = float(0)
    } else if (record.tag === TAG_ROOM) {
      room = int(0) & 0xffff
      lines = []
    } else if (record.tag === TAG_LINE) {
      if (lines.length >= room) continue
      const flags = int(1) >>> 0
      lines.push({
        group: s16(int(0)),
        gap: s16(int(2)),
        flags,
        size: flags & 15,
        align: (flags >>> 4) & 3,
        colour: (flags >>> 7) & 15,
        text:
          record.kinds[3] === KIND_STRING ? table.stringAt(record.values[3] as number) : undefined,
      })
    }
  }
  return { speed, room, lines }
}
