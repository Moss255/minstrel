import type { GrottoFloor } from './floor.ts'
import { type GrottoTile, placeOnTile, turnPlaces } from './tiles.ts'

/**
 * **A grotto floor's ways up and down** — `func_0201a600` (US ARM9), read
 * 11 October 2026, run as a floor is entered.
 *
 * Each is put on its tile — the generator's `up` and `down` — by
 * `GenerateGrottoObjectPositionOrientation`, after `srand(the map's seed)`
 * (the map's own, not the floor's), facing down, right or left first: one of
 * the tile's places and a way to face there. The way up is turned to that way
 * (up `0x3243`, right `0x1921`, down 0, left `0x4b65`); the way down is not
 * turned. In environment 2, the ruins, either stands `0x666` higher on a
 * corridor or a dead end (the bytes of `data_020e6e44`).
 *
 * Each has a box that takes the party through (`func_0201e574` adds it to the
 * map's regions): the way up's half a unit across and a quarter deep, up to
 * three high; the way down's three quarters each way, from a unit below to
 * two above. The way up leads to the floor above — from the first floor, out
 * to the field — and the way down to the floor below, or from the last floor
 * to the environment's boss floor.
 *
 * **Coming down onto a floor** — from a smaller map id, or from the field —
 * puts the party 1.5 units in front of its way up, the way it faces; **coming
 * up**, in front of its way down. All in the game's `fx32` units.
 */

/** The ways a placed thing may face (`ChooseTileFeatureOrientation`): 0 up, 1 right, 2 down, 3 left. */
export type Facing = 0 | 1 | 2 | 3

/** One way, up or down: where it stands, which way it faces, and its turn and angle. */
export interface GrottoStair {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly facing: number
  /** Quarter turns about y the model is drawn and collided with. */
  readonly turn: number
  /** The same as the game keeps it, × 4096 to the radian. */
  readonly angle: number
}

/** The game's `rand`, seeded. */
class Rand {
  private next: number
  constructor(seed: number) {
    this.next = seed >>> 0
  }
  draw(): number {
    this.next = (Math.imul(this.next, 0x41c64e6d) + 0x3039) >>> 0
    return (this.next >>> 16) & 0x7fff
  }
}

/** Corridor and dead-end bytes: in the ruins a way stands raised on them (`data_020e6e44`). */
const RAISED = new Set([
  0xbb, 0xee, 0xeb, 0xaf, 0xbe, 0xfa, 0xaa, 0xea, 0xab, 0xae, 0xba, 0xfb, 0xef, 0xbf, 0xfe,
])
/** How much higher (`0x666`). */
const RAISE = 0x666

/** The way up's turn for each facing, and its angle. */
const UP_TURN = [2, 1, 0, 3] as const
const ANGLE = [0, 0x1921, 0x3243, 0x4b65] as const

/**
 * Where a floor's two ways stand. `places` gives a tile kind's nine places by
 * its name — the environment's `.bpos`, see `readTilePlacements`.
 */
export function grottoStairs(
  floor: GrottoFloor,
  tiles: readonly GrottoTile[],
  places: (name: string) => readonly number[] | undefined,
  seed: number,
  environment: number,
): { readonly up: GrottoStair | undefined; readonly down: GrottoStair | undefined } {
  const put = (at: { x: number; y: number }, up: boolean): GrottoStair | undefined => {
    const tile = tiles[at.y * 16 + at.x]
    if (!tile) return undefined
    const turned = turnPlaces(places(tile.name) ?? [0, 0, 0, 0, 0, 0, 0, 0, 0], tile.turn)
    const rand = new Rand(seed & 0xffff)
    const object = placeOnTile(tile.name, turned, at.x, at.y, () => rand.draw(), true)
    if (!object) return undefined
    const raised =
      environment === 2 && RAISED.has(floor.adjacency[(at.y << 4) + at.x] as number) ? RAISE : 0
    const turn = up ? (UP_TURN[object.facing as Facing] ?? 0) : 0
    return { x: object.x, y: raised, z: object.z, facing: object.facing, turn, angle: ANGLE[turn] }
  }
  return { up: put(floor.up, true), down: put(floor.down, false) }
}

/** A box that takes the party through, in the game's units. */
export interface StairBox {
  readonly x: number
  readonly z: number
  /** Half its extent across and deep. */
  readonly halfX: number
  readonly halfZ: number
  readonly bottom: number
  readonly top: number
}

/** The way up's box: ±`0x800` across, ±`0x400` deep, 0 to `0x3000` high. */
export function upBox(up: GrottoStair): StairBox {
  return { x: up.x, z: up.z, halfX: 0x800, halfZ: 0x400, bottom: 0, top: 0x3000 }
}

/** The way down's box: ±`0xc00` each way, `−0x1000` to `0x2000` high. */
export function downBox(down: GrottoStair): StairBox {
  return { x: down.x, z: down.z, halfX: 0xc00, halfZ: 0xc00, bottom: -0x1000, top: 0x2000 }
}

/**
 * Where the party is put arriving by a way, and facing which way, × 4096 to
 * the radian: 1.5 units in front of it — up `−z`, right `+x`, down `+z`, left
 * `−x` — facing away from it.
 */
export function arrivalAt(stair: GrottoStair): { x: number; z: number; angle: number } {
  switch (stair.facing) {
    case 0:
      return { x: stair.x, z: stair.z - 0x1800, angle: 0x3243 }
    case 1:
      return { x: stair.x + 0x1800, z: stair.z, angle: 0x1921 }
    case 3:
      return { x: stair.x - 0x1800, z: stair.z, angle: 0x4b65 }
    default:
      return { x: stair.x, z: stair.z + 0x1800, angle: 0 }
  }
}

/** The first of a grotto's main floors, by map id (`func_ov017_02198aa0`): 40001, the floor its id modulo 20. */
export const FIRST_FLOOR = 40001

/**
 * A boss floor's map id: `41101 + 100 · (environment − 1)` and the grotto
 * record's `+8` (`func_0201a600`, `func_ov017_02198aa0`). The Treasure Maps
 * menu sets that as a map is chosen (`func_ov004_02164928`), from
 * `func_02090294`: a count of 0 to 4 kept in the save that steps on each
 * time, passing over values four other records hold — what those are is not
 * known (the decomp's `ActiveGrottoClass.h` says as much).
 */
export function bossFloor(environment: number, slot = 0): number {
  const base = [0xa08d, 0xa08d, 0xa0f1, 0xa155, 0xa1b9, 0xa21d][environment] ?? 0xa08d
  return base + slot
}

/** A boss floor's way up (`func_0201a600`): at (0, `0x11000`), its box `0x2000` every way about `0x1000` high. */
export const BOSS_UP: StairBox = {
  x: 0,
  z: 0x11000,
  halfX: 0x2000,
  halfZ: 0x2000,
  bottom: 0x1000 - 0x2000,
  top: 0x1000 + 0x2000,
}
