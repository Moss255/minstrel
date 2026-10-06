import type { Appearance } from './appearance.ts'
import type { Bag } from './bag.ts'
import { type Equipped, SLOTS, type Slot } from './equipment.ts'
import { GAIN_STATS, type GainStat, HERO_VOCATION_NUMBER } from './hero.ts'

/** Every field of an `Appearance`, so a save can be checked field by field. */
const APPEARANCE_KNOBS: readonly (keyof Appearance)[] = [
  'sex',
  'face',
  'hair',
  'hairVariant',
  'hairColour',
  'build',
  'skin',
  'eyes',
]

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

/** One thread of the story, as a save keeps it — see `Story` in `story.ts`. */
export interface SaveThread {
  readonly stage: { readonly major: number; readonly minor: number } | null
  readonly step: number
  readonly flags: readonly number[]
  readonly marks: readonly number[]
}

export const SAVE_KEY = 'minstrel.save'
export const SAVE_VERSION = 5

/**
 * One place in the party, as a save keeps it — see `Member` in `companion.ts`,
 * and `docs/party-and-vocations.md` for the game's own ordered slots that this
 * is the shape of. **The Hero is first.**
 */
export interface SaveMember {
  /** Their number in `attnpc`; **null for the Hero**, who is in no such table. */
  readonly attnpc: number | null
  /**
   * Their experience, **by vocation**: pairs of `[vocation, experience]`, the
   * way the bag keeps its items, because JSON has no integer keys.
   *
   * **Version 3 and earlier kept one number**, which is what the running game
   * kept: a character had one experience read against whichever table their
   * vocation named. The game keeps thirteen — see `Member.exp` — so version 4
   * does, and an older save's single number becomes the experience of the
   * vocation that save says they were.
   */
  readonly exp: readonly (readonly [number, number])[]
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
  /** Which sex they are — see `Member.sex`. Absent where nobody has chosen. */
  readonly sex?: number
  /**
   * What they look like — see `Member.look`. Absent where nobody has chosen,
   * which is every save written before character creation existed.
   */
  readonly look?: Appearance
  /** What they are called, where somebody chose — see `Member.name`. */
  readonly name?: string
  /**
   * Every vocation they have ever been — see `Member.held`. Absent where they
   * have only ever been the one they are, which a save need not say twice.
   */
  readonly held?: readonly number[]
  /** What seeds have added — see `Gains`. */
  readonly gains: Readonly<Partial<Record<GainStat, number>>>
  /**
   * What they wear, **by vocation**: pairs of `[vocation, worn]` — see
   * `Member.outfits`.
   *
   * **Version 4 and earlier kept one set**, because the running game did.
   * The game keeps one per vocation, so version 5 does, and an older save's
   * single set becomes the set of the vocation that save says they were.
   */
  readonly outfits: readonly (readonly [number, Readonly<Partial<Record<Slot, number>>>])[]
  /**
   * Skill points not yet spent — see `Member.skillPool`. **Absent from saves
   * made before a point could be spent**, and adding a field takes no new
   * version; what such a save's party had earned is worked out from their
   * levels when it is loaded, because nothing had taken any of it.
   */
  readonly skillPool?: number
  /** Their tactic in battle — see `Member.tactic`; absent is Follow Orders. */
  readonly tactic?: number
  /** In the Back Line — see `Member.backLine`; absent is the Front Line. */
  readonly backLine?: boolean
  /** What they carry, up to eight item ids — see `Member.carried`; absent is nothing. */
  readonly carried?: readonly number[]
  /** Points put into each tree: pairs of `[tree, points]` — see `Member.treePoints`. */
  readonly treePoints?: readonly (readonly [number, number])[]
  /**
   * How many times each vocation has been revoked: pairs of
   * `[vocation, marks]` — see `Member.revocations`. Left out where nobody has
   * revoked anything, which is most saves.
   */
  readonly revocations?: readonly (readonly [number, number])[]
}

