import type { BattleState, Command, FighterState } from './battle.ts'
import { adjustedResistance, COMBO_TABLE, GUARD_LEVELS } from './damage.ts'
import type { BattleRng } from './rng.ts'
import { buffedAttack, buffedMagic, wardMultiplier } from './states.ts'
import { TENSION_MULTIPLIERS } from './tension.ts'

/**
 * **The party's tactics** — how a member not following orders chooses, as
 * the game's code does it. Translated whole from the USA build's overlay 24,
 * read 8 October 2026 (`docs/readings/T17-ai.md` §2 and §2b, task 17b), every
 * function named by its address where it is ported.
 *
 * It is reached in two places, both only while the member's action is the
 * Attack (1), the action a member not asked keeps:
 *
 * - **the command phase** ({@link commandPhaseChoice}, `func_ov024_021f9030`
 *   from `ProcessCombatTurn` `0x0215db18`): ten actions that must be taken up
 *   before anyone acts — Knight Watch, Mercurial Thrust, Defending Champion
 *   (or Defend), Forbearance, Selflessness, Whipping Boy — by rules of their
 *   own, and **no draw**;
 * - **the member's turn** ({@link turnChoice}, `func_ov024_021f8f20` from
 *   `func_ov000_0215767c` `0x02157888`): the AI set up with the battle's own
 *   draws, every action the member could take scored, and the best taken
 *   from the tactic's lists in their order; the Attack on the weakest monster
 *   when every list is empty.
 *
 * **The arithmetic is the game's own single-precision floats**, each step
 * through `Math.fround` in its order (`CLAUDE.md`, "Fixed-point in
 * simulation"), and its two doubles held as doubles. **The AI object and the
 * scorer's frame are kept as bytes** at the game's own offsets: the scorer
 * walks one of its arrays by a count that is not that array's (`0x021f9a58`),
 * and only memory laid out as the game's comes to what the game comes to.
 *
 * **Ours, and said so** — the rest is the game's:
 *
 * - the statuses the battle does not keep read as clear: `+0x18` bits 1, 2
 *   (the fire and ice wards), 4, 6, 11 (an after-step's) and 13; `+0x14`
 *   bit 7; the second item a group's drop is sure of (`+0x17`);
 * - the one byte of the AI object the command phase reads before it writes
 *   it — the tactic of the member before (`0x021f90c4`, the object being the
 *   round's one stack slot): for the first, whatever the stack held, taken as
 *   not Mix It Up;
 * - a grotto's legacy boss's level-up ways, there being no grottoes;
 * - the groups: the monsters of one kind, in the order the battle keeps them.
 */

const f = Math.fround

/** `_ffix`: a float to a whole number, toward nothing, held to 32 bits. */
function ffix(x: number): number {
  if (x >= 2147483647) return 2147483647
  if (x <= -2147483648) return -2147483648
  return Math.trunc(x)
}

/** `_ffixu`: a float to an unsigned whole number. */
function ffixu(x: number): number {
  if (!(x > 0)) return 0
  if (x >= 4294967295) return 4294967295
  return Math.trunc(x)
}

/** `_s32_div_f`: a signed division, toward nothing. */
function sdiv(a: number, b: number): number {
  return b === 0 ? 0 : Math.trunc(a / b)
}

// ---------------------------------------------------------------------------
// What the AI is handed

/** A range record, as the AI reads it (`func_02079ee0`): word 0 bits 8–17, word 1 bits 10–19 and 20–29. */
export interface AiRange {
  readonly spread: number
  readonly party: number
  readonly peak: number
}

/** An action's record — its 60 bytes — and the range its `+0x08` bits 14–21 name. */
export interface AiRecord {
  readonly raw: Uint8Array
  readonly range?: AiRange | undefined
}

/**
 * **One action a member may take**, as the AI lists it — a candidate
 * (`ai+0x178`, four bytes: the action, an item's place, a flag).
 */
export interface TacticCandidate {
  readonly action: number
  /** An item's place in the member's items; none for a spell, an ability, the coup. */
  readonly bag?: number | undefined
  /**
   * **The item list entry's `+0x08` bit 19** (`0x021f7c3c`), which costs an
   * item 30 more in the scorer, zeroes its harm under every tactic but Show
   * No Mercy, and makes a heal not count as one at hand in the command phase.
   * INFERRED: an item used up — the game's own lists set it, and what sets it
   * is not read.
   */
  readonly consumed?: boolean | undefined
  /**
   * The battle's command for it, aimed anew by the AI — see
   * {@link tacticCommand}. None where the battle cannot play it.
   */
  readonly command?: Command | undefined
}

/**
 * **What one of the party carries for their tactics** — the character
 * record's parts the AI reads.
 */
export interface MemberTactics {
  /** `+0x94c`, signed: 0 Show No Mercy, 1 Fight Wisely, 2 Mix It Up, 3 Focus On Healing, 4 Don't Use MP, 5 Follow Orders. */
  readonly tactic: number
  /** Their spells, as the battle's list has them (`func_ov000_021719c0`, `0217199c`). */
  readonly spells: readonly TacticCandidate[]
  /** Their abilities (`func_ov000_02171698`, `02171674`). */
  readonly abilities: readonly TacticCandidate[]
  /** Their items (`func_ov000_02171bc0`, `02171b9c`), each with its action and its place. */
  readonly items: readonly TacticCandidate[]
  /** Their vocation's coup de grâce (`func_ov000_02159cb4`), live while they are ready. */
  readonly coup?: TacticCandidate | undefined
  /**
   * **What they wield** — the first worn place's `itembtlprm.nat` record,
   * copied to `char + 0x2F4` (`func_ov017_021b3780`): its flags word and the
   * twelve killer bonuses in tenths; and the weapon's kind, `char + 0x29c`
   * bits 4–8 (INFERRED: the item's subtype — 3, a wand, is the one asked).
   * None, nothing held (`char + 0x2ac` not above 0).
   */
  readonly weapon?:
    | {
        readonly flags: number
        readonly killers: readonly number[]
        readonly kind: number
      }
    | undefined
  /** The skill panels they hold of those the AI asks (`func_02083b00` on `char + 0x8ec`): `0xe6`, `0x106`. */
  readonly traits?: readonly number[] | undefined
}

/** What the AI decided: an action, and whom — the command record's `+0`, `+2`, `+3`. */
export interface TacticChoice {
  readonly action: number
  /** An item's place, or −1. */
  readonly bag: number
  /** The group, or 0xff for none written. */
  readonly group: number
  /** The target's byte — a party slot, a monster's id ({@link MONSTER_ID}), or 0xff. */
  readonly target: number
}

/** A monster's id in the AI's bytes: this and its place among the fighters. */
export const MONSTER_ID = 0x40

/** The tactics, by value. */
export const TACTIC = {
  showNoMercy: 0,
  fightWisely: 1,
  mixItUp: 2,
  focusOnHealing: 3,
  dontUseMp: 4,
  followOrders: 5,
} as const

// ---------------------------------------------------------------------------
// An action's record

const word = (r: AiRecord, at: number): number =>
  ((r.raw[at] ?? 0) |
    ((r.raw[at + 1] ?? 0) << 8) |
    ((r.raw[at + 2] ?? 0) << 16) |
    ((r.raw[at + 3] ?? 0) << 24)) >>>
  0
const s16 = (r: AiRecord, at: number): number =>
  (((r.raw[at] ?? 0) | ((r.raw[at + 1] ?? 0) << 8)) << 16) >> 16

const idOf = (r: AiRecord) => word(r, 4) & 0xfff
const costOf = (r: AiRecord) => word(r, 8) & 0xff
/** `+0x08` bits 8–9: 1 aimed at the other side, 2 at one's own. */
const sideOf = (r: AiRecord) => (word(r, 8) >>> 8) & 3
const elementOf = (r: AiRecord) => (word(r, 8) >>> 22) & 31
const inBattle = (r: AiRecord) => ((word(r, 8) >>> 27) & 1) === 1
const atRoundStart = (r: AiRecord) => ((word(r, 8) >>> 28) & 1) === 1
const flags10 = (r: AiRecord) => word(r, 0x10)
const reachOf = (r: AiRecord) => word(r, 0x14) >>> 28
const riderOf = (r: AiRecord) => word(r, 0x18) & 31
const kindOf = (r: AiRecord) => (word(r, 0x18) >>> 5) & 0x7f
const listOf = (r: AiRecord) => (word(r, 0x18) >>> 12) & 15
const scaleModeOf = (r: AiRecord) => (word(r, 0x18) >>> 16) & 3
const handlerOf = (r: AiRecord) => (word(r, 0x18) >>> 18) & 0x1ff
const landingOf = (r: AiRecord) => word(r, 0x18) >>> 27
const capOf = (r: AiRecord) => word(r, 0x1c) & 0x3fff
const hitCodeOf = (r: AiRecord) => (word(r, 0x1c) >>> 14) & 31
const combos = (r: AiRecord) => ((word(r, 0x2c) >>> 27) & 1) === 1
/** `+0x08` low byte under the rider's chance: `+0x14` bits 7–13. */
const riderChanceOf = (r: AiRecord) => (word(r, 0x14) >>> 7) & 0x7f

const F10 = {
  spell: 0x1,
  dance: 0x2,
  breath: 0x4,
  defendable: 0x10,
  reflectable: 0x400,
  tensed: 0x2000,
  byMight: 0x4000,
  byMending: 0x8000,
  fallsOff: 0x20000,
  weapon: 0x40000,
  worksOnMetal: 0x1000000,
} as const

// ---------------------------------------------------------------------------
// A fighter as the AI reads it: its status's words and numbers

/** Status `+0x14`'s bits the AI asks. */
const S = {
  fallen: 1 << 0,
  poisoned: 1 << 1,
  paralysed: 1 << 3,
  asleep: 1 << 4,
  confused: 1 << 5,
  dazzled: 1 << 6,
  fizzled: 1 << 8,
  bounce: 1 << 9,
  spellWard: 1 << 16,
  breathWard: 1 << 17,
  lostTurn: 1 << 19,
  schizofanic: 1 << 20,
  mist: 1 << 21,
  alma: 1 << 22,
  tension: 1 << 23,
  tensionMost: 1 << 24,
  reverse: 1 << 26,
  vanished: 1 << 27,
  burn: 1 << 28,
  rotstop: 1 << 29,
  focus: 1 << 30,
  rain: 1 << 31,
} as const

/** Status `+0x18`'s. */
const T = {
  holy: 1 << 3,
  spiked: 1 << 5,
  fource: 1 << 7,
  twocus: 1 << 8,
  zeroZone: 1 << 9,
  tumble: 1 << 10,
} as const

interface Body {
  /** Its place among the battle's fighters. */
  readonly at: number
  /** Its byte as the AI writes it: a party slot, or {@link MONSTER_ID} and its place. */
  readonly id: number
  readonly party: boolean
  /** A monster's group, `+0x17c`. */
  readonly group: number
  readonly hp: number
  readonly maxHp: number
  readonly mp: number
  readonly maxMp: number
  /** Status `+0x08`, `+0x0a`, `+0x0c`, and `+0x10`'s two fields. */
  readonly attack: number
  readonly defence: number
  readonly agility: number
  readonly might: number
  readonly mending: number
  /** The `+0x134` record's `+0x34` and `+0x36` — `UpdateCombatantAttack`'s and `…Defense`'s bases. */
  readonly baseAttack: number
  readonly baseDefence: number
  readonly s: number
  readonly t: number
  /** `+0x22` low two bits: 1 poisoned, 2 envenomed. */
  readonly poisonKind: number
  /** `+0x22` bits 2–5: the lost turn's kind. */
  readonly lostKind: number
  /** `+0x22` bits 9–11: the Fource's sort. */
  readonly fourceSort: number
  /** `+0x58`: ten signed fields of three bits. */
  readonly levels: number
  readonly tension: number
  /** `+0x21`. */
  readonly stance: number
  /** `+0x3b` bits 4–7. */
  readonly coupCount: number
  /** `+0x3b` bit 3. */
  readonly primed: boolean
  readonly resist: readonly number[]
  /** The vocation's level (`func_0202053c`), one of the party's. */
  readonly level: number
  readonly family: number
  readonly metal: boolean
  readonly untrippable: boolean
  readonly fighter: FighterState
}

const held = (l: { readonly level: number } | undefined): boolean =>
  l !== undefined && l.level !== 0

/** A level's three bits at `+0x58`, signed. */
const levelAt = (levels: number, shift: number): number => (levels << (29 - shift)) >> 29

const LEVEL_SHIFT = {
  attack: 0,
  defence: 3,
  agility: 6,
  charm: 9,
  might: 12,
  mending: 15,
  spells: 18,
  breaths: 21,
  shield: 24,
  evasion: 27,
} as const

/**
 * **Defence and agility at their levels** — `UpdateCombatantDefense` and
 * `UpdateCombatantAgility` (decompiled): the base times the level's
 * multiplier (`CalculateDefenseBuffMultiplier`, `1 + 0.5 × level` up,
 * `1 + ((level + 1) × 0.25 − 0.5)` down), truncated to sixteen bits and held
 * at `cap`.
 */
function statusOf(base: number, level: number, cap: number): number {
  const m = level >= 0 ? f(1 + f(f(level) * 0.5)) : f(1 + f(f(f(level + 1) * 0.25) - 0.5))
  const v = ffixu(f(m * f(base))) & 0xffff
  return cap < v ? cap : v
}

