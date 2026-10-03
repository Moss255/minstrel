/**
 * **The DS's buttons**, and which keys and pad buttons stand for each.
 *
 * Each action is one of the DS's buttons — the +Control Pad, A, B, X, Y, L,
 * R, START and SELECT — with the keys and the standard-layout pad buttons
 * bound to it, which the player may change and which the browser keeps. Two
 * more are ours: the mini-map and the music. The development keys — a fight,
 * a level, the chapters, the stages, the collision — are not here and stay
 * fixed.
 *
 * **What each button does is the game's own word**, in its English text (EU):
 * A to examine and confirm (`tms_sta`, Collapsus's lines); B held with the
 * +Control Pad for a party trick (`str_tm` 4023, Ricki's lines); X for the
 * menu and SELECT for the Battle Records (Stella, `ev22593`); Y for "the
 * world map, or … the story so far", L and R to move the view, and L to
 * confirm as well as A (the tips in `Header`). **Ours**: the keys and pad
 * buttons chosen for each, and that L only turns the view here.
 */

export const ACTIONS = [
  'up',
  'down',
  'left',
  'right',
  'confirm',
  'cancel',
  'menu',
  'y',
  'turnLeft',
  'turnRight',
  'start',
  'select',
  'map',
  'music',
] as const
export type Action = (typeof ACTIONS)[number]

/** The buttons that do nothing yet, which a layout may leave without a key. */
const NOT_YET: ReadonlySet<Action> = new Set(['y', 'start', 'select'])

/** What each button reads as in the controls panel: the DS's name, then what it does. */
export const ACTION_LABELS: Readonly<Record<Action, string>> = {
  up: '+Control Pad up — walk forward',
  down: '+Control Pad down — walk back',
  left: '+Control Pad left — walk left',
  right: '+Control Pad right — walk right',
  confirm: 'A Button — talk, examine, confirm',
  cancel: 'B Button — back; held with the +Control Pad, a trick',
  menu: 'X Button — the menu',
  y: 'Y Button — the world map, the story so far (not built yet)',
  turnLeft: 'L Button — turn the view left',
  turnRight: 'R Button — turn the view right',
  start: 'START — nothing in the field',
  select: 'SELECT — the Battle Records (not built yet)',
  map: 'Ours — the mini-map on and off',
  music: 'Ours — the music on and off',
}

export interface Binding {
  /** `event.key` in lower case: `w`, `arrowup`, `enter`, ` ` for space. */
  readonly keys: readonly string[]
  /** Gamepad button indices in the browser's standard layout. */
  readonly buttons: readonly number[]
}
export type Bindings = Readonly<Record<Action, Binding>>

/**
 * The defaults: the keys the game has always read, and the standard pad by
 * its buttons' names — 12–15 the d-pad, 0 A, 1 B, 2 X, 3 Y, 4 and 5 the
 * shoulders, 8 select, 9 start; the mini-map and the music on the triggers.
 *
 * `q` and `e` turn the camera, on 4 and 5, the shoulders. **Ours**, and not
 * read from the cartridge: the DS had one stick, so whatever turns the camera
 * there cannot be the right stick this reads, and which buttons it used has
 * not been checked. What is deliberate here is that the keys do exactly what
 * the right stick does, at {@link LOOK_RATE}, so holding one is holding the
 * stick over and the two ways of turning cannot disagree.
 */
export const DEFAULT_BINDINGS: Bindings = {
  up: { keys: ['w', 'arrowup'], buttons: [12] },
  down: { keys: ['s', 'arrowdown'], buttons: [13] },
  left: { keys: ['a', 'arrowleft'], buttons: [14] },
  right: { keys: ['d', 'arrowright'], buttons: [15] },
  confirm: { keys: ['f', 'enter'], buttons: [0] },
  cancel: { keys: ['escape'], buttons: [1] },
  turnLeft: { keys: ['q'], buttons: [4] },
  turnRight: { keys: ['e'], buttons: [5] },
  menu: { keys: ['x'], buttons: [2] },
  y: { keys: ['z'], buttons: [3] },
  start: { keys: [], buttons: [9] },
  select: { keys: [], buttons: [8] },
  map: { keys: ['m'], buttons: [6] },
  music: { keys: ['b'], buttons: [7] },
}

export const CONTROLS_KEY = 'minstrel.controls'

/** The action a key does, or none. */
export function actionOfKey(bindings: Bindings, key: string): Action | undefined {
  return ACTIONS.find((action) => bindings[action].keys.includes(key))
}

/** The action a pad button does, or none. */
export function actionOfButton(bindings: Bindings, button: number): Action | undefined {
  return ACTIONS.find((action) => bindings[action].buttons.includes(button))
}

