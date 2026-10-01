import type { CameraCommand } from './action-player.ts'
import {
  actorCloseUp,
  type BattleView,
  CLOSE_UP_PULL,
  type Orbit,
  orbitOf,
  sideShot,
} from './stage.ts'

/**
 * **The battle camera an action's script moves** — read from overlays 0 and
 * 25 on 1 October 2026 (USA release; FORMAT.md, "The battle camera" and "The
 * action scripts"): the camera command `12` (`func_ov025_021e3c80`) and the
 * eye, look-at, orbit and ease commands beside it.
 *
 * **Every shot is a cut.** A shot resets the camera (`func_ov000_0216d370(cam,
 * 1, 1, 1)`: no frame, no spin or drift, the field of view back to 15, roll 0)
 * and sets its look-at and orbit outright. After that the camera moves only
 * by its spin and drift each tick (`+0x238`, `+0x23c`), by its ease
 * (`86`–`89`), by `127`'s turn, and — for a shot "on a fighter" — by **the
 * fighter's frame**: rebuilt every frame from where the fighter stands and
 * faces now (`func_ov000_0216d560`), so the camera rides along as it lunges.
 *
 * **Ours**, each marked: the draws a shot takes (the camera's own generator,
 * `+0x21c`, is not traced); a monster's size term in its close-up (`+0x18e`,
 * not read: 0); the animated cameras of `34` and `3 25`, which are not played
 * — the camera holds where it was.
 */

/** A fighter as the camera frames it: its place on the stage, facing, height and radius. */
export interface Framed {
  readonly x: number
  readonly z: number
  readonly facing: number
  readonly height: number
  readonly radius: number
  readonly party: boolean
}

/** What the camera needs of the stage each time it is asked. */
export interface CameraStage {
  fighter(index: number): Framed | undefined
  /** Every fighter on a side now, for the side shots and orbits. */
  side(party: boolean): readonly Framed[]
  /** The extent of a side's row, as the side shot fits it (`func_ov000_0216f708`…), 4096ths. */
  extent(party: boolean): { readonly width: number; readonly height: number }
}

/** A drawn number, 0 to 1 — **ours**, the camera's own generator not being traced. */
export type Draw = () => number

/** The camera's state between commands. */
export interface BattleCamera {
  /** Whose frame the look-at and orbit are in, if any. */
  frame: number | undefined
  /** The look-at, in the frame (or the stage when none). */
  look: readonly [number, number, number]
  orbit: Orbit
  /** Yaw added a tick, and distance a tick (`+0x238`, `+0x23c`). */
  spin: number
  drift: number
  /** The least the drift brings the distance to — 3 (`0x0216d464`). */
  readonly nearest: number
  halfFov: number
  roll: number
  /** `127`'s turn of the eye about the look-at: so much a tick for so many ticks, and how far it has come. */
  turn: { step: number; ticks: number; extra: number }
  shake: { amplitude: number; left: number } | undefined
  /** The eases of `86`, `88` and `89` (`func_020a0d6c`), on the orbit, look-at and eye. */
  eases: Ease[]
  /** Whether the shot is the group orbit, which the 17-and-5 clamp passes over. */
  orbiting: boolean
  /** Which actor close-up is up, for the same-shot test (`func_ov000_0216df00`). */
  closeOn: number | undefined
}

/** An ease toward a target: speed, most and acceleration per second (`func_020a0e4c`). */
interface Ease {
  readonly what: 'orbit' | 'look' | 'eye'
  readonly mask: number
  readonly to: readonly [number, number, number]
  speed: number
  readonly most: number
  readonly accel: number
}

/** The camera as the battle leaves it from a view the opening or the command camera set. */
export function cameraFrom(view: BattleView, halfFov: number): BattleCamera {
  return {
    frame: undefined,
    look: view.target,
    orbit: view.orbit,
    spin: view.turn ?? 0,
    drift: view.pull,
    nearest: 3,
    halfFov,
    roll: 0,
    turn: { step: 0, ticks: 0, extra: 0 },
    shake: undefined,
    eases: [],
    orbiting: false,
    closeOn: undefined,
  }
}

