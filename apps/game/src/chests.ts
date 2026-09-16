import type { Treasure } from '@minstrel/game-formats'
import type { Piece } from '@minstrel/gl'
import {
  type Geometry,
  type Model,
  type ModelMaterial,
  measureBounds,
  poseGeometry,
  readNsbmd,
} from '@minstrel/nitro-gfx'
import { placeGeometry, WORLD_SCALE } from '@minstrel/world'
import { swingGeometry } from './swing.ts'

/**
 * Chests: the model the engine draws a placed treasure with.
 *
 * `/data/bin/icon.nsarc` holds the things the engine draws in the world by
 * itself rather than a map drawing them — speech bubbles, battle cursors, the
 * pot and barrel sprites, a coffin, a round shadow — and among them
 * `T00GDS01` to `04`. **They are two chests, each a body and a lid**: `01` and
 * `03` the body, a box 0.41 high whose top face is drawn as the dark inside;
 * `02` and `04` the lid alone, a dome 0.23 high reaching 0.68 from its own
 * origin along +z. `01` and `02` share one texture, red-brown; `03` and `04`
 * another, grey.
 *
 * **How they go together is read from the casino's prize chest**,
 * `/data/enemy/z077a_i0.chr`, whose model has both as nodes, `T00GDS01` and
 * `T00GDS02`: the lid's node stands at (0, 6.3, −5.2) in a model whose body is
 * 6.29 high and 5.21 either side of its middle — on the body's top, its origin
 * on the body's −z edge, where it covers the body exactly. The lid's origin is
 * its hinge, so **the back is −z and the front +z** — as the village's chest in
 * `M01M08` stands, with no floor behind its −z side. (Read earlier as a shut
 * chest and an open one; the "open" model was the lid by itself.) Nothing on
 * the cartridge animates the lid: the casino chest's motions leave it be.
 *
 * INFERRED or ours:
 *
 * - **Which treasures are chests** (INFERRED): those with a facing, kinds `0x8`
 *   and `0x40` and the rarer `0x0`, `0x4` and `0x9` — a chest needs to face a
 *   way, a pot does not.
 * - **Which is which** (INFERRED): kind `0x40` takes the second, grey chest and
 *   the rest the first; nothing read decides it.
 * - **Size** (INFERRED): in the files' own units, like the map.
 * - **How far the lid goes back** (ours): {@link LID_OPEN_ANGLE}, a little past
 *   upright, turning about the hinge.
 */

export const CHEST_ARCHIVE = '/data/bin/icon.nsarc'
/** Each chest's models, body and lid, as the archive names them. */
export const CHEST_MODELS: readonly (readonly [body: string, lid: string])[] = [
  ['T00GDS01', 'T00GDS02'],
  ['T00GDS03', 'T00GDS04'],
]
/** The kind drawn with the second chest — INFERRED, see above. */
export const SECOND_CHEST_KIND = 0x40
/** How far an open lid is turned back about its hinge, in radians: 110° — ours. */
export const LID_OPEN_ANGLE = (110 * Math.PI) / 180

export interface ChestLook {
  readonly body: Model | undefined
  readonly lid: Model | undefined
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
  return CHEST_MODELS.map(([body, lid]) => ({ body: model(body), lid: model(lid) }))
}

/** Whether a treasure is drawn as a chest: placed, and facing a way. */
export function isChest(treasure: Treasure): boolean {
  return treasure.position !== undefined && treasure.facing !== undefined
}

/** Which of the chests a treasure is drawn with. */
export function chestLook(treasure: Treasure): number {
  return treasure.kind === SECOND_CHEST_KIND ? 1 : 0
}

/** Each shape of a model, posed in its own space. */
function posedShapes(model: Model): { geometry: Geometry; material: number | undefined }[] {
  return model.shapes.map((shape, index) => ({
    geometry: poseGeometry(model.geometry(shape), model.shapeMatrices[index] ?? model.matrices),
    material: model.shapeMaterials[index],
  }))
}

/**
 * A lid's geometry turned back by `angle` about its hinge — its own x axis —
 * and seated on the body: its hinge on the body's top, at its −z edge.
 */
export function seatLid(
  lid: Geometry,
  angle: number,
  hinge: { readonly y: number; readonly z: number },
): Geometry {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return {
    ...lid,
    vertices: lid.vertices.map((v) => ({
      ...v,
      y: hinge.y + v.y * cos + v.z * sin,
      z: hinge.z + v.z * cos - v.y * sin,
    })),
  }
}

/**
 * The chests to draw: each chest-kind treasure's body, and its lid turned back
 * by how open it is — 0 shut, 1 open — all turned by its facing and standing
 * where it is placed.
 */
export function chestPieces(
  treasures: readonly Treasure[],
  looks: readonly ChestLook[],
  openness: (treasure: Treasure, slot: number) => number,
  textureOf: (material: ModelMaterial) => Omit<Piece, 'geometry'> | undefined,
): Piece[] {
  const pieces: Piece[] = []
  for (const [slot, treasure] of treasures.entries()) {
    const at = treasure.position
    if (!at || !isChest(treasure)) continue
    const look = looks[chestLook(treasure)]
    if (!look?.body) continue
    const body = posedShapes(look.body)
    const bounds = measureBounds(body.map((shape) => shape.geometry))
    const angle = Math.max(0, Math.min(1, openness(treasure, slot))) * LID_OPEN_ANGLE
    const hinge = { y: bounds.maxY, z: bounds.minZ }
    const parts = [
      ...body.map((shape) => ({ ...shape, model: look.body as Model })),
      ...(look.lid ? posedShapes(look.lid) : []).map((shape) => ({
        geometry: seatLid(shape.geometry, angle, hinge),
        material: shape.material,
        model: look.lid as Model,
      })),
    ]
    for (const part of parts) {
      const geometry = placeGeometry(
        swingGeometry(part.geometry, treasure.facing ?? 0),
        at,
        WORLD_SCALE,
      )
      const material = part.material === undefined ? undefined : part.model.materials[part.material]
      const texture = material ? textureOf(material) : undefined
      pieces.push(texture ? { geometry, ...texture } : { geometry })
    }
  }
  return pieces
}
