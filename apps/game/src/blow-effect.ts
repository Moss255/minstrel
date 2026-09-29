import type { DataTable, TableRecord } from '@minstrel/game-formats'

/**
 * **A blow, as a fighter's own action script plays it** — read from overlays
 * 0 and 25 on 29 September 2026 (FORMAT.md, "The action scripts"). Every
 * fighter's script differs: the Hero's (`mp0200.bact`) lunges from 6% to 33%
 * of its blow to 0.25 apart and lands at 61%; the slime's (`z000a.bact`) from
 * 12% to 40.7%, to 0.3, landing at 58%; Ivor's (`s017b.bact`) from 0 to 55%,
 * to 0.75, landing at 60%. So each is read, from the close-in blow on — the
 * path a fighter that has stepped in takes:
 *
 *     77 0.75                step in to 0.75 and the radii
 *     3 7 "attack1a"         the blow's motion
 *     5 60 330 0.25          its lunge: from and to, thousandths, and the gap
 *     21 100 26 "0"          play effect 100 on the one striking, motion "0"
 *     26 7 0.61              wait for the blow to be 61% through …
 *     116 0.1 200 100        … the hit-stop
 *     61 … 66 100 / 68 1 … 62   the reaction: an effect on the one struck
 *
 * An effect gets its id from `30 id number` or `20 id "path"` (`0x021e4a58`,
 * `0x021e4168`); a number is a file, its millions picking `em`, `et`, `eb`,
 * `b` or `z` (`ov025 0x021e278c`, `0x021ef520`) — 3000500 is
 * `effect/eb0500.chr`.
 */
const EFFECT_NAMES = ['', 'em', 'et', 'eb', 'b', 'z'] as const
const EFFECT_DIGITS = [0, 4, 4, 4, 6, 6] as const

/** An effect's file, by its number, under `/data`: 3000500 is `effect/eb0500.chr`. */
export function effectFile(n: number): string | undefined {
  const kind = Math.floor(n / 1_000_000)
  const name = EFFECT_NAMES[kind]
  const digits = EFFECT_DIGITS[kind]
  if (!name || !digits) return undefined
  return `effect/${name}${String(n % 1_000_000).padStart(digits, '0')}.chr`
}

/** An effect a script plays: its file under `/data`, and which of its motions — undefined for its first. */
export interface ScriptEffect {
  readonly file: string
  readonly motion: string | undefined
}

/** What a script's blow does. Fractions are of the blow's motion; distances in map units. */
export interface BlowScript {
  /** The blow's motion. */
  readonly motion: string
  /** How far past the two radii's mean the step in stops (tag 77). */
  readonly stepIn: number
  /** The lunge (tag 5): from and to, and the gap it leaves edge to edge. */
  readonly lunge: { readonly from: number; readonly to: number; readonly gap: number }
  /** When the blow lands: the last wait for it before the reaction (tag 26). */
  readonly lands: number
  /** The swing trail on the one striking (tag 21), if it plays one. */
  readonly swing: ScriptEffect | undefined
  /** The effect on the one struck (the reaction's tag 66), raised by half their height when `68 1`. */
  readonly struck: (ScriptEffect & { readonly raised: boolean }) | undefined
  /** The hit-stop (tag 116): the speed, for how long, after how long, ms. */
  readonly hitStop:
    | { readonly speed: number; readonly lasts: number; readonly after: number }
    | undefined
}

/** The Hero's own, for a fighter with no script to read — `mp0200.bact`. */
export const HERO_BLOW: BlowScript = {
  motion: 'attack1a',
  stepIn: 0.75,
  lunge: { from: 0.06, to: 0.33, gap: 0.25 },
  lands: 0.61,
  swing: undefined,
  struck: undefined,
  hitStop: { speed: 0.1, lasts: 200, after: 100 },
}

/**
 * Read a script's close-in blow — see the module. Undefined for a script
 * with no such blow. Where it asks nothing of a part, the Hero's stands.
 */
export function readBlowScript(table: DataTable, blow = 'attack1a'): BlowScript | undefined {
  const records = table.records
  const text = (r: TableRecord, i: number) =>
    r.kinds[i] === 0 ? table.stringAt(r.values[i] as number) : undefined
  const int = (r: TableRecord, i: number) => (r.values[i] ?? 0) | 0
  // A fraction is a float, or a whole number of thousandths (the builders, `0x0216a1a4` on);
  // a wait's whole 1 is the motion's end (`0x021e4868`).
  const fraction = (r: TableRecord, i: number) =>
    r.kinds[i] === 2 ? (r.floats[i] as number) : int(r, i) === 1 ? 1 : int(r, i) / 1000
  const float = (r: TableRecord, i: number) =>
    r.kinds[i] === 2 ? (r.floats[i] as number) : int(r, i)
  const begins = records.findIndex((r) => r.tag === 3 && text(r, 1) === blow)
  if (begins < 0) return undefined
  const effectOf = (id: number, motion: string | undefined): ScriptEffect | undefined => {
    const byNumber = records.find((r) => r.tag === 30 && int(r, 0) === id)
    const byPath = records.find((r) => r.tag === 20 && int(r, 0) === id)
    const file = byNumber ? effectFile(int(byNumber, 1)) : byPath ? text(byPath, 1) : undefined
    return file ? { file: file.toLowerCase(), motion } : undefined
  }
  const after = records.slice(begins + 1)
  const reaction = after.findIndex((r) => r.tag === 61)
  const beforeReaction = reaction < 0 ? after : after.slice(0, reaction)
  const stepIn = records.slice(0, begins).find((r) => r.tag === 77)
  const lunge = beforeReaction.find((r) => r.tag === 5)
  const waits = beforeReaction.filter((r) => r.tag === 26 && int(r, 0) === 7)
  const lastWait = waits[waits.length - 1]
  const play = beforeReaction.find((r) => r.tag === 21)
  const stop = beforeReaction.find((r) => r.tag === 116)
  const submitted = after.findIndex((r, i) => i > reaction && r.tag === 62)
  const record = reaction < 0 ? [] : after.slice(reaction, submitted < 0 ? undefined : submitted)
  const struckId = record.find((r) => r.tag === 66)
  const flags = record.find((r) => r.tag === 68)
  const struckEffect =
    struckId && int(struckId, 0) >= 0 ? effectOf(int(struckId, 0), undefined) : undefined
  return {
    motion: blow,
    stepIn: stepIn ? float(stepIn, 0) : HERO_BLOW.stepIn,
    lunge: lunge
      ? { from: fraction(lunge, 0), to: fraction(lunge, 1), gap: float(lunge, 2) }
      : HERO_BLOW.lunge,
    lands: lastWait ? fraction(lastWait, 1) : HERO_BLOW.lands,
    swing: play ? effectOf(int(play, 0), text(play, 2)) : undefined,
    struck: struckEffect
      ? { ...struckEffect, raised: ((flags ? int(flags, 0) : 0) & 1) === 1 }
      : undefined,
    hitStop: stop
      ? { speed: float(stop, 0), lasts: int(stop, 1), after: int(stop, 2) }
      : HERO_BLOW.hitStop,
  }
}
