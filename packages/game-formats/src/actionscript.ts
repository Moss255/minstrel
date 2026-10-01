import { readDataTable, type TableRecord } from './table.ts'

/**
 * **A battle action script** — a `.bact`: what a fighter, a spell, a skill or
 * an item *shows* while its action is carried out. Read from the game's code
 * on 1 October 2026 (USA release; FORMAT.md, "The action scripts").
 *
 * A `.bact` is a tagged data table the game runs once, as a script, through
 * the decomp's `Script` (`func_ov000_0216d1c4`): each record's tag picks a
 * builder from overlay 0's table at `0x02183b5c`, and the builder turns the
 * record's values into a **command** of the same number, appended to the
 * section being filled (`func_ov000_02169b78`). The battle then plays a
 * section's commands one at a time (overlay 25, `func_ov025_021e9778`).
 *
 * - **Sections.** `1 k…` opens one keyed by action numbers — any key 1 adds 2
 *   and 219 (`func_ov000_02169bf0`) — and `16` opens one keyed exactly
 *   {1, 2, 219}, the blow files' opening (`0x0216a438`). `2` and `17` build
 *   nothing: a section runs on to the next `1` or `16`. A command with no
 *   section open is built and dropped (`0x02169b88`).
 * - **Values the record lacks are stale, not zero.** `Script` fills only as
 *   many parameters as the record carries and keeps the rest from earlier
 *   records (`Script::ExecuteSingleInstruction`, `src/Resource/Script.cpp`);
 *   a builder reading past them reads the last record's. Bare `10` and `26`
 *   rely on it. So each builder here is handed the same 128-value buffer the
 *   game's is.
 *
 * Every builder below is cited by its overlay 0 address and takes its values
 * as the game's does — `ToInt` truncates a float, `ToFloat` converts an int, a
 * string reads as 0 or nothing. A tag whose builder has not been read is kept
 * as {@link UnreadCommand}, its values carried, not guessed at.
 */
export interface ActionScript {
  readonly sections: readonly ActionSection[]
}

export interface ActionSection {
  /** The action numbers it plays for; empty for a section opened by a bare `1`. */
  readonly keys: readonly number[]
  readonly commands: readonly ActionCommand[]
}

/** A value as the game's `Script::Parameter` holds it: a string, an int or a float. */
export type ScriptValue =
  | { readonly type: 'string'; readonly text: string | undefined }
  | { readonly type: 'int'; readonly int: number }
  | { readonly type: 'float'; readonly float: number }

/**
 * **Who** a command acts on — a number the battle resolves to fighters and
 * objects (`func_ov000_021820bc`, the table at `0x0218409c`; FORMAT.md, "Who a
 * command acts on"). The ones the scripts lean on: 7 the one acting, 15 the
 * first acted on, 23 all who act, 24 all acted on, 4 everyone, 25 the camera,
 * 26–33 the effect slots, 34 the actor's weapon (INFERRED).
 */
export type Who = number

/** A position or a turn, as three floats. */
export type Vec3 = readonly [number, number, number]

