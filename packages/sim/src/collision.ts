import { add, type Fx32, fx32, mul, sub } from '@minstrel/fixed'
import type { CollisionBounds, CollisionMesh, CollisionTriangle } from '@minstrel/game-formats'

/**
 * The world the player walks on.
 *
 * A collision mesh's vertices are whole `fx32` words — the cartridge stores its
 * world in the same 1.19.12 the simulation runs in — so nothing here converts
 * anything. Positions in and out are `Fx32`, and the arithmetic is integer
 * arithmetic throughout.
 *
 * **A map's collision is several meshes, not one.** An archive carries one per
 * piece — the village has thirteen — and taking any single one gives a world
 * with a few triangles in it and no ground to stand on. They are merged here,
 * so a world is built from all of a map's collision or from none of it.
 *
 * **The index is ours, not the file's.** `.col2` carries a grid of its own, and
 * that grid's cells tile its triangle list exactly, but which region of the map
 * each cell covers is not established — the two header fields that look like
 * grid dimensions do not account for the cell count on most files. Using it
 * would mean guessing the mapping, so the world builds a uniform grid of its
 * own instead. The file's index is left parsed and unused until its own
 * dimensions are understood.
 */
export interface CollisionWorld {
  /** Every triangle, from every mesh the world was built from. */
  readonly triangles: readonly CollisionTriangle[]
  /** The extent of all of them together. */
  readonly bounds: CollisionBounds
  /** Cell size in `fx32` units. */
  readonly cellSize: number
  readonly cellsX: number
  readonly cellsZ: number
  /** Origin of cell (0, 0), in `fx32` units. */
  readonly originX: number
  readonly originZ: number
  /** Triangle indices per cell, row-major by z then x. */
  readonly cells: readonly (readonly number[])[]
}

/** Where the ground is under a point, and which triangle it belongs to. */
export interface GroundHit {
  /** Surface height at the queried point. */
  readonly y: Fx32
  /** Index into {@link CollisionMesh.triangles}. */
  readonly triangle: number
  /**
   * How steep the surface is, as the `fx32` cosine of its angle from vertical:
   * `FX32_ONE` is flat, zero is a wall. Compare against a threshold rather than
   * taking an angle.
   */
  readonly slope: Fx32
}

/** How many cells across the world's own index is, at most, on each axis. */
const MAX_CELLS = 64

/**
 * Index a collision mesh for lookup by position.
 *
 * The grid is sized so a map lands somewhere near 32 cells across, bounded so a
 * pathological mesh cannot allocate an enormous one. Triangles are filed under
 * every cell their footprint touches, so a query never has to look at
 * neighbours.
 */
/** A mesh together with where the map puts it, in whole `fx32` words. */
export interface PlacedMesh {
  readonly mesh: CollisionMesh
  readonly offset: { readonly x: number; readonly y: number; readonly z: number } | undefined
  /**
   * Uniform scale about the piece's own origin, applied before the offset.
   *
   * A placed piece is authored in a space an order of magnitude larger than the
   * map it goes into, and **its collision is in that space too, not only its
   * geometry**. Leaving this out left 139 of the cartridge's collision meshes
   * standing at eight times the size of the thing they belong to — a doorway
   * blocker the size of the building.
   */
  readonly scale?: number
}

const ZERO = { x: 0, y: 0, z: 0 }

/**
 * One triangle scaled about its own origin and moved by an offset.
 *
 * The normal is untouched: neither a translation nor a positive uniform scale
 * can turn a face, and the normal is already a unit vector.
 */
function shift(
  triangle: CollisionTriangle,
  offset: { x: number; y: number; z: number },
  scale: number,
): CollisionTriangle {
  return {
    ...triangle,
    // Rounded, because an `fx32` is a whole number of 1/4096ths. Scaling a
    // collision mesh by an eighth without rounding leaves every vertex of an
    // indoor map fractional — 138 of 138 in the village inn — and a fractional
    // `fx32` is a float in the simulation, which `mulFx32` truncates through
    // `Math.imul` and the shifts it decomposes with.
    vertices: triangle.vertices.map((v) => [
      Math.round(v[0] * scale + offset.x),
      Math.round(v[1] * scale + offset.y),
      Math.round(v[2] * scale + offset.z),
    ]) as unknown as CollisionTriangle['vertices'],
  }
}

