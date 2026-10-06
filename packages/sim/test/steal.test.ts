import { describe, expect, it } from 'vitest'
import {
  type BattleEvent,
  type Changing,
  type Command,
  type Fighter,
  playRound,
  STEAL_DOUBLER,
  STEAL_SHARES,
  startBattle,
  stealChance,
} from '../src/battle/battle.ts'
import { BattleRng } from '../src/battle/rng.ts'
import { halfInchChance } from './game-oracle.ts'

/**
 * **Half-Inch** — kind 44, `func_ov024_021df924`: one of the party picks a
 * monster's pocket, its ordinary item then its rare, by deftness. Read 7
 * October 2026; see `docs/readings/T18-handlers.md` §15.
 */

const thief = (over: Partial<Fighter> = {}): Fighter => ({
  name: 'Hero',
  side: 'party',
  maxHp: 300,
  maxMp: 50,
  attack: 60,
  defence: 40,
  agility: 255,
  shield: false,
  exp: 0,
  gold: 0,
  level: 30,
  deftness: 999,
  ...over,
})
const slime = (drops: Fighter['drops']): Fighter => ({
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
  ...(drops ? { drops } : {}),
})
const halfInch: Changing = {
  action: 165,
  cost: 0,
  change: { kind: 'steal', chance: 100 },
  reach: 'one',
  side: 'other',
}
const pinch = new Map<number, Command>([[0, { kind: 'change', changing: halfInch, target: 1 }]])
const seedOf = (n: number) => (BigInt(n) * 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn
const hitOf = (events: readonly BattleEvent[]) => {
  const told = events.find((e) => e.kind === 'change')
  return told?.kind === 'change' ? told.hits[0] : undefined
}

describe('Half-Inch’s chance', () => {
  it('is the game’s, in its floats, at every step and deftness, the accessory worn or not', () => {
    for (const share of STEAL_SHARES)
      for (let d = 0; d < 1024; d++)
        for (const doubled of [false, true])
          expect(stealChance(share, d, doubled ? STEAL_DOUBLER : undefined)).toBe(
            halfInchChance(share, d, doubled),
          )
  })

  it('goes from twice the drop’s own to six times it, held to 50, by deftness above 51', () => {
    // One in 8: 25 at the least, 75 held to 50 at the most.
    expect(stealChance(0.125, 51)).toBe(25)
    expect(stealChance(0.125, 999)).toBe(50)
    expect(stealChance(0.125, 525)).toBeCloseTo(37.5, 4)
    // One in 64: 3.125 to 9.375; the accessory doubles both.
    expect(stealChance(0.015625, 0)).toBe(3.125)
    expect(stealChance(0.015625, 999, STEAL_DOUBLER)).toBe(18.75)
    expect(stealChance(0, 999)).toBe(0)
  })
})

describe('Half-Inch in a battle', () => {
  const carrying: Fighter['drops'] = [
    { item: 100, step: 1 },
    { item: 200, step: 3 },
  ]

  it('pinches the ordinary item half the time at the most deftness, else now and then the rare', () => {
    const seen = new Map<string, number>()
    for (let n = 0; n < 400; n++) {
      const { events, state } = playRound(
        startBattle([thief(), slime(carrying)]),
        pinch,
        new BattleRng(seedOf(n)),
      )
      const hit = hitOf(events)
      const key = hit?.result === 'stole' ? `item ${hit.item}` : (hit?.result ?? 'none')
      seen.set(key, (seen.get(key) ?? 0) + 1)
      if (hit?.result === 'stole')
        expect(state.fighters[1]?.states.stolen).toBe(hit.item === 100 ? 1 : 2)
    }
    // 50 in 100 for the ordinary; the rare, one in 32 at 18.75, on what is left.
    expect((seen.get('item 100') ?? 0) / 400).toBeGreaterThan(0.42)
    expect((seen.get('item 100') ?? 0) / 400).toBeLessThan(0.58)
    expect(seen.get('item 200') ?? 0).toBeGreaterThan(0)
    expect(seen.get('resisted') ?? 0).toBeGreaterThan(0)
  })

  it('finds nothing more on one stolen from — "isn’t carrying anything"', () => {
    let state = startBattle([thief(), slime(carrying)])
    for (let n = 0; ; n++) {
      const played = playRound(state, pinch, new BattleRng(seedOf(n)))
      if (hitOf(played.events)?.result !== 'stole') continue
      state = played.state
      break
    }
    expect(hitOf(playRound(state, pinch, new BattleRng(seedOf(1))).events)).toEqual({
      target: 1,
      result: 'empty',
    })
  })

  it('passes over a step of 0 and one that never drops', () => {
    const none: Fighter['drops'] = [
      { item: 100, step: 0 },
      { item: 200, step: 7 },
    ]
    for (let n = 0; n < 20; n++) {
      const { events } = playRound(
        startBattle([thief(), slime(none)]),
        pinch,
        new BattleRng(seedOf(n)),
      )
      expect(hitOf(events)).toEqual({ target: 1, result: 'empty' })
    }
  })
})

describe('Eye for Trouble — kind 45', () => {
  it('marks a monster for the defeated monster list, and nothing more', () => {
    const eye: Changing = { ...halfInch, action: 166, change: { kind: 'note', chance: 100 } }
    const start = startBattle([thief(), slime(undefined)])
    const { events, state } = playRound(
      start,
      new Map<number, Command>([[0, { kind: 'change', changing: eye, target: 1 }]]),
      new BattleRng(seedOf(4)),
    )
    expect(hitOf(events)).toEqual({ target: 1, result: 'noted' })
    expect(state.fighters[1]?.states).toEqual({ ...start.fighters[1]?.states })
  })
})
