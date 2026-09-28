import { GameFormatError } from './errors.ts'
import { readDataTable } from './table.ts'

/**
 * `<map>.npc` — who stands in a map, and where.
 *
 * A NARC holding two files: `<map>npc.bin` names the cast, and
 * `<map>place.bin` puts them. 74 archives on the cartridge, 1,385 names and
 * 1,285 placements between them.
 *
 * The two are joined by an id: **every placement's id is the id of an entry in
 * the list, on 73 of the 74 archives**. There are fewer placements than names,
 * never more, which is what you would expect if some characters are placed by
 * events rather than by the file.
 */

/** The list is a tagged data table; its character records carry this tag. */
const TAG_ENTRY = 3

/**
 * Value slots in a character record.
 *
 * One lower than they were while the record header was being read as four
 * bytes: a character carries five values, so its header is eight. Slot 0 is
 * `0xFFFFFF01` on every record of the cartridge.
 */
const SLOT_ID = 0
const SLOT_KIND = 1
const SLOT_NAME = 3

/** An unset slot. */
const UNSET = 0xffffffff

/**
 * What a character is drawn as.
 *
 * **Established, and it is the byte that decides.** Across the 33 distinct
 * names of the slice's village the split is exact: every `kind` 0 has a `.spr`
 * in `/data/ani` and no 3D model anywhere on the cartridge, and every `kind` 2
 * has a `.chr` archive in `/data/chara_sub` and no `.spr`. Cartridge-wide the
 * byte takes 0 (901), 1 (317), 2 (132) and 5 (35).
 *
 * `kind` 1 is carried by records with no name at all. What 5 is, is not
 * established — the village's one example, `z015d`, has neither a sprite nor a
 * model under that name.
 */
export const NPC_KIND = {
  /** Drawn as a 2D sprite from `/data/ani/<name>.spr`. */
  SPRITE: 0,
  /**
   * Not drawn at all: something to examine — INFERRED. The village's three
   * are unnamed, placed, and what their talk files say is what examining a
   * thing says: a bush with something buried under it, a statue's inscription.
   */
  SPOT: 1,
  /** Drawn as a 3D model from `/data/chara_sub/<name>.chr`. */
  MODEL: 2,
} as const

/** One character the map's cast names. */
export interface NpcEntry {
  /** Joins this entry to its placement. Not a position in the list. */
  readonly id: number
  /** See {@link NPC_KIND}. 0 and 2 are established, 1 INFERRED; any other value is not. */
  readonly kind: number
  /** The character's name, absent on records that carry no string offset. */
  readonly name: string | undefined
  /** The whole record, for anything the fields above do not cover. */
  readonly values: Uint32Array
}

/** Where one character stands, in world units. */
export interface NpcPlacement {
  /** The id of the {@link NpcEntry} this places. */
  readonly id: number
  /** Position, in the file's own units. */
  readonly x: number
  readonly y: number
  readonly z: number
  /**
   * Which way it faces, in radians about the vertical.
   *
   * **Established beyond reasonable doubt.** Across all 1,285 blocks on the
   * cartridge the value is within 0 to 2π, and 71% of them sit on an exact
   * multiple of 90°. That is authored data, not bytes that happen to decode.
   */
  readonly facing: number
  /**
   * Which map this character stands in, as **the map's own id**.
   *
   * A cast list is per *area*, not per map. `M01.npc` holds the 49 characters
   * of Angel Falls — the village outdoors *and* everyone inside its houses —
   * and each is placed in the coordinates of the map they stand in. Those
   * coordinates do not distinguish them: an interior is its own little map
   * about its own origin, so an innkeeper standing at (0.1, −0.1) is over the
   * floor of every other interior as well. This word is what tells them apart.
   *
   * **It is the id `maplist9.bin` gives the map**, and the join is exact: all
   * **1,289** placement blocks on the cartridge carry a value that is some
   * entry's id. See {@link MapEntry.id}.
   *
   * Angel Falls runs 1100 for the village and 1101 to 1112 for its interiors,
   * so the ids there read as `area x 100 + sub-map`. That is a habit of the
   * numbering rather than a rule — ids elsewhere run to 20001 — and nothing
   * needs to take it apart, since the index gives the number outright.
   */
  readonly map: number
  /** Byte offset of the block, for anything that wants the rest of it. */
  readonly offset: number
  /** Where the Hero can stand to talk to them, and the label each asks with — see {@link TalkBox}. */
  readonly boxes?: readonly TalkBox[]
}

