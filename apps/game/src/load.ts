import {
  chooseFigure,
  type Figure,
  type FigurePiece,
  figurePieces,
  type LibraryBuilder,
  library,
} from '@minstrel/actor'
import { type Catalogue, catalogue, scanCartridge } from '@minstrel/cartridge'
import { FX32_ONE, fx32, toFloat } from '@minstrel/fixed'
import {
  type Action,
  type ActionRange,
  type BattleZone,
  type EventMessage,
  type FieldMonster,
  type FieldZone,
  type Grammar,
  type ItemName,
  isMapLinks,
  isMapList,
  isMapManifest,
  isNpcList,
  isNpcPlacements,
  type LevelTable,
  type MapEntry,
  type MapManifest,
  type MapTransition,
  type MonsterBattle,
  mapDoorways,
  NO_ACTION,
  type NpcEntry,
  type NpcPlacement,
  type NpcState,
  placeNpcs,
  type RandomTreasure,
  readActionRanges,
  readActions,
  readBattleEncounters,
  readEventMessages,
  readFieldEncounters,
  readFieldMonsters,
  readItemNames,
  readItemTable,
  readLevelTable,
  readMapList,
  readMapManifest,
  readMonsterBattle,
  readMonsterList,
  readMonsterNames,
  readNpcList,
  readNpcPlacements,
  readNpcStates,
  readRandomTreasure,
  readScript,
  readShops,
  readSpellTable,
  readSystemStrings,
  readTableMessages,
  readTalk,
  readTreasure,
  readTriggers,
  type Script,
  type Shop,
  type SpellTable,
  type TalkLine,
  type Treasure,
  type Trigger,
} from '@minstrel/game-formats'
import type { Model } from '@minstrel/nitro-gfx'
import { type CollisionWorld, createCollisionWorld, groundBelow, PERSON } from '@minstrel/sim'
import { type AssembledMap, assembleMap, type MapLighting, WORLD_SCALE } from '@minstrel/world'
import type { BattleWords } from './battle-scene.ts'
import { type Cast, cast, forgetSheets, type GroundAt } from './cast.ts'
import { CHEST_ARCHIVE, type ChestLook, chestModelsOf } from './chests.ts'
import { HERO_LEVELS } from './hero.ts'
import { type Prop, propSprites } from './pots.ts'
import { SHADOW_ARCHIVE, shadowModelOf } from './shadows.ts'

/**
 * Turn a cartridge into somewhere to stand.
 *
 * The game reads assets from the player's own cartridge at runtime; nothing is
 * extracted, bundled or shipped. This is the whole of that path: walk the
 * cartridge once, keep what the chosen map and the character need, and throw
 * the rest away.
 */

export interface Loaded {
  readonly catalogue: Catalogue
  readonly map: AssembledMap
  readonly world: CollisionWorld | undefined
  readonly figure: Figure
  readonly pieces: readonly FigurePiece[]
  /** Who else stands in this map. */
  readonly cast: Cast
  /**
   * The story stages this map's cast records start at, earliest first, for
   * flicking through where characters stand. What a stage is in the game is
   * not established — see {@link Stage}.
   */
  readonly stages: readonly Stage[]
  /** The cast at one of {@link stages}; `undefined` is the file's first placement of each. */
  castAt(stage: Stage | undefined): Cast
  /** The chapter letters this map's area has talk for, in order — `A0`, `B0` … */
  readonly letters: readonly string[]
  /** What a character says in a chapter — see `readTalk`. Empty when they say nothing. */
  linesOf(id: number, letter: string): readonly TalkLine[]
  /** The map's own id in the index, which is how triggers and the cast name it. */
  readonly mapId: number | undefined
  /** The area's triggers — see `readTriggers`. */
  readonly triggers: readonly Trigger[]
  /** The map's treasure, in world units — see `readTreasure`. Empty when it has none. */
  readonly treasures: readonly Treasure[]
  /** The two chests' models, shut and open — see `chests.ts`. */
  readonly chests: readonly ChestLook[]
  /** The pots and barrels, drawn as sprites where the treasure stands — see `pots.ts`. */
  readonly props: readonly Prop[]
  /** The round shadow drawn under each character — see `shadows.ts`. */
  readonly shadow: Model | undefined
  /** Item names in English, by id — see `readItemNames`. */
  readonly itemNames: ReadonlyMap<number, string>
  /** The random-treasure tables, by file — `randTBox`, `randTD`, `randTTT`. */
  readonly randoms: ReadonlyMap<string, readonly RandomTreasure[]>
  /** Monster names in English, by the monster's number — see `readMonsterList`. */
  readonly monsterNames: ReadonlyMap<number, string>
  /** The engine's own short messages in English, by number — see `readSystemStrings`. */
  readonly systemStrings: ReadonlyMap<number, string>
  /** Each monster's battle numbers, by its number — see `readMonsterBattle`. */
  readonly monsterBattle: ReadonlyMap<number, MonsterBattle>
  /** Each monster's number, name, plural and grammar, by its code — `z000a` — see `readMonsterNames`. */
  readonly monsterCodes: ReadonlyMap<string, MonsterWords>
  /** Each monster's code by its number — the other way round. */
  readonly monsterCodeOf: ReadonlyMap<number, string>
  /** This map's zones and who roams them — see `readFieldEncounters`. Empty where none roam. */
  readonly fieldZones: readonly FieldZone[]
  /** Every zone's roamers and battle company, by zone — see `readBattleEncounters`. */
  readonly battleZones: ReadonlyMap<number, BattleZone>
  /** How each monster goes about the field, by number — see `readFieldMonsters`. */
  readonly fieldMonsters: ReadonlyMap<number, FieldMonster>
  /** The Hero's vocation's level table — see `hero.ts`. Undefined when it will not read. */
  readonly heroLevels: LevelTable | undefined
  /** What each shop sells, by the number a talk line's `<SHOP=n>` names — see `readShops`. */
  readonly shops: ReadonlyMap<number, Shop>
  /** Each item's price and the table it is listed in — see `readItemTable`. */
  readonly goods: ReadonlyMap<number, Goods>
  /** Each item's name, plural and grammar in English, by id — see `readItemNames`. */
  readonly itemWords: ReadonlyMap<number, ItemName>
  /** What using each item does, by id — see {@link ItemUse}. */
  readonly itemUses: ReadonlyMap<number, ItemUse>
  /** Every action, by number, as using it needs — see {@link ItemEffect}. */
  readonly actions: ReadonlyMap<number, ItemEffect>
  /** Who learns which spell at what level — see `readSpellTable`. Undefined when it will not read. */
  readonly spellTable: SpellTable | undefined
  /** The battle's words in English — see `battle-scene.ts`. Empty where a file will not read. */
  readonly battleWords: BattleWords
  /** The field menu's messages in English, `str_tm`, by number. */
  readonly menuWords: ReadonlyMap<number, string>
  /** The engine's standard messages in English, `strstd`, by number — 57 a head banged on the ceiling. */
  readonly standardWords: ReadonlyMap<number, string>
  /** An event's messages in English, read the first time they are asked for. */
  eventMessages(event: number): readonly EventMessage[]
  /** An event's script — see `readScript` and `event.ts`. Undefined when it will not read. */
  eventScript(event: number): Script | undefined
  /** The way out: where this map's doorways are and what they lead to. */
  readonly doorways: readonly MapTransition[]
  /** Which archive the map came out of, for the status line. */
  readonly archive: string
  /** The map's own code, which is what a doorway names. */
  readonly code: string
}

