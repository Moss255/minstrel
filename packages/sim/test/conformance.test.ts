import { describe, expect, it } from 'vitest'
import {
  BattleRng,
  blockChance,
  criticalBlow,
  criticalChance,
  criticalDamage,
  criticalHit,
  dealt,
  drawnAmount,
  monsterHp,
  partyAmount,
  physicalDamage,
  resistanceTo,
} from '../src/index.ts'
import {
  AMBUSH_FOLLOWER_ACTS_BELOW,
  actionAmount,
  ambushFollowerActs,
  BLOW_ORDER,
  buffMultiplier,
  builtMonsterHp,
  calculateCritRate,
  calculateMonsterCritRate,
  calculatePhysicalDamage,
  calculateTensionBonus,
  changeLands,
  criticalDamageOf,
  criticalThreshold,
  criticalValue,
  damageDealt,
  endOfBlow,
  evasionRate,
  GameRandom,
  MONSTER_EVASION,
  partyBlockRate,
  resistance,
  riderLands,
  rollsBlock,
  rollsCritical,
  rollsEvade,
  rollsLands,
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

  it('rolls a blow’s critical first, then the dodge, then the block, then the damage', () => {
    expect(BLOW_ORDER).toEqual(['critical', 'evade', 'block', 'accuracy', 'damage'])
  })

  it('lets one of the party dodge two times in a hundred, which is the simulation’s own', () => {
    expect(evasionRate({ party: true })).toBe(2)
    expect(evasionRate({ party: true, accessory: 3 })).toBe(5)
    expect(evasionRate({ party: true }, { doubled: true })).toBe(4)
    expect(evasionRate({ party: true, accessory: 9 }, { fifty: true })).toBe(50)
  })

  it('lets a monster dodge by its grade, and not at all past the table', () => {
    expect(MONSTER_EVASION).toEqual([0, 2, 4, 8, 25])
    expect(evasionRate({ party: false, grade: 4 })).toBe(25)
    expect(evasionRate({ party: false, grade: 5 })).toBe(0)
    expect(evasionRate({ party: false, grade: -1 })).toBe(0)
  })

  it('spends no draw on a dodge or a block the action does not allow', () => {
    const random = new GameRandom(11n)
    expect(rollsEvade(random, false, 100)).toBe(false)
    expect(rollsBlock(random, false, 100)).toBe(false)
    expect(random.drawn).toBe(0)
    rollsEvade(random, true, 2)
    rollsBlock(random, true, 1)
    expect(random.drawn).toBe(2)
  })

  it('truncates the dodge’s rate and not the block’s', () => {
    // A rate of 2.9 dodges on a draw of 0 or 1; a block at 0.5 lands on a draw of 0.
    class Fixed extends GameRandom {
      constructor(private readonly value: number) {
        super(0n)
      }
      override max(): number {
        this.drawn++
        return this.value
      }
    }
    expect(rollsEvade(new Fixed(2), true, 2.9)).toBe(false)
    expect(rollsEvade(new Fixed(1), true, 2.9)).toBe(true)
    expect(rollsBlock(new Fixed(0), true, 0.5)).toBe(true)
    expect(rollsBlock(new Fixed(1), true, 0.5)).toBe(false)
  })

  it('lands the plain attack every time, and spends a draw finding that out', () => {
    const random = new GameRandom(21n)
    for (let i = 0; i < 50_000; i++) expect(rollsLands(random, {})).toBe(true)
    expect(random.drawn).toBe(50_000)
  })

  it('misses five times in eight when sight is spoilt, on a blow that sight spoils', () => {
    const random = new GameRandom(22n)
    let landed = 0
    const blows = 200_000
    for (let i = 0; i < blows; i++) {
      if (rollsLands(random, { spoiltBySight: true }, { sightSpoilt: true })) landed++
    }
    // Two draws a blow: the percent, then the die of eight.
    expect(random.drawn).toBe(blows * 2)
    expect(landed / blows).toBeGreaterThan(0.365)
    expect(landed / blows).toBeLessThan(0.385)
    // And not at all on an action sight does not spoil — a spell, an item.
    const other = new GameRandom(23n)
    for (let i = 0; i < 1000; i++) expect(rollsLands(other, {}, { sightSpoilt: true })).toBe(true)
    expect(other.drawn).toBe(1000)
  })

  it('lands a scaling action as often as its accuracy says', () => {
    const random = new GameRandom(24n)
    let landed = 0
    const blows = 200_000
    for (let i = 0; i < blows; i++) if (rollsLands(random, { accuracy: 75 })) landed++
    expect(landed / blows).toBeGreaterThan(0.745)
    expect(landed / blows).toBeLessThan(0.755)
  })
})

