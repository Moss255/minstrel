import { ActionEffect } from '@minstrel/game-formats'
import { BattleRng } from '@minstrel/sim'
import { describe, expect, it } from 'vitest'
import { ALL_MP, castOn, useOn } from '../src/use.ts'

const rng = () => new BattleRng(1n)
const hurt = { hp: 5, maxHp: 30, mp: 4, maxMp: 10 }
const herb = {
  effect: ActionEffect.RestoresHp,
  message: 22,
  cost: 0,
  range: { base: 35, spread: 5 },
}
const heal = { ...herb, cost: 2 }

describe('using something on the Hero', () => {
  it('heals by its range, no further than the wounds, and not at all when unhurt', () => {
    const used = useOn(herb, hurt, rng())
    expect(used).toEqual({ kind: 'hp', hp: 30, amount: 25, message: 22 })
    expect(useOn(herb, { ...hurt, hp: 30 }, rng())).toEqual({ kind: 'noUse' })
    const small = useOn({ ...herb, range: { base: 3, spread: 0 } }, hurt, rng())
    expect(small).toMatchObject({ kind: 'hp', hp: 8, amount: 3 })
  })

  it('restores all there is when it has no range', () => {
    const elixir = { effect: ActionEffect.RestoresMp, message: 106, cost: 0, range: undefined }
    expect(useOn(elixir, hurt, rng())).toEqual({ kind: 'mp', mp: 10, amount: 6, message: 106 })
    expect(useOn(elixir, { ...hurt, mp: 10 }, rng())).toEqual({ kind: 'noUse' })
  })

  it('raises the number a seed’s message names, by its range', () => {
    const seed = { effect: 0, message: 157, cost: 0, range: { base: 3, spread: 0 } }
    expect(useOn(seed, hurt, rng())).toEqual({
      kind: 'gain',
      stat: 'maxHp',
      amount: 3,
      message: 157,
    })
    expect(useOn({ ...seed, message: 165 }, hurt, rng())).toMatchObject({ stat: 'charm' })
    expect(useOn({ ...seed, message: 166 }, hurt, rng())).toMatchObject({ stat: 'skillPoints' })
  })

  it('has nothing to cure or raise, and says so of what it cannot read', () => {
    const cure = { effect: ActionEffect.CuresPoison, message: 84, cost: 0, range: undefined }
    expect(useOn(cure, hurt, rng())).toEqual({ kind: 'noUse' })
    expect(useOn({ ...cure, effect: ActionEffect.Revives }, hurt, rng())).toEqual({ kind: 'noUse' })
    expect(useOn({ effect: 0, message: 0, cost: 0, range: undefined }, hurt, rng())).toEqual({
      kind: 'unknown',
    })
  })
})

describe('casting a spell on the Hero', () => {
  it('spends its MP when something comes of it', () => {
    const cast = castOn(heal, hurt, rng())
    expect(cast.outcome).toMatchObject({ kind: 'hp', hp: 30 })
    expect(cast.mp).toBe(2)
  })

  it('does not cast without the MP, and spends none when nothing would come of it', () => {
    expect(castOn(heal, { ...hurt, mp: 1 }, rng())).toEqual({
      outcome: { kind: 'notEnoughMp' },
      mp: 1,
    })
    expect(castOn(heal, { ...hurt, hp: 30 }, rng())).toEqual({ outcome: { kind: 'noUse' }, mp: 4 })
  })

  it('spends all there is on a spell that costs it, and needs some to spend', () => {
    const all = { ...heal, cost: ALL_MP }
    expect(castOn(all, hurt, rng()).mp).toBe(0)
    expect(castOn(all, { ...hurt, mp: 0 }, rng()).outcome).toEqual({ kind: 'notEnoughMp' })
  })
})