export type ActionCommand =
  // ── The run ──────────────────────────────────────────────────────────────
  /** `8 ms [hold]` — wait (`0x0216a1a4`). `hold` ≠ 0 also keeps `ms` for the battle's state-6 hold. */
  | { readonly tag: 8; readonly ms: number; readonly hold: number }
  /** `9 id type v…` — skip to `10 id` when the condition holds (`0x0216a208`). */
  | {
      readonly tag: 9
      readonly id: number
      readonly type: number
      /** The first float given, the gap tests' bound; 0 when none. */
      readonly bound: number
      /** The ints after the type, in order. */
      readonly ints: readonly number[]
    }
  /** `10 id` — where a skip ends (`0x0216a300`); an id of 0 builds nothing. */
  | { readonly tag: 10; readonly id: number }
  /** `11` — the end (`0x0216a350`). */
  | { readonly tag: 11 }
  /** `31` — done for this frame (`0x0216ac68`). */
  | { readonly tag: 31 }
  // ── Motions, moves and who is seen ────────────────────────────────────────
  /** `3 [who] "name" [flags] [fx]` — play a motion (`0x02169d08`). */
  | {
      readonly tag: 3
      readonly who: Who
      readonly name: string
      /** `Object3D::MaybeSetRegularAnimation`'s flags: 1 once and held (the default), 0 loop, 8 restart, 0x10 blend. */
      readonly flags: number
      /** Bit 0: no magic sound; bit 1: no dimming of the scene. */
      readonly fx: number
    }
  /** `5 from to gap` — the lunge (`0x02169e80`): fractions of the current motion, and the gap left. */
  | { readonly tag: 5; readonly from: number; readonly to: number; readonly gap: number }
  /** `7` — every target's reaction with the defaults: `61` then `62` (`0x0216a018`). */
  | { readonly tag: 7 }
  /** `22 who show` — show or hide (`0x0216a8d8`). */
  | { readonly tag: 22; readonly who: Who; readonly show: boolean }
  /** `24` — the one acting turns to face the first target (`0x0216a948`). */
  | { readonly tag: 24 }
  /** `25 effect speed` — fly an effect at the target and wait (`0x0216a95c`); the id is the value + 100. */
  | { readonly tag: 25; readonly effect: number; readonly speed: number }
  /** `26 [who] [point]` — wait for a motion to be so far through, 1 its end (`0x0216a9dc`). */
  | { readonly tag: 26; readonly who: Who; readonly point: number }
  /** `33 who "pack"` — give fighters a motion pack, already loaded (`0x0216ac90`). */
  | { readonly tag: 33; readonly who: Who; readonly path: string }
  /** `47 who alpha ms` — fade to an alpha, 0–31 (`0x0216b204`). */
  | { readonly tag: 47; readonly who: Who; readonly alpha: number; readonly ms: number }
  /** `76 who` — end a palette effect (`0x0216bc00`). */
  | { readonly tag: 76; readonly who: Who }
  /** `77 gap` — step in toward the first target, waited on (`0x0216bc54`). */
  | { readonly tag: 77; readonly gap: number }
  /** `79 mode [who] [face]` — the formation: 0 the rows, 1 the grid, 2 two squared up, 3 a group to its places (`0x0216bcf0`). */
  | { readonly tag: 79; readonly mode: number; readonly who: Who; readonly face: boolean }
  /** `85` — wait for the caster's motion: 70% through for the party, its end for a monster (`0x0216be58`). */
  | { readonly tag: 85 }
  /** `91 who parent ["bone"]` — attach (`0x0216c144`). */
  | { readonly tag: 91; readonly who: Who; readonly parent: Who; readonly bone: string | undefined }
  /** `92 who` — detach (`0x0216c1ec`). */
  | { readonly tag: 92; readonly who: Who }
  /** `140 who degrees` — set a facing at once (`0x0216d110`). */
  | { readonly tag: 140; readonly who: Who; readonly radians: number }
  // ── Files and effects ────────────────────────────────────────────────────
  /** `18 "path"` — queue a file under `data/` (`0x0216a4c8`); `.pac` is read as `.chr`. */
  | { readonly tag: 18; readonly path: string }
  /** `19` — wait for the queued files (`0x0216a55c`). */
  | { readonly tag: 19 }
  /** `20 id "path"` — register a loaded file as effect `id` (`0x0216a570`); −1 the next free from 100. */
  | { readonly tag: 20; readonly id: number; readonly path: string }
  /** `21 id slot "motion" [flags] [overlay]` — play effect `id` on the one acting, into a slot (`0x0216a68c`). */
  | {
      readonly tag: 21
      readonly id: number
      /** The slot, 0–15: the value less 26. */
      readonly slot: number
      readonly motion: string
      /** 1 once (the default), 0 loop. */
      readonly flags: number
      /** Drawn in the later, screen-fixed pass, unattached, at half scale. */
      readonly overlay: boolean
    }
  /** `29 n` — queue effect file `n` (`0x0216ab74`). */
  | { readonly tag: 29; readonly number: number }
  /** `30 [id] n` — register effect file `n` as `id`, −1 the next free (`0x0216abc4`). */
  | { readonly tag: 30; readonly id: number; readonly number: number }
  /** `40 slot` — remove the effect in a slot (`0x0216ae1c`). */
  | { readonly tag: 40; readonly slot: number }
  /** `41 slot who` — attach a slot's effect to someone; nobody detaches it (`0x0216ae70`). */
  | { readonly tag: 41; readonly slot: number; readonly who: Who }
  /** `42 who mode …` — place someone or something (`0x0216aed0`). */
  | {
      readonly tag: 42
      readonly who: Who
      readonly mode: number
      /** Mode 7: whom to stand on; mode 8: which axis, 1–3. */
      readonly extra: number
      readonly vector: Vec3
      /** Mode 9: face the other way. */
      readonly flip: boolean
      /** Mode 11: raise it by half the target's height, held between min and max. */
      readonly useHeight: number
      readonly min: number
      readonly max: number
    }
  /** `43 who mode [s]` — scale: 0 the free-standing 0.065, 2 by the camera's distance, 3 by `s` (`0x0216b088`). */
  | { readonly tag: 43; readonly who: Who; readonly mode: number; readonly scale: number }
  /** `44 level ms` — the screen's brightness, −16 black to 16 white (`0x0216b110`). */
  | { readonly tag: 44; readonly level: number; readonly ms: number }
  /** `45` — wait for the brightness (`0x0216b16c`). */
  | { readonly tag: 45 }
  /** `59 slot slot "bone"` — attach one effect to another's bone (`0x0216b7b8`). */
  | {
      readonly tag: 59
      readonly slot: number
      readonly host: number
      readonly bone: string | undefined
    }
  /** `60` — those called for appear (`0x0216b870`). */
  | { readonly tag: 60 }
  /** `106 show` — show or hide the stage (`0x0216c584`). */
  | { readonly tag: 106; readonly show: boolean }
  /** `115 who slot flag` — scale a slot's effect to a fighter once it is there, waited on (`0x0216c85c`). */
  | { readonly tag: 115; readonly who: Who; readonly slot: number; readonly bySize: boolean }
  // ── The camera ───────────────────────────────────────────────────────────
  /** `12 mode [variant] [f0 f1 f2]` — a shot, cut to (`0x0216a364`). */
  | {
      readonly tag: 12
      readonly mode: number
      readonly variant: number
      readonly floats: Vec3
    }
  /** `34 "path"` — an animated camera from a model's `eye` and `lookat` bones (`0x0216ad0c`). */
  | { readonly tag: 34; readonly path: string }
  /** `35` — back to the battle camera, framing kept (`0x0216ad7c`). */
  | { readonly tag: 35 }
  /** `39 who` — the camera follows a fighter (`0x0216adcc`). */
  | { readonly tag: 39; readonly who: Who }
  /** `48 x y z` — the eye (`0x0216b26c`). */
  | { readonly tag: 48; readonly vector: Vec3 }
  /** `49 x y z [mode]` — the look-at: 0 set, 2 scaled by the target's height, else added (`0x0216b2bc`). */
  | { readonly tag: 49; readonly vector: Vec3; readonly mode: number }
  /** `50 yaw height distance [mode]` — the orbit, as 49 (`0x0216b328`). */
  | { readonly tag: 50; readonly vector: Vec3; readonly mode: number }
  /** `86 flags yaw height distance a b c [kind]` — ease the orbit (`0x0216be6c`). */
  | {
      readonly tag: 86
      readonly flags: number
      readonly vector: Vec3
      readonly speed: number
      readonly most: number
      readonly accel: number
      readonly kind: number
    }
  /** `87 r` — the roll (`0x0216bf40`). */
  | { readonly tag: 87; readonly roll: number }
  /** `88 x y z a b c` / `89 …` — ease the look-at / the eye (`0x0216bfa4`, `0x0216c04c`). */
  | {
      readonly tag: 88 | 89
      readonly vector: Vec3
      readonly speed: number
      readonly most: number
      readonly accel: number
    }
  /** `113 amplitude ms` — shake (`0x0216c7a0`). */
  | { readonly tag: 113; readonly amplitude: number; readonly ms: number }
  /** `123 degrees` — the field of view's half-angle, 15 when not given (`0x0216cd28`). */
  | { readonly tag: 123; readonly degrees: number }
  /** `127 step n` — turn the eye about the look-at, `step` a tick for `n` ticks (`0x0216ce5c`). */
  | { readonly tag: 127; readonly step: number; readonly ticks: number }
  // ── The reaction record ──────────────────────────────────────────────────
  /** `55 [effect] [sound]` — the hit's own effect, battle sound and own-archive sound (`0x0216b564`). */
  | {
      readonly tag: 55
      /** The effect the struck are shown, 0 none. */
      readonly effect: number
      /** A sound from the battle's archive 101, −1 none. */
      readonly sound: number
      /** A sound from the action's own archive, −1 none. */
      readonly ownSound: number
    }
  /** `61` open a reaction record, `62` submit it, `67` wait for the reactions (`0x0216b884`, `0x0216b898`, `0x0216ba00`). */
  | { readonly tag: 61 | 62 | 67 }
  /** `63 ms` hold, `64 ms` the effect's time, `65 ms` the first result's time, `72 ms` the sound's (`0x0216b8ac` …). */
  | { readonly tag: 63 | 64 | 65 | 72; readonly ms: number }
  /** `66 id` — the effect on the one struck; a negative id builds nothing (`0x0216b9a8`). */
  | { readonly tag: 66; readonly id: number }
  /** `68 flags` — the effect's placement: bit 0 raised by half the height (`0x0216ba14`). */
  | { readonly tag: 68; readonly flags: number }
  /** `69 group archive` — load a sound group and pick the archive for 70 and 71 (`0x0216ba68`). */
  | { readonly tag: 69; readonly group: number; readonly archive: number }
  /** `70 n` a sound now, `71 n` the reaction's sound, `27 n` a sound from the battle's own archive. */
  | { readonly tag: 70 | 71 | 27; readonly sound: number }
  /** `78 n` — 1: a close-up on each one before their reaction (`0x0216bcac`). */
  | { readonly tag: 78; readonly value: number }
  /** `93 bits` — which lists: 1 skips the actor's own, 2 the targets; 0x10 and 0x20 two-part reactions (`0x0216c23c`). */
  | { readonly tag: 93; readonly bits: number }
  /** `95 v` — the reactions wait for the effects (`0x0216c2c4`). */
  | { readonly tag: 95; readonly value: number }
  /** `96 level ms` — dim the lights, 1 normal (`0x0216c314`). */
  | { readonly tag: 96; readonly level: number; readonly ms: number }
  /** `109 id` / `110 n` — the effect and sound when a result carries flag 3 (`0x0216c680`, `0x0216c6d0`). */
  | { readonly tag: 109 | 110; readonly value: number }
  /** `116 speed ms after` — the hit-stop (`0x0216c8e4`). */
  | { readonly tag: 116; readonly speed: number; readonly ms: number; readonly after: number }
  /** `117 mode a b` — scale the effect by the one struck (`0x0216c9fc`). */
  | { readonly tag: 117; readonly mode: number; readonly a: number; readonly b: number }
  /** `118 mode …` — offset the effect (`0x0216cad0`). */
  | { readonly tag: 118; readonly mode: number; readonly vector: Vec3 }
  // ── The message ──────────────────────────────────────────────────────────
  /** `112 ms` — how long the line on show stays; `128 ms` — how long new lines stay (`0x0216c734`, `0x0216cec0`). */
  | { readonly tag: 112 | 128; readonly ms: number }
  /** `129` — the action's start sound now (`0x0216cf04`). */
  | { readonly tag: 129 }
  | UnreadCommand

