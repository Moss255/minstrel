import type { CollisionMesh } from '@minstrel/game-formats'

/**
 * **Walls, as the game resolves them**, read on 11 October 2026 from the US
 * build's field overlay and ARM9 (the decomp's disassembly; every address is
 * USA).
 *
 * The party's leader is moved each tick and then put right against the map's
 * collision, one mesh at a time (`func_ov017_0219344c`, called with the
 * position before the move from `func_ov017_0218e210`). For each mesh:
 *
 * - **The triangles near the character are taken from the file's own grid**
 *   (`func_02017d90`, `func_0204c030`): a box round the character — half its
 *   `Object3D` radius either side, from ten below the feet to its height
 *   above them — picks the cell under the box's middle and its six
 *   neighbours, and from them, in that order, every triangle whose own box
 *   (which the attribute word's six nibbles name, see {@link triangleBox})
 *   meets it. At most 96 are kept, and 192 looked at.
 * - **A sphere is pushed out of them** (`func_ov017_02192b48`, `0x02193068` on;
 *   the push is `func_020315b8`): radius `0x800`, its centre `0x800` above the
 *   feet. Only a triangle whose stored normal has y at most `0x800` — 60
 *   degrees from flat — is a wall. Only x and z move.
 *
 * The sweep is {@link sweep}. Its arithmetic is the NitroSDK's — products
 * rounded at each step, the hardware divider and square root — and runs here
 * in the game's own units, which are the world's times `2 ** shift / scale`
 * (8 on every map: see `WORLD_SCALE`), so that every constant in it is the
 * game's and so is every rounding. Only the answer is rounded back.
 *
 * **Ours, not the game's:** the leader's step split in two past `0x333` a tick
 * (`func_ov017_0218e210`), which the walking pace here never reaches; a
 * mesh's turn about y (the mover's `+0x918`), which no mesh placed here has;
 * each collision entry's margins (`+0x58` to `+0x6c`, added to the box in
 * `func_02017d90`), not read and taken as none; and what the sweep's corner
 * rule compares the first wall it meets against — a value the game never
 * sets (`sp+0x108`), here taken as zero, which turns the rule off for that
 * wall.
 */

/** The sweep's radius and how far above the feet its centre is, in the game's units (`func_ov017_02192b48`). */
export const WALL_REACH = 0x800
/** How far below the feet the triangles are gathered from, in the game's units (`func_ov017_0219344c`). */
const BOX_BELOW = 0xa000
/** A wall's stored normal has y at most this (`func_020315b8`, `0x02031664`). */
const WALL_NORMAL_Y = 0x800
/** At most this many triangles a mesh hands the sweep, and looks at (`func_0204c030`). */
const MAX_HITS = 0x60
const MAX_LOOKED = 0xc0
/** One hit: three corners and the stored normal, twelve words. */
const HIT_WORDS = 12

/** A mesh of the world, where it stands and at what size — see `PlacedMesh`. */
export interface WallPiece {
  readonly mesh: CollisionMesh
  readonly offset: { readonly x: number; readonly y: number; readonly z: number }
  readonly scale: number
}

// --- The NitroSDK's arithmetic ------------------------------------------------

/** `FIX32_MULTIPLY`: the 64-bit product, rounded, shifted down 12, kept to 32 bits. */
function mulFx(a: number, b: number): number {
  const p = a * b
  if (Math.abs(p) < 2 ** 52) return Math.floor((p + 2048) / 4096) | 0
  return Number(BigInt.asIntN(32, (BigInt(a) * BigInt(b) + 2048n) >> 12n))
}

/** `Vector3fix_InnerProduct`: the three products summed in 64 bits, then rounded down 12. */
function dot(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const big = Math.max(Math.abs(ax), Math.abs(ay), Math.abs(az))
  const other = Math.max(Math.abs(bx), Math.abs(by), Math.abs(bz))
  if (big * other < 2 ** 50) return Math.floor((ax * bx + ay * by + az * bz + 2048) / 4096) | 0
  const s = BigInt(ax) * BigInt(bx) + BigInt(ay) * BigInt(by) + BigInt(az) * BigInt(bz)
  return Number(BigInt.asIntN(32, (s + 2048n) >> 12n))
}

/** `Vector3fix_CrossProduct`, each component a 64-bit difference rounded down 12. */
function cross(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  out: Int32Array,
): void {
  out[0] = mulDiff(ay, bz, az, by)
  out[1] = mulDiff(az, bx, ax, bz)
  out[2] = mulDiff(ax, by, ay, bx)
}

