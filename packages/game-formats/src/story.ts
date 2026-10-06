import { flagBit } from './npc.ts'
import type { Trigger } from './triggers.ts'

/**
 * What a trigger record's words say about the story: which point it sets once
 * an event has played, which flags it sets and tests, and where it goes on.
 * See FORMAT.md, "Triggers", "The words"; every reading here is **INFERRED**,
 * each with the measure behind it there.
 *
 * A word is an integer the record carries past its head: an operation, its
 * high half, and an argument, its low.
 */

export interface TriggerWord {
  readonly op: number
  readonly arg: number
}

/** A trigger record's words, integers only: the floats some carry are not words. */
export function triggerWords(trigger: Trigger): TriggerWord[] {
  const words: TriggerWord[] = []
  for (let i = 0; i < trigger.values.length; i++) {
    if (trigger.kinds[i] !== 1) continue
    const value = trigger.values[i] as number
    words.push({ op: value >>> 16, arg: value & 0xffff })
  }
  return words
}

/** Value 5 of an event's own record: 646 of them, every one naming its event with {@link OP_EVENT_OF}. */
export const KIND_EVENT = 11
/** The event an event's own record is about. */
export const OP_EVENT_OF = 8
/**
 * Sets the story to the three values the next three words hold, each as an
 * operation-0 word: its major and minor stage and a step. On 166 of the 170
 * that are so, the stage is the record's own, the next minor stage or the next
 * major; and the steps under one stage run without a gap on 96 of 99.
 *
 * **The live thread's stage**, read from the game's code: the action
 * interpreter's case for 132 (US ARM9 `0x02062644`) queues the move, and the
 * story is five threads of which the map decides one — see
 * {@link OP_THREAD_STAGE_TO} and FORMAT.md, "Triggers, read from the game's code".
 */
export const OP_STAGE_TO = 132
/**
 * Sets thread *n*'s stage, *n* its argument, to the three values the next three
 * words hold, as {@link OP_STAGE_TO} does the live thread's. Read from the
 * game's code (US ARM9 `0x02063e40`, a queued move like 132's, without its
 * clearing of flags). `ev25524` at 5.2 starts all five threads: 0 at 7.1, 1 at
 * 6.1, 2 at 8.1, 3 at 11.1, 4 at 12.1 — and each thread's maps, which the
 * game's code lists, are where that chapter's records are.
 */
export const OP_THREAD_STAGE_TO = 214
/** Sets a story flag. What {@link OP_IF_FLAG} and {@link OP_UNLESS_FLAG} test: 518 of their 664 have a record setting that flag in the same area and stage. */
export const OP_SET_FLAG = 104
/** Holds only when the flag is set. */
export const OP_IF_FLAG = 4
/** Holds only when the flag is not set. */
export const OP_UNLESS_FLAG = 5
/** Goes on to a map, by its id, and the event the next word names, as its operation with an argument of 0. 16 of 29 land on an event defined in that map. */
export const OP_THEN_MAP = 133
/** The event a record plays — a character's when talked to, a map's on entering it. */
export const OP_EVENT = 119
/**
 * On an event's own record, brings an attending character into the party —
 * INFERRED: the argument is their place in `attnpc`, counted from 0. The three
 * events whose own text says who joins carry that one's: `ev02210`, "Ivor joins
 * the party", `205:1`; `ev04080`, Dr Phlegming, `205:2`; `ev28991`, Sterling,
 * `205:3`. On a character's record (31 of them) it is not read.
 */
export const OP_JOIN = 205
/**
 * On an event's own record, sends whoever goes along away — INFERRED: all 6
 * such records carry it with 1 — two in Ivor's stretch, one at 4.6 after Dr
 * Phlegming joins at 4.5, three in Sterling's at 14.4 — so the 1 does not name
 * who. Ivor's two, `ev22591` and `ev02400`, are where a let's play shows him
 * go: on ahead to the landslide, and home with his father. On a character's
 * record (35 of them) it is not read.
 */
export const OP_LEAVE = 204
/**
 * Value 5 of a record that acts on entering a map — INFERRED: its first word,
 * {@link OP_ENTERED}, names the record's own map on 244 of the 249, and 49 of
 * them play an event, 24 only while a flag holds — as the pass's does at 2.2:
 * "Finally! We're here at last."
 */
export const KIND_ENTRY = 3
/** The map an entry record is for. */
export const OP_ENTERED = 9
/**
 * Holds only when the story is at step *n* of its stage. INFERRED: of the 128
 * records testing it, 94 name a step that some event in the same file moves
 * the story to at that stage, against 20 for the step three further on. On the
 * Hexagon's first floor a statue does nothing at steps 1 to 3, plays `ev02530`
 * at 4 — "There's a noise of something moving somewhere!" — and says its
 * after-line at 5.
 */
export const OP_AT_STEP = 35
/**
 * Starts a set battle: the entry with that index in `eventbattle.bin` — see
 * `readEventBattles`. INFERRED: all 40 arguments on the cartridge are indices
 * there, and 65 of the 66 records carrying one have a {@link KIND_WON} record
 * in the same map naming the same number. The Hexagon's `8:22510 120:2` is
 * index 2, Hexagoon alone.
 */
export const OP_BATTLE = 120
/**
 * Value 5 of a record that acts once a set battle is won: 46 of the 47 open
 * with {@link OP_AFTER_BATTLE}. INFERRED — the Hexagon's, `12:2 119:2550`,
 * plays Patty's thanks.
 */
export const KIND_WON = 15
/**
 * Value 5 of a record that acts once a set battle is lost: all 33 open with
 * {@link OP_AFTER_BATTLE}. INFERRED, as the other outcome to
 * {@link KIND_WON}: the Hexagon's, `12:2 104:4 197:10`, sets the flag under
 * which Patty offers the fight again.
 */
export const KIND_LOST = 16
/** The set battle a {@link KIND_WON} or {@link KIND_LOST} record is about. */
export const OP_AFTER_BATTLE = 12

/** A stage, as a trigger record's span gives one. */
interface Stage {
  readonly major: number
  readonly minor: number
}

const order = (stage: Stage) => stage.major * 100 + stage.minor

/**
 * The event entering `map` plays at `stage` with `flags` set: the first entry
 * record for the map whose span covers the stage, whose flag conditions hold,
 * and which names an event. `undefined` when none does. INFERRED — see
 * {@link KIND_ENTRY}.
 */
export function entryEvent(
  triggers: readonly Trigger[],
  map: number,
  stage: Stage,
  flags: ReadonlySet<number>,
  step?: number,
): number | undefined {
  return entryPlay(triggers, map, stage, flags, step)?.event
}

/**
 * The event entering `map` plays, as {@link entryEvent} finds it, and the
 * flags its entry record sets as it plays. INFERRED: of the 49 entry records
 * that play an event, 7 set a flag themselves, and every one of the 7 holds
 * only while that same flag is not set — so it plays once — while only one of
 * their events has a record of its own, which does not set it. The village's
 * at 2.1, `9:1100 5:0 … 119:22590 104:0`, plays the scene at the Guardian
 * statue once.
 */
export function entryPlay(
  triggers: readonly Trigger[],
  map: number,
  stage: Stage,
  flags: ReadonlySet<number>,
  step?: number,
  more?: Conditions,
):
  | {
      readonly event: number | undefined
      readonly flags: readonly number[]
      readonly outcome: EventOutcome
    }
  | undefined {
  // The first that holds, whatever it does — as the game takes a record.
  // Until 28 September 2026 one with no event was passed over; Batsureg's
  // at 10.6 only adds two areas, and the Observatory's at 15.3 only moves the
  // story to step 5. **INFERRED**, as the kind is: read from the game's code,
  // kind 3 is run at map load for its `108` alone (`func_02017a94`), and
  // what plays its events is not found there.
  for (const trigger of triggers) {
    if (trigger.unknown_5 !== KIND_ENTRY || trigger.map !== map) continue
    if (order(trigger.from) > order(stage) || order(trigger.to) < order(stage)) continue
    const words = triggerWords(trigger)
    if (!words.some((w) => w.op === OP_ENTERED && w.arg === map)) continue
    if (!flagsHold(conditionsOf(trigger), flags, undefined, step, more)) continue
    const outcome = outcomeOf(trigger)
    return { event: outcome.event, flags: outcome.flags, outcome }
  }
  return undefined
}

/**
 * What the map's settings record does as the map is entered: the first
 * {@link KIND_SETTINGS} record over the stage whose conditions hold — read
 * from the game's code, which runs it, every action, as the map's trigger
 * file is loaded (US ARM9 `func_02064574`, at `0x020645f8`). Its areas are
 * `areasOf`'s; two on the cartridge play an event as well, the Bowhole's
 * `9:6302 35:1 23:2 119:13500` at 13.5, and the Quarantomb's at 4.3 move the
 * story by the step.
 */
