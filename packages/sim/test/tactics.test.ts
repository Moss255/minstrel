import { describe, expect, it } from 'vitest'
import {
  type BattleState,
  type Fighter,
  type FighterState,
  playRound,
  startBattle,
  withHp,
} from '../src/battle/battle.ts'
import { BattleRng } from '../src/battle/rng.ts'
import {
  type AiRecord,
  commandPhaseChoice,
  type MemberTactics,
  MONSTER_ID,
  TACTIC,
  tacticCommand,
  turnChoice,
} from '../src/battle/tactics.ts'

/**
 * Task 17b — the party's tactics, `docs/readings/T17-ai.md` §2 and §2b. Every
 * record here is built in code; the cases are worked by hand from the game's
 * own arithmetic, each step a float's.
 */

const f = Math.fround

interface Fields {
  readonly id: number
  readonly cost?: number
  /** 1 the monsters, 2 one's own. */
  readonly side?: number
  readonly element?: number
  readonly inBattle?: boolean
  readonly atRoundStart?: boolean
  readonly flags10?: number
  readonly reach?: number
  readonly rider?: number
  readonly kind?: number
  readonly list?: number
  readonly scaleMode?: number
  readonly handler?: number
  readonly hitCode?: number
  readonly levels?: number
  readonly range?: AiRecord['range']
}

/** A 60-byte action record with these fields at their places. */
function record(r: Fields): AiRecord {
  const raw = new Uint8Array(60)
  const v = new DataView(raw.buffer)
  v.setUint32(4, r.id & 0xfff, true)
  v.setUint32(
    8,
    ((r.cost ?? 0) |
      ((r.side ?? 1) << 8) |
      ((r.element ?? 8) << 22) |
      ((r.inBattle ?? true) ? 1 << 27 : 0) |
      (r.atRoundStart ? 1 << 28 : 0)) >>>
      0,
    true,
  )
  v.setUint32(0x10, r.flags10 ?? 0, true)
  v.setUint32(0x14, ((r.reach ?? 2) << 28) >>> 0, true)
  v.setUint32(
    0x18,
    ((r.rider ?? 0) |
      ((r.kind ?? 1) << 5) |
      ((r.list ?? 0) << 12) |
      ((r.scaleMode ?? 0) << 16) |
      ((r.handler ?? 0) << 18)) >>>
      0,
    true,
  )
  v.setUint32(0x1c, ((r.hitCode ?? 0) << 14) >>> 0, true)
  v.setInt16(0x30, r.levels ?? 0, true)
  return { raw, range: r.range }
}

const ATTACK = record({ id: 1, kind: 1, side: 1, reach: 2 })
const HEAL = record({
  id: 30,
  cost: 2,
  kind: 2,
  side: 2,
  reach: 2,
  list: 2,
  range: { spread: 5, party: 35, peak: 35 },
})
const BLAST = record({
  id: 200,
  cost: 2,
  kind: 1,
  side: 1,
  reach: 2,
  list: 2,
  element: 1,
  range: { spread: 0, party: 60, peak: 60 },
})
const DEFENDING_CHAMPION = record({ id: 0x87, kind: 0, side: 2, reach: 1, atRoundStart: true })
const SELFLESSNESS = record({ id: 0xb9, kind: 0, side: 2, reach: 8, atRoundStart: true })
const records = new Map<number, AiRecord>([
  [1, ATTACK],
  [30, HEAL],
  [200, BLAST],
  [0x87, DEFENDING_CHAMPION],
  [0xb9, SELFLESSNESS],
])

const member = (over: Partial<Fighter> = {}): Fighter => ({
  name: 'member',
  side: 'party',
  maxHp: 100,
  maxMp: 50,
  attack: 60,
  defence: 10,
  agility: 50,
  shield: false,
  exp: 0,
  gold: 0,
  level: 20,
  ...over,
})
const foe = (over: Partial<Fighter> = {}): Fighter => ({
  name: 'slime',
  side: 'foes',
  maxHp: 50,
  maxMp: 0,
  attack: 10,
  defence: 10,
  agility: 1,
  shield: false,
  exp: 1,
  gold: 1,
  kind: 1,
  ...over,
})
const tactics = (tactic: number, over: Partial<MemberTactics> = {}): MemberTactics => ({
  tactic,
  spells: [],
  abilities: [],
  items: [],
  ...over,
})

