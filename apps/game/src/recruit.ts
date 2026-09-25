import { type Member, PARTY_MOST, VOCATIONS_ALWAYS } from './companion.ts'

/**
 * Patty's Party Planning Place — where a party of four is actually made.
 *
 * Read 25 September 2026 from **service 23**, a sixteen-step flow in overlay 3
 * at `0x0217ff68`; see `docs/party-and-vocations.md`. What is here is the
 * *model* those steps move between. The screen is `patty.ts`'s.
 *
 * **Her list and the character record array are the same thing.** Overlay 9
 * files a new character with `func_02086778`, which appends to the thirteen
 * records at `GameState+0x3984` and bumps the count at `+0x5690`; dropping
 * somebody off appends to the same array and calling them up removes them
 * from it. The party is the four slots at `+0x397c` naming ids within it.
 *
 * So a character is either **in the party** or **on the list**, never both,
 * and that is the whole of the arrangement.
 */

/**
 * The vocations Patty offers, which are **the six a game begins with** —
 * window 8's items are Warrior, Priest, Mage, Martial Artist, Thief and
 * Minstrel.
 *
 * The same six Alltrades writes into its list with no gate at all. That two
 * different flows, read months apart, agree on the same six is a good
 * independent check on the numbering.
 */
export const RECRUIT_VOCATIONS = VOCATIONS_ALWAYS

/**
 * The most characters the list holds.
 *
 * The game computes `min(n + 8, 12)` (`func_ov003_02160c58`), where `n` is a
 * word at `GameState+0x3974` that has **not been identified** — so the list
 * grows from 8 to 12 as something happens. Twelve is the ceiling and is what
 * is used here; the growth is not modelled, and a smaller cap would refuse
 * recruits the game would allow.
 */
export const LIST_MOST = 12

/** Everyone who is not in the party, and how many more will fit. */
export interface Roster {
  /** The party, the Hero first — up to {@link PARTY_MOST}. */
  readonly party: readonly Member[]
  /** Those left with Patty — up to {@link LIST_MOST}. */
  readonly kept: readonly Member[]
}

/** Whether the party has room for one more. `cmp r0, #4` at `0x021621a4` and three more places. */
export const partyHasRoom = (roster: Roster): boolean => roster.party.length < PARTY_MOST

/** Whether the list has room. Refused with message 23 when recruiting, 69 when dropping off. */
export const listHasRoom = (roster: Roster): boolean => roster.kept.length < LIST_MOST

/**
 * What Patty says she cannot do, and why — her own message numbers in
 * `str_lui`. Undefined means she can.
 */
export const PATTY_SAYS = {
  /** "Hey there! … So, what can I do for you, sweetie?" */
  greeting: 0,
  /** "Let me tell you who's hanging out here right now." */
  whoIsHere: 4,
  /** "you've got a whole bunch of people with you already" — the party is full. */
  partyFull: 6,
  /** "So, who do you wanna drop off with me, then?" */
  whoToDrop: 7,
  /** "I hear ya! Hey, <TARGET>! You're up!" */
  comeUp: 8,
  /** "<Cap><TARGET>, it's time you took a break." */
  takeABreak: 11,
  /** "You wanna leave <TARGET> with me in that state!?" — they are down. */
  notWhileDown: 12,
  /** "<Cap><TARGET> leaves the party." */
  leaves: 13,
  /** "So, you wanna apply for a new party member, huh?" */
  whatKind: 19,
  /** "are you hoping <IF_TARGET_M>he…'ll join your party right now?" */
  joinNow: 21,
  /** "All done. Your application has been processed!" */
  processed: 22,
  /** "you've already applied for as many new party members as you can have" */
  listFull: 23,
  /** "Sorry, honey. Your list's full already, so I can't take anyone from your party." */
  listFullToDrop: 69,
  /** "<Cap><TARGET> joins the party!" */
  joins: 80,
  /** "Now you can call <TARGET> up any time you like, okay?" */
  waitingForYou: 90,
} as const

