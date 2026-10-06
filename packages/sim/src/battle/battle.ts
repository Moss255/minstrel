import { FALLOFF, handled, passesOf, RETARGETED, THRUST_HANDLER } from './blows.ts'
import { brokenChain, type Chain, chainStep, NO_CHAIN } from './combo.ts'
import { COUP_ACTIONS, COUP_LEVEL, coupChance, coupHpTerm, coupRounds } from './coup.ts'
import {
  criticalChance,
  criticalDamage,
  dealt,
  drawnAmount,
  GUARD_LEVELS,
  inCrisis,
  initiative,
  partyAmount,
  physicalDamage,
  resistanceTo,
} from './damage.ts'
import { revivedHp, scaledAccuracy } from './handlers.ts'
import type { BattleRng } from './rng.ts'
import {
  buffedAttack,
  levelled,
  moved,
  NO_STATES,
  poisonDamage,
  type States,
  wakes,
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
 * **A round's own draws are the game's** (read 3 October 2026): the command
 * phase after the initiative, where monsters of AI modes 0 and 1 choose their
 * way and target and every monster draws for its actions more; then, each
 * turn, the charm's draws, a mode-2 monster's choosing, the turn-start draw
 * (a sleeper's waking), the action, and a draw after it. A monster chooses by
 * the targeting handler its way's record names for its mode, and whom by the
 * weighted pick that remembers who struck it — `chooseFoe`. Defend, a wait, a
 * flight, Psyche Up and a sleeper's turn go through the resolver on oneself.
 *
 * **Ours, and said so:**
 * - the order of every draw that is *not* a plain blow's — a spell's, an
 *   item's, a change of state's — which is still not the game's;
 * - a round of more than two fighters, which the reference, one against one,
 *   does not have: everyone is ordered by the same draw;
 * - where a monster's actions more fall in the order: straight after its first;
 * - the targeting handlers not read — those past the ones `byHandler`
 *   names; `docs/readings/T17-ai.md` lists all 161 — which take the first;
 *   the weighted pick's halving under a status, not identified;
 * - the counts a monster's way rule keeps, taken to start at 0
 *   (`Fighter.wayRule`); a monster that flees gets away, and pays nothing;
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
   * Whether they hold **Critical in a Crisis**, skill panel 285 — trait
   * `0x11d`, which its book grants: their chance of a critical doubles while
   * their HP is under a quarter — see `criticalChance` and `inCrisis`.
   */
  readonly crisisCritical?: boolean
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
   * A monster's AI — `mon_btldata +0x10` (read 3 October 2026): its mode (0
   * and 1 choose as the round begins, 2 at its turn), its rule for actions
   * more a round, which ways it may use once a group, and whether it weighs
   * who last struck it. Mode 1, no more actions, when not given.
   */
  readonly aiMode?: number
  /**
   * **How it chooses among its ways** — `mon_btldata +0x10` bits 5–7, the
   * rule `func_0208a91c` dispatches on (the table at `0x020f10b0`): 0, 1, 2
   * and 4 draw by a weight table ({@link choice}); 3 takes them in turn by a
   * count of its own, 7 by a count its group shares; 5 takes a pair in turn
   * and a coin within it; 6 its first way and its others by turns. Read 6
   * October 2026 — see `docs/readings/T17-ai.md`. By the weights when not given.
   */
  readonly wayRule?: number
  readonly extraRule?: number
  readonly oncePerGroup?: number
  readonly remembers?: boolean
  /**
   * A party member's level, which a monster weighs before it runs, and which
   * tension's bonus is made from (`CalculateTensionBonus`) — at their
   * vocation. A monster's own is not given, and counts as nothing.
   */
  readonly level?: number
  /**
   * **In the Back Line** — `base+0x3c` bit 30, set from Misc.'s Line-Up: a
   * monster's weighted pick weighs them 1 rather than 2
   * (`func_ov000_02154f30`, `0x02155024`–`0x02155040`). Nothing else in the
   * battle reads it. The Front Line when not given.
   */
  readonly backLine?: boolean
  /**
   * **One of the party's coup de grâce** — see `coup.ts`: their level in their
   * vocation, and their term after acting, their vocation's and what they
   * wear. None for a monster or a guest, for whom no draw is made.
   */
  readonly coup?: { readonly level: number; readonly bonus: number }
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
  /** The last two of the party to aim a pass at this monster, the latest first (`+0x32`, `+0x34`). */
  readonly aimedBy?: readonly number[]
  /**
   * The count way rules 3, 5 and 6 keep for a monster — the byte at `+0x38`
   * of its status (`+0x138`): the next way, pair or pass. **INFERRED** to
   * start at 0: nothing found writes it but the rules themselves, so it is
   * taken to be cleared with the rest of the status as the battle sets up.
   */
  readonly wayCount?: number
  /**
   * Ready for their coup de grâce — `status+0x3b` bit 3 — and the count of
   * rounds' ends left, bits 4–7; see `coup.ts`. Undefined, not ready.
   */
  readonly primed?: number
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

/**
 * What a change of state does, and its chance in 100 of landing — see
 * `states.ts`. The kinds after the levels are the handlers of task 18
 * (`docs/readings/T18-handlers.md`): poison cured (kind 7, Squelch), a
 * sleeper woken (kind 9), the fallen raised (kind 18, Zing) and all HP taken
 * (kind 17, Whack).
 */
export type Change =
  | { readonly kind: 'sleep'; readonly chance: number }
  | { readonly kind: 'poison'; readonly chance: number }
  | {
      readonly kind: 'attack' | 'defence' | 'agility'
      readonly by: number
      readonly chance: number
    }
  | { readonly kind: 'cure'; readonly chance: number }
  | { readonly kind: 'wake'; readonly chance: number }
  | { readonly kind: 'kill'; readonly chance: number }
  /**
   * **Choir of Angels** (kind 67, `func_ov024_021e13e0`): a share of the most
   * HP rounded half up, at least `least`, healed whether it landed or not;
   * then every misfortune cleared (`func_ov024_021eae14`).
   */
  | {
      readonly kind: 'restore'
      readonly chance: number
      readonly share: number
      readonly least: number
    }
  | {
      readonly kind: 'revive'
      readonly chance: number
      /**
       * The share of their most HP they come back with (`func_ov024_021dd278`):
       * a number, or — Zing's and the Zing stick's — by the caster's magical
       * mending between `lo` and `hi`, a quarter to a half, and a half from a
       * monster.
       */
      readonly share: number | { readonly lo: number; readonly hi: number }
    }

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
  /** What rides on each pass that deals something — see {@link Rider}. */
  readonly rider?: Rider
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
  /**
   * **One of the party's accuracy with it**, for an action whose accuracy
   * scales (`+0x18` bits 16–17 at 1): the least and the most (`+0x14` bits
   * 7–13 and 14–20), and the number of the caster's it runs between them by
   * where the record names one; otherwise drawn between them, a draw more
   * (`func_ov000_02156648`, `0x021568b4`–`0x021569f8`). Without it one of the
   * party's accuracy stands at {@link Change.chance}.
   */
  readonly accuracy?: {
    readonly min: number
    readonly max: number
    readonly scales?: {
      readonly by: 'might' | 'mending'
      readonly lo: number
      readonly hi: number
    }
  }
  /**
   * What rides on it, on the one it lands on — Double Up's defence down on
   * its user (rider 8, with action `0xad` exempt from the target's byte).
   * Only the level riders are carried here.
   */
  readonly rider?: { readonly slot: number; readonly levels: number }
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
  /** Envenomated — the stronger poison. */
  | 'envenomed'
  /** Squelch: no longer poisoned. */
  | 'cured'
  /** Woken by kind 9. */
  | 'woke'
  /** Back to life, with {@link ChangeHit.hp}. */
  | 'revived'
  /** A raising that did not land on one fallen — "remains lifeless". */
  | 'lifeless'
  /** All their HP taken. */
  | 'killed'
  /** Healed by {@link ChangeHit.hp}, and — `cured` — misfortunes cleared. */
  | 'restored'

/** A change on one it reached: how it came out, and — moving a level — the level it came to. */
export interface ChangeHit {
  readonly target: number
  readonly result: ChangeResult
  /** The level it came to, for a level moved — which picks its line (`func_ov024_021e94c4`). */
  readonly level?: number
  /** The HP one raised comes back with, or one restored is healed by. */
  readonly hp?: number
  /** One restored was also rid of a misfortune. */
  readonly cured?: boolean
  /** For what rode on an action: which level it moved. */
  readonly stat?: 'attack' | 'defence' | 'agility'
}

/**
 * **What rides on an action** (`+0x18` bits 0–4; the table at
 * `data_ov024_021ff450`): its slot, the action's chance with it — one of the
 * party's `+0x14` bits 7–13, a monster's bits 0–6 — and the levels a level
 * rider moves (`+0x32`). Played here: 2 attack down, 4 poison, 7 sleep, 8
 * defence down, 20 death. See `docs/readings/T18-handlers.md` §3.
 */
export interface Rider {
  readonly slot: number
  readonly chance: { readonly party: number; readonly foe: number }
  readonly levels: number
}

/** The riders the battle plays. */
export const RIDERS_PLAYED: ReadonlySet<number> = new Set([2, 4, 7, 8, 20])

/**
 * One of a foe's ways of acting — the game gives each monster six: attack
 * (poisoning, by its chance in 100, where it is a poison attack), flee, a
 * spell, or a change of state.
 */
/** A monster's way, with the targeting handlers its record names for AI modes 1 and 2 (`+0x0C`, `+0x0E`). */
export type FoeAction = FoeWay & { readonly targeting?: readonly [number, number] }

export type FoeWay =
  /** Its poison attack's chance, and whether what it gives is envenomation (its record's `+0x32` above 0). */
  | { readonly kind: 'attack'; readonly poison?: number; readonly envenoms?: boolean }
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
  | {
      readonly kind: 'attack'
      readonly target: number
      readonly poison?: number
      readonly envenoms?: boolean
    }
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
      /**
       * Whom it psyches up, where not oneself — Egg On, an ally other than its
       * user, by the same handler (`func_ov024_021dc93c`, kind 15).
       */
      readonly target?: number
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
      /** …and it was envenomation — again, where they already were. */
      readonly envenomed?: 'newly' | 'again'
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
      readonly hits: readonly ChangeHit[]
      /** What rode on it, on whom — Double Up's defence on its user. */
      readonly rode?: readonly ChangeHit[]
    }
  /** A sleeper's turn, slept through. */
  | { readonly kind: 'asleep'; readonly actor: number }
  /**
   * Ready for a coup de grâce, after the action that made them so — the
   * game's action 922 with actmsg 531 (`func_ov000_0215af54`).
   */
  | { readonly kind: 'primed'; readonly actor: number }
  /** A coup de grâce's moment passed, at the round's end — action 936, actmsg 603. */
  | { readonly kind: 'coupPassed'; readonly actor: number }
  /** A sleeper waking: on its turn, or at a blow. */
  | { readonly kind: 'woke'; readonly actor: number }
  /** A level worn off, at the round's end. */
  | {
      readonly kind: 'wornOff'
      readonly actor: number
      readonly stat: 'attack' | 'defence' | 'agility'
    }
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
      /** Whom it psyched up, where not its actor — Egg On's ally. */
      readonly target?: number
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
        /** What its rider came to on this pass, where it came to something. */
        readonly rode?: ChangeHit
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
  /** The ways each group of monsters has used that it may use once, by kind, a bit a way. */
  readonly onceUsed?: ReadonlyMap<string, number>
  /**
   * The count way rule 7 keeps for a group — the first byte of the group's
   * record of 0x18 at `battle + 0x81c0` (`func_0208a840`), by kind as
   * {@link onceUsed} is. **INFERRED** to start at 0, as {@link FighterState.wayCount}.
   */
  readonly groupWayCount?: ReadonlyMap<string, number>
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
    : criticalChance(
        me.deftness,
        percent,
        passes,
        me.crisisCritical === true && inCrisis(me.hp, me.maxHp),
      )
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
  const onceUsed = new Map(state.onceUsed ?? [])
  const groupWayCount = new Map(state.groupWayCount ?? [])
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
  /** A fighter without their coup's readiness — by death, its use or its running out. */
  const unprime = (target: number) => {
    fighters = fighters.map((f, i) => {
      if (i !== target || f.primed === undefined) return f
      const { primed: _, ...rest } = f
      return rest
    })
  }
  const hurt = (target: number, damage: number) => {
    fighters = fighters.map((f, i) => (i === target ? { ...f, hp: Math.max(0, f.hp - damage) } : f))
    if (damage > 0 && fighters[target]?.hp === 0) {
      events.push({ kind: 'defeated', actor: target })
      // Death clears the readiness and its count (`func_02088e80`).
      unprime(target)
    } else if (damage > 0 && fighters[target]?.states.sleep !== undefined) {
      // A blow that hurts wakes a sleeper.
      setStates(target, { sleep: undefined })
      events.push({ kind: 'woke', actor: target })
    }
  }
  /** A stat as its level has it — see `states.ts`. */
  const defenceOf = (f: FighterState) => levelled(f.defence, f.states.defence.level)
  /** The attack a blow is worked from: at its level, `UpdateCombatantAttack`'s. */
  const attackOf = (f: FighterState) =>
    buffedAttack(f.attack, f.states.attack?.level ?? 0, f.side === 'party')
  /**
   * **A level rider** — 2 attack, 8 defence (`func_ov024_021e2ebc`,
   * `021e3594`): a draw below 100 first; a fall lands under the target's own
   * byte for it, or at once on a critical, and Double Up's (`0xad`) on
   * defence without the test; a raise always. **Nobody's bytes are kept**,
   * so each is a hundred and a fall always lands — ours, as resistances are.
   */
  const levelRider = (target: number, slot: number, levels: number): ChangeHit | undefined => {
    rng.below(100)
    const stat = slot === 2 ? ('attack' as const) : slot === 8 ? ('defence' as const) : undefined
    if (!stat) return undefined
    const by = Math.max(-2, Math.min(2, levels))
    const level = (fighters[target] as FighterState).states[stat] ?? { level: 0, turns: 0 }
    const next = moved(level, by)
    // Not moved, nothing is said (`0x021e2fc8`).
    if (!next) return undefined
    setStates(target, { [stat]: next })
    return { target, result: by > 0 ? 'raised' : 'lowered', level: next.level, stat }
  }
  /** A level rider on a change, told with it — Double Up's. */
  const rideOn = (
    target: number,
    rider: { readonly slot: number; readonly levels: number },
    _action: number,
    out: ChangeHit[],
  ) => {
    const hit = levelRider(target, rider.slot, rider.levels)
    if (hit) out.push(hit)
  }
  /**
   * **A rider on a blow's pass that dealt something** (`func_ov024_021e4b14`
   * from the kind-1 handler). Poison (`021e303c`), sleep (`021e33a4`) and
   * death (`021e4604`) make their draw only for one who can take them, and
   * land under the action's chance times the target's byte over a hundred —
   * a hundred here — or on a critical. What sends one to sleep or fells them
   * is applied once the blow's damage is: `pending`.
   */
  const rideBlow = (
    me: FighterState,
    target: number,
    rider: Rider,
    critical: boolean,
    pending: { asleep: number[]; felled: number[] },
  ): ChangeHit | undefined => {
    const them = fighters[target] as FighterState
    if (rider.slot === 2 || rider.slot === 8) return levelRider(target, rider.slot, rider.levels)
    const chance = me.side === 'party' ? rider.chance.party : rider.chance.foe
    const lands = () =>
      Math.fround(rng.below(100)) < (critical ? Math.fround(100) : Math.fround(chance))
    switch (rider.slot) {
      case 4: {
        // Envenomation where its levels are above 0 (`0x021e309c`), plain
        // poison otherwise; neither at the maximum of tension
        // (`func_02088540`, `020885e0`), and poison not on the envenomated.
        const envenom = rider.levels > 0
        if (them.states.tension === TENSION_MOST) return undefined
        if (!envenom && them.states.envenomed) return undefined
        if (!lands()) return undefined
        setStates(target, envenom ? { envenomed: true } : { poisoned: true })
        return { target, result: envenom ? 'envenomed' : 'poisoned' }
      }
      case 7:
        if (them.states.sleep !== undefined || pending.asleep.includes(target)) return undefined
        if (!lands()) return undefined
        pending.asleep.push(target)
        return { target, result: 'asleep' }
      case 20:
        // Not on a metal body (`func_ov000_02156068`, `0x021e463c`).
        if (them.metal || pending.felled.includes(target)) return undefined
        if (!lands()) return undefined
        pending.felled.push(target)
        return { target, result: 'killed' }
      default:
        return undefined
    }
  }
  /** Who came ready in this action, told after it — see `coupAfter`. */
  const primedNow: number[] = []
  /** The living party ready already, which the chance is multiplied by (`func_ov024_021eb2b4`). */
  const readyNow = () =>
    fighters.filter((f) => f.side === 'party' && alive(f) && f.primed !== undefined).length
  /**
   * Whether a draw is made for them (`func_ov024_021eb1ec`): one of the party
   * with a coup, at its level, standing, awake — or woken by the pass's own
   * damage — and not ready already.
   */
  const coupMayCome = (i: number, woken = false) => {
    const f = fighters[i]
    return (
      !!f &&
      f.side === 'party' &&
      f.coup !== undefined &&
      f.coup.level >= COUP_LEVEL &&
      alive(f) &&
      (woken || f.states.sleep === undefined) &&
      f.primed === undefined
    )
  }
  const prime = (i: number) => {
    const level = fighters[i]?.coup?.level ?? 0
    fighters = fighters.map((f, k) => (k === i ? { ...f, primed: coupRounds(level) } : f))
    primedNow.push(i)
  }
  /**
   * **The draw at a pass** that reached `target`, after its results
   * (`0x021ecf6c`–`0x021ed078`): what it dealt them — of an action of kind 1 —
   * as a share of their HP. `hpAfter`, where the action's damage is dealt only
   * once its passes are done, is what the pass leaves them.
   */
  const coupAtPass = (target: number, damage: number, hpAfter?: number) => {
    const f = fighters[target]
    if (!f || (hpAfter !== undefined && hpAfter <= 0)) return
    if (!coupMayCome(target, hpAfter !== undefined && damage > 0)) return
    if (rng.below(100) < coupChance(coupHpTerm(damage, f.maxHp), readyNow())) prime(target)
  }
  /**
   * **After an action through the resolver** (`0x021ed298`–`0x021ed404`): its
   * actor's own draw while a monster stands; then a coup used clears; then
   * those it made ready are told.
   */
  const coupAfter = (actor: number, action: number | undefined) => {
    const f = fighters[actor]
    if (f && livingOn('foes').length > 0 && coupMayCome(actor)) {
      if (rng.below(100) < coupChance(f.coup?.bonus ?? 0, readyNow())) prime(actor)
    }
    if (action !== undefined && COUP_ACTIONS.has(action)) unprime(actor)
    for (const i of primedNow.splice(0)) events.push({ kind: 'primed', actor: i })
  }
  /** The action just resolved, whose after-draw is owed — see `coupAfter`. */
  let resolved: { readonly actor: number; readonly action: number | undefined } | undefined
  const settleResolved = () => {
    if (resolved) coupAfter(resolved.actor, resolved.action)
    resolved = undefined
  }
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
    if (me.side === 'foes') {
      // A monster's: its target fallen, the first handler picks again, its
      // own two draws with it (`0215440c` → `02154a04`).
      if (reach !== 'one') return standing
      if (up) first = named
      else {
        first =
          side === 'party'
            ? (weighted(actor, standing) ?? (standing[0] as number))
            : (standing[rng.below(standing.length)] as number)
        builtDraws()
      }
    } else if (side === me.side) first = up ? named : actor
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

  /**
   * **A monster's weighted pick** among the party (`func_ov000_02154f30`):
   * each weighs 2 in the Front Line and 1 in the Back Line (see
   * `Fighter.backLine`), and — where its record says it remembers — the last
   * to strike it 2 more and the one before 1 more; a draw below the total,
   * and the first whose weight is not below what is left. **Ours**: the
   * weight's halving under a status not identified (`0x8000000`), and the
   * fixed target of an enraged monster (`+0x18` bit `0x1000`), not modelled.
   */
  const weighted = (actor: number, list: readonly number[]): number | undefined => {
    if (list.length === 0) return undefined
    const me = fighters[actor] as FighterState
    const by = me.remembers ? (me.aimedBy ?? []) : []
    const weights = list.map(
      (i) => (fighters[i]?.backLine ? 1 : 2) + (by[0] === i ? 2 : 0) + (by[1] === i ? 1 : 0),
    )
    let left = rng.below(weights.reduce((a, b) => a + b, 0)) + 1
    for (const [k, w] of weights.entries()) {
      if (w >= left) return list[k]
      left -= w
    }
    return list[rng.below(list.length)]
  }
  /** One of the party aimed a pass at a monster: its memory of who (`0x021ed0d4`). */
  const noteAim = (actor: number, target: number) => {
    const me = fighters[actor]
    const them = fighters[target]
    if (me?.side !== 'party' || them?.side !== 'foes') return
    const by = [actor, them.aimedBy?.[0] ?? -1]
    fighters = fighters.map((f, i) => (i === target ? { ...f, aimedBy: by } : f))
  }
  /** Whom a way reaches and from which side, for the first handler — its reach, its side. */
  const wayAim = (
    way: FoeAction,
  ): { side: 'own' | 'other' | 'self'; reach: 'one' | 'group' | 'all' } => {
    switch (way.kind) {
      case 'attack':
        return { side: 'other', reach: 'one' }
      case 'blow':
        return { side: 'other', reach: way.blow.reach }
      case 'spell':
        return { side: way.spell.does === 'heal' ? 'own' : 'other', reach: way.spell.reach }
      case 'change':
        return { side: way.changing.side, reach: way.changing.reach }
      default:
        return { side: 'self', reach: 'one' }
    }
  }
  /** The command a way makes at a target. */
  const commandOf = (way: FoeAction, target: number): Command => {
    switch (way.kind) {
      case 'attack':
        return way.poison === undefined
          ? { kind: 'attack', target }
          : {
              kind: 'attack',
              target,
              poison: way.poison,
              ...(way.envenoms ? { envenoms: true } : {}),
            }
      case 'blow':
        return { kind: 'blow', blow: way.blow, target }
      case 'spell':
        return { kind: 'spell', spell: way.spell, target }
      case 'change':
        return { kind: 'change', changing: way.changing, target }
      case 'psyche':
        return way
      case 'flee':
        return { kind: 'flee' }
      case 'wait':
        return { kind: 'wait', action: way.action }
    }
  }
  /**
   * **The first handler** (`func_ov024_021edf6c` → `func_ov000_02154a04`), mode
   * 0's for everything and any mode's for a wait: the target by the way's side
   * and reach — one of the party by the weighted pick, one of its own side by a
   * draw among the standing, oneself, a group or all with no draw — then the
   * builder's two draws. Always usable.
   */
  const firstHandler = (actor: number, way: FoeAction): Command => {
    const aim = wayAim(way)
    let target = actor
    if (aim.side === 'other') {
      const party = livingOn('party')
      target = aim.reach === 'one' ? (weighted(actor, party) ?? -1) : (party[0] ?? -1)
    } else if (aim.side === 'own' && aim.reach === 'one') {
      const own = livingOn('foes')
      target = own[rng.below(own.length)] ?? actor
    }
    builtDraws()
    return commandOf(way, target)
  }
  /** Whether a fighter is below half its HP (`021db358` < 0.5). */
  const belowHalf = (f: FighterState) => Math.fround(Math.fround(f.hp) / Math.fround(f.maxHp)) < 0.5
  /**
   * **The weighted picks an action's hit code asks for**
   * (`func_ov024_021ed8c0`): code 3 a draw of three or four
   * (`NextRandomBetween`), 4 two, 5 four, 7 seven, 8 three, any other one —
   * each by the weighted pick among those given; refused with none. **Ours**:
   * the command aims at the first pick, the resolver making its passes from
   * there.
   */
  const pickedBy = (actor: number, way: FoeAction, among: readonly number[]) => {
    if (among.length === 0) return undefined
    const code = way.kind === 'blow' ? way.blow.hits : 0
    const k =
      code === 3
        ? rng.below(2) + 3
        : code === 4
          ? 2
          : code === 5
            ? 4
            : code === 7
              ? 7
              : code === 8
                ? 3
                : 1
    let first: number | undefined
    for (let n = 0; n < k; n++) {
      const t = weighted(actor, among)
      if (first === undefined) first = t
    }
    return first === undefined ? undefined : commandOf(way, first)
  }
  /**
   * **A targeting handler by its number** — mode 1's `+0x0C`, mode 2's
   * `+0x0E` (the table at `0x021ff790`): its draws, or undefined where it
   * refuses the way (read 3 October 2026). A number not read takes the first.
   */
  const byHandler = (actor: number, way: FoeAction, slot: number): Command | undefined => {
    const me = fighters[actor] as FighterState
    const party = livingOn('party')
    const own = livingOn('foes')
    switch (slot) {
      case 1: {
        // Mode 2's Attack: those whose defence is under twice their attack, by weight.
        const open = party.filter((i) => {
          const f = fighters[i] as FighterState
          return defenceOf(f) < 2 * f.attack
        })
        const t = weighted(actor, open)
        return t === undefined ? undefined : commandOf(way, t)
      }
      case 2:
      case 7: {
        const t = weighted(actor, party)
        return t === undefined ? undefined : commandOf(way, t)
      }
      case 3:
      case 4:
      case 8:
        return party.length > 0 ? commandOf(way, party[0] as number) : undefined
      case 11: {
        const hurt = own.filter((i) => belowHalf(fighters[i] as FighterState))
        if (hurt.length === 0) return undefined
        return commandOf(way, hurt[rng.below(hurt.length)] as number)
      }
      case 12: {
        const hurt = own.filter((i) => belowHalf(fighters[i] as FighterState))
        return 3 * hurt.length >= 2 * own.length && hurt.length > 0
          ? commandOf(way, actor)
          : undefined
      }
      case 18:
      case 19: {
        const open = own.filter((i) => (fighters[i] as FighterState).states.defence.level < 2)
        if (open.length === 0) return undefined
        return commandOf(way, open[rng.below(open.length)] as number)
      }
      case 5:
      case 6: {
        // Body Slam, Kamikazee (`func_ov024_021ee2fc`, `021ee33c`): only at a
        // third of its HP or less (5), half or less (6). It names no target —
        // its count is left at 0 — so, **INFERRED**, the target is the first
        // handler's, draws and all.
        const low = slot === 5 ? 3 * me.hp <= me.maxHp : me.maxHp >= 2 * me.hp
        return low ? firstHandler(actor, way) : undefined
      }
      case 20: {
        // Kabuff (`func_ov024_021ef074`): a draw among its side's groups with
        // one standing whose defence is not at its most and below two steps
        // up; that group.
        const groups = groupsOf(own).filter((name) =>
          own.some((i) => {
            const f = fighters[i] as FighterState
            return f.name === name && f.defence < 0xffff && f.states.defence.level < 2
          }),
        )
        if (groups.length === 0) return undefined
        const name = groups[rng.below(groups.length)] as string
        return commandOf(way, own.find((i) => fighters[i]?.name === name) as number)
      }
      case 22: {
        // Sap (`func_ov024_021ef388`): those with a defence to lower and above
        // two steps down, by the weighted picks its hit code asks for.
        const open = party.filter((i) => {
          const f = fighters[i] as FighterState
          return f.defence !== 0 && f.states.defence.level > -2
        })
        return pickedBy(actor, way, open)
      }
      case 26: {
        // Accelerate (`func_ov024_021ef7b8`): a draw among its own standing
        // whose agility is under 999 and below two steps up.
        const open = own.filter((i) => {
          const f = fighters[i] as FighterState
          return f.agility < 999 && f.states.agility.level < 2
        })
        if (open.length === 0) return undefined
        return commandOf(way, open[rng.below(open.length)] as number)
      }
      case 32:
        // Deceleratle (`func_ov024_021eff3c`): all of the party, while one has
        // an agility to lower and is above two steps down.
        return party.some((i) => {
          const f = fighters[i] as FighterState
          return f.agility !== 0 && f.states.agility.level > -2
        })
          ? commandOf(way, party[0] as number)
          : undefined
      case 61:
        // One of the party by the weighted picks its hit code asks for (`func_ov024_021f1844`).
        return pickedBy(actor, way, party)
      case 62:
        // All of the party, no draw (`func_ov024_021f18a0`).
        return party.length > 0 ? commandOf(way, party[0] as number) : undefined
      case 114:
        // Poison Breath (`func_ov024_021f43b0`): all of the party, unless every one is poisoned.
        return party.some((i) => !(fighters[i] as FighterState).states.poisoned)
          ? commandOf(way, party[0] as number)
          : undefined
      case 157:
        // The breaths (`func_ov024_021f639c`): all of the party.
        return party.length > 0 ? commandOf(way, party[0] as number) : undefined
      case 24:
      case 25: {
        const open = party.filter((i) => (fighters[i] as FighterState).states.defence.level > -2)
        if (open.length === 0) return undefined
        if (wayAim(way).reach === 'one') {
          const t = weighted(actor, open)
          return t === undefined ? undefined : commandOf(way, t)
        }
        return commandOf(way, open[0] as number)
      }
      case 42:
      case 43:
      case 44:
      case 45:
      case 113:
      case 158: {
        const awake = party.filter((i) => (fighters[i] as FighterState).states.sleep === undefined)
        if (awake.length === 0) return undefined
        if (wayAim(way).reach === 'one') {
          const t = weighted(actor, awake)
          return t === undefined ? undefined : commandOf(way, t)
        }
        return commandOf(way, awake[0] as number)
      }
      case 96:
        return me.states.tension === TENSION_MOST ? undefined : commandOf(way, actor)
      case 112: {
        // Flee: only when the party's mean attack and defence is three times its own.
        const whole = fighters.filter((f) => f.side === 'party')
        const mean = whole.reduce((n, f) => n + f.attack + f.defence, 0) / Math.max(1, whole.length)
        return mean >= 3 * (me.attack + me.defence) ? commandOf(way, actor) : undefined
      }
      default:
        return firstHandler(actor, way)
    }
  }
  /**
   * **A monster's choosing** (`func_0208a91c`), by its way rule — see
   * {@link Fighter.wayRule}. A way is tried by the usable test
   * (`func_0208a03c`): a way it may use once a group not yet used by its
   * group; MP enough, for mode 2; and its handler not refusing — which makes
   * the handler's draws whether it refuses or not. When no way is usable, the
   * Attack by the first handler (`func_ov000_02154a04` with action 2), every
   * rule alike.
   */
  const chooseFoe = (actor: number): Command => {
    const me = fighters[actor] as FighterState
    const mode = me.aiMode ?? 1
    const ways = me.acts ?? []
    const attack: FoeAction = { kind: 'attack' }
    if (ways.length === 0) return firstHandler(actor, attack)
    const tryWay = (w: number): Command | undefined => {
      const way = ways[w]
      if (!way) return undefined
      const used = onceUsed.get(me.name) ?? 0
      const once = ((me.oncePerGroup ?? 0) >> w) & 1
      if (once && (used >> w) & 1) return undefined
      const cost =
        way.kind === 'spell' ? way.spell.cost : way.kind === 'change' ? way.changing.cost : 0
      if (mode === 2 && cost > me.mp) return undefined
      const slot =
        mode === 0
          ? 0
          : (way.targeting?.[mode === 1 ? 0 : 1] ?? (way.kind === 'attack' && mode === 2 ? 1 : 0))
      const command =
        slot === 0 || slot >= 0xa1 ? firstHandler(actor, way) : byHandler(actor, way, slot)
      if (command && once) onceUsed.set(me.name, used | (1 << w))
      return command
    }
    const count = () => (fighters[actor] as FighterState).wayCount ?? 0
    const setCount = (n: number) => {
      fighters = fighters.map((f, i) => (i === actor ? { ...f, wayCount: n } : f))
    }
    switch (me.wayRule) {
      case 3: {
        // **In turn** (`func_0208a52c`): the way its count names, the count
        // on by one round six, six times; none usable, the Attack.
        for (let k = 0; k < 6; k++) {
          const w = count()
          setCount((w + 1) % 6)
          const command = tryWay(w)
          if (command) return command
        }
        return firstHandler(actor, attack)
      }
      case 7: {
        // **In turn, by the group's count** (`func_0208a840`): as 3, the count
        // the group's own. No monster on the cartridge has it.
        for (let k = 0; k < 6; k++) {
          const w = groupWayCount.get(me.name) ?? 0
          groupWayCount.set(me.name, (w + 1) % 6)
          const command = tryWay(w)
          if (command) return command
        }
        return firstHandler(actor, attack)
      }
      case 5: {
        // **A pair in turn and a coin within it** (`func_0208a5d8`): the count
        // taken round three; three times, the low bit of a draw picks which
        // of the pair 2c, 2c + 1 goes first, the count moves on, and the
        // first then the other is tried.
        setCount(count() % 3)
        for (let k = 0; k < 3; k++) {
          const coin = rng.top32() & 1
          const c = count()
          setCount((c + 1) % 3)
          const command = tryWay(2 * c + coin) ?? tryWay(2 * c + (coin ^ 1))
          if (command) return command
        }
        return firstHandler(actor, attack)
      }
      case 6: {
        // **Its first way, then the others** (`func_0208a700`): the count's
        // low bit; twice, at 0 the first way alone, at 1 a draw among the
        // other five and on round them from it; the count flips each pass.
        setCount(count() & 1)
        for (let k = 0; k < 2; k++) {
          const others = count() !== 0
          const first = others ? 1 : 0
          const n = others ? 5 : 1
          let at = rng.below(n)
          setCount((count() + 1) & 1)
          for (let j = 0; j < n; j++) {
            const command = tryWay(first + at)
            if (command) return command
            at = (at + 1) % n
          }
        }
        return firstHandler(actor, attack)
      }
    }
    // **By the weights** (`func_0208a370`, rules 0, 1, 2 and 4): the way
    // drawn, then the one before, down to the first, then those after.
    const first = chosenWay(rng, me.choice ?? rules.choice)
    const tries = [first]
    for (let w = first - 1; w >= 0; w--) tries.push(w)
    for (let w = first + 1; w < 6; w++) tries.push(w)
    for (const w of tries) {
      const command = tryWay(w)
      if (command) return command
    }
    return firstHandler(actor, attack)
  }
  /** Actions more this round, by the rule and the draw (`func_ov000_0215f57c`). **Ours**: 4–7's status bit taken as clear. */
  const extraActions = (rule: number, draw: number) =>
    rule === 1
      ? draw === 1
        ? 1
        : 0
      : rule === 2
        ? 1
        : rule === 3
          ? 2
          : rule === 6
            ? 1
            : rule === 7
              ? 2
              : 0

  /**
   * **A turn that is no action of the fighter's own** — `0x1F7`, the turn of
   * one who cannot act, and `0x385`, a sleeper's waking — goes through the
   * resolver all the same (read 3 October 2026): the builder's two draws, the
   * die, the critical, the accuracy (none for a metal monster, which misses),
   * the physical formula of its own attack on its own defence, and the 0-or-1
   * coin when that comes to nothing.
   */
  const selfPass = (me: FighterState, metalMisses = true) => {
    builtDraws()
    rng.below(100)
    rng.below(10_000)
    if (metalMisses && me.side === 'foes' && me.metal) return
    rng.below(100)
    if (physicalDamage(rng, attackOf(me), defenceOf(me)) <= 0) rng.below(2)
  }
  /** Whether a fighter can act — and so dodge or block: standing and not asleep (`func_ov000_02155f9c`). */
  const canAct = (f: FighterState) => alive(f) && f.states.sleep === undefined
  /** The draw after every action while the battle goes on (`func_ov000_0215858c`, `0x021585bc`). */
  let afterDue = false

  // **The command phase** (`ProcessCombatTurn`, `0x0215d9fc`–`0x0215e0a8`):
  // after every fighter's initiative and before anyone acts, in that order,
  // each monster of modes 0 and 1 able to act chooses its way and target; then
  // every monster, whatever its mode, makes the draw for its actions more this
  // round (`func_ov000_0215f57c`), each more chosen at once. Mode 2 chooses at
  // its turn. Each choice is its own turn in the order — **ours**, INFERRED:
  // that a monster's more actions follow its first at once.
  const queue: { actor: number; command: Command | undefined }[] = []
  for (const actor of order) {
    const f = fighters[actor] as FighterState
    if (f.side !== 'foes') {
      queue.push({ actor, command: undefined })
      continue
    }
    if (!alive(f)) continue
    const early = canAct(f) && (f.aiMode ?? 1) !== 2
    queue.push({ actor, command: early ? chooseFoe(actor) : undefined })
    const more = extraActions(f.extraRule ?? 0, rng.below(2))
    for (let k = 0; k < more; k++)
      queue.push({ actor, command: early ? chooseFoe(actor) : undefined })
  }

  for (const { actor, command: planned } of queue) {
    settleResolved()
    if (afterDue && outcome === 'ongoing') rng.below(100)
    afterDue = false
    const me = fighters[actor]
    if (!me || !alive(me)) continue
    // A flight that failed: the party's round is lost (above).
    if (caught && me.side === 'party') continue
    if (!acted.includes(actor)) acted.push(actor)
    afterDue = true
    // **The charm draws** (`func_ov000_0215704c`): a monster able to act whose
    // status byte `+0x53` — its record's 22nd resistance — is not 0 makes one
    // draw for each of the party standing. **Ours**: none of the party's
    // charm is above a hundred, so none charms it; the draws are spent.
    if (me.side === 'foes' && canAct(me) && (me.resist?.[21] ?? 0) !== 0) {
      for (const _ of livingOn('party')) rng.below(100)
    }
    // The way, for a monster of mode 2 — or one that could not act as the
    // round began and can now — chosen here at its turn (`0x02157980`).
    const command: Command | undefined =
      me.side === 'party'
        ? (commands.get(actor) ?? { kind: 'attack', target: -1 })
        : (planned ?? (canAct(me) ? chooseFoe(actor) : undefined))
    // **The turn-start draw**, every fighter's, every turn (`0x0215838c`) —
    // and a sleeper's waking.
    const startDraw = rng.below(100)
    // A sleeper's turn goes on sleeping, or on waking — through the resolver either way.
    if (me.states.sleep !== undefined) {
      const woke = wakes(me.states.sleep, startDraw)
      setStates(actor, { sleep: woke ? undefined : me.states.sleep + 1 })
      events.push({ kind: woke ? 'woke' : 'asleep', actor })
      selfPass(me)
      continue
    }
    if (!command) continue
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

    // Defend, a wait and a monster's flight go through the resolver's pass on
    // themselves: range 0, so the physical formula's draws after the accuracy
    // (`0x021ec4e4`). A metal monster's wait misses its accuracy; its flight
    // carries `+0x10` bit 24 and does not.
    if (command.kind === 'defend' || command.kind === 'wait') {
      selfPass(me)
      coupAtPass(actor, 0)
    } else if (command.kind === 'flee' && me.side === 'foes') selfPass(me, false)
    if (command.kind === 'defend') {
      events.push({ kind: 'defend', actor })
      resolved = { actor, action: undefined }
      continue
    }
    if (command.kind === 'wait') {
      events.push({ kind: 'wait', actor, action: command.action })
      resolved = { actor, action: command.action }
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
      // Range 0: the physical formula's draws, and its coin, come before its own.
      selfPass(me, false)
      // Egg On's ally, where it is one standing on the user's side; else the user.
      const whom = fighters[command.target ?? actor]
      const at =
        command.target !== undefined && whom && alive(whom) && whom.side === me.side
          ? command.target
          : actor
      const was = (fighters[at] as FighterState).states.tension ?? 0
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
        setStates(at, {
          tension: level,
          ...(level === TENSION_MOST ? { poisoned: false, envenomed: false } : {}),
        })
      }
      coupAtPass(at, 0)
      resolved = { actor, action: command.action }
      events.push({
        kind: 'psyche',
        actor,
        action: command.action,
        steps,
        ...(command.outright ? { outright: true } : {}),
        ...(at !== actor ? { target: at } : {}),
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
      coupAtPass(on, 0)
      resolved = { actor, action: undefined }
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
        noteAim(actor, target)
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
        // The coup's draw at this pass: a harm of kind 1 counts what it dealt.
        const harm = spell.does === 'harm'
        coupAtPass(
          target,
          harm && spell.kind === 1 ? amount : 0,
          harm ? them.hp - amount : them.hp + amount,
        )
        return { target, amount }
      })
      resolved = { actor, action: spell.action }
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
      const { change } = changing
      // A raising is aimed at the fallen: the one named on its own side,
      // standing or not — the resolver's handler tells which (`0x021dd2c0`).
      const named = fighters[command.target]
      const reached =
        change.kind === 'revive'
          ? [named && named.side === side && !named.fled ? command.target : actor]
          : aimOf(me, actor, side, command.target, changing.reach)
      const first = reached[0]
      if (first === undefined) {
        events.push({
          kind: 'change',
          actor,
          action: changing.action,
          change: change.kind,
          short: false,
          hits: [],
        })
        continue
      }
      builtDraws()
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
      /** Those whom it fells, felled once it is told. */
      const felled: number[] = []
      const rode: ChangeHit[] = []
      /**
       * **One of the party's accuracy** (`func_ov000_02156648`): a scaling
       * action's runs from its least to its most as the caster's number runs
       * from the record's `lo` to `hi` — the amount's arithmetic, in floats —
       * or is drawn between them, truncated, a draw after the hundred's.
       */
      const accuracyOf = (): number => {
        const a = changing.accuracy
        if (me.side !== 'party' || !a) return change.chance
        if (!a.scales) return Math.trunc(rng.floatBetween(a.min, a.max))
        const stat = (a.scales.by === 'might' ? me.might : me.mending) ?? 0
        return scaledAccuracy(stat, a.min, a.max, a.scales.lo, a.scales.hi)
      }
      const changeOne = (target: number): ChangeHit => {
        noteAim(actor, target)
        const them = fighters[target] as FighterState
        rng.below(100)
        if (!once) critical = rng.below(10_000) < rate
        const dodged =
          changing.evadable === true &&
          canAct(them) &&
          rng.below(100) < Math.trunc(evadeOf(them, rules))
        const draw = rng.below(100)
        const chance = accuracyOf()
        if (dodged) return { target, result: 'dodged' }
        // Its accuracy is the chance **times the target's resistance, plus a
        // half, truncated** (`0x02156a74`); gone haywire it lands on anyone
        // not immune (`0x02156a34`).
        const resistance = resistanceTo(them.resist, changing.element ?? 0)
        const accuracy = Math.trunc(
          Math.fround(Math.fround(Math.fround(chance) * resistance) + Math.fround(0.5)),
        )
        const landed = (critical && resistance > 0) || draw < accuracy
        // **Landed, the physical formula's draws** — its record's range is 0
        // (`0x021ec4e4`) — and the coin when it comes to nothing.
        if (landed && physicalDamage(rng, attackOf(me), defenceOf(them)) <= 0) rng.below(2)
        const was = them.states
        switch (change.kind) {
          case 'sleep':
          case 'poison': {
            const already = change.kind === 'sleep' ? was.sleep !== undefined : was.poisoned
            if (already) return { target, result: 'already' }
            if (!landed) return { target, result: 'resisted' }
            if (change.kind === 'sleep') {
              // Sleep takes the tension away (`func_02088338`).
              setStates(target, { sleep: 0, ...(was.tension ? { tension: 0 } : {}) })
              return { target, result: 'asleep' }
            }
            setStates(target, { poisoned: true })
            return { target, result: 'poisoned' }
          }
          case 'cure':
            // Squelch (`func_ov024_021dbc64`): the poisoned or envenomated, landed.
            if (!landed || !(was.poisoned || was.envenomed)) return { target, result: 'resisted' }
            setStates(target, { poisoned: false, envenomed: false })
            return { target, result: 'cured' }
          case 'wake':
            // Kind 9 (`func_ov024_021dbf18`): a sleeper, landed.
            if (!landed || was.sleep === undefined) return { target, result: 'resisted' }
            setStates(target, { sleep: undefined })
            return { target, result: 'woke' }
          case 'kill':
            // Kind 17 (`func_ov024_021dd028`): all their HP. The protection
            // that leaves 1 (`func_ov024_021ea78c`) is a status not kept here.
            if (!landed || !alive(them)) return { target, result: 'resisted' }
            felled.push(target)
            return { target, result: 'killed' }
          case 'restore': {
            // Choir of Angels: no test of its landing (`0x021e1408`–`0x021e14b4`).
            if (!alive(them)) return { target, result: 'resisted' }
            const f = Math.fround
            const heal = Math.max(
              change.least,
              Math.trunc(f(f(0.5) + f(f(change.share) * f(them.maxHp)))),
            )
            const hp = Math.min(heal, them.maxHp - them.hp)
            // The cure-all (`func_ov024_021eae14`): sleep, both poisons, and a
            // level below 0 — of the many it clears, those kept here.
            const st = them.states
            const lowered = (l: { level: number } | undefined) => (l?.level ?? 0) < 0
            const cured =
              st.sleep !== undefined ||
              st.poisoned ||
              st.envenomed === true ||
              lowered(st.attack) ||
              lowered(st.defence) ||
              lowered(st.agility)
            fighters = fighters.map((g, i) =>
              i === target
                ? {
                    ...g,
                    hp: g.hp + hp,
                    states: {
                      ...g.states,
                      sleep: undefined,
                      poisoned: false,
                      envenomed: false,
                      ...(lowered(st.attack) ? { attack: { level: 0, turns: 0 } } : {}),
                      ...(lowered(st.defence) ? { defence: { level: 0, turns: 0 } } : {}),
                      ...(lowered(st.agility) ? { agility: { level: 0, turns: 0 } } : {}),
                    },
                  }
                : g,
            )
            return { target, result: 'restored', hp, ...(cured ? { cured: true } : {}) }
          }
          case 'revive': {
            // Kind 18 (`func_ov024_021dd278`): the fallen, landed — a share of
            // their most HP, truncated.
            if (alive(them)) return { target, result: 'resisted' }
            if (!landed) return { target, result: 'lifeless' }
            // **Ours**: never below 1 — what `func_0208902c` makes of 0 is not read.
            const hp = Math.max(
              1,
              revivedHp(change.share, me.side === 'party', me.mending ?? 0, them.maxHp),
            )
            fighters = fighters.map((g, i) => (i === target ? { ...g, hp, states: NO_STATES } : g))
            return { target, result: 'revived', hp }
          }
          default: {
            if (!landed) return { target, result: 'resisted' }
            const level = was[change.kind] ?? { level: 0, turns: 0 }
            const next = moved(level, change.by)
            // The rider, from the handler that has landed (`0x021db674`): a
            // level's always rolls, its draw first (`func_ov024_021e2ebc`).
            if (changing.rider) rideOn(target, changing.rider, changing.action, rode)
            if (!next) return { target, result: 'already' }
            setStates(target, { [change.kind]: next })
            return {
              target,
              result: change.by > 0 ? 'raised' : 'lowered',
              level: next.level,
            }
          }
        }
      }
      // Each one reached, then the coup's draw at their pass — nothing dealt.
      const hits = reached.map((target) => {
        const hit = changeOne(target)
        coupAtPass(target, 0)
        return hit
      })
      resolved = { actor, action: changing.action }
      events.push({
        kind: 'change',
        actor,
        action: changing.action,
        change: change.kind,
        short: false,
        hits,
        ...(rode.length > 0 ? { rode } : {}),
      })
      for (const target of felled) hurt(target, (fighters[target] as FighterState).hp)
      outcome = outcomeOf(fighters)
      if (outcome !== 'ongoing') break
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
        rode?: ChangeHit
      }[] = []
      /** Who its riders send to sleep or fell, once its damage is dealt. */
      const pending: { asleep: number[]; felled: number[] } = { asleep: [], felled: [] }
      let recoil = 0
      /** What the passes so far have dealt each target, dealt only once they are done. */
      const dealtTo = new Map<number, number>()
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
        noteAim(actor, target)
        const them = fighters[target] as FighterState
        if (!once && !blow.sure) critical = rng.below(10_000) < rate
        const dodged =
          blow.evadable && canAct(them) && rng.below(100) < Math.trunc(evadeOf(them, rules))
        const blocked =
          blow.blockable &&
          canAct(them) &&
          !dodged &&
          Math.fround(rng.below(100)) < Math.fround(blockOf(them))
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
        const base = physicalDamage(rng, attackOf(me), defenceOf(them))
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
              // Victimiser's test asks both poisons (`0x021d8d5c`, `021d8d6c`).
              poisoned: them.states.poisoned || them.states.envenomed === true,
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
        // What rides on it, on a pass that dealt something (kind 1's handler).
        const rode =
          blow.rider && damage > 0 && RIDERS_PLAYED.has(blow.rider.slot)
            ? rideBlow(me, target, blow.rider, critical, pending)
            : undefined
        hits.push({
          target,
          damage,
          critical: thrust ? damage > 0 : critical && !dodged && !blocked,
          dodged,
          blocked,
          ...(rode ? { rode } : {}),
        })
        // The coup's draw at this pass, on what it dealt and what it leaves.
        const before = dealtTo.get(target) ?? 0
        dealtTo.set(target, before + damage)
        coupAtPass(target, damage, them.hp - before - damage)
      }
      resolved = { actor, action: blow.action }
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
      // A rider's sleep holds past the blow that brought it (the game deals
      // the pass before the rider); its death takes what is left.
      for (const target of pending.asleep) {
        const f = fighters[target] as FighterState
        if (alive(f)) setStates(target, { sleep: 0, ...(f.states.tension ? { tension: 0 } : {}) })
      }
      for (const target of pending.felled) {
        const f = fighters[target] as FighterState
        if (alive(f)) hurt(target, f.hp)
      }
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
    noteAim(actor, target)
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
    // Neither is drawn against one who cannot act (`func_ov000_02155f9c`).
    const dodged = canAct(them) && rng.below(100) < Math.trunc(evadeOf(them, rules))
    // 3. The block — not rolled for a blow already dodged — the draw as a float
    //    under the rate, untruncated. The plain attack can be blocked.
    const blocked =
      canAct(them) && !dodged && Math.fround(rng.below(100)) < Math.fround(blockOf(them))
    // 4. The accuracy: a draw below 100 made before anything is compared. The
    //    plain attack's accuracy stands at a hundred, so it lands every time —
    //    and spends this. (Sight spoilt, which would miss it five times in
    //    eight, is not modelled.)
    rng.below(100)
    // 5. The damage, worked out **even for a blow that was dodged or blocked**:
    //    the game calls `GetAttackBaseDamage` whenever the blow lands, and the
    //    dodge and the block ride along as flags.
    let damage = physicalDamage(rng, attackOf(me), defenceOf(them))
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
      attack: attackOf(me),
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
    // Rolled only for a blow that has dealt something, and only on one who can
    // take it — the rider's handler (`func_ov024_021e303c`), which leaves
    // before its draw otherwise: **nobody at the maximum of tension, and plain
    // poison not on the envenomated** (`func_020885e0`, `func_02088540`; read 6
    // October 2026 — "not on the poisoned", which stood here, was wrong: the
    // poisoned are poisoned again, "even more powerfully"). Envenomation where
    // the record's levels are above 0 — the poison attack 275's are.
    // It lands under its chance times a hundredth of the target's byte for
    // poison, the draw a float; and one immune is not rolled for.
    const toPoison = resistanceTo(them.resist, POISON_ELEMENT)
    const mayTake =
      them.states.tension !== TENSION_MOST && (command.envenoms || !them.states.envenomed)
    const poisoned =
      damage > 0 &&
      command.poison !== undefined &&
      mayTake &&
      toPoison > 0 &&
      Math.fround(rng.below(100)) < Math.fround(Math.fround(command.poison) * toPoison)
    const again = command.envenoms ? them.states.envenomed === true : them.states.poisoned
    if (poisoned) setStates(target, command.envenoms ? { envenomed: true } : { poisoned: true })
    events.push({
      kind: 'attack',
      actor,
      target,
      damage,
      critical: critical && !dodged && !blocked,
      dodged,
      blocked,
      ...(poisoned ? { poisoned: true } : {}),
      ...(poisoned && command.envenoms
        ? { envenomed: again ? ('again' as const) : ('newly' as const) }
        : {}),
      ...(combo > 0 ? { combo } : {}),
    })
    hurt(target, damage)
    // The coup's draw at the pass — the Attack is of kind 1.
    coupAtPass(target, damage)
    resolved = { actor, action: undefined }
    calm(actor)
    outcome = outcomeOf(fighters)
    if (outcome !== 'ongoing') break
  }

  settleResolved()
  if (afterDue && outcome === 'ongoing') rng.below(100)
  if (outcome === 'ongoing') {
    // Each who took a turn has a turn off its levels, and they may wear off.
    for (const i of acted) {
      const f = fighters[i]
      if (!f || !alive(f)) continue
      // **Ours**: attack's turn first, as its bits come first in `+0x58`; the
      // game's order, and its counts (attack 5, the others 6), are not read.
      for (const stat of ['attack', 'defence', 'agility'] as const) {
        const level = (fighters[i] as FighterState).states[stat]
        if (!level) continue
        const worn = wornAfterTurn(level, rng)
        setStates(i, { [stat]: worn.level })
        if (worn.wore) events.push({ kind: 'wornOff', actor: i, stat })
      }
    }
    // A coup de grâce held a round less, and gone when its count runs out
    // (`func_ov000_02157e1c`, `0x021581e8`–`0x02158238`) — no draw.
    for (let i = 0; i < fighters.length; i++) {
      const f = fighters[i] as FighterState
      if (f.primed === undefined) continue
      if (f.primed - 1 > 0) {
        const left = f.primed - 1
        fighters = fighters.map((g, k) => (k === i ? { ...g, primed: left } : g))
      } else {
        unprime(i)
        events.push({ kind: 'coupPassed', actor: i })
      }
    }
    // Then envenomation takes its toll (`func_ov000_0215a23c`) — plain poison
    // takes none in a battle; see `poisonDamage`.
    for (let i = 0; i < fighters.length; i++) {
      const f = fighters[i] as FighterState
      if (!alive(f) || !f.states.envenomed) continue
      const damage = poisonDamage(f.maxHp)
      events.push({ kind: 'poison', actor: i, damage })
      hurt(i, damage)
    }
    outcome = outcomeOf(fighters)
  }

  fighters = fighters.map((f) => ({ ...f, defending: false }))
  return {
    state: {
      ...state,
      fighters,
      round: state.round + 1,
      outcome,
      fleeAttempts: attempts,
      chain,
      onceUsed,
      groupWayCount,
    },
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
