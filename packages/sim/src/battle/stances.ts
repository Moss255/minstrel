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

/**
 * **Pincushion** (action 476, kind 66): taken up as the round begins like the
 * stances, but not by the table — the command sets status `+0x18` bit 5
 * (`func_ov000_021537b8`, `0x021539dc`–`0x02153a0c`; `func_02088db8`), which
 * the round's count-down clears (`func_ov000_02157e1c`, `0x02157f18`;
 * `func_02088dc8`), and paralysis and a lost turn with the stance. Its
 * holder takes a half of what defending works on (`func_ov024_021e6a90`,
 * `0x021e761c`–`0x021e7640`), and pricks back — see `PRICK`.
 */
export const PINCUSHION = 0x1dc

/**
 * **What Pincushion pricks back with** — `func_ov024_021e62cc`, after an
 * action a stance turns (`+0x10` bit 7), if its actor can act: for each one
 * it struck who stands and holds Pincushion, a quarter of all it dealt them,
 * in floats and truncated (`0x021e64e0`, `0x021e658c`–`0x021e65a4`) — on a
 * metal actor, a draw below 2 in its place (`0x021e65b0`–`0x021e65d4`) —
 * dealt to the actor, "Does … points of damage to …" (555) at a monster;
 * stopping where it fells them (`func_ov000_02159f18`).
 */
export const PRICK = Math.fround(0.25)

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
 * Defending Champion's tenth; and Pincushion's half. Whole for any other.
 */
export function guardOf(f: {
  readonly defending: boolean
  readonly stance?: number
  readonly spiked?: boolean
}): number {
  const stance = f.stance ?? (f.defending ? STANCE.defend : 0)
  const guard = stance <= 3 ? (GUARD_LEVELS[stance] as number) : 1
  // Pincushion's half after it, a second multiplication (`0x021e7630`) —
  // by a power of two, so taken into the one here exactly.
  return f.spiked ? Math.fround(guard * 0.5) : guard
}
