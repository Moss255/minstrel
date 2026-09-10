import { FX32_ONE, toFloat } from '@minstrel/fixed'
import type { Piece } from '@minstrel/gl'
import type { Geometry, Vertex } from '@minstrel/nitro-gfx'
import { type CollisionWorld, PERSON, slopeOf } from '@minstrel/sim'

/**
 * The collision mesh, drawn where it actually is.
 *
 * A map's collision and the room drawn around it do not always agree, and the
 * disagreement is the hardest thing in this repository to reason about from
 * numbers — a plan from above helps, but only a picture in place answers "can I
 * stand there". So this draws the mesh itself: **green what you can stand on,
 * red what stops you**, over the map it belongs to.
 *
 * Standable and not is the character controller's own test, so the picture is
 * of what the engine believes rather than of a second opinion about it.
 *
 * A development view. Nothing draws it unless asked.
 */

/** Lifted this far so the floor does not fight the ground it sits on. */
const LIFT = 0.004

/**
 * A correction applied to a map's collision, live, to be fitted by eye.
 *
 * **Deliberately not a guess.** An interior's collision does not always sit
 * where its room is drawn, and no field in any file read here tells the two
 * apart — see `FORMAT.md`. Rather than keep fitting it blind, the game can move
 * the mesh over the room until it lines up, and the numbers can be read off the
 * screen and collected. The same affordance settled the sprite cut.
 *
 * `1, 0, 0, 0` is the file as it stands, which is what every map uses unless a
 * fit is being tried.
 */
export interface CollisionFit {
  /**
   * Scale about the map's own origin, **per axis**.
   *
   * Uniform at first, and it did not survive the first room fitted: the item
   * shop wants twice its size in z, where its collision reaches 0.44 against
   * walls at 0.40, and roughly its own size in x, where doubling takes it to
   * −1.25 against walls at −0.50. A correction that is not the same on both
   * axes is worth being able to say, so it can be ruled in or out rather than
   * rounded away.
   */
  readonly sx: number
  readonly sy: number
  readonly sz: number
  readonly x: number
  readonly y: number
  readonly z: number
}

export const NO_FIT: CollisionFit = { sx: 1, sy: 1, sz: 1, x: 0, y: 0, z: 0 }

/**
 * `?fit=` a fit someone found, so it can be put back and checked.
 *
 * Four numbers are the uniform form `scale,x,y,z`; six are `sx,sy,sz,x,y,z`.
 */
export function fitFrom(text: string | null): CollisionFit {
  if (!text) return NO_FIT
  const n = text.split(',').map(Number)
  const at = (i: number, fallback: number) => (Number.isFinite(n[i]) ? (n[i] as number) : fallback)
  const positive = (v: number) => (v > 0 ? v : 1)
  if (n.length >= 6) {
    return {
      sx: positive(at(0, 1)),
      sy: positive(at(1, 1)),
      sz: positive(at(2, 1)),
      x: at(3, 0),
      y: at(4, 0),
      z: at(5, 0),
    }
  }
  const scale = positive(at(0, 1))
  return { sx: scale, sy: scale, sz: scale, x: at(1, 0), y: at(2, 0), z: at(3, 0) }
}

/** The fit as one line, made to be copied into a note. */
export function fitLine(code: string, fit: CollisionFit): string {
  const uniform = fit.sx === fit.sy && fit.sy === fit.sz
  const scale = uniform
    ? `scale ${fit.sx.toFixed(3)}`
    : `scale ${fit.sx.toFixed(3)}, ${fit.sy.toFixed(3)}, ${fit.sz.toFixed(3)}`
  return `${code}  ${scale}  offset ${fit.x.toFixed(3)}, ${fit.y.toFixed(3)}, ${fit.z.toFixed(3)}`
}

/**
 * A map's collision meshes with a fit applied, ready to rebuild a world from.
 *
 * The scale multiplies the one the map already gives each mesh, so a fit of one
 * changes nothing; the offset is in world units and becomes the `fx32` words a
 * placed mesh carries.
 */
