import { describe, expect, it } from 'vitest'
import {
  type Changing,
  type Command,
  type Fighter,
  playRound,
  startBattle,
} from '../src/battle/battle.ts'
import { BattleRng } from '../src/battle/rng.ts'
import { BURN_CHANCE, LEVEL_COUNTS, WEAR_OF, WEAR_TABLE_SLOW } from '../src/battle/states.ts'

/**
 * **Feel the Burn** — kind 47, `func_ov024_021e00c0`; the resolver's mark
 * (`0x021eca94`–`0x021ecac0`) and `func_ov000_0215b5a0` after the action —
 * `docs/readings/T18-handlers.md` §17.
 */

const hero: Fighter = {
  name: 'Hero',
  side: 'party',
  maxHp: 900,
  maxMp: 80,
  attack: 60,
  defence: 1,
  agility: 1,
  shield: false,
  exp: 0,
  gold: 0,
  level: 40,
}
const foe: Fighter = {
  name: 'brute',
  side: 'foes',
  maxHp: 999,
  maxMp: 0,
  attack: 200,
  defence: 5,
  agility: 255,
  shield: false,
  exp: 7,
  gold: 3,
}
const burn: Changing = {
  action: 176,
  cost: 0,
  change: { kind: 'burn', chance: 100 },
  reach: 'one',
  side: 'own',
}
const defending = new Map<number, Command>([[0, { kind: 'defend' }]])
const burning = (tension: number) => {
  const start = startBattle([hero, foe])
  return {
    ...start,
    fighters: start.fighters.map((f, i) =>
      i === 0 ? { ...f, states: { ...f.states, tension, burn: { level: 1, turns: 4 } } } : f,
    ),
  }
}

describe('Feel the Burn — kind 47', () => {
  it('sets its status with a count of 4, run down by the second table', () => {
    const { events } = playRound(
      startBattle([hero, foe]),
      new Map<number, Command>([[0, { kind: 'change', changing: burn, target: 0 }]]),
      new BattleRng(2n),
    )
    const e = events.find((x) => x.kind === 'change')
    expect(e?.kind === 'change' && e.hits[0]?.result).toBe('given')
    expect(LEVEL_COUNTS.burn).toBe(4)
    expect(WEAR_OF.burn).toEqual({ table: WEAR_TABLE_SLOW, start: 4 })
    expect(BURN_CHANCE).toEqual([100, 50, 25, 25, 25])
  })

  it('raises its holder’s tension after a blow that hurt them — surely, from nothing', () => {
    let raised = 0
    for (let seed = 0n; seed < 20n; seed++) {
      const { events, state } = playRound(burning(0), defending, new BattleRng(seed))
      const hurt = events.some((e) => e.kind === 'attack' && e.target === 0 && e.damage > 0)
      const told = events.filter((e) => e.kind === 'burn')
      if (!hurt) {
        expect(told).toEqual([])
        continue
      }
      expect(told).toEqual([{ kind: 'burn', actor: 0, level: 1 }])
      expect(state.fighters[0]?.states.tension).toBe(1)
      raised++
    }
    expect(raised).toBeGreaterThan(0)
  })

  it('raises none at the most, and none without it', () => {
    for (let seed = 0n; seed < 20n; seed++) {
      const most = playRound(burning(4), defending, new BattleRng(seed))
      expect(most.events.filter((e) => e.kind === 'burn')).toEqual([])
      const plain = playRound(startBattle([hero, foe]), defending, new BattleRng(seed))
      expect(plain.events.filter((e) => e.kind === 'burn')).toEqual([])
    }
  })
})
