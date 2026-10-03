import type { ExperienceBand } from '@minstrel/game-formats'

/**
 * How a won battle's experience is shared among the party — the game's own,
 * `func_ov023_021f4098` (US overlay 23), which the victory routine
 * `func_ov023_021edf54` calls for each of the four places at `0x021ee140` and
 * keeps at `battle + 0x5758`.
 *
 * **Translated, in the game's 32-bit floats** — `CLAUDE.md`'s exception for
 * the battle's own arithmetic: every step through `Math.fround`, in the
 * game's order, and held to `test/game-oracle.ts`.
 *
 * A member's share is
 *
 *     ⌈ total × (k + level) × rounds ÷ Σ (k + level) × rounds ⌉
 *
 * the sum over every member present and standing, where `level` is their
 * current vocation's (`func_0202053c`: the halfword at `+0x16c + 2 × vocation`
 * of their record) and `k` is `expadj.nat`'s number for the total — see
 * {@link bandAdd}. A member absent or down takes nothing and weighs nothing.
 * A sum of nothing is taken as 1. The share is multiplied by 1.05 first when
 * `func_0208538c` says so of the member's record (see {@link Sharer.bonus}),
 * and rounded **up**: the shares can come to more than the total.
 *
 * **`rounds` is INFERRED.** The number is the member's counter at `+0x19c`
 * → `+8` (`func_02053dfc`), which `func_02053da0` zeroes and `func_02053dd0`
 * adds one to — for each member present, unless a flag at `+0x138` → `+0x14`
 * bit 0 is set — at one point of overlay 26's battle loop (`0x021dacb0`),
 * which is taken to be a round's start. That it counts rounds, and that the
 * flag is being down, is inferred from where it is called; not traced further.
 *
 * **The number of players** is the count of those connected in multiplayer
 * (`func_0202b7d8`, `func_0202c1c0`); the total is multiplied by
 * `1 + (players − 1) ÷ 10`. Multiplayer is out, so it is one, and the factor
 * one exactly — but the steps are kept, as the game makes them.
 */
export interface Sharer {
  /** Rounds they took part in — see the note on {@link experienceShares}. INFERRED. */
  readonly rounds: number
  /** Their level in the vocation they are. */
  readonly level: number
  /** Knocked out at the battle's end: no share, and no weight in the others'. */
  readonly down: boolean
  /**
   * Whether their share is multiplied by 1.05: `func_0208538c` of their
   * record — true when something worn in one of the battle's eight places
   * carries bit 16 of its `itembtlprm.nat` record's flags. Only the elevating
   * shoes do. Theirs alone, and once however many; the sum the shares are
   * divided by does not include it.
   */
  readonly bonus?: boolean
}

const f = Math.fround

/** One player: multiplayer is out. */
const PLAYERS = 1
/** What `func_ov023_021f5578` returns when no band holds the total. */
const NO_BAND = 4
/** `0x3f866666`, the bonus's multiplier. */
const BONUS = f(1.05)

/**
 * `expadj.nat`'s number for a total — `func_ov023_021f5534`: the first band
 * whose bound the total does not pass, or that has none; 4 when none does.
 */
export function bandAdd(bands: readonly ExperienceBand[], total: number): number {
  for (const band of bands) {
    if (band.upTo === undefined || total <= band.upTo) return band.add
  }
  return NO_BAND
}

/** `1 + (players − 1) ÷ 10`, times the total — the steps at `0x021f4214` and `0x021f431c`. */
function scaled(total: number): number {
  return f(total * f(1 + f(f(PLAYERS - 1) / 10)))
}

/**
 * Every place's share of `total`, in the party's order — the game's four
 * places, `undefined` for one nobody holds. Each is `func_ov023_021f4098`.
 */
export function experienceShares(
  total: number,
  places: readonly (Sharer | undefined)[],
  bands: readonly ExperienceBand[],
): number[] {
  // What each place weighs: nothing for one empty or down (`0x021f4134` on).
  const rounds = [0, 1, 2, 3].map((i) => {
    const s = places[i]
    return s && !s.down ? f(s.rounds) : 0
  })
  const levels = [0, 1, 2, 3].map((i) => {
    const s = places[i]
    return s && !s.down ? f(s.level) : 0
  })
  const whole = f(total)
  const k = f(bandAdd(bands, Math.trunc(scaled(whole))))
  const weight = (j: number) => f(f(k + (levels[j] ?? 0)) * (rounds[j] ?? 0))
  // Summed as the game sums them: the second and first, then the third, then
  // the fourth (`0x021f42e8` on).
  let sum = f(weight(3) + f(weight(2) + f(weight(0) + weight(1))))
  if (sum === 0) sum = 1
  return places.map((s, i) => {
    if (!s || s.down) return 0
    let share = f(scaled(whole) * f(weight(i) / sum))
    if (s.bonus) share = f(share * BONUS)
    // Up to the next whole number, as the game does it: the fraction left
    // after truncating, and one added if it is above nothing.
    if (0 < f(share - f(Math.trunc(share)))) share = f(share + 1)
    return Math.trunc(share)
  })
}
