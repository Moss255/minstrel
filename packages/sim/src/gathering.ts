/**
 * **Gathering spots** — where ingredients lie on a field and come back.
 * Translated from the game's own code (US ARM9, read 6 October 2026; the
 * whole reading is `docs/readings/T13-gathering.md`):
 *
 * - **What is kept**: a word a spot, 100 of them at `GameState+0x5cdc`, laid
 *   out as {@link WORD}, and the save's variant at `+0x5cda`
 *   (`func_0208e894`, `func_020120d4`).
 * - **When play begins** (`func_0208ea10`, from the field's start): a new
 *   game draws its variant and sets every spot up empty, its refill due; a
 *   game continued empties every spot with anything lying and puts its
 *   refill a tenth of its minutes off (`func_0208ec04`). See {@link startPlay}.
 * - **Every frame of the field** (`func_0208ec78`): a minute of play is
 *   counted, and then a sweep visits one spot a frame — refilling those due
 *   and taking a minute off the rest that are not full. See {@link tick}.
 * - **Picking up** (ov017 `func_ov017_021986fc`): one place's item off, and
 *   the spot's minutes start again. See {@link pickUp}.
 *
 * Whole numbers only. **Ours**: the draws are the caller's, not the game's
 * `rand()`, whose seeding is not read; and a minute is counted in this
 * engine's 60 Hz ticks, 3,600 of them, where the game sums each frame's
 * milliseconds to 60 seconds.
 */

/** A spot's word, as the game packs it (`func_0208e894`, `func_0208ec78`). */
export const WORD = {
  /** Bits 0–8: minutes to the next refill. */
  minutesLeft: { shift: 0, width: 9 },
  /** Bits 9–12: the most it holds. */
  most: { shift: 9, width: 4 },
  /** Bits 13–16: the fewest an empty one refills with. */
  fewest: { shift: 13, width: 4 },
  /** Bits 17–24: which of its places have an item lying. */
  lying: { shift: 17, width: 8 },
  /** Bits 25–28: minutes between refills, ÷ 30. */
  every: { shift: 25, width: 4 },
  /** Bits 29–30: when it is there — 1 always, 2 with flag `0x798`, 3 with `0x796`. */
  when: { shift: 29, width: 2 },
  /** Bit 31: set up. */
  setUp: { shift: 31, width: 1 },
} as const

type Field = (typeof WORD)[keyof typeof WORD]

/** One field of a spot's word. */
export function wordField(word: number, field: Field): number {
  return (word >>> field.shift) & ((1 << field.width) - 1)
}

/** A spot's word with one field changed. */
export function withField(word: number, field: Field, value: number): number {
  const mask = ((1 << field.width) - 1) << field.shift
  return ((word & ~mask) | ((value << field.shift) & mask)) >>> 0
}

/** The spots the game keeps: ids 0 to 99 (`0x64`, `func_0208ec04`). */
export const SPOT_COUNT = 100
/** The save's variant before one is drawn (`func_0208ea10` tests for it). */
export const NO_VARIANT = 8
/** The Fountain's spots, which the sweep fills by the canvassed guests (`func_0208f048`). */
export const FOUNTAIN_FIRST = 98
export const FOUNTAIN_SECOND = 99
/** A Fountain spot's places. */
const FOUNTAIN_PLACES = 7
/** The flags a spot's `when` asks for: 2 `0x798`, 3 `0x796` (`0x0208f03c`, `0x0208f040`). */
export const WHEN_FLAG: ReadonlyMap<number, number> = new Map([
  [2, 0x798],
  [3, 0x796],
])
/** The flag picking from a spot sets: `0xc12 + id` (`0x021989c8`). Nothing found reads it. */
export const PICKED_FLAG = 0xc12
/** A minute of play, in this engine's 60 Hz ticks — the game counts 60 seconds (`0x42700000`). */
export const MINUTE_TICKS = 60 * 60

/** What the game keeps of the gathering. */
export interface Gathering {
  /** The save's variant, 0–7, or {@link NO_VARIANT} before the first start. */
  variant: number
  /** A word a spot, by id — see {@link WORD}. */
  readonly words: number[]
  /** Not saved: the ticks of the minute being counted, and the sweep's next spot. */
  ticks: number
  cursor: number
}

