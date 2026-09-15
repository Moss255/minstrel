import type { Bag } from './bag.ts'
import { type Equipped, SLOTS, type Slot } from './equipment.ts'
import { GAIN_STATS, type GainStat } from './hero.ts'

/**
 * Saving and loading, in our own format: JSON, in the browser's own storage,
 * under {@link SAVE_KEY}. Nothing of the game's save is read or written —
 * compatibility with it is outside the slice.
 *
 * What is kept: where the Hero stands (a map and a spot in the file's own
 * units), the story stage, the bag, what is worn, which treasure is open, the
 * Hero's experience, their HP and MP, and what seeds have added. Anything a
 * later version adds takes a new {@link SAVE_VERSION}; a version-1 save, from
 * before HP, MP and seeds were kept, reads with the Hero whole and unseeded. A
 * save that does not read is refused whole, and says why.
 */

export const SAVE_KEY = 'minstrel.save'
export const SAVE_VERSION = 2

export interface SaveGame {
  readonly version: typeof SAVE_VERSION
  /** When it was saved, for the start screen: an ISO date. */
  readonly savedAt: string
  readonly map: string
  /** Where the Hero stood, in the map file's own units, and which way they faced. */
  readonly at: {
    readonly x: number
    readonly y: number
    readonly z: number
    readonly facing: number
  }
  readonly stage: { readonly major: number; readonly minor: number } | null
  /**
   * The step within the stage, and the story flags set — see `story.ts` in
   * `@minstrel/game-formats`. Absent from saves made before they were kept,
   * which read with no step and no flags.
   */
  readonly step?: number
  readonly flags?: readonly number[]
  /**
   * Who goes along, by their number in `attnpc` — see `companion.ts`. Absent
   * from saves made before it was kept, which read with the Hero alone.
   */
  readonly party?: readonly number[]
  readonly gold: number
  /** Each item and how many, in the bag's order. */
  readonly items: readonly (readonly [number, number])[]
  readonly equipped: Readonly<Partial<Record<Slot, number>>>
  /** The opened treasure, by `treasureKey`. */
  readonly opened: readonly string[]
  readonly exp: number
  /** The Hero's HP and MP; null when whole. */
  readonly hp: number | null
  readonly mp: number | null
  /** What seeds have added — see `Gains`. */
  readonly gains: Readonly<Partial<Record<GainStat, number>>>
}

export class SaveError extends Error {
  override name = 'SaveError'
}

/** The bag a save holds. */
export function bagOf(save: SaveGame): Bag {
  return { gold: save.gold, items: new Map(save.items.map(([id, count]) => [id, count])) }
}

/** What a save has on. */
export function equippedOf(save: SaveGame): Equipped {
  const worn = new Map<Slot, number>()
  for (const { slot } of SLOTS) {
    const item = save.equipped[slot]
    if (item !== undefined) worn.set(slot, item)
  }
  return worn
}

/** The equipment, as a save keeps it. */
export function equippedRecord(equipped: Equipped): Partial<Record<Slot, number>> {
  return Object.fromEntries(equipped)
}

export function encodeSave(save: SaveGame): string {
  return JSON.stringify(save)
}

const isNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const isCount = (x: unknown): x is number => Number.isInteger(x) && (x as number) >= 0

/** Read a save back, checking every field; throws `SaveError` saying which is wrong. */
export function decodeSave(text: string): SaveGame {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new SaveError('the save is not JSON')
  }
  if (typeof raw !== 'object' || raw === null) throw new SaveError('the save is not an object')
  const s = raw as Record<string, unknown>
  if (s.version !== SAVE_VERSION && s.version !== 1) {
    throw new SaveError(`the save is version ${String(s.version)}, not ${SAVE_VERSION}`)
  }
  // Version 1 kept no HP, MP or seeds: the Hero comes back whole and unseeded.
  const first = s.version === 1
  const hp = first ? null : s.hp
  const mp = first ? null : s.mp
  if (hp !== null && !isCount(hp)) throw new SaveError('the save has HP that do not read')
  if (mp !== null && !isCount(mp)) throw new SaveError('the save has MP that do not read')
  const gains = (first ? {} : s.gains) as Record<string, unknown> | undefined
  const stats = new Set<string>(GAIN_STATS)
  if (
    typeof gains !== 'object' ||
    gains === null ||
    !Object.entries(gains).every(([stat, n]) => stats.has(stat) && isCount(n))
  ) {
    throw new SaveError('the save has seeds’ gains that do not read')
  }
  if (typeof s.savedAt !== 'string') throw new SaveError('the save has no date')
  if (typeof s.map !== 'string' || s.map === '') throw new SaveError('the save names no map')
  const at = s.at as Record<string, unknown> | undefined
  if (!at || !isNumber(at.x) || !isNumber(at.y) || !isNumber(at.z) || !isNumber(at.facing)) {
    throw new SaveError('the save has no spot to stand on')
  }
  const stage = s.stage as Record<string, unknown> | null | undefined
  if (stage !== null && (!stage || !isCount(stage.major) || !isCount(stage.minor))) {
    throw new SaveError('the save has a story stage that does not read')
  }
  if (s.step !== undefined && !isCount(s.step)) {
    throw new SaveError('the save has a story step that does not read')
  }
  if (s.flags !== undefined && (!Array.isArray(s.flags) || !s.flags.every(isCount))) {
    throw new SaveError('the save has story flags that do not read')
  }
  if (!isCount(s.gold)) throw new SaveError('the save has no gold count')
  if (
    !Array.isArray(s.items) ||
    !s.items.every(
      (entry) =>
        Array.isArray(entry) && entry.length === 2 && isCount(entry[0]) && isCount(entry[1]),
    )
  ) {
    throw new SaveError('the save has a bag that does not read')
  }
  const equipped = s.equipped as Record<string, unknown> | undefined
  if (typeof equipped !== 'object' || equipped === null) {
    throw new SaveError('the save has no equipment record')
  }
  const slots = new Set<string>(SLOTS.map((entry) => entry.slot))
  for (const [slot, item] of Object.entries(equipped)) {
    if (!slots.has(slot) || !isCount(item)) throw new SaveError(`the save wears ${slot} wrongly`)
  }
  if (!Array.isArray(s.opened) || !s.opened.every((key) => typeof key === 'string')) {
    throw new SaveError('the save has an opened-treasure list that does not read')
  }
  if (!isCount(s.exp)) throw new SaveError('the save has no experience count')
  return { ...(s as unknown as SaveGame), version: SAVE_VERSION, hp, mp, gains } as SaveGame
}

/** The storage a save lives in, where the browser allows one. */
export type SaveStore = Pick<Storage, 'getItem' | 'setItem'>

/** Write a save; false when the storage refuses it. */
export function writeSave(store: SaveStore | undefined, save: SaveGame): boolean {
  if (!store) return false
  try {
    store.setItem(SAVE_KEY, encodeSave(save))
    return true
  } catch {
    return false
  }
}

/** The save in storage: the game, nothing, or why it will not read. */
export function readSave(
  store: SaveStore | undefined,
): { game: SaveGame } | { error: string } | undefined {
  let text: string | null
  try {
    text = store?.getItem(SAVE_KEY) ?? null
  } catch {
    return undefined
  }
  if (text === null) return undefined
  try {
    return { game: decodeSave(text) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}
