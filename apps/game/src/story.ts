import {
  bankBit,
  type EventOutcome,
  flagBit,
  OP_LEARN_TRICK,
  OP_QUARANTOMB_SWITCH,
  OP_QUEST_CLEAR_FLAG,
  OP_QUEST_SET_FLAG,
  quarantombSwitch,
  trickLearntBit,
} from '@minstrel/game-formats'
import type { Stage } from './load.ts'

/**
 * Where one thread of the story stands: the stage, the step within it, and the
 * thread's own flags and marks — see `OP_SET_FLAG` and `OP_SET_MARK` in
 * `@minstrel/game-formats`. Step 0 is a stage opened without an event to set
 * it, which no record names.
 *
 * The live thread is what everything reads: the cast's records, the triggers'
 * spans, the talk. The game keeps it the same way, as a copy in `GameState`
 * beside the five threads' own records — see {@link THREADS}.
 */
export interface Story {
  stage: Stage | undefined
  step: number
  readonly flags: Set<number>
  readonly marks: Set<number>
}

/**
 * **The story is five threads, and the map decides which is live.** Read from
 * the game's code (US ARM9 `func_02064b98`): the trigger object keeps five
 * records of a stage, a step and four banks of bits, and on entering a map
 * picks one by the map's id and copies its stage into `GameState` — which is
 * the one stage a trigger's span is checked against (`func_0205f9cc`). See
 * FORMAT.md, "Triggers, read from the game's code".
 *
 * Thread 0 is everywhere not listed. `ev25524` on the Starflight Express at
 * 5.2 starts all five with `214`: 0 at 7.1, and the places below at 6.1, 8.1,
 * 11.1 and 12.1 — each thread's maps being where that chapter's records are.
 */
export const THREADS = 5

/** Each thread's maps, by id, as the game's code lists them: thread, first, last. */
const THREAD_MAPS: readonly (readonly [number, number, number])[] = [
  // Alltrades Abbey, the Tower of Trades.
  [1, 4200, 4202],
  [1, 9000, 9008],
  // Zere Rocks, Dourbridge, the Lonely Plains, the Heights of Loneliness.
  [2, 1700, 1706],
  [2, 1800, 1808],
  [2, 6000, 6001],
  [2, 7700, 7709],
  // Gleeba, the Plumbed Depths.
  [3, 200, 219],
  [3, 7802, 7809],
  // Swinedimples Academy and its Old School.
  [4, 2100, 2109],
  [4, 8301, 8303],
]

/** The story thread live in a map — see {@link THREADS}. A map with no id is in thread 0. */
export function threadOf(map: number | undefined): number {
  if (map === undefined) return 0
  for (const [thread, first, last] of THREAD_MAPS) {
    if (map >= first && map <= last) return thread
  }
  return 0
}

/** A thread nobody has started: the game's record is all zeros, which no span covers. */
export function unstarted(): Story {
  return { stage: { major: 0, minor: 0 }, step: 0, flags: new Set(), marks: new Set() }
}

/** A copy of a thread, so the live one can go on changing without it. */
export function copyStory(story: Story): Story {
  return {
    stage: story.stage,
    step: story.step,
    flags: new Set(story.flags),
    marks: new Set(story.marks),
  }
}

/**
 * Make thread `to` live, as entering one of its maps does: the live story is
 * kept as thread `from`'s, and `to`'s taken up in its place. `live` is changed
 * in place, since the game reads it everywhere.
 */
export function swapThread(live: Story, threads: Story[], from: number, to: number): void {
  if (from === to) return
  threads[from] = copyStory(live)
  const next = threads[to] ?? unstarted()
  live.stage = next.stage
  live.step = next.step
  live.flags.clear()
  for (const flag of next.flags) live.flags.add(flag)
  live.marks.clear()
  for (const mark of next.marks) live.marks.add(mark)
}

/** A point in the story as the game compares them: `major × 10000 + minor × 100 + step`. */
const pointOf = (stage: Stage | undefined, step: number) =>
  stage ? stage.major * 10000 + stage.minor * 100 + step : 0

/** A move of one thread's stage, as the game queues it — see {@link moveStory}. */
interface Move {
  readonly thread: number | 'live'
  readonly stage: { readonly major: number; readonly minor: number; readonly step: number }
}

/**
 * Run a record's actions on the story, as the game runs them — every one, in
 * the record's order (see `outcomeOf` in `@minstrel/game-formats`). The live
 * thread is `story`; `threads` holds the others, and `globals` the game-wide
 * flags, where the caller keeps them. Read from the game's code, US ARM9:
 *
 * - **as each action runs** (`func_02061c04`): `104`/`105` set and clear a
 *   flag, `102`/`103` a mark, `100`/`101` a game-wide flag. `132` also clears
 *   by the live stage there and then: all the thread's banks on a new major,
 *   the flags on a new minor (`func_0206e080`, `func_0206e0d0`) — so a flag
 *   set before it is lost with the others;
 * - **then the stage moves**, queued by `132` (the live thread), `214 : n`
 *   (thread n) and `148` (all five), and applied after (`func_0206f81c`)
 *   through one setter, `func_020703c8`. **The story only moves forward**: a
 *   move to a point at or before where the thread stands does nothing. A move
 *   forward clears as `132`'s action does.
 *
 * **Marks last the major stage**: a new minor clears the flags but not the
 * marks. Whether the stage moved and whether the step did, for whoever has to
 * put the cast where the new step has them. The game plays this through
 * `followEvent`; `story-walk.test.ts` plays it over the whole cartridge.
 */
