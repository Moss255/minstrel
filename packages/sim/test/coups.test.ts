import { describe, expect, it } from 'vitest'
import {
  type BattleEvent,
  type Changing,
  type Command,
  type Fighter,
  playRound,
  spoils,
  startBattle,
} from '../src/battle/battle.ts'
import { DropRng, dropsWon } from '../src/battle/drops.ts'
import { experienceMultiplier, replenishedMp } from '../src/battle/handlers.ts'
import { BattleRng } from '../src/battle/rng.ts'
import { GameRandom, spellyBreath, voiceOfExperience } from './game-oracle.ts'

/**
 * The coups of task 18 — `docs/readings/T18-handlers.md` §10: 0 Zone, Rough
 * 'n' Tumble, Brownie Boost, Spelly Breath, Itemised Kill and Voice of
 * Experience, each by its kind's handler.
 */

const hero: Fighter = {
  name: 'Hero',
  side: 'party',
  maxHp: 100,
  maxMp: 80,
  attack: 60,
  defence: 10,
  agility: 255,
  shield: false,
  exp: 0,
  gold: 0,
  level: 40,
}
const foe: Fighter = {
  name: 'slime',
  side: 'foes',
  maxHp: 999,
  maxMp: 0,
  attack: 1,
  defence: 5,
  agility: 0,
  shield: false,
  exp: 7,
  gold: 3,
  kind: 1,
  drops: [
    { item: 10, step: 3 },
    { item: 11, step: 6 },
  ],
}
const coup = (action: number, kind: Changing['change']['kind'], over: Partial<Changing> = {}) =>
  ({
    action,
    cost: 0,
    change: { kind, chance: 100 } as Changing['change'],
    reach: 'one',
    side: 'own',
    ...over,
  }) as Changing
const changeOf = (events: readonly BattleEvent[]) => {
  const e = events.find((x) => x.kind === 'change')
  if (e?.kind !== 'change') throw new Error('no change')
  return e
}
const using = (changing: Changing, target = 0) =>
  new Map<number, Command>([[0, { kind: 'change', changing, target }]])

describe('0 Zone — kind 68', () => {
  it('sets its count of 5, and asks no MP of its holder while it holds', () => {
    const zero = coup(507, 'zeroZone')
    const once = playRound(startBattle([hero, foe]), using(zero), new BattleRng(3n))
    expect(changeOf(once.events).hits).toEqual([{ target: 0, result: 'zeroZoned' }])
    // Its count, less the pass after the Hero's own action (`021599f4`).
    expect(once.state.fighters[0]?.states.zeroZone).toEqual({ level: 1, turns: 4 })
    // A spell that costs more than there is goes ahead, and nothing is spent.
    const dry = {
      ...once.state,
      fighters: once.state.fighters.map((f, i) => (i === 0 ? { ...f, mp: 0 } : f)),
    }
    const frizz = {
      action: 13,
      cost: 2,
      does: 'harm' as const,
      reach: 'one' as const,
      amount: { base: 10, spread: 0 },
      kind: 1,
      magic: true,
    }
    const cast = playRound(
      dry,
      new Map<number, Command>([[0, { kind: 'spell', spell: frizz, target: 1 }]]),
      new BattleRng(3n),
    )
    const spell = cast.events.find((e) => e.kind === 'spell')
    expect(spell).toMatchObject({ short: false })
    expect(cast.state.fighters[0]?.mp).toBe(0)
  })

  it('goes on the pass after its count runs out, its second count starting at 1', () => {
    const zero = coup(507, 'zeroZone')
    let state = playRound(startBattle([hero, foe]), using(zero), new BattleRng(3n)).state
    const wait = new Map<number, Command>([[0, { kind: 'defend' }]])
    const rng = new BattleRng(5n)
    const worn: number[] = []
    for (let round = 1; round <= 6; round++) {
      const played = playRound(state, wait, rng)
      state = played.state
      if (played.events.some((e) => e.kind === 'wornOff' && e.stat === 'zeroZone')) worn.push(round)
    }
    // Set in round 0 with 5; the Hero's passes take it to 0 by round 4, and
    // round 5's pass wears it off for sure.
    expect(worn).toEqual([5])
    expect(state.fighters[0]?.states.zeroZone).toEqual({ level: 0, turns: 0 })
  })
})

