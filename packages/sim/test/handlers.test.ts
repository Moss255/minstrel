import { describe, expect, it } from 'vitest'
import {
  type BattleEvent,
  type Blow,
  type Changing,
  DEFAULT_RULES,
  type Fighter,
  playRound,
  startBattle,
  withHp,
} from '../src/battle/battle.ts'
import { dealt } from '../src/battle/damage.ts'
import { revivedHp, scaledAccuracy } from '../src/battle/handlers.ts'
import { BattleRng } from '../src/battle/rng.ts'
import { buffedAttack, buffedMagic, wardMultiplier } from '../src/battle/states.ts'
import {
  scaledAccuracy as oracleAccuracy,
  revivalHp,
  updatedAttack,
  updatedMagic,
  wardLeaves,
} from './game-oracle.ts'

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

  it('raises Caster Sugar’s magical mending by its rider 21 before its might, with no draw', () => {
    const sugar = (rider: boolean) =>
      changing({
        action: 0x1e0,
        change: { kind: 'might', by: 1, chance: 100 },
        ...(rider ? { rider: { slot: 21, levels: 1 } } : {}),
      })
    const play = (rider: boolean) =>
      playRound(
        startBattle([hero, foe]),
        new Map([[0, { kind: 'change', changing: sugar(rider), target: 0 }]]),
        new BattleRng(5n),
      )
    const { state, events } = play(true)
    expect(changeOf(events).rode).toEqual([
      { target: 0, result: 'raised', level: 1, stat: 'mending' },
    ])
    expect(state.fighters[0]?.states.mending?.level).toBe(1)
    expect(state.fighters[0]?.states.might?.level).toBe(1)
    // No draw of its own: everything after it falls as it did without.
    const others = (e: typeof events) => e.filter((x) => x.kind !== 'change')
    expect(others(events)).toEqual(others(play(false).events))
  })
})

describe('Choir of Angels', () => {
  it('heals 0.4 of the most HP rounded half up, at least 75, and clears misfortune', () => {
    const big = { ...hero, maxHp: 400 }
    const start = withHp(
      startBattle([big, ally, foe]),
      new Map([
        [0, 100],
        [1, 10],
      ]),
    )
    const poorly = {
      ...start,
      fighters: start.fighters.map((f, i) =>
        i === 1
          ? { ...f, states: { ...f.states, poisoned: true, defence: { level: -1, turns: 3 } } }
          : f,
      ),
    }
    const choir: Changing = {
      action: 506,
      cost: 0,
      reach: 'all',
      side: 'own',
      change: { kind: 'restore', chance: 100, share: 0.4, least: 75 },
    }
    const { state, events } = playRound(
      poorly,
      new Map([[0, { kind: 'change', changing: choir, target: 0 }]]),
      new BattleRng(8n),
    )
    expect(changeOf(events).hits).toEqual([
      { target: 0, result: 'restored', hp: 160 },
      { target: 1, result: 'restored', hp: 75, cured: true },
    ])
    expect(state.fighters[1]?.states.poisoned).toBe(false)
    expect(state.fighters[1]?.states.defence.level).toBe(0)
  })
})

