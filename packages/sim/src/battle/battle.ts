import { criticalDamage, criticalHit, drawnAmount, initiative, physicalDamage } from './damage.ts'
import type { BattleRng } from './rng.ts'
import {
  levelled,
  moved,
  NO_STATES,
  poisonDamage,
  SLEEP_TURNS,
  type States,
  sleptThrough,
  wornAfterTurn,
} from './states.ts'

/**
 * A battle, round by round: who acts in what order, what an attack does, and
 * when it is over. Headless and deterministic — the same fighters, commands and
 * seed give the same battle.
 *
 * **From the reference** (DQIX/BattleEmulator, MIT — see `damage.ts`):
 * - the order of a round: agility times a draw from 0.51 to 1.0, highest first;
 * - an attack's damage, `FUN_0207564c`;
 * - a monster's blow dodged 2 times in 100;
 * - defending halving a blow, from the round's start — though not the 0-or-1
 *   blow;
 * - the party's critical hit: a draw below 10,000 under {@link Rules.critical},
 *   dealing the attacker's attack power times 0.95 to 1.05;
 * - a healing item's amount, its base give or take its spread, `drawnAmount`;
 * - a spell's amount, drawn the same way — the reference's Heal, Crack, Woosh
 *   and Crackle — and its going haywire: a draw below 10,000 under
 *   {@link Rules.magicCritical}, 100 on all four, multiplying the amount by 1.5
 *   to 2.0 (`criticalDamage`); and its MP spent as it is cast;
 * - changes of state, `states.ts`: defence and agility levels, sleep, poison —
 *   with the chances a way gives them, which the reference's own are: Kasap
 *   and Deceleratle 75 in 100, Sweet Breath's sleep 25, its poison attack's 12;
 *   a sleeper losing its turns, and unable to defend.
 *
 * **A blow that comes to nothing deals 0 or 1, whoever strikes it** — the
 * game's, read from `func_ov024_021e6a90`; the reference had it for monsters.
 *
 * **A shield's chance of blocking is the game's**, from what is worn —
 * `blockChance`; a fighter given none blocks once in a hundred behind a shield,
 * which was the reference's and is the game's for the least shields.
 *
 * **The order of a blow's draws is the game's**, read from its code: the
 * critical roll, the dodge, the block, the accuracy and then the damage, each
 * spent whether or not it can come to anything — a monster's critical draw, the
 * damage of a blow that was dodged. `docs/conformance.md` has the reading.
 *
 * **Ours, and said so:**
 * - the order of every draw that is *not* a plain blow's — a spell's, an
 *   item's, a change of state's — which is still not the game's;
 * - a round of more than two fighters, which the reference, one against one,
 *   does not have: everyone is ordered by the same draw;
 * - a monster's target, a draw among the living party;
 * - which of its six ways a monster takes is the reference's draw, but the
 *   weights are its even table for every monster (see {@link Rules.choice});
 *   a monster that flees gets away, and pays nothing; one that would heal
 *   with no one hurt attacks instead; one that would flee from a party not
 *   yet strong enough — see {@link Fighter.runsFrom} — attacks instead;
 * - the critical chance, the reference's 200 in 10,000 for its level-13 case —
 *   how the game derives it is not read;
 * - fleeing, which the reference does not model: {@link Rules.flee} in 100;
 * - an item used in battle: its heal lands on the user's turn, on the user,
 *   and no more than their wounds — one draw, where the game's others are not
 *   modelled;
 * - a spell's reach over a group — those of the chosen one's kind — or over
 *   everyone, where the reference is one against one: one draw for the whole
 *   cast going haywire, then each reached with an amount of its own;
 * - a spell without the MP for it doing nothing and costing nothing;
 * - the reference's Woosh taking a quarter off, which Crack and Crackle do not
 *   and which looks like its one foe's own resistance: left out;
 * - changes of state on every fighter alike, where the reference keeps them for
 *   its one player; a level's turn off at the round's end, not after its
 *   holder's own turn; any damage waking a sleeper, where the reference shows a
 *   monster's blow waking its player; Sweet Breath's own 2-in-100 dodge before
 *   its sleep, left out; a change to one of the caster's own side landing on a
 *   draw among them.
 */

