import { describe, expect, it } from 'vitest'
import {
  type BattleEvent,
  type BattleState,
  type Command,
  type Fighter,
  playRound,
  startBattle,
  withHp,
  withMp,
} from '../src/battle/battle.ts'
import { BattleRng } from '../src/battle/rng.ts'
import {
  guardOf,
  hpShare,
  PINCUSHION,
  SELFLESS_AT,
  STANCE,
  STANCES,
} from '../src/battle/stances.ts'

/**
 * The stances — status `+0x21`, read 7 October 2026: taken up as the round
 * begins, then a guard (1–3), a counter (4, 5) or a cover (6–8). See
 * `docs/readings/T18-handlers.md` §13.
 */

const member = (name: string, over: Partial<Fighter> = {}): Fighter => ({
  name,
  side: 'party',
  maxHp: 200,
  maxMp: 50,
  attack: 80,
  defence: 40,
  agility: 10,
  shield: false,
  exp: 0,
  gold: 0,
  level: 30,
  ...over,
})
const slime: Fighter = {
  name: 'slime',
  side: 'foes',
  maxHp: 500,
  maxMp: 0,
  attack: 90,
  defence: 10,
  agility: 200,
  shield: false,
  exp: 1,
  gold: 1,
}
const stance = (action: number, cost = 0, target?: number): Command => ({
  kind: 'stance',
  action,
  stance: STANCES.get(action) as number,
  cost,
  ...(target === undefined ? {} : { target }),
})
const attacks = (events: readonly BattleEvent[]) =>
  events.flatMap((e) => (e.kind === 'attack' ? [e] : []))
/** Rounds from many seeds — a monster's aim is drawn. */
function rounds(start: BattleState, commands: ReadonlyMap<number, Command>, n = 40) {
  return Array.from({ length: n }, (_, seed) =>
    playRound(start, commands, new BattleRng(BigInt(seed + 1))),
  )
}

describe('the stance table — `0x02182e24`', () => {
  it('names the six stances by their actions', () => {
    expect(STANCES.get(96)).toBe(STANCE.counter)
    expect(STANCES.get(135)).toBe(STANCE.champion)
    expect(STANCES.get(138)).toBe(STANCE.backAtcha)
    expect(STANCES.get(146)).toBe(STANCE.whippingBoy)
    expect(STANCES.get(185)).toBe(STANCE.selfless)
    expect(STANCES.get(182)).toBe(STANCE.forbearance)
    expect(STANCES.get(3)).toBe(STANCE.defend)
  })

  it('guards by the table at `0x020e88c0`: Defend a half, Defending Champion a tenth', () => {
    expect(guardOf({ defending: true })).toBe(0.5)
    expect(guardOf({ defending: false, stance: STANCE.champion })).toBe(0.1)
    expect(guardOf({ defending: false, stance: 3 })).toBe(0)
    expect(guardOf({ defending: false, stance: STANCE.counter })).toBe(1)
    expect(guardOf({ defending: false })).toBe(1)
  })

  it('reads Selflessness’s line as the HP over the most, in floats, at 0.08 or under', () => {
    expect(hpShare(16, 200) <= SELFLESS_AT).toBe(true)
    expect(hpShare(17, 200) <= SELFLESS_AT).toBe(false)
    expect(hpShare(0, 200)).toBe(0)
  })
})

describe('taken up as the round begins', () => {
  it('spends the MP before anyone acts, and clears the stance at the round’s end', () => {
    const start = startBattle([member('Hero'), slime])
    const { state, events } = playRound(start, new Map([[0, stance(135, 3)]]), new BattleRng(3n))
    expect(state.fighters[0]?.mp).toBe(47)
    expect(state.fighters[0]?.stance).toBeUndefined()
    expect(events.find((e) => e.kind === 'stance')).toMatchObject({ actor: 0, action: 135 })
  })

  it('short of the MP sets nothing, spends nothing, and says so at its turn', () => {
    const start = withMp(startBattle([member('Hero'), slime]), new Map([[0, 2]]))
    for (const { state, events } of rounds(start, new Map([[0, stance(135, 3)]]), 10)) {
      expect(state.fighters[0]?.mp).toBe(2)
      expect(events.find((e) => e.kind === 'stance')).toMatchObject({ short: true })
    }
  })

  it('guards with Defending Champion’s tenth against the monster’s attack', () => {
    const start = startBattle([member('Hero'), slime])
    const plain = rounds(start, new Map([[0, { kind: 'attack', target: 1 }]]))
    const champion = rounds(start, new Map([[0, stance(135)]]))
    const taken = (rs: typeof plain) =>
      rs.flatMap((r) => attacks(r.events).filter((a) => a.target === 0 && !a.dodged && !a.blocked))
    const most = (rs: typeof plain) => Math.max(...taken(rs).map((a) => a.damage))
    expect(taken(champion).length).toBeGreaterThan(0)
    expect(most(champion)).toBeLessThan(most(plain) / 4)
  })
})

