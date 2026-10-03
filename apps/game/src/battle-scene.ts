import { ActionEffect, ActionReach } from '@minstrel/game-formats'
import {
  type BattleEvent,
  BattleRng,
  type BattleState,
  type Blow,
  type ChangeResult,
  type Changing,
  type Command,
  type Fighter,
  type FoeAction,
  type Heal,
  handlerKnown,
  type Opening,
  playRound,
  type Spell,
  startBattle,
  TENSION_SHOWN,
  withHp,
  withMp,
} from '@minstrel/sim'
import {
  type Asked,
  allyTargets,
  backCommand,
  COMMAND_GRID,
  COMMAND_WORD_BASE,
  type Commanding,
  chooseCommand,
  commandsOf,
  type Entry,
  FOLLOW_ORDERS,
  type ItemEntry,
  MEMBER_COMMANDS,
  MISC_ROWS,
  MISC_WORD_BASE,
  monsterGroups,
  monsterTargets,
  moveCommand,
  openCommands,
  PARTY_ROWS,
  PARTY_WORDS,
  TACTIC_GRID,
  TACTIC_WORD_BASE,
  tacticsRows,
} from './battle-commands.ts'
import { type Named, tellBattle } from './battle-text.ts'

/**
 * A battle as the player sees it: the monsters appear, the party chooses —
 * attack, a spell, defend, an item or flee, and whom — the round plays out a
 * message at a time, and the next choice comes, until it is over. The rules
 * are `@minstrel/sim`'s; this is only the telling of them.
 *
 * **The words are the game's** when they are given, as {@link BattleWords}: the
 * monsters drawing near and fleeing from `strbtl`, what each action says from
 * `actmsg`, the results from `str_bres`, the commands from `str_btl`. Which
 * message an action says is not in its record — see game-formats' FORMAT.md,
 * "Battle text" — so each is chosen here by what it says: {@link BATTLE_SAYS},
 * {@link ACTION_SAYS}, {@link RESULT_SAYS}. Without them — a test, or text that
 * will not read — the words are ours.
 */

/** Telling what happened, choosing the round's commands, or over. */
export type Phase = 'command' | 'telling' | 'over'

/** The game's messages the battle tells, each file by number. */
export interface BattleWords {
  /** `strbtl`: the monsters drawing near, fleeing. */
  readonly battle: ReadonlyMap<number, string>
  /** `actmsg`: what an action says. */
  readonly actions: ReadonlyMap<number, string>
  /** `str_bres`: what a battle comes to. */
  readonly results: ReadonlyMap<number, string>
  /** `str_btl`: the battle menu's words. */
  readonly menu: ReadonlyMap<number, string>
  /** `strstd`: the engine's standard words — the party menu's Fight, Examine, Flee, Misc. */
  readonly standard?: ReadonlyMap<number, string>
  /** The article table, by number. */
  readonly articles: ReadonlyMap<number, string>
}

/** `strbtl`'s messages, by what they say. */
export const BATTLE_SAYS = {
  /** One kind of monster draws near — one, or several. */
  drawsNear: 6,
  /** Two kinds. */
  twoDrawNear: 7,
  /** More kinds than two. */
  manyDrawNear: 5,
  flees: 1,
  /** Fleeing, and the enemy blocking the way. */
  blocked: 3,
} as const

/** `actmsg`'s messages, by what they say. */
export const ACTION_SAYS = {
  attacks: 1,
  takes: 2,
  noDamage: 4,
  dies: 8,
  defeated: 9,
  defends: 10,
  uses: 12,
  /** `uses <INDEF_ART_SGL_I_NAME>` as the herbs open, and 46 named items. */
  usesItem: 70,
  healed: 22,
  nothingHappens: 31,
  critical: 140,
  shield: 150,
  dodges: 151,
  /** Someone casts a spell, `<ACTION>`. */
  casts: 46,
  /** A monster runs away. */
  flees: 45,
  /** A spell's critical: it goes haywire. */
  haywire: 141,
  notEnoughMp: 153,
  /** Changes of state. */
  unaffected: 27,
  defenceUp: 60,
  defenceDown: 61,
  defenceNormal: 62,
  poisoned: 63,
  fallsAsleep: 65,
  alreadyAsleep: 67,
  isAsleep: 68,
  agilityUp: 78,
  agilityDown: 79,
  agilityNormal: 80,
  alreadyPoisoned: 82,
  wakes: 116,
  /** "But …'s tension doesn't increase to the maximum." — the coin lost, 0x36. */
  tensionFails: 0x36,
  /** "…'s tension gets a huge boost all of a sudden!" — 0x151 and 0x152's, `0x021dca8c`. */
  tensionBoost: 0x152,
  /** "…'s tension returns to normal." — spent, `0x021ed4d0`. */
  tensionSpent: 0x1f1,
} as const

/** What comes back to a blow's striker, in `actmsg` — the steps after the action's own words. */
const BLOW_SAYS = { mpBack: 0x214, hpBack: 0x215, recoil: 0x1b4 } as const

/** Tension rising to 5, 20, 50 and 100, by the level reached — `func_ov024_021e8c48`'s 0x31 to 0x34. */
const TENSION_RISES = [0, 0x31, 0x32, 0x33, 0x34] as const

type ChangeKind = Extract<BattleEvent, { kind: 'change' }>['change']

/** What a change's result says in `actmsg`, by what it changes. */
function changeSays(kind: ChangeKind, result: ChangeResult): number {
  switch (result) {
    case 'asleep':
      return ACTION_SAYS.fallsAsleep
    case 'poisoned':
      return ACTION_SAYS.poisoned
    case 'raised':
      return kind === 'agility' ? ACTION_SAYS.agilityUp : ACTION_SAYS.defenceUp
    case 'lowered':
      return kind === 'agility' ? ACTION_SAYS.agilityDown : ACTION_SAYS.defenceDown
    case 'already':
      return kind === 'sleep'
        ? ACTION_SAYS.alreadyAsleep
        : kind === 'poison'
          ? ACTION_SAYS.alreadyPoisoned
          : ACTION_SAYS.unaffected
    case 'resisted':
      return ACTION_SAYS.unaffected
    case 'dodged':
      return ACTION_SAYS.dodges
  }
}

/** The same, in ours. */
function changeOurs(kind: ChangeKind, result: ChangeResult, whom: string): string {
  switch (result) {
    case 'asleep':
      return `${whom} falls asleep.`
    case 'poisoned':
      return `${whom} is poisoned.`
    case 'raised':
      return `${whom}'s ${kind} rises.`
    case 'lowered':
      return `${whom}'s ${kind} falls.`
    case 'already':
      return kind === 'sleep'
        ? `${whom} is already asleep.`
        : kind === 'poison'
          ? `${whom} is already poisoned.`
          : `${whom} is not affected.`
    case 'resisted':
      return `${whom} is not affected.`
    case 'dodged':
      return `${whom} dodges out of the way!`
  }
}

