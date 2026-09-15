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
): number | undefined {
  for (const trigger of triggers) {
    if (trigger.unknown_5 !== KIND_ENTRY || trigger.map !== map) continue
    if (order(trigger.from) > order(stage) || order(trigger.to) < order(stage)) continue
    const words = triggerWords(trigger)
    if (!words.some((w) => w.op === OP_ENTERED && w.arg === map)) continue
    if (!flagsHold(words, flags)) continue
    const plays = words.find((w) => w.op === OP_EVENT)
    if (plays) return plays.arg
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
  }
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
 * the second set, {@link OP_IF_MARK} and {@link OP_UNLESS_MARK}. Without
 * `marks` those are not read. Its other conditions are not read.
 */
export function flagsHold(
  words: readonly TriggerWord[],
  flags: ReadonlySet<number>,
  marks?: ReadonlySet<number>,
): boolean {
  return words.every(
    (w) =>
      (w.op !== OP_IF_FLAG || flags.has(w.arg)) &&
      (w.op !== OP_UNLESS_FLAG || !flags.has(w.arg)) &&
      (marks === undefined ||
        ((w.op !== OP_IF_MARK || marks.has(w.arg)) &&
          (w.op !== OP_UNLESS_MARK || !marks.has(w.arg)))),
  )
}

/** The marks a record sets — see {@link OP_SET_MARK}. */
export function marksSet(words: readonly TriggerWord[]): number[] {
  return words.filter((w) => w.op === OP_SET_MARK).map((w) => w.arg)
}
