import type { BattleState, Command, FighterState } from '@minstrel/sim'
import type { Named } from './battle-text.ts'

/**
 * **The battle's command phase**, as the game runs it — overlay 0's menu
 * (`func_ov000_021735d0`, every frame of state 7) and overlay 26's round set-up
 * (`func_ov026_021dc8fc`). Read 2 October 2026 (USA). The state here is the
 * game's two stacks of menu states — the party's and each member's — told as
 * one step at a time.
 *
 * - **Each round opens on the party menu** (`func_ov000_02174c14`): Fight,
 *   Examine, Flee, Misc., one column. Fight asks the members; Flee is the
 *   whole party's.
 * - **A member is asked** when standing, not asleep, and following orders
 *   (`func_ov000_0217f6bc`), in the party's order; their own six commands, two
 *   columns by three rows; Spells and Abilities lists, four rows a page; Items;
 *   then whom, by the action's side and reach (`func_ov000_02171210`).
 * - **B** goes back a step; in a member's commands, to the member before,
 *   their choice discarded (`func_ov000_0217f78c`); on the first, to the
 *   party menu. **There is no confirming**: the last choice ends the phase.
 * - **Misc. → Tactics** sets a member's tactic, or every member's but the
 *   player's own (`func_ov000_0217d438`).
 *
 * - **Examine** (`func_ov000_0217df08`) says a page for each monster in a
 *   state worth telling, from `str_ex2`, and costs nothing — see
 *   {@link examinePages}.
 * - **Misc. → Line-Up** (`func_ov000_0217dcf0`) puts a member in the Front
 *   Line or the Back Line, free — see `Fighter.backLine`.
 *
 * - **Misc. → Equipment** (`func_ov000_0217ce24`, states 5, 6, 7 and 32)
 *   changes a member's weapon, and only their weapon, free — see {@link Arms}.
 *
 * **Ours**, each marked where it lives: the AI of a member not following
 * orders is not read, and they hand in no command (the battle's own default,
 * an attack); a Coup de Grâce is never ready, its readiness not being
 * modelled.
 */

/** The party menu's rows, top to bottom (`data_ov000_021833e8`), and each one's word in `strstd`. */
export const PARTY_ROWS = ['fight', 'examine', 'flee', 'misc'] as const
export type PartyRow = (typeof PARTY_ROWS)[number]
export const PARTY_WORDS: Readonly<Record<PartyRow, number>> = {
  fight: 23,
  misc: 22,
  examine: 24,
  flee: 25,
}

/**
 * A member's commands by number — `str_btl` 30004 + it — and the grid they are
 * drawn in, row by row (`data_ov000_021834f8`): Attack and Abilities, Spells
 * and Items, Defend and Coup de Grâce.
 */
export const MEMBER_COMMANDS = ['attack', 'spells', 'defend', 'abilities', 'items', 'coup'] as const
export type MemberCommand = (typeof MEMBER_COMMANDS)[number]
export const COMMAND_GRID = [0, 3, 1, 4, 2, 5] as const
export const COMMAND_WORD_BASE = 30004

/** The tactics by value — `str_btl` 30014 + it — and their grid, row by row (`data_ov000_021834e0`). */
export const TACTIC_GRID = [0, 3, 1, 4, 2, 5] as const
export const TACTIC_WORD_BASE = 30014
export const FOLLOW_ORDERS = 5

/** Misc.'s rows, `str_btl` 30010, 30011, 30012 — Call to Arms, 30035, is a wireless session's. */
export const MISC_ROWS = ['tactics', 'equipment', 'lineUp'] as const
export const MISC_WORD_BASE = 30010

/** How many rows a list shows at once (`func_ov000_0217ab8c`). */
export const LIST_ROWS = 4

/** What a battle's messages say, by number in `str_btl`. */
export const COMMAND_SAYS = {
  /** "…doesn't know any battle <str_2> yet." — with 30021 spells or 30022 abilities. */
  knowsNone: 30023,
  spells: 30021,
  abilities: 30022,
  /** "…isn't carrying any items." */
  carriesNone: 30024,
  notEnoughMp: 30020,
  notEnoughGold: 34,
  /** The tactics refused: a party of one. */
  noTactics: 30036,
  /** A monster group's line: "<SGL_M_NAME> × <val_1>". */
  group: 30031,
  /** Line-Up's two words, by the row: 30033 + 1 for the Back Line. */
  frontLine: 30033,
  /** Equipment's: a weapon kind's word, 7 + its kind — Swords to Bows. */
  weaponKinds: 7,
  /** "…equips himself with X", or of a fallen member 21. */
  equips: 20,
  equipsFallen: 21,
  /** "…takes off X", or of a fallen member 23. */
  takesOff: 22,
  takesOffFallen: 23,
  /** "…isn't carrying any equipment." */
  carriesNoEquipment: 35,
} as const