export type Side = 'party' | 'foes'

export interface Fighter {
  readonly name: string
  readonly side: Side
  readonly maxHp: number
  readonly maxMp: number
  readonly attack: number
  readonly defence: number
  readonly agility: number
  /** Whether a shield stands between this fighter and a monster's blow. */
  readonly shield: boolean
  /**
   * Its chance of dodging a blow, in a hundred, where it is not the rules'.
   * A monster's is by a grade in its record — 0, 2, 4, 8 or 25, the game's
   * table — and none when not given; one of the party's is {@link Rules.dodge}.
   */
  readonly evade?: number
  /**
   * Its chance of blocking, in a hundred. The game's is the shield's own
   * chance and a skill's bonus for one of the party, and a grade's for a
   * monster — `blockChance` makes it from what is worn. Without this a shield
   * blocks once in a hundred, which is the reference's, and what the game's
   * comes to for any shield of ten tenths or fewer.
   */
  readonly block?: number
  /** What beating this fighter is worth, when it is a foe. */
  readonly exp: number
  readonly gold: number
  /** A foe's ways of acting, one drawn each turn by {@link Rules.choice}; with none, it attacks. */
  readonly acts?: readonly FoeAction[]
  /** The weights its ways are drawn by, in 256, where they are not the rules' — a boss's falling table. */
  readonly choice?: readonly number[]
  /** A party member's level, which a monster weighs before it runs. */
  readonly level?: number
  /**
   * The party level a monster runs from: a drawn Flee is taken only when the
   * highest level among the standing party has reached it, and is an attack
   * otherwise. Without it, or with no party level known, a drawn Flee is
   * taken. The game's level and margin from `fld_mondata` — INFERRED; that a
   * Flee below it becomes an attack is ours.
   */
  readonly runsFrom?: number
}

export interface FighterState extends Fighter {
  readonly hp: number
  readonly mp: number
  readonly defending: boolean
  /** A foe that has fled: out of the battle, and paying nothing. */
  readonly fled: boolean
  /** Its changes of state — see `states.ts`. */
  readonly states: States
}

/** What an item does when used: the HP it restores, as a base give or take a spread. */
export interface Heal {
  readonly base: number
  readonly spread: number
}

/** A spell, as the battle casts it — see {@link playRound}. */
export interface Spell {
  /** Its action's number, to tell it by. */
  readonly action: number
  /** Its cost in MP. */
  readonly cost: number
  /** Whether it heals its caster's side or harms the other. */
  readonly does: 'heal' | 'harm'
  /** Whom it reaches: the one chosen, those of the chosen one's kind, or everyone on that side. */
  readonly reach: 'one' | 'group' | 'all'
  /** How much, a base give or take a spread; none heals all there is to heal. */
  readonly amount: Heal | undefined
}

/** What a change of state does, and its chance in 100 of landing — see `states.ts`. */
export type Change =
  | { readonly kind: 'sleep'; readonly chance: number }
  | { readonly kind: 'poison'; readonly chance: number }
  | { readonly kind: 'defence' | 'agility'; readonly by: number; readonly chance: number }

/** A way of changing state, as the battle casts it: on one, a group or all, of its caster's side or the other. */
export interface Changing {
  readonly action: number
  readonly cost: number
  readonly change: Change
  readonly reach: 'one' | 'group' | 'all'
  readonly side: 'own' | 'other'
}

/** How a change came out on one it reached. */
export type ChangeResult = 'asleep' | 'poisoned' | 'raised' | 'lowered' | 'already' | 'resisted'

