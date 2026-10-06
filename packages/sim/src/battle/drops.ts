import type { BattleState, Drop } from './battle.ts'

/**
 * What a won battle drops — the game's own, read from overlay 23 of the USA
 * build (`func_ov023_021f454c`, called from the victory routine
 * `func_ov023_021edf54` at `0x021ee2ec`, just after the experience and the
 * gold are settled).
 *
 * **Not the battle's generator, and not the world's.** The game rolls a drop
 * through `func_02032370`, which draws on the C library's `rand`
 * (`0x02003d14`) — a generator of its own, `seed × 0x41C64E6D + 0x3039`, the
 * draw its bits 16 to 30. `GetBTRandom()` is called in the same function, but
 * only for a grotto's or a legacy boss's drop, which the slice has not. So a
 * drop **spends no draw of the battle's**, and a battle replays from its seed
 * whether it drops anything or not. See {@link DropRng}.
 */

/**
 * The game's C library generator, as the drop roll draws on it: an LCG whose
 * draw is bits 16 to 30 of the state, and a number below a maximum made from
 * it in `double`.
 *
 * **Ours: where the seed comes from.** The game's is a global the game seeds
 * once; nothing found says with what, so the engine keeps one of these for
 * the session, as it does the field's.
 */
export class DropRng {
  /** The generator's state, 32 bits. */
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  /** How many draws have been made — for the tests. */
  drawn = 0

  /** `rand()`: the state steps, and the draw is its bits 16 to 30. */
  next(): number {
    this.state = (Math.imul(this.state, 0x41c64e6d) + 0x3039) >>> 0
    this.drawn++
    return (this.state >>> 16) & 0x7fff
  }

  /**
   * `func_02032370`: `(int)(max × (rand() − 1) ÷ 32767)`, the division a
   * `double`'s. A drop lands when this is 0.
   */
  below(max: number): number {
    return Math.trunc((max * (this.next() - 1)) / 32767)
  }
}

/**
 * How often each chance step drops, as "one in so many": the table at
 * `0x021fd888` in overlay 23, which the roll indexes by the step byte —
 * `+0x03` for the rare drop, `+0x02` for the ordinary. 0 never drops.
 *
 * It is the game's own, and it bears out what the guide's bestiary prints:
 * step 0 always, 1 to 6 one in 8 up to one in 256.
 */
export const DROP_CHANCES = [1, 8, 16, 32, 64, 128, 256, 0] as const

/**
 * An item the party takes from a battle, as the game's own list holds it: what
 * it is, which monster dropped it, and whether it was the rare drop — the
 * record at `scene+0x58d0` keeps the item, the monster's number and a byte of
 * 1 for the ordinary drop and 2 for the rare.
 */
export interface DropWon {
  readonly item: number
  /** The monster it came from, by name, as the words that tell of it need. */
  readonly from: string
  /** Its record's number, where the fighter carried one. */
  readonly kind?: number
  readonly rare: boolean
  /**
   * The fighter whose Autofilch took it, for a drop of the further passes —
   * the record's `+5` byte, which the results say with `str_bres` 37.
   */
  readonly by?: number
}

/**
 * One of the party as the further passes see them, in the party's order: the
 * fighter they are, their level in the vocation they are now (`func_0202053c`,
 * `rec + 0x16c + 2 × rec[0x950]`), and whether they hold **skill panel 164,
 * Autofilch** — trait `0xa4`, bit 164 of the panels held at record `+0x8ec`
 * (`func_02083b00`), tree 19's eleventh panel, which its book grants.
 */
export interface Filcher {
  readonly fighter: number
  readonly level: number
  readonly autofilch: boolean
}

/**
 * Whether a drop lands: `func_02032370(one in so many) == 0`, and nothing at
 * all where the step never drops. In a further pass, `level` scales it — one
 * in `chance × 100 ÷ level` — and step 0 never lands (`0x021f49d0`–`0x021f49e0`).
 */
function landed(rng: DropRng, drop: Drop, level?: number, sure = false): boolean {
  const chance = DROP_CHANCES[drop.step] ?? 0
  if (chance <= 0 || drop.item === 0) return false
  const n =
    level === undefined
      ? sure
        ? 1
        : chance
      : drop.step === 0
        ? 0
        : Math.trunc((chance * 100) / Math.max(1, level))
  if (n <= 0) return false
  return rng.below(n) === 0
}