/** A weapon as Equipment offers it: its item, its kind 0–11, and what it adds. */
export interface Weapon {
  readonly item: number
  /** Its kind, 0 Swords to 11 Bows — the item's skill tree less one. */
  readonly kind: number
  readonly name: string
  /** Its name as a message tells it, articles and all. */
  readonly named: Named
  /** What it adds to its wielder's attack, defence and agility. */
  readonly attack: number
  readonly defence: number
  readonly agility: number
}

/**
 * **A member's weapons, as Equipment sees them** (`func_ov000_0217ce24`): the
 * one in hand, and the party's bag's weapons **of the kinds the member may
 * wield** — a kind by the vocation's four weapon trees, or the tree's "may
 * wield" panel (`func_020dd3cc`, `func_020dd11c`, `func_02083b00`). The caller
 * filters the bag so.
 *
 * - The kinds offered are those the bag holds, and the kind in hand, so it
 *   can be taken off (`func_ov000_0217c514`); none, and the member "isn't
 *   carrying any equipment" (35).
 * - Choosing the weapon in hand takes it off (22); another puts it on, the old
 *   one back in the bag (20). **Free**: Misc. comes back, and the member's
 *   figure and attack are rebuilt.
 *
 * **Ours**: a kind's list is the weapon in hand, then the bag's in its order
 * (`func_0207c984`, which builds it, is not read); no weapon is cursed (the
 * def's bit 18 is not read — lines 36, 37).
 */
export interface Arms {
  readonly inHand?: Weapon | undefined
  readonly bag: readonly Weapon[]
}

/** The kinds Equipment offers, ascending. */
export function armsKinds(arms: Arms): number[] {
  const kinds = new Set(arms.bag.map((w) => w.kind))
  if (arms.inHand) kinds.add(arms.inHand.kind)
  return [...kinds].sort((a, b) => a - b)
}

/** One kind's weapons: the one in hand, then the bag's — see {@link Arms}. */
export function armsOfKind(arms: Arms, kind: number): Weapon[] {
  return [
    ...(arms.inHand?.kind === kind ? [arms.inHand] : []),
    ...arms.bag.filter((w) => w.kind === kind),
  ]
}

/**
 * **Examine's line for one monster** — `str_ex2` (`func_ov000_0217ff34`),
 * the first test that holds, by what the battle keeps of it: its tension
 * (56 super-high … 59 slightly raised), a defence level (35 up two … 38 down
 * two), an agility level (39 … 42), sleep (7), poison (23). None for a
 * monster in none of them.
 *
 * **Ours**: the game's other tests come first or between — an enraged
 * monster's fixed target (4, 5), its attack (31–34), a barrier (21), the
 * Burn (24), a mist (25), its spell resistance (48–51), dodging (55), might
 * (44, 45), mending (46, 47), paralysis (6), confusion (8), the falls and the
 * fits (9–15), the hallucination and the dazzle (16–19), a seal (20),
 * charm (43) and breath (52, 53) — none of which the battle keeps yet.
 * INFERRED: a level's status bit (`0x800`, `0x1000`) is set while it is
 * not 0.
 */
export function examineLine(f: FighterState): number | undefined {
  const tension = f.states.tension ?? 0
  if (tension > 0) return 60 - Math.min(tension, 4)
  const byLevel = (level: number, base: number) =>
    level === 2 ? base : level === 1 ? base + 1 : level === -1 ? base + 2 : base + 3
  if (f.states.defence.level !== 0) return byLevel(f.states.defence.level, 35)
  if (f.states.agility.level !== 0) return byLevel(f.states.agility.level, 39)
  if (f.states.sleep !== undefined) return 7
  if (f.states.poisoned) return 23
  return undefined
}

/** One of Examine's pages: its `str_ex2` line, and the monster it names. */
export interface Examined {
  readonly line: number
  readonly monster: number
}

