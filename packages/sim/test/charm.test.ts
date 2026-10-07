import { describe, expect, it } from 'vitest'
import {
  type BattleEvent,
  type Changing,
  type Command,
  type Fighter,
  playRound,
  startBattle,
} from '../src/battle/battle.ts'
import { BattleRng } from '../src/battle/rng.ts'
import { charmPull, LEVEL_COUNTS, WEAR_OF, WEAR_TABLE } from '../src/battle/states.ts'

/**
 * **Charm** — Extreme Makeover (kind 50, `func_ov024_021e0380`), the level it
 * moves (`func_02087a48`, `02087a9c`, `UpdateCombatantCharm`), and what it
 * does: the charm draws (`func_ov000_0215704c`) and a monster taken by them
 * (`func_ov024_021da670`, `0x021da7dc`–`0x021da8a4`) —
 * `docs/readings/T18-handlers.md` §17.
 */

const hero: Fighter = {
  name: 'Hero',
  side: 'party',
  maxHp: 500,
  maxMp: 80,
  attack: 60,
  defence: 400,
  agility: 1,
  shield: false,
  exp: 0,
  gold: 0,
  level: 40,
  charm: 100,
}
const foe: Fighter = {
  name: 'slime',
  side: 'foes',
  maxHp: 999,
  maxMp: 0,
  attack: 1,
  defence: 5,
  agility: 255,
  shield: false,
  exp: 7,
  gold: 3,
  // `+0x53`, the 22nd: how far it may be taken.
  resist: Array.from({ length: 22 }, () => 100),
}
const makeover: Changing = {
  action: 192,
  cost: 0,
  change: { kind: 'charm', by: 2, chance: 100 },
  reach: 'one',
  side: 'own',
}
const charmedIn = (events: readonly BattleEvent[]) => events.filter((e) => e.kind === 'charmed')
const defending = new Map<number, Command>([[0, { kind: 'defend' }]])

describe('what a member’s charm pulls with — `func_ov000_0215641c`', () => {
  it('is a fiftieth of what the charm is over a hundred, in floats', () => {
    expect(charmPull(100, 0)).toBe(0)
    expect(charmPull(80, 0)).toBe(Math.fround(Math.fround(-20) * Math.fround(0.02)))
    expect(charmPull(150, 0)).toBe(Math.fround(Math.fround(50) * Math.fround(0.02)))
  })

  it('takes the level’s multiplier — 1 below 0, else a half a level more — held at 999', () => {
    // 100 × 1.5 = 150; 100 × 2 = 200; below 0, as it is.
    expect(charmPull(100, 1)).toBe(Math.fround(Math.fround(50) * Math.fround(0.02)))
    expect(charmPull(100, 2)).toBe(Math.fround(Math.fround(100) * Math.fround(0.02)))
    expect(charmPull(100, -2)).toBe(0)
    expect(charmPull(600, 2)).toBe(Math.fround(Math.fround(899) * Math.fround(0.02)))
  })
})

describe('Extreme Makeover — kind 50', () => {
  it('moves charm a level by the record’s, held at 2, with a count of 6', () => {
    const { events, state } = playRound(
      startBattle([hero, foe]),
      new Map<number, Command>([[0, { kind: 'change', changing: makeover, target: 0 }]]),
      new BattleRng(1n),
    )
    const e = events.find((x) => x.kind === 'change')
    expect(e?.kind === 'change' && e.hits[0]).toMatchObject({ result: 'raised', level: 2 })
    expect(state.fighters[0]?.states.charm?.level).toBe(2)
    expect(LEVEL_COUNTS.charm).toBe(6)
    expect(WEAR_OF.charm).toEqual({ table: WEAR_TABLE, start: 4 })
  })
})

describe('the charm draws — `func_ov000_0215704c`', () => {
  const round = (charm: number, level: number, seed: bigint) => {
    const start = startBattle([{ ...hero, charm }, foe])
    const charmed = {
      ...start,
      fighters: start.fighters.map((f, i) =>
        i === 0 && level !== 0 ? { ...f, states: { ...f.states, charm: { level, turns: 6 } } } : f,
      ),
    }
    return playRound(charmed, defending, new BattleRng(seed))
  }

  it('takes no monster with a charm of a hundred or less', () => {
    for (let seed = 0n; seed < 100n; seed++)
      expect(charmedIn(round(100, 0, seed).events)).toEqual([])
  })

  it('takes monsters by a charm above it — mostly enthralled, its turn lost', () => {
    const sorts = [0, 0, 0, 0]
    for (let seed = 0n; seed < 400n; seed++) {
      for (const e of charmedIn(round(100, 2, seed).events)) {
        if (e.kind !== 'charmed') continue
        expect(e.by).toBe(0)
        sorts[e.sort] = (sorts[e.sort] ?? 0) + 1
      }
    }
    // Pulled at 2.0 against R(100): about one round in fifty, nine in ten of them enthralled.
    expect((sorts[1] ?? 0) > 0).toBe(true)
    expect((sorts[1] ?? 0) >= (sorts[2] ?? 0) + (sorts[3] ?? 0)).toBe(true)
  })

  it('takes none whose `+0x53` is nothing, and makes no draw for it', () => {
    const unmoved = { ...foe, resist: Array.from({ length: 22 }, (_, i) => (i === 21 ? 0 : 100)) }
    for (let seed = 0n; seed < 50n; seed++) {
      const { events } = playRound(
        startBattle([{ ...hero, charm: 999 }, unmoved]),
        defending,
        new BattleRng(seed),
      )
      expect(charmedIn(events)).toEqual([])
    }
  })
})
