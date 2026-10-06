import { describe, expect, it } from 'vitest'
import {
  type BattleEvent,
  type Blow,
  type Changing,
  type Fighter,
  playRound,
  startBattle,
  withHp,
} from '../src/battle/battle.ts'
import { revivedHp, scaledAccuracy } from '../src/battle/handlers.ts'
import { BattleRng } from '../src/battle/rng.ts'
import { buffedAttack } from '../src/battle/states.ts'
import { scaledAccuracy as oracleAccuracy, revivalHp, updatedAttack } from './game-oracle.ts'

/**
 * Task 18's handlers — `docs/readings/T18-handlers.md`: the kinds that change
 * state (attack, defence, agility, sleep, poison cured, waking, death, raising
 * the fallen), and what rides on a blow.
 */

const hero: Fighter = {
  name: 'Hero',
  side: 'party',
  maxHp: 100,
  maxMp: 50,
  attack: 60,
  defence: 10,
  agility: 255,
  shield: false,
  exp: 0,
  gold: 0,
  level: 20,
  mending: 300,
}
const ally: Fighter = { ...hero, name: 'Ivor', agility: 1 }
const foe: Fighter = {
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
}
const changing = (over: Partial<Changing> & Pick<Changing, 'change'>): Changing => ({
  action: 49,
  cost: 0,
  reach: 'one',
  side: 'own',
  ...over,
})
const changeOf = (events: readonly BattleEvent[]) => {
  const e = events.find((x) => x.kind === 'change')
  if (e?.kind !== 'change') throw new Error('no change')
  return e
}

describe('the attack at its level — UpdateCombatantAttack', () => {
  it('is the oracle at every attack and level', () => {
    for (let attack = 0; attack <= 1200; attack++)
      for (let level = -2; level <= 2; level++)
        for (const party of [true, false])
          expect(buffedAttack(attack, level, party)).toBe(updatedAttack(attack, level, party))
  })

  it('moves a quarter a level, not defence’s half', () => {
    expect(buffedAttack(100, 1, true)).toBe(125)
    expect(buffedAttack(100, 2, true)).toBe(150)
    expect(buffedAttack(101, -1, true)).toBe(75)
    expect(buffedAttack(101, -2, true)).toBe(50)
    expect(buffedAttack(900, 2, true)).toBe(999)
    expect(buffedAttack(900, 2, false)).toBe(1350)
  })
})

describe('the party’s scaled accuracy and the raised’s HP, held to the oracle', () => {
  it('scales the accuracy as the accuracy roll does', () => {
    for (let stat = 0; stat <= 999; stat++)
      expect(scaledAccuracy(stat, 75, 100, 50, 999)).toBe(oracleAccuracy(stat, 75, 100, 50, 999))
  })

  it('raises Zing’s fallen with a quarter to a half by mending — Zing’s own lo 180, hi 849', () => {
    for (let mending = 0; mending <= 999; mending++)
      for (const maxHp of [1, 37, 100, 999])
        expect(revivedHp({ lo: 180, hi: 849 }, true, mending, maxHp)).toBe(
          revivalHp(0x26, true, mending, 180, 849, maxHp),
        )
    expect(revivedHp({ lo: 180, hi: 849 }, true, 0, 100)).toBe(25)
    expect(revivedHp({ lo: 180, hi: 849 }, true, 999, 100)).toBe(50)
    expect(revivedHp({ lo: 180, hi: 849 }, false, 999, 100)).toBe(50)
    expect(revivedHp(0.5, true, 0, 101)).toBe(revivalHp(0x27, true, 0, 0, 0, 101))
  })
})

