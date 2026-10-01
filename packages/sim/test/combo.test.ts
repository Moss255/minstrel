import { describe, expect, it } from 'vitest'
import { brokenChain, chainStep, NO_CHAIN } from '../src/battle/combo.ts'
import { COMBO_TABLE, comboMultiplier, dealt } from '../src/battle/damage.ts'
import { BattleRng } from '../src/battle/rng.ts'

const blow = (turn: number, over: Partial<Parameters<typeof chainStep>[1]> = {}) => ({
  combos: true,
  side: 'party' as const,
  action: 1,
  target: 4,
  turn,
  ...over,
})

describe('the combo chain, as `func_ov024_021ea584` keeps it', () => {
  it('counts blows from other turns on the same side, with the same action, at the same target', () => {
    const first = chainStep(NO_CHAIN, blow(0))
    expect(first.count).toBe(0)
    const second = chainStep(first, blow(1))
    expect(second.count).toBe(1)
    expect(chainStep(second, blow(2)).count).toBe(2)
    // The same turn leaves it: a spell reaching two of one group.
    expect(chainStep(second, blow(1)).count).toBe(1)
  })

  it('starts again on another side, action or target, and resets on one that does not chain', () => {
    const two = chainStep(chainStep(NO_CHAIN, blow(0)), blow(1))
    expect(chainStep(two, blow(2, { side: 'foes' })).count).toBe(0)
    expect(chainStep(two, blow(2, { action: 9 })).count).toBe(0)
    expect(chainStep(two, blow(2, { target: 5 })).count).toBe(0)
    const reset = chainStep(two, blow(2, { combos: false }))
    expect(reset).toEqual({ ...brokenChain(two), target: 4 })
    expect(reset.side).toBeUndefined()
  })
})

describe('the combo table', () => {
  it('is 1, 1.2, 1.5 and 2, held to 3', () => {
    expect(COMBO_TABLE).toEqual([1, Math.fround(1.2), 1.5, 2])
    expect(comboMultiplier(7)).toBe(2)
  })

  it('multiplies a blow of at least one before the whole number, in the game’s float', () => {
    const plain = dealt(new BattleRng(1n), 10, { critical: false, resistance: 1 })
    const chained = dealt(new BattleRng(1n), 10, { critical: false, resistance: 1, combo: 1 })
    expect(plain).toBe(10)
    expect(chained).toBe(Math.trunc(Math.fround(10 * Math.fround(1.2))))
    // Nothing dealt is not multiplied into something.
    expect(
      dealt(new BattleRng(1n), 0, { critical: false, resistance: 1, dodged: true, combo: 3 }),
    ).toBe(0)
  })
})
