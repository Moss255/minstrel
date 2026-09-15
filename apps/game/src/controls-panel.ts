import {
  ACTION_LABELS,
  ACTIONS,
  type Action,
  type Bindings,
  bindButton,
  bindingsFrom,
  bindingsToJson,
  bindKey,
  buttonLabel,
  CONTROLS_KEY,
  clearAction,
  DEFAULT_BINDINGS,
  keyLabel,
  playable,
} from './controls.ts'

/**
 * The controls panel: every action with its keys and pad buttons, one row
 * chosen at a time. Enter waits for the next key or pad button and binds it;
 * Backspace clears the row; `r` restores the defaults; Escape closes. The
 * panel's own keys are fixed, so no layout can lock it. What is changed is
 * kept in the browser under {@link CONTROLS_KEY}.
 */
export class ControlsPanel {
  bindings: Bindings
  private row = 0
  private capturing = false
  private message = ''

  constructor(
    private readonly el: HTMLElement,
    private readonly onChange: (bindings: Bindings) => void,
  ) {
    this.bindings = bindingsFrom(read())
    if (!playable(this.bindings)) this.bindings = DEFAULT_BINDINGS
  }

  get open(): boolean {
    return !this.el.hidden
  }

  /** Whether the panel is waiting for a key or button to bind. */
  get waiting(): boolean {
    return this.capturing
  }

  show(): void {
    this.el.hidden = false
    this.message = 'Enter binds a key or pad button · Backspace clears · r restores · Esc closes'
    this.render()
  }

  hide(): void {
    this.el.hidden = true
    this.capturing = false
  }

  /** A key while the panel is up: its own keys, or one to bind. True when it was taken. */
  key(key: string): boolean {
    if (this.capturing) {
      if (key === 'escape') {
        this.capturing = false
        this.message = 'nothing bound'
      } else {
        this.set(bindKey(this.bindings, ACTIONS[this.row] as Action, key))
        this.capturing = false
        this.message = `${keyLabel(key)} bound`
      }
      this.render()
      return true
    }
    switch (key) {
      case 'escape':
        this.hide()
        return true
      case 'arrowup':
        this.row = (this.row + ACTIONS.length - 1) % ACTIONS.length
        break
      case 'arrowdown':
        this.row = (this.row + 1) % ACTIONS.length
        break
      case 'enter':
        this.capturing = true
        this.message = `press a key or a pad button for “${ACTION_LABELS[ACTIONS[this.row] as Action]}” · Esc to leave it`
        break
      case 'backspace':
      case 'delete':
        this.set(clearAction(this.bindings, ACTIONS[this.row] as Action))
        this.message = 'cleared — an action with no key cannot be played on a keyboard'
        break
      case 'r':
        this.set(DEFAULT_BINDINGS)
        this.message = 'the defaults are back'
        break
      default:
        return true
    }
    this.render()
    return true
  }

  /** A pad button that went down while the panel waits: bound to the chosen row. */
  button(index: number): void {
    if (!this.capturing) return
    this.set(bindButton(this.bindings, ACTIONS[this.row] as Action, index))
    this.capturing = false
    this.message = `${buttonLabel(index)} bound`
    this.render()
  }

  private set(bindings: Bindings): void {
    this.bindings = bindings
    write(bindingsToJson(bindings))
    this.onChange(bindings)
  }

  private render(): void {
    this.el.replaceChildren()
    const title = document.createElement('div')
    title.className = 'controls-title'
    title.textContent = 'Controls'
    this.el.append(title)
    const rows = document.createElement('div')
    rows.className = 'controls-rows'
    for (const [i, action] of ACTIONS.entries()) {
      const row = document.createElement('div')
      row.className = i === this.row ? 'chosen' : ''
      const label = document.createElement('span')
      label.textContent = ACTION_LABELS[action]
      const bound = document.createElement('span')
      bound.className = 'bound'
      const binding = this.bindings[action]
      const parts = [...binding.keys.map(keyLabel), ...binding.buttons.map(buttonLabel)]
      bound.textContent = parts.length > 0 ? parts.join(' · ') : '—'
      row.append(label, bound)
      row.addEventListener('click', () => {
        this.row = i
        this.capturing = true
        this.message = `press a key or a pad button for “${ACTION_LABELS[action]}” · Esc to leave it`
        this.render()
      })
      rows.append(row)
    }
    this.el.append(rows)
    const note = document.createElement('div')
    note.className = 'controls-note'
    note.textContent = this.message + (playable(this.bindings) ? '' : ' · some action has no key')
    this.el.append(note)
  }
}

/** The keys that walk, for the overlay: `WASD` when they are, else each key named. */
export function walkHint(bindings: Bindings): string {
  const first = (action: Action) => bindings[action].keys[0]
  const four = [first('up'), first('left'), first('down'), first('right')]
  if (four.join('') === 'wasd') return 'WASD'
  return four.map((k) => (k === undefined ? '?' : keyLabel(k))).join(' ')
}

function read(): string | null {
  try {
    return window.localStorage.getItem(CONTROLS_KEY)
  } catch {
    return null
  }
}

function write(json: string): void {
  try {
    window.localStorage.setItem(CONTROLS_KEY, json)
  } catch {
    // Storage may be off; the layout then lasts the session.
  }
}