function battle(fighters: readonly Fighter[], hp?: ReadonlyMap<number, number>): BattleState {
  const started = startBattle(fighters)
  const wounded = hp ? withHp(started, hp) : started
  return { ...wounded, actionRecords: records }
}

describe('the setting up', () => {
  it('draws 44 numbers at a member’s turn: one thrown away, 21 coins, 21 values, a factor', () => {
    const state = battle([
      member({ name: 'Hero' }),
      member({ tactics: tactics(TACTIC.fightWisely) }),
      foe(),
    ])
    const rng = new BattleRng(0x1234n)
    turnChoice(state, state.fighters, 1, records, rng)
    expect(rng.drawn).toBe(44)
  })

  it('draws nothing in the command phase', () => {
    const state = battle([
      member({ name: 'Hero' }),
      member({ tactics: tactics(TACTIC.focusOnHealing) }),
      foe(),
    ])
    expect(commandPhaseChoice(state, state.fighters, 1, records, undefined, new Map())).toBe(
      undefined,
    )
  })

  it('makes no choice for one following orders', () => {
    const state = battle([member(), member({ tactics: tactics(TACTIC.followOrders) }), foe()])
    const rng = new BattleRng(1n)
    expect(turnChoice(state, state.fighters, 1, records, rng)).toBe(undefined)
    expect(rng.drawn).toBe(0)
  })
})

describe('the scorer, worked by hand', () => {
  it('heals the weakest under Fight Wisely: 100 × 35 ÷ 100, doubled, less a tenth of the cost', () => {
    // The Hero at 30 of 100 — under Fight Wisely's 0.4 — is the weakest. Heal's
    // range is 35 to 35, not scaling: its mean (35 + 35) × 0.5 = 35, all of
    // which the Hero is missing. Its heal is 100 × 35 ÷ 100 = 35, doubled for
    // the weakest, 70; less 0.1 × its cost of 2: list 6, taken first.
    const state = battle(
      [
        member({ name: 'Hero' }),
        member({
          tactics: tactics(TACTIC.fightWisely, { spells: [{ action: 30 }] }),
        }),
        foe(),
      ],
      new Map([[0, 30]]),
    )
    const choice = turnChoice(state, state.fighters, 1, records, new BattleRng(99n))
    expect(choice).toEqual({ action: 30, bag: -1, group: 0, target: 0 })
    expect(f(f(f(f(100) * 35) / 100) * 2) - f(f(0.1) * 2)).toBeCloseTo(69.8, 4)
  })

  it('leaves a heal alone with nobody under the line, and strikes the weakest monster', () => {
    const state = battle([
      member({ name: 'Hero' }),
      member({ tactics: tactics(TACTIC.fightWisely, { spells: [{ action: 30 }] }) }),
      foe({ maxHp: 50 }),
      foe({ maxHp: 50 }),
    ])
    const hurt = withHp(state, new Map([[3, 20]]))
    const choice = turnChoice(hurt, hurt.fighters, 1, records, new BattleRng(7n))
    // Fight Wisely with fewer than four turns needed takes list 3 — what costs
    // nothing — where the Attack on each is scored; the one at 20 of 50 is the
    // better kill.
    expect(choice?.action).toBe(1)
    expect(choice?.target).toBe(MONSTER_ID + 3)
  })

  it('casts under Show No Mercy what deals more than the Attack', () => {
    // The member's blow: (60 − 10 ÷ 2) ÷ 2 = 27.5, its least 0.9375 of it,
    // 25.78125 — Show No Mercy weighs the least alone. Its harm, 100 ×
    // 25.78125 ÷ 50 = 51.5625. The spell's least is 60, held to the
    // monster's 50: a harm of 100, less 0.01 × 2 — 99.98, the better in list 2.
    const state = battle([
      member({ name: 'Hero' }),
      member({ tactics: tactics(TACTIC.showNoMercy, { spells: [{ action: 200 }] }) }),
      foe(),
    ])
    const choice = turnChoice(state, state.fighters, 1, records, new BattleRng(5n))
    expect(choice).toEqual({ action: 200, bag: -1, group: 0, target: MONSTER_ID + 2 })
  })

  it('takes the Attack under Show No Mercy when the spell cannot be paid for', () => {
    const state = battle([
      member({ name: 'Hero' }),
      member({ maxMp: 0, tactics: tactics(TACTIC.showNoMercy, { spells: [{ action: 200 }] }) }),
      foe(),
    ])
    const choice = turnChoice(state, state.fighters, 1, records, new BattleRng(5n))
    expect(choice?.action).toBe(1)
  })

  it('pays nothing under Don’t Use MP: the spell is passed over', () => {
    const state = battle([
      member({ name: 'Hero' }),
      member({ tactics: tactics(TACTIC.dontUseMp, { spells: [{ action: 200 }] }) }),
      foe(),
    ])
    const choice = turnChoice(state, state.fighters, 1, records, new BattleRng(5n))
    expect(choice?.action).toBe(1)
  })
})

