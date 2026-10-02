import { describe, expect, it } from 'vitest'
import {
  type BattleEvent,
  type BattleState,
  type Command,
  type Fighter,
  playRound,
  startBattle,
} from '../src/battle/battle.ts'
import { dealt } from '../src/battle/damage.ts'
import { BattleRng } from '../src/battle/rng.ts'
import { psychedUp, TENSION_MULTIPLIERS, tensed } from '../src/battle/tension.ts'
import { calculateTensionBonus, GameRandom, tensionMultiplier } from './game-oracle.ts'

const hero: Fighter = {
  name: 'Hero',
  side: 'party',
  maxHp: 200,
  maxMp: 6,
  attack: 40,
  defence: 8,
  agility: 1,
  shield: false,
  exp: 0,
  gold: 0,
  level: 25,
}
const psyching: Fighter = {
  name: 'ram',
  side: 'foes',
  maxHp: 500,
  maxMp: 0,
  attack: 30,
  defence: 7,
  agility: 200,
  shield: false,
  exp: 2,
  gold: 4,
  acts: [{ kind: 'psyche', action: 161, steps: 1 }],
  choice: [256],
}

const tensionOf = (state: BattleState, i: number) => state.fighters[i]?.states.tension ?? 0
const withTension = (state: BattleState, i: number, tension: number): BattleState => ({
  ...state,
  fighters: state.fighters.map((f, k) =>
    k === i ? { ...f, states: { ...f.states, tension } } : f,
  ),
})
const attack = new Map<number, Command>([[0, { kind: 'attack', target: 1 }]])

describe('tension, held to the game', () => {
  it('multiplies and adds as the game’s oracle does, the dealer’s side apart', () => {
    for (const side of ['party', 'foes'] as const) {
      for (let level = 0; level <= 4; level++) {
        for (const dealer of [1, 9, 10, 25, 99]) {
          for (const base of [0, 1, 7, 33, 250]) {
            const m = tensionMultiplier(level, side === 'foes')
            const expected =
              level === 0
                ? Math.fround(base)
                : Math.fround(Math.fround(base * m) + calculateTensionBonus(level, dealer))
            expect(tensed(base, level, side, dealer)).toBe(expected)
          }
        }
      }
    }
    expect(TENSION_MULTIPLIERS.foes[1]).toBe(Math.fround(1.3))
  })

  it('rises a step with no draw below 3, and from 3 on the battle’s coin', () => {
    const rng = BattleRng.fromGameState(1n)
    const oracle = new GameRandom(1n)
    expect(psychedUp(0, rng)).toBe(1)
    expect(psychedUp(2, rng)).toBe(3)
    expect(rng.drawn).toBe(0)
    for (let i = 0; i < 20; i++) {
      const coin = oracle.max(2)
      expect(psychedUp(3, rng)).toBe(coin === 0 ? 4 : -1)
    }
  })

  it('at the head of the damage, before the critical: the Attack’s floor is the damage as it came', () => {
    const plain = dealt(new BattleRng(5n), 10, { critical: false, resistance: 1 })
    const tense = dealt(new BattleRng(5n), 10, {
      critical: false,
      resistance: 1,
      tension: { level: 2, side: 'party', dealer: 25 },
    })
    expect(plain).toBe(10)
    // 10 × 2.5 + (1 + 2) × 2.
    expect(tense).toBe(31)
    // A target at the maximum takes half a blow, after the coin.
    expect(dealt(new BattleRng(5n), 10, { critical: false, resistance: 1, halved: true })).toBe(5)
  })
})

describe('Psyche Up in a battle', () => {
  const start = () => startBattle([hero, psyching])

  it('raises the monster a level a turn, and nothing happens at the maximum', () => {
    let state = start()
    const rng = new BattleRng(9n)
    const levels: number[] = []
    const said: BattleEvent[] = []
    for (let r = 0; r < 40 && tensionOf(state, 1) < 4; r++) {
      const played = playRound(state, new Map([[0, { kind: 'defend' }]]), rng)
      state = played.state
      said.push(...played.events.filter((e) => e.kind === 'psyche'))
      levels.push(tensionOf(state, 1))
    }
    expect(levels.slice(0, 3)).toEqual([1, 2, 3])
    expect(levels.at(-1)).toBe(4)
    // At the maximum, one more: nothing happens.
    const more = playRound(state, new Map([[0, { kind: 'defend' }]]), rng)
    said.push(...more.events.filter((e) => e.kind === 'psyche'))
    const last = said.at(-1)
    expect(last?.kind === 'psyche' && last.steps).toEqual([])
  })

  it('goes straight to its level with 0x151, each level told and no draw', () => {
    const outright: Fighter = {
      ...psyching,
      acts: [{ kind: 'psyche', action: 0x151, steps: 3, outright: true }],
    }
    const state = startBattle([hero, outright])
    const { state: after, events } = playRound(
      state,
      new Map([[0, { kind: 'defend' }]]),
      new BattleRng(3n),
    )
    const psyche = events.find((e) => e.kind === 'psyche')
    expect(psyche?.kind === 'psyche' && psyche.steps).toEqual([1, 2, 3])
    expect(tensionOf(after, 1)).toBe(3)
  })

  it('is spent by the next blow, whatever it comes to, and told', () => {
    const state = withTension(start(), 0, 3)
    const { state: after, events } = playRound(state, attack, new BattleRng(2n))
    expect(tensionOf(after, 0)).toBe(0)
    expect(events.some((e) => e.kind === 'calmed' && e.actor === 0 && !e.most)).toBe(true)
  })

  it('is not spent by Defend', () => {
    const state = withTension(start(), 0, 2)
    const { state: after } = playRound(state, new Map([[0, { kind: 'defend' }]]), new BattleRng(2n))
    expect(tensionOf(after, 0)).toBe(2)
  })

  it('makes the blow bigger, by the same draws', () => {
    const calm = playRound(start(), attack, new BattleRng(4n)).events
    const tense = playRound(withTension(start(), 0, 4), attack, new BattleRng(4n)).events
    const hit = (events: BattleEvent[]) => events.find((e) => e.kind === 'attack' && e.actor === 0)
    const a = hit(calm)
    const b = hit(tense)
    if (a?.kind !== 'attack' || b?.kind !== 'attack') throw new Error('no blow')
    expect(b.damage).toBeGreaterThan(a.damage * 5)
  })
})
