import type { ActionCommand, Vec3 } from '@minstrel/game-formats'

/**
 * **An action, played as the game plays it** — a section of a `.bact`
 * (`readActionScript`) run one command at a time, as overlay 25's dispatcher
 * runs it (`func_ov025_021e9778`, USA), read 1 October 2026; FORMAT.md, "The
 * action scripts".
 *
 * **The run.** Each pass the dispatcher plays commands in order until one is
 * not done: a player returning 0 is played again next pass and nothing after
 * it runs; −1 (only `31`) is done but ends the pass; anything else is done and
 * the next plays at once. While a skip is open only `10` is played; `11` ends
 * the run. What a command starts — a motion, a move, an effect, a camera
 * move — carries on by itself.
 *
 * **Time** is the game's effective milliseconds: the real time × the game's
 * speed, which the hit-stop turns down (`GameState::CalculateDeltaTime`).
 *
 * This module holds only what the script changes — where each fighter stands
 * and faces, the motion it plays and how far in, its alpha and whether it is
 * seen, the effects in play — and hands the rest to its caller as
 * {@link ShowEvent}s: the camera's shots, sounds, numbers, the lights. The
 * reactions to the action's results are {@link ./action-reactions.ts}'s.
 *
 * **Ours**, each marked where it is used: a pass every {@link PASS_MS}, the
 * game's own pass rate not being read; and how a fighter comes back to its
 * idle motion between actions.
 */

/** The dispatcher runs once a frame; how many frames a second it has is not read. **Ours**: 60. */
export const PASS_MS = 1000 / 60

/** Object indices, as the battle numbers them (`func_ov000_0215ec1c`): the party 0–3, the monsters `0xc0` on. */
export const MONSTER_BASE = 0xc0
/** The effects' game objects, `0xd0`–`0xdf`, one for each of the effect manager's 16 instances. */
export const EFFECT_BASE = 0xd0
export const EFFECT_COUNT = 16
/** Object 200, which the thrown weapons load a second body into. */
export const OBJECT_200 = 0xc8
/**
 * An actor's carried weapon — the battle's object `id×12 + 0x1c` (INFERRED,
 * from `91 34 28 "weapon"` and `22 34 0`). **Ours**: numbered here from 0x100
 * up, the engine drawing the weapon with its holder.
 */
export const WEAPON_BASE = 0x100

/** `isParty`: every test the battle makes is `0 ≤ index ≤ 3`. */
export const isParty = (index: number) => index >= 0 && index <= 3
export const isMonster = (index: number) => index >= MONSTER_BASE && index < MONSTER_BASE + 8

/** A fighter as the stage has them when the action begins. */
export interface StageFighter {
  readonly index: number
  readonly x: number
  readonly z: number
  readonly facing: number
  readonly radius: number
  readonly height: number
  /** Its size in battle, `Object3D +0x18e` — a monster's record's, 1 for anyone else. */
  readonly size: number
  /** Where the set-up's grid puts them (`0x02167dd8`), and their row (`0x02167e6c`). */
  readonly grid: { readonly x: number; readonly z: number; readonly facing: number }
  readonly row: { readonly x: number; readonly z: number; readonly facing: number }
  readonly alive: boolean
  readonly visible: boolean
  /** The motion it is playing as the action begins, and how far in, ms. */
  readonly motion: string
  readonly motionAt: number
  /** How fast it turns, radians a tick — `+0xb0`: 0x324 unless a big monster's slower. */
  readonly turnRate: number
  /** A motion it is changing from as the action begins — see {@link Blend}. */
  readonly blend?: Blend
}

/**
 * **A change of motion, blended** — `Object3D::priorAnimationBlend_`, read 3
 * October 2026 (the decomp's `src/World/Object3D.cpp`). A motion set with flag
 * `0x10` keeps the one before at the time it was left, counting for all of the
 * pose at first and nothing after {@link BLEND_MS} of effective time, by a
 * share of what is left each pass (`AdvanceAnimations_v1`); and **the new
 * motion's clock stands still until the blend is over**. A second `0x10`
 * change while one is under way cuts it short instead; changing back to the
 * motion being left ends it.
 */
export interface Blend {
  /** The motion being left, and how far into it, ms, as it was left. */
  readonly from: string
  readonly at: number
  /** Whether it goes round (its flag 1 clear), for the frame it was left on. */
  readonly loops: boolean
  /** How much it still counts, 1 to 0. */
  weight: number
  /** Effective ms left. */
  left: number
}

/** `defaultAnimBlendDuration_`, ms (`Object3D::Initialize`). */
export const BLEND_MS = 200

/** What the caller knows of motions and effects: how long each takes once through, ms, or undefined for none. */
export interface Timings {
  motionMs(fighter: number, name: string): number | undefined
  /** An effect file's motion — `undefined` motion its first. */
  effectMs(file: string, motion: string | undefined): number | undefined
}

/** The action being shown: its number, who acts and who is acted on. */
export interface ActionContext {
  readonly action: number
  /** Object indices of those acting; the first is "the one acting". */
  readonly actors: readonly number[]
  /** Those acted on — each their receivers, the first the one aimed at. */
  readonly targets: readonly { readonly receivers: readonly number[] }[]
}

/** A fighter as the script leaves it. */
export interface FighterShow {
  readonly index: number
  x: number
  z: number
  facing: number
  /** Where it is turning to, at its rate a tick (`+0xae`, `func_02033710`). */
  turnTo: number
  readonly turnRate: number
  readonly radius: number
  readonly height: number
  readonly size: number
  readonly grid: StageFighter['grid']
  readonly row: StageFighter['row']
  motion: string
  /** `MaybeSetRegularAnimation`'s flags: bit 0 once and held, else it loops. */
  motionFlags: number
  /** How far into its motion, effective ms. */
  motionAt: number
  /** The motion it is changing from, while the change is blended. */
  blend: Blend | undefined
  alpha: number
  fade: { readonly to: number; readonly perMs: number } | undefined
  visible: boolean
  alive: boolean
  /** Its state (`+0xbe`): 0 idle, 1 running, 4 dying, 6 dead. */
  state: number
  /** Drawn untextured for this long, effective ms — the struck's flash. */
  flash: number
  /** A shake of where it is drawn: amplitude, and time left, ms (`func_02032fd0`). */
  shake: { amplitude: number; left: number } | undefined
}

