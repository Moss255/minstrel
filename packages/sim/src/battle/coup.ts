/**
 * **The coup de grâce's readiness** — read 4 October 2026 from the USA build's
 * overlay 24 (`func_ov024_021eb5d0`, the resolver) and overlay 0. A member of
 * the party comes ready for their coup by two draws of the battle's own in the
 * resolver:
 *
 * - **at each pass that reaches them** (`0x021ecf6c`–`0x021ed078`), after the
 *   pass's own results — any action, anyone's: a monster's blow, an ally's
 *   heal, their own Defend. Its term is what the action dealt them as a share
 *   of their maximum HP ({@link coupHpTerm}), only for an action of kind 1
 *   (damage) or 35 (Kamikazee);
 * - **after each action of their own** (`0x021ed298`–`0x021ed3c8`), while a
 *   monster stands: its term is their vocation's ({@link COUP_VOCATION}) and
 *   what they wear ({@link coupBonus}).
 *
 * Each term is multiplied by **1, 2, 3 or 4** — by how many of the living party
 * are already ready (`data_ov024_021fe738`) — and the hundred drawn must come
 * in under it. The action's own term (`+0x2c` bits 20–26) is 0 on every action
 * in the English tables, and left out.
 *
 * **Who may**: a character of the party at **level 10 or more in their
 * vocation**, standing, not asleep, not ready already (`func_ov024_021eb1ec`).
 * Ready, they keep it for **6 to 9 command phases** by their level
 * ({@link coupRounds}), and it passes at the round's end that runs it out
 * (`func_ov000_02157e1c`) — or is used: an action in {@link COUP_ACTIONS}
 * clears it.
 *
 * **Ours**: paralysis, confusion and "Inactive", which also refuse, are not
 * kept by the battle; nor is the flag a revival sets (`status+0x3a`), which
 * skips one pass's draw — the battle revives nobody; nor the battles 800 and
 * 801, whose chance is 0.
 */

/** The level in their vocation a member must reach (`0x021eb224`). */
export const COUP_LEVEL = 10

/** The multiplier by how many of the living party are ready already — 0, 1, 2, 3 or more. */
export const COUP_MULTIPLIERS = [1, 2, 3, 4] as const

/**
 * Each vocation's own term (`func_ov000_02159d24`, pairs at `0x02182d88`), by
 * the level tables' number: a Martial Artist, Luminary or Ranger 2, the rest of
 * the twelve 1, and none else.
 */
export const COUP_VOCATION: ReadonlyMap<number, number> = new Map([
  [1, 1], // Warrior
  [2, 1], // Priest
  [3, 1], // Mage
  [4, 2], // Martial Artist
  [5, 1], // Thief
  [6, 1], // Minstrel
  [7, 1], // Gladiator
  [8, 1], // Armamentalist
  [9, 1], // Paladin
  [10, 1], // Sage
  [11, 2], // Luminary
  [12, 2], // Ranger
])

/** A member's term after acting: their vocation's and what they wear (`func_02085038`). */
export function coupBonus(vocation: number, worn: number): number {
  return (COUP_VOCATION.get(vocation) ?? 0) + worn
}

/**
 * The share of their maximum HP an action dealt them, as a term
 * (`func_ov024_021eb344`, the table at `0x021fe970`): the first of a ninth,
 * … a tenth, nine tenths, it reaches — 90, 90, 64, 32, 16, 8, 4, 2, 1 — or
 * none. The game compares in floats; this is the same in whole numbers, held
 * to `coupHpTermOf` in the oracle over every HP to 999.
 */
export function coupHpTerm(damage: number, maxHp: number): number {
  if (damage <= 0 || maxHp <= 0) return 0
  for (const [tenths, term] of HP_TERMS) if (damage * 10 >= tenths * maxHp) return term
  return 0
}

const HP_TERMS: readonly (readonly [number, number])[] = [
  [9, 90],
  [8, 90],
  [7, 64],
  [6, 32],
  [5, 16],
  [4, 8],
  [3, 4],
  [2, 2],
  [1, 1],
]

/** The chance, in a hundred, a term gives with `ready` of the living party ready already. */
export function coupChance(term: number, ready: number): number {
  return (COUP_MULTIPLIERS[Math.min(ready, 3)] as number) * term
}

/**
 * How long it is held, counted down at each round's end and gone at 0
 * (`func_ov024_021eb3e0`): 7 below level 25, 8 below 50, 9 below 75, and 10 —
 * so offered in the 6, 7, 8 or 9 command phases after it comes.
 */
export function coupRounds(level: number): number {
  return level >= 75 ? 10 : level >= 50 ? 9 : level >= 25 ? 8 : 7
}

/** The coups (`0x021fe7aa`): an action of these clears its actor's readiness. */
export const COUP_ACTIONS: ReadonlySet<number> = new Set([
  505, 506, 507, 508, 509, 510, 511, 512, 513, 514, 527, 516,
])

/** Each vocation's coup, by the level tables' number (`data_ov000_02183658`); a Guardian's is the Warrior's. */
export const COUP_OF: ReadonlyMap<number, number> = new Map([
  [0, 505],
  [1, 505],
  [2, 506],
  [3, 507],
  [4, 508],
  [5, 509],
  [6, 510],
  [7, 511],
  [8, 512],
  [9, 513],
  [10, 514],
  [11, 527],
  [12, 516],
])