describe('Rough ’n’ Tumble — kind 70', () => {
  it('lets the pass’s die alone decide a dodge, under 50', () => {
    const tumble = coup(510, 'tumble')
    const set = playRound(startBattle([hero, foe]), using(tumble), new BattleRng(3n))
    expect(changeOf(set.events).hits).toEqual([{ target: 0, result: 'tumbling' }])
    // Many fights: the slime's Attacks on a tumbling Hero are dodged about
    // half the time, where the Hero dodges 2 in 100 otherwise.
    const swing = { ...foe, attack: 200 }
    const tumbling = {
      ...startBattle([hero, swing]),
      fighters: startBattle([hero, swing]).fighters.map((f, i) =>
        i === 0 ? { ...f, states: { ...f.states, tumble: { level: 1, turns: 99 } } } : f,
      ),
    }
    const wait = new Map<number, Command>([[0, { kind: 'defend' }]])
    let dodged = 0
    let swings = 0
    for (let seed = 1n; seed <= 400n; seed++) {
      const { events } = playRound(tumbling, wait, new BattleRng(seed))
      for (const e of events)
        if (e.kind === 'attack' && e.actor === 1) {
          swings++
          if (e.dodged) dodged++
        }
    }
    expect(swings).toBe(400)
    expect(dodged / swings).toBeGreaterThan(0.4)
    expect(dodged / swings).toBeLessThan(0.6)
  })
})

describe('Brownie Boost — kind 74', () => {
  it('raises defence, breaths and attack a level each, with no test of its landing', () => {
    const boost = coup(516, 'boost')
    const { state, events } = playRound(startBattle([hero, foe]), using(boost), new BattleRng(3n))
    expect(changeOf(events).hits).toEqual([
      {
        target: 0,
        result: 'boosted',
        boosts: [
          { stat: 'defence', level: 1 },
          { stat: 'breaths', level: 1 },
          { stat: 'attack', level: 1 },
        ],
      },
    ])
    expect(state.fighters[0]?.states.attack?.level).toBe(1)
  })

  it('passes over a level already at 2, and says its fail line with none moved', () => {
    const top = { level: 2, turns: 6 }
    const start = startBattle([hero, foe])
    const topped = {
      ...start,
      fighters: start.fighters.map((f, i) =>
        i === 0 ? { ...f, states: { ...f.states, defence: top, breaths: top, attack: top } } : f,
      ),
    }
    const { events } = playRound(topped, using(coup(516, 'boost')), new BattleRng(3n))
    expect(changeOf(events).hits).toEqual([{ target: 0, result: 'resisted' }])
  })
})

describe('Spelly Breath — kind 26, damage handler 48', () => {
  it('is the oracle: the most MP times a draw between 0.2 and 0.5', () => {
    for (let seed = 1n; seed < 200n; seed++) {
      const state = seed * 0x9e3779b97f4a7c15n
      // The oracle steps before it draws: seed ours a step on — see `fromGameState`.
      const ours = BattleRng.fromGameState(state)
      expect(replenishedMp(999, ours.floatBetween(0.2, 0.5))).toBe(
        spellyBreath(999, new GameRandom(state)),
      )
    }
  })

  it('gives MP back as far as it goes, and fails on one already full', () => {
    const breath = coup(514, 'replenish')
    const start = startBattle([hero, foe])
    const spent = {
      ...start,
      fighters: start.fighters.map((f, i) => (i === 0 ? { ...f, mp: 0 } : f)),
    }
    const { state, events } = playRound(spent, using(breath), new BattleRng(3n))
    const [hit] = changeOf(events).hits
    expect(hit?.result).toBe('replenished')
    expect(hit?.mp).toBeGreaterThanOrEqual(16)
    expect(hit?.mp).toBeLessThanOrEqual(40)
    expect(state.fighters[0]?.mp).toBe(hit?.mp)
    const full = playRound(start, using(breath), new BattleRng(3n))
    expect(changeOf(full.events).hits).toEqual([{ target: 0, result: 'resisted' }])
  })
})