export interface SaveQuests {
  readonly nibbles: readonly number[]
  readonly log: readonly { readonly quest: number; readonly progress: number }[]
  readonly cleared: readonly (readonly [number, string])[]
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
  /** The live thread's marks — see `OP_SET_MARK`. Absent from saves made before they were kept. */
  readonly marks?: readonly number[]
  /**
   * Which of the story's five threads is live, and every thread's own — see
   * `THREADS` in `story.ts`. The live one's entry is stale; `stage`, `step`,
   * `flags` and `marks` above are its copy. **Absent from saves made before
   * threads were kept**, whose one stage the map they were made in takes.
   */
  readonly thread?: number
  readonly threads?: readonly SaveThread[]
  /** The game-wide flags set — see `OP_SET_GLOBAL`. Absent from saves made before they were kept. */
  readonly globals?: readonly number[]
  /**
   * The party trick in each of the seven slots — Up, Left, Right, Down 1 to
   * 4 — by number, null for none; see `tricks.ts`. Absent from saves made
   * before tricks were kept, which read as none assigned; four long in saves
   * made before the seven, in the menu's order Up, Right, Left, Down.
   */
  readonly tricks?: readonly (number | null)[]
  /** The stop the Starflight Express is at — see `expressAt` in `main.ts`. Absent for none. */
  readonly express?: number
  /**
   * The quests — see `QuestBook` in `quests.ts`: each quest's nibble, the log
   * of those taken with their progress, and when each cleared one was.
   * **Absent from saves made before quests were kept**, which read as none
   * touched.
   */
  readonly quests?: SaveQuests
  /**
   * The party, the Hero first — see {@link SaveMember}. Never empty: a save
   * with no Hero is a save of nobody, and `decodeSave` refuses it.
   */
  readonly members: readonly SaveMember[]
  /**
   * Those left with Patty at the Quester's Rest — see `recruit.ts`. **Absent
   * from saves made before recruitment existed**, which read as nobody kept;
   * adding a field takes no new version.
   *
   * The party and the list never share a character, so this is everyone who
   * is not in `members`.
   */
  readonly kept?: readonly SaveMember[]
  /** The bag is the party's, not a member's. */
  readonly gold: number
  /** Each item and how many, in the bag's order. */
  readonly items: readonly (readonly [number, number])[]
  /**
   * **Before 6 October 2026, the opened treasure**, by the treasure files'
   * running number (`#21`) or a map and slot. Opened treasure is now a flag in
   * `globals` (`treasureKey`); a red chest named here is turned into its flag
   * when its map is next entered, and the rest come back at the start of play
   * anyway. New saves write none.
   */
  readonly opened: readonly string[]
  /**
   * How many mini medals have been handed to Cap'n Max — see `medals.ts`.
   * **Absent from saves made before he took any**, which read as none; adding
   * a field takes no new version.
   */
  readonly medalsGiven?: number
  /**
   * The Story So Far's number — see `story-so-far.ts`. **Absent from saves
   * made before it was kept**, which read as the start, 1.
   */
  readonly storySoFar?: number
  /** The accolades earned, by number — see `accolades.ts`. Absent is none. */
  readonly accolades?: readonly number[]
  /**
   * The recipes known, as pairs of a recipe and its bits — see `learnRecipe`.
   * **Absent from saves made before recipes were kept**: see `restore` in
   * `main.ts` for how one of those is read.
   */
  readonly recipes?: readonly (readonly [number, number])[]
  /** The day's clock, in ticks — see `Clock` in the sim. Absent from saves made before it was kept. */
  readonly clock?: number
  /** Gold in the bank — see `counter.ts`. Absent for none. */
  readonly banked?: number
  /**
   * The map a party wiped out comes round in, by its id — `GameState+0x5698`,
   * see `docs/readings/T12-travel.md`. Absent from saves made before it was
   * kept, which come round where a new game does.
   */
  readonly revival?: number
  /** The spells the story has taught the Hero, by their place in the spell list — trigger action 166. Absent from saves made before they were kept. */
  readonly taught?: readonly number[]
  /** The last field the Hero stood in, by its id — the protagonist's `+0x566`, what Evac chooses by. Absent for none. */
  readonly lastField?: number
  /**
   * **The gathering spots** — the save's variant, 0–7 or 8 for none drawn,
   * and a word a spot (`GameState+0x5cda`, `+0x5cdc`; see `Gathering` in
   * `@minstrel/sim`). Absent from saves made before they were kept, which set
   * them up as a new game does.
   */
  readonly gathering?: { readonly variant: number; readonly words: readonly number[] }
  /**
   * **The ship** — what the game keeps of it, `func_02012fe4()` `+0x2774` on:
   * the map and mooring it is tied up at, whether it is out at sea, its place
   * and facing on the ocean in the game's fixed point, and the sea's
   * encounter count. See `ShipKeep` in `ship.ts`. Absent from saves made
   * before it was kept, which have it where a new game does.
   */
  readonly ship?: {
    readonly map: number
    readonly mooring: number
    readonly atSea: boolean
    readonly x: number
    readonly y: number
    readonly z: number
    readonly facing: number
    readonly count: number
  }
}

