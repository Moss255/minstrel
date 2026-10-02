import { FALLOFF, handled, passesOf, RETARGETED, THRUST_HANDLER } from './blows.ts'
import { brokenChain, type Chain, chainStep, NO_CHAIN } from './combo.ts'
import {
  criticalChance,
  criticalDamage,
  dealt,
  drawnAmount,
  GUARD_LEVELS,
  initiative,
  partyAmount,
  physicalDamage,
  resistanceTo,
} from './damage.ts'
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
import { psychedUp, TENSION_MOST, tensed } from './tension.ts'

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
 *   blow. **Still the reference's**: the halving found in the game's own
 *   resolver belongs to a fighter at maximum tension, not to a defence, and
 *   the Defend command's own handler is not located — `docs/conformance.md`,
 *   "It was not defending";
 * - the party's critical hit: a draw below 10,000 under {@link Rules.critical},
 *   dealing the attacker's attack power times 0.95 to 1.05;
 * - a spell's going haywire multiplying its amount by 1.5 to 2.0
 *   (`criticalDamage`), under {@link Rules.magicCritical} in 10,000 — 100, which
 *   is the game's at any deftness to 150; and its MP spent as it is cast;
 * - changes of state, `states.ts`: defence and agility levels, sleep, poison.
 *   **Whether one lands is the game's** — its accuracy roll, in the resolver's
 *   order; the chances a way gives them are the action records' own, and the
 *   reference's are those: Kasap and Deceleratle 75 in 100, Sweet Breath's
 *   sleep 25, its poison attack's 12. Nobody's resistance is modelled;
 *   a sleeper losing its turns, and unable to defend.
 *
 * **A blow that comes to nothing deals 0 or 1, whoever strikes it** — the
 * game's, read from `func_ov024_021e6a90`; the reference had it for monsters.
 *
 * **What a spell or an item amounts to is the game's**, and the draws made on
 * the way to it, in its order — `drawnAmount`, `partyAmount`, and
 * `docs/conformance.md`, "What is not a plain blow": a die for each one
 * reached, the critical roll (the cast's for a group or all, never a
 * monster's), the accuracy's draw, and the amount — a monster's base, or one of
 * the party's least-to-most by their might or mending.
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

/** One of a monster's two drops: the item, and the chance step of its record. */
export interface Drop {
  readonly item: number
  /** 0 always, 1 to 6 one in `2 ** (step + 2)`, 7 none — see `dropOneIn`. */
  readonly step: number
}

export interface Fighter {
  readonly name: string
  readonly side: Side
  readonly maxHp: number
  readonly maxMp: number
  readonly attack: number
  readonly defence: number
  readonly agility: number
  /**
   * What it takes of each element, in hundredths, by `element − 1` — a
   * monster's from its record; see `resistanceTo`. Whole when not given.
   */
  readonly resist?: readonly number[]
  /**
   * Its deftness, which its chance of a critical climbs with past 150 — see
   * `criticalChance`. Without it the rules' flat chance stands, which is what
   * the game's comes to at any deftness up to 150.
   */
  readonly deftness?: number
  /**
   * A monster's family, 0–15, and whether its body is metal — `mon_data`
   * `+0x0A` bits 7–10 and bit 12, which the abilities' handlers ask
   * (`func_ov000_02156068`). None for the party.
   */
  readonly family?: number
  readonly metal?: boolean
  /** Magical might and magical mending, which a spell's amount may scale by. Nothing when not given. */
  readonly might?: number
  readonly mending?: number
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
  /**
   * What a foe may drop: its two item ids, the ordinary and the rare, each
   * with the chance step of its record — see `dropOneIn` and {@link drops}.
   * Nothing when it drops nothing.
   */
  readonly drops?: readonly [Drop, Drop]
  /**
   * Which monster a foe is, by its record's number: what beating it drops
   * goes by the kind, not by each monster — see `dropsWon`.
   */
  readonly kind?: number
  /** A foe's ways of acting, one drawn each turn by {@link Rules.choice}; with none, it attacks. */
  readonly acts?: readonly FoeAction[]
  /** The weights its ways are drawn by, in 256, where they are not the rules' — a boss's falling table. */
  readonly choice?: readonly number[]
  /**
   * A party member's level, which a monster weighs before it runs, and which
   * tension's bonus is made from (`CalculateTensionBonus`) — at their
   * vocation. A monster's own is not given, and counts as nothing.
   */
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
  /**
   * The rounds one of the party has been standing at the start of — what
   * their share of the experience is weighed by; see `experienceShares`.
   * The game's counter at `+0x19c` → `+8`, added to at `0x021dacb0` of
   * overlay 26 — taken to be a round's start, and not for one who is down:
   * INFERRED. Nothing before the first round.
   */
  readonly rounds?: number
}

/** What an item does when used: the HP it restores, as a base give or take a spread. */
export interface Heal {
  /** What a monster's amount is drawn about — and anyone's, where {@link party} is not given. */
  readonly base: number
  readonly spread: number
  /**
   * What one of the party's is made from instead — the game's, see
   * `partyAmount`: the least and the most, and the number of the user's it
   * scales between them by, where its record names one.
   */
  readonly party?: {
    readonly min: number
    readonly max: number
    readonly scales?: { readonly by: 'might' | 'mending'; readonly lo: number; readonly hi: number }
  }
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
  /** The element of what it deals — its record's; none is resisted by no one. */
  readonly element?: number
  /** The most it can deal — its record's cap. */
  readonly cap?: number
  /**
   * Its record's `criticalPercent`, which multiplies the caster's chance of
   * going haywire — 50 on the spells, so half of a blow's. Without it the
   * rules' flat chance stands.
   */
  readonly criticalPercent?: number
  /** Whether a guard halves it — its record's `defendable`; 243 actions carry it. */
  readonly defendable?: boolean
  /** Whether its blows chain into a combo — its record's `+0x2C` bit 27; Frizz has it. */
  readonly combos?: boolean
  /** Whether tension works on it and is spent by it — its record's `+0x10` bit `0x2000`. */
  readonly tensed?: boolean
  /** Its record's kind: 1, a blow's, is halved on a target at the maximum of tension. */
  readonly kind?: number
}

/** What a change of state does, and its chance in 100 of landing — see `states.ts`. */
export type Change =
  | { readonly kind: 'sleep'; readonly chance: number }
  | { readonly kind: 'poison'; readonly chance: number }
  | { readonly kind: 'defence' | 'agility'; readonly by: number; readonly chance: number }

/** A way of changing state, as the battle casts it: on one, a group or all, of its caster's side or the other. */
/**
 * **An ability's blow**, as the resolver plays it — see `blows.ts`. The
 * action's record, as far as the passes read it.
 */
export interface Blow {
  readonly action: number
  /** Its damage handler, `+0x18` bits 18–26. */
  readonly handler: number
  readonly reach: 'one' | 'group' | 'all'
  /** Its hit code, `+0x1C` bits 14–18 — see `passesOf`. */
  readonly hits: number
  /** Its critical chance's multiplier, in hundredths. */
  readonly criticalPercent: number
  readonly element: number
  readonly cap?: number
  /** Whether it falls off over its passes, `+0x10` bit 17. */
  readonly falloff: boolean
  readonly evadable: boolean
  readonly blockable: boolean
  readonly defendable: boolean
  readonly tensed: boolean
  readonly combos: boolean
  /** What runs once after it, `+0x2c` bits 10–13 — see the post-steps. */
  readonly after: number
  /**
   * Always a critical (`+0x08` bit 29): no draw for it, shown as one, and —
   * but for Critical Claim — never multiplied (`func_ov024_021ea7fc`).
   */
  readonly sure?: boolean
}

export interface Changing {
  readonly action: number
  readonly cost: number
  readonly change: Change
  readonly reach: 'one' | 'group' | 'all'
  readonly side: 'own' | 'other'
  /** The element its landing is resisted by — its record's; Kasap's 19, Snooze's 10. */
  readonly element?: number
  /** Whether it can be dodged — the action's own flag; Sweet Breath's is set, Kasap's is not. */
  readonly evadable?: boolean
  /**
   * Whether one of the party's cast of it can go haywire — its record's
   * critical multiplier is not nothing; 50 on Sap, Snooze and their like. A
   * cast that does lands outright.
   */
  readonly haywire?: boolean
  /** Its record's `criticalPercent`, which multiplies the caster's chance — see {@link Spell.criticalPercent}. */
  readonly criticalPercent?: number
}

/** How a change came out on one it reached. */
export type ChangeResult =
  | 'asleep'
  | 'poisoned'
  | 'raised'
  | 'lowered'
  | 'already'
  | 'resisted'
  | 'dodged'

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
  | {
      readonly kind: 'psyche'
      readonly action: number
      readonly steps: number
      readonly outright?: boolean
    }
  /** One of its own blows — see `Blow`. */
  | { readonly kind: 'blow'; readonly blow: Blow }

export type Command =
  /** An attack; one that poisons, by its chance in 100, gives it. */
  | { readonly kind: 'attack'; readonly target: number; readonly poison?: number }
  /** Change state on a fighter — for one that reaches further, on that fighter's kind or side. */
  | { readonly kind: 'change'; readonly changing: Changing; readonly target: number }
  | { readonly kind: 'defend' }
  | { readonly kind: 'flee' }
  /** Do nothing this turn, as the action says — a monster's idle way. */
  | { readonly kind: 'wait'; readonly action: number }
  /**
   * Use an item, by id: its heal when it has one, and nothing when it has not
   * — on the ally named, or on oneself when none is or they have fallen
   * (`func_ov000_02153cc0`'s fallback to the actor).
   */
  | { readonly kind: 'item'; readonly item: number; readonly heal?: Heal; readonly target?: number }
  /** Cast a spell at a fighter — for one that reaches further, at that fighter's kind or side. */
  | { readonly kind: 'spell'; readonly spell: Spell; readonly target: number }
  /** An ability's blow at a monster — for one that reaches further, at its group or all. */
  | { readonly kind: 'blow'; readonly blow: Blow; readonly target: number }
  /**
   * Psyche Up, its record's number of steps (`+0x30`), on oneself — see
   * `tension.ts`; `outright`, the two (0x151, 0x152) that go straight to that
   * level, step by step and with no coin.
   */
  | {
      readonly kind: 'psyche'
      readonly action: number
      readonly steps: number
      readonly outright?: boolean
    }

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
      /** The combo it was multiplied by, 1 to 3 and on — see `combo.ts`; absent for none. */
      readonly combo?: number
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
  /**
   * Psyche Up: each step's new level, 1 to 4, or −1 for the coin lost at 3;
   * none for one that could not (at the maximum already) — "But nothing happens."
   */
  | {
      readonly kind: 'psyche'
      readonly actor: number
      readonly action: number
      readonly steps: readonly number[]
      /** One that went straight up — "…'s tension gets a huge boost all of a sudden!" first. */
      readonly outright?: boolean
    }
  /**
   * An ability's blow: each pass's target and what it came to — a hit, its
   * critical, dodged or blocked — and what came back to the one striking.
   */
  | {
      readonly kind: 'blow'
      readonly actor: number
      readonly action: number
      readonly hits: readonly {
        readonly target: number
        readonly damage: number
        readonly critical: boolean
        readonly dodged: boolean
        readonly blocked: boolean
      }[]
      /** HP lost to the blow's own recoil (post-step 3). */
      readonly recoil?: number
      /** HP or MP regained by it (post-steps 4 and 1). */
      readonly regained?: { readonly hp?: number; readonly mp?: number }
      /** It set its striker to guarding (post-step 2). */
      readonly guards?: boolean
    }
  /** Tension spent, after the action that spent it — from the maximum, or below it. */
  | { readonly kind: 'calmed'; readonly actor: number; readonly most: boolean }

export type Outcome = 'ongoing' | 'won' | 'lost' | 'fled'

export interface BattleState {
  readonly fighters: readonly FighterState[]
  readonly round: number
  readonly outcome: Outcome
  /** Whether the party may flee: not from a boss. */
  readonly canFlee: boolean
  /** How the fight opened, which decides who sits the first round out — see {@link Opening}. */
  readonly opening?: Opening
  /** How many times the party has tried to flee this battle — see {@link fleeChance}. */
  readonly fleeAttempts?: number
  /** The combo chain, from blow to blow — see `combo.ts`; none before the first. */
  readonly chain?: Chain
}

export interface Rules {
  /** The party's critical-hit chance, in 10,000 — the reference's level-13 case. */
  readonly critical: number
  /** One of the party dodging a blow, in 100 — the game's own two, `func_ov000_02156270`. */
  readonly dodge: number
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
  magicCritical: 100,
  choice: [43, 42, 43, 43, 42, 43],
}

/**
 * A fighter's chance, in 10,000, that a blow or a cast of theirs goes the
 * game's way — `CalculateCritRate` with the action's own multiplier, where the
 * fighter carries a deftness, and the rules' flat chance where it does not.
 * **A monster's is a literal nothing** (`func_020748f8`), and its draw is
 * spent all the same.
 */
function criticalRate(me: FighterState, percent: number, flat: number, passes = 1): number {
  if (me.side !== 'party') return 0
  // Without deftness, the rules' flat chance over the passes — ours.
  return me.deftness === undefined
    ? Math.trunc(flat / passes)
    : criticalChance(me.deftness, percent, passes)
}

/** A target's chance of dodging, in a hundred — the game's `func_ov000_02156270`, without its bonuses and statuses. */
function evadeOf(target: Fighter, rules: Rules): number {
  return target.evade ?? (target.side === 'party' ? rules.dodge : 0)
}

/** The element of the plain Attack, and of poison — the action records' own; see game-formats' `MonsterBattle.resistances`. */
const PLAIN_ATTACK_ELEMENT = 8
const POISON_ELEMENT = 16

/** An amount as the game draws it for whoever uses the action: a monster's, or one of the party's. */
function amountFor(rng: BattleRng, user: Fighter, amount: Heal): number {
  if (user.side === 'foes' || !amount.party) return drawnAmount(rng, amount.base, amount.spread)
  const { min, max, scales } = amount.party
  return partyAmount(
    rng,
    scales
      ? { min, max, scales: { stat: user[scales.by] ?? 0, lo: scales.lo, hi: scales.hi } }
      : { min, max },
    amount.spread,
  )
}

/** A target's chance of blocking, in a hundred — the game's `func_ov000_02156118`, likewise. */
function blockOf(target: Fighter): number {
  return target.block ?? (target.shield ? 1 : 0)
}

/**
 * How a fight opened, which decides who sits the first round out — the game's
 * `[battle + 0xe49]`, read by `ProcessCombatTurn`. What sets it is **not
 * read**: nothing here chooses it, and a battle opens `even` unless it is
 * given one.
 */
export type Opening = 'even' | 'monstersSitOut' | 'partySitsOut'

export function startBattle(
  fighters: readonly Fighter[],
  canFlee = true,
  opening: Opening = 'even',
): BattleState {
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
    opening,
    fleeAttempts: 0,
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

/**
 * A monster after the first acts in a round the party is surprised in only on
 * a draw below a hundred coming in under this — the game's 67, at
 * `0x0215d790`.
 */
export const SURPRISED_ACTS_BELOW = 67

/**
 * The least chance in a hundred a flight has, by how many have been tried in
 * this battle — the game's table at `0x02182c04`, which its roll takes the
 * greater of against what the party's own numbers give.
 *
 * The table holds `25 50 75 100 65535 0 0 0`. The fifth entry passes any draw,
 * so a fifth attempt always gets away and the battle ends there: the zeros
 * after it cannot be reached, and holding the count at `100` here comes to the
 * same thing.
 */
export const FLEE_FLOOR = [25, 50, 75, 100] as const

/**
 * Whether the party gets away, and what it costs in draws — the game's
 * `func_ov000_0215f7a8`, which `func_ov026_021dd3dc` calls once for the
 * members who chose to flee.
 *
 * In the game's order:
 *
 * 1. a battle whose setup forbids it never lets go — {@link BattleState.canFlee};
 * 2. the party **surprised the monsters**: away, and no draw;
 * 3. **nothing left that can act**: away, and no draw;
 * 4. **three times what the monsters have** — the mean of attack and defence
 *    over each side, unbuffed — **not above the party's**: away, and no draw;
 * 5. otherwise a chance of `10 + deftness ÷ 20` — INFERRED: the field the game
 *    reads is ten bits of the combatant's, and what it holds is not
 *    established — held up to the floor above, and a draw below a hundred has
 *    to come in under it.
 *
 * **The draw is the world's**, `GetBTRandom()`, not the battle's: fleeing
 * spends none of the battle's own numbers. The caller hands the world's
 * generator in; without one this takes the battle's, which is **ours**.
 */
export function fleeChance(
  state: BattleState,
  fighters: readonly FighterState[],
  actor: number,
): { certain: boolean; chance: number } {
  const mine = fighters[actor]
  if (!state.canFlee || !mine) return { certain: false, chance: 0 }
  if (state.opening === 'monstersSitOut') return { certain: true, chance: 100 }
  const standing = (side: Side) =>
    fighters.filter((f) => f.side === side && f.hp > 0 && !f.fled && f.states.sleep === undefined)
  const foes = standing('foes')
  if (foes.length === 0) return { certain: true, chance: 100 }
  const worth = (of: readonly FighterState[]) =>
    of.reduce((sum, f) => sum + f.attack + f.defence, 0) / Math.max(1, of.length)
  if (3 * worth(foes) <= worth(standing('party'))) return { certain: true, chance: 100 }
  const own = Math.trunc(Math.fround(Math.fround(mine.deftness ?? 0) * Math.fround(0.05))) + 10
  const floor = FLEE_FLOOR[Math.min(state.fleeAttempts ?? 0, FLEE_FLOOR.length - 1)] as number
  return { certain: false, chance: Math.max(own, floor) }
}

/** Double-Edged Slash and Miracle Moon, which the steps after a blow name by number. */
const DOUBLE_EDGED_SLASH = 0xaf
/** Critical Claim, the one always-critical action whose critical multiplies. */
const CRITICAL_CLAIM = 0x1f9
const MIRACLE_MOON = 0x91

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
  if (act.kind === 'psyche') return act
  if (act.kind === 'blow') return { kind: 'blow', blow: act.blow, target: -1 }
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
  /**
   * The world's generator, which a flight is drawn from — `GetBTRandom()`.
   * Without it the battle's own stands in, which is **ours**.
   */
  world?: BattleRng,
): { state: BattleState; events: BattleEvent[] } {
  if (state.outcome !== 'ongoing') return { state, events: [] }
  const events: BattleEvent[] = []
  // **A flight is the party's, and settled before the round** — overlay 26's
  // `func_ov026_021dd3dc` at the command phase's end, once for the party, by
  // `func_ov000_0215f7a8` (see `fleeChance`), before anyone is ordered. Away,
  // and the round is not fought; caught, and **every one of the party loses
  // its round** — its action 0 with the skip bit (`func_ov000_02169850`,
  // `0x02169978`), which `ProcessCombatTurn` passes over (`0x0215dabc`).
  // **Ours**: whose numbers the chance is taken from — the first of the party
  // able to act; the game hands its whole list in, and how it reads them is
  // not established.
  let attempts = state.fleeAttempts ?? 0
  let caught = false
  const fleer = state.fighters.findIndex(
    (f, i) => f.side === 'party' && commands.get(i)?.kind === 'flee' && f.hp > 0,
  )
  if (fleer >= 0) {
    const ableFirst = state.fighters.findIndex(
      (f) => f.side === 'party' && f.hp > 0 && f.states.sleep === undefined,
    )
    const by = ableFirst >= 0 ? ableFirst : fleer
    const { certain, chance } = fleeChance(state, state.fighters, by)
    const escaped = certain || (chance > 0 && (world ?? rng).below(100) < chance)
    if (!certain && chance > 0) attempts++
    events.push({ kind: 'flee', actor: by, escaped })
    if (escaped) {
      return { state: { ...state, outcome: 'fled', fleeAttempts: attempts }, events }
    }
    caught = true
  }
  // Defending holds from the round's start, whoever acts first.
  // A sleeper cannot defend.
  let fighters: FighterState[] = state.fighters.map((f, i) => ({
    ...f,
    defending: alive(f) && f.states.sleep === undefined && commands.get(i)?.kind === 'defend',
    // A round counted for each of the party standing at its start.
    ...(f.side === 'party' && alive(f) ? { rounds: (f.rounds ?? 0) + 1 } : {}),
  }))
  // **The game's, in its order** (`ProcessCombatTurn`, `0x0215d740` on): each
  // fighter in turn is looked at, and one the opening leaves out is passed
  // over **without an initiative roll**; the rest are rolled for and the
  // scores sorted highest first. A surprise round therefore makes fewer draws.
  // Which fighter the game counts as the first monster is its own list's; ours
  // is the order they stand in.
  const opening = state.round === 0 ? (state.opening ?? 'even') : 'even'
  let monstersSoFar = 0
  const scored: { i: number; key: number }[] = []
  for (const [i, f] of fighters.entries()) {
    if (!alive(f)) continue
    if (opening === 'monstersSitOut' && f.side === 'foes') continue
    if (opening === 'partySitsOut') {
      if (f.side === 'party') continue
      // The first monster always acts; each after it on a draw under 67.
      const acts = monstersSoFar === 0 || rng.below(100) < SURPRISED_ACTS_BELOW
      monstersSoFar++
      if (!acts) continue
    }
    scored.push({ i, key: initiative(rng, levelled(f.agility, f.states.agility.level)) })
  }
  const order = scored
    .sort((a, b) => (a.key === b.key ? a.i - b.i : a.key > b.key ? -1 : 1))
    .map(({ i }) => i)

  let outcome: Outcome = 'ongoing'
  let chain: Chain = state.chain ?? NO_CHAIN
  const setStates = (target: number, patch: Partial<States>) => {
    fighters = fighters.map((f, i) =>
      i === target ? { ...f, states: { ...f.states, ...patch } } : f,
    )
  }
  /** A fighter's tension as the damage takes it — none when it has none. */
  const tensionOf = (f: FighterState) =>
    f.states.tension ? { level: f.states.tension, side: f.side, dealer: f.level ?? 0 } : undefined
  /**
   * Tension spent, once, after an action it works on (`0x021ed48c`): whatever
   * the action came to. Told only for one still standing.
   */
  const calm = (actor: number) => {
    const f = fighters[actor]
    const level = f?.states.tension
    if (!f || !level) return
    setStates(actor, { tension: 0 })
    if (alive(f)) events.push({ kind: 'calmed', actor, most: level === TENSION_MOST })
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
  /**
   * **The two draws every action makes** as its targets are built —
   * `func_ov000_0215fbe0`, from the party's builder and the monsters' alike,
   * whatever the action: 3 or 4, then 6 to 8, the counts hit codes 3 and 11
   * take. After any re-pick, before the first target's die. Read 3 October
   * 2026; only a confused member's, two scripted battles' and a monster's
   * Kerplunk skip them, none of which is modelled.
   */
  const builtDraws = () => ({ threeOrFour: rng.below(2) + 3, sixToEight: rng.below(3) + 6 })
  /** The monster groups standing, by kind, in the order they stand. */
  const groupsOf = (standing: readonly number[]) => {
    const kinds: string[] = []
    for (const i of standing) {
      const name = fighters[i]?.name ?? ''
      if (!kinds.includes(name)) kinds.push(name)
    }
    return kinds
  }
  /**
   * **One of the party's aim at a fallen monster**, picked again
   * (`func_ov000_02153aa4`): one draw among the standing of its group; with
   * none standing there, a draw among the groups still standing and one
   * within the group drawn. Undefined with no monster standing.
   */
  const repickFoe = (named: number): number | undefined => {
    const others = livingOn('foes')
    const kind = fighters[named]?.name
    const group = others.filter((i) => fighters[i]?.name === kind)
    if (group.length > 0) return group[rng.below(group.length)]
    const groups = groupsOf(others)
    if (groups.length === 0) return undefined
    const drawn = groups[rng.below(groups.length)]
    const within = others.filter((i) => fighters[i]?.name === drawn)
    return within[rng.below(within.length)]
  }
  /**
   * **Whom an action reaches** on a side: the party's at the monsters by the
   * game's re-picks (`partyAim`); anyone's at their own side, the one named or
   * — fallen — themselves (`func_ov000_02153cc0`); a monster's at the party,
   * the one named or one drawn among the standing for one — **ours**, the
   * game's weighted pick (`func_ov000_02154f30`) not modelled — and the
   * standing for a group or all, with no draw.
   */
  const aimOf = (
    me: FighterState,
    actor: number,
    side: Side,
    named: number,
    reach: 'one' | 'group' | 'all',
  ): number[] => {
    const standing = livingOn(side)
    if (standing.length === 0) return []
    if (me.side === 'party' && side === 'foes') return partyAim(named, reach)
    const there = fighters[named]
    const up = !!there && alive(there) && there.side === side
    let first: number
    if (side === me.side) first = up ? named : actor
    else {
      if (reach !== 'one') return standing
      first = up ? named : (standing[rng.below(standing.length)] as number)
    }
    if (reach === 'one') return [first]
    if (reach === 'all') return standing
    const kind = fighters[first]?.name
    return standing.filter((i) => fighters[i]?.name === kind)
  }
  /**
   * **Whom an action of the party's reaches** when it is aimed at the
   * monsters: one — its named target, or a re-pick; a group — the named
   * one's, or, that group gone, one drawn among the groups standing; all —
   * the standing, no draw (`func_ov000_021540fc`).
   */
  const partyAim = (named: number, reach: 'one' | 'group' | 'all'): number[] => {
    const others = livingOn('foes')
    if (others.length === 0) return []
    if (reach === 'all') return others
    const there = fighters[named]
    const standing = !!there && alive(there) && there.side === 'foes'
    if (reach === 'one') {
      if (standing) return [named]
      // Ours: an action aimed at nobody — a companion's default — takes the first standing.
      if (!there) return [others[0] as number]
      const picked = repickFoe(named)
      return picked === undefined ? [] : [picked]
    }
    const kind = there?.name
    const group = others.filter((i) => fighters[i]?.name === kind)
    if (group.length > 0) return group
    const groups = groupsOf(others)
    const drawn = groups[rng.below(groups.length)]
    return others.filter((i) => fighters[i]?.name === drawn)
  }

  for (const actor of order) {
    const me = fighters[actor]
    if (!me || !alive(me)) continue
    // A flight that failed: the party's round is lost (above).
    if (caught && me.side === 'party') continue
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
    // This fighter's turn, as the chain tells turns apart (`ctx + 4`). Ours: by round and fighter.
    const turn = state.round * 64 + actor
    // An action whose blows do not chain resets it as it reaches its target
    // (`func_ov024_021ea584`) — Defend, an item, a change of state, a wait.
    if (
      command.kind === 'defend' ||
      command.kind === 'item' ||
      command.kind === 'change' ||
      command.kind === 'wait'
    ) {
      chain = brokenChain(chain)
    }

    // Defend, a wait and a monster's flight go through the resolver too, and
    // make its two draws. What they draw after their target's die is not
    // read, and is not made here — ours.
    if (
      command.kind === 'defend' ||
      command.kind === 'wait' ||
      (command.kind === 'flee' && me.side === 'foes')
    ) {
      builtDraws()
    }
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
    // The party's flight was settled before the round.
    if (command.kind === 'flee') continue
    if (command.kind === 'psyche') {
      // **Psyche Up** (`func_ov024_021dc93c`) goes through the resolver as
      // anything does: the die it keeps, the critical roll, and the accuracy —
      // it cannot be dodged or blocked, and its accuracy stands at a hundred.
      // Then its own steps, held so that the level never passes 4, each from
      // 3 a coin of the battle's. At the maximum already, nothing happens.
      builtDraws()
      rng.below(100)
      rng.below(10_000)
      rng.below(100)
      const was = me.states.tension ?? 0
      const steps: number[] = []
      let level = was
      if (command.outright) {
        // Straight to the record's level, each level on the way told, no draw
        // (`0x021dc9f4`–`0x021dcc60`); nothing for one already there.
        for (let next = was + 1; next <= Math.min(command.steps, TENSION_MOST); next++) {
          steps.push(next)
          level = next
        }
      } else {
        for (let n = Math.min(command.steps, TENSION_MOST - was); n > 0; n--) {
          const next = psychedUp(level, rng)
          steps.push(next)
          if (next > 0) level = next
        }
      }
      // Reaching the maximum clears poison (`func_02088150`).
      if (level !== was) {
        setStates(actor, { tension: level, ...(level === TENSION_MOST ? { poisoned: false } : {}) })
      }
      events.push({
        kind: 'psyche',
        actor,
        action: command.action,
        steps,
        ...(command.outright ? { outright: true } : {}),
      })
      continue
    }
    if (command.kind === 'item') {
      builtDraws()
      const named = command.target === undefined ? undefined : fighters[command.target]
      const on =
        command.target !== undefined && named && alive(named) && named.side === me.side
          ? command.target
          : actor
      let healed: number | undefined
      if (command.heal) {
        // The game's order for anything used on someone — see the spell below:
        // the target's die, the critical roll (an item's rate is nothing, and
        // the draw is spent), the accuracy, and then the amount.
        rng.below(100)
        rng.below(10_000)
        rng.below(100)
        const amount = amountFor(rng, me, command.heal)
        const them = fighters[on] as FighterState
        healed = Math.max(0, Math.min(amount, them.maxHp - them.hp))
        const gained = healed
        fighters = fighters.map((f, i) => (i === on ? { ...f, hp: f.hp + gained } : f))
      }
      events.push({ kind: 'item', actor, target: on, item: command.item, healed })
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
      const reached = aimOf(me, actor, side, command.target, spell.reach)
      const first = reached[0]
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
      builtDraws()
      // **The game's order** — `func_ov024_021eb5d0`, `docs/conformance.md`,
      // "What is not a plain blow". Whether it goes haywire is rolled **once
      // for the cast when it reaches a group or all** (`func_ov024_021ea4d0`:
      // the record's reach at 3 or 4) and before anyone is looked at; for one
      // it is rolled for that one, after their die. A monster's rate is a
      // literal nothing (`func_020748f8`) and its draw is spent all the same.
      // Its chance over the targets reached (`CalculateCritRate`'s `hitCount`).
      const rate = criticalRate(
        me,
        spell.criticalPercent ?? 100,
        rules.magicCritical,
        reached.length,
      )
      const once = spell.reach !== 'one'
      const tension = spell.tensed ? tensionOf(me) : undefined
      let critical = once && rng.below(10_000) < rate
      const hits = reached.map((target) => {
        const them = fighters[target] as FighterState
        // The chain, for each one reached, before the accuracy (`0x021ec178`).
        chain = chainStep(chain, {
          combos: spell.combos === true && spell.does === 'harm',
          side: me.side,
          action: spell.action,
          target,
          turn,
        })
        // Each one reached: a die of a hundred the game keeps for them
        // (`0x021ebf28`), the critical roll where it is theirs, the accuracy's
        // draw — a spell cannot be dodged or blocked, so neither is rolled —
        // and the amount.
        rng.below(100)
        if (!once) critical = rng.below(10_000) < rate
        rng.below(100)
        let amount = spell.amount ? amountFor(rng, me, spell.amount) : them.maxHp
        if (spell.does === 'harm' && spell.amount) {
          const halved = spell.kind === 1 && them.states.tension === TENSION_MOST
          // Its critical, then the target's resistance to its element, then
          // the whole number — the game's, in the game's floats: `dealt`.
          amount = dealt(rng, amount, {
            critical,
            resistance: resistanceTo(them.resist, spell.element ?? 0),
            ...(spell.cap ? { cap: spell.cap } : {}),
            // A guard halves what defending works on — Frizz and Crack are
            // among them, a heal and a herb are not.
            ...(them.defending && spell.defendable ? { guard: GUARD_LEVELS[1] } : {}),
            ...(spell.combos ? { combo: chain.count } : {}),
            ...(tension ? { tension } : {}),
            ...(halved ? { halved } : {}),
          })
          // A blow of less than one breaks the chain (`0x021e7b20`).
          if (amount < 1) chain = brokenChain(chain)
        } else if (spell.amount) {
          // A heal goes through the same function (`0x021ec7a8`): tension at its head.
          if (tension) {
            amount = Math.trunc(tensed(amount, tension.level, tension.side, tension.dealer))
          }
          if (critical) amount = criticalDamage(rng, amount)
        }
        if (spell.does === 'heal') amount = Math.max(0, Math.min(amount, them.maxHp - them.hp))
        return { target, amount }
      })
      // Told before anyone it fells falls.
      events.push({ kind: 'spell', actor, action: spell.action, short: false, critical, hits })
      for (const { target, amount } of hits) {
        if (spell.does === 'harm') hurt(target, amount)
        else fighters = fighters.map((f, i) => (i === target ? { ...f, hp: f.hp + amount } : f))
      }
      if (spell.tensed) calm(actor)
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
      const reached = aimOf(me, actor, side, command.target, changing.reach)
      const first = reached[0]
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
      builtDraws()
      const { change } = changing
      // **The game's order, and the game's roll.** A change of state goes
      // through the same resolver as a blow (`docs/conformance.md`, "A change
      // of state"), and its handler makes no draw of its own: **whether it
      // lands is the accuracy roll**, the chance its accuracy. So: the critical
      // once for a cast at a group or all; then for each one reached their die,
      // the critical where it is theirs, the dodge if it can be dodged, and the
      // accuracy's draw — made before it is known whether there is anything
      // left to change, since the handler finds that out afterwards.
      const rate = changing.haywire
        ? criticalRate(me, changing.criticalPercent ?? 100, rules.magicCritical, reached.length)
        : 0
      const once = changing.reach !== 'one'
      let critical = once && rng.below(10_000) < rate
      const hits = reached.map((target) => {
        const them = fighters[target] as FighterState
        rng.below(100)
        if (!once) critical = rng.below(10_000) < rate
        const dodged =
          changing.evadable === true && rng.below(100) < Math.trunc(evadeOf(them, rules))
        const draw = rng.below(100)
        if (dodged) return { target, result: 'dodged' as const }
        const was = them.states
        const already =
          change.kind === 'sleep'
            ? was.sleep !== undefined
            : change.kind === 'poison'
              ? was.poisoned
              : false
        if (already) return { target, result: 'already' as const }
        // A cast gone haywire lands outright (`0x02156a34`); the rest under the chance.
        // Its accuracy is the chance **times the target's resistance, plus a
        // half, truncated** (`0x02156a74`); gone haywire it lands on anyone
        // not immune.
        const resistance = resistanceTo(them.resist, changing.element ?? 0)
        const accuracy = Math.trunc(
          Math.fround(Math.fround(Math.fround(change.chance) * resistance) + Math.fround(0.5)),
        )
        if (!(critical && resistance > 0) && draw >= accuracy)
          return { target, result: 'resisted' as const }
        if (change.kind === 'sleep') {
          // Sleep takes the tension away (`func_02088338`).
          setStates(target, { sleep: SLEEP_TURNS, ...(them.states.tension ? { tension: 0 } : {}) })
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

    if (command.kind === 'blow') {
      const { blow } = command
      const other: Side = me.side === 'party' ? 'foes' : 'party'
      const standing = livingOn(other)
      if (standing.length === 0) break
      const reached = aimOf(me, actor, other, command.target, blow.reach)
      if (reached.length === 0) break
      const kind = fighters[reached[0] as number]?.name
      // **The two draws every action makes** as its targets are built
      // (`func_ov000_0215fbe0`): 3 or 4, then 6 to 8 — the counts of hit
      // codes 3 and 11. Then the passes (`blows.ts`).
      const threeOrFour = rng.below(2) + 3
      const sixToEight = rng.below(3) + 6
      const { passes } = passesOf(reached, blow.hits, { threeOrFour, sixToEight }, rng)
      const n = passes.length
      const rate = criticalRate(me, blow.criticalPercent, rules.critical, n)
      // Rolled once for the action when it reaches a group or all with no
      // hit code (`func_ov024_021ea4d0`), else each pass after its die.
      const once = blow.reach !== 'one' && blow.hits === 0
      let critical = blow.sure ? true : once && rng.below(10_000) < rate
      const tension = blow.tensed ? tensionOf(me) : undefined
      const hits: {
        target: number
        damage: number
        critical: boolean
        dodged: boolean
        blocked: boolean
      }[] = []
      let recoil = 0
      for (const [index, aimed] of passes.entries()) {
        // The die each pass keeps (`0x021ebf28`).
        rng.below(100)
        let target = aimed
        if (!alive(fighters[target] as FighterState)) {
          // A random pick fallen is picked again among the living of its
          // group, or of all (`func_ov000_02154c68`); a repeat is passed over.
          if (!RETARGETED.has(blow.hits)) continue
          const left = livingOn(other).filter(
            (i) => blow.reach !== 'group' || fighters[i]?.name === kind,
          )
          if (left.length === 0) continue
          target = left[rng.below(left.length)] as number
        }
        const them = fighters[target] as FighterState
        if (!once && !blow.sure) critical = rng.below(10_000) < rate
        const dodged = blow.evadable && rng.below(100) < Math.trunc(evadeOf(them, rules))
        const blocked =
          blow.blockable && !dodged && Math.fround(rng.below(100)) < Math.fround(blockOf(them))
        // The accuracy, at a hundred, its draw spent.
        rng.below(100)
        chain = chainStep(chain, {
          combos: blow.combos,
          side: me.side,
          action: blow.action,
          target,
          turn,
        })
        // The base, its draws spent whatever the handler does with it, then the handler.
        const base = physicalDamage(rng, me.attack, defenceOf(them))
        const out = handled(
          blow.handler,
          base,
          {
            // The level: one of the party's at their vocation, a monster's its
            // record's (`func_ov000_02159dbc`; 1 where it has none).
            level: me.level ?? (me.side === 'party' ? 0 : 1),
            maxHp: me.maxHp,
            maxMp: me.maxMp,
            deftness: me.deftness ?? 0,
            attack: me.attack,
            hp: me.hp,
            party: me.side === 'party',
            target: {
              party: them.side === 'party',
              family: them.family,
              metal: them.metal,
              hp: them.hp,
              poisoned: them.states.poisoned,
              asleep: them.states.sleep !== undefined,
            },
            passes: n,
          },
          rng,
        ) ?? { damage: base }
        if (out.recoil !== undefined) recoil = out.recoil
        let d = out.damage
        // The falloff over the passes, by the pass's place (`func_02074948`).
        if (blow.falloff) {
          d = Math.trunc(Math.fround(Math.fround(d) * (FALLOFF[Math.min(index, 4)] as number)))
        }
        // Thunder Thrust and Hatchet Man: shown as a critical, never multiplied
        // by one, no tension on nothing, and no coin.
        const thrust = blow.handler === THRUST_HANDLER
        const damage = dealt(rng, d & 0xffff, {
          critical: critical && !thrust && !(blow.sure && blow.action !== CRITICAL_CLAIM),
          resistance: resistanceTo(them.resist, blow.element),
          dodged,
          blocked,
          ...(blow.cap ? { cap: blow.cap } : {}),
          ...(them.defending && blow.defendable ? { guard: GUARD_LEVELS[1] } : {}),
          ...(blow.combos ? { combo: chain.count } : {}),
          ...(tension && !(thrust && d === 0) ? { tension } : {}),
          ...(them.states.tension === TENSION_MOST ? { halved: true } : {}),
          ...(thrust ? { noCoin: true } : {}),
        })
        if (dodged || blocked || damage < 1) chain = brokenChain(chain)
        // Double-Edged Slash keeps a quarter of what it dealt (`0x021e7b54`).
        if (blow.action === DOUBLE_EDGED_SLASH) {
          recoil = Math.trunc(Math.fround(Math.fround(0.25) * Math.fround(damage)))
        }
        hits.push({
          target,
          damage,
          critical: thrust ? damage > 0 : critical && !dodged && !blocked,
          dodged,
          blocked,
        })
      }
      const told: {
        kind: 'blow'
        actor: number
        action: number
        hits: typeof hits
        recoil?: number
        regained?: { hp?: number; mp?: number }
        guards?: boolean
      } = { kind: 'blow', actor, action: blow.action, hits }
      // Told before anyone it fells falls.
      events.push(told)
      for (const hit of hits) hurt(hit.target, hit.damage)
      // **After the action, once** (the table at `0x021ff3f8`, by `+0x2c`
      // bits 10–13), when the striker stands (`func_ov000_02155f9c`).
      const mine = fighters[actor] as FighterState
      if (alive(mine)) {
        if (blow.after === 1) {
          // Hallowed Arrow: MP back, an eighth of all it dealt (`func_ov024_021e56c0`).
          const total = hits.reduce((sum, h) => sum + h.damage, 0)
          const mp = Math.min(total >> 3, mine.maxMp - mine.mp)
          if (mp > 0) {
            fighters = fighters.map((f, i) => (i === actor ? { ...f, mp: f.mp + mp } : f))
            told.regained = { mp }
          }
        } else if (blow.after === 2) {
          // Blockenspiel: its striker guards for the rest of the round (`021e57c0`).
          fighters = fighters.map((f, i) => (i === actor ? { ...f, defending: true } : f))
          told.guards = true
        } else if (blow.after === 3 && recoil > 0) {
          // Body Slam and Double-Edged Slash: the recoil (`021e57e0`). Whether
          // Double-Edged Slash's is skipped on a slot code of 3 is not read.
          told.recoil = recoil
          hurt(actor, recoil)
        } else if (blow.after === 4) {
          // Miracle Slash, HP Hoover, Schadenfreude, Miracle Moon: a quarter of
          // the last pass's damage back — Miracle Moon's first (`021e5988`).
          const from = blow.action === MIRACLE_MOON ? hits[0] : hits.at(-1)
          const hp = Math.min((from?.damage ?? 0) >> 2, mine.maxHp - mine.hp)
          if (hp > 0) {
            fighters = fighters.map((f, i) => (i === actor ? { ...f, hp: f.hp + hp } : f))
            told.regained = { hp }
          }
        }
      }
      if (blow.tensed) calm(actor)
      outcome = outcomeOf(fighters)
      if (outcome !== 'ongoing') break
      continue
    }

    // An attack: at the target named, or at someone living on the other side.
    const others = livingOn(me.side === 'party' ? 'foes' : 'party')
    if (others.length === 0) break
    const target =
      me.side === 'party'
        ? partyAim(command.target, 'one')[0]
        : (aimOf(me, actor, 'party', command.target, 'one')[0] as number)
    if (target === undefined) break
    builtDraws()
    const them = fighters[target] as FighterState
    // The chain, before the accuracy (`0x021ec178`): the plain Attack's blows
    // chain (`+0x2C` bit 27). **Ours**: a monster's blow taken as the Attack, 1.
    chain = chainStep(chain, { combos: true, side: me.side, action: 1, target, turn })

    // **The game's order of a blow's draws** — `func_ov024_021eb5d0`, read from
    // the decomp; `docs/conformance.md`, "The resolver of a blow". Each is made
    // whether or not it can come to anything, which is the point: a battle
    // replays from a seed only if every draw is spent where the game spends it.
    //
    // 0. A die of a hundred the game throws for each one an action reaches and
    //    keeps (`0x021ebf28`, at `[battle + 0x8e6e]`). The dodge reads it in
    //    place of its own draw for a target in a state not modelled here;
    //    otherwise nothing comes of it, and it is spent.
    rng.below(100)
    // 1. The critical roll, always. A monster's rate is nothing and its draw is
    //    spent all the same.
    const critical = rng.below(10_000) < criticalRate(me, 100, rules.critical)
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
    // The rest is the game's `func_ov024_021e6a90`, in its floats — `dealt`:
    // the critical (the greatest of the damage and a fifth, the attack power
    // times 0.95 to 1.05, and the damage itself), **times the target's
    // resistance to the plain Attack's element, 8**; nothing for a blow dodged
    // or blocked, zeroed late and given no coin; and for one that came to
    // nothing and was neither, a draw below 2 — **whoever struck it**, which
    // the reference had for a monster's blow only.
    // **Defending is the game's** — the guard level the Defend command sets,
    // which halves the damage where the action is one defending works on
    // (`0x021e75d0`: the plain attack is, a heal and a herb are not). It is
    // applied before the 0-or-1 coin, so a defended blow that comes to
    // nothing still deals 0 or 1; and the code never asks whose blow it is,
    // so a monster's guard halves the party's blow as well.
    const tension = tensionOf(me)
    damage = dealt(rng, damage, {
      critical,
      attack: me.attack,
      resistance: resistanceTo(them.resist, PLAIN_ATTACK_ELEMENT),
      dodged,
      blocked,
      ...(them.defending ? { guard: GUARD_LEVELS[1] } : {}),
      combo: chain.count,
      // The plain Attack carries tension (`+0x10` bit `0x2000`), and is of kind 1.
      ...(tension ? { tension } : {}),
      ...(them.states.tension === TENSION_MOST ? { halved: true } : {}),
    })
    // The count the blow was multiplied by, for its showing — 0 for none.
    const combo = !dodged && !blocked && damage >= 1 ? chain.count : 0
    // A dodge, a block (`0x021ec828`) or a blow of less than one (`0x021e7b20`) breaks it.
    if (dodged || blocked || damage < 1) chain = brokenChain(chain)
    // A poison attack's poison: the reference's 12 in 100, on a blow that lands.
    // Rolled only for a blow that has dealt something, and not for one already
    // poisoned — both the game's, from the rider's handler (`func_ov024_021e303c`),
    // which leaves before its draw otherwise.
    // It lands under its chance times a hundredth of the target's byte for
    // poison, the draw a float; and one immune is not rolled for.
    const toPoison = resistanceTo(them.resist, POISON_ELEMENT)
    const poisoned =
      damage > 0 &&
      command.poison !== undefined &&
      !them.states.poisoned &&
      toPoison > 0 &&
      Math.fround(rng.below(100)) < Math.fround(Math.fround(command.poison) * toPoison)
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
      ...(combo > 0 ? { combo } : {}),
    })
    hurt(target, damage)
    calm(actor)
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
  return {
    state: { ...state, fighters, round: state.round + 1, outcome, fleeAttempts: attempts, chain },
    events,
  }
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
