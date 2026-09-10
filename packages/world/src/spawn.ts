import { FX32_ONE, type Fx32, fx32, toFloat } from '@minstrel/fixed'
import {
  type CharacterShape,
  type CharacterState,
  type CollisionWorld,
  groundBelow,
  step,
} from '@minstrel/sim'
import { inWater, type WaterArea } from './assemble.ts'

/**
 * Where a character can start, and what counts as somewhere it can start.
 *
 * Somewhere to stand and somewhere to walk are different questions, and only
 * the second matters for a spawn. The village's obvious spawn was a spot with
 * open ground in all sixteen directions that the character could not leave,
 * because it sat inside a two-and-a-half-unit wall and a thicket of eighty-
 * degree faces.
 */

export interface Spawn {
  readonly x: Fx32
  readonly y: Fx32
  readonly z: Fx32
  /** How many of the eight directions the character could actually walk off in. */
  readonly open: number
}

export interface SpawnOptions {
  readonly person: CharacterShape
  /** How far the character moves in one tick, in `fx32` units. */
  readonly speed: number
  readonly water?: readonly WaterArea[]
  /**
   * How many candidate triangles to try. Enough to cross a map's walkable
   * ground without stalling the caller; the village settles well inside it.
   */
  readonly candidates?: number
  /** Stop once a candidate is this open, rather than testing the rest. */
  readonly goodEnough?: number
  /**
   * Where the character wants to be, if somewhere in particular.
   *
   * Candidates are tried nearest this first; without it they are tried nearest
   * the middle of the map. It is what a doorway needs when the map has no floor
   * under the arrival the doorway names — see the field note in
   * `game-formats/FORMAT.md`. Coming out of the village onto the field is the
   * case: the road's arrival is 2.2 units west of anywhere the field can be
   * stood on, and putting the character down at the map's middle instead loses
   * which way they came in.
   */
  readonly near?: { readonly x: number; readonly z: number }
}

const DEFAULT_CANDIDATES = 400
const DEFAULT_GOOD_ENOUGH = 6
/** The eight directions a spawn is tested in. */
const DIRECTIONS = 8
/** How many ticks to walk when testing whether a direction is open. */
const PROBE_TICKS = 16

/**
 * Can the character actually walk away from here?
 *
 * Counted as directions, not as a yes or no, so a spot with three ways out can
 * be preferred to one with none rather than both being rejected.
 */
export function waysOut(
  world: CollisionWorld,
  x: Fx32,
  y: Fx32,
  z: Fx32,
  options: Pick<SpawnOptions, 'person' | 'speed'>,
): number {
  let open = 0
  for (let i = 0; i < DIRECTIONS; i++) {
    const angle = (i * Math.PI * 2) / DIRECTIONS
    const dx = fx32(Math.round(Math.cos(angle) * options.speed))
    const dz = fx32(Math.round(Math.sin(angle) * options.speed))
    let state: CharacterState = { x, y, z, fallSpeed: fx32(0), grounded: true }
    for (let tick = 0; tick < PROBE_TICKS; tick++) {
      state = step(world, state, dx, dz, options.person)
    }
    const moved = Math.hypot(toFloat(state.x) - toFloat(x), toFloat(state.z) - toFloat(z))
    // Half of what it asked for, which a wall taken at an angle still passes.
    if (moved > (toFloat(fx32(options.speed)) * PROBE_TICKS) / 2) open++
  }
  return open
}

/**
 * Choose somewhere to start, nearest a wanted spot first.
 *
 * Candidates are the map's own walkable triangles. The first one the character
 * can leave in most directions wins; if none can be left the least bad is used
 * rather than refusing to walk at all.
 *
 * Without {@link SpawnOptions.near} the wanted spot is the middle of the map,
 * which is what opening a map with no arrival wants. This stands in until the
 * cartridge's own start positions are found — they are not in any table read so
 * far.
 */
export function findSpawn(world: CollisionWorld, options: SpawnOptions): Spawn | undefined {
  const { bounds } = world
  // Where to search outwards from: the spot asked for, or the middle.
  const wantX = options.near ? options.near.x * FX32_ONE : (bounds.minX + bounds.maxX) / 2
  const wantZ = options.near ? options.near.z * FX32_ONE : (bounds.minZ + bounds.maxZ) / 2
  // **Rounded, because a scaled map's bounds are not whole words.** A map built
  // at `PLACED_PIECE_SCALE` divides its collision by eight, and the village
  // inn's `maxY` comes out at 5235.5 — which `fx32` refuses, so looking for
  // somewhere to stand threw instead of answering. It only showed where the
  // fallback runs at all, which is a doorway whose arrival has no floor.
  const above = fx32(Math.round(bounds.maxY + FX32_ONE))
  const water = options.water ?? []
  const height = toFloat(options.person.height)

  const candidates: { x: Fx32; z: Fx32; away: number }[] = []
  if (groundBelow(world, fx32(Math.round(wantX)), fx32(Math.round(wantZ)), above)) {
    candidates.push({ x: fx32(Math.round(wantX)), z: fx32(Math.round(wantZ)), away: 0 })
  }
  for (const triangle of world.triangles) {
    // A vertical face is a wall; nothing stands on it.
    if (triangle.normal[1] === 0) continue
    const [a, b, c] = triangle.vertices
    const cx = Math.round((a[0] + b[0] + c[0]) / 3)
    const cz = Math.round((a[2] + b[2] + c[2]) / 3)
    candidates.push({ x: fx32(cx), z: fx32(cz), away: Math.hypot(cx - wantX, cz - wantZ) })
  }
  candidates.sort((p, q) => p.away - q.away)

  let best: Spawn | undefined
  const limit = options.candidates ?? DEFAULT_CANDIDATES
  const enough = options.goodEnough ?? DEFAULT_GOOD_ENOUGH
  for (const candidate of candidates.slice(0, limit)) {
    const found = groundBelow(world, candidate.x, candidate.z, above)
    if (!found || found.slope < options.person.maxSlope) continue
    if (inWater(water, toFloat(candidate.x), toFloat(found.y), toFloat(candidate.z), height)) {
      continue
    }
    const open = waysOut(world, candidate.x, found.y, candidate.z, options)
    if (!best || open > best.open) best = { x: candidate.x, y: found.y, z: candidate.z, open }
    if (open >= enough) break
  }
  return best
}