/**
 * What the party takes from a won battle: an item id for each drop that
 * landed, in the order the game rolls them.
 *
 * The game's, step for step:
 *
 * - it goes by **the kinds of monster beaten**, not by each monster — three
 *   slimes are one entry and get one roll, kept in a list of up to 12 at
 *   `battleWork+0x8d66` and built by `func_ov000_02155184` as each monster
 *   leaves the field;
 * - an entry **all of whose monsters fled** drops nothing: the roll skips an
 *   entry whose count equals the number that got away;
 * - **the rare drop is rolled first**, and the ordinary only where the rare
 *   did not land or never drops — so at most one item a kind;
 * - the list of what was won is capped at 8.
 *
 * **And four passes more** (`0x021f4628`–`0x021f46b8`, read 4 October 2026):
 * pass *k* is the party's member *k − 1* (the lineup, `func_02011518`), and
 * is skipped unless they are in the battle, standing (`func_02010088`), were
 * standing for **at least half the battle's rounds** — their counter over the
 * battle's, in `float`, not below 0.5 (`0x021f4678`–`0x021f468c`) — and hold
 * **Autofilch** (see {@link Filcher}). Then every kind is rolled again, rare
 * first, at one in `N × 100 ÷ L` (`_s32_div_f`), `N` the step's chance and `L`
 * their level; a step 0 never lands in these passes (`0x021f49e0`). A kind
 * that already dropped can drop again. Each such drop carries its member.
 *
 * **Itemised Kill's mark** ({@link BattleState.sureLoot}) makes a kind's
 * ordinary drop one in 1 in the first pass — the entry's bit 15
 * (`0x021f4ab0`–`0x021f4abc`) — a draw still spent; its rare is rolled as
 * ever, first. Bit 14 does the same for the rare (`0x021f49e8`); what sets
 * it is not read, and nothing here does.
 *
 * **Ours**: the order the kinds are rolled in is the order they stand in the
 * battle, where the game's is the order they left the field.
 */
export function dropsWon(
  state: BattleState,
  rng: DropRng,
  lineup: readonly (Filcher | undefined)[] = [],
): DropWon[] {
  const kinds = new Map<
    number | string,
    { name: string; kind?: number; drops: readonly [Drop, Drop]; beaten: boolean }
  >()
  for (const [index, fighter] of state.fighters.entries()) {
    if (fighter.side !== 'foes' || !fighter.drops) continue
    const key = fighter.kind ?? `place ${index}`
    const already = kinds.get(key)
    // Beaten, where any one of the kind did not flee — the game counts those that got away.
    const beaten = already?.beaten === true || !fighter.fled
    kinds.set(key, {
      name: fighter.name,
      ...(fighter.kind === undefined ? {} : { kind: fighter.kind }),
      drops: fighter.drops,
      beaten,
    })
  }
  const won: DropWon[] = []
  for (let pass = 0; pass < 5; pass++) {
    // The level that scales the chance, and who it is, from pass 1 on.
    let by: Filcher | undefined
    if (pass > 0) {
      by = lineup[pass - 1]
      const fighter = by ? state.fighters[by.fighter] : undefined
      if (!by || !fighter || fighter.side !== 'party' || fighter.hp <= 0) continue
      const f = Math.fround
      if (f(f(fighter.rounds ?? 0) / f(state.round)) < 0.5) continue
      if (!by.autofilch) continue
    }
    for (const { name, kind, drops, beaten } of kinds.values()) {
      if (won.length >= 8) return won
      if (!beaten) continue
      const from = {
        from: name,
        ...(kind === undefined ? {} : { kind }),
        ...(by ? { by: by.fighter } : {}),
      }
      const [ordinary, rare] = drops
      const sure = kind !== undefined && (state.sureLoot ?? []).includes(kind)
      if (landed(rng, rare, by?.level)) won.push({ item: rare.item, rare: true, ...from })
      else if (landed(rng, ordinary, by?.level, sure))
        won.push({ item: ordinary.item, rare: false, ...from })
    }
  }
  return won
}
