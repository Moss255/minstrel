import { describe, expect, it } from 'vitest'
import { type Fighter, playRound, type Spell, startBattle, withHp } from '../src/battle/battle.ts'
import { criticalChance } from '../src/battle/damage.ts'
import { BattleRng } from '../src/battle/rng.ts'

const hero: Fighter = {
  name: 'Hero',
  side: 'party',
  maxHp: 50,
  maxMp: 20,
  attack: 30,
  defence: 8,
  agility: 255,
  shield: false,
  exp: 0,
  gold: 0,
}
const ally: Fighter = { ...hero, name: 'Mage', agility: 1 }
const foe = (name: string): Fighter => ({
  name,
  side: 'foes',
  maxHp: 99,
  maxMp: 0,
  attack: 1,
  defence: 5,
  agility: 1,
  shield: false,
  exp: 1,
  gold: 1,
})

describe('whom an action reaches, as the game aims it', () => {
  it('re-picks a fallen monster within its group (`func_ov000_02153aa4`)', () => {
    const start = withHp(
      startBattle([hero, foe('slime'), foe('slime'), foe('slime'), foe('drakee')]),
      new Map([[1, 0]]),
    )
    for (const seed of [1n, 2n, 3n, 4n, 5n, 6n]) {
      const { events } = playRound(
        start,
        new Map([[0, { kind: 'attack', target: 1 }]]),
        new BattleRng(seed),
      )
      const blow = events.find((e) => e.kind === 'attack' && e.actor === 0)
      expect(blow?.kind === 'attack' && [2, 3].includes(blow.target)).toBe(true)
    }
  })

  it('heals the caster when the ally named has fallen (`func_ov000_02153cc0`)', () => {
    const heal: Spell = {
      action: 30,
      cost: 2,
      does: 'heal',
      reach: 'one',
      amount: { base: 35, spread: 5 },
    }
    const start = withHp(
      startBattle([hero, ally, foe('slime')]),
      new Map([
        [0, 10],
        [1, 0],
      ]),
    )
    const { events } = playRound(
      start,
      new Map([[0, { kind: 'spell', spell: heal, target: 1 }]]),
      new BattleRng(1n),
    )
    const cast = events.find((e) => e.kind === 'spell')
    expect(cast?.kind === 'spell' && cast.hits.map((h) => h.target)).toEqual([0])
  })

  it('divides a critical’s chance by the targets it is rolled over (`CalculateCritRate`)', () => {
    const one = criticalChance(400, 50, 1)
    expect(criticalChance(400, 50, 3)).toBe(
      Math.trunc(Math.fround(100 * Math.fround(Math.fround(1 / 3) * Math.fround(0.5 * 4.5)))),
    )
    expect(criticalChance(400, 50, 3)).toBeLessThan(one)
  })
})
