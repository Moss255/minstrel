/**
 * **Climbing a ladder or a vine**, translated from the game's own code (US
 * ARM9 and overlay 17, read 6 October 2026; the whole reading is
 * `docs/readings/T16-getting-around.md`):
 *
 * - **Starting** (`func_ov017_021975e4`, the field's first check each pass):
 *   standing in an end's box, facing it from below or away from it above, and
 *   pushing along it three passes running. See {@link tryClimb}.
 * - **Climbing** (`func_02038598`, the Hero's update each pass): turn to the
 *   end, get on by `hasigo_in`, climb by `hasigo_loop` with Up and Down, get
 *   off at the top by `hasigo_out`, and walk off — or leave the map by an end
 *   that leads out. See {@link climbPass}.
 *
 * Everything is in the cartridge's own units, as **raw `fx32` words** — 4096
 * is one — and its angles × 4096, the way the game keeps them; the caller
 * converts at the boundary. **Ours**: the sines and cosines are `Math.sin` and
 * `Math.cos` rounded to a word, not the game's table, and only their signs and
 * their comparison with 0.8 are used.
 */

/** π and 2π as the game's angles are held: radians × 4096 (`0x3244`, `0x6488`). */
const PI = 0x3244
const TWO_PI = 0x6488

/** Up the ladder each pass, and down (`0xf5`, `0x02038a7c`–`0x02038a98`). */
export const CLIMB_STEP = 0xf5
/** How far below the top's centre the climb stops: one (`− 0x1000`, `0x02197968`). */
export const TOP_BELOW = 0x1000
/** Getting on: the place is the bottom this far up (`0x51`), or the top this far down (`0xa3`). */
export const ON_ABOVE_BOTTOM = 0x51
export const ON_BELOW_TOP = 0xa3
/** Getting off at the top, the part of the way to the top's height taken each pass (`0x199`). */
export const OFF_RISE = 0x199
/** Walking off, a pass's distance — `+0xb4`, every object's own unless set (`0x189`, `func_02032e58`). INFERRED unchanged for the Hero. */
export const WALK_OFF = 0x189
/** `|l·f|` or `|l·p|` past this counts as pushing along the ladder (`0xccc`, 0.8). */
export const ALONG = 0xccc
/**
 * A pass's animation delta: `4096 × (33 / 17)`, truncated — the field's pass
 * is two vblanks, 33 ms (`GameState::CalculateDeltaTime`).
 */
export const PASS_DELTA = Math.trunc(4096 * (33 / 17))

/** The three motions a climb plays, by the names the figures carry. */
export const LADDER_MOTIONS = ['hasigo_in', 'hasigo_loop', 'hasigo_out'] as const
export type LadderMotion = (typeof LADDER_MOTIONS)[number]

/** What the caller knows of a motion: its frames, and its `.bcfg` speed as a word. */
export interface MotionLength {
  readonly frames: number
  /** The record's frame rate × 4096. */
  readonly speed: number
}

