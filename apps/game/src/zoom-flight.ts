/**
 * **The flight** of Zoom and the chimaera wing, as the game's task runs it —
 * `func_ov017_021acdf4`, which `func_ov017_021acd30(_, 0, 0, c)` starts: `c`
 * 0 to fly off, 1 for the ceiling. Read 6 October 2026, US addresses;
 * `docs/readings/T12-travel.md`, "The flight".
 *
 * Pass by pass, two vblanks each in the field, its count adding the vblanks
 * (`GameState::GetTickCount`). Flying off: the effect on each one flown and
 * the rise's sound; past 40 they are hidden; past 100 both screens go to
 * black over 30 frames; past 140 the map changes. The ceiling: hidden past
 * 40 the same; past 55 shown again 9.8 above where they stood, falling, with
 * `strstd` 57 up, the camera shaken and the bump's sound; once all have
 * landed, 10 more, and done.
 *
 * This is the flight's own clock and numbers only; what it shows is
 * `main.ts`'s. **Ours**: the file's load takes a pass for each of its two
 * states, 0 and 14, where the game's takes as long as the load does.
 */

/** The effect each one flown stands in (`data_ov017_021d7978`), made as effect 8. */
export const FLIGHT_EFFECT = 'effect/em1810.chr'
/** The sounds: entries of sequence archive `0xb2` in `se_norm.sdat` (`func_0205ebc0(_, 0xb2, 0xb2)`). */
export const FLIGHT_SOUNDS = 0xb2
/** Entry 0, the rise (`func_0205ebfc(_, 0, 0)`, state 1); entry 1, the bump (state 10). */
export const FLIGHT_RISE = 0
export const FLIGHT_BUMP = 1
/** `strstd` 57, "… bangs … head on the ceiling!" (`func_020e51cc(0x39)`, state 10). */
export const CEILING_LINE = 57
/** Both screens to black over 30 frames (`SetBrightness(_, −16, 30)`, state 3). */
export const FLIGHT_FADE_FRAMES = 30
/** Vblanks a pass in the field: the count's step. */
export const TICKS_A_PASS = 2

/** The count past which each one flown is hidden (state 2). */
const HIDE_PAST = 40
/** … the screens go to black (state 3). */
const FADE_PAST = 100
/** … the map changes (state 4). */
const GO_PAST = 140
/** … the ceiling shows them again, falling (state 10). */
const DROP_PAST = 55
/** … after all have landed (state 12). */
const LANDED_PAST = 10

/** How far above where they stood the ceiling drops them, × 4096 in the files' units (`0x9ccc`, 9.8). */
export const CEILING_DROP = 0x9ccc
/** What the fall gathers each pass, × 4096 (`0x51`, `func_0203348c`). */
export const FALL_GATHERS = 0x51
/** The shake: its size, × 4096 in the files' units, and how long, ms (`func_0202ea10(_, 0xcc, 0x3e8)`). */
export const SHAKE_SIZE = 0xcc
export const SHAKE_MS = 1000
/** What a pass takes off the shake's time (`0x21`, `func_0202e0a4`). */
const SHAKE_PASS_MS = 0x21

/** What a pass of the flight does. */
export type FlightEvent =
  /** The effect at each one flown, and the rise's sound (state 1). */
  | 'rise'
  /** Each one flown hidden (state 2). */
  | 'hide'
  /** Both screens to black, {@link FLIGHT_FADE_FRAMES} (state 3). */
  | 'fade'
  /** Each shown again and the map changed (state 4). */
  | 'go'
  /** The ceiling: shown again, falling; the line up, the shake and the bump (state 10). */
  | 'drop'
  /** All have landed (state 11). */
  | 'landed'
  /** The task ended: the effect freed, the window closed (states 5 and 13). */
  | 'done'

export interface Flight {
  /** For the ceiling (`+0x27e`). */
  readonly ceiling: boolean
  /** The game's state (`+0x1c`). */
  state: number
  /** The count (`+0x1d`), in vblanks. */
  count: number
  /** How far above the ground those dropped are drawn, × 4096 — 0 on the ground (`+0x124` less `+0x128`). */
  above: number
  /** The passes they have fallen (`+0x12c`). */
  fallen: number
  /** The shake's size, × 4096, and its time left, ms (`+0x1e4`, `+0x1e8`). */
  shake: number
  shakeLeft: number
}

export function startFlight(ceiling: boolean): Flight {
  return { ceiling, state: 0, count: 0, above: 0, fallen: 0, shake: 0, shakeLeft: 0 }
}

/**
 * **One pass of the flight**: the task's state, then the fall of those
 * dropped (`func_0203348c`, `0x02033678`–`0x02033704`), then the shake
 * (`func_0202e0a4`, `0x0202e238`–`0x0202e27c`). What it did, in order.
 */
export function flightPass(f: Flight): FlightEvent[] {
  const out: FlightEvent[] = []
  const counted = () => {
    f.count = (f.count + TICKS_A_PASS) & 0xff
    return f.count
  }
  switch (f.state) {
    case 0:
      f.state = 14
      break
    case 14:
      f.state = 1
      break
    case 1:
      out.push('rise')
      f.state = 2
      break
    case 2:
      if (counted() > HIDE_PAST) {
        out.push('hide')
        f.state = f.ceiling ? 10 : 3
      }
      break
    case 3:
      if (counted() > FADE_PAST) {
        out.push('fade')
        f.state = 4
      }
      break
    case 4:
      if (counted() > GO_PAST) {
        out.push('go')
        f.state = 5
      }
      break
    case 5:
      // Once the fade is done — it was begun 40 vblanks before, over 30.
      out.push('done')
      f.state = -1
      break
    case 10:
      if (counted() > DROP_PAST) {
        out.push('drop')
        f.above = CEILING_DROP
        f.fallen = 0
        f.shake = SHAKE_SIZE
        f.shakeLeft = SHAKE_MS
        f.state = 11
      }
      break
    case 11:
      if (f.above === 0) {
        out.push('landed')
        f.count = 0
        f.state = 12
      }
      break
    case 12:
      if (counted() > LANDED_PAST) f.state = 13
      break
    case 13:
      out.push('done')
      f.state = -1
      break
  }
  // The fall: gathering 81/4096 each pass, until below the ground.
  if (f.above !== 0) {
    f.fallen++
    f.above -= FALL_GATHERS * f.fallen
    if (f.above < 0) {
      f.above = 0
      f.fallen = 0
    }
  }
  // The shake: 33 ms off its time each pass, its size down in step.
  if (f.shakeLeft !== 0) {
    if (f.shakeLeft <= SHAKE_PASS_MS) {
      f.shakeLeft = 0
      f.shake = 0
    } else {
      f.shakeLeft -= SHAKE_PASS_MS
      f.shake -= Math.trunc((SHAKE_PASS_MS * f.shake) / f.shakeLeft)
    }
  }
  return out
}

/** Whether the flight is over. */
export function flightDone(f: Flight): boolean {
  return f.state === -1
}

/** Whether those flown are hidden now: from state 2's turn to the map's change, or to the ceiling's drop. */
export function flownHidden(f: Flight): boolean {
  return f.state === 3 || f.state === 4 || f.state === 10
}