/**
 * One of a foe's ways of acting — the game gives each monster six: attack
 * (poisoning, by its chance in 100, where it is a poison attack), flee, a
 * spell, or a change of state.
 */
export type FoeAction =
  | { readonly kind: 'attack'; readonly poison?: number }
  | { readonly kind: 'flee' }
  /** A turn spent doing nothing — a monster fluffing around — with the action that says so. */
  | { readonly kind: 'wait'; readonly action: number }
  | { readonly kind: 'spell'; readonly spell: Spell }
  | { readonly kind: 'change'; readonly changing: Changing }

export type Command =
  /** An attack; one that poisons, by its chance in 100, gives it. */
  | { readonly kind: 'attack'; readonly target: number; readonly poison?: number }
  /** Change state on a fighter — for one that reaches further, on that fighter's kind or side. */
  | { readonly kind: 'change'; readonly changing: Changing; readonly target: number }
  | { readonly kind: 'defend' }
  | { readonly kind: 'flee' }
  /** Do nothing this turn, as the action says — a monster's idle way. */
  | { readonly kind: 'wait'; readonly action: number }
  /** Use an item, by id: its heal when it has one, and nothing when it has not. */
  | { readonly kind: 'item'; readonly item: number; readonly heal?: Heal }
  /** Cast a spell at a fighter — for one that reaches further, at that fighter's kind or side. */
  | { readonly kind: 'spell'; readonly spell: Spell; readonly target: number }

export type BattleEvent =
  | {
      readonly kind: 'attack'
      readonly actor: number
      readonly target: number
      readonly damage: number
      readonly critical: boolean
      readonly dodged: boolean
      readonly blocked: boolean
      /** A poison attack's poison landed. */
      readonly poisoned?: boolean
    }
  | { readonly kind: 'defend'; readonly actor: number }
  | { readonly kind: 'wait'; readonly actor: number; readonly action: number }
  | { readonly kind: 'flee'; readonly actor: number; readonly escaped: boolean }
  | {
      readonly kind: 'item'
      readonly actor: number
      readonly target: number
      readonly item: number
      /** HP restored — 0 when there were no wounds to heal — or undefined for an item with no heal. */
      readonly healed: number | undefined
    }
  | {
      readonly kind: 'spell'
      readonly actor: number
      readonly action: number
      /** Too little MP to cast it: nothing happens, and nothing is spent. */
      readonly short: boolean
      /** Whether it went haywire — the reference's critical, 1.5 to 2.0 times. */
      readonly critical: boolean
      /** Whom it reached, and what each took or recovered. */
      readonly hits: readonly { readonly target: number; readonly amount: number }[]
    }
  | {
      readonly kind: 'change'
      readonly actor: number
      readonly action: number
      /** What it changes. */
      readonly change: Change['kind']
      /** Too little MP to cast it: nothing happens, and nothing is spent. */
      readonly short: boolean
      readonly hits: readonly { readonly target: number; readonly result: ChangeResult }[]
    }
  /** A sleeper's turn, slept through. */
  | { readonly kind: 'asleep'; readonly actor: number }
  /** A sleeper waking: on its turn, or at a blow. */
  | { readonly kind: 'woke'; readonly actor: number }
  /** A level worn off, at the round's end. */
  | { readonly kind: 'wornOff'; readonly actor: number; readonly stat: 'defence' | 'agility' }
  /** Poison taking its toll, at the round's end. */
  | { readonly kind: 'poison'; readonly actor: number; readonly damage: number }
  | { readonly kind: 'defeated'; readonly actor: number }

export type Outcome = 'ongoing' | 'won' | 'lost' | 'fled'

export interface BattleState {
  readonly fighters: readonly FighterState[]
  readonly round: number
  readonly outcome: Outcome
  /** Whether the party may flee: not from a boss. */
  readonly canFlee: boolean
}

