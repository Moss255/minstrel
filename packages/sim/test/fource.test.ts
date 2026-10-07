import { describe, expect, it } from 'vitest'
import { type Changing, type Fighter, playRound, startBattle } from '../src/battle/battle.ts'
import { adjustedResistance, dealt } from '../src/battle/damage.ts'
import { BattleRng } from '../src/battle/rng.ts'

/**
 * **The Fources** (kind 46, `func_ov024_021dff3c`), read 7 October 2026 — see
 * `docs/readings/T18-handlers.md` §16: a status of a sort, 1 Fire to 5 Life,
 * lowering its holder's resistance to its elements by 50
 * (`func_ov000_02156b38`) and striking its holder's plain blows by them,
 * times 1.1 (`func_ov024_021e6a90`, `0x021e6f8c`–`0x021e71dc`).
 */
describe('a Fource on its holder’s resistance', () => {
  it('lowers its elements by 50 — Gale both 3 and 4 — and leaves the plain Attack’s', () => {
    expect(adjustedResistance(undefined, 1, false, 1)).toBe(0.5)
    expect(adjustedResistance(undefined, 2, false, 1)).toBe(1)
    expect(adjustedResistance(undefined, 3, false, 3)).toBe(0.5)
    expect(adjustedResistance(undefined, 4, false, 3)).toBe(0.5)
    expect(adjustedResistance(undefined, 8, true, 1)).toBe(1)
    // Held at nothing.
    expect(adjustedResistance([30], 1, false, 1)).toBe(0)
    // Holy Impregnable's −25 is for 9 to 21 only.
    expect(adjustedResistance(undefined, 9, true, 0)).toBe(0.75)
    expect(adjustedResistance(undefined, 1, true, 0)).toBe(1)
  })
})

describe('a Fource on its holder’s blows', () => {
  const rng = () => new BattleRng(1n)
  it('strikes by the target’s byte for its element, times 1.1, after the resistance', () => {
    expect(dealt(rng(), 100, { resistance: 1, fource: [150] })).toBe(165)
    expect(dealt(rng(), 100, { resistance: 0.5, fource: [100] })).toBe(55)
  })
  it('takes the greater of its two elements’ for Gale and Funereal', () => {
    expect(dealt(rng(), 100, { resistance: 1, fource: [50, 120] })).toBe(132)
    expect(dealt(rng(), 100, { resistance: 1, fource: [120, 50] })).toBe(132)
  })
})

describe('Fire Fource cast', () => {
  const hero: Fighter = {
    name: 'Hero',
    side: 'party',
    maxHp: 300,
    maxMp: 50,
    attack: 100,
    defence: 40,
    agility: 255,
    shield: false,
    exp: 0,
    gold: 0,
    level: 30,
  }
  const slime: Fighter = {
    name: 'slime',
    side: 'foes',
    maxHp: 9999,
    maxMp: 0,
    attack: 1,
    defence: 5,
    agility: 0,
    shield: false,
    exp: 1,
    gold: 1,
  }
  it('gives its holder the Fource of its sort, with a count of 5', () => {
    const fire: Changing = {
      action: 177,
      cost: 0,
      reach: 'one',
      side: 'own',
      change: { kind: 'fource', chance: 100, sort: 1 },
    }
    const { state, events } = playRound(
      startBattle([hero, slime]),
      new Map([[0, { kind: 'change', changing: fire, target: 0 }]]),
      new BattleRng(3n),
    )
    const change = events.find((e) => e.kind === 'change')
    expect(change?.kind === 'change' && change.hits).toEqual([{ target: 0, result: 'given' }])
    expect(state.fighters[0]?.states.fource?.level).toBe(1)
  })
})
