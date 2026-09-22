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
}

/** Whether a drop lands: `func_02032370(one in so many) == 0`, and nothing at all where the step never drops. */
function landed(rng: DropRng, drop: Drop): boolean {
  const chance = DROP_CHANCES[drop.step] ?? 0
  if (chance <= 0 || drop.item === 0) return false
  return rng.below(chance) === 0
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
 * **Read and not modelled**: the game rolls four more passes, one for each
 * party member that stands and is above half its HP, at a chance scaled by
 * something of theirs — the series' item-finding abilities, which the slice
 * has not, and which our party of one or two has no way to carry. A step-0
 * drop is not repeated by those passes.
 *
 * **Ours**: the order the kinds are rolled in is the order they stand in the
 * battle, where the game's is the order they left the field.
 */
export function dropsWon(state: BattleState, rng: DropRng): DropWon[] {
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
  for (const { name, kind, drops, beaten } of kinds.values()) {
    if (won.length >= 8) break
    if (!beaten) continue
    const from = { from: name, ...(kind === undefined ? {} : { kind }) }
    const [ordinary, rare] = drops
    if (landed(rng, rare)) won.push({ item: rare.item, rare: true, ...from })
    else if (landed(rng, ordinary)) won.push({ item: ordinary.item, rare: false, ...from })
  }
  return won
}