export interface Rules {
  /** The party's critical-hit chance, in 10,000 — the reference's level-13 case. */
  readonly critical: number
  /** One of the party dodging a blow, in 100 — the game's own two, `func_ov000_02156270`. */
  readonly dodge: number
  /** Fleeing, in 100 — ours: the reference does not model it. */
  readonly flee: number
  /** A spell going haywire, in 10,000 — the reference's, for every spell it casts. */
  readonly magicCritical: number
  /**
   * The weights, in 256, a foe's six ways are drawn by: the reference's even
   * table. The reference has one other, falling from 68 to 17, for its own boss;
   * which monsters draw by which is not read.
   */
  readonly choice: readonly number[]
}

export const DEFAULT_RULES: Rules = {
  critical: 200,
  dodge: 2,
  flee: 50,
  magicCritical: 100,
  choice: [43, 42, 43, 43, 42, 43],
}

/** A target's chance of dodging, in a hundred — the game's `func_ov000_02156270`, without its bonuses and statuses. */
function evadeOf(target: Fighter, rules: Rules): number {
  return target.evade ?? (target.side === 'party' ? rules.dodge : 0)
}

/** A target's chance of blocking, in a hundred — the game's `func_ov000_02156118`, likewise. */
function blockOf(target: Fighter): number {
  return target.block ?? (target.shield ? 1 : 0)
}

export function startBattle(fighters: readonly Fighter[], canFlee = true): BattleState {
  return {
    fighters: fighters.map((f) => ({
      ...f,
      hp: f.maxHp,
      mp: f.maxMp,
      defending: false,
      fled: false,
      states: NO_STATES,
    })),
    round: 0,
    outcome: 'ongoing',
    canFlee,
  }
}

/** A battle with some fighters' hit points set — a party carrying its wounds in. */
export function withHp(state: BattleState, hp: ReadonlyMap<number, number>): BattleState {
  return {
    ...state,
    fighters: state.fighters.map((f, i) => {
      const set = hp.get(i)
      return set === undefined ? f : { ...f, hp: Math.max(0, Math.min(f.maxHp, set)) }
    }),
  }
}

/** A battle with some fighters' MP set — a party carrying what it has spent in. */
export function withMp(state: BattleState, mp: ReadonlyMap<number, number>): BattleState {
  return {
    ...state,
    fighters: state.fighters.map((f, i) => {
      const set = mp.get(i)
      return set === undefined ? f : { ...f, mp: Math.max(0, Math.min(f.maxMp, set)) }
    }),
  }
}

/** Standing and still in the battle: not fallen, and not fled. */
const alive = (f: FighterState) => f.hp > 0 && !f.fled

/**
 * Which of its ways a foe takes: a draw from 1 to 256, walked down the weights
 * — the reference's `ProcessEnemyRandomAction2A`, `getPercent(0x100) + 1`.
 */
function chosenWay(rng: BattleRng, weights: readonly number[]): number {
  let draw = rng.below(256) + 1
  for (let i = 0; i < weights.length; i++) {
    const weight = weights[i] as number
    if (draw <= weight) return i
    draw -= weight
  }
  return weights.length - 1
}

/**
 * A foe's command: one of its ways, drawn by {@link Rules.choice}. A heal goes
 * to its most wounded ally, itself among them; with no one hurt, and with no
 * ways at all, it attacks.
 */