/** An item as the shop and the equip panel need it: its price, and its table's letter — `w` weapons … */
export interface Goods {
  readonly price: number
  readonly table: string
}

/** A monster as the battle's words need it. */
export interface MonsterWords {
  readonly number: number
  readonly name: string
  readonly plural: string
  readonly grammar: Grammar
}

/**
 * What using an item does, in the field and in battle: the two actions its
 * item table names, looked up in the action table — see `readItemTable` and
 * `readActions`. Undefined where it names 252, which does nothing.
 */
export interface ItemUse {
  readonly field: ItemEffect | undefined
  readonly battle: ItemEffect | undefined
}

export interface ItemEffect {
  readonly action: number
  readonly name: string
  /** What the action does — see `ActionEffect`. INFERRED. */
  readonly effect: number
  /** What it says: its message in `actmsg`, 0 for none. INFERRED. */
  readonly message: number
  /** Its cost in MP; 255 for all there is. INFERRED. */
  readonly cost: number
  /** Whom it reaches — see `ActionReach`. INFERRED. */
  readonly reach: number
  /** The range the party draws from, when it has one: a base give or take a spread. */
  readonly range: { readonly base: number; readonly spread: number } | undefined
  /**
   * The range a monster draws from: the range's own base, beside the party's
   * amount — INFERRED; see `ActionRange.party`. Crack's is 17, the party's 30.
   */
  readonly foeRange: { readonly base: number; readonly spread: number } | undefined
  /** Whether it is in the table's first half, whose spells can be cast outside a battle. INFERRED. */
  readonly field: boolean
}

export interface LoadOptions {
  /**
   * The map archive to open, matched as a substring of its cartridge path.
   *
   * Angel Falls is `M01`. Which area code the slice actually opens in is not
   * established — that needs the emulator work this repository does not do —
   * so this is a choice, not a finding.
   */
  readonly map: string
  /** Narrows the cartridge walk. Everything the map and character need, only. */
  readonly paths?: readonly string[]
  /**
   * Which of the map's two lightings to build. Defaults to day.
   *
   * A map ships its lit pieces twice, once for each; building both puts the
   * village's windows in both states at once.
   */
  readonly lighting?: MapLighting
  readonly onProgress?: (what: string) => void
}

/**
 * What a walkable village needs out of the cartridge.
 *
 * A full walk touches every archive and every compressed member — seconds of
 * work and a great deal of memory for 36 MiB of sound the game does not yet
 * play. Narrowing it is what makes a load quick.
 */
export const SLICE_PATHS = [
  '/data/map/',
  '/data/pack_lv5/chara_pc.gp2',
  '/data/pack_lv5/chara_mp.gp2',
  // The characters that ship as whole models…
  '/data/chara_sub/',
  // …and the ones that ship as 2D sheets, which is most of a village.
  '/data/ani/',
  // What the engine draws in the world itself: the chests among it.
  '/data/bin/icon.nsarc',
]

/**
 * `/data/ani/<name>.spr`, by character name. These sit directly in the
 * filesystem rather than inside an archive, so they arrive as unclaimed leaves
 * rather than as an archive's members.
 */
function sheetsOf(cat: Catalogue): Map<string, Uint8Array> {
  const sheets = new Map<string, Uint8Array>()
  for (const leaf of cat.other) {
    if (!leaf.path.toLowerCase().endsWith('.spr')) continue
    const name = leaf.path.slice(leaf.path.lastIndexOf('/') + 1)
    sheets.set(name.slice(0, name.length - 4).toLowerCase(), leaf.bytes)
  }
  return sheets
}

/** What an area's `.npc` archive says: its cast, their placements, and each one's records. */
interface Area {
  /** The area's code — `M01` — which is also what its talk archives are named for. */
  readonly code: string
  readonly entries: readonly NpcEntry[]
  readonly placements: readonly NpcPlacement[]
  readonly states: readonly NpcState[]
}

/**
 * The cast files for this map's area.
 *
 * A cast list is per *area*: there are 74 of them and an interior has none of
 * its own, so `M01M02` — the village inn — takes `M01.npc`. Every prefix of
 * the code is offered until one names an archive that reads.
 */
function areaOf(cat: Catalogue, map: string): Area | undefined {
  for (let cut = map.length; cut > 0; cut--) {
    const found = areaFrom(cat, map.slice(0, cut))
    if (found) return found
  }
  return undefined
}

/** A map nobody stands in, or whose cast will not read — which is not fatal. */
const NOBODY: Cast = {
  members: [],
  sprites2d: [],
  sprites: 0,
  unclassified: 0,
  spots: [],
  missing: [],
  elsewhere: 0,
}