/**
 * **What Examine says** (`func_ov000_0217df08`, sub-step 1): a page for each
 * monster with a line, in the order a choice walks them; where none has one,
 * one general line naming the highest-level monster — the first of the
 * highest — by the world's coin, `W(100) & 1`: 0 "…is sizing up the party",
 * 1 "…is preparing to attack", and 2 or 3 the same of several. `coin` is that
 * draw.
 *
 * **Ours**: lines 60–63, "…hasn't noticed the party's presence yet" and
 * "…frozen stock-still with surprise", which stand in its place in the round
 * the party has the jump (`ui+0x954`, `0x955`, whose writer is not read).
 */
export function examinePages(state: BattleState, coin: () => number): Examined[] {
  const targets = monsterTargets(state)
  const pages = targets.flatMap((i) => {
    const f = state.fighters[i]
    const line = f && examineLine(f)
    return line === undefined ? [] : [{ line, monster: i }]
  })
  if (pages.length > 0) return pages
  let highest = targets[0] ?? -1
  for (const i of targets) {
    if ((state.fighters[i]?.level ?? 0) > (state.fighters[highest]?.level ?? 0)) highest = i
  }
  return [{ line: (coin() & 1) + (targets.length > 1 ? 2 : 0), monster: highest }]
}

/** Whom an action is aimed at, and how far — an action record's `side` and `reach`. */
export interface Aim {
  readonly side: number
  readonly reach: number
}

/** One line of a Spells or Abilities list, or an item. */
export interface Entry extends Aim {
  readonly action: number
  readonly name: string
  /** What it costs in MP — 255 "at least 1"; or in gold, where {@link gold} is set. */
  readonly cost: number
  readonly gold?: boolean
  /** Whether a fallen ally is the one to choose — revival (`+0x18` kind 18); Zing takes either. */
  readonly fallen?: 'only' | 'either'
  /** The battle's command for it, at a target — a fighter's index, or −1 for none. */
  command(target: number): Command
}

export interface ItemEntry extends Aim {
  readonly item: number
  readonly name: string
  readonly count: number
  command(target: number): Command
}

/** A member as the menu has them. */
export interface Asked {
  /** Their place among the battle's fighters. */
  readonly fighter: number
  readonly name: string
  /** Their tactic — see `Member.tactic`. */
  readonly tactic: number
  /** The player's own character, whose tactic cannot be set. */
  readonly own: boolean
  /** A guest, who acts by themselves — a story companion. **Ours**: guests are not read. */
  readonly guest: boolean
  readonly spells: readonly Entry[]
  readonly abilities: readonly Entry[]
  readonly items: readonly ItemEntry[]
  /** In the Back Line — see `Fighter.backLine`. */
  readonly backLine?: boolean
  /** Their weapons, for Equipment — see {@link Arms}. None, and they are not offered. */
  readonly arms?: Arms
  /** Their gender, which a message about them chooses its words by: 0 he, 1 she. */
  readonly gender?: number
}

/** A weapon changed in this phase: whose, and what is in hand now — undefined, nothing. */
export interface Armed {
  readonly fighter: number
  readonly from: Weapon | undefined
  readonly to: Weapon | undefined
}

/** Where the menu is. */
export type Step =
  | { readonly at: 'party'; readonly cursor: number }
  | { readonly at: 'member'; readonly member: number; readonly cursor: number }
  | {
      readonly at: 'list'
      readonly list: 'spells' | 'abilities' | 'items'
      readonly member: number
      readonly cursor: number
      /** The command grid's place to come back to. */
      readonly from: number
    }
  | {
      readonly at: 'monster'
      readonly member: number
      readonly cursor: number
      readonly pending: Pending
    }
  | {
      readonly at: 'ally'
      readonly member: number
      readonly cursor: number
      readonly pending: Pending
      /** State 20's list, without the member themselves; 19's the line-up only. */
      readonly exceptSelf: boolean
    }
  | { readonly at: 'say'; readonly say: Said; readonly back: Step }
  | { readonly at: 'examine'; readonly pages: readonly Examined[]; readonly page: number }
  | { readonly at: 'lineUp'; readonly cursor: number }
  | { readonly at: 'armsWho'; readonly cursor: number }
  | { readonly at: 'armsKind'; readonly member: number; readonly cursor: number }
  | {
      readonly at: 'armsWeapon'
      readonly member: number
      readonly kind: number
      readonly cursor: number
    }
  | { readonly at: 'misc'; readonly cursor: number }
  | { readonly at: 'tactics'; readonly cursor: number }
  | { readonly at: 'tactic'; readonly who: number | 'all'; readonly cursor: number }
  | { readonly at: 'done' }

