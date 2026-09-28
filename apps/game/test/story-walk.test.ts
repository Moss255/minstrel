import { readFileSync } from 'node:fs'
import { scanCartridge } from '@minstrel/cartridge'
import {
  afterBattle,
  areaEvent,
  areasOf,
  conditionsOf,
  type EventOutcome,
  entryPlay,
  eventOutcome,
  flagsHold,
  isMapList,
  KIND_AREA_EVENT,
  KIND_ENTRY,
  KIND_WATCH,
  OP_AFTER_BATTLE,
  OP_AT_STEP,
  OP_BATTLE,
  OP_EVENT,
  OP_EVENT_OF,
  OP_IF_FLAG,
  OP_IF_GLOBAL,
  OP_IF_MARK,
  OP_IN_AREA,
  OP_STAGE_TO,
  OP_THEN_MAP,
  OP_UNLESS_FLAG,
  OP_UNLESS_GLOBAL,
  OP_UNLESS_MARK,
  readMapList,
  readScript,
  type Script,
  type StoryState,
  type Trigger,
  triggerWords,
  watchPlay,
} from '@minstrel/game-formats'
import { beforeAll, describe, expect, it } from 'vitest'
import { EventPlayer } from '../src/event.ts'
import { allTriggers, type Stage, type StoryView, storyView } from '../src/load.ts'
import { copyStory, moveStory, type Story, THREADS, threadOf, unstarted } from '../src/story.ts'
import { letterForStage, pickLine } from '../src/talk.ts'

const romPath = process.env.MINSTREL_TEST_ROM

/**
 * **Can the story be played from one stage to the next, by the engine's own
 * rules?**
 *
 * Phase 3 is done when the story plays from a new game to the credits in one
 * save — `docs/beyond-the-slice.md`. Every area loads, walks, talks and plays
 * its scenes (the other coverage tests), but each was opened on its own with a
 * stage given, never reached by playing. This follows the story instead.
 *
 * It plays what the game plays, with the functions the game uses: entering a
 * map (`entryPlay`), walking into one of its areas (`areaEvent`), talking to
 * whoever stands there (`castAt`'s choice and `pickLine`), each event's script
 * run to see what it chains into (`538`), and then what follows — the event's
 * own record (`eventOutcome`, applied by `moveStory`, as `followEvent` does),
 * a set battle won (`afterBattle`), a hand-on to another map. Every state the
 * story can reach is visited: each of its five threads' stage, step, flags
 * and marks, and who goes along. A move reads and writes the thread of the
 * map it is made in, as the game's does — see `THREADS` in `story.ts`.
 *
 * Where no move carries the story on, that is a **break**, and the walk starts
 * again from the earliest stage a record sets that no walk has reached — as
 * the witness does with `--stage=` — so one break does not hide the rest. Each break says which
 * records would have moved the story on and why none did. **That list, in
 * story order, is Phase 3's worklist** — `docs/story-walk.md`.
 *
 * **What it does not check**, so the result is not read for more than it says:
 *
 * - **Where the Hero can get to.** Every map is taken to be in reach: a ship,
 *   a sealed door or the Starflight Express is not modelled.
 * - **Time of day.** By day throughout.
 * - **Anything not in the triggers or the scripts' chains**: the game's code
 *   may start an event itself, and where it does, that shows here as an event
 *   nothing reaches.
 * - **Whether a character can be built.** Presence is `castAt`'s choice
 *   before anyone is built, so one the build leaves out as missing counts.
 * - **The first thing a new game plays**, which is not read. The walk opens at
 *   1.1 with no step, as `?stage=` does.
 * - **Every order of talking.** Talk that only sets marks is taken all at
 *   once, as everyone talked to; each event is tried before it as well.
 *
 * Local-only: skipped without a dump.
 */
