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
 * | 221 | character, character, frames, flag | turn the first to face the second over so many frames, the short way — in Angel Falls' events, 17 of the 22 calls that find both placed find the first facing elsewhere; Ivor turning back to the Hero at the side of Erinn's house, `ev02210`. The flag, 0 or 1 or missing, is not read |
 * | 204 | character, reference | whether it is still walking or turning |
 * | 210 | character, motion, flags | play one of its motions, by name |
 * | 219 | character, opacity | how much of it shows, at once, from 0 to {@link OPACITY_WHOLE} |
 * | 220 | character, opacity, frames | fade it to that much over so many frames — the Hexagon's figure in on `ev02500`, out on `ev02520` |
 * | 224 | character, motion | a motion to go back to — kept, not played |
 * | 566 | kind, …, character | what the character is: `2` a model file; `3` a sprite sheet, `.spr` on all 203; `5` one of the map's cast, by placement id — 186 of 217 in the event's own map's cast. Other kinds are not read |
 * | 567 | motion file, character | a pack of motions for it |
 * | 200 | model file, slot | the second event folder's way: load a model into a numbered slot, negative on 1,195 of its 1,324 uses — 1,021 of the 1,027 name a `.chr`, and the first folder never calls it |
 * | 229 | motion file, slot | a pack of motions for the slot's model — 394 of 480 onto a slot a `200` filled |
 * | 202 | character, slot, kind | the character wears the slot's model and its packs — 1,034 of 1,324 onto a filled slot. The statue scene, `ev22590`: Ivor, 2, wears `chara_sub/s017.chr` so. `kind` is not read |
 * | 300 | — | a new shot: the camera let go |
 * | 302 | x, y, z | where the camera is — its yaw, rise and distance follow from it and `303` until `310` gives them: 1,024 of the 1,032 second-folder shots with all three agree so |
 * | 303 | x, y, z | where the camera looks |
 * | 304 | eye x, y, z, target x, y, z, frames | move both over so many frames — the pair agrees with the `311` beside it on 506 of 511 |
 * | 310 | yaw, rise, distance | where it looks from: turned `yaw` about what it looks at, `rise` above it and `distance` from it in a straight line — not across the ground, which agrees with `302` on 539 of the 1,032, where the straight line does on 1,024. The morning's 7.62 up and 12.71 away is 37° down |
 * | 311 | yaw, rise, distance, frames | move those over so many frames, the yaw the short way |
 * | 321 | x, y, z, frames | move where the camera looks over so many frames — the switch's shake in the Hexagon, `ev02530`, sixteen short ones |
 * | 400 | message | show one of the event's messages |
 * | 405 | reference | whether a message is still up |
 * | 101 | frames | fade the screen to black over so many frames — see `darkness`. The script waits them out itself |
 * | 121 | frames | fade it back from black over so many frames |
 * | 560 | reference | whether the scene carries straight on from a conversation — see `afterTalk` |
 * | 840 | reference | how long the frame was, in halves — see {@link FRAME_IN_HALVES} |
 *
 * Positions are in the files' own units, and the stage takes them into the
 * world by one scale, as the cast's placements are. **Character 0 is the
 * Hero**: the morning puts them in bed and hands them the Hero's own motion
 * pack. Also INFERRED.
 */

/**
 * What function 840 answers through its argument each frame: 2. INFERRED. It
 * is called only by the second event folder's wait routine, once in each of
 * its 164 scripts, which doubles the frames it is asked to wait and takes 840's
 * answer off each frame — where the first folder's takes 1 off. The two
 * folders ask for waits of the same sizes — 1, 10, 5, 30, 20 and 15 the
 * commonest in both, medians 10 and 12 — so the answer that makes a wait of *n*
 * last *n* frames in both is 2: the frame's length in halves.
 */
const FRAME_IN_HALVES = 2

/**
 * The motion a scene's character shows at a frame of the scene, and how far
 * into it, at `rate` frames a second: one played once goes on to the motion a
 * `224` named when it ends, or holds its last frame where none was named —
 * that holding ours; any other plays round and round. See `EventActor.once`.
 */
export function sceneMotion<M extends { readonly frameCount: number }>(
  find: (name: string) => M | undefined,
  actor: Pick<EventActor, 'motion' | 'motionFrom' | 'once' | 'after'>,
  frame: number,
  rate: number,
): { readonly motion: M; readonly frame: number } | undefined {
  const first = (actor.motion !== undefined ? find(actor.motion) : undefined) ?? find('stand')
  if (!first) return undefined
  const since = Math.max(0, Math.floor(((frame - actor.motionFrom) * rate) / 60))
  const length = Math.max(1, first.frameCount)
  if (!actor.once) return { motion: first, frame: since % length }
  if (since < length) return { motion: first, frame: since }
  const next = actor.after !== undefined ? find(actor.after) : undefined
  if (next) return { motion: next, frame: (since - length) % Math.max(1, next.frameCount) }
  return { motion: first, frame: length - 1 }
}

