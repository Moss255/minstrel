import { describe, expect, it } from 'vitest'
import { BattleRng, criticalChance, physicalDamage } from '../src/index.ts'
import {
  AMBUSH_FOLLOWER_ACTS_BELOW,
  ambushFollowerActs,
  buffMultiplier,
  calculateCritRate,
  calculateMonsterCritRate,
  calculatePhysicalDamage,
  calculateTensionBonus,
  criticalThreshold,
  GameRandom,
  rollsCritical,
  roundUp,
} from './game-oracle.ts'

/**
 * The simulation's integer arithmetic, held to the game's own.
 *
 * `game-oracle.ts` is the game's battle arithmetic translated from its
 * decompilation in the 32-bit floats it computes in. What the simulation has
 * read from the game it computes the same way, and these hold it to the oracle
 * **exactly** — every draw, every blow, every deftness. Where it once parted,
 * the old form is kept here as a measurement, so why the float is in the
 * simulation stays written down beside the proof that it matches.
 *
 * Everything here is synthetic: no cartridge is read.
 */

const SEEDS = [0n, 1n, 12345n, 0xdeadbeefn, 0xffffffffffffffffn, 0x0123456789abcdefn]

describe('the generator', () => {
  it('draws what the game draws, one step on', () => {
    for (const state of SEEDS) {
      const game = new GameRandom(state)
      const ours = BattleRng.fromGameState(state)
      for (let i = 0; i < 1000; i++) expect(ours.top32()).toBe(game.next())
    }
  })

  it('is one sequence a step apart, which is what fromGameState is for', () => {
    // Seeded alike, ours hands back the seed's own top first and the game does
    // not: every draw of ours is the game's previous state.
    const ours = new BattleRng(12345n)
    const game = new GameRandom(12345n)
    expect(ours.top32()).toBe(Number(12345n >> 32n))
    const gameFirst = game.next()
    expect(ours.top32()).toBe(gameFirst)
  })
})

describe('a whole number below a maximum', () => {
  /** How many of `draws` the integer `below` and the game's float `max` disagree on. */
  function disagreements(maximum: number, draws: number): number {
    const game = new GameRandom(777n)
    const ours = BattleRng.fromGameState(777n)
    let differ = 0
    for (let i = 0; i < draws; i++) {
      if (ours.below(maximum) !== game.max(maximum)) differ++
    }
    return differ
  }

  it('agrees with the game on every draw, at every maximum a battle uses', () => {
    // A coin, a die, a percent, and the critical roll's 10,000 — where the
    // exact integer form this used to be parted from the game about once in
    // four thousand draws. It is the game's float now, and parts nowhere.
    for (const maximum of [2, 4, 5, 6, 8, 10, 100, 256, 1000, 10_000]) {
      expect(disagreements(maximum, 200_000)).toBe(0)
    }
  })

  it('is not the exact integer form, and this is how often that would differ', () => {
    // What `below` was: `(top × max) >> 32`. Kept as a measurement, so the
    // reason the float is here stays written down beside it.
    const game = new GameRandom(777n)
    const tops = BattleRng.fromGameState(777n)
    let differ = 0
    const draws = 400_000
    for (let i = 0; i < draws; i++) {
      const exact = Number((BigInt(tops.top32()) * 10_000n) >> 32n)
      if (exact !== game.max(10_000)) differ++
    }
    expect(differ).toBeGreaterThan(0)
    expect(differ / draws).toBeLessThan(0.0005)
  })

  it('never lands on the maximum itself, as the game takes care not to', () => {
    // Every bit set makes the float exactly 1.0 and the product the maximum;
    // the game steps back one. Forced, because no seed to hand draws it.
    class AllBitsSet extends GameRandom {
      override next(): number {
        this.drawn++
        return 0xffffffff
      }
    }
    const game = new AllBitsSet(0n)
    expect(game.float01()).toBe(1)
    for (const maximum of [1, 2, 7, 100, 10_000]) expect(game.max(maximum)).toBe(maximum - 1)
    // And nothing at all for a maximum that is not positive, without a draw.
    const before = game.drawn
    expect(game.max(0)).toBe(0)
    expect(game.max(-5)).toBe(0)
    expect(game.drawn).toBe(before)
  })
})

describe('physical damage', () => {
  it('is the game’s own, truncated, in every case', () => {
    let cases = 0
    let differ = 0
    let drawsDiffer = 0
    const game = new GameRandom(99n)
    const ours = BattleRng.fromGameState(99n)
    for (let n = 0; n < 200_000; n++) {
      const attack = 1 + ((n * 7919) % 300)
      const defence = (n * 104729) % 400
      const before = ours.drawn
      const gameBefore = game.drawn
      const mine = physicalDamage(ours, attack, defence)
      const theirs = Math.trunc(calculatePhysicalDamage(attack, defence, game))
      // Both must spend the same number of draws, or every later roll shifts.
      if (ours.drawn - before !== game.drawn - gameBefore) drawsDiffer++
      if (mine !== theirs) differ++
      cases++
    }
    expect(cases).toBe(200_000)
    expect(drawsDiffer).toBe(0)
    expect(differ).toBe(0)
  })

  it('is truncated and not rounded — a third of all blows would differ', () => {
    // `RoundUp` sits beside `CalculatePhysicalDamage` in the game and is called
    // sixteen bytes before it, which invites the reading that damage is
    // rounded. It is not: `GetAttackBaseDamage` returns the float as an `int`.
    // Rounded, the simulation would disagree with itself this often.
    let rounded = 0
    const game = new GameRandom(5n)
    const ours = BattleRng.fromGameState(5n)
    const cases = 50_000
    for (let n = 0; n < cases; n++) {
      const attack = 1 + ((n * 7919) % 300)
      const defence = (n * 104729) % 400
      if (
        physicalDamage(ours, attack, defence) !==
        roundUp(calculatePhysicalDamage(attack, defence, game))
      )
        rounded++
    }
    expect(rounded / cases).toBeGreaterThan(0.25)
  })

  it('does nothing when the defence is twice the attack or more', () => {
    const game = new GameRandom(1n)
    expect(calculatePhysicalDamage(10, 20, game)).toBe(0)
    expect(calculatePhysicalDamage(10, 400, game)).toBe(0)
    // And spends no draw finding that out.
    expect(game.drawn).toBe(0)
    const ours = new BattleRng(1n)
    expect(physicalDamage(ours, 10, 20)).toBe(0)
    expect(ours.drawn).toBe(0)
  })
})