export function settingsPlay(
  triggers: readonly Trigger[],
  map: number,
  stage: Stage,
  state: StoryState,
): EventOutcome | undefined {
  for (const trigger of triggers) {
    if (trigger.unknown_5 !== KIND_SETTINGS || trigger.map !== map) continue
    if (order(trigger.from) > order(stage) || order(trigger.to) < order(stage)) continue
    if (holds(trigger, state)) return outcomeOf(trigger)
  }
  return undefined
}

/**
 * What performing a party trick in `area` of `map` does: the first
 * {@link KIND_TRICK} record over the stage whose conditions hold, with the
 * tricks it wants ({@link OP_TRICKS}) taken as performed when `canPerform`
 * says the Hero can perform each — see {@link trickKnown}. Undefined when
 * none does.
 */
export function trickPlay(
  triggers: readonly Trigger[],
  map: number,
  stage: Stage,
  area: number,
  canPerform: (trick: number) => boolean,
  state: StoryState,
): { readonly tricks: readonly number[]; readonly outcome: EventOutcome } | undefined {
  for (const trigger of triggers) {
    if (trigger.unknown_5 !== KIND_TRICK || trigger.map !== map) continue
    if (order(trigger.from) > order(stage) || order(trigger.to) < order(stage)) continue
    const conditions = conditionsOf(trigger)
    const where = conditions.find((w) => w.op === OP_IN_AREA)
    if (!where || where.arg !== area) continue
    const tricks = conditions
      .filter((w) => w.op === OP_TRICKS || w.op === OP_TRICKS_IN_ORDER)
      .flatMap(tricksWanted)
    if (tricks.length === 0 || !tricks.every(canPerform)) continue
    const more: Conditions = { ...state.more, tricks }
    if (flagsHold(conditions, state.flags, state.marks, state.step, more)) {
      return { tricks, outcome: outcomeOf(trigger) }
    }
  }
  return undefined
}

/**
 * Value 5 of a record that runs **every frame the Hero is in its map** — read
 * from the game's code: the field's frame update (US ARM9
 * `func_ov017_0218cbd4`) asks for the first of them whose conditions hold, once
 * the map's doorways, fades and transitions have had their turn
 * (`func_ov017_0219ca88`). 34 on the cartridge. Angel Falls' church and stable
 * at 1.2 move the story on the moment flags 4 and 5 are both set; Stornway's
 * lobby at 2.7, with flag 3, starts chapter 3.
 */
export const KIND_WATCH = 6

/**
 * What runs now in `map` at `stage`: the first {@link KIND_WATCH} record for the
 * map over the stage whose conditions hold — see {@link holds} — and what it
 * does. `undefined` when none does.
 */
export function watchPlay(
  triggers: readonly Trigger[],
  map: number,
  stage: Stage,
  state: StoryState,
): EventOutcome | undefined {
  for (const trigger of triggers) {
    if (trigger.unknown_5 !== KIND_WATCH || trigger.map !== map) continue
    if (order(trigger.from) > order(stage) || order(trigger.to) < order(stage)) continue
    if (holds(trigger, state)) return outcomeOf(trigger)
  }
  return undefined
}

/** Value 5 of a map's settings records, where its areas are defined — see {@link OP_AREA}. */
export const KIND_SETTINGS = 20
/**
 * Defines area *n* of the map: six floats follow, a box — its greater corner,
 * then its lesser, x, y and z, in the units map placements use — and then its
 * **angle in degrees** about the vertical. Read from the game's code: the
 * parser takes the six floats and the integer as the operation's own
 * (`func_0205ec70`), and the action (US ARM9 `0x02062a94`) turns the integer
 * into radians (`× π ÷ 180`) and keeps the box, its centre and the angle in
 * a list the field tests the Hero against (`func_ov017_02198e30`). On all 108
 * area words the first corner is at or above the second on every axis. 31 of
 * the cartridge's 113 are turned — 314° seven times, 45° five.
 */
export const OP_AREA = 143
/**
 * Value 5 of a record that runs when the Hero walks into an area, the one
 * {@link OP_IN_AREA} names. Read from the game's code: the field keeps which
 * area the Hero is in, and on walking into another asks for the first of
 * these whose area is the new one (`func_ov017_02198e30`, and
 * `func_ov017_0219814c` for the map's own areas — see `mapAreas`). The mayor's
 * house at 2.1, `7:15 5:1 119:2120`, plays his scene with Ivor.
 */
export const KIND_AREA_EVENT = 2
/** The area a {@link KIND_AREA_EVENT} record is about. */
export const OP_IN_AREA = 7

/**
 * An area of a map: a box turned about the vertical through its centre. Two
 * things define them — a trigger's {@link OP_AREA} and a map's own link table
 * (`mapAreas`) — and the field tests the Hero against each on its own.
 */
export interface StoryArea {
  readonly id: number
  readonly max: { readonly x: number; readonly y: number; readonly z: number }
  readonly min: { readonly x: number; readonly y: number; readonly z: number }
  /** How far the box is turned about the vertical through its centre, in radians. */
  readonly angle: number
  /**
   * The square of the distance across the ground from the centre past which a
   * turned box is not tested further — the game's own quick refusal. For a
   * trigger's box the game makes it from the box's **width and height**, not
   * its width and depth (`0x02062a94`), and that is kept, as the game has it.
   */
  readonly reach: number
}

/** An angle in `[0, 2π)`, as the game keeps one (`fix32ReduceAngle0To2Pi`). */
const reduced = (radians: number) => {
  const turn = 2 * Math.PI
  return ((radians % turn) + turn) % turn
}

/** The areas a record's `143`s define — see {@link OP_AREA}. */
export function areasIn(trigger: Trigger): StoryArea[] {
  const found: StoryArea[] = []
  for (const entry of entriesOf(trigger)) {
    if (entry.op !== OP_AREA || entry.params.length < 6) continue
    const [x1, y1, z1, x2, y2, z2] = entry.params as [
      number,
      number,
      number,
      number,
      number,
      number,
    ]
    const degrees = entry.params[6] ?? 0
    found.push({
      id: entry.arg,
      max: { x: x1, y: y1, z: z1 },
      min: { x: x2, y: y2, z: z2 },
      angle: reduced((degrees * Math.PI) / 180),
      reach: ((x1 - x2) / 2) ** 2 + ((y1 - y2) / 2) ** 2,
    })
  }
  return found
}

/**
 * The areas `map`'s settings define over `stage` — see {@link OP_AREA}: those
 * of the first {@link KIND_SETTINGS} record for the map over the stage whose
 * conditions hold in `state` (see {@link holds}), which is the one the game
 * runs as it loads the map's triggers (US ARM9 `func_02064574`). 93 pairs of
 * settings records overlap, most split by day and night. A record of another
 * kind can add areas too, as it runs — see {@link EventOutcome.areas}.
 */
export function areasOf(
  triggers: readonly Trigger[],
  map: number,
  stage: Stage,
  state?: StoryState,
): StoryArea[] {
  for (const trigger of triggers) {
    if (trigger.unknown_5 !== KIND_SETTINGS || trigger.map !== map) continue
    if (order(trigger.from) > order(stage) || order(trigger.to) < order(stage)) continue
    if (holds(trigger, state)) return areasIn(trigger)
  }
  return []
}

/**
 * Whether a point is in the area, as the game tests it (US ARM9
 * `func_020321e0`): for a turned box, refused if it lies further across the
 * ground from the centre than {@link StoryArea.reach} allows; otherwise turned
 * back about the vertical through the centre by the box's angle — the game's
 * `RotationMatrixY(−angle)`, applied as a row vector — and then inside the box,
 * edges included, on every axis. The point is the Hero's own position, their
 * feet.
 */
export function inArea(area: StoryArea, x: number, y: number, z: number): boolean {
  let px = x
  let pz = z
  if (area.angle !== 0) {
    const cx = (area.max.x + area.min.x) / 2
    const cz = (area.max.z + area.min.z) / 2
    const dx = x - cx
    const dz = z - cz
    if (dx * dx + dz * dz > area.reach) return false
    const cos = Math.cos(area.angle)
    const sin = Math.sin(area.angle)
    px = cx + dx * cos - dz * sin
    pz = cz + dx * sin + dz * cos
  }
  return (
    px <= area.max.x &&
    y <= area.max.y &&
    pz <= area.max.z &&
    px >= area.min.x &&
    y >= area.min.y &&
    pz >= area.min.z
  )
}

/**
 * The first of `areas` the point is in, as the game takes one: the field keeps
 * only that one as where the Hero stands, for each source of areas.
 */
export function areaAt(
  areas: readonly StoryArea[],
  x: number,
  y: number,
  z: number,
): StoryArea | undefined {
  return areas.find((area) => inArea(area, x, y, z))
}

