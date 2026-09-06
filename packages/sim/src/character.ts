import { add, FX32_ONE, type Fx32, fx32, sub } from '@vesper/fixed'
import type { CollisionTriangle } from '@vesper/game-formats'
import {
  type CollisionWorld,
  groundBelow,
  longestProjectedEdge,
  slopeOf,
  triangleAt,
} from './collision.ts'
import { SimError } from './errors.ts'

/**
 * A character standing in the world.
 *
 * The position is the point between the feet, which is what the ground query
 * answers about and what an animation's root is placed at. Everything is `fx32`
 * in the cartridge's own units.
 */
export interface CharacterState {
  readonly x: Fx32
  readonly y: Fx32
  readonly z: Fx32
  /** Downward speed, per tick. Zero while standing. */
  readonly fallSpeed: Fx32
  readonly grounded: boolean
}

/**
 * The shape and the limits of a character.
 *
 * `maxSlope` is a **cosine**, matching what {@link GroundHit.slope} reports, so
 * comparing them is a comparison rather than a trigonometric call. It also
 * decides what counts as a wall: a surface too steep to stand on is one to be
 * stopped by, and treating those as the same thing means a cliff face and a
 * building wall need no separate handling.
 */
export interface CharacterShape {
  /** Horizontal radius. */
  readonly radius: Fx32
  /** How tall, from the feet up. Decides what can be walked under. */
  readonly height: Fx32
  /** The tallest lip that can be walked over rather than into. */
  readonly stepUp: Fx32
  /** Cosine of the steepest standable surface. */
  readonly maxSlope: Fx32
  /** Added to the fall speed each tick. */
  readonly gravity: Fx32
  /** The fall speed is never allowed past this. */
  readonly terminalSpeed: Fx32
  /**
   * How far below the feet the ground is still followed when walking.
   *
   * This is what keeps a character on a downward slope instead of launching off
   * every ridge in it. Beyond this drop, walking off an edge becomes a fall.
   */
  readonly snapDown: Fx32
}

/** What a step did, beyond where it ended up. */
export interface StepResult extends CharacterState {
  /** A wall or a too-steep face turned the movement aside. */
  readonly hitWall: boolean
  /** Steepness of the ground stood on, as a cosine; `FX32_ONE` when airborne. */
  readonly slope: Fx32
}

/** How many times a step re-resolves against walls before giving up. */
const RESOLVE_PASSES = 4

/**
 * Advance a character by one simulation tick.
 *
 * `dx` and `dz` are the movement wanted this tick, not a velocity: the caller
 * decides speed, and the controller decides how much of it the world allows.
 *
 * The order matters. Horizontal movement resolves against walls first, so a
 * character sliding along a wall keeps the part of its movement the wall does
 * not oppose. Only then is the ground consulted, because where the feet end up
 * horizontally is what decides which ground is under them.
 */
export function step(
  world: CollisionWorld,
  state: CharacterState,
  dx: Fx32,
  dz: Fx32,
  shape: CharacterShape,
): StepResult {
  if (shape.radius < 0 || shape.height <= 0) {
    throw new SimError('a character needs a non-negative radius and a positive height')
  }

  const from = { x: state.x, z: state.z }
  let x = add(state.x, dx)
  let z = add(state.z, dz)
  let hitWall = false

  // Push out of anything the move ended up inside. Several passes, because
  // escaping one wall in a corner can push straight into the other.
  for (let pass = 0; pass < RESOLVE_PASSES; pass++) {
    const pushed = pushOutOfWalls(world, from, x, state.y, z, shape)
    if (pushed === undefined) break
    x = pushed.x
    z = pushed.z
    hitWall = true
  }

  // The ground under where the feet now are. Looking from `stepUp` above the
  // current height is what lets a low lip be walked onto rather than into.
  const ground = groundBelow(world, x, z, state.y, shape.stepUp)
  const standable = ground !== undefined && ground.slope >= shape.maxSlope

  if (standable && ground.y >= sub(state.y, shape.snapDown)) {
    // On the ground, or close enough under it to follow the surface down.
    return { x, y: ground.y, z, fallSpeed: fx32(0), grounded: true, hitWall, slope: ground.slope }
  }

  // Falling. The speed accumulates whether or not there was ground before, so
  // walking off an edge and being pushed off one behave the same.
  let fallSpeed = add(state.grounded ? fx32(0) : state.fallSpeed, shape.gravity)
  if (fallSpeed > shape.terminalSpeed) fallSpeed = shape.terminalSpeed
  const y = sub(state.y, fallSpeed)

  // Land if the fall passed through a standable surface this tick.
  const landing = groundBelow(world, x, z, state.y, fx32(0))
  if (landing !== undefined && landing.slope >= shape.maxSlope && y <= landing.y) {
    return {
      x,
      y: landing.y,
      z,
      fallSpeed: fx32(0),
      grounded: true,
      hitWall,
      slope: landing.slope,
    }
  }
  return { x, y, z, fallSpeed, grounded: false, hitWall, slope: FX32_ONE }
}

/**
 * Push a position out of any wall it overlaps.
 *
 * A wall is any surface too steep to stand on, which is the same test the
 * ground query uses — so an unclimbable slope stops a character exactly as a
 * building does, without either being a special case.
 *
 * **Which side to leave by comes from where the character was, not from where
 * it is.** Resolving from the current position alone has no answer when the
 * character has landed exactly on the wall's plane, and gives the wrong one
 * when a fast step has carried it through: both cases push it out of the far
 * side, which reads as walking through the wall. The previous position says
 * which side it belongs on, and that is well defined in both.
 *
 * Returns `undefined` when nothing overlapped, so the caller can stop early.
 */
