/**
 * **The day's clock** — the game's `GameState` clock (US ARM9, the decomp's
 * `GameTime`), read 4 October 2026.
 *
 * - **One clock, of a 420-second day**, kept by the game as a float of
 *   seconds at `GameState+0x3CC`, with a running flag at `+0x3D8` and the
 *   phase at `+0x3DC`: **night from 0, morning from 180, day from 210, evening
 *   from 390** (`SetDayTimer`, `0x02010288`, the one writer of the phase). A
 *   new game's clock is at 210, the day's start, and running.
 * - **It runs only on a map of kind 0 or 7** — a field, or the ocean and the
 *   sky (`MapEntry.kind`) — about a second a second; towns, dungeons and the
 *   Quester's Rest stop it, and so does a change of map.
 * - **Night is the night phase alone**, wherever a yes or no is asked — who
 *   stands where (`place.bin` tag 5), a trigger's condition 17, the inn's
 *   menu. Morning and evening are day.
 * - **Set by**: scene functions `808` (the phase) and `579` (running, by a 0);
 *   trigger actions `110 : p` (the phase) and `177 : a, v` (running by `a`
 *   being 0, and the phase `v`); the inn's Stay, the day's start, and Rest,
 *   the night's.
 *
 * **Ours**: whole ticks at 60 a second rather than the game's float, as
 * gameplay keeps no floats outside the battle; the drift over a day is far
 * under a frame.
 */

/** A day, in ticks: 420 seconds at 60 a second. */
export const DAY_TICKS = 420 * 60

/** The four phases, in the game's numbers. */
export const PHASE = { night: 0, morning: 1, day: 2, evening: 3 } as const
export type Phase = (typeof PHASE)[keyof typeof PHASE]

/** Where each phase begins, in ticks: 0, 180, 210 and 390 seconds. */
export const PHASE_START: readonly number[] = [0, 180 * 60, 210 * 60, 390 * 60]

/** The inn's Stay wakes at the day's start; its Rest at the night's. */
export const STAY_TICKS = PHASE_START[PHASE.day] as number
export const REST_TICKS = PHASE_START[PHASE.night] as number

/** The map kinds the clock runs on — see `MapEntry.kind`. */
export const CLOCK_MAP_KINDS: ReadonlySet<number> = new Set([0, 7])

export interface Clock {
  /** How far into the day, 0 to {@link DAY_TICKS} − 1. */
  ticks: number
  running: boolean
}

/** A new game's clock: the day's start, running. */
export function newClock(): Clock {
  return { ticks: STAY_TICKS, running: true }
}

/** The phase a moment of the day falls in. */
export function phaseOf(ticks: number): Phase {
  if (ticks >= (PHASE_START[PHASE.evening] as number)) return PHASE.evening
  if (ticks >= STAY_TICKS) return PHASE.day
  if (ticks >= (PHASE_START[PHASE.morning] as number)) return PHASE.morning
  return PHASE.night
}

/** Whether it is night — the night phase alone. */
export const isNight = (clock: Clock): boolean => phaseOf(clock.ticks) === PHASE.night

/** One tick of the clock, on a map of `kind`: it moves only when running, and only there. */
export function tickClock(clock: Clock, kind: number | undefined): void {
  if (!clock.running || kind === undefined || !CLOCK_MAP_KINDS.has(kind)) return
  clock.ticks = (clock.ticks + 1) % DAY_TICKS
}

/** Put the clock at a phase's start, as `808`, `110` and `177` do; its running is left alone. */
export function setPhase(clock: Clock, phase: number): void {
  const start = PHASE_START[phase]
  if (start !== undefined) clock.ticks = start
}
