import type { Script } from '@minstrel/game-formats'
import { DEGREE_IN_RADIANS, DS_VERTICAL_FOV, fovOfHalfDegrees } from '@minstrel/render'
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
 * | 560 | reference | whether the scene carries straight on from a conversation — see `afterTalk` |
 * | 720 | jingle | play a jingle: its six values, 55–67, fall where `bgm.sdat` keeps its `ME_` sequences, 50–68 |
 * | 840 | reference | how long the frame was, in halves — see {@link FRAME_IN_HALVES} |
 *
 * The rest are **read from the cartridge's own code** and say so where they
 * are handled: the sound block (`723`, `726`–`733`), the brightness family
 * (`101`, `105`, `120`, `121`), the staging block (`502`–`508`), the path
 * (`214`–`217`), the balloons (`541`–`546`), `211`, `233`, `317`, `322`,
 * `328`, `532`, `547`, `554`, `558`, `573`, `574`, `595`–`597`, `603`,
 * `703`–`709`, `712`, `715`, `721`, `800`.
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
  /** The animation packages `230` has taken off, by the game's own id. */
  packsDropped: number[]
  /**
   * How far the character reaches, which the game keeps on the model itself
   * and starts at 1 — see `226` and `227`.
   */
  radius: number
  radiusMove: CameraMove<number> | undefined
  /** Whether what the character holds is drawn — see `550`. */
  holdingShown: boolean
  /** Whether the weapon is mounted drawn rather than stowed — see `556`. INFERRED. */
  weaponDrawn: boolean
  /** Whether the height comes from the ground each frame — see `231` and `232`. */
  onGround: boolean
  /** What the character wears, by the game's own slot — see `828`. */
  worn: Map<number, number>
  /** What `828` has taken off and kept, waiting to be put back. */
  stashed: Map<number, number>
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

/**
 * The loudest the sound goes — `715` clamps its number to 0..127 before the
 * sound manager takes it, and the game snaps it back to 127 when a scripted
 * battle begins.
 */
export const SOUND_LOUDEST = 127

/** How long `721` takes to fade the music out when a scene does not say. */
export const BGM_FADE_FRAMES = 30

/**
 * Which game-object slot a monster goes in, from the number `233` is given:
 * the game's `if (x < 0) x = -x + 0x9f`, which folds the negative numbers
 * every scene uses onto slots `0xa0` to `0xbf`.
 */
export function monsterSlot(id: number): number {
  return id < 0 ? -id + 0x9f : id
}

/**
 * The level the brightness family takes a screen to when a scene names none:
 * `-16`, which is black. The DS's master brightness is a 5-bit fade either
 * way, and every one of the nine setters defaults to `mvn r5, #0xf`.
 */
export const BRIGHTNESS_BLACK = 16

/**
 * The bits of `568`'s mask the scene's own setup and teardown can reach: the
 * low 27. The top five are a count of the characters `566` has spawned, and
 * the game is careful to keep them — so this engine is too.
 */
export const SCENE_FLAGS = 0x07ffffff

/** The whole of the DS's blend coefficient, which `103` asks for — see `102` and `103`. */
export const TINT_WHOLE = 0x1f

/**
 * How a message is dressed — see `409` to `414`. The game keeps these as bits
 * and bytes of the one message window, and `400` puts them all back.
 */
export interface Caption {
  /** Whether the window box is drawn — `410` takes it away. */
  readonly framed: boolean
  /** Whether the text is centred on the screen rather than in the box — `411`. */
  readonly centred: boolean
  /** How the glyphs are drawn: `414` outlines them, `412` shadows them. */
  readonly glyphs: 'plain' | 'shadow' | 'outline'
  /** Whether the typing sound is off — `413`. */
  readonly silent: boolean
  /** How many frames the caption holds for, where `409` timed it. */
  readonly hold?: number
}

/**
 * Which bit of the story-flag bank an id names — the game's own rule: an id
 * below `0x400` is the bit, and one above is **displaced by 1,786 bits** into
 * a second range of the same bank. `603` applies this; `600` does not, which
 * is how the bits between the two ranges are reached at all.
 */
export function storyBit(id: number): number {
  return id < 0x400 ? id : id + 0x6fa
}

/**
 * The game's own four phases of the day, from the decomp's `TimeOfDay.h`.
 * `588` pins the lighting to one, `808` sets it, `597` answers it — so all
 * three speak these numbers, not this engine's three times of day.
 */
export const TIME_OF_DAY = { night: 0, morning: 1, day: 2, evening: 3 } as const

/**
 * The four buttons engine function `0` counts, as the DS numbers them: two
 * face buttons and two shoulder-side ones. The handler tests each separately
 * and adds the answers.
 */
export const FACE_BUTTONS = [0x0001, 0x0002, 0x0400, 0x0800] as const

/** How many sprite placements the manager holds — see `521`. */
export const SPRITE_SLOTS = 32

/**
 * The VRAM partition `521` stages a sprite's texture into when a scene does
 * not name one: **27**, which is the very partition `502` and `503` bracket.
 */
export const SPRITE_PARTITION = 27

/** A camera driven by a model's own bones — see `572`, `530` and `552`. */
export interface BoneCamera {
  /** The placement or slot whose model drives it. */
  readonly placement: number
  /** The bone the eye sits on. */
  readonly eye: string
  /** The bone it looks at. */
  readonly at: string
  /** A third bone, `552`'s only. */
  readonly third?: string
  /** The object that third bone drags about, `552`'s only. */
  readonly drags?: number
}

/** A sprite a scene has put on the map — see `521`. */
export interface SpritePlacement {
  /** The file it came from, as the game builds the path. */
  readonly file: string
  /** Which of the eight allocators it was built from. */
  readonly allocator: number
  /** Which VRAM partition its texture was staged into. */
  readonly partition: number
}

/** How `238`'s colour is applied, by the number it is given. */
export const RECOLOUR = ['add', 'fill', 'multiply'] as const

/** The package id `230` takes off when a scene does not name one. */
export const PACKAGE_DEFAULT = 3

/** A colour a scene has put over a placed model — see `238`. */
export interface Recolour {
  /** The three components, five bits each, as the game packs them. */
  readonly red: number
  readonly green: number
  readonly blue: number
  /** How it is applied — `'unread'` for a number the game itself does nothing for. */
  readonly how: (typeof RECOLOUR)[number] | 'unread'
}

/**
 * The message window's bytes that `417` to `421` write, by their offsets in
 * the window — **their meanings are not established**, so they are carried as
 * the game writes them rather than named for a guess.
 */
export interface Window {
  unknown_0x195d?: number
  unknown_0x19ae?: number
  unknown_0x19c0?: number
  unknown_0x19c1?: number
  unknown_0x19ca?: number
  unknown_0x19cb?: number
}

/** A message as `400` leaves it, before any of `409` to `414` has spoken. */
export const CAPTION_PLAIN: Caption = {
  framed: true,
  centred: false,
  glyphs: 'plain',
  silent: false,
}

/**
 * How long `409`'s caption takes to fade in, and again to fade out, in frames.
 * The game steps a level of `0x1f0000` by `0x8444` a frame, and those divide
 * to exactly 60 — a second either side.
 */
export const CAPTION_FADE_FRAMES = 60

/** What a scene has done to one thing the map placed — see `574` to `577`. */
export interface Placement {
  /** Whether bit 2 of the record's flags is set, which the draw path skips on. */
  hidden: boolean
  /** Where `575` put it. */
  position?: Vec3
  /** The second vector, `577`'s — meaning not established. */
  vector?: Vec3
  /** The halfword at `+0x06`, `576`'s — meaning not established. */
  half?: number
}

/** A colour over the screen, as `102` and `103` write it. */
export interface Tint {
  /** The three components, 0 to 31 each, where the scene gave them — `103` only. */
  readonly red?: number
  readonly green?: number
  readonly blue?: number
  /** What goes in the record's `+0x04`: 31 from `103`, 1 from `102`. */
  readonly coefficient: number
  /** How long it was given, in frames — the game turns it into milliseconds. */
  readonly frames: number
  readonly start: number
}

/** Which screens a brightness function touches, how it locks, and whether it takes a level. */
export type Brightness = readonly ['both' | 'top' | 'sub', 'set' | 'lock' | 'unlock', boolean]

/**
 * The whole brightness block, `100` to `122`, as the cartridge registers it.
 *
 * The eighteen **types** run 0 to 17 unbroken — three screens times three
 * locking kinds, each an even half that sets the screen to normal and an odd
 * half that takes the level it is given. The **numbers** do not: `102`, `103`
 * and `108` to `110` are other features wedged into the range, which is why
 * `106` is the top screen and `111` starts at type 6 rather than 11.
 */
export const BRIGHTNESS: Readonly<Record<number, Brightness>> = {
  100: ['both', 'set', false],
  101: ['both', 'set', true],
  104: ['sub', 'set', false],
  105: ['sub', 'set', true],
  106: ['top', 'set', false],
  107: ['top', 'set', true],
  111: ['both', 'lock', false],
  112: ['both', 'lock', true],
  113: ['sub', 'lock', false],
  114: ['sub', 'lock', true],
  115: ['top', 'lock', false],
  116: ['top', 'lock', true],
  117: ['both', 'unlock', false],
  118: ['both', 'unlock', true],
  119: ['sub', 'unlock', false],
  120: ['sub', 'unlock', true],
  121: ['top', 'unlock', false],
  122: ['top', 'unlock', true],
}

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
  /**
   * Whether the eye stays where it is and only the view turns — `326`. `317`
   * moves the eye and the look-at together, so the view slides without
   * turning; `326` moves the look-at alone.
   */
  readonly turning?: boolean
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
  /** Banked about the view's own axis, in radians — see `327`. A Dutch angle, not a turn. */
  roll: number
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
function eyeFrom(shot: EventCamera): Vec3 {
  const target = shot.target ?? [0, 0, 0]
  const flat = Math.sqrt(Math.max(0, shot.distance * shot.distance - shot.rise * shot.rise))
  return [
    target[0] + Math.sin(shot.yaw) * flat,
    target[1] + shot.rise,
    target[2] + Math.cos(shot.yaw) * flat,
  ]
}

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

/** An angle wrapped to one turn, as `fix32ReduceAngle0To2Pi` wraps the engine's. */
function wrapTurn(angle: number): number {
  const full = 2 * Math.PI
  return ((angle % full) + full) % full
}

/**
 * The facing to turn to from `from`, the way `turn` says: `-1` the short way,
 * `0` backwards, anything else forwards — `322`'s eighth argument.
 */
function turning(from: number, to: number, turn: number): number {
  const full = 2 * Math.PI
  if (turn === -1) return towards(from, to)
  const forward = (((to - from) % full) + full) % full
  // Both ways round are nothing when it is already there, as the game's are.
  if (forward === 0) return from
  return turn === 0 ? from - (full - forward) : from + forward
}

