/**
 * How far to move a character's animation on.
 *
 * Two things were wrong before this and they are the same thing twice: the
 * frame was advanced once per **simulation tick**. At 60Hz that runs a
 * nine-frame cycle nearly seven times a second, which is not a walk or an idle
 * but a shudder — and it did it whether or not the character was going
 * anywhere.
 */

/** The rate the DS plays an animation at, and the rate the scrubber uses. */
export const ANIMATION_FPS = 30

/** Simulation ticks a second. */
export const TICK_RATE = 60

/**
 * The distance one cycle of a walk covers.
 *
 * Set so that a character moving at full speed plays its cycle at
 * {@link ANIMATION_FPS}, which is what keeps walking and standing consistent
 * with each other rather than two unrelated rates.
 */
export function strideOf(frameCount: number, unitsPerTick: number): number {
  return (unitsPerTick * TICK_RATE * frameCount) / ANIMATION_FPS
}

/**
 * Frames to advance this update.
 *
 * Standing runs on time. **Walking runs on distance covered** — not on distance
 * asked for — so a character held against a wall stops stepping instead of
 * running on the spot, and one slowed by a slope slows with it.
 */
export function motionAdvance(options: {
  moving: boolean
  /** Simulation ticks that elapsed. */
  ticks: number
  /** Ground actually covered, in world units. */
  travelled: number
  frameCount: number
  /** The character's full walking speed, in world units per tick. */
  unitsPerTick: number
}): number {
  const { moving, ticks, travelled, frameCount, unitsPerTick } = options
  if (frameCount <= 0) return 0
  if (!moving) return (ticks * ANIMATION_FPS) / TICK_RATE
  const stride = strideOf(frameCount, unitsPerTick)
  if (stride <= 0) return 0
  return (travelled / stride) * frameCount
}
