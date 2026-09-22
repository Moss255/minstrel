import type { Opening } from './battle.ts'
import type { DropRng } from './drops.ts'

/**
 * How a fight opens, decided as the field hands it over — the game's
 * `func_ov017_021970a0`, which the wandering-monster check calls and whose
 * answer travels to `[battle + 0xe49]`, where `ProcessCombatTurn` reads it.
 *
 * **Who was facing whom decides which way it can go.** The check measures the
 * angle between each one's facing and the bearing to the other, against
 * {@link FACING_CONE}:
 *
 * | how they met | the party may surprise | the party may be surprised |
 * |---|---|---|
 * | face to face | `2 + deftness ÷ 20` in a hundred | 2 in a hundred |
 * | the monster's back was turned | `12 + deftness ÷ 20` | never |
 * | it came at the party from behind | never | 12 in a hundred |
 *
 * The deftness is the highest among the party who can act — the same ten bits
 * of a character's record that `RollCritical` hands `CalculateCritRate`.
 *
 * **The draws are the C library generator's** (`func_02032370`), as a drop's
 * are: the battle has none of its own yet when this runs.
 */

/**
 * How far off a facing may be and still count as looking at the other — the
 * game's `9007.6` of a turn of `0x10000`, which is 49.48°, in radians.
 */
export const FACING_CONE = (9007.599609375 / 0x10000) * 2 * Math.PI

/** A tenth of a turn either way, as the game's own numbers: the chance's two terms. */
function chanceOf(deftness: number, bonus: number): number {
  const f = Math.fround
  return Math.trunc(f(f(f(f(deftness) * f(0.05)) + f(2)) + f(bonus)))
}

export function howItOpens(
  rand: DropRng,
  met: {
    /** How far the monster's facing is from the bearing to the party, in radians. */
    readonly theirs: number
    /** How far the party's facing is from the bearing to the monster, in radians. */
    readonly ours: number
    /** The highest deftness among the party standing. */
    readonly deftness: number
  },
): Opening {
  // The monster's back is turned; else the party's; else they met face to face.
  if (met.theirs > FACING_CONE) {
    return rand.below(100) < chanceOf(met.deftness, 10) ? 'monstersSitOut' : 'even'
  }
  if (met.ours > FACING_CONE) {
    return rand.below(100) < chanceOf(0, 10) ? 'partySitsOut' : 'even'
  }
  if (rand.below(100) < chanceOf(met.deftness, 0)) return 'monstersSitOut'
  return rand.below(100) < chanceOf(0, 0) ? 'partySitsOut' : 'even'
}

/** How far `from` is from looking at `to`, in radians, either way round the turn. */
export function facingOff(
  from: { readonly x: number; readonly z: number; readonly facing: number },
  to: { readonly x: number; readonly z: number },
): number {
  const bearing = Math.atan2(to.x - from.x, to.z - from.z)
  const off = Math.abs(((bearing - from.facing + Math.PI) % (2 * Math.PI)) - Math.PI)
  return off > Math.PI ? 2 * Math.PI - off : off
}
