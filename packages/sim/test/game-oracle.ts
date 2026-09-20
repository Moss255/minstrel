/**
 * The game's own battle arithmetic, translated from its decompilation, in the
 * 32-bit floats it actually computes in.
 *
 * **This is a test oracle and lives in the test tree on purpose.** The
 * simulation keeps floats out of gameplay arithmetic (`CLAUDE.md`, "Fixed-point
 * in simulation"), and the game does not: its damage, its draws below a
 * maximum and its critical chance all pass through `float`. So the simulation's
 * integer forms are held to this, function by function, and where the two part
 * the conformance tests say how often and by how much rather than letting
 * either quietly win.
 *
 * `Math.fround` is IEEE-754 single precision and the same on every platform,
 * so this is as reproducible as the integers are. Each function cites the
 * decomp's source file and symbol; addresses are the USA build's.
 */

const f = Math.fround

const MULTIPLIER = 0x5d588b656c078965n
const INCREMENT = 0x269ec3n
const MASK = (1n << 64n) - 1n

/** `struct Random` — `src/Util/Random.cpp`. */
export class GameRandom {
  state: bigint
  drawn = 0

  /** `SeedRandom`: the state as given; the multiplier and increment are fixed. */
  constructor(state: bigint) {
    this.state = state & MASK
  }

  /**
   * `NextRandom` (0x020742c0): **steps first**, then hands back the new
   * state's top 32 bits. The simulation's `BattleRng.top32` hands back the
   * seed's own top first and steps after, so the two are the same sequence one
   * step apart — see `BattleRng.fromGameState`.
   */
  next(): number {
    this.state = (this.state * MULTIPLIER + INCREMENT) & MASK
    this.drawn++
    return Number(this.state >> 32n)
  }

  /** `NextRandomFloat01` (0x0207434c): `NextRandom / (double) 0xFFFFFFFF`, narrowed to float. */
  float01(): number {
    return f(this.next() / 0xffffffff)
  }

  /**
   * `NextRandomMax` (0x020742fc): `maximum * NextRandomFloat01`, truncated, and
   * held below the maximum — the float reaches 1.0 when every bit is set.
   */
  max(maximum: number): number {
    if (maximum <= 0) return 0
    const result = Math.trunc(f(f(maximum) * this.float01()))
    return result >= maximum ? maximum - 1 : result
  }

  /** `NextRandomFloatBetween` (0x02074388): `(max − min) × float01 + min`, each step a float. */
  floatBetween(minimum: number, maximum: number): number {
    return f(f(f(f(maximum) - f(minimum)) * this.float01()) + f(minimum))
  }

  /** `NextRandomBetween` (0x02074478): `NextRandomMax(max − min + 1) + min`, both ends included. */
  between(minimum: number, maximum: number): number {
    return this.max(maximum - minimum + 1) + minimum
  }
}

/** `RoundUp` (0x020744a8) — `0.5f + x`, truncated by its `int` return. Despite the name, round-half-up. */
export function roundUp(value: number): number {
  return Math.trunc(f(0.5 + f(value)))
}

/**
 * `CalculatePhysicalDamage` (0x020744c0) — `src/Combat/Main/BasicAttackCalculation.cpp`.
 *
 * Returns the game's float. Its caller, `GetAttackBaseDamage` in overlay 24,
 * returns it as an `int`, which **truncates** — `RoundUp` is called sixteen
 * bytes before it, on a stat after its multiplier, not on the damage.
 */
export function calculatePhysicalDamage(
  attack: number,
  defence: number,
  random: GameRandom,
): number {
  let damage = f(f(f(attack) - f(f(defence) / 2)) / 2)
  if (damage <= 0) return 0
  const minimum = f(f(attack) / 16)
  if (damage <= minimum) {
    damage = random.floatBetween(0, minimum)
  } else {
    const limit = f(damage / 16)
    const percentage = random.floatBetween(f(0 - limit), limit)
    const flat = random.floatBetween(-1, 1)
    damage = f(f(damage + percentage) + flat)
  }
  return damage < 0 ? 0 : damage
}

/**
 * `CalculateCritRate` — `src/Combat/Main/CritRateCalculation.cpp`. A percentage.
 *
 * Two in a hundred to begin with; deftness counts only past 150, a hundredth
 * of a point each, through a `short`; an accessory's and a book's bonus are
 * added, a skill's multiplies, and a move of several hits shares it out.
 */
