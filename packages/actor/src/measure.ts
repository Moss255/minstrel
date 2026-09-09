import { type Animation, loopFrames, measureBounds } from '@minstrel/nitro-gfx'
import { type Figure, type FigurePiece, poseFigure } from './figure.ts'

/**
 * How many frames of a motion to play before looping, asked once and kept.
 *
 * Nearly half the cartridge's animations end on a repeat of their first frame.
 * Playing all of them shows that pose twice running, which on the nine-frame
 * walk at a normal pace is a hitch several times a second.
 */
export class Measurements {
  private readonly loops = new Map<Animation, number>()
  private readonly floors = new Map<Animation | undefined, number>()

  loopLength(motion: Animation): number {
    const known = this.loops.get(motion)
    if (known !== undefined) return known
    const frames = loopFrames(motion)
    this.loops.set(motion, frames)
    return frames
  }

  /**
   * How far a motion holds the figure off its own origin, over the whole cycle.
   *
   * A character is placed by putting its model's origin at its feet, and the
   * motions do not keep it there — `walk` reaches down to −1.05 in model units
   * while `stand` never comes below 0.79 — so the offset has to be measured
   * rather than assumed.
   *
   * **Once per motion, not once per frame.** The lowest point moves through a
   * cycle, and it should: over the walk it runs −1.05, −0.38, −0.16, −0.22,
   * which is a foot leaving the ground and coming back. Measuring each frame
   * and subtracting it pins that foot down and translates the whole body
   * instead — the figure jerks 0.90 units, 4% of its height, several times a
   * second, and what you see is the head bobbing.
   *
   * Taken over the cycle, the offset is the planted foot at its lowest and the
   * rest of the motion keeps its shape: the walk rises 4% of the figure's
   * height between steps, and the idle holds it still to within 0.0%.
   *
   * That second number depends on the idle being an *in-place* motion, which is
   * not something a motion's name guarantees — see `chooseFigure`.
   */
  floor(figure: Figure, pieces: readonly FigurePiece[], motion: Animation | undefined): number {
    const known = this.floors.get(motion)
    if (known !== undefined) return known
    let lowest = Number.POSITIVE_INFINITY
    const frames = motion ? this.loopLength(motion) : 1
    for (let frame = 0; frame < frames; frame++) {
      const drawn = poseFigure(figure, pieces, motion, frame).map((p) => p.posed)
      if (drawn.length > 0) lowest = Math.min(lowest, measureBounds(drawn).minY)
    }
    if (!Number.isFinite(lowest)) lowest = 0
    this.floors.set(motion, lowest)
    return lowest
  }

  /** Forget everything measured. Call when the figure changes. */
  clear(): void {
    this.loops.clear()
    this.floors.clear()
  }
}

/**
 * How much to shrink the figure to stand the height the controller assumes.
 *
 * Deriving the scale rather than picking a number means the model and the
 * collision capsule agree by construction.
 *
 * **Measure a pose the character is drawn in, not the bind pose.** The bind
 * pose is a T-pose: arms straight out, 9.2 units across and only 7.7 tall. Its
 * height is the height of a figure holding itself flat, not the height of the
 * figure — once posed it stands 10.0 tall. Scaling by the T-pose and drawing
 * the posed figure made the character 30% larger than the capsule walking it,
 * and it grew as it set off, because standing fell back to the bind pose.
 *
 * The **walk cycle** is what to measure, not the tallest pose of every motion:
 * reaching up a ladder or bending to pick something up are legitimately taller
 * and shorter than standing, and sizing by the extreme of those would leave the
 * character walking around too small. Its frames vary by under 2%.
 */
export function figureScale(
  figure: Figure,
  pieces: readonly FigurePiece[],
  measurements: Measurements,
  wantedHeight: number,
): number {
  if (pieces.length === 0) return 1

  const heightAt = (motion: Animation | undefined, frame: number): number => {
    const drawn = poseFigure(figure, pieces, motion, frame).map((p) => p.posed)
    if (drawn.length === 0) return 0
    const bounds = measureBounds(drawn)
    return bounds.maxY - bounds.minY
  }

  const upright =
    figure.motions.get('walk') ??
    figure.motions.get('stand') ??
    figure.motions.values().next().value
  let tallest = 0
  if (upright) {
    for (let frame = 0; frame < measurements.loopLength(upright); frame++) {
      tallest = Math.max(tallest, heightAt(upright, frame))
    }
  }
  // No motion read: the bind pose is all there is, and it is better than
  // refusing to draw the character.
  if (tallest <= 0) tallest = heightAt(undefined, 0)
  return wantedHeight / Math.max(tallest, 0.001)
}
