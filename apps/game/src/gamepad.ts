/**
 * A gamepad, if one is plugged in.
 *
 * The browser hands back a fresh snapshot each time it is asked, so this is
 * read once a frame rather than kept. Nothing here holds state: a pad that is
 * unplugged mid-frame simply reads as absent on the next one.
 */

/** What the sticks are doing this frame, in the game's own terms. */
export interface Sticks {
  readonly connected: boolean
  /** Away from the camera is positive, matching the `w` key. */
  readonly forward: number
  /** To the camera's right is positive, matching `d`. */
  readonly right: number
  /** Turn the camera: positive looks rightward. */
  readonly lookX: number
  /** Tilt the camera: positive looks further down. */
  readonly lookY: number
  /** What the pad calls itself, for the overlay. */
  readonly id: string
  /** Its layout, which is `standard` when the browser recognises it. */
  readonly mapping: string
  /** Every axis as reported, so a pad that sits elsewhere can be seen. */
  readonly axes: readonly number[]
  /**
   * Every button value.
   *
   * Buttons are analog on a real pad — a trigger reads all the way from 0 to 1
   * — and some drivers report a stick's travel here rather than as axes, so a
   * stick that moves nothing in `axes` may be moving something in this.
   */
  readonly buttons: readonly number[]
}

/** Why no pad is being read, for the overlay to show. */
export interface PadSearch {
  /** Whether the browser offers the API at all. */
  readonly available: boolean
  /** Slots the browser returned, most of which are usually empty. */
  readonly slots: number
  /** Slots holding something, connected or not. */
  readonly filled: number
}

/**
 * What the last look for a pad found.
 *
 * Chromium hands back a fixed set of empty slots until a pad has been used:
 * plugging one in is not enough, a button has to be pressed while the page has
 * focus. That is indistinguishable from a broken pad unless the empty slots are
 * reported, so they are.
 */
export function lastSearch(): PadSearch {
  return search
}

let search: PadSearch = { available: false, slots: 0, filled: 0 }

const NONE: Sticks = {
  connected: false,
  forward: 0,
  right: 0,
  lookX: 0,
  lookY: 0,
  id: '',
  mapping: '',
  axes: [],
  buttons: [],
}

/**
 * How far a stick must leave the middle before it counts.
 *
 * A stick at rest does not read zero, and a worn one can sit a good way out.
 * Taken per axis this would let a diagonal creep in from two axes that are each
 * under the limit, so it is applied to the stick's distance from the centre and
 * the remainder is rescaled — a stick just past the edge starts from nothing
 * rather than jumping to a fifth of full speed.
 */
const DEADZONE = 0.2

/**
 * Pads a browser is known to report in raw order, and where their sticks are.
 *
 * Firefox on Linux hands back the device's own HID layout rather than
 * remapping it, and calls the mapping empty to say so. A HORIPAD S read that
 * way has four axes and nineteen buttons, with the **right stick on analog
 * buttons 6 and 7** — under the standard indices that is a stick that does
 * nothing at all.
 *
 * Matched on a substring of the pad's id, and **only when the browser admits
 * it has not applied the standard mapping**. The same pad through Chrome is
 * remapped properly, and there buttons 6 and 7 are the triggers: adopting this
 * layout unconditionally would turn the camera every time one was pressed.
 *
 * Anything not listed still has `?axes=` and `?lookbuttons=`, and `?pad=1`
 * shows what a pad reports so a new entry can be worked out.
 */
const KNOWN_LAYOUTS: readonly { readonly match: string; readonly axes: AxisMap }[] = [
  {
    match: 'HORIPAD S',
    axes: { moveX: 0, moveY: 1, lookX: 2, lookY: 3, lookButtons: [6, 7] },
  },
]

/** Which axes each stick sits on under the standard mapping. */
export const STANDARD_AXES = { moveX: 0, moveY: 1, lookX: 2, lookY: 3 } as const

export interface AxisMap {
  readonly moveX: number
  readonly moveY: number
  readonly lookX: number
  readonly lookY: number
  /**
   * Read the look stick from two analog buttons instead of two axes.
   *
   * Some drivers report a stick's travel in the button list — a pad here shows
   * four axes and nineteen buttons, with the right stick moving buttons 6 and
   * 7. A button reads 0 to 1 where an axis reads -1 to 1, so where the middle
   * lies has to be found rather than assumed: see `centreOf`.
   */
  readonly lookButtons?: readonly [number, number]
}

/**
 * What each analog button reads when nothing is touching it.
 *
 * A button standing in for a stick axis sits in the middle at rest — about 0.5
 * — while a real button sits at 0. Both turn up, so the resting value is taken
 * from the first frame a pad is seen rather than assumed, and everything after
 * is measured from there.
 *
 * The cost is that a stick held over at the moment the game starts calibrates
 * to that position. Letting go and reloading fixes it, which is a better
 * failure than a camera that spins on its own because 0 was read as fully left.
 */