export function moveStory(
  story: Story,
  outcome: Pick<EventOutcome, 'stage' | 'flags'> &
    Partial<
      Pick<
        EventOutcome,
        'threads' | 'all' | 'unflags' | 'marks' | 'unmarks' | 'globals' | 'unglobals' | 'actions'
      >
    >,
  threads?: { readonly all: Story[]; readonly live: number | undefined },
  globals?: Set<number>,
): { readonly moved: boolean; readonly stepped: boolean } {
  const before = { stage: story.stage, step: story.step }
  const moves: Move[] = []
  const queueMove = (thread: Move['thread'], params: readonly number[]) => {
    if (params.length !== 3) return
    const [major, minor, step] = params.map((v) => v & 0xffff) as [number, number, number]
    moves.push({ thread, stage: { major, minor, step } })
  }
  const clearFor = (target: Story, stage: { major: number; minor: number }) => {
    if (!target.stage || target.stage.major !== stage.major) {
      target.flags.clear()
      target.marks.clear()
    } else if (target.stage.minor !== stage.minor) target.flags.clear()
  }

  const actions = outcome.actions ?? [
    // An outcome made by hand: the fields, in a fixed order.
    ...(outcome.stage
      ? [
          {
            op: 132,
            arg: 0,
            params: [outcome.stage.major, outcome.stage.minor, outcome.stage.step],
          },
        ]
      : []),
    ...(outcome.threads ?? []).map(({ thread, stage }) => ({
      op: 214,
      arg: thread,
      params: [stage.major, stage.minor, stage.step],
    })),
    ...(outcome.all
      ? [{ op: 148, arg: 0, params: [outcome.all.major, outcome.all.minor, outcome.all.step] }]
      : []),
    ...outcome.flags.map((arg) => ({ op: 104, arg, params: [] })),
    ...(outcome.unflags ?? []).map((arg) => ({ op: 105, arg, params: [] })),
    ...(outcome.marks ?? []).map((arg) => ({ op: 102, arg, params: [] })),
    ...(outcome.unmarks ?? []).map((arg) => ({ op: 103, arg, params: [] })),
    ...(outcome.globals ?? []).map((arg) => ({ op: 100, arg, params: [] })),
    ...(outcome.unglobals ?? []).map((arg) => ({ op: 101, arg, params: [] })),
  ]

  for (const { op, arg, params } of actions) {
    if (op === 100) globals?.add(arg)
    else if (op === 101) globals?.delete(arg)
    // `202`, `223`, `224`, `231`, `160` each set a game-wide flag of their
    // own: the Krak Pot's, the Abbey open, revocation open, a vocation
    // unlocked — see `bankBit`.
    else if (bankBit(op, arg)) {
      const bit = bankBit(op, arg)
      if (bit && globals) {
        if (bit.on) globals.add(bit.flag)
        else globals.delete(bit.flag)
      }
    } else if (op === 102) story.marks.add(arg)
    else if (op === 103) story.marks.delete(arg)
    else if (op === 104) story.flags.add(arg)
    // `155 : e` sets the flag in its value's high half, as it runs — see `OP_FLAG_AND_EVENT`.
    else if (op === 155 && params.length === 1) story.flags.add((params[0] as number) >>> 16)
    else if (op === 105) story.flags.delete(arg)
    // The Quarantomb's switches set a game-wide flag — see `quarantombSwitch`.
    else if (op === OP_QUARANTOMB_SWITCH) {
      const turned = quarantombSwitch(arg)
      if (turned && globals) {
        if (turned.on) globals.add(turned.flag)
        else globals.delete(turned.flag)
      }
    }
    // `130`, `131`: the flag their value's high half names, by its number —
    // see `OP_QUEST_SET_FLAG`.
    else if ((op === OP_QUEST_SET_FLAG || op === OP_QUEST_CLEAR_FLAG) && params.length === 1) {
      const bit = flagBit(((params[0] as number) >>> 16) & 0xffff)
      if (op === OP_QUEST_SET_FLAG) globals?.add(bit)
      else globals?.delete(bit)
    }
    // A party trick learnt is a bit of the game-wide bank — see `trickLearntBit`.
    else if (op === OP_LEARN_TRICK) {
      const bit = trickLearntBit(arg)
      if (bit !== undefined) globals?.add(bit)
    } else if (op === 132) {
      if (params.length === 3)
        clearFor(story, { major: params[0] as number, minor: params[1] as number })
      queueMove('live', params)
    } else if (op === 214) queueMove(arg, params)
    else if (op === 148) {
      queueMove('live', params)
      for (let thread = 0; thread < THREADS; thread++)
        if (threads && thread !== threads.live) queueMove(thread, params)
    }
  }

  for (const { thread, stage } of moves) {
    const live = thread === 'live' || (threads !== undefined && thread === threads.live)
    let target: Story
    if (live) target = story
    else if (threads && typeof thread === 'number' && thread >= 0 && thread < THREADS) {
      target = copyStory(threads.all[thread] ?? unstarted())
      threads.all[thread] = target
    } else continue
    if (pointOf(target.stage, target.step) >= pointOf(stage, stage.step)) continue
    clearFor(target, stage)
    target.stage = { major: stage.major, minor: stage.minor }
    target.step = stage.step
  }

  const moved =
    before.stage?.major !== story.stage?.major || before.stage?.minor !== story.stage?.minor
  return { moved, stepped: moved || before.step !== story.step }
}