function foeCommand(
  me: FighterState,
  fighters: readonly FighterState[],
  rng: BattleRng,
  rules: Rules,
): Command {
  const attack: Command = { kind: 'attack', target: -1 }
  const acts = me.acts
  if (!acts || acts.length === 0) return attack
  const act = acts[chosenWay(rng, me.choice ?? rules.choice)]
  if (!act) return attack
  if (act.kind === 'attack') {
    return act.poison === undefined ? attack : { kind: 'attack', target: -1, poison: act.poison }
  }
  if (act.kind === 'flee') return outclassed(me, fighters) ? { kind: 'flee' } : attack
  if (act.kind === 'wait') return { kind: 'wait', action: act.action }
  if (act.kind === 'change') return { kind: 'change', changing: act.changing, target: -1 }
  if (act.spell.does === 'harm') return { kind: 'spell', spell: act.spell, target: -1 }
  // The most wounded: the lowest share of its hit points, compared in whole numbers.
  let best = -1
  for (let i = 0; i < fighters.length; i++) {
    const f = fighters[i] as FighterState
    if (f.side !== me.side || !alive(f) || f.hp >= f.maxHp) continue
    const was = fighters[best]
    if (!was || f.hp * was.maxHp < was.hp * f.maxHp) best = i
  }
  return best < 0 ? attack : { kind: 'spell', spell: act.spell, target: best }
}

/** Whether a monster may run: the standing party's highest level has reached its {@link Fighter.runsFrom}. */
function outclassed(me: FighterState, fighters: readonly FighterState[]): boolean {
  if (me.runsFrom === undefined) return true
  let highest: number | undefined
  for (const f of fighters) {
    if (f.side === me.side || !alive(f) || f.level === undefined) continue
    highest = highest === undefined ? f.level : Math.max(highest, f.level)
  }
  return highest === undefined || highest >= me.runsFrom
}

function outcomeOf(fighters: readonly FighterState[]): Outcome {
  if (!fighters.some((f) => f.side === 'foes' && alive(f))) return 'won'
  if (!fighters.some((f) => f.side === 'party' && alive(f))) return 'lost'
  return 'ongoing'
}

/**
 * Play one round: every living fighter acts once, in the order the draw gives,
 * the party by its commands — an attack on the first living foe when it has
 * none — and the foes at a living party member.
 */
