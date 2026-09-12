/**
 * The main menu — M4's first step: the commands, and moving between them.
 *
 * `x` opens it and it goes back a step at a time, `Esc` too; the arrows or
 * `w`/`s` choose, `f` or `Enter` takes the command. The commands are the
 * slice plan's — talk, status, items, equip, spells — in our own words: the
 * cartridge's own menu text, under `/data/menu`, is not read yet.
 *
 * **Only talking does anything yet.** The Hero's numbers are in the parameter
 * tables under `/data/prm`, still to be decoded, and there is no inventory; each
 * other command says so rather than show numbers nobody read.
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
}

/** A panel's lines. */
export function panelLines(panel: MenuCommand, context: MenuContext): string[] {
  switch (panel) {
    case 'status':
      return [
        context.hero,
        `In ${context.map ?? 'no map'}, at story stage ${context.stage ?? 'none'}.`,
        'Level, HP, MP and the rest are not read yet: they are in the parameter tables under /data/prm, still to be decoded.',
      ]
    case 'items':
      return ['There is no inventory yet: the bag, and using what is in it, come next in M4.']
    case 'equip':
      return [
        'There is nothing to equip yet: equipment and what it does to the numbers come with the inventory.',
      ]
    case 'spells':
      return ['No spells are read yet: they are in the parameter tables with the rest of the Hero.']
    case 'talk':
      return []
  }
}