/** A command whose builder or player is not read, or whose state nothing reads: its values, carried. */
export interface UnreadCommand {
  readonly tag: number
  readonly unread: true
  readonly values: readonly ScriptValue[]
}

/** Values every builder can be handed: the record's own, then the stale rest. */
class Params {
  constructor(
    private readonly buffer: readonly ScriptValue[],
    readonly count: number,
  ) {}
  at(i: number): ScriptValue {
    return this.buffer[i] ?? EMPTY
  }
  type(i: number): ScriptValue['type'] {
    return this.at(i).type
  }
  /** `Parameter::ToInt`: an int as it is, a float truncated, a string 0. */
  int(i: number): number {
    const v = this.at(i)
    return v.type === 'int' ? v.int : v.type === 'float' ? Math.trunc(v.float) : 0
  }
  /** `Parameter::ToFloat`: a float as it is, an int converted, a string 0. */
  float(i: number): number {
    const v = this.at(i)
    return v.type === 'float' ? v.float : v.type === 'int' ? v.int : 0
  }
  /** `Parameter::ToString`: a string, or nothing. */
  text(i: number): string | undefined {
    const v = this.at(i)
    return v.type === 'string' ? v.text : undefined
  }
  /** A fraction as the builders take it: a float as it is, an int in thousandths. */
  fraction(i: number): number {
    return this.type(i) === 'float' ? this.float(i) : this.int(i) / 1000
  }
  own(): ScriptValue[] {
    return this.buffer.slice(0, this.count)
  }
}