function bodyOf(fighter: FighterState, at: number, slot: number, group: number): Body {
  const st = fighter.states
  const party = fighter.side === 'party'
  const tension = st.tension ?? 0
  const lvl = (k: keyof typeof LEVEL_SHIFT) => {
    const v = (st[k] as { readonly level: number } | undefined)?.level ?? 0
    return Math.max(-2, Math.min(2, v))
  }
  let levels = 0
  for (const k of Object.keys(LEVEL_SHIFT) as (keyof typeof LEVEL_SHIFT)[]) {
    levels |= (lvl(k) & 7) << LEVEL_SHIFT[k]
  }
  const s =
    (fighter.hp <= 0 ? S.fallen : 0) |
    (st.poisoned || st.envenomed === true ? S.poisoned : 0) |
    (st.paralysed !== undefined ? S.paralysed : 0) |
    (st.sleep !== undefined ? S.asleep : 0) |
    (st.confused !== undefined ? S.confused : 0) |
    (st.dazzled !== undefined ? S.dazzled : 0) |
    (held(st.fizzled) ? S.fizzled : 0) |
    (held(st.bounce) ? S.bounce : 0) |
    (held(st.spells) ? S.spellWard : 0) |
    (held(st.breaths) ? S.breathWard : 0) |
    (st.stunned !== undefined ? S.lostTurn : 0) |
    (st.decoy === 'schizofanic' ? S.schizofanic : 0) |
    (st.decoy === 'mist' ? S.mist : 0) |
    (held(st.alma) ? S.alma : 0) |
    (tension > 0 && tension < 4 ? S.tension : 0) |
    (tension >= 4 ? S.tensionMost : 0) |
    (held(st.reverse) ? S.reverse : 0) |
    (held(st.vanished) ? S.vanished : 0) |
    (held(st.burn) ? S.burn : 0) |
    (held(st.rotstop) ? S.rotstop : 0) |
    (held(st.focus) ? S.focus : 0) |
    (held(st.rain) ? S.rain : 0)
  const t =
    (held(st.holy) ? T.holy : 0) |
    (fighter.spiked === true ? T.spiked : 0) |
    (held(st.fource) ? T.fource : 0) |
    (held(st.twocus) ? T.twocus : 0) |
    (held(st.zeroZone) ? T.zeroZone : 0) |
    (held(st.tumble) ? T.tumble : 0)
  return {
    at,
    id: party ? slot : MONSTER_ID + at,
    party,
    group,
    hp: fighter.hp,
    maxHp: fighter.maxHp,
    mp: fighter.mp,
    maxMp: fighter.maxMp,
    attack: buffedAttack(fighter.attack, lvl('attack'), party),
    defence: statusOf(fighter.defence, lvl('defence'), party ? 999 : 0xffff),
    agility: statusOf(fighter.agility, lvl('agility'), 999),
    might: fighter.might === undefined ? 0 : buffedMagic(fighter.might, lvl('might')),
    mending: fighter.mending === undefined ? 0 : buffedMagic(fighter.mending, lvl('mending')),
    baseAttack: fighter.attack,
    baseDefence: fighter.defence,
    s: s >>> 0,
    t,
    poisonKind: st.envenomed === true ? 2 : st.poisoned ? 1 : 0,
    lostKind: st.stunned ?? 0,
    fourceSort: held(st.fource) ? (st.fource?.level ?? 0) : 0,
    levels,
    tension,
    stance: fighter.stance ?? (fighter.defending ? 1 : 0),
    coupCount: fighter.primed ?? 0,
    primed: fighter.primed !== undefined,
    resist: fighter.resist ?? [],
    level: fighter.level ?? 0,
    family: fighter.family ?? 0,
    metal: fighter.metal === true,
    untrippable: fighter.untrippable === true,
    fighter,
  }
}

const has = (b: Body, bit: number) => (b.s & bit) !== 0
const hasT = (b: Body, bit: number) => (b.t & bit) !== 0
/** `func_02010088`. */
const fallen = (b: Body) => has(b, S.fallen)
/** `func_ov024_021db358`: HP over its most, nothing for none. */
function hpShare(b: Body): number {
  if (f(b.hp) === 0) return 0
  return f(f(b.hp) / f(b.maxHp))
}
/** `func_020882f8`. */
const asleep = (b: Body) => has(b, S.asleep)
/** `func_ov024_021da9b0`. */
const paralysed = (b: Body) => has(b, S.paralysed)
/** `func_ov024_021da9c8`: a lost turn coming. */
const losing = (b: Body) => has(b, S.lostTurn)
/** `func_ov024_021de25c`. */
const confused = (b: Body) => has(b, S.confused)
/** `func_ov024_021dd010`. */
const fizzled = (b: Body) => has(b, S.fizzled)
/** `func_ov024_021da998`, `func_ov024_021dd260`: tension at 1 to 3, and at its most. */
const tensed = (b: Body) => has(b, S.tension)
const tensedMost = (b: Body) => has(b, S.tensionMost)
/** `func_02088514`: envenomed; `func_020885b4`: poisoned. */
const envenomed = (b: Body) => has(b, S.poisoned) && b.poisonKind === 2
const poisoned = (b: Body) => has(b, S.poisoned) && b.poisonKind === 1
/** `func_02088660`. */
const fourced = (b: Body) => hasT(b, T.fource)
/** `func_ov024_021eadfc`: 0 Zone. */
const zoned = (b: Body) => hasT(b, T.zeroZone)
/** `func_ov024_021fcac0`: Rough 'n' Tumble. */
const tumbling = (b: Body) => hasT(b, T.tumble)
/** `func_ov024_021fb430`, `021fb448`: `+0x18` bits 1 and 2, not kept. */
const fireWarded = (_b: Body) => false
const iceWarded = (_b: Body) => false
/** `func_ov024_021fb460`, `021fb478`. */
const spellWarded = (b: Body) => has(b, S.spellWard)
const breathWarded = (b: Body) => has(b, S.breathWard)

/** `func_ov024_021fa76c`: free to be worked on — standing, and none of six statuses. */
function free(b: Body): boolean {
  return !(fallen(b) || paralysed(b) || asleep(b) || losing(b) || confused(b))
}

/** `func_02088540`, `020883ac`, `0208824c`: not fallen, nor at the most tension. */
const mayTake = (b: Body) => !fallen(b) && !tensedMost(b)
/** `func_0208830c`: and not paralysed. */
const maySleep = (b: Body) => mayTake(b) && !paralysed(b)

/** `func_02088418`: may lose a turn of `kind` to action `action`. */
function mayLose(b: Body, kind: number, action: number): boolean {
  if (fallen(b)) return false
  if (tensedMost(b) && action !== 0x1fc && action !== 0x20f) return false
  if (paralysed(b)) return false
  if (losing(b) && b.lostKind === kind) return false
  return true
}

/** `func_02074738(level, 0)`: the party's column, held to at least one. */
function tensionMultiplier(level: number): number {
  const m = TENSION_MULTIPLIERS.party[level]
  return m === undefined || m < 1 ? 1 : m
}

/** `func_02074948`: the falloff by how many before, 0 to 4. */
const FALLOFF_TABLE = [1, f(0.8), f(0.6), f(0.4), f(0.2)] as const
function falloff(n: number): number {
  return FALLOFF_TABLE[n < 0 ? 0 : n > 4 ? 4 : n] as number
}

/** `func_02074938`: a stance's guard. */
function guardFactor(stance: number): number {
  return f((GUARD_LEVELS[stance] as number | undefined) ?? 0)
}

/** `func_ov000_02156b38`: a resistance, adjusted. */
function resistanceOf(b: Body, element: number): number {
  return adjustedResistance(b.resist, element, hasT(b, T.holy), b.fourceSort)
}

/** A resistance byte, `+0x3e + element − 1`; a hundred where none is kept. */
const resistByte = (b: Body, element: number): number => b.resist[element - 1] ?? 100

// ---------------------------------------------------------------------------
// Tables of overlay 24 (USA)

/** The four behaviour tables, 21 × (chance, gate, least, most): `0x021ff084`, `0x021ff0d8`, `0x021ff12c`, `0x021ff180`. */
const BEHAVIOURS: readonly (readonly (readonly [number, number, number, number])[])[] = [
  [
    [100, 0, 100, 100],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [100, 10, 60, 80],
    ...Array.from({ length: 16 }, () => [0, 0, 0, 0] as const),
  ],
  [
    [100, 0, 100, 100],
    [35, 5, 50, 99],
    [40, 10, 50, 99],
    [35, 10, 50, 99],
    [30, 0, 50, 90],
    [70, 20, 50, 99],
    [0, 30, 50, 99],
    [0, 70, 50, 99],
    [60, 20, 50, 99],
    [40, 40, 50, 99],
    [30, 30, 50, 99],
    [30, 30, 50, 99],
    [20, 30, 50, 90],
    [30, 30, 50, 99],
    [50, 30, 50, 99],
    [20, 70, 50, 99],
    [0, 0, 0, 0],
    [0, 0, 50, 99],
    [50, 0, 100, 100],
    [0, 0, 0, 0],
    [70, 20, 50, 99],
  ],
  [
    [100, 0, 100, 100],
    [90, 5, 100, 199],
    [80, 10, 100, 199],
    [80, 10, 100, 199],
    [50, 0, 50, 90],
    [80, 20, 100, 199],
    [50, 30, 100, 199],
    [50, 30, 100, 199],
    [70, 20, 100, 199],
    [70, 30, 100, 199],
    [60, 30, 100, 199],
    [60, 30, 100, 199],
    [20, 30, 50, 90],
    [50, 30, 100, 199],
    [50, 20, 100, 199],
    [50, 15, 100, 199],
    [50, 15, 100, 199],
    [50, 40, 100, 199],
    [100, 0, 150, 200],
    [50, 0, 0, 199],
    [80, 20, 100, 199],
  ],
  [
    [100, 0, 100, 100],
    [70, 5, 50, 99],
    [0, 10, 50, 99],
    [70, 10, 50, 99],
    [0, 0, 0, 0],
    [0, 20, 0, 0],
    [60, 30, 50, 99],
    [30, 30, 40, 80],
    [0, 20, 0, 0],
    [50, 20, 50, 99],
    [60, 30, 50, 99],
    [60, 30, 50, 99],
    [40, 30, 50, 90],
    [50, 30, 50, 99],
    [0, 30, 0, 0],
    [0, 0, 0, 0],
    [30, 30, 30, 60],
    [0, 0, 0, 0],
    [100, 0, 100, 100],
    [0, 0, 0, 0],
    [0, 20, 0, 0],
  ],
]

/** The table a tactic draws by (`0x021f802c`–`0x021f8050`): Fight Wisely's and Don't Use MP's are one. */
function behaviourTable(tactic: number) {
  const t = tactic === 1 || tactic === 4 ? 1 : tactic === 2 ? 2 : tactic === 3 ? 3 : 0
  return BEHAVIOURS[t] as readonly (readonly [number, number, number, number])[]
}

/** The ten actions the command phase looks for (`0x021fefc2`). */
const ROUND_START_ACTIONS = [0x201, 0x45, 0x86, 0x60, 0x8a, 0x87, 0x92, 0xb6, 0xb9, 0x1dc] as const
const KNIGHT_WATCH = 0x201
const MERCURIAL_THRUST = 0x45
const DEFENDING_CHAMPION = 0x87
const WHIPPING_BOY = 0x92
const FORBEARANCE = 0xb6
const SELFLESSNESS = 0xb9
const DEFEND = 3
const CRITICAL_CLAIM = 0x1f9

/** The hit codes in a harm's evaluator, 12 × (a, b, several): `0x021ff002`. */
const HARM_HITS = [
  [1, 1, 0],
  [1, 2, 0],
  [1, 3, 0],
  [3, 1, 1],
  [2, 1, 1],
  [4, 1, 1],
  [1, 4, 0],
  [7, 1, 1],
  [3, 1, 1],
  [1, 5, 0],
  [1, 1, 1],
  [7, 1, 1],
] as const

/** The same in a state's evaluator, 12 × (hits, several): `0x021fefea`. */
const STATE_HITS = [
  [1, 0],
  [1, 0],
  [1, 0],
  [3, 1],
  [2, 1],
  [4, 1],
  [1, 0],
  [7, 1],
  [3, 1],
  [1, 0],
  [1, 1],
  [7, 1],
] as const

/** Category 8's weights by effect (`0x021ffc98`); 10 for any other. */
const CURE_WEIGHTS = [
  [2, 20],
  [3, 22],
  [4, 20],
  [5, 19],
  [6, 20],
  [7, 21],
] as const

/** Category 7's by effect: (effect, slot, weight) — `0x021ffca4`. */
const ALLY_WEIGHTS = [
  [17, 1, 20],
  [18, 2, 15],
  [19, 2, 8],
  [20, 1, 7],
  [21, 2, 7],
  [22, 2, 16],
  [23, 2, 16],
  [14, 2, 14],
  [15, 2, 14],
  [16, 2, 10],
  [11, 2, 17],
] as const

/** Category 5's on a monster: (effect, slot, weight) — `0x021ffcc5`. */
const FOE_WEIGHTS = [
  [2, 1, 20],
  [3, 3, 40],
  [4, 3, 25],
  [5, 3, 21],
  [6, 3, 22],
  [7, 3, 30],
  [8, 3, 10],
  [17, 3, 14],
  [18, 1, 0],
  [19, 2, 8],
  [20, 3, 7],
  [21, 3, 7],
  [22, 1, 12],
] as const

/** Kind 49's good states (`0x021ff026`), signed weights in the order asked. */
const GOOD_STATE_WEIGHTS = [
  30, 100, 30, 30, 50, 30, 30, 30, 30, 30, -90, 30, 30, 20, 20, 20, -90, 20, 20, 0, 40, 40,
] as const

/** Kind 49's ten levels' weights (`0x021fefd6`), attack to evasion. */
const LEVEL_WEIGHTS = [30, 30, 20, 20, 20, 20, 25, 10, 20, 20] as const

// ---------------------------------------------------------------------------
// Memory laid out as the game's

/** The AI object's size — to `+0x670`. */
const AI_SIZE = 0x670
/** A target set: 16 entries of 12 bytes, a count at `+0xc0` and a bonus at `+0xc4`. */
const SET_SIZE = 0xc8
const ENTRY = 12

