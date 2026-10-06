import { describe, expect, it } from 'vitest'
import {
  type BattleEvent,
  type BattleState,
  type Blow,
  type Command,
  type Fighter,
  playRound,
  startBattle,
} from '../src/battle/battle.ts'
import { BattleRng } from '../src/battle/rng.ts'
import type { States } from '../src/battle/states.ts'

/**
 * **A blow rousing its target** — `func_ov000_02157288`, called by the
 * resolver after each pass that dealt something (`0x021ecca8`), for an action
 * with `+0x10` bit 11: a draw `R(100)` always, and woken under 100 for one of
 * the party asleep and 50 for a monster, or brought to their senses under 50
 * and 25 where confused. Read 7 October 2026; see
 * `docs/readings/T18-handlers.md` §15.
 */

const hero = (over: Partial<Fighter> = {}): Fighter => ({
  name: 'Hero',
  side: 'party',
  maxHp: 300,
  maxMp: 50,
  attack: 200,
  defence: 40,
  agility: 255,
  shield: false,
  exp: 0,
  gold: 0,
  level: 30,
  ...over,
})
const slime = (over: Partial<Fighter> = {}): Fighter => ({
  name: 'slime',
  side: 'foes',
  maxHp: 9999,
  maxMp: 0,
  attack: 1,
  defence: 5,
  agility: 0,
  shield: false,
  exp: 1,
  gold: 1,
  ...over,
})
const blow = (over: Partial<Blow> = {}): Blow => ({
  action: 0x3f,
  handler: 0,
  reach: 'one',
  hits: 0,
  criticalPercent: 0,
  element: 8,
  falloff: false,
  evadable: false,
  blockable: false,
  defendable: true,
  tensed: false,
  combos: false,
  after: 0,
  rouses: true,
  ...over,
})
const holding = (state: BattleState, who: number, patch: Partial<States>): BattleState => ({
  ...state,
  fighters: state.fighters.map((f, i) =>
    i === who ? { ...f, states: { ...f.states, ...patch } } : f,
  ),
})
/** Seeds spread over the generator's range — small ones start alike. */
const seedOf = (n: number) => (BigInt(n) * 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn
const rousedOf = (events: readonly BattleEvent[], actor: number) =>
  events.find((e) => e.kind === 'roused' && e.actor === actor)
const attack = new Map<number, Command>([[0, { kind: 'attack', target: 1 }]])
/** How often, over 400 seeds, the Hero's Attack rouses the slime held so. */
const rate = (patch: Partial<States>) => {
  let roused = 0
  for (let n = 0; n < 400; n++) {
    const start = holding(startBattle([hero(), slime()]), 1, patch)
    if (rousedOf(playRound(start, attack, new BattleRng(seedOf(n))).events, 1)) roused++
  }
  return roused / 400
}

describe('a blow rousing its target', () => {
  it('draws for every pass that dealt something, whoever its target — none for an action without the bit', () => {
    // Paralysed, the slime neither acts nor can be roused: the draw alone differs.
    const drawn = (rouses: boolean) => {
      const rng = new BattleRng(seedOf(5))
      const start = holding(startBattle([hero(), slime()]), 1, {
        paralysed: { level: 1, turns: 3 },
      })
      const { events } = playRound(
        start,
        new Map([[0, { kind: 'blow', blow: blow({ rouses }), target: 1 }]]),
        rng,
      )
      expect(rousedOf(events, 1)).toBeUndefined()
      return rng.drawn
    }
    expect(drawn(true) - drawn(false)).toBe(1)
  })

  it('wakes a monster half the time, by the blow, before its own turn', () => {
    const r = rate({ sleep: 0 })
    expect(r).toBeGreaterThan(0.42)
    expect(r).toBeLessThan(0.58)
  })

  it('wakes one of the party every time', () => {
    for (let n = 0; n < 40; n++) {
      // The slime first, at a member asleep who cannot dodge it.
      const start = holding(
        startBattle([hero({ agility: 0, defence: 0 }), slime({ agility: 255, attack: 80 })]),
        0,
        { sleep: 0 },
      )
      const { events, state } = playRound(start, new Map(), new BattleRng(seedOf(n)))
      const struck = events.find((e) => e.kind === 'attack' && e.target === 0)
      expect(struck?.kind === 'attack' && struck.damage).toBeGreaterThan(0)
      expect(rousedOf(events, 0)).toEqual({ kind: 'roused', actor: 0 })
      expect(state.fighters[0]?.states.sleep).toBeUndefined()
      // Told after the blow that roused them.
      expect(events.indexOf(rousedOf(events, 0) as BattleEvent)).toBeGreaterThan(
        events.indexOf(struck as BattleEvent),
      )
    }
  })

  it('brings a monster confused to its senses a quarter of the time, clearing it', () => {
    const r = rate({ confused: { level: 1, turns: 3 } })
    expect(r).toBeGreaterThan(0.17)
    expect(r).toBeLessThan(0.33)
    for (let n = 0; n < 40; n++) {
      const start = holding(startBattle([hero(), slime()]), 1, { confused: { level: 1, turns: 3 } })
      const { events } = playRound(start, attack, new BattleRng(seedOf(n)))
      const told = rousedOf(events, 1)
      if (told) expect(told).toEqual({ kind: 'roused', actor: 1, senses: true })
    }
  })

  it('takes sleep and confusion both, at the sleeper’s chance, told as coming to their senses', () => {
    const r = rate({ sleep: 0, confused: { level: 1, turns: 3 } })
    expect(r).toBeGreaterThan(0.42)
    expect(r).toBeLessThan(0.58)
    const start = holding(startBattle([hero(), slime()]), 1, {
      sleep: 0,
      confused: { level: 1, turns: 3 },
    })
    for (let n = 0; ; n++) {
      const { events, state } = playRound(start, attack, new BattleRng(seedOf(n)))
      if (!rousedOf(events, 1)) continue
      expect(rousedOf(events, 1)).toEqual({ kind: 'roused', actor: 1, senses: true })
      expect(state.fighters[1]?.states.sleep).toBeUndefined()
      expect(state.fighters[1]?.states.confused).toBeUndefined()
      break
    }
  })

  it('never wakes a sleeper by a spell, which carries no bit 11', () => {
    const frizz = {
      action: 9,
      cost: 0,
      does: 'harm' as const,
      reach: 'one' as const,
      amount: { base: 40, spread: 0 },
      kind: 1,
      magic: true,
    }
    for (let n = 0; n < 40; n++) {
      const start = holding(startBattle([hero(), slime()]), 1, { sleep: 0 })
      const { events } = playRound(
        start,
        new Map<number, Command>([[0, { kind: 'spell', spell: frizz, target: 1 }]]),
        new BattleRng(seedOf(n)),
      )
      expect(rousedOf(events, 1)).toBeUndefined()
    }
  })

  it('makes no draw on the pass whose own rider put its target to sleep', () => {
    const sleepy = (rouses: boolean) =>
      blow({ rouses, rider: { slot: 7, chance: { party: 100, foe: 100 }, levels: 0 } })
    const drawn = (rouses: boolean) => {
      const rng = new BattleRng(seedOf(9))
      const { events } = playRound(
        startBattle([hero(), slime()]),
        new Map([[0, { kind: 'blow', blow: sleepy(rouses), target: 1 }]]),
        rng,
      )
      const told = events.find((e) => e.kind === 'blow')
      expect(told?.kind === 'blow' && told.hits[0]?.rode).toMatchObject({ result: 'asleep' })
      return rng.drawn
    }
    expect(drawn(true)).toBe(drawn(false))
  })
})

describe('Soothe Sayer — kind 53 and its rider 9', () => {
  const soothe = {
    action: 198,
    cost: 0,
    change: { kind: 'soothe', chance: 100 },
    reach: 'one',
    side: 'other',
  } as const
  const play = (patch: Partial<States>) => {
    const start = holding(startBattle([hero(), slime()]), 1, patch)
    return playRound(
      start,
      new Map<number, Command>([[0, { kind: 'change', changing: soothe, target: 1 }]]),
      new BattleRng(seedOf(2)),
    )
  }
  const hitOf = (events: readonly BattleEvent[]) => {
    const told = events.find((e) => e.kind === 'change')
    return told?.kind === 'change' ? told.hits[0] : undefined
  }

  it('takes a step of tension off, and says the level it came to', () => {
    // Asleep, so that it spends none of what is left on a blow of its own.
    const { events, state } = play({ tension: 3, sleep: 0 })
    expect(hitOf(events)).toMatchObject({ target: 1, result: 'soothed', tension: 2 })
    expect(state.fighters[1]?.states.tension).toBe(2)
  })

  it('ends a watch — the rage subsides', () => {
    const { events, state } = play({ watched: { by: 0, turns: 3 } })
    expect(hitOf(events)).toEqual({ target: 1, result: 'soothed', calmed: true })
    expect(state.fighters[1]?.states.watched).toBeUndefined()
  })

  it('says its fail line on one with neither', () => {
    expect(hitOf(play({}).events)).toMatchObject({ target: 1, result: 'resisted' })
  })
})

describe('Morale Masher — rider 14', () => {
  const masher = blow({
    action: 0xa6,
    rider: { slot: 14, chance: { party: 0, foe: 0 }, levels: 0 },
  })
  it('ends a watch, then takes a step of tension off, with no draw, on a pass that dealt something', () => {
    const start = holding(startBattle([hero(), slime()]), 1, {
      watched: { by: 0, turns: 3 },
      tension: 2,
      // Paralysed, so that it spends none of what is left on a blow of its own.
      paralysed: { level: 1, turns: 3 },
    })
    const rng = new BattleRng(seedOf(6))
    const { events, state } = playRound(
      start,
      new Map([[0, { kind: 'blow', blow: masher, target: 1 }]]),
      rng,
    )
    const told = events.find((e) => e.kind === 'blow')
    expect(told?.kind === 'blow' && told.hits[0]?.rode).toEqual({
      target: 1,
      result: 'mashed',
      tension: 1,
      calmed: true,
    })
    expect(state.fighters[1]?.states.watched).toBeUndefined()
    expect(state.fighters[1]?.states.tension).toBe(1)
  })
})

describe('rider 9 on a blow — the monsters’ attack 232', () => {
  const calming = blow({
    action: 232,
    rider: { slot: 9, chance: { party: 0, foe: 100 }, levels: -1 },
  })
  it('takes a step of tension off, with no draw, and ends no watch', () => {
    const start = holding(startBattle([hero(), slime()]), 1, {
      watched: { by: 0, turns: 3 },
      tension: 2,
      paralysed: { level: 1, turns: 3 },
    })
    const { events, state } = playRound(
      start,
      new Map([[0, { kind: 'blow', blow: calming, target: 1 }]]),
      new BattleRng(seedOf(6)),
    )
    const told = events.find((e) => e.kind === 'blow')
    expect(told?.kind === 'blow' && told.hits[0]?.rode).toEqual({
      target: 1,
      result: 'mashed',
      tension: 1,
    })
    expect(state.fighters[1]?.states.watched).toBeDefined()
    expect(state.fighters[1]?.states.tension).toBe(1)
  })
  it('rides on nothing for one with no tension', () => {
    const start = holding(startBattle([hero(), slime()]), 1, { paralysed: { level: 1, turns: 3 } })
    const { events } = playRound(
      start,
      new Map([[0, { kind: 'blow', blow: calming, target: 1 }]]),
      new BattleRng(seedOf(6)),
    )
    const told = events.find((e) => e.kind === 'blow')
    expect(told?.kind === 'blow' && told.hits[0]?.rode).toBeUndefined()
  })
})

describe('Rake ’n’ Break’s rider 12 and Conjury Conductor’s rider 13', () => {
  it('12: clears what is magical on the one struck, and their tension, with no draw', () => {
    const rake = blow({
      action: 0x7b,
      rider: { slot: 12, chance: { party: 0, foe: 0 }, levels: 0 },
    })
    const start = holding(startBattle([hero(), slime()]), 1, {
      attack: { level: 2, turns: 5 },
      tension: 1,
      paralysed: { level: 1, turns: 3 },
    })
    const { events, state } = playRound(
      start,
      new Map([[0, { kind: 'blow', blow: rake, target: 1 }]]),
      new BattleRng(seedOf(6)),
    )
    const told = events.find((e) => e.kind === 'blow')
    expect(told?.kind === 'blow' && told.hits[0]?.rode).toEqual({
      target: 1,
      result: 'dispelled',
      calmed: true,
    })
    expect(state.fighters[1]?.states.attack?.level ?? 0).toBe(0)
    expect(state.fighters[1]?.states.tension ?? 0).toBe(0)
    // Paralysis is not magical: it stays.
    expect(state.fighters[1]?.states.paralysed).toBeDefined()
  })

  it('13: lowers the resistance to spells under the target’s byte, its draw first', () => {
    const conjury = blow({
      action: 0x7c,
      rider: { slot: 13, chance: { party: 0, foe: 0 }, levels: -1 },
    })
    const start = holding(
      startBattle([hero(), slime({ resist: Array.from({ length: 21 }, () => 100) })]),
      1,
      {
        paralysed: { level: 1, turns: 3 },
      },
    )
    const { events, state } = playRound(
      start,
      new Map([[0, { kind: 'blow', blow: conjury, target: 1 }]]),
      new BattleRng(seedOf(6)),
    )
    const told = events.find((e) => e.kind === 'blow')
    expect(told?.kind === 'blow' && told.hits[0]?.rode).toEqual({
      target: 1,
      result: 'lowered',
      level: -1,
      stat: 'spells',
    })
    expect(state.fighters[1]?.states.spells?.level).toBe(-1)
    // A byte of 0 refuses it.
    const immune = holding(
      startBattle([
        hero(),
        slime({ resist: Array.from({ length: 21 }, (_, i) => (i === 20 ? 0 : 100)) }),
      ]),
      1,
      {
        paralysed: { level: 1, turns: 3 },
      },
    )
    const none = playRound(
      immune,
      new Map([[0, { kind: 'blow', blow: conjury, target: 1 }]]),
      new BattleRng(seedOf(6)),
    )
    const blowed = none.events.find((e) => e.kind === 'blow')
    expect(blowed?.kind === 'blow' && blowed.hits[0]?.rode).toBeUndefined()
  })
})
