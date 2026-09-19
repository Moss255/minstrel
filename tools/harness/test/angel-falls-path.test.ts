import { readFileSync } from 'node:fs'
import { type Fx32, fx32, toFloat } from '@minstrel/fixed'
import {
  isCollisionMesh,
  isMapManifest,
  readCollisionMesh,
  readMapManifest,
} from '@minstrel/game-formats'
import { decompressLz10, isLz10 } from '@minstrel/nitro-comp'
import { isNarc, readNarc, readNitroFs, walkFiles } from '@minstrel/nitrofs'
import {
  type CharacterState,
  type CollisionWorld,
  createCollisionWorld,
  groundBelow,
  PERSON,
  slopeOf,
  step,
} from '@minstrel/sim'
import { assembleMap } from '@minstrel/world'
import { beforeAll, describe, expect, it } from 'vitest'

const romPath = process.env.MINSTREL_TEST_ROM

/**
 * The village's Guardian statue stands on a ledge above it, and the slice opens
 * up there. Getting down is a fall; getting back up is one face, and how steep
 * a face the character will walk on decides whether the ledge is part of the
 * map or an island to be stranded off.
 */
describe.skipIf(!romPath)('the way back up to the Guardian statue', () => {
  let rom: Uint8Array
  let world: CollisionWorld

  /** The middle of the ledge, in world units. */
  const LEDGE = { x: Math.round(-1.67 * 4096), z: Math.round(-2.36 * 4096) }
  /** The village floor directly below it — where the Hero lands coming down. */
  const BELOW = { x: Math.round(-1.83 * 4096), z: Math.round(-1.55 * 4096) }

  beforeAll(() => {
    rom = new Uint8Array(readFileSync(romPath as string))
    const fs = readNitroFs(rom)
    let built: ReturnType<typeof assembleMap> | undefined
    for (const file of walkFiles(fs.root)) {
      if (file.path !== '/data/map/M01.amdj') continue
      const members = new Map<string, Uint8Array>()
      for (const member of readNarc(fs.read(file)).entries()) {
        const data = member.data
        members.set(String(member.name ?? member.index), isLz10(data) ? decompressLz10(data) : data)
      }
      for (const [name, data] of members) {
        if (name.endsWith('.bmdj') && isMapManifest(data)) {
          built = assembleMap(readMapManifest(data), members)
        }
      }
    }
    if (!built) throw new Error('the village, /data/map/M01.amdj, is not in this cartridge')
    world = createCollisionWorld(built.meshes)
  })

  const CELL = Math.round(0.15 * 4096)
  const key = (x: number, z: number) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`

  /** Where walking from one spot on the ground can get to, as grid keys. */
  function walkFrom(from: { x: number; z: number; y: Fx32 }): Set<string> {
    const speed = Math.round(0.05 * 4096)
    const seen = new Set([key(from.x, from.z)])
    const queue: CharacterState[] = [
      { x: fx32(from.x), y: from.y, z: fx32(from.z), fallSpeed: fx32(0), grounded: true },
    ]
    while (queue.length > 0 && seen.size < 20_000) {
      const at = queue.pop() as CharacterState
      for (let d = 0; d < 16; d++) {
        const angle = (d * Math.PI) / 8
        let state = at
        for (let i = 0; i < 4; i++) {
          state = step(
            world,
            state,
            fx32(Math.round(Math.cos(angle) * speed)),
            fx32(Math.round(Math.sin(angle) * speed)),
            PERSON,
          )
        }
        if (!state.grounded) continue
        const k = key(state.x, state.z)
        if (seen.has(k)) continue
        seen.add(k)
        queue.push(state)
      }
    }
    return seen
  }

  it('is a single face, steeper than fifty degrees', () => {
    // Everything on the ledge's rim that is ground rather than cliff: faces
    // reaching its height from below, within the ledge's own corner of the map.
    const ramps = world.triangles.filter((t) => {
      const xs = t.vertices.map((v) => v[0] / 4096)
      const ys = t.vertices.map((v) => v[1] / 4096)
      const zs = t.vertices.map((v) => v[2] / 4096)
      if (Math.max(...ys) < 0.17 || Math.min(...ys) > 0.17) return false
      if (Math.min(...xs) < -3.2 || Math.max(...xs) > -0.6 || Math.min(...zs) < -2.9) return false
      return toFloat(slopeOf(t)) > 0.2
    })
    const degrees = ramps
      .map((t) => (Math.acos(Math.min(1, toFloat(slopeOf(t)))) * 180) / Math.PI)
      .sort((a, b) => a - b)
    const found = `rim ramps at ${degrees.map((d) => d.toFixed(1)).join(', ')} degrees`
    // One, at 56.7 degrees, and nothing gentler anywhere around the ledge.
    expect(ramps.length, found).toBeGreaterThan(0)
    expect(degrees[0] as number, found).toBeGreaterThan(50)
    expect(degrees[0] as number, found).toBeLessThan(60)
  })

  it('can be walked, so the ledge is not an island', () => {
    const under = (p: { x: number; z: number }) =>
      groundBelow(world, fx32(p.x), fx32(p.z), fx32(world.bounds.maxY + 4096))

    const onLedge = under(LEDGE)
    expect(onLedge, 'no ground on the statue ledge').toBeDefined()
    expect(toFloat((onLedge as NonNullable<typeof onLedge>).y)).toBeGreaterThan(0.17)

    const onFloor = under(BELOW)
    expect(onFloor, 'no ground below the ledge').toBeDefined()
    const floor = onFloor as NonNullable<typeof onFloor>
    expect(toFloat(floor.y)).toBeLessThan(0.1)

    const reached = walkFrom({ x: BELOW.x, z: BELOW.z, y: floor.y })
    expect(
      reached.has(key(LEDGE.x, LEDGE.z)),
      'the statue ledge cannot be walked to from the village below it',
    ).toBe(true)
  }, 120_000)

  it('sets the slope limit in the gap the cartridge leaves between ramps and walls', () => {
    // Steepness across every collision face on the cartridge falls away
    // smoothly from flat to 60 degrees and then stops; the walls begin again at
    // 79. What the limit must not be is chosen by eye, and this is what says so.
    const fs = readNitroFs(rom)
    const buckets = new Array(91).fill(0) as number[]
    let faces = 0
    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isNarc(bytes)) continue
      let narc: ReturnType<typeof readNarc>
      try {
        narc = readNarc(bytes)
      } catch {
        continue
      }
      for (const member of narc.entries()) {
        const data = isLz10(member.data) ? decompressLz10(member.data) : member.data
        if (!isCollisionMesh(data)) continue
        let mesh: ReturnType<typeof readCollisionMesh>
        try {
          mesh = readCollisionMesh(data)
        } catch {
          continue
        }
        for (const t of mesh.triangles) {
          // Degenerate faces store no normal and have no steepness.
          if (t.normal[0] === 0 && t.normal[1] === 0 && t.normal[2] === 0) continue
          const d = Math.max(
            0,
            Math.min(90, Math.round((Math.acos(Math.min(1, toFloat(slopeOf(t)))) * 180) / Math.PI)),
          )
          buckets[d] = (buckets[d] as number) + 1
          faces++
        }
      }
    }
    expect(faces).toBeGreaterThan(100_000)

    const band = (from: number, to: number) =>
      buckets.slice(from, to + 1).reduce((a, b) => a + b, 0)
    const shape = `ramps ${band(45, 60)}, trough ${band(61, 78)}, walls ${band(79, 90)} of ${faces}`
    // Vanishing: about 40 faces across eighteen degrees.
    expect(band(61, 78) / faces, shape).toBeLessThan(0.001)
    // Ground on one side of the trough, walls on the other.
    expect(band(45, 60) / faces, shape).toBeGreaterThan(0.004)
    expect(band(79, 90) / faces, shape).toBeGreaterThan(0.8)
    // And the limit sits in the gap, at the ground's end of it.
    const limit = (Math.acos(toFloat(PERSON.maxSlope)) * 180) / Math.PI
    expect(limit, `limit ${limit.toFixed(1)} degrees`).toBeGreaterThanOrEqual(60)
    expect(limit, `limit ${limit.toFixed(1)} degrees`).toBeLessThan(79)
  }, 300_000)
})