/** Offsets in the AI object. */
const A = {
  slot: 0x04,
  tactic: 0x06,
  commandPhase: 0x07,
  turns: 0x0c,
  flags: 0x10,
  table: 0x28,
  plusD: 0x2c,
  several: 0x30,
  combo: 0x34,
  asked: 0x38,
  bySlot: 0x3c,
  bySlotFlag: 0x40,
  shares: 0x44,
  values: 0x54,
  present: 0x74,
  standing: 0x78,
  count: 0x9c,
  groupCounts: 0xb8,
  sizes: 0xc4,
  blows: 0xe4,
  hp: 0x104,
  share: 0x114,
  threshold: 0x124,
  weakest: 0x128,
  firstFallen: 0x12c,
  low08: 0x130,
  low25: 0x134,
  twoLow: 0x139,
  resMost: 0x13c,
  resLeast: 0x154,
  fourceMost: 0x16c,
  weight: 0x170,
  candidates: 0x174,
  candidate: 0x178,
  lists: 0x3a8,
  cost: 0x650,
  weaponElement: 0x654,
  needy: 0x655,
  base: 0x65c,
} as const

/** A list's place: `ai + 0x3a8 + 0x30 × n`; −1 the one the setting up clears before them. */
const list = (n: number) => A.lists + 0x30 * n

class Mem {
  readonly v: DataView
  readonly bytes: Uint8Array
  constructor(size: number) {
    this.bytes = new Uint8Array(size)
    this.v = new DataView(this.bytes.buffer)
  }
  u8 = (a: number) => this.v.getUint8(a)
  s8 = (a: number) => this.v.getInt8(a)
  u16 = (a: number) => this.v.getUint16(a, true)
  s32 = (a: number) => this.v.getInt32(a, true)
  f32 = (a: number) => this.v.getFloat32(a, true)
  set8 = (a: number, x: number) => this.v.setUint8(a, x & 0xff)
  set16 = (a: number, x: number) => this.v.setUint16(a, x & 0xffff, true)
  set32 = (a: number, x: number) => this.v.setInt32(a, x | 0, true)
  setF = (a: number, x: number) => this.v.setFloat32(a, x, true)
  fill(a: number, n: number) {
    this.bytes.fill(0, a, a + n)
  }
  copy(to: number, from: number, n: number) {
    this.bytes.copyWithin(to, from, from + n)
  }
}

/** A target set's entry, to be put in — `func_ov024_021f6a4c`'s fields. */
interface SetEntry {
  value: number
  effect: number
  onMonster: number
  target: number
  chance: number
  category: number
  bits: number
}

class TargetSet {
  readonly m = new Mem(SET_SIZE)
  get count() {
    return this.m.s32(0xc0)
  }
  get bonus() {
    return this.m.f32(0xc4)
  }
  set bonus(x: number) {
    this.m.setF(0xc4, x)
  }
  /** `func_ov024_021f6a1c`: put in, at most 16. */
  add(e: SetEntry) {
    const n = this.count
    if (n >= 16) return
    write(this.m, n * ENTRY, e)
    this.m.set32(0xc0, n + 1)
  }
  clear() {
    this.m.fill(0, SET_SIZE)
  }
}

function write(m: Mem, at: number, e: SetEntry) {
  m.setF(at, e.value)
  m.set8(at + 4, e.effect)
  m.set8(at + 5, e.onMonster)
  m.set8(at + 6, e.target)
  m.set8(at + 7, e.chance)
  m.set8(at + 8, e.category)
  m.set8(at + 9, e.bits)
}

function read(m: Mem, at: number): SetEntry {
  return {
    value: m.f32(at),
    effect: m.u8(at + 4),
    onMonster: m.u8(at + 5),
    target: m.u8(at + 6),
    chance: m.u8(at + 7),
    category: m.u8(at + 8),
    bits: m.u8(at + 9),
  }
}

// ---------------------------------------------------------------------------
// The AI

/** Where the AI reads the battle. */
interface Scene {
  readonly state: BattleState
  readonly fighters: readonly FighterState[]
  readonly records: ReadonlyMap<number, AiRecord>
}

class Planner {
  readonly m = new Mem(AI_SIZE)
  /** `ai+0x08`: the member. */
  member!: Body
  tactics!: MemberTactics
  /** `ai+0x7c`: the monsters standing, by group. */
  monsters: Body[] = []
  /** The party by slot, `GetCombatantByID` 0–3; undefined for none. */
  party: (Body | undefined)[] = []
  /** `ai+0x648`, `ai+0x64c`: the candidate being scored and its record. */
  candidate = { action: 0, bag: -1, flag: 0 }
  record!: AiRecord
  /** `ai+0x658`, `ai+0x668`, `ai+0x66c`: a rider's target set, target and its index. */
  riderSet!: TargetSet
  riderTarget!: Body
  riderIndex = 0
  /** Every monster of the battle, by group, standing or not — the groups `battle + 0x81b0` keeps. */
  groups: Body[][] = []
  /** The candidates by number — `ai+0x178`, with what the battle plays for each. */
  commands: (TacticCandidate | undefined)[] = []

  constructor(
    readonly scene: Scene,
    readonly rng: BattleRng | undefined,
  ) {}

  get tactic() {
    return this.m.u8(A.tactic)
  }
  get count() {
    return this.m.s32(A.count)
  }
  get turns() {
    return this.m.s32(A.turns)
  }
  size(t: number) {
    return this.m.s32(A.sizes + 4 * t)
  }

  /** The battle's fighters as the AI reads them: the party by slot, the monsters by group. */
  read(memberAt: number) {
    const { fighters } = this.scene
    const kinds: (number | undefined)[] = []
    let slot = 0
    this.party = []
    this.groups = []
    for (const [at, fighter] of fighters.entries()) {
      if (fighter.side === 'party') {
        const b = bodyOf(fighter, at, slot, 0)
        this.party[slot] = b
        if (at === memberAt) this.member = b
        slot++
        continue
      }
      if (fighter.fled) continue
      let g = kinds.indexOf(fighter.kind)
      if (g < 0) {
        g = kinds.length
        kinds.push(fighter.kind)
        this.groups.push([])
      }
      this.groups[g]?.push(bodyOf(fighter, at, 0, g))
    }
  }

  // --- 021f7478, the setting up ----------------------------------------------

  setUp() {
    const m = this.m
    m.setF(A.weight, f(0.4))
    m.set32(A.candidates, 0)
    clearList(m, list(-1))
    for (let n = 0; n < 14; n++) clearList(m, list(n))
    m.fill(A.groupCounts, 0xc)
    // The monsters standing, by group (`0x021f74f8`–`0x021f76a8`).
    this.monsters = []
    for (const [g, members] of this.groups.entries()) {
      let k = 0
      for (const b of members) {
        if (fallen(b)) continue
        const n = this.monsters.length
        this.monsters.push(b)
        m.set8(0xa0 + 8 * g + k, n)
        m.set32(A.sizes + 4 * n, b.hp)
        const share = hpShare(b)
        if (this.tactic === 0) {
          if (!(share > 1)) {
            const v = f(f(f(b.maxHp) * f(0.9)) + f(f(b.hp) * f(0.1)))
            m.set32(A.sizes + 4 * n, ffix(v))
          }
        } else if (!(share > f(0.33333))) {
          const v = ffix(f(f(f(b.maxHp) * f(0.3)) + f(f(b.hp) * f(0.1))))
          if (v > m.s32(A.sizes + 4 * n)) m.set32(A.sizes + 4 * n, v)
        }
        k++
      }
      m.set32(A.groupCounts + 4 * g, k)
    }
    m.set32(A.count, this.monsters.length)
    // `func_ov000_0215e9fc` with 0 and 1: the party there, and standing.
    const there = this.party.filter((b) => b !== undefined)
    m.set32(A.present, Math.min(4, there.length))
    m.set32(A.standing, Math.min(4, there.filter((b) => !fallen(b)).length))
    // The party (`0x021f76f0`–`0x021f7810`).
    m.set32(A.weakest, 0)
    m.set32(A.firstFallen, -1)
    m.set8(A.twoLow, 0)
    m.set32(A.low08, 0)
    m.set32(A.low25, 0)
    let most = 0
    for (let i = 0; i < 4; i++) {
      m.setF(A.share + 4 * i, 1)
      const b = this.party[i]
      if (!b) continue
      m.setF(A.share + 4 * i, hpShare(b))
      m.set32(A.hp + 4 * i, b.hp)
      if (fallen(b)) {
        if (m.s32(A.firstFallen) < 0) m.set32(A.firstFallen, i)
        m.setF(A.share + 4 * i, 1)
        continue
      }
      if (m.f32(A.share + 4 * i) < m.f32(A.share + 4 * m.s32(A.weakest))) m.set32(A.weakest, i)
      if (m.f32(A.share + 4 * i) <= f(0.08)) m.set32(A.low08, m.s32(A.low08) + 1)
      if (m.f32(A.share + 4 * i) <= f(0.25)) m.set32(A.low25, m.s32(A.low25) + 1)
      if (most < b.attack) most = b.attack
    }
    if (m.s32(A.low25) >= 2) m.set8(A.twoLow, 1)
    // The member's own blow on each, and the party's turns needed
    // (`0x021f7820`–`0x021f79d8`).
    m.fill(A.blows, 0x20)
    const count = this.count
    for (let t = 0; t < count; t++) {
      const target = this.monsters[t] as Body
      let e = f(f(f(this.member.attack) - f(f(target.defence) / 2)) / 2)
      if (e < 1) e = 1
      m.setF(A.blows + 4 * t, e)
    }
    let turns = 0
    for (let t = 0; t < count; t++) {
      const target = this.monsters[t] as Body
      let pb = f(f(f(most) - f(f(target.defence) / 2)) / 2)
      if (pb < 1) pb = 1
      const whole = ffix(pb)
      const mean = ffix(f(f(f(whole) + m.f32(A.blows + 4 * t)) / 2))
      const q = f(f(this.size(t)) / f(f(f(0.9375) * f(mean)) + 0.5))
      // `_f2d`, fdlibm's `ceil`, `_d2f`, `_ffix`.
      turns += ffix(f(Math.ceil(q))) + 1
    }
    m.set32(A.turns, turns)
    // The candidates (`0x021f79dc`–`0x021f7c90`).
    this.commands = []
    const put = (action: number, bag: number, flag: number, c: TacticCandidate | undefined) => {
      const n = m.s32(A.candidates)
      m.set16(A.candidate + 4 * n, action)
      m.set8(A.candidate + 4 * n + 2, bag)
      m.set8(A.candidate + 4 * n + 3, flag)
      this.commands[n] = c
      m.set32(A.candidates, n + 1)
      return n + 1 === 0x80
    }
    put(1, -1, 0, undefined)
    const coup = this.tactics.coup
    if (this.member.primed && coup) put(coup.action, -1, 0, coup)
    for (const c of [...this.tactics.spells, ...this.tactics.abilities]) {
      const r = this.scene.records.get(c.action)
      if (!r || !inBattle(r)) continue
      if (put(idOf(r), -1, 0, c)) return
    }
    for (const [i, c] of this.tactics.items.entries()) {
      const r = this.scene.records.get(c.action)
      if (c.action === 0 || !r || !inBattle(r)) continue
      if (put(c.action, c.bag ?? i, c.consumed === true ? 1 : 0, c)) return
    }
    // The weapon's element (`0x021f7c90`–`0x021f7ce0`, the pairs at `0x021fefb0`).
    const key = ((this.tactics.weapon?.flags ?? 0) >>> 23) & 7
    m.set8(A.weaponElement, key === 0 ? 8 : key)
    if (m.u8(A.commandPhase) !== 0) return
    // What the monsters' ways hold (`0x021f7cf0`–`0x021f7f4c`).
    m.fill(0x69, 9)
    for (let i = 1; i <= 5; i++) {
      m.set32(A.resLeast + 4 * i, 0xff)
      m.set32(A.resMost + 4 * i, 0)
    }
    for (const b of this.monsters) {
      if (b.group >= 3) continue
      const ways = b.fighter.ways
      if (!ways) continue
      for (const way of ways.slice(0, 6)) {
        const r = this.scene.records.get(way)
        if (!r) continue
        const w10 = flags10(r)
        if (w10 & F10.spell) m.set8(0x6c, 1)
        const side = sideOf(r)
        if ((side === 1 || side === 3) && w10 & F10.reflectable && kindOf(r) === 1) m.set8(0x6b, 1)
        if (w10 & F10.breath) {
          m.set8(0x6d, 1)
          if (kindOf(r) === 1) m.set8(0x6e, 1)
        }
        if (elementOf(r) === 1) m.set8(0x6f, 1)
        if (elementOf(r) === 2) m.set8(0x70, 1)
        if (kindOf(r) === 0x11 || riderOf(r) === 0x14 || kindOf(r) === 0x23) m.set8(0x71, 1)
      }
      const byte = (e: number) => resistByte(b, e) & 0xff
      const res = [
        0,
        byte(1),
        byte(2),
        Math.max(byte(3), byte(4)),
        Math.max(byte(5), byte(6)),
        byte(7),
      ]
      for (let i = 1; i <= 5; i++) {
        const r = res[i] as number
        if (m.s32(A.resLeast + 4 * i) > r) m.set32(A.resLeast + 4 * i, r)
        if (m.s32(A.resMost + 4 * i) < r) m.set32(A.resMost + 4 * i, r)
      }
    }
    // Each one's attack over the party's greatest (`0x021f7f58`–`0x021f8018`).
    let best = 1
    for (let i = 0; i < 4; i++) {
      const b = this.party[i]
      if (b && b.baseAttack > best) best = b.baseAttack
    }
    for (let i = 0; i < 4; i++) {
      const b = this.party[i]
      if (b) m.setF(A.shares + 4 * i, f(f(b.baseAttack) / f(best)))
    }
    // **The draws** (`0x021f801c`–`0x021f8104`).
    const rng = this.rng as BattleRng
    rng.float01()
    const table = behaviourTable(this.tactic)
    const standing = m.s32(A.standing)
    for (let i = 0; i < 21; i++) {
      const [chance, gate] = table[i] as readonly [number, number, number, number]
      if ((rng.below(100) & 0xff) < chance) m.set8(A.flags + i, 1)
      if (turns < sdiv(gate * standing, 10)) m.set8(A.flags + i, 0)
    }
    for (let i = 0; i < 21; i++) {
      const [, , lo, hi] = table[i] as readonly [number, number, number, number]
      m.set8(A.values + i, between(rng, lo, hi))
    }
    m.setF(A.several, rng.floatBetween(0, f(0.9)))
  }

  // --- 021fe698, 021fe6b4 ------------------------------------------------------

