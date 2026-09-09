import {
  type Figure,
  type FigurePiece,
  type Measurements,
  motionAdvance,
  poseFigure,
  strideOf,
} from '@minstrel/actor'
import { type Catalogue, type DecodedTexture, textureFor } from '@minstrel/cartridge'
import { FX32_ONE, fx32, toFloat } from '@minstrel/fixed'
import type { Piece } from '@minstrel/gl'
import type { Animation, Model } from '@minstrel/nitro-gfx'
import { moveRelativeToCamera } from '@minstrel/render'
import { type CharacterState, type CollisionWorld, PERSON, step } from '@minstrel/sim'

/** Simulation ticks a second, and how long one is. */
export const TICK_MS = 1000 / 60

/**
 * Movement per tick, as a fraction of the character's own height.
 *
 * A speed in world units does not survive the character being resized, and the
 * character has been resized by a factor of ten over this milestone. At 0.05
 * units a tick the 0.18-unit character crossed **sixteen of its own heights a
 * second**, which is a sprint by any measure and read as sliding.
 *
 * **The legs are locked to the ground, so this sets the cadence too.** The walk
 * cycle is advanced by distance covered, not by time, so halving the speed
 * halves how fast the character steps. At four heights a second the eight-frame
 * cycle ran 3.8 times a second — **7.5 steps a second**, against the two a
 * person manages — which reads as churning however good the animation is.
 *
 * Three heights a second puts the village, twelve units across, at about
 * twenty-two seconds corner to corner. It is still three times what a person
 * manages, which is the usual bargain for a game: a village that takes half a
 * minute to cross reads as a chore rather than as a place.
 *
 * **This is tuned, not derived.** The original's movement constants live in
 * code, not in any data table read so far, and reaching them means disassembly
 * this repository does not do. What *is* measured is the animation's own
 * stride: its feet sweep **0.402 of the character's height per gait cycle**, so
 * a character covering more ground than that per cycle is sliding its feet to
 * keep up. At two heights a second it slides 2.6x, which is where it has been
 * all along; the speed is what moved, not the honesty of the feet.
 */
export const WALK_HEIGHTS_PER_SECOND = 3
export const WALK_SPEED = Math.round(
  (toFloat(PERSON.height) * WALK_HEIGHTS_PER_SECOND * FX32_ONE) / 60,
)

/** How much of a turn to take per tick, towards where the character is going. */
const TURN_RATE = 0.25

/** The character, and everything about it that changes from frame to frame. */
export interface Player {
  state: CharacterState
  /** Which movement keys are down. */
  readonly held: Set<string>
  /**
   * The movement stick this frame, if a pad is plugged in.
   *
   * Kept beside the keys rather than replacing them: both are read every
   * frame, and whichever is asking for more movement wins, so a pad can be
   * picked up and put down without the keyboard going dead.
   */
  stick: { forward: number; right: number }
  /** Left over from the last frame, so a slow frame is still 60Hz of ticks. */
  carry: number
  /** Which way the character is facing, in radians about the vertical. */
  facing: number
  /** Frame of the motion playing, which is fractional between two frames. */
  motionFrame: number
  /** Which motion that frame belongs to, so a change can reset it. */
  motion: string | undefined
  /** Whether there is a roof overhead, which is what picks the camera style. */
  inside: boolean
  /** How much to shrink the figure into the world. */
  scale: number
}

export function player(
  at: { x: CharacterState['x']; y: CharacterState['y']; z: CharacterState['z'] },
  scale: number,
): Player {
  return {
    state: { ...at, fallSpeed: fx32(0), grounded: true },
    held: new Set(),
    carry: 0,
    facing: 0,
    motionFrame: 0,
    motion: undefined,
    inside: false,
    stick: { forward: 0, right: 0 },
    scale,
  }
}

/**
 * Run the simulation forward by however much real time has passed.
 *
 * Fixed 60Hz with the remainder carried, so the character covers the same
 * ground whatever the frame rate does. The camera's yaw decides which way
 * "forward" is, so walking is relative to the view rather than to the world.
 *
 * Returns how far the character actually got, which is not how far it asked to
 * go: a wall takes most of it away, and the walk cycle runs on the difference.
 */