describe.skipIf(!romPath)('the story, followed from stage to stage', () => {
  /** How many states one walk may visit before it is called a runaway. */
  const STATE_CAP = 50_000
  /** How many frames one script may run to find what it chains into. */
  const FRAME_CAP = 20_000
  /** The operations `story.ts`, `talk.ts` and `services.ts` read. The rest are reported as not read. */
  const READ = new Set([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 16, 17, 23, 35, 36, 52, 86, 100, 101, 102, 103, 104, 105,
    118, 119, 120, 132, 133, 138, 143, 145, 148, 177, 204, 205, 214, 226,
  ])
  /** Sets a stage of one of several stories at once — see "Threads" in `docs/story-walk.md`. Not read. */
  const OP_THREAD_STAGE_TO = 214

  /** A point to reach: a stage and the step some record sets. */
  interface Point {
    readonly major: number
    readonly minor: number
    readonly step: number
  }
  const order = (p: Stage) => p.major * 100 + p.minor
  const pointOrder = (p: Point) => order(p) * 100 + p.step
  const show = (p: Point | Stage) =>
    'step' in p ? `${p.major}.${p.minor} step ${p.step}` : `${p.major}.${p.minor}`

  /** A record that sets a stage: its own words, whoever reaches it, and what it sets. */
  interface Setter {
    readonly area: string
    readonly trigger: Trigger
    readonly op: number
    readonly thread: number
    readonly to: Point
    /** The event the record is about, if it is an event's own. */
    readonly event: number | undefined
  }

  /** Where the story stands: each of its five threads, and who goes along. */
  interface State {
    /** By thread — see `THREADS` in `story.ts`. The map a move is made in decides which it reads. */
    threads: Story[]
    /** Who goes along, by their place in `attnpc`. */
    party: number[]
    /**
     * The game-wide flags — see `OP_SET_GLOBAL` — followed as those that may be
     * set and those that surely are, since every combination of them would be
     * a state of its own. See `walkFrom`.
     */
    globals: Set<number>
    sure: Set<number>
  }

  /** A stage and step to start a walk from, and the thread it is in. */
  interface Seed extends Point {
    readonly thread: number
  }

  interface Walk {
    readonly from: Seed
    readonly reached: Map<string, Point>
    /** Every state it visited. */
    readonly visited: readonly State[]
    readonly capped: boolean
    /** The events it played, by their own number. */
    readonly played: Set<number>
  }

  let triggersOf: Map<string, Trigger[]>
  /** A map's id to the area whose triggers it answers to. */
  const areaOfMap = new Map<number, string>()
  /** The records of a map, by area — so a stage's can be taken once. */
  const byMap = new Map<number, Trigger[]>()
  const views = new Map<string, StoryView>()
  const scripts = new Map<number, Script>()
  /** Each event's script run with chaining on: what it chains into, in order, or why it would not run. */
  const chains = new Map<number, number[] | string>()
  const setters: Setter[] = []
  /** Every event a record plays or hands on to: the record, its area, and whether it hands on. */
  const reachedBy = new Map<
    number,
    { readonly area: string; readonly trigger: Trigger; readonly handOn: boolean }[]
  >()
  /** Each set battle's number to the events whose records start it. */
  const reachedByBattle = new Map<number, Set<number>>()
  let walks: Walk[] = []
  let breaks: {
    readonly after: Point | undefined
    readonly next: Point
    readonly why: string[]
  }[] = []

  const chainOf = (event: number): number[] | string => {
    const known = chains.get(event)
    if (known !== undefined) return known
    const script = scripts.get(event)
    if (!script) {
      chains.set(event, [])
      return []
    }
    const player = new EventPlayer(script, 1, undefined, (id) => scripts.get(id))
    let frames = 0
    let found: number[] | string
    try {
      while (!player.finished && frames < FRAME_CAP) {
        player.tick()
        if (player.stage.message !== undefined) player.dismiss()
        frames++
      }
      found = [...player.chain]
    } catch (error) {
      found = (error as Error).message
    }
    chains.set(event, found)
    return found
  }

  /** The records of `map` whose span covers the stage, in the file's order. Kept, as they are asked for often. */
  const recordsKept = new Map<string, Trigger[]>()
  const recordsAt = (map: number, stage: Stage) => {
    const key = `${map}|${order(stage)}`
    let found = recordsKept.get(key)
    if (!found) {
      found = (byMap.get(map) ?? []).filter(
        (t) => order(t.from) <= order(stage) && order(stage) <= order(t.to),
      )
      recordsKept.set(key, found)
    }
    return found
  }
  /** Who stands in a map at a stage and step, and who its records there name. Kept, as above. */
  const castKept = new Map<string, number[]>()
  const castAt = (area: string, map: number, stage: Stage, step: number | undefined) => {
    const key = `${map}|${order(stage)}|${step ?? 0}`
    let found = castKept.get(key)
    if (!found) {
      const here = recordsAt(map, stage)
      const named = new Set(
        here.flatMap((t) =>
          [...conditionsOf(t), ...triggerWords(t)]
            .filter((w) => w.op === 6 || w.op === 118)
            .map((w) => w.arg),
        ),
      )
      found = (views.get(area)?.castIds(map, stage, step) ?? []).filter((id) => named.has(id))
      castKept.set(key, found)
    }
    return found
  }

  const sorted = (set: Iterable<number>) => [...set].sort((a, b) => a - b).join(',')
  const keyOf = (s: State) =>
    `${s.threads
      .map(
        (t) => `${t.stage ? show(t.stage) : '-'}.${t.step}/${sorted(t.flags)}/${sorted(t.marks)}`,
      )
      .join('|')}|${sorted(s.party)}`

  /** The state without its flags and marks — see `movesFrom`, which folds moves that only set those. */
  const keyWithoutFlags = (s: State) =>
    `${s.threads.map((t) => `${t.stage ? show(t.stage) : '-'}.${t.step}`).join('|')}|${sorted(s.party)}`

  const clone = (s: State): State => ({
    threads: s.threads.map(copyStory),
    party: [...s.party],
    globals: new Set(s.globals),
    sure: new Set(s.sure),
  })

  /** The thread a move in `map` reads and writes — see `threadOf`. */
  const storyIn = (s: State, map: number): Story => s.threads[threadOf(map)] as Story

  /** The story as a record in `map` would test it — see `holds`. */
  const stateIn = (s: State, map: number): StoryState => {
    const story = storyIn(s, map)
    return {
      flags: story.flags,
      marks: story.marks,
      ...(story.step > 0 ? { step: story.step } : {}),
      more: { globals: s.globals, globalsSure: s.sure, night: false },
    }
  }

  /** Run a record's actions on the story, in `map`'s thread — see `moveStory`. */
  const runRecord = (s: State, map: number, outcome: EventOutcome) => {
    const live = threadOf(map)
    moveStory(s.threads[live] as Story, outcome, { all: s.threads, live }, s.globals)
    // The same for those surely set: a set is sure, a clear is sure too.
    for (const { op, arg } of outcome.actions ?? []) {
      if (op === 100) s.sure.add(arg)
      else if (op === 101) s.sure.delete(arg)
    }
    if (outcome.leaves) s.party = []
    for (const who of outcome.joins) if (!s.party.includes(who)) s.party.push(who)
  }

  /**
   * Play `event` in `map` from `state`, as the game does: its script and what
   * that chains into, then the last one's record — see `followEvent` — then a
   * set battle won or a hand-on. `needsScript` is how it was started: entering,
   * walking into an area, a hand-on and a battle's aftermath start it only if
   * it has a script; talking plays its record either way.
   */
  const play = (
    from: State,
    map: number,
    event: number,
    needsScript: boolean,
    played: Set<number>,
    depth = 0,
  ): State[] => {
    if (depth > 16) return []
    if (needsScript && !scripts.has(event)) return []
    const chain = scripts.has(event) ? chainOf(event) : []
    const last = typeof chain === 'string' || chain.length === 0 ? event : (chain.at(-1) as number)
    played.add(event)
    if (typeof chain !== 'string') for (const id of chain) played.add(id)
    const area = areaOfMap.get(map)
    const triggers = area ? (triggersOf.get(area) ?? []) : []
    const outcome = eventOutcome(triggers, last, map, stateIn(from, map))
    const state = clone(from)
    if (!outcome) return [state]
    runRecord(state, map, outcome)
    if (outcome.battle !== undefined) {
      // Won, and lost: losing can move the story too — the Tower of Trades at 6.4.
      const out: State[] = []
      for (const won of [true, false]) {
        const after = afterBattle(triggers, outcome.battle, won, map, stateIn(state, map))
        if (!after) {
          if (won) out.push(state)
          continue
        }
        const fought = clone(state)
        runRecord(fought, map, after.outcome)
        const next =
          won && after.event !== undefined
            ? play(fought, map, after.event, true, played, depth + 1)
            : []
        out.push(...(next.length > 0 ? next : [fought]))
      }
      return out
    }
    if (outcome.onward) {
      const next = play(state, outcome.onward.map, outcome.onward.event, true, played, depth + 1)
      return next.length > 0 ? next : [state]
    }
    return [state]
  }

  /** Every state one move takes the story to. */
  const movesFrom = (state: State, played: Set<number>): State[] => {
    const out: State[] = []
    // Talk that only sets marks, or only sets flags, moves nothing on its own
    // — a town's first-time talk, each villager setting their own flag, as
    // Coffinwell's at 4.6 does — so every order of talking to a town would be a
    // state of its own: fourteen of them made 9,232. It is taken as one:
    // everyone talked to. Each event is still tried from the state before,
    // where none of it is set yet. **Ours.**
    const talked = clone(state)
    let talkedMore = false
    const plain = keyWithoutFlags(state)
    /** Keep a move, or fold it into `talked` if all it did was set marks or flags. */
    const keep = (states: readonly State[]) => {
      for (const after of states) {
        const onlySets =
          keyWithoutFlags(after) === plain &&
          after.threads.every((thread, i) =>
            [...(state.threads[i] as Story).flags].every((f) => thread.flags.has(f)),
          )
        if (!onlySets) {
          out.push(after)
          continue
        }
        after.threads.forEach((thread, i) => {
          const into = talked.threads[i] as Story
          for (const mark of thread.marks) {
            if (into.marks.has(mark)) continue
            into.marks.add(mark)
            talkedMore = true
          }
          for (const flag of thread.flags) {
            if (into.flags.has(flag)) continue
            into.flags.add(flag)
            talkedMore = true
          }
        })
      }
    }
    for (const map of byMap.keys()) {
      const story = storyIn(state, map)
      const stage = story.stage
      if (!stage || stage.major === 0) continue
      const step = story.step > 0 ? story.step : undefined
      const here = recordsAt(map, stage)
      if (here.length === 0) continue
      const area = areaOfMap.get(map) as string
      // Entering it.
      const more = { globals: state.globals, globalsSure: state.sure, night: false }
      const entry = entryPlay(here, map, stage, story.flags, step, more)
      if (entry && scripts.has(entry.event)) {
        const before = clone(state)
        runRecord(before, map, entry.outcome)
        keep(play(before, map, entry.event, true, played))
      }
      // Being in it: its watch, every frame — see `KIND_WATCH`.
      const watch = watchPlay(here, map, stage, stateIn(state, map))
      if (watch) {
        const before = clone(state)
        runRecord(before, map, watch)
        keep(watch.event !== undefined ? play(before, map, watch.event, true, played) : [before])
      }
      // Walking into each of its areas.
      for (const box of areasOf(here, map, stage)) {
        const found = areaEvent(here, map, stage, story.flags, step, (id) => id === box.id, more)
        if (!found || !scripts.has(found.event)) continue
        const before = clone(state)
        runRecord(before, map, found.outcome)
        keep(play(before, map, found.event, true, played))
      }
      // Talking to whoever stands there and is named here.
      const view = views.get(area)
      if (!view) continue
      const letter = letterForStage(view.letters, stage)
      for (const id of castAt(area, map, stage, step)) {
        const choice = pickLine({
          triggers: here,
          map,
          stage,
          night: false,
          id,
          lines: letter === undefined ? [] : view.linesOf(id, letter),
          flags: story.flags,
          marks: story.marks,
          alone: state.party.length === 0,
          step,
          globals: state.globals,
          globalsSure: state.sure,
        })
        if (!choice) continue
        // The record that chose runs as it is talked to, as the game runs every
        // action of the record it takes; the label's own after the line is
        // read, on the answer it waits for — which the walk takes as given.
        const before = clone(state)
        for (const mark of choice.marks ?? []) storyIn(before, map).marks.add(mark)
        if (choice.record) runRecord(before, map, choice.record)
        if (choice.after) runRecord(before, map, choice.after.outcome)
        if (choice.kind === 'event') {
          keep(play(before, map, choice.event, false, played))
          continue
        }
        if (choice.leadsTo) {
          keep(play(before, map, choice.leadsTo.event, true, played))
        } else if (choice.onward) {
          keep(play(before, choice.onward.map, choice.onward.event, true, played))
        } else {
          keep([before])
        }
      }
    }
    if (talkedMore) out.push(talked)
    return out
  }

  /** Every state the story reaches from `from`, and which stages and steps. */
  const walkFrom = (from: Seed): Walk => {
    const start: State = {
      threads: Array.from({ length: THREADS }, unstarted),
      party: [],
      globals: new Set(),
      sure: new Set(),
    }
    start.threads[from.thread] = {
      stage: { major: from.major, minor: from.minor },
      step: from.step,
      flags: new Set(),
      marks: new Set(),
    }
    // **Game-wide flags are merged, not branched on** — ours. Events toggle
    // them for what a map shows, and every combination would be a state of its
    // own: nine made 254. So states that differ only in them are one, holding
    // those that may be set (the union) and those that surely are (the
    // intersection), and explored again whenever a merge adds to what may be.
    const best = new Map<string, State>()
    best.set(keyOf(start), start)
    const queue = [start]
    const reached = new Map<string, Point>()
    const played = new Set<number>()
    let capped = false
    while (queue.length > 0) {
      const state = queue.shift() as State
      if (best.get(keyOf(state)) !== state) continue
      for (const thread of state.threads) {
        if (!thread.stage || thread.stage.major === 0) continue
        const point = { ...thread.stage, step: thread.step }
        reached.set(show(point), point)
      }
      for (const next of movesFrom(state, played)) {
        const key = keyOf(next)
        const known = best.get(key)
        if (!known) {
          if (best.size >= STATE_CAP) {
            capped = true
            break
          }
          best.set(key, next)
          queue.push(next)
          continue
        }
        const grows =
          [...next.globals].some((n) => !known.globals.has(n)) ||
          [...known.sure].some((n) => !next.sure.has(n))
        if (!grows) continue
        const merged = clone(known)
        for (const n of next.globals) merged.globals.add(n)
        for (const n of known.sure) if (!next.sure.has(n)) merged.sure.delete(n)
        best.set(key, merged)
        queue.push(merged)
      }
      if (capped) break
    }
    return { from, reached, visited: [...best.values()], capped, played }
  }

  /** The operations on a record that nothing here reads — labels and hand-on events aside. */
  const unreadOn = (trigger: Trigger) => [
    ...new Set(
      triggerWords(trigger)
        .filter((w) => w.op !== 0 && !READ.has(w.op) && !(w.arg === 0 && w.op >= 190))
        .map((w) => w.op),
    ),
  ]

  /** Which of a record's conditions fail in every one of `states`, or undefined if one holds somewhere. */
  const failing = (
    trigger: Trigger,
    visits: readonly { readonly state: State; readonly story: Story }[],
  ): string | undefined => {
    const words = conditionsOf(trigger)
    const fails = new Set<string>()
    for (const { state: walked, story: state } of visits) {
      const step = state.step > 0 ? state.step : undefined
      const more = { globals: walked.globals, globalsSure: walked.sure, night: false }
      if (flagsHold(words, state.flags, state.marks, step, more)) return undefined
      for (const w of words) {
        if (w.op === OP_IF_GLOBAL && !walked.globals.has(w.arg))
          fails.add(`game-wide flag ${w.arg} set`)
        if (w.op === OP_UNLESS_GLOBAL && walked.sure.has(w.arg))
          fails.add(`game-wide flag ${w.arg} clear`)
        if (w.op === OP_IF_FLAG && !state.flags.has(w.arg)) fails.add(`flag ${w.arg} set`)
        if (w.op === OP_UNLESS_FLAG && state.flags.has(w.arg)) fails.add(`flag ${w.arg} clear`)
        if (w.op === OP_IF_MARK && !state.marks.has(w.arg)) fails.add(`mark ${w.arg} set`)
        if (w.op === OP_UNLESS_MARK && state.marks.has(w.arg)) fails.add(`mark ${w.arg} clear`)
        if (w.op === OP_AT_STEP && step !== w.arg) fails.add(`step ${w.arg}`)
      }
    }
    return `it needs ${[...fails].join(', ')}, which the walk never had`
  }

  /**
   * Why a record that reaches an event did not play it, in the states the walk
   * visited at the record's stages — the first reason that applies.
   */
  const whyNotReached = (
    reach: { readonly area: string; readonly trigger: Trigger; readonly handOn: boolean },
    event: number | undefined,
    walk: Walk,
  ): string => {
    const { trigger, area } = reach
    const words = triggerWords(trigger)
    const what = `kind ${trigger.unknown_5} in ${area} map ${trigger.map}`
    // The walk's states as this record's map would read them: its thread's.
    const visits = walk.visited.map((state) => ({ state, story: storyIn(state, trigger.map) }))
    const inSpan = visits.filter(
      ({ story }) =>
        story.stage !== undefined &&
        order(trigger.from) <= order(story.stage) &&
        order(story.stage) <= order(trigger.to),
    )
    const here = inSpan.map(({ story }) => story)
    if (here.length === 0)
      return `a record of ${what}, over ${show(trigger.from)}–${show(trigger.to)}, where the walk never was`
    const own = trigger.unknown_5 === 11 ? words.find((w) => w.op === OP_EVENT_OF)?.arg : undefined
    if (reach.handOn && own !== undefined)
      return `a hand-on from ev${own}, which the walk never played`
    if (trigger.unknown_5 === 15 || trigger.unknown_5 === 16) {
      const battle = words.find((w) => w.op === OP_AFTER_BATTLE)?.arg
      const starters = [...(reachedByBattle.get(battle ?? -1) ?? [])]
      return starters.length === 0
        ? `the record for set battle ${battle} ${trigger.unknown_5 === 15 ? 'won' : 'lost'}, which nothing starts`
        : `the record for set battle ${battle} ${trigger.unknown_5 === 15 ? 'won' : 'lost'}, which ${starters.map((e) => `ev${e}`).join(' or ')} starts and the walk never played`
    }
    const who = words.find((w) => w.op === 6)?.arg
    if (who !== undefined) {
      const view = views.get(area)
      const standing = here.some((state) =>
        view
          ?.castIds(trigger.map, state.stage as Stage, state.step > 0 ? state.step : undefined)
          .includes(who),
      )
      if (!standing) {
        const anyStep = here.some((state) =>
          view?.castIds(trigger.map, state.stage as Stage).includes(who),
        )
        return anyStep
          ? `talking to ${who} in map ${trigger.map}, who stands there at ${show(here[0]?.stage as Stage)} only when the step is not read`
          : `talking to ${who} in map ${trigger.map}, whom the area's cast does not stand there at ${show(here[0]?.stage as Stage)}`
      }
    }
    const inArea = words.find((w) => w.op === OP_IN_AREA)?.arg
    if (trigger.unknown_5 === KIND_AREA_EVENT && inArea !== undefined) {
      const defined = here.some((state) =>
        areasOf(
          recordsAt(trigger.map, state.stage as Stage),
          trigger.map,
          state.stage as Stage,
        ).some((box) => box.id === inArea),
      )
      if (!defined)
        return `walking into area ${inArea} of map ${trigger.map}, which no record defines there`
    }
    const fails = failing(trigger, inSpan)
    if (fails) return `a record of ${what}: ${fails}`
    if (![0, 1, KIND_AREA_EVENT, KIND_ENTRY, KIND_WATCH, 11].includes(trigger.unknown_5))
      return `a record of ${what}, a kind the engine does not read`
    const started =
      reach.handOn || trigger.unknown_5 === KIND_AREA_EVENT || trigger.unknown_5 === KIND_ENTRY
    if (started && event !== undefined && !scripts.has(event))
      return `a record of ${what}; ev${event} has no script, and only a script is started that way`
    if (trigger.unknown_5 === KIND_ENTRY && !words.some((w) => w.op === OP_EVENT))
      return `an entry record of ${what} that plays no event, which the engine does not run`
    if (who !== undefined) {
      const view = views.get(area)
      const { state, story } = inSpan[0] as { state: State; story: Story }
      const stage = story.stage as Stage
      const letter = view && letterForStage(view.letters, stage)
      const choice = pickLine({
        triggers: recordsAt(trigger.map, stage),
        map: trigger.map,
        stage,
        night: false,
        id: who,
        lines: view && letter ? view.linesOf(who, letter) : [],
        flags: story.flags,
        marks: story.marks,
        alone: state.party.length === 0,
        step: story.step > 0 ? story.step : undefined,
        globals: state.globals,
        globalsSure: state.sure,
      })
      return `talking to ${who} in map ${trigger.map}, where another of their records chooses first — ${choice?.why ?? 'nothing'}`
    }
    return `a record of ${what}, which the walk did not play for a reason this test does not tell`
  }

  /** Why none of the records setting `point` moved the story — the break's diagnosis. */
  const whyNot = (point: Point, walk: Walk): string[] => {
    const why: string[] = []
    for (const s of setters) {
      if (s.to.major !== point.major || s.to.minor !== point.minor || s.to.step !== point.step)
        continue
      const where = `${s.area} map ${s.trigger.map}, over ${show(s.trigger.from)}–${show(s.trigger.to)}`
      const unread = unreadOn(s.trigger)
      const also = unread.length > 0 ? ` [not read on it: ${unread.join(' ')}]` : ''
      if (s.event === undefined) {
        // The record moves the story itself when it runs: why it did not.
        why.push(
          `${where}: set by a record of kind ${s.trigger.unknown_5}${also}, which did not run: ${whyNotReached({ area: s.area, trigger: s.trigger, handOn: false }, undefined, walk)}`,
        )
        continue
      }
      if (walk.played.has(s.event)) {
        why.push(`${where}: ev${s.event} played, and another of its records was taken${also}`)
        continue
      }
      const reasons = (reachedBy.get(s.event) ?? []).map((reach) =>
        whyNotReached(reach, s.event as number, walk),
      )
      for (const [first, run] of chains) {
        if (typeof run === 'string' || !run.includes(s.event)) continue
        reasons.push(`chained from ev${first}, which the walk never played`)
      }
      why.push(
        reasons.length === 0
          ? `${where}: ev${s.event} — nothing in the triggers or the scripts' chains reaches it${also}`
          : `${where}: ev${s.event}${also}, reached by:${[...new Set(reasons)].map((r) => `\n        · ${r}`).join('')}`,
      )
    }
    return why
  }

  beforeAll(() => {
    const rom = new Uint8Array(readFileSync(romPath as string))
    triggersOf = new Map(allTriggers(rom).map(({ code, triggers }) => [code, triggers]))

    // A map answers to the area whose file has its records: that is the file
    // `load` reads for it, by its code's first letters.
    let index: ((id: number) => string | undefined) | undefined
    for (const leaf of scanCartridge(rom, { pathFilter: '/data/map' })) {
      if (!leaf.path.toLowerCase().endsWith('maplist9.bin') || !isMapList(leaf.bytes)) continue
      const list = readMapList(leaf.bytes)
      const byId = new Map(list.maps.filter((e) => e.id !== 0).map((e) => [e.id, e.code]))
      index = (id) => byId.get(id)
      break
    }
    for (const [area, triggers] of triggersOf) {
      for (const trigger of triggers) {
        areaOfMap.set(trigger.map, area)
        const list = byMap.get(trigger.map) ?? []
        list.push(trigger)
        byMap.set(trigger.map, list)
      }
    }
    // A hand-on can go to a map with no records of its own.
    for (const triggers of triggersOf.values()) {
      for (const trigger of triggers) {
        const words = triggerWords(trigger)
        const go = words.findIndex((w) => w.op === OP_THEN_MAP)
        if (go < 0) continue
        const map = (words[go] as { arg: number }).arg
        const code = index?.(map)
        if (!areaOfMap.has(map) && code && triggersOf.has(code.slice(0, 3)))
          areaOfMap.set(map, code.slice(0, 3))
      }
    }
    for (const area of triggersOf.keys()) views.set(area, storyView(rom, area))

    for (const folder of ['/data/event', '/data/evspt_lv5']) {
      for (const leaf of scanCartridge(rom, { pathFilter: folder })) {
        if (!/\.stb$/i.test(leaf.path)) continue
        const named = /ev(\d{5})\.gp2/i.exec(leaf.archive)
        if (!named) continue
        try {
          scripts.set(Number(named[1]), readScript(leaf.bytes))
        } catch {
          // A script that will not read leaves its event without one.
        }
      }
    }
    for (const id of scripts.keys()) chainOf(id)

    // Every record that sets a stage, and how each event is reached.
    for (const [area, triggers] of triggersOf) {
      for (const trigger of triggers) {
        const words = triggerWords(trigger)
        const own =
          trigger.unknown_5 === 11 ? words.find((w) => w.op === OP_EVENT_OF)?.arg : undefined
        words.forEach((w, i) => {
          if (w.op !== OP_STAGE_TO && w.op !== OP_THREAD_STAGE_TO) return
          const args = words.slice(i + 1, i + 4)
          if (args.length < 3 || !args.every((a) => a.op === 0)) return
          const [major, minor, step] = args.map((a) => a.arg) as [number, number, number]
          setters.push({
            area,
            trigger,
            op: w.op,
            thread: w.arg,
            to: { major, minor, step },
            event: own,
          })
        })
        const reach = (event: number, handOn: boolean) => {
          const list = reachedBy.get(event) ?? []
          list.push({ area, trigger, handOn })
          reachedBy.set(event, list)
        }
        for (const w of words) if (w.op === OP_EVENT) reach(w.arg, false)
        const battle = words.find((w) => w.op === OP_BATTLE)?.arg
        if (battle !== undefined && own !== undefined) {
          const set = reachedByBattle.get(battle) ?? new Set<number>()
          set.add(own)
          reachedByBattle.set(battle, set)
        }
        const go = words.findIndex((w) => w.op === OP_THEN_MAP)
        const next = go < 0 ? undefined : words[go + 1]
        if (next && next.arg === 0) reach(next.op, true)
      }
    }

    // The walk: from a new game, then from each stage it did not reach — in
    // the thread the record that sets it moves: `214`'s own number, or the
    // thread of the map a `132` is in.
    const targets = [
      ...new Map(
        setters.map((s) => {
          const thread = s.op === OP_THREAD_STAGE_TO ? s.thread : threadOf(s.trigger.map)
          return [show(s.to), { ...s.to, thread }] as const
        }),
      ).values(),
    ].sort((a, b) => pointOrder(a) - pointOrder(b))
    const covered = new Set<string>()
    walks = []
    breaks = []
    let from: Seed | undefined = { major: 1, minor: 1, step: 0, thread: 0 }
    let last: Point | undefined
    while (from) {
      const walk = walkFrom(from)
      walks.push(walk)
      for (const key of walk.reached.keys()) covered.add(key)
      const furthest = [...walk.reached.values()].sort((a, b) => pointOrder(b) - pointOrder(a))[0]
      last = furthest
      // The earliest stage no walk has reached: with five threads, how far one
      // walk got says nothing of the stages before it in another thread.
      const next = targets.find((t) => !covered.has(show(t)))
      if (!next) break
      breaks.push({ after: last, next, why: whyNot(next, walk) })
      from = next
    }
  }, 600_000)

  it('plays the slice through in one walk, and on into Stornway', () => {
    // The slice's own story, which the game already plays: the evening at
    // 2.1, the pass, the Hexagon, Patty rescued, and the morning after.
    const slice = walks.find((walk) => walk.from.major === 1 && walk.from.minor === 4)
    expect(slice?.reached.has('2.5 step 1')).toBe(true)
    expect(slice?.reached.has('2.7 step 1')).toBe(true)
    // And past it, by records read from the game's code: entering Stornway
    // plays ev2900, whose chain hands on with 138 to the lobby; talking to
    // 203 there, named by the composite 52, sets flag 3; and the lobby's watch,
    // kind 6, starts chapter 3.
    expect(slice?.reached.has('3.1 step 1')).toBe(true)
    expect(slice?.reached.has('3.1 step 2')).toBe(true)
  })

  it('breaks where docs/story-walk.md says, and prints each break with why', () => {
    console.log(`${setters.length} records set a stage; ${walks.length} walks`)
    for (const [i, walk] of walks.entries()) {
      const points = [...walk.reached.values()].sort((a, b) => pointOrder(a) - pointOrder(b))
      console.log(
        `walk ${i + 1} from ${show(walk.from)}: ${walk.visited.length} states${walk.capped ? ' (capped)' : ''}, reaches ${points.map(show).join(', ')}`,
      )
      const broke = breaks[i]
      if (!broke) continue
      console.log(`  BREAK before ${show(broke.next)}:`)
      for (const line of broke.why) console.log(`    - ${line}`)
    }
    // **The number this phase is sized by.** Measured 28 September 2026: 109
    // breaks between a new game and the last stage a record sets, before the
    // story's five threads were read from the game's code; 101 with them; 87
    // once records ran as the game runs them — every action, kind 6 each
    // frame, conditions parsed and composites expanded. Fixing one shows up as
    // a smaller number here; losing a rule the game had shows up as a larger.
    // Update it, and the table in `docs/story-walk.md`, when either happens.
    expect(breaks.length).toBe(87)
    // The first break after the slice is now in Stornway's castle, at 3.1.
    const first = breaks.find((b) => b.next.major >= 3)
    expect(first && show(first.next)).toBe('3.1 step 3')
    expect(walks.every((walk) => !walk.capped)).toBe(true)
  })
})
