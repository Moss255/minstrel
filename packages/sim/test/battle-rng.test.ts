import { describe, expect, it } from 'vitest'
import {
  criticalBlow,
  criticalDamage,
  drawnAmount,
  initiative,
  physicalDamage,
} from '../src/battle/damage.ts'
import { BattleRng } from '../src/battle/rng.ts'

/**
 * Golden values from the reference implementation, DQIX/BattleEmulator (MIT):
 * its `lcg.cpp` linked as it is and its fixed-point `FUN_0207564c` copied
 * verbatim into a small harness, compiled and run. Nothing here comes from a
 * cartridge.
 *
 * `damage` rows are `[attack, defence, damage, numbers drawn]`.
 */
const GOLDEN: Record<
  string,
  { top32: number[]; percent100: number[]; turn: number[]; damage: number[][] }
> = {
  '1': {
    top32: [0, 1566083941, 3820307428, 1031784986, 1072108706, 1969985952],
    percent100: [0, 36, 88, 24, 24, 45],
    turn: [0.51, 0.68866984267951925, 0.94584747233428068, 0.62771326957736162],
    damage: [
      [10, 7, 2, 2],
      [9, 8, 2, 2],
      [30, 22, 9, 2],
      [140, 108, 42, 2],
      [3, 20, 0, 0],
      [20, 39, 0, 1],
      [256, 256, 64, 2],
      [1, 0, 0, 2],
    ],
  },
  '305419896': {
    top32: [0, 4068991750, 2643032926, 65852009, 3971953733, 2837854202],
    percent100: [0, 94, 61, 1, 92, 66],
    turn: [0.51, 0.97421912440564484, 0.81153573810588564, 0.51751285916427148],
    damage: [
      [10, 7, 3, 2],
      [9, 8, 1, 2],
      [30, 22, 10, 2],
      [140, 108, 43, 2],
      [3, 20, 0, 0],
      [20, 39, 1, 1],
      [256, 256, 61, 2],
      [1, 0, 1, 2],
    ],
  },
  '16045690984503111693': {
    top32: [3735928559, 4166026908, 3509586235, 4293816959, 1306719645, 796584708],
    percent100: [86, 96, 81, 99, 30, 18],
    turn: [0.93622093900805337, 0.98528957596980038, 0.91039821880636729, 0.99986876148497683],
    damage: [
      [10, 7, 4, 2],
      [9, 8, 3, 2],
      [30, 22, 8, 2],
      [140, 108, 45, 2],
      [3, 20, 0, 0],
      [20, 39, 0, 1],
      [256, 256, 60, 2],
      [1, 0, 0, 2],
    ],
  },
}

describe("the battle's random numbers and arithmetic, against the reference", () => {
  for (const [seed, golden] of Object.entries(GOLDEN)) {
    it(`draws what the reference draws from seed ${seed}`, () => {
      const rng = new BattleRng(BigInt(seed))
      expect(golden.top32.map(() => rng.top32())).toEqual(golden.top32)
      expect(rng.drawn).toBe(golden.top32.length)
      const percents = new BattleRng(BigInt(seed))
      expect(golden.percent100.map(() => percents.below(100))).toEqual(golden.percent100)
    })

    it(`orders turns as the reference does from seed ${seed}`, () => {
      const rng = new BattleRng(BigInt(seed))
      // The score at an agility of 1 is the draw itself, 0.51 to 1.0. The
      // reference works in doubles and the game in floats — see `initiative` —
      // so they agree to about seven figures, not to the reference's own.
      for (const expected of golden.turn) {
        expect(initiative(rng, 1)).toBeCloseTo(expected, 6)
      }
    })

    it(`deals the reference's damage, drawing as many numbers, from seed ${seed}`, () => {
      const rng = new BattleRng(BigInt(seed))
      for (const [attack, defence, damage, draws] of golden.damage as [
        number,
        number,
        number,
        number,
      ][]) {
        const before = rng.drawn
        expect(physicalDamage(rng, attack, defence), `${attack} against ${defence}`).toBe(damage)
        expect(rng.drawn - before, `${attack} against ${defence}`).toBe(draws)
      }
    })
  }

  it("lands an ordinary critical at the reference's 0.95 to 1.05 of the attack", () => {
    // `floatRand(0.95, 1.05)` from the reference, run from each seed.
    const factors: Record<string, number[]> = {
      '1': [0.94999999999999996, 0.98646323319990192, 1.0389484637416899, 0.97402311624027782],
      '305419896': [
        0.94999999999999996, 1.0447385968174785, 1.0115379057358951, 0.95153323656413702,
      ],
      '16045690984503111693': [
        1.0369838651036845, 1.046997872646898, 1.0317139222053811, 1.0499732166295872,
      ],
    }
    for (const [seed, row] of Object.entries(factors)) {
      const rng = new BattleRng(BigInt(seed))
      for (const [i, factor] of row.entries()) {
        const attack = [37, 140, 12, 999][i] as number
        expect(criticalBlow(rng, attack), `${attack} from seed ${seed}`).toBe(
          Math.trunc(attack * factor),
        )
      }
    }
  })

  it("draws a base give or take a spread as the reference's FUN_021e8458_typeD does", () => {
    // Its `typeD` copied verbatim into the same harness, six draws in a row
    // from each seed: the medicinal herb's 35 ± 5, strong medicine's 50 ± 10,
    // and a spread of nothing, which must still draw.
    const golden: Record<string, [number, number, number[]][]> = {
      '1': [
        [5, 35, [30, 33, 38, 32, 32, 34]],
        [10, 50, [40, 47, 57, 44, 44, 49]],
        [0, 3, [3, 3, 3, 3, 3, 3]],
      ],
      '305419896': [
        [5, 35, [30, 39, 36, 30, 39, 36]],
        [10, 50, [40, 58, 52, 40, 58, 53]],
        [0, 3, [3, 3, 3, 3, 3, 3]],
      ],
      '16045690984503111693': [
        [5, 35, [38, 39, 38, 39, 33, 31]],
        [10, 50, [57, 59, 56, 59, 46, 43]],
        [0, 3, [3, 3, 3, 3, 3, 3]],
      ],
    }
    for (const [seed, rows] of Object.entries(golden)) {
      for (const [spread, base, drawn] of rows) {
        const rng = new BattleRng(BigInt(seed))
        expect(
          drawn.map(() => drawnAmount(rng, base, spread)),
          `${base} ± ${spread} from ${seed}`,
        ).toEqual(drawn)
        expect(rng.drawn).toBe(drawn.length)
      }
    }
  })

  it('makes a critical hit one and a half to twice the damage', () => {
    const rng = new BattleRng(1n)
    // The seed's first draw is 0: exactly one and a half, truncated.
    expect(criticalDamage(rng, 11)).toBe(16)
    for (let i = 0; i < 50; i++) {
      const hit = criticalDamage(rng, 40)
      expect(hit).toBeGreaterThanOrEqual(60)
      expect(hit).toBeLessThan(80)
    }
  })
})