export function playRound(
  state: BattleState,
  commands: ReadonlyMap<number, Command>,
  rng: BattleRng,
  rules: Rules = DEFAULT_RULES,
): { state: BattleState; events: BattleEvent[] } {
  if (state.outcome !== 'ongoing') return { state, events: [] }
  const events: BattleEvent[] = []
  // Defending holds from the round's start, whoever acts first.
  // A sleeper cannot defend.
  let fighters: FighterState[] = state.fighters.map((f, i) => ({
    ...f,
    defending: alive(f) && f.states.sleep === undefined && commands.get(i)?.kind === 'defend',
  }))
  const order = fighters
    .map((f, i) => ({
      i,
      key: alive(f) ? initiative(rng, levelled(f.agility, f.states.agility.level)) : -1n,
    }))
    .filter(({ key }) => key >= 0n)
    .sort((a, b) => (a.key === b.key ? a.i - b.i : a.key > b.key ? -1 : 1))
    .map(({ i }) => i)

  let outcome: Outcome = 'ongoing'
  const setStates = (target: number, patch: Partial<States>) => {
    fighters = fighters.map((f, i) =>
      i === target ? { ...f, states: { ...f.states, ...patch } } : f,
    )
  }
  const hurt = (target: number, damage: number) => {
    fighters = fighters.map((f, i) => (i === target ? { ...f, hp: Math.max(0, f.hp - damage) } : f))
    if (damage > 0 && fighters[target]?.hp === 0) events.push({ kind: 'defeated', actor: target })
    else if (damage > 0 && fighters[target]?.states.sleep !== undefined) {
      // A blow that hurts wakes a sleeper.
      setStates(target, { sleep: undefined })
      events.push({ kind: 'woke', actor: target })
    }
  }
  /** A stat as its level has it — see `states.ts`. */
  const defenceOf = (f: FighterState) => levelled(f.defence, f.states.defence.level)
  /** Who took a turn this round: whose levels have a turn off at its end. */
  const acted: number[] = []
  const livingOn = (side: Side) =>
    fighters.flatMap((f, i) => (f.side === side && alive(f) ? [i] : []))

  for (const actor of order) {
    const me = fighters[actor]
    if (!me || !alive(me)) continue
    acted.push(actor)
    // A sleeper's turn goes on sleeping, or on waking.
    if (me.states.sleep !== undefined) {
      const slept = sleptThrough(me.states.sleep, rng)
      setStates(actor, { sleep: slept.sleep })
      events.push({ kind: slept.woke ? 'woke' : 'asleep', actor })
      continue
    }
    const command: Command =
      me.side === 'foes'
        ? foeCommand(me, fighters, rng, rules)
        : (commands.get(actor) ?? { kind: 'attack', target: -1 })

    if (command.kind === 'defend') {
      events.push({ kind: 'defend', actor })
      continue
    }
    if (command.kind === 'wait') {
      events.push({ kind: 'wait', actor, action: command.action })
      continue
    }
    if (command.kind === 'flee' && me.side === 'foes') {
      // A monster that flees is gone, and pays nothing.
      fighters = fighters.map((f, i) => (i === actor ? { ...f, fled: true } : f))
      events.push({ kind: 'flee', actor, escaped: true })
      outcome = outcomeOf(fighters)
      if (outcome !== 'ongoing') break
      continue
    }
    if (command.kind === 'flee') {
      const escaped = state.canFlee && rng.below(100) < rules.flee
      events.push({ kind: 'flee', actor, escaped })
      if (escaped) {
        outcome = 'fled'
        break
      }
      continue
    }
    if (command.kind === 'item') {
      let healed: number | undefined
      if (command.heal) {
        const amount = drawnAmount(rng, command.heal.base, command.heal.spread)
        healed = Math.max(0, Math.min(amount, me.maxHp - me.hp))
        const gained = healed
        fighters = fighters.map((f, i) => (i === actor ? { ...f, hp: f.hp + gained } : f))
      }
      events.push({ kind: 'item', actor, target: actor, item: command.item, healed })
      continue
    }

    if (command.kind === 'spell') {
      const { spell } = command
      if (me.mp < spell.cost) {
        events.push({
          kind: 'spell',
          actor,
          action: spell.action,
          short: true,
          critical: false,
          hits: [],
        })
        continue
      }
      fighters = fighters.map((f, i) => (i === actor ? { ...f, mp: f.mp - spell.cost } : f))
      const side: Side = spell.does === 'heal' ? me.side : me.side === 'party' ? 'foes' : 'party'
      const standing = livingOn(side)
      const named = fighters[command.target]
      // A foe's aim is drawn among the standing, as its attack's is.
      const first =
        named && alive(named) && named.side === side
          ? command.target
          : me.side === 'foes'
            ? standing[rng.below(standing.length)]
            : standing[0]
      if (first === undefined) {
        events.push({
          kind: 'spell',
          actor,
          action: spell.action,
          short: false,
          critical: false,
          hits: [],
        })
        continue
      }
      const kind = fighters[first]?.name
      const reached =
        spell.reach === 'one'
          ? [first]
          : spell.reach === 'group'
            ? standing.filter((i) => fighters[i]?.name === kind)
            : standing
      // Whether it goes haywire is the cast's; how much, each one's own.
      const critical = rng.below(10_000) < rules.magicCritical
      const hits = reached.map((target) => {
        const them = fighters[target] as FighterState
        let amount = spell.amount
          ? drawnAmount(rng, spell.amount.base, spell.amount.spread)
          : them.maxHp
        if (critical && spell.amount) amount = criticalDamage(rng, amount)
        if (spell.does === 'heal') amount = Math.max(0, Math.min(amount, them.maxHp - them.hp))
        return { target, amount }
      })
      // Told before anyone it fells falls.
      events.push({ kind: 'spell', actor, action: spell.action, short: false, critical, hits })
      for (const { target, amount } of hits) {
        if (spell.does === 'harm') hurt(target, amount)
        else fighters = fighters.map((f, i) => (i === target ? { ...f, hp: f.hp + amount } : f))
      }
      outcome = outcomeOf(fighters)
      if (outcome !== 'ongoing') break
      continue
    }

    if (command.kind === 'change') {
      const { changing } = command
      if (me.mp < changing.cost) {
        events.push({
          kind: 'change',
          actor,
          action: changing.action,
          change: changing.change.kind,
          short: true,
          hits: [],
        })
        continue
      }
      fighters = fighters.map((f, i) => (i === actor ? { ...f, mp: f.mp - changing.cost } : f))
      const side: Side = changing.side === 'own' ? me.side : me.side === 'party' ? 'foes' : 'party'
      const standing = livingOn(side)
      const named = fighters[command.target]
      const first =
        named && alive(named) && named.side === side
          ? command.target
          : standing[rng.below(standing.length)]
      if (first === undefined) {
        events.push({
          kind: 'change',
          actor,
          action: changing.action,
          change: changing.change.kind,
          short: false,
          hits: [],
        })
        continue
      }
      const kind = fighters[first]?.name
      const reached =
        changing.reach === 'one'
          ? [first]
          : changing.reach === 'group'
            ? standing.filter((i) => fighters[i]?.name === kind)
            : standing
      const { change } = changing
      const hits = reached.map((target) => {
        const was = (fighters[target] as FighterState).states
        const already =
          change.kind === 'sleep'
            ? was.sleep !== undefined
            : change.kind === 'poison'
              ? was.poisoned
              : false
        if (already) return { target, result: 'already' as const }
        if (rng.below(100) >= change.chance) return { target, result: 'resisted' as const }
        if (change.kind === 'sleep') {
          setStates(target, { sleep: SLEEP_TURNS })
          return { target, result: 'asleep' as const }
        }
        if (change.kind === 'poison') {
          setStates(target, { poisoned: true })
          return { target, result: 'poisoned' as const }
        }
        const next = moved(was[change.kind], change.by)
        if (!next) return { target, result: 'already' as const }
        setStates(target, { [change.kind]: next })
        return { target, result: change.by > 0 ? ('raised' as const) : ('lowered' as const) }
      })
      events.push({
        kind: 'change',
        actor,
        action: changing.action,
        change: change.kind,
        short: false,
        hits,
      })
      continue
    }

    // An attack: at the target named, or at someone living on the other side.
    const others = livingOn(me.side === 'party' ? 'foes' : 'party')
    if (others.length === 0) break
    const named = fighters[command.target]
    const target =
      named && alive(named) && named.side !== me.side
        ? command.target
        : me.side === 'foes'
          ? (others[rng.below(others.length)] as number)
          : (others[0] as number)
    const them = fighters[target] as FighterState

    // **The game's order of a blow's draws** — `func_ov024_021eb5d0`, read from
    // the decomp; `docs/conformance.md`, "The resolver of a blow". Each is made
    // whether or not it can come to anything, which is the point: a battle
    // replays from a seed only if every draw is spent where the game spends it.
    //
    // 1. The critical roll, always. A monster's rate is nothing and its draw is
    //    spent all the same.
    const critical = rng.below(10_000) < (me.side === 'party' ? rules.critical : 0)
    // 2. The dodge, its rate truncated. The plain attack can be dodged.
    const dodged = rng.below(100) < Math.trunc(evadeOf(them, rules))
    // 3. The block — not rolled for a blow already dodged — the draw as a float
    //    under the rate, untruncated. The plain attack can be blocked.
    const blocked = !dodged && Math.fround(rng.below(100)) < Math.fround(blockOf(them))
    // 4. The accuracy: a draw below 100 made before anything is compared. The
    //    plain attack's accuracy stands at a hundred, so it lands every time —
    //    and spends this. (Sight spoilt, which would miss it five times in
    //    eight, is not modelled.)
    rng.below(100)
    // 5. The damage, worked out **even for a blow that was dodged or blocked**:
    //    the game calls `GetAttackBaseDamage` whenever the blow lands, and the
    //    dodge and the block ride along as flags.
    let damage = physicalDamage(rng, me.attack, defenceOf(them))
    if (critical) {
      // The greatest of the damage and a fifth, the attack power times a draw
      // from 0.95 to 1.05, and the damage itself — read from the head of
      // `func_ov024_021e6a90`. The base damage's draws come first, as above.
      damage = criticalHit(rng, damage, me.attack)
    }
    if (dodged || blocked) {
      // The game's: each flag zeroes the damage, late, in `func_ov024_021e6a90`
      // (0x021e777c, 0x021e77a0), and a blow so zeroed gets no coin.
      damage = 0
    } else if (damage <= 0) {
      // The game's, 0x021e7824–0x021e7904: a blow that comes to nothing, and
      // was neither dodged nor blocked, deals a draw below 2 instead. **Whoever
      // struck it** — the code looks at the blow and the target and never at
      // the attacker's side; the reference had it for a monster's blow only.
      // (Its other conditions — the target not immune to the action's element,
      // the action not 0x1B, 0x48 or 0x70, a metal body only under an action
      // that works on one — are all met by the plain attack on what the slice
      // fields.)
      damage = rng.below(2)
    } else if (me.side === 'foes' && !critical && them.defending) {
      // The reference's: defending halves a monster's blow that deals
      // something. The game halves a damaging action (×0.5 at 0x021e7a80) on a
      // status bit of the target's that is INFERRED to be defending, and does
      // so after the coin above, whoever strikes — which would make a defended
      // 0-or-1 always 0 and halve the party's blows too. Not taken up until the
      // bit is known; `docs/conformance.md`, "What the rest of a blow does".
      damage = Math.trunc(damage / 2)
    }
    // A poison attack's poison: the reference's 12 in 100, on a blow that lands.
    const poisoned =
      !dodged &&
      !blocked &&
      command.poison !== undefined &&
      !them.states.poisoned &&
      rng.below(100) < command.poison
    if (poisoned) setStates(target, { poisoned: true })
    events.push({
      kind: 'attack',
      actor,
      target,
      damage,
      critical: critical && !dodged && !blocked,
      dodged,
      blocked,
      ...(poisoned ? { poisoned: true } : {}),
    })
    hurt(target, damage)
    outcome = outcomeOf(fighters)
    if (outcome !== 'ongoing') break
  }

  if (outcome === 'ongoing') {
    // Each who took a turn has a turn off its levels, and they may wear off.
    for (const i of acted) {
      const f = fighters[i]
      if (!f || !alive(f)) continue
      for (const stat of ['defence', 'agility'] as const) {
        const worn = wornAfterTurn((fighters[i] as FighterState).states[stat], rng)
        setStates(i, { [stat]: worn.level })
        if (worn.wore) events.push({ kind: 'wornOff', actor: i, stat })
      }
    }
    // Then poison takes its toll.
    for (let i = 0; i < fighters.length; i++) {
      const f = fighters[i] as FighterState
      if (!alive(f) || !f.states.poisoned) continue
      const damage = poisonDamage(f.maxHp)
      events.push({ kind: 'poison', actor: i, damage })
      hurt(i, damage)
    }
    outcome = outcomeOf(fighters)
  }

  fighters = fighters.map((f) => ({ ...f, defending: false }))
  return { state: { ...state, fighters, round: state.round + 1, outcome }, events }
}

/** What winning is worth: every foe's experience and gold, added up. */
export function spoils(state: BattleState): { exp: number; gold: number } {
  let exp = 0
  let gold = 0
  for (const f of state.fighters) {
    // One that fled is gone with what it was worth.
    if (f.side !== 'foes' || f.fled) continue
    exp += f.exp
    gold += f.gold
  }
  return { exp, gold }
}