/**
 * A story stage, as far as the cast's records name one: the pair of words a
 * record's span starts at.
 *
 * **For flicking through where characters stand, not a reading of the game.**
 * The words are not decoded; that they read as a span from one stage to
 * another is only what the numbers look like — see `NpcState`.
 */
export interface Stage {
  readonly major: number
  readonly minor: number
}

function compareStages(a: Stage, b: Stage): number {
  return a.major - b.major || a.minor - b.minor
}

/** Where a record's span starts and ends: words 0-1 and 3-4. INFERRED — see `NpcState`. */
function spanOf(state: NpcState): { from: Stage; to: Stage } {
  const words = state.unknown_0x08
  return {
    from: { major: words[0] ?? 0, minor: words[1] ?? 0 },
    to: { major: words[3] ?? 0, minor: words[4] ?? 0 },
  }
}

/** The stages this map's placed records start at, earliest first. */
function stagesOf(area: Area, id: number | undefined): Stage[] {
  const found = new Map<string, Stage>()
  for (const state of area.states) {
    if (!state.position || (id !== undefined && state.map !== id)) continue
    const { from } = spanOf(state)
    found.set(`${from.major}.${from.minor}`, from)
  }
  return [...found.values()].sort(compareStages)
}

/**
 * The characters standing in this map, as the file first places them or at a
 * stage.
 *
 * **The list is the whole area's, so it has to be narrowed to this map.**
 * Everyone inside the village's houses is in `M01.npc` too, placed in the
 * coordinates of the room they stand in — and those rooms are each their own
 * little map about their own origin, so having floor underneath is no evidence
 * at all of being in the right one. It let fifteen villagers into the stable.
 * The join is the map's own id out of `maplist9.bin`, which every one of the
 * cartridge's 1,289 placements names exactly. A map the index does not know is
 * not narrowed at all rather than narrowed by a guess.
 *
 * With no stage, each character is where its block's header puts them. With
 * one, it is the first of their placed records in this map whose span covers
 * the stage, and a character with none is not here.
 */
function castOf(
  cat: Catalogue,
  area: Area | undefined,
  id: number | undefined,
  groundAt: GroundAt,
  sheets: ReadonlyMap<string, Uint8Array>,
  stage?: Stage,
): Cast {
  if (!area) return NOBODY
  const placed: { entry: NpcEntry; placement: NpcPlacement }[] = []
  if (stage === undefined) {
    for (const found of placeNpcs(area.entries, area.placements.map(placementInWorld))) {
      if (id === undefined || found.placement.map === id) placed.push(found)
    }
  } else {
    const byId = new Map(area.entries.map((entry) => [entry.id, entry]))
    const seen = new Set<number>()
    for (const state of area.states) {
      if (!state.position || seen.has(state.id)) continue
      if (id !== undefined && state.map !== id) continue
      const { from, to } = spanOf(state)
      if (compareStages(from, stage) > 0 || compareStages(stage, to) > 0) continue
      const entry = byId.get(state.id)
      if (!entry) continue
      seen.add(state.id)
      placed.push({
        entry,
        placement: placementInWorld({
          id: state.id,
          map: state.map,
          offset: state.offset,
          ...state.position,
        }),
      })
    }
  }
  return cast(placed, cat.members, groundAt, toFloat(PERSON.height), sheets)
}

/** One named `.npc` archive's cast files, or undefined if there is none or it will not read. */
function areaFrom(cat: Catalogue, area: string): Area | undefined {
  for (const [archive, files] of cat.members) {
    if (!archive.toLowerCase().endsWith(`/${area.toLowerCase()}.npc`)) continue
    let list: Uint8Array | undefined
    let places: Uint8Array | undefined
    for (const [name, bytes] of files) {
      if (name.toLowerCase().endsWith('npc.bin')) list = bytes
      if (name.toLowerCase().endsWith('place.bin')) places = bytes
    }
    if (!list || !places || !isNpcList(list) || !isNpcPlacements(places)) return undefined
    try {
      return {
        code: area.toUpperCase(),
        entries: readNpcList(list),
        placements: readNpcPlacements(places),
        states: readNpcStates(places),
      }
    } catch {
      return undefined
    }
  }
  return undefined
}

/**
 * What each character of an area says, by chapter letter and character id —
 * see `readTalk`. English only, for now.
 *
 * The area's archives under `/data/scenario` are walked on their own and kept
 * like the rest of the walk: 44 ms for Angel Falls' fourteen chapters.
 */
function talkOf(rom: Uint8Array, area: string): Map<string, Map<number, readonly TalkLine[]>> {
  const { cat } = walkOnce(rom, [`/data/scenario/${area}`])
  const chapter = new RegExp(`/${area}([A-Z]\\d)\\.gp2$`, 'i')
  const out = new Map<string, Map<number, readonly TalkLine[]>>()
  for (const [archive, files] of cat.members) {
    const letter = chapter.exec(archive)?.[1]?.toUpperCase()
    if (!letter) continue
    const byId = new Map<number, readonly TalkLine[]>()
    for (const [name, bytes] of files) {
      const number = /(?:^|\/)(\d+)_en\.bin$/i.exec(name)
      if (!number) continue
      try {
        byId.set(Number(number[1]), readTalk(bytes))
      } catch {
        // A talk file that will not read says nothing; the harness reports it.
      }
    }
    out.set(letter, byId)
  }
  return out
}

/**
 * The area's triggers, out of `/data/scenario/trigger<area>.bin` — a loose file
 * rather than an archive's member. None when there is no such file or it will
 * not read.
 */
function triggersOf(rom: Uint8Array, area: string): Trigger[] {
  const { cat } = walkOnce(rom, [`/data/scenario/trigger${area}.bin`])
  const file = `/trigger${area.toLowerCase()}.bin`
  const leaf = cat.other.find((candidate) => candidate.path.toLowerCase().endsWith(file))
  if (!leaf) return []
  try {
    return readTriggers(leaf.bytes)
  } catch {
    return []
  }
}

/**
 * A map's treasure, out of `/data/scenario/treasure.nsarc/<map>.bin`, in world
 * units. None when the map has no member there or it will not read.
 */
