import type { Outfit } from '@minstrel/actor'
import { armsFor, type LevelRow, type LevelTable, levelAt, partName } from '@minstrel/game-formats'

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

/**
 * What the Hero wears: the celestial suit, the celestial stockings and the
 * celestial shoes.
 *
 * **Ours — chosen for the slice on 14 September 2026, not read.** The Hero
 * wakes a Celestrian fallen to earth, and these are the items the game's own
 * words make Celestrian (`itemexpl`): the shoes are "well-suited to
 * apprenticing Celestrians", the stockings "somehow seem angelic". No table,
 * script or save found puts them on the Hero — the three ids are never listed
 * together anywhere on the cartridge. The game's own presets dress a Minstrel
 * otherwise (FORMAT.md, "Character presets"), which would be the reading if
 * the Hero were dressed as their vocation.
 *
 * No headgear: the halo, 12805, is a Celestrian's, and the Hero wakes without
 * their wings; that the halo went with them is ours too.
 */
export const HERO_OUTFIT = { armour: 13007, legwear: 16215, footwear: 17120 } as const

/**
 * The Hero's face, `p_f006` — the face the character presets give the man of
 * every vocation. That a preset's second 90xx value names a face is INFERRED
 * (FORMAT.md, "Character presets"); that the Hero has a man's face is ours:
 * the slice does not say, and the face is the player's to make in a character
 * creation the slice leaves out.
 */
export const HERO_FACE = 'p_f006'

/**
 * The Hero's hair — **ours, a stand-in**: style 00 in its variant `a`, in
 * colour 0. Hair is a style (`p_h<ss>0<v>.nsbmd`, 24 styles in variants `a` to
 * `e`) coloured by a texture file (`p_h<ss><c>a.nsbtx`, up to ten colours to a
 * style); where the game reads the three from is not found. FORMAT.md,
 * "Character parts".
 */
export const HERO_HAIR = { model: 'p_h000a', colour: 'p_h000a' } as const

/** The Hero dressed, part by part — see {@link HERO_OUTFIT}. */
export function heroOutfit(): Outfit {
  const part = (id: number | undefined): string => {
    const name = id === undefined ? undefined : partName(id)
    if (!name) throw new Error(`item ${id} is worn as no part`)
    return name
  }
  return {
    body: part(HERO_OUTFIT.armour),
    legs: part(HERO_OUTFIT.legwear),
    face: HERO_FACE,
    hair: HERO_HAIR.model,
    // No gloves, so the arms are the body's own.
    textures: [part(armsFor(HERO_OUTFIT.armour)), part(HERO_OUTFIT.footwear), HERO_HAIR.colour],
  }
}

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