describe('a change of the party’s', () => {
  it('raises an ally’s attack by the record’s levels', () => {
    const start = startBattle([hero, ally, foe])
    const { state, events } = playRound(
      start,
      new Map([
        [
          0,
          {
            kind: 'change',
            changing: changing({ change: { kind: 'attack', by: 2, chance: 100 } }),
            target: 1,
          },
        ],
      ]),
      new BattleRng(3n),
    )
    expect(changeOf(events).hits).toEqual([{ target: 1, result: 'raised', level: 2 }])
    expect(state.fighters[1]?.states.attack?.level).toBe(2)
  })

  it('makes one more draw for one of the party whose accuracy is drawn, not scaled', () => {
    const lower = (accuracy?: Changing['accuracy']) =>
      changing({
        action: 50,
        side: 'other',
        change: { kind: 'attack', by: -2, chance: 100 },
        ...(accuracy ? { accuracy } : {}),
      })
    const drawn = new BattleRng(9n)
    const scaled = new BattleRng(9n)
    playRound(
      startBattle([hero, foe]),
      new Map([[0, { kind: 'change', changing: lower({ min: 75, max: 100 }), target: 1 }]]),
      drawn,
    )
    playRound(
      startBattle([hero, foe]),
      new Map([
        [
          0,
          {
            kind: 'change',
            changing: lower({ min: 75, max: 100, scales: { by: 'mending', lo: 0, hi: 10 } }),
            target: 1,
          },
        ],
      ]),
      scaled,
    )
    expect(drawn.drawn - scaled.drawn).toBe(1)
  })

  it('cures poison, and wakes a sleeper', () => {
    const sick = startBattle([hero, ally, foe])
    const poorly = {
      ...sick,
      fighters: sick.fighters.map((f, i) =>
        i === 1 ? { ...f, states: { ...f.states, poisoned: true } } : f,
      ),
    }
    const cured = playRound(
      poorly,
      new Map([
        [
          0,
          {
            kind: 'change',
            changing: changing({ action: 35, change: { kind: 'cure', chance: 100 } }),
            target: 1,
          },
        ],
      ]),
      new BattleRng(1n),
    )
    expect(changeOf(cured.events).hits).toEqual([{ target: 1, result: 'cured' }])
    expect(cured.state.fighters[1]?.states.poisoned).toBe(false)
    const again = playRound(
      cured.state,
      new Map([
        [
          0,
          {
            kind: 'change',
            changing: changing({ action: 35, change: { kind: 'cure', chance: 100 } }),
            target: 1,
          },
        ],
      ]),
      new BattleRng(1n),
    )
    expect(changeOf(again.events).hits).toEqual([{ target: 1, result: 'resisted' }])
  })

  it('takes all a monster’s HP when Whack lands, and tells it before it falls', () => {
    const { state, events } = playRound(
      startBattle([hero, foe]),
      new Map([
        [
          0,
          {
            kind: 'change',
            changing: changing({
              action: 24,
              side: 'other',
              change: { kind: 'kill', chance: 100 },
            }),
            target: 1,
          },
        ],
      ]),
      new BattleRng(2n),
    )
    expect(changeOf(events).hits).toEqual([{ target: 1, result: 'killed' }])
    const told = events.findIndex((e) => e.kind === 'change')
    const fell = events.findIndex((e) => e.kind === 'defeated' && e.actor === 1)
    expect(fell).toBeGreaterThan(told)
    expect(state.fighters[1]?.hp).toBe(0)
  })

  it('raises the fallen with Zing’s share of their HP, and leaves the standing as they are', () => {
    const fallen = withHp(startBattle([hero, ally, foe]), new Map([[1, 0]]))
    const zing = changing({
      action: 38,
      change: { kind: 'revive', chance: 100, share: { lo: 180, hi: 849 } },
    })
    const { state, events } = playRound(
      fallen,
      new Map([[0, { kind: 'change', changing: zing, target: 1 }]]),
      new BattleRng(4n),
    )
    const hp = revivalHp(0x26, true, 300, 180, 849, 100)
    expect(changeOf(events).hits).toEqual([{ target: 1, result: 'revived', hp }])
    expect(state.fighters[1]?.hp).toBe(hp)
    const standing = playRound(
      startBattle([hero, ally, foe]),
      new Map([[0, { kind: 'change', changing: zing, target: 1 }]]),
      new BattleRng(4n),
    )
    expect(changeOf(standing.events).hits).toEqual([{ target: 1, result: 'resisted' }])
  })

  it('carries Double Up’s defence down on its user, told with it', () => {
    const doubleUp = changing({
      action: 0xad,
      change: { kind: 'attack', by: 2, chance: 100 },
      rider: { slot: 8, levels: -2 },
    })
    const { state, events } = playRound(
      startBattle([hero, foe]),
      new Map([[0, { kind: 'change', changing: doubleUp, target: 0 }]]),
      new BattleRng(5n),
    )
    expect(changeOf(events).rode).toEqual([
      { target: 0, result: 'lowered', level: -2, stat: 'defence' },
    ])
    expect(state.fighters[0]?.states.defence.level).toBe(-2)
    expect(state.fighters[0]?.states.attack?.level).toBe(2)
  })
})

describe('what rides on a blow', () => {
  const blow = (slot: number, levels = 0): Blow => ({
    action: 75,
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
    rider: { slot, chance: { party: 100, foe: 100 }, levels },
  })
  const struck = (slot: number, levels = 0) =>
    playRound(
      startBattle([hero, foe]),
      new Map([[0, { kind: 'blow', blow: blow(slot, levels), target: 1 }]]),
      new BattleRng(6n),
    )
  const rodeOf = (events: readonly BattleEvent[]) => {
    const e = events.find((x) => x.kind === 'blow')
    if (e?.kind !== 'blow') throw new Error('no blow')
    return e.hits[0]?.rode
  }

  it('poisons, and sends to a sleep the blow does not wake', () => {
    const toxic = struck(4)
    expect(rodeOf(toxic.events)).toEqual({ target: 1, result: 'poisoned' })
    expect(toxic.state.fighters[1]?.states.poisoned).toBe(true)
    const hay = struck(7)
    expect(rodeOf(hay.events)).toEqual({ target: 1, result: 'asleep' })
    expect(hay.state.fighters[1]?.states.sleep).toBeDefined()
  })

  it('lowers attack and defence by the rider’s own levels', () => {
    const attack = struck(2, -1)
    expect(rodeOf(attack.events)).toEqual({
      target: 1,
      result: 'lowered',
      level: -1,
      stat: 'attack',
    })
    const helm = struck(8, -1)
    expect(helm.state.fighters[1]?.states.defence.level).toBe(-1)
  })

  it('fells the one struck with death, but never a metal body', () => {
    const stab = struck(20)
    expect(rodeOf(stab.events)).toEqual({ target: 1, result: 'killed' })
    expect(stab.state.fighters[1]?.hp).toBe(0)
    const metal = playRound(
      startBattle([hero, { ...foe, metal: true }]),
      new Map([[0, { kind: 'blow', blow: blow(20), target: 1 }]]),
      new BattleRng(6n),
    )
    expect(rodeOf(metal.events)).toBeUndefined()
  })
})
