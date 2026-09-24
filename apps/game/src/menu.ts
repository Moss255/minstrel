import type { PotEntry } from './alchemy.ts'
import { type Bag, bagLines } from './bag.ts'
import { choicesFor, type Equipped, SLOTS, type Slot } from './equipment.ts'
import type { Standing } from './hero.ts'
import type { SkillTreeView } from './skills.ts'

/**
 * The main menu — the commands, and moving between them.
 *
 * `x` opens it and it goes back a step at a time, `Esc` too; the arrows or
 * `w`/`s` choose, `f` or `Enter` takes the command. The commands are the
 * slice plan's — talk, status, items, equip, spells — **named in the game's
 * own words** where it has them, the field menu's `str_tm`: `Attributes`,
 * `Items`, `Equipment`, `Spells & Abilities`. The game's menu has no Talk —
 * talking is a button — so that one is ours.
 *
 * **Every command works.** The attributes show the Hero's level table (see
 * `hero.ts`), whose columns are INFERRED; items lists the bag (see `bag.ts`)
 * and offers the chosen one's Use, Discard and Cancel; equipment puts on and
 * takes off what the bag holds, a slot at a time (see `equipment.ts`); spells
 * lists what the Hero has learnt, and casts one of those that can be cast
 * outside a battle.
 */

export type MenuCommand =
  | 'talk'
  | 'status'
  | 'items'
  | 'equip'
  | 'spells'
  | 'skills'
  | 'pot'
  | 'make'

/**
 * The field menu's messages, by their numbers in `str_tm` — about using an
 * item and casting a spell — chosen by reading them.
 */
export const MENU_SAYS = {
  /** Someone uses an item. */
  uses: 9002,
  /** But nothing happens. */
  nothingHappens: 9003,
  /** Their wounds are healed. */
  healed: 9004,
  /** Someone casts a spell. */
  casts: 9005,
  /** They know no spell to cast here. */
  noFieldSpells: 9006,
  notEnoughMp: 9007,
  /** It would be no use on them now. */
  noUse: 9012,
  discarded: 9062,
  emptyBag: 9065,
  /** "Allows you to distribute any unused skill points your party members have saved up." */
  aboutSkills: 4022,
  /** "<Cap><DEF_ART_TARGET> earns <val_1> skill point(s)." */
  earnsPoints: 31131,
} as const

/** The field menu's own words, by their numbers in `str_tm`. */
export const MENU_WORDS = {
  items: 1,
  attributes: 2,
  spells: 3,
  whatToDo: 1200,
  use: 1201,
  discard: 1203,
  cancel: 1204,
  equipment: 1903,
  mp: 4351,
  /** "Allocate Skill Points" — the game's own name for the skill screen. */
  skills: 4003,
  /** "Points Remaining:" */
  pointsLeft: 4101,
} as const

export interface MenuEntry<Id extends string> {
  readonly id: Id
  /** Our word for it, when the game's is not to hand. */
  readonly label: string
  /** The game's, by its number in `str_tm`. */
  readonly word?: number
}

export const MENU_COMMANDS: readonly MenuEntry<MenuCommand>[] = [
  { id: 'talk', label: 'Talk' },
  { id: 'status', label: 'Attributes', word: MENU_WORDS.attributes },
  { id: 'items', label: 'Items', word: MENU_WORDS.items },
  { id: 'equip', label: 'Equipment', word: MENU_WORDS.equipment },
  { id: 'spells', label: 'Spells & Abilities', word: MENU_WORDS.spells },
  { id: 'skills', label: 'Allocate Skill Points', word: MENU_WORDS.skills },
  // **Ours, where the pot's own words have no menu label.** The Krak Pot's
  // `str_ren` is what it says once it is open, not what the menu calls it.
  { id: 'pot', label: 'Alchemy' },
  // **Ours, and not where the game puts it.** Characters are made at the
  // Observatory and the Quester's Rest, neither of which is built; the menu
  // is somewhere a person can reach it meanwhile. See `docs/party-and-vocations.md`.
  { id: 'make', label: 'Appearance' },
]

