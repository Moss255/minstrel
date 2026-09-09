import { FX32_ONE } from '@minstrel/fixed'
import type { CollisionBounds } from '@minstrel/game-formats'

/** The extent of one drawn piece. Structural, so any bounds will do. */
export interface Extent {
  readonly minX: number
  readonly minZ: number
  readonly maxX: number
  readonly maxZ: number
}

/**
 * Which of a map's pieces are backdrop rather than part of the place.
 *
 * The village's sky is a single piece 15.70 by 12.08 units, wrapped around a
 * map whose walkable ground is 12.0 by 9.1. It is over the character's head
 * everywhere, so without this the open street reads as indoors and the camera
 * tucks in under the sky.
 *
 * **The test is containment, not size.** A piece that reaches past the map's
 * collision on all four sides is not part of the place being stood in; a room's
 * ceiling sits within its own walls and is not caught. No map on the cartridge
 * has collision above head height — not one downward-facing raised triangle
 * anywhere — so the geometry has to answer this, and this is the least it can
 * be asked.
 */
export function backdrop(
  pieces: readonly Extent[],
  ground: CollisionBounds | undefined,
): boolean[] {
  if (!ground) return pieces.map(() => false)
  const minX = ground.minX / FX32_ONE
  const maxX = ground.maxX / FX32_ONE
  const minZ = ground.minZ / FX32_ONE
  const maxZ = ground.maxZ / FX32_ONE
  return pieces.map(
    (box) => box.minX < minX && box.maxX > maxX && box.minZ < minZ && box.maxZ > maxZ,
  )
}
