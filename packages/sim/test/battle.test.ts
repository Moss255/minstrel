import { describe, expect, it } from 'vitest'
import {
  type BattleState,
  type Changing,
  type Command,
  DEFAULT_RULES,
  type Fighter,
  playRound,
  type Spell,
  spoils,
  startBattle,
  withHp,
  withMp,
} from '../src/battle/battle.ts'
import { BattleRng } from '../src/battle/rng.ts'

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
const blob = (name: string, hp: number, attack = 10): Fighter => ({
  name,
  side: 'foes',
  maxHp: hp,
  maxMp: 0,
  attack,
  defence: 7,
  agility: 7,
  shield: false,
  exp: 2,
  gold: 4,
})

const attackFirstFoe = new Map<number, Command>([[0, { kind: 'attack', target: 1 }]])

function fight(state: BattleState, seed: bigint, commands = attackFirstFoe, rounds = 50) {
  const rng = new BattleRng(seed)
  let now = state
  const all = []
  for (let r = 0; r < rounds && now.outcome === 'ongoing'; r++) {
    const played = playRound(now, commands, rng)
    now = played.state
    all.push(...played.events)
  }
  return { state: now, events: all }
}

describe('a spell', () => {
  const crack: Spell = {
    action: 12,
    cost: 3,
    does: 'harm',
    reach: 'one',
    amount: { base: 30, spread: 5 },
  }
  const heal: Spell = {
    action: 30,
    cost: 2,
    does: 'heal',
    reach: 'one',
    amount: { base: 35, spread: 5 },
  }
  const cast = (
    state: BattleState,
    spell: Spell,
    target: number,
    seed = 3n,
    rules = DEFAULT_RULES,
  ) => {
    const played = playRound(
      state,
      new Map([[0, { kind: 'spell', spell, target }]]),
      new BattleRng(seed),
      rules,
    )
    const event = played.events.find((e) => e.kind === 'spell')
    if (event?.kind !== 'spell') throw new Error('no spell cast')
    return { state: played.state, event }
  }

  it('spends its MP, and harms the one chosen by its range', () => {
    const { state, event } = cast(
      startBattle([hero, blob('slime', 99), blob('slime', 99)]),
      crack,
      2,
    )
    expect(event.hits.map((hit) => hit.target)).toEqual([2])
    const amount = event.hits[0]?.amount ?? 0
    expect(amount).toBeGreaterThanOrEqual(25)
    expect(amount).toBeLessThan(event.critical ? 70 : 35)
    expect(state.fighters[0]?.mp).toBe(3)
    expect(state.fighters[2]?.hp).toBe(99 - amount)
    expect(state.fighters[1]?.hp).toBe(99)
  })

  it('reaches every one of the chosen one’s kind, or everyone on that side', () => {
    const start = startBattle([hero, blob('slime', 99), blob('slime', 99), blob('drakee', 99)])
    const group = cast(start, { ...crack, reach: 'group' }, 1).event
    expect(group.hits.map((hit) => hit.target)).toEqual([1, 2])
    const all = cast(start, { ...crack, reach: 'all' }, 1).event
    expect(all.hits.map((hit) => hit.target)).toEqual([1, 2, 3])
  })

  it('heals its own side no further than the wounds, and wholly with no range', () => {
    const start = withHp(startBattle([hero, blob('slime', 5, 0)]), new Map([[0, 5]]))
    const healed = cast(start, heal, 1)
    expect(healed.event.hits).toEqual([{ target: 0, amount: 15 }])
    expect(healed.state.fighters[0]?.hp).toBe(20)
    const whole = cast(start, { ...heal, amount: undefined }, 0)
    expect(whole.event.hits).toEqual([{ target: 0, amount: 15 }])
  })

  it('does nothing without the MP for it, and spends none', () => {
    const { state, event } = cast(
      withMp(startBattle([hero, blob('slime', 99)]), new Map([[0, 2]])),
      crack,
      1,
    )
    expect(event).toMatchObject({ short: true, hits: [] })
    expect(state.fighters[0]?.mp).toBe(2)
    expect(state.fighters[1]?.hp).toBe(99)
  })

  it('goes haywire for 1.5 to 2.0 times as much', () => {
    const always = { ...DEFAULT_RULES, magicCritical: 10_000 }
    const { event } = cast(startBattle([hero, blob('slime', 999)]), crack, 1, 3n, always)
    expect(event.critical).toBe(true)
    const amount = event.hits[0]?.amount ?? 0
    expect(amount).toBeGreaterThanOrEqual(Math.trunc(25 * 1.5))
    expect(amount).toBeLessThan(70)
  })
})

