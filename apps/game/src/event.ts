import type { Script } from '@minstrel/game-formats'
import {
  EventRun,
  type ScriptHost,
  type ScriptRef,
  type ScriptThread,
  type ScriptValue,
} from '@minstrel/script'

/**
 * An event, played: its script run a frame at a time against the engine
 * functions the game supplies — the cast's, the camera's and the messages'.
 * game-formats' FORMAT.md, "Event scripts", has the machine;
 * `docs/event-scripts.md` what each function is taken to do.
 *
 * **Every reading here is INFERRED**, from the values each function is handed
 * and where it stands among its neighbours. A function not read is answered
 * with 0 — which ends any wait on it — and counted in `unhandled`.
 *
 * | fn | handed | taken to do |
 * |---|---|---|
 * | 206 | character, x, y, z | put the character there |
 * | 207 | character, x, y, z, frames | walk it there over so many frames, facing the way it goes |
 * | 208 | character, rx, ry, rz | face `ry`, in radians, the way the Hero's facing runs |
 * | 209 | character, rx, ry, rz, frames, flag | turn to face `ry` over so many frames, the short way |
 * | 204 | character, reference | whether it is still walking or turning |
 * | 210 | character, motion, flags | play one of its motions, by name |
 * | 224 | character, motion | a motion to go back to — kept, not played |
 * | 566 | 2, model file, character | which model the character is; other kinds are the event's options |
 * | 567 | motion file, character | a pack of motions for it |
 * | 300 | — | a new shot: the camera let go |
 * | 303 | x, y, z | where the camera looks |
 * | 310 | yaw, rise, run | where it looks from: turned `yaw` about what it looks at, `rise` up and `run` back — the morning's 7.62 up and 12.71 back is 31° down, the pitch the game's own camera takes |
 * | 400 | message | show one of the event's messages |
 * | 405 | reference | whether a message is still up |
 *
 * Positions are in the files' own units, and the stage takes them into the
 * world by one scale, as the cast's placements are. **Character 0 is the
 * Hero**: the morning puts them in bed and hands them the Hero's own motion
 * pack. Also INFERRED.
 */

export interface EventActor {
  x: number
  y: number
  z: number
  facing: number
  /** The motion playing, by name, and the frame it began on. */
  motion: string | undefined
  motionFrom: number
  /** The motion 224 names to go back to. */
  after: string | undefined
  /** Its model file, as the script names it: `chara_sub/s016.chr`. */
  model: string | undefined
  /** The motion packs it is handed, as the script names them. */
  readonly packs: string[]
  walk: Walk | undefined
  turn: Turn | undefined
}

interface Walk {
  readonly from: readonly [number, number, number]
  readonly to: readonly [number, number, number]
  readonly start: number
  readonly frames: number
}

interface Turn {
  readonly from: number
  readonly to: number
  readonly start: number
  readonly frames: number
}

/** Where the event's camera looks and from where, in the world. */
export interface EventCamera {
  target: [number, number, number] | undefined
  /** Turned about the target, in radians; the eye's height and distance back from it. */
  yaw: number
  rise: number
  run: number
}

const num = (value: ScriptValue | undefined): number => (typeof value === 'number' ? value : 0)
const isRef = (value: ScriptValue | undefined): value is ScriptRef =>
  typeof value === 'object' && value !== null
const text = (value: ScriptValue | undefined): string => (typeof value === 'string' ? value : '')

/** The facing to turn to from `from`, so that the turn goes the short way round. */
function towards(from: number, to: number): number {
  const full = 2 * Math.PI
  return from + ((((to - from + Math.PI) % full) + full) % full) - Math.PI
}

/** Who stands where in an event, what they play, and what is on show — the engine functions' side. */
export class EventStage {
  readonly actors = new Map<number, EventActor>()
  camera: EventCamera | undefined
  /** The message on show, by its number in the event's text. */
  message: number | undefined
  /** Every message shown, in order. */
  readonly shown: number[] = []
  /** Frames played. */
  frame = 0
  /** Engine functions answered with 0 because they are not read, and how often. */
  readonly unhandled = new Map<number, number>()
  readonly host: ScriptHost

  constructor(readonly scale: number) {
    this.host = { call: (id, args, thread) => this.call(id, args, thread) }
  }

  /** A character, made the first time it is named. */
  actor(id: number): EventActor {
    let found = this.actors.get(id)
    if (!found) {
      found = {
        x: 0,
        y: 0,
        z: 0,
        facing: 0,
        motion: undefined,
        motionFrom: 0,
        after: undefined,
        model: undefined,
        packs: [],
        walk: undefined,
        turn: undefined,
      }
      this.actors.set(id, found)
    }
    return found
  }

