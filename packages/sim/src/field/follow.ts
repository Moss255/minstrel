import { type Fx32, fx32 } from '@minstrel/fixed'
import { SimError } from '../errors.ts'

/**
 * Someone walking behind a leader, on the leader's own footsteps.
 *
 * The leader's position goes into a trail on every tick they move, and the
 * follower stands where the leader was a fixed number of moving ticks before.
 * So the follower only ever steps where the leader stepped — never into a wall
 * the leader went round — stops when the leader stops, a pace behind, and
 * keeps the same gap at any frame rate. Headless and deterministic: whole
 * `fx32` words, and nothing allocated once it is made.
 *
 * **Ours, all of it:** how a companion follows in the game is in its code.
 */

export interface Point {
  readonly x: Fx32
  readonly y: Fx32
  readonly z: Fx32
}

export interface Follower {
  /** How many of the leader's moving ticks it walks behind. */
  readonly delay: number
  /** The leader's last `delay + 1` positions, x, y and z to each, the oldest overwritten first. */
  readonly trail: Int32Array
  /** How many positions the trail holds, up to `delay + 1`. */
  count: number
  /** Where the next position goes. */
  head: number
  /** Where the follower stands: the trail's oldest position. */
  x: Fx32
  y: Fx32
  z: Fx32
}

export function createFollower(delay: number, at: Point): Follower {
  if (!Number.isInteger(delay) || delay < 1) {
    throw new SimError(`a follower walks a whole number of ticks behind, not ${delay}`)
  }
  const follower: Follower = {
    delay,
    trail: new Int32Array((delay + 1) * 3),
    count: 0,
    head: 0,
    x: at.x,
    y: at.y,
    z: at.z,
  }
  resetFollower(follower, at)
  return follower
}

/** Stand the follower on the leader, with no trail behind: on arriving somewhere. */
export function resetFollower(follower: Follower, at: Point): void {
  follower.trail[0] = at.x
  follower.trail[1] = at.y
  follower.trail[2] = at.z
  follower.count = 1
  follower.head = 1 % (follower.delay + 1)
  follower.x = at.x
  follower.y = at.y
  follower.z = at.z
}

/**
 * Where the leader stands after a tick. A tick they did not move leaves the
 * trail as it was. Returns whether the follower moved.
 */
export function recordLeader(follower: Follower, at: Point): boolean {
  const { trail } = follower
  const size = follower.delay + 1
  const last = ((follower.head + size - 1) % size) * 3
  if (trail[last] === at.x && trail[last + 1] === at.y && trail[last + 2] === at.z) return false

  const put = follower.head * 3
  trail[put] = at.x
  trail[put + 1] = at.y
  trail[put + 2] = at.z
  follower.head = (follower.head + 1) % size
  if (follower.count < size) follower.count++

  // Until the trail is full its oldest is the first; after, the next to be overwritten.
  const oldest = (follower.count < size ? 0 : follower.head) * 3
  const x = fx32(trail[oldest] as number)
  const y = fx32(trail[oldest + 1] as number)
  const z = fx32(trail[oldest + 2] as number)
  const moved = x !== follower.x || y !== follower.y || z !== follower.z
  follower.x = x
  follower.y = y
  follower.z = z
  return moved
}
