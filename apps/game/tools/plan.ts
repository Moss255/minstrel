import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { toFloat } from '@minstrel/fixed'
import { poseGeometry } from '@minstrel/nitro-gfx'
import { placeGeometry } from '@minstrel/world'
import { encodePng } from '../../../tools/sprite/png.ts'
import { load } from '../src/load.ts'

/**
 * A map from above: what is drawn, and what you can stand on, on one plan.
 *
 * ```sh
 * node apps/game/tools/plan.ts rom/your.nds M01M08
 * ```
 *
 * Writes to `out/plan/`, which `.gitignore` covers — **these are cartridge
 * coordinates and must never be committed.**
 *
 * Grey is the geometry the game draws, green the collision you can stand on,
 * red the collision that stops you. It goes through `load`, so it draws what
 * the game draws rather than a second opinion about it.
 *
 * The two should be the same room. Where they are not, the picture says so at
 * once and in which direction: `M01M08`, the well, has a walkable floor twice
 * the width of the room drawn inside it — the same decagon at two sizes.
 */
const rom = new Uint8Array(readFileSync(process.argv[2] as string))
const code = process.argv[3] as string
const SIZE = 700
/**
 * Draw only what is below this height, so a room reads as a floor plan rather
 * than as the silhouette of its own roof. `--under=0.3`, in world units.
 */
const under = Number(
  process.argv.find((a) => a.startsWith('--under='))?.slice(8) ?? Number.POSITIVE_INFINITY,
)
/** `--floor` draws only near-horizontal geometry: the floor, and nothing on it. */
const floorOnly = process.argv.includes('--floor')
/** `--walls` draws only what stands up, so the drawn room's walls can be seen. */
const wallsOnly = process.argv.includes('--walls')

const o = load(rom, { map: code })
type Tri = [number, number, number, number, number, number]
const drawn: Tri[] = []
for (const { model, place, scale } of o.map.pieces) {
  model.shapes.forEach((shape, index) => {
    const g = placeGeometry(
      poseGeometry(model.geometry(shape), model.shapeMatrices[index] ?? model.matrices),
      place,
      scale,
    )
    for (let i = 0; i + 2 < g.indices.length; i += 3) {
      const a = g.vertices[g.indices[i] as number]
      const b = g.vertices[g.indices[i + 1] as number]
      const c = g.vertices[g.indices[i + 2] as number]
      if (!a || !b || !c) continue
      if (Math.min(a.y, b.y, c.y) > under) continue
      if (floorOnly || wallsOnly) {
        const ux = b.x - a.x
        const uy = b.y - a.y
        const uz = b.z - a.z
        const vx = c.x - a.x
        const vy = c.y - a.y
        const vz = c.z - a.z
        const ny = uz * vx - ux * vz
        const len = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx)
        if (floorOnly && (len === 0 || Math.abs(ny) / len < 0.9)) continue
        if (wallsOnly) {
          if (len === 0 || Math.abs(ny) / len > 0.3) continue
          if (Math.max(a.y, b.y, c.y) - Math.min(a.y, b.y, c.y) < 0.1) continue
        }
      }
      drawn.push([a.x, a.z, b.x, b.z, c.x, c.z])
    }
  })
}
const floor: Tri[] = []
const walls: Tri[] = []
const w = o.world as NonNullable<typeof o.world>
for (const t of w.triangles) {
  const [a, b, c] = t.vertices
  const tri: Tri = [a[0] / 4096, a[2] / 4096, b[0] / 4096, b[2] / 4096, c[0] / 4096, c[2] / 4096]
  ;(Math.abs(t.normal[1]) > 0.64 ? floor : walls).push(tri)
}

const all = [...drawn, ...floor, ...walls]
const xs = all.flatMap((t) => [t[0], t[2], t[4]])
const zs = all.flatMap((t) => [t[1], t[3], t[5]])
const minX = Math.min(...xs)
const maxX = Math.max(...xs)
const minZ = Math.min(...zs)
const maxZ = Math.max(...zs)
const span = Math.max(maxX - minX, maxZ - minZ) * 1.05
const px = (x: number) => Math.round(((x - (minX + maxX) / 2) / span + 0.5) * SIZE)
const pz = (z: number) => Math.round(((z - (minZ + maxZ) / 2) / span + 0.5) * SIZE)