describe('a critical’s damage', () => {
  it('is the game’s for an ordinary blow, in every case', () => {
    const game = new GameRandom(31n)
    const ours = BattleRng.fromGameState(31n)
    let differ = 0
    for (let n = 0; n < 100_000; n++) {
      const attack = 1 + ((n * 7919) % 400)
      const base = (n * 104729) % 250
      if (criticalHit(ours, base, attack) !== Math.trunc(criticalDamageOf(base, game, attack)))
        differ++
    }
    expect(differ).toBe(0)
    expect(ours.drawn).toBe(game.drawn)
  })

  it('is the attack power’s draw almost always, which is all the reference has', () => {
    const ours = BattleRng.fromGameState(32n)
    const same = BattleRng.fromGameState(32n)
    for (let n = 0; n < 10_000; n++) {
      // Any blow an attack of 60 can really deal: well under the attack itself.
      const base = n % 40
      expect(criticalHit(ours, base, 60)).toBe(criticalBlow(same, 60))
    }
  })

  it('is the damage and a fifth when that is more — a feeble attack against nothing', () => {
    // An attack of 2 deals about 1; its critical draw is about 2; but against a
    // damage of 10 handed in, a fifth more is 12 and wins.
    const rng = BattleRng.fromGameState(33n)
    expect(criticalHit(rng, 10, 2)).toBe(12)
    // And never less than the blow would have dealt.
    const floor = BattleRng.fromGameState(34n)
    expect(criticalHit(floor, 0, 0)).toBe(0)
  })

  it('is half again to twice as much for a spell gone haywire', () => {
    const game = new GameRandom(35n)
    const ours = BattleRng.fromGameState(35n)
    let differ = 0
    let outOfRange = 0
    for (let n = 0; n < 100_000; n++) {
      const amount = 1 + (n % 300)
      const mine = criticalDamage(ours, amount)
      if (mine !== Math.trunc(criticalValue(amount, false, game))) differ++
      if (mine < Math.trunc(amount * 1.5) - 1 || mine > amount * 2) outOfRange++
    }
    expect(differ).toBe(0)
    expect(outOfRange).toBe(0)
    // The game then takes the greater of it and the amount and a fifth, which it always is.
    const again = new GameRandom(36n)
    for (let n = 1; n < 1000; n++) {
      const whole = criticalDamageOf(n, again)
      expect(whole).toBeGreaterThanOrEqual(Math.fround(1.2 * n))
    }
  })
})

