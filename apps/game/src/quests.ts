import {
  QUEST_CLEARED,
  QUEST_DELIVERED,
  QUEST_OFFERED,
  QUEST_SLOTS,
  QUEST_TAKEN,
  type QuestAction,
  type QuestGiver,
} from '@minstrel/game-formats'

/**
 * **The quests**, as the game keeps them — read from its code (US ARM9) on 28
 * September 2026; FORMAT.md, "Quests", has the functions.
 *
 * - **A nibble per quest**, 204 of them: a state — 0 not on offer, 1 on offer,
 *   2 taken, 3 cleared — and two flags, the second the quest's having been
 *   delivered by the online service. See `QUEST_OFFERED` and the rest.
 * - **The log**: the quests taken, eight at most (`func_020961b0` refuses a
 *   ninth), each with a progress of 0 to 7 that `144` sets.
 * - **Offering** is the talk's: talking to someone runs the offer over the
 *   map's givers (`func_02095924`) before their records and lines are asked,
 *   and the lines and records then read the states it left.
 */
export interface QuestBook {
  /** Each quest's nibble, by its number. */
  readonly nibbles: Uint8Array
  /** The quests taken, in the order taken. */
  readonly log: readonly QuestEntry[]
  /** When each cleared quest was, as the game keeps the clock's date and time (`127`). */
  readonly cleared: ReadonlyMap<number, string>
}

export interface QuestEntry {
  readonly quest: number
  /** 0 to 7 — see `OP_QUEST_PROGRESS`. */
  readonly progress: number
}

/** How many quests the log holds (`func_020961b0`). */
export const LOG_MOST = 8

export function newQuestBook(): QuestBook {
  return { nibbles: new Uint8Array(QUEST_SLOTS), log: [], cleared: new Map() }
}

/** A quest's nibble; 0 for a number the game keeps none for. */
export function questNibble(book: QuestBook, quest: number): number {
  return quest >= 0 && quest < QUEST_SLOTS ? (book.nibbles[quest] ?? 0) : 0
}

/** The book with a quest's state (its low two bits) set, its flags kept (`func_0206e164`). */
function withState(book: QuestBook, quest: number, state: number): QuestBook {
  if (quest < 0 || quest >= QUEST_SLOTS) return book
  const nibbles = book.nibbles.slice()
  nibbles[quest] = ((nibbles[quest] ?? 0) & 0xc) | (state & 3)
  return { ...book, nibbles }
}

/**
 * The givers the game keeps for a map, as its loader does (`func_02094d88`):
 * those for the map — for 50101 on any of the Quester's Rest's floors, 50101
 * to 50405 — once the story's major and minor have reached theirs, and their
 * prerequisite is cleared. In the file's order.
 */
export function giversFor(
  book: QuestBook,
  givers: readonly QuestGiver[],
  map: number,
  major: number,
  minor: number,
): QuestGiver[] {
  const questersRest = map >= 0xc3b5 && map <= 0xc3b5 + 0x130
  return givers.filter(
    (giver) =>
      (giver.map === map || (questersRest && giver.map === 0xc3b5)) &&
      giver.major * 100 + giver.minor <= major * 100 + minor &&
      (giver.after === undefined || (questNibble(book, giver.after) & 3) === QUEST_CLEARED),
  )
}

/**
 * **The offer, as talking runs it** (`func_02095924`): over the map's givers
 * for the one talked to, in order — one that wants delivering, and is not, is
 * passed; whose conditions hold puts its quest on offer if it is at 0 or 1,
 * and that ends it (a taken or cleared one is passed); whose
 * conditions do not hold takes its quest back to 0 unless it is taken or
 * cleared. The first quest put on offer, or undefined.
 */
export function offerFor(
  book: QuestBook,
  givers: readonly QuestGiver[],
  character: number,
  holds: (giver: QuestGiver) => boolean,
): { readonly book: QuestBook; readonly offered: number | undefined } {
  let now = book
  for (const giver of givers) {
    if (giver.character !== character) continue
    const nibble = questNibble(now, giver.quest)
    if (giver.downloaded && (nibble & QUEST_DELIVERED) === 0) continue
    const state = nibble & 3
    if (holds(giver)) {
      if (state === 0 || state === QUEST_OFFERED) {
        return { book: withState(now, giver.quest, QUEST_OFFERED), offered: giver.quest }
      }
    } else if (state !== QUEST_CLEARED && state !== QUEST_TAKEN) {
      now = withState(now, giver.quest, 0)
    }
  }
  return { book: now, offered: undefined }
}

/**
 * A record's quest actions, run in its order — see `QuestAction`. Accepting
 * one when the log holds eight does nothing. `when` is the clock's reading for
 * a clear.
 */
export function questsAfter(
  book: QuestBook,
  actions: readonly QuestAction[],
  when: string,
): QuestBook {
  let now = book
  for (const action of actions) {
    const { quest } = action
    if (action.does === 'offer') now = withState(now, quest, QUEST_OFFERED)
    else if (action.does === 'accept') {
      if (now.log.some((entry) => entry.quest === quest)) continue
      if (now.log.length >= LOG_MOST) continue
      now = withState({ ...now, log: [...now.log, { quest, progress: 0 }] }, quest, QUEST_TAKEN)
    } else if (action.does === 'clear') {
      const cleared = new Map(now.cleared)
      cleared.set(quest, when)
      now = withState(
        { ...now, log: now.log.filter((entry) => entry.quest !== quest), cleared },
        quest,
        QUEST_CLEARED,
      )
    } else if (action.does === 'progress') {
      if ((questNibble(now, quest) & 3) !== QUEST_TAKEN) continue
      now = {
        ...now,
        log: now.log.map((entry) =>
          entry.quest === quest ? { ...entry, progress: action.value & 7 } : entry,
        ),
      }
    }
  }
  return now
}

/** The book with every downloadable quest delivered — what the online service did, a quest at a time. */
export function deliverAll(book: QuestBook, givers: readonly QuestGiver[]): QuestBook {
  const nibbles = book.nibbles.slice()
  for (const giver of givers) {
    if (giver.downloaded && giver.quest >= 0 && giver.quest < QUEST_SLOTS) {
      nibbles[giver.quest] = (nibbles[giver.quest] ?? 0) | QUEST_DELIVERED
    }
  }
  return { ...book, nibbles }
}