/**
 * What walking into an area runs: the first {@link KIND_AREA_EVENT} record
 * for the map, over the stage, whose area `entered` says the Hero has walked
 * into and whose conditions hold — as the game takes the first that holds
 * (`func_02064490`), whatever it does: an event, or a talk (`118`), as
 * Dourbridge's area 22 at 7.3 has the Hero talk to 3. Until 28 September
 * 2026 a record without an event was passed over, which the game does not do.
 */
export function areaEvent(
  triggers: readonly Trigger[],
  map: number,
  stage: Stage,
  flags: ReadonlySet<number>,
  step: number | undefined,
  entered: (area: number) => boolean,
  more?: Conditions,
):
  | {
      readonly event: number | undefined
      readonly flags: readonly number[]
      readonly outcome: EventOutcome
    }
  | undefined {
  for (const trigger of triggers) {
    if (trigger.unknown_5 !== KIND_AREA_EVENT || trigger.map !== map) continue
    if (order(trigger.from) > order(stage) || order(trigger.to) < order(stage)) continue
    const words = triggerWords(trigger)
    const area = words.find((w) => w.op === OP_IN_AREA)
    if (!area || !entered(area.arg)) continue
    if (!flagsHold(conditionsOf(trigger), flags, undefined, step, more)) continue
    const outcome = outcomeOf(trigger)
    return { event: outcome.event, flags: outcome.flags, outcome }
  }
  return undefined
}

/** A point in the story: a stage, and a step within it. */
export interface StoryPoint {
  readonly major: number
  readonly minor: number
  readonly step: number
}

/** What follows an event — see {@link eventOutcome}. */
/** One of a record's actions on the quests — see {@link EventOutcome.quests}. */
export type QuestAction =
  | { readonly does: 'accept' | 'clear' | 'offer'; readonly quest: number }
  | { readonly does: 'progress'; readonly quest: number; readonly value: number }

export interface EventOutcome {
  /** Where the story now stands, if the event moves it. */
  readonly stage: StoryPoint | undefined
  /** The flags it sets. */
  readonly flags: readonly number[]
  /** The map and event it goes on to, if it does. */
  readonly onward: { readonly map: number; readonly event: number } | undefined
  /** The set battle it starts, if it does — see {@link OP_BATTLE}. */
  readonly battle: number | undefined
  /** The threads whose stage it sets by number — see {@link OP_THREAD_STAGE_TO}. */
  readonly threads: readonly { readonly thread: number; readonly stage: StoryPoint }[]
  /** Who it brings into the party, by their place in `attnpc` from 0 — see {@link OP_JOIN}. */
  readonly joins: readonly number[]
  /** Whether it sends whoever goes along away — see {@link OP_LEAVE}. */
  readonly leaves: boolean
  /** Every thread's stage, if it sets them all — see {@link OP_ALL_STAGES_TO}. */
  readonly all: StoryPoint | undefined
  /** The flags it clears — see {@link OP_CLEAR_FLAG}. */
  readonly unflags: readonly number[]
  /** The marks it sets and clears — see {@link OP_SET_MARK}. */
  readonly marks: readonly number[]
  readonly unmarks: readonly number[]
  /** The game-wide flags it sets and clears — see {@link OP_SET_GLOBAL}. */
  readonly globals: readonly number[]
  readonly unglobals: readonly number[]
  /** The event it plays, if it plays one — see {@link OP_EVENT}. */
  readonly event: number | undefined
  /** Who it has the Hero talk to, and with which label — see {@link OP_TALK_TO}. */
  readonly talk?: { readonly character: number; readonly label: number }
  /** The characters it takes out of the map — see {@link OP_REMOVE}. Absent where an outcome is made by hand. */
  readonly removes?: readonly number[]
  /** The party tricks it teaches — see {@link OP_LEARN_TRICK}. Absent where an outcome is made by hand. */
  readonly tricks?: readonly number[]
  /** The Starflight Express it opens: the conductor and the two values of stops — see {@link OP_EXPRESS}. */
  readonly express?: { readonly mode: number; readonly values: readonly number[] }
  /** The stop it says the Starflight Express is at — see {@link OP_EXPRESS_AT}. */
  readonly expressAt?: number
  /**
   * What it does to the quests — see {@link OP_QUEST_ACCEPT} and the rest, in
   * the record's order. Absent where an outcome is made by hand.
   */
  readonly quests?: readonly QuestAction[]
  /**
   * The areas it adds to the map as it runs — see {@link OP_AREA}. 143 is on
   * 80 settings records, and on 3 entry records, 3 talk records and one
   * event's own; Batsureg's areas 72 and 73 at 10.6 are an entry record's.
   */
  readonly areas: readonly StoryArea[]
  /**
   * Its actions in the record's own order, which is the order the game runs
   * them in: a flag set before a `132` into a new sub-stage is cleared by it.
   * Absent where an outcome is made by hand, which applies the fields above.
   */
  readonly actions?: readonly TriggerEntry[]
}

/**
 * Sets every thread's stage at once, to the three values after it, as
 * {@link OP_STAGE_TO} sets the live one's. Read from the game's code: the
 * queue (US ARM9 `func_0206f81c`) moves threads 0 to 4 in turn. `ev28800` at
 * 13.1 brings the threads back together at 13.2, and winning set battle 25 at
 * 17.2 sets them all to 19.2.
 */
export const OP_ALL_STAGES_TO = 148
/**
 * Goes on to a map and an event there, as {@link OP_THEN_MAP} does: the game's
 * queue takes 133, 138 and 226 in one case, and 138 and 226 each set one flag
 * on the move that 133 does not, whose effect is not established. `ev2910` at
 * 2.7 goes on with 138 to Stornway's lobby, map 50101, and `ev22500`.
 */
const HAND_ONS = new Set([OP_THEN_MAP, 138, 226])

/**
 * Sets a flag and plays an event: `155 : e` and a value whose high half is the
 * flag. Read from the game's code: its action runs `104` with the flag
 * (`func_02061c04`) and queues itself, and the queue starts the event as it
 * does for `119` (`func_0206f81c`). 14 records, every one Gortress's at 14.4 —
 * `52:203 7:2 155:28991 7:0`, talking to 203 while flag 7 is clear, sets it
 * and plays `ev28991`.
 */
export const OP_FLAG_AND_EVENT = 155

/**
 * Talks to a character with a label: `118 : c` and a value whose high half is
 * the label, as the game's parser keeps it (US ARM9 `func_0205ec70`). The
 * queue (`func_0206f81c`) hands them to the talk, which says the label's line
 * of their talk file and then runs their talk records for it — see `pickLine`
 * in `apps/game`. Ivor at the landslide, `6:7 118:7 192:0`.
 */
export const OP_TALK_TO = 118

/**
 * **The Quarantomb's switches**: sets or clears a flag of the block from bit
 * 830 (see {@link OP_IF_FLAG_FROM_830}) and turns the map's walls. Read from
 * the game's code: the parser keeps `220`'s value as two bytes — *which*
 * switch in the high, whether it is on in the low (`func_0205ec70`) — and
 * its action (`func_020aee04`) does nothing outside map 7402; there, which 1
 * turns the map's pieces `0x4e`–`0x58` and sets flag 830 + 71 to the byte,
 * which 0 the pieces `0x37`–`0x4b` and flag 830 + 72 (`func_020ae4ec`). So
 * `220:257` sets 901, `220:1` sets 902, and `ev24590`'s record clears both
 * with `220:256 220:0`. All 14 records that carry it are the Quarantomb's;
 * the pieces are not modelled here.
 */
export const OP_QUARANTOMB_SWITCH = 220
/** The flag a `220` sets or clears, and to what — see {@link OP_QUARANTOMB_SWITCH}. */
export function quarantombSwitch(arg: number): { flag: number; on: boolean } | undefined {
  const which = (arg >> 8) & 0xff
  if (which !== 0 && which !== 1) return undefined
  return { flag: 830 + (which === 1 ? 71 : 72), on: (arg & 0xff) !== 0 }
}

/**
 * **Alltrades Abbey opens**: `223 : x` sets game-wide flag `0x799` to *x ≠ 0*
 * (`func_02061c04` case 123, `0x02064038`; `func_0206df6c` sets or clears).
 * Carried by the two outcome records of `ev26510` in the Tower of Trades at
 * 6.5. The Abbey's step 0 tests it (`0x02156278`).
 */
export const OP_ABBEY_OPEN = 223
/** Sets flag `0x798` to *x ≠ 0* (case 124, `0x02064054`); on `R01`–`R04`'s records from 4.1. What it means is not read. */
export const OP_FLAG_798 = 224
/**
 * **Revocation opens**: `231 : x` sets flag `0x796` to *x ≠ 0* (case 131,
 * `0x0206414c`–`0x02064170`), unless `func_0202ae18`→`func_0202c540` holds —
 * INFERRED, a guest in a game played together. Carried by the record that
 * plays the credits, `ev29300`, at 17.2. The same action then stamps a record
 * once with the clock, the Hero's `+0x134` and the play time (`0x02064174`–
 * `0x0206435c`) — INFERRED a "cleared" stamp; not kept here.
 */
