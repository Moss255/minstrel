import { readFileSync } from 'node:fs'
import { FX32_ONE, fx32, toFloat } from '@minstrel/fixed'
import { groundBelow, PERSON } from '@minstrel/sim'
import { inMarsh } from '@minstrel/world'
import { describe, expect, it } from 'vitest'
import { load } from '../src/load.ts'
import { afterMarsh, MARSH_TOLL } from '../src/marsh.ts'
import { advance, player } from '../src/player.ts'

describe('the poison marsh’s toll', () => {
  it('takes its toll, but never the last HP', () => {
    expect(afterMarsh(20)).toBe(20 - MARSH_TOLL)
    expect(afterMarsh(1)).toBe(1)
    expect(afterMarsh(0)).toBe(0)
  })
})

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('the Hexagon’s marsh, on a real cartridge', { timeout: 120_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

  it('lies on the Hexagon’s own map, over ground the Hero can stand on', () => {
    const hexagon = load(rom, { map: 'D01' })
    expect(hexagon.map.marsh.length).toBe(2)
    const world = hexagon.world
    if (!world) throw new Error('the Hexagon has no collision')
    const height = toFloat(PERSON.height)
    const above = fx32(Math.round(world.bounds.maxY + FX32_ONE))

    // Stand on the ground under the middle of every marsh triangle: most of
    // them have ground there, and standing on it is standing in the marsh.
    let tried = 0
    let inIt = 0
    for (const area of hexagon.map.marsh) {
      const t = area.triangles
      for (let i = 0; i + 5 < t.length; i += 6) {
        const x = ((t[i] as number) + (t[i + 2] as number) + (t[i + 4] as number)) / 3
        const z = ((t[i + 1] as number) + (t[i + 3] as number) + (t[i + 5] as number)) / 3
        const hit = groundBelow(
          world,
          fx32(Math.round(x * FX32_ONE)),
          fx32(Math.round(z * FX32_ONE)),
          above,
        )
        if (!hit) continue
        tried++
        if (inMarsh(hexagon.map.marsh, x, toFloat(hit.y), z, height)) inIt++
      }
    }
    expect(tried, 'no ground under the marsh at all').toBeGreaterThan(10)
    expect(inIt / tried).toBeGreaterThan(0.9)
  })

  it('counts the ticks walked in it, as the Hero walks', () => {
    const hexagon = load(rom, { map: 'D01' })
    const world = hexagon.world
    const area = hexagon.map.marsh[1] ?? hexagon.map.marsh[0]
    if (!world || !area) throw new Error('no marsh to walk in')
    const height = toFloat(PERSON.height)
    const above = fx32(Math.round(world.bounds.maxY + FX32_ONE))
    // The middle of the first marsh triangle with ground under it.
    const t = area.triangles
    let start:
      | { x: ReturnType<typeof fx32>; y: ReturnType<typeof fx32>; z: ReturnType<typeof fx32> }
      | undefined
    for (let i = 0; i + 5 < t.length && !start; i += 6) {
      const x = fx32(
        Math.round(
          (((t[i] as number) + (t[i + 2] as number) + (t[i + 4] as number)) / 3) * FX32_ONE,
        ),
      )
      const z = fx32(
        Math.round(
          (((t[i + 1] as number) + (t[i + 3] as number) + (t[i + 5] as number)) / 3) * FX32_ONE,
        ),
      )
      const hit = groundBelow(world, x, z, above)
      if (hit) start = { x, y: hit.y, z }
    }
    if (!start) throw new Error('no ground under the marsh')
    const hero = player(start, 1)
    hero.held.add('w')
    const marshAt = (s: { x: number; y: number; z: number }) =>
      inMarsh(hexagon.map.marsh, toFloat(s.x), toFloat(s.y), toFloat(s.z), height)
    const { marshTicks } = advance(hero, world, 0, 1000, undefined, marshAt)
    // A second of walking is sixty ticks; the first steps are in the marsh.
    expect(marshTicks).toBeGreaterThan(0)
    expect(marshTicks).toBeLessThanOrEqual(60)
    // Standing still costs nothing.
    hero.held.clear()
    expect(advance(hero, world, 0, 1000, undefined, marshAt).marshTicks).toBe(0)
  })

  it('is nowhere in the village', () => {
    expect(load(rom, { map: 'M01' }).map.marsh).toEqual([])
  })
})