/** An effect in play — one of the manager's 16 instances. */
export interface EffectShow {
  readonly handle: number
  readonly id: number
  readonly file: string
  readonly motion: string | undefined
  /** 1 once, then gone; 0 loops. */
  readonly flags: number
  at: number
  /** Whom it is drawn on, following their place, turn and scale; undefined for none. */
  host: number | undefined
  /** Its place: an offset from its host, or the stage's own coordinates when it has none. */
  offset: Vec3
  turn: number
  /**
   * Its own scale, as `Object3D` keeps it: on a host, times the host's
   * (`func_02057ab8`); free on the stage, as it is — where a fighter's is
   * `0x10a` ({@link LOOSE_SCALE}).
   */
  scale: number
  /** Drawn in the later, screen-fixed pass (`21 …` with its 5th value set). */
  readonly overlay: boolean
}

/** What the caller is asked to do, in order, each pass. */
export type ShowEvent =
  | { readonly kind: 'camera'; readonly command: CameraCommand }
  | { readonly kind: 'sound'; readonly from: 'battle' | 'own'; readonly sound: number }
  | { readonly kind: 'sound-set'; readonly group: number; readonly archive: number }
  | { readonly kind: 'lights'; readonly level: number; readonly ms: number }
  | { readonly kind: 'brightness'; readonly level: number; readonly ms: number }
  | { readonly kind: 'stage'; readonly show: boolean }
  | {
      readonly kind: 'game-speed'
      readonly speed: number
      readonly ms: number
      readonly after: number
    }
  /** The action's start sound: 7 for one of the party, 8 for a monster (`func_ov025_021eb6fc`). */
  | { readonly kind: 'start-sound'; readonly sound: 7 | 8 }

/** The camera commands, handed on with whom they are about. */
export type CameraCommand = Extract<
  ActionCommand,
  { tag: 12 | 34 | 35 | 39 | 48 | 49 | 50 | 86 | 87 | 88 | 89 | 113 | 123 | 127 }
> & {
  readonly actor: number | undefined
  readonly target: number | undefined
  /** Whom `39` follows, when it names exactly one. */
  readonly follow?: number
}

/** A timed move or turn, on the queue tag 5 fills (`func_ov025_021eee48`, run by `021eedb0`). */
type Queued =
  | { kind: 'move'; delay: number; who: number; left: number; to: { x: number; z: number } }
  | { kind: 'turn'; delay: number; who: number; left: number; to: number }

/** A motion's normalized time, 0 to 1, as `Object3D +0x24` keeps it. */
export function normalized(f: FighterShow, length: number | undefined): number {
  if (length === undefined || length <= 0) return 1
  if ((f.motionFlags & 1) === 0) return (f.motionAt % length) / length
  return Math.min(1, f.motionAt / length)
}

/**
 * The motions `26` takes as done the moment they loop (`data_ov025_021eef58`):
 * an idle a fighter holds, not one that ends.
 */
const IDLES: ReadonlySet<string> = new Set([
  'stand',
  'stand_battle',
  'guard',
  'sleep',
  'slip',
  'smile',
  'dance',
  'tenchi',
])

/** Ticks a fighter's turn runs at (`GameState::GetTickCount` per update). **Ours**: a tick a pass. */
const TICK = 1

/** One pass of the step in at most, 0.2 (`0x333`), and its done-within, 0x28. */
const STEP_MOST = 0x333 / 4096
const STEP_DONE = 0x28 / 4096
/** The side a target or an actor stands on, for placing (`42 … 1/2/5/6`): z ±2.5. */
const SIDE_Z = 0x2800 / 4096
/** A free-standing object's scale, `0x10a`. */
export const LOOSE_SCALE = 0x10a / 4096

/**
 * **A monster's size as a scale** (`func_ov000_0216352c(id, a, b)`): its
 * `+0x18e` as it is up to `a`, and past it `a` plus the rest times `b`. Tags
 * 115 and 117 and the close-up take it so.
 */
export function sizeScale(size: number, a: number, b: number): number {
  return size <= a ? size : a + (size - a) * b
}
/** Formation 2: the two squared up, 6 plus their mean radius apart. */
const SQUARED = 6
/** Formation 3: a group squeezed to fit this wide. */
const GROUP_WIDTH = 4

export interface ActionRun {
  /** Play one pass, `realMs` of real time since the last: the script, then time moves on. */
  pass(realMs: number): ShowEvent[]
  /** Whether the script has run out (`P+4` null). */
  readonly scriptDone: boolean
  /**
   * **Whether the action is over** (`func_ov025_021e9528`, `021dc940`): the
   * script run out, the line down and nothing queued, no reaction waiting, no
   * effect playing, nobody dying — and, **ours**, a dead monster's fade done.
   */
  readonly ended: boolean
  readonly fighters: ReadonlyMap<number, FighterShow>
  readonly effects: readonly (EffectShow | undefined)[]
  /** The game's speed now, 1 unless a hit-stop holds. */
  readonly speed: number
  /** Whether the stage is drawn (`106`). */
  readonly stageShown: boolean
  /** Hooks for the reactions — see `action-reactions.ts`. */
  readonly hooks: RunHooks
}

/** What the reactions need of the run. */
export interface RunHooks {
  readonly context: ActionContext
  readonly timings: Timings
  fighter(index: number): FighterShow | undefined
  setMotion(index: number, name: string, flags: number): boolean
  spawn(id: number, params: Partial<Omit<EffectShow, 'handle' | 'id' | 'file'>>): number | undefined
  effectPlaying(): boolean
  resolve(who: number): number[]
  emit(event: ShowEvent): void
  hitStop(speed: number, ms: number, after: number): void
}

/**
 * What a script tells the reactions — the record `61` opens and `62` submits,
 * and `67`'s wait. Kept apart so the run can be played without them.
 */