export const OP_REVOCATION_OPEN = 231
/**
 * **An advanced vocation is unlocked**: `160 : v` sets flag `0x113F + v`
 * (case 60, `0x02062fd8`), the Abbey's own test (`func_ov003_02156054`).
 * Each sits beside a quest cleared (`127`): quests 25, 27, 26, 124, 128 and 28
 * give vocations 7 to 12.
 */
export const OP_VOCATION_UNLOCK = 160
/** `202 : n` sets flag `0x1198 + n` (case 102, `0x02063a34`) — the Krak Pot's first talk sets `0x1198`. */
export const OP_FLAG_FROM_1198 = 202

/**
 * The game-wide flag one of the actions above sets or clears, and which —
 * every one goes through `func_0206df6c` on the bank at `+0x8c`.
 */
export function bankBit(op: number, arg: number): { flag: number; on: boolean } | undefined {
  if (op === OP_ABBEY_OPEN) return { flag: 0x799, on: arg !== 0 }
  if (op === OP_FLAG_798) return { flag: 0x798, on: arg !== 0 }
  if (op === OP_REVOCATION_OPEN) return { flag: 0x796, on: arg !== 0 }
  if (op === OP_VOCATION_UNLOCK) return { flag: 0x113f + arg, on: true }
  if (op === OP_FLAG_FROM_1198) return { flag: 0x1198 + arg, on: true }
  return undefined
}

/**
 * What a record does when it runs: every one of its actions, as the game runs
 * them all (US ARM9 `func_02064530`). Read from its entries — see
 * {@link entriesOf} — so an action's own values are taken as its own.
 */
export function outcomeOf(trigger: Trigger): EventOutcome {
  const entries = entriesOf(trigger)
  const args = (op: number) => entries.filter((e) => e.op === op).map((e) => e.arg)
  const point = (entry: TriggerEntry | undefined): StoryPoint | undefined => {
    if (entry?.params.length !== 3) return undefined
    const [major, minor, step] = entry.params.map((v) => v & 0xffff) as [number, number, number]
    return { major, minor, step }
  }
  const go = entries.find((e) => HAND_ONS.has(e.op) && e.params.length === 1)
  const talk = entries.find((e) => e.op === OP_TALK_TO && e.params.length === 1)
  const threads: { thread: number; stage: StoryPoint }[] = []
  for (const entry of entries) {
    if (entry.op !== OP_THREAD_STAGE_TO) continue
    const stage = point(entry)
    if (stage) threads.push({ thread: entry.arg, stage })
  }
  const both = entries.filter((e) => e.op === OP_FLAG_AND_EVENT && e.params.length === 1)
  const express = entries.find((e) => e.op === OP_EXPRESS)
  // `130`, `131`: the flag their value's high half names, by its number.
  const named = (op: number) =>
    entries
      .filter((e) => e.op === op && e.params.length === 1)
      .map((e) => flagBit(((e.params[0] as number) >>> 16) & 0xffff))
  const expressAt = entries.find((e) => e.op === OP_EXPRESS_AT)
  // The Quarantomb's switches, as game-wide flags — see `quarantombSwitch`.
  const switches = entries
    .filter((e) => e.op === OP_QUARANTOMB_SWITCH)
    .flatMap((e) => quarantombSwitch(e.arg) ?? [])
  const bits = entries.flatMap((e) => bankBit(e.op, e.arg) ?? [])
  return {
    stage: point(entries.find((e) => e.op === OP_STAGE_TO)),
    flags: [...args(OP_SET_FLAG), ...both.map((e) => (e.params[0] as number) >>> 16)],
    onward: go ? { map: go.arg, event: (go.params[0] as number) >>> 16 } : undefined,
    battle: entries.find((e) => e.op === OP_BATTLE)?.arg,
    threads,
    joins: args(OP_JOIN),
    leaves: entries.some((e) => e.op === OP_LEAVE),
    all: point(entries.find((e) => e.op === OP_ALL_STAGES_TO)),
    unflags: args(OP_CLEAR_FLAG),
    marks: args(OP_SET_MARK),
    unmarks: args(OP_CLEAR_MARK),
    globals: [
      ...args(OP_SET_GLOBAL),
      ...switches.filter((s) => s.on).map((s) => s.flag),
      ...named(OP_QUEST_SET_FLAG),
      ...bits.filter((b) => b.on).map((b) => b.flag),
    ],
    unglobals: [
      ...args(OP_CLEAR_GLOBAL),
      ...switches.filter((s) => !s.on).map((s) => s.flag),
      ...named(OP_QUEST_CLEAR_FLAG),
      ...bits.filter((b) => !b.on).map((b) => b.flag),
    ],
    event: entries.find((e) => e.op === OP_EVENT || e.op === OP_FLAG_AND_EVENT)?.arg,
    ...(talk ? { talk: { character: talk.arg, label: (talk.params[0] as number) >>> 16 } } : {}),
    removes: args(OP_REMOVE),
    tricks: args(OP_LEARN_TRICK),
    ...(express ? { express: { mode: express.arg, values: express.params } } : {}),
    quests: entries.flatMap((e): QuestAction[] => {
      const value = ((e.params[0] ?? 0) >>> 16) & 0xffff
      if (e.op === OP_QUEST_ACCEPT) return [{ does: 'accept', quest: e.arg }]
      if (e.op === OP_QUEST_CLEAR) return [{ does: 'clear', quest: e.arg }]
      if (e.op === OP_QUEST_OFFER) return [{ does: 'offer', quest: e.arg }]
      if (e.op === OP_QUEST_PROGRESS) return [{ does: 'progress', quest: e.arg, value }]
      return []
    }),
    ...(expressAt ? { expressAt: expressAt.arg } : {}),
    areas: areasIn(trigger),
    actions: entries.filter((e) => !isCondition(e.op)),
  }
}

/** Where the story stands, for testing a record's conditions — see {@link flagsHold}. */
export interface StoryState {
  readonly flags: ReadonlySet<number>
  readonly marks?: ReadonlySet<number>
  readonly step?: number
  readonly more?: Conditions
}

/**
 * Whether a record's conditions hold, as far as they are read — see
 * {@link flagsHold}. Without a state, only {@link OP_PLAYERS}: as one playing
 * alone.
 */
export function holds(trigger: Trigger, state?: StoryState): boolean {
  const conditions = conditionsOf(trigger)
  if (!state) return conditions.every((c) => c.op !== OP_PLAYERS || c.arg === 0 || c.arg === 2)
  return flagsHold(conditions, state.flags, state.marks, state.step, state.more)
}

/**
 * What follows an event, from its own record: the first whose conditions hold
 * in `state` (see {@link holds}) — the one in `map`, if it has one there, or
 * else the first anywhere. The game takes the first whose conditions hold
 * (US ARM9 `func_02064490`), from the current map's records only; looking
 * further is ours. `undefined` when no record is the event's.
 */
export function eventOutcome(
  triggers: readonly Trigger[],
  event: number,
  map?: number,
  state?: StoryState,
): EventOutcome | undefined {
  // The first of the event's own records whose conditions hold, as the game
  // takes one (`func_02064490`) — in the map asked for, where it has one.
  const own = triggers.filter(
    (t) =>
      t.unknown_5 === KIND_EVENT &&
      triggerWords(t).some((w) => w.op === OP_EVENT_OF && w.arg === event) &&
      holds(t, state),
  )
  const record = own.find((t) => t.map === map) ?? own[0]
  return record ? outcomeOf(record) : undefined
}

/** What follows a set battle — see {@link afterBattle}. */
export interface BattleOutcome {
  /** The event its record plays, if it names one. */
  readonly event: number | undefined
  /** The flags it sets. */
  readonly flags: readonly number[]
  /** Everything its record does — see {@link outcomeOf}. */
  readonly outcome: EventOutcome
}

/**
 * What follows set battle `battle` in `map`, won or lost: the first record of
 * {@link KIND_WON} or {@link KIND_LOST} there opening with that battle.
 * `undefined` when there is none. INFERRED — see {@link KIND_WON}.
 */
export function afterBattle(
  triggers: readonly Trigger[],
  battle: number,
  won: boolean,
  map: number | undefined,
  state?: StoryState,
): BattleOutcome | undefined {
  const kind = won ? KIND_WON : KIND_LOST
  for (const trigger of triggers) {
    if (trigger.unknown_5 !== kind || (map !== undefined && trigger.map !== map)) continue
    const words = triggerWords(trigger)
    const first = words[0]
    if (first?.op !== OP_AFTER_BATTLE || first.arg !== battle) continue
    if (!holds(trigger, state)) continue
    const outcome = outcomeOf(trigger)
    return { event: outcome.event, flags: outcome.flags, outcome }
  }
  return undefined
}

