import type { MapTransition, SpriteAnimation } from '@minstrel/game-formats'
import { doorAt } from './doors.ts'

/**
 * The mark over the Hero's head when there is something to do: a speech
 * bubble when someone to talk to is in front of them, a mark when something to
 * examine is, and another at a doorway they are about to go through — the three
 * `fuki_` sheets in `/data/ani`: `fuki_com`, `fuki_hkn` and `fuki_in`.
 *
 * INFERRED: which sheet is which, from their names — `com` for a
 * conversation, `hkn` for *hakken*, finding, `in` for going in — and from a
 * let's play, where a speech bubble stands over the Hero's head as they face a
 * villager (17:07), a mark as they face the Hexagon's inscription (23:50), and
 * another at the inn's door just before they go in (21:18). **When one shows is
 * ours**: while nothing else is going on, for whatever talking would reach.
 */
export type BubbleKind = 'talk' | 'examine' | 'door'

/** Each mark's sheet, by name — see {@link BubbleKind}. */
export const BUBBLE_SHEETS: Readonly<Record<BubbleKind, string>> = {
  talk: 'fuki_com',
  examine: 'fuki_hkn',
  door: 'fuki_in',
}

/**
 * Which of a sheet's frames shows `ticks` sixtieths of a second in, going round
 * its first animation — `com_fuki` is frames 0, 1, 2 and 1 for 10 each. The
 * steps' lengths are taken as the DS's sixtieths: ours, not read.
 */
export function bubbleFrame(animations: readonly SpriteAnimation[], ticks: number): number {
  const steps = animations[0]?.steps ?? []
  const lengthOf = (step: { readonly duration?: number }) => Math.max(1, step.duration ?? 1)
  const total = steps.reduce((sum, step) => sum + lengthOf(step), 0)
  if (total === 0) return 0
  let t = ((Math.floor(ticks) % total) + total) % total
  for (const step of steps) {
    if (t < lengthOf(step)) return step.frame
    t -= lengthOf(step)
  }
  return steps[0]?.frame ?? 0
}

/**
 * The doorway just ahead of someone, `reach` in front of where they stand and
 * the way they face, if there is one — the one they are about to go through.
 * Not one they already stand in: that is the one they came out of.
 */
export function doorAhead(
  doors: readonly MapTransition[],
  at: { readonly x: number; readonly z: number; readonly facing: number },
  reach: number,
): MapTransition | undefined {
  if (doorAt(doors, at.x, at.z)) return undefined
  return doorAt(doors, at.x + Math.sin(at.facing) * reach, at.z + Math.cos(at.facing) * reach)
}
