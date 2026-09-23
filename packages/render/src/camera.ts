import { type Fx32, fx32, toFloat } from '@minstrel/fixed'
import { type CharacterShape, type CollisionWorld, groundBelow } from '@minstrel/sim'

/**
 * The camera, and how the DS's framing survives a screen that is not the DS's.
 *
 * Floats throughout: nothing here feeds back into the simulation, and a camera
 * that lagged a frame differently on two machines would change nothing about
 * what happens in the world.
 */

/** The hardware's screen, 256x192. */
export const DS_ASPECT = 256 / 192

/**
 * Vertical field of view, in radians — what the field camera uses.
 *
 * **Tuned by eye**, and still ours: what a scene's camera uses is read from
 * the game (see {@link fovOfHalfDegrees}), but what the *field* camera uses is
 * set elsewhere in the game's code and has not been read. What is kept
 * faithful either way is the *framing rule* below, which does not depend on
 * knowing it.
 */
export const DS_VERTICAL_FOV = (50 * Math.PI) / 180

/**
 * A whole vertical field of view, in radians, from the number a scene's
 * camera is given — the game's engine function `532`.
 *
 * **The number is in degrees** — that much the game says itself: `Camera_SetFov`
 * (`0x0202e9a4`) multiplies the fixed-point number by {@link DEGREE_IN_RADIANS}
 * before it takes a sine or a cosine of it, which is degrees into radians and
 * nothing else.
 *
 * **Whether it is the half-angle or the whole field is not settled**, and the
 * two readings differ by a factor of two, so this says what is known:
 *
 * - The projection divides the cosine by the sine (`0x020c28c0`) and puts
 *   `cot × aspect` in the matrix's sixth word, with the first word coming from
 *   a division. A plain perspective matrix holds `cot(fov / 2)` there, which
 *   argues for the half-angle — **but the slot is not plain `cot`**, so the
 *   argument is weaker than it first looked.
 * - **The engine's own default is 60** (`0xF000` in fixed point, set by
 *   `0x02155fe0`), and the scenes pass **15** in 1,668 of their 2,477 calls.
 *   Read as half-angles those are a 120° field and a 30° one; read whole, 60°
 *   and 15°. A 120° vertical field is implausible, and the field camera here
 *   was independently tuned by eye to 50° — which sits much closer to 60 whole
 *   than to 120.
 *
 * So the evidence now points the *other* way from the first reading. It is
 * left as it was because this is what the scenes were watched with and it
 * looks right; changing it is a decision to take with the game in front of
 * you, not from the arithmetic. See `docs/still-open.md`.
 *
 * Everywhere else the engine's fixed-point angles are already **radians** —
 * `fix32ReduceAngle0To2Pi` (`0x02030f30`) wraps them modulo `0x6488`, which is
 * 2π × 4096. `532` is the one that takes degrees, and it converts.
 */
export function fovOfHalfDegrees(degrees: number): number {
  return 2 * degrees * DEGREE_IN_RADIANS
}

/**
 * A degree in radians, **as the game holds it**: `0x47 / 4096`, the constant
 * `Camera_SetFov` multiplies a field of view by.
 *
 * It is 0.68% short of π/180 — 0.0173340 against 0.0174533 — so using π/180
 * here would frame a scene a hair tighter than the DS does. The game's own
 * number is the one that matches it.
 */
export const DEGREE_IN_RADIANS = 0x47 / 4096

/**
 * The half-extents of the frustum at a given depth, for an aspect ratio.
 *
 * **The rule is that a wider screen never shows less than the DS did.** Two
 * ways of extending a 4:3 frame are common and only one of them is right here:
 *
 * - Fixing the *vertical* field of view and letting width follow the aspect
 *   shows more to the sides on a wide screen, and is what this does above 4:3.
 * - Fixing the *horizontal* field instead would crop the top and bottom, so a
 *   player on a wide monitor would see less of the world than the hardware
 *   showed. For a game whose maps were composed for a particular vertical
 *   framing, that is not a widescreen mode, it is a worse one.
 *
 * Below 4:3 — a tall window — the same principle reverses: holding the vertical
 * field would crop the sides, so the *horizontal* field is held instead and
 * height follows. Either way the visible frustum contains the DS's.
 */
