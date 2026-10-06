import { describe, expect, it } from 'vitest'
import { type BattleState, type Fighter, startBattle } from '../src/battle/battle.ts'
import { DROP_CHANCES, DropRng, dropsWon } from '../src/battle/drops.ts'

const hero: Fighter = {
  name: 'Hero',
  side: 'party',
  maxHp: 20,
  maxMp: 6,
  attack: 12,
  defence: 8,
  agility: 8,
  shield: false,
  exp: 0,
  gold: 0,
}

/** A foe of a kind, with an ordinary drop at one step and a rare at another. */
const foe = (kind: number, ordinary: number, rare: number): Fighter => ({
  name: `monster ${kind}`,
  side: 'foes',
  maxHp: 8,
  maxMp: 0,
  attack: 10,
  defence: 7,
  agility: 7,
  shield: false,
  exp: 2,
  gold: 4,
  kind,
  drops: [
    { item: 100 + kind, step: ordinary },
    { item: 200 + kind, step: rare },
  ],
})

/** The battle over, with the foes at these places having fled. */
function afterFlight(state: BattleState, fled: readonly number[]): BattleState {
  return {
    ...state,
    fighters: state.fighters.map((f, i) => (fled.includes(i) ? { ...f, fled: true } : f)),
  }
}

describe('the generator a drop is rolled from', () => {
  it('steps as the C library’s does, and draws its bits 16 to 30', () => {
    const rng = new DropRng(1)
    // The same generator, worked here from its own definition, in whole
    // numbers wide enough to hold the multiply.
    let state = 1n
    const drawn = [rng.next(), rng.next(), rng.next(), rng.next(), rng.next()]
    const want = drawn.map(() => {
      state = (state * 0x41c64e6dn + 0x3039n) % 2n ** 32n
      return Number((state >> 16n) & 0x7fffn)
    })
    expect(drawn).toEqual(want)
    expect(rng.drawn).toBe(5)
  })

  it('draws below a maximum as `func_02032370` does, and lands on 0', () => {
    const rng = new DropRng(12345)
    for (let i = 0; i < 100; i++) {
      const before = rng.drawn
      const draw = rng.below(8)
      expect(draw).toBeGreaterThanOrEqual(0)
      expect(draw).toBeLessThan(8)
      expect(rng.drawn).toBe(before + 1)
    }
  })

  it('lands about one time in the chance, over many battles', () => {
    const rng = new DropRng(99)
    let landed = 0
    const tries = 16_000
    for (let i = 0; i < tries; i++) if (rng.below(8) === 0) landed++
    // One in eight of 16,000 is 2,000.
    expect(landed).toBeGreaterThan(1800)
    expect(landed).toBeLessThan(2200)
  })
})

describe('what a won battle drops', () => {
  it('is the game’s table: always, one in 8 to one in 256, and never', () => {
    expect([...DROP_CHANCES]).toEqual([1, 8, 16, 32, 64, 128, 256, 0])
  })

  it('rolls the rare drop first, and does not roll the ordinary when it lands', () => {
    const rng = new DropRng(7)
    // Both always: the rare wins, and one draw is spent.
    const won = dropsWon(startBattle([hero, foe(1, 0, 0)]), rng)
    expect(won).toEqual([{ item: 201, from: 'monster 1', kind: 1, rare: true }])
    expect(rng.drawn).toBe(1)
  })

  it('falls through to the ordinary where the rare never drops, and spends no draw on it', () => {
    const rng = new DropRng(7)
    const won = dropsWon(startBattle([hero, foe(1, 0, 7)]), rng)
    expect(won).toEqual([{ item: 101, from: 'monster 1', kind: 1, rare: false }])
    expect(rng.drawn).toBe(1)
  })

  it('drops nothing, and rolls nothing, where neither drop can land', () => {
    const rng = new DropRng(7)
    expect(dropsWon(startBattle([hero, foe(1, 7, 7)]), rng)).toEqual([])
    expect(rng.drawn).toBe(0)
  })

  it('rolls once for a kind, however many of them stood', () => {
    const rng = new DropRng(7)
    const three = startBattle([hero, foe(1, 0, 7), foe(1, 0, 7), foe(1, 0, 7)])
    expect(dropsWon(three, rng).map((d) => d.item)).toEqual([101])
    expect(rng.drawn).toBe(1)
  })

  it('rolls a kind whose monsters did not all flee, and skips one whose did', () => {
    const rng = new DropRng(7)
    const battle = startBattle([hero, foe(1, 0, 7), foe(1, 0, 7), foe(2, 0, 7)])
    // The first slime fled; the second did not, so the kind is still beaten.
    expect(dropsWon(afterFlight(battle, [1, 3]), rng).map((d) => d.item)).toEqual([101])
    expect(rng.drawn).toBe(1)
  })

  it('pays nothing for a kind that fled to the last one', () => {
    const rng = new DropRng(7)
    const battle = startBattle([hero, foe(1, 0, 0), foe(1, 0, 0)])
    expect(dropsWon(afterFlight(battle, [1, 2]), rng)).toEqual([])
    expect(rng.drawn).toBe(0)
  })

  it('takes at most eight, however many kinds were beaten', () => {
    const rng = new DropRng(7)
    const many = [hero, ...Array.from({ length: 10 }, (_, i) => foe(i + 1, 0, 7))]
    expect(dropsWon(startBattle(many), rng)).toHaveLength(8)
  })
})

describe('Autofilch’s four further passes', () => {
  /** The battle three rounds in, the Hero standing for `rounds` of them. */
  const after = (state: BattleState, rounds: number): BattleState => ({
    ...state,
    round: 3,
    fighters: state.fighters.map((f) => (f.side === 'party' ? { ...f, rounds } : f)),
  })
  const filch = { fighter: 0, level: 50, autofilch: true }

  it('rolls again for a member who holds it and stood half the rounds, scaled by their level', () => {
    // Step 1 is one in 8; at level 50 the pass's is one in 16 — 8 × 100 ÷ 50.
    const battle = after(startBattle([hero, foe(1, 1, 7)]), 2)
    const rng = new DropRng(3)
    const won = dropsWon(battle, rng, [filch])
    // The ordinary roll, then the Hero's pass: two draws, whatever landed.
    expect(rng.drawn).toBe(2)
    for (const drop of won.slice(1)) expect(drop.by).toBe(0)
    // Worked by hand: the same generator, one in 8 then one in 16.
    const twin = new DropRng(3)
    const first = twin.below(8) === 0
    const second = twin.below(16) === 0
    expect(won.map((d) => d.by)).toEqual([...(first ? [undefined] : []), ...(second ? [0] : [])])
  })

  it('passes over a member without it, fallen, or standing under half the rounds', () => {
    const battle = startBattle([hero, foe(1, 1, 7)])
    for (const [state, who] of [
      [after(battle, 3), { ...filch, autofilch: false }],
      [after(battle, 1), filch],
      [
        {
          ...after(battle, 3),
          fighters: after(battle, 3).fighters.map((f, i) => (i === 0 ? { ...f, hp: 0 } : f)),
        },
        filch,
      ],
    ] as const) {
      const rng = new DropRng(3)
      dropsWon(state, rng, [who])
      expect(rng.drawn).toBe(1)
    }
  })

  it('never lands a step-0 drop in a further pass', () => {
    const battle = after(startBattle([hero, foe(1, 0, 7)]), 3)
    const won = dropsWon(battle, new DropRng(3), [filch])
    expect(won.map((d) => d.item)).toEqual([101])
  })
})
