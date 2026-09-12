import { type LevelRow, type LevelTable, levelAt } from '@minstrel/game-formats'

/**
 * The Hero's numbers: their vocation's level table, and where their
 * experience puts them in it.
 *
 * **The vocation is a choice.** The cartridge has thirteen level tables,
 * `level0` to `level12`, one to a vocation in the order the status screen names
 * them — Guardian first, Minstrel seventh (FORMAT.md, "Level tables"). Which
 * one the Hero has in the slice is not read; the Hero is taken to be a
 * Minstrel. `level0`, the Guardian's, is the other candidate, and would be
 * worth checking against a status screen in the emulator.
 */
export const HERO_VOCATION = 'Minstrel'
/** The Minstrel's level table — the seventh vocation the status screen names, INFERRED. */
export const HERO_LEVELS = '/data/prm/level6.bin'

/**
 * A stand-in for the gold the Hero starts with. The game's own starting purse
 * is not read, and the village's treasure comes to two coins, less than the
 * cheapest thing its shop sells — so without this the shop could not be tried.
 */
export const STARTING_GOLD = 100

/** Where the Hero stands: their vocation, their level, and the next one. */
export interface Standing {
  readonly vocation: string
  readonly exp: number
  readonly level: LevelRow
  /** The next level, or undefined at the last. */
  readonly next: LevelRow | undefined
}

export function standing(table: LevelTable, exp: number): Standing {
  const level = levelAt(table, exp)
  // Levels count from 1, so the row after level n is at index n.
  return { vocation: HERO_VOCATION, exp, level, next: table.levels[level.level] }
}