function treasuresOf(rom: Uint8Array, code: string): Treasure[] {
  const { cat } = walkOnce(rom, ['/data/scenario/treasure.nsarc'])
  const file = `${code.toLowerCase()}.bin`
  for (const [, files] of cat.members) {
    for (const [name, bytes] of files) {
      if (name.toLowerCase().split('/').pop() !== file) continue
      try {
        return readTreasure(bytes).treasures.map(treasureInWorld)
      } catch {
        return []
      }
    }
  }
  return []
}

/** The item names in English, by id — see `readItemNames`. Empty when they will not read. */
function itemNamesOf(rom: Uint8Array): Map<number, string> {
  const { cat } = walkOnce(rom, ['/data/prm/itemname.gp2'])
  for (const [, files] of cat.members) {
    for (const [name, bytes] of files) {
      if (!name.toLowerCase().endsWith('itemname_en.nat')) continue
      try {
        return new Map(readItemNames(bytes).map((item) => [item.id, item.singular]))
      } catch {
        return new Map()
      }
    }
  }
  return new Map()
}

/** The monster names in English, by number — see `readMonsterList`. Empty when they will not read. */
function monsterNamesOf(rom: Uint8Array): Map<number, string> {
  const { cat } = walkOnce(rom, ['/data/prm/mon_list.gp2'])
  for (const [, files] of cat.members) {
    for (const [name, bytes] of files) {
      if (!name.toLowerCase().endsWith('mon_list_en.nat')) continue
      try {
        return new Map(readMonsterList(bytes).map((monster) => [monster.number, monster.name]))
      } catch {
        return new Map()
      }
    }
  }
  return new Map()
}

/** The system strings in English, by number — see `readSystemStrings`. Empty when they will not read. */
function systemStringsOf(rom: Uint8Array): Map<number, string> {
  const { cat } = walkOnce(rom, ['/data/bin/strstd.gp2'])
  for (const [, files] of cat.members) {
    for (const [name, bytes] of files) {
      if (!name.toLowerCase().endsWith('strstd_en.nat')) continue
      try {
        return readSystemStrings(bytes)
      } catch {
        return new Map()
      }
    }
  }
  return new Map()
}

/** The monsters' battle numbers: a loose file beside the parameter tables. */
const MONSTER_BATTLE = '/data/prm/mon_btldata.nat'
const battleRead = new WeakMap<Uint8Array, Map<number, MonsterBattle>>()

/** Each monster's battle numbers, by number — see `readMonsterBattle`. Empty when they will not read. */
function monsterBattleOf(rom: Uint8Array): Map<number, MonsterBattle> {
  const already = battleRead.get(rom)
  if (already) return already
  const byNumber = new Map<number, MonsterBattle>()
  for (const leaf of scanCartridge(rom, { pathFilter: MONSTER_BATTLE })) {
    if (leaf.path !== MONSTER_BATTLE) continue
    try {
      for (const monster of readMonsterBattle(leaf.bytes)) byNumber.set(monster.number, monster)
    } catch {
      // Numbers that will not read leave every monster out of a fight.
    }
  }
  battleRead.set(rom, byNumber)
  return byNumber
}

const codesRead = new WeakMap<Uint8Array, Map<string, MonsterWords>>()

/**
 * Each monster's number and English name, plural and grammar, by its code —
 * see `readMonsterNames`.
 *
 * A code can name several records — 438 records for 312 codes, story versions
 * of one monster — and the first, the lowest number, is the one kept: `z000a`
 * is the slime, number 1. Which version a scripted fight means is not read.
 */
function monsterCodesOf(rom: Uint8Array): Map<string, MonsterWords> {
  const already = codesRead.get(rom)
  if (already) return already
  const byCode = new Map<string, MonsterWords>()
  const { cat } = walkOnce(rom, ['/data/prm/mon_data.gp2'])
  for (const [, files] of cat.members) {
    for (const [name, bytes] of files) {
      if (!name.toLowerCase().endsWith('mon_data_en.nat')) continue
      try {
        for (const monster of readMonsterNames(bytes)) {
          if (!byCode.has(monster.code))
            byCode.set(monster.code, {
              number: monster.number,
              name: monster.name,
              plural: monster.plural,
              grammar: monster.grammar,
            })
        }
      } catch {
        // Names that will not read leave every monster unfound by its code.
      }
    }
  }
  codesRead.set(rom, byCode)
  return byCode
}

const looseRead = new WeakMap<Uint8Array, Map<string, Uint8Array | undefined>>()

/** A loose file's bytes, by its cartridge path, read once. */
function looseFile(rom: Uint8Array, path: string): Uint8Array | undefined {
  let byPath = looseRead.get(rom)
  if (!byPath) {
    byPath = new Map()
    looseRead.set(rom, byPath)
  }
  if (byPath.has(path)) return byPath.get(path)
  let bytes: Uint8Array | undefined
  for (const leaf of scanCartridge(rom, { pathFilter: path }))
    if (leaf.path === path) bytes = leaf.bytes
  byPath.set(path, bytes)
  return bytes
}

/** Each map's zones, by the map's id — see `readFieldEncounters`. Empty when it will not read. */
function fieldEncountersOf(rom: Uint8Array): Map<number, FieldZone[]> {
  const bytes = looseFile(rom, '/data/prm/encfld.bin')
  try {
    return bytes ? readFieldEncounters(bytes) : new Map()
  } catch {
    return new Map()
  }
}

/** Each zone's roamers and battle company — see `readBattleEncounters`. Empty when it will not read. */
function battleEncountersOf(rom: Uint8Array): Map<number, BattleZone> {
  const bytes = looseFile(rom, '/data/prm/encbtl.bin')
  try {
    return bytes ? readBattleEncounters(bytes) : new Map()
  } catch {
    return new Map()
  }
}

/** How each monster goes about the field — see `readFieldMonsters`. Empty when it will not read. */
function fieldMonstersOf(rom: Uint8Array): Map<number, FieldMonster> {
  const bytes = looseFile(rom, '/data/prm/fld_mondata.bin')
  try {
    return bytes ? readFieldMonsters(bytes) : new Map()
  } catch {
    return new Map()
  }
}