export interface EventActor {
  x: number
  y: number
  z: number
  facing: number
  /** Whether the event has put it anywhere: one only named — a face to wear — stands nowhere. */
  placed: boolean
  /** The motion playing, by name, and the frame it began on. */
  motion: string | undefined
  motionFrom: number
  /**
   * Whether the motion plays once rather than round and round: bit 1 of
   * `210`'s flags. INFERRED: a `224` follows at once 1,471 of the 2,534 `210`s
   * with it set, and 21 of the 4,345 without — the morning's `cyotto_loop`, Ivor's
   * `talk` on Erinn's doorstep. See {@link sceneMotion}.
   */
  once: boolean
  /** The motion 224 names to go on to when a motion played once ends. */
  after: string | undefined
  /** Its model file, as the script names it: `chara_sub/s016.chr`. */
  model: string | undefined
  /** The motion packs it is handed, as the script names them. */
  readonly packs: string[]
  /**
   * The map's cast member it is, by placement id, when `566(5, id, character)`
   * says so — INFERRED, see `566` in the header: the Hexagon's figure, 204, in
   * `ev02510`. Then the event moves that member.
   */
  cast: number | undefined
  /**
   * The sprite sheet it is drawn as, by name without its `.spr`, when
   * `566(3, file, character)` names one: the Hexagon's figure, `n012g.spr`,
   * fading in on `ev02500`.
   */
  sprite: string | undefined
  /** How much of it shows, from 0 to {@link OPACITY_WHOLE} — see `219` and `220`. */
  opacity: number
  fade: Fade | undefined
  walk: Walk | undefined
  turn: Turn | undefined
}

/** A fade under way — see `220`. */
interface Fade {
  readonly from: number
  readonly to: number
  readonly start: number
  readonly frames: number
}

/**
 * The most a character shows, which is whole: 31, the top of the DS's 5-bit
 * polygon alpha. INFERRED: all 313 of `220`'s targets are whole numbers from 0
 * to 31, and of `219`'s 998 values all but three (255) are too.
 */
export const OPACITY_WHOLE = 31

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
  /** Turned about the target, in radians: the direction of the eye from it, as `atan2(x, z)`. */
  yaw: number
  /** How far above the target the eye is. */
  rise: number
  /** How far the eye is from the target in a straight line — not across the ground. */
  distance: number
}

type Vec3 = [number, number, number]

/**
 * Where a camera at `eye` looking at `target` looks from, as `310` gives it:
 * the yaw of the eye from the target, its height above it, and the
 * straight-line distance between.
 */
function lookFrom(eye: Vec3, target: Vec3): { yaw: number; rise: number; distance: number } {
  const dx = eye[0] - target[0]
  const dy = eye[1] - target[1]
  const dz = eye[2] - target[2]
  return { yaw: Math.atan2(dx, dz), rise: dy, distance: Math.hypot(dx, dy, dz) }
}