/** A message the menu puts up, with what it names. */
export interface Said {
  readonly number: number
  readonly actor?: string
  /** The actor's gender — see `Asked.gender`. */
  readonly actorGender?: number
  readonly str2?: number
  /** The item it names. */
  readonly item?: Named
}

/** What a member's panel says of their choice (`func_ov000_0217f480`). */
export type Caption = { readonly word: number } | { readonly name: string }

/** The caption of a flight, `str_btl` 30001. */
export const FLEE_CAPTION = 30001

/** A choice made, waiting for whom. */
export interface Pending {
  readonly command: (target: number) => Command
  readonly aim: Aim
  readonly fallen?: 'only' | 'either'
  /** The step to go back to with B. */
  readonly back: Step
  /** What the panel shows for it once chosen: a `str_btl` word, or the action's or item's name. */
  readonly caption: Caption
}

export interface Commanding {
  readonly members: readonly Asked[]
  readonly step: Step
  /** Each asked member's choice, by fighter, with the word the panel shows. */
  readonly chosen: ReadonlyMap<number, { readonly command: Command; readonly caption: Caption }>
  /** Tactics set in this phase, by fighter — for the caller to keep. */
  readonly tactics: ReadonlyMap<number, number>
  /** Rows set in this phase, by fighter — true the Back Line — for the caller to keep. */
  readonly lines: ReadonlyMap<number, boolean>
  /** Weapons changed in this phase, in order — for the caller to apply. */
  readonly armed: readonly Armed[]
}

/** The members Equipment may change: those it has weapons for, who are not guests. */
export function armsMembers(c: Commanding): number[] {
  return c.members.flatMap((m, k) => (m.arms && !m.guest ? [k] : []))
}

/** Whether a member stands in the Back Line now, Line-Up's change and all. */
export function inBackLine(c: Commanding, m: Asked): boolean {
  return c.lines.get(m.fighter) ?? m.backLine ?? false
}

const alive = (state: BattleState, i: number) => {
  const f = state.fighters[i]
  return !!f && f.hp > 0 && !f.fled
}

/**
 * Whether a member is asked (`func_ov000_0217f6bc`): standing, not asleep,
 * following orders, and no guest. Paralysis and "Inactive" are not modelled.
 */
export function isAsked(
  state: BattleState,
  m: Asked,
  tactics?: ReadonlyMap<number, number>,
): boolean {
  const f = state.fighters[m.fighter]
  if (!f || f.hp <= 0 || f.states.sleep !== undefined || m.guest) return false
  return (tactics?.get(m.fighter) ?? m.tactic) === FOLLOW_ORDERS
}

/** The monsters a choice walks: the living, group by group (`0x021d92d8`–`0x021d9560`). */
export function monsterTargets(state: BattleState): number[] {
  const out: number[] = []
  const kinds: string[] = []
  state.fighters.forEach((f) => {
    if (f.side === 'foes' && f.hp > 0 && !f.fled && !kinds.includes(f.name)) kinds.push(f.name)
  })
  for (const kind of kinds) {
    state.fighters.forEach((f, i) => {
      if (f.side === 'foes' && f.name === kind && f.hp > 0 && !f.fled) out.push(i)
    })
  }
  return out
}

/** The monster groups shown, one line each: the kind and how many are still targets. */
export function monsterGroups(
  state: BattleState,
): { readonly first: number; readonly count: number }[] {
  const groups = new Map<string, { first: number; count: number }>()
  for (const i of monsterTargets(state)) {
    const name = state.fighters[i]?.name ?? ''
    const g = groups.get(name)
    if (g) g.count++
    else groups.set(name, { first: i, count: 1 })
  }
  return [...groups.values()]
}

/** The round's command phase opened: the party menu, nobody's choice made. */
export function openCommands(members: readonly Asked[]): Commanding {
  return {
    members,
    step: { at: 'party', cursor: 0 },
    chosen: new Map(),
    tactics: new Map(),
    lines: new Map(),
    armed: [],
  }
}

