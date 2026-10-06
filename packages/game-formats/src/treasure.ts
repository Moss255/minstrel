import { GameFormatError } from './errors.ts'
import { readDataTable, type TableRecord } from './table.ts'

/**
 * A map's treasure: `/data/scenario/treasure.nsarc/<map>.bin`, one member per
 * map that has any, each a tagged data table (see `table.ts`).
 *
 * Established by observation; the evidence is in `FORMAT.md`, "Treasure".
 *
 * | tag | values | meaning |
 * |---|---|---|
 * | `0x65` | a string | a date and time — when the file was written, by the look of it |
 * | `0x64` | a string | the same date, `yymmdd` |
 * | `0x66` | a number | the game-wide number of the file's first treasure |
 * | `0x67` | 3, 5 or 6 | one treasure |
 *
 * A treasure is a packed word, a kind, and then either one more number — the
 * three-value records, all of kind `0x30`, have no position — or a position,
 * and on the six-value records a facing.
 *
 * **What the first two values are is the game's own reading**,
 * `LootManager_CreateContainer` (US `0x0207ba90`, decompiled in the decomp's
 * `src/World/LootableContainer.cpp`; read 6 October 2026): the word's high
 * half is the container's **id**, its low half the item, gold or rank it
 * holds; the kind's bits 4–6 are **which container** and bits 2–3 **what it
 * holds**. See `docs/readings/T13-gathering.md`.
 *
 * **A number's type bits say how to read it**: a whole number is stored as an
 * integer and anything else as a float, so one position can mix the two —
 * INFERRED, from integer-typed coordinates such as −2, 0 and 2 standing on the
 * floor exactly as the float-typed ones in the same room do.
 */

/** The record naming the file's first game-wide treasure number. */
export const TREASURE_TAG_FIRST = 0x66
/** One treasure. */
export const TREASURE_TAG = 0x67