/** `(a·b − c·d + 0x800) >> 12` in 64 bits. */
function mulDiff(a: number, b: number, c: number, d: number): number {
  const p = a * b
  const q = c * d
  if (Math.abs(p) < 2 ** 51 && Math.abs(q) < 2 ** 51) return Math.floor((p - q + 2048) / 4096) | 0
  return Number(BigInt.asIntN(32, (BigInt(a) * BigInt(b) - BigInt(c) * BigInt(d) + 2048n) >> 12n))
}

/**
 * `fix32_Divide`: the hardware divider, `(a << 32) / b` truncated, then
 * `+ 0x80000 >> 20`. A zero divisor gives the divider's ±1, which that
 * rounding takes to 0.
 */
function fxDiv(a: number, b: number): number {
  if (b === 0) return 0
  const q = (BigInt(a) << 32n) / BigInt(b)
  return Number(BigInt.asIntN(32, (q + 0x80000n) >> 20n))
}

/** `floor(sqrt(n))` for a non-negative 64-bit integer. */
function isqrt(n: bigint): bigint {
  if (n < 2n) return n
  let x = BigInt(Math.floor(Math.sqrt(Number(n))))
  while (x * x > n) x--
  while ((x + 1n) * (x + 1n) <= n) x++
  return x
}

/** `fix32_Sqrt`: the hardware's square root of `x << 32`, then `+ 0x200 >> 10`. */
function fxSqrt(x: number): number {
  if (x <= 0) return 0
  return Number((isqrt(BigInt(x) << 32n) + 0x200n) >> 10n) | 0
}

/** `Vector3fix_Distance`: the root of the squared distance shifted up 2, then `+ 1 >> 1`. */
function distance(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = ax - bx
  const dy = ay - by
  const dz = az - bz
  const s = dx * dx + dy * dy + dz * dz
  const root =
    s < 2 ** 50
      ? Number(isqrt(BigInt(s * 4)))
      : Number(
          isqrt(BigInt.asUintN(64, (BigInt(dx) ** 2n + BigInt(dy) ** 2n + BigInt(dz) ** 2n) << 2n)),
        )
  return (root + 1) >> 1
}

// --- The two pieces of geometry ------------------------------------------------

const ab = new Int32Array(3)
const ac = new Int32Array(3)
const e = new Int32Array(3)
const nn = new Int32Array(3)

/** The `t` {@link segmentTriangle} found, scaled to 4096 at the far end. */
let segmentT = 0

/**
 * `func_02031b84`: does the segment `p → q` pass through the triangle `abc`?
 * Real-Time Collision Detection's `IntersectSegmentTriangle`, in fixed point.
 * 1 when it does, setting {@link segmentT}; 0 when it does not reach the
 * triangle's plane from in front; −1 when it crosses the plane outside the
 * triangle.
 */
function segmentTriangle(hits: Int32Array, at: number, p: Int32Array, q: Int32Array): number {
  const ax = hits[at] as number
  const ay = hits[at + 1] as number
  const az = hits[at + 2] as number
  ab[0] = (hits[at + 3] as number) - ax
  ab[1] = (hits[at + 4] as number) - ay
  ab[2] = (hits[at + 5] as number) - az
  ac[0] = (hits[at + 6] as number) - ax
  ac[1] = (hits[at + 7] as number) - ay
  ac[2] = (hits[at + 8] as number) - az
  const qpx = (p[0] as number) - (q[0] as number)
  const qpy = (p[1] as number) - (q[1] as number)
  const qpz = (p[2] as number) - (q[2] as number)
  cross(ab[0], ab[1], ab[2], ac[0], ac[1], ac[2], nn)
  const d = dot(qpx, qpy, qpz, nn[0] as number, nn[1] as number, nn[2] as number)
  if (d <= 0) return 0
  const apx = (p[0] as number) - ax
  const apy = (p[1] as number) - ay
  const apz = (p[2] as number) - az
  const t = dot(apx, apy, apz, nn[0] as number, nn[1] as number, nn[2] as number)
  if (t < 0 || t > d) return 0
  cross(qpx, qpy, qpz, apx, apy, apz, e)
  const v = dot(
    ac[0] as number,
    ac[1] as number,
    ac[2] as number,
    e[0] as number,
    e[1] as number,
    e[2] as number,
  )
  if (v < 0 || v > d) return -1
  const w = -dot(
    ab[0] as number,
    ab[1] as number,
    ab[2] as number,
    e[0] as number,
    e[1] as number,
    e[2] as number,
  )
  if (w < 0 || v + w > d) return -1
  segmentT = mulFx(t, fxDiv(0x1000, d))
  return 1
}