function askedOrder(state: BattleState, c: Commanding): number[] {
  return c.members.flatMap((m, k) => (isAsked(state, m, c.tactics) ? [k] : []))
}

function firstAsked(state: BattleState, c: Commanding): Commanding {
  const order = askedOrder(state, c)
  const first = order[0]
  // None to ask: the phase ends with no member menu (`0x0217cc98`).
  if (first === undefined) return { ...c, step: { at: 'done' } }
  return { ...c, step: { at: 'member', member: first, cursor: 0 } }
}

/** On to the next member to ask, or the end of the phase. */
function next(state: BattleState, c: Commanding, after: number): Commanding {
  const order = askedOrder(state, c)
  const at = order.indexOf(after)
  const k = order[at + 1]
  if (k === undefined) return { ...c, step: { at: 'done' } }
  return { ...c, step: { at: 'member', member: k, cursor: 0 } }
}

function choose(
  state: BattleState,
  c: Commanding,
  member: number,
  command: Command,
  caption: Caption,
): Commanding {
  const m = c.members[member] as Asked
  const chosen = new Map(c.chosen)
  chosen.set(m.fighter, { command, caption })
  return next(state, { ...c, chosen }, member)
}

/**
 * **Whom it asks for** (`func_ov000_02171210`), by the action's side and reach:
 * a monster, a group or all of them; oneself, an ally, or the whole party.
 */
function aimed(state: BattleState, c: Commanding, member: number, p: Pending): Commanding {
  const m = c.members[member] as Asked
  const { side, reach } = p.aim
  const monsters = monsterTargets(state)
  const party = state.fighters.flatMap((f, i) => (f.side === 'party' ? [i] : []))
  const done = (target: number) => choose(state, c, member, p.command(target), p.caption)
  if (side === 1) {
    if (reach === 3) return done(-1)
    const groups = monsterGroups(state).length
    if ((reach === 4 && groups <= 1) || monsters.length <= 1) return done(monsters[0] ?? -1)
    return { ...c, step: { at: 'monster', member, cursor: 0, pending: p } }
  }
  if (side === 2) {
    if (reach === 3 || reach === 4 || reach === 1) return done(m.fighter)
    if (party.length <= 1) return done(m.fighter)
    return {
      ...c,
      step: { at: 'ally', member, cursor: 0, pending: p, exceptSelf: reach === 8 },
    }
  }
  return done(-1)
}

/** The allies an ally choice lists. */
export function allyTargets(
  state: BattleState,
  c: Commanding,
  step: Extract<Step, { at: 'ally' }>,
): number[] {
  const me = (c.members[step.member] as Asked).fighter
  return state.fighters.flatMap((f, i) =>
    f.side === 'party' && !(step.exceptSelf && i === me) ? [i] : [],
  )
}

/** How many rows the step's list has — for the cursor to move within. */
export function rowsOf(state: BattleState, c: Commanding): number {
  const s = c.step
  switch (s.at) {
    case 'party':
      return PARTY_ROWS.length
    case 'member':
      return MEMBER_COMMANDS.length
    case 'list': {
      const m = c.members[s.member] as Asked
      return (s.list === 'items' ? m.items : m[s.list]).length
    }
    case 'monster':
      return monsterTargets(state).length
    case 'ally':
      return allyTargets(state, c, s).length
    case 'misc':
      return MISC_ROWS.length
    case 'tactics':
      return tacticsRows(c).length
    case 'tactic':
      return TACTIC_GRID.length
    case 'lineUp':
      return c.members.length
    case 'armsWho':
      return armsMembers(c).length
    case 'armsKind':
      return armsKinds(c.members[s.member]?.arms ?? { bag: [] }).length
    case 'armsWeapon':
      return armsOfKind(c.members[s.member]?.arms ?? { bag: [] }, s.kind).length
    default:
      return 0
  }
}

/** The members whose tactic may be set — all but the player's own — and then "Whole Party". */
export function tacticsRows(c: Commanding): (number | 'all')[] {
  return [...c.members.flatMap((m, k) => (m.own || m.guest ? [] : [k])), 'all']
}

/**
 * Move the cursor. The two-column grids — a member's commands and the
 * tactics — take left and right as their columns; every list wraps, as the
 * ARM9's cursor does by default.
 */