  /** `func_ov024_021fe698`: a behaviour asked — false when its flag is clear, else recorded. */
  ask(i: number): boolean {
    if (this.m.u8(A.flags + i) === 0) return false
    this.m.set32(A.asked, i)
    return true
  }

  /** `func_ov024_021fe6b4`: the slot a rider's entries are weighed by, and its flag. */
  askSlot(i: number) {
    this.m.set32(A.bySlot, i)
    this.m.set8(A.bySlotFlag, this.m.u8(A.flags + i))
  }

  // --- 021f8874, 021f87dc: may it be paid for ----------------------------------

  /** `func_ov024_021f87dc`: what an action costs the member. */
  costOf(r: AiRecord): number {
    let cost = costOf(r)
    if (listOf(r) === 2) {
      if (zoned(this.member)) return 0
      if (idOf(r) === 0x28) {
        cost = 0x14
        if (this.member.mp > 0x14) cost = this.member.mp
      } else if ((this.tactics.traits ?? []).includes(0x106) && cost !== 0) {
        // `func_020dd290`: a trait that lessens the MP, `0.75 × cost + 0.75`.
        cost = ffixu(f(f(f(0.75) * f(cost)) + f(0.75)))
      }
    }
    return cost
  }

  /** `func_ov024_021f8874`: usable in battle, the MP within the member's, not silenced. */
  payable(r: AiRecord): { ok: boolean; cost: number } {
    if (!inBattle(r)) return { ok: false, cost: 0 }
    const cost = this.costOf(r)
    if (cost > this.member.mp) return { ok: false, cost }
    const w10 = flags10(r)
    if (w10 & F10.spell && has(this.member, S.fizzled)) return { ok: false, cost }
    if (w10 & F10.dance && (this.member.s & 0x80) !== 0) return { ok: false, cost }
    return { ok: true, cost }
  }

  // --- 021f8938, 021f8bd8: the amount and the chance ---------------------------

  /** `func_ov024_021f8938`: an action's amount, its mean and its least. */
  amount(r: AiRecord): { mean: number; least: number } {
    let mean = 0
    let least = 0
    const range = r.range
    if (range) {
      if (scaleModeOf(r) === 2) {
        const hi = word(r, 4) >>> 22
        const lo = (word(r, 4) >>> 12) & 0x3ff
        const min = f(range.party)
        const max = f(range.peak)
        const w10 = flags10(r)
        const v =
          w10 & F10.byMight
            ? f(this.member.might)
            : w10 & F10.byMending
              ? f(this.member.mending)
              : undefined
        if (v === undefined) {
          mean = f(f(max + min) * 0.5)
          least = min
        } else {
          if (v <= f(lo)) mean = min
          else if (v >= f(hi)) mean = max
          else mean = f(f(f(v - f(lo)) * f(f(max - min) / f(hi - lo))) + min)
          least = f(mean - f(range.spread))
        }
      } else {
        mean = f(f(range.peak + range.party) * 0.5)
        least = f(range.party)
      }
    }
    if (mean < 0) mean = 0
    else if (mean >= 32767) mean = 32767
    if (least < 0) least = 0
    else if (least >= 32767) least = 32767
    return { mean, least }
  }

  /** `func_ov024_021f8bd8`: an action's chance, by might or mending between its least and most. */
  chance(r: AiRecord): number {
    if (scaleModeOf(r) !== 1) return 100
    const w10 = flags10(r)
    const v = w10 & F10.byMight ? this.member.might : w10 & F10.byMending ? this.member.mending : -1
    if (v < 0) return 100
    const lo = (word(r, 4) >>> 12) & 0x3ff
    const hi = word(r, 4) >>> 22
    const least = (word(r, 0x14) >>> 7) & 0x7f
    const most = (word(r, 0x14) >>> 14) & 0x7f
    if (v <= lo) return f(least)
    if (v >= hi) return f(most)
    const step = ffix(f(f(v - lo) * f(f(most - least) / f(hi - lo))))
    return f((step + least) >>> 0)
  }

  // --- 021f875c, a resistance --------------------------------------------------

  /** `func_ov024_021f875c`: the target's resistance — by the landing element where `landing`. */
  resistance(target: Body, r: AiRecord, landing: boolean): number {
    if (!target.party && target.metal && !(flags10(r) & F10.worksOnMetal)) return 0
    return resistanceOf(target, landing ? landingOf(r) : elementOf(r))
  }

  // --- 021f736c, the handlers' forecasts ---------------------------------------

  /** `func_ov024_021f736c` and the table at `0x021ffda4`: what an action's handler makes of its amount. */
  handler(target: Body, r: AiRecord, mean: number, least: number): [number, number] {
    const both = (k: number): [number, number] => [f(k * mean), f(k * least)]
    const ofFamily = (n: number) => !target.party && target.family === n
    switch (handlerOf(r)) {
      case 1:
        return ofFamily(2) ? [roundUp(f(1.5 * mean)), roundUp(f(1.5 * least))] : [mean, least]
      case 2:
        return !target.party && target.metal ? [2, 1] : [0, 0]
      case 3:
      case 7:
        return both(f(1.25))
      case 4:
      case 9:
        return both(0.75)
      case 10:
        return ofFamily(1) ? both(1.5) : [mean, least]
      case 11:
        return both(0.5)
      case 12:
        return ofFamily(3) ? both(1.5) : [mean, least]
      case 13:
        return poisoned(target) || envenomed(target) || paralysed(target)
          ? both(1.5)
          : [mean, least]
      case 15:
        return asleep(target) || confused(target) ? both(2) : [mean, least]
      case 16:
        return ofFamily(11) ? both(f(1.25)) : [mean, least]
      case 17:
        return both(2)
      case 18:
        return ofFamily(8) ? both(1.5) : [mean, least]
      case 19:
        return both(f(0.3))
      case 20:
        return ofFamily(7) ? both(1.5) : [mean, least]
      case 21:
        return [f(f(0.3) * mean), f(f(0.1) * least)]
      case 22:
        return ofFamily(12) ? both(1.5) : [mean, least]
      case 23:
        return ofFamily(5) ? both(1.5) : [mean, least]
      case 24:
        return both(f(1.3))
      case 26:
        return ofFamily(6) ? both(1.5) : [mean, least]
      case 27:
        return both(f(0.8))
      case 28:
        return ofFamily(0) ? both(1.5) : [mean, least]
      case 29: {
        const v = f(2 * this.member.level + 0x7d)
        return [v, f(f(0.85) * v)]
      }
      case 30:
        return ofFamily(4) ? both(1.5) : [mean, least]
      case 32:
        return ofFamily(10) ? both(1.5) : [mean, least]
      case 33:
        return both(1.5)
      case 34: {
        const by = f(this.count + 1)
        return [f(f(4 * mean) / by), f(f(4 * least) / by)]
      }
      case 47:
        return [f(5 + f(mean / 4)), f(5 + f(least / 4))]
      case 64: {
        let v = 2 * this.member.level
        if (v < 0x23) v = 0x23
        // `func_0200b0f0`, a double's multiply, then narrowed.
        return [f(v), f(0.85 * v)]
      }
      case 65: {
        // The character record's `+0x04` bits 0–9 — deftness, INFERRED (see
        // `SKILL_SCALES`).
        const deftness = this.member.fighter.deftness ?? 0
        return [f(f(mean / 2) + f(deftness)), f(f(least / 2) + f(deftness))]
      }
      default:
        return [mean, least]
    }
  }

  // --- 021fa7ec, the forecast ----------------------------------------------------

  /**
   * `func_ov024_021fa7ec`: a blow's mean, least and weighed amount on one
   * monster, `t` its place. `given`, the amount handed in; none, the
   * member's own blow on it. `combo`, set to `t` where the chain would carry.
   */
  forecast(
    combo: { value: number } | undefined,
    given: { mean: number; least: number } | undefined,
    target: Body,
    t: number,
  ): { mean: number; least: number; weighed: number } {
    const member = this.member
    const r = this.record
    const w10 = flags10(r)
    const weight = this.m.f32(A.weight)
    const inMean = given ? given.mean : this.m.f32(A.blows + 4 * t)
    const inLeast = given ? given.least : f(f(0.9375) * inMean)
    let [mean, least] = this.handler(target, r, inMean, inLeast)
    let claim = false
    if (w10 & F10.tensed && (tensed(member) || tensedMost(member))) {
      const k = tensionMultiplier(member.tension)
      mean = f(mean * k)
      least = f(least * k)
      if (target.party || !target.metal) {
        // `CalculateTensionBonus`'s result is thrown away and the level added
        // in its place (`0x021fa934`–`0x021fa96c`): the game's own slip, kept.
        const lv = (member.level << 24) >> 24
        mean = f(mean + f(lv))
        least = f(least + f(lv))
      }
    }
    if (idOf(r) === CRITICAL_CLAIM) {
      const v = f(member.baseAttack)
      mean = f(f(1.2) * mean)
      mean = v < mean ? mean : v
      const v95 = f(f(0.95) * v)
      const l12 = f(f(1.2) * least)
      least = v95 < l12 ? l12 : v95
      claim = true
    }
    let factor = this.resistance(target, r, false)
    if (w10 & F10.weapon) {
      const killers = this.tactics.weapon?.killers
      for (let n = 1; n <= 12; n++) {
        if (target.party || target.family !== n) continue
        const tenths = killers?.[n - 1]
        factor = f(factor * (tenths === undefined ? 1 : f(f(tenths) / 10)))
      }
    }
    let fource = 0
    let weaponRes = 0
    let use = false
    const we = this.m.u8(A.weaponElement)
    if (w10 & F10.weapon && we >= 1 && we <= 7) {
      weaponRes = resistanceOf(target, we)
      use = true
    }
    if (elementOf(r) === 8) {
      const pick = (e: number) => f(f(1.1) * f(f(resistByte(target, e)) / f(100)))
      switch (member.fourceSort) {
        case 1:
          fource = pick(1)
          break
        case 2:
          fource = pick(2)
          break
        case 3: {
          const a = pick(4)
          const b = pick(3)
          fource = b < a ? a : b
          break
        }
        case 4: {
          const a = pick(6)
          const b = pick(5)
          fource = b < a ? a : b
          break
        }
        case 5:
          fource = pick(7)
          break
      }
      if (fourced(member)) use = true
    }
    if (use) factor = f(factor * (weaponRes <= fource ? fource : weaponRes))
    if (fireWarded(target) && elementOf(r) === 1) factor = f(0.75 * factor)
    if (iceWarded(target) && elementOf(r) === 2) factor = f(0.75 * factor)
    if (w10 & F10.spell && spellWarded(target) && kindOf(r) !== 2) {
      factor = f(factor * wardMultiplier(levelAt(target.levels, LEVEL_SHIFT.spells)))
    }
    if (w10 & F10.breath && breathWarded(target)) {
      factor = f(factor * wardMultiplier(levelAt(target.levels, LEVEL_SHIFT.breaths)))
    }
    if (w10 & F10.defendable) {
      if (target.stance <= 3) factor = f(factor * guardFactor(target.stance))
      else if (hasT(target, T.spiked)) factor = f(factor * guardFactor(1))
    }
    if (tensedMost(target) && kindOf(r) === 1) factor = f(0.5 * factor)
    mean = f(mean * factor)
    least = f(least * factor)
    if (combos(r)) {
      const chain = this.scene.state.chain
      if (
        chain &&
        chain.action === idOf(r) &&
        chain.side === 'party' &&
        chain.target === target.at
      ) {
        const n = Math.min(3, chain.count + 1)
        const k = COMBO_TABLE[n] as number
        mean = f(mean * k)
        least = f(least * k)
        if (combo) combo.value = t
      }
    }
    if (idOf(r) === 0x79) {
      const k = t === 0 ? f(f(f(0.125) * f(this.count)) + f(0.8)) : f(0.8)
      mean = f(mean * k)
      least = f(least * k)
    }
    const flags = this.tactics.weapon?.flags ?? 0
    const ones = this.tactics.weapon !== undefined && (flags & (1 << 10)) !== 0
    if (w10 & F10.weapon && ones) {
      mean = 1
      least = 1
    }
    if (idOf(r) === 1) {
      if (mean < 1) mean = 1
      if (least < f(0.4)) least = f(0.4)
    }
    if (!target.party && target.metal && !claim) {
      const a = idOf(r)
      if (a !== 0x40 && a !== 0x7e && a !== 0x82) {
        mean = 1
        least = f(0.4)
        if (w10 & F10.weapon && ones) least = 1
        if (w10 & F10.weapon && this.tactics.weapon !== undefined && (flags & (1 << 4)) !== 0) {
          mean = f(mean + 1)
          least = f(least + 1)
        }
        if (w10 & F10.tensed && (tensed(member) || tensedMost(member))) {
          const k = tensionMultiplier(member.tension)
          mean = f(mean * k)
          least = f(least * k)
        }
      }
      if (!(w10 & F10.worksOnMetal)) mean = 0
    }
    const cap = capOf(r)
    if (cap !== 0 && f(cap) < mean) mean = f(cap)
    if (cap !== 0 && f(cap) < least) least = f(cap)
    const weighed = f(f(mean * weight) + f(least * f(1 - weight)))
    return { mean, least, weighed }
  }

  // --- 021f9660, scoring every candidate -----------------------------------------

  scoreAll() {
    const m = this.m
    const n = m.s32(A.candidates)
    for (let i = 0; i < n; i++) {
      const action = m.u16(A.candidate + 4 * i)
      const r = this.scene.records.get(action)
      if (!r) continue
      if (atRoundStart(r)) continue
      if (((word(r, 0x2c) >>> 14) & 0x3f) !== 0) continue
      const { ok, cost } = this.payable(r)
      if (!ok) continue
      if (this.tactic === 4 && cost !== 0) continue
      this.candidate = {
        action,
        bag: m.s8(A.candidate + 4 * i + 2),
        flag: m.u8(A.candidate + 4 * i + 3),
      }
      this.record = r
      m.set32(A.cost, cost)
      m.set8(A.combo, 0)
      m.set8(A.plusD, 0)
      m.set8(A.needy, 1)
      m.set32(A.asked, 0)
      m.set32(A.bySlot, 0)
      this.evaluate(kindOf(r))
    }
  }