/** `str_bres`'s messages, by what they say. */
export const RESULT_SAYS = {
  /**
   * One earner's number; 7, 8 and 9 are two, three and four of them, each
   * `<str_n>` and `<val_n>` a name and a number.
   */
  earns: 6,
  level: 10,
  /** "<TARGET>'s experience level jumps from Lv. <val_1> to Lv. <val_2>!" — more than one. */
  levelJump: 22,
  /** "<TARGET>'s attributes improve!" */
  improve: 38,
  /** "<val_1> skill point(s) earned." */
  skillPoints: 13,
  gold: 16,
  /** A monster's drop: "<M_NAME> drops a treasure chest! <TARGET> opens it up." */
  dropsChest: 17,
  /**
   * What the chest holds: "It contains <I_NAME>! <TARGET> puts it in the bag."
   * 18 says the same and ends "greedily grabs the loot!"; what chooses between
   * them is not established, and 19 is the one used here.
   */
  chestHolds: 19,
  wipedOut: 20,
  /** "<TARGET> receives some experience!" — one earner. */
  receives: 25,
  /** "Each party member receives some experience!" — more than one. */
  eachReceives: 26,
} as const

/** Something the Items command offers: what it is, how many, and its heal if it has one. */
export interface BattleItem {
  readonly id: number
  readonly name: Named
  readonly count: number
  readonly heal?: Heal
}

/**
 * Something the Spells command offers: the spell as the battle casts it, its
 * name, and the message its record says for each one it reaches — `actmsg` 2,
 * taking damage, or 22, healed.
 */
export interface BattleSpell extends Told {
  readonly spell: Spell
}

/** How an action is told: its name, its message, and how it opens. */
export interface Told {
  readonly name: Named
  readonly message: number
  /**
   * How it opens: the `actmsg` said before its own — 46 `casts <ACTION>` on a
   * spell, 70 `uses <item>` on a herb, 394 `sends rubble raining down` on the
   * hexagoon's move — read from the action (`Action.opening`); 0 for none.
   * Cast, 46, unless said.
   */
  readonly opening?: number
}

/**
 * Our words for an opening where the game's are not to hand: the openings
 * whose shape is known — cast, used, attacks, flees — and nothing for the rest.
 */
function ourOpeningOf(opening: number, who: string, action: Named): string[] {
  if (opening === ACTION_SAYS.casts) return [`${who} casts ${shown(action)}!`]
  if (opening === ACTION_SAYS.uses || opening === ACTION_SAYS.usesItem || opening === 11)
    return [`${who} uses ${article(shown(action))}.`]
  if (opening === ACTION_SAYS.attacks) return [`${who} attacks!`]
  return []
}

/** Whether a telling is a spell's, which says what it does. */
const isSpell = (told: Told | undefined): told is BattleSpell =>
  told !== undefined && 'spell' in told

/** An action, as far as a battle casts it — see `ItemEffect` in `load.ts`. */
export interface Castable {
  readonly action: number
  readonly name: string
  /** What it does — `ActionEffect`. */
  readonly effect: number
  readonly message: number
  /** How it opens — see `Told.opening`. */
  readonly opening: number
  readonly cost: number
  /** Whom it reaches — `ActionReach`. */
  readonly reach: number
  /** Whom it is aimed at: 1 the other side, 2 one's own — `Action.side`. */
  readonly side?: number
  /** The party's amount, a base give or take a spread. */
  readonly range: Heal | undefined
  /** What the battle's rolls read of its record — the loader's `ItemEffect.rolls`. */
  readonly rolls?: {
    readonly foeChance: number
    readonly chanceIsAccuracy: boolean
    readonly evadable: boolean
    readonly defendable?: boolean
    readonly combos?: boolean
    readonly tensed?: boolean
    readonly kind?: number
    readonly blockable?: boolean
    readonly handler?: number
    readonly hitCode?: number
    readonly afterStep?: number
    readonly fallsOff?: boolean
    readonly aiTargets?: readonly [number, number]
    readonly alwaysCritical?: boolean
    readonly haywire: boolean
    /** Its record's own multiplier on a caster's chance of going haywire. */
    readonly criticalPercent?: number
    readonly levels: number
    readonly rider: number
    readonly element?: number
    readonly landingElement?: number
    readonly cap?: number
  }
}

const REACHES = new Map<number, Spell['reach']>([
  [ActionReach.One, 'one'],
  [ActionReach.Group, 'group'],
  [ActionReach.All, 'all'],
])

/**
 * A spell as a battle casts it, from its action: one that restores HP heals,
 * one that deals damage harms, and it reaches one, a group or all as its
 * record says. Undefined for anything else — Zing, with no one fallen to raise,
 * and Evac, which is used outside battle.
 */
export function battleSpellOf(
  action: Castable,
  opening: number = action.opening,
): BattleSpell | undefined {
  const does =
    action.effect === ActionEffect.RestoresHp
      ? 'heal'
      : action.effect === ActionEffect.Damages
        ? 'harm'
        : undefined
  const reach = REACHES.get(action.reach)
  if (!does || !reach) return undefined
  // A blow with no range — the bodkin fletcher's 231 — deals what its own
  // handler works out, which is not read; without this it would be taken for
  // a spell of no amount, which the battle reads as everything the target has.
  if (does === 'harm' && !action.range) return undefined
  return {
    spell: {
      action: action.action,
      cost: action.cost,
      does,
      reach,
      amount: action.range,
      // What the target's resistance is to, and the most it can deal — the record's.
      ...(action.rolls?.element ? { element: action.rolls.element } : {}),
      ...(action.rolls?.cap ? { cap: action.rolls.cap } : {}),
      // Its own multiplier on the caster's chance of going haywire — 50 on the
      // spells, half a blow's; see `criticalChance`.
      ...(action.rolls?.criticalPercent === undefined
        ? {}
        : { criticalPercent: action.rolls.criticalPercent }),
      ...(action.rolls?.defendable === undefined ? {} : { defendable: action.rolls.defendable }),
      ...(action.rolls?.combos ? { combos: true } : {}),
      ...(action.rolls?.tensed ? { tensed: true } : {}),
      ...(action.rolls?.kind === undefined ? {} : { kind: action.rolls.kind }),
    },
    name: { name: action.name },
    message: action.message,
    opening,
  }
}

/**
 * A monster's own spell: its action at a monster's amount — the range's base,
 * `foeRange`, INFERRED — and, when the action is an item's, used as that item
 * and named as it is: the bodkin archer's medicinal herb.
 */
export function foeSpellOf(
  action: Castable & { readonly foeRange: Heal | undefined },
  item?: Named,
): BattleSpell | undefined {
  const spell = battleSpellOf({ ...action, range: action.foeRange })
  return spell && item ? { ...spell, name: item } : spell
}

