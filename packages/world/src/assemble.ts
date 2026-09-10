import { FX32_ONE } from '@minstrel/fixed'
import {
  isCollisionMesh,
  isMarkerVolume,
  isWaterTexture,
  type MapManifest,
  PLACED_PIECE_SCALE,
  placementOf,
  readCollisionMesh,
  resolveMapResources,
} from '@minstrel/game-formats'
import {
  type Animation,
  type Geometry,
  isNsbca,
  isNsbmd,
  type Model,
  measureBounds,
  readNsbca,
  readNsbmd,
} from '@minstrel/nitro-gfx'
import type { PlacedMesh } from '@minstrel/sim'

/**
 * Build a map out of the loose files its descriptor names.
 *
 * A map is not one model. Its archive holds a dozen files with no index between
 * them and a `.bmdj` beside them saying which of them the map is made of, where
 * each one goes, and what it is attached to.
 */

/** Where the map puts a piece. */
export interface Placement {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** One model of a map, where it goes, and the animation it drives itself with. */
export interface MapPiece {
  readonly model: Model
  /** Where it goes, in the map's final space. */
  readonly place: Placement
  /**
   * How much to shrink this piece's own geometry.
   *
   * A piece the map moves is authored in the larger space and always wants
   * `PLACED_PIECE_SCALE`. One it does not move is the map itself, and wants
   * whatever space the map is in — an eighth indoors, unchanged outdoors.
   */
  readonly scale: number
  /**
   * The animation compiled from the same authored resource.
   *
   * A map is not a still life. The village's sky model carries a 541-frame
   * joint animation, and without it its four cloud nodes sit at one point: the
   * bind pose puts them all in the same place and the animation is what drifts
   * them apart across the sky. Same for the waterfall.
   */
  readonly animation: Animation | undefined
}

/**
 * Where a map's water is, as a footprint and a surface height.
 *
 * A map's textures are named for what they are — `m01m00wtr01` is water beside
 * `m01m00grs01` — and the village's water is two flat planes straight across
 * the middle, which is exactly where a spawn looking for the map's centre
 * lands. Nothing else is read from it: this is only for not standing a
 * character in the sea.
 */
export interface WaterArea {
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
  readonly surface: number
}

/**
 * Which of a map's two lightings to build.
 *
 * **A map ships twice over.** Beside its terrain sit resources whose stems end
 * in `L1`..`L6` and `N1`..`N6`, and they are the same geometry lit two ways:
 * the village's `M01M00L1` binds `m01m00win01` and its rainbow, `M01M00N1`
 * binds `m01m00win02` and nothing else. The two window textures cover the same
 * 840 opaque pixels and differ only in colour — `win02` is brighter and
 * yellower, luminance 165 against 123, which is a lit window.
 *
 * So `N` is night and `L` is day, and building both draws a village whose
 * windows are lit and unlit at once. **234 archives carry both**, and on 168 of
 * them the two counts are equal, which is what a paired set looks like.
 */
export type MapLighting = 'day' | 'night'

export interface AssembleOptions {
  /** Defaults to `day`. */
  readonly lighting?: MapLighting
  /**
   * How much to shrink the map's own space, for a map authored in a larger one.
   *
   * `1` for an outdoor map, which is authored at its final size, and
   * `PLACED_PIECE_SCALE` for an indoor one, which is not — see
   * `MapEntry.indoors` for what says which and for the evidence. It applies to
   * the map's own geometry, its collision, its water, and to every placement;
   * a placed piece's *geometry* is already in the larger space and keeps
   * `PLACED_PIECE_SCALE` whatever this is.
   */
  readonly scale?: number
  /**
   * A further scale on the collision alone, on top of {@link scale}.
   *
   * **Fitted by eye, and it is one of the numbers here that no file gives.** An
   * interior's collision does not sit where its room is drawn: the mesh comes
   * out about half the size of the room around it, so the walls stand in open
   * floor and the walkable area covers a fraction of the floorboards. Nothing
   * in the `.col2` header, the map manifest, the map index or the model tells a
   * map that needs the correction from one that does not — the item shop and
   * the stable carry the same `unknown_0x04`, the same cell size, the same
   * kind, and the same model position scale.
   *
   * So it is applied as a constant and recorded as fitted. `2` was arrived at
   * by moving the mesh over the room in the game until it lined up — see
   * `docs/next.md`, and `?collision=1` with the fitting keys to do it again.
   *
   * **What this is not.** It is not derived, not measured against a field, and
   * not established for every map: the well, `M01M08`, is the one village
   * interior whose collision measures *larger* than its room, by about the same
   * factor in the other direction. A single constant cannot be right for both,
   * and this one is right for the rooms that were fitted.
   *
   * `1` leaves the collision where the file puts it, which is what an outdoor
   * map wants: outdoors the two agree already.
   */
  readonly collisionScale?: number
}

/**
 * Which lighting a resource belongs to, if it belongs to one.
 *
 * The suffix is a letter and a digit at the end of the stem — `M01M00N1` — and
 * a resource without one is in both, like the terrain everything stands on.
 */
export function lightingOf(stem: string): MapLighting | undefined {
  const suffix = /([LN])(\d)$/i.exec(stem)
  if (!suffix) return undefined
  return (suffix[1] as string).toUpperCase() === 'N' ? 'night' : 'day'
}

export interface AssembledMap {
  readonly pieces: readonly MapPiece[]
  /**
   * The map's collision, one entry per piece that has any.
   *
   * **A map's collision is several meshes, not one.** The village has thirteen,
   * and any single one of them is a handful of triangles with nowhere to stand.
   * A world is built from all of a map's collision or from none of it.
   */
  readonly meshes: readonly PlacedMesh[]
  readonly water: readonly WaterArea[]
  /** Resources the archive holds no file for, and files that would not read. */
  readonly missing: readonly string[]
}

/**
 * Load every model a map's descriptor names, and place it.
 *
 * A door is modelled at its own origin and placed at the building it belongs
 * to; drawing it unplaced leaves all ten of them stacked in the middle of the
 * map, in the air, with their collision boxes stacked there too — which is
 * walls where there is nothing and nothing where there are walls.
 */
export function assembleMap(
  manifest: MapManifest,
  members: ReadonlyMap<string, Uint8Array>,
  options: AssembleOptions = {},
): AssembledMap {
  const lighting = options.lighting ?? 'day'
  const mapScale = options.scale ?? 1
  const collisionScale = options.collisionScale ?? 1
  const pieces: MapPiece[] = []
  const meshes: PlacedMesh[] = []
  const water: WaterArea[] = []
  const missing: string[] = []

  for (const { resource, files } of resolveMapResources(manifest, members.keys())) {
    if (files.length === 0) {
      missing.push(resource.name)
      continue
    }
    // The other lighting's copy of this piece is not a second piece.
    const belongs = lightingOf(resource.stem)
    if (belongs !== undefined && belongs !== lighting) continue
    const authored = placementOf(manifest, resource)
    // A placement is in the map's own space, so it shrinks with the map.
    const place = {
      x: authored.x * mapScale,
      y: authored.y * mapScale,
      z: authored.z * mapScale,
    }
    // A piece the map moves is instanced from the larger space; one it leaves
    // at the origin is the map itself.
    const moved = authored.x !== 0 || authored.y !== 0 || authored.z !== 0
    const pieceScale = moved ? PLACED_PIECE_SCALE : mapScale

    // One authored resource compiles to several files under the same stem, so
    // take each for what it is rather than picking one and hoping. Choosing
    // looks harmless and is not: taking the first match loses a map's main
    // geometry to the descriptor sitting beside it under the same stem, and the
    // map still assembles — just without most of itself.
    for (const file of files) {
      const bytes = members.get(file)
      if (!bytes) continue

      if (isCollisionMesh(bytes)) {
        try {
          const mesh = readCollisionMesh(bytes)
          // A doorway's marker is not a wall. Left in, the village's ten
          // doorways are sealed and its walkable ground drops from 93% to 24%.
          if (isMarkerVolume(mesh)) continue
          // **Not scaled**, unlike the drawn geometry beside it. Tried and
          // measured: scaling placed collision by `PLACED_PIECE_SCALE` the way
          // `placeGeometry` scales placed models takes doorways standing over
          // their own map's floor from 100% to 63.9% on `T` interiors and moves
          // every other kind of map the wrong way too. A model is authored at
          // its own origin and instanced; a collision volume is authored where
          // it sits, so it wants the offset and nothing else.
          meshes.push({
            // Collision is in whole fx32 words; the placement is in units.
            mesh,
            offset: {
              x: Math.round(place.x * FX32_ONE),
              y: Math.round(place.y * FX32_ONE),
              z: Math.round(place.z * FX32_ONE),
            },
            // The map's own space, never `PLACED_PIECE_SCALE`. Tried and
            // measured: scaling *placed* collision the way placed geometry is
            // scaled takes doorways standing over their own floor from 100% to
            // 63.9% on `T` interiors. A model is authored at its own origin and
            // instanced; a collision volume is authored where it sits.
            //
            // `collisionScale` is the correction on top of that, and is fitted
            // rather than derived — see the option.
            scale: mapScale * collisionScale,
          })
        } catch {
          missing.push(file)
        }
        continue
      }

      if (!isNsbmd(bytes)) continue
      try {
        const model = readNsbmd(bytes).models[0]
        if (!model?.numShapes) continue
        pieces.push({
          model,
          place: { x: place.x, y: place.y, z: place.z },
          scale: pieceScale,
          animation: ownAnimation(model, file, files, members),
        })
        water.push(...waterOf(model, place, pieceScale))
      } catch {
        missing.push(file)
      }
    }
  }

  return { pieces, meshes, water, missing }
}

/** The animation compiled from the same authored resource as this model. */
function ownAnimation(
  model: Model,
  self: string,
  siblings: readonly string[],
  members: ReadonlyMap<string, Uint8Array>,
): Animation | undefined {
  for (const sibling of siblings) {
    if (sibling === self) continue
    const beside = members.get(sibling)
    if (!beside || !isNsbca(beside)) continue
    try {
      const found = readNsbca(beside).animations.find((a) => a.boneCount === model.nodes.length)
      if (found) return found
    } catch {
      // An animation that will not read simply is not played.
    }
  }
  return undefined
}

/** The footprint of every water surface a model draws. */
function waterOf(model: Model, at: Placement, scale: number): WaterArea[] {
  const found: WaterArea[] = []
  for (let shape = 0; shape < model.numShapes; shape++) {
    const materialIndex = model.shapeMaterials[shape]
    const material = materialIndex === undefined ? undefined : model.materials[materialIndex]
    const texture = material?.texture
    if (texture === undefined || !isWaterTexture(texture)) continue
    const bounds = measureBounds([model.posedGeometry(shape)])
    found.push({
      minX: bounds.minX * scale + at.x,
      maxX: bounds.maxX * scale + at.x,
      minZ: bounds.minZ * scale + at.z,
      maxZ: bounds.maxZ * scale + at.z,
      surface: bounds.maxY * scale + at.y,
    })
  }
  return found
}

/**
 * Is this spot in the water?
 *
 * Within a character's height of the surface, not merely below it. The
 * village's spawn stood on a sandbank 0.17 above a river surface at -0.31,
 * which for a character 0.18 tall is knee-deep in it.
 */
export function inWater(
  water: readonly WaterArea[],
  x: number,
  y: number,
  z: number,
  height: number,
): boolean {
  return water.some(
    (area) =>
      x >= area.minX &&
      x <= area.maxX &&
      z >= area.minZ &&
      z <= area.maxZ &&
      y <= area.surface + height,
  )
}

/**
 * Move a posed shape to where the map puts the model it belongs to.
 *
 * A piece is scaled about its own base rather than its centre, so resizing it
 * slides it up or down the wall it stands against instead of sinking it into
 * the ground.
 *
 * **The scale is decided by the caller**, and `assembleMap` puts it on the
 * piece: `PLACED_PIECE_SCALE` for a piece the map moves, which is instanced
 * from the larger authored space, and the map's own scale for one it does not,
 * which is the map itself. Deciding it here from whether the piece had moved
 * was wrong for indoor maps, whose own geometry is in the larger space while
 * sitting at the origin.
 */
export function placeGeometry(geometry: Geometry, place: Placement, scale: number): Geometry {
  if (scale === 1 && place.x === 0 && place.y === 0 && place.z === 0) return geometry
  return {
    ...geometry,
    vertices: geometry.vertices.map((v) => ({
      ...v,
      x: v.x * scale + place.x,
      y: v.y * scale + place.y,
      z: v.z * scale + place.z,
    })),
  }
}