/**
 * Bind a key to an action, taking it from any other; a key bound to its own
 * action already is left as it is.
 */
export function bindKey(bindings: Bindings, action: Action, key: string): Bindings {
  const out = {} as Record<Action, Binding>
  for (const each of ACTIONS) {
    const keys = bindings[each].keys.filter((k) => k !== key)
    out[each] = { ...bindings[each], keys: each === action ? [...keys, key] : keys }
  }
  return out
}

/** Bind a pad button to an action, taking it from any other. */
export function bindButton(bindings: Bindings, action: Action, button: number): Bindings {
  const out = {} as Record<Action, Binding>
  for (const each of ACTIONS) {
    const buttons = bindings[each].buttons.filter((b) => b !== button)
    out[each] = { ...bindings[each], buttons: each === action ? [...buttons, button] : buttons }
  }
  return out
}

/** Take every key and button off an action. */
export function clearAction(bindings: Bindings, action: Action): Bindings {
  return { ...bindings, [action]: { keys: [], buttons: [] } }
}

/** Whether every button that does something has at least one key — a layout that can be played on a keyboard. */
export function playable(bindings: Bindings): boolean {
  return ACTIONS.every((action) => NOT_YET.has(action) || bindings[action].keys.length > 0)
}

/** The bindings as saved, or the defaults; anything that does not read falls back whole. */
export function bindingsFrom(saved: string | null | undefined): Bindings {
  if (!saved) return DEFAULT_BINDINGS
  try {
    const parsed = JSON.parse(saved) as Record<string, { keys?: unknown; buttons?: unknown }>
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_BINDINGS
    const out = {} as Record<Action, Binding>
    for (const action of ACTIONS) {
      const entry = parsed[action]
      const keys = Array.isArray(entry?.keys) ? entry.keys.filter((k) => typeof k === 'string') : []
      const buttons = Array.isArray(entry?.buttons)
        ? entry.buttons.filter((b) => Number.isInteger(b))
        : []
      out[action] = entry ? { keys, buttons } : DEFAULT_BINDINGS[action]
    }
    // A button new since the layout was saved takes its defaults, less any
    // key or pad button the saved layout already gives another.
    const taken = (pick: (b: Binding) => readonly (string | number)[]) =>
      new Set(ACTIONS.filter((a) => parsed[a]).flatMap((a) => pick(out[a])))
    const keysTaken = taken((b) => b.keys)
    const buttonsTaken = taken((b) => b.buttons)
    for (const action of ACTIONS) {
      if (parsed[action]) continue
      out[action] = {
        keys: out[action].keys.filter((k) => !keysTaken.has(k)),
        buttons: out[action].buttons.filter((b) => !buttonsTaken.has(b)),
      }
    }
    return out
  } catch {
    return DEFAULT_BINDINGS
  }
}

export function bindingsToJson(bindings: Bindings): string {
  return JSON.stringify(bindings)
}

/** A key's name as the panel shows it. */
export function keyLabel(key: string): string {
  if (key === ' ') return 'Space'
  if (key.startsWith('arrow')) return `${key.slice(5, 6).toUpperCase()}${key.slice(6)} arrow`
  return key.length === 1 ? key.toUpperCase() : key.slice(0, 1).toUpperCase() + key.slice(1)
}

/** A pad button's name in the standard layout, as the panel shows it. */
export function buttonLabel(button: number): string {
  const names: Record<number, string> = {
    0: 'A / Cross',
    1: 'B / Circle',
    2: 'X / Square',
    3: 'Y / Triangle',
    4: 'L1',
    5: 'R1',
    6: 'L2',
    7: 'R2',
    8: 'Select',
    9: 'Start',
    10: 'L3',
    11: 'R3',
    12: 'D-pad up',
    13: 'D-pad down',
    14: 'D-pad left',
    15: 'D-pad right',
    16: 'Home',
  }
  return names[button] ?? `Button ${button}`
}

/**
 * Which pad buttons went down since the last look: the actions to fire once.
 * `pressed` is each button's value now; `before` the last frame's.
 */
export function pressedActions(
  bindings: Bindings,
  buttons: readonly number[],
  before: readonly number[],
): Action[] {
  const fired: Action[] = []
  for (let i = 0; i < buttons.length; i++) {
    const down = (buttons[i] as number) > 0.5
    const was = (before[i] ?? 0) > 0.5
    if (!down || was) continue
    const action = actionOfButton(bindings, i)
    if (action) fired.push(action)
  }
  return fired
}

/** The movement token the player reads for a direction — see `player.ts`, which reads `w a s d`. */
export const MOVE_TOKENS: Readonly<Partial<Record<Action, string>>> = {
  up: 'w',
  down: 's',
  left: 'a',
  right: 'd',
}