export function moveCommand(state: BattleState, c: Commanding, dx: number, dy: number): Commanding {
  const s = c.step
  if (!('cursor' in s)) return c
  const n = rowsOf(state, c)
  if (n === 0) return c
  if (s.at === 'member' || s.at === 'tactic') {
    // The grid's place, row by row, two to a row.
    const grid = s.at === 'member' ? COMMAND_GRID : TACTIC_GRID
    const place = grid.indexOf(s.cursor as never)
    const col = place % 2
    const row = Math.floor(place / 2)
    const nextCol = (col + dx + 2) % 2
    const nextRow = (row + dy + 3) % 3
    return { ...c, step: { ...s, cursor: grid[nextRow * 2 + nextCol] as number } }
  }
  if (s.at === 'monster') {
    // One row of every monster: left and right, as up and down.
    return { ...c, step: { ...s, cursor: (s.cursor + dx + dy + n) % n } }
  }
  return { ...c, step: { ...s, cursor: (s.cursor + dy + n) % n } }
}

/**
 * Choose what the cursor is on. `coin` is the world's generator's draw below
 * 100, which Examine's general line is chosen by — see {@link examinePages}.
 */
export function chooseCommand(
  state: BattleState,
  c: Commanding,
  coin: () => number = () => 0,
): Commanding {
  const s = c.step
  switch (s.at) {
    case 'party': {
      const row = PARTY_ROWS[s.cursor]
      if (row === 'fight') return firstAsked(state, c)
      if (row === 'flee') {
        // **Every member asked flees** (`func_ov000_02180394`).
        const chosen = new Map(c.chosen)
        for (const k of askedOrder(state, c)) {
          const m = c.members[k] as Asked
          chosen.set(m.fighter, { command: { kind: 'flee' }, caption: { word: FLEE_CAPTION } })
        }
        // Every record done at once, so the phase ends in the same frame.
        return { ...c, chosen, step: { at: 'done' } }
      }
      if (row === 'misc') return { ...c, step: { at: 'misc', cursor: 0 } }
      // Examine: its pages, and the party menu again — free.
      return { ...c, step: { at: 'examine', pages: examinePages(state, coin), page: 0 } }
    }
    case 'member': {
      const m = c.members[s.member] as Asked
      const command = MEMBER_COMMANDS[s.cursor]
      if (command === 'attack') {
        return aimed(state, c, s.member, {
          command: (target) => ({ kind: 'attack', target }),
          aim: { side: 1, reach: 2 },
          back: s,
          caption: { word: COMMAND_WORD_BASE },
        })
      }
      if (command === 'defend')
        return choose(state, c, s.member, { kind: 'defend' }, { word: COMMAND_WORD_BASE + 2 })
      if (command === 'spells' || command === 'abilities') {
        if (m[command].length === 0) {
          return {
            ...c,
            step: {
              at: 'say',
              say: {
                number: COMMAND_SAYS.knowsNone,
                actor: m.name,
                str2: command === 'spells' ? COMMAND_SAYS.spells : COMMAND_SAYS.abilities,
              },
              back: s,
            },
          }
        }
        return {
          ...c,
          step: { at: 'list', list: command, member: s.member, cursor: 0, from: s.cursor },
        }
      }
      if (command === 'items') {
        if (m.items.length === 0) {
          return {
            ...c,
            step: { at: 'say', say: { number: COMMAND_SAYS.carriesNone, actor: m.name }, back: s },
          }
        }
        return {
          ...c,
          step: { at: 'list', list: 'items', member: s.member, cursor: 0, from: s.cursor },
        }
      }
      // The Coup de Grâce: greyed, and A does nothing, until it is ready —
      // which is not modelled (combatant `+0x138 → +0x3b` bit 3).
      return c
    }
    case 'list': {
      const m = c.members[s.member] as Asked
      const mine = state.fighters[m.fighter]
      if (s.list === 'items') {
        const item = m.items[s.cursor]
        if (!item) return c
        return aimed(state, c, s.member, {
          command: item.command,
          aim: item,
          back: s,
          caption: { name: item.name },
        })
      }
      const entry = m[s.list][s.cursor]
      if (!entry || !mine) return c
      // Cost 255 is "at least 1"; the gold kind is checked against the purse elsewhere.
      const needs = entry.cost === 255 ? 1 : entry.cost
      if (!entry.gold && mine.mp < needs) {
        return { ...c, step: { at: 'say', say: { number: COMMAND_SAYS.notEnoughMp }, back: s } }
      }
      return aimed(state, c, s.member, {
        command: entry.command,
        aim: entry,
        ...(entry.fallen ? { fallen: entry.fallen } : {}),
        back: s,
        caption: { name: entry.name },
      })
    }
    case 'monster': {
      const target = monsterTargets(state)[s.cursor]
      if (target === undefined) return c
      return choose(state, c, s.member, s.pending.command(target), s.pending.caption)
    }
    case 'ally': {
      const target = allyTargets(state, c, s)[s.cursor]
      if (target === undefined) return c
      // The ally must be standing — fallen for a revival, either for Zing.
      const standing = alive(state, target)
      const fallen = s.pending.fallen
      if (fallen === 'only' ? standing : fallen === 'either' ? false : !standing) return c
      return choose(state, c, s.member, s.pending.command(target), s.pending.caption)
    }
    case 'say':
      return { ...c, step: s.back }
    case 'examine':
      if (s.page + 1 < s.pages.length) return { ...c, step: { ...s, page: s.page + 1 } }
      return { ...c, step: { at: 'party', cursor: PARTY_ROWS.indexOf('examine') } }
    case 'armsWho': {
      const k = armsMembers(c)[s.cursor]
      return k === undefined ? c : armsFor(state, c, k)
    }
    case 'armsKind': {
      const kind = armsKinds(c.members[s.member]?.arms ?? { bag: [] })[s.cursor]
      if (kind === undefined) return c
      return { ...c, step: { at: 'armsWeapon', member: s.member, kind, cursor: 0 } }
    }
    case 'armsWeapon':
      return armWith(state, c, s)
    case 'lineUp': {
      // A toggles the member's row and stays in the list (`0x0217dd94`).
      const m = c.members[s.cursor]
      if (!m) return c
      const lines = new Map(c.lines)
      lines.set(m.fighter, !inBackLine(c, m))
      return { ...c, lines }
    }
    case 'misc': {
      const row = MISC_ROWS[s.cursor]
      if (row === 'tactics') {
        // Refused with a party of one (`0x0217cf94`).
        if (c.members.length <= 1) {
          return { ...c, step: { at: 'say', say: { number: COMMAND_SAYS.noTactics }, back: s } }
        }
        return { ...c, step: { at: 'tactics', cursor: 0 } }
      }
      if (row === 'lineUp') return { ...c, step: { at: 'lineUp', cursor: 0 } }
      // Equipment: whom, unless there is only one to ask (state 5).
      const who = armsMembers(c)
      if (who.length === 0) return c
      if (who.length === 1) return armsFor(state, c, who[0] as number)
      return { ...c, step: { at: 'armsWho', cursor: 0 } }
    }
    case 'tactics': {
      const who = tacticsRows(c)[s.cursor]
      if (who === undefined) return c
      const current =
        who === 'all'
          ? FOLLOW_ORDERS
          : (c.tactics.get(c.members[who]?.fighter ?? -1) ??
            c.members[who]?.tactic ??
            FOLLOW_ORDERS)
      return { ...c, step: { at: 'tactic', who, cursor: current } }
    }
    case 'tactic': {
      const tactics = new Map(c.tactics)
      const set = (m: Asked) => tactics.set(m.fighter, s.cursor)
      if (s.who === 'all') {
        for (const m of c.members) if (!m.own && !m.guest) set(m)
      } else {
        const m = c.members[s.who]
        if (m) set(m)
      }
      // Every choice reset and the party menu again (`func_ov000_0217d438`).
      return { ...c, tactics, chosen: new Map(), step: { at: 'party', cursor: 0 } }
    }
    default:
      return c
  }
}

