import { readFileSync } from 'node:fs'
import { FX32_ONE, type Fx32, fx32, toFloat } from '@minstrel/fixed'
import { type CharacterState, type CollisionWorld, groundBelow, PERSON, step } from '@minstrel/sim'
import { beforeAll, describe, expect, it } from 'vitest'
import { entranceOf, load } from '../src/load.ts'

const romPath = process.env.MINSTREL_TEST_ROM

/**
 * **Can a player get from where they arrive to the way out?**
 *
 * This is the last of Phase 1's four verbs — an area outside the slice
 * "loads, walks, talks and plays its events". The others have sweeps of their
 * own. Walking had only `cartridge.test.ts`'s "walks a character over every
 * map without losing it", which is a **safety** property: a character may be
 * stopped by a wall or fall off an edge, both correct, and what it must never
 * do is leave the world. That says nothing about whether a town is navigable.
 *
 * This asks the navigable question. It stands the character where the game
 * stands them, walks outward with **the game's own controller** — not a
 * geometric reachability of its own — and asks which of the map's doorways
 * can be got to.
 *
 * **A map is not one walkable region, and expecting it to be was this test's
 * first mistake.** `C04`, Gittingham Palace, reaches 2 of its 12 doors from
 * where the player arrives — and that is right. Flooding from each doorway in
 * turn shows what it really is: the forecourt you arrive in from `F34` is 567
 * cells with two ways out, back to `F34` and in through `C04M01`, and the
 * palace grounds beyond are a separate region of 11,000 cells reached through
 * the building. A walled palace works exactly like that.
 *
 * Nor can you assume you may leave the way you came. `M11`'s entrance, as
 * `entranceOf` finds it, is from `D13M01` — a dungeon interior — while `M11`'s
 * own exits lead to `F18` and its houses. **Arrivals are not reciprocal**, and
 * the entrance found is only the first neighbour that leads here.
 *
 * What is left, and what is asserted, is the one thing that must be true of
 * any map: **from where the player arrives they are not stranded** — some
 * doorway can be got to. The fraction reached is printed as a measurement,
 * because what it should be depends on the map.
 *
 * Local-only: skipped without a dump.
 */
describe.skipIf(!romPath)('whether a map can be walked from its door to its doors', () => {
  /** How far a probe step moves. Small enough for a gap, big enough to finish. */
  const STRIDE = 0.06
  /** How coarse the visited grid is, in world units. */
  const CELL = 0.05
  /** The most cells one map may open before the walk is called unbounded. */
  const CELL_CAP = 40_000
  /** How near a doorway counts as having got there. */
  const NEAR = 0.9

  interface Walked {
    readonly code: string
    readonly doors: number
    readonly reached: number
    readonly cells: number
    readonly capped: boolean
    readonly missed: readonly string[]
  }

  let walked: Walked[] = []

  /** Every place the character can stand, from `start`, by the game's own step. */
  function flood(
    world: CollisionWorld,
    start: CharacterState,
  ): { seen: Set<string>; capped: boolean } {
    const key = (x: Fx32, z: Fx32) =>
      `${Math.round(toFloat(x) / CELL)},${Math.round(toFloat(z) / CELL)}`
    const seen = new Set<string>([key(start.x, start.z)])
    const queue: CharacterState[] = [start]
    const stride = fx32(Math.round(STRIDE * FX32_ONE))
    const zero = fx32(0)
    while (queue.length > 0 && seen.size < CELL_CAP) {
      const at = queue.pop() as CharacterState
      for (const [dx, dz] of [
        [stride, zero],
        [fx32(-stride), zero],
        [zero, stride],
        [zero, fx32(-stride)],
      ] as [Fx32, Fx32][]) {
        // The controller settles a step: it slides along walls, refuses an
        // edge with nothing beyond, and falls where a fall is legitimate.
        const to = step(world, at, dx, dz, PERSON)
        if (!to.grounded) continue
        const k = key(to.x, to.z)
        if (seen.has(k)) continue
        seen.add(k)
        queue.push(to)
      }
    }
    return { seen, capped: seen.size >= CELL_CAP }
  }

  beforeAll(() => {
    const rom = new Uint8Array(readFileSync(romPath as string))
    // The slice's own area and one town from each family that has towns, so
    // the answer is about the cartridge rather than about Angel Falls.
    const sample = ['M01', 'M11', 'M12', 'C02', 'C04', 'S07', 'D03', 'M03', 'M05', 'M13']
    walked = sample.flatMap((code) => {
      const map = load(rom, { map: code })
      const world = map.world
      if (!world) return []
      const entrance = entranceOf(map.catalogue, map.code)
      const where = entrance
        ? { x: entrance.door.arriveX, y: entrance.door.arriveY, z: entrance.door.arriveZ }
        : undefined
      if (!where) return []
      const x = fx32(Math.round(where.x * FX32_ONE))
      const z = fx32(Math.round(where.z * FX32_ONE))
      const hit = groundBelow(world, x, z, fx32(Math.round(world.bounds.maxY + FX32_ONE)))
      if (!hit) return []
      const { seen, capped } = flood(world, {
        x,
        y: hit.y,
        z,
        fallSpeed: fx32(0),
        grounded: true,
      })
      // A doorway is got to when some place the character reached is within
      // `NEAR` of where it stands.
      const missed: string[] = []
      let reached = 0
      for (const door of map.doorways) {
        let near = false
        for (const cell of seen) {
          const [cx, cz] = cell.split(',').map(Number) as [number, number]
          if (Math.hypot(cx * CELL - door.x, cz * CELL - door.z) <= NEAR) {
            near = true
            break
          }
        }
        if (near) reached++
        else missed.push(door.to)
      }
      return [{ code, doors: map.doorways.length, reached, cells: seen.size, capped, missed }]
    })

    console.log('from where the game stands you, which of a map’s doors can be walked to')
    for (const w of walked) {
      console.log(
        `  ${w.code}\t${w.reached}/${w.doors} doors\t${w.cells} cells${w.capped ? ' (CAPPED)' : ''}${w.missed.length > 0 ? ` · missed ${w.missed.join(' ')}` : ''}`,
      )
    }
  }, 900_000)

  it('stands the character somewhere on every map it samples', () => {
    expect(walked.length).toBeGreaterThan(0)
  })

  it('walks a real amount of ground on each', () => {
    // A map where the character can barely move would reach few cells. This is
    // a floor, not a target: what "enough" is depends on the map's size.
    for (const w of walked) expect(w.cells, w.code).toBeGreaterThan(200)
  })

  it('never strands the player where they arrive', () => {
    // **The invariant.** A map may be several regions and a doorway may only
    // open from one of them, but somewhere to go there must be — and on every
    // map sampled there are at least two, so it is not a dead end either.
    const stranded = walked.filter((w) => w.reached < 1)
    expect(stranded.map((w) => w.code)).toEqual([])
    for (const w of walked) expect(w.reached, w.code).toBeGreaterThanOrEqual(2)
  })

  it('reaches most of the doorways on most maps', () => {
    // Eight of the ten sampled reach **all** of theirs. `C04` is a walled
    // palace routed through its building, and `M12` has one door its forecourt
    // does not open onto. Pinned as a measurement: a map dropping out of the
    // "all of them" group is worth a look, and is not by itself a fault.
    const whole = walked.filter((w) => w.reached === w.doors).map((w) => w.code)
    expect(whole).toEqual(['M01', 'M11', 'C02', 'S07', 'D03', 'M03', 'M05', 'M13'])
  })
})
