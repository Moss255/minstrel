/**
 * **The Starflight Express in flight**, over the sky map — read from the
 * game's code (US ARM9 `0x020ac020` to `0x020ae4c8`, the vehicle; ov017
 * `func_ov017_021a7378`, its menu; ov017 `func_ov017_021a6c2c`, the whistle's
 * summoning), 29 September 2026. FORMAT.md, "The Starflight Express in
 * flight", has the addresses.
 *
 * - **The sky is a map of its own**, O01 (10100, "Field - Sky"): the whole
 *   world in two archives, `O01a` and `O01b`, drawn small. The Express flies
 *   only there (`func_020ad61c` tests the map).
 * - **A fixed height**, 10 (`0xa000`), set every frame (`func_020adaac`).
 * - **The +Control Pad, held**, gives a direction — the eight of them against
 *   the camera's own turn (`0x020adcc0`); the facing turns toward it by at most
 *   `0xcc` radians × 4096 a frame, and takes it once nearer than that.
 * - **It never stops**: its speed is set each frame to `0x1eb` and the
 *   generic mover takes `0x28` off it (`func_0203348c`), so it moves `0x1c3` a
 *   tick along its facing, x by the sine and z by the cosine — INFERRED that
 *   nothing sets the flag that would let it coast to a stop.
 * - **The sky wraps**: past x ±144 (`0x90000`) the Express is moved 288
 *   across, past z ±112 (`0x70000`) 224 — the sky map's own extent, its
 *   collision's ±144 by ±112 (`0x020ad720` to `0x020ad818`).
 * - **Two carriages** follow on a hitch 0.9 (`0xe66`) behind each, each turned
 *   toward the one before (`func_020adda4`).
 *
 * All positions here are the game's, fixed point 1.19.12 in the maps' own
 * units: `4096` is one.
 */

/** One in the game's fixed point. */
const ONE = 4096

/** The sky map, by its id — O01, "Field - Sky". */
export const SKY_MAP = 10100
/** The Express's height over the sky map (`0xa000`). */
export const FLIGHT_HEIGHT = 0xa000
/** The most the facing turns in a frame, radians × 4096 (`+0x148`, set to `0xcc`). */
export const TURN_STEP = 0xcc
/** Speed a tick once the mover's deceleration is taken off: `0x1eb − 0x28`. INFERRED — see the module. */
export const FLIGHT_SPEED = 0x1eb - 0x28
/** How far the hitch and each carriage trail (`0xe66`). */
export const HITCH = 0xe66
/** π and 2π, as the game's angles are held: radians × 4096 (`0x3244`, `0x6488`). */
export const PI = 0x3244
export const TWO_PI = 0x6488

/** Where the sky wraps, and by how much: x at ±0x90000 by 0x120000, z at ±0x70000 by 0xe0000. */
export const WRAP = { x: 0x90000, spanX: 0x120000, z: 0x70000, spanZ: 0xe0000 } as const

/**
 * **How the sky and the field meet**: a place in a field region is the
 * region's place in the world (`MapEntry.world`) plus its own, and the sky
 * holds the world at a sixth — taking off, the Express starts at their sum
 * over 6 (`func_020acecc`, `0x6000` divided); landing, the Hero is put at the
 * sky's place times 6 less the region's (`0x020acf40`). A town's own map-list
 * place is already the sky's.
 */
export const SKY_UNIT = 6

/** The +Control Pad's eight directions, held, as the game tests them — see {@link DIRECTION_ANGLES}. */
export type Direction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'upLeft'
  | 'upRight'
  | 'downLeft'
  | 'downRight'

/**
 * Each direction's turn from the camera's, radians × 4096 — the table at
 * `0x020e9118`: up π, down 0, left 3π/2, right π/2, and the diagonals between.
 */
export const DIRECTION_ANGLES: Readonly<Record<Direction, number>> = {
  up: 12868,
  down: 0,
  left: 19302,
  right: 6434,
  upLeft: 16085,
  upRight: 9651,
  downLeft: 22519,
  downRight: 3217,
}

export interface Carriage {
  readonly x: number
  readonly z: number
  /** Radians × 4096. */
  readonly facing: number
}

export interface FlightState {
  readonly x: number
  readonly y: number
  readonly z: number
  /** Radians × 4096, 0 to 2π. */
  readonly facing: number
  readonly carriages: readonly [Carriage, Carriage]
}

/** Reduce an angle to 0 to 2π, as `fix32ReduceAngle0To2Pi` does. */
function reduced(angle: number): number {
  const a = angle % TWO_PI
  return a < 0 ? a + TWO_PI : a
}

