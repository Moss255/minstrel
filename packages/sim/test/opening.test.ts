import { describe, expect, it } from 'vitest'
import { type Fighter, playRound, startBattle } from '../src/battle/battle.ts'
import { BattleRng } from '../src/battle/rng.ts'

/**
 * The round a surprise opens — the game's `ProcessCombatTurn`, which reads how
 * the fight opened from `[battle + 0xe49]`. **What sets it is not read**: no
 * battle here is given an opening yet, so every fight opens even.
 */

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

const monster = (name: string, agility: number): Fighter => ({
  name,
  side: 'foes',
  maxHp: 8,
  maxMp: 0,
  attack: 10,
  defence: 7,
  agility,
  shield: false,
  exp: 2,
  gold: 4,
})

const defending = new Map([[0, { kind: 'defend' as const }]])

describe('the round a surprise opens', () => {
  it('leaves the monsters out where the party opened it, and rolls for none of them', () => {
    const rng = new BattleRng(1n)
    const state = startBattle([hero, monster('a', 7), monster('b', 7)], true, 'monstersSitOut')
    const { events } = playRound(state, defending, rng)
    // One initiative draw, the Hero's alone — a monster passed over is not
    // rolled for — and no monster acts.
    expect(rng.drawn).toBe(1)
    expect(events.some((event) => 'actor' in event && event.actor !== 0)).toBe(false)
  })

  it('leaves the party out where the monsters opened it, the first monster acting outright', () => {
    const rng = new BattleRng(1n)
    const state = startBattle([hero, monster('a', 7), monster('b', 7)], true, 'partySitsOut')
    const { events } = playRound(state, defending, rng)
    const acted = new Set(events.flatMap((event) => ('actor' in event ? [event.actor] : [])))
    expect(acted.has(0)).toBe(false)
    expect(acted.has(1)).toBe(true)
  })

  it('opens even unless it is given an opening, and surprises only the first round', () => {
    const rng = new BattleRng(5n)
    const first = playRound(startBattle([hero, monster('a', 7)]), defending, rng)
    expect(first.state.round).toBe(1)
    // Round two is even, whatever opened the battle.
    const on = { ...first.state, opening: 'partySitsOut' as const }
    const second = playRound(on, defending, new BattleRng(5n))
    expect(second.events.some((event) => 'actor' in event && event.actor === 0)).toBe(true)
  })
})
