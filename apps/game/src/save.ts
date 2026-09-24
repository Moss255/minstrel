import type { Bag } from './bag.ts'
import { type Equipped, SLOTS, type Slot } from './equipment.ts'
import { GAIN_STATS, type GainStat } from './hero.ts'

/**
 * Saving and loading, in our own format: JSON, in the browser's own storage,
 * under {@link SAVE_KEY}. Nothing of the game's save is read or written —
 * compatibility with it is outside the slice.
 *
 * What is kept: where the Hero stands (a map and a spot in the file's own
 * units), the story stage, the bag, which treasure is open, and **the party** —
 * each place with its own experience, hit points, magic, seeds and equipment.
 * A save that does not read is refused whole, and says why.
 *
 * **Adding a field takes no new version**; leaving one out does. `step`,
 * `flags` and `party` were all added as optional fields that older saves
 * simply lack, and that is the pattern to follow. Version 3 is a real bump
 * because the Hero's five loose fields *moved* into the party, so a version-2
 * save no longer has them where they were — see {@link membersOf}.
 */

export const SAVE_KEY = 'minstrel.save'
export const SAVE_VERSION = 3

/**
 * One place in the party, as a save keeps it — see `Member` in `companion.ts`,
 * and `docs/party-and-vocations.md` for the game's own ordered slots that this
 * is the shape of. **The Hero is first.**
 */
export interface SaveMember {
  /** Their number in `attnpc`; **null for the Hero**, who is in no such table. */
  readonly attnpc: number | null
  readonly exp: number
  /** HP and MP; null when whole. */
  readonly hp: number | null
  readonly mp: number | null
  /**
   * Which vocation's numbers theirs are, by number. **Absent from saves made
   * before a party could hold more than one**, which read as the Minstrel the
   * Hero is — adding a field takes no new version.
   */
  readonly vocation?: number
  /**
   * Which ready-made character they were made from — see `Member.appearance`.
   * Absent where there is none, which is the Hero's own look.
   */
  readonly appearance?: number
  /** What they are called, where somebody chose — see `Member.name`. */
  readonly name?: string
  /** What seeds have added — see `Gains`. */
  readonly gains: Readonly<Partial<Record<GainStat, number>>>
  readonly equipped: Readonly<Partial<Record<Slot, number>>>
}

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
   * The party, the Hero first — see {@link SaveMember}. Never empty: a save
   * with no Hero is a save of nobody, and `decodeSave` refuses it.
   */
  readonly members: readonly SaveMember[]
  /** The bag is the party's, not a member's. */
  readonly gold: number
  /** Each item and how many, in the bag's order. */
  readonly items: readonly (readonly [number, number])[]
  /** The opened treasure, by `treasureKey`. */
  readonly opened: readonly string[]
}

export class SaveError extends Error {
  override name = 'SaveError'
}

/** The bag a save holds. */
export function bagOf(save: SaveGame): Bag {
  return { gold: save.gold, items: new Map(save.items.map(([id, count]) => [id, count])) }
}