/** Each monster's code by its number, from the English names — see `readMonsterNames`. */
function monsterCodeByNumberOf(rom: Uint8Array): Map<number, string> {
  const byNumber = new Map<number, string>()
  const { cat } = walkOnce(rom, ['/data/prm/mon_data.gp2'])
  for (const [, files] of cat.members) {
    for (const [name, bytes] of files) {
      if (!name.toLowerCase().endsWith('mon_data_en.nat')) continue
      try {
        for (const monster of readMonsterNames(bytes)) byNumber.set(monster.number, monster.code)
      } catch {
        // Names that will not read leave every number without its code.
      }
    }
  }
  return byNumber
}

/** The random-treasure tables beside the maps' treasure, by file name. */
function randomTreasureOf(rom: Uint8Array): Map<string, RandomTreasure[]> {
  const { cat } = walkOnce(rom, ['/data/scenario/treasure.nsarc'])
  const tables = new Map<string, RandomTreasure[]>()
  for (const [, files] of cat.members) {
    for (const [name, bytes] of files) {
      const table = /(rand\w+)\.bin$/i.exec(name)?.[1]
      if (!table) continue
      try {
        tables.set(table, readRandomTreasure(bytes))
      } catch {
        // A table that will not read draws nothing.
      }
    }
  }
  return tables
}

/** The level tables read so far, by cartridge: a loose file, not an archive member. */
const levelsRead = new WeakMap<Uint8Array, LevelTable | undefined>()

/** The Hero's vocation's level table — see `hero.ts`. Undefined when it will not read. */
function heroLevelsOf(rom: Uint8Array): LevelTable | undefined {
  if (levelsRead.has(rom)) return levelsRead.get(rom)
  let table: LevelTable | undefined
  for (const leaf of scanCartridge(rom, { pathFilter: HERO_LEVELS })) {
    if (leaf.path !== HERO_LEVELS) continue
    try {
      table = readLevelTable(leaf.bytes)
    } catch {
      // A table that will not read leaves the Hero without numbers.
    }
  }
  levelsRead.set(rom, table)
  return table
}

/** The shop table: a loose file, beside the menus. */
const SHOP_TABLE = '/data/bin/menu/shopdata1.bin'
const shopsRead = new WeakMap<Uint8Array, Map<number, Shop>>()

/** What each shop sells, by its number — see `readShops`. Empty when it will not read. */
function shopsOf(rom: Uint8Array): Map<number, Shop> {
  const already = shopsRead.get(rom)
  if (already) return already
  const shops = new Map<number, Shop>()
  for (const leaf of scanCartridge(rom, { pathFilter: SHOP_TABLE })) {
    if (leaf.path !== SHOP_TABLE) continue
    try {
      for (const shop of readShops(leaf.bytes)) shops.set(shop.id, shop)
    } catch {
      // A table that will not read leaves every shop empty-handed.
    }
  }
  shopsRead.set(rom, shops)
  return shops
}

const goodsRead = new WeakMap<Uint8Array, Map<number, Goods>>()

/** Every item's price and table letter, from the English item tables — see `readItemTable`. */
function goodsOf(rom: Uint8Array): Map<number, Goods> {
  const already = goodsRead.get(rom)
  if (already) return already
  const { cat } = walkOnce(rom, ['/data/prm/itemdt_'])
  const goods = new Map<number, Goods>()
  for (const [, files] of cat.members) {
    for (const [name, bytes] of files) {
      const table = /itemdt_([a-z])_en\.nat$/i.exec(name)?.[1]
      if (!table) continue
      try {
        for (const item of readItemTable(bytes)) goods.set(item.id, { price: item.price, table })
      } catch {
        // A table that will not read prices nothing in it.
      }
    }
  }
  goodsRead.set(rom, goods)
  return goods
}

/** One English text file out of its archive, read — or an empty map when it will not. */
function englishText(
  rom: Uint8Array,
  archive: string,
  member: string,
  read: (bytes: Uint8Array) => ReadonlyMap<number, string>,
): ReadonlyMap<number, string> {
  const { cat } = walkOnce(rom, [archive])
  for (const [, files] of cat.members) {
    for (const [name, bytes] of files) {
      if (!name.toLowerCase().endsWith(member)) continue
      try {
        return read(bytes)
      } catch {
        return new Map()
      }
    }
  }
  return new Map()
}

/** A message table's messages, by number, the silent ones left out. */
const messagesBy = (messages: readonly EventMessage[]) =>
  new Map(messages.flatMap((m) => (m.text === undefined ? [] : [[m.id, m.text] as const])))

/** The battle results' messages are `str_bres`'s `0x67` records — see game-formats' FORMAT.md, "Battle text". */
const RESULT_TAG = 0x67

/** The battle's words in English — see `BattleWords`. */
function battleWordsOf(rom: Uint8Array): BattleWords {
  return {
    battle: englishText(rom, '/data/bin/strbtl.gp2', 'strbtl_en.nat', readSystemStrings),
    actions: englishText(rom, '/data/prm/actmsg.gp2', 'actmsg_en.nat', readSystemStrings),
    results: englishText(rom, '/data/bin/str_bres.gp2', 'str_bres_en.bin', (bytes) =>
      messagesBy(readTableMessages(bytes, RESULT_TAG)),
    ),
    menu: englishText(rom, '/data/bin/menu/str_btl.gp2', 'str_btl_en.nat', readSystemStrings),
    articles: englishText(rom, '/data/prm/article.gp2', 'article_en.nat', readSystemStrings),
  }
}

/** Every item's English name, plural and grammar — see `readItemNames`. Empty when they will not read. */
function itemWordsOf(rom: Uint8Array): Map<number, ItemName> {
  const { cat } = walkOnce(rom, ['/data/prm/itemname.gp2'])
  for (const [, files] of cat.members) {
    for (const [name, bytes] of files) {
      if (!name.toLowerCase().endsWith('itemname_en.nat')) continue
      try {
        return new Map(readItemNames(bytes).map((item) => [item.id, item]))
      } catch {
        return new Map()
      }
    }
  }
  return new Map()
}

const actionsRead = new WeakMap<Uint8Array, Map<number, ItemEffect>>()

