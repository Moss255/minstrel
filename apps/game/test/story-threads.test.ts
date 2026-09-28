import { describe, expect, it } from 'vitest'
import { moveStory, type Story, swapThread, THREADS, threadOf, unstarted } from '../src/story.ts'

const at = (
  major: number,
  minor: number,
  step: number,
  flags: number[] = [],
  marks: number[] = [],
) => ({ stage: { major, minor }, step, flags: new Set(flags), marks: new Set(marks) }) as Story

/**
 * The story's five threads, as the game's code keeps them — see `THREADS` in
 * `story.ts` and FORMAT.md, "Triggers, read from the game's code". Synthetic:
 * the map ranges are the code's own, and the clearing rules its two clear
 * functions'.
 */
describe('the story’s threads', () => {
  it('are live by the map the Hero is in, with the game’s own ranges', () => {
    expect(THREADS).toBe(5)
    // Each range's ends, and one past them.
    expect([4199, 4200, 4202, 4203].map(threadOf)).toEqual([0, 1, 1, 0])
    expect([8999, 9000, 9008, 9009].map(threadOf)).toEqual([0, 1, 1, 0])
    expect([1700, 1706, 1800, 1808, 6000, 6001, 7700, 7709].map(threadOf)).toEqual(Array(8).fill(2))
    expect([200, 219, 7802, 7809].map(threadOf)).toEqual([3, 3, 3, 3])
    expect([7800, 7801].map(threadOf)).toEqual([0, 0])
    expect([2100, 2109, 8301, 8303].map(threadOf)).toEqual([4, 4, 4, 4])
    // Angel Falls, the Hexagon, Stornway's lobby, and a map with no id.
    expect([1100, 7100, 50101, undefined].map(threadOf)).toEqual([0, 0, 0, 0])
  })

  it('swap on entering another thread’s map, keeping the one left', () => {
    const live = at(7, 2, 1, [3], [0])
    const threads = [unstarted(), at(6, 4, 2, [1], [5]), unstarted(), unstarted(), unstarted()]
    swapThread(live, threads, 0, 1)
    expect(live).toEqual(at(6, 4, 2, [1], [5]))
    expect(threads[0]).toEqual(at(7, 2, 1, [3], [0]))
    swapThread(live, threads, 1, 0)
    expect(live).toEqual(at(7, 2, 1, [3], [0]))
    expect(threads[1]).toEqual(at(6, 4, 2, [1], [5]))
  })

  it('start unstarted, at a stage no span covers', () => {
    expect(unstarted().stage).toEqual({ major: 0, minor: 0 })
  })
})

describe('a move of the live thread, `132`', () => {
  const outcome = (major: number, minor: number, step: number, flags: number[] = []) => ({
    stage: { major, minor, step },
    flags,
  })

  it('keeps flags and marks within the step’s stage', () => {
    const story = at(2, 4, 1, [4], [7])
    expect(moveStory(story, outcome(2, 4, 2))).toEqual({ moved: false, stepped: true })
    expect(story).toEqual(at(2, 4, 2, [4], [7]))
  })

  it('clears the flags on a new minor, but not the marks', () => {
    const story = at(2, 4, 5, [4], [7])
    expect(moveStory(story, outcome(2, 5, 1))).toEqual({ moved: true, stepped: true })
    expect(story).toEqual(at(2, 5, 1, [], [7]))
  })

  it('loses a flag its own record sets on the way into a new minor, as the game does', () => {
    // `132`'s action clears, and so does the queued move after: `ev14140`'s
    // `104:3 132:0 0:14 0:2 0:1` arrives at 14.2 without flag 3.
    const story = at(14, 1, 3)
    moveStory(story, outcome(14, 2, 1, [3]))
    expect(story).toEqual(at(14, 2, 1))
    // Within the minor, it is kept: `ev2210`'s `104:0 132:0 0:2 0:2 0:2`.
    const within = at(2, 2, 1)
    moveStory(within, outcome(2, 2, 2, [0]))
    expect(within).toEqual(at(2, 2, 2, [0]))
  })

  it('only moves forward', () => {
    const story = at(4, 3, 4, [6], [1])
    expect(moveStory(story, outcome(4, 3, 2))).toEqual({ moved: false, stepped: false })
    expect(story.step).toBe(4)
    expect(moveStory(story, outcome(4, 3, 4)).stepped).toBe(false)
  })

  it('clears both on a new major', () => {
    const story = at(2, 7, 1, [3], [7])
    moveStory(story, outcome(3, 1, 1))
    expect(story).toEqual(at(3, 1, 1))
  })
})

describe('a move of a thread by number, `214`', () => {
  it('sets another thread’s stage, leaving the live one', () => {
    const live = at(5, 2, 3, [1], [2])
    const all = [unstarted(), unstarted(), unstarted(), unstarted(), unstarted()]
    const threads = [
      { thread: 0, stage: { major: 7, minor: 1, step: 1 } },
      { thread: 1, stage: { major: 6, minor: 1, step: 1 } },
      { thread: 4, stage: { major: 12, minor: 1, step: 1 } },
    ]
    moveStory(live, { stage: undefined, flags: [], threads }, { all, live: 0 })
    // The live thread moves, and a new major clears its flags and marks.
    expect(live).toEqual(at(7, 1, 1))
    expect(all[1]).toEqual(at(6, 1, 1))
    expect(all[4]).toEqual(at(12, 1, 1))
    expect(all[2]).toEqual(unstarted())
  })
})

describe('a move of every thread, `148`', () => {
  it('brings the threads together, each only forward', () => {
    const live = at(12, 6, 1, [2])
    const all = [at(13, 1, 1), at(7, 1, 1), at(13, 4, 1), unstarted(), at(12, 6, 1)]
    const all13 = { major: 13, minor: 2, step: 1 }
    moveStory(live, { stage: undefined, flags: [], all: all13 }, { all, live: 4 })
    expect(live).toEqual(at(13, 2, 1))
    expect(all[0]).toEqual(at(13, 2, 1))
    expect(all[1]).toEqual(at(13, 2, 1))
    // Already past it: left where it is.
    expect(all[2]).toEqual(at(13, 4, 1))
    expect(all[3]).toEqual(at(13, 2, 1))
  })
})

describe('the game-wide flags', () => {
  it('are set and cleared by a record, and no move clears them', () => {
    const globals = new Set([4])
    const story = at(3, 1, 1)
    moveStory(
      story,
      { stage: { major: 4, minor: 1, step: 1 }, flags: [], globals: [29], unglobals: [4] },
      undefined,
      globals,
    )
    expect([...globals]).toEqual([29])
  })
})
