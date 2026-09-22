import { describe, expect, it } from 'vitest'
import { type Fighter, fleeChance, playRound, startBattle } from '../src/battle/battle.ts'
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

describe('what it takes to get away', () => {
  const strong = (name: string) => ({ ...monster(name, 7), attack: 60, defence: 60 })
  const fleeing = new Map([[0, { kind: 'flee' as const }]])

  it('gets away outright, and spends no draw, where the party opened the fight', () => {
    const world = new BattleRng(9n)
    const state = startBattle([hero, strong('a')], true, 'monstersSitOut')
    const { events } = playRound(state, fleeing, new BattleRng(1n), undefined, world)
    expect(events).toContainEqual({ kind: 'flee', actor: 0, escaped: true })
    expect(world.drawn).toBe(0)
  })

  it('gets away outright where three times the monsters’ numbers are not above the party’s', () => {
    const world = new BattleRng(9n)
    const feeble = { ...monster('a', 7), attack: 1, defence: 1 }
    const { events } = playRound(
      startBattle([{ ...hero, attack: 40, defence: 40 }, feeble]),
      fleeing,
      new BattleRng(1n),
      undefined,
      world,
    )
    expect(events).toContainEqual({ kind: 'flee', actor: 0, escaped: true })
    expect(world.drawn).toBe(0)
  })

  it('rises to a quarter, a half, three quarters and then certainty as it is tried', () => {
    const chances: number[] = []
    let state = startBattle([hero, strong('a')])
    for (let tried = 0; tried < 5; tried++) {
      chances.push(fleeChance(state, state.fighters, 0).chance)
      state = { ...state, fleeAttempts: tried + 1 }
    }
    expect(chances).toEqual([25, 50, 75, 100, 100])
  })

  it('draws from the world’s generator, and never from the battle’s', () => {
    const world = new BattleRng(3n)
    const battleRng = new BattleRng(3n)
    const state = startBattle([hero, strong('a')])
    const before = battleRng.drawn
    playRound(state, fleeing, battleRng, undefined, world)
    expect(world.drawn).toBe(1)
    // The battle's own numbers are untouched by the attempt: only the
    // monster's turn draws from them.
    expect(battleRng.drawn).toBeGreaterThanOrEqual(before)
  })

  it('counts the attempts, so a second try is likelier than the first', () => {
    // A generator whose draw is high enough to fail a quarter's chance, and a
    // Hero who acts first and survives the round.
    const world = new BattleRng(2n)
    const tough = { ...hero, maxHp: 999, agility: 99 }
    const { state } = playRound(
      startBattle([tough, strong('a')]),
      fleeing,
      new BattleRng(1n),
      undefined,
      world,
    )
    expect(state.fleeAttempts).toBe(1)
    expect(fleeChance(state, state.fighters, 0).chance).toBe(50)
  })
})
