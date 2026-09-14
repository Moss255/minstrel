import { readFileSync } from 'node:fs'
import { FX32_ONE, fx32, toFloat } from '@minstrel/fixed'
import { type CharacterState, groundBelow, PERSON, step } from '@minstrel/sim'
import { findSpawn } from '@minstrel/world'
import { describe, expect, it } from 'vitest'
import { doorAt, doorGate, doorTaken, inDoorway } from '../src/doors.ts'
import { entranceOf, load } from '../src/load.ts'
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

  /**
   * Where the game actually stands the character up on arriving.
   *
   * The floor under the arrival if there is one, and the nearest walkable
   * ground if there is not — which is what `main.ts` does, and what a correctly
   * placed arrival needs: it lands at the threshold rather than in the middle
   * of the room, and an interior's collision often stops short of its own
   * walls. `stood` is where they end up; `hit` is whether the arrival itself
   * had floor.
   */
  function arriveIn(map: string, at: { arriveX: number; arriveY: number; arriveZ: number }) {
    const opened = open(map)
    const world = opened.world
    expect(world, map).toBeDefined()
    const here = world as NonNullable<typeof world>
    const x = fx32(Math.round(at.arriveX * FX32_ONE))
    const z = fx32(Math.round(at.arriveZ * FX32_ONE))
    const hit = groundBelow(here, x, z, fx32(Math.round(here.bounds.maxY + FX32_ONE)))
    const stood = hit
      ? { x, y: hit.y, z }
      : findSpawn(here, {
          person: PERSON,
          speed: WALK_SPEED,
          water: opened.map.water,
          near: { x: at.arriveX, z: at.arriveZ },
        })
    return { opened, world, x, z, hit, stood }
  }

  it('opens the village at its entrance, where the road from the field brings you', () => {
    // The first map has no doorway to arrive by, and the cartridge's own start
    // position is not found. What the cartridge does say is where the road from
    // the field puts you, so the village opens there rather than at a guess
    // about its middle, which lands at the river's edge by the waterfall.
    const village = open('M01')
    const entrance = entranceOf(village.catalogue, 'M01')
    expect(entrance?.from).toBe('F01')
    const { hit } = arriveIn('M01', (entrance as NonNullable<typeof entrance>).door)
    expect(hit, 'no floor at the village entrance').toBeDefined()

    // A room is entered by its door from outside, not by a door inside it.
    expect(entranceOf(village.catalogue, 'M01M02')?.from).toBe('M01')
  })

  it('can show the cast at each story stage its records name', () => {
    // A testing affordance — `t` and `y` in the game — not a reading of the
    // game's story. `s017` opens in the village and has records for the inn, so
    // some stage has to put her there.
    const inn = open('M01M02')
    expect(inn.stages.length).toBeGreaterThan(1)
    const names = (stage: (typeof inn.stages)[number] | undefined) => {
      const here = inn.castAt(stage)
      return [...here.members.map((m) => m.name), ...here.sprites2d.map((s) => s.name)]
    }
    expect(inn.stages.flatMap(names)).toContain('s017')
    // And no stage is the file's own first placements, which is what opens.
    expect(names(undefined).sort()).toEqual(
      [...inn.cast.members.map((m) => m.name), ...inn.cast.sprites2d.map((s) => s.name)].sort(),
    )
  })

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

    const { opened, world, stood } = arriveIn('M01M02', door as NonNullable<typeof door>)
    expect(opened.map.pieces.length).toBeGreaterThan(0)
    // Somewhere to stand: on the arrival if it has floor, and on the nearest
    // walkable ground if not, which is what the game does.
    expect(stood, 'nowhere to stand at all').toBeDefined()
    const from = stood as NonNullable<typeof stood>

    // And stays standing. A few ticks of doing nothing must not drop them.
    let state = { x: from.x, y: from.y, z: from.z, fallSpeed: fx32(0), grounded: true }
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
    // back inside.
    const village = open('M01')
    const inward = village.doorways.find((d) => d.to === 'M01M02') as NonNullable<
      (typeof village.doorways)[number]
    >
    const inn = open('M01M02')
    const outward = inn.doorways[0] as NonNullable<(typeof inn.doorways)[number]>

    // **Going in now lands beside the inn's door back rather than inside it.**
    // That is the doorway scaling being fixed: the position used to be shrunk
    // with the map, which put every indoor doorway in the middle of its own
    // room and the arrival on top of it. Beside it is what a doorway is for.
    expect(doorAt(inn.doorways, inward.arriveX, inward.arriveZ)).toBeUndefined()
    const apart = Math.hypot(inward.arriveX - outward.x, inward.arriveZ - outward.z)
    expect(apart, 'the arrival is nowhere near the door back').toBeLessThan(0.5)
    expect(apart, 'the arrival is on top of the door back').toBeGreaterThan(toFloat(PERSON.radius))

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
      const { world, stood } = arriveIn(code, door)
      const here = world as NonNullable<typeof world>
      // Wherever the game stands them up — the arrival itself lands at the
      // threshold, which an interior's collision does not always reach.
      expect(stood, `${code}: nowhere to stand at all`).toBeDefined()
      const from = stood as NonNullable<typeof stood>

      let lost = 0
      for (let heading = 0; heading < 64; heading++) {
        const angle = (heading * 2 * Math.PI) / 64
        const dx = fx32(Math.round(Math.cos(angle) * WALK_SPEED))
        const dz = fx32(Math.round(Math.sin(angle) * WALK_SPEED))
        let state: CharacterState = {
          x: from.x,
          y: from.y,
          z: from.z,
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
      expect(drawnIn.get(code), `${code} is crowded`).toBeLessThan(12)
    }
    // Nine, not seven: the two the collision does not reach are drawn now, and
    // the item shop has its shopkeeper back — see `cast`.
    expect(drawnIn.get('M01M04')).toBe(9)

    // **Standing off the floor must not take a character out of the map.**
    // The ground test decided which map a character was in before the file
    // could be asked, and it dropped anyone the collision did not reach — which
    // left the item shop with no shopkeeper.
    //
    // Both of the shop's stand on floor now the collision is read at its own
    // size — `CollisionMesh.shift` — rather than at half of it, which left
    // them floating just past its edge.
    const shop = open('M01M03').cast
    expect(shop.members.length + shop.sprites2d.length, 'the shop lost someone').toBe(3)
    expect(shop.elsewhere, 'the shop reaches its own cast now').toBe(0)
  })

  it('leaves an indoor doorway where the file puts it, not at the origin', () => {
    // The bug behind "the door is in the wrong position". A doorway's position
    // was scaled with the map that holds it, which does nothing outdoors — the
    // village's own nine were right the whole time — and indoors divided it by
    // eight, collapsing the trigger onto the origin. Near enough the middle of
    // the room that walking across the floor threw the character back outside.
    //
    // What that looks like from here is a doorway a few hundredths from the
    // origin instead of most of a unit. Where it sits in the *collision* is the
    // separate check below.
    const village = open('M01')
    for (const code of ['M01M01', 'M01M02', 'M01M03', 'M01M04', 'M01M06', 'M01M07']) {
      const inside = open(code)
      expect(inside.doorways.length, `${code} has no way out`).toBeGreaterThan(0)
      for (const door of inside.doorways) {
        const away = Math.hypot(door.x, door.z)
        // An eighth-scaled doorway lands under 0.15 from the origin; a real one
        // is most of a unit out, in the wall it belongs to.
        expect(
          away,
          `${code}: its way out stands ${away.toFixed(2)} from the origin`,
        ).toBeGreaterThan(0.3)
      }
    }

    // And the village's own, which take no scale either way, are where they
    // always were — spread across the village rather than stacked.
    const spread = village.doorways.map((d) => Math.hypot(d.x, d.z))
    expect(Math.max(...spread), 'the village doorways collapsed').toBeGreaterThan(2)
  })

  it('leaves a room by a doorway that stands on the room\u2019s own floor', () => {
    // A doorway is a ruler for the collision: it is read from a different file
    // and does not move when the collision's size is got wrong. With the mesh's
    // `shift` ignored — half its size — **every** village interior put its way
    // out past its own floor, 1.0 to 1.7 of the way out of the box: a room whose
    // exit cannot be walked to. Read at its own size every one lands inside.
    //
    // The well, `M01M08`, is left out on purpose: its way out stands in the
    // middle of the room, so it passes this at any scale and says nothing.
    for (const code of ['M01M01', 'M01M02', 'M01M03', 'M01M04', 'M01M05', 'M01M06', 'M01M07']) {
      const inside = open(code)
      const bounds = inside.world?.bounds
      expect(bounds, `${code} has no collision`).toBeDefined()
      if (!bounds) continue
      const at = (v: number) => v / FX32_ONE
      const spans = [
        { of: 'x', low: at(bounds.minX), high: at(bounds.maxX) },
        { of: 'z', low: at(bounds.minZ), high: at(bounds.maxZ) },
      ] as const
      for (const door of inside.doorways) {
        const where = { x: door.x, z: door.z }
        for (const span of spans) {
          const middle = (span.low + span.high) / 2
          const half = (span.high - span.low) / 2
          const out = Math.abs(where[span.of] - middle) / (half || 1)
          expect(
            out,
            `${code}: its way out stands ${out.toFixed(2)} out of the floor in ${span.of}`,
          ).toBeLessThan(1)
        }
      }
    }
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

  it('arrives on the field’s own floor at the end of the road east', () => {
    // This used to record a gap: the road out of the village arrived at
    // x = -8.23 while the field's collision ran -6.00 to 6.42, so there was no
    // floor under the arrival and the character was put on the nearest ground.
    //
    // A field's collision is stored halved four times — its `shift` — where
    // the village's is halved three, and reading one as the other left it at
    // half its size. Read at its own size it reaches its own doorways.
    const village = open('M01')
    const road = village.doorways.find((d) => d.to === 'F01') as NonNullable<
      (typeof village.doorways)[number]
    >
    const { world, hit } = arriveIn('F01', road)
    expect(hit, 'no floor under the arrival from the village').toBeDefined()

    const bounds = (world as NonNullable<typeof world>).bounds
    expect(road.arriveX).toBeGreaterThan(toFloat(bounds.minX as never))
  })

  it('walks from the road out of the village to both of the field’s ways on', {
    timeout: 300_000,
  }, () => {
    // A field's doorways once stood off its ground — `docs/next.md` §6 —
    // because its collision was read at half its size. A doorway standing on
    // floor is not the same as a doorway the character can reach, so this asks
    // the character controller: from where the road puts the character down,
    // walk the field a stride at a time in eight directions, moving as the game
    // moves — `step` and nothing else — and see whether the walk ever stands in
    // each of the field's other doorways.
    const village = open('M01')
    const road = village.doorways.find((d) => d.to === 'F01') as NonNullable<
      (typeof village.doorways)[number]
    >
    const { opened: field, world, stood } = arriveIn('F01', road)
    const here = world as NonNullable<typeof world>
    expect(stood, 'nowhere to stand coming in from the village').toBeDefined()
    const from = stood as NonNullable<typeof stood>
    const onward = field.doorways.filter((d) => d.to !== 'M01')
    expect(onward.map((d) => d.to).sort()).toEqual(['D01', 'S01M01'])

    // A stride of a quarter unit, about a character and a half.
    const stride = 0.25
    const ticks = Math.ceil((stride * FX32_ONE) / WALK_SPEED)
    const cellOf = (s: CharacterState) =>
      `${Math.round(toFloat(s.x) / stride)},${Math.round(toFloat(s.z) / stride)}`
    const start: CharacterState = {
      x: from.x,
      y: from.y,
      z: from.z,
      fallSpeed: fx32(0),
      grounded: true,
    }
    const seen = new Set([cellOf(start)])
    const queue = [start]
    const reached = new Set<string>()
    for (let i = 0; i < queue.length && reached.size < onward.length; i++) {
      const at = queue[i] as CharacterState
      for (let heading = 0; heading < 8; heading++) {
        const angle = (heading * Math.PI) / 4
        const dx = fx32(Math.round(Math.cos(angle) * WALK_SPEED))
        const dz = fx32(Math.round(Math.sin(angle) * WALK_SPEED))
        let state: CharacterState = at
        for (let tick = 0; tick < ticks; tick++) {
          state = step(here, state, dx, dz, PERSON)
          // As the game asks, every tick: is the character in a doorway?
          for (const door of onward) {
            if (inDoorway(door, toFloat(state.x), toFloat(state.z))) reached.add(door.to)
          }
        }
        if (!state.grounded) continue
        const cell = cellOf(state)
        if (seen.has(cell)) continue
        seen.add(cell)
        queue.push(state)
      }
    }
    expect([...reached].sort(), `walked ${seen.size} strides of the field`).toEqual([
      'D01',
      'S01M01',
    ])
  })
})