/** What one of a save's places has on. */
export function equippedOf(member: SaveMember): Equipped {
  const worn = new Map<Slot, number>()
  for (const { slot } of SLOTS) {
    const item = member.equipped[slot]
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
  if (!isCount(s.version) || s.version < 1 || s.version > SAVE_VERSION) {
    throw new SaveError(`the save is version ${String(s.version)}, not ${SAVE_VERSION}`)
  }
  const members = membersOf(s)
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
  if (!Array.isArray(s.opened) || !s.opened.every((key) => typeof key === 'string')) {
    throw new SaveError('the save has an opened-treasure list that does not read')
  }
  return { ...(s as unknown as SaveGame), version: SAVE_VERSION, members } as SaveGame
}

/**
 * The party a save holds, whatever version wrote it.
 *
 * **Version 1** kept no HP, MP or seeds; its Hero comes back whole and
 * unseeded. **Version 2** kept the Hero's experience, HP, MP, seeds and
 * equipment as five fields of its own, and everyone else as a bare list of
 * `attnpc` numbers under `party` — so a companion came back with nothing,
 * which is exactly what the running game did with them too. **Version 3** puts
 * every place in one list.
 *
 * Reading the older two is not charity: the save is one slot in a browser's
 * own storage, and a person part-way through the slice has no other copy.
 */
function membersOf(s: Record<string, unknown>): SaveMember[] {
  if (isCount(s.version) && s.version >= 3) {
    if (!Array.isArray(s.members) || s.members.length === 0) {
      throw new SaveError('the save holds no party')
    }
    const read = s.members.map((raw, place) => member(raw, place))
    if (read[0]?.attnpc !== null)
      throw new SaveError('the save’s party does not begin with the Hero')
    return read
  }
  // Versions 1 and 2: the Hero's five loose fields, then the bare numbers.
  const first = s.version === 1
  const party = s.party === undefined ? [] : s.party
  if (!Array.isArray(party) || !party.every(isCount)) {
    throw new SaveError('the save has a party that does not read')
  }
  return [
    member(
      {
        attnpc: null,
        exp: s.exp,
        hp: first ? null : s.hp,
        mp: first ? null : s.mp,
        gains: first ? {} : s.gains,
        equipped: s.equipped,
      },
      0,
    ),
    ...party.map((attnpc: number) =>
      member({ attnpc, exp: 0, hp: null, mp: null, gains: {}, equipped: {} }, 1),
    ),
  ]
}

/** One place, checked field by field; `place` is only for saying which is wrong. */
function member(raw: unknown, place: number): SaveMember {
  const where = place === 0 ? 'the Hero' : `party place ${place}`
  if (typeof raw !== 'object' || raw === null) throw new SaveError(`${where} does not read`)
  const m = raw as Record<string, unknown>
  if (m.attnpc !== null && !isCount(m.attnpc)) {
    throw new SaveError(`${where} has a number that does not read`)
  }
  if (m.hp !== null && !isCount(m.hp)) throw new SaveError(`${where} has HP that do not read`)
  if (m.mp !== null && !isCount(m.mp)) throw new SaveError(`${where} has MP that do not read`)
  if (!isCount(m.exp)) throw new SaveError(`${where} has no experience count`)
  if (m.vocation !== undefined && !isCount(m.vocation)) {
    throw new SaveError(`${where} has a vocation that does not read`)
  }
  if (m.appearance !== undefined && !isCount(m.appearance)) {
    throw new SaveError(`${where} has an appearance that does not read`)
  }
  if (m.name !== undefined && typeof m.name !== 'string') {
    throw new SaveError(`${where} has a name that does not read`)
  }
  const stats = new Set<string>(GAIN_STATS)
  const gains = m.gains as Record<string, unknown> | undefined
  if (
    typeof gains !== 'object' ||
    gains === null ||
    !Object.entries(gains).every(([stat, n]) => stats.has(stat) && isCount(n))
  ) {
    throw new SaveError(`${where} has seeds’ gains that do not read`)
  }
  const equipped = m.equipped as Record<string, unknown> | undefined
  if (typeof equipped !== 'object' || equipped === null) {
    throw new SaveError(`${where} has no equipment record`)
  }
  const slots = new Set<string>(SLOTS.map((entry) => entry.slot))
  for (const [slot, item] of Object.entries(equipped)) {
    if (!slots.has(slot) || !isCount(item)) throw new SaveError(`${where} wears ${slot} wrongly`)
  }
  return {
    attnpc: m.attnpc as number | null,
    exp: m.exp,
    hp: m.hp as number | null,
    mp: m.mp as number | null,
    ...(m.vocation === undefined ? {} : { vocation: m.vocation as number }),
    ...(m.appearance === undefined ? {} : { appearance: m.appearance as number }),
    ...(m.name === undefined ? {} : { name: m.name as string }),
    gains: gains as SaveMember['gains'],
    equipped: equipped as SaveMember['equipped'],
  }
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
