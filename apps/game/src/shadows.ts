import type { Piece } from '@minstrel/gl'
import { type Model, type ModelMaterial, poseGeometry, readNsbmd } from '@minstrel/nitro-gfx'
import { placeGeometry, WORLD_SCALE } from '@minstrel/world'

/**
 * The round shadow under a character: `kage` — *shadow* — in the icon archive,
 * among the things the engine draws in the world by itself (see `chests.ts`).
 * One flat square, 1.13 across in the files' own units and 16 vertices, lying
 * at height 0, with a 16×16 texture in a translucent format, so it is drawn in
 * the blended pass.
 *
 * INFERRED: that it goes under the characters — from its name and its shape —
 * and its size: the files' own units, like the chests beside it, which makes it
 * three quarters of a person across, the texture's soft edge taking up much of
 * that. Whether the game scales it per character is not read.
 */

export const SHADOW_ARCHIVE = '/data/bin/icon.nsarc/kage.chr'
const SHADOW_FILE = 'kage.nsbmd'
/** Lifted this far off the ground, so the two do not fight. A choice. */
const LIFT = 0.003

/** The shadow's model, out of its archive's files; undefined when it will not read. */
export function shadowModelOf(
  files: ReadonlyMap<string, Uint8Array> | undefined,
): Model | undefined {
  for (const [file, bytes] of files ?? []) {
    if (file.toLowerCase().split('/').pop() !== SHADOW_FILE) continue
    try {
      return readNsbmd(bytes).models[0]
    } catch {
      return undefined
    }
  }
  return undefined
}

/** A shadow lying on the ground at each of these feet, in world units. */
export function shadowPieces(
  model: Model,
  feet: readonly { readonly x: number; readonly y: number; readonly z: number }[],
  textureOf: (material: ModelMaterial) => Omit<Piece, 'geometry'> | undefined,
): Piece[] {
  const pieces: Piece[] = []
  const shapes = model.shapes.map((shape, index) => {
    const materialIndex = model.shapeMaterials[index]
    const material = materialIndex === undefined ? undefined : model.materials[materialIndex]
    return {
      posed: poseGeometry(model.geometry(shape), model.shapeMatrices[index] ?? model.matrices),
      texture: material ? textureOf(material) : undefined,
    }
  })
  for (const at of feet) {
    for (const { posed, texture } of shapes) {
      const geometry = placeGeometry(posed, { x: at.x, y: at.y + LIFT, z: at.z }, WORLD_SCALE)
      pieces.push(texture ? { geometry, ...texture } : { geometry })
    }
  }
  return pieces
}
