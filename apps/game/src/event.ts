import type { Script } from '@minstrel/game-formats'
import { fovOfHalfDegrees } from '@minstrel/render'
import {
  EventRun,
  ScriptError,
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
 * | 570 | character, shown | whether it is drawn: 0 hides, 1 shows. INFERRED from 5,395 calls: a hidden character is put somewhere (`206`) 242 times before it is shown, and 1,080 of the 2,935 hidings are never undone — a scene's double gone at its end; the Hero is shown, `570(0, 1)`, on the last frame of most scenes. The Hexagon's effect on `ev02350` is hidden on its frame 18, shown from 51 to 108 |
 * | 571 | character, flag | taken to be whether it is solid: 0 on 1,660 of 2,011 is never undone, and where it is, 470 times a `207` walk lies between — a character let through others while it walks. INFERRED, thin; the scene needs nothing of it, so it is read and not acted on |
 * | 235 | character, character, bone | hang the first on the second's bone: "head" on 280 of 325, and the first is a face — `s017f02`, a second face for Ivor, on `ev02210`, shown by `570` for 7 frames: a blink. The faces are one-material models whose one texture is a variant of the parent's; drawn over the head, as a decal |
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
 * | 726 | effect | sound an effect: all 240 distinct values are indices of sequence archives with a file in `se_norm.sdat` |
 * | 730 | effect | likewise, taken to be: its six values, 364 the commonest, are such indices too. How it differs from `726` is not read |
 * | 720 | jingle | play a jingle: its six values, 55–67, fall where `bgm.sdat` keeps its `ME_` sequences, 50–68 |
 * | 727 | — | the scene's sounds stop: called on the last frame of 663 of the 664 scenes that call it, paired with `731`, which is not read. 72 of the 279 effects hold a looping wave for ever until stopped, and 134 of the 137 scenes sounding one call `727` after |
 * | 729 | 0, frames | the sounds stop, over so many frames — 38 of those 137 call it after the effect; the fade is not done |
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
  /** Whether `570` has hidden it — see the header. */
  hidden: boolean
  /** Another character's bone it hangs on, by `235`: a face on a head. */
  hungOn: { readonly parent: number; readonly bone: string } | undefined
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
  /** The waypoint path being built or followed — see {@link Path} and `214`. */
  path: Path
}

/**
 * A character's waypoint path: **the game's own**, read from overlay 1's
 * handlers for 214 to 217 (`0x0215c40c` on) and the commands they queue.
 *
 * `214` resets it, `216` appends a point, `215` sets the speed and `217`
 * runs it — a spline through the points, which is the many-point counterpart
 * of `207`'s single walk. The game keeps the path on the character itself, at
 * `+0x11C`, and follows it by sampling the curve into the same fields `206`
 * writes.
 */
export interface Path {
  /** The points, in order. The game keeps {@link PATH_POINTS} and drops the rest. */
  readonly points: [number, number, number][]
  /** What `215` set: the game divides the path's length by it to get how long it takes. */
  speed: number
  /** The frame `217` started it on; undefined while it is not running. */
  started: number | undefined
  /** How many frames it runs for, worked out when it starts. */
  frames: number
}

/**
 * The most points a path holds: the game's array is sixteen long and
 * `Path_AddPoint` (`0x02157964`) drops anything past it without a word. Six
 * paths on the cartridge hand it more — one of 22 — so the drop is not
 * theoretical.
 */
export const PATH_POINTS = 16

/**
 * Where a path is at a fraction of its way, and which way it faces there —
 * a Catmull-Rom spline through the points with the first and last doubled,
 * which is what the game builds (`0x02156c14` duplicates both ends).
 *
 * **Ours: the curve's own arithmetic.** That the game's is Catmull-Rom is
 * read from its shape, not from its coefficients, which were not followed.
 * A path of two points comes to a straight line either way.
 */
export function pathAt(
  points: readonly (readonly [number, number, number])[],
  t: number,
): { at: [number, number, number]; facing: number } | undefined {
  if (points.length === 0) return undefined
  if (points.length === 1) {
    const only = points[0] as readonly [number, number, number]
    return { at: [...only], facing: 0 }
  }
  const spans = points.length - 1
  const along = Math.max(0, Math.min(1, t)) * spans
  const span = Math.min(spans - 1, Math.floor(along))
  const u = along - span
  const at = (i: number) =>
    points[Math.max(0, Math.min(points.length - 1, i))] as readonly [number, number, number]
  const [p0, p1, p2, p3] = [at(span - 1), at(span), at(span + 1), at(span + 2)]
  const point = (i: 0 | 1 | 2): number => {
    const [a, b, c, d] = [p0[i], p1[i], p2[i], p3[i]]
    return (
      0.5 *
      (2 * b +
        (c - a) * u +
        (2 * a - 5 * b + 4 * c - d) * u * u +
        (-a + 3 * b - 3 * c + d) * u ** 3)
    )
  }
  const here: [number, number, number] = [point(0), point(1), point(2)]
  // The facing the game takes from the way the curve is going — a step on.
  const ahead = Math.min(1, t + 1 / (spans * 16))
  const next = ahead === t ? undefined : pathStep(points, ahead)
  const dx = (next?.[0] ?? here[0]) - here[0]
  const dz = (next?.[2] ?? here[2]) - here[2]
  return { at: here, facing: dx === 0 && dz === 0 ? 0 : Math.atan2(dx, dz) }
}

