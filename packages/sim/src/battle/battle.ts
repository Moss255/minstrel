import { criticalBlow, drawnAmount, initiative, physicalDamage } from './damage.ts'
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
 * - a healing item's amount, its base give or take its spread, `drawnAmount`.
 *
 * **Ours, and said so:**
 * - the order the numbers are drawn in, which is not the game's: the reference
 *   also steps past draws that do nothing here;
 * - a round of more than two fighters, which the reference, one against one,
 *   does not have: everyone is ordered by the same draw;
 * - a monster's target, a draw among the living party, and its action, an
 *   attack: a monster's six action words are not read;
 * - the critical chance, the reference's 200 in 10,000 for its level-13 case —
 *   how the game derives it is not read;
 * - fleeing, which the reference does not model: {@link Rules.flee} in 100;
 * - an item used in battle: its heal lands on the user's turn, on the user,
 *   and no more than their wounds — one draw, where the game's others are not
 *   modelled.
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
}

export interface FighterState extends Fighter {
  readonly hp: number
  readonly mp: number
  readonly defending: boolean
}

/** What an item does when used: the HP it restores, as a base give or take a spread. */
export interface Heal {
  readonly base: number
  readonly spread: number
}

export type Command =
  | { readonly kind: 'attack'; readonly target: number }
  | { readonly kind: 'defend' }
  | { readonly kind: 'flee' }
  /** Use an item, by id: its heal when it has one, and nothing when it has not. */
  | { readonly kind: 'item'; readonly item: number; readonly heal?: Heal }

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
}

export const DEFAULT_RULES: Rules = { critical: 200, dodge: 2, flee: 50 }

export function startBattle(fighters: readonly Fighter[], canFlee = true): BattleState {
  return {
    fighters: fighters.map((f) => ({ ...f, hp: f.maxHp, mp: f.maxMp, defending: false })),
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

const alive = (f: FighterState) => f.hp > 0

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
        ? { kind: 'attack', target: -1 }
        : (commands.get(actor) ?? { kind: 'attack', target: -1 })

    if (command.kind === 'defend') {
      events.push({ kind: 'defend', actor })
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
    if (f.side !== 'foes') continue
    exp += f.exp
    gold += f.gold
  }
  return { exp, gold }
}