describe('a foe', () => {
  const tough = { ...hero, maxHp: 999 }
  const wait = new Map<number, Command>([[0, { kind: 'defend' }]])
  /** All the weight on one way, so that way is the one taken. */
  const only = (way: number) => ({
    ...DEFAULT_RULES,
    choice: [0, 1, 2, 3, 4, 5].map((i) => (i === way ? 256 : 0)),
  })
  const herb: Spell = {
    action: 236,
    cost: 0,
    does: 'heal',
    reach: 'one',
    amount: { base: 35, spread: 5 },
  }

  it('draws by its own table before the rules’ — a boss’s falling one', () => {
    // The rules put every weight on the first way, an attack; the foe's own
    // table puts it all on the second, fleeing, and the foe's own wins.
    const runner: Fighter = {
      ...blob('Runner', 30),
      acts: [
        { kind: 'attack' },
        { kind: 'flee' },
        { kind: 'attack' },
        { kind: 'attack' },
        { kind: 'attack' },
        { kind: 'attack' },
      ],
      choice: [0, 256, 0, 0, 0, 0],
    }
    const played = playRound(startBattle([tough, runner]), wait, new BattleRng(5n), only(0))
    expect(played.events.some((e) => e.kind === 'flee' && e.actor === 1)).toBe(true)
  })
  const frizz: Spell = {
    action: 9,
    cost: 2,
    does: 'harm',
    reach: 'one',
    amount: { base: 9, spread: 2 },
  }

  it('takes the way the draw gives, and flees out of the battle with what it was worth', () => {
    const slime = {
      ...blob('slime', 8),
      acts: [{ kind: 'attack' }, { kind: 'flee' }] as const,
    }
    const { state, events } = playRound(
      startBattle([tough, slime]),
      wait,
      new BattleRng(1n),
      only(1),
    )
    expect(events).toContainEqual({ kind: 'flee', actor: 1, escaped: true })
    expect(state.fighters[1]?.fled).toBe(true)
    expect(state.outcome).toBe('won')
    expect(spoils(state)).toEqual({ exp: 0, gold: 0 })
  })

  it('runs only from a party whose highest standing level has reached its own mark', () => {
    const slime: Fighter = {
      ...blob('slime', 8),
      acts: [{ kind: 'attack' }, { kind: 'flee' }],
      runsFrom: 6,
    }
    const fledAt = (levels: readonly (number | undefined)[], down: readonly boolean[] = []) => {
      const party = levels.map((level, i) => ({
        ...tough,
        ...(level === undefined ? {} : { level }),
        maxHp: down[i] ? 1 : tough.maxHp,
      }))
      const start = startBattle([...party, slime])
      const hurt = down.some(Boolean)
        ? withHp(start, new Map(down.flatMap((d, i) => (d ? [[i, 0]] : []))))
        : start
      const commands = new Map<number, Command>(party.map((_, i) => [i, { kind: 'defend' }]))
      const { events } = playRound(hurt, commands, new BattleRng(1n), only(1))
      const at = party.length
      return {
        fled: events.some((e) => e.kind === 'flee' && e.actor === at),
        attacked: events.some((e) => e.kind === 'attack' && e.actor === at),
      }
    }
    // Level 5 is short of 6: the drawn Flee is an attack.
    expect(fledAt([5])).toEqual({ fled: false, attacked: true })
    // Level 6 reaches it.
    expect(fledAt([6]).fled).toBe(true)
    // The highest of the party counts, but only while standing.
    expect(fledAt([3, 9]).fled).toBe(true)
    expect(fledAt([3, 9], [false, true]).fled).toBe(false)
    // With no level known, it runs as before.
    expect(fledAt([undefined]).fled).toBe(true)
  })

  it('draws each of its six ways, over enough turns, by the even table', () => {
    const acts = [0, 1, 2, 3, 4, 5].map((i) => ({
      kind: 'spell' as const,
      spell: { ...frizz, action: 100 + i, cost: 0 },
    }))
    const { events } = fight(startBattle([tough, { ...blob('slime', 999), acts }]), 5n, wait, 60)
    const ways = new Set(events.flatMap((e) => (e.kind === 'spell' ? [e.action] : [])))
    expect([...ways].sort()).toEqual([100, 101, 102, 103, 104, 105])
  })

  it('heals its most wounded ally, and attacks when no one is hurt', () => {
    const healer = { ...blob('archer', 20), acts: [{ kind: 'spell', spell: herb }] as const }
    const start = startBattle([tough, healer, blob('slime', 30), blob('slime', 30)])
    const hurt = withHp(
      start,
      new Map([
        [2, 20],
        [3, 5],
      ]),
    )
    const healed = playRound(hurt, wait, new BattleRng(1n), only(0)).events
    expect(healed.find((e) => e.kind === 'spell')).toMatchObject({
      actor: 1,
      hits: [{ target: 3 }],
    })
    const whole = playRound(start, wait, new BattleRng(1n), only(0)).events
    expect(whole.some((e) => e.kind === 'spell')).toBe(false)
    expect(whole.some((e) => e.kind === 'attack' && e.actor === 1)).toBe(true)
  })

  it('casts a harmful spell at the party, spending its MP', () => {
    const mage = { ...blob('mage', 20), maxMp: 4, acts: [{ kind: 'spell', spell: frizz }] as const }
    const { state, events } = playRound(
      startBattle([tough, mage]),
      wait,
      new BattleRng(2n),
      only(0),
    )
    const cast = events.find((e) => e.kind === 'spell')
    expect(cast).toMatchObject({ actor: 1, short: false, hits: [{ target: 0 }] })
    expect(state.fighters[1]?.mp).toBe(2)
  })
})

