import { describe, expect, it } from 'vitest'
import {
  type BattleState,
  type Command,
  DEFAULT_RULES,
  type Fighter,
  playRound,
  type Spell,
  spoils,
  startBattle,
  withHp,
  withMp,
} from '../src/battle/battle.ts'
import { BattleRng } from '../src/battle/rng.ts'

const hero: Fighter = {
  name: 'Hero',
  side: 'party',
  maxHp: 20,
  maxMp: 6,
  attack: 12,
  defence: 8,
  agility: 8,
  shield: false,
  exp: 0,
  gold: 0,
}
const blob = (name: string, hp: number, attack = 10): Fighter => ({
  name,
  side: 'foes',
  maxHp: hp,
  maxMp: 0,
  attack,
  defence: 7,
  agility: 7,
  shield: false,
  exp: 2,
  gold: 4,
})

const attackFirstFoe = new Map<number, Command>([[0, { kind: 'attack', target: 1 }]])

function fight(state: BattleState, seed: bigint, commands = attackFirstFoe, rounds = 50) {
  const rng = new BattleRng(seed)
  let now = state
  const all = []
  for (let r = 0; r < rounds && now.outcome === 'ongoing'; r++) {
    const played = playRound(now, commands, rng)
    now = played.state
    all.push(...played.events)
  }
  return { state: now, events: all }
}

describe('a spell', () => {
  const crack: Spell = {
    action: 12,
    cost: 3,
    does: 'harm',
    reach: 'one',
    amount: { base: 30, spread: 5 },
  }
  const heal: Spell = {
    action: 30,
    cost: 2,
    does: 'heal',
    reach: 'one',
    amount: { base: 35, spread: 5 },
  }
  const cast = (
    state: BattleState,
    spell: Spell,
    target: number,
    seed = 3n,
    rules = DEFAULT_RULES,
  ) => {
    const played = playRound(
      state,
      new Map([[0, { kind: 'spell', spell, target }]]),
      new BattleRng(seed),
      rules,
    )
    const event = played.events.find((e) => e.kind === 'spell')
    if (event?.kind !== 'spell') throw new Error('no spell cast')
    return { state: played.state, event }
  }

  it('spends its MP, and harms the one chosen by its range', () => {
    const { state, event } = cast(
      startBattle([hero, blob('slime', 99), blob('slime', 99)]),
      crack,
      2,
    )
    expect(event.hits.map((hit) => hit.target)).toEqual([2])
    const amount = event.hits[0]?.amount ?? 0
    expect(amount).toBeGreaterThanOrEqual(25)
    expect(amount).toBeLessThan(event.critical ? 70 : 35)
    expect(state.fighters[0]?.mp).toBe(3)
    expect(state.fighters[2]?.hp).toBe(99 - amount)
    expect(state.fighters[1]?.hp).toBe(99)
  })

  it('reaches every one of the chosen one’s kind, or everyone on that side', () => {
    const start = startBattle([hero, blob('slime', 99), blob('slime', 99), blob('drakee', 99)])
    const group = cast(start, { ...crack, reach: 'group' }, 1).event
    expect(group.hits.map((hit) => hit.target)).toEqual([1, 2])
    const all = cast(start, { ...crack, reach: 'all' }, 1).event
    expect(all.hits.map((hit) => hit.target)).toEqual([1, 2, 3])
  })

  it('heals its own side no further than the wounds, and wholly with no range', () => {
    const start = withHp(startBattle([hero, blob('slime', 5, 0)]), new Map([[0, 5]]))
    const healed = cast(start, heal, 1)
    expect(healed.event.hits).toEqual([{ target: 0, amount: 15 }])
    expect(healed.state.fighters[0]?.hp).toBe(20)
    const whole = cast(start, { ...heal, amount: undefined }, 0)
    expect(whole.event.hits).toEqual([{ target: 0, amount: 15 }])
  })

  it('does nothing without the MP for it, and spends none', () => {
    const { state, event } = cast(
      withMp(startBattle([hero, blob('slime', 99)]), new Map([[0, 2]])),
      crack,
      1,
    )
    expect(event).toMatchObject({ short: true, hits: [] })
    expect(state.fighters[0]?.mp).toBe(2)
    expect(state.fighters[1]?.hp).toBe(99)
  })

  it('goes haywire for 1.5 to 2.0 times as much', () => {
    const always = { ...DEFAULT_RULES, magicCritical: 10_000 }
    const { event } = cast(startBattle([hero, blob('slime', 999)]), crack, 1, 3n, always)
    expect(event.critical).toBe(true)
    const amount = event.hits[0]?.amount ?? 0
    expect(amount).toBeGreaterThanOrEqual(Math.trunc(25 * 1.5))
    expect(amount).toBeLessThan(70)
  })
})

