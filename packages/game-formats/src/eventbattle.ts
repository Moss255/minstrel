import { GameFormatError } from './errors.ts'

/**
 * The game's set battles: `/data/event/eventbattle.bin`. See FORMAT.md, "Event
 * battles".
 *
 * | where | what |
 * |---|---|
 * | `+0x00` | `u32` the record count |
 * | `+0x04` | `u32` the file's size |
 * | `+0x08` | 8 bytes, zero on the cartridge, not read |
 * | `+0x10` | the records, {@link RECORD_SIZE} bytes each |
 *
 * A record opens with the two words {@link RECORD_TAG} and
 * {@link RECORD_TAG_2}, then its index as a `u32`, then three slots of a `u32`
 * monster and a `u32` count — `0xffffffff` for an empty slot — then the
 * battle's track and its stage, both INFERRED from the values (see each).
 */
export interface EventBattle {
  /** What a trigger record's battle word names: not the record's place in the file. */
  readonly index: number
  /** The monsters, by their number in the monster data, and how many of each. */
  readonly foes: readonly { readonly monster: number; readonly count: number }[]
  /**
   * `+0x24`, the track the battle plays — an index into `bgm.sdat`'s sequence
   * list, as `MapEntry.music` is. INFERRED, 29 September 2026: 23 to 38, 23 the
   * ordinary battles' and 24 the bosses', and on 75 of the 82 battles with a
   * stage the stage's own track; the Flying Corvus's is 26, as its stage's is.
   */
  readonly music: number
  /**
   * `+0x28`, the map the battle is fought on, by its id in the map list, or 0
   * for none — the stage the ground names, as an ordinary battle's is. INFERRED,
   * 29 September 2026: 82 of the 98 name a `B` map, and each one's label names
   * the battle's own foe — index 2, Hexagoon, names `B02M15`, "D01 - Hexagoon";
   * 19, King Godwyn, `B06M03`, "C04 - King Godwyn". The code that reads it is
   * not read. FORMAT.md, "Where a battle is fought".
   */
  readonly stage: number
}

const HEAD_SIZE = 0x10
const RECORD_SIZE = 44
const RECORD_TAG = 0x55090064
const RECORD_TAG_2 = 0xffff0155
const SLOTS = 3
const EMPTY = 0xffffffff

/** Parse `eventbattle.bin`. */
export function readEventBattles(bytes: Uint8Array): EventBattle[] {
  if (bytes.length < HEAD_SIZE) {
    throw new GameFormatError(`event battles: ${bytes.length} bytes, shorter than the head`)
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const count = view.getUint32(0, true)
  const size = view.getUint32(4, true)
  if (size !== bytes.length) {
    throw new GameFormatError(
      `event battles: the head says ${size} bytes, the file is ${bytes.length}`,
      4,
    )
  }
  if (HEAD_SIZE + count * RECORD_SIZE > bytes.length) {
    throw new GameFormatError(`event battles: ${count} records run past the end`, 0)
  }
  const battles: EventBattle[] = []
  for (let r = 0; r < count; r++) {
    const at = HEAD_SIZE + r * RECORD_SIZE
    if (view.getUint32(at, true) !== RECORD_TAG || view.getUint32(at + 4, true) !== RECORD_TAG_2) {
      throw new GameFormatError(`event battles: record ${r} does not open with its tag`, at)
    }
    const foes: { monster: number; count: number }[] = []
    for (let s = 0; s < SLOTS; s++) {
      const monster = view.getUint32(at + 12 + s * 8, true)
      if (monster !== EMPTY) foes.push({ monster, count: view.getUint32(at + 16 + s * 8, true) })
    }
    battles.push({
      index: view.getUint32(at + 8, true),
      foes,
      music: view.getUint32(at + 36, true),
      stage: view.getUint32(at + 40, true),
    })
  }
  return battles
}
