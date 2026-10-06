import { describe, expect, it } from 'vitest'
import {
  type BattleEvent,
  type Changing,
  type Command,
  type Fighter,
  playRound,
  startBattle,
  withHp,
  withMp,
} from '../src/battle/battle.ts'
import { BattleRng } from '../src/battle/rng.ts'
import { focusMp, rainHp, roundRunDown, WEAR_TABLE } from '../src/battle/states.ts'

/**
 * The statuses of task 18's remaining kinds — `docs/readings/T18-handlers.md`
 * §11: each set by its kind's handler, and what it does where the game reads
 * it.
 */

const hero: Fighter = {
  name: 'Hero',
  side: 'party',
  maxHp: 100,
  maxMp: 80,
  attack: 60,
  defence: 200,
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
}
const status = (action: number, kind: Changing['change']['kind'], over: Partial<Changing> = {}) =>
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

describe('Right as Rain and Focus Pocus — kinds 48 and 78, at the round’s end', () => {
  it('gives back the larger of 10 and half the level, and of 3 and a tenth', () => {
    expect(rainHp(40)).toBe(20)
    expect(rainHp(19)).toBe(10)
    expect(rainHp(21)).toBe(10)
    expect(rainHp(99)).toBe(49)
    expect(focusMp(40)).toBe(4)
    expect(focusMp(29)).toBe(3)
    expect(focusMp(99)).toBe(9)
  })

  it('sets Right as Rain, and heals its holder at the end of that very round', () => {
    const start = withHp(startBattle([hero, foe]), new Map([[0, 50]]))
    const { state, events } = playRound(start, using(status(188, 'rain')), new BattleRng(5n))
    expect(changeOf(events).hits).toEqual([{ target: 0, result: 'given' }])
    const regen = events.find((e) => e.kind === 'regen')
    expect(regen).toEqual({ kind: 'regen', actor: 0, hp: 20 })
    // Its count of 6, a round less at the round's end.
    expect(state.fighters[0]?.states.rain).toEqual({ level: 1, turns: 5 })
    // The regaining comes before the count-down's, and nothing at full HP is told.
    const full = playRound(state, new Map(), new BattleRng(6n))
    const hp = full.state.fighters[0]?.hp ?? 0
    expect(hp).toBeGreaterThan(state.fighters[0]?.hp ?? 0)
  })

  it('gives Focus Pocus’s MP to one short of it, and tells nothing for one full', () => {
    const start = withMp(startBattle([hero, foe]), new Map([[0, 10]]))
    const { events } = playRound(start, using(status(157, 'focus')), new BattleRng(5n))
    expect(events.find((e) => e.kind === 'regen')).toEqual({ kind: 'regen', actor: 0, mp: 4 })
    const full = playRound(startBattle([hero, foe]), using(status(157, 'focus')), new BattleRng(5n))
    expect(full.events.some((e) => e.kind === 'regen')).toBe(false)
  })

  it('runs down at the round’s end, a draw for every holder whichever count is running', () => {
    // The first count: no table, just a round less, and at 0 the second at 4.
    expect(roundRunDown({ level: 1, turns: 2 }, WEAR_TABLE, 0.99)).toEqual({
      level: { level: 1, turns: 1 },
      wore: false,
    })
    expect(roundRunDown({ level: 1, turns: 1 }, WEAR_TABLE, 0.99)).toEqual({
      level: { level: 1, turns: 0, wearing: 4 },
      wore: false,
    })
    // The second: worn where the table, by the count less one, is above the draw.
    expect(roundRunDown({ level: 1, turns: 0, wearing: 4 }, WEAR_TABLE, 0.62)).toEqual({
      level: { level: 0, turns: 0 },
      wore: true,
    })
    expect(roundRunDown({ level: 1, turns: 0, wearing: 4 }, WEAR_TABLE, 0.63)).toEqual({
      level: { level: 1, turns: 0, wearing: 3 },
      wore: false,
    })
    // At the last it is 1.0, above any draw.
    expect(roundRunDown({ level: 1, turns: 0, wearing: 1 }, WEAR_TABLE, 0.99).wore).toBe(true)
  })

  it('wears Right as Rain off at last, and says so', () => {
    let state = startBattle([hero, foe])
    state = playRound(state, using(status(188, 'rain')), new BattleRng(1n)).state
    let worn: BattleEvent | undefined
    for (let round = 0; round < 12 && !worn; round++) {
      const next = playRound(state, new Map(), new BattleRng(BigInt(round + 2)))
      worn = next.events.find((e) => e.kind === 'wornOff')
      state = next.state
    }
    expect(worn).toEqual({ kind: 'wornOff', actor: 0, stat: 'rain' })
    expect(state.fighters[0]?.states.rain).toBeUndefined()
  })
})
