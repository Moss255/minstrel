/**
 * **The ship** — read from the game's code (US ARM9 `func_020a6728` to
 * `func_020a7f30`, the ship; ov017 `func_ov017_02199360`, boarding; ov017
 * `func_ov017_021a9454`, its questions), 6 October 2026. The reading, with the
 * addresses, is `docs/readings/T16b-ship.md`.
 *
 * - **It sails only on the ocean**, map 10000 (`O00`) — the whole world at a
 *   sixth, as the sky is, wrapping at the same ±144 by ±112.
 * - **In a field it is moored** at one of the field's moorings (type-10
 *   regions, `Mooring`), and boarded there by the A Button.
 * - **It turns, speeds up and coasts to a stop** by the object's own mover
 *   (`func_02033710`, `func_0203348c`), at its own rates: `0xc9` a vblank of
 *   turn, `0x106` at most, `10` a vblank faster or slower.
 * - **A shore is reached** after 40 vblanks of steering into a wall whose
 *   collision record has land bits (`func_020a7d74`).
 *
 * All positions are the game's, fixed point 1.19.12 in the maps' own units:
 * `4096` is one. Angles are radians × 4096.
 */

import { DIRECTION_ANGLES, type Direction, PI, TWO_PI, WRAP } from './flight.ts'

/** One in the game's fixed point. */
const ONE = 4096

/** The ocean, by its id — `O00`, "Field - Ocean". */
export const OCEAN_MAP = 10000
/** The ship's deck, `S09`. */
export const DECK_MAP = 5900
/** Bloomingdale, `M09`: the ship's harbour, where a new game leaves it. */
export const BLOOMINGDALE = 1900
/** Game-wide flag `0x2b`, set at 9.4: the party has the ship. B at sea and Zoom test it. */
export const FLAG_SHIP = 0x2b
/** The ship's object number (`0xc9`). */
export const SHIP_OBJECT = 0xc9
/** The ship's model, `data_020f1b52`. */
export const SHIP_MODEL = 'chara_sub/s201.chr'
/** Its scale on the ocean and the sky, and in a field, of 4096 (`func_020a6aac`). */
export const SHIP_SCALE_SEA = 0xa0
export const SHIP_SCALE_FIELD = 0x180

/** `+0xb0`: the most the facing turns in a vblank. */
export const TURN_RATE = 0xc9
/** `+0xb4`: the most speed, a vblank. */
export const TOP_SPEED = 0x106
/** `+0xb6`: how much faster, or slower, in a vblank. */
export const SPEED_STEP = 10

/** How long, in vblanks, the ship must steer into a shore before it is reached (`0x28`). */
export const SHORE_VBLANKS = 0x28
/** The most the heading may meet a shore's normal by, as a dot product × 4096 (`-0xc00`). */
export const SHORE_HEADING = -0xc00
/** Sailing this far takes one from the sea's encounter count (`0x3000`). */
export const LEG = 0x3000
/** The sea's encounter count, a new game's (`0x50`), and its draw: 30 to 100. */
export const NEW_GAME_COUNT = 0x50
export const COUNT_LEAST = 0x1e
export const COUNT_MOST = 0x64

/** A shore record's kind 1: the shore of Bloomingdale, whatever its map says (`0x020a6654`). */
export const KIND_BLOOMINGDALE = 1

/** `strstd` 58, "Disembark?", and 59, "Switch to the inside of the boat?". */
export const LINE_DISEMBARK = 58
export const LINE_INSIDE = 59

/** Where a new game leaves the ship on the ocean (`func_020134e0`, `0x020136f0`). */
export const SEA_START = { x: 0x19000, y: 0x199, z: 0x38ccc } as const
/** Where the party comes ashore in Bloomingdale from the ocean (`data_020e909c`), and its facing (`0x570`). */
export const BLOOMINGDALE_ASHORE = { x: -0x1c800, y: -0x1ccc, z: -0x7800, facing: 0x570 } as const
/** Where the deck puts the party from the ocean (`func_ov017_021a9454`, `0x021a95d4`). */
export const DECK_FROM_SEA = { x: 0x5f0a, y: 0x3614, z: 0x570, facing: 0x4b66 } as const

/**
 * The deck's gangway at sea (`func_020a72ac`, `0x020a7464`–`0x020a74b8`):
 * a Hero at z 6 or more with x from −8.2 to −5.8 is put back at
 * (−7, 0.18, 5.9).
 */
export const GANGWAY = {
  z: 0x6000,
  minX: -0x8333,
  maxX: -0x5ccc,
  back: { x: -0x7000, y: 0x2e1, z: 0x5e66 },
} as const

