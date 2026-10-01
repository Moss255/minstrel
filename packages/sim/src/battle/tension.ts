import type { BattleRng } from './rng.ts'

/**
 * **Tension** — Psyche Up's, as the game keeps it. Read 1 October 2026 from
 * the decomp (USA; `docs/conformance.md`, "Tension"). A fighter's level is a
 * byte, 0 to 4 (`[status + 0x24]`); the battle shows it as 5, 20, 50 and 100
 * (`func_ov025_021d8c30`, `0x021d9eb4`). It does not wear off with the rounds
 * (`func_02087704` has no caller that is a round's or a turn's): it is spent
 * by the next action whose record carries `+0x10` bit `0x2000`, whatever that
 * action comes to, and lost to sleep.
 */

/** The highest level: the maximum, "super-high tension". */
export const TENSION_MOST = 4

/** What a level is shown as — the presenter's, `0x021d9eb4`. */
export const TENSION_SHOWN = [0, 5, 20, 50, 100] as const

const f = Math.fround

/**
 * **The multiplier** (`func_02074738`, the table at `data_020e88f8` in the
 * ARM9): by level, the party's column and the monsters', each held to at
 * least one. The side is the one **dealing** it.
 */
export const TENSION_MULTIPLIERS = {
  party: [1, 1.5, 2.5, 4, 6].map(f),
  foes: [1, f(1.3), 2, 3, 4.5].map(f),
} as const

/**
 * **Tension at the head of the damage** (`func_ov024_021e6a90`,
 * `0x021e6b9c`–`0x021e6d18`), in the game's floats: the base times the
 * multiplier, plus `CalculateTensionBonus` — one and a tenth of the dealer's
 * level, truncated, times **the level byte**, not the number shown.
 */
export function tensed(
  base: number,
  level: number,
  side: 'party' | 'foes',
  dealerLevel: number,
): number {
  if (level <= 0) return f(base)
  const m = TENSION_MULTIPLIERS[side][Math.min(level, TENSION_MOST)] as number
  const bonus = f(f(1 + Math.trunc(dealerLevel / 10)) * f(level))
  return f(f(f(base) * m) + bonus)
}

/**
 * One step of Psyche Up (`func_0208767c`, by way of `func_02088208`): a level
 * up from 0, 1 or 2 with no draw; **from 3 a coin of the battle's own**
 * (`NextRandomMax(battle, 2)`, `0x020876b4`) — 0 reaches the maximum, 1 fails.
 * The new level, or −1 for the coin lost.
 */
export function psychedUp(level: number, rng: BattleRng): number {
  if (level >= TENSION_MOST) return -2
  if (level === TENSION_MOST - 1 && rng.below(2) === 1) return -1
  return level + 1
}
