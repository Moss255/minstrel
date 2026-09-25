import { POT_CATEGORIES, POT_LABELS, type PotEntry, type PotSort } from './alchemy.ts'
import {
  type Appearance,
  HERO_APPEARANCE,
  type Making,
  makingPick,
  makingRows,
  makingTitle,
} from './appearance.ts'
import { type Bag, bagLines } from './bag.ts'
import { choicesFor, type Equipped, SLOTS, type Slot } from './equipment.ts'
import type { Standing } from './hero.ts'
import { LIST_MOST, PATTY_LABELS, PATTY_SAYS, pattyVocation, RECRUIT_VOCATIONS } from './recruit.ts'
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
  | 'patty'

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
]

/**
 * **Two panels that are not menu commands**, and never were in the game.
 *
 * Read 25 September 2026, after a play session found them in the wrong place:
 *
 * - `pot` — the **Krak Pot** is spoken to. `<RENKIN>` at the end of its own
 *   talk line is facility code 7, the same mechanism `<SHOP=n>` and
 *   `<CHURCH=n>` use; the pot stands in the Quester's Rest at Stornway
 *   (`R01M01`, "Lobby Interior 1") and says "A pot I may be, but I am in no
 *   way potty!" before it opens. See `Service` in `talk.ts`.
 * - `make` — **character creation** is its own scene, never a menu command.
 *   The protagonist's runs once from `main`'s game-mode 3, a party member's is
 *   a step inside Patty's flow at the Quester's Rest, and both are built now —
 *   see `askCreation` in `main.ts` and `PattyWhere.making`. What is left here
 *   is an *editor*, which the game has no equivalent of: it turns a knob on a
 *   character who already exists, and is reachable only by `?make=1`.
 *
 * - `patty` — **Patty's Party Planning Place**, service 23, reached by talking
 *   to her at the Quester's Rest. `<LUIDA>` is her tag, the same shape as the
 *   pot's `<RENKIN>`.
 *
 * They keep their `MenuCommand` ids because the panels are real; what they
 * lost is a row in the list, which is the thing that was wrong.
 */
export const UNLISTED_PANELS: readonly MenuCommand[] = ['pot', 'make', 'patty']

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
   * Where the Krak Pot is: which of its two modes, which of the
   * Alchenomicon's categories, how it is sorted, and what has been dropped in
   * for Try Your Luck. Undefined until the pot is opened.
   *
   * **The pot's navigation is all state**, so it lives here and is done in
   * `choose`; only the cooking leaves the menu.
   */
  readonly pot?: PotWhere | undefined
  /** Where Patty's flow is — see `recruit.ts`. Undefined until she is spoken to. */
  readonly patty?: PattyWhere | undefined
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

/** Where the Krak Pot is — see `MenuState.pot`. */
export interface PotWhere {
  /**
   * `top` its two modes, `category` the Alchenomicon's categories, `recipes`
   * the list inside one, `luck` picking ingredients by hand.
   *
   * **There is a fourth level in the game and not here**: within Weapons and
   * Armour the book narrows again by `POT_TYPES` — Swords, Shields, Torso and
   * the rest. The data for it is read and held to the cartridge; the panel
   * does not offer it yet.
   */
  readonly at: 'top' | 'category' | 'recipes' | 'luck'
  /** Which of `POT_CATEGORIES`, by its place. */
  readonly category: number
  readonly sort: PotSort
  /** What has been put in for Try Your Luck: item ids, repeated for a count. */
  readonly picked: readonly number[]
}

/**
 * Where Patty's flow is: her top menu, one of its lists, or the vocation
 * question. Her own steps 1 to 5, without the Rapportal side.
 */
export interface PattyWhere {
  readonly at: 'top' | 'callUp' | 'dropOff' | 'partWith' | 'vocation' | 'making'
  /**
   * The character being made, while `at` is `making` — the vocation chosen,
   * the look so far, and which of `CREATION_ORDER` is being asked.
   *
   * **One screen a knob**, which is how overlay 9 does it: its thirteen-step
   * table is a step per knob, each laying out a grid and reading one choice.
   */
  readonly making?: (Making & { readonly vocation: number }) | undefined
}

export function openPatty(): PattyWhere {
  return { at: 'top' }
}