export function frustumAt(
  depth: number,
  aspect: number,
  fov: number = DS_VERTICAL_FOV,
): { halfWidth: number; halfHeight: number } {
  const referenceHalfHeight = depth * Math.tan(fov / 2)
  const referenceHalfWidth = referenceHalfHeight * DS_ASPECT
  if (aspect >= DS_ASPECT) {
    return { halfHeight: referenceHalfHeight, halfWidth: referenceHalfHeight * aspect }
  }
  return { halfWidth: referenceHalfWidth, halfHeight: referenceHalfWidth / aspect }
}

/** A perspective projection following the rule in {@link frustumAt}. */
export function perspective(
  aspect: number,
  near: number,
  far: number,
  out: Float32Array = new Float32Array(16),
  fov: number = DS_VERTICAL_FOV,
): Float32Array {
  const { halfWidth, halfHeight } = frustumAt(near, aspect, fov)
  out.fill(0)
  out[0] = near / halfWidth
  out[5] = near / halfHeight
  out[10] = (far + near) / (near - far)
  out[11] = -1
  out[14] = (2 * far * near) / (near - far)
  return out
}

/**
 * A camera that follows a character.
 *
 * It orbits a point above the character's feet at a fixed distance, and lags
 * behind where that point is now — so walking does not drag the whole world
 * rigidly with it, and a step to the side reads as movement rather than as the
 * scenery sliding.
 */
export interface FollowCamera {
  /** Where the camera is looking, which trails the character. */
  focus: [number, number, number]
  /** Rotation about the world's vertical axis. */
  yaw: number
  /**
   * Bank about the view's own axis — a Dutch angle, which the game's `327`
   * sets. Zero for the field camera; only a scene tilts the view.
   *
   * The game keeps this on the camera itself and its view matrix reads it: at
   * zero it takes the world's up straight, and otherwise rotates the world's
   * up about the view axis before building the frame. This does the same.
   */
  roll?: number
  /** Rotation above the horizontal. Held between the limits below. */
  pitch: number
  /** How far back the camera wants to sit. */
  distance: number
  /** How far back it actually sits, after anything in the way. */
  actualDistance: number
  /**
   * How far the eye is raised to keep it out of the ground.
   *
   * Culling answers a building standing in the way, but not the camera sinking
   * into the hill behind the character — the ground is the one thing culling
   * must never remove, so an eye below it looks straight through the world.
   */
  lift: number
  /** How high above the feet to look. */
  height: number
  /** Fraction of the remaining gap closed per second. */
  follow: number
  readonly minPitch: number
  readonly maxPitch: number
}

/**
 * How the game's own camera behaves, as described by someone who has played it.
 *
 * Not derived from the cartridge — the camera's constants live in code this
 * repository does not read — but not invented either. Recorded here because the
 * shape of the behaviour is what matters and it is easy to get wrong by
 * defaulting to the conventions of a console game of the same era:
 *
 * - A third-person chase camera, but **pulled back further and raised higher**
 *   than that era would suggest, because the DS's screen is small and the
 *   player needs to see wandering monsters before they see the party.
 * - Behind and above, angled down by roughly **25 to 40 degrees**. True
 *   perspective, but the elevation gives it a three-quarters, near-isometric
 *   feel.
 * - The character sits **centred and low in the frame and occupies little of
 *   it**, with the horizon visible in the upper part of the screen outdoors.
 *   The framing holds a party of four in a line plus a good radius of ground.
 * - Free, smooth orbit about the character. No snapping to increments.
 * - Indoors and in tight streets it **tucks in closer and tilts down more
 *   steeply**, towards overhead, so it does not push through walls.
 * - The field and the towns are one continuous world at character scale, so the
 *   camera does not change behaviour between them. There is no miniature
 *   overworld to switch to.
 */
export interface CameraStyle {
  /** How far back, in character heights. */
  readonly distance: number
  /** Downward tilt, in radians. */
  readonly pitch: number
  /** How far up the character to look, as a fraction of its height. */
  readonly height: number
  readonly minPitch: number
  readonly maxPitch: number
}

