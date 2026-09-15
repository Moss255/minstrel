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
 */
export const OP_STAGE_TO = 132
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
): { readonly event: number; readonly flags: readonly number[] } | undefined {
  for (const trigger of triggers) {
    if (trigger.unknown_5 !== KIND_ENTRY || trigger.map !== map) continue
    if (order(trigger.from) > order(stage) || order(trigger.to) < order(stage)) continue
    const words = triggerWords(trigger)
    if (!words.some((w) => w.op === OP_ENTERED && w.arg === map)) continue
    if (!flagsHold(words, flags, undefined, step)) continue
    const plays = words.find((w) => w.op === OP_EVENT)
    if (plays) {
      return {
        event: plays.arg,
        flags: words.filter((w) => w.op === OP_SET_FLAG).map((w) => w.arg),
      }
    }
  }
  return undefined
}

/** Value 5 of a map's settings records, where its areas are defined — see {@link OP_AREA}. */
export const KIND_SETTINGS = 20
/**
 * Defines area *n* of the map: six floats follow, a box — its greater corner,
 * then its lesser, x, y and z, in the units map placements use — and then a
 * word of operation 0 whose argument is not established. INFERRED: all 108
 * area words on the cartridge are followed by six floats, and on 108 of 108
 * the first three are at or above the last three on every axis; the boxes
 * sampled — the mayor's house's one, the pass's six — lie inside their map.
 */
export const OP_AREA = 143
/**
 * Value 5 of a record that acts when the Hero walks into an area, the one
 * {@link OP_IN_AREA} names. INFERRED: 102 of the 110 name an area their map
 * defines. The mayor's house at 2.1, `7:15 5:1 119:2120`, plays his scene
 * with Ivor, and its own record sets the flag after which Erinn asks the
 * Hero in for the night.
 */
export const KIND_AREA_EVENT = 2
/** The area a {@link KIND_AREA_EVENT} record is about. */
export const OP_IN_AREA = 7

/** An area of a map — see {@link OP_AREA}. */
export interface StoryArea {
  readonly id: number
  readonly max: { readonly x: number; readonly y: number; readonly z: number }
  readonly min: { readonly x: number; readonly y: number; readonly z: number }
  /** The argument of the operation-0 word after the floats: 0, 337, 325 … Not established. */
  readonly unknown_after: number | undefined
}

/** The areas `map`'s settings records define over `stage` — see {@link OP_AREA}. */
export function areasOf(triggers: readonly Trigger[], map: number, stage: Stage): StoryArea[] {
  const found: StoryArea[] = []
  for (const trigger of triggers) {
    if (trigger.unknown_5 !== KIND_SETTINGS || trigger.map !== map) continue
    if (order(trigger.from) > order(stage) || order(trigger.to) < order(stage)) continue
    const { values, kinds, floats } = trigger
    for (let i = 0; i < values.length; i++) {
      if (kinds[i] !== 1 || (values[i] as number) >>> 16 !== OP_AREA) continue
      const box: number[] = []
      let j = i + 1
      while (j < values.length && kinds[j] === 2 && box.length < 6) box.push(floats[j++] as number)
      if (box.length < 6) continue
      const [x1, y1, z1, x2, y2, z2] = box as [number, number, number, number, number, number]
      found.push({
        id: (values[i] as number) & 0xffff,
        max: { x: x1, y: y1, z: z1 },
        min: { x: x2, y: y2, z: z2 },
        unknown_after: kinds[j] === 1 ? (values[j] as number) & 0xffff : undefined,
      })
    }
  }
  return found
}

/**
 * Whether someone standing at `x`, `y`, `z` — their feet — and `height` tall
 * is in the area: within its box across the ground, and overlapping it in
 * height. How the game tests it is not read; this is the box as it reads.
 */
