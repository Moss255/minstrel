import { type Bag, bagLines } from './bag.ts'
import { choicesFor, type Equipped, SLOTS, type Slot } from './equipment.ts'
import type { Standing } from './hero.ts'

/**
 * The main menu — the commands, and moving between them.
 *
 * `x` opens it and it goes back a step at a time, `Esc` too; the arrows or
 * `w`/`s` choose, `f` or `Enter` takes the command. The commands are the
 * slice plan's — talk, status, items, equip, spells — in our own words: the
 * cartridge's own menu text, under `/data/menu`, is not read yet.
 *
 * **Talk, status, items and equip work.** Status shows the Hero's level table
 * (see `hero.ts`), whose columns are INFERRED; items lists the bag (see
 * `bag.ts`); equip puts on and takes off what the bag holds, a slot at a time
 * (see `equipment.ts`). Spells say what is not read yet.
 */

export type MenuCommand = 'talk' | 'status' | 'items' | 'equip' | 'spells'

export const MENU_COMMANDS: readonly { readonly id: MenuCommand; readonly label: string }[] = [
  { id: 'talk', label: 'Talk' },
  { id: 'status', label: 'Status' },
  { id: 'items', label: 'Items' },
  { id: 'equip', label: 'Equip' },
  { id: 'spells', label: 'Spells' },
]

/**
 * Where the menu is: which command is chosen, the panel it has open, and — in
 * the equip panel — which row is chosen and which slot is being filled.
 */
export interface MenuState {
  readonly cursor: number
  readonly panel: MenuCommand | undefined
  readonly row: number
  readonly picking: Slot | undefined
}

export function openMenu(): MenuState {
  return { cursor: 0, panel: undefined, row: 0, picking: undefined }
}

/** What a panel knows to say. */
export interface MenuContext {
  readonly hero: string
  readonly map: string | undefined
  readonly stage: string | undefined
  /** The Hero's level and numbers, when the level table read. */
  readonly standing?: Standing | undefined
  readonly bag?: Bag | undefined
  readonly equipped?: Equipped | undefined
  /** An item's name by id. */
  readonly itemName?: ((id: number) => string) | undefined
  /** The item table an item is listed in — `w` weapons and so on. */
  readonly tableOf?: ((id: number) => string | undefined) | undefined
}

const byId = (id: number) => `item 0x${id.toString(16)}`
const EMPTY: Bag = { gold: 0, items: new Map() }

/** The rows of the equip panel: its slots, or what can go in the slot being filled. */
function equipRows(state: MenuState, context: MenuContext): (number | undefined)[] | undefined {
  if (!state.picking) return undefined
  return choicesFor(state.picking, context.bag ?? EMPTY, context.tableOf ?? (() => undefined))
}

/** Choose another command, round and round — or, in the equip panel, another row. */
export function moveCursor(state: MenuState, by: number, context?: MenuContext): MenuState {
  const wrap = (at: number, count: number) => (((at + by) % count) + count) % count
  if (state.panel === 'equip') {
    const count = (context && equipRows(state, context)?.length) ?? SLOTS.length
    return { ...state, row: wrap(state.row, count) }
  }
  if (state.panel) return state
  return { ...state, cursor: wrap(state.cursor, MENU_COMMANDS.length) }
}

/** What taking a row asks for: talking, or putting something on. */
export interface Taken {
  readonly state: MenuState | undefined
  readonly talk: boolean
  /** Put this in the slot — undefined to take off what is there. */
  readonly equip?: { readonly slot: Slot; readonly item: number | undefined }
}

/**
 * Take the chosen command: talking closes the menu and talks; anything else
 * opens its panel. In the equip panel, a slot opens its choices, and a choice
 * is put on. Undefined is the menu closed.
 */
export function choose(state: MenuState, context?: MenuContext): Taken {
  if (state.panel === 'equip') {
    const slotIndex = SLOTS.findIndex((s) => s.slot === state.picking)
    if (!state.picking) {
      const slot = SLOTS[state.row]?.slot
      return { state: slot ? { ...state, picking: slot, row: 0 } : state, talk: false }
    }
    const choices = context ? (equipRows(state, context) ?? []) : []
    const back = { ...state, picking: undefined, row: Math.max(0, slotIndex) }
    if (state.row >= choices.length) return { state: back, talk: false }
    return { state: back, talk: false, equip: { slot: state.picking, item: choices[state.row] } }
  }
  if (state.panel) return { state, talk: false }
  const command = MENU_COMMANDS[state.cursor]?.id
  if (command === undefined) return { state, talk: false }
  if (command === 'talk') return { state: undefined, talk: true }
  return { state: { ...state, panel: command, row: 0, picking: undefined }, talk: false }
}

/** Go back a step: out of a slot's choices, out of a panel, or out of the menu. */
export function back(state: MenuState): MenuState | undefined {
  if (state.picking) {
    const row = SLOTS.findIndex((s) => s.slot === state.picking)
    return { ...state, picking: undefined, row: Math.max(0, row) }
  }
  return state.panel ? { ...state, panel: undefined, row: 0 } : undefined
}

const mark = (chosen: boolean) => (chosen ? '▶ ' : '   ')

/** A panel's lines. The equip panel marks its chosen row, which is why it takes the state. */
export function panelLines(
  panel: MenuCommand,
  context: MenuContext,
  state?: Pick<MenuState, 'row' | 'picking'>,
): string[] {
  const where = `In ${context.map ?? 'no map'}, at story stage ${context.stage ?? 'none'}.`
  const nameOf = context.itemName ?? byId
  switch (panel) {
    case 'status': {
      const s = context.standing
      if (!s) {
        return [
          context.hero,
          where,
          'Level, HP, MP and the rest are not read: the level table did not load.',
        ]
      }
      const { level: l } = s
      return [
        `${context.hero} — ${s.vocation}, level ${l.level}`,
        `Exp. ${s.exp}${s.next ? `, level ${s.next.level} at ${s.next.exp}` : ''}`,
        `HP ${l.maxHp}/${l.maxHp} · MP ${l.maxMp}/${l.maxMp}`,
        `Strength ${l.strength} · Resilience ${l.resilience} · Agility ${l.agility} · Deftness ${l.deftness} · Charm ${l.charm}`,
        `Magical might ${l.magicalMight} · Magical mending ${l.magicalMending}`,
        'Attack and defence are not read: where equipment keeps its numbers is not found. Which level-table column is which is inferred.',
        where,
      ]
    }
    case 'items':
      return context.bag ? bagLines(context.bag, nameOf) : ['There is no bag yet.']
    case 'equip': {
      const row = state?.row ?? 0
      if (state?.picking) {
        const label = SLOTS.find((s) => s.slot === state.picking)?.label ?? state.picking
        const choices = equipRows({ cursor: 0, panel, row, picking: state.picking }, context) ?? []
        return [
          `${label}:`,
          ...choices.map(
            (item, i) => `${mark(i === row)}${item === undefined ? '(nothing)' : nameOf(item)}`,
          ),
        ]
      }
      const worn = context.equipped ?? new Map<Slot, number>()
      return [
        ...SLOTS.map(({ slot, label }, i) => {
          const item = worn.get(slot)
          return `${mark(i === row)}${label}: ${item === undefined ? '—' : nameOf(item)}`
        }),
        'Equipment changes no numbers yet: where it keeps its attack and defence is not found.',
      ]
    }
    case 'spells':
      return ['No spells are read yet.']
    case 'talk':
      return []
  }
}