/** What can be done with the item chosen in the items panel. */
export const ITEM_ACTIONS: readonly MenuEntry<'use' | 'discard' | 'cancel'>[] = [
  { id: 'use', label: 'Use', word: MENU_WORDS.use },
  { id: 'discard', label: 'Discard', word: MENU_WORDS.discard },
  { id: 'cancel', label: 'Cancel', word: MENU_WORDS.cancel },
]

/** An entry's name: the game's word when there is one, or ours. */
export function labelOf(
  entry: MenuEntry<string>,
  words: ReadonlyMap<number, string> | undefined,
): string {
  return (entry.word === undefined ? undefined : words?.get(entry.word)) ?? entry.label
}

/**
 * Where the menu is: which command is chosen, the panel it has open, and — in
 * the equip panel — which row is chosen and which slot is being filled; in
 * the items panel, the item whose use is being chosen.
 */
export interface MenuState {
  /**
   * Which of the party the panels are about, by their place — the Hero at 0.
   *
   * **The attributes panel's row chooses it**, which is how the game reads:
   * you pick a character and then look at them. Equipment and spells follow
   * whoever was picked there rather than asking again.
   */
  readonly member: number
  readonly cursor: number
  readonly panel: MenuCommand | undefined
  readonly row: number
  readonly picking: Slot | undefined
  /**
   * In the skill panel, the tree being climbed — the rows are then its panels
   * rather than the five trees. Undefined at the list of trees.
   */
  readonly tree?: number | undefined
  /** The item chosen in the items panel and its row, while `row` chooses what to do with it. */
  readonly acting?: { readonly item: number; readonly row: number } | undefined
  /** What using an item or casting a spell came to, shown under the panel until the next choice. */
  readonly said?: readonly string[] | undefined
}

export function openMenu(): MenuState {
  return { member: 0, cursor: 0, panel: undefined, row: 0, picking: undefined }
}

/** A spell the Hero has learnt, as the spells panel shows it. */
export interface MenuSpell {
  readonly action: number
  readonly name: string
  readonly cost: number
  /** Whether it can be cast outside a battle. */
  readonly field: boolean
}

/** An item's own numbers as a panel shows them — " — attack 7", " — defence 3" — or nothing. The words are ours. */
function numbersText(context: MenuContext, item: number | undefined): string {
  const numbers = item === undefined ? undefined : context.numbersOf?.(item)
  if (!numbers) return ''
  const said = [
    numbers.attack ? `attack ${numbers.attack}` : '',
    numbers.defence ? `defence ${numbers.defence}` : '',
    numbers.agility ? `agility ${numbers.agility}` : '',
  ].filter(Boolean)
  return said.length > 0 ? ` — ${said.join(', ')}` : ''
}

/** What the worn equipment adds, item by item as read; nothing when the numbers did not read. */
function wornTotals(
  context: MenuContext,
  worn: Equipped | undefined = context.equipped,
): { attack: number; defence: number; agility: number } {
  let attack = 0
  let defence = 0
  let agility = 0
  for (const item of (worn ?? new Map<Slot, number>()).values()) {
    const numbers = context.numbersOf?.(item)
    attack += numbers?.attack ?? 0
    defence += numbers?.defence ?? 0
    agility += numbers?.agility ?? 0
  }
  return { attack, defence, agility }
}

/** What the worn equipment adds, item by item as read. The words are ours. */
function wornText(context: MenuContext, worn?: Equipped | undefined): string {
  if (!context.numbersOf) return 'What equipment adds is not read.'
  const { attack, defence, agility } = wornTotals(context, worn)
  return `Equipment worn: attack +${attack}, defence +${defence}${agility ? `, agility +${agility}` : ''}.`
}

/**
 * The attack and defence a fight would give the Hero: their strength and
 * resilience plus what they wear.
 *
 * **The adding is ours.** The battle reference takes a fighter's attack and
 * defence as given — its setups name them, `atk123_def86` — and how the game
 * makes them up is not cited. `startFight` adds them this way, so what this
 * line shows is what a battle would use, which is what makes the numbers
 * worth watching as the levels go by.
 */
function fightingText(
  context: MenuContext,
  strength: number,
  resilience: number,
  wearing?: Equipped | undefined,
): string {
  const worn = wornTotals(context, wearing)
  return `In a fight: attack ${strength + worn.attack} · defence ${resilience + worn.defence} — ours, added.`
}

