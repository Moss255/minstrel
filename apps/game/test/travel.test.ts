import { readFileSync } from 'node:fs'
import { fx32 } from '@minstrel/fixed'
import {
  evacDestination,
  isMapManifest,
  readMapManifest,
  revivalVoice,
} from '@minstrel/game-formats'
import { decompressLz10, isLz10 } from '@minstrel/nitro-comp'
import { readNarc, readNitroFs, walkFiles } from '@minstrel/nitrofs'
import { type CollisionWorld, createCollisionWorld, groundBelow } from '@minstrel/sim'
import { assembleMap, WORLD_SCALE } from '@minstrel/world'
import { describe, expect, it } from 'vitest'
import { type Loaded, load } from '../src/load.ts'

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('travel, on a real cartridge', { timeout: 120_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()
  const here = romPath ? load(rom, { map: 'D01M01' }) : (undefined as unknown as Loaded)

  it("has Zoom's eighteen places, in the order the code's table marks them", () => {
    const { places, placeMaps } = here.travel
    expect(places.map((p) => p.name).slice(0, 4)).toEqual([
      'Angel Falls',
      'Zere',
      'Stornway',
      'Coffinwell',
    ])
    expect(places).toHaveLength(18)
    expect(placeMaps).toHaveLength(18)
    // Angel Falls' exterior, Stornway's, and Newid Isle for the Abbey.
    expect(placeMaps.slice(0, 5)).toEqual([1100, 1200, 100, 1300, 20007])
    expect(places[0]).toMatchObject({ revivalMap: 1106, map: 20001 })
  })

  it('takes Evac from the Hexagon to the Angel Falls region, and from Zere Rocks nowhere', () => {
    const { evac } = here.travel
    expect(here.mapArea).toBe(7100)
    expect(here.mapZoom).toBe(1)
    const out = evacDestination(evac, { map: 7101, area: 7100, lastField: 0 })
    expect(out?.map).toBe(20001)
    expect(out?.x).toBeCloseTo(50.93, 2)
    expect(evacDestination(evac, { map: 7700, area: 7700, lastField: 0 })).toBeUndefined()
  })

  it('lands Zoom and Evac on floor, in the map’s own units scaled into the world as a doorway’s are', () => {
    // Both tables give a place in the map's own units, as a doorway's arrival
    // does, and the world is those at `WORLD_SCALE`. Taken unscaled, they put
    // the party eight times as far from the map's middle — off its floor, to be
    // set down "no floor under the doorway" wherever was nearest.
    const fs = readNitroFs(rom)
    const files = new Map([...walkFiles(fs.root)].map((f) => [f.path, f]))
    const worlds = new Map<string, CollisionWorld | undefined>()
    const worldOf = (code: string): CollisionWorld | undefined => {
      if (worlds.has(code)) return worlds.get(code)
      const file = files.get(`/data/map/${code}.amdj`)
      let world: CollisionWorld | undefined
      if (file) {
        const members = new Map<string, Uint8Array>()
        for (const m of readNarc(fs.read(file)).entries()) {
          members.set(String(m.name ?? m.index), isLz10(m.data) ? decompressLz10(m.data) : m.data)
        }
        const manifest = [...members].find(([n, d]) => n.endsWith('.bmdj') && isMapManifest(d))
        const built = manifest && assembleMap(readMapManifest(manifest[1]), members)
        if (built && built.meshes.length > 0) world = createCollisionWorld(built.meshes)
      }
      worlds.set(code, world)
      return world
    }
    const { places, evac } = here.travel
    const landings = [
      ...places.map((p) => ({ what: p.name, map: p.map, x: p.x, z: p.z })),
      ...evac.flatMap((r) =>
        r.destinations
          .filter((d) => d.map !== 0)
          .map((d) => ({ what: `Evac from ${r.area}`, map: d.map, x: d.x, z: d.z })),
      ),
    ]
    const floored = (world: CollisionWorld, x: number, z: number) =>
      groundBelow(
        world,
        fx32(Math.round(x * 4096)),
        fx32(Math.round(z * 4096)),
        fx32(Math.round(world.bounds.maxY + 4096)),
      ) !== undefined
    const missed: string[] = []
    let scaled = 0
    let raw = 0
    let measured = 0
    for (const landing of landings) {
      const code = here.mapCodeOf(landing.map)
      const world = code ? worldOf(code) : undefined
      if (!code || !world) continue
      measured++
      if (floored(world, landing.x * WORLD_SCALE, landing.z * WORLD_SCALE)) scaled++
      else missed.push(`${landing.what} → ${code}`)
      if (floored(world, landing.x, landing.z)) raw++
    }
    // All 37 on floor scaled; unscaled, 1.
    expect(measured).toBeGreaterThan(30)
    expect(missed).toEqual([])
    expect(scaled).toBe(measured)
    expect(raw).toBeLessThan(measured / 4)
  })

  it("says nothing on waking in Angel Falls' church at 1, and in voice 1 after", () => {
    const words = here.travel.revivalWords
    expect(revivalVoice(words, 1106, 1, false)).toBe(3)
    expect(revivalVoice(words, 1106, 2, false)).toBe(1)
    expect(revivalVoice(words, 216, 5, true)).toBe(2)
  })

  it('names item 22019 the chimaera wing, which the field menu tests for', () => {
    expect(here.itemNames.get(22019)).toBe('chimaera wing')
  })
})
