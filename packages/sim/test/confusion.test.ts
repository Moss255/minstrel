import { describe, expect, it } from 'vitest'
import {
  type BattleEvent,
  type BattleState,
  type Changing,
  CONFUSED,
  type Command,
  type Fighter,
  playRound,
  startBattle,
} from '../src/battle/battle.ts'
import { BattleRng } from '../src/battle/rng.ts'

/**
 * **Confusion** — Fuddle (kind 21, `func_ov024_021dd828`), status `+0x14`
 * bit 5 (`func_020883cc`), and what a confused fighter does
 * (`func_ov000_0215f67c`). Read 7 October 2026; see
 * `docs/readings/T18-handlers.md` §14.
 */

const member = (name: string, over: Partial<Fighter> = {}): Fighter => ({
  name,
  side: 'party',
  maxHp: 300,
  maxMp: 50,
  attack: 60,
  defence: 40,
  agility: 1,
  shield: false,
  exp: 0,
  gold: 0,
  level: 30,
  ...over,
})
const slime = (over: Partial<Fighter> = {}): Fighter => ({
  name: 'slime',
  side: 'foes',
  maxHp: 999,
  maxMp: 0,
  attack: 1,
  defence: 5,
  agility: 0,
  shield: false,
  exp: 1,
  gold: 1,
  ...over,
})
const fuddle: Changing = {
  action: 51,
  cost: 0,
  change: { kind: 'confuse', chance: 100 },
  reach: 'one',
  side: 'other',
}
const confused = (state: BattleState, who: number, turns = 3): BattleState => ({
  ...state,
  fighters: state.fighters.map((f, i) =>
    i === who ? { ...f, states: { ...f.states, confused: { level: 1, turns } } } : f,
  ),
})
/** Seeds spread over the generator's range — small ones start alike. */
const seedOf = (n: number) => (BigInt(n) * 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn
const turnOf = (events: readonly BattleEvent[], actor: number) =>
  events.find(
    (e) =>
      (e.kind === 'confused' || e.kind === 'attack' || e.kind === 'senses') && e.actor === actor,
  )

describe('Fuddle', () => {
  it('confuses a monster with a count of 3, and again, anew, one already confused', () => {
    const start = startBattle([member('Hero', { agility: 255 }), slime()])
    const commands = new Map<number, Command>([
      [0, { kind: 'change', changing: fuddle, target: 1 }],
    ])
    const first = playRound(start, commands, new BattleRng(1n))
    const hit = first.events.find((e) => e.kind === 'change')
    expect(hit?.kind === 'change' && hit.hits[0]).toMatchObject({ target: 1, result: 'confused' })
    // Set at 3, and a pass less after the slime's own turn.
    expect(first.state.fighters[1]?.states.confused).toEqual({ level: 1, turns: 2 })
    const again = playRound(confused(start, 1, 1), commands, new BattleRng(1n))
    const twice = again.events.find((e) => e.kind === 'change')
    expect(twice?.kind === 'change' && twice.hits[0]).toMatchObject({
      result: 'confused',
      again: true,
    })
  })
})

describe('a confused fighter’s turn — `func_ov000_0215f67c`', () => {
  const party = [member('Hero'), member('Ivy'), member('Ana')]
  it('attacks an ally at random, never itself — or does one of the party’s four', () => {
    const seen = new Set<number>()
    for (let seed = 1n; seed <= 60n; seed++) {
      const start = confused(startBattle([...party, slime()]), 0)
      const { events } = playRound(
        start,
        new Map<number, Command>([[0, { kind: 'attack', target: 3 }]]),
        new BattleRng(seedOf(Number(seed))),
      )
      const turn = turnOf(events, 0)
      if (turn?.kind === 'attack') {
        expect(turn.confused).toBe(true)
        expect([1, 2]).toContain(turn.target)
        seen.add(CONFUSED.atRandom)
      } else if (turn?.kind === 'confused') {
        expect(CONFUSED.party).toContain(turn.action)
        seen.add(turn.action)
      }
    }
    expect(seen.has(CONFUSED.atRandom)).toBe(true)
    expect(seen.size).toBeGreaterThan(3)
  })

  it('never attacks with no ally standing', () => {
    for (let seed = 1n; seed <= 30n; seed++) {
      const start = confused(startBattle([member('Hero'), slime()]), 0)
      const { events } = playRound(
        start,
        new Map<number, Command>([[0, { kind: 'attack', target: 1 }]]),
        new BattleRng(seedOf(Number(seed))),
      )
      expect(turnOf(events, 0)?.kind).toBe('confused')
    }
  })

  it('lets a confused monster flee only where the battle may be fled', () => {
    const fled = (canFlee: boolean) => {
      for (let seed = 1n; seed <= 80n; seed++) {
        const start = confused(startBattle([member('Hero'), slime()], canFlee), 1)
        const { events } = playRound(start, new Map(), new BattleRng(seedOf(Number(seed))))
        const turn = turnOf(events, 1)
        if (turn?.kind === 'confused' && turn.action === CONFUSED.flees) return true
      }
      return false
    }
    expect(fled(true)).toBe(true)
    expect(fled(false)).toBe(false)
  })
})

describe('coming to one’s senses — `func_ov000_0215833c`', () => {
  it('runs its count down a pass at a time, then at a turn’s start by the table', () => {
    let state = confused(startBattle([member('Hero', { agility: 255 }), member('Ivy'), slime()]), 0)
    const states: unknown[] = []
    let came = -1
    for (let round = 0; round < 12 && came < 0; round++) {
      const { state: next, events } = playRound(
        state,
        new Map<number, Command>([[0, { kind: 'defend' }]]),
        new BattleRng(BigInt(round + 7)),
      )
      if (events.some((e) => e.kind === 'senses' && e.actor === 0)) came = round
      states.push(next.fighters[0]?.states.confused)
      state = next
    }
    // Three passes of its own count — the second at 4 after the third — and
    // only then may a turn's start clear it: under 0.625, 0.75, 0.875, then 1.
    expect(states[0]).toEqual({ level: 1, turns: 2 })
    expect(states[1]).toEqual({ level: 1, turns: 1 })
    expect(states[2]).toEqual({ level: 1, turns: 0, wearing: 4 })
    expect(came).toBeGreaterThanOrEqual(3)
    expect(came).toBeLessThanOrEqual(6)
  })
})

describe('the riders — confusion (10) and Sobering Slap (19)', () => {
  const blow = (slot: number): Command => ({
    kind: 'blow',
    target: 1,
    blow: {
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
      rider: { slot, chance: { party: 100, foe: 100 }, levels: 0 },
    },
  })
  it('confuses on a pass that dealt something, under its chance', () => {
    const start = startBattle([member('Hero', { agility: 255, attack: 200 }), slime()])
    const { events, state } = playRound(start, new Map([[0, blow(10)]]), new BattleRng(seedOf(3)))
    const told = events.find((e) => e.kind === 'blow')
    expect(told?.kind === 'blow' && told.hits[0]?.rode).toMatchObject({ result: 'confused' })
    expect(state.fighters[1]?.states.confused).toBeDefined()
  })
  it('brings one confused to their senses, with no draw', () => {
    const start = confused(startBattle([member('Hero', { agility: 255, attack: 200 }), slime()]), 1)
    const { events, state } = playRound(start, new Map([[0, blow(19)]]), new BattleRng(seedOf(3)))
    const told = events.find((e) => e.kind === 'blow')
    expect(told?.kind === 'blow' && told.hits[0]?.rode).toMatchObject({ result: 'sobered' })
    expect(state.fighters[1]?.states.confused).toBeUndefined()
  })
})

describe('Sobering Slap — kind 9 with rider 19', () => {
  it('brings one confused to their senses before it wakes a sleeper', () => {
    const slap: Changing = {
      action: 171,
      cost: 0,
      change: { kind: 'wake', chance: 100 },
      reach: 'one',
      side: 'own',
      rider: { slot: 19, levels: 0 },
    }
    const start = confused(
      startBattle([member('Hero', { agility: 255 }), member('Ivy'), slime()]),
      1,
    )
    const { events, state } = playRound(
      start,
      new Map<number, Command>([[0, { kind: 'change', changing: slap, target: 1 }]]),
      new BattleRng(seedOf(5)),
    )
    const hit = events.find((e) => e.kind === 'change')
    expect(hit?.kind === 'change' && hit.hits[0]).toMatchObject({ target: 1, result: 'sobered' })
    expect(state.fighters[1]?.states.confused).toBeUndefined()
  })
})