export class SaveError extends Error {
  override name = 'SaveError'
}

/** The bag a save holds. */
export function bagOf(save: SaveGame): Bag {
  return { gold: save.gold, items: new Map(save.items.map(([id, count]) => [id, count])) }
}

/** One of a save's equipment records, as the game holds it. */
export function equippedOf(record: Readonly<Partial<Record<Slot, number>>>): Equipped {
  const worn = new Map<Slot, number>()
  for (const { slot } of SLOTS) {
    const item = record[slot]
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
function isQuests(q: unknown): q is SaveQuests {
  if (typeof q !== 'object' || q === null) return false
  const { nibbles, log, cleared } = q as Record<string, unknown>
  return (
    Array.isArray(nibbles) &&
    nibbles.every((n) => isCount(n) && n < 16) &&
    Array.isArray(log) &&
    log.every(
      (e) =>
        typeof e === 'object' &&
        e !== null &&
        isCount((e as Record<string, unknown>).quest) &&
        isCount((e as Record<string, unknown>).progress),
    ) &&
    Array.isArray(cleared) &&
    cleared.every(
      (c) => Array.isArray(c) && c.length === 2 && isCount(c[0]) && typeof c[1] === 'string',
    )
  )
}

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
  if (s.marks !== undefined && (!Array.isArray(s.marks) || !s.marks.every(isCount))) {
    throw new SaveError('the save has story marks that do not read')
  }
  if (s.globals !== undefined && (!Array.isArray(s.globals) || !s.globals.every(isCount))) {
    throw new SaveError('the save has game-wide flags that do not read')
  }
  if (
    s.tricks !== undefined &&
    (!Array.isArray(s.tricks) || !s.tricks.every((t) => t === null || isCount(t)))
  ) {
    throw new SaveError('the save has party tricks that do not read')
  }
  if (s.express !== undefined && !isCount(s.express)) {
    throw new SaveError('the save has a Starflight Express stop that does not read')
  }
  if (s.quests !== undefined && !isQuests(s.quests)) {
    throw new SaveError('the save has quests that do not read')
  }
  if (s.thread !== undefined && !isCount(s.thread)) {
    throw new SaveError('the save has a story thread that does not read')
  }
  if (s.threads !== undefined && (!Array.isArray(s.threads) || !s.threads.every(isThread))) {
    throw new SaveError('the save has story threads that do not read')
  }
  if (s.kept !== undefined && !Array.isArray(s.kept)) {
    throw new SaveError('the save has a list of kept party members that does not read')
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
  if (s.medalsGiven !== undefined && !isCount(s.medalsGiven)) {
    throw new SaveError('the save has a mini medal count that does not read')
  }
  if (
    s.recipes !== undefined &&
    (!Array.isArray(s.recipes) ||
      !s.recipes.every((pair) => Array.isArray(pair) && pair.length === 2 && pair.every(isCount)))
  ) {
    throw new SaveError('the save has a recipe list that does not read')
  }
  if (s.revival !== undefined && !isCount(s.revival)) {
    throw new SaveError('the save has a revival map that does not read')
  }
  if (s.taught !== undefined && (!Array.isArray(s.taught) || !s.taught.every(isCount))) {
    throw new SaveError('the save has a list of taught spells that does not read')
  }
  const gathering = s.gathering as Record<string, unknown> | null | undefined
  if (
    gathering !== undefined &&
    (typeof gathering !== 'object' ||
      gathering === null ||
      !isCount(gathering.variant) ||
      !Array.isArray(gathering.words) ||
      !gathering.words.every(isCount))
  ) {
    throw new SaveError('the save has gathering spots that do not read')
  }
  const ship = s.ship as Record<string, unknown> | null | undefined
  const whole = (v: unknown) => typeof v === 'number' && Number.isInteger(v)
  if (
    ship !== undefined &&
    (typeof ship !== 'object' ||
      ship === null ||
      !isCount(ship.map) ||
      !isCount(ship.mooring) ||
      typeof ship.atSea !== 'boolean' ||
      !['x', 'y', 'z', 'facing', 'count'].every((k) => whole(ship[k])))
  ) {
    throw new SaveError('the save has a ship that does not read')
  }
  if (s.lastField !== undefined && !isCount(s.lastField)) {
    throw new SaveError('the save has a last field that does not read')
  }
  if (s.banked !== undefined && !isCount(s.banked)) {
    throw new SaveError('the save has a bank balance that does not read')
  }
  if (s.clock !== undefined && !isCount(s.clock)) {
    throw new SaveError('the save has a clock that does not read')
  }
  if (s.storySoFar !== undefined && !isCount(s.storySoFar)) {
    throw new SaveError('the save has a story-so-far number that does not read')
  }
  if (!Array.isArray(s.opened) || !s.opened.every((key) => typeof key === 'string')) {
    throw new SaveError('the save has an opened-treasure list that does not read')
  }
  // Patty's list is read with the same checks the party is, so a bad record
  // in it says which one rather than coming back as a half-made character.
  const kept =
    s.kept === undefined ? undefined : (s.kept as unknown[]).map((raw, at) => member(raw, at + 1))
  return {
    ...(s as unknown as SaveGame),
    version: SAVE_VERSION,
    members,
    ...(kept === undefined ? {} : { kept }),
  } as SaveGame
}

/** Whether a saved thread reads — see {@link SaveThread}. */
function isThread(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false
  const t = raw as Record<string, unknown>
  const stage = t.stage as Record<string, unknown> | null | undefined
  return (
    (stage === null || (!!stage && isCount(stage.major) && isCount(stage.minor))) &&
    isCount(t.step) &&
    Array.isArray(t.flags) &&
    t.flags.every(isCount) &&
    Array.isArray(t.marks) &&
    t.marks.every(isCount)
  )
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

/**
 * What a place wears, whatever version wrote it: pairs from version 5, and
 * from before that the one set against the vocation it names.
 */
function outfitsOf(
  m: Record<string, unknown>,
  where: string,
): (readonly [number, Readonly<Partial<Record<Slot, number>>>])[] {
  const slots = new Set<string>(SLOTS.map((entry) => entry.slot))
  const checked = (worn: unknown): Readonly<Partial<Record<Slot, number>>> => {
    if (typeof worn !== 'object' || worn === null) {
      throw new SaveError(`${where} has no equipment record`)
    }
    for (const [slot, item] of Object.entries(worn)) {
      if (!slots.has(slot) || !isCount(item)) throw new SaveError(`${where} wears ${slot} wrongly`)
    }
    return worn as Readonly<Partial<Record<Slot, number>>>
  }
  if (Array.isArray(m.outfits)) {
    return m.outfits.map((pair) => {
      if (!Array.isArray(pair) || pair.length !== 2 || !isCount(pair[0])) {
        throw new SaveError(`${where} has an outfit that does not read`)
      }
      return [pair[0] as number, checked(pair[1])] as const
    })
  }
  const worn = checked(m.equipped)
  if (Object.keys(worn).length === 0) return []
  const vocation = isCount(m.vocation) ? (m.vocation as number) : HERO_VOCATION_NUMBER
  return [[vocation, worn]]
}

/**
 * The experience a place holds, whatever version wrote it: pairs from version
 * 4, and from before that the one number against the vocation it names.
 */
function expOf(m: Record<string, unknown>, where: string): (readonly [number, number])[] {
  if (Array.isArray(m.exp)) {
    if (
      !m.exp.every(
        (pair) => Array.isArray(pair) && pair.length === 2 && isCount(pair[0]) && isCount(pair[1]),
      )
    ) {
      throw new SaveError(`${where} has experience that does not read`)
    }
    return m.exp as (readonly [number, number])[]
  }
  if (!isCount(m.exp)) throw new SaveError(`${where} has no experience count`)
  const vocation = isCount(m.vocation) ? (m.vocation as number) : HERO_VOCATION_NUMBER
  return m.exp === 0 ? [] : [[vocation, m.exp as number]]
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
  const exp = expOf(m, where)
  if (m.vocation !== undefined && !isCount(m.vocation)) {
    throw new SaveError(`${where} has a vocation that does not read`)
  }
  if (m.appearance !== undefined && !isCount(m.appearance)) {
    throw new SaveError(`${where} has an appearance that does not read`)
  }
  if (m.sex !== undefined && !isCount(m.sex)) {
    throw new SaveError(`${where} has a sex that does not read`)
  }
  const look = m.look as Record<string, unknown> | undefined
  if (
    look !== undefined &&
    (typeof look !== 'object' || look === null || !APPEARANCE_KNOBS.every((k) => isCount(look[k])))
  ) {
    throw new SaveError(`${where} has a look that does not read`)
  }
  if (m.name !== undefined && typeof m.name !== 'string') {
    throw new SaveError(`${where} has a name that does not read`)
  }
  if (m.held !== undefined && (!Array.isArray(m.held) || !m.held.every(isCount))) {
    throw new SaveError(`${where} has vocations held that do not read`)
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
  if (m.skillPool !== undefined && !isCount(m.skillPool)) {
    throw new SaveError(`${where} has a skill-point pool that does not read`)
  }
  const pairs = (value: unknown) =>
    Array.isArray(value) &&
    value.every(
      (pair) => Array.isArray(pair) && pair.length === 2 && isCount(pair[0]) && isCount(pair[1]),
    )
  if (m.treePoints !== undefined && !pairs(m.treePoints)) {
    throw new SaveError(`${where} has skill trees that do not read`)
  }
  if (m.revocations !== undefined && !pairs(m.revocations)) {
    throw new SaveError(`${where} has revocations that do not read`)
  }
  if (m.backLine !== undefined && typeof m.backLine !== 'boolean') {
    throw new SaveError(`${where} has a row that does not read`)
  }
  if (m.tactic !== undefined && !(isCount(m.tactic) && (m.tactic as number) <= 5)) {
    throw new SaveError(`${where} has a tactic that does not read`)
  }
  if (
    m.carried !== undefined &&
    !(Array.isArray(m.carried) && m.carried.length <= 8 && m.carried.every(isCount))
  ) {
    throw new SaveError(`${where} carries items that do not read`)
  }
  const outfits = outfitsOf(m, where)
  return {
    attnpc: m.attnpc as number | null,
    exp,
    hp: m.hp as number | null,
    mp: m.mp as number | null,
    ...(m.vocation === undefined ? {} : { vocation: m.vocation as number }),
    ...(m.appearance === undefined ? {} : { appearance: m.appearance as number }),
    ...(m.sex === undefined ? {} : { sex: m.sex as number }),
    ...(m.look === undefined ? {} : { look: m.look as Appearance }),
    ...(m.name === undefined ? {} : { name: m.name as string }),
    ...(m.held === undefined ? {} : { held: m.held as number[] }),
    gains: gains as SaveMember['gains'],
    outfits,
    ...(m.skillPool === undefined ? {} : { skillPool: m.skillPool as number }),
    ...(m.treePoints === undefined
      ? {}
      : { treePoints: m.treePoints as (readonly [number, number])[] }),
    ...(m.revocations === undefined
      ? {}
      : { revocations: m.revocations as (readonly [number, number])[] }),
    ...(m.tactic === undefined ? {} : { tactic: m.tactic as number }),
    ...(m.backLine === true ? { backLine: true } : {}),
    ...(m.carried === undefined ? {} : { carried: m.carried as number[] }),
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
