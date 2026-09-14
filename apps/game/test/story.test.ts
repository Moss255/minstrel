import { readFileSync } from 'node:fs'
import { eventOutcome } from '@minstrel/game-formats'
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
})