/**
 * The word a placement block opens with, and the word after it.
 *
 * Two words rather than one because the blocks are **variable length** — the
 * gaps between them run from 76 to 924 bytes — so they are found by scanning
 * rather than by stride, and a single word is a weaker signature than the
 * scan deserves.
 */
const BLOCK_MARK = 0xa5060003
const BLOCK_MARK_2 = 0xffffff0a
/** Header words before the four floats. */
const BLOCK_HEADER = 16

function u32(data: Uint8Array, at: number): number {
  return (
    ((data[at] as number) |
      ((data[at + 1] as number) << 8) |
      ((data[at + 2] as number) << 16) |
      ((data[at + 3] as number) << 24)) >>>
    0
  )
}

/** Cheap check for a cast list: a data table carrying character records. */
export function isNpcList(data: Uint8Array): boolean {
  try {
    return readDataTable(data).withTag(TAG_ENTRY).length > 0
  } catch {
    return false
  }
}

/** Read a map's cast. */
export function readNpcList(data: Uint8Array): NpcEntry[] {
  const table = readDataTable(data)
  const entries: NpcEntry[] = []
  for (const record of table.withTag(TAG_ENTRY)) {
    if (record.values.length <= SLOT_NAME) {
      throw new GameFormatError(
        `character record at 0x${record.offset.toString(16)} carries ${record.values.length} values, fewer than the ${SLOT_NAME + 1} a character needs`,
        record.offset,
      )
    }
    const nameAt = record.values[SLOT_NAME] as number
    entries.push({
      id: record.values[SLOT_ID] as number,
      kind: record.values[SLOT_KIND] as number,
      name: nameAt === UNSET ? undefined : table.stringAt(nameAt),
      values: record.values,
    })
  }
  return entries
}

/**
 * Cheap check for a placement file.
 *
 * **`isDataTable` says yes to one of these and it is wrong**: a placement
 * file's string offset happens to equal its length, which is exactly what that
 * check tests. This looks for the block signature instead.
 */
export function isNpcPlacements(data: Uint8Array): boolean {
  for (let at = 0; at + BLOCK_HEADER <= data.length; at += 4) {
    if (u32(data, at) === BLOCK_MARK && u32(data, at + 4) === BLOCK_MARK_2) return true
  }
  return false
}

/**
 * Read where an area's characters stand.
 *
 * Blocks are variable length, so they are found by their two-word signature and
 * read from there. The four floats follow the header.
 *
 * **A block holds one character in several places, and this reads only the
 * header** — {@link readNpcStates} reads the rest. After the header come
 * sub-records, each opening with its own two-word mark:
 *
 * | mark | length | carries |
 * |---|---|---|
 * | `0x550D0005 0xFF02A955` | 60 | seven words, a map, the character's id, then x, y, z and a facing |
 * | `0x55090005 0xFFFF0155` | 44 | the same without any position |
 *
 * The header repeats the first positioned sub-record on 485 of the 636 blocks
 * that have one, and differs from it on the rest, most often in position.
 *
 * The seven words look like a story state and are **not established**. The
 * first two climb through a block — 1/1, 1/2, 1/3, 2/1, 2/2, 2/6, 2/7, 19/2 —
 * and the last is 0 or 1 on two records that are otherwise identical but stand
 * in different places, which is what a character who moves within one state
 * looks like. Nothing here decodes them.
 *
 * **A sub-record's map is its own**, and need not be the block's. `s017` opens
 * in the village and has positioned records for the mayor's house, Erinn's
 * house and the inn; `n005a` opens in Erinn's house and has one for the inn.
 * Reading only the first record therefore both **misses** characters — the
 * village inn holds 7 by the file and 5 are found — and **keeps** characters
 * whose first state is far into the story.
 *
 * It also stacks them: four of the inn's five share the position
 * `0.09, 0.02, -0.10` exactly, which is not five authored spots. Their other
 * records put two of them at `x = 0.53` and one at `x = -0.55`, both outside
 * the inn's own collision and both inside the room it draws — which is how the
 * characters came to be the ruler that showed the collision is short. See
 * `docs/next.md`.
 */
