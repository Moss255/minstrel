/**
 * What the Hexagon's poison marsh does to whoever walks in it — **ours, all of
 * it**: the game's rule is in its code, and no data table read says how much
 * or how often. Where the marsh is, is read — see `inMarsh` in
 * `@minstrel/world` and `isMarshTexture`, INFERRED.
 *
 * One HP for every half second walked in it, counted in the Hero's own moving
 * ticks so that standing still costs nothing, and never the last HP: nothing
 * here wipes a party out in the field.
 */

/** Moving ticks in the marsh for each toll: half a second at 60 a second. */
export const MARSH_TICKS = 30
/** HP taken each time. */
export const MARSH_TOLL = 1

/** Hit points after one toll: down by {@link MARSH_TOLL}, but not below 1. */
export function afterMarsh(hp: number): number {
  return Math.max(Math.min(hp, 1), hp - MARSH_TOLL)
}
