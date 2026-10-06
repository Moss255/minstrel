import { describe, expect, it } from 'vitest'
import {
  type BattleEvent,
  type Blow,
  type Fighter,
  playRound,
  startBattle,
  withHp,
  withMp,
} from '../src/battle/battle.ts'
import { FALLOFF, handled, passesOf } from '../src/battle/blows.ts'
import { BattleRng } from '../src/battle/rng.ts'

const f = Math.fround
const hero: Fighter = {
  name: 'Hero',
  side: 'party',
  maxHp: 100,
  maxMp: 20,
  attack: 60,
  defence: 10,
  agility: 255,
  shield: false,
  exp: 0,
  gold: 0,
  level: 20,
}
const foe = (name: string, family?: number): Fighter => ({
  name,
  side: 'foes',
  maxHp: 999,
  maxMp: 0,
  attack: 1,
  defence: 5,
  agility: 1,
  shield: false,
  exp: 1,
  gold: 1,
  ...(family === undefined ? {} : { family }),
})
const blow = (over: Partial<Blow>): Blow => ({
  action: 63,
  handler: 0,
  reach: 'one',
  hits: 0,
  criticalPercent: 0,
  element: 8,
  falloff: false,
  evadable: false,
  blockable: false,
  defendable: true,
  tensed: true,
  combos: false,
  after: 0,
  ...over,
})
const scene = (target: { family?: number; party?: boolean } = {}) => ({
  level: 20,
  deftness: 40,
  attack: 60,
  hp: 100,
  party: true,
  target: { party: false, hp: 50, poisoned: false, asleep: false, ...target },
  passes: 1,
})

describe('the abilities’ handlers, as read', () => {
  it('multiplies against the family named, in the game’s float', () => {
    const rng = new BattleRng(1n)
    expect(handled(1, 33, scene({ family: 2 }), rng)?.damage).toBe(Math.trunc(f(f(1.5) * 33)))
    expect(handled(1, 33, scene({ family: 3 }), rng)?.damage).toBe(33)
    expect(handled(16, 33, scene({ family: 11 }), rng)?.damage).toBe(Math.trunc(f(f(1.25) * 33)))
    expect(handled(9, 33, scene(), rng)?.damage).toBe(24)
    expect(handled(17, 33, scene(), rng)?.damage).toBe(66)
    expect(rng.drawn).toBe(0)
  })

  it('works its own number for Gigathrow and Body Slam', () => {
    const a = new BattleRng(7n)
    const b = new BattleRng(7n)
    const r = b.floatBetween(0.85, 1.15)
    expect(handled(29, 1, scene(), a)?.damage).toBe(Math.trunc(f(f(f(125) + f(f(2) * f(20))) * r)))
    expect(handled(35, 1, scene(), new BattleRng(1n))).toEqual({
      damage: Math.trunc(f(f(0.8) * 50)),
      recoil: Math.trunc(f(f(0.8) * 100)) + 2,
    })
  })

  it('makes its passes: repeats all targets a hit at a time, or picks at random', () => {
    const rng = new BattleRng(3n)
    expect(passesOf([4, 5], 1, { threeOrFour: 3, sixToEight: 6 }, rng).passes).toEqual([4, 5, 4, 5])
    const picked = passesOf([4, 5], 3, { threeOrFour: 4, sixToEight: 6 }, rng)
    expect(picked.passes).toHaveLength(4)
    expect(picked.passes.every((t) => t === 4 || t === 5)).toBe(true)
    expect(FALLOFF).toEqual([1, f(0.8), f(0.6), f(0.4), f(0.2)])
  })
})

describe('the monsters’ handlers, as read', () => {
  const at = (level: number) => ({ ...scene(), level, party: false })
  it('works a breath as S·(S/k) + c with its spread, against its floor', () => {
    // Hellfire at level 52: the spread's draw first, then the floor's.
    const twin = new BattleRng(9n)
    const s = f(52)
    const v = f(f(70) + f(s * f(s / f(22))))
    const w = f(v + f(v * twin.floatBetween(-0.1, 0.1)))
    const m = f(f(180) * twin.floatBetween(0.9, 1.1))
    expect(handled(49, 0, at(52), new BattleRng(9n))?.damage).toBe(Math.trunc(w < m ? m : w))
  })

  it('works a spell as (a·S + c) times a draw, against its floor', () => {
    // Starfall at level 10: the multiplier's draw first.
    const twin = new BattleRng(4n)
    const w = f(f(f(50) + f(f(5) * f(10))) * twin.floatBetween(0.9, 1.1))
    const m = f(f(200) * twin.floatBetween(0.9, 1.1))
    expect(handled(56, 0, at(10), new BattleRng(4n))?.damage).toBe(Math.trunc(w < m ? m : w))
    // Wrath of the Gods: half the base and 37.
    expect(handled(57, 41, at(10), new BattleRng(1n))?.damage).toBe(57)
  })
})