/** Who stands where in an event, what they play, and what is on show — the engine functions' side. */
export class EventStage {
  readonly actors = new Map<number, EventActor>()
  camera: EventCamera | undefined
  /** The shake under way — see `317`. */
  shake: Shake | undefined
  /** What the camera looked at before this frame's shake was added to it. */
  private shakeBase: Vec3 | undefined
  /** And the orbit it had, where a turning shake worked out a new one — see `326`. */
  private shakeOrbit: { yaw: number; rise: number; distance: number } | undefined
  /** The character the camera's look-at follows, and by how much — see `324`. */
  following: { readonly actor: number; readonly offset: Vec3 } | undefined
  /** Which things the map placed a scene has shown or hidden — see `223`. */
  readonly placedShown = new Map<number, boolean>()
  /** What a scene has hung on a placement, placement to model — see `239` and `240`. */
  readonly hungOnPlacement = new Map<number, number>()
  /**
   * What the floor is under a point, where whoever plays the event can say —
   * what `231` and `232` walk a character onto. Undefined here, so the height
   * is left alone.
   */
  groundAt: ((x: number, z: number, y: number) => number | undefined) | undefined
  /** How dark the screen is, from 0, clear, to 1, black — see `101` and `121`. */
  darkness = 0
  private darkening: Fade | undefined
  /**
   * How dark the **bottom** screen is — see `105` and `120`. The game keeps
   * the two screens' brightness apart and a scene fades them apart; this
   * engine draws only the top one, so this is kept and not drawn.
   */
  subDarkness = 0
  private subDarkening: Fade | undefined
  /**
   * Which screens a `SetAndLock…` has locked — see `111` to `116`. A plain
   * `Set…` does nothing to a locked screen until an `UnlockAndSet…` frees it.
   */
  readonly brightnessLocked = new Set<'top' | 'sub'>()
  /**
   * Whether the main engine has been put on the bottom screen — `108`, `109`
   * and `110`, which write the DS's display swap. **Ours**: kept, not acted on.
   */
  screensSwapped = false
  /** The colour a scene has asked for over the screen — see `102` and `103`. */
  tint: Tint | undefined
  /** How the message on show is dressed — see `409` to `414`. `400` puts it back. */
  caption: Caption = { ...CAPTION_PLAIN }
  /** The tune `713` has loaded and silenced, waiting for `714`. */
  musicArmed: number | undefined
  /**
   * Whether `720`'s jingle is still going — what `725` answers. **Ours**:
   * nothing here can say, so it is no until whoever plays the event says so.
   */
  jingleBusy = false
  /**
   * Whether a wireless session is up — what `801` answers. **Ours**: always
   * no; multiplayer is not built here, and stays out.
   */
  wireless = false
  /** What the scene switched on for its own duration — see `568`. */
  sceneFlags = 0
  /** The message window's other bytes, by their offsets — see `417` to `421`. */
  readonly window: Window = {}
  /** The path `569` put together in the scene's own buffer. */
  queuedPath: string | undefined
  /** Whether the map's placements are held still — see `581` and `582`. */
  placementsHeld = false
  /**
   * How bright the scene's light is, 1 being normal and 0 black — see `578`.
   * The game keeps one scale over both light colours and the horizon's.
   */
  lightScale = 1
  private lightFade: Fade | undefined
  /** The colours a scene has asked for over placed models — see `238`. */
  readonly recolours = new Map<number, Recolour>()
  /** The placements a scene has unhung — see `236`. */
  readonly detached = new Set<number>()
  /**
   * The script this scene runs on into when its own ends — see `538`. The
   * game keeps 0 for "none", so 0 and undefined mean the same here.
   */
  nextScript: number | undefined
  /**
   * A second script the trigger carried, parked until `810` moves it into the
   * chain — see `834`. **Ours**: whoever starts the event sets it, since this
   * engine reads one event id from a trigger word.
   */
  queuedScript: number | undefined
  /** The sprites a scene has put on the map, by their slot — see `521` and `522`. */
  readonly sprites = new Map<number, SpritePlacement>()
  /** What `509` has switched on each game object's own flag word, by slot. */
  readonly objectFlags = new Map<number, number>()
  /** Whether the scene has asked for the zone's light to be applied again — see `589`. */
  relight = false
  /** Which lighting a zone uses, where `548` has overridden it; 0 is none. */
  lightingOverride = 0
  /** Whether the day clock runs — see `579`, whose number means the opposite. */
  dayClockRunning = true
  /** `559`'s byte. **Nothing in the cartridge reads it**; it is kept so as to say so. */
  unreadByte_0x490 = 0
  /** Which buttons are held, as the DS numbers them — what `0` counts. */
  held = 0
  /** Which were pressed this frame and not last — what `1` asks about. */
  pressed = 0
  /** What `2` answers. **What its two fields are was not established.** */
  touching = false
  /**
   * A number from 0 to `span - 1` — what `7` draws from, which in the game is
   * the battle's own generator through `NextRandomBetween`. **Ours**: a plain
   * counter unless whoever plays the event gives it one, so that a headless
   * run of a scene is the same every time.
   */
  random: (span: number) => number = () => 0
  private fovMove: CameraMove<number> | undefined
  /** What `512` set in the game's own flag word. */
  gameFlags = 0
  /** The camera a model's bones are driving — see `572`, `552` and `531`. */
  boneCamera: BoneCamera | undefined
  /** Whether the Hero is on something — `557` says they are not. **INFERRED**. */
  riding = false
  /** The byte `583` writes, which gates the path that enters a map. */
  fieldEntry = 0
  /** The zone bit `591` holds, which nothing in the cartridge was found to read. */
  zoneBit = false
  /** Whether the zone's two extra render passes run — see `599` and `805`. */
  readonly zonePasses: [number, number] = [1, 1]
  /** Which of the five progress records is in hand — see `601` and `602`. */
  record = 0
  /** The bits of those records that are set, as `record:field:bit` — see `602`. */
  readonly recordBits = new Set<string>()
  /** Whether the music is gated off — see `735`, whose number means the opposite. */
  musicGated = false
  /** Whether the scene has fog — see `804`. */
  fog = true
  /** The staff roll, and the frame it began on — see `811`, `812` and `838`. */
  staffRoll: { readonly since: number } | undefined
  /** The full-screen cards a scene has put up — see `820` and `826`. */
  readonly cards: string[] = []
  /** Whether each screen's state is saved — see `821` and `822`. */
  readonly screenSaved: [boolean, boolean] = [false, false]
  /** Whether the music heap has both regions — see `734`. */
  musicHeapWhole = false
  /** Cast members to tint with the zone's light — see `802`. */
  readonly tinted = new Set<number>()
  /** The camera's continuous sway — see `803`, which is not `317`'s shake. */
  sway: { readonly speed: number; readonly amp: number } | undefined
  /** Whether the scene's two props are shown — see `809`. */
  readonly props: [boolean, boolean] = [true, true]
  /** Whether a model is still being rebuilt after `828` — what `829` answers. */
  redressing = false
  /**
   * How many of the event's own frames a motion lasts, where whoever plays
   * the event can say — what `213` waits out. Undefined here, so a wait on a
   * motion is over at once.
   */
  motionFrames: ((motion: string) => number | undefined) | undefined
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
    readonly kind: 'effect' | 'jingle' | 'stop' | 'stopMusic' | 'music' | 'zoneMusic'
    /** The sound archive it comes from — see `726`. */
    readonly index: number
    /** Which of the archive's own sounds, where the scene names one — see `728`. */
    readonly slot?: number
    /** How many frames to fade it out over, where the scene fades — see `721`. */
    readonly frames?: number
  }[] = []
  /** Frames played. */
  frame = 0
  /** What `506` asked the loader for, as the script named it — see `506`. */
  readonly queued: string[] = []
  /** The door placements a scene has opened, `group,object` — see `540`. */
  readonly doorsOpened = new Set<string>()
  /** What a scene has done to the things the map placed, by `group,object` — see `574`. */
  readonly placements = new Map<string, Placement>()
  /** The placed sprites a scene has taken away, by placement id — see `573`. */
  readonly spritesDropped = new Set<number>()
  /**
   * How loud the sound is, 0 to 127 — see `715`. Whole until a scene turns it
   * down. Nothing here sounds it; the page reads it.
   */
  volume = SOUND_LOUDEST
  private volumeRamp: Fade | undefined
  /**
   * Which of a message's choices is picked — what `558` answers. **Ours**:
   * this engine shows no choice window, so whoever plays the event sets it
   * and it is the first option until they do.
   */
  choice = 0
  /**
   * The game's story flags, by the number `603` asks for. **Ours**: nothing
   * here sets them, so a scene that asks finds them clear; whoever plays the
   * event may fill it.
   */
  readonly flags = new Set<number>()
  /** Monster models a scene has put in a game-object slot — see `233`. */
  readonly monsters = new Map<number, string>()
  /** The scripted battle a scene has asked for — see `547`. */
  battleFrom: { readonly placement: number; readonly battle: number } | undefined
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
  /** The frame `328` gives the camera back on. */
  private handingBack: { readonly at: number } | undefined
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
        packsDropped: [],
        radius: 1,
        radiusMove: undefined,
        holdingShown: true,
        weaponDrawn: false,
        onGround: false,
        worn: new Map(),
        stashed: new Map(),
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
      if (this.shakeOrbit) {
        Object.assign(this.camera, this.shakeOrbit)
        this.shakeOrbit = undefined
      }
    }
    // The camera's look-at follows a character until `325` takes it off.
    if (this.following) {
      const followed = this.actors.get(this.following.actor)
      if (followed) {
        const [dx, dy, dz] = this.following.offset
        this.shot().target = [followed.x + dx, followed.y + dy, followed.z + dz]
        this.targetMove = undefined
      }
    }
    if (this.darkening) {
      const { from, to, start, frames } = this.darkening
      const t = Math.min(1, (this.frame - start) / frames)
      this.darkness = from + (to - from) * t
      if (t >= 1) this.darkening = undefined
    }
    if (this.subDarkening) {
      const { from, to, start, frames } = this.subDarkening
      const t = Math.min(1, (this.frame - start) / frames)
      this.subDarkness = from + (to - from) * t
      if (t >= 1) this.subDarkening = undefined
    }
    if (this.fovMove) {
      const { from, to, start, frames } = this.fovMove
      const t = Math.min(1, (this.frame - start) / frames)
      this.fov = from + (to - from) * t
      if (t >= 1) this.fovMove = undefined
    }
    if (this.lightFade) {
      const { from, to, start, frames } = this.lightFade
      const t = Math.min(1, (this.frame - start) / frames)
      this.lightScale = from + (to - from) * t
      if (t >= 1) this.lightFade = undefined
    }
    if (this.volumeRamp) {
      const { from, to, start, frames } = this.volumeRamp
      const t = Math.min(1, (this.frame - start) / frames)
      this.volume = from + (to - from) * t
      if (t >= 1) this.volumeRamp = undefined
    }
    for (const actor of this.actors.values()) {
      if (actor.walk) {
        const { from, to, start, frames } = actor.walk
        const t = Math.min(1, (this.frame - start) / frames)
        actor.x = from[0] + (to[0] - from[0]) * t
        actor.y = from[1] + (to[1] - from[1]) * t
        actor.z = from[2] + (to[2] - from[2]) * t
        // A walk of `231`'s or `232`'s takes its height from the floor rather
        // than from where it set off — see those two.
        if (actor.onGround) actor.y = this.groundAt?.(actor.x, actor.z, actor.y) ?? actor.y
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
      if (actor.radiusMove) {
        const { from, to, start, frames } = actor.radiusMove
        const t = Math.min(1, (this.frame - start) / frames)
        actor.radius = from + (to - from) * t
        if (t >= 1) actor.radiusMove = undefined
      }
      if (actor.fade) {
        const { from, to, start, frames } = actor.fade
        const t = Math.min(1, (this.frame - start) / frames)
        actor.opacity = from + (to - from) * t
        if (t >= 1) actor.fade = undefined
      }
    }
    if (this.handingBack && this.frame >= this.handingBack.at) {
      this.handingBack = undefined
      this.camera = undefined
      this.eye = undefined
      this.angled = false
      this.targetMove = undefined
      this.angleMove = undefined
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
    // Where the camera stands now, so that a turning shake can keep it there.
    const eye = shaking.turning ? eyeFrom(shot) : undefined
    this.shakeBase = [...shot.target]
    shot.target = [
      shot.target[0] + shaking.amp[0] * sign,
      shot.target[1] + shaking.amp[1] * sign,
      shot.target[2] + shaking.amp[2] * sign,
    ]
    // `326` shakes the look-at and not the eye. This engine's eye follows from
    // the look-at and the orbit, so the orbit is worked out afresh from the
    // eye the camera had — which comes to the same thing.
    if (eye) {
      this.shakeOrbit = { yaw: shot.yaw, rise: shot.rise, distance: shot.distance }
      Object.assign(shot, lookFrom(eye, shot.target))
    }
  }

  /** The first of the 32 sprite slots with nothing in it, or −1 — the game's own search. */
  private freeSprite(): number {
    for (let slot = 0; slot < SPRITE_SLOTS; slot++) {
      if (!this.sprites.has(slot)) return slot
    }
    return -1
  }

  /** The caption as it stands, so that each of `409` to `414` adds to the others. */
  private shown9(): Caption {
    return this.caption
  }

  /** The record a `574`-family call names, by its group key and id. */
  private placed(args: readonly ScriptValue[]): Placement {
    const at = `${num(args[0])},${num(args[1])}`
    let record = this.placements.get(at)
    if (!record) {
      record = { hidden: false }
      this.placements.set(at, record)
    }
    return record
  }

  private shot(): EventCamera {
    this.camera ??= { target: undefined, yaw: 0, roll: 0, rise: 0, distance: 0 }
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

  /**
   * Move the camera's yaw, rise and distance over so many frames.
   *
   * `turn` is which way round the yaw goes, as `322` gives it: `-1` the short
   * way, `0` backwards, anything else forwards. The game works this out by
   * taking both wrapped differences and, for `-1`, the smaller of the two.
   */
  private moveAngle(
    to: { yaw: number; rise: number; distance: number },
    frames: number,
    turn = -1,
  ): void {
    const shot = this.shot()
    const from = { yaw: shot.yaw, rise: shot.rise, distance: shot.distance }
    this.angleMove = {
      from,
      to: { ...to, yaw: turning(from.yaw, to.yaw, turn) },
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
      // **Walk a character over the ground**, `231` and `232` — read from
      // overlay 1, and the pair that tells the movement family apart:
      //
      // | fn | takes | what it does |
      // |---|---|---|
      // | `207` | character, x, y, z, frames | glide to exactly there |
      // | `232` | character, **x, z**, frames | glide there, and **take the height from the ground every frame** |
      // | `231` | character, x, z | the same, at once |
      //
      // `207` and `232` queue the **same command** on the same channel and
      // differ only in a mode word: mode 0 moves all three axes, mode 1 moves
      // x and z and then asks the zone what the floor is under the character
      // and writes that. **There is no y argument** — the y the command
      // carries is the constant `0xa000`, ten, which is only the height the
      // probe starts from.
      //
      // Both take an **optional motion name** which is played when the move
      // ends, and the game's own end-of-move call is made whether or not one
      // was given — with an empty name, which the animation setter ignores.
      //
      // **Ours**: the stage does not hold the world, so it asks
      // {@link groundAt}; without an answer the height is left alone.
      case 231:
      case 232: {
        const actor = this.actor(num(args[0]))
        const x = num(args[1]) * s
        const z = num(args[2]) * s
        const frames = id === 232 ? num(args[3]) : 0
        const after = args.length >= (id === 232 ? 5 : 4) ? text(args[id === 232 ? 4 : 3]) : ''
        actor.placed = true
        actor.onGround = true
        if (after !== '') actor.after = after
        if (frames > 0) {
          actor.walk = {
            from: [actor.x, actor.y, actor.z],
            to: [x, actor.y, z],
            start: this.frame,
            frames,
          }
        } else {
          actor.x = x
          actor.z = z
          actor.walk = undefined
          actor.y = this.groundAt?.(x, z, actor.y) ?? actor.y
        }
        return 1
      }
      // **Move a character to a point**, `211` — read from overlay 1. It
      // queues one of two commands on the character's own queue: with no fifth
      // argument, or one that is not above zero, **opcode 0x10, which sets the
      // position outright**; with one above zero, **opcode 0x11, which works
      // out a velocity of `(there − here) ÷ frames` on the first tick and adds
      // it each frame after**. So the count is frames, as `207`'s is.
      //
      // **It does not turn the character**, which is what tells it from `207`:
      // the queued command holds a point and a count and nothing else.
      case 211: {
        const actor = this.actor(num(args[0]))
        const to = [num(args[1]) * s, num(args[2]) * s, num(args[3]) * s] as const
        const frames = args.length >= 5 ? num(args[4]) : 0
        actor.placed = true
        if (frames > 0) {
          actor.walk = { from: [actor.x, actor.y, actor.z], to, start: this.frame, frames }
        } else {
          actor.x = to[0]
          actor.y = to[1]
          actor.z = to[2]
          actor.walk = undefined
        }
        return 0
      }
      // **Wait for a character's animation to end**, `213` — read from overlay
      // 1. It queues a command of its own on the character's **third** channel
      // — not the one `206`, `207` and the path share — whose handler asks the
      // character's placed model whether its animation has stopped and **holds
      // the channel while it has not**.
      //
      // The game's own hazard, worth knowing: what it asks is set on the one
      // frame an animation goes from playing to stopped and cleared after, so
      // a wait begun *after* the animation ended never ends.
      //
      // **Ours**: the stage does not hold the animations — whoever plays the
      // event does — so it asks {@link motionFrames} how long the motion runs
      // and waits that out. Without an answer the wait is over at once, which
      // is the safe way round. A motion that goes round and round is not
      // waited on at all: it would never end.
      case 213: {
        const actor = this.actor(num(args[0]))
        const frames = actor.motion !== undefined ? this.motionFrames?.(actor.motion) : undefined
        if (frames !== undefined && actor.once) actor.waiting = actor.motionFrom + frames
        return 1
      }
      // **Carry the scene on into another script**, `538` — read from overlay
      // 1, and the head of the worklist for good reason: 95 events call it.
      //
      // It writes one halfword of the scene's own context, `+0x11a`. The VM's
      // step, at the point where a script has run out, looks at that halfword:
      // if a script is waiting there it **copies it into the scene's event id,
      // re-arms the VM and answers "not finished"** instead of ending the
      // scene (`0x021bca68`). The context is kept, so the cast, the camera and
      // the shot carry straight over. That is how a long cutscene is cut into
      // several scripts.
      //
      // The halfword is cleared to 0 when a scene begins and again by the
      // re-arm, so **0 means no chain**. Nothing validates the id.
      case 538:
        this.nextScript = num(args[0]) & 0xffff
        return 1
      // **The second script a trigger carried**, `834` and `810` — read from
      // overlay 1, the other two of `538`'s three. A trigger record holds
      // **two** event ids: the first runs, and the second is parked in the
      // context beside the chain at `+0x11c`. `834` answers whether one is
      // parked — a **1 or 0, not the id** — and `810` moves it into the chain
      // and clears it, so the scene runs on into it.
      case 834: {
        const ref = args[0]
        if (isRef(ref)) thread.write(ref, this.queuedScript ? 1 : 0)
        return 1
      }
      case 810:
        if (this.queuedScript) {
          this.nextScript = this.queuedScript
          this.queuedScript = undefined
        }
        return 1
      // **Put a sprite on the map**, `521`, and **take it off**, `522` — read
      // from overlay 1, an exact create-and-destroy pair over the 32 slots of
      // the sprite manager.
      //
      // `521` takes a name, **finds the first free slot of the 32**, and
      // **hands that slot back through its reference** — which is the whole
      // reason its shape has one. It loads `data/ani/<name>.spr`, adding the
      // suffix only when the name has not got one, builds a four-part record,
      // and stages the sprite's texture into a VRAM partition. Its optional
      // third number picks which of eight allocators to build from, and its
      // optional fourth which partition — **27 by default, which is the very
      // partition `502` and `503` bracket**. Neither is bounds-checked.
      //
      // The name it keeps is the **bare five characters** of the file, or
      // seven where the name holds `_s`, which also sets a flag on the sprite;
      // `522` puts `.spr` back on to find the cached resource again.
      //
      // `522` takes the slot back, gives the cached resource up, empties the
      // slot, and clears any event placement of kind 2 or 6 whose own slot
      // matches. It **does not free** what `521` allocated.
      //
      // **Ours**: this engine draws no map sprites yet, so what a scene put
      // where is kept, and the slot is handed back so a scene can take it off
      // again.
      case 521: {
        const slot = this.freeSprite()
        const ref = args[1]
        // The slot is written first, and the game writes it even where what
        // follows fails — so a failed call still leaves an index behind.
        if (isRef(ref)) thread.write(ref, slot)
        if (slot < 0) return 0
        const name = text(args[0])
        this.sprites.set(slot, {
          file: /\.spr$/i.test(name) ? `data/ani/${name}` : `data/ani/${name}.spr`,
          allocator: args.length >= 3 ? num(args[2]) : 0,
          partition: args.length >= 4 ? num(args[3]) : SPRITE_PARTITION,
        })
        return 1
      }
      case 522: {
        const slot = num(args[0])
        if (slot >= SPRITE_SLOTS) return 0
        if (!this.sprites.delete(slot)) return 0
        return 1
      }
      // **Copy a model into another slot**, `228` — read from overlay 1. It
      // takes the game object out of one slot, makes a shallow copy of it into
      // a fresh `0xac` block, and puts that copy in another slot; both numbers
      // go through the same fold as `233`'s, so a negative one names a monster
      // slot. The copy is then scaled by **`0x10a`** on all three axes and its
      // animation reset.
      //
      // `0x10a` against the `0x1000` the object's own setup uses for 1.0 is
      // **about a fifteenth of its size** — the copy is deliberately tiny. Why
      // was not established, and the scale is not applied here.
      //
      // Its optional third number picks the allocator, and **no script on the
      // cartridge passes one**.
      case 228: {
        const from = monsterSlot(num(args[0]))
        const to = monsterSlot(num(args[1]))
        const model = this.monsters.get(from)
        if (model === undefined) return 0
        this.monsters.set(to, model)
        return 1
      }
      // **Stop the music and put the player back**, `738` — read from overlay
      // 1. It takes no arguments and hands the sequence player to one routine
      // that stops the track, fades to nothing over no frames, frees the
      // player's heap, sets both of its current sequence numbers to −1 and
      // **puts the master volume back to 127**. `737` is the same teardown
      // with a track started after it.
      case 738:
        this.sounds.push({ kind: 'stopMusic', index: 0, frames: 0 })
        this.musicArmed = undefined
        this.volume = SOUND_LOUDEST
        this.volumeRamp = undefined
        return 1
      // **Move the field of view over a count**, `580` — read from overlay 1,
      // and `532`'s other half: the same camera field, the same degrees, the
      // same `0x47/4096`. Where `532` sets it outright, `580` stores a target
      // and a duration that the camera eases over — **and a duration of 0
      // sets it outright too**, by calling `532`'s own setter.
      //
      // The duration is **frames**: the handler multiplies by 33, which is
      // what the game's frame length is initialised to, and the camera's tween
      // counts the same units down. It is truncated to 16 bits, so a count
      // above 1,985 wraps.
      case 580: {
        const to = fovOfHalfDegrees(num(args[0]))
        const frames = num(args[1])
        if (frames > 0) {
          this.fovMove = { from: this.fov ?? DS_VERTICAL_FOV, to, start: this.frame, frames }
        } else {
          this.fov = to
          this.fovMove = undefined
        }
        return 1
      }
      // **Read a story flag by its raw bit**, `600` — read from overlay 1, and
      // `603`'s sibling: the same bank, the same bit reader, **without the
      // displacement**. `603` shifts an id of `0x400` or more by 1,786 bits;
      // `600` does not shift at all.
      //
      // So the two agree below `0x400` and part above it, and **the bits
      // between the two banks can only be reached through `600`** — which the
      // game does use: other code reads raw `0xc02`–`0xc11` as a mask, and
      // sets raw `0x1142` and `0x113a`.
      case 600: {
        const ref = args[1]
        if (isRef(ref)) thread.write(ref, this.flags.has(num(args[0])) ? 1 : 0)
        return 1
      }
      // **Switch a bit of a model's own flag word**, `509` — read from overlay
      // 1. The first number names a game object, folded the way `233`'s and
      // `230`'s are; the second is a **raw 32-bit mask, not a bit index**; the
      // third says set or clear. It is the same word that shows and hides an
      // object (bit 0) and that `556` sets bit 16 of, so `509` can do either
      // by hand. It hands back **0** when the slot is empty.
      case 509: {
        const slot = monsterSlot(num(args[0]))
        const mask = num(args[1])
        const was = this.objectFlags.get(slot) ?? 0
        this.objectFlags.set(slot, num(args[2]) !== 0 ? was | mask : was & ~mask)
        return 1
      }
      // **What a character is holding**, `550` and `556` — read from overlay
      // 1, and the two halves of the equipment-drawing path, which is in the
      // slice.
      //
      // A character owns six objects beside itself, at `12n + 0x13`, `+0x14`,
      // `+0x15`, `+0x1b`, `+0x1c` and `+0x1d`. **`+0x1c` is the weapon** —
      // that is what `556` mounts — and `+0x1d` is INFERRED to be the off
      // hand. `550` shows or hides those last two together, and skips either
      // that has no model.
      //
      // `556` **re-mounts the weapon**: it reads a row of `data/bin/wpnpos.bin`
      // — twelve rows, one a weapon class, each holding **two placements** of
      // a bone, a position and a rotation — and attaches the weapon object to
      // that bone with that offset. Its second number picks which of the two,
      // **INFERRED to be stowed and drawn**: the two halves are built the same
      // and nothing in the code names them. Its first number is an **event
      // placement id**, of kind 0, 4 or 5, and the character it reaches is the
      // placement's own slot.
      //
      // **Ours**: this engine draws the Hero's and Ivor's equipment from the
      // wearer's own record rather than from six object slots, so what a scene
      // asked for is kept against the character.
      case 550: {
        const actor = this.actor(num(args[0]))
        actor.holdingShown = num(args[1]) !== 0
        return 1
      }
      case 556: {
        const actor = this.actor(num(args[0]))
        actor.weaponDrawn = num(args[1]) !== 0
        return 1
      }
      // **Who leads the party**, `598` — read from overlay 1: it hands back
      // one byte, the **first entry of the array of party object indices**,
      // whose count sits beside it. **Ours**: character 0 is the Hero, who
      // leads, so that is the answer.
      case 598: {
        const ref = args[0]
        if (isRef(ref)) thread.write(ref, 0)
        return 1
      }
      // **A byte nothing reads**, `559` — read from overlay 1, and the
      // clearest negative finding of the batch. It writes one byte of the
      // progress block and returns. **The whole cartridge holds two writers
      // and no reader**: this, and a map transition that puts `0xFF` back.
      // Every byte and halfword load that could reach the offset was looked
      // for. So there is nothing to implement, and nothing more to find
      // without the parts of the game this project does not read.
      case 559:
        this.unreadByte_0x490 = num(args[0]) & 0xff
        return 1
      // **Pin the lighting to a time of day**, `588` and `589` — read from
      // overlay 1, two compilations of one routine. `589` takes **no
      // arguments** and reads the clock; `588` is given the index. Both set
      // the lighting manager's time-of-day index and its day clock to the
      // start of that phase — **0, 180, 210, 390 seconds of a 420-second
      // day**, from a table the overlay builds at startup as running sums of
      // `{180, 30, 180, 30}` — and then re-tint every model in the zone that
      // a per-object table says to.
      //
      // **`589` runs once a zone**: a byte on the zone marks it done, and a
      // second call does nothing at all, not even the index. Entering a zone
      // re-arms it. `588` also handles the zones lit the other way, and
      // recomputes more besides.
      //
      // **Ours**: this engine has three times of day where the game has four
      // phases, and re-tints by rebuilding the map. `588`'s index is taken as
      // the time of day; `589` asks for the light to be applied again, which
      // whoever plays the event may act on.
      case 588:
        this.timeOfDay = num(args[0])
        this.relight = true
        return 1
      case 589:
        this.relight = true
        return 1
      // **Stop and start the day clock**, `579` — read from overlay 1.
      // **The sense is inverted**: a 0 starts it, anything else stops it. The
      // one thing that reads the flag is the routine that advances the day,
      // which gives up at once while it is clear.
      case 579:
        this.dayClockRunning = num(args[0]) === 0
        return 1
      // **How big a character is to everything else**, `226` and `227` — read
      // from overlay 1, and the exact shape of `219` and `220` over another
      // field: `226` sets it, `227` eases it over a count. The number is
      // fixed point over 4,096 and reaches `Object3D::radius_`, which starts
      // at 1.0 and which the game uses as a **horizontal half-extent** when it
      // builds a bounding volume — INFERRED from one reader of ninety.
      //
      // Two behaviours worth copying: the value only reaches the model where
      // the character's own cast entry is of kind 1, and **a count of 0 writes
      // nothing at all** rather than setting it.
      case 226: {
        const actor = this.actor(num(args[0]))
        actor.radius = num(args[1])
        actor.radiusMove = undefined
        return 1
      }
      case 227: {
        const actor = this.actor(num(args[0]))
        const frames = num(args[2])
        if (frames <= 0) return 1
        actor.radiusMove = {
          from: actor.radius,
          to: num(args[1]),
          start: this.frame,
          frames,
        }
        return 1
      }
      // **Override which lighting a zone uses**, `548` and `549` — read from
      // overlay 1, the other two of `588`'s family: `548` sets the override to
      // its number and `549` puts it back to none. **`549` reads its one
      // argument and then throws it away**, which is the clearest instance of
      // that on the cartridge.
      case 548:
        this.lightingOverride = num(args[0])
        return 1
      case 549:
        this.lightingOverride = 0
        return 1
      // **Is this one still moving**, `234` — read from overlay 1. It asks the
      // cast member's own model whether its animation has stopped and answers
      // **1 while it is still running**. Kinds without a model answer 1 too.
      //
      // **A sharp edge worth copying**: where the kind *does* carry a model
      // and the model is missing, it writes **nothing at all** and hands back
      // success — so the script's variable keeps whatever it held before.
      case 234: {
        const ref = args[1]
        if (isRef(ref)) thread.write(ref, this.busy(num(args[0])) ? 1 : 0)
        return 1
      }
      // **Show or hide a thing the map placed**, `223` — read from overlay 1,
      // and **it does nothing unless the cast entry is of kind 2**, which is
      // the kind that names a map placement rather than a model. Where it
      // does, it clears or sets one bit of the placement's own word, or shows
      // and hides the object hanging off it.
      case 223:
        this.placedShown.set(num(args[0]), num(args[1]) !== 0)
        return 1
      // **Hang a model on a placement, and take it off**, `239` and `240` —
      // read from overlay 1, a set-and-clear pair over one pointer. The
      // placement's draw puts what is there **before** its own model, so it is
      // an extra thing drawn with it.
      //
      // Note the two numbers are read differently: the first entry is used
      // for its **slot**, the second for its **model**.
      case 239: {
        const model = num(args[1])
        this.hungOnPlacement.set(num(args[0]), model)
        return 1
      }
      case 240:
        this.hungOnPlacement.delete(num(args[0]))
        return 1
      // **The camera follows a character**, `324`, until `325` — read from
      // overlay 1. `324` queues a command that **runs every frame and never
      // ends**: it puts the camera's look-at at the character's position plus
      // the offset it was given, and holds its channel. Only `325` stops it,
      // and all `325` does is clear the character — the command then frees
      // itself on its next frame.
      //
      // It moves **what the camera looks at and not where it is**.
      case 324:
        this.following = {
          actor: num(args[0]),
          offset: [
            args.length >= 2 ? num(args[1]) * s : 0,
            args.length >= 3 ? num(args[2]) * s : 0,
            args.length >= 4 ? num(args[3]) * s : 0,
          ],
        }
        return 1
      case 325:
        this.following = undefined
        return 1
      // **The camera shakes about a fixed eye**, `326` — read from overlay 1,
      // and `317`'s twin: the two handlers are the same instruction for
      // instruction and differ only in which command they queue. `317`'s
      // shakes **the eye and the look-at together**, so the view moves without
      // turning; `326`'s shakes **the look-at alone**, so the view turns about
      // where the camera stands.
      //
      // Both run the same four-frame square wave and both have the same dead
      // decay — the amplitude they apply is taken once and never written
      // again. A count below zero shakes for ever.
      case 326:
        this.shake = {
          amp: [num(args[0]) * s, num(args[1]) * s, num(args[2]) * s],
          frames: num(args[3]),
          started: this.frame + 1,
          // What tells it from `317`: the eye stays where it is.
          turning: true,
        }
        return 1
      // **Three bones instead of two**, `552` — read from overlay 1, and the
      // third of the bone-camera family with `530` and `572`. It fills all
      // three name slots and takes a **fifth number, which is a second object**
      // — resolved exactly as the first is, by the same fold. Each frame the
      // first two bones drive the eye and the look-at as `572`'s do, and the
      // **third drags that second object about**: its position becomes the
      // bone's, and it is turned to face the way it moved.
      case 552:
        this.boneCamera = {
          placement: monsterSlot(num(args[0])),
          eye: text(args[1]),
          at: text(args[2]),
          third: text(args[3]),
          drags: monsterSlot(num(args[4])),
        }
        return 1
      // **Let go of whatever the Hero is on**, `557` — read from overlay 1,
      // and it takes nothing. It clears a bit of the Hero's own flag word,
      // pushes their action state back a step, and resets the object the party
      // array's first entry names. **INFERRED** to be getting off a mount or
      // out of a carrier: the code says only what it clears, and the object it
      // goes through has no name in the cartridge.
      case 557:
        this.riding = false
        return 1
      // **Which way the field is entered**, `583` — read from overlay 1: one
      // byte of the game's own state, `&0xff`. Fifteen places read it, nearly
      // all as a plain yes-or-no gate on the path that enters a map; **one
      // place tells 4, 8 and `0x0c` apart**, so it is not only a flag. What
      // the values mean was not established.
      case 583:
        this.fieldEntry = num(args[0]) & 0xff
        return 1
      // **Hold a zone's own bit**, `591` — read from overlay 1, and **another
      // that reads the other way up**: a 0 sets the bit, anything else clears
      // it, as `536`, `581`, `833` and `735` all do. It sits in a run of zone
      // bytes that the field code sets and clears around loading and drawing.
      // **Nothing in the cartridge was found that reads it.**
      case 591:
        this.zoneBit = num(args[0]) === 0
        return 1
      // **Two render passes of the zone's**, `599` and `805` — read from
      // overlay 1, twins that write **a whole word, not a bit**, to two
      // neighbouring places in the zone. Each is the first thing its pass
      // tests: a zero and the pass is skipped whole. `599`'s draws a pair of
      // models once for each of a list of placements the zone carries, two
      // angles apiece; `805`'s draws a different list.
      case 599:
        this.zonePasses[0] = num(args[0])
        return 1
      case 805:
        this.zonePasses[1] = num(args[0])
        return 1
      // **Read a bit of the progress record in hand**, `602` — read from
      // overlay 1, and the fourth of the `600` family. The bank opens with
      // **five records of 28 bytes**, and one byte of the block says which is
      // in hand; `601` reads that record's bitfield at `+0x03` and `602` its
      // second at `+0x10`, **twelve bytes, 96 bits**. Which record is chosen
      // depends on which of several ranges an id falls in.
      case 601:
      case 602: {
        const ref = args[1]
        const which = `${this.record}:${id === 601 ? 'a' : 'b'}:${num(args[0])}`
        if (isRef(ref)) thread.write(ref, this.recordBits.has(which) ? 1 : 0)
        return 1
      }
      // **The music**, `735`, `736` and `737` — read from overlay 1, the last
      // three of the sound range.
      //
      // **`735` is a gate, and it reads the other way up**: a 0 sets the bit
      // that makes the sound manager's play and fade both **give up at once**,
      // and anything else clears it. So `735(0)` silences the music until
      // `735(1)`, and a `736` in between does nothing.
      //
      // **`736` plays the zone's own tune** and takes nothing: it asks the
      // zone for its id and looks the sequence up — through a table of 47, a
      // pair of substitutions that depend on the time of day, and an override
      // list whose entries each carry **a story flag to test**.
      //
      // **`737` starts a tune on the manager's second player**, after the same
      // whole teardown `738` does. The second player is the one a jingle uses
      // and the one `PlayBGM` clears first, and `737` deliberately leaves the
      // first player's slot empty so a later tune still plays.
      case 735:
        this.musicGated = num(args[0]) === 0
        return 1
      case 736:
        if (!this.musicGated) this.sounds.push({ kind: 'zoneMusic', index: 0 })
        return 1
      case 737:
        this.sounds.push({ kind: 'stopMusic', index: 0, frames: 0 })
        this.sounds.push({ kind: 'jingle', index: num(args[0]) })
        this.volume = SOUND_LOUDEST
        this.volumeRamp = undefined
        return 1
      // **The ending's own block**, `804`, `811`, `812`, `820`, `821`, `822`,
      // `826` and `734` — read from overlay 1, and a real feature rather than
      // a co-occurrence: **the staff roll and the credit cards around it**.
      //
      // The scripts name the files, and the cartridge has them:
      // `chara_sub/horii.pac`, `toriyama.pac`, `sugiyama.pac`, `hino.pac`,
      // `fujisawa.pac`, `ichimura.pac`, a company card and one per language.
      // Each holds a `CHAR`, a `PALT` and a `SCRN` chunk — one full-screen
      // 256-colour picture.
      //
      // | fn | what it does |
      // |---|---|
      // | `734` | re-size the two sound heaps: **non-zero gives the music heap both regions**, zero splits them back, so the ending's theme plays unbroken |
      // | `811` | page in the overlay that holds the staff roll and start its per-frame task — the credits scroll up the bottom screen's own layer |
      // | `812` | stop it and page the overlay back out |
      // | `838` | how long that task has run, in milliseconds, so a script can keep its cards in step with a scroll it does not drive |
      // | `821` | **save the whole display state** — which memory banks are mapped, four layer-control registers, which layers are on. 0 the top screen, 1 the bottom, anything else nothing |
      // | `820` | load a `.pac` and put its picture on the top screen's **fourth layer**, with every other layer and the sprites switched off |
      // | `826` | blank that layer again between cards |
      // | `822` | put the saved state back, so the scene underneath resumes |
      // | `804` | **fog on and off** — and this one is not inferred: the decomp's own C++ makes the very same call. It writes one byte of the lighting manager and two of the hardware's 3D registers |
      //
      // **Ours**: this engine draws one screen and has no layers to take over,
      // so the cards are kept by name and the rest is switched state. `804` is
      // kept too — nothing here fogs yet.
      case 804:
        this.fog = num(args[0]) !== 0
        return 1
      case 811:
        this.staffRoll = { since: this.frame }
        return 1
      case 812:
        this.staffRoll = undefined
        return 1
      case 820:
        this.cards.push(`data/${text(args[0])}`)
        return 1
      case 821:
        this.screenSaved[num(args[0]) === 1 ? 1 : 0] = true
        return 1
      case 822:
        this.screenSaved[num(args[0]) === 1 ? 1 : 0] = false
        return 1
      case 826:
        this.cards.length = 0
        return 1
      case 734:
        this.musicHeapWhole = num(args[0]) !== 0
        return 1
      // **How long the staff roll has run**, `838` — read from overlay 1, and
      // now placed: the stopwatch belongs to the overlay `811` pages in.
      case 838: {
        const ref = args[0]
        const since = this.staffRoll
        if (isRef(ref)) {
          thread.write(ref, since ? Math.round(((this.frame - since.since) * 1000) / 60) : 0)
        }
        return 1
      }
      // **Queue more files for the scene**, `845` — read from overlay 1, and
      // the middle of a set: `506` **opens** a batch, resetting the count;
      // `845` **tops it up**; `507` waits until the loader has them all.
      //
      // **It has a slip in it, and this copies the slip.** Its loop runs from
      // the batch's running count up to the *argument* count, but reads from
      // the first argument each time. So it queues `argc − count` files,
      // reading the **first** `argc − count` arguments and leaving the last
      // `count` read by nothing — and where the batch already holds as many
      // files as this call has arguments, it does nothing whatever.
      case 845: {
        const already = this.queued.length
        for (let i = 0; i < args.length - already; i++) this.queued.push(text(args[i]))
        return 1
      }
      // **Tint a cast member with the zone's light**, `802` — read from
      // overlay 1. It walks the scene's cast for the first one whose own
      // number matches, and sets a bit on it. The cast loader reads that bit
      // when it spawns the model and, where it is set, **rewrites the model's
      // palette colours in place** through the lighting manager's own
      // transform. Nothing else in the cartridge reads it.
      case 802:
        this.tinted.add(num(args[0]))
        return 1
      // **Set the time of day**, `808` — read from overlay 1, one number
      // straight into the game's own `SetTimeOfDay`. **A number of 4 or more
      // does nothing at all**; −1 is not rejected there, and would read a
      // table short — that is the game's, and this refuses it instead.
      case 808: {
        const to = num(args[0])
        if (to >= 0 && to < 4) this.timeOfDay = to
        return 1
      }
      // **A third kind of camera shake**, `803` — read from overlay 1, and not
      // the one `317` and `326` queue. It is a **continuous sine** rather than
      // a square wave: the camera keeps a phase that advances by the frame's
      // length times a speed, looks the sine up in a table, scales it by an
      // amplitude, and **adds the result to the eye's and the look-at's height
      // only**. `803(0)` turns it off.
      //
      // Its second number is kept as a **plain float** with no fixed-point
      // conversion, where the third is scaled by 4,096 — so the two are not
      // the same kind of number, which the shape `(i, f, f)` hides.
      //
      // It reads all three arguments whatever it was given, so a call with one
      // reads past its own arguments; that is the game's, and not copied.
      case 803: {
        if (num(args[0]) === 0) {
          this.sway = undefined
          return 1
        }
        this.sway = { speed: num(args[1]), amp: num(args[2]) * s }
        return 1
      }
      // **Show and hide two of the scene's props**, `809` — read from overlay
      // 1. Its first number says shown or hidden; **its second is optional and
      // a mask**, and no script on the cartridge passes one — so in practice
      // it is always the first prop alone. A mask of 0 and a mask with bit 0
      // both reach that first prop, and bit 1 adds the second.
      case 809: {
        const shown = num(args[0]) !== 0
        const mask = args.length >= 2 ? num(args[1]) : 0
        if (mask === 0 || (mask & 1) !== 0) this.props[0] = shown
        if ((mask & 2) !== 0) this.props[1] = shown
        return 1
      }
      // **Is the cartridge as it should be**, `815` — read from overlay 1, and
      // worth saying plainly: it is an **anti-tamper check**. It writes **1**
      // through its reference before anything else, pages in an overlay whose
      // code is obfuscated, calls three of its entry points through three
      // stubs, and compares each answer against a constant; each stub also
      // bumps a counter by 1, 2 and 3. Only if all three answers match **and**
      // the counter reaches 6 does it go back and write **0**.
      //
      // So **0 is the good answer** and 1 means tampered-with or not checked —
      // and the 1 is written first so that a check which is cut short leaves
      // it. Its second argument is the "really check" switch and must be
      // exactly 1; without it the answer is 0.
      //
      // **Ours**: 0, always. This engine reads the player's own cartridge.
      case 815: {
        const ref = args[0]
        if (isRef(ref)) thread.write(ref, 0)
        return 1
      }
      // **Did the church send us back**, `823` — read from overlay 1. It tests
      // one bit of the game's state and, **where the bit is clear, writes
      // nothing at all** — so the script's own variable keeps whatever it held.
      // Only where it is set does it store, and what it stores is always 1.
      // `819` is the other half: same bit, and it acts where this asks.
      //
      // **Ours**: the bit is never set here, so nothing is written — which is
      // the faithful answer as well as the easy one.
      case 823:
        return 1
      // **Take a thing off and put it back**, `828`, and **wait for the model
      // to catch up**, `829` — read from overlay 1, a set-and-ask pair proved
      // three ways: they are the only two numbers that touch one flag bit, that
      // bit is what lets the rebuild queue run at all, and the node type `829`
      // waits on is the one `828`'s request is built with.
      //
      // `828(who, slot [, back])` **stashes what is in the slot and empties
      // it** when its third number is 0 or missing, and **puts the stash back**
      // when it is not — and only then if the slot is still empty. It then
      // asks for the wearer's model to be rebuilt. `829` answers **1 while
      // that request is still queued**, so a script waits on it.
      //
      // Equipment drawn on a character is in the slice, so this is kept
      // against the wearer rather than merely counted.
      case 828: {
        const who = num(args[0])
        const slot = num(args[1])
        const actor = this.actor(who)
        if (args.length >= 3 && num(args[2]) !== 0) {
          const stashed = actor.stashed.get(slot)
          if (stashed !== undefined) actor.worn.set(slot, stashed)
          actor.stashed.delete(slot)
        } else {
          const worn = actor.worn.get(slot)
          if (worn !== undefined) actor.stashed.set(slot, worn)
          actor.worn.delete(slot)
        }
        this.redressing = true
        return 1
      }
      case 829: {
        const ref = args[0]
        if (isRef(ref)) thread.write(ref, this.redressing ? 1 : 0)
        // The game latches its own answer off once the queue has moved on.
        this.redressing = false
        return 1
      }
      // **A grotto's own request**, `806` — read from overlay 1: one byte of
      // the zone's embedded grotto object, set to 1 and cleared by whatever
      // takes the work off the queue. **Grottoes are not built here**, so
      // this is answered and nothing is done.
      case 806:
        return 1
      // **Fade the scene's light**, `578` — read from overlay 1. The first
      // number is a **multiplier**, `1.0` being normal and `0` black; it is
      // taken as a float, turned into fixed point over 4,096, and handed to
      // the lighting manager. The second is a count of **frames**, which the
      // handler turns into milliseconds by multiplying by the frame's own
      // length — and **0, or no second number at all, sets it outright**.
      //
      // What it reaches is one scale over the scene's two light colours and
      // the horizon's inner and outer colours, each scaled channel by channel;
      // the manager interpolates it in float over the count.
      case 578: {
        const to = num(args[0])
        const frames = args.length >= 2 ? num(args[1]) : 0
        if (frames > 0) {
          this.lightFade = { from: this.lightScale, to, start: this.frame, frames }
        } else {
          this.lightScale = to
          this.lightFade = undefined
        }
        return 1
      }
      // **Recolour a placed model**, `238` — read from overlay 1, and **not a
      // move**: its three numbers are **a colour**, not a place. They are
      // packed as `r | g<<5 | b<<10` — the DS's own BGR555, five bits a
      // channel — and handed to a worker that rebuilds the model's texture
      // palette into a staging buffer and sends that to VRAM. Nothing about
      // the model's position is touched.
      //
      // An **optional fifth number is the way the colour is applied**, kept on
      // the model itself, and there are three:
      //
      // | | |
      // |---|---|
      // | `0`, the default | **add** it to each palette entry, held at 31 |
      // | `1` | **fill**: every entry becomes the colour |
      // | `2` | **multiply** each entry by the colour over 31 |
      //
      // The first number is an **event placement id**, of kind 0, 1, 4, 5 or 6
      // — and it is **not bounds-checked** against the 32 there are. A wrong
      // kind or an empty entry does nothing, and it still hands back success.
      //
      // Where the placement is one of the first four game objects the colour
      // goes to **the whole party member** — the model and twelve object slots
      // beside it, at `id × 12 + 0x13` and up, INFERRED to be what they wear.
      //
      // **Ours**: this engine has no per-model palette recolour, so what a
      // scene asked for is kept.
      case 238: {
        const mode = args.length >= 5 ? num(args[4]) & 0xff : 0
        this.recolours.set(num(args[0]), {
          red: num(args[1]),
          green: num(args[2]),
          blue: num(args[3]),
          how: RECOLOUR[mode] ?? 'unread',
        })
        return 1
      }
      // **Unhang a placed model**, `236` — read from overlay 1: it finds the
      // placement the same way `238` does, with the same kinds and the same
      // missing bounds check, and calls the model's own detach — which clears
      // the two links that hold it in its parent's list of children and sets
      // the bone it hung on to −1. **If it is itself the anchor**, it walks
      // its whole list of children and clears each of them too.
      //
      // Unlike `238` it **hands back 0** on a wrong kind or an empty entry.
      //
      // **Ours**: this engine hangs a character on another's bone by `235`,
      // over the *characters*' numbering — whether that is the same numbering
      // as a placement's was not established — so the detach is recorded and
      // no character is unhung by it.
      case 236:
        this.detached.add(num(args[0]))
        return 1
      // **Take a set of motions off a character**, `230` — read from overlay
      // 1. It reads the character's animation flags and the **name of what it
      // is playing** first, because what comes next clears them; unloads every
      // animation package with the id it is given — **3 when the scene does
      // not say, which is every call on the cartridge** — and then sets the
      // same animation again by name. **If the name no longer resolves it
      // falls back to `stand`.**
      //
      // Its character number goes through the same fold as `233`'s, so a
      // negative one names a monster slot.
      //
      // **Ours**: this engine keys a character's motion packs by file name
      // where the game keys them by a numeric package id, so which pack to
      // take off cannot be told. The id is recorded — and the fallback the
      // game ends with is one this engine already does, since `sceneMotion`
      // resolves an unknown motion to `stand`.
      case 230: {
        const actor = this.actor(monsterSlot(num(args[0])))
        actor.packsDropped.push(args.length >= 2 ? num(args[1]) : PACKAGE_DEFAULT)
        return 1
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
      // **The screens' brightness**, `100` to `122` — read from overlay 1.
      // One block of eighteen, and the whole of it is here.
      //
      // The handlers `111` to `122` are uniform three-instruction stubs,
      // `mov r0,#<type>` into one dispatcher (`0x0215b074`), with **type =
      // fn − 105**; `100`, `101` and `104` to `107` are bespoke handlers that
      // call the same setters directly, and they fill types 0 to 5. So the
      // eighteen types run unbroken while the *numbers* do not — `102`, `103`
      // and `108` to `110` are other features wedged into the range.
      //
      // The type picks one of nine setters: **three screens** — both, the
      // top, the bottom — times **three locking kinds**. Every one takes a
      // frame count and an optional level; an **even type passes 0**, normal,
      // whatever the scene gave, and an **odd type passes the argument**,
      // **−16, black,** by default. The frame count becomes milliseconds
      // (`× 1000/60`) inside the setter, and a count of 0 applies at once.
      //
      // **The lock is real and worth keeping**: `SetAndLock…` writes the
      // level and then a lock byte (`+0x24` top, `+0x25` bottom), and a plain
      // `Set…` **returns without doing anything** while its screen's lock is
      // set. `UnlockAndSet…` clears it first. A scene that locks a screen
      // black and never unlocks it stays black through every later fade.
      case 100:
      case 101:
      case 104:
      case 105:
      case 106:
      case 107:
      case 111:
      case 112:
      case 113:
      case 114:
      case 115:
      case 116:
      case 117:
      case 118:
      case 119:
      case 120:
      case 121:
      case 122: {
        const [screens, kind, takesLevel] = BRIGHTNESS[id] as Brightness
        const level = takesLevel ? (args.length >= 2 ? num(args[1]) : -BRIGHTNESS_BLACK) : 0
        const to = Math.min(1, Math.max(0, -level / BRIGHTNESS_BLACK))
        const frames = num(args[0])
        for (const screen of screens === 'both' ? (['top', 'sub'] as const) : [screens]) {
          if (kind === 'unlock') this.brightnessLocked.delete(screen)
          else if (this.brightnessLocked.has(screen)) continue
          const sub = screen === 'sub'
          const from = sub ? this.subDarkness : this.darkness
          const fade = frames > 0 ? { from, to, start: this.frame, frames } : undefined
          if (sub) {
            this.subDarkening = fade
            if (!fade) this.subDarkness = to
          } else {
            this.darkening = fade
            if (!fade) this.darkness = to
          }
          if (kind === 'lock') this.brightnessLocked.add(screen)
        }
        return 0
      }
      // **What a scene switches on for its own duration**, `568` — read from
      // overlay 1, and the most-wanted number on the cartridge: 309 calls
      // across 476 of the 687 scripts. **It does nothing when it is called.**
      //
      // It is variadic, and ORs every number it is given into a **27-bit flag
      // field** on the scene's context, keeping the top five bits — which are
      // a count of the characters `566` has spawned, so the keeping is
      // load-bearing. It never clears a bit and it never fails.
      //
      // The scene's **setup** reads the field and turns each bit's subsystem
      // off; the scene's **teardown** reads it again and turns them back on.
      // Five bits have readers: `0x01`, `0x02` and `0x08` suppress three
      // subsystems apiece through the game's own flag word — `0x01` and `0x08`
      // being exactly what `536` switches by hand — `0x04` clears a draw flag
      // on the first four game objects and puts it back on the ones the
      // scene's cast does not hold, and `0x20` is what `581` switches.
      // **Bits 6 to 26 have no reader anywhere.**
      //
      // **Ours**: this engine has none of those subsystems, so the mask is
      // gathered and nothing is suppressed. That is the whole of it: the
      // number every scene calls is a scene declaring its switches.
      case 568:
        for (const arg of args) this.sceneFlags |= num(arg) & SCENE_FLAGS
        return 1
      // **Switch a bit of the game's own flag word**, `512` — read from
      // overlay 1. The first number is a **raw 32-bit mask**, not a bit index,
      // and the second says whether to set it or clear it. The word is one of
      // three general subsystem-suppression masks, and a set bit **stops** a
      // subsystem updating; `536` and `833` poke named bits of the same word,
      // and `512` is the script's way at all of them.
      //
      // **Ours**: gathered, as `568`'s is, and nothing suppressed.
      case 512:
        if (num(args[1]) !== 0) this.gameFlags |= num(args[0])
        else this.gameFlags &= ~num(args[0])
        return 1
      // **Named bits of the same flag word `512` pokes**, `536` and `833` —
      // read from overlay 1. `536` takes a **kind** and a switch: kind 0 is
      // bit `0x008`, kind 1 is bit `0x400`. `833` takes the switch alone, for
      // bit `0x800`.
      //
      // **Both read their switch the other way up**: a **0 sets** the bit and
      // anything else clears it. A set bit in this word **suppresses** a
      // subsystem's update, so a 0 means "hold this still" — which is also
      // what `568`'s setup does with the same two bits when a scene declares
      // them, and why the two agree.
      case 536: {
        const mask = num(args[0]) === 0 ? 0x008 : num(args[0]) === 1 ? 0x400 : 0
        if (num(args[1]) === 0) this.gameFlags |= mask
        else this.gameFlags &= ~mask
        return 1
      }
      case 833:
        if (num(args[0]) === 0) this.gameFlags |= 0x800
        else this.gameFlags &= ~0x800
        return 1
      // **A file the scene will want**, `569` — read from overlay 1, and one
      // line of it: `sprintf(context + 0xD8, "data/%s", name)`. It puts a ROM
      // path together in the scene's own buffer, where something later reads
      // it. What reads it was not followed.
      case 569:
        this.queuedPath = `data/${text(args[0])}`
        return 1
      // **Hold the map's placements still**, `581` and `582` — read from
      // overlay 1. `581` sets bit 2 of the placement manager's own word when
      // its number is **0** and clears it otherwise, the same way up as `536`
      // and `833`; it is also exactly what bit `0x20` of `568`'s mask switches
      // when a scene declares it. `582` clears that bit **and** clears bit
      // `0x10000` on every one of the manager's sub-objects.
      //
      // **Ours**: this engine has no such manager, so the switch is kept.
      case 581:
        this.placementsHeld = num(args[0]) === 0
        return 1
      case 582:
        this.placementsHeld = false
        return 1
      // **Let a model's own animation drive the camera**, `572`, and **give
      // the camera back**, `531` — read from overlay 1, a save-and-restore
      // pair joined by one word of the event's state.
      //
      // `572` takes a placement id and **two bone names**: it makes a camera
      // that each frame reads the two bones out of the model's pose and puts
      // its **eye at the first and what it looks at at the second**. The
      // placement must be of kind 1 and hold a model, or the call does nothing
      // at all. The camera it replaces is stashed; `531` puts it back, and
      // takes no arguments whatever. `530` and `552` are the same thing over a
      // monster slot and over three bones.
      //
      // **Ours**: this engine has the models and their poses but no way yet to
      // hand a bone to the camera, so what a scene asked for is kept. Nothing
      // frees the camera in the game either — `587` is what reclaims the heap.
      case 572:
        this.boneCamera = { placement: num(args[0]), eye: text(args[1]), at: text(args[2]) }
        return 1
      case 531:
        this.boneCamera = undefined
        return 1
      // **Empty one of the event's heaps**, `587` — read from overlay 1. The
      // number picks one of eight allocators and rewinds its front pointer to
      // the start of its block, dropping every saved state with it. Nothing is
      // bounds-checked, and heap 0 is the one holding the scene's own
      // character and placement arrays.
      //
      // **Ours**: this engine has no such heaps. Answered, and nothing done.
      case 587:
        return 1
      // **A colour over the screen**, `102` and `103` — read from overlay 1,
      // and not brightness, though they sit in the middle of it.
      //
      // Both write the same small record (`0x02108d5c`): `103` packs its
      // first three numbers into a **halfword at `+0x02`** as `r | g<<5 |
      // b<<10`, which is the DS's own BGR555, and writes `0x1f` at `+0x04`;
      // `102` writes `1` there and no colour at all. Both then write
      // `frames × 1000/60` **milliseconds** at `+0x08` — the same conversion
      // the brightness setters do — and `1` at `+0x00`.
      //
      // **INFERRED, and not acted on**: `+0x04` looks like the blend
      // coefficient the DS takes over 0 to 31, which would make `103` a fade
      // *to* the colour and `102` a fade back *from* it — `102` writing no
      // colour fits that. **What reads the record was not found**: nothing
      // else in the ARM9 holds its address, so it is reached some other way.
      // So what is kept here is exactly what the two write, and no more.
      //
      // Note the packing masks nothing: a component above 31 runs into the
      // next channel. That is the game's.
      case 102:
      case 103:
        this.tint = {
          ...(id === 103 ? { red: num(args[0]), green: num(args[1]), blue: num(args[2]) } : {}),
          coefficient: id === 103 ? TINT_WHOLE : 1,
          frames: num(args[id === 103 ? 3 : 0]),
          start: this.frame,
        }
        return 0
      // **Which screen the main engine drives**, `108`, `109` and `110` — read
      // from overlay 1, and nothing to do with the brightness they sit among.
      // All three write **bit 15 of `POWCNT1`** (`0x04000304`), the DS's
      // display swap: `109` sets it, `110` clears it, and `108` reads it and
      // writes the opposite.
      //
      // **Ours**: this engine draws one screen, so which one the hardware
      // would put it on is kept and not acted on.
      case 108:
        this.screensSwapped = !this.screensSwapped
        return 0
      case 109:
        this.screensSwapped = false
        return 0
      case 110:
        this.screensSwapped = true
        return 0
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
        this.handingBack = undefined
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
      // **Move what the camera looks at and how it is framed together**, `322`
      // — read from overlay 1. The game queues two commands on two of the
      // camera's queues at once: one that moves the look-at point to the first
      // three numbers, and one that moves the orbit — yaw, height above the
      // point, and distance from it — to the next three, both over the seventh.
      //
      // **It is not two points.** `304` is: its first triple is the eye. `322`
      // hands its first command a zero eye, and that zero never shows, because
      // the command sets the flag that makes the camera work its eye back out
      // of the point and the orbit at the end of the frame.
      //
      // **The angles are radians**, in fixed point: the yaw is wrapped modulo
      // `0x6488`, which is 2π × 4096. The eighth number is which way round the
      // yaw turns — `-1`, the short way, when the scene does not say.
      case 322: {
        const target: Vec3 = [num(args[0]) * s, num(args[1]) * s, num(args[2]) * s]
        const frames = num(args[6])
        this.moveTarget(target, frames)
        this.moveAngle(
          { yaw: num(args[3]), rise: num(args[4]) * s, distance: num(args[5]) * s },
          frames,
          args.length >= 8 ? num(args[7]) : -1,
        )
        return 0
      }
      // **Give the camera back**, `328` — read from overlay 1. The game asks
      // the camera for the eye and look-at point its idle placement would
      // have, and queues a move to them over the count it is given.
      //
      // **Ours**: the field camera is that idle placement, and this engine
      // cannot ask it where it will be in `n` frames' time — it follows the
      // Hero. So the shot is held where it is and handed back when the count
      // runs out, which is `300` after a wait rather than a move.
      case 328:
        this.handingBack = { at: this.frame + Math.max(1, num(args[0])) }
        return 0
      // **Roll the camera**, `327` — read from overlay 1. The number is an
      // angle in **degrees**: it is turned into radians by the same
      // `0x47/4096` the field of view uses, wrapped to a turn, and written to
      // the camera's `+0x7c`, which the view matrix reads. When it is zero the
      // matrix takes the world's up straight; when it is not, it **rotates the
      // world's up about the view's own axis** before building the frame. So
      // this is a bank — a Dutch angle — and not a turn.
      //
      // Writing it also **zeroes the two halfwords that animate it**, so a
      // roll under way is stopped dead by a new one.
      //
      // It is a second function converting degrees the same way, which is the
      // strongest evidence yet that the engine's own angles are radians.
      case 327:
        this.shot().roll = wrapTurn(num(args[0]) * DEGREE_IN_RADIANS)
        return 0
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
          this.targetMove !== undefined ||
          this.angleMove !== undefined ||
          this.shake !== undefined ||
          this.handingBack !== undefined
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
      // **Show a message**, `400` — read from overlay 1, which confirms the
      // earlier reading and adds three things to it.
      //
      // The number is a **key looked up linearly** in the event's text list,
      // not an offset, and **an unknown key shows nothing and hands back 0**.
      // A **raw string** (tag 2) is taken in its place, and used as the text
      // directly. And there is an **optional second number whose bit 0 alone
      // is read**, inverted, as the show routine's third argument.
      //
      // **It is also what resets the caption preset**: `func_0204500c` clears
      // the whole flag byte, zeroes the fade, and puts the window frame and
      // the message sound back on. So `409` to `414` are a scene's word about
      // *this* message and are gone by the next one — see them below.
      case 400:
        this.message = num(args[0])
        this.shown.push(this.message)
        this.caption = { ...CAPTION_PLAIN }
        return 0
      // **Close the message**, `401` — read from overlay 1: it zeroes the
      // message's state and its "a message is up" word (`func_02043124`) and
      // then tears the window down (`func_02043204`).
      case 401:
        this.message = undefined
        return 0
      case 405: {
        const ref = args[0]
        if (isRef(ref)) thread.write(ref, this.message === undefined ? 0 : 1)
        return 0
      }
      // **The message window's other knobs**, `402` to `404` and `417` to
      // `421` — read from overlay 1. All eight reach the same one window as
      // the caption block below, and all eight are one or two stores or one
      // read apiece. **What the bytes mean is not established**, so they are
      // carried by their offsets, as opaque bytes, rather than named.
      //
      // | fn | what it does |
      // |---|---|
      // | 402 | reads the byte `+0x19b4` into a reference |
      // | 403 | reads the word `+0x9a0` — the message's own state, which `401` and the end-of-text code both zero |
      // | 404 | reads **the byte at the window's current text pointer** (`*(u8*)win[0x58]`) |
      // | 417 | writes `+0x19c0 = 1` and `+0x195d = 0x1e` |
      // | 418 | writes its number to the byte `+0x19ae` |
      // | 419 | writes `+0x19ca = 0` |
      // | 420 | writes `+0x19cb` as a boolean of its number |
      // | 421 | writes `+0x19c1 = 1` |
      //
      // **Ours**: the three readers answer **0**, which is the safe way round
      // for each of them — an idle state, and a zero byte for the end of the
      // text — so a scene polling one carries on rather than spinning. The
      // five writers are kept in {@link window}.
      case 402:
      case 403:
      case 404: {
        const ref = args[0]
        if (isRef(ref)) thread.write(ref, 0)
        return 0
      }
      case 417:
        this.window.unknown_0x19c0 = 1
        this.window.unknown_0x195d = 0x1e
        return 1
      case 418:
        this.window.unknown_0x19ae = num(args[0]) & 0xff
        return 1
      case 419:
        this.window.unknown_0x19ca = 0
        return 1
      case 420:
        this.window.unknown_0x19cb = num(args[0]) !== 0 ? 1 : 0
        return 1
      case 421:
        this.window.unknown_0x19c1 = 1
        return 1
      // **Show the message as a caption over the scene**, `409` to `414` —
      // read from overlay 1. Six numbers that always travel together, and the
      // code says why: every one writes a field of **the one message window**
      // (`*(u32*)(0x02107800 + 0x1c)`), and every field they write is one that
      // `400`'s show routine has just reset. So they are a scene's word about
      // the message `400` has started, and the next `400` undoes them.
      //
      // | fn | what it writes | what that does |
      // |---|---|---|
      // | 410 | `+0x19b1 = 0` | **no window box** — and with it, the per-frame reset of the box's geometry stops |
      // | 411 | flags `\|= 0x40` | **centre the text**: each frame it counts the lines, and puts the block at `(192 − (lines−1)×20 − 8) ÷ 2 − 16` instead of the box's own 116 |
      // | 414 | flags `\|= 0x80` | **outline the glyphs**: four passes in colour 1 at the four neighbours of (2,2), then the glyph in colour 15 |
      // | 412 | flags `\|= 0x02` | **shadow them** instead: one pass at (2,2) in colour 1, the glyph at (1,1) |
      // | 413 | `+0x19b2 = 0` | **silent** — no sound as the text types |
      // | 409 | `+0x19a8 = n`, flags `\|= 0x04` | **time it**: a second of hardware alpha in, `n` frames of hold, a second out, with the message tick frozen throughout |
      //
      // **Two of them are mechanically forced together**, which is why the
      // co-occurrence is total: without `410` the window's geometry is rewritten
      // to the bottom box every frame, so `411`'s centring never survives; and
      // the outline of `414` exists so that text reads over scenery, which is
      // only needed once the box is gone.
      //
      // The game has the same preset written out by hand in C++ in four
      // places, each straight after the show routine — overlays 17, 25 and 26.
      // These six are the event VM's way of saying it.
      //
      // **Ours**: kept and not drawn — this engine draws a message one way.
      // `409`'s ramp is a second either side because the engine steps a
      // `0x1f0000` level by `0x8444` a frame, and those divide to exactly 60.
      case 409:
        this.caption = { ...this.shown9(), hold: num(args[0]) }
        return 0
      case 410:
        this.caption = { ...this.shown9(), framed: false }
        return 0
      case 411:
        this.caption = { ...this.shown9(), centred: true }
        return 0
      case 412:
        this.caption = { ...this.shown9(), glyphs: 'shadow' }
        return 0
      case 413:
        this.caption = { ...this.shown9(), silent: true }
        return 0
      case 414:
        this.caption = { ...this.shown9(), glyphs: 'outline' }
        return 0
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
      // **Arm a tune**, `713`, and **start it**, `714` — read from overlay 1,
      // and the code makes them one feature.
      //
      // `713` hands its number to the sound manager's play routine, which
      // **loads** the sequence and its bank into the sound heap, starts it and
      // registers it as the current tune — and then `713` **stops the player
      // dead** with a fade of no frames. So the tune is resident and silent.
      // `714` takes no arguments at all and **restarts whatever is
      // registered** — there is no load anywhere in its path — and slams the
      // master volume to 127 with no ramp. One arms, the other goes.
      //
      // `713` takes the number either as its only argument or as its **second
      // of two, the first being read and thrown away**; a negative number, or
      // any other count of arguments, makes it fail. Zero is allowed and means
      // no tune.
      case 713: {
        const n = args.length === 2 ? num(args[1]) : args.length === 1 ? num(args[0]) : -1
        if (n < 0) return 0
        this.musicArmed = n
        return 1
      }
      case 714:
        if (this.musicArmed !== undefined) {
          this.sounds.push({ kind: 'music', index: this.musicArmed })
        }
        this.volume = SOUND_LOUDEST
        this.volumeRamp = undefined
        return 1
      // **The sound functions the cartridge does nothing for**, `716` to `719`
      // and `724` — four more of the same two instructions as `703` to `709`,
      // `mov r0,#1; bx lr`. Twelve inert numbers in the sound range altogether.
      case 716:
      case 717:
      case 718:
      case 719:
      case 724:
        return 1
      // **Is the jingle still going**, `725` — read from overlay 1. It answers
      // 1 while `720`'s jingle is **either still waiting to start** (the
      // manager keeps a latch for it) **or still sounding** (at least one live
      // allocation is playing its sequence), and 0 once its number is back to
      // −1 or the sequence has run out.
      //
      // **Ours**: nothing here can say, so the answer is {@link jingleBusy},
      // which is **no** until whoever plays the event says otherwise. That is
      // the safe way round: a scene waiting on it carries on rather than
      // spinning for ever.
      case 725: {
        const ref = args[0]
        if (isRef(ref)) thread.write(ref, this.jingleBusy ? 1 : 0)
        return 0
      }
      // **Is a wireless session up**, `801` — read from overlay 1. It asks one
      // global object whether its state word is not zero, and stores 1 or 0
      // through the reference. The object is started and stopped from four
      // places in two overlays, and **INFERRED** to be the wireless manager:
      // the module around it compares six consecutive bytes against a table of
      // records, builds a 21-byte name with `"unknown"` for a default, and
      // waits on a state word whose 1, 2, 8, 9 and 10 match the DS's own
      // wireless states. No symbol or string names it.
      //
      // **Ours**: multiplayer is not built here, so the answer is always 0 —
      // which is the same answer the cartridge gives a player who is alone.
      case 801: {
        const ref = args[0]
        if (isRef(ref)) thread.write(ref, this.wireless ? 1 : 0)
        return 0
      }
      // **Fade the music out**, `721` — read from overlay 1. It takes a frame
      // count, **30 when the scene does not give one**, and hands it to the
      // sound manager, which ramps whichever of its two sequence players is
      // live down to silence over that many ticks and marks it stopping. A
      // count of zero stops it outright rather than fading.
      case 721:
        this.sounds.push({
          kind: 'stopMusic',
          index: 0,
          frames: args.length >= 1 ? num(args[0]) : BGM_FADE_FRAMES,
        })
        return 0
      // **How loud the sound is**, `715` — read from overlay 1. The number is
      // **clamped to 0..127** and kept as the script's own level, which the
      // manager then scales by the player's 1-to-5 sound setting before it
      // reaches the mixer; the second number is how many ticks to ramp over,
      // and zero is at once.
      //
      // **Ours**: the player's setting is not kept here, so what is held is
      // the script's level unscaled. Nothing here sounds it yet.
      case 715: {
        const to = Math.min(SOUND_LOUDEST, Math.max(0, num(args[0])))
        const frames = args.length >= 2 ? num(args[1]) : 0
        if (frames > 0) {
          this.volumeRamp = { from: this.volume, to, start: this.frame, frames }
        } else {
          this.volume = to
          this.volumeRamp = undefined
        }
        return 0
      }
      // **The sound functions the cartridge does nothing for**, `703` to `709`
      // — read from overlay 1. All seven are the same two instructions,
      // `mov r0,#1; bx lr`: they take no arguments, read nothing, write
      // nothing and hand back the success every other handler hands back.
      //
      // There is nothing to implement and nothing more to find: whatever they
      // were for was taken out before this build. They are answered, not
      // counted, so they leave the worklist for good.
      case 703:
      case 704:
      case 705:
      case 706:
      case 707:
      case 708:
      case 709:
        return 1
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
      // **Which choice was picked**, `558` — read from overlay 1. It reads one
      // field of the message window and stores it through the reference it is
      // handed. That field is the highlighted option: the d-pad handler walks
      // it up and down, wrapping against the option count beside it, and the
      // code that builds a two-option prompt sets it to a default the moment
      // the prompt goes up. It is **0-based**, and the handler checks nothing.
      //
      // **Ours**: no choice window is drawn here, so the answer is
      // {@link choice}, which is the first option until whoever plays the
      // event says otherwise.
      case 558: {
        const ref = args[0]
        if (isRef(ref)) thread.write(ref, this.choice)
        return 0
      }
      // **Read one of the game's story flags**, `603` — read from overlay 1.
      // The number indexes a bitfield, and **ids from `0x400` up are shifted
      // by 1786 bits** into a second range of it; nothing is bounds-checked.
      // What comes back is **1 or 0**, stored through the reference — and the
      // store writes only the four-byte value of the thing referred to and
      // leaves its tag as it was.
      //
      // **Ours**: nothing here sets these flags, so a scene that asks finds
      // them clear unless whoever plays the event has filled {@link flags}.
      case 603: {
        const ref = args[1]
        if (isRef(ref)) thread.write(ref, this.flags.has(storyBit(num(args[0]))) ? 1 : 0)
        return 0
      }
      // **Put a monster's model in a game-object slot**, `233` — read from
      // overlay 1. It takes a name and a slot: the name is looked up in
      // `data/pack_lv5/enemy.gp2`, the first `.cchr` of the archive it finds
      // is decompressed and loaded as a model, and that model goes into the
      // game's own object table at the slot. **A negative slot maps to
      // `-slot + 0x9f`**, so `-1` is `0xa0` and `-0x20` is `0xbf` — which is
      // the range every scene uses. The model is scaled by `0x10a` on all
      // three axes and set to animation 0; whatever was in the slot is
      // overwritten rather than freed. A third number picks which allocator.
      //
      // **Ours**: the model is named and kept against its slot. The `0x10a`
      // scale is not applied — the base its fixed point is in was not
      // established, and it is not the `0x1000` the neighbouring code uses.
      case 233: {
        const name = text(args[0])
        if (name === '') return 0
        this.monsters.set(monsterSlot(num(args[1])), name)
        return 0
      }
      // **Begin the scripted battle**, `547` — read from overlay 1. The first
      // number is a placement id whose entry must be of kind 1 and hold a
      // model: that model is made visible, flagged, and becomes the
      // transition's foreground — **a wrong kind or an empty entry makes the
      // whole call do nothing**. The second is a record index into
      // `data/event/eventbattle.bin`, which picks the battle and, from `+0x0e`
      // of its record, the music; **`-1` when the scene gives only one
      // number**, which skips the lookup and plays sequence `0x17`. The
      // transition then blacks both screens and snaps the volume back to whole.
      //
      // **Ours**: no battle begins from a scene yet, so what it asked for is
      // kept for whoever plays the event to act on.
      case 547:
        this.battleFrom = {
          placement: num(args[0]),
          battle: args.length >= 2 ? num(args[1]) : -1,
        }
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
      // Each is handed references to fill. The numbers are fixed point over
      // 4,096 — **radians**, as `fix32ReduceAngle0To2Pi` settles; only `532`'s
      // field of view is in degrees, and it converts them itself.
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
      // **Show or hide a thing the map has placed**, `574` — read from overlay
      // 1. The two numbers find a record: the first is a group key on a linked
      // list of the map's placements, the second a 16-bit id within the
      // group's own array of `0x70`-byte records. The third **clears bit 2 of
      // the record's flags when it is not zero and sets it when it is**, and
      // bit 2 is what the draw path tests to skip a record — so a third
      // argument of zero hides it and anything else shows it.
      //
      // Its neighbours settle the record: `575` writes a position at `+0x08`,
      // `577` another vector at `+0x14`, `576` a halfword at `+0x06`.
      //
      // **Ours**: this engine draws no map placements yet — as with `540`'s
      // doors — so which ones a scene has hidden is what is kept.
      case 574:
        this.placed(args).hidden = num(args[2]) === 0
        return 0
      // **Move, turn and size a thing the map placed**, `575`, `576` and `577`
      // — read from overlay 1, the same three siblings of `574`. Each finds
      // the record the same way, by group key and `u16` id, and then writes:
      //
      // | fn | handed | where it lands |
      // |---|---|---|
      // | 575 | group, object, x, y, z | fixed-point position, record `+0x08` |
      // | 576 | group, object, n | one fixed-point number, truncated to a halfword at `+0x06` |
      // | 577 | group, object, x, y, z | a second fixed-point vector, record `+0x14` |
      //
      // The numbers are floats × 4,096, so a scene may hand them either way.
      // **What `+0x14` and `+0x06` mean was not established** — `+0x08` is the
      // position because `540`'s door code moves a door by writing it, and the
      // other two are carried as the scene gave them.
      //
      // **Ours**: nothing draws map placements yet, as with `540`'s doors.
      case 575: {
        const at = this.placed(args)
        at.position = [num(args[2]) * s, num(args[3]) * s, num(args[4]) * s]
        return 0
      }
      case 576:
        this.placed(args).half = Math.trunc(num(args[2]))
        return 0
      case 577: {
        const at = this.placed(args)
        at.vector = [num(args[2]) * s, num(args[3]) * s, num(args[4]) * s]
        return 0
      }
      // **Take a placed sprite away**, `573` — read from overlay 1, the exact
      // inverse of `521`, which builds one: `521` loads `data/ani/<name>.spr`
      // and registers it in the map's placement manager, and `573` gives the
      // cached resource back, destroys the model if one was made instead, and
      // empties the slot. It takes the placement id, and **the placement table
      // has 32 entries with no check that the id is among them**.
      //
      // **Its second argument is read by nothing**: the handler calls the
      // argument reader exactly once. The `ii` shape hands it a number that
      // goes nowhere. (Nor is `521` implemented here, so there is nothing yet
      // for this to undo.)
      case 573:
        this.spritesDropped.add(num(args[0]))
        return 0
      // **The lowest ten numbers are the player's own input, and a little
      // arithmetic** — read from overlay 1. `0` to `7`, with `8` and `9` below.
      //
      // | fn | handed | what it does |
      // |---|---|---|
      // | 0 | reference | **how many of the four face buttons are held**, 0 to 4 — it adds the four tests together |
      // | 1 | mask, reference | whether the buttons in the mask were **newly pressed**: held now and not held last frame |
      // | 2 | reference | a flag of the input object and a count of its below ten, ANDed — **what the two fields are was not established** |
      // | 3 | flag | switches something of the loader's on or off, by two calls that differ only in which |
      // | 4, 5 | float, reference | one number of maths apiece, answered as a **float** — **INFERRED** a sine and a cosine, from the shape: one double in, one out |
      // | 6 | float, float, reference | two numbers in, one float out — **INFERRED** an arc tangent |
      // | 7 | low, high, reference | **a random number from low to high, both ends included** — `NextRandomBetween` over the battle's own generator |
      //
      // The four buttons `0` counts are the ones the DS numbers `0x0001`,
      // `0x0002`, `0x0400` and `0x0800`.
      //
      // **Ours**: nothing here presses a button during a scene unless whoever
      // plays it says so, so `0`, `1` and `2` answer from {@link held},
      // {@link pressed} and {@link touching}, all of which start empty. **A
      // scene that waits for a press will wait**, which is what the game does
      // too — one scene on the cartridge does exactly that. The maths is not
      // answered, because guessing which function it is would be inventing.
      case 0: {
        const ref = args[0]
        if (isRef(ref)) {
          let count = 0
          for (const button of FACE_BUTTONS) if ((this.held & button) !== 0) count++
          thread.write(ref, count)
        }
        return 1
      }
      case 1: {
        const ref = args[1]
        if (isRef(ref)) thread.write(ref, (this.pressed & num(args[0])) !== 0 ? 1 : 0)
        return 1
      }
      case 2: {
        const ref = args[0]
        if (isRef(ref)) thread.write(ref, this.touching ? 1 : 0)
        return 1
      }
      case 7: {
        const ref = args[2]
        const low = num(args[0])
        const high = num(args[1])
        if (isRef(ref)) thread.write(ref, low + this.random(high - low + 1))
        return 1
      }
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
  private run: EventRun
  private going = true
  /** How to fetch a script a scene chains into — see `538`. */
  private readonly load: ((id: number) => Script | undefined) | undefined
  /** Which scripts have run, in order: the first, then whatever `538` chained. */
  readonly chain: number[] = []

  constructor(
    script: Script,
    scale: number,
    hero?: { readonly x: number; readonly y: number; readonly z: number; readonly facing: number },
    load?: (id: number) => Script | undefined,
  ) {
    this.stage = new EventStage(scale)
    if (hero) Object.assign(this.stage.actor(0), hero, { placed: true })
    this.run = new EventRun(script, this.stage.host)
    this.load = load
  }

  get finished(): boolean {
    return !this.going
  }

  /** One frame: what is moving moves, then the script runs to its next wait. False once it has ended. */
  tick(): boolean {
    if (!this.going) return false
    this.stage.advance()
    this.going = this.run.step()
    if (!this.going) this.going = this.chainOn()
    return this.going
  }

  /**
   * **A scene carrying on into another script** — the game's `538`.
   *
   * When the VM's step runs out, the game looks at the scene context's
   * `+0x11a`; if a script is waiting there it copies it into the scene's own
   * event id, re-arms the VM and **answers "not finished"** instead of ending
   * the scene. The context is kept — so the cast, the camera and everything
   * else carry straight over, which is the whole point.
   *
   * This does the same, with whatever script loader it was given. Without one
   * a chain simply ends the scene, which is what happened before this was read.
   */
  private chainOn(): boolean {
    const next = this.stage.nextScript
    this.stage.nextScript = undefined
    if (next === undefined || next === 0 || !this.load) return false
    const script = this.load(next)
    if (!script) return false
    this.chain.push(next)
    this.run = new EventRun(script, this.stage.host)
    return true
  }

  /** The message on show has been read. */
  dismiss(): void {
    this.stage.message = undefined
  }
}