export interface Reactions {
  /** `61`, the tags between, `62`: the record, filled as the commands come. */
  record(command: ActionCommand): void
  submit(): void
  /** `67`: whether every reaction has been shown, every death played and every effect done. */
  settled(): boolean
  /** One pass of the queue, after the script's (`func_ov025_021ebb90`). */
  pass(effectiveMs: number): void
  /** The action's line goes up — with its first camera (`func_ov025_021ea474`). */
  open(): void
  /** `112` (now) and `128` (from now on): how long a line stays, ms. */
  lineMs(ms: number, now: boolean): void
  /** Nothing queued, no line up, no entry waiting — the action's end waits on it. */
  idle(): boolean
  /** Tag 9's tests on the action's results (types 6–14, 16–23): whether to skip. */
  skips(type: number, command: Extract<ActionCommand, { tag: 9 }>): boolean
}

/** No reactions: nothing is shown on the struck, and nothing waits on them. */
export const NO_REACTIONS: Reactions = {
  record: () => {},
  submit: () => {},
  settled: () => true,
  pass: () => {},
  open: () => {},
  lineMs: () => {},
  idle: () => true,
  skips: () => false,
}

/**
 * **Start an action's script.** `fighters` are everyone on the stage;
 * `resources` the effects the battle already holds by id (the built-in ones);
 * `makeReactions` builds the reactions with the run's hooks.
 */
