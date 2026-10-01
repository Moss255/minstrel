import type { ActionCommand } from '@minstrel/game-formats'
import { isParty, LOOSE_SCALE, type Reactions, type RunHooks } from './action-player.ts'

/**
 * **The reactions an action's results are shown with** — the record a script
 * fills between `61` and `62`, the queue it goes into, and what is shown on
 * each one struck. Read from overlay 25 on 1 October 2026 (USA release;
 * FORMAT.md, "The action scripts", "The reaction").
 *
 * - **The record** (`+0x540`): the hold (`63`), the effect's time (`64`), the
 *   first result's (`65`), the effect on the one struck (`66`, raised by half
 *   their height with `68 1`, scaled by `117`, offset by `118`), the sound
 *   (`71` at `72`'s time), a close-up first (`78`), and which lists (`93`).
 * - **The queue** (`func_ov025_021ecc54`, played by `021ebb90`): one entry for
 *   each with something to show, **one entry at a time**; within it the
 *   effect, the sound and the results each at their time, and **each result
 *   waits until its lines are down**. An entry stays its hold before the next
 *   starts, never after the last.
 * - **What is shown on the one struck** (`func_ov025_021d8c30`) is the
 *   result's own flags, not the script's: see {@link present}.
 * - **The message box** (action-player `+0x5e8`): one line up at a time, each
 *   replacing the last, each up for 750 ms (`128`) once typed — 16 letters a
 *   step — counted in effective time; the opening line goes up with the
 *   action's first camera.
 *
 * Each result is described here by the game's own flag numbers (`func_ov000_
 * 0215fd90`); **which of our battle's outcomes carries which flag is the
 * caller's**, from overlay 24's writers — see `action-show.ts`.
 */

/** A result as the presenter reads it: its flag numbers, its amount, and the lines it says. */
export interface ShownResult {
  /** The flag numbers set — 1 damage, 2 killed, 3 revived, 5 dodged, 6 guarded, 13 died, 37 recovered, … */
  readonly flags: ReadonlySet<number>
  /** The amount at `+0x0c`: damage dealt, or a recovery (shown as its negative). */
  readonly amount: number
  /** `+0x1c` — INFERRED a critical. */
  readonly critical: boolean
  /** The lines it says, in order. */
  readonly lines: readonly string[]
  /** The combo chain's count it was multiplied by — see the simulation's `combo.ts`; none for 0. */
  readonly combo?: number
}

/** The action's results, as the reactions show them. */
export interface ActionResults {
  /** The line the action opens with — its `actmsg` message, `sa+0x18`. */
  readonly opening: string | undefined
  /** For each target, the receiver's results (list B). */
  readonly targets: readonly {
    readonly receiver: number
    readonly results: readonly ShownResult[]
  }[]
  /** The one acting's own results (list A), shown after the targets'. */
  readonly own: readonly ShownResult[]
  /** Result codes per target slot (`+0x14…+0x16`): 3 a counter, 6/7/8 … — none here yet. */
  readonly codes?: readonly (readonly number[])[]
}

/** The battle's own effects, registered as it is set up (`func_ov000_02166a94`) from `data/bin/btarc.nsarc`. */
export const BUILT_IN_EFFECTS: ReadonlyMap<number, string> = new Map([
  [1, 'bin/btarc.nsarc/eb0000.chr'],
  [2, 'bin/btarc.nsarc/eb0100.chr'],
  [3, 'bin/btarc.nsarc/eb0010.chr'],
  [14, 'bin/btarc.nsarc/eb0280.chr'],
  [28, 'bin/btarc.nsarc/eb0290.chr'],
])

/** What a result's line, on show, says and how long it has left. */
export interface LineShow {
  readonly text: string
  /** Letters typed so far. */
  typed: number
  /** Effective ms left once typed. */
  left: number
}

/** A line waiting its turn: whom it is about (the result, or none for the opening) and its time. */
interface QueuedLine {
  readonly text: string
  readonly key: ShownResult | undefined
  readonly ms: number | undefined
}

