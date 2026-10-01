import { readFileSync } from 'node:fs'
import { scanCartridge } from '@minstrel/cartridge'
import { readCollisionMesh } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { stageMap } from '../src/load.ts'
import {
  actorCloseUp,
  CLOSE_UP_PULL,
  EASE_KEEP,
  easeOrbit,
  gridPlace,
  MONSTER_SLOTS,
  monsterExtent,
  monsterRow,
  openingStart,
  orbitOf,
  PARTY_SLOTS,
  partyExtent,
  partyRow,
  placesOf,
  pulled,
  recordOfTriangle,
  STAGE_FALLBACK,
  sideShot,
  stageOfRecord,
  stageToFight,
  victoryView,
} from '../src/stage.ts'

/** A record naming the stage 30000 + 100a + 10b + c. */
const record = (a: number, b: number, c: number) => {
  const packed = a | (b << 5) | (c << 10)
  return new Uint8Array([packed & 0xff, packed >> 8, 0, 0, 0, 0, 0, 0])
}

describe('where a battle is fought', () => {
  it('reads the stage a ground record names, as the game does', () => {
    expect(stageOfRecord(record(1, 1, 6))).toBe(30116)
    expect(stageOfRecord(record(2, 1, 5))).toBe(30215)
    expect(stageOfRecord(record(0, 0, 0))).toBe(30000)
  })

  it('takes a set battle’s own stage, else the ground’s, and 30116 for one not listed', () => {
    const listed = (id: number) => id === 30117 || id === 30215
    expect(stageToFight(30117, undefined, listed)).toBe(30117)
    expect(stageToFight(30117, 30215, listed)).toBe(30215)
    // 0 in the set battle's record leaves the ground's.
    expect(stageToFight(30117, 0, listed)).toBe(30117)
    // Western Stornway's 30103 has no entry, and the record of nothing is 30000.
    expect(stageToFight(30103, undefined, listed)).toBe(STAGE_FALLBACK)
    expect(stageToFight(30000, undefined, listed)).toBe(STAGE_FALLBACK)
    expect(stageToFight(undefined, undefined, listed)).toBe(STAGE_FALLBACK)
  })

  it('finds a triangle’s record in its own mesh, the meshes laid end to end', () => {
    const tri = (index: number) => ({ attributes: (index << 25) >>> 0 })
    const meshes = [
      { mesh: { triangles: [tri(0), tri(1)], trailing: [record(1, 1, 6), record(1, 1, 7)] } },
      { mesh: { triangles: [tri(0)], trailing: [record(2, 1, 4)] } },
    ]
    expect(stageOfRecord(recordOfTriangle(meshes, 1) as Uint8Array)).toBe(30117)
    expect(stageOfRecord(recordOfTriangle(meshes, 2) as Uint8Array)).toBe(30214)
    expect(recordOfTriangle(meshes, 3)).toBeUndefined()
  })
})

describe('who stands where', () => {
  it('lays the grid out staggered, 9 by 9, about the origin', () => {
    // Slot 58: row 6, column 4 — the middle, 4.5 toward +z.
    expect(gridPlace(58)).toEqual({ x: 0, z: 18432 })
    // Slot 22: row 2, column 4 — the middle, 4.5 toward −z.
    expect(gridPlace(22)).toEqual({ x: 0, z: -18432 })
    // An odd row is half a step over: slot 48 is row 5, column 3.
    const odd = gridPlace(48)
    expect(odd.z).toBe(9216)
    expect(odd.x / 4096).toBeCloseTo(-1.299, 3)
  })

  it('puts the party on +z and the monsters on −z, by the tables for how many', () => {
    expect(placesOf(PARTY_SLOTS, 1)).toEqual([{ x: 0, z: 18432 }])
    expect(placesOf(MONSTER_SLOTS, 2).map((p) => p.x / 4096)).toEqual([
      expect.closeTo(-2.598, 3),
      expect.closeTo(2.598, 3),
    ])
    expect(placesOf(MONSTER_SLOTS, 8)).toHaveLength(8)
    for (const { z } of placesOf(PARTY_SLOTS, 4)) expect(z).toBeGreaterThan(0)
    for (const { z } of placesOf(MONSTER_SLOTS, 8)) expect(z).toBeLessThan(0)
  })

  it('lines rows up as the game does: the party 1.5 apart, the monsters by their widths', () => {
    expect(partyRow(3).map((p) => p.x)).toEqual([0x1800, 0, -0x1800])
    expect(partyRow(3).every((p) => p.z === 0x2800)).toBe(true)
    // Three slimes, 0.8 across: 0.7 apart, centred.
    const slime = { kind: 1, radius: 3276, height: 3276 }
    const row = monsterRow([slime, slime, slime])
    expect(row.map((p) => p.x)).toEqual([-(3276 + 0xb33), 0, 3276 + 0xb33])
    expect(monsterExtent([slime, slime, slime])).toEqual({
      width: 3 * 3276 + 2 * 0xb33,
      height: 3276 + 0x800,
    })
    expect(partyExtent(4)).toEqual({ width: 3 * 0x1800 + 0x1000, height: 0x1800 })
  })

  it('closes the gap between wide monsters to keep the row within its limit', () => {
    const big = { kind: 2, radius: 3 * 4096, height: 4096 }
    // 6 across is past 4.1, so the gap is the least, 0.1.
    expect(monsterExtent([big, big]).width).toBe(2 * 3 * 4096 + 0x199)
  })
})

