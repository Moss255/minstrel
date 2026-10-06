import { describe, expect, it } from 'vitest'
import {
  BattleRng,
  COUP_LEVEL,
  type Command,
  coupHpTerm,
  coupRounds,
  type Fighter,
  playRound,
  startBattle,
} from '../src/index.ts'

const member = (coup?: Fighter['coup']): Fighter => ({
  name: 'Hero',
  side: 'party',
  maxHp: 999,
  maxMp: 0,
  attack: 20,
  defence: 999,
  agility: 50,
  shield: false,
  exp: 0,
  gold: 0,
  ...(coup ? { coup } : {}),
})
const slime: Fighter = {
  name: 'slime',
  side: 'foes',
  maxHp: 9999,
  maxMp: 0,
  attack: 10,
  defence: 7,
  agility: 1,
  shield: false,
  exp: 1,
  gold: 1,
}
const defend = new Map<number, Command>([[0, { kind: 'defend' }]])

describe('the coup de grâce', () => {
  it('takes a share of HP as a term, a tenth to nine tenths', () => {
    expect(coupHpTerm(0, 100)).toBe(0)
    expect(coupHpTerm(9, 100)).toBe(0)
    expect(coupHpTerm(10, 100)).toBe(1)
    expect(coupHpTerm(55, 100)).toBe(16)
    expect(coupHpTerm(90, 100)).toBe(90)
    expect(coupRounds(10)).toBe(7)
    expect(coupRounds(75)).toBe(10)
  })

  it('draws for one of the party only from level 10 in their vocation', () => {
    // Open to the slime's blow, so that it always deals something and makes
    // its draw to rouse (`func_ov000_02157288`) — which a blow of nothing,
    // the coin's 0, would not.
    const open = (coup?: Fighter['coup']): Fighter => ({ ...member(coup), defence: 0 })
    const drawn = (level: number) => {
      const rng = new BattleRng(7n)
      playRound(startBattle([open({ level, bonus: 0 }), slime]), defend, rng)
      return rng.drawn
    }
    // At their Defend's pass, after it, and at the slime's blow's pass: three draws.
    expect(drawn(COUP_LEVEL) - drawn(COUP_LEVEL - 1)).toBe(3)
    const none = new BattleRng(7n)
    playRound(startBattle([open(), slime]), defend, none)
    expect(none.drawn).toBe(drawn(COUP_LEVEL - 1))
  })

  it('comes ready, is told after the action, and passes when its rounds run out', () => {
    // A term of 100 after acting: ready at once.
    let state = startBattle([member({ level: 10, bonus: 100 }), slime])
    const rng = new BattleRng(3n)
    const first = playRound(state, defend, rng)
    const kinds = first.events.map((e) => e.kind)
    expect(kinds.indexOf('primed')).toBeGreaterThan(kinds.indexOf('defend'))
    // Seven, less the round's end it came ready in.
    expect(first.state.fighters[0]?.primed).toBe(coupRounds(10) - 1)
    state = first.state
    const passed: number[] = []
    for (let round = 1; round <= 7; round++) {
      const next = playRound(state, defend, rng)
      if (next.events.some((e) => e.kind === 'coupPassed')) passed.push(round)
      state = next.state
      // Ready, it is drawn for no more.
      if (passed.length === 0) expect(state.fighters[0]?.primed).toBe(coupRounds(10) - 1 - round)
    }
    // Held through six command phases, gone at the sixth round's end.
    expect(passed[0]).toBe(6)
  })

  it('is spent by a coup, with no draw after it — they were ready as it ended', () => {
    const state = startBattle([member({ level: 10, bonus: 100 }), slime])
    const rng = new BattleRng(3n)
    const ready = playRound(state, defend, rng).state
    // The after-draw comes before the coup is cleared (`0x021ed324`, then
    // `0x021ed3cc`): ready still, they are not drawn for.
    const used = playRound(ready, new Map([[0, { kind: 'wait', action: 510 }]]), rng).state
    expect(used.fighters[0]?.primed).toBeUndefined()
    // The next action draws again.
    expect(playRound(used, defend, rng).state.fighters[0]?.primed).toBe(coupRounds(10) - 1)
  })
})