/** The record `61` opens. */
interface ReactionRecord {
  hold: number
  effectAt: number
  resultsAt: number
  effect: number
  altEffect: number
  placement: number
  sound: number
  altSound: number
  soundAt: number
  closeUp: number
  lists: number
  scale: { mode: number; a: number; b: number } | undefined
  offset: { mode: number; vector: readonly [number, number, number] } | undefined
}

/** One entry of the queue: a fighter with something to show. */
interface Entry {
  readonly kind: 0 | 1 | 2 | 3
  readonly receiver: number
  readonly results: readonly ShownResult[]
  readonly record: ReactionRecord
  /** The entry's clock and its results' own clock, effective ms. */
  clock: number
  resultClock: number
  shown: number
  closedUp: boolean
  effectDone: boolean
  soundDone: boolean
  /** The result whose lines are being waited on. */
  waiting: ShownResult | undefined
}

/** How long a line stays once typed unless `128` says otherwise (`func_ov025_021ed124`). */
export const LINE_MS = 750
/** Letters typed a step (`W+0x19c5` = 1). **Ours**: a step a pass. */
const LETTERS_A_STEP = 16
/** A line with less than this left gives way at once to a result's (`0x021ea7a4`). */
const CUT_SHORT = 500

const fresh = (): ReactionRecord => ({
  hold: 0,
  effectAt: 0,
  resultsAt: 0,
  effect: -1,
  altEffect: -1,
  placement: 0,
  sound: -1,
  altSound: -1,
  soundAt: 0,
  closeUp: 0,
  lists: 0,
  scale: undefined,
  offset: undefined,
})

/** What the reactions hand the caller as they play, besides the run's own events. */
export type ReactionEvent =
  | {
      readonly kind: 'number'
      readonly fighter: number
      readonly value: number
      readonly numberKind: 0 | 1 | 2 | 3 | 4
      readonly index: number
    }
  | { readonly kind: 'close-up'; readonly fighter: number }
  /** The combo display, at the action's first damage number (`0x021da794`): its level, 0 to send it away. */
  | { readonly kind: 'combo'; readonly level: number }
  | { readonly kind: 'shake-camera'; readonly amplitude: number; readonly ms: number }

/**
 * The reactions for one action: built with the run's hooks, the results, and
 * where to put what is shown.
 */
