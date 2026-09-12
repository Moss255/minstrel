import { type Bag, bagLines } from './bag.ts'
import type { Standing } from './hero.ts'

/**
 * The main menu — M4's first step: the commands, and moving between them.
 *
 * `x` opens it and it goes back a step at a time, `Esc` too; the arrows or
 * `w`/`s` choose, `f` or `Enter` takes the command. The commands are the
 * slice plan's — talk, status, items, equip, spells — in our own words: the
 * cartridge's own menu text, under `/data/menu`, is not read yet.
 *
 * **Talk, status and items work.** Status shows the Hero's level table (see
 * `hero.ts`), whose columns are INFERRED; items lists the bag (see `bag.ts`).
 * Equip and spells say what is not read yet rather than show numbers nobody read.
 */

export type MenuCommand = 'talk' | 'status' | 'items' | 'equip' | 'spells'

export const MENU_COMMANDS: readonly { readonly id: MenuCommand; readonly label: string }[] = [
  { id: 'talk', label: 'Talk' },
  { id: 'status', label: 'Status' },
  { id: 'items', label: 'Items' },
  { id: 'equip', label: 'Equip' },
  { id: 'spells', label: 'Spells' },
]

/** Where the menu is: which command is chosen, and the panel it has open, if any. */
export interface MenuState {
  readonly cursor: number
  readonly panel: MenuCommand | undefined
}

export function openMenu(): MenuState {
  return { cursor: 0, panel: undefined }
}

/** Choose another command, round and round. A panel keeps its command. */
export function moveCursor(state: MenuState, by: number): MenuState {
  if (state.panel) return state
  const count = MENU_COMMANDS.length
  return { ...state, cursor: (((state.cursor + by) % count) + count) % count }
}

/**
 * Take the chosen command: talking closes the menu and talks; anything else
 * opens its panel. Undefined is the menu closed.
 */
export function choose(state: MenuState): { state: MenuState | undefined; talk: boolean } {
  if (state.panel) return { state, talk: false }
  const command = MENU_COMMANDS[state.cursor]?.id
  if (command === undefined) return { state, talk: false }
  if (command === 'talk') return { state: undefined, talk: true }
  return { state: { ...state, panel: command }, talk: false }
}

/** Go back a step: out of a panel, or out of the menu. */
export function back(state: MenuState): MenuState | undefined {
  return state.panel ? { ...state, panel: undefined } : undefined
}

/** What a panel knows to say. */
export interface MenuContext {
  readonly hero: string
  readonly map: string | undefined
  readonly stage: string | undefined
  /** The Hero's level and numbers, when the level table read. */
  readonly standing?: Standing | undefined
  readonly bag?: Bag | undefined
  /** An item's name by id. */
  readonly itemName?: ((id: number) => string) | undefined
}

const byId = (id: number) => `item 0x${id.toString(16)}`

/** A panel's lines. */
export function panelLines(panel: MenuCommand, context: MenuContext): string[] {
  const where = `In ${context.map ?? 'no map'}, at story stage ${context.stage ?? 'none'}.`
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
        'Attack and defence wait for equipment. Which level-table column is which is inferred.',
        where,
      ]
    }
    case 'items':
      return context.bag
        ? bagLines(context.bag, context.itemName ?? byId)
        : ['There is no bag yet.']
    case 'equip':
      return ['There is nothing to equip yet: equipment and what it does to the numbers come next.']
    case 'spells':
      return ['No spells are read yet.']
    case 'talk':
      return []
  }
}