export function createCollisionWorld(
  source: CollisionMesh | PlacedMesh | readonly (CollisionMesh | PlacedMesh)[],
): CollisionWorld {
  const given = Array.isArray(source)
    ? (source as readonly (CollisionMesh | PlacedMesh)[])
    : [source as CollisionMesh | PlacedMesh]
  // A map's pieces are authored at their own origin and placed, so a mesh may
  // arrive with an offset. Applying it here rather than asking every caller to
  // rebuild the triangles keeps the placed and unplaced cases the same shape.
  const placed: PlacedMesh[] = given.map((entry) =>
    'mesh' in entry ? entry : { mesh: entry, offset: undefined },
  )
  const triangles = placed.flatMap(({ mesh, offset, scale }) =>
    offset === undefined && (scale ?? 1) === 1
      ? mesh.triangles
      : mesh.triangles.map((t) => shift(t, offset ?? ZERO, scale ?? 1)),
  )
  const shifted = placed.map(({ mesh, offset, scale }) => {
    const k = scale ?? 1
    return {
      minX: mesh.bounds.minX * k + (offset?.x ?? 0),
      minY: mesh.bounds.minY * k + (offset?.y ?? 0),
      minZ: mesh.bounds.minZ * k + (offset?.z ?? 0),
      maxX: mesh.bounds.maxX * k + (offset?.x ?? 0),
      maxY: mesh.bounds.maxY * k + (offset?.y ?? 0),
      maxZ: mesh.bounds.maxZ * k + (offset?.z ?? 0),
    }
  })
  const bounds: CollisionBounds = {
    minX: Math.min(...shifted.map((m) => m.minX), 0),
    minY: Math.min(...shifted.map((m) => m.minY), 0),
    minZ: Math.min(...shifted.map((m) => m.minZ), 0),
    maxX: Math.max(...shifted.map((m) => m.maxX), 0),
    maxY: Math.max(...shifted.map((m) => m.maxY), 0),
    maxZ: Math.max(...shifted.map((m) => m.maxZ), 0),
  }
  const { minX, minZ, maxX, maxZ } = bounds
  const spanX = Math.max(maxX - minX, 1)
  const spanZ = Math.max(maxZ - minZ, 1)
  const target = Math.max(spanX, spanZ) / 32
  // A power of two, so the division below is a shift and cannot drift.
  let cellSize = 1
  while (cellSize < target) cellSize *= 2
  let cellsX = Math.max(1, Math.ceil(spanX / cellSize))
  let cellsZ = Math.max(1, Math.ceil(spanZ / cellSize))
  while (cellsX > MAX_CELLS || cellsZ > MAX_CELLS) {
    cellSize *= 2
    cellsX = Math.max(1, Math.ceil(spanX / cellSize))
    cellsZ = Math.max(1, Math.ceil(spanZ / cellSize))
  }

  const cells: number[][] = Array.from({ length: cellsX * cellsZ }, () => [])
  triangles.forEach((triangle, index) => {
    const xs = triangle.vertices.map((v) => v[0])
    const zs = triangle.vertices.map((v) => v[2])
    const x0 = cellOf(Math.min(...xs), minX, cellSize, cellsX)
    const x1 = cellOf(Math.max(...xs), minX, cellSize, cellsX)
    const z0 = cellOf(Math.min(...zs), minZ, cellSize, cellsZ)
    const z1 = cellOf(Math.max(...zs), minZ, cellSize, cellsZ)
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) (cells[z * cellsX + x] as number[]).push(index)
    }
  })

  return { triangles, bounds, cellSize, cellsX, cellsZ, originX: minX, originZ: minZ, cells }
}

function cellOf(value: number, origin: number, size: number, count: number): number {
  const cell = Math.floor((value - origin) / size)
  return cell < 0 ? 0 : cell >= count ? count - 1 : cell
}

/** The triangles filed under the cell containing a point. */
export function triangleAt(world: CollisionWorld, x: Fx32, z: Fx32): readonly number[] {
  const cx = cellOf(x, world.originX, world.cellSize, world.cellsX)
  const cz = cellOf(z, world.originZ, world.cellSize, world.cellsZ)
  return world.cells[cz * world.cellsX + cx] ?? []
}

