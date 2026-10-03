/**
 * The time of day as this engine draws it: three looks, where the game's
 * clock has four phases — see `Clock` in the sim, which keeps the time. The
 * morning is drawn as the day (the scene's `808` was already read so); night
 * is the night phase alone, as the game asks it.
 *
 * This file was the stand-in for the clock — night only at 2.2, by seconds in
 * the field, set from a let's play — until the game's clock was read on 4
 * October 2026. The 2.2 evening now comes of the story's own records: the
 * Mayor's stops the clock at evening, Erinn's dinner (`177`) starts it at
 * morning, and 210 seconds of field bring the evening.
 */
export type TimeOfDay = 'day' | 'evening' | 'night'

/** The game's phase — night 0, morning 1, day 2, evening 3 — as one of the three looks. */
export function timeOfPhase(phase: number): TimeOfDay {
  if (phase === 0) return 'night'
  if (phase === 3) return 'evening'
  return 'day'
}

/**
 * The colour the view is multiplied by at each time: white by day; a warm
 * dimming at dusk; a dark blue by night, as the video's field goes — its
 * grass a fifth as red and a third as green as by day, and its sky starry.
 * Set by eye against those frames; ours.
 */
export const TINTS: Record<TimeOfDay, string> = {
  day: 'rgb(255 255 255)',
  evening: 'rgb(240 190 150)',
  night: 'rgb(85 100 150)',
}

/**
 * Which kind of a field's zones roams at each time — see `FieldZone.kind`.
 * Read 4 October 2026 with the clock: a zone's kind 0 roams when it is not
 * night, 1 only at night, and 2 at all hours, each within a region mask of
 * the ground (bits 13–20 of `encfld`'s word, INFERRED where it is stored).
 * **Ours**: one zone roams at a time here, so the day's and the evening's is
 * kind 0 and the night's kind 1; a kind-2 zone's own part of a field, and the
 * region masks, are not kept.
 */
export const ZONE_KIND_BY_TIME: Record<TimeOfDay, number> = { day: 0, evening: 0, night: 1 }

/** Whether the map's lit pieces should be its night ones — see `MapLighting`. */
export function lightingFor(time: TimeOfDay): 'day' | 'night' {
  return time === 'night' ? 'night' : 'day'
}
