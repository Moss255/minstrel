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
  /** The frame a wait of `218`'s ends on; undefined when it is not waiting. */
  waiting: number | undefined
  /** What `545` set the motion's rate to; 1 unless a scene says otherwise. */
  motionRate: number
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

/** How many sound handles the game keeps, which a script may stop one at a time — see `712`. */
export const SOUND_SLOTS = 16

/**
 * The archive a sound comes from when a scene has not loaded one of its own:
 * the game's field manager mounts `se_norm.sdat`'s archive **100**, whose
 * sounds the talking blips of `554` are among.
 */
export const BASE_EFFECTS = 100

/** A balloon parked over a character's head — see `541`. */
export interface Marker {
  /** The character it hangs over. */
  readonly actor: number
  /** Which sheet, as the script names it: the game remaps a few of these. */
  readonly kind: number
  /** The pixels it is nudged by, on top of the 76 above the character. */
  readonly dx: number
  readonly dy: number
}

/**
 * A camera shake — see `317`. The offset goes on and off over four frames and
 * keeps its size throughout; `frames` below zero never ends.
 */
export interface Shake {
  readonly amp: Vec3
  readonly frames: number
  readonly started: number
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
  /** The shake under way — see `317`. */
  shake: Shake | undefined
  /** What the camera looked at before this frame's shake was added to it. */
  private shakeBase: Vec3 | undefined
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
  readonly sounds: {
    readonly kind: 'effect' | 'jingle' | 'stop'
    /** The sound archive it comes from — see `726`. */
    readonly index: number
    /** Which of the archive's own sounds, where the scene names one — see `728`. */
    readonly slot?: number
  }[] = []
  /** Frames played. */
  frame = 0
  /** What `506` asked the loader for, as the script named it — see `506`. */
  readonly queued: string[] = []
  /** The door placements a scene has opened, `group,object` — see `540`. */
  readonly doorsOpened = new Set<string>()
  /** The balloon over a character's head, where a scene has put one — see `541`. */
  marker: Marker | undefined
  /** How many sound handles have been handed out — see `712`. */
  private soundSlots = 0
  /** The archive a scene's own sounds come from — see `726`. */
  effects: number | undefined
  /** A second archive, `730`'s. */
  effectsB: number | undefined
  /** Which of the three talking blips a line uses — see `554`. */
  talkPitch = 0
  /**
   * Which time of day the engine is on, for `597`. **Ours**: the game keeps a
   * lighting slot of 0 to 6 and this engine has three times of day. Whoever
   * plays the event sets it.
   */
  timeOfDay = 0
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
        waiting: undefined,
        motionRate: 1,
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
    if (actor.waiting !== undefined && this.frame >= actor.waiting) actor.waiting = undefined
    return (
      actor.walk !== undefined ||
      actor.turn !== undefined ||
      actor.path.started !== undefined ||
      actor.waiting !== undefined
    )
  }

  /** One frame on: whatever is walking or turning moves. */
  advance(): void {
    this.frame++
    // The shake is taken off before anything else moves, as the game takes it
    // off at the head of its own frame — so it never builds up.
    if (this.shakeBase && this.camera) {
      this.camera.target = [...this.shakeBase]
      this.shakeBase = undefined
    }
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
      if (actor.waiting !== undefined && this.frame >= actor.waiting) actor.waiting = undefined
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
    this.shakeFrame()
  }

  /**
   * The shake's own frame — see `317`. Four frames to a cycle: the offset on,
   * nothing, the offset off, nothing; and the camera's own place is kept so
   * that the next frame can take it away again.
   */
  private shakeFrame(): void {
    const shaking = this.shake
    const shot = this.camera
    if (!shaking || !shot?.target) return
    const t = this.frame - shaking.started
    if (shaking.frames >= 0 && t >= shaking.frames) {
      this.shake = undefined
      return
    }
    const phase = ((t % 4) + 4) % 4
    const sign = phase === 0 ? 1 : phase === 2 ? -1 : 0
    if (sign === 0) return
    this.shakeBase = [...shot.target]
    shot.target = [
      shot.target[0] + shaking.amp[0] * sign,
      shot.target[1] + shaking.amp[1] * sign,
      shot.target[2] + shaking.amp[2] * sign,
    ]
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
      // **Move where the camera looks**, `305`, and **where it is**, `306`.
      // The game keeps an eye and a target and moves each over the count it is
      // given; here the eye is the target and an orbit about it, so moving the
      // target is `305` and moving the eye is that orbit changing.
      case 305:
        this.moveTarget([num(args[0]) * s, num(args[1]) * s, num(args[2]) * s], num(args[3]))
        return 0
      case 306: {
        const eye: Vec3 = [num(args[0]) * s, num(args[1]) * s, num(args[2]) * s]
        const target = this.shot().target ?? [0, 0, 0]
        this.moveAngle(lookFrom(eye, target), num(args[3]))
        return 0
      }
      case 321:
        // The game works out a new eye from the camera's own yaw, height and
        // distance and moves eye and target together, so the framing is kept
        // and only what it looks at changes. Here the eye *is* the target and
        // an orbit, so moving the target alone comes to the same thing.
        this.moveTarget([num(args[0]) * s, num(args[1]) * s, num(args[2]) * s], num(args[3]))
        return 0
      // **Whether the camera still has work to do**, `301` — the game asks
      // whether any of its camera queues still holds a command, the shake's
      // among them, and hands back 1 while one does.
      case 301: {
        const ref = args[0]
        const busy =
          this.targetMove !== undefined || this.angleMove !== undefined || this.shake !== undefined
        if (isRef(ref)) thread.write(ref, busy ? 1 : 0)
        return 0
      }
      // **The camera shakes**, `317` — the game adds the same offset to both
      // the eye and what it looks at, so the view moves without turning, and
      // takes it off again before the next frame. The offset is in the world's
      // own axes, on a **four-frame square wave**: on, nothing, off, nothing.
      // A count below zero shakes for ever.
      //
      // **It does not fade.** The game works out a decay every fourth frame
      // and stores it where nothing reads it again — the offset it applies is
      // the one it started with — so a shake holds its size for its whole
      // length. That is the game's, bug and all, and not a simplification.
      case 317:
        this.shake = {
          amp: [num(args[0]) * s, num(args[1]) * s, num(args[2]) * s],
          frames: num(args[3]),
          // The first frame it is looked at is the next one, and that is the
          // one the game counts as nothing: on, nothing, off, nothing.
          started: this.frame + 1,
        }
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
      // **The sound archives a scene uses**, and what it plays out of them —
      // read from overlay 1. The game mounts one archive for the scene's own
      // sounds (`726`, and `730` for a second) and plays a sound **out of that
      // archive by its own number** (`728`, and `732`); `727` and `731` give
      // the archives back, and `723`, `729` and `733` stop one sound by the
      // handle it was given.
      //
      // This engine read `726` as *play archive n* until the code was read:
      // it loads. What plays is `728`.
      case 726:
        this.effects = num(args[0])
        return 0
      case 730:
        this.effectsB = num(args[0])
        return 0
      case 727:
        this.effects = undefined
        return 0
      case 731:
        this.effects = undefined
        this.effectsB = undefined
        return 0
      case 728:
      case 732: {
        const from = (id === 728 ? this.effects : this.effectsB) ?? BASE_EFFECTS
        this.sounds.push({ kind: 'effect', index: from, slot: num(args[0]) })
        const ref = args[1]
        if (isRef(ref)) thread.write(ref, this.soundSlots++ % SOUND_SLOTS)
        return 0
      }
      case 723:
      case 729:
      case 733:
        this.sounds.push({ kind: 'stop', index: 0 })
        return 0
      case 720:
        this.sounds.push({ kind: 'jingle', index: num(args[0]) })
        return 0
      // **The voice a line is spoken in**, `554` — not speech but the blip
      // that runs while a message types itself out: the game plays one of
      // three looping sounds of its base archive, `10` at its own pitch, `12`
      // low and `11` high, and this number picks which. It is called more than
      // any other function on the cartridge, once a speaker.
      //
      // **Ours**: nothing here blips, so the pitch is kept and not sounded.
      case 554:
        this.talkPitch = num(args[0])
        return 0
      // **Stop what a character is playing**, `222` — queued behind whatever
      // else it has been told to do, so it stops when its turn comes.
      case 222: {
        const actor = this.actor(num(args[0]))
        actor.motion = undefined
        actor.after = undefined
        actor.once = false
        return 0
      }
      // **A flag of the field's**, `595` — the game hands back a word that is
      // set on one path of a fade and read in one place. **What it means was
      // not established**; nothing here sets it, so it answers as a field
      // just made would: nothing.
      case 595: {
        const ref = args[0]
        if (isRef(ref)) thread.write(ref, 0)
        return 0
      }
      // **Look up a character a scene registered**, `596`. The game keeps a
      // list of them — `566` makes the entries — and hands back what kind it
      // is, a state of 0, 1 or 2, and the object it became.
      //
      // **Ours**: this engine keeps no such list, so it answers as the game
      // does for a name it does not find — a kind of −1 and the state 2.
      // Note the game writes its second answer whether or not it was given
      // somewhere to put it, which on a two-argument call is one place past
      // the end; that is not copied here.
      case 596: {
        const kind = args[1]
        const state = args[2]
        if (isRef(kind)) thread.write(kind, -1)
        if (isRef(state)) thread.write(state, 2)
        return 0
      }
      case 560: {
        // Whether the scene carries straight on from a conversation — see `afterTalk`.
        const ref = args[0]
        if (isRef(ref)) thread.write(ref, this.afterTalk ? 1 : 0)
        return 0
      }
      // **A sound effect**, `712` — the game plays it on its own handle where
      // it is given one, so that a later `723`, `729` or `733` can stop that
      // one sound rather than all of them; the handle is a slot of sixteen and
      // the script is handed its number. Without a second value it plays on
      // the manager's own handle, as `726` does.
      case 712: {
        // The base archive's, not the scene's — the game plays this one
        // through the manager's own group.
        this.sounds.push({ kind: 'effect', index: BASE_EFFECTS, slot: num(args[0]) })
        const ref = args[1]
        if (isRef(ref)) {
          const slot = this.soundSlots++ % SOUND_SLOTS
          thread.write(ref, slot)
        }
        return 0
      }
      // **A character starts and stops walking**, `545` and `546`. The game
      // sets a bit that picks the walking animations over the standing ones
      // and gives the animation a rate — its second value is **a rate, not a
      // speed over the ground** — and `546` puts both back, the rate to 1.
      // A plain model with no walk of its own plays `run` and `stand` instead.
      //
      // **Ours**: this engine plays a motion by name, so these are the names
      // `210` would be given; the rate is kept and nothing reads it yet.
      case 545: {
        const actor = this.actor(num(args[0]))
        actor.motion = 'walk'
        actor.motionFrom = this.frame
        actor.once = false
        actor.motionRate = num(args[1]) || 1
        return 0
      }
      case 546: {
        const actor = this.actor(num(args[0]))
        actor.motion = 'stand'
        actor.motionFrom = this.frame
        actor.once = false
        actor.motionRate = 1
        return 0
      }
      // **A balloon over a character's head**, `541`, `561` and `542` — one of
      // the field's sprite sheets (`fuki_com.spr` a speech balloon,
      // `ev_mark.spr` a mark, `field_qu.spr` a question), parked at the
      // character's place on the screen and 76 pixels above it, nudged by the
      // pixels the script gives.
      //
      // **Ours**: which sheet each kind names is the game's own remapping and
      // nothing here draws one yet, so what is kept is what a scene asked for.
      case 541:
        this.marker = {
          actor: num(args[0]),
          kind: num(args[1]),
          dx: args.length > 2 ? num(args[2]) : 0,
          dy: args.length > 3 ? num(args[3]) : 0,
        }
        return 0
      case 561:
        if (this.marker) {
          this.marker = {
            ...this.marker,
            dx: this.marker.dx + num(args[0]),
            dy: this.marker.dy + num(args[1]),
          }
        }
        return 0
      case 542:
        this.marker = undefined
        return 0
      // **A character waits**, `218` — the game queues a wait of N ticks on
      // the same channel its motions run on, so it is a pause between them,
      // and counts down on the character itself. One that is waiting is busy,
      // which is what `204` reports.
      case 218: {
        const actor = this.actor(num(args[0]))
        const frames = num(args[1])
        actor.waiting = frames > 0 ? this.frame + frames : undefined
        return 0
      }
      // **Where a character is, and which way it faces** — `543` and `544`,
      // which are the same function over two vectors of the character's: the
      // one that goes to its position and the one that goes to its rotation.
      // Each is handed references to fill, and the game gives **degrees**
      // (its angles are fixed-point degrees: `532` shows the unit).
      //
      // **Ours**: this engine keeps one angle for a character, its facing, so
      // the x and z of a rotation are answered with nothing.
      case 543:
      case 544: {
        const actor = this.actor(num(args[0]))
        const triple =
          id === 543
            ? [actor.x / s, actor.y / s, actor.z / s]
            : [0, (actor.facing * 180) / Math.PI, 0]
        for (const [i, value] of triple.entries()) {
          const ref = args[i + 1]
          if (isRef(ref)) thread.write(ref, value)
        }
        return 0
      }
      // **The time of day the lighting is on**, `597` — the game keeps a slot
      // of 0 to 6 in its lighting manager and hands it back.
      //
      // **Ours**: this engine has three times of day, not seven, and what its
      // own numbers mean is not the game's. The slot it gives back is the
      // engine's own — see `daytime.ts`.
      case 597: {
        const ref = args[0]
        if (isRef(ref)) thread.write(ref, this.timeOfDay)
        return 0
      }
      // **Whether the Hero is a man**, `800`: 1 for a man and 0 for a woman,
      // read from a bit of the protagonist's own record. The slice's Hero is
      // a preset and is a man, so this is 1 until a character can be made.
      case 800: {
        const ref = args[0]
        if (isRef(ref)) thread.write(ref, 1)
        return 0
      }
      // **A door opens and closes**, `540` and `563`, by the two numbers that
      // name a placement in the map's list — the group and the object. The
      // game swings it by 35° or 28°, or slides it along its facing, and
      // plays a sound the door's material picks; `584`, `585` and `586` are
      // the same with another swing.
      //
      // **Ours**: this engine's doors are the doorways a walk goes through,
      // not placements that open, so what is kept is which ones a scene has
      // opened. Nothing draws them yet.
      case 540:
      case 584:
      case 585:
      case 586:
        this.doorsOpened.add(`${num(args[0])},${num(args[1])}`)
        return 0
      case 563:
        this.doorsOpened.delete(`${num(args[0])},${num(args[1])}`)
        return 0
      // **`9` clears a flag of the game's**, and `8` sets it: one global
      // boolean, which decides whether entering a zone applies its masks of
      // opened chests and doors. Every event's section 200 clears it. This
      // engine applies no such masks, so nothing here answers to it — as with
      // the VRAM partitions below. What the flag is *for* was not established.
      case 8:
      case 9:
        return 0
      // **Staging a scene's cast**, the game's 502, 503, 506, 507 and 508 —
      // read from overlay 1. Together with 200 and 202 they are one block: a
      // VRAM partition is emptied and made current (`502`), the scene's files
      // are queued on the background loader (`506`), the script spins until
      // they are in (`507`), the partition's use is written back (`503`) and
      // the task list dropped (`508`).
      //
      // **Nearly all of it is the hardware's, and ours has none of it**: this
      // engine holds the whole cartridge and loads from it as it goes, so
      // there is no VRAM to portion out and nothing to wait for. What is kept
      // is the part a script can see — the list of what it asked for, and the
      // answer that nothing is still loading.
      case 502:
      case 503:
        // The VRAM partition's bracket. Nothing to do: see above.
        return 0
      case 506:
        // 1 to 3 file names, queued. The game routes a `chara/p_` name into
        // `chara_pc.gp2` and a `.mon` into `enemy.gp2`, and everything else to
        // `data/<name>`; they are kept here as the script gave them.
        this.queued.length = 0
        for (const name of args) if (typeof name === 'string') this.queued.push(name)
        return 0
      case 507: {
        // **Whether anything queued is still loading.** The game stores 1
        // through the reference while a task is unfinished and 0 once every
        // one is done or failed; a script spins on it. Nothing here is ever
        // still loading, so it is always 0 — which is what lets the spin end.
        const ref = args[0]
        if (isRef(ref)) thread.write(ref, 0)
        return 0
      }
      case 508:
        this.queued.length = 0
        return 0
      // **Binding a character to what was loaded**, the game's 203, 205 and
      // 212. `200` loads a file into a slot; `202` gives a display entry that
      // slot's model; `205` points a character at a display entry; `203`
      // unbinds a character and clears what it was doing; `212` destroys the
      // model in a slot and unbinds whoever wore it.
      //
      // **A character and its display entry are always the same number** on
      // this cartridge — all 1,324 calls of `205` — so `202` above dresses the
      // character directly and these three keep the two in step.
      case 203: {
        const actor = this.actor(num(args[0]))
        actor.model = undefined
        actor.packs.length = 0
        actor.walk = undefined
        actor.turn = undefined
        actor.path.points.length = 0
        actor.path.started = undefined
        this.bound.delete(num(args[0]))
        return 0
      }
      case 205: {
        // Where the two numbers differ — which they never do here — the
        // character takes the entry's model rather than its own.
        const entry = num(args[1])
        const slot = this.bound.get(entry)
        const loaded = slot === undefined ? undefined : this.slots.get(slot)
        const actor = this.actor(num(args[0]))
        if (loaded) {
          actor.model = loaded.model
          actor.packs.push(...loaded.packs.filter((pack) => !actor.packs.includes(pack)))
        }
        this.bound.set(num(args[0]), slot ?? entry)
        return 0
      }
      case 212: {
        // The slot the script names, negative as `200` takes them.
        const slot = num(args[0])
        this.slots.delete(slot)
        for (const [id, at] of [...this.bound]) {
          if (at !== slot) continue
          this.bound.delete(id)
          const actor = this.actor(id)
          actor.model = undefined
          actor.packs.length = 0
        }
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
