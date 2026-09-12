import type { Treasure } from '@minstrel/game-formats'
import type { Piece } from '@minstrel/gl'
import { type Model, type ModelMaterial, poseGeometry, readNsbmd } from '@minstrel/nitro-gfx'
import { placeGeometry, WORLD_SCALE } from '@minstrel/world'
import { swingGeometry } from './swing.ts'

/**
 * Chests: the model the engine draws a placed treasure with.
 *
 * `/data/bin/icon.nsarc` holds the things the engine draws in the world by
 * itself rather than a map drawing them — speech bubbles, battle cursors, the
 * pot and barrel sprites, a coffin, a round shadow — and among them
 * `T00GDS01` to `04`. They are two chests, each shut and open: `01` and `03` a
 * box with its lid down, 0.41 high; `02` and `04` the same box with the lid
 * thrown back, 0.23 high and reaching out behind. `01` and `02` share one
 * texture, red-brown; `03` and `04` another, grey. No file names them as
 * chests; that they are is read from the shapes and where they sit.
 *
 * Three readings here are INFERRED:
 *
 * - **Which treasures are chests**: those with a facing, kinds `0x8` and `0x40`
 *   and the rarer `0x0`, `0x4` and `0x9` — a chest needs to face a way, a pot
 *   does not.
 * - **Which is which**: kind `0x40` takes the second, grey chest and the rest
 *   the first. The more common kind is taken for the plain chest; nothing read
 *   decides it.
 * - **Size and front**: in the files' own units, like the map, so 0.41 is 28%
 *   of a person's height — in the characters' space, where the coffin beside
 *   them is a person long, it would be 1%. The open lids fall towards +z, so
 *   the front is −z before the facing turns it.
 */

export const CHEST_ARCHIVE = '/data/bin/icon.nsarc'
/** Each chest's models, shut and open, as the archive names them. */
export const CHEST_MODELS: readonly (readonly [shut: string, open: string])[] = [
  ['T00GDS01', 'T00GDS02'],
  ['T00GDS03', 'T00GDS04'],
]
/** The kind drawn with the second chest — INFERRED, see above. */
export const SECOND_CHEST_KIND = 0x40

export interface ChestLook {
  readonly shut: Model | undefined
  readonly open: Model | undefined
}

/** The chest models, out of the icon archive's files; a missing one is undefined. */
export function chestModelsOf(files: ReadonlyMap<string, Uint8Array> | undefined): ChestLook[] {
  const model = (name: string): Model | undefined => {
    const wanted = `${name.toLowerCase()}.nsbmd`
    for (const [file, bytes] of files ?? []) {
      if (file.toLowerCase().split('/').pop() !== wanted) continue
      try {
        return readNsbmd(bytes).models[0]
      } catch {
        return undefined
      }
    }
    return undefined
  }
  return CHEST_MODELS.map(([shut, open]) => ({ shut: model(shut), open: model(open) }))
}

/** Whether a treasure is drawn as a chest: placed, and facing a way. */
export function isChest(treasure: Treasure): boolean {
  return treasure.position !== undefined && treasure.facing !== undefined
}

/** Which of the chests a treasure is drawn with. */
export function chestLook(treasure: Treasure): number {
  return treasure.kind === SECOND_CHEST_KIND ? 1 : 0
}

/**
 * The chests to draw: each chest-kind treasure's model, shut or open, turned
 * by its facing and standing where it is placed.
 */
export function chestPieces(
  treasures: readonly Treasure[],
  looks: readonly ChestLook[],
  isOpen: (treasure: Treasure, slot: number) => boolean,
  textureOf: (material: ModelMaterial) => Omit<Piece, 'geometry'> | undefined,
): Piece[] {
  const pieces: Piece[] = []
  for (const [slot, treasure] of treasures.entries()) {
    const at = treasure.position
    if (!at || !isChest(treasure)) continue
    const look = looks[chestLook(treasure)]
    const model = isOpen(treasure, slot) ? look?.open : look?.shut
    if (!model) continue
    for (const [index, shape] of model.shapes.entries()) {
      const posed = poseGeometry(
        model.geometry(shape),
        model.shapeMatrices[index] ?? model.matrices,
      )
      const geometry = placeGeometry(swingGeometry(posed, treasure.facing ?? 0), at, WORLD_SCALE)
      const materialIndex = model.shapeMaterials[index]
      const material = materialIndex === undefined ? undefined : model.materials[materialIndex]
      const texture = material ? textureOf(material) : undefined
      pieces.push(texture ? { geometry, ...texture } : { geometry })
    }
  }
  return pieces
}
