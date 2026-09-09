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
 * Ground one gait cycle covers, in the character's own heights.
 *
 * **This is what sets the walking cadence**, because the cycle is advanced by
 * distance covered: a character moving at *n* heights a second steps through
 * `n / STRIDE_HEIGHTS` cycles a second, whatever the frame rate is.
 *
 * It is a length rather than a frame rate on purpose. An earlier version
 * derived the stride from {@link ANIMATION_FPS} and the character's speed,
 * which made the walk play at exactly 30fps *however fast the character moved*
 * — the speed appeared on both sides and cancelled. An eight-frame cycle at
 * 30fps is 3.75 cycles a second, or **7.5 steps a second** against the two a
 * person manages, and no change to the walking speed could shift it.
 *
 * **The animation's own stride is 0.402 heights per cycle**, measured from how
 * far its feet sweep front to back. Declaring more than that means the feet
 * slide to keep up with the ground. Declaring the measured value instead would
 * plant them exactly and demand **ten cycles a second** at any ordinary walking
 * pace, which is far worse than the sliding — so this is a compromise, tuned
 * rather than derived, like the walking speed it works with.
 *
 * It is deliberately the knob that is *not* the walking speed. Cadence is
 * ground over stride, so raising both together moves the character faster
 * without the legs churning: at three heights a second and a stride of one and
 * a half, the cycle stays at two a second — four steps — while the character
 * covers half as much ground again. The cost is paid in sliding, which goes
 * from 2.5x the animation's own sweep to 3.7x.
 */
export const STRIDE_HEIGHTS = 1.5

/**
 * The distance one cycle of a walk covers, for a character of a given height.
 *
 * Taking the height rather than a speed is the point: the stride is a property
 * of the figure, so the cadence follows from how fast it is asked to move.
 */
export function strideOf(characterHeight: number): number {
  return STRIDE_HEIGHTS * characterHeight
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
  /** Ground one whole cycle covers, from {@link strideOf}. */
  stride: number
}): number {
  const { moving, ticks, travelled, frameCount, stride } = options
  if (frameCount <= 0) return 0
  if (!moving) return (ticks * ANIMATION_FPS) / TICK_RATE
  if (stride <= 0) return 0
  return (travelled / stride) * frameCount
}