/** What an untouched parameter holds: type 0, no string — the buffer starts zeroed. */
const EMPTY: ScriptValue = { type: 'string', text: undefined }

/** A builder: the command it makes, or `undefined` for one it builds and drops, or none. */
type Builder = (p: Params) => ActionCommand | undefined

/** The `.pac` → `.chr` swap tags 18 and 20 make (`strstr` + `strcpy`, which cuts what followed). */
function chrOf(path: string): string {
  const at = path.indexOf('.pac')
  return at < 0 ? path : `${path.slice(0, at)}.chr`
}

const vec = (p: Params, from: number): Vec3 => [p.float(from), p.float(from + 1), p.float(from + 2)]
const unsigned16 = (n: number) => n & 0xffff
const byte = (n: number) => n & 0xff

const BUILDERS: ReadonlyMap<number, Builder> = new Map<number, Builder>([
  [3, buildMotion],
  [5, (p) => ({ tag: 5, from: p.fraction(0), to: p.fraction(1), gap: p.float(2) })],
  [7, () => ({ tag: 7 })],
  [8, (p) => ({ tag: 8, ms: p.int(0) >>> 0, hold: p.count >= 2 ? byte(p.int(1)) : 0 })],
  [9, buildSkip],
  [
    10,
    (p) => {
      const id = unsigned16(p.int(0))
      return id === 0 ? undefined : { tag: 10, id }
    },
  ],
  [11, () => ({ tag: 11 })],
  [12, buildCamera],
  [18, (p) => ({ tag: 18, path: chrOf(p.text(0) ?? '') })],
  [19, () => ({ tag: 19 })],
  [
    20,
    (p) =>
      p.type(0) === 'string'
        ? { tag: 20, id: -1, path: chrOf(p.text(0) ?? '') }
        : { tag: 20, id: (p.int(0) << 24) >> 24, path: chrOf(p.text(1) ?? '') },
  ],
  [21, buildEffect],
  [22, (p) => ({ tag: 22, who: byte(p.int(0)), show: byte(p.int(1)) !== 0 })],
  [24, () => ({ tag: 24 })],
  [25, (p) => ({ tag: 25, effect: p.int(0) + 100, speed: p.float(1) })],
  [26, buildMotionWait],
  [27, (p) => ({ tag: 27, sound: unsigned16(p.int(0)) })],
  [29, (p) => ({ tag: 29, number: p.int(0) })],
  [
    30,
    (p) =>
      p.count >= 2
        ? { tag: 30, id: (p.int(0) << 24) >> 24, number: p.int(1) }
        : { tag: 30, id: -1, number: p.int(0) },
  ],
  [31, () => ({ tag: 31 })],
  [33, (p) => ({ tag: 33, who: p.int(0), path: p.text(1) ?? '' })],
  [34, (p) => ({ tag: 34, path: p.text(0) ?? '' })],
  [35, () => ({ tag: 35 })],
  [39, (p) => ({ tag: 39, who: p.int(0) })],
  [40, (p) => ({ tag: 40, slot: p.int(0) - 26 })],
  [41, (p) => ({ tag: 41, slot: p.int(0) - 26, who: byte(p.int(1)) })],
  [42, buildPlace],
  [43, (p) => ({ tag: 43, who: byte(p.int(0)), mode: byte(p.int(1)), scale: p.float(2) })],
  [44, (p) => ({ tag: 44, level: (p.int(0) << 24) >> 24, ms: p.int(1) })],
  [45, () => ({ tag: 45 })],
  [47, (p) => ({ tag: 47, who: byte(p.int(0)), alpha: byte(p.int(1)), ms: unsigned16(p.int(2)) })],
  [48, (p) => ({ tag: 48, vector: vec(p, 0) })],
  [49, (p) => ({ tag: 49, vector: vec(p, 0), mode: p.count >= 4 ? p.int(3) : 0 })],
  [50, (p) => ({ tag: 50, vector: vec(p, 0), mode: p.count >= 4 ? p.int(3) : 0 })],
  [55, buildHitDefaults],
  [59, (p) => ({ tag: 59, slot: p.int(0) - 26, host: p.int(1) - 26, bone: p.text(2) })],
  [60, () => ({ tag: 60 })],
  [61, () => ({ tag: 61 })],
  [62, () => ({ tag: 62 })],
  [63, (p) => ({ tag: 63, ms: p.int(0) })],
  [64, (p) => ({ tag: 64, ms: p.int(0) })],
  [65, (p) => ({ tag: 65, ms: p.int(0) })],
  [
    66,
    (p) => {
      const id = p.int(0)
      return id < 0 ? undefined : { tag: 66, id }
    },
  ],
  [67, () => ({ tag: 67 })],
  [68, (p) => ({ tag: 68, flags: p.int(0) })],
  [69, (p) => ({ tag: 69, group: p.int(0), archive: (p.int(1) << 16) >> 16 })],
  [70, (p) => ({ tag: 70, sound: unsigned16(p.int(0)) })],
  [71, (p) => ({ tag: 71, sound: (p.int(0) << 16) >> 16 })],
  [72, (p) => ({ tag: 72, ms: p.int(0) })],
  [76, (p) => ({ tag: 76, who: byte(p.int(0)) })],
  [77, (p) => ({ tag: 77, gap: p.float(0) })],
  [78, (p) => ({ tag: 78, value: p.int(0) })],
  [79, buildFormation],
  [85, () => ({ tag: 85 })],
  [86, buildOrbitEase],
  [87, (p) => ({ tag: 87, roll: p.float(0) })],
  [88, (p) => buildEase(88, p)],
  [89, (p) => buildEase(89, p)],
  [
    91,
    (p) => ({
      tag: 91,
      who: byte(p.int(0)),
      parent: byte(p.int(1)),
      bone: p.count >= 3 ? p.text(2) : undefined,
    }),
  ],
  [92, (p) => ({ tag: 92, who: byte(p.int(0)) })],
  [93, (p) => ({ tag: 93, bits: unsigned16(p.int(0)) })],
  [95, (p) => ({ tag: 95, value: byte(p.int(0)) })],
  [96, (p) => ({ tag: 96, level: p.float(0), ms: p.int(1) })],
  [106, (p) => ({ tag: 106, show: byte(p.int(0)) !== 0 })],
  [109, (p) => ({ tag: 109, value: p.int(0) })],
  [110, (p) => ({ tag: 110, value: p.int(0) })],
  [112, (p) => ({ tag: 112, ms: p.count >= 1 ? unsigned16(p.int(0)) : 0 })],
  [113, (p) => ({ tag: 113, amplitude: p.float(0), ms: p.int(1) })],
  [
    115,
    (p) => ({
      tag: 115,
      who: p.int(0),
      slot: p.int(1) - 26,
      bySize: p.count >= 3 && byte(p.int(2)) !== 0,
    }),
  ],
  [116, (p) => ({ tag: 116, speed: p.float(0), ms: p.int(1), after: p.int(2) })],
  [117, buildEffectScale],
  [118, buildEffectOffset],
  [123, (p) => ({ tag: 123, degrees: p.count >= 1 ? p.float(0) : 15 })],
  [127, (p) => ({ tag: 127, step: p.float(0), ticks: p.int(1) })],
  [128, (p) => ({ tag: 128, ms: unsigned16(p.int(0)) })],
  [129, () => ({ tag: 129 })],
  [140, (p) => ({ tag: 140, who: byte(p.int(0)), radians: (p.float(1) * Math.PI) / 180 })],
])