/**
 * **What the game keeps of the ship**, `func_02012fe4()` `+0x2774` on —
 * saved with the game.
 */
export interface ShipKeep {
  /** The map it is moored in, `+0x2786`. */
  readonly map: number
  /** The mooring it is tied up at, `+0x2784`: a type-10 region's number. */
  readonly mooring: number
  /** Out at sea, `+0x2788`. */
  readonly atSea: boolean
  /** Its place on the ocean, `+0x2774`. */
  readonly x: number
  readonly y: number
  readonly z: number
  /** Its facing there, `+0x2780`. */
  readonly facing: number
  /** The sea's encounter count, `+0x2794`. */
  readonly count: number
}

/** A new game's ship: in Bloomingdale, mooring 0, its ocean place the default. */
export function newShipKeep(): ShipKeep {
  return {
    map: BLOOMINGDALE,
    mooring: 0,
    atSea: false,
    ...SEA_START,
    facing: 0,
    count: NEW_GAME_COUNT,
  }
}

/**
 * **The ship sailing** — the object's own state on the ocean: where it is,
 * the facing it has (`+0x54`) and the one it turns to (`+0xae`), its speed
 * (`+0xb2`), whether it is going (state 1, `+0xbe`), how long it has steered
 * into a shore (`+0x138`), and how far it has sailed toward the next leg
 * (`+0x150`).
 */
export interface Sailing {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly facing: number
  readonly want: number
  readonly speed: number
  readonly going: boolean
  readonly ashore: number
  readonly sailed: number
}

/** Put to sea from what is kept (`func_020a6aac`, `0x020a6bf8`–`0x020a6c2c`). */
export function putToSea(keep: ShipKeep): Sailing {
  return {
    x: keep.x,
    y: keep.y,
    z: keep.z,
    facing: keep.facing,
    want: keep.facing,
    speed: 0,
    going: false,
    ashore: 0,
    sailed: 0,
  }
}

/** Reduce an angle to 0 to 2π, as `fix32ReduceAngle0To2Pi` does. */
function reduced(angle: number): number {
  const a = angle % TWO_PI
  return a < 0 ? a + TWO_PI : a
}

/** `fix32SignedAngleDistance`: how far `to` is from `from`, −π to π. */
function signedDistance(from: number, to: number): number {
  let by = reduced(to) - reduced(from)
  if (by > PI) by -= TWO_PI
  if (by < -PI) by += TWO_PI
  return by
}

/**
 * **One vblank of sailing**: the mover, then the steering, as `func_020a75ec`
 * runs them. `held` is the +Control Pad's direction, `cameraTurn` the
 * camera's own turn, radians × 4096. Walls are the caller's: this returns
 * where the ship would go, and the caller has the world say how much of it
 * it may.
 *
 * - **The mover** (`func_020332ac`): the facing turns toward the one wanted by
 *   at most {@link TURN_RATE} (`func_02033710`); going, the speed rises by
 *   {@link SPEED_STEP} until it is {@link TOP_SPEED} or past it, and is then
 *   brought back to it; stopped, it falls by as much to 0 (`func_0203348c`).
 *   It moves by the speed it had, but no more than the most speed × (1 − the
 *   turn still to make ÷ π), along its facing.
 * - **The steering** (`func_020a78dc`): a direction held is one of eight, the
 *   Express's, turned by the camera's; the ship is set going and its facing to
 *   be that way. None held: it is set to stop.
 *
 * **Ours**: the sine and cosine are the platform's, where the game's is a
 * table; and the move is taken along the facing it has, the object's flag
 * `0x100` (which would take the one wanted) being INFERRED clear.
 */
export function sailVblank(
  state: Sailing,
  held: Direction | undefined,
  cameraTurn: number,
): Sailing {
  // The turn: at most TURN_RATE toward the one wanted.
  const by = signedDistance(state.facing, state.want)
  const facing =
    Math.abs(by) < TURN_RATE ? state.want : reduced(state.facing + Math.sign(by) * TURN_RATE)
  // The speed, the old one moving the ship this vblank.
  const was = state.speed
  let speed: number
  if (state.going) {
    if (was < TOP_SPEED) speed = was + SPEED_STEP
    else speed = was - TOP_SPEED < SPEED_STEP ? TOP_SPEED : was - SPEED_STEP
  } else speed = was > 0 ? was - SPEED_STEP : 0
  let x = state.x
  let z = state.z
  if (was > 0) {
    const left = Math.abs(signedDistance(facing, state.want))
    const share = ONE - Math.trunc((left * ONE) / PI)
    const most = (TOP_SPEED * share + 0x800) >> 12
    const step = Math.min(was, most)
    x += Math.round(Math.sin(facing / ONE) * step)
    z += Math.round(Math.cos(facing / ONE) * step)
  }
  // The steering, for the next.
  const going = held !== undefined
  const want = held ? reduced(DIRECTION_ANGLES[held] + cameraTurn) : state.want
  return { ...state, x, z, facing, want, speed, going }
}