export function advance(
  self: Player,
  world: CollisionWorld,
  yaw: number,
  elapsedMs: number,
): { moving: boolean; travelled: number } {
  let keyForward = 0
  let keyRight = 0
  if (self.held.has('w')) keyForward += 1
  if (self.held.has('s')) keyForward -= 1
  if (self.held.has('d')) keyRight += 1
  if (self.held.has('a')) keyRight -= 1

  // Whichever input is asking for more movement. A key is all or nothing; a
  // stick is not, and half a stick should walk at half speed rather than being
  // rounded up to a keypress.
  const keyPush = Math.min(1, Math.hypot(keyForward, keyRight))
  const stickPush = Math.min(1, Math.hypot(self.stick.forward, self.stick.right))
  const useStick = stickPush > keyPush
  const forward = useStick ? self.stick.forward : keyForward
  const right = useStick ? self.stick.right : keyRight
  const push = useStick ? stickPush : keyPush

  // Whether the character is walking is a fact about the input, not about
  // whether a simulation tick happened to fall in this frame. Taking it from
  // the loop meant that on any frame short enough to run no tick — which at
  // 60Hz is most other frames — the motion flipped to standing and the frame
  // count reset, so the character stuttered between two poses.
  const moving = push > 0
  self.carry = Math.min(self.carry + elapsedMs, TICK_MS * 8)

  let travelled = 0
  while (self.carry >= TICK_MS) {
    self.carry -= TICK_MS
    const from = self.state
    let dx = 0
    let dz = 0
    if (moving) {
      // `moveRelativeToCamera` gives a direction of unit length, so how hard
      // the stick is pushed is applied here.
      const stepped = moveRelativeToCamera(yaw, forward, right)
      dx = Math.round(stepped.x * WALK_SPEED * push)
      dz = Math.round(stepped.z * WALK_SPEED * push)
      // Turn towards where it is going, by the shorter way round.
      const wanted = Math.atan2(dx, dz)
      let turn = wanted - self.facing
      while (turn > Math.PI) turn -= Math.PI * 2
      while (turn < -Math.PI) turn += Math.PI * 2
      self.facing += turn * TURN_RATE
    }
    self.state = step(world, self.state, fx32(dx), fx32(dz), PERSON)
    travelled += Math.hypot(
      toFloat(self.state.x) - toFloat(from.x),
      toFloat(self.state.z) - toFloat(from.z),
    )
  }
  return { moving, travelled }
}

/**
 * Move the character's animation on.
 *
 * The frame resets when the motion changes, because a count left over from a
 * nine-frame walk means something else in a seventeen-frame idle.
 */
export function advanceMotion(
  self: Player,
  figure: Figure,
  measurements: Measurements,
  moving: boolean,
  elapsedMs: number,
  travelled: number,
): void {
  const wanted = moving ? 'walk' : 'stand'
  if (wanted !== self.motion) {
    self.motion = wanted
    self.motionFrame = 0
  }
  const motion = figure.motions.get(wanted)
  if (!motion || motion.frameCount <= 0) return

  // The frames that make up the loop, which is not always all of them.
  const frameCount = measurements.loopLength(motion)
  self.motionFrame += motionAdvance({
    moving,
    // Real time rather than whole ticks, so an idle does not run in steps of
    // however many ticks happened to fall in a frame.
    ticks: (elapsedMs * 60) / 1000,
    travelled,
    frameCount,
    // A length, not a rate: the cadence follows from how fast the character is
    // actually moving over the ground.
    stride: strideOf(toFloat(PERSON.height)),
  })
  self.motionFrame %= frameCount
}

/**
 * The character's pieces, posed and put where it is standing.
 *
 * Every part carries the same rig, so one motion drives all of them: each is
 * posed against its own copy of that skeleton and they move together. The
 * result is scaled into the world, turned to face the way it is walking, and
 * set down at the feet by one offset for the whole motion.
 */
export function playerPieces(
  self: Player,
  figure: Figure,
  pieces: readonly FigurePiece[],
  cat: Catalogue,
  measurements: Measurements,
  motion: Animation | undefined,
): Piece[] {
  if (pieces.length === 0) return []
  const sin = Math.sin(self.facing)
  const cos = Math.cos(self.facing)
  const { scale } = self
  const atX = toFloat(self.state.x)
  const atY = toFloat(self.state.y)
  const atZ = toFloat(self.state.z)
  const floor = measurements.floor(figure, pieces, motion)

  return poseFigure(figure, pieces, motion, Math.floor(self.motionFrame)).map(
    ({ piece, posed }) => {
      const vertices = posed.vertices.map((v) => {
        const x = v.x * scale
        const y = (v.y - floor) * scale
        const z = v.z * scale
        return { ...v, x: atX + x * cos + z * sin, y: atY + y, z: atZ - x * sin + z * cos }
      })
      const geometry = { ...posed, vertices }
      const texture = textureOf(cat, piece.model, piece.shape)
      return texture ? { geometry, ...texture } : { geometry }
    },
  )
}

function textureOf(cat: Catalogue, model: Model, shape: number): DecodedTexture | undefined {
  const materialIndex = model.shapeMaterials[shape]
  const material = materialIndex === undefined ? undefined : model.materials[materialIndex]
  return material ? textureFor(cat, material) : undefined
}