/** Tags that open or close a section, or build nothing at all. */
const OPEN = 1
const OPEN_BLOW = 16
const NOTHING = new Set([2, 17])
/** A key of 1 brings 2 and 219 with it (`0x02169bf0`). */
const BLOW_KEYS = [1, 2, 219] as const

/** `3 [who] "name" [flags] [fx]` (`func_ov000_02169d08`): who is 7 when the first value is the name. */
function buildMotion(p: Params): ActionCommand | undefined {
  const first = p.type(0)
  if (first !== 'string' && first !== 'int') return undefined
  const at = first === 'string' ? 0 : 1
  return {
    tag: 3,
    who: first === 'string' ? 7 : byte(p.int(0)),
    name: p.text(at) ?? '',
    flags: p.count > at + 1 ? unsigned16(p.int(at + 1)) : 1,
    fx: p.count > at + 2 ? byte(p.int(at + 2)) : 0,
  }
}

/**
 * `9 id [type] v…` (`func_ov000_0216a208`): the id and the type, then each
 * further value by its kind — ints to the halfwords from `+0x10`, a float to
 * `+0xc`, the gap tests' bound.
 */
function buildSkip(p: Params): ActionCommand {
  const ints: number[] = []
  let bound = 0
  let floats = 0
  for (let i = 2; i < p.count; i++) {
    const type = p.type(i)
    if (type === 'int') ints.push(unsigned16(p.int(i)))
    else if (type === 'float' && floats++ === 0) bound = p.float(i)
  }
  return {
    tag: 9,
    id: unsigned16(p.int(0)),
    type: p.count >= 2 ? unsigned16(p.int(1)) : 0,
    bound,
    ints,
  }
}

