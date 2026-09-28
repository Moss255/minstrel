import { readFileSync } from 'node:fs'
import { scanCartridge } from '@minstrel/cartridge'
import {
  afterBattle,
  areaEvent,
  areasOf,
  entryPlay,
  eventOutcome,
  flagsHold,
  isMapList,
  KIND_AREA_EVENT,
  KIND_ENTRY,
  OP_AFTER_BATTLE,
  OP_AT_STEP,
  OP_BATTLE,
  OP_EVENT,
  OP_EVENT_OF,
  OP_IF_FLAG,
  OP_IF_MARK,
  OP_IN_AREA,
  OP_STAGE_TO,
  OP_THEN_MAP,
  OP_UNLESS_FLAG,
  OP_UNLESS_MARK,
  readMapList,
  readScript,
  type Script,
  type Trigger,
  triggerWords,
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
    2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 16, 35, 36, 86, 102, 104, 118, 119, 120, 132, 133, 143, 145,
    177, 204, 205,
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

  /** The records of `map` whose span covers the stage, in the file's order. */
  const recordsAt = (map: number, stage: Stage) =>
    (byMap.get(map) ?? []).filter(
      (t) => order(t.from) <= order(stage) && order(stage) <= order(t.to),
    )

  const sorted = (set: Iterable<number>) => [...set].sort((a, b) => a - b).join(',')
  const keyOf = (s: State) =>
    `${s.threads
      .map(
        (t) => `${t.stage ? show(t.stage) : '-'}.${t.step}/${sorted(t.flags)}/${sorted(t.marks)}`,
      )
      .join('|')}|${sorted(s.party)}`

  /** The state without its marks — see `movesFrom`, which folds moves that change only those. */
  const keyWithoutMarks = (s: State) =>
    `${s.threads.map((t) => `${t.stage ? show(t.stage) : '-'}.${t.step}/${sorted(t.flags)}`).join('|')}|${sorted(s.party)}`

  const clone = (s: State): State => ({ threads: s.threads.map(copyStory), party: [...s.party] })

  /** The thread a move in `map` reads and writes — see `threadOf`. */
  const storyIn = (s: State, map: number): Story => s.threads[threadOf(map)] as Story

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
  ): State | undefined => {
    if (depth > 16) return undefined
    if (needsScript && !scripts.has(event)) return undefined
    const chain = scripts.has(event) ? chainOf(event) : []
    const last = typeof chain === 'string' || chain.length === 0 ? event : (chain.at(-1) as number)
    played.add(event)
    if (typeof chain !== 'string') for (const id of chain) played.add(id)
    const area = areaOfMap.get(map)
    const triggers = area ? (triggersOf.get(area) ?? []) : []
    const outcome = eventOutcome(triggers, last, map)
    const state = clone(from)
    if (!outcome) return state
    const live = threadOf(map)
    moveStory(state.threads[live] as Story, outcome, { all: state.threads, live })
    if (outcome.leaves) state.party = []
    for (const who of outcome.joins) if (!state.party.includes(who)) state.party.push(who)
    if (outcome.battle !== undefined) {
      const after = afterBattle(triggers, outcome.battle, true, map)
      if (!after) return state
      for (const flag of after.flags) storyIn(state, map).flags.add(flag)
      if (after.event === undefined) return state
      return play(state, map, after.event, true, played, depth + 1) ?? state
    }
    if (outcome.onward) {
      return play(state, outcome.onward.map, outcome.onward.event, true, played, depth + 1) ?? state
    }
    return state
  }

  /** Every state one move takes the story to. */
  const movesFrom = (state: State, played: Set<number>): State[] => {
    const out: State[] = []
    // Talk that only sets marks moves nothing on its own, and marks last the
    // whole major stage — so every order of talking to a town would be a state
    // of its own. It is taken as one: everyone talked to. Each event is still
    // tried from the state before, where no mark is set yet.
    const talked = clone(state)
    let talkedMore = false
    const plain = keyWithoutMarks(state)
    /** Keep a move, or fold it into `talked` if all it changed was marks. */
    const keep = (after: State | undefined) => {
      if (!after) return
      if (keyWithoutMarks(after) !== plain) {
        out.push(after)
        return
      }
      after.threads.forEach((thread, i) => {
        const all = (talked.threads[i] as Story).marks
        for (const mark of thread.marks) {
          if (all.has(mark)) continue
          all.add(mark)
          talkedMore = true
        }
      })
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
      const entry = entryPlay(here, map, stage, story.flags, step)
      if (entry) {
        const before = clone(state)
        for (const flag of entry.flags) storyIn(before, map).flags.add(flag)
        keep(play(before, map, entry.event, true, played))
      }
      // Walking into each of its areas.
      for (const box of areasOf(here, map, stage)) {
        const found = areaEvent(here, map, stage, story.flags, step, (id) => id === box.id)
        if (!found) continue
        const before = clone(state)
        for (const flag of found.flags) storyIn(before, map).flags.add(flag)
        keep(play(before, map, found.event, true, played))
      }
      // Talking to whoever stands there and is named here.
      const named = new Set(
        here.flatMap((t) =>
          triggerWords(t)
            .filter((w) => w.op === 6 || w.op === 118)
            .map((w) => w.arg),
        ),
      )
      const view = views.get(area)
      if (!view) continue
      const letter = letterForStage(view.letters, stage)
      for (const id of view.castIds(map, stage, step)) {
        if (!named.has(id)) continue
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
        })
        if (!choice) continue
        const before = clone(state)
        for (const mark of choice.marks ?? []) storyIn(before, map).marks.add(mark)
        if (choice.kind === 'event') {
          keep(play(before, map, choice.event, false, played))
          continue
        }
        if (choice.leadsTo) {
          keep(play(before, map, choice.leadsTo.event, true, played))
        } else if (choice.onward) {
          keep(play(before, choice.onward.map, choice.onward.event, true, played))
        } else {
          const all = storyIn(talked, map).marks
          for (const mark of choice.marks ?? []) {
            if (all.has(mark)) continue
            all.add(mark)
            talkedMore = true
          }
        }
      }
    }
    if (talkedMore) out.push(talked)
    return out
  }

  /** Every state the story reaches from `from`, and which stages and steps. */
  const walkFrom = (from: Seed): Walk => {
    const start: State = { threads: Array.from({ length: THREADS }, unstarted), party: [] }
    start.threads[from.thread] = {
      stage: { major: from.major, minor: from.minor },
      step: from.step,
      flags: new Set(),
      marks: new Set(),
    }
    const seen = new Set([keyOf(start)])
    const queue = [start]
    const visited: State[] = []
    const reached = new Map<string, Point>()
    const played = new Set<number>()
    let capped = false
    while (queue.length > 0) {
      const state = queue.shift() as State
      visited.push(state)
      for (const thread of state.threads) {
        if (!thread.stage || thread.stage.major === 0) continue
        const point = { ...thread.stage, step: thread.step }
        reached.set(show(point), point)
      }
      for (const next of movesFrom(state, played)) {
        const key = keyOf(next)
        if (seen.has(key)) continue
        if (seen.size >= STATE_CAP) {
          capped = true
          break
        }
        seen.add(key)
        queue.push(next)
      }
      if (capped) break
    }
    return { from, reached, visited, capped, played }
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
  const failing = (trigger: Trigger, states: readonly Story[]): string | undefined => {
    const words = triggerWords(trigger)
    const fails = new Set<string>()
    for (const state of states) {
      const step = state.step > 0 ? state.step : undefined
      if (flagsHold(words, state.flags, state.marks, step)) return undefined
      for (const w of words) {
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
    event: number,
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
    const fails = failing(trigger, here)
    if (fails) return `a record of ${what}: ${fails}`
    if (![0, 1, KIND_AREA_EVENT, KIND_ENTRY, 11].includes(trigger.unknown_5))
      return `a record of ${what}, a kind the engine does not read`
    const started =
      reach.handOn || trigger.unknown_5 === KIND_AREA_EVENT || trigger.unknown_5 === KIND_ENTRY
    if (started && !scripts.has(event))
      return `a record of ${what}; ev${event} has no script, and only a script is started that way`
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
        why.push(
          `${where}: the stage is set on a record of kind ${s.trigger.unknown_5}, and the engine applies only an event's own${also}`,
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

  it('plays the slice through in one walk, from 1.4 to 2.7', () => {
    // The slice's own story, which the game already plays: the evening at
    // 2.1, the pass, the Hexagon, Patty rescued, and the morning after.
    const slice = walks.find((walk) => walk.from.major === 1 && walk.from.minor === 4)
    expect(slice?.reached.has('2.7 step 1')).toBe(true)
    expect(slice?.reached.has('2.5 step 1')).toBe(true)
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
    // **The number this phase is sized by.** Measured 28 September 2026:
    // 101 breaks between a new game and the last stage a record sets, once the
    // story's five threads were read from the game's code — 109 without them,
    // counted the same way. Fixing one shows up as a smaller number here;
    // losing a rule the game had shows up as a larger. Update it, and the
    // table in `docs/story-walk.md`, when either happens.
    expect(breaks.length).toBe(101)
    // The first break after the slice: arriving at Stornway's lobby at 2.7
    // sets 3.1, on a record that is not an event's own.
    const out = breaks.find((b) => b.next.major === 3 && b.next.minor === 1 && b.next.step === 1)
    expect(out?.why.every((line) => line.includes('record of kind 6'))).toBe(true)
    expect(walks.every((walk) => !walk.capped)).toBe(true)
  })
})