export function calculateCritRate(
  deftness: number,
  accessoryBonus = 0,
  bookBonus = 0,
  skillBonus = 1,
  hitCount = 1,
): number {
  // The `short` conversion the assembly's shifts point to.
  const base = Math.max(0, ((deftness - 150) << 16) >> 16)
  const baseChance = f(f(2) + f(f(0.01) * f(base)))
  let chance = f(f(accessoryBonus) + baseChance)
  chance = f(f(bookBonus) + chance)
  chance = f(f(skillBonus) * chance)
  return f(f(f(1) / f(hitCount)) * chance)
}

/**
 * `CalculateTensionBonus` — `src/Combat/Main/TensionBonusCalculation.cpp`.
 * The level is divided by ten **as an integer** before it becomes a float, so
 * levels 10 to 19 all give 2.0.
 */
export function calculateTensionBonus(tension: number, attackerLevel: number): number {
  const levelMultiplier = f(1 + f(Math.trunc(attackerLevel / 10)))
  return f(levelMultiplier * f(tension))
}

/** The buff multipliers of `BasicAttackCalculation.cpp`, by level. */
export const buffMultiplier = {
  /** A quarter a level, either way. */
  attack: (level: number): number => f(1 + f(0.25 * level)),
  /** Half again a level up; down, a half at −1 and three quarters at −2. Agility's is the same. */
  defence: (level: number): number =>
    level >= 0 ? f(1 + f(level * 0.5)) : f(1 + f(f((level + 1) * 0.25) - 0.5)),
  /** Half again a level up, and nothing taken off going down. */
  charm: (level: number): number => (level < 0 ? 1 : f(1 + f(0.5 * level))),
  /** Magical might and mending alike: half a level, either way. */
  magic: (level: number): number => f(1 + f(0.5 * level)),
}

/**
 * Whether a blow is a critical — `func_ov000_02156cc4`, overlay 0, the one
 * caller `CalculateCritRate` has.
 *
 * The percentage is multiplied by 100 **as a float**, truncated by `_ffix`,
 * and a draw below 10,000 has to come in under it:
 *
 *     NextRandomMax(random, 10000) < (int)(100.0f * rate)
 *
 * The truncation matters, because `0.01f` is not a hundredth: at 151 of the
 * 850 deftness values past 150 the threshold comes out one lower than
 * `200 + (deftness − 150)`.
 */
export function criticalThreshold(ratePercent: number): number {
  return Math.trunc(f(f(100) * f(ratePercent)))
}

/** The roll itself: one draw, whatever the outcome. */
export function rollsCritical(random: GameRandom, ratePercent: number): boolean {
  return random.max(10_000) < criticalThreshold(ratePercent)
}

/**
 * A monster's critical rate — `func_020748f8`, which overlay 0 calls instead
 * of `CalculateCritRate` for a combatant that is not one of the party's four.
 *
 * `(1 / hits) × (0.0 × skill)`: the base is a literal zero, so **a monster's
 * rate is nothing whatever its skill says**, and it never criticals through
 * this roll. The draw is still spent.
 */
export function calculateMonsterCritRate(skillBonus: number, hitCount = 1): number {
  return f(f(f(1) / f(hitCount)) * f(f(0) * f(skillBonus)))
}

/**
 * The party's rate doubles — `× 2.0f` — when the character has trait `0x11d`
 * and `func_ov000_02155a04` of them is under `0.25f`. What the trait is and
 * what the quarter is a quarter *of* are not read; a quarter of the HP left is
 * the obvious guess and is only that.
 */
export const CRITICAL_DOUBLING = { trait: 0x11d, below: 0.25, times: 2 } as const

/**
 * The surprise round — in `ProcessCombatTurn`, overlay 0. `[battle + 0xe49]`
 * says how the fight opened: at 1 the monsters sit the first round out; at 2
 * the party does, the first monster always acts, and **each monster after it
 * acts only on a draw below 100 coming in under 67**.
 */
export const AMBUSH_FOLLOWER_ACTS_BELOW = 67
export function ambushFollowerActs(random: GameRandom): boolean {
  return random.max(100) < AMBUSH_FOLLOWER_ACTS_BELOW
}

/**
 * The order a blow's draws are made in — `func_ov024_021eb5d0`, the resolver
 * of a blow, overlay 24:
 *
 *   1. **the critical roll**, always — once for the whole action when
 *      `func_ov024_021ea4d0` or `021ea500` says so, else once a target. It
 *      spends its draw for a monster too, whose rate is nothing; only an
 *      action that is always a critical skips it;
 *   2. **the evasion roll**, if the action can be dodged;
 *   3. **the block roll**, if it can be blocked;
 *   4. **the accuracy roll**, `func_ov000_02156648` — see {@link rollsLands};
 *   5. the damage, `GetAttackBaseDamage`.
 */
