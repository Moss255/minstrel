import {
  KIND_AREA_EVENT,
  KIND_ENTRY,
  KIND_EVENT,
  KIND_LOST,
  KIND_WON,
  OP_AT_STEP,
  OP_EVENT,
  OP_EVENT_OF,
  OP_IF_FLAG,
  OP_THEN_MAP,
  OP_UNLESS_FLAG,
  type Trigger,
  type TriggerStage,
  triggerWords,
} from '@minstrel/game-formats'

/**
 * Every scene on the cartridge, and the ways the game gets to it — for the
 * scene browser, which plays one without playing the game up to it.
 *
 * **Read from the triggers, not chosen.** A scene is played by a record that
 * names it with `119` — talking to someone, walking into an area, entering a
 * map, winning or losing a set battle — or handed on to by another scene's own
 * record with `133`. Each record carries the map it is in, the span of the
 * story it holds over, the flags it wants set and unset, and sometimes a step.
 * Those are what the browser sets before it plays, so the scene starts as the
 * game would start it. See `packages/game-formats/FORMAT.md`, "Triggers"; the
 * readings there are INFERRED, with the measure behind each.
 *
 * What the records do not carry is not guessed: who is in the party, and any
 * condition past the flags and the step. The browser shows the conditions it
 * sets, and lets them be changed before playing.
 */

/** How a record gets to its scene — `FORMAT.md`, "Triggers", by value 5. */
export type SceneWayKind = 'talk' | 'area' | 'entry' | 'won' | 'lost' | 'handed' | 'other'

const KIND_TALK = 1

/** One way the game gets to a scene: the record that plays it, read. */
export interface SceneWay {
  readonly kind: SceneWayKind
  /** The area whose trigger file holds the record, `M01`. */
  readonly area: string
  /** The map the record is for, by the map's own id. */
  readonly map: number
  readonly from: TriggerStage
  readonly to: TriggerStage
  /** The step it wants, when it tests one. */
  readonly step: number | undefined
  /** The flags it wants set, and the ones it wants not set. */
  readonly flags: readonly number[]
  readonly unless: readonly number[]
  /** For a talk record, the character talked to, by `6`; for a handed one, the scene that hands on. */
  readonly who: number | undefined
}

export interface SceneEntry {
  readonly event: number
  /** Every record that gets to it, in the trigger files' own order. */
  readonly ways: readonly SceneWay[]
}

/** What the browser sets before playing a scene one way. */
export interface SceneConditions {
  readonly event: number
  readonly map: number
  readonly stage: TriggerStage
  readonly step: number | undefined
  readonly flags: readonly number[]
}

/** The character a talk record is about, by operation 6 — see `FORMAT.md`, "Triggers". */
const OP_CHARACTER = 6

function kindOf(value5: number): SceneWayKind {
  if (value5 === KIND_TALK) return 'talk'
  if (value5 === KIND_AREA_EVENT) return 'area'
  if (value5 === KIND_ENTRY) return 'entry'
  if (value5 === KIND_WON) return 'won'
  if (value5 === KIND_LOST) return 'lost'
  return 'other'
}

/**
 * The scene index: one entry per scene any record gets to, in event order.
 * `areas` is each area's code and its trigger records.
 */
export function sceneIndex(
  areas: readonly { readonly code: string; readonly triggers: readonly Trigger[] }[],
): SceneEntry[] {
  const byEvent = new Map<number, SceneWay[]>()
  // A file can hold the same record twice — the Hexagon's talk to Patty
  // does — and two identical ways are one way to play it.
  const seen = new Set<string>()
  const add = (event: number, way: SceneWay) => {
    const key = JSON.stringify([event, way])
    if (seen.has(key)) return
    seen.add(key)
    const ways = byEvent.get(event)
    if (ways) ways.push(way)
    else byEvent.set(event, [way])
  }
  for (const { code, triggers } of areas) {
    for (const trigger of triggers) {
      const words = triggerWords(trigger)
      const base = {
        area: code,
        from: trigger.from,
        to: trigger.to,
        step: words.find((w) => w.op === OP_AT_STEP)?.arg,
        flags: words.filter((w) => w.op === OP_IF_FLAG).map((w) => w.arg),
        unless: words.filter((w) => w.op === OP_UNLESS_FLAG).map((w) => w.arg),
      }
      if (trigger.unknown_5 === KIND_EVENT) {
        // A scene's own record handing on: `133` names the map, and the next
        // word's operation is the scene, its argument 0 — see `eventOutcome`.
        const at = words.findIndex((w) => w.op === OP_THEN_MAP)
        const next = at < 0 ? undefined : words[at + 1]
        const handing = words.find((w) => w.op === OP_EVENT_OF)?.arg
        const map = at < 0 ? undefined : words[at]?.arg
        if (next && next.arg === 0 && map !== undefined) {
          add(next.op, { ...base, kind: 'handed', map, who: handing })
        }
        continue
      }
      for (const word of words) {
        if (word.op !== OP_EVENT) continue
        add(word.arg, {
          ...base,
          kind: kindOf(trigger.unknown_5),
          map: trigger.map,
          who:
            trigger.unknown_5 === KIND_TALK
              ? words.find((w) => w.op === OP_CHARACTER)?.arg
              : undefined,
        })
      }
    }
  }
  return [...byEvent].sort(([a], [b]) => a - b).map(([event, ways]) => ({ event, ways }))
}

/**
 * What to set to play `event` the way `way` gets to it: the map it is in, the
 * first stage of the record's span, its step, and the flags it wants set. The
 * flags it wants *un*set are met by starting from none.
 */
export function conditionsFor(event: number, way: SceneWay): SceneConditions {
  return { event, map: way.map, stage: way.from, step: way.step, flags: way.flags }
}

/** A stage as the game's URL and the browser write it, `2.4`. */
export function stageText(stage: TriggerStage): string {
  return `${stage.major}.${stage.minor}`
}

/**
 * The scene an entry is best played by when nothing else is chosen: the way
 * that starts earliest in the story, so it is seen as it first comes.
 */
export function firstWay(entry: SceneEntry): SceneWay | undefined {
  let best: SceneWay | undefined
  for (const way of entry.ways) {
    const at = way.from.major * 100 + way.from.minor
    if (!best || at < best.from.major * 100 + best.from.minor) best = way
  }
  return best
}