export function readNpcPlacements(data: Uint8Array): NpcPlacement[] {
  const out: NpcPlacement[] = []
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  for (let at = 0; at + BLOCK_HEADER <= data.length; at += 4) {
    if (u32(data, at) !== BLOCK_MARK || u32(data, at + 4) !== BLOCK_MARK_2) continue
    if (at + BLOCK_HEADER + 16 > data.length) {
      throw new GameFormatError(
        `placement block at 0x${at.toString(16)} runs past the end of the file`,
        at,
      )
    }
    out.push({
      id: u32(data, at + 12),
      map: u32(data, at + 8),
      x: view.getFloat32(at + BLOCK_HEADER + 0, true),
      y: view.getFloat32(at + BLOCK_HEADER + 4, true),
      z: view.getFloat32(at + BLOCK_HEADER + 8, true),
      facing: view.getFloat32(at + BLOCK_HEADER + 12, true),
      offset: at,
    })
    at += BLOCK_HEADER + 12
  }
  return out
}

/**
 * One of the sub-records after a placement block's header: a character in one
 * map, and usually one place, over a span of the story.
 *
 * | offset | type | meaning |
 * |---|---|---|
 * | `+0x00` | `u32[2]` | `0x550D0005 0xFF02A955`; `0x55090005 0xFFFF0155` without a position |
 * | `+0x08` | `u32[7]` | not established — see below |
 * | `+0x24` | `u32` | the map, by its own id |
 * | `+0x28` | `u32` | the character's id |
 * | `+0x2C` | `f32[4]` | x, y, z and facing — the 60-byte form only |
 *
 * Across the cartridge's 1,977 of these, the map is in the block's own area on
 * all but one, and the id is the block's own on 1,876 — so a record names its
 * own character rather than inheriting the block's.
 *
 * The seven words are carried, not decoded. Read as pairs, words 0-1 and 3-4
 * never run backwards — the second is at or after the first on 1,977 of 1,977 —
 * which is what a span from one story stage to another would look like, and
 * word 6 is 2, 1 or 0 on all but one. That is a reading of the numbers, not of
 * the game, and nothing in this package relies on it.
 *
 * The blocks hold more than these two forms — 91,652 bytes between blocks are
 * neither — and what else is there is skipped rather than guessed at.
 */
export interface NpcState {
  /** Byte offset of the block this record sits in. */
  readonly block: number
  /** Byte offset of the record itself. */
  readonly offset: number
  readonly id: number
  readonly map: number
  /** The seven words at `+0x08`. Not established. */
  readonly unknown_0x08: Uint32Array
  /** Where the character stands, in the file's own units, when the record says. */
  readonly position:
    | { readonly x: number; readonly y: number; readonly z: number; readonly facing: number }
    | undefined
}

/** The two sub-record forms: with a position, and without one. */
const STATE_MARK = 0x550d0005
const STATE_MARK_2 = 0xff02a955
const STATE_SIZE = 60
const UNPLACED_MARK = 0x55090005
const UNPLACED_MARK_2 = 0xffff0155
const UNPLACED_SIZE = 44

/**
 * Every placement block's sub-records, in file order.
 *
 * Found by their marks between one block and the next; anything between them
 * that is neither form is stepped over a word at a time.
 */
export function readNpcStates(data: Uint8Array): NpcState[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const blocks: number[] = []
  for (let at = 0; at + 8 <= data.length; at += 4) {
    if (u32(data, at) === BLOCK_MARK && u32(data, at + 4) === BLOCK_MARK_2) blocks.push(at)
  }
  const out: NpcState[] = []
  blocks.forEach((block, index) => {
    const end = blocks[index + 1] ?? data.length
    let at = block + BLOCK_HEADER + 16
    while (at + 8 <= end) {
      const placed = u32(data, at) === STATE_MARK && u32(data, at + 4) === STATE_MARK_2
      const unplaced =
        !placed && u32(data, at) === UNPLACED_MARK && u32(data, at + 4) === UNPLACED_MARK_2
      if (!placed && !unplaced) {
        at += 4
        continue
      }
      const size = placed ? STATE_SIZE : UNPLACED_SIZE
      if (at + size > end) {
        throw new GameFormatError(
          `cast record at 0x${at.toString(16)} runs past the end of its block`,
          at,
        )
      }
      const words = new Uint32Array(7)
      for (let k = 0; k < 7; k++) words[k] = u32(data, at + 8 + 4 * k)
      out.push({
        block,
        offset: at,
        unknown_0x08: words,
        map: u32(data, at + 0x24),
        id: u32(data, at + 0x28),
        position: placed
          ? {
              x: view.getFloat32(at + 0x2c, true),
              y: view.getFloat32(at + 0x30, true),
              z: view.getFloat32(at + 0x34, true),
              facing: view.getFloat32(at + 0x38, true),
            }
          : undefined,
      })
      at += size
    }
  })
  return out
}