/**
 * One of the party, as the menu shows them — see `Member` in `companion.ts`.
 *
 * The attributes panel used to know only the Hero, because only the Hero had
 * numbers of their own. Everyone has now, so everyone is here.
 */
export interface MenuMember {
  readonly name: string
  /** Their level and numbers, when their vocation's level table read. */
  readonly standing?: Standing | undefined
  /** Hit points now, when wounded; full when undefined. */
  readonly hp?: number | undefined
  /** MP now, when spent; full when undefined. */
  readonly mp?: number | undefined
  readonly equipped?: Equipped | undefined
  /** The spells they have learnt at their level, in their vocation. */
  readonly spells?: readonly MenuSpell[] | undefined
  /**
   * Their skill points and the five trees their vocation may spend them in —
   * see `skills.ts`. Undefined for a story companion, who does not level and
   * has no skill screen in the game either.
   */
  readonly skills?: { readonly pool: number; readonly trees: readonly SkillTreeView[] } | undefined
  /**
   * How many times they have revoked the vocation they are in — see `revoke`
   * in `companion.ts`. The game draws a row of stars from it; this says the
   * number, and only when there is one.
   */
  readonly revocations?: number | undefined
}

/** What a panel knows to say. */
export interface MenuContext {
  /**
   * The party, the Hero first. Empty only before a cartridge is in.
   */
  readonly party?: readonly MenuMember[] | undefined
  readonly hero: string
  readonly map: string | undefined
  readonly stage: string | undefined
  /** The Hero's level and numbers, when the level table read. */
  readonly standing?: Standing | undefined
  /** The Hero's hit points now, when wounded; full when undefined. */
  readonly hp?: number | undefined
  /** The Hero's MP now, when spent; full when undefined. */
  readonly mp?: number | undefined
  readonly bag?: Bag | undefined
  readonly equipped?: Equipped | undefined
  /** A piece of equipment's own attack and defence, by id — see `itemStatsOf` in `load.ts`. */
  readonly numbersOf?:
    | ((
        id: number,
      ) =>
        | { readonly attack: number; readonly defence: number; readonly agility?: number }
        | undefined)
    | undefined
  /** An item's name by id. */
  readonly itemName?: ((id: number) => string) | undefined
  /** The item table an item is listed in — `w` weapons and so on. */
  readonly tableOf?: ((id: number) => string | undefined) | undefined
  /**
   * Whether the party's member at `place` may wear an item, in the vocation
   * they are — see `mayWear` in `equipment.ts`. Absent leaves the equip panel
   * offering the whole bag, as it did before the rule was read.
   */
  readonly mayWear?: ((id: number, place: number) => boolean) | undefined
  /**
   * The Krak Pot's recipes against the bag — see `potList` in `alchemy.ts`.
   * Undefined before a cartridge is in, or where the recipes did not read.
   */
  readonly pot?: readonly PotEntry[] | undefined
  /** The pot's own words, `str_ren`, by number. */
  readonly potWords?: ReadonlyMap<number, string> | undefined
  /**
   * The chosen member's look, knob by knob, as the appearance panel shows it
   * — see `appearanceRows` in `main.ts`. Undefined before a cartridge is in.
   */
  readonly look?:
    | readonly { readonly knob: string; readonly label: string; readonly shown: string }[]
    | undefined
  /** The spells the Hero has learnt; undefined when the spell table did not read. */
  readonly spells?: readonly MenuSpell[] | undefined
  /** What the spells panel says when there is nothing to cast. */
  readonly noSpells?: string | undefined
  /** The field menu's words, `str_tm`, by number. */
  readonly words?: ReadonlyMap<number, string> | undefined
}

const byId = (id: number) => `item 0x${id.toString(16)}`
const EMPTY: Bag = { gold: 0, items: new Map() }

/** The rows of the equip panel: its slots, or what can go in the slot being filled. */
function equipRows(state: MenuState, context: MenuContext): (number | undefined)[] | undefined {
  if (!state.picking) return undefined
  return choicesFor(
    state.picking,
    context.bag ?? EMPTY,
    context.tableOf ?? (() => undefined),
    // **Whoever the attributes panel chose**, in the vocation they are — see
    // `mayWear`. Without the rule nothing is refused.
    (id) => context.mayWear?.(id, state.member) ?? true,
  )
}