describe('a foe', () => {
  const tough = { ...hero, maxHp: 999 }
  const wait = new Map<number, Command>([[0, { kind: 'defend' }]])
  /** All the weight on one way, so that way is the one taken. */
  const only = (way: number) => ({
    ...DEFAULT_RULES,
    choice: [0, 1, 2, 3, 4, 5].map((i) => (i === way ? 256 : 0)),
  })
  const herb: Spell = {
    action: 236,
    cost: 0,
    does: 'heal',
    reach: 'one',
    amount: { base: 35, spread: 5 },
  }
  const frizz: Spell = {
    action: 9,
    cost: 2,
    does: 'harm',
    reach: 'one',
    amount: { base: 9, spread: 2 },
  }

  it('takes the way the draw gives, and flees out of the battle with what it was worth', () => {
    const slime = {
      ...blob('slime', 8),
      acts: [{ kind: 'attack' }, { kind: 'flee' }] as const,
    }
    const { state, events } = playRound(
      startBattle([tough, slime]),
      wait,
      new BattleRng(1n),
      only(1),
    )
    expect(events).toContainEqual({ kind: 'flee', actor: 1, escaped: true })
    expect(state.fighters[1]?.fled).toBe(true)
    expect(state.outcome).toBe('won')
    expect(spoils(state)).toEqual({ exp: 0, gold: 0 })
  })

  it('draws each of its six ways, over enough turns, by the even table', () => {
    const acts = [0, 1, 2, 3, 4, 5].map((i) => ({
      kind: 'spell' as const,
      spell: { ...frizz, action: 100 + i, cost: 0 },
    }))
    const { events } = fight(startBattle([tough, { ...blob('slime', 999), acts }]), 5n, wait, 60)
    const ways = new Set(events.flatMap((e) => (e.kind === 'spell' ? [e.action] : [])))
    expect([...ways].sort()).toEqual([100, 101, 102, 103, 104, 105])
  })

  it('heals its most wounded ally, and attacks when no one is hurt', () => {
    const healer = { ...blob('archer', 20), acts: [{ kind: 'spell', spell: herb }] as const }
    const start = startBattle([tough, healer, blob('slime', 30), blob('slime', 30)])
    const hurt = withHp(
      start,
      new Map([
        [2, 20],
        [3, 5],
      ]),
    )
    const healed = playRound(hurt, wait, new BattleRng(1n), only(0)).events
    expect(healed.find((e) => e.kind === 'spell')).toMatchObject({
      actor: 1,
      hits: [{ target: 3 }],
    })
    const whole = playRound(start, wait, new BattleRng(1n), only(0)).events
    expect(whole.some((e) => e.kind === 'spell')).toBe(false)
    expect(whole.some((e) => e.kind === 'attack' && e.actor === 1)).toBe(true)
  })

  it('casts a harmful spell at the party, spending its MP', () => {
    const mage = { ...blob('mage', 20), maxMp: 4, acts: [{ kind: 'spell', spell: frizz }] as const }
    const { state, events } = playRound(
      startBattle([tough, mage]),
      wait,
      new BattleRng(2n),
      only(0),
    )
    const cast = events.find((e) => e.kind === 'spell')
    expect(cast).toMatchObject({ actor: 1, short: false, hits: [{ target: 0 }] })
    expect(state.fighters[1]?.mp).toBe(2)
  })
})