/** The actions a monster's six words use for its attack and for fleeing. */
export const FOE_ATTACK = 1
export const FOE_FLEE = 225

/**
 * The reference's poison attack — Ragin' Contagion's 275 — and its chance in
 * 100 of poisoning. **The chance is the record's own where there is one**: the
 * game's rider handler takes a monster's from the action's `foeChance` when
 * what rides on the blow is slot {@link POISON_RIDER}. The 12 is the
 * reference's, and what the cartridge says too.
 */
export const POISON_ATTACK = 275
/** Psyche Up's kind of action (`+0x18` bits 5–11), whose handler is `func_ov024_021dc93c`. */
const PSYCHE_KIND = 15
export const POISON_CHANCE = 12
/** The rider that poisons — INFERRED from who carries it: Toxic Dagger, Venomissile. */
export const POISON_RIDER = 4

/**
 * The changes of state a monster's ways cause, by action, and whose side they
 * fall on. The reference's own, tied to these numbers by its boss's six words
 * — Ragin' Contagion's are its candidates exactly: 228 Sweet Breath, sleep 25
 * in 100; 44 Kasap and 48 Deceleratle, defence or agility down a level 75 in
 * 100. By their message, `falls asleep`, at Sweet Breath's chance, which is
 * **ours** for them: 53 Snooze and 54 Kasnooze. **Ours, by their names alone**:
 * 43 Sap and 47 Decelerate as Kasap and Deceleratle; 41 Buff, 42 Kabuff, 45
 * Accelerate and 46 Acceleratle a level up on their own side, always.
 *
 * **What they change and on whose side is this table's; how often, by how
 * much, and whether it can be dodged are the record's**, where the record is
 * to hand — see {@link foeWaysOf}. The chances here are what stands without
 * one, and the cartridge corrects two of them: Snooze is 37 and Kasnooze 50,
 * where ours gave both Sweet Breath's 25.
 */
const FOE_CHANGES: ReadonlyMap<number, Pick<Changing, 'change' | 'side'>> = new Map<
  number,
  Pick<Changing, 'change' | 'side'>
>([
  [228, { change: { kind: 'sleep', chance: 25 }, side: 'other' }],
  [44, { change: { kind: 'defence', by: -1, chance: 75 }, side: 'other' }],
  [48, { change: { kind: 'agility', by: -1, chance: 75 }, side: 'other' }],
  [53, { change: { kind: 'sleep', chance: 25 }, side: 'other' }],
  [54, { change: { kind: 'sleep', chance: 25 }, side: 'other' }],
  [43, { change: { kind: 'defence', by: -1, chance: 75 }, side: 'other' }],
  [47, { change: { kind: 'agility', by: -1, chance: 75 }, side: 'other' }],
  [41, { change: { kind: 'defence', by: 1, chance: 100 }, side: 'own' }],
  [42, { change: { kind: 'defence', by: 1, chance: 100 }, side: 'own' }],
  [45, { change: { kind: 'agility', by: 1, chance: 100 }, side: 'own' }],
  [46, { change: { kind: 'agility', by: 1, chance: 100 }, side: 'own' }],
])

/**
 * A change with what the action's record says of it in place of the table's:
 * a monster's chance — its accuracy, for an action whose accuracy scales, and a
 * hundred for one whose does not — the levels it moves, held to two either way
 * as the game's handlers hold them, and whether it can be dodged.
 */
function recordsOwn(
  changes: Pick<Changing, 'change' | 'side'>,
  rolls: Castable['rolls'],
): Pick<Changing, 'change' | 'side' | 'evadable' | 'haywire' | 'element'> {
  if (!rolls) return changes
  const chance = rolls.chanceIsAccuracy ? rolls.foeChance : 100
  const { change } = changes
  const levels = Math.max(-2, Math.min(2, rolls.levels))
  return {
    side: changes.side,
    change:
      change.kind === 'sleep' || change.kind === 'poison'
        ? { ...change, chance }
        : { ...change, chance, by: levels === 0 ? change.by : levels },
    evadable: rolls.evadable,
    haywire: rolls.haywire,
    ...(rolls.criticalPercent === undefined ? {} : { criticalPercent: rolls.criticalPercent }),
    ...(rolls.landingElement ? { element: rolls.landingElement } : {}),
  }
}

/**
 * A monster's six ways of acting, from its six words — game-formats'
 * `readMonsterBattle`, which are action numbers: 1 its attack, 225 fleeing,
 * 275 the poison attack, a change of state from {@link FOE_CHANGES} at its
 * action's own reach and cost, and what heals or deals damage a spell of its
 * own, `spellOf`. With each one's telling, by action. **Ours**: what the battle
 * cannot do yet — Dazzle, sand in the eyes, the dances, the moves with no
 * reading — is an attack instead.
 */
export function foeWaysOf(
  words: readonly number[],
  spellOf: (action: number) => BattleSpell | undefined,
  actionOf: (action: number) => Castable | undefined = () => undefined,
): { readonly acts: FoeAction[]; readonly known: Map<number, Told> } {
  const known = new Map<number, Told>()
  // Each way with the targeting handlers its record names for AI modes 1 and 2.
  const acts = words.map((word): FoeAction => {
    const way = wayOf(word)
    const targeting = actionOf(word)?.rolls?.aiTargets
    return targeting ? { ...way, targeting } : way
  })
  return { acts, known }

  function wayOf(word: number): FoeAction {
    if (word === FOE_FLEE) return { kind: 'flee' }
    if (word === FOE_ATTACK) return { kind: 'attack' }
    const action = actionOf(word)
    if (word === POISON_ATTACK) {
      const own = action?.rolls?.rider === POISON_RIDER ? action.rolls.foeChance : POISON_CHANCE
      return { kind: 'attack', poison: own }
    }
    const changes = FOE_CHANGES.get(word)
    const reach = action && REACHES.get(action.reach)
    if (changes && action && reach) {
      // A spell that costs MP is cast; a breath has no word of its own.
      known.set(word, {
        name: { name: action.name },
        message: action.message,
        opening: action.opening,
      })
      return {
        kind: 'change',
        changing: { action: word, cost: action.cost, reach, ...recordsOwn(changes, action.rolls) },
      }
    }
    // **Psyche Up** and its kind (15, `func_ov024_021dc93c`) on oneself, by the
    // record's steps; 0x151 and 0x152 go straight to theirs. Egg On and the
    // others that reach someone else are not modelled yet.
    if (action?.rolls?.kind === PSYCHE_KIND && action.reach === ActionReach.Actor) {
      known.set(word, {
        name: { name: action.name },
        message: action.message,
        opening: action.opening,
      })
      const outright = word === 0x151 || word === 0x152
      return {
        kind: 'psyche',
        action: word,
        steps: Math.max(1, action.rolls.levels),
        ...(outright ? { outright } : {}),
      }
    }
    // A way that does nothing — effect 0, as fleeing's — is a turn spent
    // saying so: the sanguini's `is just fluffing around`.
    if (action && action.effect === 0) {
      known.set(word, {
        name: { name: action.name },
        message: action.message,
        opening: action.opening,
      })
      return { kind: 'wait', action: word }
    }
    // A blow of its own, by its handler — see `blowOf`.
    const blow = action && word !== FOE_ATTACK ? blowOf(action) : undefined
    if (blow && action) {
      known.set(word, {
        name: { name: action.name },
        message: action.message,
        opening: action.opening,
      })
      return { kind: 'blow', blow }
    }
    const spell = spellOf(word)
    if (!spell) return { kind: 'attack' }
    known.set(word, spell)
    return { kind: 'spell', spell: spell.spell }
  }
}