/** Equipment for one member: their kinds, or "isn't carrying any equipment" (state 43). */
function armsFor(_state: BattleState, c: Commanding, k: number): Commanding {
  const m = c.members[k] as Asked
  const backTo: Step = { at: 'misc', cursor: MISC_ROWS.indexOf('equipment') }
  if (armsKinds(m.arms ?? { bag: [] }).length === 0) {
    return {
      ...c,
      step: {
        at: 'say',
        say: {
          number: COMMAND_SAYS.carriesNoEquipment,
          actor: m.name,
          ...(m.gender === undefined ? {} : { actorGender: m.gender }),
        },
        back: backTo,
      },
    }
  }
  return { ...c, step: { at: 'armsKind', member: k, cursor: 0 } }
}

/**
 * The weapon chosen (state 32, `0x02176aa8`–`0x02176ccc`): the one in hand
 * taken off into the bag, or another put on and the old one into the bag; the
 * message, and Misc. again — the member's command untouched.
 */
function armWith(
  state: BattleState,
  c: Commanding,
  s: Extract<Step, { at: 'armsWeapon' }>,
): Commanding {
  const m = c.members[s.member] as Asked
  const arms = m.arms ?? { bag: [] }
  const chosen = armsOfKind(arms, s.kind)[s.cursor]
  if (!chosen) return c
  const off = arms.inHand?.item === chosen.item
  const bag = arms.bag.filter((w) => w !== chosen)
  const next: Arms = off
    ? { inHand: undefined, bag: [...bag, chosen] }
    : { inHand: chosen, bag: arms.inHand ? [...bag, arms.inHand] : bag }
  const members = c.members.map((x, k) => (k === s.member ? { ...x, arms: next } : x))
  const fallen = (state.fighters[m.fighter]?.hp ?? 1) <= 0
  const number = off
    ? fallen
      ? COMMAND_SAYS.takesOffFallen
      : COMMAND_SAYS.takesOff
    : fallen
      ? COMMAND_SAYS.equipsFallen
      : COMMAND_SAYS.equips
  return {
    ...c,
    members,
    armed: [...c.armed, { fighter: m.fighter, from: arms.inHand, to: off ? undefined : chosen }],
    step: {
      at: 'say',
      say: {
        number,
        actor: m.name,
        ...(m.gender === undefined ? {} : { actorGender: m.gender }),
        item: chosen.named,
      },
      back: { at: 'misc', cursor: MISC_ROWS.indexOf('equipment') },
    },
  }
}

