/**
 * **A fight's timeline**, for looking at how a battle plays — ours, a tool,
 * nothing of the game's. `o` shows or hides it (or `?log=1` from the start);
 * it is kept while hidden, so it can be opened after something odd to see what
 * led up to it. Each line is stamped with the time since the fight began.
 */

/** How many lines are kept: the latest, the older ones let go. */
export const LOG_KEEP = 200
/** How many are shown at once. */
export const LOG_SHOWN = 32

export interface LogEntry {
  /** Ms since the fight began. */
  readonly at: number
  readonly text: string
}

export interface BattleLog {
  /** When the fight began, on the page's clock. */
  readonly start: number
  readonly entries: LogEntry[]
  /** Bumped with each line, so a view knows when to draw again. */
  version: number
}

export function battleLog(start: number): BattleLog {
  return { start, entries: [], version: 0 }
}

/** A line at `now`, on the page's clock. */
export function logLine(log: BattleLog, now: number, text: string): void {
  log.entries.push({ at: Math.max(0, now - log.start), text })
  if (log.entries.length > LOG_KEEP) log.entries.splice(0, log.entries.length - LOG_KEEP)
  log.version++
}

/**
 * A long frame at `now`: a run of them in a row is one line, counted, with
 * the longest — so a slow stretch does not push everything else out.
 */
export function logLongFrame(log: BattleLog, now: number, ms: number): void {
  const last = log.entries[log.entries.length - 1]
  const run = last?.text.match(/^long frames: (\d+), longest (\d+) ms$/)
  if (last && run) {
    const count = Number(run[1]) + 1
    const longest = Math.max(Number(run[2]), Math.round(ms))
    log.entries[log.entries.length - 1] = {
      at: last.at,
      text: `long frames: ${count}, longest ${longest} ms`,
    }
    log.version++
    return
  }
  logLine(log, now, `long frames: 1, longest ${Math.round(ms)} ms`)
}

/** The latest `rows` lines, each after its time in seconds. */
export function logText(log: BattleLog, rows = LOG_SHOWN): string {
  return log.entries
    .slice(-rows)
    .map((e) => `${(e.at / 1000).toFixed(3).padStart(8)}  ${e.text}`)
    .join('\n')
}

/**
 * What changed in each fighter's motion since the last look: a line for each
 * that began a motion — or began it again — with the one it blends from, if
 * it does. `seen` is kept between looks.
 */
export function motionChanges(
  fighters: Iterable<{
    readonly index: number
    readonly motion: string
    readonly motionAt: number
    readonly blend: { readonly from: string } | undefined
  }>,
  seen: Map<number, { motion: string; at: number }>,
  nameOf: (index: number) => string,
): string[] {
  const lines: string[] = []
  for (const f of fighters) {
    const was = seen.get(f.index)
    if (!was || was.motion !== f.motion || f.motionAt < was.at) {
      const blend = f.blend ? `, blending from ${f.blend.from}` : ''
      lines.push(`${nameOf(f.index)}: ${f.motion}${blend}`)
    }
    seen.set(f.index, { motion: f.motion, at: f.motionAt })
  }
  return lines
}