export function fitMeshes(meshes: readonly PlacedMesh[], fit: CollisionFit): PlacedMesh[] {
  if (fit === NO_FIT) return meshes as PlacedMesh[]
  // `PlacedMesh.scale` is one number, so a per-axis fit is applied to the
  // triangles here instead and the mesh handed on already stretched.
  return meshes.map((placed) => {
    const k = placed.scale ?? 1
    const stretch = (v: readonly [number, number, number]): [number, number, number] => [
      Math.round(v[0] * k * fit.sx),
      Math.round(v[1] * k * fit.sy),
      Math.round(v[2] * k * fit.sz),
    ]
    return {
      mesh: {
        ...placed.mesh,
        triangles: placed.mesh.triangles.map((t) => ({
          ...t,
          vertices: [
            stretch(t.vertices[0]),
            stretch(t.vertices[1]),
            stretch(t.vertices[2]),
          ] as (typeof t)['vertices'],
        })),
        // Rounded like the vertices: a bound is a whole `fx32` word too, and a
        // fractional one reaches the simulation as a float.
        bounds: {
          minX: Math.round(placed.mesh.bounds.minX * k * fit.sx),
          minY: Math.round(placed.mesh.bounds.minY * k * fit.sy),
          minZ: Math.round(placed.mesh.bounds.minZ * k * fit.sz),
          maxX: Math.round(placed.mesh.bounds.maxX * k * fit.sx),
          maxY: Math.round(placed.mesh.bounds.maxY * k * fit.sy),
          maxZ: Math.round(placed.mesh.bounds.maxZ * k * fit.sz),
        },
      },
      scale: 1,
      offset: {
        x: Math.round((placed.offset?.x ?? 0) * fit.sx + fit.x * FX32_ONE),
        y: Math.round((placed.offset?.y ?? 0) * fit.sy + fit.y * FX32_ONE),
        z: Math.round((placed.offset?.z ?? 0) * fit.sz + fit.z * FX32_ONE),
      },
    }
  })
}

const FLOOR: readonly [number, number, number] = [0.15, 0.9, 0.35]
const WALL: readonly [number, number, number] = [1, 0.25, 0.25]

function corner(
  x: number,
  y: number,
  z: number,
  [r, g, b]: readonly [number, number, number],
): Vertex {
  return { x, y, z, s: 0, t: 0, r, g, b, matrixId: 0 }
}

/**
 * One piece per surface kind, so each can be given its own colour.
 *
 * Two pieces rather than one per triangle: a map's collision runs to hundreds
 * of triangles and the renderer uploads per piece.
 */
export function collisionPieces(world: CollisionWorld): Piece[] {
  const floor: Vertex[] = []
  const floorIndices: number[] = []
  const wall: Vertex[] = []
  const wallIndices: number[] = []

  for (const triangle of world.triangles) {
    const standable = slopeOf(triangle) >= PERSON.maxSlope
    const into = standable ? floor : wall
    const indices = standable ? floorIndices : wallIndices
    const colour = standable ? FLOOR : WALL
    const lift = standable ? LIFT : 0
    const base = into.length
    for (const v of triangle.vertices) {
      into.push(corner(v[0] / 4096, v[1] / 4096 + lift, v[2] / 4096, colour))
    }
    // Both windings, so a surface reads from underneath as well as from above.
    indices.push(base, base + 1, base + 2, base, base + 2, base + 1)
  }

  const piece = (vertices: Vertex[], indices: number[]): Piece[] => {
    if (vertices.length === 0) return []
    const geometry: Geometry = { vertices, indices, matrixIds: [], scales: [] }
    return [{ geometry }]
  }
  return [...piece(floor, floorIndices), ...piece(wall, wallIndices)]
}

/** How the overlay reads, for the status line. */
export function describeCollision(world: CollisionWorld | undefined): string {
  if (!world) return 'no collision'
  let standable = 0
  for (const t of world.triangles) if (slopeOf(t) >= PERSON.maxSlope) standable++
  const b = world.bounds
  const span = (lo: number, hi: number) =>
    `${toFloat(lo as never).toFixed(2)}..${toFloat(hi as never).toFixed(2)}`
  return (
    `collision: ${standable} standable of ${world.triangles.length}` +
    ` · x ${span(b.minX, b.maxX)} · z ${span(b.minZ, b.maxZ)}`
  )
}