/** A reset, as every shot but 10 begins (`func_ov000_0216d370(cam, 1, 1, 1)`). */
function reset(cam: BattleCamera) {
  cam.frame = undefined
  cam.spin = 0
  cam.drift = 0
  cam.halfFov = 15
  cam.roll = 0
  cam.turn = { step: 0, ticks: 0, extra: 0 }
  cam.eases = []
  cam.orbiting = false
  cam.closeOn = undefined
}

/** Group orbits and close-ups pull and spin by these, a tick. */
const PULL = -20 / 4096
const ORBIT_SPIN = 28 / 4096
const ORBIT_BACK = 20 / 4096
const GROUP_YAW = 0x5e38 / 4096
/** Mode 1's eight angles, 22.5° + 45°·k (`data_ov000_021832a4`). */
const EIGHT = [...Array(8).keys()].map((k) => ((22.5 + 45 * k) * Math.PI) / 180)

/**
 * **Play a camera command.** `draw` gives the shots that draw their angle a
 * number — **ours**. Returns whether the camera moved (`+0x6fd5`).
 */
export function playCamera(
  cam: BattleCamera,
  c: CameraCommand,
  stage: CameraStage,
  draw: Draw,
): void {
  const actor = c.actor === undefined ? undefined : stage.fighter(c.actor)
  const target = c.target === undefined ? undefined : stage.fighter(c.target)
  switch (c.tag) {
    case 12:
      shot(cam, c, stage, actor, target, draw)
      return
    case 48:
      setEye(cam, c.vector)
      return
    case 49: {
      const k = c.mode === 2 ? heightScale(target) : 1
      if (c.mode === 0) cam.look = c.vector
      else if (c.mode === 2) cam.look = [c.vector[0], c.vector[1] * k, c.vector[2] * k]
      else cam.look = add(cam.look, c.vector)
      return
    }
    case 50: {
      const [yaw, height, distance] = c.vector
      if (c.mode === 0) cam.orbit = { yaw, height, distance }
      else if (c.mode === 2) cam.orbit = { yaw, height, distance: distance * heightScale(target) }
      else
        cam.orbit = {
          yaw: cam.orbit.yaw + yaw,
          height: cam.orbit.height + height,
          distance: cam.orbit.distance + distance,
        }
      return
    }
    case 86: {
      let [yaw, height, distance] = c.vector
      if (c.kind === 2 && target && target.height >= 1.5) {
        const k = Math.min(1 + ((target.height - 1.5) * 0.8) / 2.5, 1.8)
        height *= k
        distance *= k
      }
      // The yaw wrapped by 2π so the turn goes the short way.
      let d = yaw - cam.orbit.yaw
      while (d > Math.PI) d -= 2 * Math.PI
      while (d < -Math.PI) d += 2 * Math.PI
      cam.eases.push({
        what: 'orbit',
        mask: c.flags,
        to: [cam.orbit.yaw + d, height, distance],
        speed: c.speed,
        most: c.most,
        accel: c.accel === 0 ? c.most : c.accel,
      })
      return
    }
    case 87:
      cam.roll = c.roll
      return
    case 88:
    case 89:
      if (c.tag === 88) cam.frame = undefined
      cam.eases.push({
        what: c.tag === 88 ? 'look' : 'eye',
        mask: 7,
        to: c.vector,
        speed: c.speed,
        most: c.most,
        accel: c.accel === 0 ? c.most : c.accel,
      })
      return
    case 113:
      if (c.ms !== 0) cam.shake = { amplitude: c.amplitude, left: c.ms }
      return
    case 123:
      cam.halfFov = c.degrees
      return
    case 127:
      if (c.ticks !== 0) cam.turn = { step: c.step, ticks: c.ticks, extra: cam.turn.extra }
      else cam.turn = { step: 0, ticks: 0, extra: c.step }
      return
    case 35:
      // Back to the battle camera, the framing kept: the animated camera is not played here.
      return
    case 34:
    case 39:
      // **Not played**: the animated cameras, and following a fighter with one.
      return
  }
}

