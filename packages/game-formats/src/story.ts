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
  | { readonly event: number; readonly flags: readonly number[]; readonly outcome: EventOutcome }
  | undefined {
  for (const trigger of triggers) {
    if (trigger.unknown_5 !== KIND_ENTRY || trigger.map !== map) continue
    if (order(trigger.from) > order(stage) || order(trigger.to) < order(stage)) continue
    const words = triggerWords(trigger)
    if (!words.some((w) => w.op === OP_ENTERED && w.arg === map)) continue
    if (!flagsHold(conditionsOf(trigger), flags, undefined, step, more)) continue
    const outcome = outcomeOf(trigger)
    if (outcome.event !== undefined) return { event: outcome.event, flags: outcome.flags, outcome }
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
 * The event walking into an area plays: the first {@link KIND_AREA_EVENT}
 * record for the map, over the stage, whose area `entered` says the Hero has
 * walked into and whose conditions hold, naming an event — and the flags it
 * sets itself, as an entry record's are.
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
  | { readonly event: number; readonly flags: readonly number[]; readonly outcome: EventOutcome }
  | undefined {
  for (const trigger of triggers) {
    if (trigger.unknown_5 !== KIND_AREA_EVENT || trigger.map !== map) continue
    if (order(trigger.from) > order(stage) || order(trigger.to) < order(stage)) continue
    const words = triggerWords(trigger)
    const area = words.find((w) => w.op === OP_IN_AREA)
    if (!area || !entered(area.arg)) continue
    if (!flagsHold(conditionsOf(trigger), flags, undefined, step, more)) continue
    const outcome = outcomeOf(trigger)
    if (outcome.event !== undefined) return { event: outcome.event, flags: outcome.flags, outcome }
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
  const threads: { thread: number; stage: StoryPoint }[] = []
  for (const entry of entries) {
    if (entry.op !== OP_THREAD_STAGE_TO) continue
    const stage = point(entry)
    if (stage) threads.push({ thread: entry.arg, stage })
  }
  return {
    stage: point(entries.find((e) => e.op === OP_STAGE_TO)),
    flags: args(OP_SET_FLAG),
    onward: go ? { map: go.arg, event: (go.params[0] as number) >>> 16 } : undefined,
    battle: entries.find((e) => e.op === OP_BATTLE)?.arg,
    threads,
    joins: args(OP_JOIN),
    leaves: entries.some((e) => e.op === OP_LEAVE),
    all: point(entries.find((e) => e.op === OP_ALL_STAGES_TO)),
    unflags: args(OP_CLEAR_FLAG),
    marks: args(OP_SET_MARK),
    unmarks: args(OP_CLEAR_MARK),
    globals: args(OP_SET_GLOBAL),
    unglobals: args(OP_CLEAR_GLOBAL),
    event: entries.find((e) => e.op === OP_EVENT)?.arg,
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
}

/**
 * Whether a record's flag conditions hold: every {@link OP_IF_FLAG} flag set
 * and every {@link OP_UNLESS_FLAG} one not — and, given `marks`, the same for
 * the second set, {@link OP_IF_MARK} and {@link OP_UNLESS_MARK}; given `step`,
 * every {@link OP_AT_STEP} naming it; given `more`, the game-wide flags and
 * the time of day; and always {@link OP_PLAYERS}, as one playing alone.
 * Its other conditions are not read.
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
      (night === undefined || w.op !== OP_TIME || (w.arg === 1) === night),
  )
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
 * 61 a `23`. 1,409 records carry one, 537 of them `55`.
 */
function expanded(entry: TriggerEntry): TriggerEntry[] {
  const halves = entry.params.flatMap((v) => [(v >> 16) & 0xffff, v & 0xffff])
  const half = (i: number) => halves[i] ?? 0
  const basic = (op: number, arg: number): TriggerEntry => ({ op, arg, params: [] })
  const character = basic(OP_CHARACTER, entry.arg)
  switch (entry.op) {
    case 52:
      return [character, basic(OP_UNLESS_FLAG, half(0)), basic(OP_PLAYERS, half(1))]
    case 53:
      return [entry, character, basic(OP_LABEL_IS, half(2)), basic(OP_ANSWER_IS, half(3))]
    case 54:
      return [entry, character, basic(18, half(2))]
    case 56:
      return [entry, character, basic(36, half(2))]
    case 57:
    case 58:
      return [entry, character, basic(OP_PLAYERS, half(3))]
    case 61:
      return [entry, character, basic(OP_PLAYERS, half(2))]
    case 55:
    case 59:
    case 60:
      return [entry, character]
    default:
      return [entry]
  }
}

/** The talk label a talk record is for — see `pickLine` in `apps/game`. */
const OP_LABEL_IS = 11
/** The prompt's answer a talk record waits for — see `pickLine` in `apps/game`. */
const OP_ANSWER_IS = 16

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
 * Talking to the character opens a facility — INFERRED from where it stands:
 * `145` occurs 58 times on the cartridge, always on a character's record
 * beside `6`, always in a place with a counter to serve at — 0, 2 and 3 in
 * Stornway, which has the bank and a church; 2, 5 and 6 at the Quester's Rest,
 * Patty's and the counter's — and **7 once, on Cap'n Max Meddlin'** in his
 * castle (`M08`, map 1807: `6:103 145:7`), whose talk file is empty and whose
 * lines are the medal service's own. The numbering is its own: the line-tag
 * facility codes put the Krak Pot at 7.
 */
export const OP_FACILITY = 145
/** The mini medal service, by {@link OP_FACILITY} — see there. */
export const FACILITY_MEDALS = 7
/** The character a talk record is about. */
const OP_CHARACTER = 6

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
    const named = conditionsOf(trigger).some((w) => w.op === OP_CHARACTER && w.arg === character)
    if (!named) continue
    const facility = triggerWords(trigger).find((w) => w.op === OP_FACILITY)
    if (facility) return facility.arg
  }
  return undefined
}