const centres = new Map<number, number>()

function centreOf(index: number, value: number): number {
  const known = centres.get(index)
  if (known !== undefined) return known
  centres.set(index, value)
  return value
}

/** Forget the calibration, so the next read takes it afresh. */
export function forgetCentres(): void {
  centres.clear()
}

/**
 * One analog button as a stick axis: `-1` to `1` about its resting value.
 *
 * The two halves are scaled by their own travel, because a button resting at
 * 0.5 has half its range each way while one resting at 0 has all of it above.
 */
function buttonAsAxis(index: number, value: number): number {
  const centre = centreOf(index, value)
  const travel = value >= centre ? 1 - centre : centre
  if (travel <= 0) return 0
  return zeroed((value - centre) / travel)
}

/** Negating a zero axis gives `-0`, which reads oddly and compares oddly. */
function zeroed(value: number): number {
  return value === 0 ? 0 : value
}

function applyDeadzone(x: number, y: number): { x: number; y: number } {
  const distance = Math.hypot(x, y)
  if (distance <= DEADZONE) return { x: 0, y: 0 }
  // Rescale so the live range is the whole of 0..1 rather than the tail of it.
  const scaled = Math.min(1, (distance - DEADZONE) / (1 - DEADZONE)) / distance
  return { x: x * scaled, y: y * scaled }
}

/**
 * Read the first connected pad.
 *
 * **A pad that does not claim the standard mapping is still used.** Refusing
 * them means a pad the browser does not recognise does nothing at all, which is
 * worse than reading it at the usual places and being wrong about one stick.
 * Where the sticks actually sit varies by driver — the right stick is on axes 2
 * and 3 under the standard mapping, but some pads report it on 3 and 4 — so the
 * axes can be overridden, and every axis is passed back for the overlay to show
 * so the right ones can be found by moving the stick and looking.
 */
export function readSticks(chosen: AxisMap = STANDARD_AXES, overridden = false): Sticks {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) {
    search = { available: false, slots: 0, filled: 0 }
    return NONE
  }
  const pads = navigator.getGamepads()
  search = {
    available: true,
    slots: pads.length,
    filled: pads.filter((p) => p !== null).length,
  }
  let fallback: Sticks | undefined
  for (const pad of pads) {
    if (!pad?.connected) continue
    const axes = overridden ? chosen : (layoutFor(pad) ?? chosen)
    const move = applyDeadzone(pad.axes[axes.moveX] ?? 0, pad.axes[axes.moveY] ?? 0)
    const buttons = pad.buttons.map((b) => b.value)
    const look = axes.lookButtons
      ? applyDeadzone(
          buttonAsAxis(axes.lookButtons[0], buttons[axes.lookButtons[0]] ?? 0),
          buttonAsAxis(axes.lookButtons[1], buttons[axes.lookButtons[1]] ?? 0),
        )
      : applyDeadzone(pad.axes[axes.lookX] ?? 0, pad.axes[axes.lookY] ?? 0)
    const read: Sticks = {
      connected: true,
      // Sticks report up as negative, and up is forward.
      forward: zeroed(-move.y),
      right: zeroed(move.x),
      lookX: zeroed(look.x),
      lookY: zeroed(look.y),
      id: pad.id,
      mapping: pad.mapping,
      axes: [...pad.axes],
      buttons,
    }
    // A pad the browser recognises is trusted over one it does not.
    if (pad.mapping === 'standard') return read
    fallback ??= read
  }
  return fallback ?? NONE
}

/** The known layout for a pad the browser has not remapped, if there is one. */
function layoutFor(pad: { id: string; mapping: string }): AxisMap | undefined {
  if (pad.mapping === 'standard') return undefined
  return KNOWN_LAYOUTS.find((known) => pad.id.includes(known.match))?.axes
}

/**
 * Parse `?axes=0,1,2,3` into an axis map, or fall back to the standard one.
 *
 * `?lookbuttons=6,7` moves the look stick onto two analog buttons, for the
 * drivers that put it there.
 */
export function axesFrom(spec: string | null, lookButtons: string | null = null): AxisMap {
  const pair = (text: string | null): [number, number] | undefined => {
    if (!text) return undefined
    const parts = text.split(',').map((n) => Number.parseInt(n, 10))
    if (parts.length !== 2 || parts.some((n) => !Number.isInteger(n) || n < 0)) return undefined
    return [parts[0] as number, parts[1] as number]
  }
  const buttons = pair(lookButtons)
  const base = (() => {
    if (!spec) return STANDARD_AXES
    const parts = spec.split(',').map((n) => Number.parseInt(n, 10))
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0)) return STANDARD_AXES
    return {
      moveX: parts[0] as number,
      moveY: parts[1] as number,
      lookX: parts[2] as number,
      lookY: parts[3] as number,
    }
  })()
  return buttons ? { ...base, lookButtons: buttons } : base
}