export const BLOW_ORDER = ['critical', 'evade', 'block', 'accuracy', 'damage'] as const

/** A monster's chance of dodging, in a hundred, by the grade in its record — the table at 0x020e88e4. */
export const MONSTER_EVASION = [0, 2, 4, 8, 25] as const

/**
 * A target's chance of dodging, a percentage — `func_ov000_02156270`.
 *
 * One of the party: two, and an accessory's and a skill's bonus. A monster: by
 * its grade. Either doubles under one status and is fifty flat under another;
 * one of the party's doubles again with trait `0xA6` when `func_ov000_02155a04`
 * of them is under `0.08f`, which is not understood.
 */
export function evasionRate(
  target: { party: true; accessory?: number; skill?: number } | { party: false; grade: number },
  status: { doubled?: boolean; fifty?: boolean } = {},
): number {
  let rate: number
  if (target.party) rate = f(f(target.skill ?? 0) + f(f(2) + f(target.accessory ?? 0)))
  else rate = target.grade < 0 || target.grade > 4 ? 0 : (MONSTER_EVASION[target.grade] as number)
  if (status.doubled) rate = f(f(2) * rate)
  return status.fifty ? 50 : rate
}

/** The evasion roll — `func_ov000_02156f98`: a draw below 100 under the rate **truncated**. No draw unless the action can be dodged. */
export function rollsEvade(random: GameRandom, evadable: boolean, ratePercent: number): boolean {
  if (!evadable) return false
  return random.max(100) < Math.trunc(f(ratePercent))
}

/** The block roll — `func_ov000_02156e30`: the draw **as a float** under the rate, untruncated. No draw unless the action can be blocked. */
export function rollsBlock(random: GameRandom, blockable: boolean, ratePercent: number): boolean {
  if (!blockable) return false
  return f(random.max(100)) < f(ratePercent)
}

/**
 * Whether a blow lands — `func_ov000_02156648`, the fourth of a blow's rolls.
 *
 * **The percent draw is made before anything is compared**, so an action whose
 * accuracy stands at a hundred — the plain Attack's — lands every time and
 * spends its draw all the same. After it:
 *
 * - a die of four that misses on 0, for one of the party with a certain trait
 *   on an action flagged `0x10000` (`fourSided`);
 * - for a scaling action with no number named to scale by, **a float drawn
 *   between its least and most**, truncated (`drawnBetween`);
 * - a die of eight that misses on 0 to 4 — five faces of eight — when the
 *   action is spoilt by sight and the attacker is under that status.
 *
 * The accuracy is then times the target's resistance plus a half, truncated,
 * and the blow lands on a draw under it. What exits before the draw — several
 * of the target's statuses, and an argument that says it always lands — spends
 * nothing.
 */
export function rollsLands(
  random: GameRandom,
  action: {
    accuracy?: number
    drawnBetween?: readonly [number, number]
    spoiltBySight?: boolean
    fourSided?: boolean
  },
  attacker: { sightSpoilt?: boolean } = {},
  resistance = 1,
): boolean {
  const draw = random.max(100)
  if (action.fourSided && random.max(4) === 0) return false
  let accuracy = f(action.accuracy ?? 100)
  if (action.drawnBetween) {
    accuracy = f(Math.trunc(random.floatBetween(action.drawnBetween[0], action.drawnBetween[1])))
  }
  accuracy = f(f(accuracy * f(resistance)) + f(0.5))
  if (action.spoiltBySight && attacker.sightSpoilt && random.max(8) < 5) return false
  return draw < Math.trunc(accuracy)
}

/**
 * What a critical is worth — `func_02074838`, which takes the generator. With
 * its flag set, an attack's: the value times a draw from 0.95 to 1.05. With it
 * clear, anything else's: the value times a draw from 1.5 to 2.0.
 */
export function criticalValue(value: number, isAttack: boolean, random: GameRandom): number {
  const draw = isAttack ? random.floatBetween(0.95, 1.05) : random.floatBetween(1.5, 2)
  return f(f(value) * draw)
}

/**
 * A critical's damage — the head of `func_ov024_021e6a90`, the last function a
 * blow's damage goes through. `func_ov024_021ea7fc` says whether it applies:
 * not to Thunder Thrust or Hatchet Man, whose own handler has it, nor to an
 * action that is always a critical, bar `0x1F9`.
 *
 * For the plain Attack, `0xDB` and `0x1F9` the value is **the attacker's attack
 * power** and the floor the damage itself; for anything else the value is the
 * damage and there is no floor. Either way: the greatest of the damage and a
 * fifth, the value's critical, and the floor.
 */