/** Go back a step. */
export function backCommand(state: BattleState, c: Commanding): Commanding {
  const s = c.step
  switch (s.at) {
    case 'member': {
      // The member before, their choice discarded and asked again; on the
      // first, the party menu (`func_ov000_0217f78c`, `0217fa60`).
      const order = askedOrder(state, c)
      const at = order.indexOf(s.member)
      const before = order[at - 1]
      if (before === undefined) return { ...c, chosen: new Map(), step: { at: 'party', cursor: 0 } }
      const chosen = new Map(c.chosen)
      chosen.delete((c.members[before] as Asked).fighter)
      return { ...c, chosen, step: { at: 'member', member: before, cursor: 0 } }
    }
    case 'list':
      return { ...c, step: { at: 'member', member: s.member, cursor: s.from } }
    case 'monster':
    case 'ally':
      return { ...c, step: s.pending.back }
    case 'say':
      return { ...c, step: s.back }
    case 'examine':
      return { ...c, step: { at: 'party', cursor: PARTY_ROWS.indexOf('examine') } }
    case 'lineUp':
      return { ...c, step: { at: 'misc', cursor: MISC_ROWS.indexOf('lineUp') } }
    case 'armsWho':
      return { ...c, step: { at: 'misc', cursor: MISC_ROWS.indexOf('equipment') } }
    case 'armsKind':
      return armsMembers(c).length > 1
        ? { ...c, step: { at: 'armsWho', cursor: armsMembers(c).indexOf(s.member) } }
        : { ...c, step: { at: 'misc', cursor: MISC_ROWS.indexOf('equipment') } }
    case 'armsWeapon': {
      const kinds = armsKinds(c.members[s.member]?.arms ?? { bag: [] })
      return { ...c, step: { at: 'armsKind', member: s.member, cursor: kinds.indexOf(s.kind) } }
    }
    case 'misc':
      return { ...c, step: { at: 'party', cursor: PARTY_ROWS.indexOf('misc') } }
    case 'tactics':
      return { ...c, step: { at: 'misc', cursor: 0 } }
    case 'tactic':
      return { ...c, step: { at: 'tactics', cursor: 0 } }
    default:
      return c
  }
}

/** The round's commands, by fighter, once the phase is done. */
export function commandsOf(c: Commanding): Map<number, Command> {
  return new Map([...c.chosen].map(([fighter, { command }]) => [fighter, command]))
}