  /** The evaluators by kind — the table at `0x021ffeac`. */
  evaluate(kind: number) {
    const r = this.record
    const onFoes = sideOf(r) === 1
    switch (kind) {
      case 1:
        return this.harm()
      case 2:
      case 14:
        return this.heal()
      case 3:
        // `func_ov024_021fbd2c`: attack.
        if (onFoes) {
          if (this.ask(3) && this.ask(13)) this.onMonsters(0x11)
        } else if (this.ask(2) && this.ask(5)) this.onParty(0x11)
        return
      case 4:
        // `021fbdb4`: defence — on a foe, behaviour 2 then 14.
        if (onFoes) {
          if (this.ask(2) && this.ask(14)) this.onMonsters(0x12)
        } else if (this.ask(3) && this.ask(6)) this.onParty(0x12)
        return
      case 5:
        // `021fbe3c`: agility.
        if (onFoes) {
          if (this.ask(3) && this.ask(15)) this.onMonsters(0x13)
        } else if (this.ask(3) && this.ask(7)) this.onParty(0x13)
        return
      case 7:
        return this.onParty(2)
      case 8:
        if (this.ask(1)) this.onMonsters(4)
        return
      case 9:
        if (this.turns >= 3) this.onParty(4)
        return
      case 10:
        return this.lostTurn()
      case 15:
        this.ask(2)
        return
      case 16:
        if (this.ask(1)) this.onMonsters(6)
        return
      case 17:
        if (this.ask(4)) this.onMonsters(9)
        return
      case 18:
        return this.revive()
      case 19:
        if (this.ask(1)) this.onMonsters(5)
        return
      case 20:
        return this.onParty(3)
      case 21:
        if (this.ask(1)) this.onMonsters(7)
        return
      case 22:
        // `021fc2b4`.
        if (onFoes) {
          if (this.ask(16)) this.onMonsters(0x16)
        } else if (this.m.u8(0x6b) !== 0 && this.ask(10)) this.onParty(0x16)
        return
      case 23:
        if (!onFoes && this.m.u8(0x6e) !== 0 && this.ask(11)) this.onParty(0x17)
        return
      case 24:
        return this.onMonsters(3)
      case 26:
        return this.psycheCoup()
      case 27:
        return this.onParty(7)
      case 32:
        if (this.m.u8(0x6d) !== 0 && this.ask(11)) this.onParty(0x10)
        return
      case 33:
        return this.reviveMany()
      case 39:
        if (this.m.u8(0x71) !== 0 && this.ask(12)) this.onParty(0xb)
        return
      case 46:
        return this.fource()
      case 49:
        return this.dispel()
      case 61:
        if (this.m.u8(0x6f) !== 0 && this.ask(11)) this.onParty(0xe)
        return
      case 62:
        if (this.m.u8(0x70) !== 0 && this.ask(11)) this.onParty(0xf)
        return
      case 67:
        return this.healMore()
      case 68:
        return this.coupZone()
      case 69:
        return this.coupLoot()
      case 70:
        return this.coupTumble()
      case 71:
        return this.coupTension()
      case 72:
        return this.coupExperience()
      case 74:
        return this.coupLevels()
      default:
        // The empty and the null.
        return
    }
  }

  // --- the evaluators --------------------------------------------------------------

  /** `func_ov024_021fb490`: kind 1, harm. */
  harm() {
    const r = this.record
    if (sideOf(r) === 2) return
    const member = this.member
    const amount = r.range ? this.amount(r) : undefined
    const comboAt = { value: -1 }
    const count = this.count
    const means: number[] = []
    const leasts: number[] = []
    const weighed: number[] = []
    for (let t = 0; t < count; t++) {
      means[t] = 0
      leasts[t] = 0
      weighed[t] = 0
      const target = this.monsters[t] as Body
      if (!target.party && target.metal && !(flags10(r) & F10.worksOnMetal)) continue
      const out = this.forecast(comboAt, amount, target, t)
      means[t] = out.mean
      leasts[t] = out.least
      weighed[t] = out.weighed
    }
    let reach = reachOf(r)
    if (reach === 5) {
      const flags = this.tactics.weapon?.flags ?? 0
      reach = flags & 2 ? 3 : flags & 1 ? 4 : 2
    }
    if (reach !== 2 && reach !== 4 && reach !== 3) return
    const code = hitCodeOf(r)
    if (code > 11) return
    const [a, b, s] = HARM_HITS[code] as readonly [number, number, number]
    let several = s
    const hits = (a * b) & 0xffff
    let chosen = -1
    if (reach === 2 && a === 1) chosen = this.bestTarget(r, count, weighed, leasts, hits)
    const set = new TargetSet()
    let reached = 0
    let skip = false
    let falls = 0
    for (let t = 0; t < count; t++) {
      this.m.set8(A.plusD, 0)
      if (chosen >= 0 && chosen !== t) continue
      if (comboAt.value === t) this.m.set8(A.combo, 1)
      const target = this.monsters[t] as Body
      reached++
      if (flags10(r) & F10.reflectable && has(target, S.bounce)) skip = true
      if (reach !== 2 && flags10(r) & F10.fallsOff) {
        weighed[t] = f((weighed[t] as number) * falloff((falls << 24) >> 24))
        falls++
      }
      const entry: SetEntry = {
        value: weighed[t] as number,
        effect: 0,
        onMonster: 1,
        target: t,
        chance: 100,
        category: 0,
        bits: (hits & 0x3f) | ((several & 1) << 6),
      }
      set.add(entry)
      if ((means[t] as number) >= f(0.1) && !tensed(member) && !tensedMost(member)) {
        this.riders(set, entry, target, t)
      }
      if (this.finishes(t, reach)) {
        if (reached >= 2 && several !== 0) skip = true
        if (reached <= 1) several = 0
        if (!skip) {
          const group = target.group
          const id = target.id & 0xff
          if (reach === 4) this.score(set, group, 0xff)
          else if (reach === 3) this.score(set, 0xff, 0xff)
          else this.score(set, group, id)
        }
        set.clear()
        reached = 0
        skip = false
        falls = 0
      }
    }
  }

  /** Whether the set is done at monster `t`: the last, one at a time, or the end of a group. */
  finishes(t: number, reach: number): boolean {
    if (t === this.count - 1) return true
    if (reach === 2) return true
    if (reach === 4) {
      const next = this.monsters[t + 1] as Body
      return (this.monsters[t] as Body).group !== next.group
    }
    return false
  }

  /** `func_ov024_021f8d80`: the one monster a single blow is best aimed at. */
  bestTarget(
    r: AiRecord,
    count: number,
    weighed: readonly number[],
    leasts: readonly number[],
    hits: number,
  ): number {
    const rank: number[] = []
    for (let i = 0; i < count; i++) {
      const b = this.monsters[i] as Body
      if (flags10(r) & F10.reflectable && has(b, S.bounce)) rank[i] = -1
      else if (paralysed(b)) rank[i] = 1
      else if (confused(b)) rank[i] = 2
      else if (asleep(b)) rank[i] = 3
      else rank[i] = f(b.hp) <= (leasts[i] as number) ? 5 : 4
    }
    let best = 0
    for (let i = 1; i < count; i++) {
      const ri = rank[i] as number
      const rb = rank[best] as number
      if (ri > rb) {
        best = i
        continue
      }
      if (ri !== rb) continue
      const hpI = (this.monsters[i] as Body).hp
      const hpB = (this.monsters[best] as Body).hp
      const restI = hpI - Math.imul(hits, ffix(weighed[i] as number))
      const restB = hpB - Math.imul(hits, ffix(weighed[best] as number))
      let take = false
      if (restI > 0) take = restI < restB
      else if (restB > 0) take = true
      else take = hpI > hpB
      if (take) best = i
    }
    // The pick is handed back whatever its rank (`0x021f8efc`).
    return best
  }

  /** `func_ov024_021fb91c`: kinds 2 and 14, a heal. */
  heal() {
    const r = this.record
    if (sideOf(r) === 1) return
    const m = this.m
    const threshold = m.f32(A.threshold)
    const weakest = m.f32(A.share + 4 * m.s32(A.weakest))
    if (!(weakest < threshold) && riderOf(r) === 0) return
    const member = this.member
    let { mean } = this.amount(r)
    if (idOf(r) === 0x21) mean = f(999)
    if (flags10(r) & F10.tensed && (tensed(member) || tensedMost(member))) {
      mean = f(mean * tensionMultiplier(member.tension))
    }
    const set = new TargetSet()
    const reach = reachOf(r)
    const slot = m.u16(A.slot)
    for (let i = 0; i < 4; i++) {
      const b = this.party[i]
      if (!b) continue
      if (reach === 1 && i !== slot) continue
      if (reach === 8 && i === slot) continue
      if (fallen(b)) continue
      m.set8(A.needy, 1)
      if (!(m.f32(A.share + 4 * i) < threshold)) m.set8(A.needy, 0)
      if (m.u8(A.needy) === 0 && riderOf(r) === 0) continue
      if (flags10(r) & F10.reflectable && has(b, S.bounce)) continue
      let a = mean
      if (idOf(r) === 0x1fa) a = f(f(0.4) * f(b.maxHp))
      if (kindOf(r) === 14) {
        if (f(f(b.hp) / f(b.maxHp)) > f(0.08)) continue
        if (f(f(f(member.hp) - a) / f(member.maxHp)) < 0.5) continue
        a = f(a * f(0.3))
      }
      const missing = b.maxHp - b.hp
      if (a > f(missing)) a = f(missing)
      const entry: SetEntry = {
        value: a,
        effect: 0,
        onMonster: 0,
        target: i,
        chance: 100,
        category: 3,
        bits: 0,
      }
      set.add(entry)
      if (riderOf(r) !== 0) this.riders(set, entry, b, i)
      if (reach === 2 || reach === 1 || reach === 8) {
        this.score(set, 0, b.id & 0xff)
        set.clear()
      }
    }
    if (reach === 4 || reach === 3) this.score(set, 0, reach === 3 ? 0xff : member.id & 0xff)
  }

  /** `func_ov024_021fcb60`: kind 67, a heal by a threshold of its own. */
  healMore() {
    const m = this.m
    const kept = m.f32(A.threshold)
    m.setF(A.threshold, this.tactic === 3 ? f(0.65) : f(0.6))
    if (!(this.member.coupCount > 2 && this.turns > 2)) {
      m.setF(A.threshold, f(m.f32(A.threshold) + f(0.2)))
    }
    this.heal()
    m.setF(A.threshold, kept)
  }

  /** `func_ov024_021fc068`: kind 18, the fallen raised. */
  revive() {
    const r = this.record
    if (sideOf(r) === 1) return
    const a = idOf(r)
    const chance = a === 0x27 ? f(100) : f(50)
    const set = new TargetSet()
    const reach = reachOf(r)
    const slot = this.m.u16(A.slot)
    for (let i = 0; i < 4; i++) {
      if (reach === 1 && i !== slot) continue
      const b = this.party[i]
      if (!b || !fallen(b)) continue
      if (flags10(r) & F10.reflectable && has(b, S.bounce)) continue
      set.add({
        value: f(b.hp >> 1),
        effect: 0,
        onMonster: 0,
        target: i,
        chance: ffix(chance),
        category: 5,
        bits: 0,
      })
      if (reach === 2 || reach === 1) {
        this.score(set, 0, b.id & 0xff)
        set.clear()
      }
    }
    if (reach === 4 || reach === 3) {
      this.score(set, 0, reach === 3 ? 0xff : this.member.id & 0xff)
    }
  }

  /** `func_ov024_021fc4f4`: kind 33, the fallen raised when two or more are down. */
  reviveMany() {
    if (this.tactic === 0) return
    const r = this.record
    if (sideOf(r) === 1) return
    const set = new TargetSet()
    const reach = reachOf(r)
    const slot = this.m.u16(A.slot)
    let down = 0
    for (let i = 0; i < 4; i++) {
      if (reach === 1 && i !== slot) continue
      const b = this.party[i]
      if (!b || !fallen(b)) continue
      if (flags10(r) & F10.reflectable && has(b, S.bounce)) continue
      set.add({
        value: f(b.hp),
        effect: 0,
        onMonster: 0,
        target: i,
        chance: 100,
        category: 5,
        bits: 0,
      })
      down++
    }
    if (down >= 2 && this.m.s32(A.low25) + down >= 3) {
      this.score(set, 0, reach === 3 ? 0xff : this.member.id & 0xff)
    }
  }

  /** `func_ov024_021fbf18`: kind 10 — two coups, else a lost turn on the monsters. */
  lostTurn() {
    const a = idOf(this.record)
    if (a === 0x1fc || a === 0x20f) {
      if (this.coupReady() && this.ask(18) && this.member.tension < 3) {
        this.bonusOnly(f(1000), 0, 0)
      }
      return
    }
    if (this.ask(1)) this.onMonsters(8)
  }

  /** The coups' condition: Mix It Up, or any but Show No Mercy with three turns or more. */
  coupReady(): boolean {
    const tactic = this.tactic
    if (tactic === 2) return true
    if (tactic === 0) return false
    return this.turns >= 3
  }

  /** The scorer handed an empty set and a bonus. */
  bonusOnly(bonus: number, group: number, target: number) {
    const set = new TargetSet()
    set.bonus = bonus
    this.score(set, group, target)
  }

  /** `func_ov024_021fc37c`: kind 26, Psyche Up's coup (`0x202`) by the member's MP. */
  psycheCoup() {
    if (idOf(this.record) !== 0x202) return
    const member = this.member
    const share = f(f(member.mp) / f(member.maxMp))
    let ok = false
    let line = f(0.8)
    const tactic = this.tactic
    if (tactic === 2) ok = true
    else {
      if (tactic === 0) return
      if (this.turns >= 3) {
        line = f(0.6)
        ok = true
      }
    }
    if (member.coupCount <= 2) {
      line = f(0.8)
      ok = true
    }
    if (share >= line) return
    if (!ok) return
    if (!this.ask(18)) return
    if (member.tension >= 3) return
    this.bonusOnly(f(1000), 0, 0)
  }