/**
 * The one of the party a panel is about — see `MenuState.member`. Undefined
 * before a cartridge is in, where the context has no party at all.
 */
const whose = (
  context: MenuContext | undefined,
  state?: { readonly member?: number },
): MenuMember | undefined => context?.party?.[state?.member ?? 0]

/** What the chosen member wears, or the context's own where there is no party. */
const wearing = (context: MenuContext, state?: { readonly member?: number }) =>
  whose(context, state)?.equipped ?? context.equipped

/** The chosen member's trees, which are the skill panel's first rows. */
const treesOfMember = (
  context: MenuContext | undefined,
  state?: { readonly member?: number },
): readonly SkillTreeView[] => whose(context, state)?.skills?.trees ?? []

/** The tree the skill panel is inside, when it is inside one. */
const treeOpen = (
  context: MenuContext | undefined,
  state?: { readonly member?: number; readonly tree?: number | undefined },
): SkillTreeView | undefined =>
  state?.tree === undefined
    ? undefined
    : treesOfMember(context, state).find((one) => one.tree === state.tree)

/** The spells that can be cast here, which are the spells panel's rows. */
const castable = (context: MenuContext | undefined, state?: { readonly member?: number }) =>
  (whose(context, state)?.spells ?? context?.spells ?? []).filter((spell) => spell.field)

/** Choose another command, round and round — or, in a panel with rows, another row. */
export function moveCursor(state: MenuState, by: number, context?: MenuContext): MenuState {
  const wrap = (at: number, count: number) => (((at + by) % count) + count) % count
  if (state.panel === 'equip') {
    const count = (context && equipRows(state, context)?.length) ?? SLOTS.length
    return { ...state, row: wrap(state.row, count) }
  }
  if (state.panel === 'items') {
    if (state.acting) return { ...state, row: wrap(state.row, ITEM_ACTIONS.length) }
    const count = context?.bag?.items.size ?? 0
    return count === 0 ? state : { ...state, row: wrap(state.row, count), said: undefined }
  }
  if (state.panel === 'status') {
    // The attributes panel's row is which of the party is being read, and it
    // is what the other panels then follow.
    const count = context?.party?.length ?? 0
    if (count <= 1) return state
    const row = wrap(state.row, count)
    return { ...state, row, member: row }
  }
  if (state.panel === 'spells') {
    const count = castable(context, state).length
    return count === 0 ? state : { ...state, row: wrap(state.row, count), said: undefined }
  }
  if (state.panel === 'skills') {
    const open = treeOpen(context, state)
    const count = open ? open.steps.length : treesOfMember(context, state).length
    return count === 0 ? state : { ...state, row: wrap(state.row, count), said: undefined }
  }
  if (state.panel === 'pot') {
    const count = context?.pot?.length ?? 0
    return count === 0 ? state : { ...state, row: wrap(state.row, count), said: undefined }
  }
  if (state.panel === 'make') {
    const count = context?.look?.length ?? 0
    return count === 0 ? state : { ...state, row: wrap(state.row, count) }
  }
  if (state.panel) return state
  return { ...state, cursor: wrap(state.cursor, MENU_COMMANDS.length) }
}

/** What taking a row asks for: talking, putting something on, using or discarding an item, casting. */
export interface Taken {
  readonly state: MenuState | undefined
  readonly talk: boolean
  /** Put this in the slot — undefined to take off what is there. */
  readonly equip?: { readonly slot: Slot; readonly item: number | undefined }
  /** Use this item, by id. */
  readonly use?: number
  /** Throw one of this item away, by id. */
  readonly discard?: number
  /** Cast this spell, by its action. */
  readonly cast?: number
  /** Put points into this tree until they reach this panel, by its id — see `buy` in `skills.ts`. */
  readonly buy?: { readonly tree: number; readonly panel: number }
  /** Cook this recipe, by its id — see `cook` in `alchemy.ts`. */
  readonly cook?: number
  /** Turn one of the appearance's knobs — see `turned` in `appearance.ts`. */
  readonly turn?: { readonly knob: string; readonly by: number }
}

