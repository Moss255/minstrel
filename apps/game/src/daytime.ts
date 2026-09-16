/**
 * The time of day. **Ours, from the first let's play** (`evidence/`, not
 * kept), read at the top screen: the day at 2.1 and its village stay
 * daylight through twelve minutes of talking and shopping; at 2.2, after
 * Hugo at the gate, the field is daylight at 33:00, dusk by 35:20 and night
 * by 35:40 — a bodkin archer under a starry sky — and the village is dark at
 * 38:40; the fourth video's twenty minutes of field and Hexagon at 2.3 and
 * 2.4 never turn. So the turn is the story's evening, not a clock: at 2.2 the
 * time runs with the seconds spent in the field, and at every other stage it
 * is day. How the game itself keeps time is not read.
 */
export type TimeOfDay = 'day' | 'evening' | 'night'

/** Seconds in the field at 2.2 before dusk, and before night — from the video's 33:00, 35:20 and 35:40. */
export const EVENING_AFTER_S = 120
export const NIGHT_AFTER_S = 150

export function timeOfDay(
  stage: { readonly major: number; readonly minor: number } | undefined,
  fieldSeconds: number,
): TimeOfDay {
  if (!stage || stage.major !== 2 || stage.minor !== 2) return 'day'
  if (fieldSeconds >= NIGHT_AFTER_S) return 'night'
  if (fieldSeconds >= EVENING_AFTER_S) return 'evening'
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
 * Which kind of a field's zones roams at each time — see `FieldZone.kind`:
 * 0 and 1 come as a pair on fields, 2 is a field's third. INFERRED, thin: the
 * video's one bodkin archer, only after dark, is in `F01`'s zone 15, kind 2,
 * the only zone with one; that 1 is the evening is the pair's order and
 * nothing more. A map without the kind falls back to its first zone.
 */
export const ZONE_KIND_BY_TIME: Record<TimeOfDay, number> = { day: 0, evening: 1, night: 2 }

/** Whether the map's lit pieces should be its night ones — see `MapLighting`. */
export function lightingFor(time: TimeOfDay): 'day' | 'night' {
  return time === 'night' ? 'night' : 'day'
}
