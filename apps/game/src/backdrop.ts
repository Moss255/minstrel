import { bgr555, type LightingSlot } from '@minstrel/game-formats'
import type { Backdrop } from '@minstrel/gl'

/**
 * **The gradient behind a map**, as the game draws it —
 * `LightingManager::DrawBackgroundGradient` and `MaybeComputeHorizonPosition`
 * in the decomp (`src/Graphics/LightingManager.cpp`), read 29 September 2026.
 *
 * - **The horizon's row**: where a point far ahead of the eye, level with it,
 *   falls on the screen, as a fraction of the way down — clamped to the top
 *   when it is off the screen and the camera looks down, the bottom when up.
 *   The map's own offset moves it (`gradientCentreOffset`).
 * - **The colours**: the horizon colour on that row; the background colour at
 *   the far end, top or bottom; and at the near end the colour as far along
 *   toward the background as that end is from the row, **a whole change per
 *   half screen** — `(outer − inner) / 0.5`, each channel truncated, 5 bits.
 */

/** The horizon's row, 0 the top and 1 the bottom: `pitch` is the eye's angle above its target, `halfFov` the view's. */
export function horizonRow(pitch: number, halfFov: number, offset = 0): number {
  // Looking down by `pitch`, the level horizon stands that far above the middle.
  const y = 0.5 - Math.tan(pitch) / (2 * Math.tan(halfFov))
  const row = y > 0 && y < 1 ? y : pitch <= 0 ? 1 : 0
  return row + offset
}

/** The gradient for a lighting slot and the horizon's row — see the module. */
export function gradientOf(
  slot: Pick<LightingSlot, 'background' | 'horizon'>,
  centre: number,
): Backdrop {
  const outer = bgr555(slot.background)
  const inner = bgr555(slot.horizon)
  const delta = outer.map((o, i) => (o - (inner[i] as number)) / 0.5)
  const along = (length: number) =>
    inner.map((c, i) => c + Math.trunc((delta[i] as number) * length)) as unknown as readonly [
      number,
      number,
      number,
    ]
  let top: readonly [number, number, number] = outer
  let bottom: readonly [number, number, number] = outer
  // The game takes the bottom's colour when the row is in the lower half.
  if (centre >= 0.5) bottom = along(1 - centre)
  else top = along(centre)
  const unit = (c: readonly [number, number, number]) =>
    c.map((v) => Math.max(0, Math.min(31, v)) / 31) as unknown as readonly [number, number, number]
  return { top: unit(top), middle: unit(inner), bottom: unit(bottom), centre }
}

/**
 * This engine's times of day as the lighting's slots: night 0, day 2,
 * evening 3 — the game's morning, 1, is never taken, there being no morning
 * here. **Ours** for a battle: the game takes a battle's slot from its
 * request (`+5`, 2 unless set), and what sets it on an ordinary encounter is
 * not read.
 */
export const LIGHTING_SLOT = { night: 0, day: 2, evening: 3 } as const