describe('a blow in a battle', () => {
  const play = (b: Blow, seed = 5n, foes = [foe('dragon', 2)]) =>
    playRound(
      startBattle([hero, ...foes]),
      new Map([[0, { kind: 'blow', blow: b, target: 1 }]]),
      new BattleRng(seed),
    )

  it('spends the two draws every action makes at its start, then a pass', () => {
    const { events } = play(blow({}))
    const told = events.find((e) => e.kind === 'blow')
    expect(told?.kind === 'blow' && told.hits).toHaveLength(1)
  })

  it('strikes twice with Falcon Slash, each pass its own', () => {
    const { events } = play(blow({ action: 66, handler: 9, hits: 1 }))
    const told = events.find((e) => e.kind === 'blow')
    expect(told?.kind === 'blow' && told.hits.map((h) => h.target)).toEqual([1, 1])
  })

  it('strikes Propeller Blade’s one target twice, the way back never a critical, dodged or blocked', () => {
    const { events } = play(
      blow({ action: 0x61, sure: true, evadable: true, blockable: true }),
      7n,
      [{ ...foe('dragon', 2), evade: 100, block: 100 }],
    )
    const told = events.find((e) => e.kind === 'blow')
    if (told?.kind !== 'blow') throw new Error('no blow')
    expect(told.hits.map((h) => h.target)).toEqual([1, 1])
    // Out: dodged, every time at a hundred; back: struck, as the game clears it.
    expect(told.hits[0]?.dodged).toBe(true)
    expect(told.hits[1]).toMatchObject({ dodged: false, blocked: false, critical: false })
    expect(told.hits[1]?.damage).toBeGreaterThan(0)
  })

  it('gives back an eighth in MP, and takes its recoil', () => {
    const hurt = withHp(startBattle([{ ...hero, maxMp: 999 }, foe('dragon', 2)]), new Map())
    const arrow = playRound(
      { ...hurt, fighters: hurt.fighters.map((x, i) => (i === 0 ? { ...x, mp: 0 } : x)) },
      new Map([[0, { kind: 'blow', blow: blow({ action: 132, after: 1 }), target: 1 }]]),
      new BattleRng(5n),
    )
    const shot = arrow.events.find((e) => e.kind === 'blow')
    if (shot?.kind !== 'blow') throw new Error('no blow')
    expect(shot.regained?.mp).toBe((shot.hits[0]?.damage ?? 0) >> 3)
    const slam = play(blow({ action: 148, handler: 35, after: 3, tensed: false }))
    const told = slam.events.find((e) => e.kind === 'blow')
    expect(told?.kind === 'blow' && told.recoil).toBe(Math.trunc(f(f(0.8) * 100)) + 2)
    // Less the recoil, and whatever the dragon's own blow took after.
    const struck = slam.events.reduce(
      (n, e) => n + (e.kind === 'attack' && e.target === 0 ? e.damage : 0),
      0,
    )
    expect(slam.state.fighters[0]?.hp).toBe(100 - (Math.trunc(f(f(0.8) * 100)) + 2) - struck)
  })
})

describe('an ability’s MP — `func_ov024_021eaa50`, spent by the resolver', () => {
  const at = (mp: number) => withMp(startBattle([hero, foe('dragon', 2)]), new Map([[0, mp]]))
  const play = (b: Blow, mp: number) =>
    playRound(at(mp), new Map([[0, { kind: 'blow', blow: b, target: 1 }]]), new BattleRng(5n))
  const told = (events: readonly { kind: string }[]) => events.find((e) => e.kind === 'blow')

  it('spends the record’s MP before it strikes', () => {
    const { state, events } = play(blow({ cost: 4 }), 10)
    expect(state.fighters[0]?.mp).toBe(6)
    expect(told(events)).toMatchObject({ hits: [{ target: 1 }] })
  })

  it('strikes nothing short of it, "tries to use" and "not enough MP", spending none', () => {
    const { state, events } = play(blow({ cost: 4 }), 3)
    expect(state.fighters[0]?.mp).toBe(3)
    expect(told(events)).toMatchObject({ short: true, hits: [] })
  })

  it('takes all there is for 255, and is short only of none', () => {
    expect(play(blow({ cost: 255 }), 7).state.fighters[0]?.mp).toBe(0)
    expect(told(play(blow({ cost: 255 }), 0).events)).toMatchObject({ short: true })
  })

  it('takes Blockenspiel up as the round begins: its MP then, guarding before the slime strikes', () => {
    const block = blow({ action: 134, cost: 3, atRoundStart: true, after: 2 })
    const slime = { ...foe('slime'), attack: 200, agility: 255 }
    const start = withMp(startBattle([{ ...hero, agility: 1 }, slime]), new Map([[0, 9]]))
    const round = (b: Blow) =>
      playRound(start, new Map([[0, { kind: 'blow', blow: b, target: 1 }]]), new BattleRng(3n))
    const struck = (events: readonly BattleEvent[]) =>
      events.flatMap((e) => (e.kind === 'attack' ? [e.damage] : []))
    const guarded = round(block)
    // Spent once, at the round's start — its turn asks none; the slime, first
    // to act, strikes a guard already up. Played after its blow, it did not.
    expect(guarded.state.fighters[0]?.mp).toBe(6)
    expect(struck(guarded.events)).toEqual([51])
    expect(struck(round({ ...block, atRoundStart: false }).events)).toEqual([102])
    expect(told(guarded.events)).toMatchObject({ hits: [{ target: 1 }] })
  })

  it('short of Blockenspiel’s MP as the round begins, takes up nothing and strikes nothing', () => {
    const block = blow({ action: 134, cost: 3, atRoundStart: true, after: 2 })
    const { state, events } = play(block, 2)
    expect(state.fighters[0]?.mp).toBe(2)
    expect(told(events)).toMatchObject({ short: true, hits: [] })
  })
})
