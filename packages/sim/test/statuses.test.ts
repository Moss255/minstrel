import { describe, expect, it } from 'vitest'
import {
  type BattleEvent,
  type BattleState,
  blockOf,
  type Changing,
  type Command,
  evadeOf,
  type Fighter,
  playRound,
  startBattle,
  withHp,
  withMp,
} from '../src/battle/battle.ts'
import { holyResistance } from '../src/battle/damage.ts'
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

describe('Rotstopper — kind 40', () => {
  it('halves what a monster of family 8 deals its holder, and nothing else’s', () => {
    const zombie: Fighter = { ...foe, attack: 400, family: 8 }
    const other: Fighter = { ...foe, attack: 400, family: 7 }
    const soft: Fighter = { ...hero, defence: 0, maxHp: 999 }
    const bite = (monster: Fighter, rot: boolean, seed: bigint) => {
      const start = startBattle([soft, monster])
      const state = {
        ...start,
        fighters: start.fighters.map((f, i) =>
          i === 0 && rot ? { ...f, states: { ...f.states, rotstop: { level: 1, turns: 4 } } } : f,
        ),
      }
      const { events } = playRound(state, new Map([[0, { kind: 'defend' }]]), new BattleRng(seed))
      const e = events.find((x) => x.kind === 'attack' && x.actor === 1)
      return e?.kind === 'attack' ? e.damage : -1
    }
    for (const seed of [1n, 2n, 3n]) {
      const whole = bite(zombie, false, seed)
      // A quarter, give or take the floats: its half, and the Hero's guard's.
      expect(Math.abs(bite(zombie, true, seed) - whole / 2)).toBeLessThanOrEqual(1)
      expect(bite(zombie, true, seed)).toBeLessThan(whole)
      expect(bite(other, true, seed)).toBe(bite(other, false, seed))
    }
  })
})

describe('Alma Mater — kind 39', () => {
  const almaOn = (i: number, fighters: Fighter[]) => {
    const start = startBattle(fighters)
    return {
      ...start,
      fighters: start.fighters.map((f, k) =>
        k === i ? { ...f, states: { ...f.states, alma: { level: 1, turns: 6 } } } : f,
      ),
    }
  }
  it('keeps one Whacked at 1 HP, says so, and goes', () => {
    const whack = status(24, 'kill', { side: 'other', change: { kind: 'kill', chance: 100 } })
    const { state, events } = playRound(almaOn(1, [hero, foe]), using(whack, 1), new BattleRng(2n))
    expect(changeOf(events).hits).toEqual([{ target: 1, result: 'spared' }])
    expect(state.fighters[1]?.hp).toBe(1)
    expect(state.fighters[1]?.states.alma).toBeUndefined()
    // Without it, Whack fells them.
    const plain = playRound(startBattle([hero, foe]), using(whack, 1), new BattleRng(2n))
    expect(changeOf(plain.events).hits).toEqual([{ target: 1, result: 'killed' }])
  })

  it('does not spare from a kill of kind 17 not in its list', () => {
    const other = status(999, 'kill', { side: 'other', change: { kind: 'kill', chance: 100 } })
    const { events } = playRound(almaOn(1, [hero, foe]), using(other, 1), new BattleRng(2n))
    expect(changeOf(events).hits).toEqual([{ target: 1, result: 'killed' }])
  })
})

describe('Holy Impregnable — kind 64', () => {
  it('takes 25 off the resistance to the elements 9 to 21, held at nothing, and none off the rest', () => {
    const bytes = Array.from({ length: 21 }, (_, i) => (i === 9 ? 10 : 100))
    expect(holyResistance(bytes, 10)).toBe(0)
    expect(holyResistance(bytes, 11)).toBe(Math.fround(0.75))
    expect(holyResistance(bytes, 8)).toBe(1)
    expect(holyResistance(bytes, 3)).toBe(1)
    expect(holyResistance(undefined, 16)).toBe(Math.fround(0.75))
  })

  it('keeps a sleep off one whose resistance it brings to nothing', () => {
    const sleepy: Fighter = {
      ...hero,
      resist: Array.from({ length: 21 }, (_, i) => (i === 9 ? 20 : 100)),
    }
    const snooze = status(46, 'sleep', {
      side: 'other',
      element: 10,
      change: { kind: 'sleep', chance: 100 },
    })
    const start = startBattle([sleepy, foe])
    const holy = {
      ...start,
      fighters: start.fighters.map((f, i) =>
        i === 0 ? { ...f, states: { ...f.states, holy: { level: 1, turns: 5 } } } : f,
      ),
    }
    // The monster puts the Hero to sleep: under Holy Impregnable it never
    // lands; without it, it sometimes does.
    const casting = (state: BattleState) => ({
      ...state,
      fighters: state.fighters.map((f, i) =>
        i === 1 ? { ...f, acts: [{ kind: 'change' as const, changing: snooze }] } : f,
      ),
    })
    const slept = (state: BattleState) => {
      let landed = 0
      let cast = 0
      for (let seed = 0; seed < 200; seed++) {
        const { events } = playRound(
          casting(state),
          new Map([[0, { kind: 'defend' }]]),
          new BattleRng(BigInt(seed)),
        )
        const e = events.find((x) => x.kind === 'change' && x.actor === 1)
        if (e?.kind !== 'change') continue
        cast++
        if (e.hits.some((h) => h.result === 'asleep')) landed++
      }
      expect(cast).toBeGreaterThan(100)
      return landed
    }
    expect(slept(holy)).toBe(0)
    expect(slept(start)).toBeGreaterThan(0)
  })
})