export function inArea(area: StoryArea, x: number, y: number, z: number, height = 0): boolean {
  return (
    x >= area.min.x &&
    x <= area.max.x &&
    z >= area.min.z &&
    z <= area.max.z &&
    y + height >= area.min.y &&
    y <= area.max.y
  )
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
): { readonly event: number; readonly flags: readonly number[] } | undefined {
  for (const trigger of triggers) {
    if (trigger.unknown_5 !== KIND_AREA_EVENT || trigger.map !== map) continue
    if (order(trigger.from) > order(stage) || order(trigger.to) < order(stage)) continue
    const words = triggerWords(trigger)
    const area = words.find((w) => w.op === OP_IN_AREA)
    if (!area || !entered(area.arg)) continue
    if (!flagsHold(words, flags, undefined, step)) continue
    const plays = words.find((w) => w.op === OP_EVENT)
    if (plays) {
      return {
        event: plays.arg,
        flags: words.filter((w) => w.op === OP_SET_FLAG).map((w) => w.arg),
      }
    }
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
}

/**
 * What follows an event, from its own record: the one in `map`, if it has one
 * there, or else the first. `undefined` when no record is the event's.
 */
export function eventOutcome(
  triggers: readonly Trigger[],
  event: number,
  map?: number,
): EventOutcome | undefined {
  const own = triggers.filter(
    (t) =>
      t.unknown_5 === KIND_EVENT &&
      triggerWords(t).some((w) => w.op === OP_EVENT_OF && w.arg === event),
  )
  const record = own.find((t) => t.map === map) ?? own[0]
  if (!record) return undefined
  const words = triggerWords(record)

  let stage: StoryPoint | undefined
  const at = words.findIndex((w) => w.op === OP_STAGE_TO)
  const args = at < 0 ? [] : words.slice(at + 1, at + 4)
  if (args.length === 3 && args.every((w) => w.op === 0)) {
    const [major, minor, step] = args.map((w) => w.arg) as [number, number, number]
    stage = { major, minor, step }
  }

  let onward: EventOutcome['onward']
  const go = words.findIndex((w) => w.op === OP_THEN_MAP)
  const next = go < 0 ? undefined : words[go + 1]
  if (go >= 0 && next && next.arg === 0)
    onward = { map: (words[go] as TriggerWord).arg, event: next.op }

  return {
    stage,
    flags: words.filter((w) => w.op === OP_SET_FLAG).map((w) => w.arg),
    onward,
    battle: words.find((w) => w.op === OP_BATTLE)?.arg,
  }
}

/** What follows a set battle — see {@link afterBattle}. */
export interface BattleOutcome {
  /** The event its record plays, if it names one. */
  readonly event: number | undefined
  /** The flags it sets. */
  readonly flags: readonly number[]
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
): BattleOutcome | undefined {
  const kind = won ? KIND_WON : KIND_LOST
  for (const trigger of triggers) {
    if (trigger.unknown_5 !== kind || (map !== undefined && trigger.map !== map)) continue
    const words = triggerWords(trigger)
    const first = words[0]
    if (first?.op !== OP_AFTER_BATTLE || first.arg !== battle) continue
    return {
      event: words.find((w) => w.op === OP_EVENT)?.arg,
      flags: words.filter((w) => w.op === OP_SET_FLAG).map((w) => w.arg),
    }
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

/**
 * Whether a record's flag conditions hold: every {@link OP_IF_FLAG} flag set
 * and every {@link OP_UNLESS_FLAG} one not — and, given `marks`, the same for
 * the second set, {@link OP_IF_MARK} and {@link OP_UNLESS_MARK}; given `step`,
 * every {@link OP_AT_STEP} naming it. Without `marks` or `step` those are not
 * read. Its other conditions are not read.
 */
export function flagsHold(
  words: readonly TriggerWord[],
  flags: ReadonlySet<number>,
  marks?: ReadonlySet<number>,
  step?: number,
): boolean {
  return words.every(
    (w) =>
      (w.op !== OP_IF_FLAG || flags.has(w.arg)) &&
      (w.op !== OP_UNLESS_FLAG || !flags.has(w.arg)) &&
      (marks === undefined ||
        ((w.op !== OP_IF_MARK || marks.has(w.arg)) &&
          (w.op !== OP_UNLESS_MARK || !marks.has(w.arg)))) &&
      (step === undefined || w.op !== OP_AT_STEP || w.arg === step),
  )
}

/** The marks a record sets — see {@link OP_SET_MARK}. */
export function marksSet(words: readonly TriggerWord[]): number[] {
  return words.filter((w) => w.op === OP_SET_MARK).map((w) => w.arg)
}