describe('Egg On', () => {
  it('psyches up the ally named, not its user', () => {
    const { state, events } = playRound(
      startBattle([hero, ally, foe]),
      new Map([
        [0, { kind: 'psyche', action: 168, steps: 1, target: 1 }],
        // The ally keeps it: an Attack would spend it.
        [1, { kind: 'defend' }],
      ]),
      new BattleRng(10n),
    )
    expect(state.fighters[1]?.states.tension).toBe(1)
    expect(state.fighters[0]?.states.tension ?? 0).toBe(0)
    expect(events).toContainEqual({ kind: 'psyche', actor: 0, action: 168, steps: [1], target: 1 })
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

  it('fells with death at a flat 12.5 times the byte, a metal body’s byte passed over (021e4604)', () => {
    const felled = (target: Fighter, seed: bigint) => {
      const { events, state } = playRound(
        startBattle([hero, target]),
        new Map([[0, { kind: 'blow', blow: blow(20), target: 1 }]]),
        new BattleRng(seed),
        { ...DEFAULT_RULES, critical: 0 },
      )
      const rode = rodeOf(events)
      if (rode) expect(state.fighters[1]?.hp).toBe(0)
      return rode?.result === 'killed'
    }
    const count = (target: Fighter) => {
      let n = 0
      for (let seed = 1n; seed <= 400n; seed++) if (felled(target, seed)) n++
      return n
    }
    // The action's own chance, a hundred here, is not what it lands by.
    const plain = count(foe)
    expect(plain).toBeGreaterThan(25)
    expect(plain).toBeLessThan(80)
    // A byte of 0 refuses it; half halves it; a metal body takes the flat chance.
    const resist = (byte: number) => Array.from({ length: 21 }, (_, i) => (i === 10 ? byte : 100))
    expect(count({ ...foe, resist: resist(0) })).toBe(0)
    expect(count({ ...foe, resist: resist(50) })).toBeLessThan(plain)
    expect(count({ ...foe, metal: true, resist: resist(0) })).toBeGreaterThan(0)
  })

  it('refuses a fall of attack against a byte of 0, and lands it under the byte', () => {
    const resist = Array.from({ length: 21 }, (_, i) => (i === 17 ? 0 : 100))
    const { events } = playRound(
      startBattle([hero, { ...foe, resist }]),
      new Map([[0, { kind: 'blow', blow: blow(2, -1), target: 1 }]]),
      new BattleRng(6n),
    )
    expect(rodeOf(events)).toBeUndefined()
  })
})

describe('a metal body', () => {
  it('takes 0 or 1 from an Attack that is not a critical', () => {
    const metal = { ...foe, metal: true }
    const noCriticals = { ...DEFAULT_RULES, critical: 0 }
    for (let seed = 1n; seed <= 20n; seed++) {
      const { events } = playRound(
        startBattle([hero, metal]),
        new Map([[0, { kind: 'attack', target: 1 }]]),
        new BattleRng(seed),
        noCriticals,
      )
      const hit = events.find((e) => e.kind === 'attack' && e.actor === 0)
      if (hit?.kind !== 'attack') throw new Error('no attack')
      expect(hit.damage).toBeLessThanOrEqual(1)
    }
  })
})

describe('magical might and mending at their levels — kinds 42 and 38', () => {
  it('is the oracle at every stat and level', () => {
    for (let stat = 0; stat <= 1200; stat++)
      for (let level = -2; level <= 2; level++)
        expect(buffedMagic(stat, level)).toBe(updatedMagic(stat, level))
  })

  it('moves a half a level, and holds anyone to 999', () => {
    expect(buffedMagic(100, 1)).toBe(150)
    expect(buffedMagic(100, 2)).toBe(200)
    expect(buffedMagic(101, -1)).toBe(50)
    expect(buffedMagic(101, -2)).toBe(0)
    expect(buffedMagic(700, 1)).toBe(999)
  })

  it('raises Care Prayer’s mending, which a raising then scales by', () => {
    const prayer = changing({ action: 151, change: { kind: 'mending', by: 1, chance: 100 } })
    const { state, events } = playRound(
      startBattle([hero, ally, foe]),
      new Map([[0, { kind: 'change', changing: prayer, target: 0 }]]),
      new BattleRng(3n),
    )
    expect(changeOf(events).hits).toEqual([{ target: 0, result: 'raised', level: 1 }])
    expect(state.fighters[0]?.states.mending?.level).toBe(1)
  })

  it('says it is already as high as it goes, with nothing moved', () => {
    const prayer = changing({ action: 151, change: { kind: 'mending', by: 2, chance: 100 } })
    const start = startBattle([hero, ally, foe])
    const high = {
      ...start,
      fighters: start.fighters.map((f, i) =>
        i === 0 ? { ...f, states: { ...f.states, mending: { level: 2, turns: 7 } } } : f,
      ),
    }
    const { events } = playRound(
      high,
      new Map([[0, { kind: 'change', changing: prayer, target: 0 }]]),
      new BattleRng(3n),
    )
    expect(changeOf(events).hits).toEqual([{ target: 0, result: 'already' }])
  })
})

describe('the resistances to spells and to breaths — kinds 22 and 23', () => {
  it('leaves a spell or breath 1 − a quarter a level, the oracle’s', () => {
    for (let level = -2; level <= 2; level++) expect(wardMultiplier(level)).toBe(wardLeaves(level))
    expect([2, 1, -1, -2].map(wardMultiplier)).toEqual([0.5, 0.75, 1.25, 1.5])
  })

  it('multiplies after the resistance and before the guard, each its own multiply', () => {
    const rng = new BattleRng(1n)
    expect(dealt(rng, 100, { critical: false, resistance: 1, spellWard: 0.5 })).toBe(50)
    expect(dealt(rng, 100, { critical: false, resistance: 0.5, breathWard: 0.75 })).toBe(37)
    expect(dealt(rng, 99, { critical: false, resistance: 1, spellWard: 0.75, guard: 0.5 })).toBe(37)
  })

  it('lessens a monster’s spell on those Wizard Ward has warded', () => {
    const frizz = {
      action: 13,
      cost: 0,
      does: 'harm' as const,
      reach: 'one' as const,
      amount: { base: 40, spread: 0 },
      kind: 1,
      magic: true,
    }
    const mage: Fighter = { ...foe, maxMp: 10, acts: [{ kind: 'spell', spell: frizz }] }
    const ward = changing({
      action: 156,
      reach: 'all',
      change: { kind: 'spells', by: 2, chance: 100 },
    })
    const warded = playRound(
      startBattle([hero, ally, mage]),
      new Map([
        [0, { kind: 'change', changing: ward, target: 0 }],
        [1, { kind: 'defend' }],
      ]),
      new BattleRng(5n),
    )
    expect(changeOf(warded.events).hits).toEqual([
      { target: 0, result: 'raised', level: 2 },
      { target: 1, result: 'raised', level: 2 },
    ])
    const cast = (state: typeof warded.state) =>
      playRound(
        state,
        new Map([
          [0, { kind: 'defend' }],
          [1, { kind: 'defend' }],
        ]),
        new BattleRng(9n),
      ).events.find((e) => e.kind === 'spell')
    const plain = cast(startBattle([hero, ally, mage]))
    const lessened = cast(warded.state)
    if (plain?.kind !== 'spell' || lessened?.kind !== 'spell') throw new Error('no spell')
    // Defending does nothing to it: this one does not say it is defendable.
    expect(plain.hits[0]?.amount).toBe(40)
    expect(lessened.hits[0]?.amount).toBe(20)
  })

  it('says “But nothing happens” for Spooky Aura on one already at the bottom', () => {
    const aura = changing({
      action: 155,
      side: 'other',
      change: { kind: 'spells', by: -1, chance: 100 },
    })
    const start = startBattle([hero, ally, foe])
    const low = {
      ...start,
      fighters: start.fighters.map((f, i) =>
        i === 2 ? { ...f, states: { ...f.states, spells: { level: -2, turns: 7 } } } : f,
      ),
    }
    const { events } = playRound(
      low,
      new Map([[0, { kind: 'change', changing: aura, target: 2 }]]),
      new BattleRng(5n),
    )
    expect(changeOf(events).hits).toEqual([{ target: 2, result: 'already', lowering: true }])
  })
})

describe('Wave of Relief — kind 41, the cure-all alone', () => {
  it('clears poison and every level below 0, the new ones among them, and heals nothing', () => {
    const start = withHp(startBattle([hero, ally, foe]), new Map([[1, 10]]))
    const poorly = {
      ...start,
      fighters: start.fighters.map((f, i) =>
        i === 1
          ? {
              ...f,
              states: {
                ...f.states,
                poisoned: true,
                might: { level: -1, turns: 3 },
                breaths: { level: 1, turns: 3 },
              },
            }
          : f,
      ),
    }
    const wave = changing({ action: 154, reach: 'all', change: { kind: 'relieve', chance: 100 } })
    const { state, events } = playRound(
      poorly,
      new Map([[0, { kind: 'change', changing: wave, target: 0 }]]),
      new BattleRng(8n),
    )
    expect(changeOf(events).hits).toEqual([
      { target: 0, result: 'relieved' },
      { target: 1, result: 'relieved', cured: true },
    ])
    expect(state.fighters[1]?.hp).toBe(10)
    expect(state.fighters[1]?.states.poisoned).toBe(false)
    expect(state.fighters[1]?.states.might?.level).toBe(0)
    // A level above 0 is not a misfortune.
    expect(state.fighters[1]?.states.breaths?.level).toBe(1)
  })
})

describe('Antimagic and a fizzled caster — kind 16', () => {
  const antimagic = changing({
    action: 81,
    side: 'other',
    change: { kind: 'fizzle', chance: 100 },
  })
  it('fizzles one, and says so again for one already fizzled', () => {
    const once = playRound(
      startBattle([hero, ally, foe]),
      new Map([[0, { kind: 'change', changing: antimagic, target: 2 }]]),
      new BattleRng(4n),
    )
    expect(changeOf(once.events).hits).toEqual([{ target: 2, result: 'fizzled' }])
    expect(once.state.fighters[2]?.states.fizzled?.level).toBe(1)
    const twice = playRound(
      once.state,
      new Map([[0, { kind: 'change', changing: antimagic, target: 2 }]]),
      new BattleRng(4n),
    )
    expect(changeOf(twice.events).hits).toEqual([{ target: 2, result: 'fizzled', again: true }])
  })

  it('puts out a fizzled caster’s spell as 914: nothing cast, nothing spent', () => {
    const frizz = {
      action: 13,
      cost: 2,
      does: 'harm' as const,
      reach: 'one' as const,
      amount: { base: 40, spread: 0 },
      kind: 1,
      magic: true,
    }
    const start = startBattle([hero, ally, foe])
    const fizzled = {
      ...start,
      fighters: start.fighters.map((f, i) =>
        i === 0 ? { ...f, states: { ...f.states, fizzled: { level: 1, turns: 7 } } } : f,
      ),
    }
    const { state, events } = playRound(
      fizzled,
      new Map([
        [0, { kind: 'spell', spell: frizz, target: 2 }],
        [1, { kind: 'defend' }],
      ]),
      new BattleRng(4n),
    )
    expect(events).toContainEqual({
      kind: 'spell',
      actor: 0,
      action: 13,
      short: false,
      fizzled: true,
      critical: false,
      hits: [],
    })
    expect(state.fighters[0]?.mp).toBe(hero.maxMp)
    expect(state.fighters[2]?.hp).toBe(foe.maxHp)
    // A change that is a spell likewise; one that is not goes ahead.
    const sap = changing({
      action: 43,
      side: 'other',
      magic: true,
      change: { kind: 'defence', by: -1, chance: 100 },
    })
    const sapped = playRound(
      fizzled,
      new Map([[0, { kind: 'change', changing: sap, target: 2 }]]),
      new BattleRng(4n),
    )
    expect(changeOf(sapped.events)).toMatchObject({ fizzled: true, hits: [] })
    const shout = { ...sap, magic: false }
    const shouted = playRound(
      fizzled,
      new Map([[0, { kind: 'change', changing: shout, target: 2 }]]),
      new BattleRng(4n),
    )
    expect(changeOf(shouted.events).fizzled).toBeUndefined()
  })
})

describe('Tingle — kind 20', () => {
  it('frees the paralysed, and finds nothing to do on anyone else', () => {
    const tingle = changing({ action: 36, change: { kind: 'unparalyse', chance: 100 } })
    const start = startBattle([hero, ally, foe])
    const stuck = {
      ...start,
      fighters: start.fighters.map((f, i) =>
        i === 1 ? { ...f, states: { ...f.states, paralysed: { level: 1, turns: 3 } } } : f,
      ),
    }
    const freed = playRound(
      stuck,
      new Map([[0, { kind: 'change', changing: tingle, target: 1 }]]),
      new BattleRng(2n),
    )
    expect(changeOf(freed.events).hits).toEqual([{ target: 1, result: 'unparalysed' }])
    expect(freed.state.fighters[1]?.states.paralysed).toBeUndefined()
    const idle = playRound(
      start,
      new Map([[0, { kind: 'change', changing: tingle, target: 1 }]]),
      new BattleRng(2n),
    )
    expect(changeOf(idle.events).hits).toEqual([{ target: 1, result: 'resisted' }])
  })
})
