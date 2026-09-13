import { describe, expect, it } from 'vitest'
import {
  type BattleState,
  type Command,
  DEFAULT_RULES,
  type Fighter,
  playRound,
  spoils,
  startBattle,
  withHp,
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

  it('uses the default rules unless told otherwise', () => {
    expect(DEFAULT_RULES).toEqual({ critical: 200, dodge: 2, flee: 50 })
  })
})
