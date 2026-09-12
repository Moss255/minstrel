import { FX32_ONE } from '@minstrel/fixed'
import {
  isCollisionMesh,
  isMarkerVolume,
  isWaterTexture,
  type MapManifest,
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
  /** The resource the piece was built from, by its stem — `M01M00D1`. */
  readonly source?: string
  /** Where it goes, in the map's final space. */
  readonly place: Placement
  /**
   * How much to shrink this piece's own geometry into the world: always
   * {@link WORLD_SCALE}. The model's own `upScale` is already in its geometry.
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

/**
 * How big one of the files' own units is in the world the game simulates.
 *
 * **The only scale between the cartridge and the world.** Every file is read at
 * its own values — a model at its stored positions times its own `upScale`, as
 * its render commands say; a collision mesh at its stored coordinates times
 * `2 ** shift`; placements, doorways and the cast as the floats they are — and
 * they agree with one another with nothing else applied, indoors and out.
 *
 * This only picks the unit: an eighth of the files', which is the unit
 * `PERSON`, the camera and the walking pace were tuned in, and in which the
 * village is about twelve across. It is a choice, not a finding; any value
 * would do so long as the character's constants moved with it.
 */
export const WORLD_SCALE = 1 / 8

export interface AssembleOptions {
  /** Defaults to `day`. */
  readonly lighting?: MapLighting
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
    // A placement is in the file's own units, like everything else here.
    const place = {
      x: authored.x * WORLD_SCALE,
      y: authored.y * WORLD_SCALE,
      z: authored.z * WORLD_SCALE,
    }

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
          meshes.push({
            // Collision is in whole fx32 words; the placement is in units.
            mesh,
            offset: {
              x: Math.round(place.x * FX32_ONE),
              y: Math.round(place.y * FX32_ONE),
              z: Math.round(place.z * FX32_ONE),
            },
            // Stored halved `shift` times — see `CollisionMesh.shift`.
            scale: WORLD_SCALE * 2 ** mesh.shift,
            source: resource.stem,
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
          scale: WORLD_SCALE,
          animation: ownAnimation(model, file, files, members),
          source: resource.stem,
        })
        water.push(...waterOf(model, place, WORLD_SCALE))
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
 * The scale is the caller's; `assembleMap` puts {@link WORLD_SCALE} on every
 * piece.
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