/**
 * Every action, by number — see {@link ItemEffect}. The action table's two
 * halves are read in English, each with the range table beside it; the field
 * half, `_a`, wins where both have a number, as the items' own are there.
 */
function actionsOf(rom: Uint8Array): Map<number, ItemEffect> {
  const already = actionsRead.get(rom)
  if (already) return already
  const out = new Map<number, ItemEffect>()
  const { cat } = walkOnce(rom, ['/data/prm/actdt_'])
  for (const half of ['a', 'b']) {
    let actions: Action[] = []
    let ranges = new Map<number, ActionRange>()
    for (const [, files] of cat.members) {
      for (const [name, bytes] of files) {
        const lower = name.toLowerCase()
        try {
          if (lower.endsWith(`actdt_${half}_en.nat`)) actions = readActions(bytes)
          if (lower.endsWith(`actdamage_${half}.nat`)) ranges = readActionRanges(bytes)
        } catch {
          // A half that will not read does nothing for the items that name it.
        }
      }
    }
    for (const action of actions) {
      if (out.has(action.id)) continue
      const range = action.range ? ranges.get(action.range) : undefined
      out.set(action.id, {
        action: action.id,
        name: action.name,
        effect: action.effect,
        message: action.message,
        cost: action.cost,
        reach: action.reach,
        // The party's amount: the Hero is who uses these — see `ActionRange.party`.
        range: range && { base: range.party, spread: range.spread },
        foeRange: range && { base: range.base, spread: range.spread },
        field: half === 'a',
      })
    }
  }
  actionsRead.set(rom, out)
  return out
}

/** The spell table: a loose file beside the level tables. */
const SPELL_TABLE = '/data/prm/spelltable.bin'

function spellTableOf(rom: Uint8Array): SpellTable | undefined {
  for (const leaf of scanCartridge(rom, { pathFilter: SPELL_TABLE })) {
    if (leaf.path !== SPELL_TABLE) continue
    try {
      return readSpellTable(leaf.bytes)
    } catch {
      // A table that will not read leaves the Hero without spells.
    }
  }
  return undefined
}

/**
 * What using each item does — see {@link ItemUse}: the two actions its item
 * table names. **A field action counts only when it is called what the item
 * is**: the skill books' first numbers run 10, 21, 32 … in steps of eleven and
 * land on Frizzle, Bang and Moreheal, which is no use of theirs; every other
 * tool's is its own. See game-formats' FORMAT.md, "Items".
 */
function itemUsesOf(rom: Uint8Array): Map<number, ItemUse> {
  const actions = actionsOf(rom)
  const names = itemWordsOf(rom)
  const effectOf = (id: number): ItemEffect | undefined =>
    id === NO_ACTION ? undefined : actions.get(id)
  const uses = new Map<number, ItemUse>()
  const tables = walkOnce(rom, ['/data/prm/itemdt_']).cat
  for (const [, files] of tables.members) {
    for (const [name, bytes] of files) {
      if (!/itemdt_[a-z]_en\.nat$/i.test(name)) continue
      try {
        for (const item of readItemTable(bytes)) {
          const [field, battle] = item.actions
          const own = effectOf(field)
          const use = {
            field: own && own.name === names.get(item.id)?.singular ? own : undefined,
            battle: effectOf(battle),
          }
          if (use.field || use.battle) uses.set(item.id, use)
        }
      } catch {
        // A table that will not read leaves its items doing nothing.
      }
    }
  }
  return uses
}

/** A treasure in world units: its position the file's own, times {@link WORLD_SCALE}. */
function treasureInWorld(treasure: Treasure): Treasure {
  const at = treasure.position
  if (!at) return treasure
  return {
    ...treasure,
    position: { x: at.x * WORLD_SCALE, y: at.y * WORLD_SCALE, z: at.z * WORLD_SCALE },
  }
}

/** One event's messages in English, out of its own `/data/event/ev#####.gp2`. */
function eventMessagesOf(rom: Uint8Array, event: number): EventMessage[] {
  const name = `ev${String(event).padStart(5, '0')}`
  const { cat } = walkOnce(rom, [`/data/event/${name}.gp2`])
  for (const [archive, files] of cat.members) {
    if (!archive.toLowerCase().endsWith(`/${name}.gp2`)) continue
    for (const [file, bytes] of files) {
      if (!file.toLowerCase().endsWith(`${name}_en.bin`)) continue
      try {
        return readEventMessages(bytes)
      } catch {
        return []
      }
    }
  }
  return []
}

