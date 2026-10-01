import type { BattleState, Command } from '@minstrel/sim'

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
 * **Ours**, each marked where it lives: Examine, Equipment and Line-Up, whose
 * screens are not read, do nothing; the AI of a member not following orders is
 * not read, and they hand in no command (the battle's own default, an attack);
 * a Coup de Grâce is never ready, its readiness not being modelled.
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
} as const

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
  | { readonly at: 'misc'; readonly cursor: number }
  | { readonly at: 'tactics'; readonly cursor: number }
  | { readonly at: 'tactic'; readonly who: number | 'all'; readonly cursor: number }
  | { readonly at: 'done' }

/** A message the menu puts up, with what it names. */
export interface Said {
  readonly number: number
  readonly actor?: string
  readonly str2?: number
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
  return { members, step: { at: 'party', cursor: 0 }, chosen: new Map(), tactics: new Map() }
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

/** Choose what the cursor is on. */
export function chooseCommand(state: BattleState, c: Commanding): Commanding {
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
      // Examine: `str_ex2`'s line is not read. **Ours**: nothing.
      return c
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
    case 'misc': {
      const row = MISC_ROWS[s.cursor]
      if (row === 'tactics') {
        // Refused with a party of one (`0x0217cf94`).
        if (c.members.length <= 1) {
          return { ...c, step: { at: 'say', say: { number: COMMAND_SAYS.noTactics }, back: s } }
        }
        return { ...c, step: { at: 'tactics', cursor: 0 } }
      }
      // Equipment and Line-Up are not read. **Ours**: nothing.
      return c
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
