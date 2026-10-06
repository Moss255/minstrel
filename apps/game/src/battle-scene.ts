import { ActionEffect, ActionReach } from '@minstrel/game-formats'
import {
  type BattleEvent,
  BattleRng,
  type BattleState,
  type Blow,
  type Change,
  type ChangeHit,
  type Changing,
  type Command,
  type Fighter,
  type FoeAction,
  type Heal,
  handlerKnown,
  LEVEL_STATS,
  type LevelStat,
  type Opening,
  PINCUSHION,
  playRound,
  RIDERS_PLAYED,
  type Spell,
  STANCE,
  STANCES,
  startBattle,
  TENSION_SHOWN,
  withHp,
  withMp,
} from '@minstrel/sim'
import {
  type Armed,
  type Asked,
  allyTargets,
  armsKinds,
  armsMembers,
  armsOfKind,
  backCommand,
  COMMAND_GRID,
  COMMAND_SAYS,
  COMMAND_WORD_BASE,
  type Commanding,
  chooseCommand,
  commandsOf,
  coupLive,
  type Entry,
  FOLLOW_ORDERS,
  type ItemEntry,
  inBackLine,
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
  /** `str_ex2`: what Examine says of a monster — see `examinePages`. */
  readonly examine?: ReadonlyMap<number, string>
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
  /** "<ACTOR> is primed to perform a coup de grâce!" — action 922. */
  primed: 531,
  /** "The moment for <TARGET>'s coup de grâce has passed." — action 936. */
  coupPassed: 603,
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
  /**
   * Too little gold for Gold Rush: the opening of action 935, which the game
   * puts in its place (`func_ov024_021eaa50`, `0x021eadbc`).
   */
  notEnoughGold: 580,
  /**
   * A spell from one fizzled: action 914's opening, "tries to cast <ACTION>…
   * but can't cast spells at the moment" (`func_ov024_021eaa50`, `0x021eace8`).
   */
  cannotCast: 29,
  /** Antimagic on one already fizzled — at one of the party, at a monster (`0x021dcf28`). */
  furtherFizzledParty: 0x19,
  furtherFizzledFoe: 0x1a,
  /** "<TARGET> is no longer paralysed." — Tingle's done line. */
  unparalysed: 505,
  /** "<ACTOR> tries to use <ACTION>." — action 0x3a9's opening, a stance taken up short of MP. */
  triesToUse: 598,
  /**
   * "<TARGET> performs a cunning counterattack!" — said for a stance's
   * counter, **INFERRED** from its words: which line the redirection's notes
   * 3 and 4 (`func_ov000_0215ff50`) say is not read.
   */
  counters: 440,
  /**
   * "But <ACTOR> leaps in to take the attack in <TARGET>'s place." — said for
   * the cover, **INFERRED** from its words: which line its notes 6 to 8
   * (`func_ov000_0215ff20`) say is not read.
   */
  takesPlace: 126,
  /**
   * Pincushion's prick (`func_ov024_021e62cc`, by `func_ov024_021da644`):
   * at one of the party "<ACTOR> takes <val_1> points of damage.", at a
   * monster "Does <val_1> points of damage to <ACTOR>.".
   */
  prickedParty: 0x1b4,
  prickedFoe: 0x22b,
  /** Changes of state. */
  unaffected: 27,
  defenceUpMuch: 0x3a,
  defenceDownMuch: 0x3b,
  defenceUp: 60,
  defenceDown: 61,
  defenceNormal: 62,
  attackUpMuch: 0x47,
  attackDownMuch: 0x48,
  attackUp: 0x49,
  attackDown: 0x4a,
  attackNormal: 0x4b,
  agilityUpMuch: 0x4c,
  agilityDownMuch: 0x4d,
  poisoned: 63,
  fallsAsleep: 65,
  alreadyAsleep: 67,
  isAsleep: 68,
  /** "<TARGET>'s tension returns to normal." — `func_ov024_021e8cfc`. */
  tensionNormal: 0x25c,
  agilityUp: 78,
  agilityDown: 79,
  agilityNormal: 80,
  alreadyPoisoned: 82,
  /** Choir of Angels': "…is healed by the soothing song." and "…is alleviated of all unfortunate effects." */
  soothingSong: 0x1ba,
  alleviated: 0x1bb,
  /** "<TARGET> becomes envenomated." / "…even more envenomated." — `func_ov024_021e939c`. */
  envenomed: 0x10a,
  envenomedAgain: 0x10c,
  /** Magical might's, `func_ov024_021e9904`. */
  mightUpMuch: 0xd0,
  mightUp: 0xd1,
  mightDown: 0x1b5,
  mightDownMuch: 0x1b6,
  mightNormal: 0x1b7,
  /** Magical mending's — raised only; a fall says nothing (`func_ov024_021e9990`). */
  mendingUpMuch: 0xc4,
  mendingUp: 0xc5,
  /** The resistance to spells', `func_ov024_021e97f4`. */
  spellsUpMuch: 0xab,
  spellsUp: 0xac,
  spellsDown: 0xad,
  spellsNormal: 0xae,
  spellsDownMuch: 0xaf,
  /** The resistance to breaths', kind 23's own (`0x021ddb5c`–`0x021ddb98`, the pool at `0x021ddc74`). */
  breathsDown: 0x1ae,
  breathsNormal: 0x1af,
  breathsUpMuch: 0x1b0,
  breathsUp: 0x1b1,
  /** "<TARGET> is no longer poisoned." — Squelch's, `0x021dbcc8`. */
  cured: 0x54,
  /** "<TARGET> wakes up." — kind 9's, `0x021dbf9c`. */
  wokenUp: 0x40,
  /** "<TARGET> remains lifeless." — a raising that did not land, `0x021dd498`. */
  lifeless: 0x21,
  /** "<TARGET> is killed." — kind 17's at a monster, and death riding on a blow. */
  killed: 0x45,
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

/**
 * **A level's line, by the level it came to** (`func_ov024_021e94c4`): raised
 * to 2 "increases a lot", to 0 "returns to normal", else "a little"; lowered
 * to −2 "decreases a lot", to 0 normal, else a little — attack's `0x47`–`0x4b`,
 * defence's `0x3a`–`0x3e`, agility's `0x4c`–`0x50`. Magical might's
 * (`func_ov024_021e9904`) and the resistance to spells' (`021e97f4`) go the
 * same way. Two have their own: magical mending's says only a raising, "a
 * lot" at 2 and "a little" else, and nothing for a fall (`021e9990`); the
 * resistance to breaths' has no "a lot" for a fall (kind 23's own,
 * `0x021ddb40`–`0x021ddb98`). 0 is no line.
 */
function levelSays(stat: LevelStat, up: boolean, level: number): number {
  // Immense Defence's and Tap Dance's say their records' own lines — see `changeSays`.
  if (stat === 'shield' || stat === 'evasion') return 0
  if (stat === 'mending') {
    if (!up) return 0
    return level === 2 ? ACTION_SAYS.mendingUpMuch : ACTION_SAYS.mendingUp
  }
  if (stat === 'breaths') {
    if (level === 0) return ACTION_SAYS.breathsNormal
    if (up) return level === 2 ? ACTION_SAYS.breathsUpMuch : ACTION_SAYS.breathsUp
    return ACTION_SAYS.breathsDown
  }
  const lines = {
    attack: [
      ACTION_SAYS.attackUpMuch,
      ACTION_SAYS.attackDownMuch,
      ACTION_SAYS.attackUp,
      ACTION_SAYS.attackDown,
      ACTION_SAYS.attackNormal,
    ],
    defence: [
      ACTION_SAYS.defenceUpMuch,
      ACTION_SAYS.defenceDownMuch,
      ACTION_SAYS.defenceUp,
      ACTION_SAYS.defenceDown,
      ACTION_SAYS.defenceNormal,
    ],
    agility: [
      ACTION_SAYS.agilityUpMuch,
      ACTION_SAYS.agilityDownMuch,
      ACTION_SAYS.agilityUp,
      ACTION_SAYS.agilityDown,
      ACTION_SAYS.agilityNormal,
    ],
    might: [
      ACTION_SAYS.mightUpMuch,
      ACTION_SAYS.mightDownMuch,
      ACTION_SAYS.mightUp,
      ACTION_SAYS.mightDown,
      ACTION_SAYS.mightNormal,
    ],
    spells: [
      ACTION_SAYS.spellsUpMuch,
      ACTION_SAYS.spellsDownMuch,
      ACTION_SAYS.spellsUp,
      ACTION_SAYS.spellsDown,
      ACTION_SAYS.spellsNormal,
    ],
  }[stat]
  if (level === 0) return lines[4] as number
  if (up) return (level === 2 ? lines[0] : lines[2]) as number
  return (level === -2 ? lines[1] : lines[3]) as number
}

/**
 * What a change's result says in `actmsg`, by what it changes — the level
 * lines by the level reached, and where the record has its own lines (`Told
 * .lines`), its done, failed and killing lines by whom it reached.
 */
function changeSays(
  kind: ChangeKind,
  hit: ChangeHit,
  told: Told | undefined,
  targetParty: boolean,
): number {
  const own = told?.lines
  const pick = (pair: readonly [number, number] | undefined, otherwise: number) =>
    (pair && (targetParty ? pair[0] : pair[1])) || otherwise
  const stat =
    hit.stat ?? (LEVEL_STATS.includes(kind as LevelStat) ? (kind as LevelStat) : undefined)
  switch (hit.result) {
    case 'asleep':
      return ACTION_SAYS.fallsAsleep
    case 'poisoned':
      return ACTION_SAYS.poisoned
    case 'envenomed':
      return ACTION_SAYS.envenomed
    case 'raised':
    case 'lowered':
      // Immense Defence and Tap Dance (`0x021dedd8`–`0x021dedf4`,
      // `0x021ddea0`–`0x021ddebc`): the record's done line, whatever the level.
      if (stat === 'shield' || stat === 'evasion') return pick(own?.done, ACTION_SAYS.unaffected)
      return stat
        ? levelSays(stat, hit.result === 'raised', hit.level ?? (hit.result === 'raised' ? 1 : -1))
        : ACTION_SAYS.unaffected
    case 'already':
      return kind === 'sleep'
        ? ACTION_SAYS.alreadyAsleep
        : kind === 'poison'
          ? ACTION_SAYS.alreadyPoisoned
          : // Spooky Aura landed on one already at the bottom: "But nothing
            // happens" (`func_ov024_021e97f4`, `0x021e98a0`).
            kind === 'spells' && hit.lowering
            ? ACTION_SAYS.nothingHappens
            : pick(own?.failed, ACTION_SAYS.unaffected)
    case 'resisted':
      // One already dazzled of its sort, missed: "already has sand in …" and
      // the like (`func_ov024_021e9198` with 0).
      if (kind === 'dazzle' && hit.again) return DAZZLED_ALREADY[hit.level ?? 0] ?? 0
      return pick(own?.failed, ACTION_SAYS.unaffected)
    case 'dodged':
      return ACTION_SAYS.dodges
    case 'cured':
      return ACTION_SAYS.cured
    case 'woke':
      return ACTION_SAYS.wokenUp
    case 'revived':
      return pick(own?.done, 32)
    case 'lifeless':
      return ACTION_SAYS.lifeless
    case 'killed':
      return pick(own?.killed, targetParty ? ACTION_SAYS.dies : ACTION_SAYS.killed)
    // Alma Mater's: "…'s heavenly protection keeps the reaper at bay for
    // now" (`0x021dd124`; the death rider's INFERRED the same, `0x021e4f8c`).
    case 'spared':
      return 0xc8
    case 'restored':
      return ACTION_SAYS.healed
    case 'fizzled':
      return hit.again
        ? targetParty
          ? ACTION_SAYS.furtherFizzledParty
          : ACTION_SAYS.furtherFizzledFoe
        : pick(own?.done, 23)
    case 'unparalysed':
      return pick(own?.done, ACTION_SAYS.unparalysed)
    case 'relieved':
      // INFERRED: Wave of Relief's handler says nothing of its own
      // (`func_ov024_021df1e8`); its record's lines stand — "is alleviated of
      // all unfortunate effects" done, "But nothing happens" failed.
      return hit.cured ? pick(own?.done, ACTION_SAYS.alleviated) : pick(own?.failed, 31)
    // The coups' own: each its record's done line — 0 Zone's 520, Rough 'n'
    // Tumble's 518, Spelly Breath's 106, Itemised Kill's 519, Voice of
    // Experience's 517 (`func_ov024_021da644` on `+0x20`, `+0x24`).
    case 'zeroZoned':
    case 'tumbling':
    case 'replenished':
    case 'looted':
    case 'experienced':
    // Right as Rain's and Focus Pocus's: their records' done lines
    // (`0x021e0204`–`0x021e0220`, `0x021e26d8`–`0x021e26f4`); dazzle's,
    // on one already of its sort, "is dazzled even more deeply" and the like
    // (`func_ov024_021e9198` with 1).
    case 'given':
      if (kind === 'dazzle' && hit.again) return DAZZLED_MORE[hit.level ?? 0] ?? 0
      return pick(own?.done, ACTION_SAYS.nothingHappens)
    // Kind 10's own done line — none for Disco Tech; from a blow, rider 1's
    // by the lost turn's kind: 2 "is knocked clean off its feet" (`0x150`), 5
    // "is stricken with terror" (`0x5e`), any other none (`0x021e2e0c`).
    // Knight Watch's handler says nothing of its own (`021e1de8`): its opening alone.
    case 'watched':
      return 0
    // Disruptive Wave's own result has no line (`0x021e0324`–`0x021e0370`):
    // the resolver says one for all after — see the page's `dispelled`.
    case 'dispelled':
      return 0
    // H-Pathy's and M-Pathy's: the record's done line (`0x021dc790`,
    // `0x021dc5d0`) — 22, "…'s wounds are healed"; 106, "…'s MP are replenished".
    case 'shared':
    // Mens Sana's (`0x021df630`–`0x021df66c`): its record's done line.
    case 'eradicated':
      return pick(own?.done, ACTION_SAYS.alleviated)
    // Rider 11's (`func_ov024_021e9464` with 1): "is paralysed!" (`0x1e`), or
    // on one already, "is frozen even further" (`0x6e`).
    case 'paralysed':
      return hit.again ? 0x6e : 0x1e
    case 'stunned':
      return kind === 'stun'
        ? pick(own?.done, 0)
        : hit.status === 2
          ? 0x150
          : hit.status === 5
            ? 0x5e
            : 0
    // Brownie Boost's lines are each level's — see `boostSays`; the first here.
    case 'boosted': {
      const first = hit.boosts?.[0]
      return first ? levelSays(first.stat, true, first.level) : ACTION_SAYS.nothingHappens
    }
  }
}

/**
 * **A pass turned back** (`func_ov024_021e9f68`): Bounce notes it with 1
 * (`0x021ea054`), and **INFERRED** the line is 169, "The wall of light
 * deflects the spell" — 169 and 170 are its two, and which is said is not
 * read; Reverse Cycle notes it with 2 (`0x021ea140`), whose line is not
 * found, and says none here.
 */
function turnedSays(
  scene: Pick<BattleScene, 'words'>,
  hit: { readonly turned?: 'bounce' | 'reverse' },
): (string | undefined)[] {
  return hit.turned === 'bounce' ? [say(scene, 'actions', 169, {})] : []
}
const TURNED_OURS = {
  bounce: 'The wall of light deflects the spell.',
  reverse: 'The breath is turned back.',
} as const

/**
 * **Dazzle's lines for one already of its sort** (`func_ov024_021e9198`), by
 * the sort — 1 hallucinating, 2 dazzled, 3 sand, 4 ink: landed, and missed.
 */
const DAZZLED_MORE: Readonly<Record<number, number>> = { 1: 0x26, 2: 0x140, 3: 0x126, 4: 0x13d }
const DAZZLED_ALREADY: Readonly<Record<number, number>> = {
  1: 0x27,
  2: 0x141,
  3: 0x137,
  4: 0x13f,
}

/**
 * **Brownie Boost's lines** — one for each level it moved, in its order:
 * defence's by `func_ov024_021e95d4`, the resistance to breaths' by its own
 * pool (`0x021e1fb4`–`0x021e1fcc`: `0x1b0` at 2, `0x1af` at 0, else
 * `0x1b1`), attack's by `021e94c4` — each `levelSays`'s.
 */
function boostSays(hit: ChangeHit): number[] {
  return (hit.boosts ?? []).map((b) => levelSays(b.stat, true, b.level))
}

/** A level's name, in ours. */
const STAT_NAMES: Readonly<Record<string, string>> = {
  fizzled: 'Fizzle',
  rain: 'Right as Rain',
  vanish: 'Vanish',
  vanished: 'Vanish',
  bounce: 'Bounce',
  reverse: 'Reverse Cycle',
  dazzle: 'dazzle',
  dazzled: 'dazzle',
  schizofanic: 'Schizofanic',
  rotstop: 'Rotstopper',
  alma: 'Alma Mater',
  holy: 'Holy Impregnable',
  mist: 'Mist Me',
  focus: 'Focus Pocus',
  might: 'magical might',
  mending: 'magical mending',
  spells: 'resistance to spells',
  breaths: 'resistance to breath attacks',
  shield: 'ability to block with a shield',
  evasion: 'evasion',
}

/** The same, in ours. */
function changeOurs(kind: ChangeKind, hit: ChangeHit, whom: string): string {
  const stat = STAT_NAMES[hit.stat ?? kind] ?? hit.stat ?? kind
  switch (hit.result) {
    case 'asleep':
      return `${whom} falls asleep.`
    case 'poisoned':
      return `${whom} is poisoned.`
    case 'envenomed':
      return `${whom} is envenomated.`
    case 'raised':
      return `${whom}'s ${stat} rises.`
    case 'lowered':
      return `${whom}'s ${stat} falls.`
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
    case 'cured':
      return `${whom} is no longer poisoned.`
    case 'woke':
      return `${whom} wakes up.`
    case 'revived':
      return `${whom} returns to life!`
    case 'lifeless':
      return `${whom} remains lifeless.`
    case 'killed':
      return `${whom} is killed.`
    case 'spared':
      return `${whom}'s heavenly protection keeps the reaper at bay for now.`
    case 'restored':
      return hit.cured
        ? `${whom} recovers ${hit.hp ?? 0} HP, and is rid of all misfortune.`
        : `${whom} recovers ${hit.hp ?? 0} HP.`
    case 'relieved':
      return hit.cured ? `${whom} is rid of all misfortune.` : 'But nothing happens.'
    case 'fizzled':
      return hit.again
        ? `${whom} is further prevented from casting spells.`
        : `${whom} is prevented from casting spells.`
    case 'unparalysed':
      return `${whom} is no longer paralysed.`
    case 'zeroZoned':
      return `${whom} can now cast spells without spending any MP!`
    case 'tumbling':
      return `${whom} finds it much easier to dodge and to counter.`
    case 'given':
      return `${whom} is under ${stat}.`
    case 'boosted':
      return (hit.boosts ?? [])
        .map((b) => `${whom}'s ${STAT_NAMES[b.stat] ?? b.stat} rises.`)
        .join(' ')
    case 'replenished':
      return `${whom}'s MP are replenished.`
    case 'looted':
      return `Guaranteed loot from ${whom}!`
    case 'experienced':
      return `The party will earn ${(hit.multiplier ?? 1).toFixed(1)} times more experience than normal for this battle.`
    case 'stunned':
      return `${whom} cannot move!`
    case 'watched':
      return `${whom} is watched.`
    case 'dispelled':
      return `All magical effects cast on ${whom} are removed.`
    case 'eradicated':
      return `All unfortunate effects affecting ${whom} are eradicated.`
    case 'shared':
      return hit.hp !== undefined
        ? `${whom} recovers ${hit.hp} HP.`
        : `${whom} recovers ${hit.mp ?? 0} MP.`
    case 'paralysed':
      return hit.again ? `${whom} is frozen even further.` : `${whom} is paralysed!`
  }
}

/**
 * **A level worn off after its holder's action** — the lines
 * `func_ov000_0215858c` hands each one as it wears it off
 * (`0x02158da4`–`0x02158db8`, and `0x1d4` at `0x02159528`): "<ACTOR>'s
 * attack returns to normal" and the like; 0 Zone's `0x1c5` (`0x021596f0`),
 * Rough 'n' Tumble's `0x1da` (`0x02159788`).
 */
const WORN_OFF: Readonly<
  Record<
    | LevelStat
    | 'fizzled'
    | 'dazzled'
    | 'vanished'
    | 'bounce'
    | 'reverse'
    | 'rotstop'
    | 'alma'
    | 'holy'
    | 'zeroZone'
    | 'tumble'
    | 'watched'
    | 'rain'
    | 'focus',
    number
  >
> = {
  fizzled: 0x1d6,
  // Dazzle's, `0x1c7` (`0x021587d4`).
  dazzled: 0x1c7,
  // Vanish's, `0x1c9` (`0x0215899c`); Rotstopper's, `0x1d8` (`0x02158acc`).
  vanished: 0x1c9,
  rotstop: 0x1d8,
  // Bounce's, `0x1c3` (`0x02158904`); Reverse Cycle's, `0x1c4` (`0x02158b64`).
  bounce: 0x1c3,
  reverse: 0x1c4,
  // Alma Mater's, `0x1cb` (`0x02158bfc`); Holy Impregnable's, `0x25d` (`0x02158e58`).
  alma: 0x1cb,
  holy: 0x25d,
  // Worn off at the round's end (`func_ov000_02157e1c`): Focus Pocus's
  // `0x1c8` (`0x02157f88`), Right as Rain's `0x24c` (`0x02158040`).
  focus: 0x1c8,
  rain: 0x24c,
  // Knight Watch's, `0x164` (`0x021586ac`, `0x0215873c`).
  watched: 0x164,
  zeroZone: 0x1c5,
  tumble: 0x1da,
  attack: 0x1ce,
  defence: 0x1cf,
  agility: 0x1db,
  might: 0x1d1,
  mending: 0x1d2,
  spells: 0x1d3,
  breaths: 0x1d4,
  // Immense Defence's, `0x1d5` (`0x021595c0`); Tap Dance's, `0x1d9` (`0x02159658`).
  shield: 0x1d5,
  evasion: 0x1d9,
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
  /** "<TARGET> learns a new spell: <str_2>!" — one a spell the levels brought (sub-state 10). */
  newSpell: 12,
  /** The skill-point screen explained, the first time it opens (sub-state 8, flag `0x119c`). */
  skillsFirst: 36,
  gold: 16,
  /** A monster's drop: "<M_NAME> drops a treasure chest! <TARGET> opens it up." */
  dropsChest: 17,
  /**
   * What the chest holds: "It contains <I_NAME>! <TARGET> puts it in the bag."
   * 18 says the same and ends "greedily grabs the loot!"; what chooses between
   * them is not established, and 19 is the one used here.
   */
  chestHolds: 19,
  /** Autofilch's: "<DEF_ART_ACTOR> manages to steal <INDEF_ART_SGL_I_NAME>!" — a drop of the further passes. */
  steals: 37,
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
  /** Its own lines, by whom it reaches — the record's (`Action.lines`), where told. */
  readonly lines?: {
    readonly done: readonly [number, number]
    readonly failed: readonly [number, number]
    readonly killed: readonly [number, number]
  }
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
    /** A spell, a breath — `+0x10` bits 0 and 2. */
    readonly spell?: boolean
    readonly breath?: boolean
    readonly evadable: boolean
    readonly defendable?: boolean
    readonly combos?: boolean
    readonly tensed?: boolean
    readonly kind?: number
    readonly blockable?: boolean
    /** Whether a dazzled striker may miss it — `+0x10` bit 3. */
    readonly spoiltBySight?: boolean
    readonly reflectable?: boolean
    /** Whether a stance counters it and an ally may take it — `+0x10` bits 7 and 12; taken up as the round begins, `+0x08` bit 28. */
    readonly counterable?: boolean
    readonly coverable?: boolean
    readonly atRoundStart?: boolean
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
    /** The levels its rider moves, `+0x32`. */
    readonly riderLevels?: number
    /** Whether a metal body zeroes its blow, `+0x10` bit 24. */
    readonly worksOnMetal?: boolean
    /** How its accuracy comes, the party's least and most, and what scales it — see the loader's. */
    readonly accuracyMode?: number
    readonly accuracyRange?: { readonly min: number; readonly max: number }
    readonly scalesBy?: 'might' | 'mending'
    readonly scaleRange?: { readonly lo: number; readonly hi: number }
  }
  /** Its own lines, by whom it reaches — see `Told.lines`. */
  readonly lines?: Told['lines']
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
/** The post-step that spends gold — Gold Rush's (`data_ov024_021ff3f8` slot 6). */
const GOLD_STEP = 6

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
      // A spell, a breath: what the target's resistances to them lessen (`+0x10` bits 0 and 2).
      ...(action.rolls?.spell ? { magic: true } : {}),
      ...(action.rolls?.breath ? { breath: true } : {}),
      // What a wall of light turns back (`+0x10` bit 10).
      ...(action.rolls?.reflectable ? { reflectable: true } : {}),
      // What an ally may take in its target's place (`+0x10` bit 12).
      ...(action.rolls?.coverable ? { coverable: true } : {}),
      // Gold Rush: post-step 6 spends its record's `+0x32` in gold (`func_ov024_021e5be4`).
      ...(action.rolls?.afterStep === GOLD_STEP ? { gold: action.rolls.riderLevels } : {}),
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
): Pick<Changing, 'change' | 'side' | 'evadable' | 'haywire' | 'element' | 'coverable'> {
  if (!rolls) return changes
  const chance = rolls.chanceIsAccuracy ? rolls.foeChance : 100
  const { change } = changes
  const levels = Math.max(-2, Math.min(2, rolls.levels))
  return {
    side: changes.side,
    change:
      change.kind === 'attack' || change.kind === 'defence' || change.kind === 'agility'
        ? { ...change, chance, by: levels === 0 ? change.by : levels }
        : { ...change, chance },
    evadable: rolls.evadable,
    haywire: rolls.haywire,
    ...(rolls.criticalPercent === undefined ? {} : { criticalPercent: rolls.criticalPercent }),
    ...(rolls.landingElement ? { element: rolls.landingElement } : {}),
    ...(rolls.coverable ? { coverable: true } : {}),
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
      // Its rider's levels above 0 make it envenomation (`0x021e309c`) — 275's are 1.
      const envenoms = (action?.rolls?.riderLevels ?? 0) > 0
      return { kind: 'attack', poison: own, ...(envenoms ? { envenoms: true } : {}) }
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
  /** Rows set from Misc.'s Line-Up, by fighter — true the Back Line — for the caller to keep. */
  readonly lines: ReadonlyMap<number, boolean>
  /** Weapons changed from Misc.'s Equipment, in order, for the caller to apply to its bag and members. */
  readonly armed: readonly Armed[]
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
    /** The party's gold, which Gold Rush spends — see the sim's `BattleState.purse`. */
    readonly purse?: number
    /** The monsters' own spells and changes of state, by action, to tell them by. */
    readonly known?: ReadonlyMap<number, Told>
    readonly words?: BattleWords
    readonly names?: readonly Named[]
  },
): BattleScene {
  const started = startBattle(fighters, options.canFlee, options.opening)
  const wounded = options.hp ? withHp(started, options.hp) : started
  const kept = options.mp ? withMp(wounded, options.mp) : wounded
  const state = options.purse === undefined ? kept : { ...kept, purse: options.purse }
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
    lines: new Map(),
    armed: [],
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

type WordFile = Exclude<keyof BattleWords, 'articles' | 'standard' | 'examine'>

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

/**
 * "The mist surrounding <TARGET> absorbs the attack and disperses." — actmsg
 * `0x1b9`, INFERRED as Mist Me's taking of a blow by its words: where the
 * game says it is not found. Schizofanic's taking of one says the miss line,
 * INFERRED likewise — no line of its own is found.
 */
const MIST_ABSORBS = 0x1b9

/** Whether one is of the party. */
const party = (state: BattleState, i: number) => state.fighters[i]?.side === 'party'

/**
 * **A blow missed by a dazzled striker** — its handler handed a miss
 * (`0x021ec868` on) says its record's fail line, the plain Attack's 4 at one
 * of the party and 7 at a monster: "Miss! … takes no damage". INFERRED for a
 * blow other than the Attack: that its kind's handler says its own.
 */
function missSays(
  told: { readonly lines?: { readonly failed: readonly [number, number] } } | undefined,
  targetParty: boolean,
): number {
  const own = told?.lines?.failed
  return (own && (targetParty ? own[0] : own[1])) || (targetParty ? 4 : 7)
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
      // A blow taken in another's place, or struck back by a stance: the
      // blow as it was aimed first, then who took it or struck back.
      const from = event.countered?.from
      const turned =
        event.countered && from !== undefined
          ? [
              say(scene, 'actions', ACTION_SAYS.attacks, {
                actor: scene.names[from],
                target: actor,
              }),
              say(scene, 'actions', ACTION_SAYS.counters, { target: actor }),
            ]
          : event.covered
            ? [
                say(scene, 'actions', ACTION_SAYS.attacks, {
                  actor,
                  target: scene.names[event.covered.for],
                }),
                say(scene, 'actions', ACTION_SAYS.takesPlace, {
                  actor: target,
                  target: scene.names[event.covered.for],
                }),
              ]
            : [say(scene, 'actions', ACTION_SAYS.attacks, { actor, target })]
      const game = lines(
        ...turned,
        ...(event.absorbed === 'mist'
          ? [say(scene, 'actions', MIST_ABSORBS, { actor, target })]
          : event.missed
            ? [
                say(scene, 'actions', missSays(undefined, party(state, event.target)), {
                  actor,
                  target,
                }),
              ]
            : event.dodged
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
                      ? [
                          say(
                            scene,
                            'actions',
                            event.envenomed === 'again'
                              ? ACTION_SAYS.envenomedAgain
                              : event.envenomed
                                ? ACTION_SAYS.envenomed
                                : ACTION_SAYS.poisoned,
                            { target },
                          ),
                        ]
                      : []),
                  ]),
      )
      if (game !== undefined) return game
      const ours =
        from !== undefined
          ? [`${labels[from] ?? '?'} attacks!`, `${who} performs a cunning counterattack!`]
          : event.covered
            ? [
                `${who} attacks!`,
                `But ${whom} leaps in to take the attack in ${labels[event.covered.for] ?? '?'}'s place.`,
              ]
            : [`${who} attacks!`]
      if (event.absorbed === 'mist')
        ours.push(`The mist surrounding ${whom} absorbs the attack and disperses.`)
      else if (event.missed) ours.push(`Miss! ${whom} takes no damage.`)
      else if (event.dodged) ours.push(`${whom} dodges out of the way!`)
      else if (event.blocked) ours.push(`${whom} blocks the blow with a shield!`)
      else {
        if (event.critical) ours.push('A critical hit!')
        ours.push(
          event.damage > 0 ? `${whom} takes ${event.damage} damage.` : `${whom} takes no damage.`,
        )
        if (event.poisoned)
          ours.push(event.envenomed ? `${whom} is envenomated.` : `${whom} is poisoned.`)
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
        if (hit.absorbed === 'mist') return [say(scene, 'actions', MIST_ABSORBS, { actor, target })]
        if (hit.missed) {
          return [
            say(scene, 'actions', missSays(told, party(state, hit.target)), { actor, target }),
          ]
        }
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
          // What rode on it — its line by what it came to (`func_ov024_021e939c`
          // and the level riders' `021e94c4`).
          ...(hit.rode &&
          changeSays('poison', hit.rode, told, state.fighters[hit.target]?.side === 'party') !== 0
            ? [
                say(
                  scene,
                  'actions',
                  changeSays(
                    'poison',
                    hit.rode,
                    told,
                    state.fighters[hit.target]?.side === 'party',
                  ),
                  { actor, target },
                ),
              ]
            : []),
          // A lost turn or paralysis takes tension away (`func_ov024_021e8cfc`).
          ...(hit.rode?.calmed
            ? [say(scene, 'actions', ACTION_SAYS.tensionNormal, { target })]
            : []),
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
          if (hit.rode) ours.push(changeOurs('poison', hit.rode, whom))
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
    case 'pricked': {
      const game = say(
        scene,
        'actions',
        party(state, event.actor) ? ACTION_SAYS.prickedParty : ACTION_SAYS.prickedFoe,
        { actor, values: { val_1: event.damage } },
      )
      return game ?? sentence(`${who} takes ${event.damage} damage from the spikes.`)
    }
    case 'stance': {
      // Its record's line (kind 0's handler); taken up short of MP, action
      // 0x3a9's — "tries to use", then "not enough MP".
      const told = scene.known.get(event.action)
      const action = told?.name ?? { name: `move ${event.action}` }
      if (event.short) {
        return (
          lines(
            say(scene, 'actions', ACTION_SAYS.triesToUse, { actor, action }),
            say(scene, 'actions', ACTION_SAYS.notEnoughMp, {}),
          ) ?? [`${who} tries to use ${action.name}.`, 'Not enough MP!'].map(sentence).join('\n')
        )
      }
      const target = event.target === undefined ? actor : scene.names[event.target]
      const game = told?.opening
        ? lines(say(scene, 'actions', told.opening, { actor, target, action }))
        : undefined
      return game ?? sentence(`${who} uses ${action.name}.`)
    }
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
      if (event.shortOfGold) {
        return (
          lines(say(scene, 'actions', ACTION_SAYS.notEnoughGold, { actor })) ?? 'Not enough gold!'
        )
      }
      if (event.fizzled) {
        return (
          lines(say(scene, 'actions', ACTION_SAYS.cannotCast, { actor, action })) ??
          sentence(`${who} tries to cast ${action.name}... but can't cast spells at the moment.`)
        )
      }
      const landed = event.hits.flatMap((hit) => [...turnedSays(scene, hit), spellHitSays(hit)])
      function spellHitSays(hit: { readonly target: number; readonly amount: number }) {
        const target = scene.names[hit.target]
        const values = { val_1: hit.amount }
        if (heals) {
          return say(scene, 'actions', chosen?.message || ACTION_SAYS.healed, { target, values })
        }
        return hit.amount > 0
          ? say(scene, 'actions', chosen?.message || ACTION_SAYS.takes, { actor, target, values })
          : say(scene, 'actions', ACTION_SAYS.noDamage, { actor, target })
      }
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
        if (hit.turned) ours.push(TURNED_OURS[hit.turned])
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
      if (event.fizzled) {
        return (
          lines(say(scene, 'actions', ACTION_SAYS.cannotCast, { actor, action })) ??
          sentence(`${who} tries to cast ${action.name}... but can't cast spells at the moment.`)
        )
      }
      const sayHit = (hit: ChangeHit) =>
        say(
          scene,
          'actions',
          changeSays(event.change, hit, told, state.fighters[hit.target]?.side === 'party'),
          { actor, target: scene.names[hit.target] },
        )
      // Choir of Angels' lines (`0x021e1468`–`0x021e1500`): healed, "the
      // soothing song" (0x1ba) and the wounds (0x16); cured, the song if not
      // yet said and 0x1bb; neither, "But nothing happens."
      const restoring = (hit: ChangeHit) => {
        const target = scene.names[hit.target]
        const out = []
        if ((hit.hp ?? 0) > 0)
          out.push(
            say(scene, 'actions', ACTION_SAYS.soothingSong, { actor, target }),
            say(scene, 'actions', ACTION_SAYS.healed, { actor, target }),
          )
        if (hit.cured) {
          if (out.length === 0)
            out.push(say(scene, 'actions', ACTION_SAYS.soothingSong, { actor, target }))
          out.push(say(scene, 'actions', ACTION_SAYS.alleviated, { actor, target }))
        }
        return out.length > 0 ? out : [say(scene, 'actions', ACTION_SAYS.nothingHappens, {})]
      }
      const landed = event.hits.flatMap((hit) => [
        ...turnedSays(scene, hit),
        ...(hit.result === 'restored'
          ? restoring(hit)
          : hit.result === 'boosted'
            ? boostSays(hit).map((line) =>
                say(scene, 'actions', line, { actor, target: scene.names[hit.target] }),
              )
            : hit.result === 'stunned'
              ? [
                  ...(changeSays(
                    event.change,
                    hit,
                    told,
                    state.fighters[hit.target]?.side === 'party',
                  )
                    ? [sayHit(hit)]
                    : []),
                  // Their tension taken away with it (`func_ov024_021e8cfc`).
                  ...(hit.calmed
                    ? [
                        say(scene, 'actions', ACTION_SAYS.tensionNormal, {
                          target: scene.names[hit.target],
                        }),
                      ]
                    : []),
                ]
              : hit.result === 'experienced'
                ? // Its line names the multiplier as `%.1f`, filled from the
                  // result's `+0x18` (`0x021eba98`).
                  [sayHit(hit)?.replace('%.1f', (hit.multiplier ?? 1).toFixed(1))]
                : // A line of 0 is none: magical mending's fall says nothing.
                  changeSays(
                      event.change,
                      hit,
                      told,
                      state.fighters[hit.target]?.side === 'party',
                    ) === 0
                  ? []
                  : [sayHit(hit)]),
      ])
      // Disruptive Wave's one line for all (`func_ov024_021e80e4`,
      // `0x021e8560`–`0x021e85d4`): `0xf1` for one, `0xf2` "… and co." for
      // more, naming the first it cleared (`+0x44`, `0x021e0318`); each one's
      // tension taken before it (`func_ov024_021e8cfc`).
      const dispelled = event.hits.filter((hit) => hit.result === 'dispelled')
      const first = dispelled[0]
      const dispelling =
        event.change === 'dispel' && first
          ? [
              ...dispelled
                .filter((hit) => hit.calmed)
                .map((hit) =>
                  say(scene, 'actions', ACTION_SAYS.tensionNormal, {
                    target: scene.names[hit.target],
                  }),
                ),
              say(scene, 'actions', dispelled.length > 1 ? 0xf2 : 0xf1, {
                actor,
                target: scene.names[first.target],
              }),
            ]
          : []
      const said = [...landed, ...dispelling]
      const game = lines(
        ...opens,
        ...(said.length > 0 ? said : [say(scene, 'actions', ACTION_SAYS.nothingHappens, {})]),
        ...(event.rode ?? []).map(sayHit),
      )
      if (game !== undefined) return game
      const ours = [
        ...ourOpening,
        ...event.hits.flatMap((hit) => [
          ...(hit.turned ? [TURNED_OURS[hit.turned]] : []),
          changeOurs(event.change, hit, labels[hit.target] ?? '?'),
        ]),
        ...(event.rode ?? []).map((hit) =>
          changeOurs(event.change, hit, labels[hit.target] ?? '?'),
        ),
      ]
      if (event.hits.length === 0) ours.push('But nothing happens.')
      return ours.map(sentence).join('\n')
    }
    case 'asleep':
      return (
        say(scene, 'actions', ACTION_SAYS.isAsleep, { actor }) ?? sentence(`${who} is fast asleep.`)
      )
    case 'stunned':
      // **Ours**: action 503, put in the lost turn's place, has no line, and
      // what the game shows for the turn is not read.
      return sentence(
        event.status === 0 ? `${who} is paralysed and cannot move!` : `${who} cannot move!`,
      )
    case 'freed':
      // Action 900's opening, 115 (`func_ov000_0215833c`, `0x021583f0`).
      return say(scene, 'actions', 115, { actor }) ?? sentence(`${who} is no longer paralysed.`)
    case 'woke':
      return say(scene, 'actions', ACTION_SAYS.wakes, { actor }) ?? sentence(`${who} wakes up.`)
    case 'primed':
      // Action 922's line (`func_ov000_0215af54`): actmsg 531.
      return (
        say(scene, 'actions', ACTION_SAYS.primed, { actor }) ??
        sentence(`${who} is primed to perform a coup de grâce!`)
      )
    case 'coupPassed':
      // The round's end, action 936: actmsg 603 (`0x02157ed0`).
      return (
        say(scene, 'actions', ACTION_SAYS.coupPassed, { target: actor }) ??
        sentence(`The moment for ${who}'s coup de grâce has passed.`)
      )
    case 'wornOff':
      return (
        say(scene, 'actions', WORN_OFF[event.stat], { actor }) ??
        sentence(`${who}'s ${STAT_NAMES[event.stat] ?? event.stat} returns to normal.`)
      )
    case 'regen':
      // **Ours**: actions 930 to 933, which tell it (`func_ov000_0215c758`),
      // have no opening and no line of their own; what the game shows is
      // not read.
      return sentence(
        event.hp !== undefined
          ? `${who} recovers ${event.hp} HP.`
          : `${who} recovers ${event.mp ?? 0} MP.`,
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
      // Egg On's ally, whom its opening names and its steps tell of.
      const raised = event.target === undefined ? actor : scene.names[event.target]
      const whose = event.target === undefined ? who : (labels[event.target] ?? '?')
      const opens = [
        ...(told?.opening
          ? [say(scene, 'actions', told.opening, { actor, target: raised, action, item: action })]
          : []),
        ...(event.outright
          ? [
              say(
                scene,
                'actions',
                // Tension Boost's own line, the same words (`0x021e1a7c`).
                event.action === TENSION_BOOST ? 0x1bc : ACTION_SAYS.tensionBoost,
                { actor },
              ),
            ]
          : []),
      ]
      const steps =
        event.steps.length === 0
          ? [say(scene, 'actions', ACTION_SAYS.nothingHappens, {})]
          : event.steps.map((step) =>
              say(
                scene,
                'actions',
                step > 0 ? (TENSION_RISES[step] ?? 0) : ACTION_SAYS.tensionFails,
                { target: raised },
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
                ? `${whose}'s tension increases to ${TENSION_SHOWN[step] ?? 0}.`
                : `But ${whose}'s tension doesn't increase to the maximum.`,
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
    case 'regen':
      return event.hp ? [{ fighter: event.actor, motion: 'heal', amount: event.hp }] : []
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
  | { readonly text: string; readonly colour: string }

/**
 * The Coup de Grâce's word by its state (`func_ov000_02176500`, `021707f0`):
 * greyed while not ready; on the last round it is held, orange — the label's
 * (28, 12, 3) of 31. **Ours**: the label's pulse, and its grey, which is
 * palette colour 3, not read.
 */
export const COUP_COLOURS = { greyed: '#8c8c8c', last: 'rgb(230 99 25)' } as const

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
    case 'member': {
      // Drawn row by row from the grid, the cursor on the command's place.
      const m = c.members[s.member]
      const primed = m ? scene.state.fighters[m.fighter]?.primed : undefined
      return {
        rows: COMMAND_GRID.map((k) => {
          const text = word('menu', COMMAND_WORD_BASE + k) ?? MEMBER_COMMANDS[k] ?? ''
          if (MEMBER_COMMANDS[k] !== 'coup') return text
          if (!m || !coupLive(scene.state, m)) return { text, colour: COUP_COLOURS.greyed }
          return primed === 1 ? { text, colour: COUP_COLOURS.last } : text
        }),
        cursor: COMMAND_GRID.indexOf(s.cursor as never),
        columns: 2,
      }
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
    case 'examine': {
      // One page of what Examine says, naming its monster by kind.
      const page = s.pages[s.page]
      const template = page && scene.words?.examine?.get(page.line)
      const { letter: _, ...name } = (page && scene.names[page.monster]) ?? { name: '?' }
      const text =
        template === undefined
          ? `(str_ex2 ${page?.line})`
          : tellBattle(
              template,
              {
                monsters: [name],
                solo: scene.state.fighters.filter((f) => f.side === 'party').length === 1,
              },
              scene.words?.articles ?? new Map(),
            ).text
      return { rows: [text], cursor: -1, columns: 1 }
    }
    case 'armsWho':
      return {
        rows: armsMembers(c).map((k) => c.members[k]?.name ?? '?'),
        cursor: s.cursor,
        columns: 1,
      }
    case 'armsKind':
      // One row a kind, ascending, each its word — `str_btl` 7 + kind (`func_ov000_02177f74`).
      return {
        rows: armsKinds(c.members[s.member]?.arms ?? { bag: [] }).map(
          (kind) => word('menu', COMMAND_SAYS.weaponKinds + kind) ?? `kind ${kind}`,
        ),
        cursor: s.cursor,
        columns: 1,
      }
    case 'armsWeapon':
      return {
        rows: armsOfKind(c.members[s.member]?.arms ?? { bag: [] }, s.kind).map((w) => w.name),
        cursor: s.cursor,
        columns: 1,
      }
    case 'lineUp':
      // Each member's name, then their row's word at x 70 (`func_ov000_02178648`).
      return {
        rows: c.members.map((m) => ({
          text: m.name,
          right:
            word('menu', COMMAND_SAYS.frontLine + (inBackLine(c, m) ? 1 : 0)) ??
            (inBackLine(c, m) ? 'Back Line' : 'Front Line'),
          at: 70,
        })),
        cursor: s.cursor,
        columns: 1,
      }
    case 'say': {
      // The actor is the target too, which a fallen member's lines name (21, 23).
      const actor =
        s.say.actor === undefined
          ? undefined
          : {
              name: s.say.actor,
              ...(s.say.actorGender === undefined ? {} : { gender: s.say.actorGender }),
            }
      const named = actor === undefined ? {} : { actor, target: actor }
      const str2 = s.say.str2 === undefined ? undefined : word('menu', s.say.str2)
      const text = say(scene, 'menu', s.say.number, {
        ...named,
        ...(s.say.item === undefined ? {} : { item: s.say.item }),
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
      // Examine's coin is the world's draw, so that looking moves nothing in a
      // battle's replay (`W(100)`, `0x0217e264`).
      const next = chooseCommand(scene.state, c, () => scene.world?.below(100) ?? 0)
      const tactics =
        next.tactics.size > 0 ? new Map([...scene.tactics, ...next.tactics]) : scene.tactics
      // A row set is the member's at once: the monsters' pick this round reads it.
      const lines = next.lines.size > 0 ? new Map([...scene.lines, ...next.lines]) : scene.lines
      const rowed =
        next.lines.size > 0
          ? {
              ...scene.state,
              fighters: scene.state.fighters.map((f, i) =>
                next.lines.has(i) ? { ...f, backLine: next.lines.get(i) as boolean } : f,
              ),
            }
          : scene.state
      // A weapon changed is the wielder's at once: what it adds comes off, the
      // new one's goes on — the attack the resolver reads next (`base+0x34`).
      const changes = next.armed.slice(c.armed.length)
      const state =
        changes.length === 0
          ? rowed
          : {
              ...rowed,
              fighters: rowed.fighters.map((f, i) => {
                let out = f
                for (const { fighter, from, to } of changes) {
                  if (fighter !== i) continue
                  const add = (key: 'attack' | 'defence' | 'agility') =>
                    out[key] - (from?.[key] ?? 0) + (to?.[key] ?? 0)
                  out = {
                    ...out,
                    attack: add('attack'),
                    defence: add('defence'),
                    agility: add('agility'),
                    // A fan's coup bonus goes with it (`func_02085038` reads what is worn).
                    ...(out.coup
                      ? {
                          coup: {
                            ...out.coup,
                            bonus: out.coup.bonus - (from?.coup ?? 0) + (to?.coup ?? 0),
                          },
                        }
                      : {}),
                  }
                }
                return out
              }),
            }
      const armed = changes.length === 0 ? scene.armed : [...scene.armed, ...changes]
      if (next.step.at !== 'done')
        return { ...scene, state, commanding: next, tactics, lines, armed }
      return play({ ...scene, state, tactics, lines, armed }, commandsOf(next))
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
    ...(r.breath ? { breath: true } : {}),
    ...(r.cap ? { cap: r.cap } : {}),
    falloff: r.fallsOff ?? false,
    evadable: r.evadable,
    blockable: r.blockable ?? false,
    ...(r.spoiltBySight ? { spoiltBySight: true } : {}),
    ...(r.coverable ? { coverable: true } : {}),
    ...(r.counterable ? { counterable: true } : {}),
    defendable: r.defendable ?? false,
    tensed: r.tensed ?? false,
    combos: r.combos ?? false,
    after: r.afterStep ?? 0,
    ...(r.alwaysCritical ? { sure: true } : {}),
    ...(r.worksOnMetal ? { worksOnMetal: true } : {}),
    // What rides on each pass — the riders read (`docs/readings/T18-handlers.md` §3).
    ...(RIDERS_PLAYED.has(r.rider)
      ? {
          rider: {
            slot: r.rider,
            chance: { party: r.accuracyRange?.min ?? 0, foe: r.foeChance },
            levels: r.riderLevels ?? 0,
          },
        }
      : {}),
  }
}

/** The kinds of change the party's actions are played by — their handlers' (`data_ov024_021ff508`). */
const CHANGE_KINDS: ReadonlyMap<number, Change['kind']> = new Map<number, Change['kind']>([
  [3, 'attack'],
  [4, 'defence'],
  [5, 'agility'],
  [7, 'cure'],
  [8, 'sleep'],
  [9, 'wake'],
  // Antimagic (`021dced0`); Tingle (`021dd6f0`).
  [16, 'fizzle'],
  [20, 'unparalyse'],
  [17, 'kill'],
  [18, 'revive'],
  // Wizard Ward, Spooky Aura (`021dd968`); Insulate, Insulatle, Mind Over
  // Matter (`021ddaa0`); Care Prayer (`021dee84`); Wave of Relief
  // (`021df1e8`); Channel Anger, Caster Sugar (`021df284`).
  [22, 'spells'],
  [23, 'breaths'],
  [38, 'mending'],
  [41, 'relieve'],
  [42, 'might'],
  [67, 'restore'],
  // Right as Rain (`021e01b8`) and Focus Pocus (`021e268c`): a status, what
  // it does at the round's end.
  [48, 'rain'],
  // Vanish (`021e093c`): halved in a monster's weighted pick.
  [54, 'vanish'],
  // Flower Power, Scandal Eyes (`021dd534`): dazzle, of the record's sort.
  [19, 'dazzle'],
  // Rotstopper (`021df0f0`): a monster of family 8's halved.
  [40, 'rotstop'],
  // Alma Mater (`021deff8`): kept from the reaper at 1 HP, once.
  [39, 'alma'],
  // Tap Dance (`021dde08`): evasion, a level; Immense Defence (`021ded48`): a
  // shield's block, a level — each doubling while it holds.
  [25, 'evasion'],
  [37, 'shield'],
  // Disruptive Wave (`021e02b0`): everything magical cleared.
  [49, 'dispel'],
  // Mens Sana (`021df454`): what is unfortunate cleared.
  [43, 'sound'],
  // Bounce, Magic Mirror (`021de678`) and Reverse Cycle (`021de770`): a pass
  // turned back on its actor.
  [31, 'bounce'],
  [32, 'reverse'],
  // M-Pathy (`021dc540`) and H-Pathy (`021dc700`): the user's own MP or HP shared.
  [13, 'pathy'],
  [14, 'pathy'],
  // Holy Impregnable (`021e1120`): 25 less taken of the ailments' elements.
  [64, 'holy'],
  // Schizofanic (`021dec50`) and Mist Me (`021e0a50`): a decoy against one blow.
  [36, 'schizofanic'],
  [55, 'mist'],
  [78, 'focus'],
  // The coups (`docs/readings/T18-handlers.md` §10): Spelly Breath
  // (`021ddf5c`), 0 Zone (`021e1580`), Itemised Kill (`021e16a4`), Rough 'n'
  // Tumble (`021e1824`), Voice of Experience (`021e1cbc`), Brownie Boost
  // (`021e1ed4`).
  // Kind 10 (`021dc0b8`): War Cry, Pratfall, Trip of a Deathtime, and the
  // coups Roaring Tirade and Disco Tech — a lost turn by rider 1.
  [10, 'stun'],
  [26, 'replenish'],
  [68, 'zeroZone'],
  [69, 'loot'],
  [70, 'tumble'],
  [72, 'experience'],
  [73, 'watch'],
  [74, 'boost'],
])
/** The Gladiator's coup, Tension Boost: straight to the maximum, each level told (`func_ov024_021e191c`). */
export const TENSION_BOOST = 511
/** Zing and the Zing stick, whose share scales by mending; Kazing, whose is a half (`func_ov024_021dd278`). */
const ZING = new Set([38, 84])
const KAZING = 39
const CHANGE_REACHES = new Map<number, Changing['reach']>([
  [ActionReach.Actor, 'one'],
  [ActionReach.One, 'one'],
  [ActionReach.Group, 'group'],
  [ActionReach.All, 'all'],
  // An ally other than oneself — Egg On's, M-Pathy's.
  [8, 'one'],
])

/**
 * **One of the party's actions that changes state**, as the battle plays it —
 * by its kind's handler (task 18, `docs/readings/T18-handlers.md` §2): a level
 * of attack, defence or agility moved by its record's levels; sleep; poison
 * cured; a sleeper woken; all HP taken; the fallen raised. Whether it lands is
 * its accuracy — a hundred, or for one that scales the party's own between
 * its least and most (`func_ov000_02156648`). Undefined for any other kind.
 */
/**
 * **A stance**, as the battle takes it up — an action with `+0x08` bit 28
 * that the table at `0x02182e24` names (`func_ov000_021537b8`): see the
 * sim's `stances.ts`. Defend's and Blockenspiel's, 1, are played as they
 * were — Defend by its command, Blockenspiel as its blow.
 */
export function stanceOf(action: Castable): { stance: number; cost: number } | undefined {
  if (!action.rolls?.atRoundStart) return undefined
  // Pincushion: no stance of the table's, a status of its own — see the sim's `PINCUSHION`.
  if (action.action === PINCUSHION) return { stance: 0, cost: action.cost }
  const stance = STANCES.get(action.action)
  if (stance === undefined || stance === STANCE.defend) return undefined
  return { stance, cost: action.cost }
}

export function partyChangeOf(action: Castable): Changing | undefined {
  const r = action.rolls
  const kind = r?.kind === undefined ? undefined : CHANGE_KINDS.get(r.kind)
  const reach = CHANGE_REACHES.get(action.reach)
  if (!r || !kind || !reach) return undefined
  const levels = Math.max(-2, Math.min(2, r.levels))
  const change: Change = LEVEL_STATS.includes(kind as LevelStat)
    ? { kind: kind as LevelStat, by: levels, chance: 100 }
    : kind === 'restore'
      ? // Choir of Angels: 0.4 of the most HP, rounded half up, at least 75 (`0x021e1418`–`0x021e1440`).
        { kind, chance: 100, share: 0.4, least: 75 }
      : kind === 'dazzle'
        ? { kind, chance: 100, sort: r.levels }
        : kind === 'pathy'
          ? {
              kind,
              chance: 100,
              gives: r.kind === 14 ? 'hp' : 'mp',
              amount: action.range ?? { base: 0, spread: 0 },
              ...(r.tensed ? { tensed: true } : {}),
            }
          : kind === 'stun'
            ? // The lost turn's kind is the record's `+0x32`; the two coups
              // (`0x1fc`, `0x20f`) land at the maximum of tension (`func_02088418`).
              {
                kind,
                chance: 100,
                status: r.riderLevels ?? 0,
                ...(action.action === 0x1fc || action.action === 0x20f ? { coup: true } : {}),
              }
            : kind === 'revive'
              ? {
                  kind,
                  chance: 100,
                  share: ZING.has(action.action)
                    ? (r.scaleRange ?? { lo: 0, hi: 0 })
                    : action.action === KAZING
                      ? 0.5
                      : 1,
                }
              : ({ kind, chance: 100 } as Change)
  const range = r.accuracyRange
  return {
    action: action.action,
    cost: action.cost,
    change,
    reach,
    side: action.side === 1 ? 'other' : 'own',
    // A spell, `+0x10` bit 0: one fizzled cannot cast it.
    ...(r.spell ? { magic: true } : {}),
    // A breath, bit 2, and what a wall of light turns back, bit 10 — see `turnedBack`.
    ...(r.breath ? { breath: true } : {}),
    ...(r.reflectable ? { reflectable: true } : {}),
    ...(r.coverable ? { coverable: true } : {}),
    ...(r.landingElement ? { element: r.landingElement } : {}),
    ...(r.evadable ? { evadable: true } : {}),
    ...(r.spoiltBySight ? { spoiltBySight: true } : {}),
    ...(r.haywire ? { haywire: true, criticalPercent: r.criticalPercent ?? 100 } : {}),
    ...(r.accuracyMode === 1 && range
      ? {
          accuracy: {
            ...range,
            ...(r.scalesBy && r.scaleRange ? { scales: { by: r.scalesBy, ...r.scaleRange } } : {}),
          },
        }
      : {}),
    // Double Up's defence on its user (rider 8 from kind 3's handler).
    ...((r.rider === 2 || r.rider === 8) && r.riderLevels
      ? { rider: { slot: r.rider, levels: r.riderLevels } }
      : {}),
  }
}