describe('Tap Dance and Immense Defence — kinds 25 and 37, levels whose flag doubles', () => {
  const level = (kind: 'evasion' | 'shield', by: number) =>
    status(kind === 'evasion' ? 803 : 136, kind, {
      change: { kind, by, chance: 100 } as Changing['change'],
    })

  it('moves the level by the record’s +0x30 and sets its count of 5, a pass off for its own', () => {
    const start = startBattle([hero, foe])
    for (const kind of ['evasion', 'shield'] as const) {
      const { state, events } = playRound(start, using(level(kind, 2)), new BattleRng(3n))
      expect(changeOf(events).hits).toEqual([{ target: 0, result: 'raised', level: 2 }])
      // Set at 5, then a pass less after its holder's own action (`func_ov000_021599f4`).
      expect(state.fighters[0]?.states[kind]).toEqual({ level: 2, turns: 4 })
    }
  })

  it('doubles the evasion and the chance of blocking, in floats, while the level is not 0', () => {
    const states = startBattle([hero]).fighters[0]?.states ?? ({} as never)
    const dancer = { ...hero, evade: 7.5, block: 12.25, states }
    expect(evadeOf(dancer, { dodge: 0 } as never)).toBe(7.5)
    expect(blockOf(dancer)).toBe(12.25)
    const held = {
      ...dancer,
      states: { ...states, evasion: { level: 1, turns: 5 }, shield: { level: -1, turns: 5 } },
    }
    expect(evadeOf(held, { dodge: 0 } as never)).toBe(15)
    // The flag, not the level's size or sign, is what the block reads.
    expect(blockOf(held)).toBe(24.5)
  })
})

describe('Disruptive Wave — kind 49', () => {
  it('clears every level, the given statuses and the tension, but not poison or dazzle', () => {
    const start = startBattle([hero, foe])
    const charged: BattleState = {
      ...start,
      fighters: start.fighters.map((f, i) =>
        i === 1
          ? {
              ...f,
              states: {
                ...f.states,
                attack: { level: 2, turns: 3 },
                shield: { level: 1, turns: 5 },
                fizzled: { level: 1, turns: 6 },
                vanished: { level: 1, turns: 5 },
                decoy: 'mist',
                tension: 2,
                dazzled: { level: 2, turns: 4 },
                poisoned: true,
              },
            }
          : f,
      ),
    }
    const wave = status(189, 'dispel', { side: 'other', reach: 'group' })
    const { state, events } = playRound(charged, using(wave, 1), new BattleRng(9n))
    expect(changeOf(events).hits).toEqual([{ target: 1, result: 'dispelled', calmed: true }])
    const after = state.fighters[1]?.states
    expect(after?.attack?.level).toBe(0)
    expect(after?.shield?.level).toBe(0)
    expect(after?.fizzled?.level).toBe(0)
    expect(after?.vanished).toBeUndefined()
    expect(after?.decoy).toBeUndefined()
    expect(after?.tension).toBe(0)
    expect(after?.dazzled?.level).toBe(2)
    expect(after?.poisoned).toBe(true)
  })
})

describe('Mens Sana — kind 43', () => {
  const sana = status(162, 'sound')
  const holding = (states: Partial<BattleState['fighters'][number]['states']>) => {
    const start = startBattle([hero, foe])
    return {
      ...start,
      fighters: start.fighters.map((f, i) =>
        i === 0 ? { ...f, states: { ...f.states, ...states } } : f,
      ),
    } as BattleState
  }

  it('clears poison, Fizzle and every level below 0, and leaves the raised', () => {
    const { state, events } = playRound(
      holding({
        poisoned: true,
        fizzled: { level: 1, turns: 6 },
        attack: { level: -1, turns: 5 },
        defence: { level: 2, turns: 6 },
      }),
      using(sana),
      new BattleRng(4n),
    )
    expect(changeOf(events).hits).toEqual([{ target: 0, result: 'eradicated' }])
    const after = state.fighters[0]?.states
    expect(after?.poisoned).toBe(false)
    expect(after?.fizzled?.level).toBe(0)
    expect(after?.attack?.level).toBe(0)
    expect(after?.defence?.level).toBe(2)
  })

  it('says its fail line where there is nothing to clear', () => {
    const { events } = playRound(holding({}), using(sana), new BattleRng(4n))
    expect(changeOf(events).hits).toEqual([{ target: 0, result: 'resisted' }])
  })
})