/** Mode 2's scale by the first target's height (`49`, `50`): 1 below 2.3, else up to 1.6. */
function heightScale(target: Framed | undefined): number {
  const h = target?.height ?? 1 / 4096
  return h < 2.3 ? 1 : Math.min(1 + ((h - 2.3) * 0.6) / 1.7, 1.6)
}

const add = (a: readonly number[], b: readonly number[]): [number, number, number] => [
  (a[0] ?? 0) + (b[0] ?? 0),
  (a[1] ?? 0) + (b[1] ?? 0),
  (a[2] ?? 0) + (b[2] ?? 0),
]

/** Set the eye, keeping the look-at: the orbit it makes (`+0x04` with `+0x10`). */
function setEye(cam: BattleCamera, eye: readonly [number, number, number]) {
  cam.orbit = orbitOf({ eye, target: cam.look, halfFov: cam.halfFov })
}

function shot(
  cam: BattleCamera,
  c: Extract<CameraCommand, { tag: 12 }>,
  stage: CameraStage,
  actor: Framed | undefined,
  target: Framed | undefined,
  draw: Draw,
) {
  const mode = c.mode
  if (mode === 10) {
    // The freeze: the frame dropped, the camera left where it is; fov, roll and the turn kept.
    const view = viewOf(cam, stage)
    cam.frame = undefined
    cam.look = view.target
    cam.orbit = view.orbit
    cam.spin = 0
    cam.drift = 0
    cam.eases = []
    return
  }
  const needs = [1, 2, 4, 5, 13].includes(mode) ? actor : undefined
  if ([1, 5, 13].includes(mode) && !actor) return
  if ([2, 4].includes(mode) && (!actor || !target)) return
  if ([6, 12, 14].includes(mode) && !target) return
  void needs
  switch (mode) {
    case 0:
    case 15:
    case 8:
    case 9: {
      const side: 0 | 1 =
        mode === 8 ? (actor && !actor.party ? 1 : 0) : mode === 9 ? (target?.party ? 0 : 1) : 1
      const wide = mode === 15
      // `sideShot`'s side 1 is the monsters' (eye on +z, behind the party).
      const s = sideShot(side, stage.extent(side === 0), wide, c.variant === 1 && !wide ? 1 : 0)
      reset(cam)
      let eye = s.eye
      if (!wide && (c.variant === 2 || c.variant === 3)) {
        const [f0, f1, f2] = c.floats
        eye = [eye[0] + f0, eye[1] + f1, eye[2] + (side === 0 ? -f2 : f2)]
      }
      cam.look = s.target
      cam.orbit = orbitOf({ eye, target: s.target, halfFov: s.halfFov })
      cam.halfFov = s.halfFov
      if (!wide && c.variant === 3) {
        cam.spin = ORBIT_SPIN
        cam.drift = ORBIT_BACK
      }
      return
    }
    case 1: {
      if (!actor || c.actor === undefined) return
      reset(cam)
      cam.frame = c.actor
      cam.look = [0, 1, 1]
      // **Ours**: the draw of the eight angles.
      cam.orbit = { yaw: EIGHT[Math.floor(draw() * 8) & 7] as number, height: 3, distance: 8 }
      cam.drift = PULL
      return
    }
    case 2: {
      if (!actor || !target) return
      reset(cam)
      const mid = { x: (actor.x + target.x) / 2, z: (actor.z + target.z) / 2 }
      const along = Math.atan2(target.x - actor.x, target.z - actor.z)
      const yaw = (draw() < 0.5 ? 0 : Math.PI) + (draw() < 0.5 ? -1 : 1) * (0x4cc / 4096)
      cam.look = local(mid, along, [0, 1, 0])
      cam.orbit = { yaw: along + yaw, height: 1, distance: 8 }
      cam.drift = PULL
      return
    }
    case 3:
    case 11: {
      const wide = mode === 11
      const group = [...(target ? [target] : [])]
      const all = target ? stage.side(target.party) : []
      groupOrbit(cam, group.length === 1 && all.length <= 1 ? group : all, c.target, wide)
      return
    }
    case 7: {
      const list = target ? stage.side(target.party) : []
      if (list.length === 0) return
      reset(cam)
      const mx = list.reduce((s, f) => s + f.x, 0) / list.length
      const mz = list.reduce((s, f) => s + f.z, 0) / list.length
      cam.look = [mx, 1.55, mz]
      const monster = !(target?.party ?? false)
      const yaws = monster ? [45, 315] : [225, 135]
      const pick = draw() < 0.5 ? 0 : 1
      cam.orbit = { yaw: ((yaws[pick] as number) * Math.PI) / 180, height: 0, distance: 9 }
      cam.spin = ((pick === 0 ? -32 : 32) / 4096) * (monster ? 1 : -1)
      return
    }
    case 5:
    case 6:
    case 12:
    case 13:
    case 14: {
      const on = mode === 5 || mode === 13 ? actor : target
      const who = mode === 5 || mode === 13 ? c.actor : c.target
      if (!on || who === undefined) return
      const [, a, b] = mode === 12 ? [0, 0, 1.8] : c.floats
      const keep = mode === 13 || mode === 14
      const view = actorCloseUp({ x: 0, z: 0, facing: 0 }, on.height, on.party, a, b, cam.halfFov)
      // The same shot again carries on (`keep` 0): same fighter, yaw 0, distance within a quarter, look within 1.
      if (
        !keep &&
        cam.closeOn === who &&
        cam.frame === who &&
        Math.abs(cam.orbit.yaw) < 1e-6 &&
        Math.abs(cam.orbit.distance - view.orbit.distance) <= view.orbit.distance / 4 &&
        Math.hypot(
          cam.look[0] - view.target[0],
          cam.look[1] - view.target[1],
          cam.look[2] - view.target[2],
        ) <= 1
      )
        return
      reset(cam)
      cam.frame = who
      cam.closeOn = who
      cam.look = view.target
      cam.orbit = { yaw: 0, height: view.orbit.height, distance: view.orbit.distance }
      cam.drift = CLOSE_UP_PULL
      return
    }
  }
}

