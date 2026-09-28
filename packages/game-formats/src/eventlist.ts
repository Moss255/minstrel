import { GameFormatError } from './errors.ts'
import { KIND_NUMBER, KIND_STRING, textAt } from './events.ts'
import { readDataTable } from './table.ts'

/**
 * The event lists — `data/event/eventlist6.bin`, `data/evspt_lv5/eventlist_lv5.bin`
 * and `data/event/evl_quest.bin` — which give **each scene the map it plays
 * in**.
 *
 * Read from the game's code (overlay 17). A scene's task opens the list by its
 * number (`func_ov017_021bbc10`): below 21,000 `eventlist6`, below 40,000
 * `eventlist_lv5`, from there `evl_quest`. It runs the list as a script
 * (`func_02071488`, one opcode, 102, at `func_02071208`), whose records each
 * describe a scene, and keeps the one whose event is the scene's. **If that
 * record's map is not the map the Hero is in, the scene does not play there**
 * (`func_ov017_021bbfc4`): it fills the map-change request with the map and
 * the event (`func_0200fd0c`), and ends, so the map changes and the scene plays
 * in its own. A script a scene chains into (`538`) goes back through the same
 * start, so a chain moves the Hero from map to map. See FORMAT.md, "The event
 * lists".
 *
 * Only what the code was seen to use is named; the rest is carried.
 */
export interface EventListEntry {
  /** The scene, by number — what the list is searched by. */
  readonly event: number
  /** The map it plays in, by the map index's id — see {@link EventListEntry.here}. */
  readonly map: number
  /**
   * Bit `0x80` of its flags: it plays wherever the Hero is, the map taken from
   * the scene's own object rather than {@link EventListEntry.map}.
   */
  readonly here: boolean
  /** Its flags word, the record's 22nd value, kept at `+0x44`. Only `0x80` is read. */
  readonly unknown_flags: number
  /** The script file, `ev05110.stb`. */
  readonly script: string | undefined
  /** Every value of the record, strings as offsets, floats as floats. */
  readonly values: readonly number[]
}

/** The record tag a scene's entry has. */
const TAG_EVENT = 102
/** The value an entry's event is, its map, and its flags word. */
const SLOT_MAP = 4
const SLOT_EVENT = 5
const SLOT_SCRIPT = 8
const SLOT_FLAGS = 21
/** Flag: plays where the Hero is. */
const FLAG_HERE = 0x80

/** Read one event list. An empty file lists nothing. */
export function readEventList(data: Uint8Array): EventListEntry[] {
  if (data.length === 0) return []
  const table = readDataTable(data)
  const out: EventListEntry[] = []
  for (const record of table.records) {
    if (record.tag !== TAG_EVENT) continue
    const kinds = record.kinds
    if (
      record.values.length <= SLOT_FLAGS ||
      kinds[SLOT_MAP] !== KIND_NUMBER ||
      kinds[SLOT_EVENT] !== KIND_NUMBER ||
      kinds[SLOT_FLAGS] !== KIND_NUMBER
    ) {
      throw new GameFormatError(
        `event list record at 0x${record.offset.toString(16)} has ${record.values.length} values, not a scene's`,
        record.offset,
      )
    }
    const values = Array.from(record.values, (v, i) =>
      record.kinds[i] === 2 ? (record.floats[i] as number) : v | 0,
    )
    const flags = values[SLOT_FLAGS] as number
    out.push({
      event: values[SLOT_EVENT] as number,
      map: values[SLOT_MAP] as number,
      here: (flags & FLAG_HERE) !== 0,
      unknown_flags: flags,
      script:
        kinds[SLOT_SCRIPT] === KIND_STRING
          ? textAt(table, data, record, record.values[SLOT_SCRIPT] as number)
          : undefined,
      values,
    })
  }
  return out
}

/** Which list a scene's entry is in, by its number — see {@link EventListEntry}. */
export function eventListFor(event: number): 'eventlist6' | 'eventlist_lv5' | 'evl_quest' {
  if (event < 21_000) return 'eventlist6'
  if (event < 40_000) return 'eventlist_lv5'
  return 'evl_quest'
}
