import { readFileSync } from 'node:fs'
import { FX32_ONE, fx32, toFloat } from '@minstrel/fixed'
import { type CharacterState, groundBelow, PERSON, step } from '@minstrel/sim'
import { findSpawn } from '@minstrel/world'
import { describe, expect, it } from 'vitest'
import { doorAt, doorGate, doorTaken } from '../src/doors.ts'
import { load } from '../src/load.ts'
import { WALK_SPEED } from '../src/player.ts'

/**
 * Going through a door, on a real cartridge.
 *
 * `doors.test.ts` checks the geometry against fixtures built in code. This
 * checks the whole path: read a map's doorways, take one, and stand up in the
 * map behind it. Nothing here is committed — it reads the tester's own dump and
 * is skipped without one.
 */
const romPath = process.env.MINSTREL_TEST_ROM

// The first map opened walks the cartridge; the rest reuse that walk, so only
// the first of these costs anything much.
describe.skipIf(!romPath)('walking through a door', { timeout: 60_000 }, () => {
  // Read only when there is one to read: `skipIf` still runs this body to
  // collect the tests, so anything at this level runs without a cartridge too.
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

  // The same map is wanted by several tests, and opening it is the slow part.
  const opened = new Map<string, ReturnType<typeof load>>()
  function open(map: string): ReturnType<typeof load> {
    const already = opened.get(map)
    if (already) return already
    const fresh = load(rom, { map })
    opened.set(map, fresh)
    return fresh
  }

  /** The same arrival the game uses: on the floor, not at the stored height. */
  function arriveIn(map: string, at: { arriveX: number; arriveY: number; arriveZ: number }) {
    const opened = open(map)
    const world = opened.world
    expect(world, map).toBeDefined()
    const x = fx32(Math.round(at.arriveX * FX32_ONE))
    const z = fx32(Math.round(at.arriveZ * FX32_ONE))
    const hit = groundBelow(
      world as NonNullable<typeof world>,
      x,
      z,
      fx32(Math.round((world as NonNullable<typeof world>).bounds.maxY + FX32_ONE)),
    )
    return { opened, world, x, z, hit }
  }

  it('gives the village a doorway for each map it names', () => {
    const village = open('M01')
    expect(village.code).toBe('M01')
    expect(village.doorways.map((d) => d.to).sort()).toEqual([
      'F01',
      'M01M01',
      'M01M02',
      'M01M03',
      'M01M04',
      'M01M05',
      'M01M06',
      'M01M07',
      'M01M08',
    ])
  })

  it('opens the map behind a door and stands the character up in it', () => {
    const village = open('M01')
    const door = village.doorways.find((d) => d.to === 'M01M02')
    expect(door).toBeDefined()

    const { opened, world, x, z, hit } = arriveIn('M01M02', door as NonNullable<typeof door>)
    expect(opened.map.pieces.length).toBeGreaterThan(0)
    // There is floor under the arrival: the character comes out standing.
    expect(hit, 'no floor under the arrival').toBeDefined()

    // And stays standing. A few ticks of doing nothing must not drop them.
    let state = { x, y: (hit as NonNullable<typeof hit>).y, z, fallSpeed: fx32(0), grounded: true }
    for (let i = 0; i < 30; i++) {
      state = step(world as NonNullable<typeof world>, state, fx32(0), fx32(0), PERSON)
    }
    expect(state.grounded).toBe(true)
  })

  it('does not bounce straight back out of the door it came out of', () => {
    // 681 of the cartridge's 1,149 arrivals land inside a doorway of the map
    // they arrive in, because you come out where you would go back in. Coming
    // out of the inn is one of them: the character lands inside the village's
    // own doorway to the inn, and without the gate would be pulled straight
    // back inside. The way in is now the same kind of case: since the inn is
    // built at its own scale its door back shrank with it, so the arrival that
    // used to land 0.238 clear of it lands 0.030 away — inside its reach,
    // because the character's own radius does not shrink with the map.
    const village = open('M01')
    const inward = village.doorways.find((d) => d.to === 'M01M02') as NonNullable<
      (typeof village.doorways)[number]
    >
    const inn = open('M01M02')
    const outward = inn.doorways[0] as NonNullable<(typeof inn.doorways)[number]>

    // Going in, the arrival lands inside the inn's own door back, so the gate
    // is what stops the character being pulled straight out again.
    expect(doorAt(inn.doorways, inward.arriveX, inward.arriveZ)?.to).toBe('M01')

    // Coming out is a knife edge and is deliberately not asserted either way.
    // The arrival sits 0.150 from the village's door to the inn, and the door
    // reaches 0.125 of half-depth plus the character's 0.0249 of radius —
    // 0.150. Which side of its own edge that lands on is a rounding decision.
    //
    // It was asserted, before `PERSON.radius` came down from 0.04 to a person's
    // proportions, and the change moved it onto the boundary. The clearance is
    // a coincidence, not a rule: across the cartridge's 734 doorway pairs whose
    // arrival lands just outside the door back, the median gap is 0.095 and the
    // commonest values run 0.125, 0.025, 0.100, 0.094 — no constant.
    const dz = Math.abs(outward.arriveZ - inward.z)
    expect(dz).toBeCloseTo(inward.depth / 2 + toFloat(PERSON.radius), 3)

    // The gate holds either way: put down inside a doorway or on its edge, the
    // character does not go anywhere until they have stepped clear of it.
    const gate = doorGate()
    expect(doorTaken(gate, village.doorways, outward.arriveX, outward.arriveZ)).toBeUndefined()
    expect(doorTaken(gate, village.doorways, outward.arriveX, outward.arriveZ)).toBeUndefined()

    const inGate = doorGate()
    expect(doorTaken(inGate, inn.doorways, inward.arriveX, inward.arriveZ)).toBeUndefined()
  })

  it('lets the character walk back out again', () => {
    const village = open('M01')
    const inn = open('M01M02')
    const inward = village.doorways.find((d) => d.to === 'M01M02') as NonNullable<
      (typeof village.doorways)[number]
    >
    // The inn has one way out, and it leads back where the character came from.
    expect(inn.doorways).toHaveLength(1)
    const outward = inn.doorways[0] as NonNullable<(typeof inn.doorways)[number]>
    expect(outward.to).toBe('M01')

    // Step clear of the doorway, then walk into it: now it opens.
    const gate = doorGate()
    doorTaken(gate, inn.doorways, inward.arriveX, inward.arriveZ)
    const away = { x: outward.x + 4, z: outward.z + 4 }
    expect(doorTaken(gate, inn.doorways, away.x, away.z)).toBeUndefined()
    expect(doorTaken(gate, inn.doorways, outward.x, outward.z)?.to).toBe('M01')

    // And it puts the character back beside the door they went in by, rather
    // than somewhere else in the village.
    const back = Math.hypot(outward.arriveX - inward.x, outward.arriveZ - inward.z)
    expect(back, 'came out somewhere else entirely').toBeLessThan(1)

    // There is floor there too.
    const { hit } = arriveIn('M01', outward)
    expect(hit).toBeDefined()
  })

  it('keeps the character in the room, walking every way out of the doorway', () => {
    // A room's collision is one floor quad with walls standing on it, and the
    // walls do not close it: before the controller refused a step into nothing,
    // walking 64 headings out of a doorway left the world on 7 of them in
    // `M01M04` and 21 in `M01M08`, through gaps the character is now thin
    // enough to reach. Both are rooms you can be sent to from the village.
    //
    // What is asserted is the safety property, not the geometry: however the
    // room is built, a character that starts on its floor stays in it.
    const village = open('M01')
    for (const code of ['M01M04', 'M01M08']) {
      const door = village.doorways.find((d) => d.to === code) as NonNullable<
        (typeof village.doorways)[number]
      >
      const { world, x, z, hit } = arriveIn(code, door)
      const here = world as NonNullable<typeof world>
      expect(hit, `${code}: no floor under the arrival`).toBeDefined()

      let lost = 0
      for (let heading = 0; heading < 64; heading++) {
        const angle = (heading * 2 * Math.PI) / 64
        const dx = fx32(Math.round(Math.cos(angle) * WALK_SPEED))
        const dz = fx32(Math.round(Math.sin(angle) * WALK_SPEED))
        let state: CharacterState = {
          x,
          y: (hit as NonNullable<typeof hit>).y,
          z,
          fallSpeed: fx32(0),
          grounded: true,
        }
        for (let tick = 0; tick < 300; tick++) state = step(here, state, dx, dz, PERSON)
        if (!state.grounded) lost++
      }
      expect(lost, `${code}: walks that fell out of the room`).toBe(0)
    }
  })

  it('gives each map of the village its own cast, not the whole area', () => {
    // A cast list is per *area*: `M01.npc` holds the 49 characters of Angel
    // Falls, the village outdoors and everyone inside its houses, each placed
    // in the coordinates of the room they stand in. Those coordinates separate
    // nothing — an interior is its own little map about its own origin — so
    // filtering by "is there floor underneath" put fifteen villagers in the
    // stable. Which map a character belongs to is read off the placement now.
    const maps = ['M01', 'M01M01', 'M01M02', 'M01M03', 'M01M04', 'M01M06', 'M01M08']
    const drawnIn = new Map<string, number>()
    const seen = new Map<number, string>()
    for (const code of maps) {
      const { cast } = open(code)
      const here = [...cast.members, ...cast.sprites2d]
      drawnIn.set(code, here.length)
      for (const who of here) {
        const already = seen.get(who.placement.id)
        // The property that broke: nobody stands in two maps at once.
        expect(already, `${who.name} is drawn in ${already} and in ${code}`).toBeUndefined()
        seen.set(who.placement.id, code)
      }
    }

    // The village outdoors is the busy one and keeps its cast unchanged.
    expect(drawnIn.get('M01')).toBe(18)
    // An interior holds a household, not a village. The stable drew 15 before.
    for (const code of maps.slice(1)) {
      expect(drawnIn.get(code), `${code} is crowded`).toBeLessThan(10)
    }
    expect(drawnIn.get('M01M04')).toBe(7)
  })

  it('reads a doorway for the field as well as for the houses', () => {
    // The village's ninth doorway is not a house: it is the road east.
    const village = open('M01')
    const road = village.doorways.find((d) => d.to === 'F01') as NonNullable<
      (typeof village.doorways)[number]
    >
    expect(Math.abs(road.arriveX)).toBeGreaterThan(4)
    const { opened } = arriveIn('F01', road)
    expect(opened.map.pieces.length).toBeGreaterThan(0)
  })

  it('has nowhere to stand at the end of the road east, and goes nearest instead', () => {
    // A known gap in the data, recorded rather than papered over: a field's
    // collision does not reach its own doorways, on 19.2% of them against
    // 87-100% for every other kind of map. What the game really uses for a
    // field's walkable ground is not established — see the field note in
    // `game-formats/FORMAT.md`, which also records what it is not.
    //
    // The road out of the village arrives at x = -8.23 and the field's
    // collision runs -6.00 to 6.42, so there is no floor under the arrival.
    const village = open('M01')
    const road = village.doorways.find((d) => d.to === 'F01') as NonNullable<
      (typeof village.doorways)[number]
    >
    const { world, hit } = arriveIn('F01', road)
    expect(hit).toBeUndefined()

    const bounds = (world as NonNullable<typeof world>).bounds
    expect(road.arriveX).toBeLessThan(toFloat(bounds.minX as never))

    // So the character goes on the walkable ground nearest the arrival. Which
    // ground is the point: the west edge the road comes in at, not the middle.
    const water = open('F01').map.water
    const here = world as NonNullable<typeof world>
    const put = findSpawn(here, {
      person: PERSON,
      speed: WALK_SPEED,
      water,
      near: { x: road.arriveX, z: road.arriveZ },
    })
    expect(put).toBeDefined()
    const spot = put as NonNullable<typeof put>
    const strayed = Math.hypot(toFloat(spot.x) - road.arriveX, toFloat(spot.z) - road.arriveZ)

    const middle = findSpawn(here, { person: PERSON, speed: WALK_SPEED, water })
    const mid = middle as NonNullable<typeof middle>
    const fromMiddle = Math.hypot(toFloat(mid.x) - road.arriveX, toFloat(mid.z) - road.arriveZ)

    expect(strayed).toBeLessThan(fromMiddle)
    // West of the field's middle, which is the side the village is on.
    expect(toFloat(spot.x)).toBeLessThan(toFloat(mid.x))
  })
})
