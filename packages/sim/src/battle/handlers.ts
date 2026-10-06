/**
 * **The kinds' handlers' own arithmetic** — task 18, read 6 October 2026 from
 * the USA build's overlays 0 and 24 (`docs/readings/T18-handlers.md`). Each in
 * the game's single-precision floats, one operation at a time, and held to
 * `test/game-oracle.ts`.
 */

const f = Math.fround

/**
 * **One of the party's accuracy with an action that scales by a number of
 * theirs** — the accuracy roll's scaled arm (`func_ov000_02156648`,
 * `0x0215690c`–`0x021569b4`): the least at or under the record's `lo`, the
 * most at or over its `hi`, and between, the amount's arithmetic.
 */
export function scaledAccuracy(
  stat: number,
  min: number,
  max: number,
  lo: number,
  hi: number,
): number {
  if (stat <= lo) return min
  if (stat >= hi) return max
  return Math.trunc(f(f(stat - lo) * f(f(max - min) / f(hi - lo)))) + min
}

/**
 * **The HP one raised comes back with** — kind 18's handler
 * (`func_ov024_021dd278`, `0x021dd2fc`–`0x021dd3ec`): the share times their
 * most HP, truncated. The share is a number given, or — Zing's and the Zing
 * stick's — by the caster's magical mending: a quarter at or under `lo`, a
 * half at or over `hi`, between `((int)((25 / (hi − lo)) × (mending − lo)) +
 * 25) / 100`; a half when a monster casts it.
 */
export function revivedHp(
  share: number | { readonly lo: number; readonly hi: number },
  casterIsParty: boolean,
  mending: number,
  maxHp: number,
): number {
  let s: number
  if (typeof share === 'number') s = f(share)
  else if (!casterIsParty) s = f(0.5)
  else if (mending <= share.lo) s = f(0.25)
  else if (mending >= share.hi) s = f(0.5)
  else {
    const whole = Math.trunc(f(f(f(25) / f(share.hi - share.lo)) * f(mending - share.lo)))
    s = f(f(f(whole) + f(25)) / f(100))
  }
  return Math.trunc(f(s * f(maxHp)))
}

/**
 * **Voice of Experience's multiplier** — drawn in the resolver before its
 * handler runs (`func_ov024_021eb5d0`, `0x021eba20`–`0x021eba9c`), for one of
 * the party: the most is `1 + (level + 11) × 0.01`, held to 2.0, their level
 * in their vocation (`func_0202053c`); the draw `NextRandomFloatScaled(1.1,
 * most, 1)` — a whole number of tenths between the two, by
 * `NextRandomBetween` (`0x020743d4`, `0x02074478`), over ten. It is kept at
 * `battle + 0x8e3c` and shown to a tenth.
 */
export function experienceMultiplier(level: number, rng: { below(max: number): number }): number {
  let most = f(f(f(f(level) + f(11)) * f(0.01)) + f(1))
  if (most > 2) most = f(2)
  const lo = Math.trunc(f(f(1.1) * f(10)))
  const hi = Math.trunc(f(most * f(10)))
  return f(f(lo + rng.below(hi - lo + 1)) / f(10))
}

/**
 * **Spelly Breath's amount** — damage handler 48 (`func_ov024_021d974c`):
 * the target's most MP (`status + 6`) times a draw between 0.2 and 0.5
 * (`NextRandomFloatBetween`), truncated.
 */
export function replenishedMp(maxMp: number, share: number): number {
  return Math.trunc(f(f(maxMp) * f(share)))
}
