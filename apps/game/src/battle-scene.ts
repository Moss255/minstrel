import {
  type BattleEvent,
  BattleRng,
  type BattleState,
  type Command,
  type Fighter,
  playRound,
  startBattle,
  withHp,
} from '@minstrel/sim'

/**
 * A battle as the player sees it: the monsters appear, the party chooses —
 * fight, defend or flee, and whom to fight — the round plays out a message at a
 * time, and the next choice comes, until it is over. The rules are
 * `@minstrel/sim`'s; this is only the telling of them.
 *
 * **The words are ours.** The cartridge's own battle messages are in
 * `/data/bin/strbtl.gp2`, not read yet. So is the plural: "2 slimes" adds an
 * `s`, where the monster data holds each plural of its own.
 */

export type Phase = 'command' | 'target' | 'telling' | 'over'

export const BATTLE_COMMANDS = ['Fight', 'Defend', 'Flee'] as const

export interface BattleScene {
  readonly state: BattleState
  /** The battle's own numbers. Drawn from as the battle goes: not copied. */
  readonly rng: BattleRng
  readonly phase: Phase
  readonly cursor: number
  /** The message on show while telling — the first — and those still to come. */
  readonly pages: readonly string[]
  /** Whether what the battle came to has been handed out; the caller sets it. */
  readonly settled: boolean
}

export function beginBattle(
  fighters: readonly Fighter[],
  seed: bigint,
  options: { readonly canFlee: boolean; readonly hp?: ReadonlyMap<number, number> },
): BattleScene {
  const started = startBattle(fighters, options.canFlee)
  const state = options.hp ? withHp(started, options.hp) : started
  return {
    state,
    rng: new BattleRng(seed),
    phase: 'telling',
    cursor: 0,
    pages: appearing(state),
    settled: false,
  }
}

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const article = (name: string) => (/^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`)

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

function appearing(state: BattleState): string[] {
  const foes = new Map<string, number>()
  for (const f of state.fighters) {
    if (f.side === 'foes') foes.set(f.name, (foes.get(f.name) ?? 0) + 1)
  }
  return [...foes].map(([name, n]) =>
    sentence(n === 1 ? `${article(name)} appears!` : `${n} ${name}s appear!`),
  )
}

/** What one event says, as a page. */
export function tell(event: BattleEvent, labels: readonly string[], state: BattleState): string {
  const who = labels[event.actor] ?? '?'
  switch (event.kind) {
    case 'attack': {
      const whom = labels[event.target] ?? '?'
      const lines = [`${who} attacks!`]
      if (event.dodged) lines.push(`${whom} dodges out of the way!`)
      else if (event.blocked) lines.push(`${whom} blocks the blow with a shield!`)
      else {
        if (event.critical) lines.push('A critical hit!')
        lines.push(
          event.damage > 0 ? `${whom} takes ${event.damage} damage.` : `${whom} takes no damage.`,
        )
      }
      return lines.map(sentence).join('\n')
    }
    case 'defend':
      return sentence(`${who} is on guard.`)
    case 'flee':
      if (event.escaped) return sentence(`${who} runs away!`)
      return sentence(
        state.canFlee
          ? `${who} tries to run, but cannot get away!`
          : `${who} tries to run, but there is no escape!`,
      )
    case 'defeated':
      return sentence(
        state.fighters[event.actor]?.side === 'foes' ? `${who} is defeated!` : `${who} has fallen!`,
      )
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

/** The rows to choose from: the commands, or the monsters standing. */
export function battleRows(scene: BattleScene): string[] {
  if (scene.phase === 'command') return [...BATTLE_COMMANDS]
  if (scene.phase === 'target') {
    const labels = labelsOf(scene.state)
    return livingFoes(scene.state).map((i) => labels[i] ?? '?')
  }
  return []
}

/** Choose another row, round and round. */
export function battleMove(scene: BattleScene, by: number): BattleScene {
  const count = battleRows(scene).length
  if (count === 0) return scene
  return { ...scene, cursor: (((scene.cursor + by) % count) + count) % count }
}

/** Go back a step: from choosing whom to fight, to the commands. */
export function battleBack(scene: BattleScene): BattleScene {
  return scene.phase === 'target' ? { ...scene, phase: 'command', cursor: 0 } : scene
}

/** More to tell, after what is already to be told — what the battle came to, say. */
export function withPages(scene: BattleScene, pages: readonly string[]): BattleScene {
  if (pages.length === 0) return scene
  return { ...scene, phase: 'telling', pages: [...scene.pages, ...pages] }
}

function play(scene: BattleScene, command: Command): BattleScene {
  const party = partyIndex(scene.state)
  const { state, events } = playRound(scene.state, new Map([[party, command]]), scene.rng)
  const labels = labelsOf(state)
  const pages = events.map((event) => tell(event, labels, state))
  const hero = labels[party] ?? '?'
  if (state.outcome === 'won') pages.push(sentence(`${hero} is victorious!`))
  if (state.outcome === 'lost') pages.push(sentence(`${hero} has been defeated.`))
  return { ...scene, state, phase: 'telling', cursor: 0, pages }
}

/** Take the chosen row, or go on to the next message. */
export function battleChoose(scene: BattleScene): BattleScene {
  switch (scene.phase) {
    case 'telling': {
      const pages = scene.pages.slice(1)
      if (pages.length > 0) return { ...scene, pages }
      return {
        ...scene,
        pages,
        cursor: 0,
        phase: scene.state.outcome === 'ongoing' ? 'command' : 'over',
      }
    }
    case 'command': {
      const command = BATTLE_COMMANDS[scene.cursor]
      if (command === 'Defend') return play(scene, { kind: 'defend' })
      if (command === 'Flee') return play(scene, { kind: 'flee' })
      const foes = livingFoes(scene.state)
      if (foes.length === 1) return play(scene, { kind: 'attack', target: foes[0] as number })
      return { ...scene, phase: 'target', cursor: 0 }
    }
    case 'target': {
      const target = livingFoes(scene.state)[scene.cursor]
      if (target === undefined) return scene
      return play(scene, { kind: 'attack', target })
    }
    case 'over':
      return scene
  }
}
