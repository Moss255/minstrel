/**
 * **Heal All** — the Misc. menu's own healer, `str_tm` 4001: "Uses party
 * members' magic to fully restore the party's HP as efficiently as possible."
 * Read 4 October 2026 from overlay 2, the field menu's state 23
 * (`func_ov002_021665b0`), one cast at a time through `func_ov002_021594e8`
 * and the heal handler `func_ov002_02153ccc`. US code; the text and tables
 * European, matching it one for one.
 *
 * - **Who casts**: the healer vocations, by a score (`0x02166a80`) — a
 *   Priest 10, a Sage 8, a Minstrel, Paladin or Luminary 5, a Thief or Ranger
 *   3, every other vocation never — then 4 a heal known, and 200 for Omniheal
 *   or else 100 for Multiheal; the best first, ties in party order.
 * - **On whom**: each member in party order, until full.
 * - **What**: Squelch first if poisoned; Multiheal when all four are hurt
 *   enough; otherwise the smallest heal the caster's own rolls say will do
 *   (`0x021674ac`), stepping down a spell at a time when MP is short.
 * - **When it stops**: everyone full or fallen, or every ranked caster out.
 * - It reads **no items, no tactics and no MP reserve**.
 *
 * Every amount is a real roll (`fieldAmount` in the sim), the caster's five
 * candidates rolled once when they begin and kept while they cast, and each
 * heal rolled again as it lands; Fullheal's is 999.
 *
 * **Read, and not witnessed** — kept as the code has them: a run whose only
 * cast is a Multiheal ends on "But nothing happens."; and Multiheal never
 * fires in a party under four. **Ours**: nobody is poisoned or cursed outside
 * a battle here, so Squelch never comes up; the ranking's unknown +5
 * (`ch+0x78` bit 30) and the ability that takes a quarter off the MP (bit
 * `0x106`) are left out.
 */

/** The heals, by action number — the spell list's places 26 to 32. */
export const HEALS = {
  heal: 30,
  midheal: 31,
  moreheal: 32,
  fullheal: 33,
  multiheal: 34,
  squelch: 35,
  omniheal: 784,
} as const

/** Each vocation's place in the ranking (`0x02166a80`); one not here never casts. */
export const HEALER_SCORE: ReadonlyMap<number, number> = new Map([
  [2, 10], // Priest
  [10, 8], // Sage
  [6, 5], // Minstrel
  [9, 5], // Paladin
  [11, 5], // Luminary
  [5, 3], // Thief
  [12, 3], // Ranger
])

/** The least MP a member must have to count as a caster at all (`0x021667ac`). */
export const CASTER_MP = 2
/** **Ours**: the most casts one run makes, a guard the game has no need of. */
const MOST_CASTS = 200
/** What Fullheal restores, whatever the roll (`0x02153dc0`). */
export const FULLHEAL_AMOUNT = 999

/** One of the party, as Heal All sees them. */
export interface Healer {
  readonly hp: number
  readonly maxHp: number
  readonly mp: number
  readonly vocation: number
  readonly poisoned?: boolean
  /** Whether they can cast this spell now — known, and taught by their vocation at their level. */
  readonly knows: (action: number) => boolean
}

/** One cast, as it went: who, which spell, on whom, and whether it took. */
export interface HealCast {
  readonly action: number
  readonly caster: number
  readonly targets: readonly number[]
  /** HP each target gained. */
  readonly gained: readonly number[]
  readonly took: boolean
}

export interface HealAllRun {
  readonly casts: readonly HealCast[]
  /** "But nothing happens." to close — nothing cast at all. */
  readonly nothing: boolean
  /** Everyone's HP and MP after. */
  readonly hp: readonly number[]
  readonly mp: readonly number[]
}

/**
 * Run Heal All over `party` to its end. `roll(action, caster)` is one heal's
 * rolled amount (0 for a spell with no range, with no draw); `cost(action)`
 * its MP.
 */
