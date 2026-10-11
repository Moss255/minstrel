import type { Catalogue } from '@minstrel/cartridge'
import { type MapTransition, readTilePlacements, type TilePlacement } from '@minstrel/game-formats'
import {
  arrivalAt,
  downBox,
  floorTiles,
  type GrottoStair,
  grottoFloor,
  grottoStairs,
  type StairBox,
  upBox,
} from '@minstrel/sim'
import { type AssembledMap, assembleGrottoFloor, WORLD_SCALE } from '@minstrel/world'

/**
 * **A grotto, walked** — the floor the game's generator lays out
 * (`grottoFloor`), built out of its environment's pieces
 * (`assembleGrottoFloor`), with its ways up and down as doorways.
 *
 * A grotto's floors are maps of their own in the index — 40001 is `Z00M01`,
 * to `Z00M16` — that have no archive: the game builds each from `Z0nM01`
 * and the active treasure map (`Zone3D::SwitchZone`, `func_0201a600`). So
 * here: a `Z00Mnn` asked for while a grotto is active is built, its floor the
 * id modulo 20.
 */

/** The active grotto, as the Treasure Maps menu makes it (`func_ov004_02164928`, the record at `GameState+0x63e4`). */
export interface GrottoVisit {
  /** The treasure map's seed (`SeedOrMinTurns`). */
  readonly seed: number
  /** 1 caves, 2 ruins, 3 ice, 4 water, 5 fire (`+5`). */
  readonly environment: number
  /** How many floors (`GetFloorCount`). */
  readonly floors: number
  /**
   * Where the way up from the first floor leads (`+0xc`, `+0x10`): the
   * field's code and the entrance's place in the game's `fx32` units. The
   * party comes out 2 units to +z of it (`func_0201a600`).
   */
  readonly entrance: {
    readonly code: string
    readonly x: number
    readonly y: number
    readonly z: number
  }
}

/** A grotto floor's map code: `Z00M01` to `Z00M16`. */
export function grottoCode(floor: number): string {
  return `Z00M${String(floor).padStart(2, '0')}`
}

/** The floor a map code is of a grotto's, 1 to 19, or undefined for any other map. */
export function grottoFloorNumber(code: string): number | undefined {
  const m = /^z00m(\d\d)$/i.exec(code)
  if (!m) return undefined
  const floor = Number(m[1]) % 20
  return floor === 0 ? undefined : floor
}

/** A floor's tiles and its ways, worked out again — cheap, and what a doorway's arrival needs. */
function floorOf(visit: GrottoVisit, number: number, places: readonly TilePlacement[]) {
  const floor = grottoFloor(visit.seed, number)
  const tiles = floorTiles(floor)
  const stairs = grottoStairs(
    floor,
    tiles,
    (name) => places.find((p) => p.name === name)?.directions,
    visit.seed,
    visit.environment,
  )
  return { floor, tiles, stairs }
}

/** The environment's archive's files by name: `.amdj` for pieces, `.ambl` for the `.bpos`. */
function archiveOf(cat: Catalogue, environment: number, ext: string) {
  const want = `/data/map/z0${environment}m01.${ext}`
  for (const [path, files] of cat.members) if (path.toLowerCase() === want) return files
  return undefined
}

/** A doorway in world units for a box in the game's, arriving at a place in the game's. */
function doorway(
  to: string,
  box: StairBox,
  arrive: { x: number; y: number; z: number; angle: number },
): MapTransition {
  const w = WORLD_SCALE / 4096
  return {
    tag: 0,
    to,
    x: box.x * w,
    y: ((box.bottom + box.top) / 2) * w,
    z: box.z * w,
    width: 2 * box.halfX * w,
    height: (box.top - box.bottom) * w,
    depth: 2 * box.halfZ * w,
    angle: 0,
    arriveX: arrive.x * w,
    arriveY: arrive.y * w,
    arriveZ: arrive.z * w,
    arriveFacing: arrive.angle / 4096,
  }
}

/** Where the party stands arriving by a way, in world units. */
export interface GrottoArrival {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly facing: number
}

function arrivalBy(stair: GrottoStair): GrottoArrival {
  const a = arrivalAt(stair)
  const w = WORLD_SCALE / 4096
  return { x: a.x * w, y: stair.y * w, z: a.z * w, facing: a.angle / 4096 }
}

/** A built floor: the map, its doorways and where coming down onto it puts the party. */
export interface BuiltGrottoFloor {
  readonly archive: string
  readonly map: AssembledMap
  readonly doorways: readonly MapTransition[]
  /** In front of the way up — coming down onto the floor, from the field or the floor above. */
  readonly down: GrottoArrival | undefined
}

/**
 * Build floor `number` of the active grotto. Undefined when the environment's
 * archives are not in the catalogue.
 *
 * The way up leads to the floor above, arriving in front of its way down; from
 * the first floor, out to the field, 2 units to +z of the entrance. The way
 * down leads to the floor below, arriving in front of its way up. **From the
 * last floor it leads to the boss floor, which is not built** — so there it
 * leads nowhere.
 */
export function buildGrottoFloor(
  cat: Catalogue,
  visit: GrottoVisit,
  number: number,
): BuiltGrottoFloor | undefined {
  const pieces = archiveOf(cat, visit.environment, 'amdj')
  const links = archiveOf(cat, visit.environment, 'ambl')
  if (!pieces || !links) return undefined
  const bpos = [...links].find(([name]) => name.toLowerCase().endsWith('.bpos'))
  const places = bpos ? readTilePlacements(bpos[1]) : []

  const here = floorOf(visit, number, places)
  const map = assembleGrottoFloor(pieces, visit.environment, here.tiles, here.stairs)
  const doorways: MapTransition[] = []
  const { up, down } = here.stairs
  if (up) {
    if (number === 1) {
      const e = visit.entrance
      // The facing out of the grotto is not set here; the field's 0 is kept.
      doorways.push(doorway(e.code, upBox(up), { x: e.x, y: e.y, z: e.z + 0x2000, angle: 0 }))
    } else {
      const above = floorOf(visit, number - 1, places).stairs.down
      if (above) {
        const a = arrivalAt(above)
        doorways.push(doorway(grottoCode(number - 1), upBox(up), { ...a, y: above.y }))
      }
    }
  }
  if (down && number < visit.floors) {
    const below = floorOf(visit, number + 1, places).stairs.up
    if (below) {
      const a = arrivalAt(below)
      doorways.push(doorway(grottoCode(number + 1), downBox(down), { ...a, y: below.y }))
    }
  }
  return {
    archive: `Z0${visit.environment}M01.amdj`,
    map,
    doorways,
    down: up ? arrivalBy(up) : undefined,
  }
}