/**
 * `func_02031d20`: the point of the triangle `abc` nearest `p`, into `out`.
 * Real-Time Collision Detection's `ClosestPtPointTriangle` in fixed point, but
 * for its last case: **inside the triangle it answers `p` itself**, not `p`
 * dropped onto the plane. The sweep only asks it about a sphere that has
 * crossed the plane outside the triangle.
 */
function closestPoint(hits: Int32Array, at: number, p: Int32Array, out: Int32Array): void {
  const ax = hits[at] as number
  const ay = hits[at + 1] as number
  const az = hits[at + 2] as number
  const bx = hits[at + 3] as number
  const by = hits[at + 4] as number
  const bz = hits[at + 5] as number
  const cx = hits[at + 6] as number
  const cy = hits[at + 7] as number
  const cz = hits[at + 8] as number
  const px = p[0] as number
  const py = p[1] as number
  const pz = p[2] as number
  const abx = bx - ax
  const aby = by - ay
  const abz = bz - az
  const acx = cx - ax
  const acy = cy - ay
  const acz = cz - az
  const d1 = dot(abx, aby, abz, px - ax, py - ay, pz - az)
  const d2 = dot(acx, acy, acz, px - ax, py - ay, pz - az)
  if (d1 <= 0 && d2 <= 0) {
    put(out, ax, ay, az)
    return
  }
  const d3 = dot(abx, aby, abz, px - bx, py - by, pz - bz)
  const d4 = dot(acx, acy, acz, px - bx, py - by, pz - bz)
  if (d3 >= 0 && d4 <= d3) {
    put(out, bx, by, bz)
    return
  }
  const vc = mulFx(d1, d4) - mulFx(d3, d2)
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = fxDiv(d1, d1 - d3)
    put(out, ax + mulFx(abx, v), ay + mulFx(aby, v), az + mulFx(abz, v))
    return
  }
  const d5 = dot(abx, aby, abz, px - cx, py - cy, pz - cz)
  const d6 = dot(acx, acy, acz, px - cx, py - cy, pz - cz)
  if (d6 >= 0 && d5 <= d6) {
    put(out, cx, cy, cz)
    return
  }
  const vb = mulFx(d5, d2) - mulFx(d1, d6)
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = fxDiv(d2, d2 - d6)
    put(out, ax + mulFx(acx, w), ay + mulFx(acy, w), az + mulFx(acz, w))
    return
  }
  const va = mulFx(d3, d6) - mulFx(d5, d4)
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = fxDiv(d4 - d3, d4 - d3 + (d5 - d6))
    put(out, bx + mulFx(cx - bx, w), by + mulFx(cy - by, w), bz + mulFx(cz - bz, w))
    return
  }
  put(out, px, py, pz)
}

function put(out: Int32Array, x: number, y: number, z: number): void {
  out[0] = x
  out[1] = y
  out[2] = z
}

// --- The sweep -------------------------------------------------------------------

const a = new Int32Array(3)
const b = new Int32Array(3)
const near = new Int32Array(3)
const lastOut = new Int32Array(3)
const lastNormal = new Int32Array(3)

/**
 * `func_020315b8`: push a sphere of `radius` at `out` out of the walls among
 * `count` hits, leaving it in `out`; the index of the wall that decided it,
 * or −1 when none touched it. Two passes over the walls:
 *
 * 1. **Faces.** A segment from the centre to `radius` behind it, along the
 *    wall's stored normal, that passes through the wall puts the centre back
 *    on the wall's plane and `radius` out along that normal.
 * 2. **Edges and corners**, for a wall whose plane the segment crosses outside
 *    the wall: the wall's nearest point, when it is nearer than `radius`, has
 *    the centre put back `radius` from it.
 *
 * And a **corner rule**, given where the character `was`: when a wall moves
 * the centre more than 4, and leans between 60 and 15 degrees off the last
 * wall to push, and the push is back across the line the two pushes make
 * towards where the character came from, the move is refused — x and z go
 * back to where it was, and the rest is not looked at.
 */
