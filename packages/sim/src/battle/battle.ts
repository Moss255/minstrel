import { criticalBlow, criticalDamage, drawnAmount, initiative, physicalDamage } from './damage.ts'
import type { BattleRng } from './rng.ts'

/**
 * A battle, round by round: who acts in what order, what an attack does, and
 * when it is over. Headless and deterministic — the same fighters, commands and
 * seed give the same battle.
 *
 * **From the reference** (DQIX/BattleEmulator, MIT — see `damage.ts`):
 * - the order of a round: agility times a draw from 0.51 to 1.0, highest first;
 * - an attack's damage, `FUN_0207564c`; and on a monster's blow that deals
 *   nothing, a draw of 0 or 1 in its place;
 * - a monster's blow dodged 2 times in 100, and blocked by a shield when a
 *   draw below 100 is 0;
 * - defending halving a blow, from the round's start — though not the 0-or-1
 *   blow;
 * - the party's critical hit: a draw below 10,000 under {@link Rules.critical},
 *   dealing the attacker's attack power times 0.95 to 1.05;
 * - a healing item's amount, its base give or take its spread, `drawnAmount`;
 * - a spell's amount, drawn the same way — the reference's Heal, Crack, Woosh
 *   and Crackle — and its going haywire: a draw below 10,000 under
 *   {@link Rules.magicCritical}, 100 on all four, multiplying the amount by 1.5
 *   to 2.0 (`criticalDamage`); and its MP spent as it is cast.
 *
 * **Ours, and said so:**
 * - the order the numbers are drawn in, which is not the game's: the reference
 *   also steps past draws that do nothing here;
 * - a round of more than two fighters, which the reference, one against one,
 *   does not have: everyone is ordered by the same draw;
 * - a monster's target, a draw among the living party;
 * - which of its six ways a monster takes is the reference's draw, but the
 *   weights are its even table for every monster (see {@link Rules.choice});
 *   a monster that flees always gets away, and pays nothing; one that would
 *   heal with no one hurt attacks instead;
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
 *   and which looks like its one foe's own resistance: left out.
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
  /** What beating this fighter is worth, when it is a foe. */
  readonly exp: number
  readonly gold: number
  /** A foe's ways of acting, one drawn each turn by {@link Rules.choice}; with none, it attacks. */
  readonly acts?: readonly FoeAction[]
}

export interface FighterState extends Fighter {
  readonly hp: number
  readonly mp: number
  readonly defending: boolean
  /** A foe that has fled: out of the battle, and paying nothing. */
  readonly fled: boolean
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

/** One of a foe's ways of acting — the game gives each monster six: attack, flee, or a spell. */
export type FoeAction =
  | { readonly kind: 'attack' }
  | { readonly kind: 'flee' }
  | { readonly kind: 'spell'; readonly spell: Spell }

export type Command =
  | { readonly kind: 'attack'; readonly target: number }
  | { readonly kind: 'defend' }
  | { readonly kind: 'flee' }
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
    }
  | { readonly kind: 'defend'; readonly actor: number }
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
  /** A monster's blow dodged, in 100 — the reference's. */
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

export function startBattle(fighters: readonly Fighter[], canFlee = true): BattleState {
  return {
    fighters: fighters.map((f) => ({
      ...f,
      hp: f.maxHp,
      mp: f.maxMp,
      defending: false,
      fled: false,
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
  const act = acts[chosenWay(rng, rules.choice)]
  if (!act || act.kind === 'attack') return attack
  if (act.kind === 'flee') return { kind: 'flee' }
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
  let fighters: FighterState[] = state.fighters.map((f, i) => ({
    ...f,
    defending: alive(f) && commands.get(i)?.kind === 'defend',
  }))
  const order = fighters
    .map((f, i) => ({ i, key: alive(f) ? initiative(rng, f.agility) : -1n }))
    .filter(({ key }) => key >= 0n)
    .sort((a, b) => (a.key === b.key ? a.i - b.i : a.key > b.key ? -1 : 1))
    .map(({ i }) => i)

  let outcome: Outcome = 'ongoing'
  const hurt = (target: number, damage: number) => {
    fighters = fighters.map((f, i) => (i === target ? { ...f, hp: Math.max(0, f.hp - damage) } : f))
    if (damage > 0 && fighters[target]?.hp === 0) events.push({ kind: 'defeated', actor: target })
  }
  const livingOn = (side: Side) =>
    fighters.flatMap((f, i) => (f.side === side && alive(f) ? [i] : []))

  for (const actor of order) {
    const me = fighters[actor]
    if (!me || !alive(me)) continue
    const command: Command =
      me.side === 'foes'
        ? foeCommand(me, fighters, rng, rules)
        : (commands.get(actor) ?? { kind: 'attack', target: -1 })

    if (command.kind === 'defend') {
      events.push({ kind: 'defend', actor })
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

    if (me.side === 'party') {
      const critical = rng.below(10_000) < rules.critical
      const damage = critical
        ? criticalBlow(rng, me.attack)
        : physicalDamage(rng, me.attack, them.defence)
      events.push({
        kind: 'attack',
        actor,
        target,
        damage,
        critical,
        dodged: false,
        blocked: false,
      })
      hurt(target, damage)
    } else {
      const dodged = rng.below(100) < rules.dodge
      const blocked = !dodged && them.shield && rng.below(100) === 0
      let damage = 0
      if (!dodged && !blocked) {
        damage = physicalDamage(rng, me.attack, them.defence)
        if (damage === 0) {
          damage = rng.below(2)
        } else if (them.defending) {
          damage = Math.trunc(damage / 2)
        }
      }
      events.push({ kind: 'attack', actor, target, damage, critical: false, dodged, blocked })
      hurt(target, damage)
    }
    outcome = outcomeOf(fighters)
    if (outcome !== 'ongoing') break
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