/**
 * A second set of flags, kept beside the story's — "marks" here: holds only
 * when the mark is set. INFERRED: of the 57 {@link OP_SET_MARK} words on the
 * cartridge, 31 sit in a record that also tests {@link OP_UNLESS_MARK} of the
 * same mark — the first time a character is talked to — and 24 of those have a
 * partner record for the same character, map and span testing this one: Hugo's
 * `3:7 119:2430 102:7`, then `2:7 118:8 193:0`. Tests (280 of these, 298 of
 * the other) far outnumber the sets, so something else sets marks too; what, is
 * not established.
 */
export const OP_IF_MARK = 2
/** Holds only when the mark is not set — see {@link OP_IF_MARK}. */
export const OP_UNLESS_MARK = 3
/** Sets a mark — see {@link OP_IF_MARK}. */
export const OP_SET_MARK = 102

/** Holds only when a game-wide flag is set — see {@link OP_SET_GLOBAL}. */
export const OP_IF_GLOBAL = 0
/** Holds only when a game-wide flag is clear. */
export const OP_UNLESS_GLOBAL = 1
/**
 * Sets a game-wide flag: a bank of bits the trigger object keeps outside its
 * five threads (`+0x8c`), which no move of the story clears. Read from the
 * game's code: the actions for 100 and 101 (US ARM9 `0x02061c2c` on) set and
 * clear a bit there, and the conditions 0 and 1 (`func_0205faf4`) test it.
 */
export const OP_SET_GLOBAL = 100
/** Clears a game-wide flag — see {@link OP_SET_GLOBAL}. */
export const OP_CLEAR_GLOBAL = 101
/** Clears a flag, as {@link OP_SET_FLAG} sets one — read from the game's code. */
export const OP_CLEAR_FLAG = 105
/** Clears a mark, as {@link OP_SET_MARK} sets one — read from the game's code. */
export const OP_CLEAR_MARK = 103
/**
 * The time of day: `17 : 1` holds by night, and any other argument by
 * morning, day or evening. Read from the game's code (`func_0205faf4`, which
 * asks `GameState::IsMorningDayOrEvening`).
 */
export const OP_TIME = 17
/**
 * Who is playing, in a game played together: tested by the game's code
 * (`func_0205faf4`) against a session object (`0x020fefec` in the US ARM9)
 * whose first word is set only while a session runs — the same test the
 * actions for 102 and 104 make before sending a change over the link.
 * **INFERRED**, that it is a multiplayer session: argument 0 holds with none
 * running, 1 with one, 2 with none or as one kind of player, 3 only as the
 * other. **Played alone, 0 and 2 hold and 1 and 3 do not.** 1,541 records carry
 * it, mostly as twins, `23:2` beside `23:3`.
 */
export const OP_PLAYERS = 23

/** How the world stands for a record's conditions beyond the story's own flags — see {@link flagsHold}. */
export interface Conditions {
  /** The game-wide flags set — see {@link OP_SET_GLOBAL}. Not read when not given. */
  readonly globals?: ReadonlySet<number>
  /**
   * Those surely set, where `globals` holds those that may be: for following
   * many ways through the story at once, where `1 : n` holds unless every way
   * set it. The game has one set, and then this is not given.
   */
  readonly globalsSure?: ReadonlySet<number>
  /** Whether it is night — see {@link OP_TIME}. Not read when not given. */
  readonly night?: boolean
  /** Who is being talked to, by their id in the area's cast — see {@link OP_TALKED_TO}. Not read when not given. */
  readonly character?: number
  /** The label the talk was asked with — see {@link OP_LABEL_IS}. Not read when not given. */
  readonly label?: number
  /** The answer the last prompt was given, from 0 — see {@link OP_ANSWER_IS}. Not read when not given. */
  readonly answer?: number
  /** Whether the Hero is down — see {@link OP_HERO_DOWN}. Not read when not given. */
  readonly down?: boolean
  /** Whether the Hero stands in a box of the one talked to — see {@link OP_IN_TALK_BOX}. Not read when not given. */
  readonly inBox?: boolean
  /** The doorway the Hero is at, by its two numbers — see {@link OP_AT_DOORWAY}. Not read when not given. */
  readonly doorway?: readonly [number, number]
  /** How many are in the party, the Hero among them — see {@link OP_PARTY_AT_LEAST}. Not read when not given. */
  readonly party?: number
  /** The party tricks just performed, by number — see {@link OP_TRICKS}. Not read when not given. */
  readonly tricks?: readonly number[]
  /**
   * Each quest's nibble as the game keeps it — see {@link questHolds}. Not
   * read when not given: the quest conditions then hold.
   */
  readonly quest?: (quest: number) => number
}

/**
 * **A quest's state**, as the game keeps it (US ARM9 `func_0206e120`,
 * `func_0206e164`): a nibble per quest, 204 of them, at the trigger object's
 * `+0x2cc`. Its low two bits run **0** not on offer, **1** on offer — the
 * talk sets 1 and 0 by its giver's record, `func_02095924` — **2** taken
 * (`125`, through `func_020962f4`) and **3** cleared (`127`, `func_0206e100`).
 * Bit 2 is a first flag, set with state 1 by `func_0206e218`; bit 3 is the
 * quest's having been **delivered** by the online service (see
 * `QuestGiver.downloaded`).
 */
export const QUEST_OFFERED = 1
export const QUEST_TAKEN = 2
export const QUEST_CLEARED = 3
export const QUEST_FIRST_FLAG = 4
export const QUEST_DELIVERED = 8

/**
 * A quest test by its mode, as the composites 53 to 61 carry it (US ARM9
 * `func_0206474c`): −1 and 5 hold for a quest at 0, 0 at 2, 1 while its first
 * flag is set, 2 at 3, 3 at 1, any other never.
 */
export function questHolds(nibble: number, mode: number): boolean {
  const state = nibble & 3
  switch (mode) {
    case -1:
    case 5:
      return state === 0
    case 0:
      return state === QUEST_TAKEN
    case 1:
      return (nibble & QUEST_FIRST_FLAG) !== 0
    case 2:
      return state === QUEST_CLEARED
    case 3:
      return state === QUEST_OFFERED
    default:
      return false
  }
}

/** Holds while quest *n* is taken (`20`), has its first flag (`21`), is cleared (`22`) — `func_0205faf4` at `0x0205ff84`. */
export const OP_IF_QUEST_TAKEN = 20
export const OP_IF_QUEST_FLAG = 21
export const OP_IF_QUEST_CLEARED = 22
/** Accepts quest *n*: into the quest log, eight at most, and taken — US ARM9 `0x02062358`, `func_020961b0`. */
export const OP_QUEST_ACCEPT = 125
/** Clears quest *n*: the day and time kept, cleared, out of the log — `0x02062444`, `func_02095cfc`. */
export const OP_QUEST_CLEAR = 127
/** Puts quest *n* on offer, state 1 — `0x020624dc`. */
export const OP_QUEST_OFFER = 129
/** Sets and clears the flag its value names, by its number (`func_0206eb64`); the quest is for a session's other players — `0x020624f0`, `0x0206257c`. */
export const OP_QUEST_SET_FLAG = 130
export const OP_QUEST_CLEAR_FLAG = 131
/** Sets a taken quest's progress, 0 to 7, the entry's bits 11 to 13 — `0x02062c68`. */
export const OP_QUEST_PROGRESS = 144

/** The quest test a composite condition carries — see {@link questHolds}. Undefined for any other condition. */
function compositeQuest(entry: TriggerWord): { quest: number; mode: number } | undefined {
  if (entry.op < 53 || entry.op > 61) return undefined
  const value = (entry as Partial<TriggerEntry>).params?.[0]
  if (value === undefined) return undefined
  return { quest: (value >>> 16) & 0xffff, mode: ((value & 0xffff) << 16) >> 16 }
}

/**
 * Value 5 of a record that runs **when the Hero performs a party trick** —
 * read from the game's code (US ARM9): the field object that plays a trick
 * loads `data/chara/sg<nn><m|w>.chr` (`func_0205308c`, the archive of a
 * `sigusa.nsbca` — 仕草, a gesture), and when its tricks are done, and it is
 * the leader's, its update (`func_02053634`, at `0x020539ac`) asks for the
 * first of these whose conditions hold (`func_02064a9c`) with the tricks
 * performed at the context's `+0x2a`, up to four, and the Hero's area at `+4`
 * as {@link OP_IN_AREA} reads it. 11 on the cartridge: Gleeba's Drak answers
 * a Clap in area 10 at 11.2 (`7:10 33:0 512:0 1:322 5:1 23:2 119:11200`), the
 * Quester's Rest's two quests an Air Punch and a sequence.
 */
