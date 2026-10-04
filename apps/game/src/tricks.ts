/**
 * **A party trick, performed** — read 4 October 2026 from the USA build's
 * ARM9 and overlay 17 (`func_02037d88`, the controlled character's update;
 * `func_02052e44` and `func_02052f44`, the starts; `func_02053634`, the
 * performance). The European cartridge's files.
 *
 * - **Seven slots**, at `GameState+0x2a04+0x2c8d`: 0 Up, 1 Left, 2 Right, 3 to
 *   6 Down 1 to 4, each a trick's number, 1 to 31 (`func_0203970c`).
 * - **B pressed** opens a cross of the four places' names (`str_sgs`); **with B
 *   held**, a direction newly pressed — Up, Right, Left, Down in that order of
 *   testing — starts that place's trick; **Down plays its four in order**, the
 *   empty ones left out. Releasing B closes the cross.
 * - **Only the controlled character performs**, where they stand and as they
 *   face, in their sex's `data/chara/sg<nn><m|w>.chr` (`func_0205308c`).
 * - **What plays** is what the pack's `.bcfg` names: `sigusa` once, or `in`
 *   once, `loop`, `out` once (`0x020536d8`). The motion **replaces** the one
 *   before, with no blend, at its `.bcfg` speed. A trick of three motions
 *   alone — Sit, Recline and the dances — holds its `loop` **until A, B, X or
 *   Y is pressed**; in a sequence its loop plays once.
 * - A sound at each trick's start ({@link TRICK_SOUNDS}), and for six a bubble
 *   over the head ({@link TRICK_BUBBLES}).
 * - **When the last ends**, kind 19 runs once with all the tricks performed,
 *   and the character stands again.
 *
 * Nothing sets a story flag. Two record counters go up once a start (`GameState
 * +0x7540`), not kept here.
 */

/** The slots' places: Up, Left, Right, Down 1 to 4 (`func_02037d88`). */
export const TRICK_SLOT = { up: 0, left: 1, right: 2, down: [3, 4, 5, 6] } as const
export const TRICK_SLOT_COUNT = 7

/** What a direction starts: one trick, or Down's four in order, the empty left out (`func_02052f44`). */
export function tricksFor(
  slots: readonly (number | undefined)[],
  direction: 'up' | 'left' | 'right' | 'down',
): number[] {
  const places = direction === 'down' ? TRICK_SLOT.down : [TRICK_SLOT[direction]]
  return places.flatMap((place) => {
    const trick = slots[place]
    return trick !== undefined && trick >= 1 && trick <= 32 ? [trick] : []
  })
}

/** The pack a trick is performed from (`func_0205308c`, `"data/chara/sg%02d%c.chr"`, `"mw"[sex]`). */
export function trickPack(trick: number, female: boolean): string {
  return `chara/sg${String(trick).padStart(2, '0')}${female ? 'w' : 'm'}.chr`
}

/**
 * Each trick's sound, at its start — sequence n of archive 100, `se_norm.sdat`
 * (`data_020e7c94`). Weird Dance's (78) is kept in a handle and stopped when
 * its `out` ends.
 */
export const TRICK_SOUNDS: ReadonlyMap<number, number> = new Map([
  [2, 90],
  [6, 72],
  [7, 73],
  [8, 74],
  [9, 75],
  [12, 71],
  [13, 71],
  [14, 71],
  [15, 6],
  [16, 28],
  [18, 76],
  [23, 77],
  [25, 78],
  [26, 79],
  [27, 80],
  [28, 81],
  [30, 70],
  [31, 82],
])

/** The sound archive a trick's sound is in (`func_0205ea20`: 100, `data/sound/se_norm.sdat`). */
export const TRICK_SOUND_ARCHIVE = 100

/**
 * The tricks with a bubble over the head, from `data/ani/sg.gp2`
 * (`0x02053114`): Hello!, Thanks! and Goodbye! in the language's own words,
 * `sg%02d_<lang>.spr`; Eek!, Hmm... and Inspiration as pictures, `sg%02d.spr`.
 */
export const TRICK_BUBBLES: ReadonlyMap<number, 'words' | 'picture'> = new Map([
  [12, 'words'],
  [13, 'words'],
  [14, 'words'],
  [15, 'picture'],
  [16, 'picture'],
  [30, 'picture'],
])

/** Where a bubble's sprite sits from the head's projected point: (−12, −12), (−24, −18) for the words, (−8, −8) for Inspiration. */
export function bubbleOffset(trick: number): { readonly x: number; readonly y: number } {
  if (trick >= 12 && trick <= 14) return { x: -24, y: -18 }
  if (trick === 30) return { x: -8, y: -8 }
  return { x: -12, y: -12 }
}

/** How a trick's pack plays: `sigusa` once, or `in`, `loop`, `out` — by its `.bcfg`'s names. */
export type TrickShape = 'once' | 'inLoopOut'

export function trickShape(names: readonly string[]): TrickShape | undefined {
  if (names.includes('sigusa')) return 'once'
  if (names.includes('in')) return 'inLoopOut'
  return undefined
}

export type TrickPhase = 'sigusa' | 'in' | 'loop' | 'out'

/** A performance under way: the tricks, the one playing, its phase and when it began. */
export interface Performance {
  readonly tricks: readonly number[]
  readonly index: number
  readonly phase: TrickPhase
  /** When the phase began, ms. */
  readonly since: number
}

/** A trick's pack, as the performance needs it: its shape, and each motion's length once through, ms. */
export interface TrickMotions {
  readonly shape: TrickShape
  readonly ms: (phase: TrickPhase) => number
}

/** A performance begun: the first trick's first motion. */
export function startPerformance(
  tricks: readonly number[],
  now: number,
  motionsOf: (trick: number) => TrickMotions | undefined,
): Performance | undefined {
  const first = tricks[0]
  const motions = first === undefined ? undefined : motionsOf(first)
  if (!motions) return undefined
  return { tricks, index: 0, phase: motions.shape === 'once' ? 'sigusa' : 'in', since: now }
}

/**
 * The performance a moment on, or `'done'`. `released` is A, B, X or Y newly
 * pressed, which ends a lone trick's held loop (`func_02012444(keys, 0xc03)`).
 * A trick whose pack will not read is passed over.
 */
export function stepPerformance(
  p: Performance,
  now: number,
  released: boolean,
  motionsOf: (trick: number) => TrickMotions | undefined,
): Performance | 'done' {
  const trick = p.tricks[p.index]
  const motions = trick === undefined ? undefined : motionsOf(trick)
  const nextTrick = (): Performance | 'done' => {
    for (let index = p.index + 1; index < p.tricks.length; index++) {
      const next = motionsOf(p.tricks[index] as number)
      if (next) return { ...p, index, phase: next.shape === 'once' ? 'sigusa' : 'in', since: now }
    }
    return 'done'
  }
  if (!motions) return nextTrick()
  const over = now - p.since >= motions.ms(p.phase)
  switch (p.phase) {
    case 'sigusa':
    case 'out':
      return over ? nextTrick() : p
    case 'in':
      return over ? { ...p, phase: 'loop', since: now } : p
    case 'loop':
      // Alone, held until a button is pressed; in a sequence, once through.
      if (p.tricks.length === 1) return released ? { ...p, phase: 'out', since: now } : p
      return over ? { ...p, phase: 'out', since: now } : p
  }
}

/** Whether the phase's motion goes round — a lone trick's held loop. */
export function phaseLoops(p: Performance): boolean {
  return p.phase === 'loop' && p.tricks.length === 1
}