describe('a change of state', () => {
  const tough = { ...hero, maxHp: 999 }
  const wait = new Map<number, Command>([[0, { kind: 'defend' }]])
  const only = (way: number) => ({
    ...DEFAULT_RULES,
    choice: [0, 1, 2, 3, 4, 5].map((i) => (i === way ? 256 : 0)),
  })
  const kasap: Changing = {
    action: 44,
    cost: 0,
    change: { kind: 'defence', by: -1, chance: 100 },
    reach: 'group',
    side: 'other',
  }
  const sweetBreath: Changing = {
    action: 228,
    cost: 0,
    change: { kind: 'sleep', chance: 100 },
    reach: 'all',
    side: 'other',
  }

  it('lowers the Hero’s defence a level, for its turns', () => {
    const beakon = { ...blob('beakon', 99), acts: [{ kind: 'change', changing: kasap }] as const }
    const { state, events } = playRound(
      startBattle([tough, beakon]),
      wait,
      new BattleRng(1n),
      only(0),
    )
    expect(events.find((e) => e.kind === 'change')).toMatchObject({
      actor: 1,
      change: 'defence',
      hits: [{ target: 0, result: 'lowered' }],
    })
    // Seven turns, less the Hero's own this round.
    expect(state.fighters[0]?.states.defence).toEqual({ level: -1, turns: 6 })
  })

  it('puts the Hero to sleep, so they lose their turns until they wake', () => {
    const breather = {
      ...blob('mushroom', 999, 0),
      acts: [{ kind: 'change', changing: sweetBreath }] as const,
    }
    const rng = new BattleRng(4n)
    let now = startBattle([tough, breather])
    const events = []
    for (let round = 0; round < 10; round++) {
      const played = playRound(now, wait, rng, only(0))
      now = played.state
      events.push(...played.events)
    }
    expect(events).toContainEqual({ kind: 'asleep', actor: 0 })
    expect(events).toContainEqual({ kind: 'woke', actor: 0 })
    expect(
      events.some((e) => e.kind === 'change' && e.hits.some((hit) => hit.result === 'already')),
    ).toBe(true)
  })

  it('poisons with a poison attack, and the poison takes a sixteenth at each round’s end', () => {
    const toad = { ...blob('toad', 99, 1), acts: [{ kind: 'attack', poison: 100 }] as const }
    const { state, events } = playRound(
      startBattle([tough, toad]),
      wait,
      new BattleRng(2n),
      only(0),
    )
    const blow = events.find((e) => e.kind === 'attack' && e.actor === 1)
    if (blow?.kind !== 'attack' || blow.dodged || blow.blocked) throw new Error('the blow missed')
    expect(blow.poisoned).toBe(true)
    expect(state.fighters[0]?.states.poisoned).toBe(true)
    expect(events).toContainEqual({ kind: 'poison', actor: 0, damage: 62 })
  })
})