export function criticalDamageOf(base: number, random: GameRandom, attack?: number): number {
  const boosted = f(f(1.2) * f(base))
  const drawn = criticalValue(attack ?? base, attack !== undefined, random)
  let damage = boosted < drawn ? drawn : boosted
  const floor = attack !== undefined ? f(base) : 0
  if (damage < floor) damage = floor
  return damage
}

/** What an action's damage goes through after the base: 67 slots, by nine bits of its record. Slot 0 is none. */
export const DAMAGE_HANDLERS = 67
/** A blow that strikes several weakens as it goes — `func_02074948`'s table, by how many it has struck. */
export const SWEEP_FALLOFF = [1, 0.8, 0.6, 0.4, 0.2] as const

/** What the last function knows of a blow by the time it gets to the end of it. */
export interface BlowEnd {
  readonly dodged: boolean
  readonly blocked: boolean
  /** The action's number — `+0x04`, the low twelve bits. */
  readonly action: number
  /** The action's kind — `+0x18`, bits 5 to 11. 1 is what does damage. */
  readonly kind: number
  /** `+0x1C`, the low 14 bits; 0 is none. */
  readonly damageCap: number
  /** `+0x10`, bit 24. */
  readonly worksOnMetal: boolean
  /** The target's resistance to the action's elements is above nothing — `func_ov000_02156b38`, twice. */
  readonly targetCanBeHurt: boolean
  /** `func_ov000_02156068(ctx, target, 0, 1)`. */
  readonly targetIsMetal: boolean
  readonly critical: boolean
  /**
   * The target's status bit `0x1000000` — `func_ov024_021dd260`. INFERRED to
   * be defending, from the halving alone; nothing that sets it has been found.
   */
  readonly targetStatus24: boolean
}

/**
 * The end of `func_ov024_021e6a90`, from `0x021e7760` on, for what the slice
 * can meet: the flags zeroing the damage, the coin, the metal pair, the
 * halving, the whole number, the cap. **In that order**, and never asking
 * whose blow it is.
 *
 * Left out, and in the function: the metal body zeroing certain blows
 * (`0x021e77a4`), one more for the party under an item (`0x021e7970`), the
 * attacker's own status multiplying by `func_02074738`'s table (`0x021e79d0`),
 * the combo table (`0x021e7a8c`), and action `0xAF` keeping a quarter.
 */
export function endOfBlow(damage: number, blow: BlowEnd, random: GameRandom): number {
  let d = f(damage)
  if (d > 0 && blow.blocked) d = 0
  if (d > 0 && blow.dodged) d = 0
  if (d <= 0) {
    const coin =
      !blow.blocked &&
      !blow.dodged &&
      blow.action !== 0x70 &&
      blow.action !== 0x48 &&
      blow.targetCanBeHurt &&
      blow.action !== 0x1b &&
      !(blow.targetIsMetal && !blow.worksOnMetal)
    if (coin) d = f(random.max(2))
  }
  if (blow.targetIsMetal && !blow.critical && (blow.action === 0x40 || blow.action === 0x7e)) {
    d = f(1 + random.max(2))
  }
  if (blow.targetStatus24 && blow.kind === 1) d = f(f(0.5) * d)
  let whole = Math.trunc(d)
  if (blow.damageCap !== 0 && blow.damageCap < whole) whole = blow.damageCap
  return whole
}

/**
 * One of the party's block rate — `func_ov000_02156118`, the character's arm.
 * Nothing unless the shield's place (the tenth of eleven, `+0x2CC` of the
 * equipment at the character's `+0x150`) holds an item. Then `0.0f` plus
 * `func_02084ee8` — every worn piece's ten bits over `10.0f`, summed — plus
 * `func_02085b88`, a whole number from the skill's traits; and doubled when
 * `func_ov000_02156258` finds bit 0 of the status word at `+0x18`.
 */
export function partyBlockRate(
  hasShield: boolean,
  wornTenths: readonly number[],
  skillBonus = 0,
  doubled = false,
): number {
  if (!hasShield) return 0
  let sum = f(0)
  for (const each of wornTenths) sum = f(sum + f(f(each) / f(10)))
  let rate = f(f(skillBonus) + f(f(0) + sum))
  if (doubled) rate = f(f(2) * rate)
  return rate
}