export const KIND_TRICK = 19
/**
 * Holds when every trick the next word names, a byte each, was performed —
 * read from the game's code (`func_0205faf4`, at `0x02060214`): each nonzero
 * byte of the word after it must match one of the four at the context's
 * `+0x2a`, no two the same one. `33:0 512:0` wants trick 2, `768:0` trick 3.
 */
export const OP_TRICKS = 33
/** Takes a word of four tricks too, and is not read: the quest's `32:0 4866:2307` — INFERRED to be the same four in order. */
export const OP_TRICKS_IN_ORDER = 32
/**
 * Teaches party trick *n* — read from the game's code (action case at
 * `0x02062a80`, `func_0206e348`): tricks are numbered as the field menu's
 * strings are, `str_tm` 4509 + *n*, Bow 1, Clap 2, Air Punch 3 … Pray 17,
 * Pirouette 19, Professor's Pose 31; and the game orders them by a table
 * (`0x020e87c0`) whose first seventeen places are the tricks known from the
 * start — the setter refuses those — and whose others are learnt, a bit each
 * in the game-wide bank from `0xbf1` + place. The quests teach Pirouette
 * (`142:19`) and Pray (`142:17`); Porth Llaffan's 6.3 teaches Bow (`142:1`).
 */
export const OP_LEARN_TRICK = 142
/** The field menu's string for trick *n* is this + *n* — `str_tm` 4510 is Bow. */
export const TRICK_NAMES_FROM = 4509
/** How many party tricks there are: `str_tm` 4510 to 4540. */
export const TRICKS = 31
/** The game's order of the tricks, `0x020e87c0`: the trick at each place. */
const TRICK_ORDER: readonly number[] = [
  0, 3, 2, 4, 5, 6, 7, 8, 9, 10, 11, 18, 12, 13, 14, 15, 16, 17, 19, 1, 20, 21, 22, 23, 24, 25, 26,
  27, 28, 29, 30, 31,
]
/** The first place in {@link TRICK_ORDER} that is learnt rather than known from the start. */
const TRICKS_LEARNT_FROM = 17
/** Where trick *n*'s learnt bit is in the game-wide bank, or undefined for one known from the start or unknown. */
export function trickLearntBit(trick: number): number | undefined {
  const place = TRICK_ORDER.indexOf(trick)
  if (place < TRICKS_LEARNT_FROM || trick <= 0) return undefined
  return 0xbf1 + place
}
/** Whether the Hero can perform trick *n*: known from the start, or its learnt bit among the game-wide flags set. */
export function trickKnown(trick: number, globals: ReadonlySet<number>): boolean {
  if (trick <= 0 || trick > TRICKS) return false
  const bit = trickLearntBit(trick)
  return bit === undefined || globals.has(bit)
}
/** The tricks a {@link OP_TRICKS} or {@link OP_TRICKS_IN_ORDER} condition wants: the nonzero bytes of its word. */
export function tricksWanted(entry: TriggerWord): number[] {
  const word = (entry as Partial<TriggerEntry>).params?.[0]
  if (typeof word !== 'number') return []
  const out: number[] = []
  for (let i = 0; i < 4; i++) {
    const byte = (word >>> (8 * i)) & 0xff
    if (byte !== 0) out.push(byte)
  }
  return out
}
/**
 * Takes character *n*'s object out of the map — read from the game's code:
 * the queue's case (`0x0206fca0`) finds the object by its id
 * (`func_0203df78`) and sets bit `0x8000` in its first word, which every
 * lookup of the map's objects skips from then on (`func_0203df78`,
 * `func_0203dce4`), so the character is gone until the map is next placed.
 * Gleeba's Drak leaves so after his talk at 11.2, `124:200`; the bells at
 * 1.2 go quiet the same way.
 */
export const OP_REMOVE = 124
/**
 * Opens the Starflight Express's list of stops, `215 : mode` and two values
 * whose halves, high first, are up to four stops — read from the game's code:
 * the action's case (US ARM9 `0x02063e80`) hands them to the Express's task
 * (overlay 17 `func_ov017_021a8614`). Mode 0 is Stella, 1 Sterling. 16
 * records, on the conductors: Stella's at 6.1 to 10.8 is `215:0 1:2 0:0`, the
 * Observatory and Alltrades Abbey. See `express.ts` in the game.
 */
export const OP_EXPRESS = 215
/**
 * Sets the stop the Starflight Express is at — read from the game's code
 * (`0x02063eac`): the field state's halfword at `+0x27b4`, which the Express's
 * task reads to choose the scene that leaves it. `ev5110` sets 1, the
 * Observatory; `ev25524` 2, Alltrades Abbey.
 */
export const OP_EXPRESS_AT = 216

/**
 * Holds by the party's size (`func_0205faf4`, counting through
 * `func_02010890`): `13 : n` while it is at least n, `14 : n` at most n,
 * `15 : n` exactly n. Gortress's captain at 14.3 speaks one way to a party
 * of two or more (`13:2`) and another to the Hero alone (`15:1`).
 */
export const OP_PARTY_AT_LEAST = 13
export const OP_PARTY_AT_MOST = 14
export const OP_PARTY_IS = 15
/**
 * Holds only alone: `81 : 0` while no session runs (`func_0202b7d8`, the test
 * {@link OP_PLAYERS} makes), and `81 : n` never — INFERRED multiplayer, as 23.
 */
export const OP_NOT_TOGETHER = 81

/**
 * **A record for standing at a doorway**, value 5 = 17: read from the game's
 * code (ov017 `func_ov017_02198f84`), which, for each doorway region the Hero
 * is in, runs the first kind-17 record whose conditions hold with the
 * doorway's two numbers in the context (`+0x1c`, `+0x1e`, from the region's
 * `+0x2c` and `+0x2d` — the first two values of its `0x74`) and, unless the
 * region is now blocked, goes through. `108` blocks a doorway and `109`
 * unblocks one (a bit of the region, `func_02061c04`), and kinds 3 and 20's
 * `108` do so at map load. So a kind-17 record is "on trying this door": 507
 * on the cartridge, 395 of them `118` — someone stops the Hero and speaks —
 * and 9 an event. Coffinwell's `29:0 0:9 0:0 5:4 108:0 0:9 0:0 118:27 192:0`
 * at 4.5: at door 9 with flag 4 clear, block it and have 27 speak.
 */
export const KIND_DOORWAY = 17
/**
 * Holds at a doorway: `29 : n` with one value whose halves are the doorway's
 * two numbers, against the context's (`func_0205faf4`); `n` is the region's
 * word at `+0x20`, which is 0 on 505 of 507 records and is not read — taken
 * as 0.
 */
export const OP_AT_DOORWAY = 29
/** Blocks the doorway its value names — see {@link KIND_DOORWAY}. */
export const OP_BLOCK_DOORWAY = 108
/** Unblocks it. */
export const OP_UNBLOCK_DOORWAY = 109

/**
 * What standing at `doorway` in `map` runs: the first {@link KIND_DOORWAY}
 * record over the stage whose conditions hold for it — see {@link OP_AT_DOORWAY}.
 */
export function doorwayPlay(
  triggers: readonly Trigger[],
  map: number,
  stage: Stage,
  doorway: readonly [number, number],
  state: StoryState,
): EventOutcome | undefined {
  const more: Conditions = { ...state.more, doorway }
  for (const trigger of triggers) {
    if (trigger.unknown_5 !== KIND_DOORWAY || trigger.map !== map) continue
    if (order(trigger.from) > order(stage) || order(trigger.to) < order(stage)) continue
    if (!flagsHold(conditionsOf(trigger), state.flags, state.marks, state.step, more)) continue
    return outcomeOf(trigger)
  }
  return undefined
}

/** Whether a record blocks `doorway` as it runs — see {@link OP_BLOCK_DOORWAY}. */
export function blocksDoorway(outcome: EventOutcome, doorway: readonly [number, number]): boolean {
  let blocked = false
  for (const { op, params } of outcome.actions ?? []) {
    if ((op !== OP_BLOCK_DOORWAY && op !== OP_UNBLOCK_DOORWAY) || params.length !== 1) continue
    const value = params[0] as number
    if (((value >> 16) & 0xffff) !== doorway[0] || (value & 0xffff) !== doorway[1]) continue
    blocked = op === OP_BLOCK_DOORWAY
  }
  return blocked
}

/**
 * Holds by whether the Hero stands in a talk box of the one being talked to
 * (`func_0205faf4`, which walks the same list as the talk's target picker):
 * `41 : 0` when not, any other argument when so. See `TalkBox`.
 */
export const OP_IN_TALK_BOX = 41

/**
 * Holds for the character being talked to: the game's lookups put who it is
 * in the first word of the context they test a record in, and `6` compares
 * its argument with it (US ARM9 `func_0205faf4`). The talk's two lookups do —
 * see `KIND_OWN` and `KIND_TALK` in `apps/game`.
 */