  /** Whether a character is still walking or turning. */
  busy(id: number): boolean {
    const actor = this.actors.get(id)
    return actor !== undefined && (actor.walk !== undefined || actor.turn !== undefined)
  }

  /** One frame on: whatever is walking or turning moves. */
  advance(): void {
    this.frame++
    for (const actor of this.actors.values()) {
      if (actor.walk) {
        const { from, to, start, frames } = actor.walk
        const t = Math.min(1, (this.frame - start) / frames)
        actor.x = from[0] + (to[0] - from[0]) * t
        actor.y = from[1] + (to[1] - from[1]) * t
        actor.z = from[2] + (to[2] - from[2]) * t
        if (t >= 1) actor.walk = undefined
      }
      if (actor.turn) {
        const { from, to, start, frames } = actor.turn
        const t = Math.min(1, (this.frame - start) / frames)
        actor.facing = from + (to - from) * t
        if (t >= 1) actor.turn = undefined
      }
    }
  }

  private shot(): EventCamera {
    this.camera ??= { target: undefined, yaw: 0, rise: 0, run: 0 }
    return this.camera
  }

  private call(
    id: number,
    args: readonly ScriptValue[],
    thread: ScriptThread,
  ): ScriptValue | undefined {
    const s = this.scale
    switch (id) {
      case 206: {
        const actor = this.actor(num(args[0]))
        actor.x = num(args[1]) * s
        actor.y = num(args[2]) * s
        actor.z = num(args[3]) * s
        actor.walk = undefined
        return 0
      }
      case 207: {
        const actor = this.actor(num(args[0]))
        const to = [num(args[1]) * s, num(args[2]) * s, num(args[3]) * s] as const
        const dx = to[0] - actor.x
        const dz = to[2] - actor.z
        if (dx !== 0 || dz !== 0) actor.facing = Math.atan2(dx, dz)
        actor.turn = undefined
        actor.walk = {
          from: [actor.x, actor.y, actor.z],
          to,
          start: this.frame,
          frames: Math.max(1, num(args[4])),
        }
        return 0
      }
      case 208: {
        const actor = this.actor(num(args[0]))
        actor.facing = num(args[2])
        actor.turn = undefined
        return 0
      }
      case 209: {
        const actor = this.actor(num(args[0]))
        actor.turn = {
          from: actor.facing,
          to: towards(actor.facing, num(args[2])),
          start: this.frame,
          frames: Math.max(1, num(args[4])),
        }
        return 0
      }
      case 204: {
        const ref = args[1]
        if (isRef(ref)) thread.write(ref, this.busy(num(args[0])) ? 1 : 0)
        return 0
      }
      case 210: {
        const actor = this.actor(num(args[0]))
        actor.motion = text(args[1])
        actor.motionFrom = this.frame
        return 0
      }
      case 224:
        this.actor(num(args[0])).after = text(args[1])
        return 0
      case 566:
        if (num(args[0]) === 2 && typeof args[1] === 'string') {
          this.actor(num(args[2])).model = args[1]
        }
        return 0
      case 567:
        if (typeof args[0] === 'string') this.actor(num(args[1])).packs.push(args[0])
        return 0
      case 300:
        this.camera = undefined
        return 0
      case 303:
        this.shot().target = [num(args[0]) * s, num(args[1]) * s, num(args[2]) * s]
        return 0
      case 310: {
        const shot = this.shot()
        shot.yaw = num(args[0])
        shot.rise = num(args[1]) * s
        shot.run = num(args[2]) * s
        return 0
      }
      case 400:
        this.message = num(args[0])
        this.shown.push(this.message)
        return 0
      case 405: {
        const ref = args[0]
        if (isRef(ref)) thread.write(ref, this.message === undefined ? 0 : 1)
        return 0
      }
      default:
        this.unhandled.set(id, (this.unhandled.get(id) ?? 0) + 1)
        return 0
    }
  }
}

/** An event's script, run against a stage a frame at a time. */
export class EventPlayer {
  readonly stage: EventStage
  private readonly run: EventRun
  private going = true

  constructor(
    script: Script,
    scale: number,
    hero?: { readonly x: number; readonly y: number; readonly z: number; readonly facing: number },
  ) {
    this.stage = new EventStage(scale)
    if (hero) Object.assign(this.stage.actor(0), hero)
    this.run = new EventRun(script, this.stage.host)
  }

  get finished(): boolean {
    return !this.going
  }

  /** One frame: what is moving moves, then the script runs to its next wait. False once it has ended. */
  tick(): boolean {
    if (!this.going) return false
    this.stage.advance()
    this.going = this.run.step()
    return this.going
  }

  /** The message on show has been read. */
  dismiss(): void {
    this.stage.message = undefined
  }
}