/** The point alone, without the facing — what {@link pathAt} looks a step ahead with. */
function pathStep(
  points: readonly (readonly [number, number, number])[],
  t: number,
): [number, number, number] | undefined {
  const spans = points.length - 1
  if (spans <= 0) return undefined
  const along = Math.max(0, Math.min(1, t)) * spans
  const span = Math.min(spans - 1, Math.floor(along))
  const u = along - span
  const at = (i: number) =>
    points[Math.max(0, Math.min(points.length - 1, i))] as readonly [number, number, number]
  const [p0, p1, p2, p3] = [at(span - 1), at(span), at(span + 1), at(span + 2)]
  const point = (i: 0 | 1 | 2): number => {
    const [a, b, c, d] = [p0[i], p1[i], p2[i], p3[i]]
    return (
      0.5 *
      (2 * b +
        (c - a) * u +
        (2 * a - 5 * b + 4 * c - d) * u * u +
        (-a + 3 * b - 3 * c + d) * u ** 3)
    )
  }
  return [point(0), point(1), point(2)]
}

/** How long a path is, as the game measures it: the straight runs between its points. */
export function pathLength(points: readonly (readonly [number, number, number])[]): number {
  let length = 0
  for (let i = 1; i < points.length; i++) {
    const [ax, ay, az] = points[i - 1] as readonly [number, number, number]
    const [bx, by, bz] = points[i] as readonly [number, number, number]
    length += Math.hypot(bx - ax, by - ay, bz - az)
  }
  return length
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
  /**
   * Sounds asked for and not yet taken by the page: `726` names an effect
   * archive in the effects' SDAT, `720` a jingle in the music's — see the
   * header. The page drains this each frame.
   */
  readonly sounds: { readonly kind: 'effect' | 'jingle' | 'stop'; readonly index: number }[] = []
  /** Frames played. */
  frame = 0
  /**
   * The whole vertical field of view the scene asked for, in radians — see
   * `532`. Undefined until it asks, and then the camera's until the event ends.
   */
  fov: number | undefined
  /** Engine functions answered with 0 because they are not read, and how often. */
  readonly unhandled = new Map<number, number>()
  /** What each of them was handed, which is what reading it out of the decomp starts from. */
  readonly unreadCalls = new Map<number, UnreadCall>()
  /**
   * Told the first time each unread function turns up, so a run can say so
   * where it happens rather than leaving it to a count at the end. Set by
   * whoever plays the event.
   */
  onUnread: ((call: UnreadCall) => void) | undefined
  /**
   * Whether an unread function stops the run instead of being answered with 0.
   * Off in the game, where a scene half-played is better than a scene stopped;
   * on in the tools, where silence is the thing being measured.
   */
  strict = false
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

  /**
   * An engine function the host has not got: **answered with 0**, counted, and
   * kept with what it was handed.
   *
   * Answering 0 is what lets a scene go on rather than stopping dead, and it
   * is the wrong thing to be quiet about — so the first sighting of each
   * number is told to {@link onUnread}, and {@link strict} turns it into an
   * error for a run whose business is finding them.
   */
  private unread(id: number, args: readonly ScriptValue[]): ScriptValue {
    const shape = args.map(shapeOf).join('')
    const already = this.unreadCalls.get(id)
    if (already) {
      already.calls++
      already.shapes.add(shape)
      // A handful of each is enough to read a function by; one event polls
      // functions 0 and 2 nearly ten thousand times apiece.
      if (already.examples.length < UNREAD_EXAMPLES) already.examples.push(args)
    }
    const call: UnreadCall = already ?? {
      fn: id,
      calls: 1,
      shapes: new Set([shape]),
      examples: [args],
      frame: this.frame,
    }
    if (!already) {
      this.unreadCalls.set(id, call)
      this.onUnread?.(call)
    }
    this.unhandled.set(id, call.calls)
    if (this.strict) {
      throw new ScriptError(
        `engine function ${id} is not read — handed (${shape}) at frame ${this.frame}`,
      )
    }
    return 0
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
        hidden: false,
        hungOn: undefined,
        opacity: OPACITY_WHOLE,
        fade: undefined,
        walk: undefined,
        path: { points: [], speed: 0, started: undefined, frames: 0 },
        turn: undefined,
      }
      this.actors.set(id, found)
    }
    return found
  }

  /** Whether a character is still walking or turning. */
  busy(id: number): boolean {
    const actor = this.actors.get(id)
    if (!actor) return false
    return actor.walk !== undefined || actor.turn !== undefined || actor.path.started !== undefined
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
      // A path under way — `217`. The curve gives both where it is and which
      // way it faces, as the game's `Path_Update` writes both.
      if (actor.path.started !== undefined) {
        const { started, frames, points } = actor.path
        const t = frames <= 0 ? 1 : Math.min(1, (this.frame - started) / frames)
        const there = pathAt(points, t)
        if (there) {
          actor.x = there.at[0]
          actor.y = there.at[1]
          actor.z = there.at[2]
          if (t < 1) actor.facing = there.facing
          actor.placed = true
        }
        if (t >= 1) actor.path.started = undefined
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
      case 570:
        this.actor(num(args[0])).hidden = num(args[1]) === 0
        return 0
      case 571:
        // Read as solidity and not acted on — see the header.
        return 0
      case 235:
        this.actor(num(args[0])).hungOn = { parent: num(args[1]), bone: String(args[2]) }
        return 0
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
      case 726:
      case 730:
        this.sounds.push({ kind: 'effect', index: num(args[0]) })
        return 0
      case 720:
        this.sounds.push({ kind: 'jingle', index: num(args[0]) })
        return 0
      case 727:
      case 729:
        this.sounds.push({ kind: 'stop', index: 0 })
        return 0
      case 560: {
        // Whether the scene carries straight on from a conversation — see `afterTalk`.
        const ref = args[0]
        if (isRef(ref)) thread.write(ref, this.afterTalk ? 1 : 0)
        return 0
      }
      // **The scene's field of view**, `532` — the game's `Camera_SetFov`. Its
      // number is the half-angle in degrees, so 15, which 1,668 of its 2,477
      // calls pass, is a vertical field of 30°. It takes an integer or a float.
      case 532:
        this.fov = fovOfHalfDegrees(num(args[0]))
        return 0
      // **A waypoint path**, the game's 214 to 217 — read from overlay 1's
      // handlers and the commands they queue: `214` resets the path, `216`
      // appends a point to it, `215` says how fast it is walked and `217`
      // sets it going and waits. Together they are the many-point counterpart
      // of `207`, and 65 events use them.
      case 214: {
        const actor = this.actor(num(args[0]))
        actor.path.points.length = 0
        actor.path.speed = 0
        actor.path.started = undefined
        actor.path.frames = 0
        return 0
      }
      case 215: {
        // The second value is a **speed**, not a count of frames: the game
        // divides the path's length by it (`0x021579ac`).
        const actor = this.actor(num(args[0]))
        actor.path.speed = num(args[1])
        return 0
      }
      case 216: {
        // Its fourth and fifth values are **read by nothing** in the game's
        // own handler, which takes three floats and no more. They are angles
        // where they appear, on 37 of the 767 calls.
        const actor = this.actor(num(args[0]))
        if (actor.path.points.length < PATH_POINTS) {
          actor.path.points.push([num(args[1]) * s, num(args[2]) * s, num(args[3]) * s])
        }
        return 0
      }
      case 217: {
        const actor = this.actor(num(args[0]))
        const points = actor.path.points
        if (points.length === 0) return 0
        // **Ours: how long it takes.** The game divides the path's length by
        // the speed, and what the answer is counted in was not read — the
        // spline's own time base. A second is taken here, which puts the
        // shuffles of `ev02810` at about a dozen frames apiece.
        const seconds = actor.path.speed > 0 ? pathLength(points) / (actor.path.speed * s) : 0
        actor.path.frames = Math.max(1, Math.round(seconds * 60))
        actor.path.started = this.frame
        const first = pathAt(points, 0)
        if (first) {
          actor.x = first.at[0]
          actor.y = first.at[1]
          actor.z = first.at[2]
          actor.placed = true
        }
        return 0
      }
      default:
        return this.unread(id, args)
    }
  }
}

/**
 * An engine function the host has not got, and what it was handed — the
 * worklist's own record. `shapes` are signatures as `docs/event-scripts.md`
 * writes them, `i` integer, `f` float, `s` string, `r` reference.
 */
export interface UnreadCall {
  readonly fn: number
  calls: number
  readonly shapes: Set<string>
  readonly examples: (readonly ScriptValue[])[]
  /** The frame its first call fell on. */
  readonly frame: number
}

/** How many argument lists to keep for each unread function. */
const UNREAD_EXAMPLES = 4

/** What one argument is, for a signature: `i` integer, `f` float, `s` string, `r` reference. */
function shapeOf(value: ScriptValue): string {
  if (typeof value === 'string') return 's'
  if (typeof value === 'object') return 'r'
  return Number.isInteger(value) ? 'i' : 'f'
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
