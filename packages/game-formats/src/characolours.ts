import { GameFormatError } from './errors.ts'
import { readDataTable } from './table.ts'

/**
 * `/data/chara/palette.bin` — the colours a made character is recoloured with.
 *
 * **Read from the game's code, not only its bytes.** The file is a tagged data
 * table like the rest (see `table.ts`), and the ARM9 runs it as a script:
 * `func_02099cb8` loads it and executes it with an opcode table at
 * `0x020f1574`, one handler per tag, each filling a table in memory with the
 * record's values, a halfword each. See FORMAT.md, "Character colours".
 *
 * | tag | handler | fills | what it is |
 * |---|---|---|---|
 * | `0x64` | `0x02099ac4` | 10 × 2 | brows, one pair per hair colour |
 * | `0x65` | `0x02099b20` | 8 × 2 | skin, two shades per tone |
 * | `0x66` | `0x02099b7c` | 8 × 4 | skin, four shades per tone |
 * | `0x67` | `0x02099bd8` | 8 × 8 | skin, eight shades per tone |
 * | `0x68` | `0x02099c34` | 8 × 2 | eyes, one pair per colour |
 * | `0x69` | `0x02099c90` | 1 | not established |
 *
 * Every colour is BGR555, as the DS's palettes hold them.
 */
export interface CharaColours {
  /** Ten pairs, one per hair colour: what a face's brows are drawn in. */
  readonly brows: readonly (readonly number[])[]
  /** Eight skin tones, each as a ramp of two, four and eight shades. */
  readonly skin2: readonly (readonly number[])[]
  readonly skin4: readonly (readonly number[])[]
  readonly skin8: readonly (readonly number[])[]
  /** Eight eye colours, a pair each. */
  readonly eyes: readonly (readonly number[])[]
  /** Tag `0x69`'s one value. Stored by the game at `0x02109a50`; what reads it is not established. */
  readonly unknown_0x69: number
}

const TAGS = {
  brows: { tag: 0x64, rows: 10, each: 2 },
  skin2: { tag: 0x65, rows: 8, each: 2 },
  skin4: { tag: 0x66, rows: 8, each: 4 },
  skin8: { tag: 0x67, rows: 8, each: 8 },
  eyes: { tag: 0x68, rows: 8, each: 2 },
} as const
const TAG_UNKNOWN = 0x69

/** Read `palette.bin`. Throws if a table is missing or the wrong size, as the game's handlers would read past it. */
export function readCharaColours(bytes: Uint8Array): CharaColours {
  const table = readDataTable(bytes)
  const rowsOf = (name: keyof typeof TAGS): number[][] => {
    const { tag, rows, each } = TAGS[name]
    const record = table.withTag(tag)[0]
    if (!record)
      throw new GameFormatError(`character colours carry no 0x${tag.toString(16)} record`)
    if (record.values.length !== rows * each) {
      throw new GameFormatError(
        `character colours' 0x${tag.toString(16)} record holds ${record.values.length} values, not ${rows * each}`,
        record.offset,
      )
    }
    // Each is kept as the handler keeps it: a halfword.
    const values = [...record.values].map((value) => value & 0xffff)
    return Array.from({ length: rows }, (_, row) => values.slice(row * each, row * each + each))
  }
  const unknown = table.withTag(TAG_UNKNOWN)[0]?.values[0]
  if (unknown === undefined) throw new GameFormatError('character colours carry no 0x69 record')
  return {
    brows: rowsOf('brows'),
    skin2: rowsOf('skin2'),
    skin4: rowsOf('skin4'),
    skin8: rowsOf('skin8'),
    eyes: rowsOf('eyes'),
    unknown_0x69: unknown & 0xffff,
  }
}
