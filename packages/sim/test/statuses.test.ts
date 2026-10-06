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

describe('Vanish — kind 54', () => {
  it('sets its count of 5, and says its done line', () => {
    const { state, events } = playRound(
      startBattle([hero, foe]),
      using(status(199, 'vanish')),
      new BattleRng(5n),
    )
    expect(changeOf(events).hits).toEqual([{ target: 0, result: 'given' }])
    // A pass less after its holder's own action (`021599f4`).
    expect(state.fighters[0]?.states.vanished).toEqual({ level: 1, turns: 4 })
  })

  it('halves its holder in a monster’s weighted pick, after the total is made', () => {
    // Two of the party at 2 each: the vanished one weighs 1 of a total still
    // 4, so a draw of 1 takes them, 2 and 3 the other, and 4 passes both and
    // falls to the even draw — 3 in 8 for the vanished, where it was 4 in 8.
    const ally: Fighter = { ...hero, name: 'Ally', agility: 254 }
    const biter: Fighter = { ...foe, attack: 1, agility: 0 }
    const defend = new Map<number, Command>([
      [0, { kind: 'defend' }],
      [1, { kind: 'defend' }],
    ])
    const picks = (vanished: boolean) => {
      let hero = 0
      for (let seed = 0; seed < 800; seed++) {
        const start = startBattle([hero0, ally, biter])
        const state = vanished
          ? {
              ...start,
              fighters: start.fighters.map((f, i) =>
                i === 0 ? { ...f, states: { ...f.states, vanished: { level: 1, turns: 5 } } } : f,
              ),
            }
          : start
        const { events } = playRound(state, defend, new BattleRng(BigInt(seed)))
        const bite = events.find((e) => e.kind === 'attack' && e.actor === 2)
        if (bite?.kind === 'attack' && bite.target === 0) hero++
      }
      return hero / 800
    }
    const hero0 = hero
    expect(picks(false)).toBeCloseTo(0.5, 1)
    expect(Math.abs(picks(true) - 0.375)).toBeLessThan(0.05)
  })
})

describe('dazzle — kind 19, Flower Power and Scandal Eyes', () => {
  const dazzle = (sort: number) =>
    status(103, 'dazzle', { side: 'other', change: { kind: 'dazzle', chance: 100, sort } })
  const dazzled = (sort: number) => ({
    ...startBattle([hero, foe]),
    fighters: startBattle([hero, foe]).fighters.map((f, i) =>
      i === 1 ? { ...f, states: { ...f.states, dazzled: { level: sort, turns: 4 } } } : f,
    ),
  })

  it('dazzles of its sort with a count of 4, and tells one already of that sort so', () => {
    const once = playRound(startBattle([hero, foe]), using(dazzle(2), 1), new BattleRng(5n))
    expect(changeOf(once.events).hits).toEqual([{ target: 1, result: 'given' }])
    const again = playRound(dazzled(2), using(dazzle(2), 1), new BattleRng(5n))
    expect(changeOf(again.events).hits).toEqual([{ target: 1, result: 'given', again: true }])
    // Of another sort, it is a fresh dazzle, and takes the new sort.
    const other = playRound(dazzled(1), using(dazzle(2), 1), new BattleRng(5n))
    expect(changeOf(other.events).hits).toEqual([{ target: 1, result: 'given' }])
  })

  it('throws a die of eight after the accuracy of a dazzled striker’s Attack, missing on five', () => {
    // The monster, dazzled, attacks the Hero: a miss deals nothing and draws no damage.
    let missed = 0
    let draws = 0
    for (let seed = 0; seed < 400; seed++) {
      const rng = new BattleRng(BigInt(seed))
      const { events } = playRound(dazzled(2), new Map([[0, { kind: 'defend' }]]), rng)
      const bite = events.find((e) => e.kind === 'attack' && e.actor === 1)
      if (bite?.kind !== 'attack') continue
      draws++
      if (bite.missed) {
        missed++
        expect(bite.damage).toBe(0)
      }
    }
    expect(Math.abs(missed / draws - 5 / 8)).toBeLessThan(0.06)
  })

  it('throws no die for one not dazzled', () => {
    const plain = playRound(
      startBattle([hero, foe]),
      new Map([[0, { kind: 'defend' }]]),
      new BattleRng(9n),
    )
    expect(plain.events.some((e) => e.kind === 'attack' && e.missed)).toBe(false)
  })
})

describe('Schizofanic and Mist Me — kinds 36 and 55', () => {
  it('takes the decoy, and loses it to the first blow a shield may block, with no draw of the roll’s', () => {
    const given = playRound(startBattle([hero, foe]), using(status(200, 'mist')), new BattleRng(5n))
    expect(changeOf(given.events).hits).toEqual([{ target: 0, result: 'given' }])
    // The monster bit after the Hero acted: the mist took it, and is gone.
    const bite = given.events.find((e) => e.kind === 'attack' && e.actor === 1)
    expect(bite).toMatchObject({ target: 0, damage: 0, missed: true, absorbed: 'mist' })
    expect(given.state.fighters[0]?.states.decoy).toBeUndefined()
  })

  it('spends one draw fewer on the absorbed blow than on one that lands', () => {
    const decoyed = (decoy: 'schizofanic' | undefined) => {
      const start = startBattle([hero, foe])
      return {
        ...start,
        fighters: start.fighters.map((f, i) =>
          i === 0 && decoy ? { ...f, states: { ...f.states, decoy } } : f,
        ),
      }
    }
    const defend = new Map<number, Command>([[0, { kind: 'defend' }]])
    const a = new BattleRng(11n)
    const b = new BattleRng(11n)
    const with_ = playRound(decoyed('schizofanic'), defend, a)
    playRound(decoyed(undefined), defend, b)
    const bite = with_.events.find((e) => e.kind === 'attack' && e.actor === 1)
    expect(bite).toMatchObject({ missed: true, absorbed: 'schizofanic' })
    // No accuracy draw, and no damage's draws, where the other spent them.
    expect(a.drawn).toBeLessThan(b.drawn)
  })
})
