import { describe, expect, it } from 'vitest'
import {
  type BattleEvent,
  type BattleState,
  type Blow,
  type Changing,
  type Fighter,
  playRound,
  type Spell,
  startBattle,
} from '../src/battle/battle.ts'
import { BattleRng } from '../src/battle/rng.ts'
import type { States } from '../src/battle/states.ts'

/**
 * **Provoked** — `func_ov024_021eb08c`: a monster with a record, by one of the
 * party, for a kind of provocation its record's `+0x24` names with a chance;
 * a draw `R(100)` always, then where it may be watched a count between its
 * `+0x28` and `+0x29`; enraged, it watches whoever provoked it, told at once
 * (`func_ov000_0215a908`, `0x212`). Asked by Eyes on Me (`0x12`), Whistle
 * (`0x11`), a party member's blow taking it below a half (3) or a quarter
 * (4), and a party member's heal (`0x13`) or Zing (`0x14`). Read 7 October
 * 2026; see `docs/readings/T18-handlers.md` §16.
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
const enragedOf = (events: readonly BattleEvent[]) => events.filter((e) => e.kind === 'enraged')
const angry = (kind: number, chance = 100): Partial<Fighter> => ({
  provokedBy: [
    [kind, chance],
    [0, 0],
  ],
  watchTurns: [2, 2],
})
const still = (state: BattleState) => holding(state, 1, { paralysed: { level: 1, turns: 3 } })

describe('Eyes on Me and Whistle', () => {
  const eyes: Changing = {
    action: 194,
    cost: 0,
    reach: 'one',
    side: 'other',
    change: { kind: 'eyes', chance: 100 },
  }
  it('enrages a monster at its user by its record’s chance, watched for its count', () => {
    const { events, state } = playRound(
      startBattle([hero(), slime(angry(0x12))]),
      new Map([[0, { kind: 'change', changing: eyes, target: 1 }]]),
      new BattleRng(seedOf(3)),
    )
    const change = events.find((e) => e.kind === 'change')
    expect(change?.kind === 'change' && change.hits[0]).toEqual({
      target: 1,
      result: 'provoked',
      by: 0,
    })
    expect(state.fighters[1]?.states.watched?.by).toBe(0)
  })
  it('turns a watch already there to its user, with no draw', () => {
    const drawn = (watched: boolean) => {
      const rng = new BattleRng(seedOf(3))
      const start = holding(startBattle([hero(), hero({ name: 'Ally' }), slime(angry(0x12))]), 2, {
        ...(watched ? { watched: { by: 1, turns: 4 } } : {}),
        paralysed: { level: 1, turns: 3 },
      })
      const { state } = playRound(
        start,
        new Map([[0, { kind: 'change', changing: eyes, target: 2 }]]),
        rng,
      )
      // Its count kept — and run down by one at the slime's own pass.
      if (watched) expect(state.fighters[2]?.states.watched).toEqual({ by: 0, turns: 3 })
      return rng.drawn
    }
    // Unwatched, the draw — paralysed, it may not be watched, so no count
    // after it; watched, no draw at all.
    expect(drawn(false) - drawn(true)).toBe(1)
  })
  it('leaves a monster whose record names no such kind as it was — its draw still made', () => {
    const whistle: Changing = { ...eyes, action: 147, change: { kind: 'whistle', chance: 100 } }
    const { events, state } = playRound(
      still(startBattle([hero(), slime(angry(0x12))])),
      new Map([[0, { kind: 'change', changing: whistle, target: 1 }]]),
      new BattleRng(seedOf(3)),
    )
    const change = events.find((e) => e.kind === 'change')
    expect(change?.kind === 'change' && change.hits[0]?.result).toBe('unprovoked')
    expect(state.fighters[1]?.states.watched).toBeUndefined()
  })
})

describe('a party member’s blow taking a monster below a half or a quarter', () => {
  it('provokes it of kind 3 crossing a half, and tells it enraged', () => {
    // Not paralysed: one paralysed may not be watched (`func_02088e04`).
    const start = startBattle([hero({ attack: 400 }), slime({ ...angry(3), maxHp: 1000 })])
    const at = {
      ...start,
      fighters: start.fighters.map((f, i) => (i === 1 ? { ...f, hp: 520 } : f)),
    }
    const { events, state } = playRound(
      at,
      new Map([[0, { kind: 'blow', blow: blow({ rouses: false }), target: 1 }]]),
      new BattleRng(seedOf(2)),
    )
    const hp = state.fighters[1]?.hp ?? 0
    if (hp < 500 && hp >= 250) {
      expect(enragedOf(events)).toEqual([{ kind: 'enraged', actor: 1, target: 0 }])
      expect(state.fighters[1]?.states.watched?.by).toBe(0)
    } else expect(enragedOf(events)).toEqual([])
  })
  it('makes no draw where nothing is crossed', () => {
    const drawn = (provokedBy: boolean) => {
      const rng = new BattleRng(seedOf(2))
      const start = still(startBattle([hero(), slime(provokedBy ? angry(3) : {})]))
      playRound(
        start,
        new Map([[0, { kind: 'blow', blow: blow({ rouses: false }), target: 1 }]]),
        rng,
      )
      return rng.drawn
    }
    // A slime of 9999 HP is not taken below a half by one blow.
    expect(drawn(true)).toBe(drawn(false))
  })
})

describe('a party member’s heal', () => {
  it('asks each monster whether it is provoked, of kind 0x13', () => {
    const heal: Spell = {
      action: 30,
      cost: 0,
      does: 'heal',
      reach: 'one',
      amount: { base: 30, spread: 5 },
      family: 5,
    }
    const { events } = playRound(
      startBattle([hero(), slime(angry(0x13))]),
      new Map([[0, { kind: 'spell', spell: heal, target: 0 }]]),
      new BattleRng(seedOf(4)),
    )
    expect(enragedOf(events)).toEqual([{ kind: 'enraged', actor: 1, target: 0 }])
  })
})

describe('a cast gone haywire once for all — kind `0x18`', () => {
  const boom: Spell = {
    action: 22,
    cost: 0,
    does: 'harm',
    reach: 'all',
    amount: { base: 10, spread: 0 },
    criticalPercent: 100,
  }
  it('asks each monster of kind `0x18` only where the cast went haywire', () => {
    let haywire = 0
    for (let n = 0; n < 600; n++) {
      const { events } = playRound(
        startBattle([hero(), slime(angry(0x18))]),
        new Map([[0, { kind: 'spell', spell: boom, target: 1 }]]),
        new BattleRng(seedOf(n)),
      )
      const cast = events.find((e) => e.kind === 'spell')
      const critical = cast?.kind === 'spell' && cast.critical
      expect(enragedOf(events).length).toBe(critical ? 1 : 0)
      if (critical) haywire++
    }
    expect(haywire).toBeGreaterThan(0)
  })
})
