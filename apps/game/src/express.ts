/**
 * **The Starflight Express** — read from the game's code, 28 September 2026:
 * the task its conductor starts (US overlay 17, `func_ov017_021a8614` to start
 * it, `func_ov017_021a86d0` its update), which is the whole of it.
 *
 * - **Started** by a record's `215 : mode` and the four stops its two values
 *   hold (see `OP_EXPRESS`), or by the talk service's facility 11 with the
 *   stops 1, 2, 3, 4. Mode 0 is **Stella**, and the Hero turns to face
 *   character 2; mode 1 is **Sterling**, character 203.
 * - **Its words** are `data/bin/menu/str_ark` — 箱舟, the ark: the stops' names
 *   at 1 to 5, "Cancel" at 6, the conductor's lines from 100 (Stella's) and
 *   the same lines 100 on (Sterling's, `func_ov017_021a933c`).
 * - **It asks** "which stop?" (100), and lists the stops the record named, in
 *   its order, then Cancel. Cancel, or the B Button, closes it.
 * - **The stop it is at** is a halfword of the field's state (`+0x27b4`):
 *   `216 : n` sets it (see `OP_EXPRESS_AT`), and so does every ride
 *   (`func_ov017_021d1c2c`, with the stop).
 * - **The stop it is at, chosen**: "that's where we are already" (101), a
 *   yes or no. Yes — "all change" (102), and the Hero is put down at the stop's
 *   own place (see {@link EXPRESS_PLACES}), no scene. No — 103, and the list
 *   again.
 * - **Another stop**: a ride, which is two scenes — one leaving the stop it is
 *   at, one arriving at the stop chosen — the second parked behind the first,
 *   which carries on into it (`834`, `810`). See {@link rideScenes}.
 */

/** The conductor: Stella, mode 0, or Sterling, mode 1. */
export type ExpressMode = 0 | 1

/** The stops, by number, as `str_ark` names them. */
export const EXPRESS_STOPS = {
  observatory: 1,
  alltradesAbbey: 2,
  realmOfTheAlmighty: 3,
  gittinghamPalace: 4,
  /** "The Realm of the Almighty" again, a second place in it. */
  realmBeyond: 5,
} as const

/** `str_ark`'s numbers. */
export const EXPRESS_WORDS = {
  /** "Cancel", after the stops. */
  cancel: 6,
  /** "So you want to take a trip aboard the Starflight Express? … which stop" */
  whichStop: 100,
  /** "…that's where we are already" — a yes or no. */
  alreadyThere: 101,
  /** "All change! Mind the gap when disembarking!" */
  allChange: 102,
  /** "Can't make your mind up, eh?" — and the list again. */
  undecided: 103,
} as const

/** Who the conductor is, by their id in the Express's cast: Stella 2, Sterling 203. */
export const CONDUCTOR = [2, 203] as const

/**
 * A conductor's line, by the number Stella's has: from 100 to 199, Sterling's
 * is 100 on (`func_ov017_021a933c`). Other numbers are the same for both.
 */
export function conductorLine(line: number, mode: ExpressMode): number {
  return mode === 1 && line >= 100 && line <= 199 ? line + 100 : line
}

/**
 * The stops a `215` record names, in its order, without the empty ones: four
 * bytes, the halves of its two values high first — `215:1 1:2 3:4` is the
 * Observatory, the Abbey, the Realm and Gittingham, the order facility 11
 * hands over.
 */
export function stopsOf(values: readonly number[]): number[] {
  return values
    .flatMap((value) => [(value >>> 16) & 0xffff, value & 0xffff])
    .map((half) => half & 0xff)
    .filter((stop) => stop !== 0)
}

/**
 * Where a stop puts the Hero down when it is the one the Express is already
 * at: a map, a place in its own units and a facing in radians — the task's own
 * map-change request (at `0x021a8d88` to `0x021a8e54`). Stops 2 and 4 are
 * on the field, the others inside. At a field stop the task also calls
 * `func_ov017_021a65c4`, which is not read.
 */
export const EXPRESS_PLACES: ReadonlyMap<
  number,
  {
    readonly map: number
    readonly x: number
    readonly y: number
    readonly z: number
    readonly facing: number
  }
> = new Map([
  [1, { map: 4504, x: -13, y: 0x4333 / 4096, z: -13, facing: 0 }],
  [2, { map: 20007, x: -43, y: 0x14cc / 4096, z: -34, facing: 0 }],
  [3, { map: 4301, x: 0, y: -0x6ccc / 4096, z: 0, facing: 0x3244 / 4096 }],
  [4, { map: 20034, x: 4, y: 0x14cc / 4096, z: 65, facing: 0 }],
  [5, { map: 4400, x: 0, y: -0x5ccc / 4096, z: 1, facing: 0x3244 / 4096 }],
])

/** What the story is, for the two rides that play one of its scenes — see {@link rideScenes}. */
export interface RideStory {
  readonly major: number
  readonly minor: number
  readonly step: number
  /** The game-wide flags set, by bit — see `OP_SET_GLOBAL`. */
  readonly globals: ReadonlySet<number>
}

/**
 * The two scenes of a ride from the stop the Express is `at` to `stop` — read
 * from the task (`0x021a8ed0` to `0x021a9134`):
 *
 * - **Leaving**, by the stop it is at: the Observatory 29506, the Realm 29509,
 *   the Realm beyond 29512; the Abbey 29500 bound for Gittingham and 29515
 *   otherwise; Gittingham 29503 bound for the Abbey and 29516 otherwise. At
 *   no stop, none.
 * - **Arriving**, by the stop: the Observatory 29507, the Abbey 29501, the
 *   Realm 29510, Gittingham 29504, the Realm beyond 29513.
 * - **Two of the story's own**, in place of the arrival: with Stella, bound
 *   for the Observatory at 10.8 step 1 with game-wide flags 4 to 10 all set —
 *   one at each thread's end — `ev28800`, whose record brings the five threads together at 13.2; with
 *   Sterling, bound for the Realm at 17.1 step 1 with flag 21 set, `ev29210`.
 *
 * With no scene leaving, the arriving one plays alone. `leave` is undefined
 * then; `arrive` is undefined only for a stop the task does not know.
 */
/** The scene arriving at each stop, by its number. */
const ARRIVING: readonly (number | undefined)[] = [undefined, 29507, 29501, 29510, 29504, 29513]

export function rideScenes(
  at: number,
  stop: number,
  mode: ExpressMode,
  story: RideStory | undefined,
): { readonly leave: number | undefined; readonly arrive: number | undefined } {
  const leave =
    at === 1
      ? 29506
      : at === 2
        ? stop === 4
          ? 29500
          : 29515
        : at === 3
          ? 29509
          : at === 4
            ? stop === 2
              ? 29503
              : 29516
            : at === 5
              ? 29512
              : undefined
  let arrive: number | undefined = ARRIVING[stop]
  if (story) {
    const all = (flags: readonly number[]) => flags.every((flag) => story.globals.has(flag))
    if (
      story.major === 10 &&
      story.minor === 8 &&
      story.step === 1 &&
      mode === 0 &&
      stop === 1 &&
      all([4, 5, 6, 7, 8, 9, 10])
    ) {
      arrive = 28800
    }
    if (
      story.major === 17 &&
      story.minor === 1 &&
      story.step === 1 &&
      mode === 1 &&
      stop === 3 &&
      all([21])
    ) {
      arrive = 29210
    }
  }
  return leave === undefined ? { leave: undefined, arrive } : { leave, arrive }
}