  /** `func_ov024_021fc6dc`: kind 46, a Fource. */
  fource() {
    if (!this.ask(2) || !this.ask(5)) return
    const e = s16(this.record, 0x30)
    if (e <= 0 || e > 5) return
    const least = this.m.s32(A.resLeast + 4 * e)
    const most = this.m.s32(A.resMost + 4 * e)
    if (least < 0x5a || most < 0x7d) return
    this.m.set32(A.fourceMost, most)
    this.onParty(0xd)
  }

  /** `func_ov024_021fc754`: kind 49 — the monsters' good states and levels, summed. */
  dispel() {
    if (!this.ask(1)) return
    let total = 0
    for (const b of this.monsters) {
      const flags = [
        tensed(b),
        tensedMost(b),
        has(b, S.bounce),
        has(b, S.vanished),
        has(b, S.burn),
        has(b, S.rotstop),
        has(b, S.schizofanic),
        has(b, S.alma),
        has(b, S.reverse),
        has(b, S.focus),
        fizzled(b),
        has(b, S.reverse),
        has(b, S.mist),
        has(b, S.rain),
        fourced(b),
        hasT(b, T.holy),
        false,
        fireWarded(b),
        iceWarded(b),
        zoned(b),
        tumbling(b),
        hasT(b, T.twocus),
      ]
      let sum = 0
      for (const [i, on] of flags.entries()) if (on) sum += GOOD_STATE_WEIGHTS[i] as number
      for (const [i, w] of LEVEL_WEIGHTS.entries()) {
        const level = levelAt(b.levels, 3 * i)
        if (level > 0) sum += w * level
        else if (level < 0) sum += 3 * (w * level)
      }
      total += sum
    }
    if (total <= 0) return
    const set = new TargetSet()
    set.add({
      value: f(total),
      effect: 0,
      onMonster: 1,
      target: 0,
      chance: 100,
      category: 6,
      bits: 0,
    })
    this.score(set, 0, this.member.id & 0xff)
  }

  /** `func_ov024_021fcbc8`: kind 68, 0 Zone's coup. */
  coupZone() {
    if (!this.coupReady() || !this.ask(18)) return
    if (this.turns <= 1 || zoned(this.member)) return
    this.bonusOnly(f(1000), 0, this.member.id & 0xff)
  }

  /** `func_ov024_021fcc6c`: kind 69, Itemised Kill — at a monster whose drop is not made sure. */
  coupLoot() {
    let bonus = f(1000)
    const tactic = this.tactic
    if (tactic !== 2) {
      if (tactic === 0) return
      if (this.turns >= 4) bonus = f(50)
    }
    if (!this.ask(18)) return
    const sure = this.scene.state.sureLoot ?? []
    for (const b of this.monsters) {
      if (b.group >= 3) continue
      if (!b.fighter.ways) return
      const drop = b.fighter.drops?.[0]?.item ?? 0
      if (drop === 0) continue
      if (b.fighter.kind !== undefined && sure.includes(b.fighter.kind)) continue
      this.bonusOnly(bonus, b.group, b.id & 0xff)
    }
  }

  /** `func_ov024_021fcd7c`: kind 70, Rough 'n' Tumble's. */
  coupTumble() {
    if (!this.coupReady() || !this.ask(18) || tumbling(this.member)) return
    this.bonusOnly(f(1000), 0, this.member.id & 0xff)
  }

  /** `func_ov024_021fce14`: kind 71, at no tension. */
  coupTension() {
    if (!this.coupReady() || !this.ask(18) || this.member.tension >= 1) return
    this.bonusOnly(f(1000), 0, this.member.id & 0xff)
  }

  /** `func_ov024_021fceb0`: kind 72, Voice of Experience — the battle's experience not yet raised. */
  coupExperience() {
    let bonus = f(1000)
    const tactic = this.tactic
    if (tactic !== 2) {
      if (tactic === 0) return
      if (this.turns >= 4) bonus = f(50)
    }
    if (!this.ask(18)) return
    if (f(this.scene.state.expMultiplier ?? 1) > f(1.01)) return
    const any = this.monsters.some((b) => b.fighter.ways !== undefined && b.fighter.exp !== 0)
    if (!any) return
    this.bonusOnly(bonus, 0, 0)
  }

  /** `func_ov024_021fcfa0`: kind 74, while two of attack, defence and breaths are not at 2. */
  coupLevels() {
    if (!this.coupReady() || !this.ask(18)) return
    const lv = this.member.levels
    let at2 = 0
    if (levelAt(lv, LEVEL_SHIFT.defence) >= 2) at2++
    if (levelAt(lv, LEVEL_SHIFT.breaths) >= 2) at2++
    if (levelAt(lv, LEVEL_SHIFT.attack) >= 2) at2++
    if (at2 >= 2) return
    this.bonusOnly(f(1000), 0, this.member.id & 0xff)
  }

  /** `func_ov024_021fd954`: a state on the party, effect `e`. */
  onParty(e: number) {
    const r = this.record
    if (sideOf(r) === 1) return
    let reach = reachOf(r)
    if (reach === 6) reach = (this.tactics.traits ?? []).includes(0xe6) ? 3 : 2
    if (reach !== 2 && reach !== 1 && reach !== 4 && reach !== 3) return
    const set = new TargetSet()
    const slot = this.m.u16(A.slot)
    let any = false
    for (let i = 0; i < 4; i++) {
      if (reach === 1 && i !== slot) continue
      const b = this.party[i]
      if (!b || fallen(b)) continue
      if (flags10(r) & F10.reflectable && has(b, S.bounce)) continue
      let need = false
      let category = 8
      const lowAndUnder = (shift: number, value: number) =>
        levelAt(b.levels, shift) <= 0 && value < 999
      switch (e) {
        case 2:
          need = envenomed(b)
          break
        case 3:
          need = paralysed(b)
          break
        case 4:
          need = asleep(b)
          break
        case 7:
          need = confused(b)
          break
        case 0x11:
          need = lowAndUnder(LEVEL_SHIFT.attack, b.attack)
          category = 7
          break
        case 0x12:
          need = lowAndUnder(LEVEL_SHIFT.defence, b.defence)
          category = 7
          break
        case 0x13:
          need = lowAndUnder(LEVEL_SHIFT.agility, b.agility)
          category = 7
          break
        case 0x14:
          need = lowAndUnder(LEVEL_SHIFT.might, b.might)
          category = 7
          break
        case 0x15:
          need = lowAndUnder(LEVEL_SHIFT.mending, b.mending)
          category = 7
          break
        case 0x16:
          need = levelAt(b.levels, LEVEL_SHIFT.spells) <= 0
          category = 7
          break
        case 0x17:
          need = levelAt(b.levels, LEVEL_SHIFT.breaths) <= 0
          category = 7
          break
        case 0xd:
          need = !fourced(b)
          category = 7
          break
        case 0xe:
        case 0xf:
          need = !(fireWarded(b) || iceWarded(b) || breathWarded(b))
          category = 7
          break
        case 0x10:
          need = !has(b, S.reverse)
          category = 7
          break
        case 0xb:
          need = !has(b, S.alma)
          category = 7
          break
      }
      const entry: SetEntry = {
        value: 0,
        effect: e,
        onMonster: 0,
        target: i,
        chance: need ? 100 : 50,
        category,
        bits: 0,
      }
      if (need) any = true
      set.add(entry)
      if (riderOf(r) !== 0) this.riders(set, entry, b, b.id)
      if (reach === 1 || reach === 2) {
        if (any) this.score(set, 0, b.id & 0xff)
        set.clear()
        any = false
      }
    }
    if (reach === 3 || reach === 4) {
      if (any) this.score(set, 0, reach === 3 ? 0xff : this.member.id & 0xff)
    }
  }

  /** `func_ov024_021fdf04`: a state on the monsters, effect `e`. */
  onMonsters(e: number) {
    const r = this.record
    if (sideOf(r) === 2) return
    const base = this.chance(r)
    const count = this.count
    const chances: number[] = []
    for (let t = 0; t < count; t++) {
      const b = this.monsters[t] as Body
      let k = 1
      const w10 = flags10(r)
      if (w10 & F10.spell && spellWarded(b) && kindOf(r) !== 2) {
        k = f(k * wardMultiplier(levelAt(b.levels, LEVEL_SHIFT.spells)))
      }
      if (w10 & F10.breath && breathWarded(b)) {
        k = f(k * wardMultiplier(levelAt(b.levels, LEVEL_SHIFT.breaths)))
      }
      if (w10 & F10.defendable) {
        if (b.stance <= 3) k = f(k * guardFactor(b.stance))
        else if (hasT(b, T.spiked)) k = f(k * guardFactor(1))
      }
      chances[t] = f(f(k * this.resistance(b, r, true)) * base)
    }
    let reach = reachOf(r)
    if (reach === 5) {
      const flags = this.tactics.weapon?.flags ?? 0
      reach = flags & 2 ? 3 : flags & 1 ? 4 : 2
    }
    if (reach !== 2 && reach !== 4 && reach !== 3) return
    const code = hitCodeOf(r)
    if (code > 11) return
    const [hits, s] = STATE_HITS[code] as readonly [number, number]
    let several = s
    const set = new TargetSet()
    let reached = 0
    let skip = false
    for (let t = 0; t < count; t++) {
      let ok = true
      const b = this.monsters[t] as Body
      reached++
      if (flags10(r) & F10.reflectable && has(b, S.bounce)) skip = true
      const ch = chances[t] as number
      if (ch < 30) ok = false
      if (ok) {
        let category = 5
        let need = false
        let check = false
        let floor = f(33.3)
        switch (e) {
          case 4:
            need = !asleep(b)
            check = true
            floor = 35
            break
          case 5:
            need = !has(b, S.dazzled)
            check = true
            floor = 35
            break
          case 3:
            need = !paralysed(b)
            check = true
            break
          case 6:
            need = !fizzled(b)
            check = true
            break
          case 7:
            need = !confused(b)
            check = true
            floor = 35
            break
          case 8:
            need = !losing(b)
            check = true
            if (s16(r, 0x30) === 2 && !b.party && b.untrippable) need = false
            floor = 50
            break
          case 9:
            need = ch >= 30
            category = 2
            break
          case 0x11:
            need = -1 <= levelAt(b.levels, LEVEL_SHIFT.attack) && b.attack > 0x28
            break
          case 0x12:
            need = -1 <= levelAt(b.levels, LEVEL_SHIFT.defence) && b.defence > 0x14
            break
          case 0x13:
            need = -1 <= levelAt(b.levels, LEVEL_SHIFT.agility) && b.agility > 0x28
            break
          case 0x14:
            need = -1 <= levelAt(b.levels, LEVEL_SHIFT.might) && b.might > 0x64
            break
          case 0x15:
            need = -1 <= levelAt(b.levels, LEVEL_SHIFT.mending) && b.mending > 0x64
            break
          case 0x16:
            need = -1 <= levelAt(b.levels, LEVEL_SHIFT.spells)
            break
        }
        // Not free to be worked on: nothing of this one, and no finishing.
        if (check && !free(b)) continue
        if (ch < floor) need = false
        if (need) {
          set.add({
            value: f(s16(r, 0x30)),
            effect: e,
            onMonster: 1,
            target: t,
            chance: ffixu(ch),
            category,
            bits: (hits & 0x3f) | ((several & 1) << 6),
          })
        }
      }
      if (this.finishes(t, reach)) {
        if (reached >= 2 && several !== 0) skip = true
        if (reached <= 1) several = 0
        if (!skip) {
          if (reach === 4) this.score(set, b.group, 0xff)
          else if (reach === 3) this.score(set, 0xff, 0xff)
          else this.score(set, b.group, b.id & 0xff)
        }
        set.clear()
        reached = 0
        skip = false
      }
    }
  }

  // --- the riders --------------------------------------------------------------------

  /** `func_ov024_021fd858`: the rider's own evaluator, from the table at `0x021ffcec`. */
  riders(set: TargetSet, entry: SetEntry, target: Body, index: number) {
    this.riderSet = set
    write(this.m, A.base, entry)
    this.m.set8(A.base + 9, this.m.u8(A.base + 9) | 0x80)
    this.riderTarget = target
    this.riderIndex = index
    switch (riderOf(this.record)) {
      case 1:
        return this.riderLostTurn()
      case 2:
        return this.riderAttack()
      case 4:
        return this.riderPoison()
      case 5:
        if (envenomed(target) && this.m.u8(A.base + 5) === 0) this.riderCure(2, 8)
        return
      case 6:
        if (paralysed(target) && this.m.u8(A.base + 5) === 0) this.riderCure(3, 8)
        return
      case 7:
        return this.riderSleep()
      case 8:
        return this.riderDefence()
      case 10:
        return this.riderConfuse()
      case 11:
        return this.riderParalyse()
      case 19:
        if (confused(target) && this.m.u8(A.base + 5) === 0) this.riderCure(7, 8)
        return
      case 20:
        return this.riderDeath()
      default:
        return
    }
  }

  /** A rider's chance by its record and a resistance byte, at most 100. */
  riderChance(element: number): number {
    const k = f(f(riderChanceOf(this.record)) * f(f(resistByte(this.riderTarget, element)) / 100))
    return k > 100 ? f(100) : k
  }

  /** `func_ov024_021fd088`: the base entry, with the rider's levels, effect and chance — category 5. */
  riderEntry(p: number, effect: number) {
    const e = read(this.m, A.base)
    e.value = f(s16(this.record, 0x32))
    e.effect = effect
    e.chance = ffix(f(f(f(e.chance) * p) / 100))
    e.category = 5
    this.riderSet.add(e)
  }

  /** `func_ov024_021fd104`, `021fd160`: the same at 100, category 7 or 8. */
  riderCure(effect: number, category: number) {
    const e = read(this.m, A.base)
    e.value = f(s16(this.record, 0x32))
    e.effect = effect
    e.chance = 100
    e.category = category
    this.riderSet.add(e)
  }

