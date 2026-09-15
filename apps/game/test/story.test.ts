import { readFileSync } from 'node:fs'
import { entryEvent, eventOutcome } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { load } from '../src/load.ts'
import { pickLine } from '../src/talk.ts'

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('the opening’s story, on a real cartridge', { timeout: 120_000 }, () => {
  const rom = romPath ? new Uint8Array(readFileSync(romPath)) : new Uint8Array()

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
