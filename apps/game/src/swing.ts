import { type Geometry, poseGeometry } from '@minstrel/nitro-gfx'
import type { AssembledMap } from '@minstrel/world'

/**
 * Doors that swing open as the Hero comes up to them.
 *
 * A door is a map piece of its own, named for it — `M01M00D1` is the village's
 * first — with its collision beside it as a resource of its own under the same
 * name with `A` for `M`, `M01A00D1`. Neither comes with an animation, so the
 * swing is ours:
 *
 * - **About the model's origin** — INFERRED: every door on the village's maps is
 *   a single quad with a corner at its origin, which is where a hinge goes.
 * - **A quarter turn, away from the Hero, in a quarter of a second** — a choice;
 *   how far and how fast the game swings them is not established.
 * - **Its collision out of the way while it is open.** Most doors' collision is
 *   two triangles the map loader already leaves out as a doorway's marker; the
 *   two inside Erinn's house are four, a wall from either side, and without
 *   this they shut those rooms off for good.
 */

/** How near the middle of a door the Hero comes before it opens, in world units. */
export const DOOR_OPEN_NEAR = 0.25
/** How far away they go before it shuts again: further, so it does not flap. */
export const DOOR_CLOSE_FAR = 0.4
/** Radians a second: a quarter turn in a quarter of a second. */
export const DOOR_SWING_SPEED = Math.PI * 2

const QUARTER = Math.PI / 2

export interface SwingDoor {
  /** The piece's resource, `M01M10D1`. */
  readonly stem: string
  /** Which of the map's pieces it is. */
  readonly piece: number
  /** Which of the map's collision meshes is its own; undefined when the loader kept none. */
  readonly mesh: number | undefined
  /** Where the hinge stands, in world units. */
  readonly hinge: { readonly x: number; readonly z: number }
  /** From the hinge to the far edge while it is shut, in world units. */
  readonly leaf: { readonly x: number; readonly z: number }
  /** How far it has swung, in radians; 0 is shut. */
  angle: number
  /** Where it is swinging to. */
  target: number
}

/** A door model's collision, by name — `M01M00D1` to `M01A00D1` — or undefined when the name is not a door's. */
export function doorCollisionName(stem: string): string | undefined {
  const door = /^([A-Z]\d\d)M(\d\d)(D[0-9A-Z])$/i.exec(stem)
  return door ? `${door[1]}A${door[2]}${door[3]}` : undefined
}

/** The map's doors, each shut, with its own collision found by name. */
export function doorsOf(map: AssembledMap): SwingDoor[] {
  const doors: SwingDoor[] = []
  for (const [piece, { model, place, scale, source }] of map.pieces.entries()) {
    const stem = source ?? model.name
    const collision = doorCollisionName(stem)?.toLowerCase()
    if (!collision) continue
    // The far edge is the corner furthest from the hinge.
    let far = { x: 0, z: 0 }
    let reach = -1
    for (const [index, shape] of model.shapes.entries()) {
      const posed = poseGeometry(
        model.geometry(shape),
        model.shapeMatrices[index] ?? model.matrices,
      )
      for (const v of posed.vertices) {
        const distance = Math.hypot(v.x, v.z)
        if (distance > reach) {
          reach = distance
          far = { x: v.x, z: v.z }
        }
      }
    }
    const mesh = map.meshes.findIndex((m) => m.source?.toLowerCase() === collision)
    doors.push({
      stem,
      piece,
      mesh: mesh >= 0 ? mesh : undefined,
      hinge: { x: place.x, z: place.z },
      leaf: { x: far.x * scale, z: far.z * scale },
      angle: 0,
      target: 0,
    })
  }
  return doors
}

/** Whether a door is all the way shut, which is the only time its collision stands. */
export function doorShut(door: SwingDoor): boolean {
  return door.angle === 0 && door.target === 0
}

/**
 * Which way a quarter turn takes the leaf away from someone standing at `from`.
 *
 * Turning by a small positive angle moves the far edge along `(-leaf.z, leaf.x)`
 * — see {@link swingGeometry} — so the turn is negative when that points at them.
 */
export function awayFrom(
  door: SwingDoor,
  from: { readonly x: number; readonly z: number },
): number {
  const towards = -door.leaf.z * (from.x - door.hinge.x) + door.leaf.x * (from.z - door.hinge.z)
  return towards > 0 ? -QUARTER : QUARTER
}

/**
 * Open the doors the Hero is near, shut the ones they have left, and swing each
 * on by `seconds`. True when any door moved, which is a map to redraw.
 */
export function moveDoors(
  doors: SwingDoor[],
  hero: { readonly x: number; readonly z: number },
  seconds: number,
): boolean {
  let moved = false
  for (const door of doors) {
    const middle = { x: door.hinge.x + door.leaf.x / 2, z: door.hinge.z + door.leaf.z / 2 }
    const distance = Math.hypot(hero.x - middle.x, hero.z - middle.z)
    if (door.target === 0 && distance < DOOR_OPEN_NEAR) {
      // Caught while shutting, it opens again the way it was going.
      door.target = door.angle !== 0 ? Math.sign(door.angle) * QUARTER : awayFrom(door, hero)
    } else if (door.target !== 0 && distance > DOOR_CLOSE_FAR) {
      door.target = 0
    }
    if (door.angle === door.target) continue
    const by = DOOR_SWING_SPEED * seconds
    const gap = door.target - door.angle
    door.angle = Math.abs(gap) <= by ? door.target : door.angle + Math.sign(gap) * by
    moved = true
  }
  return moved
}

/**
 * A door's geometry turned by `angle` about its own origin, the hinge.
 *
 * In model space, before it is placed: the placement only scales and moves, so
 * turning first is turning about the hinge wherever the door stands.
 */
export function swingGeometry(geometry: Geometry, angle: number): Geometry {
  if (angle === 0) return geometry
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return {
    ...geometry,
    vertices: geometry.vertices.map((v) => ({
      ...v,
      x: v.x * cos - v.z * sin,
      z: v.x * sin + v.z * cos,
    })),
  }
}