export function healAll(
  party: readonly Healer[],
  roll: (action: number, caster: number) => number,
  cost: (action: number) => number,
): HealAllRun {
  const n = party.length
  const hp = party.map((m) => m.hp)
  const mp = party.map((m) => m.mp)
  const max = party.map((m) => m.maxHp)
  const poisoned = party.map((m) => m.poisoned ?? false)
  const fallen = (i: number) => hp[i] === 0
  const knows = (i: number, action: number) => party[i]?.knows(action) ?? false
  const casts: HealCast[] = []

  // S = 0: how many heals each can cast, counted only with MP of 2 or more.
  const healCount = party.map((_, i) =>
    fallen(i) || (mp[i] ?? 0) < CASTER_MP
      ? 0
      : [30, 31, 32, 33, 34].filter((action) => knows(i, action)).length,
  )
  const anything = party.some((_, j) => {
    if (fallen(j)) return false
    const hurt = (max[j] ?? 0) - (hp[j] ?? 0) > 0
    if (hurt && party.some((_, k) => (hp[k] ?? 0) > 0 && (healCount[k] ?? 0) > 0)) return true
    return (
      poisoned[j] === true &&
      party.some(
        (_, k) =>
          (hp[k] ?? 0) > 0 && knows(k, HEALS.squelch) && (mp[k] ?? 0) >= cost(HEALS.squelch),
      )
    )
  })
  if (!anything) return { casts, nothing: true, hp, mp }

  // S = 1: the casters, best first; ties keep party order.
  const score = (i: number): number => {
    const own = HEALER_SCORE.get(party[i]?.vocation ?? -1)
    if (fallen(i) || own === undefined) return 0
    const all = knows(i, HEALS.omniheal) ? 200 : knows(i, HEALS.multiheal) ? 100 : 0
    return own + 4 * (healCount[i] ?? 0) + all
  }
  const order = party
    .map((_, i) => ({ i, score: score(i) }))
    .sort((a, b) => b.score - a.score)
    .filter((c) => c.score > 0)
    .map((c) => c.i)

  const cast = (action: number, caster: number, targets: readonly number[]): boolean => {
    const gained = targets.map((t) => {
      if (fallen(t)) return 0
      if (action === HEALS.squelch) {
        const was = poisoned[t]
        poisoned[t] = false
        return was ? 0 : -1
      }
      const amount = action === HEALS.fullheal ? FULLHEAL_AMOUNT : roll(action, caster)
      const before = hp[t] ?? 0
      hp[t] = Math.min(before + amount, max[t] ?? 0)
      return (hp[t] ?? 0) - before
    })
    const took = action === HEALS.squelch ? gained.some((g) => g === 0) : gained.some((g) => g > 0)
    if (took) mp[caster] = Math.max(0, (mp[caster] ?? 0) - cost(action))
    casts.push({ action, caster, targets, gained: gained.map((g) => Math.max(0, g)), took })
    return took
  }

  let k = 0
  let slot = 0
  let castAny = false
  let outcome = 0
  // S = 2 to 6, as one loop: a caster's candidates, then their casts.
  // **Ours**: a cap on the casts, so a cast that takes nothing cannot loop.
  outer: while (casts.length < MOST_CASTS) {
    const c = order[k]
    if (c === undefined) {
      k++
      if (k >= n) {
        outcome = 1
        break
      }
      continue
    }
    if (fallen(c)) {
      k++
      if (k >= n) {
        outcome = 2
        break
      }
      continue
    }
    // S = 2: this caster's five candidates, rolled once.
    const cand = [30, 31, 32, 33, 34].map((action) =>
      knows(c, action) && (mp[c] ?? 0) >= CASTER_MP
        ? { action, amount: roll(action, c) }
        : { action: 0, amount: 0 },
    )
    while (true) {
      // S = 3: choose.
      if (casts.length >= MOST_CASTS) break outer
      const t = slot
      const d = (max[t] ?? 0) - (hp[t] ?? 0)
      if (poisoned[t]) {
        const s = order.find(
          (m) => !fallen(m) && knows(m, HEALS.squelch) && (mp[m] ?? 0) >= cost(HEALS.squelch),
        )
        if (s !== undefined) {
          cast(HEALS.squelch, s, [t])
          castAny = true
          if (afterCast(t)) continue outer
          continue
        }
      }
      if ((healCount[c] ?? 0) === 0) {
        k++
        if (k >= n) break outer
        continue outer
      }
      if (fallen(t) || d === 0) {
        slot++
        if (slot >= n) break outer
        continue outer
      }
      // Multiheal, when all four are hurt enough.
      const [heal, mid, more, full, multi] = cand as [
        (typeof cand)[0],
        (typeof cand)[0],
        (typeof cand)[0],
        (typeof cand)[0],
        (typeof cand)[0],
      ]
      if (knows(c, HEALS.multiheal) && multi.action > 0 && (mp[c] ?? 0) >= cost(HEALS.multiheal)) {
        const H = heal.amount
        const M = mid.amount
        const R = more.amount
        const X = multi.amount
        let a = 0
        let b = 0
        let c3 = 0
        for (let i = 0; i < n; i++) {
          const di = (max[i] ?? 0) - (hp[i] ?? 0)
          if (fallen(i) || di <= 0) continue
          if (!(di >= M && M < X)) continue
          if (H < di) a++
          if (M < di) b++
          if (R > 0 && di < 2 * X) c3++
        }
        if (full.action !== 0) {
          for (let i = 0; i < n; i++) {
            const di = (max[i] ?? 0) - (hp[i] ?? 0)
            if (!fallen(i) && di > 6 * X) {
              a--
              b--
              c3--
            }
          }
        }
        if (a === 4 || b >= 4 || c3 >= 4) {
          // `castAny` is not set on this path (`0x02167454`) — kept as read.
          cast(
            HEALS.multiheal,
            c,
            party.map((_, i) => i),
          )
          if (afterCast(t)) continue outer
          continue
        }
      }
      // One target: the smallest that will do.
      let chosen: number = HEALS.heal
      if (d <= heal.amount) chosen = heal.action || HEALS.heal
      else if (d < mid.amount || d < 2 * mid.amount) chosen = HEALS.midheal
      else if (d < more.amount || d < 3 * more.amount) chosen = HEALS.moreheal
      else if (full.action !== 0) chosen = HEALS.fullheal
      else if (heal.action !== 0) {
        const best = [full, more, mid, heal].find((x) => x.amount !== 0)
        if (best) chosen = best.action
      }
      // Afford it, a spell down at a time.
      while ((mp[c] ?? 0) < cost(chosen)) {
        chosen--
        if (chosen < HEALS.heal) break
      }
      if (chosen < HEALS.heal) {
        k++
        if (k >= n) {
          outcome = 1
          break outer
        }
        continue outer
      }
      // S = 4: cast.
      cast(chosen, c, [t])
      castAny = true
      if (afterCast(t)) continue outer
    }
  }
  // S = 5.
  if (!castAny && outcome === 1) outcome = 2
  return { casts, nothing: outcome === 2 || !castAny, hp, mp }

  /** S = 6: the target full and well — on to the next, from the best caster again. */
  function afterCast(t: number): boolean {
    if ((hp[t] ?? 0) === (max[t] ?? 0) && !poisoned[t]) {
      slot++
      k = 0
      return true
    }
    return false
  }
}