/** A camera move under way: from where it was to where it is going, over so many frames. */
interface CameraMove<T> {
  readonly from: T
  readonly to: T
  readonly start: number
  readonly frames: number
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
  /** How dark the screen is, from 0, clear, to 1, black — see `101` and `121`. */
  darkness = 0
  private darkening: Fade | undefined
  /**
   * Whether the scene carries straight on from a conversation — what `560`
   * answers, set by the game. INFERRED: answered so, 100 of the 118 scenes that
   * ask skip their opening fade, and 89 of those 100 are begun by talking or
   * examining; the two a let's play shows begun so, `ev02500` and `ev02520`, do
   * not fade in.
   */
  afterTalk = false
  /** The message on show, by its number in the event's text. */
  message: number | undefined
  /** Every message shown, in order. */
  readonly shown: number[] = []
  /** Frames played. */
  frame = 0
  /** Engine functions answered with 0 because they are not read, and how often. */
  readonly unhandled = new Map<number, number>()
  /** The second event folder's model slots: what `200` loaded into each, and the packs `229` added. */
  private readonly slots = new Map<number, { model: string; packs: string[] }>()
  /** Which slot each character wears — see `202`. */
  private readonly bound = new Map<number, number>()
  /** The shot's eye, where `302` put it; its yaw, rise and distance follow from it until `310` gives them. */
  private eye: Vec3 | undefined
  private angled = false
  private targetMove: CameraMove<Vec3> | undefined
  private angleMove: CameraMove<{ yaw: number; rise: number; distance: number }> | undefined
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
        placed: false,
        motion: undefined,
        motionFrom: 0,
        once: false,
        after: undefined,
        model: undefined,
        packs: [],
        cast: undefined,
        sprite: undefined,
        opacity: OPACITY_WHOLE,
        fade: undefined,
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
    if (this.darkening) {
      const { from, to, start, frames } = this.darkening
      const t = Math.min(1, (this.frame - start) / frames)
      this.darkness = from + (to - from) * t
      if (t >= 1) this.darkening = undefined
    }
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
      if (actor.fade) {
        const { from, to, start, frames } = actor.fade
        const t = Math.min(1, (this.frame - start) / frames)
        actor.opacity = from + (to - from) * t
        if (t >= 1) actor.fade = undefined
      }
    }
    const shot = this.camera
    if (shot && this.targetMove) {
      const { from, to, start, frames } = this.targetMove
      const t = Math.min(1, (this.frame - start) / frames)
      shot.target = [
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        from[2] + (to[2] - from[2]) * t,
      ]
      if (t >= 1) this.targetMove = undefined
    }
    if (shot && this.angleMove) {
      const { from, to, start, frames } = this.angleMove
      const t = Math.min(1, (this.frame - start) / frames)
      shot.yaw = from.yaw + (to.yaw - from.yaw) * t
      shot.rise = from.rise + (to.rise - from.rise) * t
      shot.distance = from.distance + (to.distance - from.distance) * t
      if (t >= 1) this.angleMove = undefined
    }
  }

  private shot(): EventCamera {
    this.camera ??= { target: undefined, yaw: 0, rise: 0, distance: 0 }
    return this.camera
  }

  /**
   * Where the camera looks as the event plays, which the game sets each frame:
   * where a move of it begins when the shot has not said where it looks.
   */
  looking: Vec3 | undefined

  /**
   * Whether the shot has an angle of its own — from `310` or `311`, from `304`,
   * or from `302` with `303`. One without keeps the field camera's and only
   * moves where it looks: 19 shots, the Hexagon's figure appearing on `ev02500`
   * among them, whose camera pans from the Hero to the tile as a let's play shows.
   */
  get cameraAngled(): boolean {
    return this.angled || (this.eye !== undefined && this.camera?.target !== undefined)
  }

  /** The shot's yaw, rise and distance from its eye and target, while `310` has not given them. */
  private fromEye(): void {
    const shot = this.shot()
    if (!this.angled && this.eye && shot.target)
      Object.assign(shot, lookFrom(this.eye, shot.target))
  }

  /** Move where the camera looks to `to` over so many frames, from where it looks now. */
  private moveTarget(to: Vec3, frames: number): void {
    const shot = this.shot()
    this.targetMove = {
      // From where it looks now: the shot's own, else the field camera's.
      from: shot.target ?? this.looking ?? to,
      to,
      start: this.frame,
      frames: Math.max(1, frames),
    }
  }

  /** Move the camera's yaw, rise and distance over so many frames — the yaw the short way round. */
  private moveAngle(to: { yaw: number; rise: number; distance: number }, frames: number): void {
    const shot = this.shot()
    const from = { yaw: shot.yaw, rise: shot.rise, distance: shot.distance }
    this.angleMove = {
      from,
      to: { ...to, yaw: towards(from.yaw, to.yaw) },
      start: this.frame,
      frames: Math.max(1, frames),
    }
    this.angled = true
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
        actor.placed = true
        actor.walk = undefined
        return 0
      }
      case 207: {
        const actor = this.actor(num(args[0]))
        const to = [num(args[1]) * s, num(args[2]) * s, num(args[3]) * s] as const
        const dx = to[0] - actor.x
        const dz = to[2] - actor.z
        if (dx !== 0 || dz !== 0) actor.facing = Math.atan2(dx, dz)
        actor.placed = true
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
      case 221: {
        const actor = this.actor(num(args[0]))
        const other = this.actors.get(num(args[1]))
        if (!other) return 0
        const dx = other.x - actor.x
        const dz = other.z - actor.z
        if (dx === 0 && dz === 0) return 0
        actor.turn = {
          from: actor.facing,
          to: towards(actor.facing, Math.atan2(dx, dz)),
          start: this.frame,
          frames: Math.max(1, num(args[2])),
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
        // Bit 1 plays it once — see `once`; what it goes on to, a `224` says after.
        actor.once = (num(args[2]) & 1) !== 0
        actor.after = undefined
        return 0
      }
      case 224:
        this.actor(num(args[0])).after = text(args[1])
        return 0
      case 101:
      case 121: {
        // The screen to black over so many frames, or back from it — see `darkness`.
        const to = id === 101 ? 1 : 0
        const frames = num(args[0])
        if (frames > 0) {
          this.darkening = { from: this.darkness, to, start: this.frame, frames }
        } else {
          this.darkness = to
          this.darkening = undefined
        }
        return 0
      }
      case 219: {
        // How much of it shows, at once — 255, three times, taken as whole: ours.
        const actor = this.actor(num(args[0]))
        actor.opacity = Math.min(OPACITY_WHOLE, Math.max(0, num(args[1])))
        actor.fade = undefined
        return 0
      }
      case 220: {
        const actor = this.actor(num(args[0]))
        const to = Math.min(OPACITY_WHOLE, Math.max(0, num(args[1])))
        const frames = num(args[2])
        if (frames > 0) {
          actor.fade = { from: actor.opacity, to, start: this.frame, frames }
        } else {
          actor.opacity = to
          actor.fade = undefined
        }
        return 0
      }
      case 566:
        if (num(args[0]) === 2 && typeof args[1] === 'string') {
          this.actor(num(args[2])).model = args[1]
        }
        // A character drawn from a sprite sheet — the file ends `.spr` on all 203.
        if (num(args[0]) === 3 && typeof args[1] === 'string') {
          this.actor(num(args[2])).sprite = args[1].replace(/\.spr$/i, '')
        }
        // A character that is one of the map's cast, by placement id — INFERRED:
        // 186 of the 217 such numbers are in the event's own map's cast.
        if (num(args[0]) === 5 && typeof args[1] === 'number') {
          this.actor(num(args[2])).cast = args[1]
        }
        return 0
      case 567:
        if (typeof args[0] === 'string') this.actor(num(args[1])).packs.push(args[0])
        return 0
      case 200:
        if (typeof args[0] === 'string') this.slots.set(num(args[1]), { model: args[0], packs: [] })
        return 0
      case 229: {
        const slot = this.slots.get(num(args[1]))
        if (!slot || typeof args[0] !== 'string') return 0
        slot.packs.push(args[0])
        // Whoever already wears the slot's model takes its motions too.
        for (const [id, bound] of this.bound) {
          if (bound === num(args[1])) this.actor(id).packs.push(args[0])
        }
        return 0
      }
      case 202: {
        const slot = this.slots.get(num(args[1]))
        if (!slot) return 0
        const actor = this.actor(num(args[0]))
        actor.model = slot.model
        actor.packs.push(...slot.packs)
        this.bound.set(num(args[0]), num(args[1]))
        return 0
      }
      case 300:
        this.camera = undefined
        this.eye = undefined
        this.angled = false
        this.targetMove = undefined
        this.angleMove = undefined
        return 0
      case 302:
        this.eye = [num(args[0]) * s, num(args[1]) * s, num(args[2]) * s]
        this.fromEye()
        return 0
      case 303:
        this.shot().target = [num(args[0]) * s, num(args[1]) * s, num(args[2]) * s]
        this.fromEye()
        return 0
      case 304: {
        const eye: Vec3 = [num(args[0]) * s, num(args[1]) * s, num(args[2]) * s]
        const target: Vec3 = [num(args[3]) * s, num(args[4]) * s, num(args[5]) * s]
        this.moveTarget(target, num(args[6]))
        this.moveAngle(lookFrom(eye, target), num(args[6]))
        return 0
      }
      case 310: {
        const shot = this.shot()
        shot.yaw = num(args[0])
        shot.rise = num(args[1]) * s
        shot.distance = num(args[2]) * s
        this.angled = true
        this.angleMove = undefined
        return 0
      }
      case 311:
        this.moveAngle(
          { yaw: num(args[0]), rise: num(args[1]) * s, distance: num(args[2]) * s },
          num(args[3]),
        )
        return 0
      case 321:
        this.moveTarget([num(args[0]) * s, num(args[1]) * s, num(args[2]) * s], num(args[3]))
        return 0
      case 400:
        this.message = num(args[0])
        this.shown.push(this.message)
        return 0
      case 405: {
        const ref = args[0]
        if (isRef(ref)) thread.write(ref, this.message === undefined ? 0 : 1)
        return 0
      }
      case 840: {
        const ref = args[0]
        if (isRef(ref)) thread.write(ref, FRAME_IN_HALVES)
        return 0
      }
      case 560: {
        // Whether the scene carries straight on from a conversation — see `afterTalk`.
        const ref = args[0]
        if (isRef(ref)) thread.write(ref, this.afterTalk ? 1 : 0)
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
    if (hero) Object.assign(this.stage.actor(0), hero, { placed: true })
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
