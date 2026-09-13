import { ActionEffect, ActionReach } from '@minstrel/game-formats'
import {
  type BattleEvent,
  BattleRng,
  type BattleState,
  type Command,
  type Fighter,
  type Heal,
  playRound,
  type Spell,
  startBattle,
  withHp,
  withMp,
} from '@minstrel/sim'
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

export type Phase = 'command' | 'target' | 'item' | 'spell' | 'telling' | 'over'

/** The commands, in the order `str_btl` numbers them — Attack, Spells, Defend, then Items — and Flee. */
export const BATTLE_COMMANDS = ['Attack', 'Spells', 'Defend', 'Items', 'Flee'] as const
type BattleCommand = (typeof BATTLE_COMMANDS)[number]

/** Each command's word in `str_btl`, the battle menu's own. */
const COMMAND_WORDS: Readonly<Record<BattleCommand, number>> = {
  Attack: 30004,
  Spells: 30005,
  Defend: 30006,
  Items: 30008,
  Flee: 30001,
}
/** `str_btl`'s word for a party member with nothing to use. */
const NO_ITEMS = 30024
/** `str_btl`'s word for one who knows no battle `<str_2>` yet, and its word for spells. */
const NO_SPELLS = 30023
const SPELLS_WORD = 30021

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
  healed: 22,
  nothingHappens: 31,
  critical: 140,
  shield: 150,
  dodges: 151,
  /** Someone casts a spell, `<ACTION>`. */
  casts: 46,
  /** A spell's critical: it goes haywire. */
  haywire: 141,
  notEnoughMp: 153,
} as const

/** `str_bres`'s messages, by what they say. */
export const RESULT_SAYS = {
  earns: 6,
  level: 10,
  gold: 16,
  wipedOut: 20,
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
export interface BattleSpell {
  readonly spell: Spell
  readonly name: Named
  readonly message: number
}

/** An action, as far as a battle casts it — see `ItemEffect` in `load.ts`. */
export interface Castable {
  readonly action: number
  readonly name: string
  /** What it does — `ActionEffect`. */
  readonly effect: number
  readonly message: number
  readonly cost: number
  /** Whom it reaches — `ActionReach`. */
  readonly reach: number
  /** The party's amount, a base give or take a spread. */
  readonly range: Heal | undefined
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
export function battleSpellOf(action: Castable): BattleSpell | undefined {
  const does =
    action.effect === ActionEffect.RestoresHp
      ? 'heal'
      : action.effect === ActionEffect.Damages
        ? 'harm'
        : undefined
  const reach = REACHES.get(action.reach)
  if (!does || !reach) return undefined
  return {
    spell: { action: action.action, cost: action.cost, does, reach, amount: action.range },
    name: { name: action.name },
    message: action.message,
  }
}

/**
 * A monster's motion while a page is on show: `appear` as it draws near, its
 * attack as it strikes, `damage` as it is hit, `death` as it falls. The motions
 * are the monster's own, by name — see `monsters.ts`; which plays when is ours.
 */
export interface Cue {
  readonly fighter: number
  readonly motion: 'appear' | 'attack' | 'damage' | 'death'
}

export interface BattleScene {
  readonly state: BattleState
  /** The battle's own numbers. Drawn from as the battle goes: not copied. */
  readonly rng: BattleRng
  readonly phase: Phase
  readonly cursor: number
  /** The message on show while telling — the first — and those still to come. */
  readonly pages: readonly string[]
  /** What the monsters do while each page is on show, page for page. */
  readonly cues: readonly (readonly Cue[])[]
  /** Whether what the battle came to has been handed out; the caller sets it. */
  readonly settled: boolean
  /** Each fighter's name as the words use it, in the fighters' order, lettered where kinds repeat. */
  readonly names: readonly Named[]
  readonly words: BattleWords | undefined
  /** What the Items command offers, while one is being chosen. */
  readonly items: readonly BattleItem[]
  /** What the Spells command offers, while one is being chosen and told. */
  readonly spells: readonly BattleSpell[]
  /** A spell chosen and waiting for whom to cast it at. */
  readonly pending?: BattleSpell | undefined
  /** What the last round came to — an item used, for the caller to take from the bag. */
  readonly events: readonly BattleEvent[]
}

export function beginBattle(
  fighters: readonly Fighter[],
  seed: bigint,
  options: {
    readonly canFlee: boolean
    readonly hp?: ReadonlyMap<number, number>
    /** MP each fighter comes in with, where it is not all of it. */
    readonly mp?: ReadonlyMap<number, number>
    readonly words?: BattleWords
    readonly names?: readonly Named[]
  },
): BattleScene {
  const started = startBattle(fighters, options.canFlee)
  const wounded = options.hp ? withHp(started, options.hp) : started
  const state = options.mp ? withMp(wounded, options.mp) : wounded
  const scene: BattleScene = {
    state,
    rng: new BattleRng(seed),
    phase: 'telling',
    cursor: 0,
    pages: [],
    cues: [],
    settled: false,
    names: lettered(fighters.map((f, i) => options.names?.[i] ?? { name: f.name })),
    words: options.words,
    items: [],
    spells: [],
    events: [],
  }
  const pages = appearing(scene)
  // Every monster appears as the first page tells of them.
  const appear = state.fighters.flatMap((f, i) =>
    f.side === 'foes' ? [{ fighter: i, motion: 'appear' as const }] : [],
  )
  return { ...scene, pages, cues: pages.map((_, p) => (p === 0 ? appear : [])) }
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

type WordFile = Exclude<keyof BattleWords, 'articles'>

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
      }
      return ours.map(sentence).join('\n')
    }
    case 'defend':
      return (
        say(scene, 'actions', ACTION_SAYS.defends, { actor }) ?? sentence(`${who} is on guard.`)
      )
    case 'flee': {
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
      const chosen = scene.spells.find((s) => s.spell.action === event.action)
      const action = chosen?.name ?? { name: `spell ${event.action}` }
      const heals = chosen?.spell.does === 'heal'
      const casts = say(scene, 'actions', ACTION_SAYS.casts, { actor, action })
      if (event.short) {
        const game = lines(casts, say(scene, 'actions', ACTION_SAYS.notEnoughMp, {}))
        return game ?? `${sentence(`${who} casts ${shown(action)}!`)}\nNot enough MP!`
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
        casts,
        ...(event.critical ? [say(scene, 'actions', ACTION_SAYS.haywire, { actor, action })] : []),
        ...(landed.length > 0 ? landed : [say(scene, 'actions', ACTION_SAYS.nothingHappens, {})]),
      )
      if (game !== undefined) return game
      const ours = [`${who} casts ${shown(action)}!`]
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
    case 'defeated': {
      const foe = state.fighters[event.actor]?.side === 'foes'
      const game = say(scene, 'actions', foe ? ACTION_SAYS.defeated : ACTION_SAYS.dies, {
        target: actor,
      })
      return game ?? sentence(foe ? `${who} is defeated!` : `${who} has fallen!`)
    }
  }
}