describe('the command phase', () => {
  it('takes up Defending Champion under Focus On Healing at a quarter of their HP or less', () => {
    const state = battle(
      [
        member({ name: 'Hero' }),
        member({ tactics: tactics(TACTIC.focusOnHealing, { abilities: [{ action: 0x87 }] }) }),
        foe(),
      ],
      new Map([[1, 25]]),
    )
    expect(commandPhaseChoice(state, state.fighters, 1, records, undefined, new Map())).toEqual({
      action: 0x87,
      bag: -1,
      group: 0,
      target: 1,
    })
  })

  it('defends without it, and not with a heal at hand that costs no item', () => {
    const at = (spells: { action: number }[]) =>
      battle(
        [
          member({ name: 'Hero' }),
          member({ tactics: tactics(TACTIC.focusOnHealing, { spells }) }),
          foe(),
        ],
        new Map([[1, 25]]),
      )
    const bare = at([])
    expect(commandPhaseChoice(bare, bare.fighters, 1, records, undefined, new Map())?.action).toBe(
      3,
    )
    const healer = at([{ action: 30 }])
    expect(
      commandPhaseChoice(healer, healer.fighters, 1, records, undefined, new Map()),
    ).toBeUndefined()
  })

  it('covers the weakest with Selflessness when one is at 0.08 or less', () => {
    const state = battle(
      [
        member({ name: 'Hero' }),
        member({ tactics: tactics(TACTIC.focusOnHealing, { abilities: [{ action: 0xb9 }] }) }),
        foe(),
      ],
      new Map([[0, 5]]),
    )
    expect(commandPhaseChoice(state, state.fighters, 1, records, undefined, new Map())).toEqual({
      action: 0xb9,
      bag: -1,
      group: 0,
      target: 0,
    })
  })
})

describe('in the battle', () => {
  const heal = {
    kind: 'spell' as const,
    spell: {
      action: 30,
      cost: 2,
      does: 'heal' as const,
      reach: 'one' as const,
      amount: { base: 35, spread: 0 },
    },
    target: -1,
  }
  const party = (): Fighter[] => [
    member({ name: 'Hero', agility: 1 }),
    member({
      name: 'Healer',
      agility: 200,
      tactics: tactics(TACTIC.fightWisely, { spells: [{ action: 30, command: heal }] }),
    }),
    foe({ attack: 1 }),
  ]

  it('plays the choice at the member’s turn', () => {
    const state = battle(party(), new Map([[0, 30]]))
    const { events } = playRound(state, new Map(), new BattleRng(11n))
    expect(events.some((e) => e.kind === 'spell' && e.actor === 1)).toBe(true)
  })

  it('replays a seeded battle identically', () => {
    const run = () => {
      let state = battle(party(), new Map([[0, 30]]))
      const rng = new BattleRng(0xabcdefn)
      const all: unknown[] = []
      for (let round = 0; round < 4 && state.outcome === 'ongoing'; round++) {
        const out = playRound(state, new Map(), rng)
        all.push(out.events)
        state = out.state
      }
      return JSON.stringify(all)
    }
    expect(run()).toBe(run())
  })

  it('aims a choice at the fighter its byte names', () => {
    const state = battle(party())
    const fighters: readonly FighterState[] = state.fighters
    expect(
      tacticCommand({ action: 30, bag: -1, group: 0, target: 0 }, fighters, 1, records),
    ).toEqual({ ...heal, target: 0 })
    expect(
      tacticCommand({ action: 1, bag: -1, group: 0, target: MONSTER_ID + 2 }, fighters, 1, records),
    ).toEqual({ kind: 'attack', target: 2 })
  })
})