/** `12 mode [variant] [f0 f1 f2]` (`func_ov000_0216a364`): modes 5 and 6 take 1.8 for f2 unless given. */
function buildCamera(p: Params): ActionCommand {
  const mode = unsigned16(p.int(0))
  const close = mode === 5 || mode === 6
  const given = p.count >= 3
  return {
    tag: 12,
    mode,
    variant: p.count >= 2 ? byte(p.int(1)) : 0,
    floats: given ? vec(p, 2) : [0, 0, close ? 1.8 : 0],
  }
}

/**
 * `21 id slot "motion" [flags] [overlay]` (`func_ov000_0216a68c`) — the one
 * form the cartridge uses. The others (an int first without a name, a float
 * first) are never written and are carried unread.
 */
function buildEffect(p: Params): ActionCommand {
  if (p.type(0) === 'int' && p.count >= 3 && p.type(2) === 'string') {
    return {
      tag: 21,
      id: (p.int(0) << 24) >> 24,
      slot: p.int(1) - 26,
      motion: p.text(2) ?? '',
      flags: p.count >= 4 ? byte(p.int(3)) : 1,
      overlay: p.count >= 5 && byte(p.int(4)) !== 0,
    }
  }
  return { tag: 21, unread: true, values: p.own() }
}

/**
 * `26 [who] [point]` (`func_ov000_0216a9dc`): a float first is the actor (7)
 * and that point; an int first is who, and the point after it — a float as it
 * is, an int in thousandths — or the end when there is none. A bare `26`
 * decides by the stale first value.
 */
