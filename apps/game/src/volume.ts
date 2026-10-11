/**
 * **The music and effects volumes** — the Misc. menu's Volume Settings
 * (field-menu state `0x23`), read 11 October 2026 from the US build:
 *
 * - **Two levels, 1 to 5**, the music's and the effects'. The screen
 *   (`func_ov002_02160ce8`) draws each as five boxes between "Quiet" and
 *   "Loud", `str_tm` 4603 to 4609, the level's lit; Confirm, 4602, is its
 *   third row.
 * - **Left and right step a level and stop at the ends** (`func_ov002_02169bb0`:
 *   a level of 0 is put back to 1, one past 5 to 5), and **every step is
 *   heard at once** (`func_ov002_0215b268`): the music's through
 *   `func_0209ca70`, the effects' through `func_0205e9f4` — which sounds
 *   effect 1, the cursor's, when the effects' level changed.
 * - **Both start at 3** (`func_0209c2e0`'s and `func_0205e88c`'s set-up, at
 *   boot), and **the save keeps them**: its bytes `+0x2c58` (music) and
 *   `+0x2c59` (effects), handed back to the two setters as a game is loaded
 *   (`0x020a99b4`).
 * - **A level is a loudness by a table of five** (`data_020e8ec4` for the
 *   music's player groups 5–7, `data_020e7dd4` for the effects' 10–16; the
 *   same five on the cartridge): 0, 48/127, 85/127, 108/127, 1. So level 1 is
 *   silent.
 *
 * Not modelled: the music's own sequence volume is also scaled by
 * `(level − 1) / 4` (`func_0209c2e0` on its two handles, `+0xbc` and `+0xc0`),
 * which of the game's players the music is on is not read; here the music is
 * scaled by the table alone. **Ours**: a jingle is taken to be the music's.
 */

/** The levels, 1 to 5. */
export const VOLUME_LEAST = 1
export const VOLUME_MOST = 5
/** What both start at. */
export const VOLUME_DEFAULT = 3

/** A level's loudness, by `level − 1` — `data_020e8ec4`, `data_020e7dd4`. */
export const VOLUME_GAIN = [0, 48 / 127, 85 / 127, 108 / 127, 1] as const

/** The two levels. */
export interface Volumes {
  readonly music: number
  readonly effects: number
}

export const DEFAULT_VOLUMES: Volumes = { music: VOLUME_DEFAULT, effects: VOLUME_DEFAULT }

/** A level stepped by `by`, held between 1 and 5 as the screen holds it. */
export function stepVolume(level: number, by: number): number {
  return Math.min(VOLUME_MOST, Math.max(VOLUME_LEAST, level + by))
}

/** A level's loudness, 0 to 1. */
export function gainOf(level: number): number {
  return VOLUME_GAIN[stepVolume(level, 0) - 1] ?? 1
}

/** The screen's words, by number in `str_tm`. */
export const VOLUME_WORDS = {
  music: 4600,
  effects: 4601,
  confirm: 4602,
  quiet: 4603,
  /** "1" to "5": 4604 + level − 1. */
  levels: 4604,
  loud: 4609,
} as const