describe('the battle camera', () => {
  it('frames a side from the stage’s z axis: the monsters from +z, the party from −z', () => {
    const slime = monsterExtent([{ kind: 1, radius: 3276, height: 3276 }])
    const over = sideShot(1, slime, true)
    // A lone slime is small: the wide shot's least distance, 3, and a height of 1.2.
    expect(over.eye).toEqual([0, 1.2, 3])
    expect(over.target).toEqual([0, 1.2, 0])
    expect(over.halfFov).toBe(22)
    expect(sideShot(0, slime, false).eye[2]).toBe(-6.5)
    // Sub-mode 1 raises the eye by one.
    expect(sideShot(1, slime, true, 1).eye[1]).toBeCloseTo(2.2)
  })

  it('opens half a unit higher and 3 farther, and eases in by 5% of what is left a tick', () => {
    const end = orbitOf(sideShot(1, { width: 4096, height: 4096 }, true))
    const start = openingStart(end)
    expect(start.distance).toBeCloseTo(end.distance + 3)
    const once = easeOrbit(start, end)
    expect(once.done).toBe(false)
    expect(once.orbit.distance - end.distance).toBeCloseTo(3 * EASE_KEEP)
    let now = start
    let ticks = 0
    for (let done = false; !done && ticks < 1000; ticks++) {
      const next = easeOrbit(now, end)
      now = next.orbit
      done = next.done
    }
    expect(now).toEqual(end)
    expect(ticks).toBeLessThan(200)
  })
})

describe('the close-ups', () => {
  it('frames a fighter from in front, along its facing, fitted to the view', () => {
    // A monster 2 tall, at the origin facing +z: L is 1, the distance 1.8 × 2 + 4.
    const monster = actorCloseUp({ x: 0, z: 0, facing: 0 }, 2, false, 0, 1.8, 15)
    expect(monster.target).toEqual([0, 1, 0])
    expect(monster.orbit.yaw).toBe(0)
    expect(monster.orbit.height).toBe(0)
    expect(monster.orbit.distance).toBeCloseTo(7.6)
    expect(monster.pull).toBe(CLOSE_UP_PULL)
    // A slime, 0.8 tall, is nearer than the view allows: (1 + 0.5) · cot 15°.
    expect(
      actorCloseUp({ x: 0, z: 0, facing: 0 }, 0.8, false, 0, 1.8, 15).orbit.distance,
    ).toBeCloseTo(5.598, 3)
    // A party member takes `b` for the monsters' 1.8, and `a` off the look-at.
    const hero = actorCloseUp({ x: 1, z: 4.5, facing: Math.PI }, 3, true, 0.21, 1.1, 15)
    expect(hero.target).toEqual([1, expect.closeTo(1.29, 5), 4.5])
    expect(hero.orbit.yaw).toBe(Math.PI)
    // 1.1 × 3 + 4 is 7.3, short of what fits L + 0.5 into the view: 2 · cot 15°.
    expect(hero.orbit.distance).toBeCloseTo(7.464, 3)
    // A party member's own `b` counts when it reaches further.
    expect(actorCloseUp({ x: 0, z: 0, facing: 0 }, 3, true, 0, 2, 15).orbit.distance).toBeCloseTo(
      10,
    )
  })

  it('pulls in a tick at a time, never nearer than 3', () => {
    const view = actorCloseUp({ x: 0, z: 0, facing: 0 }, 0.8, false, 0, 1.8, 15)
    expect(pulled(view).orbit.distance).toBeCloseTo(view.orbit.distance + CLOSE_UP_PULL)
    let now = view
    for (let i = 0; i < 2000; i++) now = pulled(now)
    expect(now.orbit.distance).toBe(3)
  })
})

describe('the camera while a command is chosen', () => {
  it('looks at the party’s middle from 1 up, 12 less its distance out, turning slowly', () => {
    // Two on the grid, (±2.598, 4.5): the middle is 4.5 out, so the distance
    // would be 7.5 — under 8, so the middle comes in by 7.5/8 and it is 12.
    const view = victoryView([
      { x: -2.598, z: 4.5 },
      { x: 2.598, z: 4.5 },
    ])
    const out = Math.hypot(0, 0xcc / 4096, 4.5)
    expect(view.target[0]).toBeCloseTo(0)
    expect(view.target[1]).toBe(0.5)
    expect(view.target[2]).toBeCloseTo((4.5 * (12 - out)) / 8)
    expect(view.orbit.distance).toBe(12)
    expect(view.orbit.height).toBe(1)
    // −0x999 whatever the monsters — see `victoryView`.
    expect(view.orbit.yaw).toBeCloseTo(2 * Math.PI - 0x999 / 4096)
    expect(pulled(view).orbit.yaw).toBeCloseTo(view.orbit.yaw + 0xe / 4096)
  })

  it('keeps 12 less the distance when that is 8 or more', () => {
    const view = victoryView([{ x: 0, z: 2 }])
    expect(view.orbit.distance).toBeCloseTo(12 - Math.hypot(0xcc / 4096, 2))
    expect(view.target[2]).toBe(2)
  })
})

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('the stages on the cartridge', () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

  it('reads Angel Falls’ field as naming its field and its forest', () => {
    const named = new Set<number>()
    for (const leaf of scanCartridge(rom, { pathFilter: '/data/map/F01.amdj' })) {
      if (!leaf.path.endsWith('F01A0000.col2')) continue
      for (const r of readCollisionMesh(leaf.bytes).trailing) named.add(stageOfRecord(r))
    }
    expect([...named].sort()).toEqual([30116, 30117])
  })

  it('loads a stage’s models by its code, its lighting’s pieces only', () => {
    const day = stageMap(rom, 'B01M16', 'day')
    const night = stageMap(rom, 'B01M16', 'night')
    expect(day?.pieces.length).toBeGreaterThan(1)
    expect(night?.pieces.length).toBe(day?.pieces.length)
    expect(day?.meshes).toHaveLength(0)
    expect(stageMap(rom, 'B01M99', 'day')).toBeUndefined()
  })
})
