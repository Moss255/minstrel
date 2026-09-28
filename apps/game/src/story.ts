import type { EventOutcome } from '@minstrel/game-formats'
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

/**
 * Move the story on as an event's own record says — see `eventOutcome` in
 * `@minstrel/game-formats`. The live thread goes to the stage and step the
 * record's `132` names, and the flags it sets are set.
 *
 * **What a move clears is the game's own**, read from the action for `132`
 * (US ARM9 `0x02062644`): a new major clears all four of the thread's banks,
 * the marks among them (`func_0206e080`); a new minor clears the flags and one
 * other bank, but **not the marks** (`func_0206e0d0`).
 *
 * `threads` takes the moves `214` makes to other threads by number; one to
 * the live thread moves it without clearing anything, as the action for `214`
 * clears nothing. What applies the game's queue of moves has not been read.
 *
 * Whether the stage moved and whether the step did, for whoever has to put the
 * cast where the new step has them. The game plays this through `followEvent`;
 * `story-walk.test.ts` plays it over the whole cartridge.
 */
export function moveStory(
  story: Story,
  outcome: Pick<EventOutcome, 'stage' | 'flags'> & Partial<Pick<EventOutcome, 'threads'>>,
  threads?: { readonly all: Story[]; readonly live: number | undefined },
): { readonly moved: boolean; readonly stepped: boolean } {
  let moved = false
  let stepped = false
  const moveLive = (stage: { major: number; minor: number; step: number }, clears: boolean) => {
    const major = !story.stage || story.stage.major !== stage.major
    const minor = !story.stage || story.stage.minor !== stage.minor
    moved ||= major || minor
    stepped ||= major || minor || story.step !== stage.step
    if (clears && (major || minor)) story.flags.clear()
    if (clears && major) story.marks.clear()
    story.stage = { major: stage.major, minor: stage.minor }
    story.step = stage.step
  }
  for (const { thread, stage } of outcome.threads ?? []) {
    if (threads && thread === threads.live) moveLive(stage, false)
    else if (threads && thread >= 0 && thread < THREADS) {
      const kept = threads.all[thread] ?? unstarted()
      threads.all[thread] = {
        ...copyStory(kept),
        stage: { major: stage.major, minor: stage.minor },
        step: stage.step,
      }
    }
  }
  if (outcome.stage) moveLive(outcome.stage, true)
  for (const flag of outcome.flags) story.flags.add(flag)
  return { moved, stepped }
}