export const OP_TALKED_TO = 6
/**
 * Holds for the label the talk was asked with — the context's word at `+0x14`,
 * which the talk sets (`func_0205faf4`; see `OP_TALK_TO`).
 */
export const OP_LABEL_IS = 11
/**
 * Holds for the answer the last prompt was given, from 0 — Yes — as the text
 * system keeps it (`func_020457e0`, a word at `+0x954`). Every talk's window
 * sets it to 0 as it opens (`func_0204500c`), so after a line that asks
 * nothing `16 : 0` holds.
 */
export const OP_ANSWER_IS = 16
/**
 * Holds by whether the Hero is down: `36 : 0` while a value of the Hero's
 * (`GameState` object 0, `+0x130`, then `+4`) is above 0, any other argument
 * while it is not (`func_0205faf4`). **INFERRED, that the value is the
 * Hero's HP**: its block holds it beside another at `+6`, and the block at
 * `+0x134` two more at `+0x30` and `+0x32`, and the field copies all four
 * from a packet together (ov017 `0x021c9fac`) — HP and MP, and their
 * maximums. A talk file's tag-5 lines ask the same (see `pickLine`), and say
 * things like "You're <LEADER>, that friend of <HERO>'s" — to whoever leads
 * while the Hero cannot.
 */
export const OP_HERO_DOWN = 36
/**
 * Holds when a game-wide flag is set, named by its number (US ARM9
 * `func_0206eb98`): below `0x400` the bit itself, and from there displaced,
 * as the cast script's flags are — see `flagBit`. `27` holds when it is clear.
 */
export const OP_IF_FLAG_NAMED = 26
/** Holds when a game-wide flag named by its number is clear — see {@link OP_IF_FLAG_NAMED}. */
export const OP_UNLESS_FLAG_NAMED = 27
/**
 * Holds when a game-wide flag of a block of 73 from bit 830 is set: `88 : n`
 * tests bit `830 + n`, and fails for n from 73 (`func_0205faf4`). What the
 * block is for is not established; the Quarantomb's records test 71 and 72.
 * `89` holds when it is clear, and for n from 73.
 */
export const OP_IF_FLAG_FROM_830 = 88
/** Holds when a flag of the block from bit 830 is clear — see {@link OP_IF_FLAG_FROM_830}. */
export const OP_UNLESS_FLAG_FROM_830 = 89
/** The first bit of {@link OP_IF_FLAG_FROM_830}'s block, and how many it holds. */
const FROM_830 = 830
const FROM_830_COUNT = 73

/**
 * Whether a record's flag conditions hold: every {@link OP_IF_FLAG} flag set
 * and every {@link OP_UNLESS_FLAG} one not — and, given `marks`, the same for
 * the second set, {@link OP_IF_MARK} and {@link OP_UNLESS_MARK}; given `step`,
 * every {@link OP_AT_STEP} naming it; given `more`, the game-wide flags, the
 * time of day, and whatever else of {@link Conditions} it gives; and always
 * {@link OP_PLAYERS}, as one playing alone. Its other conditions are not read.
 *
 * `words` should be a record's conditions — see {@link conditionsOf} — since a
 * word of operation 0 is also how an action's own values are written: the
 * three after `132` are a stage, not three game-wide flags.
 */
export function flagsHold(
  words: readonly TriggerWord[],
  flags: ReadonlySet<number>,
  marks?: ReadonlySet<number>,
  step?: number,
  more?: Conditions,
): boolean {
  const globals = more?.globals
  const sure = more?.globalsSure ?? globals
  const night = more?.night
  return words.every(
    (w) =>
      (w.op !== OP_IF_FLAG || flags.has(w.arg)) &&
      (w.op !== OP_UNLESS_FLAG || !flags.has(w.arg)) &&
      (marks === undefined ||
        ((w.op !== OP_IF_MARK || marks.has(w.arg)) &&
          (w.op !== OP_UNLESS_MARK || !marks.has(w.arg)))) &&
      (step === undefined || w.op !== OP_AT_STEP || w.arg === step) &&
      (w.op !== OP_PLAYERS || w.arg === 0 || w.arg === 2) &&
      (globals === undefined ||
        ((w.op !== OP_IF_GLOBAL || globals.has(w.arg)) &&
          (w.op !== OP_UNLESS_GLOBAL || !sure?.has(w.arg)))) &&
      (night === undefined || w.op !== OP_TIME || (w.arg === 1) === night) &&
      (globals === undefined ||
        ((w.op !== OP_IF_FLAG_NAMED || globals.has(flagBit(w.arg))) &&
          (w.op !== OP_UNLESS_FLAG_NAMED || !sure?.has(flagBit(w.arg))) &&
          (w.op !== OP_IF_FLAG_FROM_830 ||
            (w.arg < FROM_830_COUNT && globals.has(FROM_830 + w.arg))) &&
          (w.op !== OP_UNLESS_FLAG_FROM_830 ||
            w.arg >= FROM_830_COUNT ||
            !sure?.has(FROM_830 + w.arg)))) &&
      (more?.character === undefined || w.op !== OP_TALKED_TO || w.arg === more.character) &&
      (more?.label === undefined || w.op !== OP_LABEL_IS || w.arg === more.label) &&
      (more?.answer === undefined || w.op !== OP_ANSWER_IS || w.arg === more.answer) &&
      (more?.down === undefined || w.op !== OP_HERO_DOWN || (w.arg !== 0) === more.down) &&
      (more?.inBox === undefined || w.op !== OP_IN_TALK_BOX || (w.arg !== 0) === more.inBox) &&
      (more?.doorway === undefined || w.op !== OP_AT_DOORWAY || atDoorway(w, more.doorway)) &&
      (w.op !== OP_NOT_TOGETHER || w.arg === 0) &&
      (more?.party === undefined ||
        ((w.op !== OP_PARTY_AT_LEAST || more.party >= w.arg) &&
          (w.op !== OP_PARTY_AT_MOST || more.party <= w.arg) &&
          (w.op !== OP_PARTY_IS || more.party === w.arg))) &&
      (more?.tricks === undefined ||
        w.op !== OP_TRICKS ||
        tricksWanted(w).every((t) => (more.tricks as readonly number[]).includes(t))) &&
      (more?.quest === undefined || questConditionHolds(w, more.quest)),
  )
}

/** A quest condition — `20`, `21`, `22`, or a composite's test — with quests as `quest` has them; any other holds. */
function questConditionHolds(w: TriggerWord, quest: (quest: number) => number): boolean {
  const nibbleOf = (q: number) => (q >= 0 && q < 0xcc ? quest(q) : 0)
  if (w.op === OP_IF_QUEST_TAKEN) return (nibbleOf(w.arg) & 3) === QUEST_TAKEN
  if (w.op === OP_IF_QUEST_FLAG) return (nibbleOf(w.arg) & QUEST_FIRST_FLAG) !== 0
  if (w.op === OP_IF_QUEST_CLEARED) return (nibbleOf(w.arg) & 3) === QUEST_CLEARED
  const test = compositeQuest(w)
  return test === undefined || questHolds(nibbleOf(test.quest), test.mode)
}

/** Whether a `29` names `doorway` — see {@link OP_AT_DOORWAY}. The word's value is given by `entriesOf`. */
function atDoorway(word: TriggerWord, doorway: readonly [number, number]): boolean {
  const params = (word as Partial<TriggerEntry>).params
  const value = params?.[0]
  if (value === undefined) return false
  return ((value >> 16) & 0xffff) === doorway[0] && (value & 0xffff) === doorway[1]
}

/**
 * How many of the values after it an operation takes as its own, read from the
 * game's record parser (US ARM9 `func_0205ec70`): a word whose operation is
 * below 100 or from 500 is a condition, and one from 100 to 499 an action; each
 * then reads so many more values, integers or floats, before the next word.
 * Unlisted, none. `143` takes six floats and then an integer — the word after
 * an area's box that was not placed.
 */