/** The cast, with each character's placement where the file gives one. */
export function placeNpcs(
  entries: readonly NpcEntry[],
  placements: readonly NpcPlacement[],
): { entry: NpcEntry; placement: NpcPlacement }[] {
  const byId = new Map<number, NpcPlacement>()
  // First placement wins: an id is not repeated on the cartridge, and taking
  // the first is the reproducible answer if one ever is.
  for (const placement of placements) if (!byId.has(placement.id)) byId.set(placement.id, placement)

  const out: { entry: NpcEntry; placement: NpcPlacement }[] = []
  for (const entry of entries) {
    const placement = byId.get(entry.id)
    // No placement means the character is put somewhere by an event instead.
    if (placement) out.push({ entry, placement })
  }
  return out
}

/**
 * One record of a `place.bin`, read as the table it is: its tag and its
 * values, each an integer (signed) or a float as the table's type bits say.
 * The game reads coordinates with the same call whichever they are, and some
 * are written as integers — Stornway's `5`, over 3.7 to 19.9, stands at
 * (−2, 0.15, −5).
 */
export interface PlaceRecord {
  readonly tag: number
  readonly values: readonly number[]
  /** Byte offset of the record, for anything that wants the rest of it. */
  readonly offset: number
}

/** Every record of a `place.bin`, in the file's order — see {@link castAtPoint}. */
export function readPlaceRecords(data: Uint8Array): PlaceRecord[] {
  return readDataTable(data).records.map((record) => ({
    tag: record.tag,
    values: [...record.values].map((value, i) =>
      record.kinds[i] === 2 ? (record.floats[i] as number) : value | 0,
    ),
    offset: record.offset,
  }))
}

/** A point of the story as `place.bin` compares them: stage, sub-stage and step. */
export interface PlacePoint {
  readonly major: number
  readonly minor: number
  readonly step: number
}

/** Where a character stands, as {@link castAtPoint} decides it. */
export interface CastPlacement {
  readonly id: number
  readonly map: number
  /** In the file's own units. */
  readonly x: number
  readonly y: number
  readonly z: number
  /** In radians about the vertical. */
  readonly facing: number
  /** The byte after the facing, where a record has one; not established. */
  readonly unknown_after: number | undefined
  /** The record that placed them, for anything that wants the rest of it. */
  readonly record: PlaceRecord
  /** Where the Hero can stand to talk to them, and the label each asks with — see {@link TalkBox}. */
  readonly boxes?: readonly TalkBox[]
}

/**
 * **A box round a character that the Hero talks to them from, and the label
 * the talk asks with** — `place.bin`'s tag 6 (US ARM9 `func_0206c4e8`): the
 * character, four floats and the label. The game keeps it on the character's
 * placement in this map, the first of their chain at the time, and its talk
 * target picker (ov017 `func_ov017_021a4e88`) takes a character whose box holds
 * the Hero — strictly inside, on the ground: `minX < x < maxX` and
 * `minZ < z < maxZ` — asking with its label. A thing to examine is talked to
 * only so. Yggdrasil's, `199, 3.24, 1.27, −3.36, −2.52, 80`, is why its talk
 * records name label 80. 570 on the cartridge.
 */
export interface TalkBox {
  readonly label: number
  /** In the file's own units, as a placement's. */
  readonly maxX: number
  readonly maxZ: number
  readonly minX: number
  readonly minZ: number
}

/** Whether a box holds a point on the ground, as the game tests it — see {@link TalkBox}. */
export function inTalkBox(box: TalkBox, x: number, z: number): boolean {
  return box.minX < x && x < box.maxX && box.minZ < z && z < box.maxZ
}