/** The game's numbers before anything has run: no variant, every spot not set up. */
export function newGathering(): Gathering {
  return { variant: NO_VARIANT, words: new Array(SPOT_COUNT).fill(0), ticks: 0, cursor: 0 }
}

/** The caller's draws: a whole number from 0 to `n − 1`, as the game's `rand() % n`. */
export interface Draws {
  below(n: number): number
}

/** How often a spot refills and with how many — its own, or its `fldbias.bin` row's. */
export interface Timing {
  readonly minutes: number
  readonly fewest: number
  readonly most: number
}

/** A spot as the files give it: enough to set it up. */
export interface SpotSetup {
  readonly id: number
  /** Value 2 — see {@link WORD}'s `when`. */
  readonly when: number
  /** Value 4: 8 for its own timing, 0–7 for that row of `fldbias.bin`. */
  readonly timing: number
  readonly own: Timing
}

/** A spot's timing in a game of a variant: its own, or its row's at the variant (`func_0208e894`). */
export function timingOf(
  spot: SpotSetup,
  bias: ReadonlyMap<number, readonly Timing[]>,
  variant: number,
): Timing {
  if (spot.timing === 8) return spot.own
  return bias.get(spot.timing)?.[variant] ?? { minutes: 0, fewest: 0, most: 0 }
}

/** A spot's word, set up and empty, its refill due (`func_0208e894`). */
function setUpWord(when: number, timing: Timing): number {
  let word = withField(0, WORD.setUp, 1)
  word = withField(word, WORD.when, when)
  word = withField(word, WORD.most, timing.most)
  word = withField(word, WORD.fewest, timing.fewest)
  word = withField(word, WORD.every, Math.trunc(timing.minutes / 30))
  return word
}

/**
 * **Play begins** — `func_0208ea10`, run from the field's start in a game of
 * one's own. With no variant yet: one is drawn, `rand() % 8`, and every spot
 * of the fields is set up empty with its refill due, and the Fountain's two
 * with most 1, fewest 1, every 60 minutes, there always
 * (`0x0208eb98`–`0x0208ebd8`). Otherwise (`func_0208ec04`): every spot set up
 * with anything lying is emptied and its refill put a tenth of its minutes off
 * — its minutes ÷ 30, times 3. The sweep starts at once: the minute's count is
 * full (`func_0208e9f4`'s 60.0) and its place is spot 0.
 */
export function startPlay(
  state: Gathering,
  spots: readonly SpotSetup[],
  bias: ReadonlyMap<number, readonly Timing[]>,
  draws: Draws,
): void {
  state.cursor = 0
  state.ticks = MINUTE_TICKS
  if (state.variant === NO_VARIANT) {
    state.variant = draws.below(8)
    for (const spot of spots) {
      if (spot.id < 0 || spot.id >= SPOT_COUNT) continue
      state.words[spot.id] = setUpWord(spot.when, timingOf(spot, bias, state.variant))
    }
    for (const id of [FOUNTAIN_FIRST, FOUNTAIN_SECOND])
      state.words[id] = setUpWord(1, { minutes: 60, fewest: 1, most: 1 })
    return
  }
  for (let id = 0; id < SPOT_COUNT; id++) {
    const word = state.words[id] ?? 0
    if (!wordField(word, WORD.setUp) || !wordField(word, WORD.lying)) continue
    const emptied = withField(word, WORD.lying, 0)
    state.words[id] = withField(emptied, WORD.minutesLeft, wordField(word, WORD.every) * 3)
  }
}

/** How many of a spot's places have an item lying. */
export function lyingCount(word: number): number {
  let n = 0
  for (let bits = wordField(word, WORD.lying); bits; bits >>>= 1) n += bits & 1
  return n
}

/** Whether a spot's place has an item lying. */
export function isLying(word: number, place: number): boolean {
  return ((wordField(word, WORD.lying) >>> place) & 1) === 1
}

/** A spot's minutes, as its word keeps them: every ÷ 30, times 30 (`0x0208efa0`). */
function fullMinutes(word: number): number {
  return wordField(word, WORD.every) * 30
}

/**
 * **The Fountain's fill** (`func_0208f048`): the count is the guests
 * canvassed ÷ 100 + 4, at most 14 — 7 to spot 98, the rest to 99 — places
 * from the first on. Called for spot 98's turn in the sweep; 99's does nothing.
 */