describe('the end of a blow', () => {
  const plain = {
    dodged: false,
    blocked: false,
    action: 1,
    kind: 1,
    damageCap: 0,
    worksOnMetal: true,
    targetCanBeHurt: true,
    targetIsMetal: false,
    critical: false,
    targetStatus24: false,
  }

  it('gives nothing a coin, whoever struck it, and the simulation’s is the same coin', () => {
    let wrong = 0
    for (let seed = 1n; seed <= 2000n; seed++) {
      const theirs = endOfBlow(0, plain, new GameRandom(seed))
      const ours = BattleRng.fromGameState(seed).below(2)
      if (theirs !== ours || (theirs !== 0 && theirs !== 1)) wrong++
    }
    expect(wrong).toBe(0)
  })

  it('gives a dodged or blocked blow nothing, and no coin', () => {
    for (const flag of [{ dodged: true }, { blocked: true }]) {
      const random = new GameRandom(9n)
      const before = random.state
      expect(endOfBlow(40, { ...plain, ...flag }, random)).toBe(0)
      expect(random.state).toBe(before)
    }
  })

  it('gives no coin to Kamikazee, nor to a spell that finds a metal body', () => {
    const random = new GameRandom(9n)
    const before = random.state
    expect(endOfBlow(0, { ...plain, action: 0x1b }, random)).toBe(0)
    expect(
      endOfBlow(0, { ...plain, action: 9, targetIsMetal: true, worksOnMetal: false }, random),
    ).toBe(0)
    expect(random.state).toBe(before)
  })

  it('deals a metal body 1 or 2 with Metal Slash, after the coin and over it', () => {
    const seen = new Set<number>()
    for (let seed = 1n; seed <= 200n; seed++) {
      seen.add(endOfBlow(0, { ...plain, action: 0x40, targetIsMetal: true }, new GameRandom(seed)))
    }
    expect([...seen].sort()).toEqual([1, 2])
  })

  it('halves after the coin, so by this reading a halved 0-or-1 is always 0', () => {
    // **Not the simulation's.** The status bit is INFERRED to be defending, and
    // the reference has a defended 0-or-1 still dealing 0 or 1. Stated here so
    // the disagreement is written down in one place; `docs/conformance.md`.
    for (let seed = 1n; seed <= 200n; seed++) {
      expect(endOfBlow(0, { ...plain, targetStatus24: true }, new GameRandom(seed))).toBe(0)
    }
    expect(endOfBlow(41, { ...plain, targetStatus24: true }, new GameRandom(1n))).toBe(20)
    // Only what does damage is halved.
    expect(endOfBlow(41, { ...plain, kind: 2, targetStatus24: true }, new GameRandom(1n))).toBe(41)
  })

  it('caps the whole number, where the action has a cap', () => {
    expect(endOfBlow(1200.9, { ...plain, action: 9, damageCap: 999 }, new GameRandom(1n))).toBe(999)
    expect(endOfBlow(1200.9, plain, new GameRandom(1n))).toBe(1200)
  })
})

describe('a shield’s chance of blocking', () => {
  it('is the game’s, for every shield there could be, alone or with more worn', () => {
    let wrong = 0
    for (let tenths = 0; tenths < 1024; tenths++) {
      for (const rest of [[], [0, 0, 0], [3, 7]]) {
        const worn = [...rest, tenths]
        if (blockChance(true, worn) !== partyBlockRate(true, worn)) wrong++
      }
    }
    expect(wrong).toBe(0)
  })

  it('is nothing without a shield, whatever else is worn', () => {
    expect(blockChance(false, [50])).toBe(0)
    expect(partyBlockRate(false, [50])).toBe(0)
  })

  it('blocks on a whole draw under an untruncated rate — half a hundredth is one in a hundred', () => {
    const blocks = (tenths: number) => {
      let n = 0
      for (let draw = 0; draw < 100; draw++) {
        if (Math.fround(draw) < blockChance(true, [tenths])) n++
      }
      return n
    }
    // The bronze shield's 5, the iron's 10, the steel's 15, Erdrick's 90.
    expect([5, 10, 15, 90].map(blocks)).toEqual([1, 1, 2, 9])
  })
})

