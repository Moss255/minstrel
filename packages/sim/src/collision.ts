import { add, type Fx32, fx32, mul, sub } from '@vesper/fixed'
import type { CollisionMesh, CollisionTriangle } from '@vesper/game-formats'

/**
 * The world the player walks on.
 *
 * A collision mesh's vertices are whole `fx32` words — the cartridge stores its
 * world in the same 1.19.12 the simulation runs in — so nothing here converts
 * anything. Positions in and out are `Fx32`, and the arithmetic is integer
 * arithmetic throughout.
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
  readonly mesh: CollisionMesh
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
export function createCollisionWorld(mesh: CollisionMesh): CollisionWorld {
  const { minX, minZ, maxX, maxZ } = mesh.bounds
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
  mesh.triangles.forEach((triangle, index) => {
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

  return { mesh, cellSize, cellsX, cellsZ, originX: minX, originZ: minZ, cells }
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
    const triangle = world.mesh.triangles[index] as CollisionTriangle
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
 * Taken from the triangle's own vertices rather than from the normal the file
 * stores, because the vertices are integers and the arithmetic stays exact:
 * the cosine is the projected area over the true area, and both come from the
 * same cross product.
 */
function slopeOf(triangle: CollisionTriangle): Fx32 {
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
