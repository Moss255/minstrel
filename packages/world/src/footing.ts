import { FX32_ONE, fx32 } from '@minstrel/fixed'
import { type CollisionWorld, groundBelow, type OpenGround } from '@minstrel/sim'
import type { MapPiece } from './assemble.ts'
import { placeGeometry } from './assemble.ts'

/**
 * Where a map draws open ground — the ground a monster may turn up on and walk
 * over — as a grid the simulation reads with shifts.
 *
 * **A collision floor is not always drawn ground.** On `F01` the floor runs
 * flat at 0.01 straight across the river: at the bank, where the Hero stands
 * at (−5, −1.4), nothing is drawn at that height, only the shore
 * (`f01ham01`) at −0.12 and the water (`f01wtr02`, `f01wtr01`) at −0.14 and
 * −0.26 beneath it. No bit of the triangles' attribute word separates those
 * floors from the land's — tallied on `F01`, every nibble value turns up on
 * both — so the map's own drawing is what tells them apart.
 *
 * **The tolerance is measured.** Over the flat floors of `F01`, `F02`, `F06`,
 * `M01`, `D01M01` and `D01M02`, the drawn surface nearest a floor's centre
 * lies within 0.03 of it on 765 of 866, within 0.06 on 780, and between 0.06
 * and 0.10 on only 9: a gap, and {@link DRAWN_WITHIN} sits in it. Of the
 * floors past it, 47 have water drawn beneath them and 39 do not — the
 * latter mostly under the hillsides.
 *
 * **Nor is drawn ground always open.** The collision also runs on under the
 * fields' forest blocks and cliffs, with the grass still drawn at its foot.
 * On `F01`, of 6,228 points over drawn floor on a 120 × 120 grid, 1,692 have
 * something drawn over them: forest (`fst`) 0.06 to 0.2 above, cliff (`clf`)
 * up to 0.75, and a terrace's grass at 0.4 to 0.5; `F02` is the same, and on
 * neither is anything drawn over a floor from 0.75 up. So a surface drawn
 * within {@link HEADROOM} above the floor closes it. In the Hexagon's rooms
 * that also shuts out the floor under the roofs (`rof`, 0.2 to 0.75 above).
 * Three of them roam — `D01M02`, `D01M03`, `D01M04` — and keep 869, 848 and
 * 672 open cells, their rooms and walkways.
 *
 * **Ours:** that a monster keeps to drawn, open ground at all; the grid's
 * cells, an eighth of a unit across ({@link GROUND_SHIFT}), each judged at its
 * centre on the highest floor there; and that outside the collision is not
 * ground. The game's own spawning is in its code, not its data.
 */
export const DRAWN_WITHIN = 0.06
/** How far above a floor a drawn surface closes it — see above. */
export const HEADROOM = 0.75
/** A cell is `1 << 9` `fx32` words across: an eighth of a unit. */
export const GROUND_SHIFT = 9

/** How many cells to a side the drawn triangles are filed under, to skip the far ones. */
const BUCKET_SHIFT = 13

/** A drawn triangle's corners, x y z three times, in world units. */
type Drawn = Float64Array

function drawnTriangles(pieces: readonly MapPiece[]): Drawn[] {
  const out: Drawn[] = []
  for (const piece of pieces) {
    const { model } = piece
    for (let shape = 0; shape < model.numShapes; shape++) {
      const placed = placeGeometry(model.posedGeometry(shape), piece.place, piece.scale)
      const { indices, vertices } = placed
      for (let t = 0; 3 * t + 2 < indices.length; t++) {
        const corners = new Float64Array(9)
        for (let k = 0; k < 3; k++) {
          const v = vertices[indices[3 * t + k] as number]
          if (!v) continue
          corners[3 * k] = v.x
          corners[3 * k + 1] = v.y
          corners[3 * k + 2] = v.z
        }
        out.push(corners)
      }
    }
  }
  return out
}