describe('an action’s amount', () => {
  // Frizz, Heal, the medicinal herb and Crackle, as the cartridge has them.
  const ranges = [
    { spread: 2, base: 9, min: 14, max: 99 },
    { spread: 5, base: 35, min: 35, max: 160 },
    { spread: 5, base: 35, min: 35, max: 35 },
    { spread: 8, base: 33, min: 50, max: 150 },
  ]

  it('is the game’s for a monster: its own base, give or take the spread, in one draw', () => {
    let wrong = 0
    for (const range of ranges) {
      for (let seed = 1n; seed <= 3000n; seed++) {
        const ours = BattleRng.fromGameState(seed)
        const theirs = new GameRandom(seed)
        if (drawnAmount(ours, range.base, range.spread) !== actionAmount(theirs, range, 'monster'))
          wrong++
        if (ours.drawn !== 1) wrong++
      }
    }
    expect(wrong).toBe(0)
  })

  it('is the game’s for one of the party scaling by a number, at every number', () => {
    let wrong = 0
    for (const range of ranges) {
      for (let stat = 0; stat <= 1023; stat += 7) {
        const scales = { stat, lo: 50, hi: 999 }
        for (let seed = 1n; seed <= 40n; seed++) {
          const ours = BattleRng.fromGameState(seed)
          const mine = partyAmount(ours, { min: range.min, max: range.max, scales }, range.spread)
          if (mine !== actionAmount(new GameRandom(seed), range, 'party', scales)) wrong++
          if (ours.drawn !== 1) wrong++
        }
      }
    }
    expect(wrong).toBe(0)
  })

  it('is the game’s for one of the party not scaling, in two draws — even a herb’s 35 to 35', () => {
    let wrong = 0
    for (const range of ranges) {
      for (let seed = 1n; seed <= 3000n; seed++) {
        const ours = BattleRng.fromGameState(seed)
        const mine = partyAmount(ours, { min: range.min, max: range.max }, range.spread)
        if (mine !== actionAmount(new GameRandom(seed), range, 'party')) wrong++
        if (ours.drawn !== 2) wrong++
      }
    }
    expect(wrong).toBe(0)
  })

  it('gives Frizz 14 at a might of 50, 99 at 999, and what lies between', () => {
    const frizz = { min: 14, max: 99 }
    const about = (stat: number) => {
      const seen = new Set<number>()
      for (let seed = 1n; seed <= 400n; seed++) {
        seen.add(
          partyAmount(
            BattleRng.fromGameState(seed),
            { ...frizz, scales: { stat, lo: 50, hi: 999 } },
            2,
          ),
        )
      }
      return [Math.min(...seen), Math.max(...seen)]
    }
    expect(about(0)).toEqual([12, 15])
    expect(about(50)).toEqual([12, 15])
    expect(about(999)).toEqual([97, 100])
    // Halfway: 14 + (int)(474 × (85 / 949)) = 14 + 42.
    expect(about(524)).toEqual([54, 57])
  })
})

describe('a change of state', () => {
  it('lands under its chance against a whole resistance, which is the simulation’s rule', () => {
    // The simulation has no resistances: everyone's is whole. Then the game's
    // `(int)(chance × 1.0 + 0.5)` is the chance, and `draw < chance` is it.
    let wrong = 0
    for (let chance = 0; chance <= 100; chance++) {
      for (let draw = 0; draw < 100; draw++) {
        if (changeLands(draw, chance, 1, false) !== draw < chance) wrong++
      }
    }
    expect(wrong).toBe(0)
  })

  it('lands outright when the cast goes haywire, unless the target is immune', () => {
    expect(changeLands(99, 0, 1, true)).toBe(true)
    expect(changeLands(0, 100, 0, true)).toBe(false)
  })

  it('is what a resistance does to it — read, and not the simulation’s yet', () => {
    // Kasap's 75 against half a resistance: 38, the half rounding it up.
    expect(changeLands(37, 75, 0.5, false)).toBe(true)
    expect(changeLands(38, 75, 0.5, false)).toBe(false)
  })
})

describe('what rides on a blow', () => {
  it('draws only for a blow that dealt something, on one who can take it', () => {
    const random = new GameRandom(5n)
    const before = random.state
    expect(riderLands(random, 0, 12, 100, false)).toBe(false)
    expect(riderLands(random, 9, 12, 0, false)).toBe(false)
    expect(random.state).toBe(before)
    riderLands(random, 9, 12, 100, false)
    expect(random.state).not.toBe(before)
  })

  it('poisons 12 times in 100 at the reference’s poison attack’s chance, as the simulation does', () => {
    let wrong = 0
    for (let seed = 1n; seed <= 3000n; seed++) {
      const theirs = riderLands(new GameRandom(seed), 9, 12, 100, false)
      if (theirs !== BattleRng.fromGameState(seed).below(100) < 12) wrong++
    }
    expect(wrong).toBe(0)
  })
})