describe('a battle', () => {
  it('is the same battle from the same seed', () => {
    const start = startBattle([hero, blob('slime', 8), blob('slime', 8)])
    expect(fight(start, 7n)).toEqual(fight(start, 7n))
    expect(fight(start, 7n).events).not.toEqual(fight(start, 8n).events)
  })

  it('is won when every foe is down, and pays out their experience and gold', () => {
    // A Hero hale enough that no seed's luck loses it: the point is the winning.
    const { state, events } = fight(
      startBattle([{ ...hero, maxHp: 200 }, blob('slime', 8), blob('slime', 8)]),
      3n,
    )
    expect(state.outcome).toBe('won')
    expect(state.fighters.filter((f) => f.side === 'foes').every((f) => f.hp === 0)).toBe(true)
    expect(events.filter((e) => e.kind === 'defeated')).toHaveLength(2)
    expect(spoils(state)).toEqual({ exp: 4, gold: 8 })
  })

  it('is lost when the party is down', () => {
    const giant = { ...blob('giant', 999, 80), agility: 50 }
    const { state } = fight(startBattle([hero, giant]), 11n)
    expect(state.outcome).toBe('lost')
    expect(state.fighters[0]?.hp).toBe(0)
  })

  it('halves the party’s blow on a guarding monster, as the game halves either way', () => {
    // The game never asks whose blow it is: it reads the target's guard level.
    const foe = blob('slime', 99, 1)
    const both = new Map<number, Command>([
      [0, { kind: 'attack', target: 1 }],
      [1, { kind: 'defend' }],
    ])
    let halved = 0
    let open = 0
    for (let seed = 1n; seed <= 60n; seed++) {
      const guard = playRound(
        startBattle([{ ...hero, agility: 99 }, foe]),
        both,
        new BattleRng(seed),
      )
      const plain = playRound(
        startBattle([{ ...hero, agility: 99 }, foe]),
        attackFirstFoe,
        new BattleRng(seed),
      )
      const hit = (events: typeof guard.events) =>
        events.find((e) => e.kind === 'attack' && e.target === 1)
      const a = hit(guard.events)
      const b = hit(plain.events)
      if (a?.kind !== 'attack' || b?.kind !== 'attack' || a.dodged || b.dodged) continue
      halved += a.damage
      open += b.damage
    }
    expect(halved).toBeGreaterThan(0)
    // Half, give or take what truncation and the 0-or-1 coin do.
    expect(halved).toBeLessThan(open * 0.75)
  })

  it('lets a defended blow that comes to nothing still deal 1, the game’s order', () => {
    // A guard is applied before the coin, so a blow it takes to nothing is
    // still 0 or 1 — which is what the reference said and the game bears out.
    const feeble = { ...blob('slime', 99, 1), agility: 99 }
    const defend = new Map<number, Command>([[0, { kind: 'defend' }]])
    const dealt = new Set<number>()
    for (let seed = 1n; seed <= 80n; seed++) {
      const round = playRound(
        startBattle([{ ...hero, defence: 400 }, feeble]),
        defend,
        new BattleRng(seed),
      )
      for (const event of round.events) {
        if (event.kind === 'attack' && event.target === 0 && !event.dodged) dealt.add(event.damage)
      }
    }
    expect([...dealt].sort()).toEqual([0, 1])
  })

  it('lets a defending hero take half, and never a critical from a foe', () => {
    const strong = { ...blob('ogre', 999, 40), agility: 1 }
    const defend = new Map<number, Command>([[0, { kind: 'defend' }]])
    const rng = new BattleRng(5n)
    const guarded = playRound(startBattle([hero, strong]), defend, rng)
    const open = playRound(startBattle([hero, strong]), attackFirstFoe, new BattleRng(5n))
    const hitOf = (events: typeof guarded.events) =>
      events.find((e) => e.kind === 'attack' && e.target === 0)
    const guardedHit = hitOf(guarded.events)
    const openHit = hitOf(open.events)
    expect(guarded.events[0]).toEqual({ kind: 'defend', actor: 0 })
    if (guardedHit?.kind === 'attack' && openHit?.kind === 'attack' && !guardedHit.dodged) {
      expect(guardedHit.critical).toBe(false)
      expect(guardedHit.damage).toBeLessThan(openHit.damage + 2)
    }
    expect(guarded.state.fighters[0]?.defending).toBe(false)
  })

  it('flees only when fleeing is allowed', () => {
    const flee = new Map<number, Command>([[0, { kind: 'flee' }]])
    const free = fight(startBattle([hero, blob('slime', 999, 1)]), 1n, flee)
    expect(free.state.outcome).toBe('fled')
    const boss = fight(startBattle([hero, blob('boss', 999, 1)], false), 1n, flee, 10)
    expect(boss.state.outcome).toBe('ongoing')
    expect(
      boss.events.filter((e) => e.kind === 'flee').every((e) => e.kind === 'flee' && !e.escaped),
    ).toBe(true)
  })

  it('turns an attack on a fallen foe to the next one standing', () => {
    const start = withHp(startBattle([hero, blob('slime', 8), blob('slime', 8)]), new Map([[1, 0]]))
    const { events } = playRound(start, attackFirstFoe, new BattleRng(2n))
    const blow = events.find((e) => e.kind === 'attack' && e.actor === 0)
    expect(blow?.kind === 'attack' && blow.target).toBe(2)
  })

  it('heals with an item on the user’s turn, by a draw, and no more than the wounds', () => {
    const herb = new Map<number, Command>([
      [0, { kind: 'item', item: 0x55f0, heal: { base: 35, spread: 5 } }],
    ])
    const hurt = withHp(
      startBattle([{ ...hero, maxHp: 100 }, blob('slime', 8, 1)]),
      new Map([[0, 10]]),
    )
    const { state, events } = playRound(hurt, herb, new BattleRng(1n))
    const used = events.find((e) => e.kind === 'item')
    expect(used).toMatchObject({ kind: 'item', actor: 0, target: 0, item: 0x55f0 })
    const healed = used?.kind === 'item' ? (used.healed ?? 0) : 0
    expect(healed).toBeGreaterThanOrEqual(30)
    expect(healed).toBeLessThanOrEqual(40)
    // The slime's blow comes after or before; the heal is all there either way.
    const hit = events.find((e) => e.kind === 'attack')
    const damage = hit?.kind === 'attack' ? hit.damage : 0
    expect(state.fighters[0]?.hp).toBe(10 + healed - damage)

    const nearlyWell = withHp(startBattle([hero, blob('slime', 8, 1)]), new Map([[0, 18]]))
    const round = playRound(nearlyWell, herb, new BattleRng(1n)).events
    const at = round.findIndex((e) => e.kind === 'item')
    const topped = round[at]
    // The wounds are the two it began with and whatever the slime dealt first.
    const first = round.slice(0, at).find((e) => e.kind === 'attack')
    const wounds = 2 + (first?.kind === 'attack' ? first.damage : 0)
    expect(topped?.kind === 'item' && topped.healed).toBe(wounds)
  })

  it('says an item with no heal did nothing', () => {
    const wing = new Map<number, Command>([[0, { kind: 'item', item: 0x55fb }]])
    const { events } = playRound(startBattle([hero, blob('slime', 8, 1)]), wing, new BattleRng(1n))
    expect(events.find((e) => e.kind === 'item')).toMatchObject({ healed: undefined })
  })

  it('uses the default rules unless told otherwise', () => {
    expect(DEFAULT_RULES).toEqual({
      critical: 200,
      dodge: 2,
      magicCritical: 100,
      choice: [43, 42, 43, 43, 42, 43],
    })
  })
})

