import { GUARD_LEVELS } from './damage.ts'

/**
 * **The stances** — status `+0x21`, read 7 October 2026 (task 18;
 * `docs/readings/T18-handlers.md` §13).
 *
 * An action whose record has `+0x08` bit 28 is taken up as the round begins
 * (`func_ov000_0215f110`, `0x0215f174`–`0x0215f194`): its MP spent there
 * (`func_ov000_021537b8`, `func_ov000_0215a124`) and its stance set from the
 * table at `0x02182e24` (`0x02153a10`–`0x02153a54`) — the
 * action, the stance, and a motion for `+0xc1`. Short of MP, the action
 * becomes 0x3a9 for an ability, 0x1f8 for a spell (`0x0215398c`–`0x021539b4`),
 * and no stance is set. The turn asks no MP of it (`func_ov024_021eaa50`,
 * `0x021eabe8`–`0x021eabf4`). The round's end clears it
 * (`func_ov000_0215e6e8`, `0x0215e7c8`), and so do paralysis and a lost turn
 * as they land (`func_0208826c`, `func_02088474`).
 *
 * What each does is read where `+0x21` is read:
 *
 * - **1 Defend, 2 Defending Champion, 3** — the final damage multiplies an
 *   action defending works on by the table at `0x020e88c0` by the stance,
 *   for a stance up to 3: 0.5, 0.1, 0 (`func_ov024_021e6a90`,
 *   `0x021e75dc`–`0x021e7618`; `func_02074938`). See {@link guardOf}.
 * - **4 Counter Wait, 5 Back Atcha** — the resolver's redirection
 *   (`func_ov024_021e9f68`, `0x021ea15c`–`0x021ea2e8`): an action with
 *   `+0x10` bit 7 at a holder who can act is struck by the holder instead —
 *   back at its actor (4), or at a monster drawn from those standing (5).
 * - **6 Whipping Boy, 7 Selflessness, 8 Forbearance** — the cover before it
 *   (`func_ov024_021e9b74`): an action with `+0x10` bit 12 at one of their
 *   side is taken in its target's place, by a draw among those who can act —
 *   Forbearance's always, Selflessness's for a target at 8 in 100 of their
 *   most HP or less, Whipping Boy's for the one they protect.
 */
export const STANCES: ReadonlyMap<number, number> = new Map([
  [3, 1],
  // Blockenspiel — the one blow among them.
  [134, 1],
  [135, 2],
  [237, 3],
  [96, 4],
  [138, 5],
  [146, 6],
  [0x3a1, 6],
  [185, 7],
  [182, 8],
  [329, 9],
])

export const STANCE = {
  defend: 1,
  champion: 2,
  counter: 4,
  backAtcha: 5,
  whippingBoy: 6,
  selfless: 7,
  forbearance: 8,
} as const

/**
 * **Selflessness's line** — a target's HP over their most, in floats
 * (`func_ov024_021db358`; nothing for one with none), at or under `0.08`
 * (the literal at `0x021e9f64`, `_fleq` at `0x021e9d5c`).
 */
export const SELFLESS_AT = Math.fround(0.08)

export function hpShare(hp: number, maxHp: number): number {
  if (hp === 0) return 0
  return Math.fround(Math.fround(hp) / Math.fround(maxHp))
}

/**
 * **What a stance's guard leaves of a blow it works on** — the table by the
 * stance, for a stance of 3 or under (`0x021e75f8`): Defend's half,
 * Defending Champion's tenth. Whole for any other.
 */
export function guardOf(f: { readonly defending: boolean; readonly stance?: number }): number {
  const stance = f.stance ?? (f.defending ? STANCE.defend : 0)
  return stance <= 3 ? (GUARD_LEVELS[stance] as number) : 1
}