/**
 * Take the chosen command: talking closes the menu and talks; anything else
 * opens its panel. In the equip panel, a slot opens its choices, and a choice
 * is put on; in the items panel, an item opens what can be done with it, and
 * that is done; in the spells panel, a spell is cast. Undefined is the menu
 * closed.
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
  if (state.panel === 'items') {
    if (state.acting) {
      const { item, row } = state.acting
      const back = { ...state, acting: undefined, row }
      const action = ITEM_ACTIONS[state.row]?.id
      if (action === 'use') return { state: back, talk: false, use: item }
      if (action === 'discard') return { state: back, talk: false, discard: item }
      return { state: back, talk: false }
    }
    const item = [...(context?.bag?.items.keys() ?? [])][state.row]
    if (item === undefined) return { state, talk: false }
    return {
      state: { ...state, acting: { item, row: state.row }, row: 0, said: undefined },
      talk: false,
    }
  }
  if (state.panel === 'spells') {
    const spell = castable(context, state)[state.row]
    return spell ? { state, talk: false, cast: spell.action } : { state, talk: false }
  }
  if (state.panel === 'make') {
    // **Taking a row turns its knob on.** Left and right would be the game's
    // way; this menu has only up, down and take, so take is one step forward
    // and it wraps — which is how the game's own arrows behave at the end.
    const knob = context?.look?.[state.row]?.knob
    return knob ? { state, talk: false, turn: { knob, by: 1 } } : { state, talk: false }
  }
  if (state.panel === 'pot') {
    const entry = context?.pot?.[state.row]
    // A recipe the bag will not cover says so rather than doing nothing.
    return entry?.ready ? { state, talk: false, cook: entry.recipe.id } : { state, talk: false }
  }
  if (state.panel === 'skills') {
    // A tree opens its panels; a panel in an open tree is bought into.
    const open = treeOpen(context, state)
    if (!open) {
      const tree = treesOfMember(context, state)[state.row]
      return { state: tree ? { ...state, tree: tree.tree, row: 0 } : state, talk: false }
    }
    const step = open.steps[state.row]
    if (!step?.buyable || step.bought) return { state, talk: false }
    return { state, talk: false, buy: { tree: open.tree, panel: step.panel.id } }
  }
  if (state.panel) return { state, talk: false }
  const command = MENU_COMMANDS[state.cursor]?.id
  if (command === undefined) return { state, talk: false }
  if (command === 'talk') return { state: undefined, talk: true }
  return {
    state: { ...state, panel: command, row: 0, picking: undefined, tree: undefined },
    talk: false,
  }
}

/** Go back a step: out of an item's uses, out of a slot's choices, out of a panel, or out of the menu. */
export function back(state: MenuState): MenuState | undefined {
  if (state.acting) return { ...state, acting: undefined, row: state.acting.row }
  if (state.tree !== undefined) return { ...state, tree: undefined, row: 0, said: undefined }
  if (state.picking) {
    const row = SLOTS.findIndex((s) => s.slot === state.picking)
    return { ...state, picking: undefined, row: Math.max(0, row) }
  }
  return state.panel ? { ...state, panel: undefined, row: 0 } : undefined
}

const mark = (chosen: boolean) => (chosen ? '▶ ' : '   ')