/**
 * **The group orbit** (`func_ov000_0216dbf0`): yaw 337.5°, looking at half the
 * tallest height, 1 up; on one fighter, framed on it; on several, round the
 * stage's middle by the farthest one. Distance the larger of 3R and 3H — at
 * least 7, the height rising by half of anything past 16; wide, at least 14,
 * looking at 0.72 from 3.6. Then a slow spin, backing off.
 */
function groupOrbit(
  cam: BattleCamera,
  list: readonly Framed[],
  one: number | undefined,
  wide: boolean,
) {
  if (list.length === 0) return
  reset(cam)
  cam.orbiting = true
  let r: number
  let h: number
  if (list.length === 1 && one !== undefined) {
    const f = list[0] as Framed
    cam.frame = one
    r = f.radius / 2
    h = f.height
  } else {
    r = Math.max(...list.map((f) => Math.hypot(f.x, f.z) + f.radius / 2))
    h = Math.max(2, ...list.map((f) => f.height))
  }
  let distance = Math.max(3 * r, 3 * h)
  let height = 1
  let lookY = h / 2
  if (wide) {
    distance = Math.max(distance, 14)
    lookY = 0.72
    height = 3.6
  } else {
    distance = Math.max(distance, 7)
    if (distance > 16) height += (distance - 16) / 2
  }
  cam.look = [0, lookY, 0]
  cam.orbit = { yaw: GROUP_YAW, height, distance }
  cam.spin = ORBIT_SPIN
  cam.drift = ORBIT_BACK
}