const PARAMS: ReadonlyMap<number, number> = new Map([
  // Conditions.
  [29, 2],
  [32, 1],
  [33, 1],
  [44, 1],
  [46, 1],
  [47, 1],
  [48, 1],
  [49, 1],
  [50, 4],
  [52, 1],
  [53, 2],
  [54, 2],
  [55, 1],
  [56, 2],
  [57, 2],
  [58, 2],
  [59, 2],
  [60, 2],
  [61, 2],
  [62, 1],
  [63, 1],
  [64, 2],
  [65, 2],
  [66, 1],
  [69, 1],
  [70, 1],
  [73, 1],
  [74, 1],
  [75, 1],
  [76, 1],
  [78, 2],
  [79, 1],
  [82, 4],
  [83, 1],
  [85, 1],
  [90, 1],
  [91, 1],
  // Actions.
  [108, 2],
  [109, 2],
  [116, 1],
  [117, 1],
  [118, 1],
  [122, 3],
  [123, 1],
  [130, 1],
  [131, 1],
  [132, 3],
  [133, 1],
  [134, 1],
  [135, 1],
  [136, 2],
  [138, 1],
  [139, 1],
  [140, 1],
  [143, 7],
  [144, 1],
  [148, 3],
  [149, 1],
  [150, 1],
  [152, 2],
  [153, 2],
  [154, 2],
  [155, 1],
  [156, 1],
  [157, 1],
  [158, 1],
  [159, 1],
  [167, 1],
  [168, 1],
  [169, 1],
  [171, 1],
  [172, 1],
  [174, 1],
  [176, 1],
  [177, 1],
  [178, 3],
  [179, 1],
  [180, 1],
  [188, 2],
  [190, 2],
  [195, 1],
  [196, 1],
  [200, 1],
  [201, 1],
  [207, 2],
  [213, 2],
  [214, 3],
  [215, 2],
  [226, 1],
  [230, 1],
  [232, 1],
])

/** One of a record's operations and the values it takes — see {@link PARAMS}. */
export interface TriggerEntry {
  readonly op: number
  readonly arg: number
  /** Its own values: integers as the table holds them, floats as floats. */
  readonly params: readonly number[]
}

/** Whether an operation is a condition, as the game's parser sorts them — see {@link PARAMS}. */
export const isCondition = (op: number) => op < 100 || op >= 500

/**
 * A record's operations, each with the values it takes as its own, as the
 * game's parser splits them — see {@link PARAMS}. A value that is not an
 * integer where an operation is expected is skipped, as `triggerWords` skips
 * floats.
 */
/**
 * Conditions given as bare trigger words — a quest giver's (see
 * `QuestGiver.conditions`), which the game parses with the trigger parser
 * itself — as {@link conditionsOf} reads a record's.
 */
export function conditionsOfWords(values: readonly number[]): TriggerEntry[] {
  const words = Uint32Array.from(values)
  const as = {
    values: words,
    kinds: new Uint8Array(words.length).fill(1),
    floats: new Float32Array(words.buffer.slice(0)),
  } as unknown as Trigger
  return entriesOf(as)
    .filter((entry) => isCondition(entry.op))
    .flatMap(expanded)
}

export function entriesOf(trigger: Trigger): TriggerEntry[] {
  const { values, kinds, floats } = trigger
  const out: TriggerEntry[] = []
  let i = 0
  while (i < values.length) {
    if (kinds[i] !== 1) {
      i++
      continue
    }
    const value = values[i] as number
    const op = value >>> 16
    const count = PARAMS.get(op) ?? 0
    const params: number[] = []
    for (let k = 1; k <= count && i + k < values.length; k++) {
      params.push(kinds[i + k] === 2 ? (floats[i + k] as number) : (values[i + k] as number))
    }
    out.push({ op, arg: value & 0xffff, params })
    i += 1 + count
  }
  return out
}

/**
 * The basic conditions a composite one tests, read from the game's code
 * (US ARM9 `func_0205faf4`): 52 to 61 each test a character (`6`) and then
 * more, taking each of their values as its high and low half in turn. 52 is
 * a character, a flag clear (`5`) and who is playing (`23`) — Stornway's
 * lobby at 2.7, `52:205 3:2 119:2940 104:3`, talking to 205 while flag 3 is
 * clear. 53 to 61 also call `func_0206474c` on the first value's halves, which
 * tests one of four states of an id (`func_0206e120`) — quest progress,
 * perhaps, and **not read**: the composite is kept beside what it expands to,
 * so that part is left to hold, as other conditions not read are. 53 adds a
 * label (`11`) and an answer (`16`), 54 a `18`, 56 a `36`, 57 and 58 a `23`,
 * 61 a `23`. 62 and 63 are 52's kind, with a game-wide flag set (`0`) and
 * clear (`1`): 63 opens the Quester's Rest's counter, `63:99 161:2 36:0
 * 100:161 118:99 222:0`, until flag 161 is set. 1,495 records carry one, 537
 * of them `55`.
 */
function expanded(entry: TriggerEntry): TriggerEntry[] {
  const halves = entry.params.flatMap((v) => [(v >> 16) & 0xffff, v & 0xffff])
  const half = (i: number) => halves[i] ?? 0
  const basic = (op: number, arg: number): TriggerEntry => ({ op, arg, params: [] })
  const character = basic(OP_TALKED_TO, entry.arg)
  switch (entry.op) {
    case 52:
      return [character, basic(OP_UNLESS_FLAG, half(0)), basic(OP_PLAYERS, half(1))]
    case 53:
      return [entry, character, basic(OP_LABEL_IS, half(2)), basic(OP_ANSWER_IS, half(3))]
    case 54:
      return [entry, character, basic(18, half(2))]
    case 56:
      return [entry, character, basic(36, half(2))]
    // 57 and 58 test the flag their third half names, set and clear, as 26
    // and 27 do (`func_0206eb98`); 59 and 60 the same without the players.
    case 57:
      return [entry, character, basic(26, half(2)), basic(OP_PLAYERS, half(3))]
    case 58:
      return [entry, character, basic(27, half(2)), basic(OP_PLAYERS, half(3))]
    case 59:
      return [entry, character, basic(26, half(2))]
    case 60:
      return [entry, character, basic(27, half(2))]
    case 61:
      return [entry, character, basic(OP_PLAYERS, half(2))]
    case 62:
      return [character, basic(OP_IF_GLOBAL, half(0)), basic(OP_PLAYERS, half(1))]
    case 63:
      return [character, basic(OP_UNLESS_GLOBAL, half(0)), basic(OP_PLAYERS, half(1))]
    case 55:
      return [entry, character]
    default:
      return [entry]
  }
}

/**
 * A record's conditions, without any action's own values — see
 * {@link entriesOf} — and each composite one with the basic conditions it tests
 * beside it — see {@link expanded}.
 */
export function conditionsOf(trigger: Trigger): TriggerEntry[] {
  return entriesOf(trigger)
    .filter((entry) => isCondition(entry.op))
    .flatMap(expanded)
}

/** The marks a record sets — see {@link OP_SET_MARK}. */
export function marksSet(words: readonly TriggerWord[]): number[] {
  return words.filter((w) => w.op === OP_SET_MARK).map((w) => w.arg)
}

/**
 * Talking to the character opens a facility — **read** (US ARM9, case 31 of
 * `func_0206f81c`, its table at `0x02070134`, checked from raw bytes):
 *
 * | value | what |
 * |---|---|
 * | 0, 1, 3, 4 | nothing |
 * | 2 | **the Rapportal** — Patty's flow in mode 1, as `<LAVIELL>` (code 8): Pavo, character 99. Multiplayer |
 * | 5 | **DQVC, connected**: `auction.stb` |
 * | 6 | **DQVC without connecting**: bit `0x20` of `GameState+0x5f78` set, then 5's arm |
 * | 7 | the mini medals, `medal.stb` — Cap'n Max Meddlin', `M08` map 1807 |
 * | 8 | `memory2.stb` |
 *
 * `145` occurs 58 times on the cartridge, always on a character's record
 * beside `6`. Stornway's 0 and 3 do nothing — its bank is `<BANK>` on a line.
 * The numbering is its own: the line-tag facility codes put the Krak Pot at 7.
 */
export const OP_FACILITY = 145
/** The mini medal service, by {@link OP_FACILITY} — see there. */
export const FACILITY_MEDALS = 7
/**
 * DQVC by Nintendo Wi-Fi Connection, by {@link OP_FACILITY}: its arm
 * (`0x0207019c`) runs `auction.stb`. Sellma's "Connect to Nintendo Wi-Fi
 * Connection? — Yes" (labels 114, 115). Value 6 (`0x02070164`) sets bit `0x20`
 * of `GameState+0x5f78` and falls into this arm — her "use DQVC without
 * connecting instead?" (113, 126, 127, 131); INFERRED the bit means "not
 * connected", from those labels.
 */
export const FACILITY_DQVC_ONLINE = 5

/**
 * The facility talking to `character` opens in `map` at `stage`: the first
 * record for the map whose span covers the stage, naming the character and a
 * facility. Undefined when none does.
 */
export function facilityFor(
  triggers: readonly Trigger[],
  map: number,
  character: number,
  stage: Stage,
): number | undefined {
  const at = order(stage)
  for (const trigger of triggers) {
    if (trigger.map !== map || at < order(trigger.from) || at > order(trigger.to)) continue
    const named = conditionsOf(trigger).some((w) => w.op === OP_TALKED_TO && w.arg === character)
    if (!named) continue
    const facility = triggerWords(trigger).find((w) => w.op === OP_FACILITY)
    if (facility) return facility.arg
  }
  return undefined
}