describe('H-Pathy and M-Pathy — kinds 14 and 13', () => {
  const ally: Fighter = { ...hero, name: 'Ally' }
  const pathy = (gives: 'hp' | 'mp') =>
    ({
      action: gives === 'hp' ? 183 : 184,
      cost: 0,
      change: {
        kind: 'pathy',
        chance: 100,
        gives,
        amount: { base: 30, spread: 0, party: { min: 30, max: 30 } },
      },
      reach: 'one',
      side: 'own',
    }) as Changing

  it('gives HP held to the room, and takes all it drew from the user', () => {
    const start = withHp(startBattle([hero, ally, foe]), new Map([[1, 90]]))
    const { state, events } = playRound(
      start,
      new Map<number, Command>([[0, { kind: 'change', changing: pathy('hp'), target: 1 }]]),
      new BattleRng(2n),
    )
    expect(changeOf(events).hits).toEqual([{ target: 1, result: 'shared', hp: 10 }])
    expect(state.fighters[1]?.hp).toBe(100)
    expect(state.fighters[0]?.hp).toBe(70)
  })

  it('gives MP held to the room, and takes only what it gave', () => {
    const start = withMp(startBattle([hero, ally, foe]), new Map([[1, 70]]))
    const { state, events } = playRound(
      start,
      new Map<number, Command>([[0, { kind: 'change', changing: pathy('mp'), target: 1 }]]),
      new BattleRng(2n),
    )
    expect(changeOf(events).hits).toEqual([{ target: 1, result: 'shared', mp: 10 }])
    expect(state.fighters[1]?.mp).toBe(80)
    expect(state.fighters[0]?.mp).toBe(70)
  })

  it('shares nothing with one at their most, and says the fail line', () => {
    const { events } = playRound(
      startBattle([hero, ally, foe]),
      new Map<number, Command>([[0, { kind: 'change', changing: pathy('hp'), target: 1 }]]),
      new BattleRng(2n),
    )
    expect(changeOf(events).hits).toEqual([{ target: 1, result: 'resisted' }])
  })
})

describe('Bounce and Reverse Cycle — kinds 31 and 32, a pass turned back', () => {
  const frizz = {
    action: 13,
    cost: 0,
    does: 'harm',
    reach: 'one',
    amount: { base: 12, spread: 0 },
    reflectable: true,
  } as const
  const under = (states: object) => {
    const start = startBattle([hero, foe])
    return {
      ...start,
      fighters: start.fighters.map((f, i) =>
        i === 1 ? { ...f, states: { ...f.states, ...states } } : f,
      ),
    } as BattleState
  }
  const casts = (spell: object) =>
    new Map<number, Command>([[0, { kind: 'spell', spell, target: 1 } as Command]])

  it('sets either with its count of 5', () => {
    for (const kind of ['bounce', 'reverse'] as const) {
      const { state, events } = playRound(
        startBattle([hero, foe]),
        using(status(55, kind)),
        new BattleRng(3n),
      )
      expect(changeOf(events).hits).toEqual([{ target: 0, result: 'given' }])
      expect(state.fighters[0]?.states[kind]?.level).toBe(1)
    }
  })

  it('turns a spell a wall of light may turn back on its caster, under Bounce', () => {
    const { state, events } = playRound(
      under({ bounce: { level: 1, turns: 5 } }),
      casts(frizz),
      new BattleRng(6n),
    )
    const cast = events.find((e) => e.kind === 'spell')
    expect(cast?.kind === 'spell' && cast.hits).toEqual([
      { target: 0, amount: 12, turned: 'bounce' },
    ])
    // Drawn as the slime would draw it, and struck on the Hero who cast it.
    expect(state.fighters[1]?.hp).toBe(999)
  })

  it('lets a spell without the flag through, and turns back a breath only under Reverse Cycle', () => {
    const plain = playRound(
      under({ bounce: { level: 1, turns: 5 } }),
      casts({ ...frizz, reflectable: false }),
      new BattleRng(6n),
    )
    const hit = plain.events.find((e) => e.kind === 'spell')
    expect(hit?.kind === 'spell' && hit.hits[0]?.target).toBe(1)
    const breath = playRound(
      under({ reverse: { level: 1, turns: 5 } }),
      casts({ ...frizz, reflectable: false, breath: true }),
      new BattleRng(6n),
    )
    const back = breath.events.find((e) => e.kind === 'spell')
    expect(back?.kind === 'spell' && back.hits[0]).toMatchObject({ target: 0, turned: 'reverse' })
  })
})