function pushOutOfWalls(
  world: CollisionWorld,
  from: { x: Fx32; z: Fx32 },
  x: Fx32,
  feetY: Fx32,
  z: Fx32,
  shape: CharacterShape,
): { x: Fx32; z: Fx32 } | undefined {
  const radius = shape.radius
  // A wall below the step-up height is a lip to walk over, and one above the
  // head is something to walk under. Neither is in the way.
  const low = add(feetY, shape.stepUp)
  const high = add(feetY, shape.height)

  let deepest = 0
  let pushX = 0
  let pushZ = 0

  for (const index of triangleAt(world, x, z)) {
    const triangle = world.triangles[index] as CollisionTriangle
    if (slopeOf(triangle) >= shape.maxSlope) continue
    const [a, b, c] = triangle.vertices
    if (Math.max(a[1], b[1], c[1]) <= low) continue
    if (Math.min(a[1], b[1], c[1]) >= high) continue

    // A steep face projects to a thin triangle on the ground; the two vertices
    // furthest apart in projection are the segment to keep away from.
    const segment = longestProjectedEdge(triangle)
    const edgeX = segment.bx - segment.ax
    const edgeZ = segment.bz - segment.az
    const edgeLength = Math.hypot(edgeX, edgeZ)
    if (edgeLength === 0) continue

    // Where along the wall the character is. Outside its ends, the wall is a
    // post to walk around rather than a face to be stopped by.
    const along = ((x - segment.ax) * edgeX + (z - segment.az) * edgeZ) / (edgeLength * edgeLength)
    let dirX: number
    let dirZ: number
    let distance: number

    if (along >= 0 && along <= 1) {
      // The wall's own normal in the ground plane, turned to face the side the
      // character came from.
      let nx = -edgeZ / edgeLength
      let nz = edgeX / edgeLength
      const wasOn = (from.x - segment.ax) * nx + (from.z - segment.az) * nz
      if (wasOn < 0) {
        nx = -nx
        nz = -nz
      }
      dirX = nx
      dirZ = nz
      distance = (x - segment.ax) * nx + (z - segment.az) * nz
    } else {
      // Rounding the end: keep clear of the nearer corner.
      const cornerX = along < 0 ? segment.ax : segment.bx
      const cornerZ = along < 0 ? segment.az : segment.bz
      const offsetX = x - cornerX
      const offsetZ = z - cornerZ
      distance = Math.hypot(offsetX, offsetZ)
      if (distance === 0) continue
      dirX = offsetX / distance
      dirZ = offsetZ / distance
    }

    // A negative distance means the step carried the character through.
    if (distance >= radius) continue
    const depth = radius - distance
    if (depth <= deepest) continue
    deepest = depth
    pushX = dirX * depth
    pushZ = dirZ * depth
  }

  if (deepest === 0) return undefined
  return { x: fx32(Math.round(x + pushX)), z: fx32(Math.round(z + pushZ)) }
}

/**
 * A character the size of a person, in the cartridge's units.
 *
 * **The buildings are measured; the ratio to them is not.** The village's
 * houses can be measured exactly: in `M01`, the slice's village, the house is
 * one shape of `M01M0003.nsbmd`, 4.50 units wide and standing from y 0.38 to
 * 1.88 — **1.50 units tall**, with its neighbour in `M01M0004` at 1.57. The
 * doorway models are 1.54 and the interiors' ceilings 1.97 to 2.06.
 *
 * What those *cannot* settle is how tall a person is against them. Reasoning
 * from architecture — a real door is about two metres, so a unit is about 1.3
 * metres, so a person is about 1.3 units — gives a figure noticeably larger
 * than the game draws. Like many games of its kind this one draws its people
 * small against its buildings, and how small is a fact about the original that
 * this repository cannot measure: it is not in any data table read so far, and
 * seeing it needs the game running.
 *
 * So the ratio is **set by eye against the original**, and recorded here as
 * what it is rather than dressed up as a derivation: a person is a little under
 * a third of a house, which at a 1.50-unit house is **0.45 units**.
 *
 * The cartridge's own characters cannot settle it either, which is worth
 * recording because it looks as though they should. The village's NPCs are
 * modelled in the same space as the player — `s001.nsbmd` stands 10.03 units,
 * the same as the player's posed figure — so placing them shows whether every
 * character agrees with every other, not how big any of them should be.
 *
 * The rest follow from that height at ordinary human proportions: a little over
 * a fifth of it as a radius, a third as the tallest step. Gravity and the
 * terminal speed are proportional to it too, so a fall reads the same however
 * the height is revised — a terminal speed near a character's own height per
 * tick would look like teleporting rather than falling.
 *
 * These are **not** the game's own constants, which live in code this
 * repository does not read. What is measured is the scale they sit at; the
 * proportions within it are tuned by eye, and they are gathered here so one
 * edit replaces them when the real numbers turn up.
 */
export const PERSON: CharacterShape = {
  height: fx32(Math.round(0.45 * FX32_ONE)),
  radius: fx32(Math.round(0.1 * FX32_ONE)),
  stepUp: fx32(Math.round(0.14 * FX32_ONE)),
  // About 50 degrees from flat.
  maxSlope: fx32(Math.round(0.64 * FX32_ONE)),
  gravity: fx32(Math.round(0.002 * FX32_ONE)),
  terminalSpeed: fx32(Math.round(0.15 * FX32_ONE)),
  snapDown: fx32(Math.round(0.08 * FX32_ONE)),
}