/**
 * A monster's motion while a page is on show: `appear` as it draws near, its
 * attack as it strikes, `damage` as it is hit, `death` as it falls. The motions
 * are the monster's own, by name — see `monsters.ts`; which plays when is ours.
 */
export interface Cue {
  readonly fighter: number
  /** `heal` is recovering: no motion of its own, only the number over them. */
  readonly motion: 'appear' | 'attack' | 'damage' | 'death' | 'flee' | 'heal'
  /** What a `damage` takes or a `heal` gives — the number that rises over them. */
  readonly amount?: number
}

export interface BattleScene {
  readonly state: BattleState
  /** The battle's own numbers. Drawn from as the battle goes: not copied. */
  readonly rng: BattleRng
  /**
   * The world's numbers, which a flight is drawn from — the game's
   * `GetBTRandom()`, not the battle's. See `fleeChance`.
   */
  readonly world?: BattleRng
  readonly phase: Phase
  readonly cursor: number
  /** The message on show while telling — the first — and those still to come. */
  readonly pages: readonly string[]
  /** What the monsters do while each page is on show, page for page. */
  readonly cues: readonly (readonly Cue[])[]
  /** The event each page tells, page for page; none for a page that tells no event. */
  readonly told: readonly (BattleEvent | undefined)[]
  /** Whether what the battle came to has been handed out; the caller sets it. */
  readonly settled: boolean
  /** Each fighter's name as the words use it, in the fighters' order, lettered where kinds repeat. */
  readonly names: readonly Named[]
  readonly words: BattleWords | undefined
  /** What the Items command offers, while one is being chosen. */
  readonly items: readonly BattleItem[]
  /** What the Spells command offers, while one is being chosen and told. */
  readonly spells: readonly BattleSpell[]
  /** The command phase, while the round's commands are chosen — see `battle-commands.ts`. */
  readonly commanding?: Commanding | undefined
  /** Tactics set from Misc., by fighter, for the caller to keep with its members. */
  readonly tactics: ReadonlyMap<number, number>
  /** The monsters' own spells and changes of state, by action, to tell them by. */
  readonly known: ReadonlyMap<number, Told>
  /** What the last round came to — an item used, for the caller to take from the bag. */
  readonly events: readonly BattleEvent[]
}

