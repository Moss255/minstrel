import { readDataTable } from '@minstrel/game-formats'
import { describe, expect, it } from 'vitest'
import { build } from '../../../packages/game-formats/test/table-builder.ts'
import {
  NUDGE_AT,
  NUMBER_LIFE,
  nudged,
  numberFrame,
  numberSprites,
  type RisingNumber,
  risingNumber,
} from '../src/battle-numbers.ts'
import { effectFile, readBlowScript } from '../src/blow-effect.ts'

const run = (number: RisingNumber, frames: number): RisingNumber | undefined => {
  let now: RisingNumber | undefined = number
  for (let i = 0; i < frames && now; i++) now = numberFrame(now)
  return now
}

describe('the numbers that rise over a fighter', () => {
  it('makes none of 0, and steps a fighter’s later hits aside and down', () => {
    expect(risingNumber(0, 0, [0, 0, 0])).toBeUndefined()
    expect(risingNumber(6, 0, [0, 0, 0])).toMatchObject({ dx: 0, dy: 0, timer: NUMBER_LIFE })
    expect(risingNumber(6, 0, [0, 0, 0], 1)).toMatchObject({ dx: -16, dy: 8 })
  })

  it('springs its frame from 1.2 to rest, and lives 37 frames', () => {
    const born = risingNumber(12, 0, [0, 0, 0]) as RisingNumber
    const scales = [1, 2, 3, 4].map((f) => (run(born, f)?.scale ?? 0) / 4096)
    expect(scales[0]).toBeCloseTo(1.4, 2)
    expect(scales[1]).toBeCloseTo(1.4, 2)
    expect(scales[2]).toBeCloseTo(1.24, 2)
    expect(run(born, 60)?.scale).toBeUndefined()
    // Freed once its timer reaches 0: 37 frames from 37.
    expect(run(born, NUMBER_LIFE - 1)).toBeDefined()
    expect(run(born, NUMBER_LIFE)).toBeUndefined()
  })

  it('hides for 3 frames, pops its digits in from the left, and fades at the end', () => {
    const born = risingNumber(12, 0, [0, 0, 0]) as RisingNumber
    expect(numberSprites(run(born, 2) as RisingNumber, 128, 96)).toEqual([])
    // Frame 3: the frame behind and the first digit, swelled by half.
    const first = numberSprites(run(born, 3) as RisingNumber, 128, 96)
    expect(first.map((s) => s.sheet)).toEqual(['damage_waku', 'damage_num'])
    expect(first[1]).toMatchObject({ frame: 1, scale: 1.5, alpha: 31 })
    // Both digits later, at rest, 8 apart and centred on x: 128 − 8 and 128.
    const both = numberSprites(run(born, 20) as RisingNumber, 128, 96)
    expect(both.slice(1).map((s) => [s.frame, s.x, s.scale])).toEqual([
      [1, 120, 1],
      [2, 128, 1],
    ])
    // Kept 16 in from the edge.
    expect(numberSprites(run(born, 20) as RisingNumber, 0, 96)[2]?.x).toBe(16)
    // The last four drawn frames fade 28, 21, 14, 7; then nothing.
    expect(numberSprites(run(born, 28) as RisingNumber, 128, 96)[0]?.alpha).toBe(28)
    expect(numberSprites(run(born, 31) as RisingNumber, 128, 96)[0]?.alpha).toBe(7)
    expect(numberSprites(run(born, 32) as RisingNumber, 128, 96)).toEqual([])
  })
})

describe('the nudge clear of the others', () => {
  const at = (timer: number, kind: 0 | 4 = 0) => ({
    ...(risingNumber(5, kind, [0, 0, 0]) as RisingNumber),
    timer,
  })

  it('stays put with no one near, and steps aside and up past one showing', () => {
    const alone = [at(NUDGE_AT)]
    expect(nudged(alone, 0, [{ x: 100, y: 100 }])).toMatchObject({ dx: 0, dy: 0 })
    // Another showing at the same spot: (0, 0) is taken, so (24, −4).
    const two = [at(NUDGE_AT), at(20)]
    const screen = [
      { x: 100, y: 100 },
      { x: 100, y: 100 },
    ]
    expect(nudged(two, 0, screen)).toMatchObject({ dx: 24, dy: -4 })
    // One still hidden does not count, nor tension against tension.
    expect(nudged([at(NUDGE_AT), at(36)], 0, screen)).toMatchObject({ dx: 0, dy: 0 })
    expect(nudged([at(NUDGE_AT, 4), at(20, 4)], 0, screen)).toMatchObject({ dx: 0, dy: 0 })
  })
})

describe('the effect a blow plays', () => {
  it('names an effect’s file by its number', () => {
    expect(effectFile(3000500)).toBe('effect/eb0500.chr')
    expect(effectFile(1000012)).toBe('effect/em0012.chr')
    expect(effectFile(5000123)).toBe('effect/z000123.chr')
    expect(effectFile(12)).toBeUndefined()
  })

  it('reads a script’s blow: its step, lunge, landing, trail, hit-stop and effect on the struck', () => {
    const script = readDataTable(
      build([
        { tag: 29, values: [{ n: 3000500 }] },
        { tag: 30, values: [{ n: 100 }, { n: 3000500 }] },
        { tag: 20, values: [{ n: 101 }, { s: 'effect/Z069000.chr' }] },
        { tag: 77, values: [{ f: 0.75 }] },
        { tag: 3, values: [{ n: 7 }, { s: 'attack1a' }] },
        { tag: 5, values: [{ n: 120 }, { n: 407 }, { f: 0.3 }] },
        { tag: 21, values: [{ n: 100 }, { n: 26 }, { s: '0' }] },
        { tag: 26, values: [{ n: 7 }, { n: 407 }] },
        { tag: 26, values: [{ n: 7 }, { n: 580 }] },
        { tag: 116, values: [{ f: 0.1 }, { n: 200 }, { n: 100 }] },
        { tag: 61, values: [] },
        { tag: 66, values: [{ n: 101 }] },
        { tag: 68, values: [{ n: 1 }] },
        { tag: 62, values: [] },
      ]),
    )
    const blow = readBlowScript(script)
    expect(blow?.stepIn).toBeCloseTo(0.75)
    expect(blow?.lunge).toEqual({ from: 0.12, to: 0.407, gap: expect.closeTo(0.3, 5) })
    expect(blow?.lands).toBe(0.58)
    expect(blow?.swing).toEqual({ file: 'effect/eb0500.chr', motion: '0' })
    expect(blow?.struck).toEqual({ file: 'effect/z069000.chr', motion: undefined, raised: true })
    expect(blow?.hitStop).toEqual({ speed: expect.closeTo(0.1, 5), lasts: 200, after: 100 })
    expect(readBlowScript(script, 'attack9z')).toBeUndefined()
  })
})
