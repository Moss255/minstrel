/**
 * Taking the roof off.
 *
 * The game does not solve a building standing between the camera and the party
 * by moving the camera. It removes the building: roofs come off as you walk in,
 * and the near-side walls of a room are simply not drawn. Pulling the camera
 * forward instead — which is what a chase camera usually does — gives a very
 * different picture, because indoors there is nowhere to pull it to.
 *
 * The test below is deliberately about *geometry between two points*, not about
 * what a roof is. Nothing on the cartridge marks a piece as a roof, and a rule
 * that guessed from a name or a height would be inventing one.
 */

/** An axis-aligned box in world units. */
export interface Box {
  readonly minX: number
  readonly minY: number
  readonly minZ: number
  readonly maxX: number
  readonly maxY: number
  readonly maxZ: number
}

type Vec3 = readonly [number, number, number]

/**
 * How far along the segment from `from` to `to` a box is entered and left, or
 * `undefined` if the segment misses it. The usual slab test, clamped to the
 * segment so a box behind the eye or beyond the focus does not count.
 */
function span(box: Box, from: Vec3, to: Vec3): { enter: number; leave: number } | undefined {
  const low = [box.minX, box.minY, box.minZ]
  const high = [box.maxX, box.maxY, box.maxZ]
  let enter = 0
  let leave = 1
  for (let axis = 0; axis < 3; axis++) {
    const start = from[axis] as number
    const delta = (to[axis] as number) - start
    const lo = low[axis] as number
    const hi = high[axis] as number
    if (Math.abs(delta) < 1e-9) {
      // Parallel to this pair of planes: either inside them for the whole
      // segment, or outside them for all of it.
      if (start < lo || start > hi) return undefined
      continue
    }
    const first = (lo - start) / delta
    const second = (hi - start) / delta
    enter = Math.max(enter, Math.min(first, second))
    leave = Math.min(leave, Math.max(first, second))
    if (enter > leave) return undefined
  }
  return { enter, leave }
}

/**
 * Whether a piece stands between the camera and what it is looking at.
 *
 * The discriminating condition is that the segment **leaves** the box again
 * before it reaches the focus. A roof passes that: the line enters it, comes
 * out underneath, and then has open air down to the character. The ground the
 * character is standing on does not, because the segment ends inside its box —
 * which is what stops this rule from deleting the terrain the moment the camera
 * looks across a hill.
 *
 * `clearance` is how much open space there has to be past the piece, in world
 * units. Without it a wall the character is pressed against would flicker as
 * the exit point crossed the focus.
 */
export function occludes(box: Box, eye: Vec3, focus: Vec3, clearance = 0.25): boolean {
  const hit = span(box, eye, focus)
  if (!hit) return false
  const length = Math.hypot(focus[0] - eye[0], focus[1] - eye[1], focus[2] - eye[2])
  if (length < 1e-6) return false
  return hit.leave < 1 - clearance / length
}

/** The indices of the pieces standing in the way, given each piece's bounds. */
export function occluders(
  boxes: readonly Box[],
  eye: Vec3,
  focus: Vec3,
  clearance = 0.25,
): number[] {
  const hidden: number[] = []
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i]
    if (box && occludes(box, eye, focus, clearance)) hidden.push(i)
  }
  return hidden
}

/**
 * Whether a point has something over its head.
 *
 * This is what decides indoors from outdoors, and it is worth doing properly.
 * A map's footprint is the obvious proxy — a room is smaller than a village —
 * but map sizes are a continuum, so any threshold cuts through the middle of it
 * and misclassifies both ways. Whether there is a roof above you is the thing
 * the camera actually cares about, and it is a fact about the geometry rather
 * than a number someone picked.
 *
 * A piece counts only if its *underside* is above the head: terrain whose box
 * reaches up into a hill still has its floor below the feet, so the ground
 * never reads as a ceiling.
 */
export function covered(boxes: readonly Box[], at: Vec3, headroom: number): boolean {
  const ceiling = (at[1] as number) + headroom
  for (const box of boxes) {
    if (box.minY < ceiling) continue
    if ((at[0] as number) < box.minX || (at[0] as number) > box.maxX) continue
    if ((at[2] as number) < box.minZ || (at[2] as number) > box.maxZ) continue
    return true
  }
  return false
}