export function makeReactions(
  hooks: RunHooks,
  results: ActionResults,
  out: (event: ReactionEvent) => void,
): Reactions & { readonly line: LineShow | undefined; readonly idleNow: boolean } {
  let record: ReactionRecord | undefined
  const queue: Entry[] = []
  const lines: QueuedLine[] = []
  let line: (LineShow & { key: ShownResult | undefined }) | undefined
  let lineMs = LINE_MS
  let pause = false
  /** `55`'s: the struck's effect, the battle's sound, and the action's own. */
  let hitEffect = 1
  let hitSound = 30
  let ownSound = -1
  let openingSaid = false
  /** Whether the action's first damage number has been put up — the combo display's one start. */
  let comboStarted = false
  const actor = hooks.context.actors[0]

  const say = (text: string, key: ShownResult | undefined, ms?: number) => {
    lines.push({ text, key, ms })
  }

  /** Whether a result's lines are all down (`func_ov025_021ee438`). */
  const linesDone = (key: ShownResult) => line?.key !== key && !lines.some((l) => l.key === key)

  function submit() {
    const r = record ?? fresh()
    record = undefined
    const kindOf = (): 1 | 2 | 3 => ((r.lists & 0x10) !== 0 ? 2 : (r.lists & 0x20) !== 0 ? 3 : 1)
    if ((r.lists & 2) === 0) {
      for (const t of results.targets) {
        if (t.results.length === 0) continue
        queue.push(entryOf(kindOf(), t.receiver, t.results, r))
      }
    }
    if ((r.lists & 1) === 0 && actor !== undefined && results.own.length > 0) {
      queue.push(entryOf(0, actor, results.own, r))
    }
  }

  const entryOf = (
    kind: Entry['kind'],
    receiver: number,
    rs: readonly ShownResult[],
    r: ReactionRecord,
  ): Entry => ({
    kind,
    receiver,
    results: rs,
    record: r,
    clock: 0,
    resultClock: 0,
    shown: 0,
    closedUp: false,
    effectDone: r.effect < 0,
    soundDone: r.sound < 0,
    waiting: undefined,
  })

  /** The opening line, once an action, with its first camera (`func_ov025_021ea474`). */
  function open() {
    if (openingSaid) return
    openingSaid = true
    if (results.opening) say(results.opening, undefined)
  }

  /** One pass of the head entry (`func_ov025_021ebb90`). */
  function playHead(ms: number) {
    const e = queue[0]
    if (!e) return
    if (pause && hooks.effectPlaying()) return
    const t0 = e.clock
    if (!e.closedUp) {
      e.closedUp = true
      if (e.record.closeUp === 1) {
        out({ kind: 'close-up', fighter: e.receiver })
        const f = hooks.fighter(e.receiver)
        if (f) f.visible = true
      }
    }
    if (!e.effectDone && e.record.effectAt < t0 + ms) {
      e.effectDone = true
      const alt = e.record.altEffect >= 0 && e.results[0]?.flags.has(3)
      reactionEffect(e, alt ? e.record.altEffect : e.record.effect)
    }
    if (!e.soundDone && e.record.soundAt < t0 + ms) {
      e.soundDone = true
      const alt = e.record.altSound >= 0 && e.results[0]?.flags.has(3)
      hooks.emit({ kind: 'sound', from: 'own', sound: alt ? e.record.altSound : e.record.sound })
    }
    if (e.waiting && !linesDone(e.waiting)) {
      e.clock += ms
      return
    }
    e.waiting = undefined
    if (e.shown < e.results.length && e.resultClock >= e.record.resultsAt) {
      const r = e.results[e.shown] as ShownResult
      present(e, r, e.shown)
      e.shown++
      e.waiting = r
    } else if (e.shown < e.results.length) e.resultClock += ms
    e.clock += ms
    if (e.shown >= e.results.length && !e.waiting && e.effectDone && e.soundDone) {
      // Freed at once when it is the only one, else once its hold is through.
      if (queue.length === 1 || e.clock >= e.record.hold) queue.shift()
    }
  }

  /** `66`'s effect on the one struck, raised by `68 1`, scaled by `117`, offset by `118` (`0x021ec244`–`0x021ec7cc`). */
  function reactionEffect(e: Entry, id: number) {
    if (id < 0) return
    const f = hooks.fighter(e.receiver)
    if (!f) return
    let y = (e.record.placement & 1) !== 0 ? f.height / 2 : 0
    let x = 0
    let z = 0
    let scale = 1
    if (e.record.scale) {
      // Mode 0 by the monster's size (`func_ov000_0216352c`), which is not read here: 1. **Ours.**
      scale = e.record.scale.mode === 0 ? 1 : Math.min(f.radius, e.record.scale.b)
    }
    const o = e.record.offset
    if (o) {
      if (o.mode === 0 || o.mode === 2) [x, y, z] = o.vector
      else if (o.mode === 3) z = f.radius * o.vector[0]
      else if (o.mode === 1 || o.mode === 4) {
        // A length toward the one acting; the turn's exact angle is not read.
        const a = actor !== undefined ? hooks.fighter(actor) : undefined
        const len = o.vector[0]
        const yaw = a ? Math.atan2(a.x - f.x, a.z - f.z) - f.facing : 0
        const dx = Math.sin(yaw) * len
        const dz = Math.cos(yaw) * len
        if (o.mode === 4) {
          x += dx
          z += dz
        } else {
          x = dx
          y = 0
          z = dz
        }
      }
    }
    hooks.spawn(id, { host: e.receiver, offset: [x, y, z], scale, flags: 1 })
  }

  /**
   * **One result shown** (`func_ov025_021d8c30`), by its flags in the order
   * the game tests them. Every sound here is the battle's archive 101's.
   */
  function present(e: Entry, r: ShownResult, index: number) {
    const who = e.receiver
    const f = hooks.fighter(who)
    for (const text of r.lines) say(text, r)
    if (!f) return
    const sound = (n: number) => hooks.emit({ kind: 'sound', from: 'battle', sound: n })
    const flags = r.flags
    if (flags.has(6)) {
      spawnAt(28, f, e)
      sound(57)
      hooks.setMotion(who, 'guard', 0x10)
    }
    if ((flags.has(4) || flags.has(5) || flags.has(38)) && !flags.has(13)) {
      sound(isParty(who) ? 54 : 55)
      if (flags.has(5)) {
        if (f.motion !== 'sake') hooks.setMotion(who, 'sake', 1)
      } else f.shake = { amplitude: 0.05, left: 300 }
    }
    if (flags.has(43)) hooks.setMotion(who, 'damage', 1)
    if (flags.has(35) || flags.has(7)) {
      const worth = flags.has(7) ? 100 : ([0, 5, 20, 50][r.amount] ?? 0)
      out({ kind: 'number', fighter: who, value: worth, numberKind: 4, index })
    }
    if (flags.has(3)) {
      f.alive = true
      f.visible = true
      f.alpha = 31
      f.state = 0
    }
    const killed = (flags.has(1) && flags.has(2)) || flags.has(13)
    if (killed) die(e, who)
    else if (flags.has(36)) {
      hooks.setMotion(who, 'escape', 1)
      f.fade = { to: 0, perMs: -31 / 500 }
      sound(9)
    }
    if (flags.has(1) && !flags.has(41)) {
      if (!killed) {
        // The flash: one frame for a monster; the party's parts by a timer of 100.
        f.flash = isParty(who) ? 100 : 2
        if (f.motion !== 'sake') hooks.setMotion(who, 'damage', 9)
      }
      let hit = hitSound
      if (hit >= 0 && isParty(who) && !(hit >= 60 && hit <= 65)) hit = 31
      if (r.critical) hit = actor !== undefined && isParty(actor) ? 38 : 39
      if (hit >= 0) sound(hit)
      else if (ownSound >= 0) hooks.emit({ kind: 'sound', from: 'own', sound: ownSound })
      out({
        kind: 'number',
        fighter: who,
        value: r.amount,
        numberKind: flags.has(42) ? 1 : 0,
        index,
      })
      if (!comboStarted) {
        comboStarted = true
        out({ kind: 'combo', level: Math.min(r.combo ?? 0, 3) })
      }
      if (r.critical && (hooks.context.action === 1 || hooks.context.action === 2)) {
        hooks.emit({ kind: 'lights', level: 0.5, ms: 300 })
        out({ kind: 'shake-camera', amplitude: 0.05, ms: 1000 })
        hooks.hitStop(0.1, 700, 150)
      }
      const effect = r.critical && actor !== undefined && isParty(actor) ? 3 : hitEffect
      if (effect > 0) hitEffectOn(effect, who)
    }
    if (flags.has(37) || flags.has(34)) {
      out({
        kind: 'number',
        fighter: who,
        value: Math.abs(r.amount),
        numberKind: flags.has(34) ? 3 : 2,
        index,
      })
      if (e.kind === 0) sound(101)
    }
  }

  /** A death (`0x021d9fb4`): state 4 plays `death`; for a target, the lights, a hit-stop, effect 27 and sound 66. */
  function die(e: Entry, who: number) {
    const f = hooks.fighter(who)
    if (!f) return
    f.alive = false
    f.state = 4
    hooks.setMotion(who, 'death', 1)
    if (e.kind !== 0) {
      hooks.emit({ kind: 'lights', level: 0.5, ms: 300 })
      hooks.hitStop(0.1, 600, 150)
      spawnAt(27, f, e)
      hooks.emit({ kind: 'sound', from: 'battle', sound: 66 })
    }
  }

  function spawnAt(id: number, f: { readonly radius: number; readonly index: number }, _e: Entry) {
    hooks.spawn(id, { host: f.index, offset: [0, 0, f.radius / 2], flags: 1 })
  }

  /**
   * **The hit effect** (`0x021da884`–`0x021dad98`), free-standing on the
   * receiver's surface facing the one acting: half its radius toward them, and
   * raised by 0.6 of its height on one of the party, else by a quarter of the
   * two heights — held at 0.8 of the actor's height.
   */
  function hitEffectOn(id: number, who: number) {
    const t = hooks.fighter(who)
    const a = actor !== undefined ? hooks.fighter(actor) : undefined
    if (!t) return
    let dx = 0
    let dz = 1
    if (a && a !== t && a.visible) {
      const d = Math.hypot(a.x - t.x, a.z - t.z) || 1
      dx = (a.x - t.x) / d
      dz = (a.z - t.z) / d
    } else {
      dx = Math.sin(t.facing)
      dz = Math.cos(t.facing)
    }
    let y = isParty(who) ? 0.6 * t.height : ((a?.height ?? t.height) + t.height) / 4
    if (a) y = Math.min(y, 0.8 * a.height)
    hooks.spawn(id, {
      host: undefined,
      offset: [t.x + (dx * t.radius) / 2, y, t.z + (dz * t.radius) / 2],
      turn: t.facing,
      // The striker's own scale (`Object3D::GetScale`, `0x021dad50`): a fighter's, `0x10a`.
      scale: LOOSE_SCALE,
      flags: 1,
    })
  }

  /** The message box's pass (`func_ov025_021ed634`): type, count down once typed, then the next line. */
  function linesPass(ms: number) {
    if (line) {
      if (line.typed < line.text.length)
        line.typed = Math.min(line.text.length, line.typed + LETTERS_A_STEP)
      else {
        line.left -= ms
        if (line.left <= 0) line = { ...line, key: undefined, left: 0 }
      }
    }
    const lineDown = !line || (line.typed >= line.text.length && line.left <= 0)
    const next = lines[0]
    const cut =
      next?.key !== undefined &&
      line !== undefined &&
      line.typed >= line.text.length &&
      line.left < CUT_SHORT &&
      lines.length === 1
    if (next && (lineDown || cut)) {
      lines.shift()
      line = { text: next.text, typed: 0, left: next.ms ?? lineMs, key: next.key }
    }
  }

  const api = {
    get line(): LineShow | undefined {
      return line
    },
    get idleNow() {
      return lines.length === 0 && (!line || (line.typed >= line.text.length && line.left <= 0))
    },
    record(c: ActionCommand) {
      if ('unread' in c) return
      if (c.tag === 61) {
        record = fresh()
        return
      }
      if (c.tag === 55) {
        hitEffect = c.effect
        hitSound = c.sound
        ownSound = c.ownSound
        return
      }
      if (c.tag === 95) {
        pause = c.value !== 0
        return
      }
      if (!record) record = fresh()
      const r = record
      switch (c.tag) {
        case 63:
          r.hold = c.ms
          break
        case 64:
          r.effectAt = c.ms
          break
        case 65:
          r.resultsAt = c.ms
          break
        case 66:
          r.effect = c.id
          break
        case 68:
          r.placement = c.flags
          break
        case 71:
          r.sound = c.sound
          break
        case 72:
          r.soundAt = c.ms
          break
        case 78:
          r.closeUp = c.value
          break
        case 93:
          r.lists = c.bits
          break
        case 109:
          r.altEffect = c.value
          break
        case 110:
          r.altSound = c.value
          break
        case 117:
          r.scale = { mode: c.mode, a: c.a, b: c.b }
          break
        case 118:
          r.offset = { mode: c.mode, vector: [c.vector[0], c.vector[1], c.vector[2]] }
          break
      }
    },
    submit,
    settled() {
      return (
        queue.length === 0 &&
        ![...hooks.resolve(24)].some((i) => hooks.fighter(i)?.state === 4) &&
        !hooks.effectPlaying()
      )
    },
    pass(ms: number) {
      playHead(ms)
      linesPass(ms)
    },
    open,
    idle() {
      return api.idleNow && queue.length === 0
    },
    lineMs(ms: number, now: boolean) {
      if (!now) lineMs = ms
      else if (line) line.left = ms
    },
    skips(type: number): boolean {
      const all = results.targets.flatMap((t) => t.results)
      if (type === 8) return results.own.length > 0
      // Types 7, 10, 11 and the rest test result codes and flag bits this battle does not yet carry.
      if (type === 16 || type === 22) return all.some((r) => r.flags.has(7))
      return false
    },
  }
  return api
}