/** A point in a fighter's frame — origin at it, +z along its facing — in the stage's space. */
function local(
  at: { readonly x: number; readonly z: number },
  facing: number,
  p: readonly [number, number, number],
): [number, number, number] {
  const s = Math.sin(facing)
  const c = Math.cos(facing)
  return [at.x + p[0] * c + p[2] * s, p[1], at.z - p[0] * s + p[2] * c]
}

/** **The view now**, in the stage's space: the frame resolved from where its fighter stands. */
export function viewOf(cam: BattleCamera, stage: CameraStage): BattleView {
  const f = cam.frame === undefined ? undefined : stage.fighter(cam.frame)
  const orbit = { ...cam.orbit, yaw: cam.orbit.yaw + cam.turn.extra }
  if (!f) return { target: cam.look, orbit, pull: 0 }
  return {
    target: local(f, f.facing, cam.look),
    orbit: { ...orbit, yaw: orbit.yaw + f.facing },
    pull: 0,
  }
}

/** **One tick** of the camera's own motion: spin, drift (no nearer than 3), the eases, the turn, the shake. */
export function tickCamera(cam: BattleCamera, ms: number): void {
  let distance = cam.orbit.distance
  if (cam.drift !== 0) distance = Math.max(distance + cam.drift, cam.nearest)
  cam.orbit = { yaw: cam.orbit.yaw + cam.spin, height: cam.orbit.height, distance }
  if (cam.turn.ticks > 0) {
    cam.turn.extra += cam.turn.step
    cam.turn.ticks--
  }
  if (cam.shake) {
    if (cam.shake.left <= 33) cam.shake = undefined
    else {
      cam.shake.amplitude -= (cam.shake.amplitude * 33) / cam.shake.left
      cam.shake.left -= 33
    }
  }
  cam.eases = cam.eases.filter((e) => easeStep(cam, e, ms))
}

/** One step of an ease (`func_020a0e4c`): speed up while there is room to stop, then brake onto it. */
function easeStep(cam: BattleCamera, e: Ease, ms: number): boolean {
  const now: [number, number, number] =
    e.what === 'orbit'
      ? [cam.orbit.yaw, cam.orbit.height, cam.orbit.distance]
      : e.what === 'look'
        ? [...cam.look]
        : eyeOf(cam)
  const want = now.map((v, k) => ((e.mask >> k) & 1 ? (e.to[k] as number) : v))
  const left = Math.hypot(...want.map((v, k) => v - (now[k] as number)))
  const f = ms / 1000
  const step = e.speed * f
  const acc = e.accel * f
  let move: number
  let done = false
  if (left < acc || left === 0) {
    move = left
    done = true
  } else if ((step * step) / (2 * acc) < left + 0.1) {
    e.speed = Math.min((step + acc) / f, e.most)
    move = e.speed * f
  } else {
    move = Math.min(step - acc, left / 2)
    e.speed = move / f
    if (move < acc) {
      move = left
      done = true
    }
  }
  const k = left === 0 ? 1 : Math.min(1, move / left)
  const next = now.map((v, i) => v + ((want[i] as number) - v) * k) as [number, number, number]
  if (e.what === 'orbit') cam.orbit = { yaw: next[0], height: next[1], distance: next[2] }
  else if (e.what === 'look') cam.look = next
  else setEye(cam, next)
  return !done
}

function eyeOf(cam: BattleCamera): [number, number, number] {
  const { yaw, height, distance } = cam.orbit
  const flat = Math.sqrt(Math.max(0, distance * distance - height * height))
  return [
    cam.look[0] + Math.sin(yaw) * flat,
    cam.look[1] + height,
    cam.look[2] + Math.cos(yaw) * flat,
  ]
}