/** Outdoors: pulled back, and the character small in the frame. */
export const OUTDOORS: CameraStyle = {
  distance: 4.5,
  pitch: (32 * Math.PI) / 180,
  height: 0.8,
  minPitch: (15 * Math.PI) / 180,
  maxPitch: (60 * Math.PI) / 180,
}

/** Indoors and in tight streets: closer in, and looking down more steeply. */
export const INDOORS: CameraStyle = {
  distance: 3,
  pitch: (45 * Math.PI) / 180,
  height: 0.7,
  minPitch: (25 * Math.PI) / 180,
  maxPitch: (75 * Math.PI) / 180,
}

/**
 * A camera in one of the styles above, sized to the character it follows.
 *
 * Distance and look-at height are given in character heights rather than world
 * units, so the framing survives the character's dimensions being revised —
 * which they have been once already.
 */
export function followCamera(style: CameraStyle = OUTDOORS, characterHeight = 1): FollowCamera {
  return {
    focus: [0, 0, 0],
    yaw: 0.7,
    pitch: style.pitch,
    distance: style.distance * characterHeight,
    actualDistance: style.distance * characterHeight,
    lift: 0,
    height: style.height * characterHeight,
    follow: 6,
    minPitch: style.minPitch,
    maxPitch: style.maxPitch,
  }
}

/** Re-style a camera in place, keeping where it is looking and which way. */
export function applyStyle(
  camera: FollowCamera,
  style: CameraStyle,
  characterHeight = 1,
): FollowCamera {
  const restyled: FollowCamera = {
    ...camera,
    pitch: style.pitch,
    distance: style.distance * characterHeight,
    height: style.height * characterHeight,
    minPitch: style.minPitch,
    maxPitch: style.maxPitch,
  }
  return restyled
}

/**
 * Move the camera towards where the character now is.
 *
 * The lag is framerate-independent: closing a fixed *fraction* per frame would
 * make the camera tighter at high frame rates and looser at low ones, so the
 * fraction is per second and converted with an exponential. `follow` is then a
 * rate rather than a magic number that only works at one frame rate.
 *
 * `world` is optional. Given one, the camera is kept **above the ground** — not
 * pulled forward. A building standing between the camera and the character is
 * answered by not drawing the building (see {@link occludes}), which is what
 * the game does and the only thing that works in a room. But the ground is the
 * one piece culling must never remove, so an eye that sinks into the hill
 * behind the character looks straight through the world instead. That is a
 * different problem and this is its fix: the eye is raised to stay clear of
 * whatever is under it.
 */
export function updateFollowCamera(
  camera: FollowCamera,
  target: { x: Fx32; y: Fx32; z: Fx32 },
  elapsedSeconds: number,
  world?: CollisionWorld,
  shape?: CharacterShape,
): void {
  camera.pitch = Math.min(camera.maxPitch, Math.max(camera.minPitch, camera.pitch))

  const wanted: [number, number, number] = [
    toFloat(target.x),
    toFloat(target.y) + camera.height,
    toFloat(target.z),
  ]
  // 1 - e^(-rate * dt): the fraction of the gap to close this frame, which
  // comes to the same place per second whatever the frame rate.
  const blend = elapsedSeconds <= 0 ? 1 : Math.min(1, 1 - Math.exp(-camera.follow * elapsedSeconds))
  for (let axis = 0; axis < 3; axis++) {
    const current = camera.focus[axis] as number
    camera.focus[axis] = current + ((wanted[axis] as number) - current) * blend
  }

  camera.actualDistance = camera.distance
  camera.lift = 0
  if (world && shape) {
    const eye = eyeOf(camera, camera.distance)
    const scale = 4096
    // The ground under the eye, looked for from well above it so a camera
    // already buried in a hill still finds the surface it is under.
    const hit = groundBelow(
      world,
      fx32(Math.round(eye[0] * scale)),
      fx32(Math.round(eye[2] * scale)),
      fx32(Math.round((eye[1] + GROUND_SEARCH) * scale)),
    )
    if (hit !== undefined) {
      const surface = toFloat(hit.y)
      // A clearance proportional to the character, so this scales with the
      // world the way the rest of the framing does.
      const clearance = camera.height * 0.5
      if (eye[1] < surface + clearance) camera.lift = surface + clearance - eye[1]
    }
  }
}