function fillFountain(state: Gathering, id: number, guests: number): void {
  if (id !== FOUNTAIN_FIRST) return
  let count = Math.min(Math.trunc(guests / 100) + 4, 14)
  let over = count - FOUNTAIN_PLACES
  let placed = 0
  let second = state.words[FOUNTAIN_SECOND] ?? 0
  for (; over > 0; over--, placed++)
    second = withField(second, WORD.lying, wordField(second, WORD.lying) | (1 << placed))
  state.words[FOUNTAIN_SECOND] = second
  if (placed > 0) {
    placed = 0
    count = FOUNTAIN_PLACES
  }
  let first = state.words[FOUNTAIN_FIRST] ?? 0
  for (; count > 0; count--, placed++)
    first = withField(first, WORD.lying, wordField(first, WORD.lying) | (1 << placed))
  state.words[FOUNTAIN_FIRST] = first
}

/** One spot's turn in the sweep (`0x0208ed80`–`0x0208f010`). */
function visit(
  state: Gathering,
  id: number,
  flags: ReadonlySet<number>,
  draws: Draws,
  guests: number,
): void {
  let word = state.words[id] ?? 0
  if (!wordField(word, WORD.setUp)) return
  const asks = WHEN_FLAG.get(wordField(word, WORD.when))
  if (asks !== undefined && !flags.has(asks)) return
  let lying = lyingCount(word)
  const most = wordField(word, WORD.most)
  if (wordField(word, WORD.minutesLeft) === 0) {
    let adding = 0
    if (lying === 0) {
      adding = draws.below(most + 1)
      const fewest = wordField(word, WORD.fewest)
      if (adding < fewest) adding = fewest
    } else if (lying < most) {
      adding = draws.below(most - lying + 1)
    }
    if (id < FOUNTAIN_FIRST) {
      lying += adding
      let place = most > 0 ? draws.below(most) : 0
      while (adding > 0) {
        const bits = wordField(word, WORD.lying)
        if (((bits >>> place) & 1) === 0) {
          word = withField(word, WORD.lying, bits | (1 << place))
          adding--
        }
        place++
        if (place >= most) place = 0
      }
      state.words[id] = word
    } else {
      state.words[id] = word
      fillFountain(state, id, guests)
      word = state.words[id] ?? 0
    }
    word = withField(word, WORD.minutesLeft, fullMinutes(word))
  }
  // A full spot waits; anything else, and the Fountain's always, loses a minute.
  if (lying !== most || id >= FOUNTAIN_FIRST) {
    word = withField(word, WORD.minutesLeft, (wordField(word, WORD.minutesLeft) - 1) & 0x1ff)
  }
  state.words[id] = word
}

/**
 * **One tick of the field** (`func_0208ec78`): the minute counts on, and
 * while a sweep is going — from the minute's end until spot 99 has had its
 * turn — one spot has its turn a tick. `flags` is the game-wide bank, for a
 * spot that waits on one; `guests`, the canvassed guests the Fountain counts
 * (0 in a game played alone).
 */
export function tick(state: Gathering, flags: ReadonlySet<number>, draws: Draws, guests = 0): void {
  state.ticks++
  if (state.ticks < MINUTE_TICKS && state.cursor === 0) return
  if (state.ticks >= MINUTE_TICKS) state.ticks = 0
  visit(state, state.cursor, flags, draws, guests)
  state.cursor = (state.cursor + 1) % SPOT_COUNT
}

/**
 * **An item picked up** at a spot's place (ov017 `0x0219893c`–`0x021989b8`):
 * the place is emptied and the spot's minutes start again. False when nothing
 * lies there. The caller sets {@link PICKED_FLAG} `+ id` and gives the item.
 */
export function pickUp(state: Gathering, id: number, place: number): boolean {
  const word = state.words[id] ?? 0
  if (!isLying(word, place)) return false
  const emptied = withField(word, WORD.lying, wordField(word, WORD.lying) & ~(1 << place))
  state.words[id] = withField(emptied, WORD.minutesLeft, fullMinutes(word))
  return true
}

/**
 * **What the Fountain gives** (`func_0208e7d0`): one of the variant's row, of
 * the first 8 or, from story 19 on, all 16 (`func_0201079c` ≥ `0x13`).
 */
export function fountainItem(row: readonly number[], storyMajor: number, draws: Draws): number {
  const from = storyMajor >= 0x13 ? 16 : 8
  return row[draws.below(from)] ?? 0
}
