import { readFileSync } from 'node:fs'
import { fx32 } from '@minstrel/fixed'
import { settingsPlay } from '@minstrel/game-formats'
import {
  type CharacterState,
  type CollisionWorld,
  createCollisionWorld,
  groundBelow,
  PERSON,
  step,
} from '@minstrel/sim'
import { describe, expect, it } from 'vitest'
import { inDoorway } from '../src/doors.ts'
import { load } from '../src/load.ts'
import { hidePieces } from '../src/pieces.ts'

describe('the pieces a record hides and shows', () => {
  it('hides with 149 and shows with 150, the piece the parameter’s high half names', () => {
    const off = new Set<number>()
    expect(hidePieces(off, [{ op: 149, arg: 0, params: [5 << 16] }])).toBe(true)
    expect([...off]).toEqual([5])
    expect(hidePieces(off, [{ op: 149, arg: 0, params: [5 << 16] }])).toBe(false)
    expect(hidePieces(off, [{ op: 150, arg: 0, params: [5 << 16] }])).toBe(true)
    expect(off.size).toBe(0)
    // Another group's piece is not this map's.
    expect(hidePieces(off, [{ op: 149, arg: 1, params: [5 << 16] }])).toBe(false)
  })
})

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('the landslide on the road to Stornway, on a real cartridge', () => {
  it('stands across the way to F02 to 2.6 and is gone from 2.7', () => {
    const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()
    const pass = load(rom, { map: 'S01' })
    const at = (major: number, minor: number) => {
      const off = new Set<number>()
      const outcome = settingsPlay(
        pass.triggers,
        pass.mapId as number,
        { major, minor },
        { flags: new Set() },
      )
      hidePieces(off, outcome?.actions)
      return off
    }
    expect(at(2, 6).has(5)).toBe(false)
    expect(at(2, 7).has(5)).toBe(true)
    // Piece 5 is the landslide — its own collision hangs off it, just short of the door to F02.
    const slide = pass.map.meshes.find((m) => m.attachedTo === 5)
    expect(slide).toBeDefined()
    expect(pass.doorways.find((d) => d.to === 'F02')).toBeDefined()
  })

  it('lets the party through to F02 only with it gone', () => {
    const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()
    const pass = load(rom, { map: 'S01' })
    const toF02 = pass.doorways.find((d) => d.to === 'F02')
    const start = pass.start
    if (!toF02 || !start) throw new Error('no doorway or start')
    const reaches = (world: CollisionWorld) => {
      const top = fx32(Math.round(world.bounds.maxY + 4096))
      const ground = groundBelow(
        world,
        fx32(Math.round(start.x * 4096)),
        fx32(Math.round(start.z * 4096)),
        top,
      )
      if (!ground) throw new Error('no ground at the start')
      const begin: CharacterState = {
        x: fx32(Math.round(start.x * 4096)),
        y: ground.y,
        z: fx32(Math.round(start.z * 4096)),
        fallSpeed: fx32(0),
        grounded: true,
      }
      // A flood over the floor in a person's steps, a twentieth of a unit apart.
      const key = (c: CharacterState) => Math.floor(c.x / 409) * 100_000 + Math.floor(c.z / 409)
      const seen = new Set([key(begin)])
      const queue = [begin]
      while (queue.length > 0) {
        const at = queue.pop() as CharacterState
        for (let d = 0; d < 16; d++) {
          const angle = (d * Math.PI) / 8
          let c = at
          for (let i = 0; i < 4; i++)
            c = step(
              world,
              c,
              fx32(Math.round(Math.cos(angle) * 123)),
              fx32(Math.round(Math.sin(angle) * 123)),
              PERSON,
            )
          if (!c.grounded || seen.has(key(c))) continue
          if (inDoorway(toF02, c.x / 4096, c.z / 4096)) return true
          seen.add(key(c))
          queue.push(c)
        }
      }
      return false
    }
    const all = pass.map.meshes
    expect(reaches(createCollisionWorld(all))).toBe(false)
    expect(reaches(createCollisionWorld(all.filter((m) => m.attachedTo !== 5)))).toBe(true)
  })
})