/**
 * How far above the eye to start looking for the ground under it.
 *
 * Fixed rather than proportional: it only has to clear the tallest hill the
 * camera can be inside, and looking from too far up costs nothing.
 */
const GROUND_SEARCH = 8

/** Where the camera sits, given how far back it is. */
export function cameraEye(
  camera: FollowCamera,
  distance = camera.actualDistance,
): [number, number, number] {
  return eyeOf(camera, distance)
}

function eyeOf(camera: FollowCamera, distance: number): [number, number, number] {
  const cosPitch = Math.cos(camera.pitch)
  return [
    (camera.focus[0] as number) + distance * cosPitch * Math.sin(camera.yaw),
    (camera.focus[1] as number) + distance * Math.sin(camera.pitch) + camera.lift,
    (camera.focus[2] as number) + distance * cosPitch * Math.cos(camera.yaw),
  ]
}

/** The view matrix for a camera, looking at its focus from behind. */
export function viewMatrix(
  camera: FollowCamera,
  out: Float32Array = new Float32Array(16),
): Float32Array {
  const eye = eyeOf(camera, camera.actualDistance)
  const focus = camera.focus
  const forward = normalise([
    eye[0] - (focus[0] as number),
    eye[1] - (focus[1] as number),
    eye[2] - (focus[2] as number),
  ])
  const right = normalise(cross([0, 1, 0], forward))
  let up = cross(forward, right)

  // The bank a scene's `327` asked for: the up turned about the view's own
  // axis, and `right` with it, which is what the game does to the world's up
  // before it builds the frame.
  const roll = camera.roll ?? 0
  if (roll !== 0) {
    const cos = Math.cos(roll)
    const sin = Math.sin(roll)
    const tilted: [number, number, number] = [
      up[0] * cos - right[0] * sin,
      up[1] * cos - right[1] * sin,
      up[2] * cos - right[2] * sin,
    ]
    right[0] = right[0] * cos + up[0] * sin
    right[1] = right[1] * cos + up[1] * sin
    right[2] = right[2] * cos + up[2] * sin
    up = tilted
  }

  out[0] = right[0]
  out[1] = up[0]
  out[2] = forward[0]
  out[3] = 0
  out[4] = right[1]
  out[5] = up[1]
  out[6] = forward[1]
  out[7] = 0
  out[8] = right[2]
  out[9] = up[2]
  out[10] = forward[2]
  out[11] = 0
  out[12] = -dot(right, eye)
  out[13] = -dot(up, eye)
  out[14] = -dot(forward, eye)
  out[15] = 1
  return out
}

type Vec3 = [number, number, number]

function normalise(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / length, v[1] / length, v[2] / length]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/**
 * Turn "forward" and "right" as the player means them into world movement.
 *
 * The camera sits at `focus + (sin yaw, cos yaw) · distance`, so the direction
 * the player is looking — into the screen, away from the camera — is the
 * **negative** of that. Getting the sign wrong here inverts the controls while
 * leaving everything else looking correct, which is why this is a named
 * function with a test rather than four lines inside a key handler.
 *
 * `forward` and `right` are each -1, 0 or 1. The result is a unit vector, or
 * zero when nothing is pressed, for the caller to scale by its own speed.
 */
export function moveRelativeToCamera(
  yaw: number,
  forward: number,
  right: number,
): { x: number; z: number } {
  const length = Math.hypot(forward, right)
  if (length === 0) return { x: 0, z: 0 }
  const f = forward / length
  const r = right / length
  const sin = Math.sin(yaw)
  const cos = Math.cos(yaw)
  // Into the screen is -(sin, cos); screen-right is (cos, -sin), which is the
  // same right vector the view matrix builds.
  return { x: -f * sin + r * cos, z: -f * cos - r * sin }
}