/** What the monsters do while an event's page is on show. */
function cuesOf(event: BattleEvent, state: BattleState): Cue[] {
  const foe = (i: number) => state.fighters[i]?.side === 'foes'
  switch (event.kind) {
    case 'attack': {
      const cues: Cue[] = []
      if (foe(event.actor)) cues.push({ fighter: event.actor, motion: 'attack' })
      if (foe(event.target) && event.damage > 0 && !event.dodged && !event.blocked)
        cues.push({ fighter: event.target, motion: 'damage' })
      return cues
    }
    case 'spell':
      return event.hits.flatMap((hit) =>
        foe(hit.target) && hit.amount > 0 && foe(event.actor) === false
          ? [{ fighter: hit.target, motion: 'damage' as const }]
          : [],
      )
    case 'defeated':
      return foe(event.actor) ? [{ fighter: event.actor, motion: 'death' }] : []
    default:
      return []
  }
}

/** Where the party's one member is: the first party fighter. */
function partyIndex(state: BattleState): number {
  return Math.max(
    0,
    state.fighters.findIndex((f) => f.side === 'party'),
  )
}

const livingFoes = (state: BattleState) =>
  state.fighters.flatMap((f, i) => (f.side === 'foes' && f.hp > 0 ? [i] : []))

/** The rows to choose from: the commands, the monsters standing, or the items. */
export function battleRows(scene: BattleScene): string[] {
  if (scene.phase === 'command') {
    return BATTLE_COMMANDS.map((command) => {
      const word = scene.words?.menu.get(COMMAND_WORDS[command])
      return word === undefined ? command : tellBattle(word, {}, new Map()).text
    })
  }
  if (scene.phase === 'target') {
    const labels = labelsOf(scene.state)
    return livingFoes(scene.state).map((i) => labels[i] ?? '?')
  }
  if (scene.phase === 'spell') {
    return scene.spells.map((s) => `${shown(s.name)} — ${s.spell.cost} MP`)
  }
  if (scene.phase === 'item') {
    return scene.items.map((i) => (i.count > 1 ? `${shown(i.name)} ×${i.count}` : shown(i.name)))
  }
  return []
}

/** Choose another row, round and round. */
export function battleMove(scene: BattleScene, by: number): BattleScene {
  const count = battleRows(scene).length
  if (count === 0) return scene
  return { ...scene, cursor: (((scene.cursor + by) % count) + count) % count }
}

