import { add, FX32_ONE, type Fx32, fx32, sub } from '@minstrel/fixed'
import { type CollisionWorld, groundBelow } from './collision.ts'
import { SimError } from './errors.ts'
import { againstWalls, WALL_REACH } from './walls.ts'

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
  /**
   * The world turned the movement aside: a wall, a face too steep to stand on,
   * or an edge with nothing at all beyond it.
   */
  readonly hitWall: boolean
  /** Steepness of the ground stood on, as a cosine; `FX32_ONE` when airborne. */
  readonly slope: Fx32
}

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
 *
 * **The walls are the game's**: a sphere pushed out of them, mesh by mesh,
 * through each file's own grid — see `walls.ts`. The ground and the fall are
 * still ours.
 *
 * The ground has the last word as well as the second: a step whose landing has
 * no surface anywhere beneath it is refused rather than taken, which is what
 * keeps a character inside a room whose walls do not quite close it. A drop
 * with ground under it is untouched and remains a fall.
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
  let placed = slide(world, from, dx, dz, state.y, shape)
  // The ground under where the feet now are. Looking from `stepUp` above the
  // current height is what lets a low lip be walked onto rather than into.
  let ground = groundBelow(world, placed.x, placed.z, state.y, shape.stepUp)
  let hitWall = placed.hitWall

  if (ground === undefined && state.grounded) {
    // **Nothing at all below is not a fall; it is the world running out.**
    // A room's collision is a floor with walls standing on it, and on real maps
    // those walls do not always close it: walking every way out of the doorway
    // of `M01M08` left the floor on 21 of 64 headings, through gaps a
    // narrower character can reach. So a step whose landing has no surface
    // anywhere beneath it is refused, the way a step into a wall is.
    //
    // The test is "no ground anywhere below", not "ground lower than here",
    // and the difference is the whole rule. Outdoors a drop with ground under
    // it is a legitimate fall and must stay one; what is refused is a column
    // with no surface in it at all.
    hitWall = true
    // Each axis alone before giving up, so walking into the edge at an angle
    // keeps the part of the movement that stays over ground — the same
    // courtesy sliding along a wall gets. Attempt 2 stays put.
    for (let attempt = 0; attempt < 3 && ground === undefined; attempt++) {
      const ax = attempt === 0 ? dx : fx32(0)
      const az = attempt === 1 ? dz : fx32(0)
      if (attempt < 2 && ax === 0 && az === 0) continue
      const tried = slide(world, from, ax, az, state.y, shape)
      const under = groundBelow(world, tried.x, tried.z, state.y, shape.stepUp)
      if (under === undefined && attempt < 2) continue
      placed = tried
      ground = under
    }
  }

  const { x, z } = placed
  const under = ground
  const standable = under !== undefined && under.slope >= shape.maxSlope

  if (standable && under.y >= sub(state.y, shape.snapDown)) {
    // On the ground, or close enough under it to follow the surface down.
    return { x, y: under.y, z, fallSpeed: fx32(0), grounded: true, hitWall, slope: under.slope }
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

/** Where a horizontal move ends up once the walls have had their say. */
function slide(
  world: CollisionWorld,
  from: { x: Fx32; z: Fx32 },
  dx: Fx32,
  dz: Fx32,
  feetY: Fx32,
  shape: CharacterShape,
): { x: Fx32; z: Fx32; hitWall: boolean } {
  const { x, z, hitWall } = againstWalls(
    world.pieces,
    from,
    add(from.x, dx),
    add(from.z, dz),
    feetY,
    shape.radius,
    shape.height,
  )
  return { x: fx32(x), z: fx32(z), hitWall }
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
 * what it is rather than dressed up as a derivation. Judged against the slice's
 * village by resizing until it looked right, a person is **0.18 units** — 0.11
 * of the 1.57-unit house facade they walk past, and about the same height as
 * the village's doorways.
 *
 * The radius scales with the height, being a fact about the character. **The
 * step and snap heights do not**, and that distinction cost a lot to learn: a
 * step in the world is the same size whoever is climbing it, and a character
 * shrunk to a fifth with its tolerances shrunk alongside could walk almost
 * nowhere. In the slice's village, 12% of the reachable ground.
 *
 * What sets them is the movement rather than the body. Walking at 0.05 units a
 * tick down the steepest surface `maxSlope` allows — 60 degrees, so a gradient
 * of 1.73 — drops the ground **0.087 units under the feet in one tick**. A snap
 * height below that means the character leaves the ground on every downhill
 * step, and a step height below it means it cannot climb the steepest slope it
 * is allowed to stand on. Both are set above that with margin, which takes the
 * village from 12% reachable to 24%.
 *
 * That also caps `maxSlope` from above: past about 63 degrees the ground rises
 * more than `stepUp` in a tick, and the steepest standable surface stops being
 * climbable. The two move together or not at all.
 *
 * Gravity does scale with the height, so a fall reads the same however it is
 * revised; at this size it lands on three `fx32` words a tick, quantised at a
 * few per cent.
 *
 * **The interiors are not at the exterior's scale**, so a ceiling measured
 * inside says nothing about a house measured outside: a single house's interior
 * is 7.30 units across where the whole exterior village is 8.96, and the
 * two-storey houses need 5.6 to 5.9 units of interior where the tallest
 * exterior building is 2.19. Reading one against the other is what made this
 * constant need revising twice. A character will need a scale per map.
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
 * These are **not** the game's own constants, but for the radius and the
 * slope limit, read from its code on 11 October 2026 (see each). What is
 * measured is the scale they sit at; the rest are tuned by eye, and they are
 * gathered here so one edit replaces them when the real numbers turn up.
 */
export const PERSON: CharacterShape = {
  // The game gives the party's field characters 0x1800 (`func_ov017_0218f064`),
  // 0.1875 here; this stays at the figure set by eye until what else hangs off
  // it — the walking pace, the camera — is moved with it.
  height: fx32(Math.round(0.18 * FX32_ONE)),
  // **The game's**: the sweep that keeps a character out of the walls has a
  // radius of 0x800 in its units (`func_ov017_02192b48`), an eighth of that
  // here (`WORLD_SCALE`) — 0.0625. It was 0.025 and 0.04 when set by eye,
  // against interiors then drawn eight times too big.
  radius: fx32(WALL_REACH / 8),
  stepUp: fx32(Math.round(0.1 * FX32_ONE)),
  // Exactly 60 degrees from flat — and this one is **read off the cartridge's
  // own collision**, not chosen by eye.
  //
  // Across all 1,178 collision meshes, 108,471 faces, steepness falls away
  // smoothly from flat to 60 degrees and then stops: the whole band from 61 to
  // 78 degrees holds about 40 faces, 0.04% of them, while 79 to 90 carries the
  // walls — 79% of every face on the cartridge is vertical to the degree. The
  // authors sloped ground up to 60 and stood walls from 79, and left the
  // middle empty. The limit belongs in that gap, and `stepUp` fixes which end
  // of it: 60 is the steepest a 0.1 step can still climb.
  //
  // The game's code agrees: its wall sweep takes a face as a wall when its
  // stored normal has y at most 0x800, 0.5 (`func_020315b8`).
  //
  // At 50 degrees, where this sat while it was set by eye, the village's one
  // way back up to the Guardian statue — a single face at 56.7 degrees — read
  // as a wall, and the statue's ledge became an island the Hero could drop off
  // and not climb back to.
  maxSlope: fx32(Math.round(0.5 * FX32_ONE)),
  gravity: fx32(Math.round(0.0008 * FX32_ONE)),
  terminalSpeed: fx32(Math.round(0.06 * FX32_ONE)),
  snapDown: fx32(Math.round(0.15 * FX32_ONE)),
}