/** The Express where it takes off, facing π, its carriages in a line behind 1.8 apart (`func_020adfa8`). */
export function takeOff(x: number, z: number): FlightState {
  const facing = PI
  const behind = (distance: number): Carriage => ({
    x: x - Math.round(Math.sin(facing / ONE) * distance),
    z: z - Math.round(Math.cos(facing / ONE) * distance),
    facing,
  })
  return { x, y: FLIGHT_HEIGHT, z, facing, carriages: [behind(0x1ccc), behind(0x1ccc * 2)] }
}

/**
 * One frame of flight: turn toward the direction held (none keeps the
 * facing), move on, wrap, and draw the carriages after. `cameraTurn` is the
 * camera's own, radians × 4096. **Ours**: the sine and cosine are the
 * platform's, where the game's table is.
 */
export function flightFrame(
  state: FlightState,
  held: Direction | undefined,
  cameraTurn: number,
  ticks = 1,
): FlightState {
  let facing = state.facing
  if (held) {
    const target = reduced(DIRECTION_ANGLES[held] + cameraTurn)
    let by = target - facing
    if (by > PI) by -= TWO_PI
    if (by < -PI) by += TWO_PI
    facing = Math.abs(by) <= TURN_STEP ? target : reduced(facing + Math.sign(by) * TURN_STEP)
  }
  const step = FLIGHT_SPEED * ticks
  let x = state.x + Math.round(Math.sin(facing / ONE) * step)
  let z = state.z + Math.round(Math.cos(facing / ONE) * step)
  let shiftX = 0
  let shiftZ = 0
  if (x >= WRAP.x) shiftX = -WRAP.spanX
  else if (x < -WRAP.x) shiftX = WRAP.spanX
  if (z >= WRAP.z) shiftZ = -WRAP.spanZ
  else if (z < -WRAP.z) shiftZ = WRAP.spanZ
  x += shiftX
  z += shiftZ
  const hitch = {
    x: x - Math.round(Math.sin(facing / ONE) * HITCH),
    z: z - Math.round(Math.cos(facing / ONE) * HITCH),
  }
  const follow = (lead: { x: number; z: number }, car: Carriage): Carriage => {
    const cx = car.x + shiftX
    const cz = car.z + shiftZ
    const dx = lead.x - cx
    const dz = lead.z - cz
    const length = Math.hypot(dx, dz) || 1
    return {
      x: lead.x - Math.round((dx / length) * HITCH),
      z: lead.z - Math.round((dz / length) * HITCH),
      facing: reduced(Math.round(Math.atan2(dx, dz) * ONE)),
    }
  }
  const first = follow(hitch, state.carriages[0])
  const second = follow(first, state.carriages[1])
  return { x, y: FLIGHT_HEIGHT, z, facing, carriages: [first, second] }
}

/** The sky's place for a place in a field region, both in the game's fixed point. */
export function skyOf(world: { x: number; z: number }, local: { x: number; z: number }) {
  return {
    x: Math.round(local.x / SKY_UNIT + (world.x * ONE) / SKY_UNIT),
    z: Math.round(local.z / SKY_UNIT + (world.z * ONE) / SKY_UNIT),
  }
}

/** A field region's own place for the sky's, both in the game's fixed point. */
export function fieldOf(world: { x: number; z: number }, sky: { x: number; z: number }) {
  return { x: sky.x * SKY_UNIT - world.x * ONE, z: sky.z * SKY_UNIT - world.z * ONE }
}

/**
 * A region of the sky, as its collision names it: the record a triangle's
 * top seven bits index, a field map's id packed as three five-bit digits —
 * 20000 + 100a + 10b + c (`func_0204bef4`) — and whether the Express may
 * land there, bits 5 to 9 of the second halfword (`func_0204bedc`). A record
 * of all zero is the sea.
 */
export interface SkyRegion {
  readonly map: number | undefined
  readonly land: boolean
}

/** Read a sky collision's trailing record — see {@link SkyRegion}. */
export function skyRegionOf(record: Uint8Array): SkyRegion {
  const packed = (record[0] ?? 0) | ((record[1] ?? 0) << 8)
  const flags = (record[2] ?? 0) | ((record[3] ?? 0) << 8)
  const map =
    packed === 0
      ? undefined
      : 20000 + (packed & 0x1f) * 100 + ((packed >> 5) & 0x1f) * 10 + ((packed >> 10) & 0x1f)
  return { map, land: (flags & 0x3e0) !== 0 }
}

/** The index a sky triangle's attributes give its region — the top seven bits. */
export function regionIndexOf(attributes: number): number {
  return attributes >>> 25
}