/** Go back a step: from choosing whom, or what to use or cast, to the commands. */
export function battleBack(scene: BattleScene): BattleScene {
  return scene.phase === 'target' || scene.phase === 'item' || scene.phase === 'spell'
    ? { ...scene, phase: 'command', cursor: 0, pending: undefined }
    : scene
}

/** More to tell, after what is already to be told — what the battle came to, say. */
export function withPages(scene: BattleScene, pages: readonly string[]): BattleScene {
  if (pages.length === 0) return scene
  return {
    ...scene,
    phase: 'telling',
    pages: [...scene.pages, ...pages],
    cues: [...scene.cues, ...pages.map(() => [])],
  }
}

function play(scene: BattleScene, command: Command): BattleScene {
  const party = partyIndex(scene.state)
  const { state, events } = playRound(scene.state, new Map([[party, command]]), scene.rng)
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
  return { ...scene, state, phase: 'telling', cursor: 0, pages, cues, events, pending: undefined }
}

/** Cast a spell at a fighter — for one that reaches further, at that fighter's kind or side. */
function cast(scene: BattleScene, chosen: BattleSpell, target: number): BattleScene {
  return play(scene, { kind: 'spell', spell: chosen.spell, target })
}

/**
 * Take the chosen row, or go on to the next message. The Items command offers
 * `items`, what the bag holds that can be used, and the Spells command
 * `spells`, what the party knows — the caller's to say, as neither the bag nor
 * the spell table is the battle's. A spell that heals is cast on the party; one
 * that harms asks whom when it could reach more than one foe it reaches, or
 * more than one kind of them.
 */
export function battleChoose(
  scene: BattleScene,
  items: readonly BattleItem[] = [],
  spells: readonly BattleSpell[] = [],
): BattleScene {
  switch (scene.phase) {
    case 'telling': {
      const pages = scene.pages.slice(1)
      const cues = scene.cues.slice(1)
      if (pages.length > 0) return { ...scene, pages, cues }
      return {
        ...scene,
        pages,
        cues,
        cursor: 0,
        phase: scene.state.outcome === 'ongoing' ? 'command' : 'over',
      }
    }
    case 'command': {
      const command = BATTLE_COMMANDS[scene.cursor]
      if (command === 'Defend') return play(scene, { kind: 'defend' })
      if (command === 'Flee') return play(scene, { kind: 'flee' })
      if (command === 'Spells') {
        if (spells.length > 0) return { ...scene, phase: 'spell', cursor: 0, spells }
        const party = partyIndex(scene.state)
        const kind = scene.words?.menu.get(SPELLS_WORD) ?? 'spells'
        const none =
          say(scene, 'menu', NO_SPELLS, { actor: scene.names[party], values: { str_2: kind } }) ??
          `${labelsOf(scene.state)[party] ?? '?'} doesn’t know any battle spells yet.`
        return { ...scene, phase: 'telling', pages: [none], cues: [[]] }
      }
      if (command === 'Items') {
        if (items.length > 0) return { ...scene, phase: 'item', cursor: 0, items }
        const party = partyIndex(scene.state)
        const none =
          say(scene, 'menu', NO_ITEMS, { actor: scene.names[party] }) ??
          `${labelsOf(scene.state)[party] ?? '?'} has nothing to use.`
        return { ...scene, phase: 'telling', pages: [none], cues: [[]] }
      }
      const foes = livingFoes(scene.state)
      if (foes.length === 1) return play(scene, { kind: 'attack', target: foes[0] as number })
      return { ...scene, phase: 'target', cursor: 0 }
    }
    case 'target': {
      const target = livingFoes(scene.state)[scene.cursor]
      if (target === undefined) return scene
      if (scene.pending) return cast(scene, scene.pending, target)
      return play(scene, { kind: 'attack', target })
    }
    case 'spell': {
      const chosen = scene.spells[scene.cursor]
      if (!chosen) return scene
      if (chosen.spell.does === 'heal') return cast(scene, chosen, partyIndex(scene.state))
      const foes = livingFoes(scene.state)
      const kinds = new Set(foes.map((i) => scene.state.fighters[i]?.name))
      const asks =
        chosen.spell.reach === 'one'
          ? foes.length > 1
          : chosen.spell.reach === 'group' && kinds.size > 1
      if (!asks) return cast(scene, chosen, foes[0] ?? partyIndex(scene.state))
      return { ...scene, phase: 'target', cursor: 0, pending: chosen }
    }
    case 'item': {
      const item = scene.items[scene.cursor]
      if (!item) return scene
      return play(
        scene,
        item.heal
          ? { kind: 'item', item: item.id, heal: item.heal }
          : { kind: 'item', item: item.id },
      )
    }
    case 'over':
      return scene
  }
}
