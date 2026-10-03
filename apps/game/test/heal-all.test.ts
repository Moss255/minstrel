import { describe, expect, it } from 'vitest'
import { HEALS, type Healer, healAll } from '../src/heal-all.ts'

const COST: Record<number, number> = { 30: 2, 31: 4, 32: 8, 33: 24, 34: 16, 35: 2, 784: 128 }
const cost = (action: number) => COST[action] ?? 0
const member = (over: Partial<Healer> & { spells?: number[] }): Healer => {
  const spells = new Set(over.spells ?? [])
  return { hp: 50, maxHp: 50, mp: 0, vocation: 1, knows: (a) => spells.has(a), ...over }
}
// A roll that is the spell's least, every time: Heal 30, Midheal 80, Moreheal 170, Multiheal 100.
const LEAST: Record<number, number> = { 30: 30, 31: 80, 32: 170, 34: 100 }
const roll = (action: number) => LEAST[action] ?? 0

describe('Heal All', () => {
  it('says nothing happens when nobody is hurt, or nobody can heal', () => {
    expect(
      healAll([member({}), member({ vocation: 2, mp: 20, spells: [30] })], roll, cost).nothing,
    ).toBe(true)
    expect(healAll([member({ hp: 10 }), member({ vocation: 1, mp: 20 })], roll, cost).nothing).toBe(
      true,
    )
  })

  it('heals each member in party order with the smallest heal that will do, and spends its MP', () => {
    const run = healAll(
      [
        member({ hp: 30, maxHp: 50 }), // short 20: Heal
        member({ vocation: 2, hp: 40, maxHp: 100, mp: 20, spells: [30, 31] }), // the Priest, short 60: Midheal
      ],
      roll,
      cost,
    )
    expect(run.casts.map((c) => [c.action, c.caster, c.targets])).toEqual([
      [HEALS.heal, 1, [0]],
      [HEALS.midheal, 1, [1]],
    ])
    expect(run.hp).toEqual([50, 100])
    expect(run.mp[1]).toBe(20 - 2 - 4)
    expect(run.nothing).toBe(false)
  })

  it('ranks a Priest above a Minstrel, and passes over a Warrior', () => {
    const run = healAll(
      [
        member({ vocation: 1, hp: 30, mp: 30, spells: [30] }),
        member({ vocation: 6, mp: 30, spells: [30] }),
        member({ vocation: 2, mp: 30, spells: [30] }),
      ],
      roll,
      cost,
    )
    expect(run.casts.map((c) => c.caster)).toEqual([2])
  })

  it('steps down a spell when the MP is short, and stops when even Heal is', () => {
    const run = healAll(
      [member({ vocation: 2, hp: 1, maxHp: 100, mp: 3, spells: [30, 31] })],
      roll,
      cost,
    )
    // Short 99 wants Midheal (4 MP); with 3 it casts Heal, then has 1 left.
    expect(run.casts.map((c) => c.action)).toEqual([HEALS.heal])
    expect(run.mp).toEqual([1])
    expect(run.hp).toEqual([31])
  })

  it('casts Multiheal only for four, all hurt enough', () => {
    const hurt = (vocation = 1, spells: number[] = []) =>
      member({ vocation, hp: 1, maxHp: 120, mp: 60, spells })
    const four = healAll([hurt(2, [30, 31, 34]), hurt(), hurt(), hurt()], roll, cost)
    expect(four.casts[0]?.action).toBe(HEALS.multiheal)
    expect(four.casts[0]?.targets).toEqual([0, 1, 2, 3])
    const three = healAll([hurt(2, [30, 31, 34]), hurt(), hurt()], roll, cost)
    expect(three.casts.some((c) => c.action === HEALS.multiheal)).toBe(false)
  })

  it('leaves the fallen as they are', () => {
    const run = healAll(
      [member({ hp: 0 }), member({ vocation: 2, hp: 20, mp: 10, spells: [30] })],
      roll,
      cost,
    )
    expect(run.hp[0]).toBe(0)
    expect(run.casts.every((c) => !c.targets.includes(0))).toBe(true)
  })
})