function buildMotionWait(p: Params): ActionCommand {
  let who = 7
  let point = 1
  let at = 0
  if (p.type(0) === 'float') {
    who = 7
  } else if (p.type(0) === 'int') {
    who = byte(p.int(0))
    at = 1
  }
  if (at + 1 <= p.count) {
    if (p.type(at) === 'float') point = Math.trunc(p.float(at) * 4096) / 4096
    else if (p.type(at) === 'int') point = Math.trunc((p.int(at) / 1000) * 4096) / 4096
  }
  return { tag: 26, who, point }
}

/** `42 who mode …` (`func_ov000_0216aed0`): the vector from values 2–4, and each mode's own extras. */
function buildPlace(p: Params): ActionCommand {
  const mode = byte(p.int(1))
  let extra = 0
  let flip = false
  let useHeight = 0
  let min = 0x666 / 4096
  let max = 0x1266 / 4096
  if (mode === 7) extra = byte(p.int(2))
  if (mode === 8 && p.count >= 4) extra = byte(p.int(5))
  if (mode === 9 && p.count >= 6) flip = p.int(5) !== 0
  if (mode === 11) {
    useHeight = byte(p.int(5))
    if (p.count >= 7) {
      min = p.float(6)
      max = p.float(7)
    }
  }
  return {
    tag: 42,
    who: byte(p.int(0)),
    mode,
    extra,
    vector: mode === 7 || p.count < 3 ? [0, 0, 0] : vec(p, 2),
    flip,
    useHeight,
    min,
    max,
  }
}

/**
 * `55 [a] [b]` (`func_ov000_0216b564`): the struck's effect — 0 when the
 * value is negative, 1 when it is 0, else the value; the battle sound 30 and
 * no own sound unless a second value says otherwise — at or above 0 the own
 * sound and no battle sound, −2 leaves both, any other negative clears both.
 */
function buildHitDefaults(p: Params): ActionCommand {
  const a = p.int(0)
  let sound = 30
  let ownSound = -1
  if (p.count >= 2) {
    const b = p.int(1)
    if (b >= 0) {
      sound = -1
      ownSound = b
    } else if (b !== -2) {
      sound = -1
      ownSound = -1
    }
  }
  return { tag: 55, effect: a < 0 ? 0 : a === 0 ? 1 : a, sound, ownSound }
}

/** `79 mode [who] [face]` (`func_ov000_0216bcf0`): who 1 and face on unless given. */
function buildFormation(p: Params): ActionCommand {
  return {
    tag: 79,
    mode: p.int(0) & 0x7f,
    who: p.count >= 2 ? byte(p.int(1)) : 1,
    face: p.count >= 3 ? (p.int(2) & 1) !== 0 : true,
  }
}

/** `86 flags yaw height distance a b c [kind]` (`func_ov000_0216be6c`). */
function buildOrbitEase(p: Params): ActionCommand {
  return {
    tag: 86,
    flags: p.int(0),
    vector: vec(p, 1),
    speed: p.float(4),
    most: p.float(5),
    accel: p.float(6),
    kind: p.count >= 8 ? p.int(7) : 0,
  }
}