const rgba = new Uint8Array(SIZE * SIZE * 4)
for (let i = 0; i < SIZE * SIZE; i++) rgba.set([0x16, 0x16, 0x1c, 0xff], i * 4)
function fill(t: Tri, colour: number[], alpha: number) {
  const x0 = Math.max(0, Math.min(px(t[0]), px(t[2]), px(t[4])))
  const x1 = Math.min(SIZE - 1, Math.max(px(t[0]), px(t[2]), px(t[4])))
  const z0 = Math.max(0, Math.min(pz(t[1]), pz(t[3]), pz(t[5])))
  const z1 = Math.min(SIZE - 1, Math.max(pz(t[1]), pz(t[3]), pz(t[5])))
  const ax = px(t[0]),
    az = pz(t[1]),
    bx = px(t[2]),
    bz = pz(t[3]),
    cx = px(t[4]),
    cz = pz(t[5])
  const area = (bx - ax) * (cz - az) - (bz - az) * (cx - ax)
  if (area === 0) return
  for (let y = z0; y <= z1; y++) {
    for (let x = x0; x <= x1; x++) {
      const wa = (bx - ax) * (y - az) - (bz - az) * (x - ax)
      const wb = (cx - bx) * (y - bz) - (cz - bz) * (x - bx)
      const wc = (ax - cx) * (y - cz) - (az - cz) * (x - cx)
      const inside = area > 0 ? wa >= 0 && wb >= 0 && wc >= 0 : wa <= 0 && wb <= 0 && wc <= 0
      if (!inside) continue
      const at = (y * SIZE + x) * 4
      for (let k = 0; k < 3; k++) {
        rgba[at + k] = Math.round(
          (rgba[at + k] as number) * (1 - alpha) + (colour[k] as number) * alpha,
        )
      }
    }
  }
}
if (!wallsOnly) for (const t of drawn) fill(t, [0x9a, 0x9a, 0xb0], 0.14)
for (const t of floor) fill(t, [0x40, 0xd0, 0x70], 0.22)
// A wall is vertical, so from above it is a line rather than a shape: filling
// it draws nothing at all, which is why the collision outline was missing.
function line(x0: number, z0: number, x1: number, z1: number, colour: number[]) {
  const ax = px(x0)
  const az = pz(z0)
  const bx = px(x1)
  const bz = pz(z1)
  const steps = Math.max(Math.abs(bx - ax), Math.abs(bz - az), 1)
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(ax + ((bx - ax) * i) / steps)
    const y = Math.round(az + ((bz - az) * i) / steps)
    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) continue
    rgba.set([...(colour as [number, number, number]), 0xff], (y * SIZE + x) * 4)
  }
}
function longest(t: Tri): [number, number, number, number] {
  const pairs: [number, number, number, number][] = [
    [t[0], t[1], t[2], t[3]],
    [t[2], t[3], t[4], t[5]],
    [t[4], t[5], t[0], t[1]],
  ]
  let best = pairs[0] as [number, number, number, number]
  let far = -1
  for (const pair of pairs) {
    const length = Math.hypot(pair[2] - pair[0], pair[3] - pair[1])
    if (length > far) {
      far = length
      best = pair
    }
  }
  return best
}
if (wallsOnly) {
  for (const t of drawn) {
    const e = longest(t)
    line(e[0], e[1], e[2], e[3], [0xb0, 0xb0, 0xd0])
  }
}
for (const t of walls) {
  // The two ends furthest apart in projection are the wall's own line.
  const pairs: [number, number, number, number][] = [
    [t[0], t[1], t[2], t[3]],
    [t[2], t[3], t[4], t[5]],
    [t[4], t[5], t[0], t[1]],
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
  line(best[0], best[1], best[2], best[3], [0xff, 0x50, 0x50])
}

// The doorways: a cross where the trigger stands, a ring where it arrives.
function mark(x: number, z: number, colour: number[], r: number) {
  for (let d = -r; d <= r; d++) {
    for (const [px2, pz2] of [
      [px(x) + d, pz(z)],
      [px(x), pz(z) + d],
    ] as [number, number][]) {
      if (px2 < 0 || px2 >= SIZE || pz2 < 0 || pz2 >= SIZE) continue
      rgba.set([...(colour as [number, number, number]), 0xff], (pz2 * SIZE + px2) * 4)
    }
  }
}
for (const door of o.doorways) mark(door.x, door.z, [0xff, 0xd0, 0x40], 9)

// Where the map that leads here puts the character down.
const from = process.argv.slice(4).find((a) => !a.startsWith('--'))
if (from) {
  const back = load(rom, { map: from })
  for (const door of back.doorways) {
    if (door.to.toUpperCase() !== code.toUpperCase()) continue
    mark(door.arriveX, door.arriveZ, [0xff, 0x70, 0xd0], 7)
    console.log(`  arrives from ${from} at ${door.arriveX.toFixed(2)}, ${door.arriveZ.toFixed(2)}`)
  }
}

mkdirSync(join('out', 'plan'), { recursive: true })
const file = join('out', 'plan', `${code}.png`)
writeFileSync(file, encodePng(SIZE, SIZE, rgba))
console.log(
  `${code}: ${drawn.length} drawn triangles, ${floor.length} floor, ${walls.length} wall; ` +
    `span ${span.toFixed(2)} units -> ${file}`,
)
console.log(
  `  everything x ${minX.toFixed(2)}..${maxX.toFixed(2)}  collision x ${toFloat(w.bounds.minX as never).toFixed(2)}..${toFloat(w.bounds.maxX as never).toFixed(2)}`,
)
for (const door of o.doorways) {
  console.log(`  door to ${door.to} stands at ${door.x.toFixed(2)}, ${door.z.toFixed(2)}`)
}