export interface TreasurePosition {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface Treasure {
  /**
   * The treasure's running number over every file: the file's first, plus its
   * place among the file's treasures. Undefined when the file names no first.
   *
   * **Not what the game remembers an opened treasure by** — that is
   * {@link Treasure.id} (corrected 6 October 2026; this was INFERRED to be the
   * key). The game keeps the file's first number (`LootManager_Unknown_66`)
   * and nothing found reads it.
   */
  readonly index: number | undefined
  /**
   * Value 0, as stored: the container's id in the high half (see
   * {@link Treasure.id}), and in the low half the item, the gold or the rank to
   * draw at, by the kind.
   */
  readonly packed: number
  /**
   * **The container's id**, value 0's high half (`packedID >> 16`): what an
   * opened one is remembered by — see {@link openedFlag}. 0–206 for the red
   * chests and 0–699 for the rest, over the cartridge; a room's two versions
   * (`C04M04`, `C04M05`) share theirs.
   */
  readonly id: number
  /**
   * Value 1, as stored: `0x8`, `0x10`, `0x20`, `0x30` or `0x40`, and rarely
   * `0x0`, `0x4` or `0x9` — bits 4–6 the container ({@link containerOf}), bits
   * 2–3 what it holds ({@link contentsOf}), bits 0–1 the lock — 1 a thief's, 2 a magic one (`lockOf` in the game; six chests, all 1).
   */
  readonly kind: number
  /** Where it is, in the file's own units; undefined on a three-value record. */
  readonly position: TreasurePosition | undefined
  /**
   * Value 5 of a six-value record — INFERRED to be a facing in radians: it runs
   * 0.05 to 6.28, and π and π/2 are among the commonest.
   */
  readonly facing: number | undefined
  /**
   * Value 2 of a three-value record. Not established: it runs on across an
   * area's maps rather than restarting in each, so it indexes something outside
   * the map.
   */
  readonly unknown_2: number | undefined
  /** The record as the table gave it, for anything not read above. */
  readonly record: TableRecord
}

export interface TreasureFile {
  /** The game-wide number of the file's first treasure; undefined when it names none. */
  readonly first: number | undefined
  readonly treasures: readonly Treasure[]
}

/** The records of a random-treasure table: one draw each. */
export const RANDOM_TAG = 0x69
/** What a random-treasure draw gives: gold, an item, or a monster. */
export const RANDOM_GOLD = 1
export const RANDOM_ITEM = 2
/**
 * INFERRED: a chest that is a monster, its value the monster's number counting
 * from 1 in the monster list's order. Its rows are only in the chest tables,
 * their values are 38 to 40, climbing with the rank, and the monster list's
 * 38th to 40th are the three chest monsters — see FORMAT.md, "Random treasure".
 */
export const RANDOM_MONSTER = 3

/**
 * One row of a random-treasure table — `randTBox`, `randTD` and `randTTT` in
 * the treasure archive: a rank, what the row gives, and its weight among the
 * rank's rows. Packed into one word:
 *
 * | bits | meaning |
 * |---|---|
 * | 26–31 | rank |
 * | 23–25 | kind: 1 gold, 2 an item, 3 a monster (INFERRED) |
 * | 7–22 | the gold amount, the item's id, or the monster's number |
 * | 0–6 | weight |
 *
 * Established on the whole cartridge: every one of the 288 kind-2 rows names
 * an item, and the weights of each rank of `randTBox` and `randTD` come to 100.
 * `randTTT`'s come to 20 to 50 — INFERRED, the rest is the chance of nothing.
 */
export interface RandomTreasure {
  readonly rank: number
  readonly kind: number
  readonly value: number
  readonly weight: number
}

/** Parse a random-treasure table. */
export function readRandomTreasure(bytes: Uint8Array): RandomTreasure[] {
  return readDataTable(bytes)
    .withTag(RANDOM_TAG)
    .map((record) => {
      if (record.values.length !== 1 || record.kinds[0] !== 1) {
        throw new GameFormatError(
          `random-treasure row at 0x${record.offset.toString(16)} is not one integer`,
          record.offset,
        )
      }
      const word = record.values[0] as number
      return {
        rank: word >>> 26,
        kind: (word >>> 23) & 7,
        value: (word >>> 7) & 0xffff,
        weight: word & 0x7f,
      }
    })
}

/** A value by its type bits: 2 a float, 1 a signed integer. Anything else where a number belongs is an error. */
function numberAt(record: TableRecord, i: number): number {
  const kind = record.kinds[i]
  if (kind === 2) return record.floats[i] as number
  if (kind === 1) return (record.values[i] as number) | 0
  throw new GameFormatError(
    `treasure record at 0x${record.offset.toString(16)}: value ${i} has type ${kind}, not a number`,
    record.offset,
  )
}

/** Parse a map's treasure file. */
export function readTreasure(bytes: Uint8Array): TreasureFile {
  const table = readDataTable(bytes)
  const named = table.withTag(TREASURE_TAG_FIRST)[0]
  const first = named && named.values.length > 0 ? numberAt(named, 0) : undefined
  const treasures = table.withTag(TREASURE_TAG).map((record, place): Treasure => {
    const count = record.values.length
    if (count !== 3 && count !== 5 && count !== 6) {
      throw new GameFormatError(
        `treasure record at 0x${record.offset.toString(16)} has ${count} values; 3, 5 and 6 are the known shapes`,
        record.offset,
      )
    }
    return {
      index: first === undefined ? undefined : first + place,
      packed: record.values[0] as number,
      id: (record.values[0] as number) >>> 16,
      kind: record.values[1] as number,
      position:
        count === 3
          ? undefined
          : { x: numberAt(record, 2), y: numberAt(record, 3), z: numberAt(record, 4) },
      facing: count === 6 ? numberAt(record, 5) : undefined,
      unknown_2: count === 3 ? (record.values[2] as number) : undefined,
      record,
    }
  })
  return { first, treasures }
}

/**
 * **Which container**, value 1's bits 4–6 (`LootManager_CreateContainer`):
 * a red chest, a pot, a barrel, a cupboard, a blue chest. The game tells the
 * chests from the rest by the position it reads (a facing besides) and the
 * blue from the red by the table it draws from; which of 1 and 2 is the pot is
 * the decomp's naming, and they take different sprite sheets
 * (`func_02013d24`).
 */
export const CONTAINER = { redChest: 0, pot: 1, barrel: 2, cupboard: 3, blueChest: 4 } as const

/** A treasure's container — see {@link CONTAINER}. */
export function containerOf(treasure: Pick<Treasure, 'kind'>): number {
  return (treasure.kind >>> 4) & 7
}

/** **What it holds**, value 1's bits 2–3: 0 nothing, 1 gold, 2 an item, 3 a monster — as a random row's kind. */
export function contentsOf(treasure: Pick<Treasure, 'kind'>): number {
  return (treasure.kind >>> 2) & 3
}

/**
 * The flags an opened treasure sets, in the game-wide bank at `+0x8c` (the
 * treasure service, ov017 `0x021ae528`–`0x021ae58c`): **a red chest's
 * `0x212 + id`, for ever; anything else's `0x79e + id`**, which the field's
 * start clears, 700 of them (`func_ov017_0218b688`, `0x0218c180`).
 */
export const RED_CHEST_FLAG = 0x212
export const REFILLED_FLAG = 0x79e
export const REFILLED_COUNT = 0x2bc

/** The flag that says a treasure has been opened — see {@link RED_CHEST_FLAG}. */
export function openedFlag(treasure: Pick<Treasure, 'kind' | 'id'>): number {
  return (
    (containerOf(treasure) === CONTAINER.redChest ? RED_CHEST_FLAG : REFILLED_FLAG) + treasure.id
  )
}