export function beginBattle(
  fighters: readonly Fighter[],
  seed: bigint,
  options: {
    readonly canFlee: boolean
    /** How the fight opened, which decides who sits the first round out — see `howItOpens`. */
    readonly opening?: Opening
    /** The world's generator, which a flight is drawn from — see `BattleScene.world`. */
    readonly world?: BattleRng
    readonly hp?: ReadonlyMap<number, number>
    /** MP each fighter comes in with, where it is not all of it. */
    readonly mp?: ReadonlyMap<number, number>
    /** The monsters' own spells and changes of state, by action, to tell them by. */
    readonly known?: ReadonlyMap<number, Told>
    readonly words?: BattleWords
    readonly names?: readonly Named[]
  },
): BattleScene {
  const started = startBattle(fighters, options.canFlee, options.opening)
  const wounded = options.hp ? withHp(started, options.hp) : started
  const state = options.mp ? withMp(wounded, options.mp) : wounded
  const scene: BattleScene = {
    state,
    rng: new BattleRng(seed),
    ...(options.world ? { world: options.world } : {}),
    phase: 'telling',
    cursor: 0,
    pages: [],
    cues: [],
    told: [],
    settled: false,
    names: lettered(fighters.map((f, i) => options.names?.[i] ?? { name: f.name })),
    words: options.words,
    items: [],
    spells: [],
    tactics: new Map(),
    known: options.known ?? new Map(),
    events: [],
  }
  const pages = appearing(scene)
  // Every monster appears as the first page tells of them.
  const appear = state.fighters.flatMap((f, i) =>
    f.side === 'foes' ? [{ fighter: i, motion: 'appear' as const }] : [],
  )
  return {
    ...scene,
    pages,
    cues: pages.map((_, p) => (p === 0 ? appear : [])),
    told: pages.map(() => undefined),
  }
}

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const article = (name: string) => (/^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`)

/** Letter the names that repeat — `slime A`, `slime B` — as the labels do. */
function lettered(names: readonly Named[]): Named[] {
  const counts = new Map<string, number>()
  for (const n of names) counts.set(n.name, (counts.get(n.name) ?? 0) + 1)
  const seen = new Map<string, number>()
  return names.map((n) => {
    if ((counts.get(n.name) ?? 0) < 2) return n
    const k = seen.get(n.name) ?? 0
    seen.set(n.name, k + 1)
    return { ...n, letter: String.fromCharCode(65 + k) }
  })
}

/** What each fighter is called: its name, lettered A, B … where more than one shares it. */
export function labelsOf(state: BattleState): string[] {
  const counts = new Map<string, number>()
  for (const f of state.fighters) counts.set(f.name, (counts.get(f.name) ?? 0) + 1)
  const seen = new Map<string, number>()
  return state.fighters.map((f) => {
    if ((counts.get(f.name) ?? 0) < 2) return f.name
    const n = seen.get(f.name) ?? 0
    seen.set(f.name, n + 1)
    return `${f.name} ${String.fromCharCode(65 + n)}`
  })
}

type WordFile = Exclude<keyof BattleWords, 'articles' | 'standard'>

/** A message from the game's words, rendered — or undefined when there are none, or not that one. */
function say(
  scene: Pick<BattleScene, 'words'>,
  file: WordFile,
  number: number,
  telling: Parameters<typeof tellBattle>[1],
): string | undefined {
  const words = scene.words
  const template = words?.[file].get(number)
  if (!words || template === undefined) return undefined
  return tellBattle(template, telling, words.articles).text
}

/** A name as a row shows it: its markup rendered, no article. */
const shown = (name: Named) => tellBattle('<SGL_I_NAME>', { item: name }, new Map()).text

function appearing(scene: BattleScene): string[] {
  const kinds = new Map<string, { named: Named; count: number }>()
  scene.state.fighters.forEach((f, i) => {
    if (f.side !== 'foes') return
    const was = kinds.get(f.name)
    const { letter: _, ...named } = scene.names[i] ?? { name: f.name }
    kinds.set(f.name, { named, count: (was?.count ?? 0) + 1 })
  })
  const list = [...kinds.values()]
  const [first, second] = list
  const game =
    list.length === 1 && first
      ? say(scene, 'battle', BATTLE_SAYS.drawsNear, {
          monsters: [first.named],
          values: { val_1: first.count },
        })
      : list.length === 2 && first && second
        ? say(scene, 'battle', BATTLE_SAYS.twoDrawNear, {
            monsters: [first.named, second.named],
            values: { val_1: first.count, val_2: second.count },
          })
        : say(scene, 'battle', BATTLE_SAYS.manyDrawNear, {})
  if (game !== undefined) return [game]
  return [...kinds].map(([name, { count }]) =>
    sentence(count === 1 ? `${article(name)} appears!` : `${count} ${name}s appear!`),
  )
}

/** What one event says, as a page — the game's words when the scene has them. */
function tell(scene: BattleScene, event: BattleEvent, state: BattleState): string {
  const labels = labelsOf(state)
  const who = labels[event.actor] ?? '?'
  const actor = scene.names[event.actor]
  const lines = (...pieces: (string | undefined)[]) =>
    pieces.every((p) => p !== undefined) ? pieces.join('\n') : undefined
  switch (event.kind) {
    case 'attack': {
      const whom = labels[event.target] ?? '?'
      const target = scene.names[event.target]
      const game = lines(
        say(scene, 'actions', ACTION_SAYS.attacks, { actor, target }),
        ...(event.dodged
          ? [say(scene, 'actions', ACTION_SAYS.dodges, { actor, target })]
          : event.blocked
            ? [say(scene, 'actions', ACTION_SAYS.shield, { actor, target })]
            : [
                ...(event.critical ? [say(scene, 'actions', ACTION_SAYS.critical, {})] : []),
                event.damage > 0
                  ? say(scene, 'actions', ACTION_SAYS.takes, {
                      actor,
                      target,
                      values: { val_1: event.damage },
                    })
                  : say(scene, 'actions', ACTION_SAYS.noDamage, { actor, target }),
                ...(event.poisoned
                  ? [say(scene, 'actions', ACTION_SAYS.poisoned, { target })]
                  : []),
              ]),
      )
      if (game !== undefined) return game
      const ours = [`${who} attacks!`]
      if (event.dodged) ours.push(`${whom} dodges out of the way!`)
      else if (event.blocked) ours.push(`${whom} blocks the blow with a shield!`)
      else {
        if (event.critical) ours.push('A critical hit!')
        ours.push(
          event.damage > 0 ? `${whom} takes ${event.damage} damage.` : `${whom} takes no damage.`,
        )
        if (event.poisoned) ours.push(`${whom} is poisoned.`)
      }
      return ours.map(sentence).join('\n')
    }
    case 'blow': {
      // **An ability's blow**: its own opening, then each pass as the plain
      // attack's lines tell a hit, then what came back to its striker —
      // `actmsg` 0x214 MP, 0x215 HP, 0x1b4 recoil (`func_ov024_021e56c0`,
      // `021e5988`, `021e57e0`).
      const told = scene.known.get(event.action)
      const action = told?.name ?? { name: `move ${event.action}` }
      const opens = told?.opening
        ? [say(scene, 'actions', told.opening, { actor, action, item: action })]
        : []
      const passes = event.hits.flatMap((hit) => {
        const target = scene.names[hit.target]
        if (hit.dodged) return [say(scene, 'actions', ACTION_SAYS.dodges, { actor, target })]
        if (hit.blocked) return [say(scene, 'actions', ACTION_SAYS.shield, { actor, target })]
        return [
          ...(hit.critical ? [say(scene, 'actions', ACTION_SAYS.critical, {})] : []),
          hit.damage > 0
            ? say(scene, 'actions', ACTION_SAYS.takes, {
                actor,
                target,
                values: { val_1: hit.damage },
              })
            : say(scene, 'actions', ACTION_SAYS.noDamage, { actor, target }),
        ]
      })
      const after = [
        ...(event.regained?.mp
          ? [
              say(scene, 'actions', BLOW_SAYS.mpBack, {
                actor,
                target: actor,
                values: { val_1: event.regained.mp },
              }),
            ]
          : []),
        ...(event.regained?.hp
          ? [
              say(scene, 'actions', BLOW_SAYS.hpBack, {
                actor,
                target: actor,
                values: { val_1: event.regained.hp },
              }),
            ]
          : []),
        ...(event.recoil
          ? [
              say(scene, 'actions', BLOW_SAYS.recoil, {
                actor,
                target: actor,
                values: { val_1: event.recoil },
              }),
            ]
          : []),
      ]
      const game = lines(...opens, ...passes, ...after)
      if (game !== undefined) return game
      const ours = [`${who} uses ${shown(action)}!`]
      for (const hit of event.hits) {
        const whom = labels[hit.target] ?? '?'
        if (hit.dodged) ours.push(`${whom} dodges out of the way!`)
        else if (hit.blocked) ours.push(`${whom} blocks the blow with a shield!`)
        else {
          if (hit.critical) ours.push('A critical hit!')
          ours.push(
            hit.damage > 0 ? `${whom} takes ${hit.damage} damage.` : `${whom} takes no damage.`,
          )
        }
      }
      if (event.regained?.mp) ours.push(`${who} recovers ${event.regained.mp} MP.`)
      if (event.regained?.hp) ours.push(`${who} recovers ${event.regained.hp} HP.`)
      if (event.recoil) ours.push(`${who} takes ${event.recoil} damage in the recoil.`)
      return ours.map(sentence).join('\n')
    }
    case 'wait': {
      const chosen = scene.known.get(event.action)
      const action = chosen?.name ?? { name: '' }
      const game = chosen?.opening
        ? lines(say(scene, 'actions', chosen.opening, { actor, action, item: action }))
        : undefined
      return game ?? `${who} does nothing.`
    }
    case 'defend':
      return (
        say(scene, 'actions', ACTION_SAYS.defends, { actor }) ?? sentence(`${who} is on guard.`)
      )
    case 'flee': {
      // A monster that runs away says so in `actmsg`; the party's flight in `strbtl`.
      if (state.fighters[event.actor]?.side === 'foes') {
        return say(scene, 'actions', ACTION_SAYS.flees, { actor }) ?? sentence(`${who} runs away!`)
      }
      const game = event.escaped
        ? say(scene, 'battle', BATTLE_SAYS.flees, { actor })
        : say(scene, 'battle', BATTLE_SAYS.blocked, { actor })
      if (game !== undefined) return game
      if (event.escaped) return sentence(`${who} runs away!`)
      return sentence(
        state.canFlee
          ? `${who} tries to run, but cannot get away!`
          : `${who} tries to run, but there is no escape!`,
      )
    }
    case 'item': {
      const item = scene.items.find((i) => i.id === event.item)?.name ?? {
        name: `item 0x${event.item.toString(16)}`,
      }
      const target = scene.names[event.target]
      const game = lines(
        say(scene, 'actions', ACTION_SAYS.uses, { actor, item }),
        event.healed
          ? say(scene, 'actions', ACTION_SAYS.healed, { actor, target })
          : say(scene, 'actions', ACTION_SAYS.nothingHappens, {}),
      )
      if (game !== undefined) return game
      const whom = labels[event.target] ?? '?'
      return [
        sentence(`${who} uses ${article(shown(item))}.`),
        event.healed ? `${whom} recovers ${event.healed} HP.` : 'But nothing happens.',
      ].join('\n')
    }
    case 'spell': {
      const chosen =
        scene.spells.find((s) => s.spell.action === event.action) ?? scene.known.get(event.action)
      const action = chosen?.name ?? { name: `spell ${event.action}` }
      const heals = isSpell(chosen) && chosen.spell.does === 'heal'
      const opening = chosen?.opening ?? ACTION_SAYS.casts
      // How it opens, in the game's words and in ours: the action's own line,
      // or none where it has none.
      const opens = opening ? [say(scene, 'actions', opening, { actor, action, item: action })] : []
      const ourOpening = ourOpeningOf(opening, who, action)
      if (event.short) {
        const game = lines(...opens, say(scene, 'actions', ACTION_SAYS.notEnoughMp, {}))
        return game ?? [...ourOpening.map(sentence), 'Not enough MP!'].join('\n')
      }
      const landed = event.hits.map((hit) => {
        const target = scene.names[hit.target]
        const values = { val_1: hit.amount }
        if (heals) {
          return say(scene, 'actions', chosen?.message || ACTION_SAYS.healed, { target, values })
        }
        return hit.amount > 0
          ? say(scene, 'actions', chosen?.message || ACTION_SAYS.takes, { actor, target, values })
          : say(scene, 'actions', ACTION_SAYS.noDamage, { actor, target })
      })
      const game = lines(
        ...opens,
        ...(event.critical ? [say(scene, 'actions', ACTION_SAYS.haywire, { actor, action })] : []),
        ...(landed.length > 0 ? landed : [say(scene, 'actions', ACTION_SAYS.nothingHappens, {})]),
      )
      if (game !== undefined) return game
      const ours = [...ourOpening]
      if (event.critical) ours.push(`The ${shown(action)} goes haywire!`)
      for (const hit of event.hits) {
        const whom = labels[hit.target] ?? '?'
        ours.push(
          heals
            ? `${whom} recovers ${hit.amount} HP.`
            : hit.amount > 0
              ? `${whom} takes ${hit.amount} damage.`
              : `${whom} takes no damage.`,
        )
      }
      if (event.hits.length === 0) ours.push('But nothing happens.')
      return ours.map(sentence).join('\n')
    }
    case 'change': {
      const told = scene.known.get(event.action)
      const action = told?.name ?? { name: `move ${event.action}` }
      // How it opens — cast, or a breath's own line — or nothing where it has none.
      const opening = told?.opening ?? ACTION_SAYS.casts
      const opens = opening ? [say(scene, 'actions', opening, { actor, action, item: action })] : []
      const ourOpening = ourOpeningOf(opening, who, action)
      if (event.short) {
        const game = lines(...opens, say(scene, 'actions', ACTION_SAYS.notEnoughMp, {}))
        return game ?? [...ourOpening.map(sentence), 'Not enough MP!'].join('\n')
      }
      const landed = event.hits.map((hit) =>
        say(scene, 'actions', changeSays(event.change, hit.result), {
          target: scene.names[hit.target],
        }),
      )
      const game = lines(
        ...opens,
        ...(landed.length > 0 ? landed : [say(scene, 'actions', ACTION_SAYS.nothingHappens, {})]),
      )
      if (game !== undefined) return game
      const ours = [
        ...ourOpening,
        ...event.hits.map((hit) => changeOurs(event.change, hit.result, labels[hit.target] ?? '?')),
      ]
      if (event.hits.length === 0) ours.push('But nothing happens.')
      return ours.map(sentence).join('\n')
    }
    case 'asleep':
      return (
        say(scene, 'actions', ACTION_SAYS.isAsleep, { actor }) ?? sentence(`${who} is fast asleep.`)
      )
    case 'woke':
      return say(scene, 'actions', ACTION_SAYS.wakes, { actor }) ?? sentence(`${who} wakes up.`)
    case 'wornOff':
      return (
        say(
          scene,
          'actions',
          event.stat === 'agility' ? ACTION_SAYS.agilityNormal : ACTION_SAYS.defenceNormal,
          { target: actor },
        ) ?? sentence(`${who}'s ${event.stat} returns to normal.`)
      )
    case 'poison':
      // Ours: no line for poison's toll is found; the game's damage line stands in.
      return (
        say(scene, 'actions', ACTION_SAYS.takes, {
          target: actor,
          values: { val_1: event.damage },
        }) ?? sentence(`The poison hurts ${who}: ${event.damage} damage.`)
      )
    case 'psyche': {
      const told = scene.known.get(event.action)
      const action = told?.name ?? { name: `move ${event.action}` }
      const opens = [
        ...(told?.opening
          ? [say(scene, 'actions', told.opening, { actor, action, item: action })]
          : []),
        ...(event.outright ? [say(scene, 'actions', ACTION_SAYS.tensionBoost, { actor })] : []),
      ]
      const steps =
        event.steps.length === 0
          ? [say(scene, 'actions', ACTION_SAYS.nothingHappens, {})]
          : event.steps.map((step) =>
              say(
                scene,
                'actions',
                step > 0 ? (TENSION_RISES[step] ?? 0) : ACTION_SAYS.tensionFails,
                { target: actor },
              ),
            )
      const game = lines(...opens, ...steps)
      if (game !== undefined) return game
      const ours = [
        ...ourOpeningOf(told?.opening ?? 0, who, action),
        ...(event.steps.length === 0
          ? ['But nothing happens.']
          : event.steps.map((step) =>
              step > 0
                ? `${who}'s tension increases to ${TENSION_SHOWN[step] ?? 0}.`
                : `But ${who}'s tension doesn't increase to the maximum.`,
            )),
      ]
      return ours.map(sentence).join('\n')
    }
    case 'calmed':
      return (
        say(scene, 'actions', ACTION_SAYS.tensionSpent, { actor }) ??
        sentence(`${who}'s tension returns to normal.`)
      )
    case 'defeated': {
      const foe = state.fighters[event.actor]?.side === 'foes'
      const game = say(scene, 'actions', foe ? ACTION_SAYS.defeated : ACTION_SAYS.dies, {
        target: actor,
      })
      return game ?? sentence(foe ? `${who} is defeated!` : `${who} has fallen!`)
    }
  }
}