/** The ocean wraps as the sky does (`0x020a7688`–`0x020a7740`). */
export function wrapped(state: Sailing): Sailing {
  let { x, z } = state
  if (x >= WRAP.x) x -= WRAP.spanX
  else if (x < -WRAP.x) x += WRAP.spanX
  if (z >= WRAP.z) z -= WRAP.spanZ
  else if (z < -WRAP.z) z += WRAP.spanZ
  return x === state.x && z === state.z ? state : { ...state, x, z }
}

/**
 * **The legs sailed** (`func_020a7ce0`): the distance moved is added up, and
 * every {@link LEG} of it takes one from the encounter count.
 */
export function legsSailed(state: Sailing, moved: number): { state: Sailing; legs: number } {
  const sailed = state.sailed + moved
  if (sailed < LEG) return { state: { ...state, sailed }, legs: 0 }
  const legs = Math.trunc(sailed / LEG)
  return { state: { ...state, sailed: sailed - legs * LEG }, legs }
}

/** A shore the ship is against: its record's land bits and kind, its map, and the wall's normal on the ground (× 4096). */
export interface ShoreContact {
  readonly land: boolean
  readonly map: number | undefined
  readonly kind: number
  readonly normalX: number
  readonly normalZ: number
}

/**
 * **Whether a shore is reached** (`func_020a7d74`): the ship steered, against a
 * wall whose record has land bits, heading into it — its facing against the
 * wall's normal below {@link SHORE_HEADING} — for {@link SHORE_VBLANKS} in all.
 * Anything else puts the count back to 0. The map is the record's, or
 * Bloomingdale for kind 1.
 */
export function shoreVblank(
  state: Sailing,
  steered: boolean,
  contact: ShoreContact | undefined,
): { state: Sailing; reached?: number } {
  if (!steered || !contact?.land)
    return { state: state.ashore === 0 ? state : { ...state, ashore: 0 } }
  const hx = Math.sin(state.facing / ONE)
  const hz = Math.cos(state.facing / ONE)
  const length = Math.hypot(contact.normalX, contact.normalZ) || 1
  const dot = Math.round(((hx * contact.normalX + hz * contact.normalZ) / length) * ONE)
  if (dot >= SHORE_HEADING) return { state: { ...state, ashore: 0 } }
  const ashore = state.ashore + 1
  if (ashore < SHORE_VBLANKS) return { state: { ...state, ashore } }
  const map = contact.kind === KIND_BLOOMINGDALE ? BLOOMINGDALE : contact.map
  return map === undefined
    ? { state: { ...state, ashore } }
    : { state: { ...state, ashore }, reached: map }
}

/** A mooring as the nearest-mooring rule reads it — see `Mooring` in `@minstrel/game-formats`. */
export interface MooringPlace {
  readonly id: number
  readonly x: number
  readonly y: number
  readonly z: number
  readonly reach: number
}

/**
 * **The mooring the ship comes in at** (`func_0201b678`): its place on the
 * ocean × 6 less the field's place in the world (`MapEntry.world`), against
 * each mooring's centre — the nearest within its reach if any is, else the
 * nearest of all. `sea` is in the game's fixed point; the moorings and the
 * world place in the maps' own units.
 */
export function mooringFor<T extends MooringPlace>(
  moorings: readonly T[],
  sea: { readonly x: number; readonly y: number; readonly z: number },
  world: { readonly x: number; readonly z: number },
): T | undefined {
  const px = (sea.x * 6) / ONE - world.x
  const py = (sea.y * 6) / ONE
  const pz = (sea.z * 6) / ONE - world.z
  let within: T | undefined
  let best = 0x0ffff000 / ONE
  let nearest: T | undefined
  let nearestAt = 0x0ffff000 / ONE
  for (const one of moorings) {
    const d = Math.hypot(one.x - px, one.y - py, one.z - pz)
    if (d >= best) continue
    if (d <= one.reach) {
      best = d
      within = one
    } else if (d < nearestAt) {
      nearestAt = d
      nearest = one
    }
  }
  return within ?? nearest
}

/** The deck's gangway at sea: where the Hero is put back to, if they have come too near it. */
export function keptFromGangway(at: { readonly x: number; readonly z: number }) {
  if (at.z >= GANGWAY.z && at.x >= GANGWAY.minX && at.x <= GANGWAY.maxX) return GANGWAY.back
  return undefined
}