export function startAction(
  commands: readonly ActionCommand[],
  context: ActionContext,
  fighters: readonly StageFighter[],
  timings: Timings,
  options: {
    readonly resources?: ReadonlyMap<number, string>
    readonly makeReactions?: (hooks: RunHooks) => Reactions
    /** The camera's orbit distance and look — for `43 … 2` and `42 … 3/8`. */
    readonly camera?: () => {
      readonly distance: number
      readonly yaw: number
      readonly eye: Vec3
      readonly look: Vec3
    }
  } = {},
): ActionRun {
  const shows = new Map<number, FighterShow>()
  for (const f of fighters) {
    shows.set(f.index, {
      index: f.index,
      x: f.x,
      z: f.z,
      facing: f.facing,
      turnTo: f.facing,
      turnRate: f.turnRate,
      radius: f.radius,
      height: f.height,
      size: f.size,
      grid: f.grid,
      row: f.row,
      motion: f.motion,
      motionFlags: 0,
      motionAt: f.motionAt,
      blend: f.blend ? { ...f.blend } : undefined,
      alpha: 31,
      fade: undefined,
      visible: f.visible,
      alive: f.alive,
      state: f.alive ? 0 : 6,
      flash: 0,
      shake: undefined,
    })
  }
  const effects: (EffectShow | undefined)[] = new Array(EFFECT_COUNT).fill(undefined)
  const resources = new Map<number, string>(options.resources ?? [])
  /** Files a script queued (`18`, `29`) — loaded at once here: the caller has the cartridge. */
  const loaded = new Set<string>()
  let nextResource = 100
  const slots: (number | undefined)[] = new Array(16).fill(undefined)
  const queue: Queued[] = []
  let at = 0
  let skip = 0
  let done = commands.length === 0
  let events: ShowEvent[] = []
  let speed = 1
  let speedHold: { after: number; left: number; speed: number } | undefined
  let stageShown = true
  /** `+0x6fd5`: the script has moved the camera (tag 9's type 15). */
  let cameraMoved = false
  /** Whether the first camera command's once-an-action work is done (`func_ov025_021e9b2c`). */
  let opened = false
  /** Whether the script moves the camera before it shows its first reaction. */
  const firstReaction = commands.findIndex((c) => c.tag === 61 || c.tag === 7)
  const cameraFirst = commands
    .slice(0, firstReaction < 0 ? undefined : firstReaction)
    .some((c) => c.tag === 12)
  /** Tag 3 started a motion this pass: a `26` waits a pass before it tests (`data_ov025_021ef9a4` bit 2). */
  let motionStarted = false
  /** A wait's clock, shared by the waits (`data_ov025_021ef9bc`). */
  let waited = 0
  /** Tag 77's first pass is done (`data_ov025_021ef9a8`). */
  let stepping = false
  /** Tag 25's flying effect. */
  let flying: number | undefined
  const emit = (e: ShowEvent) => events.push(e)

  const actor = () => context.actors[0]
  const target = () => context.targets[0]?.receivers[0]
  const fighter = (i: number | undefined) => (i === undefined ? undefined : shows.get(i))

  /** The battle's resolver (`func_ov000_021820bc`): who → object indices. */
  function resolve(who: number): number[] {
    const party = [...shows.keys()].filter(isParty)
    const monsters = [...shows.keys()].filter(isMonster)
    const sideOf = (i: number | undefined) => (i === undefined ? [] : isParty(i) ? party : monsters)
    const otherOf = (i: number | undefined) =>
      i === undefined ? [] : isParty(i) ? monsters : party
    const one = (i: number | undefined) => (i === undefined ? [] : [i])
    if (who === 0) return sideOf(actor())
    if (who === 1) return sideOf(target())
    if (who === 2) return otherOf(actor())
    if (who === 3) return otherOf(target())
    if (who === 4) return [...party, ...monsters]
    if (who >= 7 && who <= 14) return one(context.actors[who - 7])
    if (who >= 15 && who <= 22) return one(context.targets[who - 15]?.receivers[0])
    if (who === 23) return [...context.actors]
    if (who === 24) return context.targets.flatMap((t) => one(t.receivers[0]))
    if (who >= 26 && who <= 33) {
      const handle = slots[who - 26]
      return handle !== undefined && effects[handle - EFFECT_BASE] ? [handle] : []
    }
    if (who >= 34 && who <= 37) return one(context.actors[who - 34]).map((i) => WEAPON_BASE + i)
    if (who === 38) return party
    if (who === 39) return monsters
    if (who === 40) return [OBJECT_200]
    if (who === 50 || who === 52) {
      const receivers = context.targets[who === 50 ? 0 : 1]?.receivers ?? []
      return one(receivers[Math.min(Math.max(receivers.length - 1, 0), 2)])
    }
    // 51: each target's receivers, by result codes not modelled here — the first of each.
    if (who === 51) return context.targets.flatMap((t) => one(t.receivers[0]))
    return []
  }

  /**
   * `Object3D::MaybeSetRegularAnimation`: none of that name, and nothing
   * changes; the same one again, playing the same way round, and nothing
   * changes unless flag 8 asks for a restart; else it starts — blended from
   * the one before under flag `0x10` (see {@link Blend}).
   */
  function setMotion(index: number, name: string, flags: number): boolean {
    const f = shows.get(index)
    if (!f) return false
    if (timings.motionMs(index, name) === undefined) return false
    if ((flags & 8) === 0 && f.motion === name && (flags & 4) === (f.motionFlags & 4)) return true
    if (flags & 0x10) {
      f.blend = f.blend
        ? undefined
        : {
            from: f.motion,
            at: f.motionAt,
            loops: (f.motionFlags & 1) === 0,
            weight: 1,
            left: BLEND_MS,
          }
    }
    f.motion = name
    f.motionFlags = flags
    f.motionAt = 0
    if (f.blend?.from === name) f.blend = undefined
    return true
  }

  function spawn(
    id: number,
    params: Partial<Omit<EffectShow, 'handle' | 'id' | 'file'>>,
  ): number | undefined {
    const file = resources.get(id)
    if (file === undefined) return undefined
    const free = effects.indexOf(undefined)
    if (free < 0) return undefined
    const handle = EFFECT_BASE + free
    effects[free] = {
      handle,
      id,
      file,
      motion: params.motion,
      flags: params.flags ?? 1,
      at: 0,
      host: params.host,
      offset: params.offset ?? [0, 0, 0],
      turn: params.turn ?? 0,
      scale: params.scale ?? 1,
      overlay: params.overlay ?? false,
    }
    return handle
  }

  const effectOf = (handle: number | undefined) =>
    handle === undefined ? undefined : effects[handle - EFFECT_BASE]

  const hooks: RunHooks = {
    context,
    timings,
    fighter: (i) => shows.get(i),
    setMotion,
    spawn,
    effectPlaying: () => effects.some((e) => e !== undefined),
    resolve,
    emit,
    hitStop: (s, ms, after) => {
      speedHold = { after, left: ms, speed: s }
    },
  }
  const reactions = options.makeReactions?.(hooks) ?? NO_REACTIONS

  /** Tag 9's condition, by type (`func_ov025_021e3178`). */
  function skips(c: Extract<ActionCommand, { tag: 9 }>): boolean {
    const type = c.type
    if (type === 0 || type > 23) return true
    if (type >= 1 && type <= 4) {
      // The mean place of all acting and all acted on, less their mean half-radii.
      const acting = context.actors.flatMap((i) => one(shows.get(i)))
      const actedOn = context.targets.flatMap((t) => one(shows.get(t.receivers[0] ?? -1)))
      if (acting.length === 0 || actedOn.length === 0) return false
      const mean = (xs: FighterShow[], k: (f: FighterShow) => number) =>
        xs.reduce((s, f) => s + k(f), 0) / xs.length
      const gap =
        Math.hypot(
          mean(actedOn, (f) => f.x) - mean(acting, (f) => f.x),
          mean(actedOn, (f) => f.z) - mean(acting, (f) => f.z),
        ) -
        mean(acting, (f) => f.radius / 2) -
        mean(actedOn, (f) => f.radius / 2)
      if (type === 1) return gap < c.bound
      if (type === 2) return gap > c.bound
      if (type === 3) return gap <= c.bound
      return gap >= c.bound
    }
    if (type === 5) {
      return context.actors.length === 1 && context.targets.length === 1 && actor() === target()
    }
    if (type === 15) return cameraMoved
    return reactions.skips(type, c)
  }
  const one = <T>(v: T | undefined): T[] => (v === undefined ? [] : [v])

  /** Play one command; 0 not done, −1 done for this pass, 1 done. */
  function play(c: ActionCommand): -1 | 0 | 1 {
    if ('unread' in c) return 1
    switch (c.tag) {
      case 8: {
        if (c.ms > waited) {
          waited += effectiveNow
          return 0
        }
        waited = 0
        return 1
      }
      case 9:
        if (c.id !== 0 && skips(c)) skip = c.id
        return 1
      case 10:
        if (c.id === skip) skip = 0
        return 1
      case 31:
        return -1
      case 3:
        return playMotion(c)
      case 5:
        return lunge(c)
      case 7:
        reactions.record({ tag: 61 })
        reactions.submit()
        return 1
      case 22: {
        let who = c.who
        if (who === 5 || who === 6) {
          for (const i of resolve(4)) setVisible(i, !c.show)
          who = who === 5 ? 0 : 1
        }
        for (const i of resolve(who)) setVisible(i, c.show)
        return 1
      }
      case 24: {
        const a = fighter(actor())
        const t = fighter(target())
        if (a && t && a !== t) a.turnTo = yawTo(a, t)
        return 1
      }
      case 25:
        return fly(c)
      case 26:
        return motionReached(c)
      case 33:
        // A pack's motions join the fighter's: the caller already holds every pack.
        return 1
      case 47:
        for (const i of resolve(c.who)) {
          const f = shows.get(i)
          if (f && c.ms > 0) f.fade = { to: c.alpha, perMs: (c.alpha - f.alpha) / c.ms }
        }
        return 1
      case 76:
        return 1
      case 77:
        return stepIn(c)
      case 79:
        formation(c)
        return 1
      case 85: {
        const a = fighter(resolve(23)[0])
        if (!a) return 1
        const length = timings.motionMs(a.index, a.motion)
        if (isParty(a.index)) return normalized(a, length) >= 0xb33 / 4096 ? 1 : 0
        return motionEnded(a, length) ? 1 : 0
      }
      case 91:
      case 92:
        return 1
      case 140: {
        const f = fighter(resolve(c.who)[0])
        if (f) f.facing = f.turnTo = c.radians
        return 1
      }
      case 18:
        loaded.add(c.path.toLowerCase())
        return 1
      case 29:
        loaded.add(effectPath(c.number))
        return 1
      case 19:
        return 1
      case 20:
        register(c.id, `data/${c.path}`)
        return 1
      case 30:
        register(c.id, effectPath(c.number))
        return 1
      case 21: {
        const a = actor()
        const handle = spawn(c.id, {
          motion: c.motion,
          flags: c.flags,
          host: c.overlay ? undefined : a,
          scale: c.overlay ? 0.5 : 1,
          overlay: c.overlay,
        })
        if (handle !== undefined && c.slot >= 0 && c.slot < 16) slots[c.slot] = handle
        return 1
      }
      case 40: {
        const handle = c.slot >= 0 && c.slot < 16 ? slots[c.slot] : undefined
        if (handle !== undefined) effects[handle - EFFECT_BASE] = undefined
        return 1
      }
      case 41: {
        const e = effectOf(c.slot >= 0 && c.slot < 16 ? slots[c.slot] : undefined)
        if (e) e.host = resolve(c.who)[0]
        return 1
      }
      case 42:
        place(c)
        return 1
      case 43:
        scale(c)
        return 1
      case 44:
        emit({ kind: 'brightness', level: c.level, ms: c.ms })
        return 1
      case 45:
        return 1
      case 59: {
        const e = effectOf(slots[c.slot])
        const host = slots[c.host]
        if (e && host !== undefined) e.host = host
        return 1
      }
      case 60:
        for (const i of resolve(24)) {
          const f = shows.get(i)
          if (!f) continue
          f.alive = true
          f.state = 0
          setMotion(i, 'appear', 1)
        }
        return 1
      case 106:
        stageShown = c.show
        emit({ kind: 'stage', show: c.show })
        return 1
      case 115: {
        const f = resolve(c.who)
        const e = effectOf(slots[c.slot])
        if (f.length !== 1 || !e) return 0
        // A monster's size, beyond 1 halved; anyone else's the loose scale.
        e.scale = isMonster(f[0] as number)
          ? sizeScale(shows.get(f[0] as number)?.size ?? 1, 1, 0.5)
          : LOOSE_SCALE
        return 1
      }
      case 12:
      case 34:
      case 35:
      case 39:
      case 48:
      case 49:
      case 50:
      case 86:
      case 87:
      case 88:
      case 89:
      case 113:
      case 123:
      case 127:
        camera(c)
        return 1
      case 55:
      case 61:
      case 63:
      case 64:
      case 65:
      case 66:
      case 68:
      case 71:
      case 72:
      case 78:
      case 93:
      case 109:
      case 110:
      case 117:
      case 118:
        reactions.record(c)
        return 1
      case 62:
        reactions.submit()
        return 1
      case 67:
        return reactions.settled() ? 1 : 0
      case 69:
        emit({ kind: 'sound-set', group: c.group, archive: c.archive })
        return 1
      case 70:
        emit({ kind: 'sound', from: 'own', sound: c.sound })
        return 1
      case 27:
        emit({ kind: 'sound', from: 'battle', sound: c.sound })
        return 1
      case 95:
        reactions.record(c)
        return 1
      case 96:
        emit({ kind: 'lights', level: c.level, ms: c.ms })
        return 1
      case 116:
        speedHold = { after: c.after, left: c.ms, speed: c.speed }
        return 1
      case 112:
        reactions.lineMs(c.ms, true)
        return 1
      case 128:
        reactions.lineMs(c.ms, false)
        return 1
      case 129: {
        const a = actor()
        emit({ kind: 'start-sound', sound: a !== undefined && isParty(a) ? 7 : 8 })
        return 1
      }
      case 11:
        return 1
    }
    return 1
  }

  function register(id: number, path: string) {
    const key = id < 0 ? nextResource++ : id
    if (id >= 100) nextResource = Math.max(nextResource, id + 1)
    resources.set(key, path.replace(/^data\//, '').toLowerCase())
  }

  function setVisible(i: number, show: boolean) {
    const f = shows.get(i)
    if (f) f.visible = show
  }

  /** Tag 3 (`func_ov025_021e2980`): each who plays the motion at speed 1, from its start. */
  function playMotion(c: Extract<ActionCommand, { tag: 3 }>): 1 {
    if (c.who === 25) {
      emit({ kind: 'camera', command: { ...asCamera(c), actor: actor(), target: target() } })
      motionStarted = true
      return 1
    }
    for (const i of resolve(c.who)) {
      const f = shows.get(i)
      if (!f) continue
      // Any movement of the battle record's is cancelled, and a fighter not idle, dying or dead is idle again.
      if (f.state !== 0 && f.state !== 4 && f.state !== 6) f.state = 0
      // `SkipAnimationTransition`: a scripted motion never blends in.
      f.blend = undefined
      if (!setMotion(i, c.name, c.flags) && c.name === 'magic') {
        if (!setMotion(i, 'magic1', c.flags)) setMotion(i, 'magic_in', c.flags)
      }
    }
    // A magic motion sounds 100 — or 102 when the action's `+0x0a` bit 0 is
    // set, which is not read: 100 — unless fx bit 0 (`0x021e2b80`).
    if ((c.name === 'magic' || c.name === 'magic1' || c.name === 'magic_in') && (c.fx & 1) === 0) {
      emit({ kind: 'sound', from: 'battle', sound: 100 })
    }
    motionStarted = true
    return 1
  }

  /** The camera's animated motion, by `3 25 "name"`, handed on as a camera command. */
  function asCamera(c: Extract<ActionCommand, { tag: 3 }>): CameraCommand {
    return {
      tag: 34,
      path: `motion:${c.name}`,
      actor: actor(),
      target: target(),
    }
  }

  /**
   * Tag 5, the lunge (`func_ov025_021e2ca4`): the actor's current motion,
   * timed at 16.666 ms a frame (`0x418553f8`), moves it in a straight line to
   * `gap` edge to edge from the target over the stretch from `from` to `to`,
   * turning to face along the line in at most 250 ms. Not waited on.
   */
  function lunge(c: Extract<ActionCommand, { tag: 5 }>): 0 | 1 {
    const a = fighter(actor())
    if (!a) return 1
    const length = timings.motionMs(a.index, a.motion)
    if (length === undefined) return 0
    const t = fighter(target())
    if (!t) return 1
    // The motion's whole length at 16.666 ms a frame rather than 17.
    const total = Math.trunc((length / 17) * (1000 / 60))
    const dur = Math.trunc(total * (c.to - c.from))
    const now = normalized(a, length)
    const delay = now < c.from ? Math.trunc(total * (c.from - now)) : 0
    const dx = t.x - a.x
    const dz = t.z - a.z
    const d = Math.hypot(dx, dz) || 1
    const along = d - a.radius / 2 - t.radius / 2 - c.gap
    const to = { x: a.x + (dx / d) * along, z: a.z + (dz / d) * along }
    const yaw = Math.atan2(dx, dz)
    queue.push({ kind: 'move', delay, who: a.index, left: dur, to })
    queue.push({ kind: 'turn', delay, who: a.index, left: Math.min(dur, 250), to: yaw })
    if (t.visible && t.state !== 4 && t.state !== 6) t.turnTo = yawTo(t, a)
    return 1
  }

  /**
   * Tag 77, the step in (`func_ov025_021e6a08`): a quarter of the way a pass
   * toward `gap` plus the two radii's mean short of the target, at most 0.2,
   * running; done once a step is no more than 0.2 or what is left is under
   * 0x28/4096. The target turns to face the one stepping in; the one stepping
   * in is not turned. Waited on.
   */
  function stepIn(c: Extract<ActionCommand, { tag: 77 }>): 0 | 1 {
    const a = fighter(actor())
    const t = fighter(target())
    const finish = () => {
      stepping = false
      if (a) {
        a.state = 0
        if (a.motion === 'run') setMotion(a.index, 'stand', 0x10)
      }
      return 1 as const
    }
    if (!a || !t) return finish()
    if (!stepping) {
      stepping = true
      if (t.state !== 4 && t.state !== 6) t.turnTo = yawTo(t, a)
    }
    const stop = c.gap + (a.radius + t.radius) / 2
    const dx = t.x - a.x
    const dz = t.z - a.z
    const dist = Math.hypot(dx, dz)
    if (dist === 0 || dist < stop) return finish()
    const left = dist - stop
    let sx = (dx / dist) * left * 0.25
    let sz = (dz / dist) * left * 0.25
    const step = Math.hypot(sx, sz)
    let idle = false
    if (step > STEP_MOST) {
      sx = (sx / step) * STEP_MOST
      sz = (sz / step) * STEP_MOST
    } else idle = true
    a.x += sx
    a.z += sz
    if (left < STEP_DONE || idle) return finish()
    if (a.state !== 1) {
      a.state = 1
      setMotion(a.index, 'run', 0x10)
    }
    return 0
  }

  /** Tag 79, the formation (`func_ov025_021e6cf4`): everyone placed at once; nobody walks. */
  function formation(c: Extract<ActionCommand, { tag: 79 }>) {
    if (c.mode === 0 || c.mode === 1) {
      for (const f of shows.values()) {
        const at = c.mode === 0 ? f.row : f.grid
        f.x = at.x
        f.z = at.z
        f.facing = f.turnTo = at.facing
      }
      return
    }
    if (c.mode === 2) {
      const a = fighter(actor())
      const t = fighter(target())
      if (!a || !t) return
      const dx = t.x - a.x
      const dz = t.z - a.z
      const d = Math.hypot(dx, dz)
      const dir = d === 0 ? { x: 0, z: 1 } : { x: dx / d, z: dz / d }
      const apart = a.radius / 2 + SQUARED + t.radius / 2
      a.x = (-dir.x * apart) / 2
      a.z = (-dir.z * apart) / 2
      t.x = (dir.x * apart) / 2
      t.z = (dir.z * apart) / 2
      if (c.face) {
        a.facing = a.turnTo = yawTo(a, t)
        t.facing = t.turnTo = yawTo(t, a)
      }
      return
    }
    if (c.mode === 3) {
      const group = resolve(c.who).flatMap((i) => one(shows.get(i)))
      for (const f of group) {
        f.x = f.grid.x
        f.z = f.grid.z
        f.facing = f.turnTo = 0
      }
      squeeze(group, 'x')
      squeeze(group, 'z')
    }
  }

  /** Formation 3's fit along one axis (`func_ov025_021def64`). */
  function squeeze(group: FighterShow[], axis: 'x' | 'z') {
    if (group.length === 0) return
    const sorted = [...group].sort((p, q) => p[axis] - q[axis])
    const first = sorted[0] as FighterShow
    const last = sorted[sorted.length - 1] as FighterShow
    const span = last[axis] + last.radius / 2 - (first[axis] - first.radius / 2)
    const sumR = sorted.reduce((s, f) => s + f.radius, 0)
    if (sorted.length > 1 && span > GROUP_WIDTH) {
      const gaps = sorted
        .slice(1)
        .map(
          (f, i) =>
            f[axis] -
            (sorted[i] as FighterShow)[axis] -
            (f.radius + (sorted[i] as FighterShow).radius) / 2,
        )
      const sumG = gaps.reduce((s, g) => s + g, 0)
      const k = sumR >= GROUP_WIDTH || sumG === 0 ? 0 : (GROUP_WIDTH - sumR) / sumG
      let at = -(sumR + sumG * k) / 2
      sorted.forEach((f, i) => {
        f[axis] = at + f.radius / 2
        at += f.radius + (gaps[i] ?? 0) * k
      })
      return
    }
    const mid = (first[axis] - first.radius / 2 + (last[axis] + last.radius / 2)) / 2
    for (const f of sorted) f[axis] -= mid
  }

  /** Tag 42, a place (`func_ov025_021e514c`), for every object who resolves to. */
  function place(c: Extract<ActionCommand, { tag: 42 }>) {
    const a = fighter(actor())
    const t = fighter(target())
    let p: Vec3 = [0, 0, 0]
    let turn = 0
    const side = (f: FighterShow | undefined, other: boolean) => {
      const party = f !== undefined && isParty(f.index) !== other
      p = [0, 0, party ? SIDE_Z : -SIDE_Z]
      turn = party ? Math.PI : 0
    }
    switch (c.mode) {
      case 1:
        side(a, false)
        break
      case 2:
        side(t, false)
        break
      case 5:
        side(a, true)
        break
      case 6:
        side(t, true)
        break
      case 3: {
        const yaw = options.camera?.().yaw ?? 0
        const [x, y, z] = c.vector
        p = [x * Math.cos(yaw) + z * Math.sin(yaw), y, -x * Math.sin(yaw) + z * Math.cos(yaw)]
        break
      }
      case 4:
      case 11: {
        if (!t) break
        const [x, y, z] = c.vector
        const zz = c.mode === 4 ? z + t.radius / 2 : z - t.radius / 2
        const yy =
          c.mode === 11 && c.useHeight === 1 ? Math.min(Math.max(t.height / 2, c.min), c.max) : y
        p = [
          t.x + x * Math.cos(t.facing) + zz * Math.sin(t.facing),
          yy,
          t.z - x * Math.sin(t.facing) + zz * Math.cos(t.facing),
        ]
        turn = t.facing + Math.PI
        break
      }
      case 7: {
        const on = fighter(resolve(c.extra)[0])
        if (on) {
          p = [on.x, 0, on.z]
          turn = on.facing
        }
        break
      }
      case 10:
        if (a) {
          p = [a.x, a.height / 2, a.z]
          turn = a.facing
        }
        break
      case 8: {
        const cam = options.camera?.()
        if (!cam) break
        const d = [0, 1, 2].map((k) => (cam.eye[k] as number) - (cam.look[k] as number))
        if (c.extra >= 1 && c.extra <= 3) {
          const len = Math.hypot(d[0] as number, d[1] as number, d[2] as number) || 1
          const k = -(c.vector[c.extra - 1] as number) / len
          p = [
            cam.eye[0] + (d[0] as number) * k,
            cam.eye[1] + (d[1] as number) * k,
            cam.eye[2] + (d[2] as number) * k,
          ]
        } else {
          p = [
            cam.look[0] + (d[0] as number) * c.vector[0],
            cam.look[1] + (d[1] as number) * c.vector[1],
            cam.look[2] + (d[2] as number) * c.vector[2],
          ]
        }
        break
      }
      case 9:
        p = c.vector
        turn = c.flip ? Math.PI : 0
        break
    }
    for (const i of resolve(c.who)) {
      const e = effectOf(i)
      if (e) {
        e.offset = p
        e.turn = turn
        continue
      }
      const f = shows.get(i)
      if (f) {
        f.x = p[0]
        f.z = p[2]
        f.facing = f.turnTo = turn
      }
    }
  }

  /** Tag 43 (`func_ov025_021e56e8`): as read, only the first object takes the scale. */
  function scale(c: Extract<ActionCommand, { tag: 43 }>) {
    const e = effectOf(resolve(c.who)[0])
    if (!e) return
    if (c.mode === 0) e.scale = LOOSE_SCALE
    else if (c.mode === 2) {
      const d = options.camera?.().distance ?? 6.5
      e.scale = Math.max(0.065, 0.03 * d - 0.13)
    } else if (c.mode === 3) e.scale = c.scale
    else e.scale = 1
  }

  /** Tag 25 (`func_ov025_021e4624`): an effect launched at half the actor's height, flying to the target. */
  function fly(c: Extract<ActionCommand, { tag: 25 }>): 0 | 1 {
    const a = fighter(actor())
    const t = fighter(target())
    if (!a || !t) {
      flying = undefined
      return 1
    }
    if (flying === undefined) {
      const handle = spawn(c.effect, {
        offset: [a.x, a.height / 2, a.z],
        turn: a.facing,
        // The launch takes the actor's own scale (`GetScale`): a fighter's, `0x10a`.
        scale: LOOSE_SCALE,
        flags: 0,
      })
      if (handle === undefined) return 1
      flying = handle
      flights.set(handle, { dx: 0, dz: 0, speed: c.speed, to: t.index })
      return 0
    }
    const e = effectOf(flying)
    if (!e) {
      flying = undefined
      return 1
    }
    const reach = Math.max((a.height + t.height) / 2, 2 * c.speed)
    if (Math.hypot(t.x - e.offset[0], t.z - e.offset[2]) > reach) return 0
    effects[flying - EFFECT_BASE] = undefined
    flights.delete(flying)
    flying = undefined
    return 1
  }
  const flights = new Map<number, { dx: number; dz: number; speed: number; to: number }>()

  /** Tag 26 (`func_ov025_021e4868`). */
  function motionReached(c: Extract<ActionCommand, { tag: 26 }>): 0 | 1 {
    if (motionStarted) return 0
    if (c.who === 25) return 1
    const objects = resolve(c.who)
    if (objects.length !== 1) return 1
    const index = objects[0] as number
    const e = effectOf(index)
    if (e) {
      const length = timings.effectMs(e.file, e.motion)
      const t = length === undefined || length <= 0 ? 1 : Math.min(1, e.at / length)
      return c.point >= 1 ? (t >= 1 ? 1 : 0) : t >= c.point ? 1 : 0
    }
    const f = shows.get(index)
    if (!f) return 1
    const length = timings.motionMs(f.index, f.motion)
    if (c.point < 1) return normalized(f, length) >= c.point ? 1 : 0
    return motionEnded(f, length) ? 1 : 0
  }

  /** A motion's end as `26` and `85` see it: stopped, or one of the idles that loop. */
  function motionEnded(f: FighterShow, length: number | undefined): boolean {
    if (length === undefined) return true
    if ((f.motionFlags & 1) === 0) return IDLES.has(f.motion) || f.motionAt >= length
    return f.motionAt >= length
  }

  function camera(c: Extract<ActionCommand, { tag: CameraCommand['tag'] }>) {
    const follow = c.tag === 39 ? resolve(c.who) : undefined
    emit({
      kind: 'camera',
      command: {
        ...c,
        actor: actor(),
        target: target(),
        ...(follow && follow.length === 1 ? { follow: follow[0] } : {}),
      } as CameraCommand,
    })
    if (c.tag === 12 && c.mode !== 1 && c.mode !== 2 && c.mode !== 10) cameraMoved = true
    if (c.tag === 48 || c.tag === 49 || c.tag === 50 || c.tag === 86 || c.tag === 87)
      cameraMoved = true
    if (c.tag === 12 && !opened) {
      opened = true
      reactions.open()
      const a = actor()
      emit({ kind: 'start-sound', sound: a !== undefined && isParty(a) ? 7 : 8 })
    }
  }

  let effectiveNow = 0

  function advance(ms: number) {
    for (const f of shows.values()) {
      // Through a blend the new motion stands still, and the one left weighs
      // less by its share of the time left (`AdvanceAnimations_v1`).
      if (f.blend) {
        if (f.blend.left < ms) f.blend = undefined
        else {
          f.blend.weight -= f.blend.weight * (ms / f.blend.left)
          f.blend.left -= ms
          if (f.blend.left <= 0) f.blend = undefined
        }
      } else f.motionAt += ms
      if (f.fade) {
        const next = f.alpha + f.fade.perMs * ms
        const reached = f.fade.perMs >= 0 ? next >= f.fade.to : next <= f.fade.to
        f.alpha = reached ? f.fade.to : next
        if (reached) f.fade = undefined
      }
      if (f.turnTo !== f.facing && f.state !== 4 && f.state !== 6) {
        let d = f.turnTo - f.facing
        while (d > Math.PI) d -= 2 * Math.PI
        while (d < -Math.PI) d += 2 * Math.PI
        const most = f.turnRate * TICK
        f.facing = Math.abs(d) <= most ? f.turnTo : f.facing + Math.sign(d) * most
      }
      if (f.flash > 0) f.flash = Math.max(0, f.flash - ms)
      if (f.shake) {
        f.shake.left -= ms
        if (f.shake.left <= 0) f.shake = undefined
      }
      // A dying fighter lies dead when its `death` ends (state 4 → 6, `func_020332ac`).
      if (f.state === 4) {
        const length = timings.motionMs(f.index, f.motion)
        if (length === undefined || f.motionAt >= length) {
          f.state = 6
          // A monster lying dead fades to nothing over 500 ms, effect 2 at its
          // shadow and sound 50 (`func_02048690`).
          if (isMonster(f.index)) {
            f.fade = { to: 0, perMs: -f.alpha / 500 }
            // Its scale the loose one by the monster's size, beyond 1 halved.
            spawn(2, {
              offset: [f.x, 0, f.z],
              scale: LOOSE_SCALE * (1 + (f.size - 1) / 2),
              flags: 1,
            })
            emit({ kind: 'sound', from: 'battle', sound: 50 })
          }
        }
      }
    }
    for (let i = queue.length - 1; i >= 0; i--) {
      const q = queue[i] as Queued
      if (q.delay > 0) {
        q.delay -= ms
        continue
      }
      const f = shows.get(q.who)
      if (!f) {
        queue.splice(i, 1)
        continue
      }
      if (q.kind === 'move') {
        if (q.left <= ms) {
          f.x = q.to.x
          f.z = q.to.z
          queue.splice(i, 1)
        } else {
          f.x += (q.to.x - f.x) * (ms / q.left)
          f.z += (q.to.z - f.z) * (ms / q.left)
          q.left -= ms
        }
      } else if (q.left <= ms) {
        f.facing = f.turnTo = q.to
        queue.splice(i, 1)
      } else {
        let d = q.to - f.facing
        while (d > Math.PI) d -= 2 * Math.PI
        while (d < -Math.PI) d += 2 * Math.PI
        f.facing = f.turnTo = f.facing + d * (ms / q.left)
        q.left -= ms
      }
    }
    for (let k = 0; k < effects.length; k++) {
      const e = effects[k]
      if (!e) continue
      e.at += ms
      const flight = flights.get(e.handle)
      if (flight) {
        const t = shows.get(flight.to)
        if (t) {
          const dx = t.x - e.offset[0]
          const dz = t.z - e.offset[2]
          const d = Math.hypot(dx, dz) || 1
          e.offset = [
            e.offset[0] + (dx / d) * flight.speed,
            e.offset[1],
            e.offset[2] + (dz / d) * flight.speed,
          ]
        }
      }
      if ((e.flags & 1) === 1) {
        const length = timings.effectMs(e.file, e.motion)
        if (length === undefined || e.at >= length) effects[k] = undefined
      }
    }
  }

  return {
    get scriptDone() {
      return done
    },
    get ended() {
      return (
        done &&
        reactions.idle() &&
        reactions.settled() &&
        !effects.some((e) => e !== undefined) &&
        ![...shows.values()].some(
          (f) => f.state === 3 || f.state === 4 || (f.fade !== undefined && f.state === 6),
        )
      )
    },
    fighters: shows,
    effects,
    get speed() {
      return speed
    },
    get stageShown() {
      return stageShown
    },
    hooks,
    pass(realMs: number) {
      events = []
      // The hit-stop counts real time: its delay, then its length at its speed (`func_ov000_02160620`).
      if (speedHold) {
        if (speedHold.after > 0) {
          speedHold.after -= realMs
          speed = 1
        } else if (speedHold.left > 0) {
          speedHold.left -= realMs
          speed = speedHold.speed
        } else {
          speedHold = undefined
          speed = 1
        }
      }
      const ms = realMs * speed
      effectiveNow = ms
      // The line goes up with the action's first camera, or when the battle's
      // state 6 hands over (`func_ov025_021dc324`) — whichever comes first.
      // What brings state 6 is not read. **Ours**: a script with no camera
      // before its first reaction — a blow's — puts its line up as it starts.
      if (!opened && !cameraFirst) {
        opened = true
        reactions.open()
      }
      while (!done) {
        const c = commands[at]
        if (!c) {
          done = true
          break
        }
        if (skip !== 0) {
          if (!('unread' in c) && c.tag === 10 && c.id === skip) skip = 0
          at++
          continue
        }
        if (c.tag === 11) {
          done = true
          break
        }
        const r = play(c)
        if (r === 0) break
        at++
        if (r === -1) break
      }
      reactions.pass(ms)
      motionStarted = false
      advance(ms)
      return events
    },
  }

  function effectPath(n: number): string {
    return effectFileOf(n) ?? ''
  }

  function yawTo(from: FighterShow, to: FighterShow) {
    return Math.atan2(to.x - from.x, to.z - from.z)
  }
}

/**
 * An effect's file by its number (`func_ov025_021e278c`, the formats at
 * `data_ov025_021ef520`): the millions pick `em`, `et`, `eb` (four digits),
 * `b` or `z` (six). 3000500 is `effect/eb0500.chr`; 0 is no file.
 */
export function effectFileOf(n: number): string | undefined {
  const kind = Math.floor(n / 1_000_000)
  const rest = n % 1_000_000
  const name = ['', 'em', 'et', 'eb', 'b', 'z'][kind]
  const digits = [0, 4, 4, 4, 6, 6][kind]
  if (!name || !digits) return undefined
  return `effect/${name}${String(rest).padStart(digits, '0')}.chr`
}