/**
 * What the fighters do while an event's page is on show: the monsters, and
 * whoever stands beside the Hero in a model of their own. The Hero's figure is
 * the caller's to pose, and takes none of these.
 */
function cuesOf(event: BattleEvent, state: BattleState): Cue[] {
  const foe = (i: number) => state.fighters[i]?.side === 'foes'
  const party = (i: number) => state.fighters[i]?.side === 'party'
  switch (event.kind) {
    case 'attack': {
      const cues: Cue[] = [{ fighter: event.actor, motion: 'attack' }]
      if (event.damage > 0 && !event.dodged && !event.blocked)
        cues.push({ fighter: event.target, motion: 'damage', amount: event.damage })
      return cues
    }
    case 'spell': {
      // A monster casting strikes its attack; one hurt by the other side's spell flinches.
      const cues: Cue[] = foe(event.actor) ? [{ fighter: event.actor, motion: 'attack' }] : []
      for (const hit of event.hits) {
        if (hit.amount <= 0) continue
        if (foe(event.actor) !== foe(hit.target)) {
          cues.push({ fighter: hit.target, motion: 'damage', amount: hit.amount })
        } else cues.push({ fighter: hit.target, motion: 'heal', amount: hit.amount })
      }
      return cues
    }
    case 'change':
      // A monster changing state strikes its attack.
      return foe(event.actor) ? [{ fighter: event.actor, motion: 'attack' }] : []
    case 'poison':
      return event.damage > 0
        ? [{ fighter: event.actor, motion: 'damage', amount: event.damage }]
        : []
    case 'flee':
      // A monster running away stays until its page is told, then is gone.
      return foe(event.actor) ? [{ fighter: event.actor, motion: 'flee' }] : []
    case 'defeated':
      return foe(event.actor) || party(event.actor)
        ? [{ fighter: event.actor, motion: 'death' }]
        : []
    default:
      return []
  }
}

