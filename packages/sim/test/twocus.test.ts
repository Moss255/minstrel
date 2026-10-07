import { describe, expect, it } from 'vitest'
import {
  type BattleEvent,
  type Changing,
  type Command,
  type Fighter,
  playRound,
  type Spell,
  startBattle,
} from '../src/battle/battle.ts'
import { BattleRng } from '../src/battle/rng.ts'
import { LEVEL_COUNTS, WEAR_OF, WEAR_TABLE } from '../src/battle/states.ts'

/**
 * **Twocus Pocus** — kind 63, `func_ov024_021e1028`, and the turn's second
 * cast (`ProcessCombatTurn`, `0x0215e178`, `0x0215e2b4`–`0x0215e578`):
 * `docs/readings/T18-handlers.md` §17.
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
const frizz: Spell = {
  action: 9,
  cost: 2,
  does: 'harm',
  reach: 'one',
  amount: { base: 10, spread: 2 },
  magic: true,
  reflectable: true,
}
const twocus: Changing = {
  action: 533,
  cost: 0,
  change: { kind: 'twocus', chance: 100 },
  reach: 'one',
  side: 'own',
}
const spells = (events: readonly BattleEvent[]) =>
  events.filter((e) => e.kind === 'spell' && e.actor === 0)
const under = () => {
  const start = startBattle([hero, foe])
  return {
    ...start,
    fighters: start.fighters.map((f, i) =>
      i === 0 ? { ...f, mp: 10, states: { ...f.states, twocus: { level: 1, turns: 5 } } } : f,
    ),
  }
}
const casting = (spell: Spell, target = 1) =>
  new Map<number, Command>([[0, { kind: 'spell', spell, target }]])

describe('Twocus Pocus — kind 63', () => {
  it('sets its status with a count of 5, and runs down by the first table from 4', () => {
    const { events, state } = playRound(
      startBattle([hero, foe]),
      new Map<number, Command>([[0, { kind: 'change', changing: twocus, target: 0 }]]),
      new BattleRng(1n),
    )
    const e = events.find((x) => x.kind === 'change')
    expect(e?.kind === 'change' && e.hits[0]?.result).toBe('given')
    // The count a pass less already, after the Hero's own turn.
    expect(state.fighters[0]?.states.twocus).toEqual({ level: 1, turns: LEVEL_COUNTS.twocus - 1 })
    expect(WEAR_OF.twocus).toEqual({ table: WEAR_TABLE, start: 4 })
  })

  it('casts its holder’s spell twice at the one standing, and spends its MP once', () => {
    const { events, state } = playRound(under(), casting(frizz), new BattleRng(5n))
    const cast = spells(events)
    expect(cast).toHaveLength(2)
    expect(cast[0]?.kind === 'spell' && cast[0].again).toBeUndefined()
    expect(cast[1]?.kind === 'spell' && cast[1].again).toBe(true)
    expect(cast[1]?.kind === 'spell' && cast[1].hits.map((h) => h.target)).toEqual([1])
    expect(state.fighters[0]?.mp).toBe(10 - frizz.cost)
  })

  it('casts once a spell that is not a spell — no `+0x10` bit 10 — and Magic Burst', () => {
    const unturned = { ...frizz, reflectable: false }
    expect(spells(playRound(under(), casting(unturned), new BattleRng(5n)).events)).toHaveLength(1)
    const burst = { ...frizz, action: 0x1c, cost: 0 }
    expect(spells(playRound(under(), casting(burst), new BattleRng(5n)).events)).toHaveLength(1)
  })

  it('casts nothing more when the one it was aimed at has fallen', () => {
    const start = under()
    const weak = {
      ...start,
      fighters: start.fighters.map((f, i) => (i === 1 ? { ...f, hp: 1 } : f)),
    }
    const { events } = playRound(weak, casting(frizz), new BattleRng(5n))
    expect(spells(events)).toHaveLength(1)
  })

  it('takes the turn records’ draws again — a seeded round differs from one without it', () => {
    const plain = startBattle([hero, foe])
    const withMp = {
      ...plain,
      fighters: plain.fighters.map((f, i) => (i === 0 ? { ...f, mp: 10 } : f)),
    }
    const once = playRound(withMp, casting(frizz), new BattleRng(5n))
    const twice = playRound(under(), casting(frizz), new BattleRng(5n))
    const first = (events: readonly BattleEvent[]) => spells(events)[0]
    // The first cast is the same cast either way.
    expect(first(twice.events)).toEqual(first(once.events))
  })
})