describe('the order a blow’s draws are made in — the game’s', () => {
  // One round, the Hero defending, so the only blow is the monster's. The
  // monster hits hard enough that its damage is never nothing, which would
  // spend a draw of its own.
  const defend = new Map<number, Command>([[0, { kind: 'defend' }]])
  const drawsIn = (heroIs: Partial<Fighter>, rules = DEFAULT_RULES) => {
    const rng = new BattleRng(2024n)
    const played = playRound(
      startBattle([{ ...hero, maxHp: 500, ...heroIs }, blob('Brute', 50, 60)]),
      defend,
      rng,
      rules,
    )
    const blow = played.events.find((e) => e.kind === 'attack')
    return { drawn: rng.drawn, blow }
  }

  it('skips only the block for a blow that is dodged — the damage is still worked out', () => {
    const lands = drawsIn({ evade: 0 })
    const dodged = drawsIn({ evade: 100 })
    expect(dodged.blow).toMatchObject({ dodged: true, damage: 0 })
    expect(lands.blow).toMatchObject({ dodged: false })
    // Critical, dodge, block, accuracy, damage — against the same less the block.
    expect(lands.drawn - dodged.drawn).toBe(1)
  })

  it('rolls the block whether or not there is anything to block with', () => {
    // The game makes the draw for every blow that can be blocked; a rate of
    // nothing simply never comes in under it.
    expect(drawsIn({ shield: false }).drawn).toBe(drawsIn({ shield: true }).drawn)
    const blocked = drawsIn({ block: 100 })
    expect(blocked.blow).toMatchObject({ blocked: true, dodged: false, damage: 0 })
    expect(blocked.drawn).toBe(drawsIn({ block: 0 }).drawn)
  })

  it('spends a critical draw on a monster’s blow, which never lands one', () => {
    // Every blow of the party's a critical, by the rules; the monster's still not.
    const always = { ...DEFAULT_RULES, critical: 10_000 }
    expect(drawsIn({}, always).blow).toMatchObject({ critical: false })
    // And the draw is spent either way: the rules' chance moves nothing.
    expect(drawsIn({}, always).drawn).toBe(drawsIn({}).drawn)
    expect(drawsIn({}, always).blow).toEqual(drawsIn({}).blow)
  })

  it('never calls a dodged or blocked blow a critical', () => {
    const always = { ...DEFAULT_RULES, critical: 10_000 }
    const attack = new Map<number, Command>([[0, { kind: 'attack', target: 1 }]])
    const played = playRound(
      startBattle([hero, { ...blob('Wisp', 50), evade: 100 }]),
      attack,
      new BattleRng(5n),
      always,
    )
    const mine = played.events.find((e) => e.kind === 'attack' && e.actor === 0)
    expect(mine).toMatchObject({ dodged: true, critical: false, damage: 0 })
  })

  it('gives a blow that comes to nothing a coin of 0 or 1 — the party’s as much as a monster’s', () => {
    // `func_ov024_021e6a90`, 0x021e7824–0x021e7904: the game looks at the blow
    // and at the target, never at who struck it. An attack of 1 against a
    // defence of 5000 comes to nothing every time.
    const attack = new Map<number, Command>([[0, { kind: 'attack', target: 1 }]])
    const wall = { ...blob('Wall', 5000, 0), defence: 5000, agility: 0 }
    const seen = new Set<number>()
    const rng = new BattleRng(7n)
    for (let i = 0; i < 200; i++) {
      const played = playRound(startBattle([{ ...hero, attack: 1 }, wall]), attack, rng)
      const mine = played.events.find((e) => e.kind === 'attack' && e.actor === 0)
      if (mine?.kind === 'attack' && !mine.dodged && !mine.blocked) seen.add(mine.damage)
    }
    expect([...seen].sort()).toEqual([0, 1])
  })

  it('gives no coin to a blow that was dodged or blocked', () => {
    // The flags zero the damage and rule the coin out (0x021e7838–0x021e7868),
    // so a weak blow blocked spends one draw fewer than the same blow landing.
    const weak = (heroIs: Partial<Fighter>) => {
      const rng = new BattleRng(2024n)
      const played = playRound(
        startBattle([{ ...hero, maxHp: 500, defence: 5000, ...heroIs }, blob('Gnat', 50, 1)]),
        defend,
        rng,
      )
      return { drawn: rng.drawn, blow: played.events.find((e) => e.kind === 'attack') }
    }
    expect(weak({ block: 100 }).blow).toMatchObject({ blocked: true, damage: 0 })
    expect(weak({ block: 0 }).drawn - weak({ block: 100 }).drawn).toBe(1)
  })

  it('lets a monster dodge by its own chance, where it had none', () => {
    const attack = new Map<number, Command>([[0, { kind: 'attack', target: 1 }]])
    let dodges = 0
    const rounds = 4000
    const rng = new BattleRng(99n)
    for (let i = 0; i < rounds; i++) {
      const played = playRound(
        startBattle([hero, { ...blob('Nimble', 5000), evade: 25, attack: 1 }]),
        attack,
        rng,
      )
      if (played.events.some((e) => e.kind === 'attack' && e.actor === 0 && e.dodged)) dodges++
    }
    expect(dodges / rounds).toBeGreaterThan(0.22)
    expect(dodges / rounds).toBeLessThan(0.28)
  })
})

