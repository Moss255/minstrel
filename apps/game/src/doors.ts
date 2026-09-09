import { toFloat } from '@minstrel/fixed'
import type { MapTransition } from '@minstrel/game-formats'
import { PERSON } from '@minstrel/sim'

/**
 * Walking into a doorway, and coming out of one somewhere else.
 *
 * The doorways themselves are read from the map's `.bmbl` — see that package's
 * `FORMAT.md`. This is only the part that decides when you are standing in one.
 *
 * Positions here are floats, as the indoor and occlusion tests beside it are.
 * Nothing in this file reaches the fixed-point simulation: it reads where the
 * character ended up and answers a yes or no. The arrival it hands back is
 * converted at the boundary, by the caller that puts the character down.
 */

/**
 * How much of the character's body counts as being in the doorway.
 *
 * A person is not a point, and a doorway you have to hit dead centre reads as
 * broken. This is their radius, so the doorway opens as they touch it — taken
 * from the character rather than written out again, because it was written out
 * as 0.04 and then the character got thinner.
 */
export const DOOR_REACH = toFloat(PERSON.radius)

/**
 * Whether a point stands inside a doorway's volume.
 *
 * The volume is a box about `x, y, z`, turned by `angle` about the vertical.
 * **`width` and `depth` are the whole size of it, not half**, so the box
 * reaches half of each to either side.
 *
 * That is measured against the doorway models the triggers guard, which is the
 * one reference that does not favour a bigger answer. Every one of the
 * village's nine doorway models is **0.193 tall** and every one of its triggers
 * stores **0.250** — a trigger 1.3x the height of its own door, which is what a
 * trigger should be. Read as half, it would stand 0.50 tall: two and a half
 * doors, and nearly three times the character's height.
 *
 * The inn says the same from the inside: its door model is 0.179 tall and its
 * trigger stores 0.188, a ratio of 1.05.
 *
 * An earlier version read these as half-extents on the strength of a count of
 * how often a doorway contains the point you arrive at coming back through it —
 * 45.2% against 8.0%. That test cannot decide this: **a box twice as big
 * contains more points whatever the truth is**, so it favours the larger
 * reading by construction. It also asked the wrong question, because you arrive
 * *in front of* a door rather than inside it.
 *
 * The height is not tested. A doorway's stored height is 2 raw units on almost
 * all of them — a nominal doorway height rather than a measurement — and
 * testing it would shut out anyone standing on a step.
 */
export function inDoorway(door: MapTransition, x: number, z: number, reach = DOOR_REACH): boolean {
  const cos = Math.cos(-door.angle)
  const sin = Math.sin(-door.angle)
  const dx = x - door.x
  const dz = z - door.z
  const alongX = dx * cos - dz * sin
  const alongZ = dx * sin + dz * cos
  return Math.abs(alongX) <= door.width / 2 + reach && Math.abs(alongZ) <= door.depth / 2 + reach
}

/** The first doorway a point stands in, if it stands in one. */
export function doorAt(
  doors: readonly MapTransition[],
  x: number,
  z: number,
): MapTransition | undefined {
  return doors.find((door) => inDoorway(door, x, z))
}

/**
 * Whether the character may go through a doorway yet.
 *
 * **This is not a nicety.** 681 of 1,149 arrivals land inside a doorway of the
 * map they arrive in — 59.3% — because you come out where you would go back in.
 * Without this the character would bounce between two maps forever.
 *
 * So a doorway fires on the way *in*: after arriving, the character has to
 * leave every doorway before any of them will take them anywhere. `armed` is
 * false from the moment they are put down until they are standing clear.
 */
export interface DoorGate {
  armed: boolean
}

export function doorGate(): DoorGate {
  // Put down, and not yet clear of wherever they were put down.
  return { armed: false }
}

/**
 * The doorway to go through this frame, if any, updating the gate.
 *
 * Returns nothing while the character is still in the doorway they arrived in,
 * and re-arms the moment they step out of it.
 */
export function doorTaken(
  gate: DoorGate,
  doors: readonly MapTransition[],
  x: number,
  z: number,
): MapTransition | undefined {
  const here = doorAt(doors, x, z)
  if (!here) {
    gate.armed = true
    return undefined
  }
  return gate.armed ? here : undefined
}
