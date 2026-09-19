/**
 * The player's settings, kept in the browser under {@link SETTINGS_KEY}: for
 * now the text speed. The game's own options had a message speed too; its
 * steps and rates are not read, so these four are ours.
 */
export const TEXT_SPEEDS = ['slow', 'normal', 'fast', 'instant'] as const
export type TextSpeed = (typeof TEXT_SPEEDS)[number]

/** Characters a second at each speed; `instant` shows the page whole. */
export const CHARACTERS_PER_SECOND: Record<TextSpeed, number> = {
  slow: 20,
  normal: 45,
  fast: 90,
  instant: Number.POSITIVE_INFINITY,
}

export interface Settings {
  readonly textSpeed: TextSpeed
}

export const DEFAULT_SETTINGS: Settings = { textSpeed: 'normal' }

export const SETTINGS_KEY = 'minstrel.settings'

/** The settings out of their saved JSON: whatever is missing or unknown is the default. */
export function settingsFrom(json: string | null | undefined): Settings {
  if (!json) return DEFAULT_SETTINGS
  try {
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SETTINGS
    const speed = (parsed as { textSpeed?: unknown }).textSpeed
    return {
      textSpeed: (TEXT_SPEEDS as readonly unknown[]).includes(speed)
        ? (speed as TextSpeed)
        : DEFAULT_SETTINGS.textSpeed,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function settingsToJson(settings: Settings): string {
  return JSON.stringify(settings)
}

/** The next speed along, round again from the last. */
export function nextTextSpeed(speed: TextSpeed, by = 1): TextSpeed {
  const i = TEXT_SPEEDS.indexOf(speed)
  const n = TEXT_SPEEDS.length
  return TEXT_SPEEDS[(((i + by) % n) + n) % n] as TextSpeed
}

/**
 * How many characters of a page show `elapsedMs` after it came up: the whole
 * of it at `instant`, or the speed's worth. The count is the game's message
 * box's job — ours, in characters rather than the DS's glyphs.
 *
 * **Never fewer than none, and that is not a formality.** A page raised inside
 * a frame is stamped with `performance.now()`, which is later than the frame's
 * own timestamp, so the first reveal is asked about a time before the page
 * existed. Unclamped, the count came out at −1, and `text.slice(0, -1)` is the
 * whole page but its last character: every scene's message flashed out whole
 * for one frame and then typed itself from the start.
 */
export function revealedCharacters(speed: TextSpeed, elapsedMs: number, length: number): number {
  const rate = CHARACTERS_PER_SECOND[speed]
  if (!Number.isFinite(rate)) return length
  return Math.max(0, Math.min(length, Math.floor((elapsedMs / 1000) * rate)))
}
