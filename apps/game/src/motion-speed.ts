import { readMotionTable } from '@minstrel/game-formats'

/**
 * **How fast a motion plays**, as the game plays it — read from the decomp,
 * 29 September 2026. Each frame the game's clock hands animation a delta of
 * one for every 17 ms that passed (`GameState::CalculateDeltaTime`,
 * `src/GameState/GameTime.cpp`), and an object's motion advances by its
 * `.bcfg` record's speed times that delta times the object's own playback
 * speed, 1 unless something sets it (`Object3D::AdvanceAnimations_v1`,
 * `src/World/Object3D.cpp`) — through the motion's frames less one, looping
 * or holding at its end.
 *
 * So a motion's speed is its own, not a frame rate for everything: the
 * swords' `attack1a` is 0.25 — its 18 steps in 72 of the game's frames, 1.2
 * seconds — their `stand` 0.1 and their `run` 0.4 (`mp0201be.bcfg`,
 * `mp0201f.bcfg`).
 */
export const MOTION_MS = 17

/**
 * **Ours**: the speed of a motion no record names — what this engine played
 * everything at before, 30 frames a second.
 */
export const UNNAMED_SPEED = (30 * MOTION_MS) / 1000

/** Each motion's speed, by name, out of every `.bcfg` among some files — the first named wins. */
export function speedsOf(
  files: Iterable<{ readonly path: string; readonly bytes: Uint8Array }>,
): Map<string, number> {
  const speeds = new Map<string, number>()
  for (const { path, bytes } of files) {
    if (!path.toLowerCase().endsWith('.bcfg')) continue
    try {
      for (const motion of readMotionTable(bytes).motions) {
        if (!speeds.has(motion.name) && motion.speed > 0) speeds.set(motion.name, motion.speed)
      }
    } catch {
      // A table that will not read names no speeds.
    }
  }
  return speeds
}

/**
 * The frame a motion is at, `ms` after it began: its speed of frames each
 * 17 ms, through its `frames` less one — round again when it loops, held at
 * the end when it does not.
 */
export function frameAt(
  ms: number,
  speed: number | undefined,
  frames: number,
  loops: boolean,
): number {
  const span = Math.max(0, frames - 1)
  const at = (Math.max(0, ms) / MOTION_MS) * (speed ?? UNNAMED_SPEED)
  if (span === 0 || Number.isNaN(at)) return 0
  // Held at its end, a motion's time may be without end; going round, that is
  // no frame, so it starts again.
  if (!Number.isFinite(at)) return loops ? 0 : span
  return loops ? at % span : Math.min(at, span)
}

/** How long a motion takes once through, ms. */
export function motionMs(speed: number | undefined, frames: number): number {
  return (Math.max(0, frames - 1) / (speed ?? UNNAMED_SPEED)) * MOTION_MS
}