export function sweep(
  hits: Int32Array,
  count: number,
  radius: number,
  out: Int32Array,
  was: Int32Array | undefined,
): number {
  const radiusSquared = mulFx(radius, radius)
  const startX = out[0] as number
  const startY = out[1] as number
  const startZ = out[2] as number
  lastOut.set(out)
  lastNormal.fill(0)
  let decided = -1
  for (let pass = 0; pass < 2; pass++) {
    let faces = 0
    for (let i = 0; i < count; i++) {
      const at = i * HIT_WORDS
      const nx = hits[at + 9] as number
      const ny = hits[at + 10] as number
      const nz = hits[at + 11] as number
      if (ny > WALL_NORMAL_Y) continue
      const savedX = out[0] as number
      const savedY = out[1] as number
      const savedZ = out[2] as number
      a.set(out)
      b[0] = savedX + mulFx(nx, -radius)
      b[1] = savedY + mulFx(ny, -radius)
      b[2] = savedZ + mulFx(nz, -radius)
      const crossing = segmentTriangle(hits, at, a, b)
      let moved = false
      let onFace = false
      if (crossing === 1 && pass === 0) {
        out[0] = savedX + mulFx((b[0] as number) - savedX, segmentT) + mulFx(nx, radius)
        out[1] = savedY + mulFx((b[1] as number) - savedY, segmentT) + mulFx(ny, radius)
        out[2] = savedZ + mulFx((b[2] as number) - savedZ, segmentT) + mulFx(nz, radius)
        moved = true
        onFace = true
        decided = i
        faces++
      } else if (crossing === -1 && pass >= 1) {
        closestPoint(hits, at, out, near)
        const dx = savedX - (near[0] as number)
        const dy = savedY - (near[1] as number)
        const dz = savedZ - (near[2] as number)
        const squared = mulFx(dx, dx) + mulFx(dy, dy) + mulFx(dz, dz)
        if (squared < radiusSquared) {
          const s = fxDiv(radius, fxSqrt(squared))
          out[0] = (near[0] as number) + mulFx(dx, s)
          out[1] = (near[1] as number) + mulFx(dy, s)
          out[2] = (near[2] as number) + mulFx(dz, s)
          moved = true
          if (decided === -1) decided = i
        }
      }
      if (!moved) continue
      if (was !== undefined) {
        const px = was[0] as number
        const py = startY
        const pz = was[2] as number
        const ox = out[0] as number
        const oy = out[1] as number
        const oz = out[2] as number
        const lx = lastOut[0] as number
        const ly = lastOut[1] as number
        const lz = lastOut[2] as number
        if (distance(ox, oy, oz, lx, ly, lz) > 4) {
          const lean = dot(
            nx,
            ny,
            nz,
            lastNormal[0] as number,
            lastNormal[1] as number,
            lastNormal[2] as number,
          )
          if (lean < 0xfd7 && lean > 0x800) {
            const ux = px - lx
            const uy = py - ly
            const uz = pz - lz
            const vx = px - ox
            const vy = py - oy
            const vz = pz - oz
            const along = dot(ux, uy, uz, vx, vy, vz)
            if (along < Math.imul(distance(ux, uy, uz, vx, vy, vz), 0x4cc)) {
              const wx = px - startX
              const wy = py - startY
              const wz = pz - startZ
              if (dot(ux, uy, uz, wx, wy, wz) < 0 || dot(vx, vy, vz, wx, wy, wz) < 0) {
                out[0] = px
                out[2] = pz
                return decided
              }
            }
          }
        }
      }
      if (onFace || faces === 0) {
        lastNormal[0] = nx
        lastNormal[1] = ny
        lastNormal[2] = nz
      }
      lastOut[0] = savedX
      lastOut[1] = savedY
      lastOut[2] = savedZ
    }
  }
  return decided
}

// --- The triangles near a character ---------------------------------------------

/**
 * A triangle's own box. The game reads it from the six nibbles of the
 * attribute word, each picking one of the triangle's nine stored coordinates
 * — the first three the least x, y and z, the last three the greatest
 * (`func_0204c030`, `0x0204c3e8`–`0x0204c444`) — and on the cartridge they
 * name exactly the corners' own extent, on 109,122 of 109,122 triangles. So it
 * is taken from the corners, which a mesh made here has too.
 */
