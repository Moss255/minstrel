import { readFileSync } from 'node:fs'
import { fx32 } from '@minstrel/fixed'
import {
  isMapManifest,
  type MapTransition,
  mapDoorways,
  readMapManifest,
} from '@minstrel/game-formats'
import { decompressLz10, isLz10 } from '@minstrel/nitro-comp'
import { type NitroFs, readNarc, readNitroFs, walkFiles } from '@minstrel/nitrofs'
import {
  type CharacterState,
  type CollisionWorld,
  createCollisionWorld,
  groundBelow,
  PERSON,
  step,
} from '@minstrel/sim'
import { assembleMap, type MapPiece, placeGeometry, WORLD_SCALE } from '@minstrel/world'
import { beforeAll, describe, expect, it } from 'vitest'

const romPath = process.env.MINSTREL_TEST_ROM

/**
 * **The Angel Falls field is walked inside its own walls.** `F01`'s collision
 * runs on, flat, under the mountains that ring the field and out past them,
 * where no piece of the map is drawn — behind the Hexagon, to the south-east,
 * is a wedge of it with nothing over it at all. What keeps the Hero in is the
 * walls at the mountains' foot, and the game's way with them (`walls.ts`):
 * the old push let a character slip through the corner two of them make at
 * about (8.5, −1.0), into the forest's floor behind and on into the wedge.
 */
/** Every drawn triangle of a map, flattened onto the ground. */
function groundPlan(pieces: readonly MapPiece[]): Float64Array {
  const out: number[] = []
  for (const piece of pieces) {
    for (let shape = 0; shape < piece.model.numShapes; shape++) {
      const { indices, vertices } = placeGeometry(
        piece.model.posedGeometry(shape),
        piece.place,
        piece.scale,
      )
      for (let t = 0; 3 * t + 2 < indices.length; t++) {
        for (let k = 0; k < 3; k++) {
          const v = vertices[indices[3 * t + k] as number]
          out.push(v?.x ?? 0, v?.z ?? 0)
        }
      }
    }
  }
  return Float64Array.from(out)
}