describe('a battle', () => {
  it('is the same battle from the same seed', () => {
    const start = startBattle([hero, blob('slime', 8), blob('slime', 8)])
    expect(fight(start, 7n)).toEqual(fight(start, 7n))
    expect(fight(start, 7n).events).not.toEqual(fight(start, 8n).events)
  })

  it('is won when every foe is down, and pays out their experience and gold', () => {
    const { state, events } = fight(startBattle([hero, blob('slime', 8), blob('slime', 8)]), 3n)
    expect(state.outcome).toBe('won')
    expect(state.fighters.filter((f) => f.side === 'foes').every((f) => f.hp === 0)).toBe(true)
    expect(events.filter((e) => e.kind === 'defeated')).toHaveLength(2)
    expect(spoils(state)).toEqual({ exp: 4, gold: 8 })
  })

  it('is lost when the party is down', () => {
    const giant = { ...blob('giant', 999, 80), agility: 50 }
    const { state } = fight(startBattle([hero, giant]), 11n)
    expect(state.outcome).toBe('lost')
    expect(state.fighters[0]?.hp).toBe(0)
  })

  it('lets a defending hero take half, and never a critical from a foe', () => {
    const strong = { ...blob('ogre', 999, 40), agility: 1 }
    const defend = new Map<number, Command>([[0, { kind: 'defend' }]])
    const rng = new BattleRng(5n)
    const guarded = playRound(startBattle([hero, strong]), defend, rng)
    const open = playRound(startBattle([hero, strong]), attackFirstFoe, new BattleRng(5n))
    const hitOf = (events: typeof guarded.events) =>
      events.find((e) => e.kind === 'attack' && e.target === 0)
    const guardedHit = hitOf(guarded.events)
    const openHit = hitOf(open.events)
    expect(guarded.events[0]).toEqual({ kind: 'defend', actor: 0 })
    if (guardedHit?.kind === 'attack' && openHit?.kind === 'attack' && !guardedHit.dodged) {
      expect(guardedHit.critical).toBe(false)
      expect(guardedHit.damage).toBeLessThan(openHit.damage + 2)
    }
    expect(guarded.state.fighters[0]?.defending).toBe(false)
  })

  it('flees only when fleeing is allowed', () => {
    const flee = new Map<number, Command>([[0, { kind: 'flee' }]])
    const free = fight(startBattle([hero, blob('slime', 999, 1)]), 1n, flee)
    expect(free.state.outcome).toBe('fled')
    const boss = fight(startBattle([hero, blob('boss', 999, 1)], false), 1n, flee, 10)
    expect(boss.state.outcome).toBe('ongoing')
    expect(
      boss.events.filter((e) => e.kind === 'flee').every((e) => e.kind === 'flee' && !e.escaped),
    ).toBe(true)
  })

  it('turns an attack on a fallen foe to the next one standing', () => {
    const start = withHp(startBattle([hero, blob('slime', 8), blob('slime', 8)]), new Map([[1, 0]]))
    const { events } = playRound(start, attackFirstFoe, new BattleRng(2n))
    const blow = events.find((e) => e.kind === 'attack' && e.actor === 0)
    expect(blow?.kind === 'attack' && blow.target).toBe(2)
  })

  it('heals with an item on the user’s turn, by a draw, and no more than the wounds', () => {
    const herb = new Map<number, Command>([
      [0, { kind: 'item', item: 0x55f0, heal: { base: 35, spread: 5 } }],
    ])
    const hurt = withHp(
      startBattle([{ ...hero, maxHp: 100 }, blob('slime', 8, 1)]),
      new Map([[0, 10]]),
    )
    const { state, events } = playRound(hurt, herb, new BattleRng(1n))
    const used = events.find((e) => e.kind === 'item')
    expect(used).toMatchObject({ kind: 'item', actor: 0, target: 0, item: 0x55f0 })
    const healed = used?.kind === 'item' ? (used.healed ?? 0) : 0
    expect(healed).toBeGreaterThanOrEqual(30)
    expect(healed).toBeLessThanOrEqual(40)
    // The slime's blow comes after or before; the heal is all there either way.
    const hit = events.find((e) => e.kind === 'attack')
    const damage = hit?.kind === 'attack' ? hit.damage : 0
    expect(state.fighters[0]?.hp).toBe(10 + healed - damage)

    const nearlyWell = withHp(startBattle([hero, blob('slime', 8, 1)]), new Map([[0, 18]]))
    const topped = playRound(nearlyWell, herb, new BattleRng(1n)).events.find(
      (e) => e.kind === 'item',
    )
    expect(topped?.kind === 'item' && topped.healed).toBe(2)
  })

  it('says an item with no heal did nothing', () => {
    const wing = new Map<number, Command>([[0, { kind: 'item', item: 0x55fb }]])
    const { events } = playRound(startBattle([hero, blob('slime', 8, 1)]), wing, new BattleRng(1n))
    expect(events.find((e) => e.kind === 'item')).toMatchObject({ healed: undefined })
  })

  it('uses the default rules unless told otherwise', () => {
    expect(DEFAULT_RULES).toEqual({
      critical: 200,
      dodge: 2,
      flee: 50,
      magicCritical: 100,
      choice: [43, 42, 43, 43, 42, 43],
    })
  })
})