/** The height of a drawn triangle over (x, z), or undefined when (x, z) is off it or it stands on edge. */
function heightOver(t: Drawn, x: number, z: number): number | undefined {
  const ax = t[0] as number
  const az = t[2] as number
  const bx = t[3] as number
  const bz = t[5] as number
  const cx = t[6] as number
  const cz = t[8] as number
  const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
  if (Math.abs(d) < 1e-12) return undefined
  const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d
  const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d
  const l3 = 1 - l1 - l2
  const edge = -1e-9
  if (l1 < edge || l2 < edge || l3 < edge) return undefined
  return l1 * (t[1] as number) + l2 * (t[4] as number) + l3 * (t[7] as number)
}

/**
 * The open ground of a map: every cell over the collision whose highest floor
 * has a surface drawn within {@link DRAWN_WITHIN} of it and none within
 * {@link HEADROOM} above.
 */
export function openGround(pieces: readonly MapPiece[], world: CollisionWorld): OpenGround {
  const { bounds } = world
  const originX = Math.floor(bounds.minX)
  const originZ = Math.floor(bounds.minZ)
  const cellsX = Math.max(1, Math.ceil((bounds.maxX - originX) / (1 << GROUND_SHIFT)))
  const cellsZ = Math.max(1, Math.ceil((bounds.maxZ - originZ) / (1 << GROUND_SHIFT)))
  const cells = new Uint8Array(cellsX * cellsZ)

  // File each drawn triangle under the coarse buckets its footprint touches.
  const bucketsX = (cellsX >> (BUCKET_SHIFT - GROUND_SHIFT)) + 1
  const bucketsZ = (cellsZ >> (BUCKET_SHIFT - GROUND_SHIFT)) + 1
  const buckets: Drawn[][] = Array.from({ length: bucketsX * bucketsZ }, () => [])
  const bucketOf = (value: number, origin: number, count: number) =>
    Math.min(count - 1, Math.max(0, Math.floor((value * FX32_ONE - origin) / (1 << BUCKET_SHIFT))))
  for (const t of drawnTriangles(pieces)) {
    const x0 = bucketOf(Math.min(t[0] as number, t[3] as number, t[6] as number), originX, bucketsX)
    const x1 = bucketOf(Math.max(t[0] as number, t[3] as number, t[6] as number), originX, bucketsX)
    const z0 = bucketOf(Math.min(t[2] as number, t[5] as number, t[8] as number), originZ, bucketsZ)
    const z1 = bucketOf(Math.max(t[2] as number, t[5] as number, t[8] as number), originZ, bucketsZ)
    for (let bz = z0; bz <= z1; bz++) {
      for (let bx = x0; bx <= x1; bx++) (buckets[bz * bucketsX + bx] as Drawn[]).push(t)
    }
  }

  const above = fx32(Math.ceil(bounds.maxY) + FX32_ONE)
  const half = 1 << (GROUND_SHIFT - 1)
  for (let cz = 0; cz < cellsZ; cz++) {
    for (let cx = 0; cx < cellsX; cx++) {
      const wx = originX + (cx << GROUND_SHIFT) + half
      const wz = originZ + (cz << GROUND_SHIFT) + half
      const floor = groundBelow(world, fx32(wx), fx32(wz), above)
      if (!floor) continue
      const x = wx / FX32_ONE
      const z = wz / FX32_ONE
      const y = floor.y / FX32_ONE
      const nearby = buckets[
        bucketOf(z, originZ, bucketsZ) * bucketsX + bucketOf(x, originX, bucketsX)
      ] as Drawn[]
      let shown = false
      let closed = false
      for (const t of nearby) {
        const h = heightOver(t, x, z)
        if (h === undefined) continue
        const rise = h - y
        if (Math.abs(rise) <= DRAWN_WITHIN) shown = true
        else if (rise > DRAWN_WITHIN && rise <= HEADROOM) {
          closed = true
          break
        }
      }
      if (shown && !closed) cells[cz * cellsX + cx] = 1
    }
  }
  return { originX, originZ, shift: GROUND_SHIFT, cellsX, cellsZ, cells }
}