/** A talk box's record — see {@link TalkBox}. */
const TAG_TALK_BOX = 6

/** A block's opening record: a map, a character, and where they stand. */
const TAG_BLOCK = 3
/** A record over a span of the story. */
const TAG_SPAN = 5
/** A record that holds while flags do — see {@link castAtPoint}. */
const TAG_WHILE = 17
/** A record at one point of the story — see {@link castAtPoint}. */
const TAG_AT = 4

/**
 * Which bit of the game-wide bank an id names where a record names it by
 * number, as the game's `func_0206eb98` has it: below `0x400` the bit itself,
 * and from there displaced by 1,786 — the rule the script function `603`
 * follows too, so this bank is the one scenes read their "story flags" from.
 */
export function flagBit(id: number): number {
  return id < 0x400 ? id : id + 0x6fa
}

/**
 * **Who stands in `map` at `point`, as the game decides it** — read from its
 * code (US ARM9): the cast file's `place.bin` runs as a script (`func_0206da80`,
 * opcode table `0x020f0994`) whose records each place a character or take
 * them away, in the file's order.
 *
 * - **A block, tag 3** (`func_0206c010`): map, character, and then where they
 *   stand. For this map only; with no place given it takes them away.
 * - **A span, tag 5** (`func_0206c2c0`): from and to — stage, sub-stage and
 *   step each — then **the time of day** (0 by day, 1 by night, 2 either),
 *   then map and character, then where. It counts only while `from ≤ now ≤ to`,
 *   each taken as `major × 1000 + minor × 10 + step`, and only at its time of
 *   day. Then, **if it is for another map, it takes the character away from
 *   this one**; with no place given, it takes them away; otherwise it places
 *   them.
 *
 * A placement joins its character's others in an order (`func_0206db48`), and
 * the first of them is where they stand: a span over a sub-stage comes before
 * a block's; between spans, **the one that starts earliest**, then the first in
 * the file; between blocks, the first. A point's (tag 4) goes with the spans
 * that end at a sub-stage 0, the first in the file first. One that comes
 * after all the others is dropped. Taking a character away (`func_0206dd68`) clears where they stand,
 * and a later record can place them again.
 *
 * - **While flags hold, tag 17** (`func_0206d4e0`): pairs of a condition and
 *   whether it must be set (1) or clear (0) — a game-wide flag by its bit when
 *   the condition's high half is 1, by its number (see {@link flagBit}) when 2;
 *   any other and the record does not count — then the time of day, map,
 *   character and where, as a span's. A placement so **comes before all
 *   others**. The Quarantomb's `29` stands in `7401` while flag 89 is set and
 *   in `7402` while 90 is, which its triggers set and clear.
 *
 * - **At one point, tag 4** (`func_0206c0f8`): stage, sub-stage and step,
 *   which must all be now's, then the time of day, map, character and where,
 *   as a span's. Coffinwell's `26` is placed only so: in the scholar's house
 *   (1311) at 4.1 steps 1 and 2, outdoors at step 3.
 * - **A talk box, tag 6** — see {@link TalkBox}: kept on the placement.
 *
 * The other tags — 14 places a character by one of four states of a quest
 * (`func_0206e120`; see `lineFor` in `apps/game`), and 8, 11, 15 and 18 to
 * 22 — are not read. So a character placed only by them stands nowhere here.
 *
 * `isSet` answers for a game-wide flag by its bit; without it, every flag is
 * clear, as in a new game.
 */