/** A point, in raw `fx32` words. */
export interface Point {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** One end of a ladder, as the climb wants it — raw words, the facing × 4096. */
export interface End extends Point {
  readonly id: number
  readonly partner: number
  readonly top: boolean
  /** The ladder's facing, × 4096 (`+0x20`). */
  readonly facing: number
  /** Whether leaving by this end changes map (flag bit 1). */
  readonly leaves: boolean
}

/** Where the Hero is, as the climb sees them: raw words, the facing × 4096 in 0..2π. */
export interface Hero extends Point {
  readonly facing: number
}

/**
 * **The climb**, the record the game keeps at the Hero's `+0x26c`
 * (`func_020398b4`), and the motion the Hero is playing, which the climb
 * reads back — its time, its direction and whether it has ended.
 */
export interface Climb {
  /** `+0x01`: 0 turn to it, 1 get on, 2 climb, 4 get off at the top, 5 walk off, 6 leave the map. */
  readonly step: 0 | 1 | 2 | 4 | 5 | 6
  /** `+0x03`: started from the top. */
  readonly fromTop: boolean
  /** `+0x06`: the facing on the ladder, the starting end's. */
  readonly facing: number
  /** `+0x08`: the facing leaving at the bottom, the bottom's − π. */
  readonly bottomFacing: number
  /** `+0x0a`: the facing leaving at the top, the top's. */
  readonly topFacing: number
  /** `+0x0c`: the bottom's centre. */
  readonly bottom: Point
  /** `+0x18`: the top's centre, {@link TOP_BELOW} lower. */
  readonly top: Point
  /** `+0x24`: where a move began. */
  readonly from: Point
  /** `+0x30`: where it is left at the bottom, `b − d/4`. */
  readonly bottomExit: Point
  /** `+0x3c`: where it is left at the top, `t + d`. */
  readonly topExit: Point
  /** `+0x48`: the loop's time when the Hero last stopped on it. */
  readonly saved: number
  /** `+0x53`: whether the pad is read. */
  readonly padRead: boolean
  /** `+0x58`, `+0x5c`: the two ends. */
  readonly bottomEnd: End
  readonly topEnd: End
  /** `+0x60`: the end the Hero leaves the map by, at step 6. */
  readonly leaveBy?: End
  /** Where the walk off goes, and at what pace (`+0xc8`, `+0xc6`); 0 once there. */
  readonly walkTo?: Point
  readonly walkSpeed: number
  /** The motion playing, and its time × 4096. */
  readonly motion: LadderMotion | 'run'
  readonly time: number
  readonly reverse: boolean
  readonly once: boolean
  /** Set by a change of motion; the next advance only clears it (`unknown_40_bit_1_`). */
  readonly fresh: boolean
  /** The motion has played to its end, not looping (`animationEnded_`). */
  readonly ended: boolean
  /** Held where it is, not advanced (`Object3D` flag `0x1000`). */
  readonly paused: boolean
}

/** `(a × b + 0x800) >> 12`, as the game's `smull` rounds (`FIX32_MULTIPLY`). */
function mulRound(a: number, b: number): number {
  return Math.floor((a * b + 0x800) / 4096)
}

/** `fix32_Divide`: `(a << 12) / b`, toward zero. */
function divide(a: number, b: number): number {
  return b === 0 ? 0 : Math.trunc((a * 4096) / b)
}

/** An angle × 4096 into 0..2π (`fix32ReduceAngle0To2Pi`). */
export function reduceAngle(angle: number): number {
  return ((angle % TWO_PI) + TWO_PI) % TWO_PI
}

/** A facing as a unit direction across the ground: `(sin, cos)`, rounded to words. Ours — see the module. */
function direction(angle: number): { x: number; z: number } {
  const radians = angle / 4096
  return { x: Math.round(Math.sin(radians) * 4096), z: Math.round(Math.cos(radians) * 4096) }
}

/** `Vector3fix_InnerProduct` across the ground. */
function dot(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return mulRound(a.x, b.x) + mulRound(a.z, b.z)
}

/**
 * **Whether a climb starts this pass** (`func_ov017_021975e4`), and the count
 * it keeps (`field+0x42ee`). `ends` are the map's in the order its table has
 * them; `pad` is the +Control Pad's direction in the world, unit length as
 * words, or zero; `walking` is the Hero's state 1; `free` is false while B or
 * X is held, the field is busy or something holds the Hero, and the check is
 * then not made at all.
 */
export function tryClimb(
  ends: readonly End[],
  inBox: (end: End) => boolean,
  hero: Hero,
  pad: { x: number; z: number },
  walking: boolean,
  free: boolean,
  count: number,
): { readonly count: number; readonly climb?: Climb } {
  if (!free) return { count }
  let held = count
  for (const end of ends) {
    if (!inBox(end)) continue
    const l = direction(end.facing)
    const facing = dot(l, direction(hero.facing))
    const pushed = dot(l, pad)
    // From below the Hero faces it; from above, away from it.
    if (end.top ? facing >= 0 : facing <= 0) continue
    let start = false
    if (held <= 1) {
      if (walking && (pushed < -ALONG || pushed > ALONG || facing < -ALONG || facing > ALONG))
        held++
      else held = 0
    } else {
      held = 0
      start = true
    }
    if (!start) continue
    const other = ends.find((e) => e.id === end.partner)
    if (!other) return { count: held }
    return { count: held, climb: begin(end, other, hero) }
  }
  return { count: held }
}

/** The climb's record, as `0x02197878`–`0x02197a3c` fills it. */
function begin(start: End, other: End, hero: Hero): Climb {
  const bottom = start.top ? other : start
  const top = start.top ? start : other
  const d = direction(start.facing)
  return {
    step: 0,
    fromTop: start.top,
    facing: start.facing,
    bottomFacing: reduceAngle(bottom.facing - PI),
    topFacing: top.facing,
    bottom: { x: bottom.x, y: bottom.y, z: bottom.z },
    top: { x: top.x, y: top.y - TOP_BELOW, z: top.z },
    from: { x: hero.x, y: hero.y, z: hero.z },
    bottomExit: { x: bottom.x + (-d.x >> 2), y: bottom.y, z: bottom.z + (-d.z >> 2) },
    topExit: { x: top.x + d.x, y: top.y, z: top.z + d.z },
    saved: 0,
    padRead: true,
    bottomEnd: bottom,
    topEnd: top,
    walkSpeed: 0,
    motion: 'run',
    time: 0,
    reverse: false,
    once: false,
    fresh: false,
    ended: false,
    paused: false,
  }
}

/** What a pass of climbing did. */
export interface ClimbPass {
  /** The climb still going, or none when it is over. */
  readonly climb?: Climb
  readonly hero: Hero
  /** Set at step 6: leave the map by this end. */
  readonly leave?: End
}

/** `MaybeSetRegularAnimation`: a change of motion or of direction starts it again. */
function setMotion(climb: Climb, motion: LadderMotion, flags: number, length: MotionLength): Climb {
  const reverse = (flags & 4) !== 0
  if (climb.motion === motion && climb.reverse === reverse) return climb
  return {
    ...climb,
    motion,
    reverse,
    once: (flags & 1) !== 0,
    time: reverse ? Math.max(0, length.frames - 1) * 4096 : 0,
    fresh: true,
    ended: false,
  }
}

/** `AdvanceAnimations_v1`, once. */
function advance(climb: Climb, length: MotionLength | undefined): Climb {
  if (!length || climb.motion === 'run' || climb.paused) return climb
  if (climb.fresh) return { ...climb, fresh: false }
  const duration = Math.max(0, length.frames - 1) * 4096
  const step = mulRound(length.speed, PASS_DELTA)
  let time = climb.time
  let ended = false
  if (!climb.reverse) {
    time += step
    if (duration <= time) {
      if (climb.once) {
        ended = true
        time = duration
      } else time -= duration
    }
  } else {
    time -= step
    if (time <= 0) {
      if (climb.once) {
        ended = true
        time = 0
      } else time += duration
    }
  }
  return { ...climb, time, ended }
}

/** The motion's normalised time, × 4096 (`normalizedAnimationTime_`, `+0x24`). */
function normalised(climb: Climb, length: MotionLength | undefined): number {
  if (!length || climb.fresh) return 0
  return divide(climb.time, Math.max(1, length.frames - 1) * 4096)
}

/**
 * **One pass of a climb** (`func_02038598`). The motion is advanced first, as
 * the Hero's own update does before it (`func_02052ae8`). `pad` is Up or Down
 * held, or neither; `busy` is the field holding the Hero (`4`, `0x26`, `1`,
 * `3`, `0x3e`), when the pad is not read.
 */
export function climbPass(
  start: Climb,
  hero: Hero,
  pad: 'up' | 'down' | undefined,
  busy: boolean,
  lengths: (motion: LadderMotion) => MotionLength | undefined,
): ClimbPass {
  const lengthOf = (c: Climb) => (c.motion === 'run' ? undefined : lengths(c.motion))
  let climb = advance(start, lengthOf(start))
  let at: Hero = hero
  const place = (p: Point, facing = at.facing): Hero => ({ x: p.x, y: p.y, z: p.z, facing })

  switch (climb.step) {
    case 0: {
      // Turn to the starting end, at once, and get on.
      const end = climb.fromTop ? climb.topEnd : climb.bottomEnd
      const angle = reduceAngle(Math.round((Math.atan2(end.x - at.x, end.z - at.z) / Math.PI) * PI))
      at = { ...at, facing: angle }
      const length = lengths('hasigo_in')
      climb = { ...climb, step: 1, from: { x: at.x, y: at.y, z: at.z } }
      if (length) climb = setMotion(climb, 'hasigo_in', 1, length)
      return { climb, hero: at }
    }
    case 1: {
      at = { ...at, facing: climb.facing }
      const length = lengthOf(climb)
      // From the bottom the motion goes on twice more each pass.
      if (!climb.fromTop) {
        if (!climb.ended) climb = advance(climb, length)
        if (!climb.ended) climb = advance(climb, length)
      }
      const t = normalised(climb, length)
      const to = climb.fromTop
        ? { x: climb.top.x, y: climb.top.y - ON_BELOW_TOP, z: climb.top.z }
        : { x: climb.bottom.x, y: climb.bottom.y + ON_ABOVE_BOTTOM, z: climb.bottom.z }
      if (!climb.ended && length) {
        const f = climb.from
        at = place({
          x: f.x + mulRound(to.x - f.x, t),
          y: f.y + mulRound(to.y - f.y, t),
          z: f.z + mulRound(to.z - f.z, t),
        })
        return { climb, hero: at }
      }
      at = place(to)
      climb = { ...climb, step: 2 }
      const loop = lengths('hasigo_loop')
      if (loop) climb = setMotion(climb, 'hasigo_loop', 0, loop)
      return { climb, hero: at }
    }
    case 2:
      return climbing(climb, at, busy ? undefined : pad, lengths)
    case 4: {
      const length = lengthOf(climb)
      if (normalised(climb, length) !== 0) {
        const y = climb.from.y + mulRound(climb.topExit.y - climb.from.y, OFF_RISE)
        at = { ...at, y }
        climb = { ...climb, from: { x: at.x, y, z: at.z } }
      }
      if (!climb.ended && length) return { climb, hero: at }
      climb = {
        ...climb,
        step: 5,
        from: climb.topExit,
        walkTo: climb.topExit,
        walkSpeed: WALK_OFF,
        motion: 'run',
        paused: false,
      }
      return { climb, hero: { ...at, facing: climb.topFacing } }
    }
    case 5:
      return walkingOff(climb, at)
    case 6:
      return { hero: at, ...(climb.leaveBy ? { leave: climb.leaveBy } : {}) }
  }
}

/** Step 2: Up and Down, the loop, and the two ends. */
function climbing(
  start: Climb,
  hero: Hero,
  pad: 'up' | 'down' | undefined,
  lengths: (motion: LadderMotion) => MotionLength | undefined,
): ClimbPass {
  let climb = start
  const way = climb.padRead ? (pad === 'down' ? 1 : pad === 'up' ? 2 : 0) : 0
  let y = hero.y
  if (way === 1) y -= CLIMB_STEP
  else if (way === 2) y += CLIMB_STEP
  const { bottom, top } = climb
  const t = divide(y - bottom.y, top.y - bottom.y)
  let at: Hero = {
    x: bottom.x + mulRound(top.x - bottom.x, t),
    y,
    z: bottom.z + mulRound(top.z - bottom.z, t),
    facing: climb.facing,
  }
  const loop = lengths('hasigo_loop')
  if (way !== 0) {
    climb = { ...climb, paused: false }
    if (loop) climb = setMotion(climb, 'hasigo_loop', way === 2 ? 4 : 0, loop)
    // Moving again, the loop goes on from where it stopped (`+0x48`).
    if (climb.saved !== 0) climb = { ...climb, time: climb.saved, saved: 0 }
  } else {
    climb = { ...climb, paused: true, saved: climb.time }
  }
  if (y < bottom.y) {
    if (climb.bottomEnd.leaves)
      return { climb: { ...climb, step: 6, leaveBy: climb.bottomEnd }, hero: at }
    climb = {
      ...climb,
      step: 5,
      from: climb.bottomExit,
      walkTo: climb.bottomExit,
      walkSpeed: WALK_OFF,
      motion: 'run',
      paused: false,
    }
    return { climb, hero: { ...at, facing: climb.bottomFacing } }
  }
  if (y > top.y) {
    if (climb.topEnd.leaves)
      return { climb: { ...climb, step: 6, leaveBy: climb.topEnd }, hero: at }
    at = { ...at, y: top.y }
    climb = { ...climb, step: 4, from: { x: at.x, y: top.y, z: at.z }, paused: false }
    const out = lengths('hasigo_out')
    if (out) climb = setMotion(climb, 'hasigo_out', 1, out)
    else climb = { ...climb, ended: true }
  }
  return { climb, hero: at }
}

/** Step 5: straight to the place at the walk's pace, then the climb is over (`func_02033e38`). */
function walkingOff(climb: Climb, hero: Hero): ClimbPass {
  const to = climb.walkTo
  if (!to || climb.walkSpeed === 0) return { hero }
  const dx = to.x - hero.x
  const dy = to.y - hero.y
  const dz = to.z - hero.z
  const apart = Math.floor(Math.sqrt(dx * dx + dy * dy + dz * dz))
  if (apart < climb.walkSpeed) return { hero: { ...hero, x: to.x, y: to.y, z: to.z } }
  const k = divide(climb.walkSpeed, apart)
  return {
    climb,
    hero: {
      ...hero,
      x: hero.x + mulRound(dx, k),
      y: hero.y + mulRound(dy, k),
      z: hero.z + mulRound(dz, k),
    },
  }
}
