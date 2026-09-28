import { appendFileSync, readFileSync } from 'node:fs'
import { scanCartridge } from '@minstrel/cartridge'
import {
  afterBattle,
  areaEvent,
  areasIn,
  areasOf,
  conditionsOf,
  doorwayPlay,
  type EventListEntry,
  type EventOutcome,
  entryPlay,
  eventOutcome,
  flagBit,
  flagsHold,
  isMapLinks,
  isMapList,
  KIND_AREA_EVENT,
  KIND_ENTRY,
  KIND_TRICK,
  KIND_WATCH,
  mapAreas,
  mapDoorwayRegions,
  OP_AFTER_BATTLE,
  OP_AT_STEP,
  OP_BATTLE,
  OP_EVENT,
  OP_EVENT_OF,
  OP_IF_FLAG,
  OP_IF_GLOBAL,
  OP_IF_MARK,
  OP_IN_AREA,
  OP_LEARN_TRICK,
  OP_QUARANTOMB_SWITCH,
  OP_STAGE_TO,
  OP_THEN_MAP,
  OP_TRICKS,
  OP_UNLESS_FLAG,
  OP_UNLESS_GLOBAL,
  OP_UNLESS_MARK,
  quarantombSwitch,
  readMapList,
  readScript,
  type Script,
  type StoryArea,
  type StoryState,
  settingsPlay,
  type Trigger,
  trickKnown,
  trickLearntBit,
  trickPlay,
  triggerWords,
  watchPlay,
} from '@minstrel/game-formats'
import { beforeAll, describe, expect, it } from 'vitest'
import { EventPlayer } from '../src/event.ts'
import { rideScenes, stopsOf } from '../src/express.ts'
import { allTriggers, eventListOf, type Stage, type StoryView, storyView } from '../src/load.ts'
import { copyStory, moveStory, type Story, THREADS, threadOf, unstarted } from '../src/story.ts'
import { afterFor, letterForStage, pickLine } from '../src/talk.ts'

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
  /** How many sets of game-wide flags a map's talks are followed through, from one state — see `movesFrom`. */
  const TALK_SETS = 256
  /** The operations `story.ts`, `talk.ts` and `services.ts` read. The rest are reported as not read. */
  const READ = new Set([
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    11,
    12,
    16,
    17,
    23,
    26,
    27,
    29,
    35,
    36,
    41,
    52,
    53,
    54,
    55,
    56,
    57,
    58,
    59,
    60,
    61,
    62,
    63,
    86,
    88,
    89,
    100,
    101,
    102,
    103,
    104,
    105,
    108,
    109,
    118,
    119,
    120,
    124,
    132,
    133,
    138,
    142,
    143,
    145,
    148,
    155,
    204,
    205,
    214,
    215,
    216,
    220,
    226,
    OP_TRICKS,
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
  /** Each scene's entry in the game's event lists: the map it plays in — see `readEventList`. */
  let eventList: ReadonlyMap<number, EventListEntry> = new Map()
  /** A map's id to the area whose triggers it answers to. */
  const areaOfMap = new Map<number, string>()
  /** The records of a map, by area — so a stage's can be taken once. */
  const byMap = new Map<number, Trigger[]>()
  /**
   * **Where a map comes into reach — ours, a stand-in for geography.** The
   * walk takes every map to be in reach, which was harmless until a scene's
   * start raised the story to its listed stage (see `play`): the Realm of the
   * Almighty's doorway record, 4301 over 1.1 to 19.99, plays ev15310, listed
   * at 15.1, and from the prologue the walk rode it to chapter 15. So a map is
   * taken to be in reach from the earliest stage at which any record of its
   * own begins, those over the whole story — from 1.1 into chapter 19 —
   * aside; a map with none is in reach from the start. The Realm's own
   * records begin at 15.1.
   */
  const reachFrom = new Map<number, number>()
  const views = new Map<string, StoryView>()
  /** Each map's own areas, from its link table — see `mapAreas`. */
  const mapAreasOf = new Map<number, StoryArea[]>()
  /** Each map's doorways' two numbers, from its link table — see `KIND_DOORWAY`. */
  const mapDoorwaysOf = new Map<number, (readonly [number, number])[]>()
  /**
   * The areas the Hero can walk into in a map at a stage: the first settings
   * record's that holds, those any other record there that the engine runs
   * adds as it runs — taken as run, **ours**, as the walk takes every map to
   * be in reach; an entry record runs only if it plays an event — and the
   * map's own.
   */
  const areaIdsAt = (map: number, stage: Stage, state?: StoryState) => {
    const here = recordsAt(map, stage)
    return [
      ...new Set([
        ...areasOf(here, map, stage, state).map((a) => a.id),
        // An entry record's too: the field runs the map's whole on arriving
        // (`func_020649f4`), so Batsureg's 72 and 73 at 10.6 are real.
        ...here.filter((t) => t.unknown_5 !== 20).flatMap((t) => areasIn(t).map((a) => a.id)),
        ...(mapAreasOf.get(map) ?? []).map((a) => a.id),
      ]),
    ]
  }
  const scripts = new Map<number, Script>()
  /** Each event's script run with chaining on: what it chains into, in order, or why it would not run — by event, or by event and the thread's flags and marks where it read them (see `chainOf`). */
  const chains = new Map<number | string, number[] | string>()
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

  /**
   * What a script chains into, run with the live thread's flags and marks,
   * which its `601` and `602` read — Gortress's ev14640 chains into ev14903
   * only with flags 11 to 14 all set. Kept by script, and by the flags and
   * marks it was run with where the run read them.
   */
  /** The thread bits each script has been seen to read, `f<n>` and `m<n>` — see `chainOf`. */
  const threadReadsOf = new Map<number, Set<string>>()
  const chainOf = (
    event: number,
    flags?: ReadonlySet<number>,
    marks?: ReadonlySet<number>,
  ): number[] | string => {
    // Kept by the bits the script read, and their values then — not the whole
    // state, which would run it once for every set of flags the talks reach.
    const bitsKey = (reads: ReadonlySet<string>) =>
      [...reads]
        .sort()
        .map((bit) => {
          const n = Number(bit.slice(1))
          const set = bit.startsWith('f') ? flags?.has(n) : marks?.has(n)
          return `${bit}=${set ? 1 : 0}`
        })
        .join(',')
    const reads = threadReadsOf.get(event)
    const known = chains.get(event) ?? (reads && chains.get(`${event}|${bitsKey(reads)}`))
    if (known !== undefined) return known
    const script = scripts.get(event)
    if (!script) {
      chains.set(event, [])
      return []
    }
    const player = new EventPlayer(script, 1, undefined, (id) => scripts.get(id))
    for (const flag of flags ?? []) player.stage.threadFlags.add(flag)
    for (const mark of marks ?? []) player.stage.threadMarks.add(mark)
    let frames = 0
    let found: number[] | string
    try {
      while (!player.finished && frames < FRAME_CAP) {
        player.tick()
        if (player.stage.message !== undefined) player.dismiss()
        frames++
      }
      found = [...player.chain]
      const handOn = player.stage.handOn
      if (handOn?.event !== undefined) handOns.set(event, { map: handOn.map, event: handOn.event })
    } catch (error) {
      found = (error as Error).message
    }
    if (player.stage.readThread) {
      const all = threadReadsOf.get(event) ?? new Set<string>()
      for (const bit of player.stage.threadReads) all.add(bit)
      threadReadsOf.set(event, all)
      chains.set(`${event}|${bitsKey(all)}`, found)
    } else chains.set(event, found)
    return found
  }
  /** Where a scene sends the Hero once it is over, and the event there — see `807` in `event.ts`. */
  const handOns = new Map<number, { readonly map: number; readonly event: number }>()

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
  const castAt = (
    area: string,
    map: number,
    stage: Stage,
    step: number | undefined,
    night = false,
    globals?: { readonly may: ReadonlySet<number>; readonly sure: ReadonlySet<number> },
  ) => {
    const key = `${map}|${order(stage)}|${step ?? 0}|${night}|${globals ? `${sorted(globals.may)}/${sorted(globals.sure)}` : ''}`
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
      // A record placing someone while a game-wide flag is set holds if some
      // way set it, and one wanting it clear unless every way did — as the
      // walk follows those flags.
      const isSet = (bit: number, wanted: boolean) =>
        wanted ? (globals?.may.has(bit) ?? false) : !(globals?.sure.has(bit) ?? false)
      found = (views.get(area)?.castIds(map, stage, step, night, isSet) ?? []).filter((id) =>
        named.has(id),
      )
      castKept.set(key, found)
    }
    return found
  }

  /** The labels of the talk boxes of those who stand in a map — see `TalkBox`. Kept, as above. */
  const boxesKept = new Map<string, Map<number, number[]>>()
  const boxesAt = (
    area: string,
    map: number,
    stage: Stage,
    step: number | undefined,
    night: boolean,
    globals: { readonly may: ReadonlySet<number>; readonly sure: ReadonlySet<number> },
  ) => {
    const key = `${map}|${order(stage)}|${step ?? 0}|${night}|${sorted(globals.may)}/${sorted(globals.sure)}`
    let found = boxesKept.get(key)
    if (!found) {
      const isSet = (bit: number, wanted: boolean) =>
        wanted ? globals.may.has(bit) : !globals.sure.has(bit)
      found = views.get(area)?.boxLabels(map, stage, step, night, isSet) ?? new Map()
      boxesKept.set(key, found)
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
  const stateIn = (s: State, map: number, night = false): StoryState => {
    const story = storyIn(s, map)
    return {
      flags: story.flags,
      marks: story.marks,
      ...(story.step > 0 ? { step: story.step } : {}),
      more: { globals: s.globals, globalsSure: s.sure, night },
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
      else if (op === OP_QUARANTOMB_SWITCH) {
        const turned = quarantombSwitch(arg)
        if (turned?.on) s.sure.add(turned.flag)
        else if (turned) s.sure.delete(turned.flag)
      } else if (op === OP_LEARN_TRICK) {
        const bit = trickLearntBit(arg)
        if (bit !== undefined) s.sure.add(bit)
      }
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
  /**
   * A set battle started in `map` from `state` — by an event's record, or a
   * talk record's `120`, as Gortress's captain and the tower's guards start
   * theirs — won, and lost: losing can move the story too, the Tower of
   * Trades at 6.4. Then what follows each, by the battle's own records.
   */
  const fought = (
    state: State,
    map: number,
    battle: number,
    played: Set<number>,
    depth = 0,
  ): State[] => {
    const area = areaOfMap.get(map)
    const triggers = area ? (triggersOf.get(area) ?? []) : []
    const out: State[] = []
    for (const won of [true, false]) {
      const after = afterBattle(triggers, battle, won, map, stateIn(state, map))
      if (!after) {
        if (won) out.push(state)
        continue
      }
      const next = clone(state)
      runRecord(next, map, after.outcome)
      const on =
        won && after.event !== undefined
          ? play(next, map, after.event, true, played, depth + 1)
          : []
      out.push(...(on.length > 0 ? on : [next]))
    }
    return out
  }

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
    // Its script runs with the live thread's flags and marks — see `chainOf`.
    const live = storyIn(from, map)
    const chain = scripts.has(event) ? chainOf(event, live.flags, live.marks) : []
    const last = typeof chain === 'string' || chain.length === 0 ? event : (chain.at(-1) as number)
    played.add(event)
    if (typeof chain !== 'string') for (const id of chain) played.add(id)
    // **A scene plays in its own map**, the event list's — the last script's,
    // since a chain goes back through the scene's start — and the game changes
    // map for it; so its record is the one there. `ev5110`, the end of what
    // talking to 106 on the Starflight Express starts, is the Observatory's.
    const entry = eventList.get(last)
    const at = entry && !entry.here && areaOfMap.has(entry.map) ? entry.map : map
    const area = areaOfMap.get(at)
    const triggers = area ? (triggersOf.get(area) ?? []) : []
    const state = clone(from)
    // **Starting a scene raises the story to the scene's own stage** when it
    // is behind — read from the game's code: the scene's start (ov017
    // `func_ov017_021bbfc4`, at `0x021bc424`) compares the live thread's
    // major and minor, as 1000 × major + minor, with the list entry's, and
    // sets the entry's when the story's is less, the major 19 at most — which
    // is why the Starflight Express's arrival scenes are listed at 20.1. The
    // step is left as it was. This is what opens 16.1: no record moves the
    // story there.
    const raised = storyIn(state, at)
    const ahead = entry && (entry.values[0] as number) <= 19
    if (raised.stage && ahead) {
      const [major, minor] = entry.values as [number, number]
      const now = raised.stage.major * 1000 + raised.stage.minor
      if ((major !== 0 || minor !== 0) && now < major * 1000 + minor) {
        raised.stage = { major, minor }
        if (process.env.WALK_TRACE)
          appendFileSync(
            process.env.WALK_TRACE,
            `  raise by ev${event} (last ev${last}, map ${at}): ${show(from.threads[threadOf(at)]?.stage ?? { major: 0, minor: 0 })} to ${major}.${minor}\n`,
          )
      }
    }
    const outcome = eventOutcome(triggers, last, at, stateIn(state, at))
    // Where the scene sends the Hero, after its own record: `807`.
    const handOn = handOns.get(event)
    const handedOn = (s: State): State[] => {
      if (!handOn) return [s]
      const next = play(s, handOn.map, handOn.event, true, played, depth + 1)
      return next.length > 0 ? next : [s]
    }
    if (!outcome) return handedOn(state)
    runRecord(state, at, outcome)
    if (outcome.battle !== undefined) return fought(state, at, outcome.battle, played, depth)
    if (outcome.onward) {
      const next = play(state, outcome.onward.map, outcome.onward.event, true, played, depth + 1)
      return next.length > 0 ? next : [state]
    }
    return handedOn(state)
  }

  /**
   * The Starflight Express's list, opened by a conductor's record in `map`: a
   * ride to each stop offered — see `express.ts`. **Ours**: the walk does not
   * follow which stop the Express is at, which only chooses the scene
   * leaving it, and those scenes have no records; so each stop is ridden to,
   * and a stop the Express is at is never refused.
   */
  let ridePlayed = new Set<number>()
  const rides = (s: State, map: number, express: { mode: number; values: readonly number[] }) => {
    const out: State[] = []
    const mode = express.mode === 1 ? 1 : 0
    const story = storyIn(s, map)
    for (const stop of stopsOf(express.values)) {
      const point = story.stage && { ...story.stage, step: story.step, globals: s.sure }
      const { arrive } = rideScenes(0, stop, mode, point)
      if (arrive === undefined) continue
      const next = play(clone(s), map, arrive, true, ridePlayed)
      for (const after of next.length > 0 ? next : [clone(s)]) {
        // **INFERRED**: arriving at Gittingham Palace at 15.3 step 5 plays
        // ev29150, Celestria opening the way — a scene of map 20034, the
        // field by the palace, listed at 16.1, whose start raises the story
        // there (see `play`). Nothing read names it; the field's own code
        // must.
        const now = storyIn(after, 20034)
        if (stop === 4 && now.stage?.major === 15 && now.stage.minor === 3 && now.step === 5) {
          out.push(...play(after, 20034, 29150, true, ridePlayed))
        } else out.push(after)
      }
    }
    return out
  }

  /** Every state one move takes the story to. */
  const movesFrom = (state: State, played: Set<number>): State[] => {
    ridePlayed = played
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
        // And the game-wide flags it set: in the folded state every talk was
        // had, so they surely are. Lost here until 28 September 2026, which
        // kept the king's `ev23198` at 3.7 from setting 147 for Stornway's
        // entry at 4.1.
        for (const flag of after.globals) {
          if (talked.globals.has(flag)) continue
          talked.globals.add(flag)
          talked.sure.add(flag)
          talkedMore = true
        }
      }
    }
    // **Once the five threads are brought together** — `148` on ev28800's
    // record sets every one to 13.2 — the walk moves in thread 0's maps
    // alone. **Ours**: the story from there is thread 0's, and the other
    // four's towns hold only talk at 13.2, whose flags and marks made a state
    // of every combination and ran the walk past ten minutes.
    const together = state.threads.every((t) => t.stage && order(t.stage) >= 1302)
    for (const map of byMap.keys()) {
      if (together && threadOf(map) !== 0) continue
      const story = storyIn(state, map)
      const stage = story.stage
      if (!stage || stage.major === 0) continue
      if (order(stage) < (reachFrom.get(map) ?? 0)) continue
      const step = story.step > 0 ? story.step : undefined
      const here = recordsAt(map, stage)
      if (here.length === 0) continue
      const area = areaOfMap.get(map) as string
      // By day and by night: the day passes in the field, so either can be
      // waited for, and where people stand and what holds can differ —
      // Erinn is upstairs at 2.6 only by night. **Ours.**
      for (const night of [false, true]) {
        // Whoever stands here — for the talks below, and for a record's `118`.
        const view = views.get(area)
        const letter = view && letterForStage(view.letters, stage)
        const cast = view
          ? castAt(area, map, stage, step, night, { may: state.globals, sure: state.sure })
          : []
        const boxes = view
          ? boxesAt(area, map, stage, step, night, { may: state.globals, sure: state.sure })
          : new Map<number, number[]>()
        /** What a record has follow it: a talk (`118`), a hand-on, or an event. */
        const follow = (
          s: State,
          outcome: EventOutcome,
          needsScript: boolean,
          depth = 0,
        ): State[] => {
          const talk = outcome.talk
          if (talk && cast.includes(talk.character)) {
            const next = talkTo(s, talk.character, talk.label, depth + 1)
            return next.length > 0 ? next : [s]
          }
          if (outcome.battle !== undefined) return fought(s, map, outcome.battle, played)
          if (outcome.express) return rides(s, map, outcome.express)
          if (outcome.onward) {
            const next = play(s, outcome.onward.map, outcome.onward.event, true, played)
            return next.length > 0 ? next : [s]
          }
          if (outcome.event !== undefined) return play(s, map, outcome.event, needsScript, played)
          return [s]
        }
        const talkTo = (
          from: State,
          id: number,
          label: number | undefined,
          depth = 0,
          box?: number,
        ): State[] => {
          if (depth > 4 || !view) return []
          const now = storyIn(from, map)
          const choice = pickLine({
            triggers: here,
            map,
            stage,
            night,
            id,
            lines: letter === undefined ? [] : view.linesOf(id, letter),
            ...(label !== undefined ? { label } : {}),
            ...(box !== undefined ? { box } : {}),
            flags: now.flags,
            marks: now.marks,
            alone: from.party.length === 0,
            party: from.party.length + 1,
            step,
            globals: from.globals,
            globalsSure: from.sure,
          })
          if (!choice) return []
          const before = clone(from)
          if (choice.kind !== 'line') {
            runRecord(before, map, choice.record)
            return follow(before, choice.record, false, depth)
          }
          if (choice.record) runRecord(before, map, choice.record)
          // The talk records after the line, by each answer its prompt could be
          // given — which the walk takes as given, every one.
          const answers = new Set([0, ...choice.after.flatMap((a) => a.answer ?? [])])
          const out: State[] = []
          for (const answer of answers) {
            const outcome = afterFor(choice.after, answer)
            if (!outcome) {
              out.push(clone(before))
              continue
            }
            const after = clone(before)
            runRecord(after, map, outcome)
            out.push(...follow(after, outcome, false, depth))
          }
          return out
        }
        // Entering it.
        const more = { globals: state.globals, globalsSure: state.sure, night }
        const entry = entryPlay(here, map, stage, story.flags, step, more)
        if (entry) {
          const before = clone(state)
          runRecord(before, map, entry.outcome)
          keep(follow(before, entry.outcome, true))
        }
        // And its settings record, run as the map's triggers are loaded —
        // see `settingsPlay`: the Bowhole's plays ev13500 at 13.5.
        const settings = settingsPlay(here, map, stage, stateIn(state, map, night))
        if (settings) {
          const before = clone(state)
          runRecord(before, map, settings)
          keep(follow(before, settings, true))
        }
        // Being in it: its watch, every frame — see `KIND_WATCH`.
        const watch = watchPlay(here, map, stage, stateIn(state, map, night))
        if (watch) {
          const before = clone(state)
          runRecord(before, map, watch)
          keep(follow(before, watch, true))
        }
        // Walking into each of its areas: the first record for it that holds
        // runs, whatever it does — Dourbridge's area 22 at 7.3 has the Hero
        // talk to 3, which is what starts ev7300.
        for (const area of areaIdsAt(map, stage, stateIn(state, map, night))) {
          const found = areaEvent(here, map, stage, story.flags, step, (id) => id === area, more)
          if (!found) continue
          const before = clone(state)
          runRecord(before, map, found.outcome)
          keep(follow(before, found.outcome, true))
        }
        // Performing a party trick in each of them — see `KIND_TRICK`: a Clap
        // in Gleeba's area 10 at 11.2 brings Drak out. The walk performs any
        // trick the Hero knows, from the start or learnt by `142`.
        for (const area of areaIdsAt(map, stage, stateIn(state, map, night))) {
          const found = trickPlay(
            here,
            map,
            stage,
            area,
            (trick) => trickKnown(trick, state.sure),
            stateIn(state, map, night),
          )
          if (!found) continue
          const before = clone(state)
          runRecord(before, map, found.outcome)
          keep(follow(before, found.outcome, true))
        }
        // Standing at each of its doorways — see `KIND_DOORWAY`: Coffinwell's
        // 27 stops the Hero at door 9 at 4.5, which is what starts ev4080.
        for (const doorway of mapDoorwaysOf.get(map) ?? []) {
          const found = doorwayPlay(here, map, stage, doorway, stateIn(state, map, night))
          if (!found) continue
          const before = clone(state)
          runRecord(before, map, found)
          keep(follow(before, found, true))
        }
        if (!view) continue
        // Talking to whoever stands there, as the game does — see `pickLine`.
        // **Talks in every order, as far as game-wide flags go.** The folded
        // state above is every talk had at once, and the game-wide flags it
        // has are merged, may and sure (see `walkFrom`) — which cannot say
        // that one is set and another not. Some of the game's puzzles are
        // that: the Quarantomb's two switches each hold only while the other
        // is off; the last of Angel Falls' five bells rings only with the
        // other four rung; Gortress's captain wants four set. So a talk that
        // changed nothing but the game-wide flags is talked on from, exactly
        // — those flags surely set — once for each set of flags reached, up
        // to `TALK_SETS`. **Ours.**
        const frontier: State[] = [state]
        const reachedSets = new Set([sorted(state.globals)])
        while (frontier.length > 0) {
          const from = frontier.pop() as State
          for (const id of cast) {
            const talks = [
              talkTo(from, id, undefined),
              // And from each of their talk boxes, with its label.
              ...(boxes.get(id) ?? []).map((box) => talkTo(from, id, undefined, 0, box)),
            ]
            for (const results of talks) {
              keep(results)
              for (const after of results) {
                if (keyOf(after) !== keyOf(from)) continue
                const set = sorted(after.globals)
                if (reachedSets.has(set) || reachedSets.size >= TALK_SETS) continue
                reachedSets.add(set)
                frontier.push(after)
              }
            }
          }
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
    //
    // **The threads are walked apart** — ours, 28 September 2026. A move in
    // a map reads and writes that map's thread alone, with the game-wide flags
    // and whoever goes along (`storyIn`); so once `ev25524` has started all
    // five, every combination of where they stand is a state of its own, and
    // the walk from 5.1 ran past ten minutes. A new state is kept only if one
    // of its threads stands somewhere no state has had it, with that party;
    // otherwise all it could add is its game-wide flags, merged into the first
    // state found at each of its threads', as above.
    const seen = new Map<string, State>()
    const projections = (s: State) =>
      s.threads.map(
        (t, k) =>
          `${k}|${t.stage ? show(t.stage) : '-'}.${t.step}/${sorted(t.flags)}/${sorted(t.marks)}|${sorted(s.party)}`,
      )
    const note = (s: State) => {
      for (const p of projections(s)) if (!seen.has(p)) seen.set(p, s)
    }
    note(start)
    const grows = (next: State, known: State) =>
      [...next.globals].some((n) => !known.globals.has(n)) ||
      [...known.sure].some((n) => !next.sure.has(n))
    const queue = [start]
    /** Put `merged` where `known` was, and walk on from it. */
    const supersede = (known: State, merged: State) => {
      best.set(keyOf(known), merged)
      for (const p of projections(known)) if (seen.get(p) === known) seen.set(p, merged)
      queue.push(merged)
    }
    const mergedOf = (known: State, next: State) => {
      const merged = clone(known)
      for (const n of next.globals) merged.globals.add(n)
      for (const n of known.sure) if (!next.sure.has(n)) merged.sure.delete(n)
      return merged
    }
    const reached = new Map<string, Point>()
    const played = new Set<number>()
    let capped = false
    /** Every game-wide flag some state has had set, and the first state with thread 0 at 10.8 step 1 — for the ride below. */
    const everSet = new Set<number>()
    let atTheEnd: State | undefined
    const t0 = Date.now()
    let processed = 0
    const drain = () => {
      while (queue.length > 0) {
        const state = queue.shift() as State
        if (best.get(keyOf(state)) !== state) continue
        if (process.env.WALK_TRACE && ++processed % 200 === 0) {
          appendFileSync(
            process.env.WALK_TRACE,
            `walk from ${show(from)}: ${processed} taken, ${best.size} states, queue ${queue.length}, ${Date.now() - t0}ms; at ${state.threads.map((t) => (t.stage ? `${show(t.stage)}.${t.step}` : '-')).join(' ')}\n`,
          )
        }
        const tState = Date.now()
        for (const flag of state.globals) everSet.add(flag)
        for (const thread of state.threads) {
          if (!thread.stage || thread.stage.major === 0) continue
          const point = { ...thread.stage, step: thread.step }
          reached.set(show(point), point)
        }
        const first = storyIn(state, 6401)
        if (!atTheEnd && first.stage?.major === 10 && first.stage.minor === 8 && first.step === 1)
          atTheEnd = state
        for (const next of movesFrom(state, played)) {
          const key = keyOf(next)
          const known = best.get(key)
          if (!known) {
            if (projections(next).every((p) => seen.has(p))) {
              // Nowhere new for any thread: only its flags, into each one's first.
              for (const p of projections(next)) {
                const first = seen.get(p) as State
                if (best.get(keyOf(first)) === first && grows(next, first))
                  supersede(first, mergedOf(first, next))
              }
              continue
            }
            if (best.size >= STATE_CAP) {
              capped = true
              break
            }
            best.set(key, next)
            note(next)
            queue.push(next)
            continue
          }
          if (grows(next, known)) supersede(known, mergedOf(known, next))
        }
        if (process.env.WALK_TRACE && Date.now() - tState > 1500) {
          appendFileSync(
            process.env.WALK_TRACE,
            `  slow state (${Date.now() - tState}ms): ${state.threads.map((t) => (t.stage ? `${show(t.stage)}.${t.step}` : '-')).join(' ')} party ${sorted(state.party)} globals ${state.globals.size}\n`,
          )
        }
        if (capped) break
      }
    }
    drain()
    // **The five threads done**: Stella's ride to the Observatory at 10.8
    // step 1, with game-wide flags 4 to 10 set — one at each thread's end —
    // plays ev28800 (see `rideScenes`), whose record brings the threads back
    // together at 13.2. **Ours**: the threads are walked apart, so no one
    // state has every thread's end flag; the ride is taken again from the
    // first state at 10.8 step 1, with every flag some state has set, once
    // all seven have been, and the walk goes on from what it plays.
    const fyggs = [4, 5, 6, 7, 8, 9, 10]
    if (!capped && atTheEnd && fyggs.every((flag) => everSet.has(flag))) {
      const onBoard = clone(atTheEnd)
      for (const flag of everSet) onBoard.globals.add(flag)
      for (const flag of fyggs) onBoard.sure.add(flag)
      for (const next of rides(onBoard, 6401, { mode: 0, values: [(1 << 16) | 2, 0] })) {
        const key = keyOf(next)
        if (best.has(key)) continue
        best.set(key, next)
        note(next)
        queue.push(next)
      }
      drain()
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
        // The game-wide flags named another way — see `OP_IF_FLAG_NAMED` and
        // `OP_IF_FLAG_FROM_830`.
        if (w.op === 26 && !walked.globals.has(flagBit(w.arg)))
          fails.add(`game-wide flag ${flagBit(w.arg)} set (by number, ${w.arg})`)
        if (w.op === 27 && walked.sure.has(flagBit(w.arg)))
          fails.add(`game-wide flag ${flagBit(w.arg)} clear (by number, ${w.arg})`)
        if (w.op === 88 && !(w.arg < 73 && walked.globals.has(830 + w.arg)))
          fails.add(`game-wide flag ${830 + w.arg} set (88 : ${w.arg})`)
        if (w.op === 89 && w.arg < 73 && walked.sure.has(830 + w.arg))
          fails.add(`game-wide flag ${830 + w.arg} clear (89 : ${w.arg})`)
      }
    }
    return `it needs ${[...fails].join(', ') || 'something not named here'}, which the walk never had`
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
    const who = conditionsOf(trigger).find((w) => w.op === 6)?.arg
    if (who !== undefined) {
      const view = views.get(area)
      const standing = here.some((state) =>
        [false, true].some((night) =>
          view
            ?.castIds(
              trigger.map,
              state.stage as Stage,
              state.step > 0 ? state.step : undefined,
              night,
            )
            .includes(who),
        ),
      )
      if (!standing) {
        const at = here[0] as Story
        return `talking to ${who} in map ${trigger.map}, whom the area's cast does not stand there at ${show({ ...(at.stage as Stage), step: at.step })}, by day or by night`
      }
    }
    const inArea = words.find((w) => w.op === OP_IN_AREA)?.arg
    if (trigger.unknown_5 === KIND_AREA_EVENT && inArea !== undefined) {
      const defined = here.some((state) =>
        areaIdsAt(trigger.map, state.stage as Stage).includes(inArea),
      )
      if (!defined) {
        const byEntry = recordsAt(trigger.map, here[0]?.stage as Stage).some(
          (t) => t.unknown_5 === KIND_ENTRY && areasIn(t).some((a) => a.id === inArea),
        )
        return byEntry
          ? `walking into area ${inArea} of map ${trigger.map}, which only an entry record that plays no event defines, and the engine does not run one`
          : `walking into area ${inArea} of map ${trigger.map}, which no record defines there`
      }
    }
    const fails = failing(trigger, inSpan)
    if (fails) return `a record of ${what}: ${fails}`
    if (
      ![0, 1, KIND_AREA_EVENT, KIND_ENTRY, KIND_WATCH, KIND_TRICK, 11, 17].includes(
        trigger.unknown_5,
      )
    )
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
        party: state.party.length + 1,
        step: story.step > 0 ? story.step : undefined,
        globals: state.globals,
        globalsSure: state.sure,
      })
      // What the game's talk does instead, by `pickLine`: the record wanted
      // is of the kind and label it names, and the talk took another way.
      const wanted =
        trigger.unknown_5 === 1
          ? `a talk record for label ${conditionsOf(trigger).find((w) => w.op === 11)?.arg ?? 'any'}`
          : 'their own record'
      const went = !choice
        ? 'nothing is said, so no talk record runs'
        : choice.kind === 'line'
          ? `the line said is label ${choice.label}'s (${choice.why})`
          : choice.why
      return `talking to ${who} in map ${trigger.map}, which wants ${wanted}: ${went}`
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
      for (const [first, to] of handOns) {
        if (to.event !== s.event) continue
        reasons.push(`handed on by ev${first}'s 807, which the walk never played`)
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
    // Where each map comes into reach — see `reachFrom`.
    for (const [map, triggers] of byMap) {
      // Those over the whole story say nothing of when it is reached.
      const own = triggers
        .filter((t) => !(order(t.from) <= 101 && t.to.major >= 19))
        .map((t) => order(t.from))
      if (own.length > 0) reachFrom.set(map, Math.min(...own))
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
    // A scene's own map, from the event lists, answers to its area too.
    eventList = eventListOf(rom)
    for (const { map } of eventList.values()) {
      const code = index?.(map)
      if (!areaOfMap.has(map) && code && triggersOf.has(code.slice(0, 3)))
        areaOfMap.set(map, code.slice(0, 3))
    }
    for (const area of triggersOf.keys()) views.set(area, storyView(rom, area))
    // Each map's own areas, out of its link table, by the map's id.
    const idOf = new Map<string, number>()
    for (const map of byMap.keys()) {
      const code = index?.(map)
      if (code) idOf.set(code.toUpperCase(), map)
    }
    for (const leaf of scanCartridge(rom, { pathFilter: '/data/map/' })) {
      // By the archive's name, as `load` finds it: an exterior's table is
      // `M02.ambl/M02M0000.bmbl`, a room's `C01M18.ambl/C01M1800.bmbl`.
      const archive = /\/([A-Z0-9]+)\.ambl$/i.exec(leaf.archive)
      if (!leaf.path.toLowerCase().endsWith('.bmbl') || !archive) continue
      const map = idOf.get((archive[1] as string).toUpperCase())
      if (map === undefined || !isMapLinks(leaf.bytes)) continue
      try {
        mapAreasOf.set(map, mapAreas(leaf.bytes))
        mapDoorwaysOf.set(
          map,
          mapDoorwayRegions(leaf.bytes).map((region) => region.id),
        )
      } catch {
        // A link table that will not read leaves the map without areas of its own.
      }
    }

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
        for (const w of words) if (w.op === OP_EVENT || w.op === 155) reach(w.arg, false)
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
    // The prologue's opening: Yggdrasil, talked to from its box with label 80
    // — see `TalkBox` — plays ev21510.
    expect(walks[0]?.reached.has('1.2 step 1')).toBe(true)
    // The slice's own story, which the game already plays: the evening at
    // 2.1, the pass, the Hexagon, Patty rescued, and the morning after — in
    // one walk from 1.3, through the prologue's end at Yggdrasil again.
    const slice = walks.find((walk) => walk.reached.has('2.1 step 1'))
    expect(slice?.reached.has('1.3 step 1')).toBe(true)
    expect(slice?.reached.has('2.5 step 1')).toBe(true)
    expect(slice?.reached.has('2.7 step 1')).toBe(true)
    // And past it, by records read from the game's code: entering Stornway
    // plays ev2900, whose chain hands on with 138 to the lobby; talking to
    // 203 there, named by the composite 52, sets flag 3; and the lobby's watch,
    // kind 6, starts chapter 3.
    expect(slice?.reached.has('3.1 step 1')).toBe(true)
    expect(slice?.reached.has('3.1 step 2')).toBe(true)
    // And in the castle, by the throne room's own area 0 — defined in its
    // link table, not its triggers — which plays ev3040.
    expect(slice?.reached.has('3.1 step 3')).toBe(true)
    // And through the throne room to 3.2, now that the king — `45`, `s004` —
    // stands where his block puts him, as the game's own placement has it,
    // and his talk file for chapter C reads: its first word, 16, was taken
    // for an empty compressed stream (see `tryDecompressLz10`).
    expect(slice?.reached.has('3.2 step 1')).toBe(true)
    expect(slice?.reached.has('3.2 step 2')).toBe(true)
    // Chapter 3's second half, Zere and its dungeon, in one walk to 3.7.
    const zere = walks.find((walk) => walk.reached.has('3.3 step 1'))
    expect(zere?.reached.has('3.7 step 1')).toBe(true)
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
    // frame, conditions parsed and composites expanded; 83 once areas came
    // from maps' own link tables too, turned as the game turns them. Fixing
    // one shows up as a smaller number here; losing a rule the game had shows
    // up as a larger. Update it, and the table in `docs/story-walk.md`, when
    // either happens. 62 once who stands where became the game's own choice,
    // by its placement script, by day or by night. 53 once talking was the
    // game's own rule — a character's own record, the line, then their talk
    // records, and talk boxes — and 372 files that begin with the word 16
    // stopped being read as empty. 47 once `155`, a flag and an event, was
    // read: Gortress's chain at 14.4 starts from it. 31 once `807` was
    // followed (Loch Storn's first fight), the walk kept the game-wide flags
    // talk sets, and `place.bin`'s tag 4 was read. 26 once a scene's record
    // was taken in the scene's own map, from the game's event lists. 24 with
    // `220`, the Quarantomb's switches, and the walk following a map's talks
    // in every order as far as game-wide flags go — the bells at 1.2 too. 23
    // once an area record's `118` started its talk (Dourbridge at 7.3). 20
    // with the doorway records, kind 17: Coffinwell's 27 at door 9. 16 once a
    // talk record's battle was fought. 15 with every doorway region, not only
    // those with a destination. 13 once an entry record was run whole, event
    // or none, and the settings records, kind 20, ran with it. 6 with party
    // tricks, the thread's flags that `602` reads, a scene's start raising the
    // story, and the Starflight Express — and the walk's own reach, without
    // which the raise sent the prologue to chapter 15.
    expect(breaks.length).toBe(6)
    // **The story plays from a new game to the credits in one walk**: walk 1
    // reaches 19.2. Of the six breaks, five are the Quester's Rest's quests
    // after the credits, 19.3 to 19.7, and one is 16.1 step 2 — losing set
    // battle 17, which the story does not need.
    expect(walks[0]?.reached.has('19.2 step 1')).toBe(true)
    const first = breaks.find((b) => b.next.major >= 3)
    expect(first && show(first.next)).toBe('16.1 step 2')
    expect(walks.every((walk) => !walk.capped)).toBe(true)
  })
})