export function castAtPoint(
  records: readonly PlaceRecord[],
  map: number,
  point: PlacePoint,
  night: boolean,
  isSet: (bit: number, wanted: boolean) => boolean = (_, wanted) => !wanted,
): Map<number, CastPlacement> {
  interface Candidate {
    placement: CastPlacement
    /** The game's order of kinds: 3 a span into a sub-stage 0, 4 a span, 5 a block. */
    readonly kind: number
    readonly from: number
    readonly index: number
  }
  const weigh = (major: number, minor: number, step: number) => major * 1000 + minor * 10 + step
  const now = weigh(point.major, point.minor, point.step)
  const chains = new Map<number, Candidate[]>()
  const add = (candidate: Candidate) => {
    const id = candidate.placement.id
    const chain = chains.get(id)
    if (!chain) {
      chains.set(id, [candidate])
      return
    }
    const beats = (other: Candidate) =>
      candidate.kind < other.kind ||
      (candidate.kind === other.kind &&
        (candidate.kind === 4
          ? candidate.from < other.from ||
            (candidate.from === other.from && candidate.index < other.index)
          : candidate.index < other.index))
    const at = chain.findIndex(beats)
    if (at >= 0) chain.splice(at, 0, candidate)
  }
  const place = (
    record: PlaceRecord,
    id: number,
    at: number,
    kind: number,
    from: number,
    index: number,
  ) => {
    const v = record.values
    add({
      placement: {
        id,
        map,
        x: v[at] as number,
        y: v[at + 1] as number,
        z: v[at + 2] as number,
        facing: v[at + 3] as number,
        unknown_after: v[at + 4],
        record,
      },
      kind,
      from,
      index,
    })
  }

  records.forEach((record, index) => {
    const v = record.values
    if (record.tag === TAG_TALK_BOX) {
      // On the first placement of the character's chain in this map, now.
      const first = chains.get(v[0] as number)?.[0]
      if (!first || v.length < 6) return
      const box: TalkBox = {
        maxX: v[1] as number,
        maxZ: v[2] as number,
        minX: v[3] as number,
        minZ: v[4] as number,
        label: v[5] as number,
      }
      first.placement = { ...first.placement, boxes: [...(first.placement.boxes ?? []), box] }
      return
    }
    if (record.tag === TAG_WHILE) {
      // The pairs, as the game counts them: an odd count has no byte after the facing.
      const count = v.length
      if (count < 9) return
      const pairs = Math.trunc((count - (count % 2 === 0 ? 8 : 7)) / 2)
      for (let i = 0; i < pairs; i++) {
        const condition = v[2 * i] as number
        const wanted = (v[2 * i + 1] as number) !== 0
        const kind = condition >>> 16
        const arg = condition & 0xffff
        if (kind === 1) {
          if (!isSet(arg, wanted)) return
        } else if (kind === 2) {
          if (!isSet(flagBit(arg), wanted)) return
        } else return
      }
      const at = 2 * Math.max(0, pairs)
      const time = v[at] as number
      if ((time === 1 && !night) || (time === 0 && night)) return
      const where = v[at + 1] as number
      const id = v[at + 2] as number
      if (where !== map || count - at - 3 < 4) {
        chains.delete(id)
        return
      }
      place(record, id, at + 3, 0, 0, index)
      return
    }
    if (record.tag === TAG_AT) {
      if (v.length < 6) return
      const [major, minor, step, time, where, id] = v as number[]
      if (major !== point.major || minor !== point.minor || step !== point.step) return
      if ((time === 1 && !night) || (time === 0 && night)) return
      if (where !== map || v.length < 7) {
        chains.delete(id as number)
        return
      }
      // Ordered as a span that ends at a sub-stage 0, by its minor alone.
      place(record, id as number, 6, minor !== 0 ? 3 : 5, now, index)
      return
    }
    if (record.tag === TAG_BLOCK) {
      if (v[0] !== map) return
      const id = v[1] as number
      if (v.length < 3) chains.delete(id)
      else place(record, id, 2, 5, 0, index)
      return
    }
    if (record.tag !== TAG_SPAN || v.length < 9) return
    const [fromMajor, fromMinor, fromStep, toMajor, toMinor, toStep, time, where, id] =
      v as number[]
    const from = weigh(fromMajor as number, fromMinor as number, fromStep as number)
    const to = weigh(toMajor as number, toMinor as number, toStep as number)
    if (now < from || to < now) return
    if ((time === 1 && !night) || (time === 0 && night)) return
    if (where !== map || v.length < 10) {
      chains.delete(id as number)
      return
    }
    const kind = fromMinor !== 0 && toMinor === 0 ? 3 : toMinor !== 0 ? 4 : 5
    place(record, id as number, 9, kind, from, index)
  })

  const standing = new Map<number, CastPlacement>()
  for (const [id, chain] of chains) {
    const first = chain[0]
    if (first) standing.set(id, first.placement)
  }
  return standing
}
