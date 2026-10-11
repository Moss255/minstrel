import { readFileSync } from 'node:fs'
import { fx32 } from '@minstrel/fixed'
import { isMapManifest, readMapManifest } from '@minstrel/game-formats'
import { decompressLz10, isLz10 } from '@minstrel/nitro-comp'
import { readNarc, readNitroFs, walkFiles } from '@minstrel/nitrofs'
import {
  type CharacterState,
  type CollisionWorld,
  createCollisionWorld,
  groundBelow,
  PERSON,
  step,
} from '@minstrel/sim'
import { assembleMap, WORLD_SCALE } from '@minstrel/world'
import { describe, expect, it } from 'vitest'
import { inDoorway } from '../src/doors.ts'
import { grottoCode } from '../src/grotto.ts'
import { grottoVisitOf, load } from '../src/load.ts'

const romPath = process.env.MINSTREL_TEST_ROM

const floored = (world: CollisionWorld, x: number, z: number) =>
  groundBelow(
    world,
    fx32(Math.round(x * 4096)),
    fx32(Math.round(z * 4096)),
    fx32(Math.round(world.bounds.maxY + 4096)),
  )

describe.skipIf(!romPath)('a grotto, walked, on a real cartridge', { timeout: 300_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

  it('builds a map’s floors whole, and chains them by their ways', () => {
    const visit = grottoVisitOf(rom, 12345, 50, 1)
    expect(visit?.details.name).toBe('Rock Mine of Woe')
    expect(visit?.floors).toBe(2)
    if (!visit) return
    const first = load(rom, { map: grottoCode(1), grotto: visit })
    expect(first.map.missing).toEqual([])
    // 256 tiles, one piece each, and the two ways.
    expect(first.map.pieces.length).toBeGreaterThanOrEqual(258)
    expect(first.doorways.map((d) => d.to)).toEqual([visit.entrance.code, 'Z00M02'])
    const second = load(rom, { map: grottoCode(2), grotto: visit })
    // The last floor's way down leads to the boss floor, not built.
    expect(second.doorways.map((d) => d.to)).toEqual(['Z00M01'])

    // Coming down a way puts the party in front of the way up below, and up
    // one in front of the way down above: on floor, and clear of the way.
    const down = first.doorways[1]
    const up = second.doorways[0]
    if (!down || !up || !first.world || !second.world) throw new Error('no ways')
    expect(floored(second.world, down.arriveX, down.arriveZ)).toBeDefined()
    expect(inDoorway(up, down.arriveX, down.arriveZ, 0)).toBe(false)
    expect(floored(first.world, up.arriveX, up.arriveZ)).toBeDefined()
    expect(inDoorway(down, up.arriveX, up.arriveZ, 0)).toBe(false)
  })

  it('can be walked from the way up to the way down, against its turned tiles', () => {
    const visit = grottoVisitOf(rom, 12345, 50, 1)
    if (!visit) throw new Error('no visit')
    const first = load(rom, { map: grottoCode(1), grotto: visit })
    const world = first.world
    const start = first.start
    const down = first.doorways.find((d) => d.to === 'Z00M02')
    if (!world || !start || !down) throw new Error('no floor')
    const ground = floored(world, start.x, start.z)
    expect(ground).toBeDefined()
    const begin: CharacterState = {
      x: fx32(Math.round(start.x * 4096)),
      y: ground?.y ?? fx32(0),
      z: fx32(Math.round(start.z * 4096)),
      fallSpeed: fx32(0),
      grounded: true,
    }
    // A flood over the floor in a person's steps, a twentieth of a unit apart.
    const key = (s: CharacterState) => Math.floor(s.x / 409) * 100_000 + Math.floor(s.z / 409)
    const seen = new Set([key(begin)])
    const queue = [begin]
    let reached = false
    while (queue.length > 0 && !reached) {
      const at = queue.pop() as CharacterState
      for (let d = 0; d < 16; d++) {
        const angle = (d * Math.PI) / 8
        let s = at
        for (let i = 0; i < 4; i++) {
          s = step(
            world,
            s,
            fx32(Math.round(Math.cos(angle) * 123)),
            fx32(Math.round(Math.sin(angle) * 123)),
            PERSON,
          )
        }
        if (!s.grounded || seen.has(key(s))) continue
        seen.add(key(s))
        queue.push(s)
        if (inDoorway(down, s.x / 4096, s.z / 4096)) reached = true
      }
    }
    expect(reached).toBe(true)
  })

  it('comes out of every one of the 150 places on the field’s floor', () => {
    const fs = readNitroFs(rom)
    const files = new Map([...walkFiles(fs.root)].map((f) => [f.path, f]))
    const worlds = new Map<string, CollisionWorld | undefined>()
    const worldOf = (code: string): CollisionWorld | undefined => {
      if (worlds.has(code)) return worlds.get(code)
      const meshes = []
      // A field may be in halves, `O01a` and `O01b`.
      for (const name of [code, `${code}a`, `${code}b`]) {
        const file = files.get(`/data/map/${name}.amdj`)
        if (!file) continue
        const members = new Map<string, Uint8Array>()
        for (const m of readNarc(fs.read(file)).entries()) {
          members.set(String(m.name ?? m.index), isLz10(m.data) ? decompressLz10(m.data) : m.data)
        }
        const manifest = [...members].find(([n, d]) => n.endsWith('.bmdj') && isMapManifest(d))
        if (manifest) meshes.push(...assembleMap(readMapManifest(manifest[1]), members).meshes)
      }
      const world = meshes.length > 0 ? createCollisionWorld(meshes) : undefined
      worlds.set(code, world)
      return world
    }
    const missed: string[] = []
    let measured = 0
    for (let place = 1; place <= 150; place++) {
      const visit = grottoVisitOf(rom, 1, 200, place)
      if (!visit) continue
      const world = worldOf(visit.entrance.code)
      if (!world) continue
      measured++
      const w = WORLD_SCALE / 4096
      const { x, z } = visit.entrance
      if (!floored(world, x * w, (z + 0x2000) * w)) missed.push(`${place} → ${visit.entrance.code}`)
    }
    expect(measured).toBe(150)
    expect(missed).toEqual([])
  })

  it("comes round on the church's floor, its start point in world units", () => {
    const church = load(rom, { map: 'M01M06' })
    const start = church.start
    if (!start || !church.world) throw new Error('no start')
    expect(start.z).toBeCloseTo(-2.64 * WORLD_SCALE, 4)
    expect(floored(church.world, start.x, start.z)).toBeDefined()
  })
})
