/**
 * **A frame-rate meter**, for `?fps=1` — ours, a tool for looking, nothing of
 * the game's. It keeps the last second of frame times and counts the long
 * frames since it was last reset, so a drop too short to see in the rate (one
 * frame of 80 ms in a second of 16s) still shows.
 */

/** A frame longer than this is counted as a drop: two of a 60 Hz display's frames. */
export const LONG_FRAME_MS = 1000 / 30
/** How much of the past the rate and the worst frame are over. */
const WINDOW_MS = 1000

export interface FpsMeter {
  /** Each frame's time, ms, oldest first — the last second's. */
  readonly frames: number[]
  /** Frames longer than {@link LONG_FRAME_MS} since the last reset, and the longest of them. */
  long: number
  longest: number
}

export function fpsMeter(): FpsMeter {
  return { frames: [], long: 0, longest: 0 }
}

/** One frame of `ms` gone by. */
export function tickFps(meter: FpsMeter, ms: number): void {
  if (!(ms > 0)) return
  meter.frames.push(ms)
  let total = meter.frames.reduce((a, b) => a + b, 0)
  while (meter.frames.length > 1 && total - (meter.frames[0] as number) >= WINDOW_MS) {
    total -= meter.frames.shift() as number
  }
  if (ms > LONG_FRAME_MS) {
    meter.long++
    meter.longest = Math.max(meter.longest, ms)
  }
}

/** Start counting the long frames again — as a fight begins. */
export function resetFps(meter: FpsMeter): void {
  meter.long = 0
  meter.longest = 0
}

/** What the meter shows: frames a second over the last second, its worst frame, and the drops counted. */
export function fpsLine(meter: FpsMeter): string {
  const total = meter.frames.reduce((a, b) => a + b, 0)
  const rate = total > 0 ? (meter.frames.length * 1000) / total : 0
  const worst = meter.frames.reduce((a, b) => Math.max(a, b), 0)
  const drops =
    meter.long === 0
      ? 'no drops'
      : `${meter.long} over ${Math.round(LONG_FRAME_MS)} ms, longest ${Math.round(meter.longest)} ms`
  return `${rate.toFixed(0)} fps · worst ${worst.toFixed(1)} ms\n${drops}`
}