/**
 * Twice the signed area of the triangle `(a, b, c)` projected onto the ground.
 *
 * Integer cross product. Collision coordinates run to a few tens of thousands,
 * so the product stays far below the range a double holds exactly, and the sign
 * is what the containment test needs rather than the magnitude.
 */
function edge(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  return (bx - ax) * (pz - az) - (bz - az) * (px - ax)
}

/**
 * The ground at or below `y` under the point `(x, z)`.
 *
 * Returns the **highest** surface not above `y`, which is what walking wants:
 * standing on a bridge should not drop you to the riverbed beneath it. A
 * surface slightly above `y` is still accepted, within `stepUp`, so that
 * walking up a kerb does not need the caller to guess at the height first.
 *
 * Vertical faces are skipped. A wall has no ground to stand on, and its plane
 * has no height to interpolate — dividing by its zero-area projection is
 * exactly the case this must not attempt.
 */
export function groundBelow(
  world: CollisionWorld,
  x: Fx32,
  z: Fx32,
  y: Fx32,
  stepUp: Fx32 = fx32(0),
): GroundHit | undefined {
  let best: GroundHit | undefined
  const ceiling = add(y, stepUp)

  for (const index of triangleAt(world, x, z)) {
    const triangle = world.triangles[index] as CollisionTriangle
    const [a, b, c] = triangle.vertices
    const [ax, ay, az] = a
    const [bx, by, bz] = b
    const [cx, cy, cz] = c

    // Twice the projected area. Zero means the triangle is vertical, or
    // degenerate; either way it is not a floor.
    const area = edge(ax, az, bx, bz, cx, cz)
    if (area === 0) continue

    // Barycentric weights, as integers. All three must share the area's sign
    // for the point to be inside, and an edge counts as inside so that a point
    // on a seam belongs to one of the triangles that meet there.
    const wa = edge(bx, bz, cx, cz, x, z)
    const wb = edge(cx, cz, ax, az, x, z)
    const wc = edge(ax, az, bx, bz, x, z)
    if (area > 0) {
      if (wa < 0 || wb < 0 || wc < 0) continue
    } else if (wa > 0 || wb > 0 || wc > 0) continue

    // Interpolate the height. The weights and the area are both twice the real
    // areas, so the factors of two cancel.
    const height = fx32(Math.round((wa * ay + wb * by + wc * cy) / area))
    if (height > ceiling) continue
    if (best === undefined || height > best.y) {
      best = { y: height, triangle: index, slope: slopeOf(triangle) }
    }
  }
  return best
}

/**
 * How close a triangle is to horizontal, as the `fx32` cosine of its tilt.
 *
 * `FX32_ONE` is flat and zero is a wall, so a slope limit is a comparison. The
 * character controller uses the same value to decide what is a wall, which is
 * what makes an unclimbable slope and a building behave alike without either
 * being a special case.
 *
 * Taken from the triangle's own vertices rather than from the normal the file
 * stores, because the vertices are integers and the arithmetic stays exact:
 * the cosine is the projected area over the true area, and both come from the
 * same cross product.
 */
export function slopeOf(triangle: CollisionTriangle): Fx32 {
  const [a, b, c] = triangle.vertices
  const ux = b[0] - a[0]
  const uy = b[1] - a[1]
  const uz = b[2] - a[2]
  const vx = c[0] - a[0]
  const vy = c[1] - a[1]
  const vz = c[2] - a[2]
  let nx = uy * vz - uz * vy
  let ny = uz * vx - ux * vz
  let nz = ux * vy - uy * vx

  // The cross product of two edges spanning a map runs to about 2^32, and
  // squaring that leaves the range a double holds exactly. Only the ratio of
  // one component to the whole matters, so scale all three down together until
  // the squares fit — which changes nothing about the answer.
  const largest = Math.max(Math.abs(nx), Math.abs(ny), Math.abs(nz))
  if (largest > 0x1000000) {
    const shift = Math.ceil(Math.log2(largest / 0x1000000))
    const divisor = 2 ** shift
    nx = Math.round(nx / divisor)
    ny = Math.round(ny / divisor)
    nz = Math.round(nz / divisor)
  }

  const squared = nx * nx + ny * ny + nz * nz
  if (squared <= 0) return fx32(0)
  const magnitude = isqrt(squared)
  if (magnitude === 0) return fx32(0)
  // |ny| / |n|, scaled into fx32. The sign is dropped: a floor is a floor
  // whichever way its winding faces.
  return fx32(Math.min(4096, Math.round((Math.abs(ny) * 4096) / magnitude)))
}