/**
 * Her menu's labels, by their number in `bm_lui` — the same `0x67` table
 * shape as the pot's. **Not copied here**: `Loaded.pattyLabels` holds the
 * words.
 *
 * The file lists all twelve vocations at 18 to 29, though her window offers
 * only the first six — which is why {@link RECRUIT_VOCATIONS} is six and this
 * is where a name for any of them comes from.
 */
export const PATTY_LABELS = {
  callUp: 2,
  dropOff: 3,
  recruit: 5,
  partWith: 6,
  vocation: 17,
  /** Warrior at 18, through Ranger at 29 — vocation `v` is `17 + v`. */
  firstVocation: 18,
  level: 13,
  recruited: 14,
  yes: 30,
} as const

/**
 * **Patty's own word for Cancel is not established.** Her window's item 186
 * is it, but the item ids map through `bm_lui_txt` to text ids and that
 * mapping is not read — so her lists say "Cancel" in ours rather than borrow
 * a number from another file. `bm_rrb` 3 *is* "Cancel", and using it here
 * printed "Drop Off a Friend", which is `bm_lui` 3: a label id belongs to the
 * file it came from.
 */

/** A vocation's name in Patty's own words: `bm_lui` 17 + the vocation. */
export const pattyVocation = (vocation: number) => PATTY_LABELS.firstVocation + vocation - 1

/** Why Patty refuses, by her own message number; undefined when she does not. */
export type Refusal = number | undefined

/**
 * Put a newly made character on the list — what overlay 9 does when it has
 * finished asking.
 *
 * **They go on the list, not into the party.** Patty then asks whether they
 * should join now, which is {@link callUp}'s business.
 */
export function applyFor(roster: Roster, made: Member): { roster: Roster; refused: Refusal } {
  if (!listHasRoom(roster)) return { roster, refused: PATTY_SAYS.listFull }
  return { roster: { ...roster, kept: [...roster.kept, made] }, refused: undefined }
}

/** Take somebody off the list and into the party — "Call Up a Friend". */
export function callUp(roster: Roster, at: number): { roster: Roster; refused: Refusal } {
  const who = roster.kept[at]
  if (!who) return { roster, refused: undefined }
  if (!partyHasRoom(roster)) return { roster, refused: PATTY_SAYS.partyFull }
  return {
    roster: {
      party: [...roster.party, who],
      kept: roster.kept.filter((_, i) => i !== at),
    },
    refused: undefined,
  }
}

/**
 * Leave somebody with Patty — "Drop Off a Friend".
 *
 * **The Hero cannot be dropped**, being party slot 0 and the one the world
 * talks to; and somebody who is down cannot, which is Patty's own refusal:
 * "Does this place look like a morgue? Take him to a church and do the right
 * thing first."
 */
export function dropOff(
  roster: Roster,
  at: number,
  isDown: (member: Member) => boolean = () => false,
): { roster: Roster; refused: Refusal } {
  const who = roster.party[at]
  if (!who || at === 0) return { roster, refused: undefined }
  if (isDown(who)) return { roster, refused: PATTY_SAYS.notWhileDown }
  if (!listHasRoom(roster)) return { roster, refused: PATTY_SAYS.listFullToDrop }
  return {
    roster: {
      party: roster.party.filter((_, i) => i !== at),
      kept: [...roster.kept, who],
    },
    refused: undefined,
  }
}

/**
 * Take somebody off the list for good — "Part With a Friend".
 *
 * "You know you'll never see each other again, right? That's just how it
 * works." Patty gives back what they were carrying; the bag is the caller's
 * business, not this one's.
 */
export function partWith(roster: Roster, at: number): { roster: Roster; refused: Refusal } {
  if (!roster.kept[at]) return { roster, refused: undefined }
  return { roster: { ...roster, kept: roster.kept.filter((_, i) => i !== at) }, refused: undefined }
}
