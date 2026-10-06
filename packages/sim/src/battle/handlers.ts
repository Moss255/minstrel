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
