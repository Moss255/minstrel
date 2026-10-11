import { isMapManifest, readMapManifest } from '@minstrel/game-formats'
import {
  type GrottoStair,
  type GrottoTile,
  type PlacedMesh,
  quarterTurn,
  STAIRS_TILE,
} from '@minstrel/sim'
import { type AssembledMap, assembleMap, type MapPiece, WORLD_SCALE } from './assemble.ts'

/**
 * **A grotto floor, put together** from its tiles (`floorTiles`) and its ways
 * up and down (`grottoStairs`), out of the environment's `Z0nM01.amdj`: each
 * tile kind is a piece of its own there, with its own manifest — `Z01MR04A`,
 * model and collision — and the floor is 256 of them, each at its tile, 8 of
 * the game's units apart, turned as its tile is (`func_02019728`). The way up
 * is `S02A`, drawn and stood against where it was put; the way down `S01A`,
 * drawn only — it has no collision on the cartridge.
 *
 * Every tile's collision is numbered by its tile, and the way up's by
 * `STAIRS_TILE`, so the world is tiled as the game's is (see `walls.ts`).
 */
export function assembleGrottoFloor(
  members: ReadonlyMap<string, Uint8Array>,
  environment: number,
  tiles: readonly GrottoTile[],
  stairs: { readonly up: GrottoStair | undefined; readonly down: GrottoStair | undefined },
): AssembledMap {
  const kinds = new Map<string, AssembledMap | undefined>()
  const kind = (name: string): AssembledMap | undefined => {
    if (kinds.has(name)) return kinds.get(name)
    const bytes = members.get(`Z0${environment}M${name}.bmdj`)
    const built =
      bytes && isMapManifest(bytes) ? assembleMap(readMapManifest(bytes), members) : undefined
    kinds.set(name, built)
    return built
  }

  const pieces: MapPiece[] = []
  const meshes: PlacedMesh[] = []
  const missing: string[] = []
  /** Put a kind's pieces and collision down at a world place, turned. */
  const put = (
    name: string,
    x: number,
    y: number,
    z: number,
    turn: number,
    tile: number | undefined,
  ) => {
    const built = kind(name)
    if (!built) {
      missing.push(name)
      return
    }
    for (const piece of built.pieces) {
      const [px, pz] = quarterTurn(piece.place.x, piece.place.z, turn)
      pieces.push({ ...piece, place: { x: px + x, y: piece.place.y + y, z: pz + z, turn } })
    }
    if (tile === undefined) return
    for (const mesh of built.meshes) {
      const at = mesh.offset ?? { x: 0, y: 0, z: 0 }
      const [ox, oz] = quarterTurn(at.x, at.z, turn)
      meshes.push({
        ...mesh,
        offset: {
          x: ox + Math.round(x * 4096),
          y: at.y + Math.round(y * 4096),
          z: oz + Math.round(z * 4096),
        },
        turn,
        tile,
      })
    }
  }

  // The game's units are the world's over WORLD_SCALE: a tile is 8 of them, one here.
  const unit = WORLD_SCALE / 4096
  for (const tile of tiles)
    put(
      tile.name,
      tile.x * 8 * WORLD_SCALE,
      0,
      tile.y * 8 * WORLD_SCALE,
      tile.turn,
      tile.x + 16 * tile.y,
    )
  const { up, down } = stairs
  if (up) put('S02A', up.x * unit, up.y * unit, up.z * unit, up.turn, STAIRS_TILE)
  if (down) put('S01A', down.x * unit, down.y * unit, down.z * unit, down.turn, undefined)

  return { pieces, meshes, water: [], marsh: [], missing }
}