/** `88 x y z a b c` and `89 …` (`func_ov000_0216bfa4`, `0x0216c04c`). */
function buildEase(tag: 88 | 89, p: Params): ActionCommand {
  return {
    tag,
    vector: vec(p, 0),
    speed: p.float(3),
    most: p.float(4),
    accel: p.float(5),
  }
}

/** `117 mode a b` (`func_ov000_0216c9fc`): mode 0 two floats, mode 1 an int and a float, else zeros. */
function buildEffectScale(p: Params): ActionCommand {
  const mode = p.int(0)
  if (mode === 0) return { tag: 117, mode, a: p.float(1), b: p.float(2) }
  if (mode === 1) return { tag: 117, mode, a: p.int(1), b: p.float(2) }
  return { tag: 117, mode, a: 0, b: 0 }
}

/**
 * `118 mode …` (`func_ov000_0216cad0`): modes 0 and 2 an offset; 1 and 4 a
 * length 0.16 × v1 toward the actor, a size bound v2 and a turn flag v3;
 * mode 3 a factor. Carried as the three values the effect step reads.
 */
function buildEffectOffset(p: Params): ActionCommand {
  const mode = p.int(0)
  if (mode === 0 || mode === 2) return { tag: 118, mode, vector: vec(p, 1) }
  if (mode === 1 || mode === 4) {
    return {
      tag: 118,
      mode,
      vector: [
        p.count >= 2 ? (0x28f / 4096) * p.float(1) : 0x28f / 4096,
        p.count >= 3 ? p.float(2) : 1,
        p.count >= 4 ? p.int(3) : 0,
      ],
    }
  }
  if (mode === 3) return { tag: 118, mode, vector: [p.count >= 2 ? p.float(1) : 1 / 4096, 0, 0] }
  return { tag: 118, mode, vector: [0, 0, 0] }
}

/** A record's values as the game's `Script` reads them into its parameters. */
function valuesOf(
  record: TableRecord,
  stringAt: (offset: number) => string | undefined,
): ScriptValue[] {
  const out: ScriptValue[] = []
  for (let i = 0; i < record.values.length; i++) {
    const kind = record.kinds[i]
    const raw = record.values[i] as number
    if (kind === 0) out.push({ type: 'string', text: stringAt(raw) })
    else if (kind === 1) out.push({ type: 'int', int: raw | 0 })
    else if (kind === 2) out.push({ type: 'float', float: record.floats[i] as number })
    // A kind of 3 is passed over without taking a value's place (`default: continue`).
  }
  return out
}

/** Read a `.bact`: its sections, each with its commands as the game builds them. */
export function readActionScript(bytes: Uint8Array): ActionScript {
  const table = readDataTable(bytes)
  const sections: { keys: number[]; commands: ActionCommand[] }[] = []
  let open: { keys: number[]; commands: ActionCommand[] } | undefined
  const buffer: ScriptValue[] = []
  for (const record of table.records) {
    const values = valuesOf(record, table.stringAt)
    for (let i = 0; i < values.length && i < 128; i++) buffer[i] = values[i] as ScriptValue
    const p = new Params(buffer, Math.min(values.length, 128))
    if (record.tag === OPEN) {
      const keys = p.own().map((_, i) => unsigned16(p.int(i)))
      if (keys.includes(1)) for (const k of BLOW_KEYS) if (!keys.includes(k)) keys.push(k)
      open = { keys, commands: [] }
      sections.push(open)
      continue
    }
    if (record.tag === OPEN_BLOW) {
      open = { keys: [...BLOW_KEYS], commands: [] }
      sections.push(open)
      continue
    }
    if (NOTHING.has(record.tag)) continue
    const build = BUILDERS.get(record.tag)
    const command: ActionCommand | undefined = build
      ? build(p)
      : { tag: record.tag, unread: true, values: p.own() }
    if (command && open) open.commands.push(command)
  }
  return { sections }
}

/**
 * **Which section of a fighter's own script an action plays** — the first
 * whose keys hold its number (`func_02048ab4` → `func_ov000_02169a58`, in file
 * order, keys in order). Undefined when none does.
 */
export function sectionFor(script: ActionScript, action: number): ActionSection | undefined {
  return script.sections.find((s) => s.keys.includes(action))
}

/** Every section keyed by an action — the second of action 1's is a double attack's second swing (INFERRED). */
export function sectionsFor(script: ActionScript, action: number): ActionSection[] {
  return script.sections.filter((s) => s.keys.includes(action))
}

/** Whether a command is one this reader carries unread. */
export function isUnread(command: ActionCommand): command is UnreadCommand {
  return 'unread' in command
}