/**
 * The Hero: the first party fighter, whom the player commands. Anyone else on
 * the party's side — Ivor — acts by themselves: **ours**, an attack on the
 * first monster standing, which is what the battle does with a party member it
 * is handed no command for. How the game chooses a companion's action is not
 * read.
 */
function partyIndex(state: BattleState): number {
  return Math.max(
    0,
    state.fighters.findIndex((f) => f.side === 'party'),
  )
}

/**
 * **What the command phase offers**, for the caller to say: each party
 * member as the menu asks them (`Asked`), and the items and spells whose
 * names and messages the telling takes. Without `asked`, the party's first
 * member alone is asked, with the items and spells given — the shape of a
 * battle with only the Hero in it.
 */
export interface Offered {
  readonly asked?: readonly Asked[]
  readonly items?: readonly BattleItem[]
  readonly spells?: readonly BattleSpell[]
  /** How the party's abilities are told — their names and openings, by action. */
  readonly known?: ReadonlyMap<number, Told>
}

/** The Hero alone, asked with these items and spells — see `Offered`. */
export function heroAsked(
  state: BattleState,
  items: readonly BattleItem[],
  spells: readonly BattleSpell[],
  name = 'Hero',
): Asked[] {
  const fighter = partyIndex(state)
  return [
    {
      fighter,
      name,
      tactic: FOLLOW_ORDERS,
      own: true,
      guest: false,
      spells: spells.map((s) => spellEntry(s)),
      abilities: [],
      items: items.map((i) => itemEntry(i)),
    },
  ]
}

/** A spell as a list's line: aimed at the monsters to harm, at the party to heal. */
export function spellEntry(s: BattleSpell): Entry {
  const reach = s.spell.reach === 'all' ? 3 : s.spell.reach === 'group' ? 4 : 2
  return {
    action: s.spell.action,
    name: shown(s.name),
    cost: s.spell.cost,
    side: s.spell.does === 'heal' ? 2 : 1,
    reach,
    command: (target) => ({ kind: 'spell', spell: s.spell, target }),
  }
}

/** An item as the Items list's line: one that heals, on an ally. */
export function itemEntry(i: BattleItem): ItemEntry {
  return {
    item: i.id,
    name: shown(i.name),
    count: i.count,
    side: i.heal ? 2 : 0,
    reach: i.heal ? 2 : 0,
    command: (target) =>
      i.heal
        ? { kind: 'item', item: i.id, heal: i.heal, ...(target >= 0 ? { target } : {}) }
        : { kind: 'item', item: i.id },
  }
}

/** The rows the command phase shows now, which is chosen, and in how many columns. */
/** A menu's line: its words, and, for a group's, its count at a tab (`<X=118>`). */
export type MenuRow =
  | string
  | { readonly text: string; readonly right: string; readonly at: number }

export function battleMenu(
  scene: BattleScene,
): { readonly rows: MenuRow[]; readonly cursor: number; readonly columns: 1 | 2 } | undefined {
  const c = scene.commanding
  if (scene.phase !== 'command' || !c) return undefined
  const word = (file: 'menu' | 'standard', n: number) => {
    const w = file === 'menu' ? scene.words?.menu.get(n) : scene.words?.standard?.get(n)
    return w === undefined ? undefined : tellBattle(w, {}, new Map()).text
  }
  const s = c.step
  const labels = labelsOf(scene.state)
  switch (s.at) {
    case 'party':
      return {
        rows: PARTY_ROWS.map((row) => word('standard', PARTY_WORDS[row]) ?? row),
        cursor: s.cursor,
        columns: 1,
      }
    case 'member':
      // Drawn row by row from the grid, the cursor on the command's place.
      return {
        rows: COMMAND_GRID.map(
          (k) => word('menu', COMMAND_WORD_BASE + k) ?? MEMBER_COMMANDS[k] ?? '',
        ),
        cursor: COMMAND_GRID.indexOf(s.cursor as never),
        columns: 2,
      }
    case 'list': {
      const m = c.members[s.member]
      const entries = s.list === 'items' ? (m?.items ?? []) : (m?.[s.list] ?? [])
      return { rows: entries.map((e) => e.name), cursor: s.cursor, columns: 1 }
    }
    case 'monster': {
      // One line a group — "<name> × n", `str_btl` 30031, the count at x 118 —
      // the cursor walking the monsters, their group's line shown as chosen
      // (`func_ov000_02178938`, `021753d8`).
      const groups = monsterGroups(scene.state)
      const on = monsterTargets(scene.state)[s.cursor]
      const kindOf = (i: number | undefined) =>
        i === undefined ? undefined : scene.state.fighters[i]?.name
      const named = (i: number) => {
        const { letter: _, ...name } = scene.names[i] ?? { name: '?' }
        return sentence(
          tellBattle('<SGL_M_NAME>', { monsters: [name] }, scene.words?.articles ?? new Map()).text,
        )
      }
      return {
        rows: groups.map((g) => ({ text: named(g.first), right: `× ${g.count}`, at: 118 })),
        cursor: groups.findIndex((g) => kindOf(g.first) === kindOf(on)),
        columns: 1,
      }
    }
    case 'ally':
      return {
        rows: allyTargets(scene.state, c, s).map((i) => labels[i] ?? '?'),
        cursor: s.cursor,
        columns: 1,
      }
    case 'misc':
      return {
        rows: MISC_ROWS.map((row, k) => word('menu', MISC_WORD_BASE + k) ?? row),
        cursor: s.cursor,
        columns: 1,
      }
    case 'tactics':
      return {
        rows: tacticsRows(c).map((who) =>
          who === 'all'
            ? (word('standard', WHOLE_PARTY) ?? 'Whole Party')
            : (c.members[who]?.name ?? '?'),
        ),
        cursor: s.cursor,
        columns: 1,
      }
    case 'tactic':
      return {
        rows: TACTIC_GRID.map((v) => word('menu', TACTIC_WORD_BASE + v) ?? String(v)),
        cursor: TACTIC_GRID.indexOf(s.cursor as never),
        columns: 2,
      }
    case 'say': {
      const named = s.say.actor === undefined ? {} : { actor: { name: s.say.actor } }
      const str2 = s.say.str2 === undefined ? undefined : word('menu', s.say.str2)
      const text = say(scene, 'menu', s.say.number, {
        ...named,
        ...(str2 === undefined ? {} : { values: { str_2: str2 } }),
      })
      return { rows: [text ?? '…'], cursor: -1, columns: 1 }
    }
    default:
      return undefined
  }
}

