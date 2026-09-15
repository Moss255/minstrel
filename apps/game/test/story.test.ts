import { readFileSync } from 'node:fs'
import {
  afterBattle,
  areaEvent,
  areasOf,
  entryEvent,
  entryPlay,
  eventOutcome,
} from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { load } from '../src/load.ts'
import { pickLine } from '../src/talk.ts'

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('the opening’s story, on a real cartridge', { timeout: 120_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

  it('plays the Guardian statue scene on entering the village at 2.1, from the second event folder', () => {
    const village = load(rom, { map: 'M01' })
    expect(entryPlay(village.triggers, 1100, { major: 2, minor: 1 }, new Set())).toEqual({
      event: 22590,
      flags: [0],
    })
    expect(village.eventScript(22590)).toBeDefined()
    expect(village.eventMessages(22590).length).toBeGreaterThan(0)
    // Patty's talk before the fight, likewise.
    expect(load(rom, { map: 'D01M05' }).eventScript(22510)).toBeDefined()
  })

  it('plays the mayor’s scene on walking up to him at 2.1, and has Erinn then ask the Hero in, on to the morning', () => {
    const at21 = { major: 2, minor: 1 }
    const house = load(rom, { map: 'M01M05' })
    const [area] = areasOf(house.triggers, 1105, at21)
    expect(area?.id).toBe(15)
    const into15 = (id: number) => id === 15
    expect(areaEvent(house.triggers, 1105, at21, new Set(), undefined, into15)?.event).toBe(2120)
    expect(eventOutcome(house.triggers, 2120, 1105)?.flags).toEqual([1])
    const inn = load(rom, { map: 'M01M07' })
    const erinn = pickLine({
      triggers: inn.triggers,
      map: inn.mapId,
      stage: at21,
      night: false,
      id: 98,
      lines: inn.linesOf(98, 'B0'),
      flags: new Set([1]),
    })
    expect(erinn).toMatchObject({ kind: 'line', onward: { map: 1110, event: 2130, answer: 0 } })
    expect(inn.mapCodeOf(1110)).toBe('M01M10')
  })

  it('moves on from the morning to 2.2, where Ivor waits downstairs with his greeting', () => {
    const landing = load(rom, { map: 'M01M10' })
    expect(eventOutcome(landing.triggers, 2130, landing.mapId)?.stage).toEqual({
      major: 2,
      minor: 2,
      step: 1,
    })

    const downstairs = load(rom, { map: 'M01M07' })
    const stage = { major: 2, minor: 2 }
    const cast = downstairs.castAt(stage)
    expect(cast.members.some((member) => member.placement.id === 7)).toBe(true)
    const greeting = pickLine({
      triggers: downstairs.triggers,
      map: downstairs.mapId,
      stage,
      night: false,
      id: 7,
      lines: [],
    })
    expect(greeting).toMatchObject({ kind: 'event', event: 2200 })
  })

  it('goes on outside after his greeting, and marks the story there', () => {
    const downstairs = load(rom, { map: 'M01M07' })
    const onward = eventOutcome(downstairs.triggers, 2200, downstairs.mapId)?.onward
    expect(onward).toEqual({ map: 1100, event: 2210 })
    expect(downstairs.mapCodeOf(1100)).toBe('M01')

    const village = load(rom, { map: 'M01' })
    expect(eventOutcome(village.triggers, 2210, village.mapId)).toMatchObject({
      stage: { major: 2, minor: 2, step: 2 },
      flags: [0],
    })
  })

  it('has Hugo stop them at the village’s edge once Ivor has called, and marks it', () => {
    const village = load(rom, { map: 'M01' })
    const asking = {
      triggers: village.triggers,
      map: village.mapId,
      stage: { major: 2, minor: 2 },
      night: false,
      id: 8,
      lines: [],
    }
    expect(pickLine({ ...asking, flags: new Set([0]) })).toMatchObject({
      kind: 'event',
      event: 2220,
    })
    expect(pickLine({ ...asking, flags: new Set([0, 1]) })?.kind).not.toBe('event')
    expect(eventOutcome(village.triggers, 2220, village.mapId)).toMatchObject({
      stage: { major: 2, minor: 2, step: 3 },
      flags: [1],
    })
  })

  it('plays the pass’s arrival on entering it, once, and moves on to 2.3 at the landslide', () => {
    const pass = load(rom, { map: 'S01M01' })
    const stage = { major: 2, minor: 2 }
    expect(pass.mapId).toBe(5101)
    expect(entryEvent(pass.triggers, 5101, stage, new Set())).toBe(2300)
    expect(entryEvent(pass.triggers, 5101, stage, new Set([2]))).toBeUndefined()
    expect(eventOutcome(pass.triggers, 2300, pass.mapId)?.flags).toEqual([2])
    const ivor = pickLine({
      triggers: pass.triggers,
      map: pass.mapId,
      stage,
      night: false,
      id: 7,
      lines: [],
    })
    expect(ivor).toMatchObject({ kind: 'event', event: 2350 })
    expect(eventOutcome(pass.triggers, 2350, pass.mapId)?.stage).toEqual({
      major: 2,
      minor: 3,
      step: 1,
    })
  })

  it('has Hugo greet Ivor on the way back at 2.3, once, and not without him', () => {
    const village = load(rom, { map: 'M01' })
    const asking = {
      triggers: village.triggers,
      map: village.mapId,
      stage: { major: 2, minor: 3 },
      night: false,
      id: 8,
      lines: village.linesOf(8, 'B0'),
    }
    const first = pickLine({ ...asking, marks: new Set(), alone: false })
    expect(first).toMatchObject({ kind: 'event', event: 2430, marks: [7] })
    expect(pickLine({ ...asking, marks: new Set([7]), alone: false })?.why).toContain('label 193')
    expect(pickLine({ ...asking, marks: new Set(), alone: true })?.why).toContain('label 194')
  })

  it('has the Hexagon’s first floor go by its steps, and its statue step aside at 5', () => {
    const floor = load(rom, { map: 'D01M01' })
    const stage = { major: 2, minor: 4 }
    const asking = { triggers: floor.triggers, map: floor.mapId, stage, night: false, lines: [] }
    // The switch, 201: nothing until step 4, when it plays the noise of something moving.
    expect(pickLine({ ...asking, id: 201, step: 4 })).toMatchObject({ kind: 'event', event: 2530 })
    expect(pickLine({ ...asking, id: 201, step: 3 })?.kind).not.toBe('event')
    expect(eventOutcome(floor.triggers, 2530, floor.mapId)?.stage).toEqual({
      major: 2,
      minor: 4,
      step: 5,
    })
    // The figure, 204, stands at its header over steps 2 and 3, and not at 1 or 4.
    const figures = (step: number) => {
      const cast = floor.castAt(stage, step)
      return cast.sprites2d.length + cast.sprites
    }
    expect(figures(2)).toBe(figures(1) + 1)
    expect(figures(3)).toBe(figures(4) + 1)
    const spotAt = (step: number) =>
      floor.castAt(stage, step).spots.find(({ placement }) => placement.id === 202)?.placement
    const before = spotAt(4)
    const after = spotAt(5)
    expect(before && after && after.x - before.x).toBeGreaterThan(0)
    expect(floor.castAt(stage, 4).spots.some(({ placement }) => placement.id === 201)).toBe(true)
    // The statue that slides aside: the piece `202`'s step-5 record stands on.
    expect(floor.slides).toHaveLength(1)
    const [statue] = floor.slides
    expect(statue).toMatchObject({ stem: 'D01M01S1', id: 202 })
    expect(floor.map.meshes[statue?.mesh ?? -1]?.source).toBe('D01A01S1')
    expect(after && statue && Math.hypot(after.x - statue.home.x, after.z - statue.home.z)).toBe(0)
  })

  it('has Patty set the Hexagoon fight, and her thanks after it carry on to 2.5', () => {
    const room = load(rom, { map: 'D01M05' })
    const asking = {
      triggers: room.triggers,
      map: room.mapId,
      stage: { major: 2, minor: 4 },
      night: false,
      id: 203,
      lines: [],
    }
    expect(pickLine(asking)).toMatchObject({ kind: 'event', event: 2535 })
    expect(pickLine({ ...asking, flags: new Set([6]) })).toMatchObject({
      kind: 'event',
      event: 22510,
    })
    expect(eventOutcome(room.triggers, 22510, room.mapId)?.battle).toBe(2)
    expect(room.eventBattles.get(2)?.foes).toEqual([{ monster: 300, count: 1 }])
    expect(room.monsterCodeOf.get(300)).toBe('b003a')
    expect(afterBattle(room.triggers, 2, true, room.mapId)?.event).toBe(2550)
    expect(afterBattle(room.triggers, 2, false, room.mapId)?.flags).toEqual([4])
    expect(eventOutcome(room.triggers, 2550, room.mapId)?.onward).toEqual({
      map: 7100,
      event: 2555,
    })
    const outside = load(rom, { map: 'D01' })
    expect(eventOutcome(outside.triggers, 2555, outside.mapId)?.stage).toEqual({
      major: 2,
      minor: 5,
      step: 1,
    })
  })

  it('has the mayor hear the news on entering his house at 2.3, and moves on to 2.4', () => {
    const house = load(rom, { map: 'M01M05' })
    expect(entryEvent(house.triggers, 1105, { major: 2, minor: 3 }, new Set())).toBe(2400)
    expect(eventOutcome(house.triggers, 2400, house.mapId)?.onward).toEqual({
      map: 1110,
      event: 2410,
    })
    const landing = load(rom, { map: 'M01M10' })
    expect(eventOutcome(landing.triggers, 2410, landing.mapId)?.stage).toMatchObject({
      major: 2,
      minor: 4,
    })
  })
})