/** A panel's lines. The panels with rows mark the chosen one, which is why it takes the state. */
export function panelLines(
  panel: MenuCommand,
  context: MenuContext,
  state?: Pick<MenuState, 'row' | 'picking'> &
    Partial<Pick<MenuState, 'panel' | 'said' | 'acting' | 'member' | 'tree'>>,
): string[] {
  const where = `In ${context.map ?? 'no map'}, at story stage ${context.stage ?? 'none'}.`
  const nameOf = context.itemName ?? byId
  const word = (number: number, ours: string) => context.words?.get(number) ?? ours
  const mp = word(MENU_WORDS.mp, 'MP')
  switch (panel) {
    case 'status': {
      // **The whole party, and one of them at a time.** This showed only the
      // Hero for as long as only the Hero had numbers; now every place has
      // its own vocation, experience and equipment, so the row chooses whose
      // to read and the rest are listed above it — see `MenuMember`.
      const party = context.party ?? []
      const at = party.length === 0 ? 0 : Math.min(state?.row ?? 0, party.length - 1)
      const who = party[at]
      const s = who?.standing ?? context.standing
      const roster =
        party.length > 1
          ? party.map((member, i) => {
              const l = member.standing?.level
              const numbers = l
                ? `level ${l.level} · HP ${Math.min(member.hp ?? l.maxHp, l.maxHp)}/${l.maxHp}`
                : 'numbers not read'
              return `${i === at ? '▸' : ' '} ${member.name} — ${numbers}`
            })
          : []
      if (!s) {
        return [
          ...roster,
          who?.name ?? context.hero,
          where,
          'Level, HP, MP and the rest are not read: the level table did not load.',
        ]
      }
      const worn = who?.equipped ?? context.equipped
      const { level: l } = s
      const hp = who ? who.hp : context.hp
      const theirMp = who ? who.mp : context.mp
      return [
        ...roster,
        `${who?.name ?? context.hero} — ${s.vocation ? `${s.vocation}, ` : ''}level ${l.level}` +
          (who?.revocations ? ` · revoked ${who.revocations}×` : ''),
        `Exp. ${s.exp}${s.next ? `, level ${s.next.level} at ${s.next.exp}` : ''}`,
        `HP ${Math.min(hp ?? l.maxHp, l.maxHp)}/${l.maxHp} · ${mp} ${Math.min(theirMp ?? l.maxMp, l.maxMp)}/${l.maxMp}`,
        `Strength ${l.strength} · Resilience ${l.resilience} · Agility ${l.agility} · Deftness ${l.deftness} · Charm ${l.charm}`,
        `Magical might ${l.magicalMight} · Magical mending ${l.magicalMending}`,
        wornText(context, worn),
        fightingText(context, l.strength, l.resilience, worn),
        'Which level-table column is which is inferred.',
        where,
      ]
    }

    case 'items': {
      if (!context.bag) return ['There is no bag yet.']
      const chosen = state?.panel === 'items' ? (state.acting?.row ?? state.row) : undefined
      // An empty bag says so in the game's words, after its gold.
      const lines =
        context.bag.items.size === 0
          ? [
              ...bagLines(context.bag, nameOf).slice(0, 1),
              word(MENU_SAYS.emptyBag, 'The bag is currently empty.'),
            ]
          : bagLines(context.bag, nameOf, chosen)
      if (state?.panel === 'items' && state.acting) {
        lines.push(
          word(MENU_WORDS.whatToDo, 'What would you like to do?'),
          ...ITEM_ACTIONS.map(
            (action, i) => `${mark(i === state.row)}${labelOf(action, context.words)}`,
          ),
        )
      }
      return [...lines, ...(state?.said ?? [])]
    }
    case 'equip': {
      const row = state?.row ?? 0
      if (state?.picking) {
        const label = SLOTS.find((s) => s.slot === state.picking)?.label ?? state.picking
        const choices =
          equipRows(
            { member: state.member ?? 0, cursor: 0, panel, row, picking: state.picking },
            context,
          ) ?? []
        return [
          `${label}:`,
          ...choices.map(
            (item, i) =>
              `${mark(i === row)}${item === undefined ? '(nothing)' : nameOf(item)}${numbersText(context, item)}`,
          ),
        ]
      }
      // **Whoever the attributes panel last chose**, not always the Hero.
      const who = whose(context, state)
      const worn = wearing(context, state) ?? new Map<Slot, number>()
      return [
        ...(who && (context.party?.length ?? 0) > 1 ? [`${who.name}:`] : []),
        ...SLOTS.map(({ slot, label }, i) => {
          const item = worn.get(slot)
          return `${mark(i === row)}${label}: ${item === undefined ? '—' : nameOf(item)}${numbersText(context, item)}`
        }),
        wornText(context, worn),
      ]
    }
    case 'spells': {
      const learnt = whose(context, state)?.spells ?? context.spells
      if (!learnt) return ['No spells are read: the spell table did not load.']
      const row = state?.panel === 'spells' ? state.row : -1
      const lines = [
        ...castable(context, state).map(
          (spell, i) => `${mark(i === row)}${spell.name} — ${spell.cost} ${mp}`,
        ),
        ...learnt
          .filter((spell) => !spell.field)
          .map((spell) => `   ${spell.name} — ${spell.cost} ${mp}, in battle`),
      ]
      if (castable(context, state).length === 0) {
        lines.push(context.noSpells ?? 'No spells to cast here.')
      }
      return [...lines, ...(state?.said ?? [])]
    }
    case 'skills': {
      // **The trees, then one tree's panels.** The game's own screen is a
      // grid; this is the same choice made twice in a list, which is what the
      // rest of this menu is made of.
      const who = whose(context, state)
      const skills = who?.skills
      if (!skills) {
        return [
          `${who?.name ?? context.hero} has no skill screen.`,
          'Only somebody who levels has skill points — see `skills.ts`.',
        ]
      }
      const left = `${word(MENU_WORDS.pointsLeft, 'Points Remaining:')} ${skills.pool}`
      const row = state?.panel === 'skills' ? (state.row ?? 0) : -1
      const open =
        state?.tree === undefined
          ? undefined
          : skills.trees.find((tree) => tree.tree === state.tree)
      if (skills.trees.length === 0) {
        return [
          `${who?.name ?? context.hero} — ${left}`,
          'Which trees this vocation may spend in is not read: the ARM9 table did not load.',
        ]
      }
      if (!open) {
        return [
          `${who?.name ?? context.hero} — ${left}`,
          ...skills.trees.map((tree, i) => `${mark(i === row)}${tree.name} — ${tree.spent}/100`),
          ...(state?.said ?? []),
        ]
      }
      return [
        `${who?.name ?? context.hero} — ${open.name} ${open.spent}/100 · ${left}`,
        ...open.steps.map((step, i) => {
          // A panel past the points already in the tree says what reaching it
          // would cost; the eleventh says nothing, because nothing here knows
          // what unlocks it — see `climbable` in `skills.ts`.
          const state_ = step.bought
            ? '✓'
            : step.buyable
              ? `${step.panel.cost} (${step.toBuy} to go)`
              : 'not yet'
          return `${mark(i === row)}${step.name} — ${state_}`
        }),
        ...(state?.said ?? []),
      ]
    }
    case 'pot': {
      // **The Krak Pot.** What can be cooked now comes first — ours, and what
      // makes a list of 470 usable before the recipe books are read; see
      // `potList`. What each is short of is named, because "you can't make
      // that" without saying why is the worst sort of menu.
      const pot = context.pot
      if (!pot) return ['The recipes are not read: `recipe.gp2` did not load.']
      const ready = pot.filter((entry) => entry.ready)
      const row = state?.panel === 'pot' ? (state.row ?? 0) : -1
      const potSay = (number: number, ours: string) => context.potWords?.get(number) ?? ours
      // Only a window's worth, around the row: 470 lines is not a panel.
      const from = Math.max(0, Math.min(row < 0 ? 0 : row - 4, pot.length - 12))
      return [
        potSay(1, 'Choose the recipe for the item you’re hoping to cook up.'),
        `${ready.length} of ${pot.length} recipes can be made from the bag.`,
        ...pot.slice(from, from + 12).map((entry, i) => {
          const at = from + i
          const wanted = entry.recipe.ingredients
            .map(({ item, count }) => `${count}× ${nameOf(item)}`)
            .join(' + ')
          const state_ = entry.ready
            ? ''
            : ` — short ${entry.short.map((s) => `${s.short}× ${nameOf(s.item)}`).join(', ')}`
          return `${mark(at === row)}${entry.name} = ${wanted}${state_}`
        }),
        ...(state?.said ?? []),
      ]
    }
    case 'make': {
      // **The knobs the game has**, read from overlay 15's debug viewer —
      // Gender, Face, Eye Colour, Skin Colour, Hairstyle, Hair Colour, Build.
      // Three of them cannot be drawn here and say so; see `appearance.ts`.
      const knobs = context.look
      if (!knobs) return ['There is nobody to look at yet.']
      const who = whose(context, state)
      const row = state?.panel === 'make' ? (state.row ?? 0) : -1
      return [
        `${who?.name ?? context.hero} — take a row to change it`,
        ...knobs.map((knob, i) => `${mark(i === row)}${knob.label}: ${knob.shown}`),
        ...(state?.said ?? []),
      ]
    }
    case 'talk':
      return []
  }
}