describe('what a target takes of it', () => {
  const plain = {
    dodged: false,
    blocked: false,
    action: 1,
    kind: 1,
    damageCap: 0,
    worksOnMetal: true,
    targetCanBeHurt: true,
    targetIsMetal: false,
    targetStatus24: false,
  }

  it('reads a resistance as the game does, at every byte', () => {
    for (let byte = 0; byte <= 255; byte++) {
      const bytes = Array.from({ length: 22 }, () => byte)
      for (const element of [1, 8, 16, 21]) {
        expect(resistanceTo(bytes, element)).toBe(resistance(bytes, element))
      }
    }
    // Outside the elements, and with no bytes at all, whole.
    expect(resistanceTo([0], 0)).toBe(1)
    expect(resistanceTo([0], 22)).toBe(1)
    expect(resistanceTo(undefined, 5)).toBe(1)
  })

  it('deals what the game deals — critical or not, a blow or a spell, at every resistance', () => {
    let wrong = 0
    for (const byte of [0, 5, 25, 50, 75, 100, 125, 150, 200]) {
      const res = resistance([byte], 1)
      for (const critical of [false, true]) {
        for (const attack of [undefined, 40]) {
          for (const base of [0, 1, 3, 17, 240]) {
            for (let seed = 1n; seed <= 60n; seed++) {
              const ours = dealt(BattleRng.fromGameState(seed), base, {
                critical,
                resistance: res,
                ...(attack === undefined ? {} : { attack }),
              })
              const theirs = damageDealt(base, new GameRandom(seed), {
                ...plain,
                critical,
                resistance: res,
                ...(attack === undefined ? {} : { attack }),
              })
              if (ours !== theirs) wrong++
            }
          }
        }
      }
    }
    expect(wrong).toBe(0)
  })

  it('gives no coin to what a resistance left above nothing, and none against the immune', () => {
    // 1 against a half is 0.5: above nothing, so no coin, and truncated to 0.
    const half = BattleRng.fromGameState(3n)
    expect(dealt(half, 1, { critical: false, resistance: 0.5 })).toBe(0)
    expect(half.drawn).toBe(0)
    const immune = BattleRng.fromGameState(3n)
    expect(dealt(immune, 40, { critical: false, resistance: 0 })).toBe(0)
    expect(immune.drawn).toBe(0)
  })

  it('holds a spell to its cap', () => {
    expect(
      dealt(BattleRng.fromGameState(1n), 1500, { critical: false, resistance: 1.25, cap: 999 }),
    ).toBe(999)
  })
})

describe('the HP a monster comes to a battle with', () => {
  it('is the game’s at every HP a record can hold a slice of, and one draw', () => {
    let wrong = 0
    for (const hp of [1, 4, 8, 13, 134, 999, 6500, 65535]) {
      for (let seed = 1n; seed <= 2000n; seed++) {
        const ours = BattleRng.fromGameState(seed)
        if (monsterHp(ours, hp) !== builtMonsterHp(new GameRandom(seed), hp, false)) wrong++
        if (ours.drawn !== 1) wrong++
      }
    }
    expect(wrong).toBe(0)
  })

  it('is never more than the table’s, and as little as four fifths', () => {
    const seen = new Set<number>()
    for (let seed = 1n; seed <= 4000n; seed++) seen.add(monsterHp(BattleRng.fromGameState(seed), 8))
    // A slime's 8: 6.9 to 8.5, truncated.
    expect([...seen].sort((a, b) => a - b)).toEqual([6, 7, 8])
  })

  it('is the table’s and no draw where the battle says so', () => {
    const rng = BattleRng.fromGameState(1n)
    expect(monsterHp(rng, 300, true)).toBe(300)
    expect(rng.drawn).toBe(0)
  })
})