describe('Itemised Kill — kind 69', () => {
  it('marks the group’s ordinary drop sure, once', () => {
    const kill = coup(509, 'loot', { side: 'other', reach: 'group' })
    const { state, events } = playRound(
      startBattle([hero, foe, foe]),
      using(kill, 1),
      new BattleRng(3n),
    )
    expect(changeOf(events).hits).toEqual([{ target: 1, result: 'looted' }])
    expect(state.sureLoot).toEqual([1])
    const again = playRound(state, using(kill, 1), new BattleRng(3n))
    expect(changeOf(again.events).hits).toEqual([{ target: 1, result: 'resisted' }])
  })

  it('fails on a kind whose ordinary drop is of step 7, which never drops', () => {
    const none = { ...foe, drops: [{ item: 0, step: 7 }, foe.drops?.[1]] as Fighter['drops'] }
    const { events } = playRound(
      startBattle([hero, none]),
      using(coup(509, 'loot', { side: 'other' }), 1),
      new BattleRng(3n),
    )
    expect(changeOf(events).hits).toEqual([{ target: 1, result: 'resisted' }])
  })

  it('makes the drop roll one in 1 in the first pass, the rare rolled first as ever', () => {
    const beaten = {
      ...startBattle([hero, foe]),
      sureLoot: [1],
    }
    const won = { ...beaten, fighters: beaten.fighters.map((f) => ({ ...f, hp: 0 })) }
    let ordinary = 0
    for (let seed = 1; seed <= 100; seed++) {
      const got = dropsWon(won, new DropRng(seed))
      expect(got).toHaveLength(1)
      if (!got[0]?.rare) ordinary++
    }
    // The rare (one in 128) lands now and then; the ordinary every other time.
    expect(ordinary).toBeGreaterThan(90)
  })
})

describe('Voice of Experience — kind 72', () => {
  it('is the oracle’s multiplier at every level', () => {
    for (let level = 1; level <= 99; level++) {
      for (let seed = 1n; seed < 20n; seed++) {
        const state = seed * 0x9e3779b97f4a7c15n
        const ours = experienceMultiplier(level, BattleRng.fromGameState(state))
        expect(ours).toBe(voiceOfExperience(level, new GameRandom(state)))
      }
    }
  })

  it('draws between 1.1 and 1 + (level + 11) ÷ 100, at most 2.0, in tenths', () => {
    const seen = new Set<number>()
    // A seed's first draw is its own top half: spread them over it.
    const spread = (seed: bigint) => new BattleRng(seed * 0x9e3779b97f4a7c15n)
    for (let seed = 1n; seed < 400n; seed++) seen.add(experienceMultiplier(40, spread(seed)))
    expect([...seen].sort()).toEqual([1.1, 1.2, 1.3, 1.4, 1.5].map(Math.fround))
    for (let seed = 1n; seed < 50n; seed++)
      expect(experienceMultiplier(99, spread(seed))).toBeLessThanOrEqual(2)
  })

  it('multiplies the battle’s experience at the victory, as a float truncated', () => {
    const voice = coup(512, 'experience', { reach: 'all' })
    const { state, events } = playRound(startBattle([hero, foe]), using(voice), new BattleRng(3n))
    const [hit] = changeOf(events).hits
    expect(hit?.result).toBe('experienced')
    expect(state.expMultiplier).toBe(hit?.multiplier)
    const won = {
      ...state,
      fighters: state.fighters.map((f, i) => (i === 1 ? { ...f, hp: 0 } : f)),
    }
    const m = state.expMultiplier as number
    expect(spoils(won).exp).toBe(Math.trunc(Math.fround(Math.fround(7) * m)))
    expect(spoils(won).gold).toBe(3)
  })
})