describe('the draws of what is not a plain blow — the game’s', () => {
  // Monsters that only fluff around, so a round's draws are the order of
  // going, their choosing, and the Hero's action — and two rounds differ by
  // what the Hero did and nothing else.
  const idle = (name: string) => ({
    ...blob(name, 500),
    acts: [{ kind: 'wait', action: 0 }] as const,
  })
  const rules = { ...DEFAULT_RULES, choice: [256, 0, 0, 0, 0, 0] }
  const drawn = (command: Command, foes = [idle('slime'), idle('slime')]) => {
    const rng = new BattleRng(11n)
    const state = withHp(startBattle([{ ...hero, maxHp: 500 }, ...foes]), new Map([[0, 100]]))
    playRound(state, new Map([[0, command]]), rng, rules)
    return rng.drawn
  }
  const nothing = drawn({ kind: 'defend' })
  const bolt = (reach: Spell['reach'], amount: Spell['amount']): Command => ({
    kind: 'spell',
    target: 1,
    spell: { action: 9, cost: 0, does: 'harm', reach, amount },
  })
  const legacy = { base: 14, spread: 2 }

  it('spends four on a spell at one: their die, the critical, the accuracy, the amount', () => {
    expect(drawn(bolt('one', legacy)) - nothing).toBe(4)
  })

  it('rolls the critical once for a spell at a group, and the rest for each one reached', () => {
    // One for the cast, then a die, an accuracy and an amount apiece.
    expect(drawn(bolt('group', legacy)) - nothing).toBe(1 + 2 * 3)
    const three = [idle('slime'), idle('bat'), idle('bat')]
    expect(drawn(bolt('all', legacy), three) - drawn({ kind: 'defend' }, three)).toBe(1 + 3 * 3)
  })

  it('draws one of the party’s amount once when it scales and twice when it does not', () => {
    const scaling = {
      ...legacy,
      party: { min: 14, max: 99, scales: { by: 'might', lo: 50, hi: 999 } },
    } as const
    const flat = { ...legacy, party: { min: 14, max: 14 } }
    expect(drawn(bolt('one', scaling)) - nothing).toBe(4)
    expect(drawn(bolt('one', flat)) - nothing).toBe(5)
  })

  it('spends the same on an item as on a spell at one — and the herb’s amount is two', () => {
    const herb = (heal: Spell['amount']): Command => ({
      kind: 'item',
      item: 1,
      ...(heal ? { heal } : {}),
    })
    expect(drawn(herb({ base: 35, spread: 5 })) - nothing).toBe(4)
    expect(drawn(herb({ base: 35, spread: 5, party: { min: 35, max: 35 } })) - nothing).toBe(5)
  })

  it('scales a spell by the caster’s own might', () => {
    const amounts = (might: number) => {
      const rng = new BattleRng(11n)
      const state = startBattle([{ ...hero, might }, idle('slime')])
      const spell = bolt('one', {
        ...legacy,
        party: { min: 14, max: 99, scales: { by: 'might', lo: 50, hi: 999 } },
      })
      const cast = playRound(state, new Map([[0, spell]]), rng, {
        ...rules,
        magicCritical: 0,
      }).events.find((e) => e.kind === 'spell')
      return cast?.kind === 'spell' ? (cast.hits[0]?.amount ?? -1) : -1
    }
    expect(amounts(999) - amounts(0)).toBe(85)
  })

  it('rolls a change of state with the accuracy’s draw, after the die and the critical', () => {
    const sap = (extra: Partial<Changing>): Command => ({
      kind: 'change',
      target: 1,
      changing: {
        action: 43,
        cost: 0,
        reach: 'one',
        side: 'other',
        change: { kind: 'defence', by: -1, chance: 75 },
        ...extra,
      },
    })
    // At one: their die, the critical, the accuracy — and that is the roll.
    expect(drawn(sap({})) - nothing).toBe(3)
    // At a group of two: the critical once, then a die and an accuracy apiece.
    expect(drawn(sap({ reach: 'group' })) - nothing).toBe(1 + 2 * 2)
    // One that can be dodged rolls the dodge too.
    expect(drawn(sap({ evadable: true })) - nothing).toBe(4)
  })

  it('spends a change’s draws on one with nothing left to change', () => {
    // The handler finds out after the resolver has rolled: one already
    // poisoned is rolled for all the same.
    const snooze: Command = {
      kind: 'change',
      target: 1,
      changing: {
        action: 53,
        cost: 0,
        reach: 'one',
        side: 'other',
        change: { kind: 'poison', chance: 100 },
      },
    }
    const rng = new BattleRng(11n)
    let state = withHp(
      startBattle([{ ...hero, maxHp: 500 }, idle('slime'), idle('slime')]),
      new Map([[0, 100]]),
    )
    state = playRound(state, new Map([[0, snooze]]), rng, rules).state
    const before = rng.drawn
    const again = playRound(state, new Map([[0, snooze]]), rng, rules)
    expect(again.events.find((e) => e.kind === 'change')).toMatchObject({
      hits: [{ result: 'already' }],
    })
    const idleRound = (() => {
      const r = new BattleRng(11n)
      playRound(state, new Map([[0, { kind: 'defend' }]]), r, rules)
      return r.drawn
    })()
    expect(rng.drawn - before - idleRound).toBe(3)
  })

  it('lands a cast gone haywire outright, and lets a dodge come first', () => {
    const hopeless = (extra: Partial<Changing>, r = rules): unknown => {
      const played = playRound(
        startBattle([
          { ...hero, maxHp: 500 },
          { ...idle('slime'), evade: 100 },
        ]),
        new Map([
          [
            0,
            {
              kind: 'change',
              target: 1,
              changing: {
                action: 43,
                cost: 0,
                reach: 'one',
                side: 'other',
                change: { kind: 'defence', by: -1, chance: 0 },
                ...extra,
              },
            },
          ],
        ]),
        new BattleRng(11n),
        r,
      )
      const told = played.events.find((e) => e.kind === 'change')
      return told?.kind === 'change' ? told.hits[0]?.result : undefined
    }
    const always = { ...rules, magicCritical: 10_000 }
    expect(hopeless({})).toBe('resisted')
    expect(hopeless({ haywire: true }, always)).toBe('lowered')
    // Without the record saying it can, it cannot.
    expect(hopeless({}, always)).toBe('resisted')
    expect(hopeless({ evadable: true, haywire: true }, always)).toBe('dodged')
  })

  it('never lets a monster’s spell go haywire, and spends the draw on it all the same', () => {
    const caster = (name: string) => ({
      ...blob(name, 500),
      acts: [
        {
          kind: 'spell',
          spell: { action: 9, cost: 0, does: 'harm', reach: 'one', amount: legacy },
        },
      ] as const,
    })
    const always = { ...rules, magicCritical: 10_000 }
    const round = (r: typeof rules) => {
      const rng = new BattleRng(11n)
      const played = playRound(
        startBattle([{ ...hero, maxHp: 500 }, caster('imp')]),
        new Map([[0, { kind: 'defend' }]]),
        rng,
        r,
      )
      return { drawn: rng.drawn, cast: played.events.find((e) => e.kind === 'spell') }
    }
    expect(round(always).cast).toMatchObject({ critical: false })
    expect(round(always).drawn).toBe(round(rules).drawn)
  })
})