/** `strstd`'s "Whole Party", the tactics list's last row. */
const WHOLE_PARTY = 26

/** Move the menu's cursor: up and down, and across a two-column grid. */
export function battleMove(scene: BattleScene, dx: number, dy = 0): BattleScene {
  const c = scene.commanding
  if (scene.phase !== 'command' || !c) return scene
  return { ...scene, commanding: moveCommand(scene.state, c, dx, dy) }
}

/** Go back a step — see `backCommand`. */
export function battleBack(scene: BattleScene): BattleScene {
  const c = scene.commanding
  if (scene.phase !== 'command' || !c) return scene
  return { ...scene, commanding: backCommand(scene.state, c) }
}

/** More to tell, after what is already to be told — what the battle came to, say. */
export function withPages(scene: BattleScene, pages: readonly string[]): BattleScene {
  if (pages.length === 0) return scene
  return {
    ...scene,
    phase: 'telling',
    pages: [...scene.pages, ...pages],
    cues: [...scene.cues, ...pages.map(() => [])],
    told: [...scene.told, ...pages.map(() => undefined)],
  }
}

/** Play the round with the commands chosen. */
function play(scene: BattleScene, commands: ReadonlyMap<number, Command>): BattleScene {
  const party = partyIndex(scene.state)
  const { state, events } = playRound(scene.state, commands, scene.rng, undefined, scene.world)
  const pages = events.map((event) => tell(scene, event, state))
  const cues = events.map((event) => cuesOf(event, state))
  const hero = labelsOf(state)[party] ?? '?'
  if (state.outcome === 'won' && !scene.words) pages.push(sentence(`${hero} is victorious!`))
  if (state.outcome === 'lost') {
    pages.push(
      say(scene, 'results', RESULT_SAYS.wipedOut, { leader: scene.names[party] }) ??
        sentence(`${hero} has been defeated.`),
    )
  }
  while (cues.length < pages.length) cues.push([])
  const told = pages.map((_, p) => events[p])
  return {
    ...scene,
    state,
    phase: 'telling',
    cursor: 0,
    pages,
    cues,
    told,
    events,
    commanding: undefined,
  }
}

/**
 * Take what the cursor is on, or go on to the next message. A new command
 * phase opens on the party menu each round with what `offered` says; when
 * its last choice is made, the round is played.
 */
export function battleChoose(scene: BattleScene, offered: Offered = {}): BattleScene {
  switch (scene.phase) {
    case 'telling': {
      const pages = scene.pages.slice(1)
      const cues = scene.cues.slice(1)
      const told = scene.told.slice(1)
      if (pages.length > 0) return { ...scene, pages, cues, told }
      if (scene.state.outcome !== 'ongoing') {
        return { ...scene, pages, cues, told, cursor: 0, phase: 'over' }
      }
      const items = offered.items ?? []
      const spells = offered.spells ?? []
      const asked = offered.asked ?? heroAsked(scene.state, items, spells)
      return {
        ...scene,
        pages,
        cues,
        told,
        cursor: 0,
        phase: 'command',
        items,
        spells,
        known: offered.known ? new Map([...scene.known, ...offered.known]) : scene.known,
        commanding: openCommands(asked),
      }
    }
    case 'command': {
      const c = scene.commanding
      if (!c) return scene
      const next = chooseCommand(scene.state, c)
      const tactics =
        next.tactics.size > 0 ? new Map([...scene.tactics, ...next.tactics]) : scene.tactics
      if (next.step.at !== 'done') return { ...scene, commanding: next, tactics }
      return play({ ...scene, tactics }, commandsOf(next))
    }
    case 'over':
      return scene
  }
}

/**
 * **An ability that is a blow**, as the battle plays it — see `blows.ts`: one
 * of kind 1, aimed at the monsters, with no range of its own, whose handler is
 * read. Undefined for anything else, which stays as it was.
 *
 * **Ours**: the slot-0 blows with code of their own elsewhere — Propeller
 * Blade, Crosscutter Throw, Gold Rush, and the six that scale, Gigaslash among
 * them — play as the plain blow their slot gives.
 */
export function blowOf(action: Castable): Blow | undefined {
  const r = action.rolls
  if (r?.kind !== 1 || action.side !== 1 || action.range || !handlerKnown(r.handler ?? 0)) {
    return undefined
  }
  return {
    action: action.action,
    handler: r.handler ?? 0,
    reach:
      action.reach === ActionReach.All
        ? 'all'
        : action.reach === ActionReach.Group
          ? 'group'
          : 'one',
    hits: r.hitCode ?? 0,
    criticalPercent: r.criticalPercent ?? 0,
    element: r.element ?? 8,
    ...(r.cap ? { cap: r.cap } : {}),
    falloff: r.fallsOff ?? false,
    evadable: r.evadable,
    blockable: r.blockable ?? false,
    defendable: r.defendable ?? false,
    tensed: r.tensed ?? false,
    combos: r.combos ?? false,
    after: r.afterStep ?? 0,
    ...(r.alwaysCritical ? { sure: true } : {}),
  }
}