  /** `func_ov024_021fd1bc`: rider 1, a lost turn. */
  riderLostTurn() {
    const b = this.riderTarget
    const r = this.record
    if (!free(b)) return
    if (!mayLose(b, s16(r, 0x32) & 0xff, idOf(r))) return
    if (losing(b)) return
    if (s16(r, 0x30) === 2 && !b.party && b.untrippable) return
    const p = this.riderChance(15)
    this.askSlot(1)
    this.riderEntry(p, 8)
  }

  /** `func_ov024_021fd2b4`: rider 2, attack lowered. */
  riderAttack() {
    const b = this.riderTarget
    if (-2 >= levelAt(b.levels, LEVEL_SHIFT.attack)) return
    if (resistByte(b, 18) === 0) return
    const p = this.riderChance(18)
    if (s16(this.record, 0x32) >= 0) return
    this.askSlot(13)
    this.riderEntry(p, 0x11)
  }

  /** `func_ov024_021fd358`: rider 4, poison. */
  riderPoison() {
    const b = this.riderTarget
    if (!mayTake(b) || envenomed(b)) return
    const p = this.riderChance(16)
    this.askSlot(1)
    this.riderEntry(p, 2)
  }

  /** `func_ov024_021fd45c`: rider 7, sleep. */
  riderSleep() {
    const b = this.riderTarget
    if (!free(b) || !maySleep(b) || asleep(b)) return
    const p = this.riderChance(10)
    this.askSlot(1)
    this.riderEntry(p, 4)
  }

  /** `func_ov024_021fd504`: rider 8, defence. */
  riderDefence() {
    const b = this.riderTarget
    if (-2 >= levelAt(b.levels, LEVEL_SHIFT.defence)) return
    if (resistByte(b, 19) === 0) return
    if (this.m.u8(A.base + 5) !== 0) {
      const p = this.riderChance(19)
      if (s16(this.record, 0x32) >= 0) return
      this.askSlot(13)
      this.riderEntry(p, 0x12)
      return
    }
    this.riderCure(0x12, 7)
  }

  /** `func_ov024_021fd5c4`: rider 10, confusion. */
  riderConfuse() {
    const b = this.riderTarget
    if (!free(b) || !mayTake(b) || confused(b)) return
    const p = this.riderChance(13)
    this.askSlot(1)
    this.riderEntry(p, 7)
  }

  /** `func_ov024_021fd66c`: rider 11, paralysis. */
  riderParalyse() {
    const b = this.riderTarget
    if (!free(b) || !mayTake(b) || paralysed(b)) return
    let p = f(f(riderChanceOf(this.record)) * f(f(resistByte(b, 17)) / 100))
    const a = idOf(this.record)
    if (a === 0x58) {
      if (!b.party && b.metal) {
        this.m.set8(A.plusD, 1)
        p = f(50)
      }
    } else if (a === 0x52 && (b.party || b.family !== 9)) return
    if (p > 100) p = f(100)
    this.askSlot(1)
    this.riderEntry(p, 3)
  }

  /** `func_ov024_021fd7b8`: rider 20, death — 12.5 by the resistance, category 2. */
  riderDeath() {
    const b = this.riderTarget
    const p = f(f(12.5) * f(f(resistByte(b, 11)) / 100))
    const e = read(this.m, A.base)
    e.value = f(s16(this.record, 0x32))
    e.chance = ffix(f(f(f(e.chance) * p) / 100))
    e.category = 2
    this.riderSet.add(e)
  }

  // --- 021f9874, the scorer ----------------------------------------------------------

  /** `func_ov024_021f9874`: a target set scored, its entry put into the lists. */
  score(set: TargetSet, group: number, target: number) {
    const m = this.m
    const s = set.m
    const count = set.count
    // The frame: sp+0x30 MP given, +0x40 HP given, +0x50 kill chances,
    // +0x70… the sums, +0xa8… the flags, +0xb8 dealt, +0xd8 killed.
    const fr = new Mem(0x130)
    let severalHits = false
    for (let i = 0; i < count; i++) {
      const at = ENTRY * i
      if (s.u8(at + 8) !== 0 || s.u8(at + 5) === 0) continue
      const t = s.u8(at + 6)
      let v = f(s.f32(at) * f(s.u8(at + 9) & 0x3f))
      if (m.u8(A.combo) !== 0) v = f(v * f(1.2))
      fr.setF(0xb8 + 4 * t, f(fr.f32(0xb8 + 4 * t) + v))
      if (fr.f32(0xb8 + 4 * t) >= f(m.s32(A.sizes + 4 * t))) fr.set32(0xd8 + 4 * t, 10)
      fr.set8(0xaa, 1)
      if (s.u8(at + 9) & 0x40) severalHits = true
    }
    // Behaviour 4: a chance of a kill (`0x021f99b4`–`0x021f9b14`).
    if (m.u8(A.flags + 4) !== 0) {
      let any = false
      for (let i = 0; i < count; i++) {
        const at = ENTRY * i
        if (s.u8(at + 8) !== 2 || s.u8(at + 5) === 0) continue
        any = true
        fr.set8(0xaa, 1)
        fr.setF(0x50 + 4 * s.u8(at + 6), f(f(0.01) * f(s.u8(at + 7))))
        if (s.u8(at + 9) & 0x40) severalHits = true
      }
      if (any) {
        for (let t = 0; t < count; t++) {
          fr.set8(0xaa, 1)
          const rest = f(f(m.s32(A.sizes + 4 * t)) - fr.f32(0xb8 + 4 * t))
          if (!(rest > 0)) continue
          let p = fr.f32(0x50 + 4 * t)
          if (this.tactic !== 0) {
            // `_f2d`, `_dmul` by 0.005 the cost, `_dsub`, narrowed.
            p = f(p - 0.005 * m.s32(A.cost))
          }
          let sq = f(p * p)
          if (sq > f(0.9)) sq = f(0.9)
          fr.setF(0xb8 + 4 * t, f(fr.f32(0xb8 + 4 * t) + f(rest * sq)))
        }
      }
    }
    // HP and MP given to the party (`0x021f9b18`–`0x021f9bac`).
    for (let i = 0; i < count; i++) {
      const at = ENTRY * i
      const cat = s.u8(at + 8)
      if (cat === 3) {
        if (s.u8(at + 5) !== 0) continue
        const t = s.u8(at + 6)
        fr.set32(0x40 + 4 * t, ffix(f(f(fr.s32(0x40 + 4 * t)) + s.f32(at))))
        fr.set8(0xae, 1)
      }
      if (cat === 4 && s.u8(at + 5) === 0) {
        const t = s.u8(at + 6)
        fr.set32(0x30 + 4 * t, ffix(f(f(fr.s32(0x30 + 4 * t)) + s.f32(at))))
        fr.set8(0xaf, 1)
      }
    }
    let cost = f(m.s32(A.cost))
    if (this.candidate.flag !== 0) cost = f(cost + 30)
    // Harm (`0x021f9bdc`–`0x021f9ca8`).
    if (fr.u8(0xaa) !== 0) {
      for (let t = 0; t < m.s32(A.count); t++) {
        let d = fr.f32(0xb8 + 4 * t)
        if (!(d > 0)) continue
        const size = m.s32(A.sizes + 4 * t)
        if (d >= f(size)) d = f(size)
        const most = (this.monsters[t] as Body).maxHp
        fr.setF(0x78, f(fr.f32(0x78) + f(f(f(100) * d) / f(most))))
      }
      if (this.candidate.flag !== 0 && this.tactic !== 0) fr.setF(0x78, 0)
    }
    // Heal (`0x021f9cac`–`0x021f9dc4`).
    if (fr.u8(0xae) !== 0) {
      for (let i = 0; i < 4; i++) {
        const given = fr.s32(0x40 + 4 * i)
        if (given === 0) continue
        const b = this.party[i] as Body
        let v = f(f(f(100) * f(given)) / f(b.maxHp))
        if (i === m.s32(A.weakest)) v = f(v * 2)
        fr.setF(0x88, f(fr.f32(0x88) + v))
      }
      if (m.s32(A.cost) !== 0) {
        if (this.candidate.action === 0x310) {
          fr.setF(0x88, f(fr.f32(0x88) * (m.s32(A.low08) >= 2 ? f(0.66) : f(0.55))))
          if (m.u8(A.twoLow) === 0) fr.setF(0x88, 0)
        } else if (this.candidate.action === 0x21) {
          fr.setF(0x88, f(fr.f32(0x88) * f(0.9)))
        }
      }
    }
    // Category 5 on the party: the chances summed (`0x021f9dc8`–`0x021f9e18`).
    for (let i = 0; i < count; i++) {
      const at = ENTRY * i
      if (s.u8(at + 8) !== 5 || s.u8(at + 5) !== 0) continue
      fr.setF(0x84, f(fr.f32(0x84) + f(s.u8(at + 7))))
      fr.set8(0xad, 1)
    }
    if (this.candidate.action === 0x28) {
      fr.set8(0xae, 1)
      fr.setF(0x88, f(400))
    }
    // The changes of state, each to its slot (`0x021f9e40`–`0x021fa2c8`).
    for (let i = 0; i < count; i++) {
      const at = ENTRY * i
      const bits = s.u8(at + 9)
      let w: number
      let on = 1
      if (bits & 0x80) {
        w = f(f(0.01) * f(m.u8(A.values + m.s32(A.bySlot))))
        on = m.u8(A.bySlotFlag)
      } else {
        w = f(f(0.01) * f(m.u8(A.values + m.s32(A.asked))))
      }
      const slot = [0, 0, 0, 0]
      const cat = s.u8(at + 8)
      const effect = s.u8(at + 4)
      const onMonster = s.u8(at + 5)
      const t = s.u8(at + 6)
      if (cat === 8) {
        if (onMonster !== 0) continue
        slot[0] = f(10)
        for (const [e, weight] of CURE_WEIGHTS) if (effect === e) slot[0] = f(weight)
      } else if (cat === 7) {
        if (onMonster !== 0) continue
        if (effect === 0xd) {
          slot[1] = f(sdiv(m.s32(A.fourceMost) * 13, 100))
        } else {
          for (const [e, k, weight] of ALLY_WEIGHTS) {
            if (effect !== e) continue
            slot[k] = on === 0 ? 0 : f(weight)
            if (effect === 0x11 && word(this.record, 0x14) >>> 28 === 2 && t < 4) {
              slot[k] = f((slot[k] as number) * m.f32(A.shares + 4 * t))
            }
            // −3: the game makes its constant by negating 1.5's bits as a whole
            // number (`rsb r0, r0, #0` on `0x3fc00000`, `0x021fa034`), which is −3.0.
            if (s.f32(at) < 0) slot[k] = f(f(weight) * -3)
            break
          }
        }
      } else if (cat === 6) {
        if (onMonster === 0) continue
        slot[3] = f(0 + s.f32(at))
      } else if (cat === 5) {
        if (onMonster === 0) continue
        if (fr.s32(0xd8 + 4 * t) !== 0) continue
        if (effect === 0x12) {
          const b = this.monsters[t]
          if (b) {
            let v = f(f(f(100) * f((b.baseDefence & 0xffff) >> 2)) / f(b.maxHp))
            if (v > f(29)) v = f(29)
            slot[2] = v
          }
        } else {
          for (const [e, k, weight] of FOE_WEIGHTS) {
            if (effect !== e) continue
            slot[k] = on === 0 ? 0 : f(weight)
          }
        }
      }
      const ch = f(s.u8(at + 7))
      if ((slot[0] as number) !== 0) {
        fr.setF(0x90, f(fr.f32(0x90) + f(f(0.01) * f((slot[0] as number) * ch))))
        fr.set8(0xb0, 1)
      }
      if ((slot[1] as number) !== 0) {
        fr.setF(0x94, f(fr.f32(0x94) + f(w * f(f(0.01) * f((slot[1] as number) * ch)))))
        fr.set8(0xb1, 1)
      }
      if ((slot[2] as number) !== 0) {
        fr.setF(0x98, f(fr.f32(0x98) + f(w * f(f(0.01) * f((slot[2] as number) * ch)))))
        fr.set8(0xb2, 1)
      }
      if ((slot[3] as number) !== 0) {
        fr.setF(0x9c, f(fr.f32(0x9c) + f(w * f(f(0.01) * f((slot[3] as number) * ch)))))
        fr.set8(0xb3, 1)
      }
    }
    // The lists (`0x021fa2c8`–`0x021fa718`).
    const entry = new Mem(ENTRY)
    entry.set16(0, this.candidate.action)
    entry.set8(2, this.candidate.bag)
    entry.set8(3, this.candidate.flag)
    entry.set8(0xa, group)
    entry.set8(0xb, target)
    entry.set16(8, m.s32(A.cost))
    const put = (n: number, score: number) => {
      entry.setF(4, score)
      insert(m, list(n), entry)
    }
    let harm = 0
    if (fr.u8(0xaa) !== 0) {
      harm = fr.f32(0x78)
      if (m.u8(A.plusD) !== 0) harm = f(harm + fr.f32(0x9c))
      if (severalHits) harm = f(harm * m.f32(A.several))
      put(2, f(harm - f(f(0.01) * cost)))
      if (cost === 0) put(3, entry.f32(4))
    }
    if (fr.u8(0xad) !== 0) put(5, f(fr.f32(0x84) - f(f(0.1) * cost)))
    if (m.u8(A.needy) !== 0 && fr.u8(0xae) !== 0) put(6, f(fr.f32(0x88) - f(f(0.1) * cost)))
    const factor = this.tactic === 0 ? f(0.01) : f(0.1)
    let b9 = 0
    let b10 = 0
    let b11 = 0
    if (fr.u8(0xb0) !== 0) {
      put(8, f(f(fr.f32(0x90) - f(f(0.1) * cost)) + f(f(0.01) * fr.f32(0x88))))
    }
    if (this.tactic === 2 && idOf(this.record) !== CRITICAL_CLAIM) harm = f(harm * f(0.3))
    if (fr.u8(0xb1) !== 0) {
      b9 = f(fr.f32(0x94) - f(cost * factor))
      put(9, b9)
    }
    if (fr.u8(0xb2) !== 0) {
      b10 = f(fr.f32(0x98) - f(cost * factor))
      put(10, b10)
    }
    if (fr.u8(0xb3) !== 0) {
      b11 = f(fr.f32(0x9c) - f(cost * factor))
      put(11, b11)
    }
    // A wand drinking MP, at the member's own MP (`0x021fa56c`–`0x021fa690`).
    if (this.tactic !== 0 && idOf(this.record) === 1) {
      const weapon = this.tactics.weapon
      const t0 = s.u8(6)
      const aimed = t0 < 8 ? this.monsters[t0] : undefined
      if (weapon && weapon.kind === 3 && !zoned(this.member) && aimed && aimed.mp > 0) {
        const share = f(f(this.member.mp) / f(this.member.maxMp))
        if (share <= f(0.1)) set.bonus = f(set.bonus + 50)
        if (share <= f(0.3)) set.bonus = f(set.bonus + 30)
        if (share <= 0.5) set.bonus = f(set.bonus + 10)
      }
    }
    const all = f(f(f(f(set.bonus + b9) + b10) + b11) + harm)
    put(0, f(all - f(cost * factor)))
    if (!(harm > 0) || m.s32(A.cost) <= 0) put(1, entry.f32(4))
  }
}