describe('Counter Wait and Back Atcha — the redirection, `0x021ea15c` on', () => {
  it('Counter Wait strikes back at the one who struck, and is not struck', () => {
    const start = startBattle([member('Hero'), slime])
    for (const { state, events } of rounds(start, new Map([[0, stance(96)]]))) {
      const a = attacks(events)[0]
      expect(a).toMatchObject({ actor: 0, target: 1, countered: { stance: 4, from: 1 } })
      expect(state.fighters[0]?.hp).toBe(200)
    }
  })

  it('Back Atcha strikes a monster drawn among those standing', () => {
    const start = startBattle([member('Hero'), slime, { ...slime, agility: 1 }])
    const struck = new Set<number>()
    for (const { events } of rounds(start, new Map([[0, stance(138)]]))) {
      for (const a of attacks(events)) {
        expect(a.actor).toBe(0)
        expect(a.countered?.stance).toBe(5)
        struck.add(a.target)
      }
    }
    expect([...struck].sort()).toEqual([1, 2])
  })

  it('one asleep does not counter', () => {
    const start = startBattle([member('Hero'), slime])
    const asleep: BattleState = {
      ...start,
      fighters: start.fighters.map((f, i) =>
        i === 0 ? { ...f, states: { ...f.states, sleep: 0 } } : f,
      ),
    }
    for (const { events } of rounds(asleep, new Map([[0, stance(96)]]), 10)) {
      expect(attacks(events).every((a) => a.countered === undefined)).toBe(true)
    }
  })
})

describe('the cover — `func_ov024_021e9b74`', () => {
  it('Forbearance takes every attack aimed at the others', () => {
    const start = startBattle([member('Hero'), member('Ally'), slime])
    let covered = 0
    for (const { events } of rounds(start, new Map([[1, stance(182)]]))) {
      for (const a of attacks(events).filter((x) => x.actor === 2)) {
        expect(a.target).toBe(1)
        if (a.covered) {
          expect(a.covered).toEqual({ stance: 8, for: 0 })
          covered++
        }
      }
    }
    expect(covered).toBeGreaterThan(0)
  })

  it('Selflessness takes it only for one at 8 in 100 of their most HP or under', () => {
    const at = (hp: number) =>
      rounds(
        withHp(startBattle([member('Hero'), member('Ally'), slime]), new Map([[0, hp]])),
        new Map([[1, stance(185)]]),
      ).flatMap((r) => attacks(r.events).filter((x) => x.actor === 2))
    expect(at(16).some((a) => a.covered?.stance === 7)).toBe(true)
    expect(at(16).every((a) => a.target === 1)).toBe(true)
    expect(at(17).some((a) => a.covered !== undefined)).toBe(false)
  })

  it('Whipping Boy takes it for the one they protect, and no other', () => {
    const start = startBattle([member('Hero'), member('Ally'), member('Third'), slime])
    const hits = rounds(start, new Map([[1, stance(146, 0, 0)]]), 60).flatMap((r) =>
      attacks(r.events).filter((x) => x.actor === 3),
    )
    expect(hits.some((a) => a.covered?.stance === 6 && a.covered.for === 0)).toBe(true)
    expect(hits.some((a) => a.target === 2 && a.covered === undefined)).toBe(true)
    expect(hits.every((a) => a.target !== 0)).toBe(true)
  })
})

describe('Pincushion — status `+0x18` bit 5', () => {
  const spikes: Command = { kind: 'stance', action: PINCUSHION, stance: 0, cost: 0 }

  it('halves what defending works on, by itself and after a stance’s guard', () => {
    expect(guardOf({ defending: false, spiked: true })).toBe(0.5)
    expect(guardOf({ defending: true, spiked: true })).toBe(0.25)
    expect(guardOf({ defending: false, stance: STANCE.champion, spiked: true })).toBe(
      Math.fround(0.1 * 0.5),
    )
  })

  it('pricks the one who struck with a quarter of what it dealt, and goes at the round’s end', () => {
    const start = startBattle([member('Hero'), slime])
    let pricked = 0
    for (const { state, events } of rounds(start, new Map([[0, spikes]]))) {
      expect(state.fighters[0]?.spiked).toBeUndefined()
      const hit = attacks(events).find((a) => a.actor === 1)
      const prick = events.find((e) => e.kind === 'pricked')
      if (!hit || hit.damage <= 0) {
        expect(prick).toBeUndefined()
        continue
      }
      expect(prick).toEqual({
        kind: 'pricked',
        actor: 1,
        by: 0,
        damage: Math.trunc(Math.fround(hit.damage * 0.25)),
      })
      pricked++
    }
    expect(pricked).toBeGreaterThan(0)
  })

  it('pricks a metal body by a draw below 2', () => {
    const start = startBattle([member('Hero'), { ...slime, metal: true }])
    for (const { events } of rounds(start, new Map([[0, spikes]]))) {
      for (const e of events) if (e.kind === 'pricked') expect(e.damage).toBe(1)
    }
  })
})
