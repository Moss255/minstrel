import { type Fx32, fx32, toFloat } from '@vesper/fixed'
import { type CharacterShape, type CollisionWorld, wallBetween } from '@vesper/sim'

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
 * Vertical field of view, in radians.
 *
 * **Tuned by eye.** The game's own value lives in code this repository does not
 * read; what is kept faithful here is the *framing rule* below, which does not
 * depend on knowing it.
 */
export const DS_VERTICAL_FOV = (50 * Math.PI) / 180

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
): { halfWidth: number; halfHeight: number } {
  const referenceHalfHeight = depth * Math.tan(DS_VERTICAL_FOV / 2)
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
): Float32Array {
  const { halfWidth, halfHeight } = frustumAt(near, aspect)
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
  /** Rotation above the horizontal. Held between the limits below. */
  pitch: number
  /** How far back the camera wants to sit. */
  distance: number
  /** How far back it actually sits, after anything in the way. */
  actualDistance: number
  /** How high above the feet to look. */
  height: number
  /** Fraction of the remaining gap closed per second. */
  follow: number
  readonly minPitch: number
  readonly maxPitch: number
}

/** A camera set up for walking around a village. */
export function followCamera(): FollowCamera {
  return {
    focus: [0, 0, 0],
    yaw: 0.7,
    pitch: 0.35,
    distance: 2.5,
    actualDistance: 2.5,
    height: 0.3,
    follow: 8,
    minPitch: -0.2,
    maxPitch: 1.2,
  }
}

/**
 * Move the camera towards where the character now is.
 *
 * The lag is framerate-independent: closing a fixed *fraction* per frame would
 * make the camera tighter at high frame rates and looser at low ones, so the
 * fraction is per second and converted with an exponential. `follow` is then a
 * rate rather than a magic number that only works at one frame rate.
 *
 * `world` is optional. Given one, the camera will not sit through a wall: it
 * comes forward to just in front of whatever is between it and the character,
 * which is what stops a building swallowing the view when you walk behind it.
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
  if (world && shape) {
    const eye = eyeOf(camera, camera.distance)
    const scale = 4096
    const hit = wallBetween(
      world,
      {
        x: fx32(Math.round((camera.focus[0] as number) * scale)),
        z: fx32(Math.round((camera.focus[2] as number) * scale)),
      },
      { x: fx32(Math.round(eye[0] * scale)), z: fx32(Math.round(eye[2] * scale)) },
      fx32(Math.round(((camera.focus[1] as number) - 0.05) * scale)),
      fx32(Math.round(((camera.focus[1] as number) + 0.05) * scale)),
      shape.maxSlope,
    )
    if (hit !== undefined) {
      // Just in front of the wall, so the near plane does not clip into it.
      camera.actualDistance = Math.max(0.1, camera.distance * hit - 0.1)
    }
  }
}

/** Where the camera sits, given how far back it is. */
function eyeOf(camera: FollowCamera, distance: number): [number, number, number] {
  const cosPitch = Math.cos(camera.pitch)
  return [
    (camera.focus[0] as number) + distance * cosPitch * Math.sin(camera.yaw),
    (camera.focus[1] as number) + distance * Math.sin(camera.pitch),
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
  const up = cross(forward, right)

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
