import { type LevelRow, type LevelTable, levelAt } from '@minstrel/game-formats'

/**
 * The Hero's numbers: their vocation's level table, where their experience
 * puts them in it, and what seeds have added.
 *
 * **The vocation is a choice.** The cartridge has thirteen level tables,
 * `level0` to `level12`, one to a vocation in the order the status screen names
 * them — Guardian first, Minstrel seventh (FORMAT.md, "Level tables"). Which
 * one the Hero has in the slice is not read; the Hero is taken to be a
 * Minstrel. `level0`, the Guardian's, is the other candidate, and would be
 * worth checking against a status screen in the emulator. The Minstrel is 6
 * in all three places that number vocations: the level tables, the field
 * menu's names (`str_tm` 2100 on) and the spell table.
 */
export const HERO_VOCATION = 'Minstrel'
/** The Minstrel's number — see above. INFERRED. */
export const HERO_VOCATION_NUMBER = 6
/** The Minstrel's level table — the seventh vocation the status screen names, INFERRED. */
export const HERO_LEVELS = `/data/prm/level${HERO_VOCATION_NUMBER}.bin`
/** Where the field menu's names for the vocations begin in `str_tm`: 2100 the Guardian. */
export const VOCATION_WORDS = 2100

/**
 * A stand-in for the gold the Hero starts with. The game's own starting purse
 * is not read, and the village's treasure comes to two coins, less than the
 * cheapest thing its shop sells — so without this the shop could not be tried.
 */
export const STARTING_GOLD = 100

/** What a seed can raise — see `SEED_GAINS` in `use.ts`. */
export type GainStat =
  | 'maxHp'
  | 'maxMp'
  | 'strength'
  | 'deftness'
  | 'agility'
  | 'resilience'
  | 'magicalMight'
  | 'magicalMending'
  | 'charm'
  | 'skillPoints'

export const GAIN_STATS: readonly GainStat[] = [
  'maxHp',
  'maxMp',
  'strength',
  'deftness',
  'agility',
  'resilience',
  'magicalMight',
  'magicalMending',
  'charm',
  'skillPoints',
]

/** What seeds have added, for good, to the level table's numbers. */
export type Gains = Readonly<Partial<Record<GainStat, number>>>

/** Gains with one more. */
export function gain(gains: Gains, stat: GainStat, amount: number): Gains {
  return { ...gains, [stat]: (gains[stat] ?? 0) + amount }
}

/** A level's numbers with what seeds have added. Skill points are not a level's. */
export function withGains(row: LevelRow, gains: Gains): LevelRow {
  const plus = (stat: GainStat, value: number) => value + (gains[stat] ?? 0)
  return {
    ...row,
    maxHp: plus('maxHp', row.maxHp),
    maxMp: plus('maxMp', row.maxMp),
    strength: plus('strength', row.strength),
    deftness: plus('deftness', row.deftness),
    agility: plus('agility', row.agility),
    resilience: plus('resilience', row.resilience),
    magicalMight: plus('magicalMight', row.magicalMight),
    magicalMending: plus('magicalMending', row.magicalMending),
    charm: plus('charm', row.charm),
  }
}

/** Where the Hero stands: their vocation, their level, and the next one. */
export interface Standing {
  readonly vocation: string
  readonly exp: number
  /** This level's numbers, with the seeds' gains. */
  readonly level: LevelRow
  /** The next level, or undefined at the last. */
  readonly next: LevelRow | undefined
}

export function standing(table: LevelTable, exp: number, gains: Gains = {}): Standing {
  const level = levelAt(table, exp)
  // Levels count from 1, so the row after level n is at index n.
  return {
    vocation: HERO_VOCATION,
    exp,
    level: withGains(level, gains),
    next: table.levels[level.level],
  }
}