/** One event's script, out of its own `/data/event/ev#####.gp2`. */
function eventScriptOf(rom: Uint8Array, event: number): Script | undefined {
  const name = `ev${String(event).padStart(5, '0')}`
  const { cat } = walkOnce(rom, [`/data/event/${name}.gp2`])
  for (const [archive, files] of cat.members) {
    if (!archive.toLowerCase().endsWith(`/${name}.gp2`)) continue
    for (const [file, bytes] of files) {
      if (!file.toLowerCase().endsWith('.stb')) continue
      try {
        return readScript(bytes)
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

/** The stages worth stepping through in a map: where its cast's records start, and where its triggers do. */
function stagesWith(
  stages: readonly Stage[],
  triggers: readonly Trigger[],
  id: number | undefined,
): Stage[] {
  const found = new Map<string, Stage>()
  for (const stage of stages) found.set(`${stage.major}.${stage.minor}`, stage)
  for (const trigger of triggers) {
    if (id !== undefined && trigger.map !== id) continue
    found.set(`${trigger.from.major}.${trigger.from.minor}`, trigger.from)
  }
  return [...found.values()].sort(compareStages)
}

/** The `.npc` archive names worth looking for, longest first. */
function castArchives(map: string): string[] {
  const out = [map]
  for (let cut = map.length - 1; cut > 0; cut--) out.push(map.slice(0, cut))
  return out
}

/**
 * The cartridge's map index, by code — which gives a map its id, and so says
 * which of an area's cast stand in it.
 */
function indexOf(cat: Catalogue): (code: string) => MapEntry | undefined {
  for (const leaf of cat.other) {
    if (!leaf.path.toLowerCase().endsWith('maplist9.bin') || !isMapList(leaf.bytes)) continue
    try {
      const list = readMapList(leaf.bytes)
      return (code) => list.map(code.toUpperCase())
    } catch {
      // An index that will not read leaves every cast unnarrowed.
      return () => undefined
    }
  }
  return () => undefined
}

/**
 * A map's doorways, out of the `.bmbl` beside its geometry.
 *
 * The `.amdj` holds what a map looks like and the `.ambl` next to it holds what
 * it connects to. A map with no readable `.bmbl` is still walkable; it just has
 * no way out.
 */
function doorwaysOf(cat: Catalogue, code: string): readonly MapTransition[] {
  for (const [archive, files] of cat.members) {
    if (stemOf(archive) !== code.toLowerCase() || !archive.toLowerCase().endsWith('.ambl')) continue
    for (const [name, bytes] of files) {
      if (!name.toLowerCase().endsWith('.bmbl') || !isMapLinks(bytes)) continue
      try {
        return mapDoorways(bytes).map(doorwayInWorld)
      } catch {
        // A link table that will not walk leaves the map without doorways.
        return []
      }
    }
  }
  return []
}

/**
 * Where a map is walked into from outside it — how the first map opens, when
 * there is no doorway to arrive by.
 *
 * The cartridge's own start positions have not been found, so the map is
 * entered the way its neighbours bring you in: the arrival of a doorway, in some
 * other map's link table, that leads here. A map's own sub-maps are passed over
 * — `M01M02`'s way out into `M01` is the inn's door, not the village's entrance
 * — so the village opens where the road from the field puts you, and a room
 * where its door from outside does. Neighbours are taken in code order, so the
 * answer is reproducible. Undefined for a map nothing leads into.
 */
export function entranceOf(
  cat: Catalogue,
  code: string,
): { from: string; door: MapTransition } | undefined {
  const own = code.toLowerCase()
  const neighbours = [...cat.members]
    .filter(([archive]) => archive.toLowerCase().endsWith('.ambl'))
    .map(([archive, files]) => ({ stem: stemOf(archive), files }))
    .filter(({ stem }) => !stem.startsWith(own))
    .sort((a, b) => a.stem.localeCompare(b.stem))
  for (const { stem, files } of neighbours) {
    for (const [name, bytes] of files) {
      if (!name.toLowerCase().endsWith('.bmbl') || !isMapLinks(bytes)) continue
      try {
        const door = mapDoorways(bytes).find((d) => d.to.toLowerCase() === own)
        if (door) return { from: stem.toUpperCase(), door: doorwayInWorld(door) }
      } catch {
        // A link table that will not walk leads nowhere.
      }
    }
  }
  return undefined
}

/**
 * A doorway in world units: the file's own, times {@link WORLD_SCALE} — where
 * it stands, how big it is and where it puts you down alike. Angles have no
 * scale.
 *
 * A doorway was once the one thing left unshrunk while indoor maps took a
 * further eighth, which is what put indoor doorways in the middle of their
 * rooms and then their rooms' exits beyond their floors. Read at the same scale
 * as everything else, 85% of the cartridge's 677 indoor doorways stand just
 * inside their own room, and 91% just inside its collision.
 */
function doorwayInWorld(door: MapTransition): MapTransition {
  return {
    ...door,
    x: door.x * WORLD_SCALE,
    y: door.y * WORLD_SCALE,
    z: door.z * WORLD_SCALE,
    width: door.width * WORLD_SCALE,
    height: door.height * WORLD_SCALE,
    depth: door.depth * WORLD_SCALE,
    arriveX: door.arriveX * WORLD_SCALE,
    arriveY: door.arriveY * WORLD_SCALE,
    arriveZ: door.arriveZ * WORLD_SCALE,
  }
}

/** A character's placement in world units: the file's own, times {@link WORLD_SCALE}. */
function placementInWorld(placement: NpcPlacement): NpcPlacement {
  return {
    ...placement,
    x: placement.x * WORLD_SCALE,
    y: placement.y * WORLD_SCALE,
    z: placement.z * WORLD_SCALE,
  }
}

/** An archive's name without its directory or extension: `M01` for `/data/map/M01.amdj`. */
function stemOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return (dot < 0 ? name : name.slice(0, dot)).toLowerCase()
}

/**
 * The part of a load that does not depend on which map is opened.
 *
 * Walking the cartridge and cataloguing it is **1.4 of the 1.5 seconds** a load
 * takes — 0.6 in the walk and 0.9 in the classify — and none of it depends on
 * the map. The leaves are the same, the character parts are the same, and the
 * manifests are every map's, not one map's. Going through a doorway paid the
 * whole price again for every door, which is what made a doorway take seconds.
 *
 * Kept against the cartridge itself and **weakly**, so that closing one does not
 * hold 128 MiB alive, and by the paths walked, so that a caller narrowing them
 * gets its own walk rather than someone else's.
 */
interface Walk {
  readonly cat: Catalogue
  readonly parts: LibraryBuilder
  readonly manifests: ReadonlyMap<string, MapManifest>
}

const walked = new WeakMap<Uint8Array, Map<string, Walk>>()

function walkOnce(rom: Uint8Array, paths: readonly string[]): Walk {
  const key = paths.join('\u0000')
  let byPaths = walked.get(rom)
  if (!byPaths) {
    byPaths = new Map()
    walked.set(rom, byPaths)
  }
  const already = byPaths.get(key)
  if (already) return already

  const manifests = new Map<string, MapManifest>()
  const parts = library()
  // One walk, several filters: the scan takes a single substring, so the
  // narrowed paths are walked in turn and their leaves catalogued together.
  const leaves = []
  for (const path of paths) {
    for (const leaf of scanCartridge(rom, { pathFilter: path })) leaves.push(leaf)
  }
  const cat = catalogue(leaves, {
    classify: (leaf) => {
      // Observed, not claimed: a character part carries its own textures, so it
      // has to reach the catalogue as well as the part library.
      parts.offer(leaf.path, leaf.bytes)
      if (!isMapManifest(leaf.bytes)) return false
      try {
        manifests.set(leaf.archive, readMapManifest(leaf.bytes))
      } catch {
        // A descriptor that will not read leaves its map unassembled.
      }
      return true
    },
  })
  const fresh: Walk = { cat, parts, manifests }
  byPaths.set(key, fresh)
  return fresh
}

/**
 * The shared walk with one map's cast list folded in.
 *
 * A cast list is the one thing a load needs that *is* per map, and asking for
 * it by name costs a few milliseconds rather than the walk of the 35 MiB of
 * scenario data around it. Its archive carries no models, textures or
 * animations — `npc.bin` and `place.bin` — so only the members and the
 * unclaimed leaves have anything to add.
 */
function withCast(base: Catalogue, extra: Catalogue): Catalogue {
  if (extra.members.size === 0 && extra.other.length === 0) return base
  const members = new Map(base.members)
  for (const [archive, files] of extra.members) members.set(archive, files)
  return {
    models: base.models,
    textures: base.textures,
    animations: base.animations,
    members,
    other: [...base.other, ...extra.other],
  }
}

export function load(rom: Uint8Array, options: LoadOptions): Loaded {
  forgetSheets()
  const wanted = options.map.toLowerCase()

  options.onProgress?.('reading the cartridge…')

  const { cat: shared, parts, manifests } = walkOnce(rom, options.paths ?? SLICE_PATHS)
  // An interior takes its area's cast list, so every prefix of the name is
  // offered. This walk is kept too, so coming back through a door is free.
  const cast = walkOnce(
    rom,
    castArchives(options.map).map((code) => `/data/scenario/${code}.npc`),
  )
  const cat = withCast(shared, cast.cat)

  options.onProgress?.('assembling the map…')

  // By the archive's own name, not by a substring of its path: 'M01' appears in
  // 'B02M01.amdj' and a dozen others, and a plain substring match opens the
  // first of those instead of the village.
  const paths = [...manifests.keys()]
  const matching = [
    ...paths.filter((path) => stemOf(path) === wanted),
    ...paths.filter((path) => stemOf(path) !== wanted && stemOf(path).includes(wanted)),
  ]
  if (matching.length === 0) throw new Error(`no map matching '${options.map}' in this cartridge`)
  // A map can have more than one archive with a descriptor: `M01M12.ambl`'s
  // names only its textures, and `M01M12.amdj`'s its models. The one opened is
  // the first whose descriptor names a model that reads.
  let archive: string | undefined
  let map: AssembledMap | undefined
  for (const path of matching) {
    const manifest = manifests.get(path)
    const members = cat.members.get(path)
    if (!manifest || !members) continue
    const built = assembleMap(
      manifest,
      members,
      options.lighting === undefined ? {} : { lighting: options.lighting },
    )
    if (built.pieces.length === 0) continue
    archive = path
    map = built
    break
  }
  if (archive === undefined || map === undefined) {
    throw new Error(`'${matching[0]}' names no model that reads`)
  }

  const code = stemOf(archive).toUpperCase()
  const entry = indexOf(cat)(code)

  // A map's collision is all of its meshes; the village has thirteen, and any
  // one of them is a handful of triangles with nowhere to stand.
  const world = map.meshes.length > 0 ? createCollisionWorld(map.meshes) : undefined
  const above = world ? fx32(Math.round(world.bounds.maxY + FX32_ONE)) : fx32(0)
  const groundAt: GroundAt = (x, z) => {
    if (!world) return undefined
    const hit = groundBelow(
      world,
      fx32(Math.round(x * FX32_ONE)),
      fx32(Math.round(z * FX32_ONE)),
      above,
    )
    return hit ? toFloat(hit.y) : undefined
  }

  const figure = chooseFigure(parts)
  const area = areaOf(cat, code)
  const sheets = sheetsOf(cat)
  const id = entry?.id
  const talk = area ? talkOf(rom, area.code) : new Map<string, Map<number, readonly TalkLine[]>>()
  const triggers = area ? triggersOf(rom, area.code) : []
  const treasures = treasuresOf(rom, code)
  return {
    cast: castOf(cat, area, id, groundAt, sheets),
    treasures,
    props: propSprites(treasures, sheets),
    itemNames: itemNamesOf(rom),
    randoms: randomTreasureOf(rom),
    monsterNames: monsterNamesOf(rom),
    systemStrings: systemStringsOf(rom),
    monsterBattle: monsterBattleOf(rom),
    monsterCodes: monsterCodesOf(rom),
    monsterCodeOf: monsterCodeByNumberOf(rom),
    battleZones: battleEncountersOf(rom),
    fieldMonsters: fieldMonstersOf(rom),
    heroLevels: heroLevelsOf(rom),
    shops: shopsOf(rom),
    goods: goodsOf(rom),
    itemWords: itemWordsOf(rom),
    itemUses: itemUsesOf(rom),
    actions: actionsOf(rom),
    spellTable: spellTableOf(rom),
    battleWords: battleWordsOf(rom),
    menuWords: englishText(rom, '/data/bin/menu/str_tm.gp2', 'str_tm_en.nat', readSystemStrings),
    standardWords: englishText(rom, '/data/bin/strstd.gp2', 'strstd_en.nat', readSystemStrings),
    chests: chestModelsOf(
      [...cat.members].find(([path]) => path.toLowerCase() === CHEST_ARCHIVE)?.[1],
    ),
    shadow: shadowModelOf(
      [...cat.members].find(([path]) => path.toLowerCase() === SHADOW_ARCHIVE)?.[1],
    ),
    stages: stagesWith(area ? stagesOf(area, id) : [], triggers, id),
    castAt: (stage) => castOf(cat, area, id, groundAt, sheets, stage),
    letters: [...talk.keys()].sort(),
    linesOf: (who, letter) => talk.get(letter)?.get(who) ?? [],
    mapId: id,
    fieldZones: (id === undefined ? undefined : fieldEncountersOf(rom).get(id)) ?? [],
    triggers,
    eventMessages: (event) => eventMessagesOf(rom, event),
    eventScript: (event) => eventScriptOf(rom, event),
    catalogue: cat,
    map,
    world,
    figure,
    pieces: figurePieces(figure),
    doorways: doorwaysOf(cat, code),
    archive,
    code,
  }
}
