import { GameFormatError } from './errors.ts'
import { readDataTable } from './table.ts'

/**
 * **The quests' files** — `data/scenario/questorder3.bin`, `questidtbl.bin`
 * and `questmsg.gp2`'s `questmsg_en.bin` — each a data table (see
 * `readDataTable`), read from the game's code on 28 September 2026. See
 * FORMAT.md, "Quests".
 */

/** How many quests the game keeps a state for: 204 (`func_0206e120` refuses 0xcc and on). */
export const QUEST_SLOTS = 0xcc

/** `questorder3`'s record: one quest's giver. */
const TAG_GIVER = 0x66
/** `questidtbl`'s record: a quest and its number in `questmsg`. */
const TAG_QUEST_ID = 0x68
/** `questmsg`'s record: a quest's texts. */
const TAG_QUEST_TEXT = 0x67

/**
 * Who offers a quest, where and when — a record of `questorder3.bin`, as the
 * game's loader reads it (US ARM9 `func_02094d88`, run as the tag-`0x66`
 * opcode of a script over the file each time a map loads, `func_02095578`).
 * The loader keeps a record only for the map it loads, once the story has
 * reached the record's stage and its prerequisite is cleared; the talk then
 * offers from them (`func_02095924`) — see `quests.ts` in the game.
 */
export interface QuestGiver {
  readonly quest: number
  /**
   * The map, by its id. A record for 50101, the Quester's Rest's first floor,
   * holds on all four of its floors, 50101 to 50405 (`0xc3b5` and 0x130 on).
   */
  readonly map: number
  /** The character who offers it, by their id in the map's cast. */
  readonly character: number
  /** The story's major and minor stage from which it is offered. */
  readonly major: number
  readonly minor: number
  /**
   * Bit 9, not established: the offer passes a record without it to a guest
   * in a session, and tests it again for a cleared quest, which it passes
   * either way. 171 of 184 have it.
   */
  readonly unknown_9: boolean
  /** The quest that must be cleared first, or undefined for none. */
  readonly after: number | undefined
  /** Bit 11, not established: tested only for a cleared quest, which the offer passes either way. */
  readonly unknown_11: boolean
  /**
   * Bit 10: offered only once the quest has been **delivered** — its second
   * flag (`func_0206e2dc`), which only the online service's code sets (overlay
   * 23, `0x021f5a74`; overlay 17 copies it from another console). 64 quests:
   * the ones the game got by download.
   */
  readonly downloaded: boolean
  /** Bits 12 and 13, not read. */
  readonly unknown_12: boolean
  readonly unknown_13: boolean
  /**
   * Conditions, as trigger words, that must hold for it to be offered —
   * parsed by the trigger parser itself (`func_0205ec70`). Raw values, one
   * per word, as `Trigger.values` hold them.
   */
  readonly conditions: readonly number[]
}

/**
 * Read `questorder3.bin`. A record of fewer than eleven values is left out:
 * the file's first, quest 0's, has six and names map 1, which no map is —
 * a placeholder, INFERRED. What the loader would make of it is not read.
 */
export function readQuestGivers(data: Uint8Array): QuestGiver[] {
  const table = readDataTable(data)
  if (table.withTag(TAG_GIVER).length === 0) {
    throw new GameFormatError('quest givers: no record with tag 0x66')
  }
  return table.withTag(TAG_GIVER).flatMap((record) => {
    const v = [...record.values].map((value) => value | 0)
    if (v.length < 11) return []
    const at = (i: number) => v[i] as number
    const giver: QuestGiver = {
      quest: at(0),
      map: at(1),
      character: at(2),
      major: at(3),
      minor: at(4),
      unknown_9: at(5) !== 0,
      after: at(6) < 0 ? undefined : at(6),
      unknown_11: at(7) !== 0,
      downloaded: at(8) !== 0,
      unknown_12: at(9) !== 0,
      unknown_13: at(10) !== 0,
      conditions: v.slice(11).map((value) => value >>> 0),
    }
    return [giver]
  })
}

/** Read `questidtbl.bin`: each quest's number in `questmsg`, by the quest. */
export function readQuestIds(data: Uint8Array): Map<number, number> {
  const out = new Map<number, number>()
  for (const record of readDataTable(data).withTag(TAG_QUEST_ID)) {
    const [quest, number] = [...record.values].map((value) => value | 0)
    if (quest === undefined || number === undefined) continue
    out.set(quest, number)
  }
  return out
}

/**
 * A quest's texts in `questmsg`, by the number `questidtbl` gives it: its
 * name, then eleven more. **What each is for is INFERRED** from reading them:
 * `texts[0]` as it is offered, `texts[1]` to `[8]` by the quest's progress 0
 * to 7 (see `144`) — "The Puff-Puff Performance"'s second says the goods are
 * got and to go for the reward — `texts[9]` once cleared, `texts[10]` a hint
 * before it is found. Unused ones are undefined.
 */
export interface QuestText {
  readonly number: number
  readonly name: string
  readonly texts: readonly (string | undefined)[]
}

/** Read `questmsg_<lang>.bin`, by the number each quest's texts are under. */
export function readQuestTexts(data: Uint8Array): Map<number, QuestText> {
  const table = readDataTable(data)
  const out = new Map<number, QuestText>()
  for (const record of table.withTag(TAG_QUEST_TEXT)) {
    const v = [...record.values].map((value) => value | 0)
    const number = v[0]
    const name = v[1] === undefined ? undefined : table.stringAt(v[1])
    if (number === undefined || name === undefined) continue
    out.set(number, {
      number,
      name,
      texts: v.slice(2).map((offset) => (offset < 0 ? undefined : table.stringAt(offset))),
    })
  }
  return out
}