/** `floor(sqrt(n))` for a non-negative integer below 2^53. */
function isqrt(n: number): number {
  if (n < 2) return n
  let x = n
  let y = Math.floor((x + 1) / 2)
  while (y < x) {
    x = y
    y = Math.floor((x + Math.floor(n / x)) / 2)
  }
  return x
}

/** Re-exported so callers need not reach for the fixed-point package for these. */
export { add, mul, sub }

/**
 * How far along a horizontal segment the first wall stands, as a fraction.
 *
 * For a camera boom: the eye wants to sit a distance behind the character, and
 * where a building is in the way it should sit in front of the building
 * instead. Returns `undefined` when the way is clear.
 *
 * A wall is a surface too steep to stand on, the same test walking uses, and it
 * only counts if the segment's height band overlaps it — so a camera looking
 * over a low fence is not pulled in by it.
 *
 * Candidates come from the cells at both ends and the middle of the segment. A
 * boom is short next to a cell, so that covers it; a longer ray would want the
 * cells walked properly.
 */
export function wallBetween(
  world: CollisionWorld,
  from: { x: Fx32; z: Fx32 },
  to: { x: Fx32; z: Fx32 },
  low: Fx32,
  high: Fx32,
  maxSlope: Fx32,
): number | undefined {
  const midX = fx32(Math.round((from.x + to.x) / 2))
  const midZ = fx32(Math.round((from.z + to.z) / 2))
  const candidates = new Set<number>()
  for (const cell of [
    triangleAt(world, from.x, from.z),
    triangleAt(world, midX, midZ),
    triangleAt(world, to.x, to.z),
  ]) {
    for (const index of cell) candidates.add(index)
  }

  const rx = to.x - from.x
  const rz = to.z - from.z
  let nearest: number | undefined

  for (const index of candidates) {
    const triangle = world.triangles[index] as CollisionTriangle
    if (slopeOf(triangle) >= maxSlope) continue
    const [a, b, c] = triangle.vertices
    if (Math.max(a[1], b[1], c[1]) <= low) continue
    if (Math.min(a[1], b[1], c[1]) >= high) continue

    // The face as a segment on the ground, and where the two segments cross.
    const wall = longestProjectedEdge(triangle)
    const wx = wall.bx - wall.ax
    const wz = wall.bz - wall.az
    const denominator = rx * wz - rz * wx
    if (denominator === 0) continue
    const dx = wall.ax - from.x
    const dz = wall.az - from.z
    const alongRay = (dx * wz - dz * wx) / denominator
    const alongWall = (dx * rz - dz * rx) / denominator
    if (alongRay < 0 || alongRay > 1) continue
    if (alongWall < 0 || alongWall > 1) continue
    if (nearest === undefined || alongRay < nearest) nearest = alongRay
  }
  return nearest
}

/** The two ends of a triangle's longest edge, projected onto the ground. */
export function longestProjectedEdge(triangle: CollisionTriangle): {
  ax: number
  az: number
  bx: number
  bz: number
} {
  const [a, b, c] = triangle.vertices
  const pairs: [number, number, number, number][] = [
    [a[0], a[2], b[0], b[2]],
    [b[0], b[2], c[0], c[2]],
    [c[0], c[2], a[0], a[2]],
  ]
  let best = pairs[0] as [number, number, number, number]
  let longest = -1
  for (const pair of pairs) {
    const length = Math.hypot(pair[2] - pair[0], pair[3] - pair[1])
    if (length > longest) {
      longest = length
      best = pair
    }
  }
  return { ax: best[0], az: best[1], bx: best[2], bz: best[3] }
}
