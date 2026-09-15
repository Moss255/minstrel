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
 * monster and a `u32` count — `0xffffffff` for an empty slot — then two `u32`s
 * not established.
 */
export interface EventBattle {
  /** What a trigger record's battle word names: not the record's place in the file. */
  readonly index: number
  /** The monsters, by their number in the monster data, and how many of each. */
  readonly foes: readonly { readonly monster: number; readonly count: number }[]
  /** `+0x24`. Not established. */
  readonly unknown_0x24: number
  /** `+0x28`. Not established. */
  readonly unknown_0x28: number
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
      unknown_0x24: view.getUint32(at + 36, true),
      unknown_0x28: view.getUint32(at + 40, true),
    })
  }
  return battles
}
