import { inArea, type LadderEnd } from '@minstrel/game-formats'
import type { Animation } from '@minstrel/nitro-gfx'
import type { Climb, LadderEndWords, LadderMotion, MotionLength } from '@minstrel/sim'

/**
 * **Ladders and vines in the field** — what the climb in `@minstrel/sim`
 * (`ladder.ts`) needs from the map and the figure, and what it hands back.
 * The game's reading is `docs/readings/T16-getting-around.md`.
 *
 * The climb works in the file's own units as `fx32` words; the field works in
 * the world's, the file's times its scale. These convert between the two.
 */

/** A number of the file's own units as a word. */
const word = (n: number) => Math.round(n * 4096)

/** A map's ladder ends as the climb wants them: words, the facing × 4096. */
export function endsInWords(ends: readonly LadderEnd[]): LadderEndWords[] {
  return ends.map((end) => ({
    id: end.id,
    partner: end.partner,
    top: end.top,
    x: word(end.x),
    y: word(end.y),
    z: word(end.z),
    facing: Math.trunc(end.facing * 4096),
    leaves: end.exit !== undefined,
  }))
}

/**
 * Whether a point in the file's units stands in an end's box — `func_02094b9c`,
 * the box test an area's is. `words` are `endsInWords(ends)`, in their order.
 */
export function boxTest(
  ends: readonly LadderEnd[],
  words: readonly LadderEndWords[],
  x: number,
  y: number,
  z: number,
): (end: LadderEndWords) => boolean {
  return (end) => {
    const read = ends[words.indexOf(end)]
    return read !== undefined && inArea(read.area, x, y, z)
  }
}

/**
 * A climbing motion's length: its frames, and its `.bcfg` speed as a word —
 * INFERRED that the record's speed is held as `trunc(speed × 4096)`.
 */
export function motionLengths(
  motions: ReadonlyMap<string, Animation>,
  speeds: ReadonlyMap<string, number> | undefined,
): (motion: LadderMotion) => MotionLength | undefined {
  return (motion) => {
    const read = motions.get(motion)
    const speed = speeds?.get(motion)
    if (!read || speed === undefined || read.frameCount <= 0) return undefined
    return { frames: read.frameCount, speed: Math.trunc(speed * 4096) }
  }
}

/** The pose a climb puts the Hero in: its motion at its time, when it is one of the three. */
export function climbPose(
  climb: Climb | undefined,
  motions: ReadonlyMap<string, Animation>,
): { readonly motion: Animation; readonly frame: number } | undefined {
  if (!climb || climb.motion === 'run') return undefined
  const motion = motions.get(climb.motion)
  if (!motion) return undefined
  return { motion, frame: Math.min(Math.floor(climb.time / 4096), motion.frameCount - 1) }
}