describe.skipIf(!romPath)('the Angel Falls field, walked', () => {
  let fs: NitroFs
  let world: CollisionWorld
  /** The drawn triangles' corners on the ground, x and z three times over. */
  let drawn: Float64Array
  let doors: MapTransition[]
  let arrival: { x: number; z: number }

  function members(path: string): Map<string, Uint8Array> {
    const file = [...walkFiles(fs.root)].find((f) => f.path === path)
    if (!file) throw new Error(`${path} is not in this cartridge`)
    const out = new Map<string, Uint8Array>()
    for (const m of readNarc(fs.read(file)).entries()) {
      out.set(String(m.name ?? m.index), isLz10(m.data) ? decompressLz10(m.data) : m.data)
    }
    return out
  }

  function doorwaysOf(map: string): MapTransition[] {
    for (const [name, data] of members(`/data/map/${map}.ambl`)) {
      if (name.endsWith('.bmbl')) return mapDoorways(data)
    }
    return []
  }

  beforeAll(() => {
    fs = readNitroFs(new Uint8Array(readFileSync(romPath as string)))
    const field = members('/data/map/F01.amdj')
    const manifest = [...field].find(([n, d]) => n.endsWith('.bmdj') && isMapManifest(d))
    if (!manifest) throw new Error('F01 has no manifest')
    const built = assembleMap(readMapManifest(manifest[1]), field)
    world = createCollisionWorld(built.meshes)
    drawn = groundPlan(built.pieces)
    doors = doorwaysOf('F01')
    // Where coming out of the village puts the party: the village's own
    // doorway to the field says so.
    const out = doorwaysOf('M01').find((d) => d.to === 'F01')
    if (!out) throw new Error('the village has no way to the field')
    arrival = { x: out.arriveX * WORLD_SCALE, z: out.arriveZ * WORLD_SCALE }
  })

  /** Whether `(x, z)` is in a doorway's box: stepping there leaves the map. */
  function inDoorway(x: number, z: number): MapTransition | undefined {
    return doors.find((d) => {
      const dx = x - d.x * WORLD_SCALE
      const dz = z - d.z * WORLD_SCALE
      const u = dx * Math.cos(d.angle) - dz * Math.sin(d.angle)
      const v = dx * Math.sin(d.angle) + dz * Math.cos(d.angle)
      return (
        Math.abs(u) <= (d.width * WORLD_SCALE) / 2 && Math.abs(v) <= (d.depth * WORLD_SCALE) / 2
      )
    })
  }

  /** Every place a walk from the village's arrival gets to, a tenth of a unit to a key. */
  function walk(): { reached: Map<number, CharacterState>; left: Set<string> } {
    const cell = Math.round(0.1 * 4096)
    const key = (s: CharacterState) => Math.floor(s.x / cell) * 100_000 + Math.floor(s.z / cell)
    const at = { x: Math.round(arrival.x * 4096), z: Math.round(arrival.z * 4096) }
    const ground = groundBelow(world, fx32(at.x), fx32(at.z), fx32(world.bounds.maxY + 4096))
    if (!ground) throw new Error('nothing to stand on where the village lets out')
    const start: CharacterState = {
      x: fx32(at.x),
      y: ground.y,
      z: fx32(at.z),
      fallSpeed: fx32(0),
      grounded: true,
    }
    const reached = new Map([[key(start), start]])
    const left = new Set<string>()
    const queue = [start]
    // Steps well inside the walls' reach, as walking's are: the walls look
    // only at where a step ends.
    const pace = Math.round(0.03 * 4096)
    while (queue.length > 0) {
      const from = queue.pop() as CharacterState
      for (let d = 0; d < 16; d++) {
        const angle = (d * Math.PI) / 8
        let s = from
        for (let i = 0; i < 4; i++) {
          s = step(
            world,
            s,
            fx32(Math.round(Math.cos(angle) * pace)),
            fx32(Math.round(Math.sin(angle) * pace)),
            PERSON,
          )
        }
        if (!s.grounded) continue
        const door = inDoorway(s.x / 4096, s.z / 4096)
        if (door) {
          left.add(door.to)
          continue
        }
        const k = key(s)
        if (reached.has(k)) continue
        reached.set(k, s)
        queue.push(s)
      }
    }
    return { reached, left }
  }

  /** Whether any of the map's drawn pieces lies over or under `(x, z)`. */
  function drawnAt(x: number, z: number): boolean {
    for (let t = 0; t + 5 < drawn.length; t += 6) {
      const ax = drawn[t] as number
      const az = drawn[t + 1] as number
      const bx = drawn[t + 2] as number
      const bz = drawn[t + 3] as number
      const cx = drawn[t + 4] as number
      const cz = drawn[t + 5] as number
      const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az)
      if (area === 0) continue
      const u = ((bx - x) * (cz - z) - (cx - x) * (bz - z)) / area
      const v = ((cx - x) * (az - z) - (ax - x) * (cz - z)) / area
      if (u >= 0 && v >= 0 && u + v <= 1) return true
    }
    return false
  }

  it('reaches all three of its ways out, and never ground nothing is drawn over', () => {
    const { reached, left } = walk()
    expect([...left].sort()).toEqual(['D01', 'M01', 'S01M01'])
    // Behind the Hexagon, in the wedge: floor, and nothing drawn.
    const wedge =
      Math.floor((8.86 * 4096) / Math.round(0.1 * 4096)) * 100_000 +
      Math.floor((6 * 4096) / Math.round(0.1 * 4096))
    expect(reached.has(wedge)).toBe(false)
    // Every place reached has the map drawn over it — sampled, every tenth.
    const sample = [...reached.values()].filter((_, i) => i % 10 === 0)
    const bare = sample.filter((s) => !drawnAt(s.x / 4096, s.z / 4096))
    expect(bare.map((s) => `${(s.x / 4096).toFixed(2)},${(s.z / 4096).toFixed(2)}`)).toEqual([])
  }, 300_000)
})