/** A range's record as `GetAttackBaseDamage` reads it: word 0 bits 8–17, word 1's three tens. */
export interface RangeRecord {
  readonly spread: number
  /** Word 1 bits 0–9: a monster's. */
  readonly base: number
  /** Word 1 bits 10–19 and 20–29: one of the party's least and most. */
  readonly min: number
  readonly max: number
}

/**
 * An action's amount — `GetAttackBaseDamage` (overlay 24, `0x021e7bc0`) when it
 * is handed a range, before the `_ffix` every arm returns through.
 *
 * - **a monster** (`0x021e8004`): the base, plus a draw between ∓spread;
 * - **one of the party, the action scaling** (`+0x18` bits 16–17 at 2) **by a
 *   number it names** (`0x021e7d84`): at or under `lo` the least, at or over
 *   `hi` the most, else `(int)((stat − lo) × ((max − min) / (hi − lo))) + min`;
 *   plus the same draw;
 * - **one of the party otherwise** (`0x021e7efc`, `0x021e7f80`): a draw between
 *   the least and the most, *then* the draw between ∓spread. Two.
 */
export function actionAmount(
  random: GameRandom,
  range: RangeRecord,
  user: 'monster' | 'party',
  scales?: { stat: number; lo: number; hi: number },
): number {
  const spread = () => random.floatBetween(f(f(-1) * f(range.spread)), f(range.spread))
  if (user === 'monster') return Math.trunc(f(f(range.base) + spread()))
  if (!scales) {
    const base = random.floatBetween(f(range.min), f(range.max))
    return Math.trunc(f(base + spread()))
  }
  let base: number
  if (scales.stat <= scales.lo) base = range.min
  else if (scales.stat >= scales.hi) base = range.max
  else {
    const ratio = f(f(range.max - range.min) / f(scales.hi - scales.lo))
    base = Math.trunc(f(f(scales.stat - scales.lo) * ratio)) + range.min
  }
  return Math.trunc(f(f(base) + spread()))
}

/**
 * What each one an action reaches costs in draws, in the resolver's order —
 * `func_ov024_021eb5d0`. `'die'` is the hundred thrown at the top of each
 * target's pass and kept at `[battle + 0x8e6e]` (`0x021ebf28`); the critical
 * is there only when it is not the cast's. The amount's own draws follow.
 */
export function drawsPerTarget(action: {
  reach: number
  evadable: boolean
  blockable: boolean
}): readonly string[] {
  const perCast = action.reach === 3 || action.reach === 4
  return [
    'die',
    ...(perCast ? [] : ['critical']),
    ...(action.evadable ? ['evade'] : []),
    ...(action.blockable ? ['block'] : []),
    'accuracy',
  ]
}

/**
 * Whether a change of state lands, for an action whose accuracy scales — the
 * scaling arm of the accuracy roll, `func_ov000_02156648` from `0x02156868`.
 * **This is the whole of whether it lands**: the handlers the resolver then
 * calls by the action's kind (`func_ov024_021db7c0` for defence) are handed the
 * answer and make no draw.
 *
 * `draw` is the hundred already thrown. A monster's accuracy is the record's
 * `+0x14` bits 0–6. One of the party's runs from bits 7–13 to bits 14–20 as
 * their might or mending runs between the record's `lo` and `hi` — or, naming
 * neither, is *drawn* between them and truncated, which is one draw more.
 * A cast gone haywire lands outright on a target whose resistance is above
 * nothing; otherwise the accuracy is times the resistance, plus a half,
 * truncated, and the draw must come in under it.
 */
export function changeLands(
  draw: number,
  accuracy: number,
  resistance: number,
  critical: boolean,
): boolean {
  if (f(resistance) > 0 && critical) return true
  return draw < Math.trunc(f(f(f(accuracy) * f(resistance)) + f(0.5)))
}

/**
 * Whether what rides on a blow lands — the rider handlers' shared shape
 * (`func_ov024_021e303c` poison, `021e33a4`, and their neighbours): nothing,
 * **and no draw**, for a blow that dealt nothing or a target whose byte for it
 * is 0; otherwise a draw below a hundred, as a float, under the action's chance
 * times a hundredth of the target's byte — or under a hundred, for a critical.
 */
export function riderLands(
  random: GameRandom,
  dealt: number,
  chance: number,
  targetByte: number,
  critical: boolean,
): boolean {
  if (dealt <= 0 || targetByte === 0) return false
  const draw = random.max(100)
  const under = critical ? f(100) : f(f(chance) * f(f(targetByte) / f(100)))
  return f(draw) < under
}