function triangleBox(mesh: CollisionMesh, index: number, box: Int32Array): void {
  const triangle = mesh.triangles[index]
  if (!triangle) return
  const [p, q, r] = triangle.vertices
  for (let axis = 0; axis < 3; axis++) {
    const u = p[axis] as number
    const v = q[axis] as number
    const w = r[axis] as number
    box[axis] = Math.min(u, v, w)
    box[axis + 3] = Math.max(u, v, w)
  }
}

/**
 * The cells the game looks in for a box whose middle is `(x, z)` in the
 * mesh's stored units (`func_0204c030`, `0x0204c0d4`–`0x0204c37c`): the grid's
 * rows alternate `gridX` and `gridX + 1` cells, the longer ones starting half
 * a cell to the left, and the cell under the point comes first, then the two
 * it shares an edge with in the row above, the two below, and the one either
 * side. A mesh of seven cells or fewer has all of them looked in.
 */
function cellsAround(mesh: CollisionMesh, x: number, z: number, cells: Int32Array): number {
  const { gridX, gridZ, cellSize } = mesh
  const total = Math.floor(gridZ * (gridX + 0.5))
  if (total <= 7) {
    for (let i = 0; i < total; i++) cells[i] = i
    return total
  }
  // `fix32_Divide`, then the quotient taken out of fixed point as a float and
  // truncated, as `_ffix` does.
  const row = Math.trunc(fxDiv(z - mesh.bounds.minZ, cellSize) / 4096)
  if (row < 0 || row >= gridZ) return 0
  let n = 0
  if (row % 2 === 0) {
    const col = Math.trunc(fxDiv(x - mesh.bounds.minX, cellSize) / 4096)
    if (col < 0 || col >= gridX) return 0
    const cell = row * gridX + col + (row >> 1)
    cells[n++] = cell
    if (row > 0) {
      cells[n++] = cell - gridX
      cells[n++] = cell - gridX - 1
    }
    if (row < gridZ - 1) {
      cells[n++] = cell + gridX
      cells[n++] = cell + gridX + 1
    }
    if (col > 0) cells[n++] = cell - 1
    if (col < gridX - 1) cells[n++] = cell + 1
  } else {
    const col = Math.trunc(fxDiv(x - mesh.bounds.minX + Math.trunc(cellSize / 2), cellSize) / 4096)
    if (col < 0 || col >= gridX + 1) return 0
    const cell = row * gridX + col + (row >> 1)
    cells[n++] = cell
    if (row > 0) {
      if (col > 0) cells[n++] = cell - gridX - 1
      if (col < gridX) cells[n++] = cell - gridX
    }
    if (row < gridZ - 1) {
      if (col > 0) cells[n++] = cell + gridX
      if (col < gridX) cells[n++] = cell + gridX + 1
    }
    if (col > 0) cells[n++] = cell - 1
    if (col < gridX) cells[n++] = cell + 1
  }
  return n
}

const cellList = new Int32Array(7)
const triangleBounds = new Int32Array(6)
const looked = new Int32Array(MAX_LOOKED)
/** The hits a mesh hands the sweep, in the game's units about the mesh's origin. */
const hitList = new Int32Array(MAX_HITS * HIT_WORDS)

/**
 * The triangles of `mesh` whose boxes meet the box `max`/`min` (the game's
 * units, about the mesh's origin), into {@link hitList} in the game's order;
 * how many. Corners are the stored ones times `2 ** shift`; the normal is the
 * stored one, untouched (`func_02031188`, and the mover's scaling).
 */
