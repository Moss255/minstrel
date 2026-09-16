/**
 * How far to move a character's animation on.
 *
 * Every motion plays at the DS's own rate, on real time. A gait is no
 * exception: the cartridge's `run` is 13 frames, which at 30 frames a second is
 * 2.3 cycles — four and a half steps — a second, and that is the trot a let's
 * play shows the Hero keeping in the field and the village alike, however far
 * each step carries. An earlier version paced the walk by the ground covered
 * over a tuned stride; the rate is the game's own and the stride was not.
 */

/** The rate the DS plays an animation at, and the rate the scrubber uses. */
export const ANIMATION_FPS = 30

/** Simulation ticks a second. */
export const TICK_RATE = 60

/**
 * Frames to advance this update, at {@link ANIMATION_FPS} over `ticks` of
 * simulation time — but none for a character asked to move who covered no
 * ground, so one held against a wall stops stepping rather than running on
 * the spot. Ours, that last: the DS's own answer is not read.
 */
export function motionAdvance(options: {
  moving: boolean
  /** Simulation ticks that elapsed, which may be fractional. */
  ticks: number
  /** Ground actually covered, in world units. */
  travelled: number
}): number {
  const { moving, ticks, travelled } = options
  if (moving && travelled <= 0) return 0
  return (ticks * ANIMATION_FPS) / TICK_RATE
}
