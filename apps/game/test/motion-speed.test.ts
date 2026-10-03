import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { build } from '../../../packages/game-formats/test/table-builder.ts'
import { motionSpeeds } from '../src/load.ts'
import { frameAt, MOTION_MS, motionMs, speedsOf, UNNAMED_SPEED } from '../src/motion-speed.ts'

/** A `.bcfg` of motions: name, first frame, last frame, speed. */
const bcfg = (motions: [string, number, number, number][]) =>
  build(
    motions.map(([name, start, end, speed]) => ({
      tag: 0x66,
      values: [{ s: name }, { f: start }, { f: end }, { f: speed }],
    })),
  )

describe('how fast a motion plays', () => {
  it('takes each motion’s speed from its .bcfg, the first named winning', () => {
    const speeds = speedsOf([
      { path: 'a/mp0201be.bcfg', bytes: bcfg([['attack1a', 1, 19, 0.25]]) },
      {
        path: 'a/mp0201f.bcfg',
        bytes: bcfg([
          ['stand', 1, 9, 0.125],
          ['run', 10, 22, 0.5],
        ]),
      },
      { path: 'a/mp0201n.bcfg', bytes: bcfg([['stand', 1, 9, 0.5]]) },
      { path: 'a/stand.nsbca', bytes: new Uint8Array(4) },
    ])
    expect([...speeds]).toEqual([
      ['attack1a', 0.25],
      ['stand', 0.125],
      ['run', 0.5],
    ])
  })

  it('goes its speed of frames each 17 ms, through its frames less one', () => {
    // 19 frames at 0.25: 18 steps in 72 of the game's frames.
    expect(motionMs(0.25, 19)).toBe(72 * MOTION_MS)
    expect(frameAt(36 * MOTION_MS, 0.25, 19, false)).toBe(9)
    // Held at the end, or round again.
    expect(frameAt(100 * MOTION_MS, 0.25, 19, false)).toBe(18)
    expect(frameAt(76 * MOTION_MS, 0.25, 19, true)).toBe(1)
    // A motion no record names goes at the engine's old 30 a second.
    expect(frameAt(1000, undefined, 60, false)).toBeCloseTo(1000 * (UNNAMED_SPEED / MOTION_MS))
  })

  it('gives a frame for a time without end — a fallen fighter lying at the end of `death`', () => {
    expect(frameAt(Number.POSITIVE_INFINITY, 0.25, 19, false)).toBe(18)
    // Going round, there is no end to be at: it starts again rather than give NaN.
    expect(frameAt(Number.POSITIVE_INFINITY, 0.25, 19, true)).toBe(0)
    expect(frameAt(Number.NaN, 0.25, 19, true)).toBe(0)
  })
})

const romPath = process.env.MINSTREL_TEST_ROM

describe.skipIf(!romPath)('the motion sets’ speeds on the cartridge', () => {
  it('reads the swords’ set: its blow, its stand and its run', () => {
    const rom = new Uint8Array(readFileSync(romPath as string))
    const speeds = motionSpeeds(rom, 'mp0201')
    expect(speeds.get('attack1a')).toBeCloseTo(0.25)
    expect(speeds.get('stand')).toBeCloseTo(0.1)
    expect(speeds.get('run')).toBeCloseTo(0.4)
  })
})