function gather(
  mesh: CollisionMesh,
  maxX: number,
  maxY: number,
  maxZ: number,
  minX: number,
  minY: number,
  minZ: number,
): number {
  const { shift, bounds } = mesh
  const k = 2 ** shift
  // The whole mesh first, its box in the same units (`0x0204c074`).
  if (
    maxX < bounds.minX * k ||
    maxY < bounds.minY * k ||
    maxZ < bounds.minZ * k ||
    bounds.maxX * k < minX ||
    bounds.maxY * k < minY ||
    bounds.maxZ * k < minZ
  ) {
    return 0
  }
  const hiX = maxX >> shift
  const hiY = maxY >> shift
  const hiZ = maxZ >> shift
  const loX = minX >> shift
  const loY = minY >> shift
  const loZ = minZ >> shift
  const middleX = Math.trunc((hiX + loX) / 2)
  const middleZ = Math.trunc((hiZ + loZ) / 2)
  // **Ours:** a mesh with no grid — only ever one made here, never one from
  // the cartridge, where every file's cells tile — has every triangle looked at.
  const gridless = mesh.cells.length === 0
  const cellCount = gridless ? 1 : cellsAround(mesh, middleX, middleZ, cellList)
  let seen = 0
  let kept = 0
  for (let c = 0; c < cellCount; c++) {
    const entry = gridless ? undefined : mesh.cells[cellList[c] as number]
    if (!gridless && !entry) continue
    const start = entry?.start ?? 0
    const length = entry?.count ?? mesh.triangles.length
    for (let i = 0; i < length; i++) {
      const index = gridless ? i : (mesh.cellTriangles[start + i] as number)
      let already = false
      for (let s = 0; !gridless && s < seen; s++) {
        if (looked[s] === index) {
          already = true
          break
        }
      }
      if (already) continue
      if (!gridless) {
        looked[seen++] = index
        if (seen === MAX_LOOKED) return kept
      }
      triangleBox(mesh, index, triangleBounds)
      if (
        (triangleBounds[3] as number) < loX ||
        (triangleBounds[4] as number) < loY ||
        (triangleBounds[5] as number) < loZ ||
        hiX < (triangleBounds[0] as number) ||
        hiY < (triangleBounds[1] as number) ||
        hiZ < (triangleBounds[2] as number)
      ) {
        continue
      }
      const triangle = mesh.triangles[index]
      if (!triangle) continue
      const at = kept * HIT_WORDS
      for (let v = 0; v < 3; v++) {
        const corner = triangle.vertices[v] as readonly [number, number, number]
        hitList[at + 3 * v] = corner[0] * k
        hitList[at + 3 * v + 1] = corner[1] * k
        hitList[at + 3 * v + 2] = corner[2] * k
      }
      hitList[at + 9] = Math.round(triangle.normal[0] * 4096)
      hitList[at + 10] = Math.round(triangle.normal[1] * 4096)
      hitList[at + 11] = Math.round(triangle.normal[2] * 4096)
      kept++
      if (kept === MAX_HITS) return kept
    }
  }
  return kept
}

const centre = new Int32Array(3)
const previous = new Int32Array(3)

/** What the walls made of a move: where it ends, and whether any wall had a say. */
export interface WallResult {
  readonly x: number
  readonly z: number
  readonly hitWall: boolean
}

/**
 * Put a character moved from `was` to `(x, z)`, feet at `feetY`, right
 * against the walls, as the field's mover does (see the module): every mesh
 * in turn, each starting where the last left it. Everything is the world's
 * `fx32`: `radius` is the sweep's, and the box reaches as far either side;
 * its centre stands `radius` above the feet. In the game all three are
 * `0x800` for the party — the sweep's radius and lift are constants, and the
 * box is half the `Object3D` radius, `0x1000` (`func_ov017_0218f064`).
 */
export function againstWalls(
  pieces: readonly WallPiece[],
  was: { readonly x: number; readonly z: number },
  x: number,
  z: number,
  feetY: number,
  radius: number,
  height: number,
): WallResult {
  let hitWall = false
  // The box is drawn once, where the move took the character, and every mesh
  // gathers from it; only the sweep's centre carries on from mesh to mesh.
  const movedX = x
  const movedZ = z
  for (const { mesh, offset, scale } of pieces) {
    // The game's units per world unit: 8 on every map here.
    const k = Math.round(2 ** mesh.shift / scale)
    const reach = radius * k
    const boxX = (movedX - offset.x) * k
    const gy = (feetY - offset.y) * k
    const boxZ = (movedZ - offset.z) * k
    const count = gather(
      mesh,
      boxX + reach,
      gy + height * k,
      boxZ + reach,
      boxX - reach,
      gy - BOX_BELOW,
      boxZ - reach,
    )
    if (count === 0) continue
    centre[0] = (x - offset.x) * k
    centre[1] = gy + reach
    centre[2] = (z - offset.z) * k
    // The game hands the sweep the place it was in the map's own frame, not
    // the mesh's — the same thing for a mesh at the origin.
    previous[0] = was.x * k
    previous[2] = was.z * k
    const decided = sweep(hitList, count, reach, centre, previous)
    if (decided < 0) continue
    x = Math.round((centre[0] as number) / k) + offset.x
    z = Math.round((centre[2] as number) / k) + offset.z
    hitWall = true
  }
  return { x, z, hitWall }
}