export function openPot(): PotWhere {
  return { at: 'top', category: 0, sort: 'type', picked: [] }
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
  /** The pot's menu labels, `bm_rrb`, by number — see `POT_LABELS`. */
  readonly potLabels?: ReadonlyMap<number, string> | undefined
  /** How many recipes the Alchenomicon's category at `at` holds — see `POT_CATEGORIES`. */
  readonly potCount?: ((at: number) => number) | undefined
  /** Patty's own words, `str_lui`, and her menu labels, `bm_lui`. */
  readonly pattyWords?: ReadonlyMap<number, string> | undefined
  readonly pattyLabels?: ReadonlyMap<number, string> | undefined
  /** Those left with Patty, named and described as her lists show them. */
  readonly kept?: readonly { readonly name: string; readonly said: string }[] | undefined
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

/**
 * What Patty's top menu offers, in her own order — and **Drop Off is left out
 * when the party is only the Hero**, which is her window `0x1D` instead of
 * `0x1E` (`0x02162084`).
 */
function pattyTop(context: MenuContext | undefined): { at: PattyWhere['at']; label: number }[] {
  const alone = (context?.party?.length ?? 1) <= 1
  return [
    { at: 'callUp' as const, label: PATTY_LABELS.callUp },
    { at: 'vocation' as const, label: PATTY_LABELS.recruit },
    ...(alone ? [] : [{ at: 'dropOff' as const, label: PATTY_LABELS.dropOff }]),
    { at: 'partWith' as const, label: PATTY_LABELS.partWith },
  ]
}

/** How many rows Patty's flow has, wherever it is. */
function pattyRows(context: MenuContext | undefined, where: PattyWhere | undefined): number {
  if (!where) return 0
  // Every list has a last row that goes back, so none can be a dead end.
  if (where.at === 'top') return pattyTop(context).length + 1
  if (where.at === 'vocation') return RECRUIT_VOCATIONS.length + 1
  if (where.at === 'making') return where.making ? makingRows(where.making).length : 0
  if (where.at === 'dropOff') return (context?.party?.length ?? 0) + 1
  return (context?.kept?.length ?? 0) + 1
}

/** The Alchenomicon's categories that have anything in them, with their places kept. */
const potCategories = (context: MenuContext | undefined) =>
  POT_CATEGORIES.map((one, at) => ({ at, label: one.label })).filter(
    ({ at }) => (context?.potCount?.(at) ?? 0) > 0,
  )

/** What the pot's rows are, wherever it is. */
function potRows(context: MenuContext | undefined, where: PotWhere | undefined): number {
  if (!where) return 0
  if (where.at === 'top') return 3
  if (where.at === 'category') return potCategories(context).length
  if (where.at === 'luck') return (context?.bag?.items.size ?? 0) + 1
  return (context?.pot?.length ?? 0) + 1
}

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
    const count = potRows(context, state.pot)
    return count === 0 ? state : { ...state, row: wrap(state.row, count), said: undefined }
  }
  if (state.panel === 'patty') {
    const count = pattyRows(context, state.patty)
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
  /** Throw these ingredients in and see — see `tryYourLuck` in `alchemy.ts`. */
  readonly luck?: readonly number[]
  /** What Patty was asked to do — see `recruit.ts`. */
  readonly patty?:
    | { readonly does: 'callUp' | 'dropOff' | 'partWith'; readonly at: number }
    | {
        readonly does: 'recruit'
        readonly vocation: number
        /** The look its screens settled on — see `CREATION_ORDER`. */
        readonly look: Appearance
      }
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
  if (state.panel === 'patty') {
    const where = state.patty ?? openPatty()
    if (where.at === 'top') {
      const chosen = pattyTop(context)[state.row]
      return chosen
        ? { state: { ...state, patty: { at: chosen.at }, row: 0, said: undefined }, talk: false }
        : { state: { ...state, panel: undefined, patty: undefined, row: 0 }, talk: false }
    }
    const back = { ...state, patty: { at: 'top' as const }, row: 0, said: undefined }
    if (where.at === 'vocation') {
      const vocation = RECRUIT_VOCATIONS[state.row]
      if (vocation === undefined) return { state: back, talk: false }
      // **The vocation is the first question, and the appearance follows** —
      // exactly as her step 4 hands off to overlay 9.
      return {
        state: {
          ...state,
          patty: { at: 'making', making: { vocation, look: HERO_APPEARANCE, at: 0 } },
          row: 0,
          said: undefined,
        },
        talk: false,
      }
    }
    if (where.at === 'making') {
      const making = where.making
      if (!making) return { state: back, talk: false }
      const picked = makingPick(making, state.row)
      // The last knob answered files the character with Patty.
      if ('made' in picked) {
        return {
          state,
          talk: false,
          patty: { does: 'recruit', vocation: making.vocation, look: picked.made },
        }
      }
      return {
        state: {
          ...state,
          patty: { at: 'making', making: { ...making, ...picked.next } },
          row: 0,
        },
        talk: false,
      }
    }
    const most =
      where.at === 'dropOff' ? (context?.party?.length ?? 0) : (context?.kept?.length ?? 0)
    if (state.row >= most) return { state: back, talk: false }
    return { state, talk: false, patty: { does: where.at, at: state.row } }
  }
  if (state.panel === 'pot') {
    const where = state.pot ?? openPot()
    const at = (next: Partial<PotWhere>) => ({
      state: { ...state, pot: { ...where, ...next }, row: 0, said: undefined },
      talk: false,
    })
    if (where.at === 'top') {
      // Use A Recipe · Try Your Luck · Cancel.
      if (state.row === 0) return at({ at: 'category' })
      if (state.row === 1) return at({ at: 'luck', picked: [] })
      return { state: { ...state, panel: undefined, pot: undefined, row: 0 }, talk: false }
    }
    if (where.at === 'category') {
      const chosen = potCategories(context)[state.row]
      return chosen ? at({ at: 'recipes', category: chosen.at }) : { state, talk: false }
    }
    if (where.at === 'luck') {
      // The last row throws in what has been picked; the rest add an item.
      const items = [...(context?.bag?.items.keys() ?? [])]
      if (state.row >= items.length) {
        return where.picked.length > 0
          ? { state, talk: false, luck: where.picked }
          : { state, talk: false }
      }
      const item = items[state.row] as number
      // No more of an item than the bag holds, and no more than three in all.
      const already = where.picked.filter((one) => one === item).length
      const room = already < (context?.bag?.items.get(item) ?? 0) && where.picked.length < 3
      return room ? at({ at: 'luck', picked: [...where.picked, item] }) : { state, talk: false }
    }
    // A list of recipes: the last row is the sort toggle.
    const entries = context?.pot ?? []
    if (state.row >= entries.length) {
      return at({ at: 'recipes', sort: where.sort === 'type' ? 'name' : 'type' })
    }
    const entry = entries[state.row]
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
  if (state.patty && state.patty.at !== 'top') {
    return { ...state, patty: { at: 'top' }, row: 0, said: undefined }
  }
  if (state.pot && state.pot.at !== 'top') {
    // Out of a list and back to the two modes, rather than out of the pot.
    return { ...state, pot: { ...state.pot, at: 'top', picked: [] }, row: 0, said: undefined }
  }
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
    Partial<Pick<MenuState, 'panel' | 'said' | 'acting' | 'member' | 'tree' | 'pot' | 'patty'>>,
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
      // **The Krak Pot**, as the pot has it: two modes, then the
      // Alchenomicon's own categories, then a list. Its words are the
      // cartridge's — `bm_rrb` for the labels, `str_ren` for what it says.
      const where = state?.pot
      const row = state?.panel === 'pot' ? (state.row ?? 0) : -1
      const potSay = (number: number, ours: string) => context.potWords?.get(number) ?? ours
      const label = (number: number, ours: string) => context.potLabels?.get(number) ?? ours
      const title = label(POT_LABELS.title, 'Krak Pot')
      if (!where || where.at === 'top') {
        return [
          potSay(0, 'So, how will you be conducting your alchemy, hm?'),
          `${mark(row === 0)}${label(POT_LABELS.useRecipe, 'Use A Recipe')}`,
          `${mark(row === 1)}${label(POT_LABELS.tryLuck, 'Try Your Luck')}`,
          `${mark(row === 2)}Cancel`,
          ...(state?.said ?? []),
        ]
      }
      if (where.at === 'category') {
        const shown = potCategories(context)
        return [
          `${title} — ${label(POT_LABELS.alchenomicon, 'Alchenomicon')}`,
          ...shown.map(
            (one, i) =>
              `${mark(i === row)}${label(one.label, `category ${one.at}`)} (${context.potCount?.(one.at) ?? 0})`,
          ),
          ...(state?.said ?? []),
        ]
      }
      if (where.at === 'luck') {
        // **Try Your Luck**: up to three things in, and see. The bag's own
        // order, with what has been picked so far shown above it.
        const items = [...(context.bag?.items ?? [])]
        const put = where.picked.map((item) => nameOf(item)).join(' + ')
        return [
          potSay(3, 'So, you want to pop all the necessary ingredients into the pot?'),
          `In the pot: ${put || '(nothing yet)'}`,
          ...items.map(([item, held], i) => `${mark(i === row)}${nameOf(item)} ×${held}`),
          `${mark(row >= items.length)}Get kraking`,
          ...(state?.said ?? []),
        ]
      }
      const pot = context.pot
      if (!pot) return ['The recipes are not read: `recipe.gp2` did not load.']
      const ready = pot.filter((entry) => entry.ready)
      const sortLabel =
        where.sort === 'type'
          ? label(POT_LABELS.byType, 'By Type')
          : label(POT_LABELS.byName, 'By Name')
      // Only a window's worth around the row: a category can hold hundreds.
      const from = Math.max(0, Math.min(row < 0 ? 0 : row - 4, Math.max(0, pot.length - 10)))
      return [
        `${title} — ${label(POT_CATEGORIES[where.category]?.label ?? 0, 'All Recipes')}` +
          ` · ${ready.length} of ${pot.length} can be made · ${sortLabel}`,
        ...pot.slice(from, from + 10).map((entry, i) => {
          const at = from + i
          const wanted = entry.recipe.ingredients
            .map(({ item, count }) => `${count}× ${nameOf(item)}`)
            .join(' + ')
          const short = entry.ready
            ? ''
            : ` — short ${entry.short.map((s) => `${s.short}× ${nameOf(s.item)}`).join(', ')}`
          return `${mark(at === row)}${entry.name} = ${wanted}${short}`
        }),
        `${mark(row >= pot.length)}Sort: ${sortLabel}`,
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
    case 'patty': {
      // **Patty's Party Planning Place.** Her four-or-five item menu, then a
      // list; her words are `str_lui` and her labels `bm_lui`.
      const where = state?.patty
      const row = state?.panel === 'patty' ? (state.row ?? 0) : -1
      const her = (number: number, ours: string) => context.pattyWords?.get(number) ?? ours
      const label = (number: number, ours: string) => context.pattyLabels?.get(number) ?? ours
      const kept = context.kept ?? []
      if (!where || where.at === 'top') {
        return [
          her(PATTY_SAYS.greeting, 'So, what can I do for you, sweetie?'),
          ...pattyTop(context).map((one, i) => `${mark(i === row)}${label(one.label, one.at)}`),
          `${mark(row >= pattyTop(context).length)}Cancel`,
          ...(state?.said ?? []),
        ]
      }
      if (where.at === 'making') {
        // The same walk the Hero's own creation runs — see `Making` in
        // `appearance.ts`, which is where overlay 9's step-per-knob lives.
        const making = where.making
        if (!making) return ['Nothing is being made.']
        return [
          her(PATTY_SAYS.whatKind, 'What kinda person are you looking for?'),
          makingTitle(making),
          ...makingRows(making).map((shown, i) => `${mark(i === row)}${shown}`),
          ...(state?.said ?? []),
        ]
      }
      if (where.at === 'vocation') {
        return [
          her(PATTY_SAYS.whatKind, 'So, you wanna apply for a new party member, huh?'),
          `${label(PATTY_LABELS.vocation, 'Vocation')}:`,
          ...RECRUIT_VOCATIONS.map(
            (vocation, i) =>
              `${mark(i === row)}${label(pattyVocation(vocation), `vocation ${vocation}`)}`,
          ),
          `${mark(row >= RECRUIT_VOCATIONS.length)}Cancel`,
          ...(state?.said ?? []),
        ]
      }
      if (where.at === 'dropOff') {
        const party = context.party ?? []
        return [
          her(PATTY_SAYS.whoToDrop, 'So, who do you wanna drop off with me, then?'),
          ...party.map((who, i) => {
            // The Hero is slot 0 and cannot be dropped — shown, and refused.
            const level = who.standing?.level.level
            const at = i === 0 ? '  ' : mark(i === row)
            return `${at}${who.name}${level ? ` — ${label(PATTY_LABELS.level, 'Lv.')} ${level}` : ''}${i === 0 ? ' (stays)' : ''}`
          }),
          `${mark(row >= party.length)}Cancel`,
          ...(state?.said ?? []),
        ]
      }
      const asking =
        where.at === 'partWith'
          ? her(29, 'You wanna say goodbye to one of your party members?')
          : her(PATTY_SAYS.whoIsHere, 'Let me tell you who’s hanging out here right now.')
      return [
        asking,
        `${label(PATTY_LABELS.recruited, 'Friends Recruited')}: ${kept.length}/${LIST_MOST}`,
        ...kept.map((who, i) => `${mark(i === row)}${who.name} — ${who.said}`),
        `${mark(row >= kept.length)}Cancel`,
        ...(state?.said ?? []),
      ]
    }
    case 'talk':
      return []
  }
}