describe('the critical chance', () => {
  it('is two in a hundred until deftness passes 150, then a hundredth a point', () => {
    for (const deftness of [0, 1, 50, 149, 150]) {
      expect(criticalChance(deftness)).toBe(200)
      expect(calculateCritRate(deftness)).toBeCloseTo(2, 5)
    }
    expect(criticalChance(151)).toBe(201)
    expect(criticalChance(250)).toBe(300)
  })

  it('is the game’s threshold at every deftness', () => {
    for (let deftness = 0; deftness <= 999; deftness++) {
      expect(criticalChance(deftness)).toBe(criticalThreshold(calculateCritRate(deftness)))
    }
    expect(criticalChance(0)).toBe(200)
  })

  it('is one under the exact sum at 151 of the 850 values past 150, and these are they', () => {
    // The game multiplies the percentage by 100 **as a float** and truncates,
    // and `0.01f` is not a hundredth, so its threshold comes out one under
    // `200 + (deftness − 150)` about one value in six. The simulation follows
    // the game; this keeps the size of what that decision bought.
    const under: number[] = []
    for (let deftness = 151; deftness <= 999; deftness++) {
      const exact = 200 + (deftness - 150)
      const ours = criticalChance(deftness)
      if (ours !== exact) {
        expect(exact - ours).toBe(1)
        under.push(deftness)
      }
    }
    expect(under.length).toBe(151)
    expect(under.slice(0, 5)).toEqual([159, 160, 161, 162, 184])
    expect(criticalChance(159)).toBe(208)
  })

  it('meets one draw below 10,000, and spends it whether or not it lands', () => {
    const random = new GameRandom(42n)
    let landed = 0
    const rolls = 200_000
    for (let i = 0; i < rolls; i++) if (rollsCritical(random, 2)) landed++
    expect(random.drawn).toBe(rolls)
    // Two in a hundred, give or take.
    expect(landed / rolls).toBeGreaterThan(0.018)
    expect(landed / rolls).toBeLessThan(0.022)
  })

  it('is nothing for a monster, whatever its skill says', () => {
    // The base is a literal zero in the game's own function.
    for (const skill of [0, 0.5, 1, 1.27]) {
      for (const hits of [1, 2, 3]) expect(calculateMonsterCritRate(skill, hits)).toBe(0)
    }
    const random = new GameRandom(7n)
    for (let i = 0; i < 10_000; i++)
      expect(rollsCritical(random, calculateMonsterCritRate(1))).toBe(false)
  })

  it('shares out over a move of several hits, and takes its bonuses as the game does', () => {
    // Not in the simulation yet — nothing the slice plays has them — but read,
    // so that what is missing is written down rather than forgotten.
    expect(calculateCritRate(100, 0, 0, 1, 2)).toBeCloseTo(1, 5)
    expect(calculateCritRate(100, 3, 0, 1, 1)).toBeCloseTo(5, 5)
    expect(calculateCritRate(100, 0, 0, 2, 1)).toBeCloseTo(4, 5)
  })
})

describe('what is read and not yet in the simulation', () => {
  it('lets each monster after the first act in an ambush two times in three', () => {
    expect(AMBUSH_FOLLOWER_ACTS_BELOW).toBe(67)
    const random = new GameRandom(3n)
    let acted = 0
    const rounds = 200_000
    for (let i = 0; i < rounds; i++) if (ambushFollowerActs(random)) acted++
    expect(acted / rounds).toBeGreaterThan(0.66)
    expect(acted / rounds).toBeLessThan(0.68)
  })

  it('tension grows with the level, ten levels at a time', () => {
    // The level is divided by ten as a whole number first.
    expect(calculateTensionBonus(5, 9)).toBe(5)
    expect(calculateTensionBonus(5, 10)).toBe(10)
    expect(calculateTensionBonus(5, 19)).toBe(10)
    expect(calculateTensionBonus(5, 20)).toBe(15)
  })

  it('a buff is a quarter a level on attack and a half on the rest', () => {
    expect(buffMultiplier.attack(2)).toBe(1.5)
    expect(buffMultiplier.attack(-2)).toBe(0.5)
    expect(buffMultiplier.defence(2)).toBe(2)
    // Down, defence loses a half and then three quarters — not a half a level.
    expect(buffMultiplier.defence(-1)).toBe(0.5)
    expect(buffMultiplier.defence(-2)).toBe(0.25)
    // Charm never goes below whole.
    expect(buffMultiplier.charm(-2)).toBe(1)
    expect(buffMultiplier.magic(-1)).toBe(0.5)
  })

  it('a stat is rounded half up after its multiplier, before the blow is worked out', () => {
    expect(roundUp(10.4)).toBe(10)
    expect(roundUp(10.5)).toBe(11)
    expect(roundUp(100 * buffMultiplier.attack(1))).toBe(125)
  })
})