/** `func_ov024_021f68c8`: a list cleared — no action, no item, score −1. */
function clearList(m: Mem, at: number) {
  for (let k = 0; k < 4; k++) {
    m.set16(at + ENTRY * k, 0)
    m.set8(at + ENTRY * k + 2, -1)
    m.set8(at + ENTRY * k + 3, 0)
    m.setF(at + ENTRY * k + 4, -1)
  }
}

/**
 * `func_ov024_021f6830`: an entry put into a list of four, best first. One
 * under the fourth is dropped; one above an entry takes its place — and
 * **that entry is copied one down, the rest left as they were**: the game's
 * loop copies the same entry each time round (`0x021f6888`).
 */
function insert(m: Mem, at: number, entry: Mem) {
  const score = entry.f32(4)
  if (score < m.f32(at + 0x28)) return
  for (let i = 0; i < 4; i++) {
    if (!(score > m.f32(at + ENTRY * i + 4))) continue
    if (i < 3) m.copy(at + ENTRY * (i + 1), at + ENTRY * i, ENTRY)
    for (let k = 0; k < ENTRY; k++) m.set8(at + ENTRY * i + k, entry.u8(k))
    return
  }
}

/** `func_ov024_021f691c`: a list taken where its first entry's score is above nothing. */
function take(m: Mem, at: number): TacticChoice | undefined {
  if (!(m.f32(at + 4) > 0)) return undefined
  return {
    action: m.u16(at),
    bag: m.s8(at + 2),
    group: m.u8(at + 0xa),
    target: m.u8(at + 0xb),
  }
}

/** `NextRandomBetween`: `NextRandomMax(most − least + 1) + least`. */
function between(rng: BattleRng, least: number, most: number): number {
  return rng.below(most - least + 1) + least
}

/** `RoundUp`: `0.5 + x`, truncated, as a float. */
function roundUp(x: number): number {
  return f(Math.trunc(f(0.5 + x)))
}

// ---------------------------------------------------------------------------
// Reached as the game reaches them

/**
 * **The Attack on the weakest monster** — `func_ov024_021f8628`: over the
 * groups and their members, the one standing whose HP over its most is the
 * lowest, strictly, from 1.1. None, nothing chosen.
 */
function weakestAttack(p: Planner): TacticChoice | undefined {
  let best = f(1.1)
  let pick: Body | undefined
  for (const members of p.groups) {
    for (const b of members) {
      if (fallen(b)) continue
      const share = hpShare(b)
      if (!(share < best)) continue
      best = share
      pick = b
    }
  }
  return pick ? { action: 1, bag: -1, group: pick.group, target: pick.id } : undefined
}

/** The tactics' lists in their order — `func_ov024_021f8144`, `021f81dc`, `021f84f0`, `021f83f8`, `021f8300`. */
function fromLists(p: Planner): TacticChoice | undefined {
  const m = p.m
  const turns = p.turns
  const tries: number[] = []
  switch (p.tactic) {
    case 0:
      m.setF(A.weight, 0)
      m.setF(A.threshold, f(0.08))
      p.scoreAll()
      tries.push(6, 2)
      break
    case 1:
      m.setF(A.threshold, f(0.4))
      p.scoreAll()
      tries.push(6, 5)
      if (turns >= 4) tries.push(8)
      tries.push(...(turns >= 4 ? [0, 2] : [3]))
      break
    case 2:
      m.setF(A.threshold, 0.25)
      p.scoreAll()
      tries.push(6, 5)
      if (turns >= 4) tries.push(8)
      tries.push(...(turns >= 2 ? [0, 2] : [1, 3]))
      break
    case 3:
      m.setF(A.threshold, f(0.6))
      p.scoreAll()
      tries.push(6, 5)
      if (turns >= 2) tries.push(8, 1)
      tries.push(3)
      break
    case 4:
      m.setF(A.threshold, f(0.4))
      p.scoreAll()
      tries.push(6, 5)
      if (turns >= 4) tries.push(8)
      tries.push(0, 3)
      break
  }
  for (const n of tries) {
    const got = take(m, list(n))
    if (got) return got
  }
  return weakestAttack(p)
}

/**
 * **A member's tactic at their turn** — `func_ov024_021f8f20`, for a member
 * whose action is the Attack: their tactic's lists, set up with the battle's
 * own draws. Undefined for Follow Orders, or where nothing is chosen.
 */
export function turnChoice(
  state: BattleState,
  fighters: readonly FighterState[],
  member: number,
  records: ReadonlyMap<number, AiRecord>,
  rng: BattleRng,
): TacticChoice | undefined {
  const me = fighters[member]
  const tactics = me?.tactics
  if (!me || !tactics) return undefined
  const tactic = tactics.tactic & 0xff
  if (tactic === 5) return undefined
  const p = new Planner({ state, fighters, records }, rng)
  p.tactics = tactics
  p.read(member)
  if (tactic > 5) return weakestAttack(p)
  p.m.set16(A.slot, p.member.id)
  p.m.setF(A.threshold, 0.5)
  p.m.set8(A.tactic, tactic)
  p.setUp()
  return fromLists(p)
}

/**
 * **The command phase's part** — `func_ov024_021f9030`, for each of the
 * party in slot order whose action is the Attack: one of six actions that
 * must be decided before anyone acts, by their tactic and the party's state.
 * No draw. `before`, the tactic the AI object held from the member before
 * (see the header); `chosen`, the actions the party's command records hold.
 */
export function commandPhaseChoice(
  state: BattleState,
  fighters: readonly FighterState[],
  member: number,
  records: ReadonlyMap<number, AiRecord>,
  before: number | undefined,
  chosen: ReadonlyMap<number, number>,
): TacticChoice | undefined {
  const me = fighters[member]
  const tactics = me?.tactics
  if (!me || !tactics) return undefined
  const tactic = tactics.tactic & 0xff
  if (tactic >= 5) return undefined
  const p = new Planner({ state, fighters, records }, undefined)
  p.tactics = tactics
  p.read(member)
  const self = p.member
  // `func_ov000_02155f9c`: able to act.
  if (fallen(self) || paralysed(self) || asleep(self) || losing(self)) return undefined
  const m = p.m
  m.set16(A.slot, self.id)
  m.setF(A.threshold, f(0.4))
  if (before === 2) m.setF(A.threshold, 0.25)
  m.set8(A.tactic, tactic)
  m.set8(A.commandPhase, 1)
  const mercy = tactic === 0
  const wisely = tactic === 1 || tactic === 4
  const mix = tactic === 2
  const healing = tactic === 3
  p.setUp()
  // The party's own (`0x021f9174`–`0x021f9218`).
  // `+0x18` bit 11 on anyone of the party — not kept, so never.
  const watched = false
  let watching = false
  let covering = false
  for (let i = 0; i < 4; i++) {
    const b = p.party[i]
    if (!b || fallen(b)) continue
    const action = chosen.get(b.at) ?? 1
    if (action === KNIGHT_WATCH) {
      watching = true
      continue
    }
    if (action === SELFLESSNESS || action === WHIPPING_BOY || action === FORBEARANCE) {
      covering = true
    }
  }
  // The ten it may take, each it holds and can pay for (`0x021f9228`–`0x021f933c`).
  const held = new Set<number>()
  let freeHeal = false
  const n = m.s32(A.candidates)
  for (let i = 0; i < n; i++) {
    const r = records.get(m.u16(A.candidate + 4 * i))
    if (!r) continue
    if (kindOf(r) === 2) {
      if (p.payable(r).ok && m.u8(A.candidate + 4 * i + 3) === 0) freeHeal = true
      continue
    }
    if (!atRoundStart(r) && ((word(r, 0x2c) >>> 14) & 0x3f) === 0) continue
    const { ok, cost } = p.payable(r)
    if (!ok) continue
    if (tactic === 4 && cost !== 0) continue
    if ((ROUND_START_ACTIONS as readonly number[]).includes(idOf(r))) held.add(idOf(r))
  }
  const share = (i: number) => m.f32(A.share + 4 * i)
  const weakest = m.s32(A.weakest)
  // 1. Knight Watch.
  if (held.has(KNIGHT_WATCH) && !watched && !watching && !mercy && (!wisely || p.turns > 2)) {
    if (!freeHeal || weakest === self.id || !(share(weakest) < m.f32(A.threshold))) {
      return { action: KNIGHT_WATCH, bag: -1, group: 0, target: self.id }
    }
  }
  // 2. Mercurial Thrust, on one monster its forecast fells.
  if (held.has(MERCURIAL_THRUST) && p.count <= 1 && (mercy || wisely || mix)) {
    const r = records.get(MERCURIAL_THRUST)
    const first = p.monsters[0]
    if (r && first) {
      p.record = r
      m.set32(A.cost, word(r, 8) & 0xff)
      const out = p.forecast({ value: -1 }, undefined, first, 0)
      if (out.least > f(first.hp)) {
        return { action: MERCURIAL_THRUST, bag: -1, group: first.group, target: first.id }
      }
    }
  }
  // 3. At a quarter or less: Defending Champion, else Defend.
  if (!(hpShare(self) > 0.25) && !watched && !watching && healing && !freeHeal) {
    const action = held.has(DEFENDING_CHAMPION) ? DEFENDING_CHAMPION : DEFEND
    return { action, bag: -1, group: 0, target: self.id }
  }
  // 4. Forbearance, Selflessness, Whipping Boy for the weakest.
  if (!held.has(FORBEARANCE) && !held.has(SELFLESSNESS) && !held.has(WHIPPING_BOY)) return undefined
  if (!healing || m.s32(A.low08) === 0) return undefined
  if (watched || watching || covering || freeHeal) return undefined
  if (hpShare(self) < 0.5) return undefined
  if (weakest === self.id || weakest < 0 || weakest > 4 || self.id > 4) return undefined
  const hp = (i: number) => m.s32(A.hp + 4 * i)
  if (hp(self.id) < hp(weakest) << 1) return undefined
  let action = 0
  if (m.s32(A.low08) >= 2 && held.has(FORBEARANCE)) action = FORBEARANCE
  else if (held.has(SELFLESSNESS)) action = SELFLESSNESS
  else if (held.has(WHIPPING_BOY)) action = WHIPPING_BOY
  else if (held.has(FORBEARANCE)) action = FORBEARANCE
  if (action === 0) return undefined
  return { action, bag: -1, group: 0, target: action === FORBEARANCE ? self.id : weakest }
}

/**
 * **The battle's command for a choice** — the candidate's own, aimed at the
 * choice's target: a party slot or a monster's id, and for 0xff the first
 * standing of the group or the side the action is aimed at. Undefined where
 * the battle cannot play the action.
 */
export function tacticCommand(
  choice: TacticChoice,
  fighters: readonly FighterState[],
  member: number,
  records: ReadonlyMap<number, AiRecord>,
): Command | undefined {
  const me = fighters[member]
  const tactics = me?.tactics
  if (!me || !tactics) return undefined
  const party = fighters.flatMap((g, i) => (g.side === 'party' ? [i] : []))
  const r = records.get(choice.action)
  const onFoes = r ? sideOf(r) !== 2 : true
  const standing = (i: number) => {
    const g = fighters[i]
    return !!g && g.hp > 0 && !g.fled
  }
  let target: number
  if (choice.target === 0xff || (onFoes && choice.target < MONSTER_ID)) {
    const kinds: (number | undefined)[] = []
    const groupOf = (g: FighterState) => {
      let k = kinds.indexOf(g.kind)
      if (k < 0) {
        k = kinds.length
        kinds.push(g.kind)
      }
      return k
    }
    const foes = fighters.flatMap((g, i) => (g.side === 'foes' && !g.fled ? [i] : []))
    const pick = onFoes
      ? foes.find(
          (i) =>
            standing(i) &&
            (choice.group === 0xff || groupOf(fighters[i] as FighterState) === choice.group),
        )
      : party.find(standing)
    target = pick ?? (onFoes ? (foes[0] ?? -1) : member)
  } else if (choice.target >= MONSTER_ID) {
    target = choice.target - MONSTER_ID
  } else {
    target = party[choice.target] ?? member
  }
  if (choice.action === 1) return { kind: 'attack', target }
  // Defend, which the command phase may choose and no list holds.
  if (choice.action === DEFEND) return { kind: 'defend' }
  const all = [...tactics.spells, ...tactics.abilities, ...tactics.items]
  const c =
    tactics.coup?.action === choice.action && choice.bag < 0
      ? tactics.coup
      : all.find(
          (x) => x.action === choice.action && (choice.bag < 0 || (x.bag ?? -1) === choice.bag),
        )
  const command = c?.command
  if (!command) return undefined
  return retarget(command, target)
}

/** A command aimed anew — its `target`, where it has one. */
function retarget(command: Command, target: number): Command {
  switch (command.kind) {
    case 'attack':
    case 'change':
    case 'spell':
    case 'blow':
      return { ...command, target }
    case 'item':
      return command.heal ? { ...command, target } : command
    case 'stance':
      // Whom Whipping Boy protects; the others read no target.
      return { ...command, target }
    case 'psyche':
      return command.target === undefined ? command : { ...command, target }
    default:
      return command
  }
}
