import {
  dressFigure,
  type Figure,
  type FigurePiece,
  figurePieces,
  type Library,
  type LibraryBuilder,
  library,
} from '@minstrel/actor'
import { type Catalogue, catalogue, scanCartridge } from '@minstrel/cartridge'
import { FX32_ONE, fx32, toFloat } from '@minstrel/fixed'
import {
  type Action,
  type ActionRange,
  type AttendingCharacter,
  type BattleZone,
  type CharacterPreset,
  type EventBattle,
  type EventMessage,
  type FieldMonster,
  type FieldZone,
  type Grammar,
  type ItemKind,
  type ItemName,
  isMapLinks,
  isMapList,
  isMapManifest,
  isNpcList,
  isNpcPlacements,
  itemPrice,
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
  readAttendingCharacters,
  readBattleEncounters,
  readCharacterPresets,
  readEventBattles,
  readEventMessages,
  readFieldEncounters,
  readFieldMonsters,
  readItemBattleParams,
  readItemKinds,
  readItemNames,
  readItemStats,
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
  readSkillTable,
  readSpellTable,
  readSystemStrings,
  readTableMessages,
  readTalk,
  readTreasure,
  readTriggers,
  readVocationTrees,
  readWeightTables,
  type Script,
  type Shop,
  type SkillPanel,
  type SpellTable,
  type TalkLine,
  type Treasure,
  type Trigger,
  type VocationTrees,
  type WeightTables,
} from '@minstrel/game-formats'
import { decompressBlz, looksBlz } from '@minstrel/nitro-comp'
import type { Model } from '@minstrel/nitro-gfx'
import { parseRomHeader } from '@minstrel/nitrofs'
import { type CollisionWorld, createCollisionWorld, groundBelow, PERSON } from '@minstrel/sim'
import { type AssembledMap, assembleMap, type MapLighting, WORLD_SCALE } from '@minstrel/world'
import type { BattleWords } from './battle-scene.ts'
import { type Cast, cast, forgetSheets, type GroundAt } from './cast.ts'
import { CHEST_ARCHIVE, type ChestLook, chestModelsOf } from './chests.ts'
import { heroOutfit, LEVELS_FOLDER } from './hero.ts'
import { type Prop, propSprites } from './pots.ts'
import { SHADOW_ARCHIVE, shadowModelOf } from './shadows.ts'
import { type SlidingPiece, slidingPieces } from './slide.ts'

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
  /** The parts the Hero is dressed from, to dress them again in what they wear — see `outfitOf`. */
  readonly wardrobe: Library
  /** The ready-made characters — see `readCharacterPresets`. */
  readonly presets: readonly CharacterPreset[]
  readonly pieces: readonly FigurePiece[]
  /** Who else stands in this map. */
  readonly cast: Cast
  /**
   * The story stages this map's cast records start at, earliest first, for
   * flicking through where characters stand. What a stage is in the game is
   * not established — see {@link Stage}.
   */
  readonly stages: readonly Stage[]
  /**
   * The cast at one of {@link stages} — and at a step of it, given one;
   * `undefined` is the file's first placement of each.
   */
  castAt(stage: Stage | undefined, step?: number): Cast
  /** The map's pieces that slide as their character's place moves — see `slide.ts`. */
  readonly slides: readonly SlidingPiece[]
  /** The chapter letters this map's area has talk for, in order — `A0`, `B0` … */
  readonly letters: readonly string[]
  /** What a character says in a chapter — see `readTalk`. Empty when they say nothing. */
  linesOf(id: number, letter: string): readonly TalkLine[]
  /** The map's own id in the index, which is how triggers and the cast name it. */
  readonly mapId: number | undefined
  /** The region the index puts it in — "Angel Falls" — which the map's corner names in its tab. */
  readonly region: string | undefined
  /**
   * The region's outside — the map the index labels "Exterior" in it, `D01`
   * for the Hexagon's rooms — where Evac takes the Hero; undefined where the
   * region has none, or this is it. Ours: which map Evac chooses is not read.
   */
  readonly regionExterior: string | undefined
  /** The track that plays here, an index into `bgm.sdat`'s sequences — see `MapEntry.music`. */
  readonly music: number | undefined
  /**
   * The vocations' skill trees, out of the ARM9 binary unpacked — see
   * `readVocationTrees`; undefined when the binary will not unpack or holds
   * no such table. Which vocations may wield a weapon or shield follows.
   */
  readonly vocationTrees: VocationTrees | undefined
  /**
   * The weights a monster's six ways are drawn by, out of the ARM9 binary —
   * see `readWeightTables`: the even table first, the falling one second;
   * undefined when the binary will not unpack or holds no run.
   */
  readonly weightTables: WeightTables | undefined
  /**
   * The 287 skill panels — see `readSkillTable`. What a point buys, and the
   * contents the trees above are only the numbers of. Empty when
   * `/data/prm/skilltable.bin` is not on this cartridge or will not read.
   */
  readonly skillPanels: readonly SkillPanel[]
  /**
   * The skill screen's words in English: the trees' names by number, the
   * panels' short labels by panel id, and `str_gskl`'s sentences. See
   * `skillWordsOf`. Empty maps where a file did not read.
   */
  readonly skillWords: SkillWords
  /** The ordinary battle stages' track, and this dungeon's boss stage's — see `musicOf`. */
  readonly battleMusic: number | undefined
  readonly bossMusic: number | undefined
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
  /** The set battles, by the index a trigger's battle word names — see `readEventBattles`. */
  readonly eventBattles: ReadonlyMap<number, EventBattle>
  /** How each monster goes about the field, by number — see `readFieldMonsters`. */
  readonly fieldMonsters: ReadonlyMap<number, FieldMonster>
  /**
   * Every vocation's level table, by its number — see `hero.ts`. The cartridge
   * has thirteen, `level0` to `level12`, and until a party could hold more
   * than one vocation only the Minstrel's was read. One that will not read is
   * absent rather than empty.
   */
  readonly levels: ReadonlyMap<number, LevelTable>
  /** What each shop sells, by the number a talk line's `<SHOP=n>` names — see `readShops`. */
  readonly shops: ReadonlyMap<number, Shop>
  /** Who goes along with the Hero for a stretch, in English — see `readAttendingCharacters`. Empty when it will not read. */
  readonly attending: readonly AttendingCharacter[]
  /** A map's code by its own id — how a trigger names where the story goes on. */
  mapCodeOf(id: number): string | undefined
  /**
   * What each worn thing adds to a resistance, by item id — see
   * `readItemBattleParams`. Whatever is not listed adds nothing.
   */
  readonly itemResistances: ReadonlyMap<number, readonly number[]>
  /** Each item's price and the table it is listed in — see `readItemTable`. */
  readonly goods: ReadonlyMap<number, Goods>
  /** Each piece of equipment's attack and defence, by id — see `itemStatsOf`. */
  readonly itemStats: ReadonlyMap<number, ItemNumbers>
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
  /**
   * Each item's description in English, by id — `itemexpl_en.nat`, which
   * `readSystemStrings` reads as it reads the menu's words. Markup and all.
   */
  readonly itemDescriptions: ReadonlyMap<number, string>
  /** Each item's category and subtype, by id — see `readItemKinds`. Empty when it will not read. */
  readonly itemKinds: ReadonlyMap<number, ItemKind>
  /** The engine's standard messages in English, `strstd`, by number — 57 a head banged on the ceiling. */
  readonly standardWords: ReadonlyMap<number, string>
  /** An event's messages in English, read the first time they are asked for. */
  eventMessages(event: number): readonly EventMessage[]
  /** An event's script — see `readScript` and `event.ts`. Undefined when it will not read. */
  eventScript(event: number): Script | undefined
  /**
   * The characters' `.spr` sheets, by name without the extension — see
   * `sheetFor` in `cast.ts`. What an event's `566(3, file, …)` names.
   */
  readonly sheets: ReadonlyMap<string, Uint8Array>
  /** The way out: where this map's doorways are and what they lead to. */
  readonly doorways: readonly MapTransition[]
  /** Which archive the map came out of, for the status line. */
  readonly archive: string
  /** The map's own code, which is what a doorway names. */
  readonly code: string
}

/** An item as the shop and the equip panel need it: its prices, and its table's letter — `w` weapons … */
export interface Goods {
  /** What a shop asks for it — see `itemPrice`. */
  readonly price: number
  /** What a shop gives for it — see `ItemRecord.price`; 0 for what no shop buys. */
  readonly sells: number
  readonly table: string
  /** The rarity, 0 to 5 — see `ItemRecord.rarity`, INFERRED. */
  readonly rarity: number
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
  /** How it opens: the `actmsg` said first, 0 for none — see `Action.opening`. INFERRED. */
  readonly opening: number
  /** Its cost in MP; 255 for all there is. INFERRED. */
  readonly cost: number
  /** Whom it reaches — see `ActionReach`. INFERRED. */
  readonly reach: number
  /**
   * What the battle's rolls read of it — each from the game's code; see
   * game-formats' `Action`: a monster's chance with it, whether that chance is
   * its accuracy (it scales) and so whether it lands, whether it can be dodged,
   * whether a cast can go haywire, the levels it moves, and what rides on its
   * blow.
   */
  readonly rolls: {
    readonly foeChance: number
    readonly chanceIsAccuracy: boolean
    readonly evadable: boolean
    /** Whether a target's guard halves it — see `Action.defendable`. */
    readonly defendable: boolean
    readonly haywire: boolean
    /** Its record's `criticalPercent`: what multiplies a caster's chance of going haywire. */
    readonly criticalPercent: number
    readonly levels: number
    readonly rider: number
    /** The element of what it deals, the element its landing is resisted by, and its cap. */
    readonly element: number
    readonly landingElement: number
    readonly cap: number
  }
  /**
   * The range the party draws from, when it has one. `base` is the party's
   * least, which is what is used outside a battle (ours); `party` is what the
   * battle makes one of the party's amount from, the game's way — the least
   * and the most, and the number it scales by where the action names one. See
   * the sim's `partyAmount`.
   */
  readonly range:
    | {
        readonly base: number
        readonly spread: number
        readonly party: {
          readonly min: number
          readonly max: number
          readonly scales?: {
            readonly by: 'might' | 'mending'
            readonly lo: number
            readonly hi: number
          }
        }
      }
    | undefined
  /**
   * The range a monster draws from: the range's own base — read from the
   * game's `GetAttackBaseDamage`; see `ActionRange.base`. Crack's is 17, the
   * party's least 30.
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

/**
 * Whether the step falls in a gap a character's records leave inside one
 * sub-stage — one ending before it, the next beginning after — where they
 * stand at their header. INFERRED, and thin: 19 such gaps on the cartridge,
 * nearly all between records that say nowhere. The Hexagon's `204` has one
 * over steps 2 and 3 of 2.4, when it is talked to, and the event that opens
 * step 2, `ev02500`, stands its figure on the header's spot to 0.01. The next,
 * `ev02510`, walks it to (−11.74, 11.23) in the file's units, which is not
 * followed: which of an event's actors is which of the cast is not read.
 */
function inStepGap(
  states: readonly NpcState[],
  header: NpcPlacement,
  stage: Stage,
  step: number | undefined,
): boolean {
  if (step === undefined) return false
  const mine = states.filter((state) => state.id === header.id && state.map === header.map)
  const endsBefore = mine.some(
    (state) => compareStages(spanOf(state).to, stage) === 0 && (state.unknown_0x08[5] ?? 0) < step,
  )
  const beginsAfter = mine.some(
    (state) =>
      compareStages(spanOf(state).from, stage) === 0 && (state.unknown_0x08[2] ?? 0) > step,
  )
  return endsBefore && beginsAfter && !mine.some((state) => stateCovers(state, stage, step))
}

/**
 * Whether a state's span covers the stage — and, given a step, that step of
 * it: words 2 and 5 are the span's first and last step. INFERRED: within one
 * sub-stage the first is at or before the last on 362 of 362, and where a
 * character's next state begins in the sub-stage the last ends in, it begins
 * one step on 121 of 179, against 17 for two. The Hexagon's `202` stands
 * aside from step 5 of 2.4.
 */
function stateCovers(state: NpcState, stage: Stage, step: number | undefined): boolean {
  const words = state.unknown_0x08
  const { from, to } = spanOf(state)
  if (compareStages(from, stage) > 0 || compareStages(stage, to) > 0) return false
  if (step === undefined) return true
  if (compareStages(from, stage) === 0 && step < (words[2] ?? 0)) return false
  if (compareStages(stage, to) === 0 && step > (words[5] ?? 0)) return false
  return true
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
 * the stage — and the step, given one, see `stateCovers` — and a character
 * whose records none of them do is not here. **A character with no records at
 * all stands where the header puts them**, at every stage.
 *
 * INFERRED, that last: of the cartridge's character records that talk to
 * someone, 596 talk to a character with no records whose header is in that
 * map, against 1,245 over a record with a place. In Angel Falls it adds one
 * thing to examine; in the Hexagon, the switch on its first floor, `201`. A
 * record that says nowhere is not the header's place: taken so, Angel Falls
 * would have 27 more at every stage — Patty's model in the village at 2.1, a
 * second Ivor at 2.3 while he follows the Hero.
 */
function castOf(
  cat: Catalogue,
  area: Area | undefined,
  id: number | undefined,
  groundAt: GroundAt,
  sheets: ReadonlyMap<string, Uint8Array>,
  stage?: Stage,
  step?: number,
): Cast {
  if (!area) return NOBODY
  const placed: { entry: NpcEntry; placement: NpcPlacement }[] = []
  if (stage === undefined) {
    for (const found of placeNpcs(area.entries, area.placements.map(placementInWorld))) {
      if (id === undefined || found.placement.map === id) placed.push(found)
    }
  } else {
    const byId = new Map(area.entries.map((entry) => [entry.id, entry]))
    const recorded = new Set(area.states.map((state) => state.id))
    const seen = new Set<number>()
    for (const state of area.states) {
      if (seen.has(state.id)) continue
      if (id !== undefined && state.map !== id) continue
      if (!stateCovers(state, stage, step)) continue
      const entry = byId.get(state.id)
      if (!entry) continue
      if (!state.position) continue
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
    for (const header of area.placements) {
      if (seen.has(header.id)) continue
      if (id !== undefined && header.map !== id) continue
      if (recorded.has(header.id) && !inStepGap(area.states, header, stage, step)) continue
      const entry = byId.get(header.id)
      if (!entry) continue
      seen.add(header.id)
      placed.push({ entry, placement: placementInWorld(header) })
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
/** What a worn thing does in a battle — see `readItemBattleParams`. */
const ITEM_BATTLE = '/data/prm/itembtlprm.nat'
const battleRead = new WeakMap<Uint8Array, Map<number, MonsterBattle>>()

/** What each worn thing does in a battle, by item — see `readItemBattleParams`. */
const itemBattleRead = new WeakMap<Uint8Array, Map<number, readonly number[]>>()

/**
 * What each item adds to a resistance, by item id — `itembtlprm.nat`, which
 * the game looks a worn thing up in and whose twenty numbers it sums onto a
 * hundred (`wornResistances`). Empty when the file will not read.
 */
function itemBattleOf(rom: Uint8Array): Map<number, readonly number[]> {
  const already = itemBattleRead.get(rom)
  if (already) return already
  const byItem = new Map<number, readonly number[]>()
  for (const leaf of scanCartridge(rom, { pathFilter: ITEM_BATTLE })) {
    if (leaf.path !== ITEM_BATTLE) continue
    try {
      for (const item of readItemBattleParams(leaf.bytes)) byItem.set(item.id, item.resistances)
    } catch {
      // A file that will not read leaves everyone's resistances whole.
    }
  }
  itemBattleRead.set(rom, byItem)
  return byItem
}

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

/** The set battles, by index — see `readEventBattles`. Empty when the file will not read. */
function eventBattlesOf(rom: Uint8Array): ReadonlyMap<number, EventBattle> {
  const bytes = looseFile(rom, '/data/event/eventbattle.bin')
  try {
    return new Map((bytes ? readEventBattles(bytes) : []).map((battle) => [battle.index, battle]))
  } catch {
    return new Map()
  }
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
/** Each item's category and subtype, from `itemsort_en.bin` — empty when it will not read. */
function itemKindsOf(rom: Uint8Array): ReadonlyMap<number, ItemKind> {
  const { cat } = walkOnce(rom, ['/data/prm/itemsort.gp2'])
  for (const [, files] of cat.members) {
    for (const [name, bytes] of files) {
      if (!name.toLowerCase().endsWith('itemsort_en.bin')) continue
      try {
        return readItemKinds(bytes)
      } catch {
        return new Map()
      }
    }
  }
  return new Map()
}

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

/** The level tables read so far, by cartridge: loose files, not archive members. */
const levelsRead = new WeakMap<Uint8Array, ReadonlyMap<number, LevelTable>>()

/** Every vocation's level table, by number — `/data/prm/level<n>.bin`. Read once. */
function levelsOf(rom: Uint8Array): ReadonlyMap<number, LevelTable> {
  const already = levelsRead.get(rom)
  if (already) return already
  const tables = new Map<number, LevelTable>()
  for (const leaf of scanCartridge(rom, { pathFilter: LEVELS_FOLDER })) {
    const named = /\/level(\d+)\.bin$/i.exec(leaf.path)
    if (!named) continue
    try {
      tables.set(Number(named[1]), readLevelTable(leaf.bytes))
    } catch {
      // A table that will not read leaves that vocation without numbers.
    }
  }
  levelsRead.set(rom, tables)
  return tables
}

/** The shop table: a loose file, beside the menus. */
const ATTENDING_TABLE = '/data/bin/attnpc.gp2'
const attendingRead = new WeakMap<Uint8Array, readonly AttendingCharacter[]>()

/** Who goes along with the Hero, in English — see `companion.ts`. Read once. */
function attendingOf(rom: Uint8Array): readonly AttendingCharacter[] {
  const already = attendingRead.get(rom)
  if (already) return already
  let found: readonly AttendingCharacter[] = []
  for (const leaf of scanCartridge(rom, { pathFilter: ATTENDING_TABLE })) {
    if (!leaf.path.endsWith('attnpc_en.bin')) continue
    try {
      found = readAttendingCharacters(leaf.bytes)
    } catch {
      // A table that will not read leaves the Hero to go alone.
    }
  }
  attendingRead.set(rom, found)
  return found
}

const PRESETS_FILE = '/data/bin/charapreset.bin'
const presetsRead = new WeakMap<Uint8Array, readonly CharacterPreset[]>()

/**
 * The ready-made characters — see `readCharacterPresets`. Empty when the file
 * will not read, which leaves nobody to dress from one.
 */
function presetsOf(rom: Uint8Array): readonly CharacterPreset[] {
  const already = presetsRead.get(rom)
  if (already) return already
  let found: readonly CharacterPreset[] = []
  for (const leaf of scanCartridge(rom, { pathFilter: PRESETS_FILE })) {
    if (leaf.path !== PRESETS_FILE) continue
    try {
      found = readCharacterPresets(leaf.bytes)
    } catch {
      // A file that will not read leaves nobody to dress from a preset.
    }
  }
  presetsRead.set(rom, found)
  return found
}

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
        for (const item of readItemTable(bytes))
          goods.set(item.id, {
            price: itemPrice(item),
            sells: item.price,
            table,
            rarity: item.rarity,
          })
      } catch {
        // A table that will not read prices nothing in it.
      }
    }
  }
  goodsRead.set(rom, goods)
  return goods
}

/** A piece of equipment's own numbers — see `readItemStats`. INFERRED, as that reading is. */
export interface ItemNumbers {
  readonly attack: number
  readonly defence: number
  readonly agility: number
  /** Its chance of blocking, in tenths of a hundredth — a shield's; see `ItemStats.block`. */
  readonly block: number
  /**
   * Who may wear it: bit v − 1 for vocation v in the level tables' order —
   * see `ItemStats.usedBy`, INFERRED. 0 on weapons and shields, whose use
   * goes by the vocations' weapon skills — see `Loaded.vocationTrees`.
   */
  readonly usedBy: number
  /** Its kind: a weapon's subtype plus one, 13 a shield, 0 the rest — the skill tree's number. See `ItemStats.kind`. */
  readonly kind: number
  /** Which sexes may wear it: bit 0 sex 0, bit 1 sex 1 — see `ItemStats.wornBySex`. */
  readonly wornBySex: number
  /** Whether accessory 18048 cannot lift its sex restriction — see `ItemStats.sexLock`. */
  readonly sexLock: boolean
}

const statsRead = new WeakMap<Uint8Array, Map<number, ItemNumbers>>()

/**
 * Each piece of equipment's attack and defence, by id, from the English item
 * tables — see `readItemStats`. An entry is matched to its item by the name
 * that labels it, within its own category; a table whose names are not one to
 * an entry, or that has no stats — the tools — adds nothing.
 */
function itemStatsOf(rom: Uint8Array): Map<number, ItemNumbers> {
  const already = statsRead.get(rom)
  if (already) return already
  const names = itemNamesOf(rom)
  const { cat } = walkOnce(rom, ['/data/prm/itemdt_'])
  const stats = new Map<number, ItemNumbers>()
  for (const [, files] of cat.members) {
    for (const [name, bytes] of files) {
      if (!/itemdt_[a-z]_en\.nat$/i.test(name)) continue
      let entries: ReturnType<typeof readItemStats>
      let ids: number[]
      try {
        entries = readItemStats(bytes)
        ids = readItemTable(bytes).map((record) => record.id)
      } catch {
        continue
      }
      const idsByName = new Map<string, number[]>()
      for (const id of ids) {
        const own = names.get(id)
        if (own !== undefined) idsByName.set(own, [...(idsByName.get(own) ?? []), id])
      }
      for (const entry of entries) {
        if (entry.name === undefined) continue
        for (const id of idsByName.get(entry.name) ?? []) {
          stats.set(id, {
            attack: entry.attack,
            defence: entry.defence,
            agility: entry.agility,
            block: entry.block,
            usedBy: entry.usedBy,
            kind: entry.kind,
            wornBySex: entry.wornBySex,
            sexLock: entry.sexLock,
          })
        }
      }
    }
  }
  statsRead.set(rom, stats)
  return stats
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
        opening: action.opening,
        cost: action.cost,
        reach: action.reach,
        rolls: {
          foeChance: action.foeChance,
          chanceIsAccuracy: action.accuracyMode === 1,
          evadable: action.evadable,
          defendable: action.defendable,
          haywire: action.criticalPercent > 0,
          criticalPercent: action.criticalPercent,
          levels: action.levels,
          rider: action.rider,
          element: action.element,
          landingElement: action.landingElement,
          cap: action.damageCap,
        },
        // The party's amount: the Hero is who uses these — see `ActionRange.party`.
        range: range && {
          base: range.party,
          spread: range.spread,
          party: {
            min: range.party,
            max: range.peak,
            // Only an action whose record says its amount scales, and by what.
            ...(action.amountScales && action.scalesBy
              ? { scales: { by: action.scalesBy, ...action.scaleRange } }
              : {}),
          },
        },
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

/**
 * Where events are kept: each in its own `ev#####.gp2`, in one folder or the
 * other. `/data/event` holds 523 and `/data/evspt_lv5` 164 — 21500 to 29791,
 * the Angel Falls statue scene `ev22590` and Patty's `ev22510` among them —
 * no number in both, and every one packed the same way: a script and its
 * text in each language. See game-formats' FORMAT.md, "Event text".
 */
const EVENT_FOLDERS = ['/data/event', '/data/evspt_lv5'] as const

/** An event's own archive's files, from whichever folder has it; undefined when neither does. */
function eventFilesOf(
  rom: Uint8Array,
  event: number,
): { name: string; files: ReadonlyMap<string, Uint8Array> } | undefined {
  const name = `ev${String(event).padStart(5, '0')}`
  const { cat } = walkOnce(
    rom,
    EVENT_FOLDERS.map((folder) => `${folder}/${name}.gp2`),
  )
  for (const [archive, files] of cat.members) {
    if (archive.toLowerCase().endsWith(`/${name}.gp2`)) return { name, files }
  }
  return undefined
}

/** One event's messages in English, out of its own `ev#####.gp2` — see {@link EVENT_FOLDERS}. */
function eventMessagesOf(rom: Uint8Array, event: number): EventMessage[] {
  const found = eventFilesOf(rom, event)
  if (!found) return []
  for (const [file, bytes] of found.files) {
    if (!file.toLowerCase().endsWith(`${found.name}_en.bin`)) continue
    try {
      return readEventMessages(bytes)
    } catch {
      return []
    }
  }
  return []
}

/** One event's script, out of its own `ev#####.gp2` — see {@link EVENT_FOLDERS}. */
function eventScriptOf(rom: Uint8Array, event: number): Script | undefined {
  const found = eventFilesOf(rom, event)
  if (!found) return undefined
  for (const [file, bytes] of found.files) {
    if (!file.toLowerCase().endsWith('.stb')) continue
    try {
      return readScript(bytes)
    } catch {
      return undefined
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
 * The tracks a map calls for, out of the index: its own (`MapEntry.music`,
 * INFERRED there); the ordinary battle stages' — every `B01` stage names the
 * one track, 23, and which stage a field's battle is fought on is not read;
 * and its dungeon's boss stage's — the `B` map whose label opens with the
 * map's code's first three letters, "D01 - Hexagoon" for the Hexagon's.
 */
function musicOf(
  cat: Catalogue,
  code: string,
): Pick<Loaded, 'music' | 'battleMusic' | 'bossMusic'> {
  const none = { music: undefined, battleMusic: undefined, bossMusic: undefined }
  for (const leaf of cat.other) {
    if (!leaf.path.toLowerCase().endsWith('maplist9.bin') || !isMapList(leaf.bytes)) continue
    try {
      const list = readMapList(leaf.bytes)
      const own = list.map(code.toUpperCase())?.music
      const stages = list.maps.filter((e) => e.id !== 0 && e.code.startsWith('B01'))
      const shared = new Set(stages.map((e) => e.music))
      const dungeon = `${code.toUpperCase().slice(0, 3)} - `
      const boss = list.maps.find(
        (e) => e.id !== 0 && e.code.startsWith('B') && e.label?.startsWith(dungeon),
      )
      return {
        music: own === undefined || own === 0 ? undefined : own,
        battleMusic: shared.size === 1 ? stages[0]?.music : undefined,
        bossMusic: boss?.music,
      }
    } catch {
      return none
    }
  }
  return none
}

/**
 * A region's name without its floor: the index names the Hexagon's rooms
 * "The Hexagon - B1", "The Hexagon - Lv 1", and the village's houses plainly
 * "Angel Falls" — the part before " - " is the place. INFERRED, thin.
 */
function regionHead(region: string | undefined): string | undefined {
  return region?.split(' - ')[0]?.trim()
}

/** The map labelled "Exterior" in a map's place, when that is another map — see `Loaded.regionExterior`. */
function exteriorOf(cat: Catalogue, code: string): string | undefined {
  for (const leaf of cat.other) {
    if (!leaf.path.toLowerCase().endsWith('maplist9.bin') || !isMapList(leaf.bytes)) continue
    try {
      const list = readMapList(leaf.bytes)
      const own = list.map(code.toUpperCase())
      const place = regionHead(own?.region)
      if (!own || !place) return undefined
      const outside = list.maps.find(
        (entry) =>
          entry.id !== 0 && entry.label === 'Exterior' && regionHead(entry.region) === place,
      )
      return outside && outside.code !== own.code ? outside.code : undefined
    } catch {
      return undefined
    }
  }
  return undefined
}

/** The ARM9 binary unpacked once, by cartridge: the header says where it lies, and it is BLZ-packed. */
const arm9Read = new WeakMap<Uint8Array, Uint8Array | undefined>()
function arm9Of(rom: Uint8Array): Uint8Array | undefined {
  if (arm9Read.has(rom)) return arm9Read.get(rom)
  let binary: Uint8Array | undefined
  try {
    const header = parseRomHeader(rom)
    const packed = rom.subarray(header.arm9.romOffset, header.arm9.romOffset + header.arm9.size)
    binary = looksBlz(packed) ? decompressBlz(packed) : packed
  } catch {
    // A binary that will not unpack holds nothing to read.
  }
  arm9Read.set(rom, binary)
  return binary
}

/** The skill trees read once from the ARM9 binary, by cartridge. */
const treesRead = new WeakMap<Uint8Array, VocationTrees | undefined>()

/** The vocations' skill trees out of the ARM9 binary — see game-formats' FORMAT.md, "Vocation skill trees". */
function vocationTreesOf(rom: Uint8Array): VocationTrees | undefined {
  if (treesRead.has(rom)) return treesRead.get(rom)
  let trees: VocationTrees | undefined
  try {
    const binary = arm9Of(rom)
    trees = binary ? readVocationTrees(binary) : undefined
  } catch {
    // A binary that holds no table leaves the weapons' "Used by" unsaid.
  }
  treesRead.set(rom, trees)
  return trees
}

/** Where the skill panels are — a loose file beside the parameter tables. */
const SKILL_TABLE = '/data/prm/skilltable.bin'

const panelsRead = new WeakMap<Uint8Array, readonly SkillPanel[]>()

/**
 * The skill panels — `/data/prm/skilltable.bin`, see `readSkillTable`. Empty
 * where the file is not there or will not read, which leaves the skill screen
 * with trees it can name and no contents.
 */
function skillPanelsOf(rom: Uint8Array): readonly SkillPanel[] {
  const already = panelsRead.get(rom)
  if (already) return already
  let panels: readonly SkillPanel[] = []
  for (const leaf of scanCartridge(rom, { pathFilter: SKILL_TABLE })) {
    if (leaf.path !== SKILL_TABLE) continue
    try {
      panels = readSkillTable(leaf.bytes)
    } catch {
      // A table that will not read leaves every tree empty.
    }
  }
  panelsRead.set(rom, panels)
  return panels
}

/** The skill screen's words — see {@link Loaded.skillWords}. */
export interface SkillWords {
  /**
   * The trees' names by tree number, 1 to 26 — `str_sklc`, **which numbers
   * them exactly as the panels do**: 1 "Sword Skill" to 14 "Fisticuffs
   * Skill", then 15 "Courage" to 26 "Ruggedness", the vocations' own.
   */
  readonly trees: ReadonlyMap<number, string>
  /** Each panel's short label by its id, 0 to 286 — `sta_skl`, the menu's own. */
  readonly panels: ReadonlyMap<number, string>
  /**
   * `str_gskl`: 1 to 22 the sentence a panel says when it is bought, 101 to
   * 114 the weapon nouns and 202 to 216 the stat nouns it substitutes — see
   * `GSKL_WEAPON_NOUN` and `GSKL_STAT_NOUN`.
   */
  readonly said: ReadonlyMap<number, string>
}

/** `str_sklc`, `sta_skl` and `str_gskl` are each a table of `0x67` (number, string) records. */
const SKILL_STRING_TAG = 0x67

/** The skill screen's words in English — see {@link SkillWords}. */
function skillWordsOf(rom: Uint8Array): SkillWords {
  const strings = (archive: string, member: string) =>
    englishText(rom, archive, member, (bytes) =>
      messagesBy(readTableMessages(bytes, SKILL_STRING_TAG)),
    )
  return {
    trees: strings('/data/bin/str_sklc.gp2', 'str_sklc_en.bin'),
    panels: strings('/data/bin/menu/sta_skl.gp2', 'sta_skl_en.bin'),
    said: strings('/data/prm/str_gskl.gp2', 'str_gskl_en.bin'),
  }
}

/** The weight tables read once from the ARM9 binary, by cartridge. */
const weightsRead = new WeakMap<Uint8Array, WeightTables | undefined>()

/** The monsters' weight tables out of the ARM9 binary — see game-formats' FORMAT.md, "Battle weight tables". */
function weightTablesOf(rom: Uint8Array): WeightTables | undefined {
  if (weightsRead.has(rom)) return weightsRead.get(rom)
  let tables: WeightTables | undefined
  try {
    const binary = arm9Of(rom)
    tables = binary ? readWeightTables(binary) : undefined
  } catch {
    // A binary that holds no run leaves the rules' own even table in force.
  }
  weightsRead.set(rom, tables)
  return tables
}

/** The same index the other way round: a map's code by its own id, which is how a trigger names a map. */
function codeOf(cat: Catalogue): (id: number) => string | undefined {
  for (const leaf of cat.other) {
    if (!leaf.path.toLowerCase().endsWith('maplist9.bin') || !isMapList(leaf.bytes)) continue
    try {
      const byId = new Map(
        readMapList(leaf.bytes)
          .maps.filter((entry) => entry.id !== 0)
          .map((entry) => [entry.id, entry.code]),
      )
      return (id) => byId.get(id)
    } catch {
      // An index that will not read names no map.
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
        const found = readMapManifest(leaf.bytes)
        // **An archive may hold more than one descriptor, and the map's own is
        // the one that describes the map.** Six of the cartridge's 1,348 do,
        // and keying this by archive alone meant the last one seen won — not a
        // decision, an overwrite.
        //
        // For five of the six that came to the same thing. For `M12` it did
        // not: Wormwood Creek's outdoor map is described by `M12M0000.bmdj`
        // with 24 resources, and `M12M0001.bmdj` with one sits after it in the
        // archive. The map assembled from that one — a single piece, no
        // collision, and so nowhere to stand — and never came up.
        //
        // Counting resources is a rule about the data rather than about the
        // names, which vary; it agrees with what was already being picked
        // everywhere but `M12`.
        const already = manifests.get(leaf.archive)
        if (!already || found.resources.length > already.resources.length) {
          manifests.set(leaf.archive, found)
        }
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

  const figure = dressFigure(parts, heroOutfit())
  const area = areaOf(cat, code)
  const sheets = sheetsOf(cat)
  const id = entry?.id
  const tracks = musicOf(cat, code)
  const talk = area ? talkOf(rom, area.code) : new Map<string, Map<number, readonly TalkLine[]>>()
  const triggers = area ? triggersOf(rom, area.code) : []
  const treasures = treasuresOf(rom, code)
  return {
    cast: castOf(cat, area, id, groundAt, sheets),
    sheets,
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
    eventBattles: eventBattlesOf(rom),
    fieldMonsters: fieldMonstersOf(rom),
    levels: levelsOf(rom),
    shops: shopsOf(rom),
    attending: attendingOf(rom),
    presets: presetsOf(rom),
    mapCodeOf: codeOf(cat),
    goods: goodsOf(rom),
    itemResistances: itemBattleOf(rom),
    itemStats: itemStatsOf(rom),
    itemWords: itemWordsOf(rom),
    itemUses: itemUsesOf(rom),
    actions: actionsOf(rom),
    spellTable: spellTableOf(rom),
    battleWords: battleWordsOf(rom),
    menuWords: englishText(rom, '/data/bin/menu/str_tm.gp2', 'str_tm_en.nat', readSystemStrings),
    itemDescriptions: englishText(
      rom,
      '/data/prm/itemexpl.gp2',
      'itemexpl_en.nat',
      readSystemStrings,
    ),
    itemKinds: itemKindsOf(rom),
    standardWords: englishText(rom, '/data/bin/strstd.gp2', 'strstd_en.nat', readSystemStrings),
    chests: chestModelsOf(
      [...cat.members].find(([path]) => path.toLowerCase() === CHEST_ARCHIVE)?.[1],
    ),
    shadow: shadowModelOf(
      [...cat.members].find(([path]) => path.toLowerCase() === SHADOW_ARCHIVE)?.[1],
    ),
    stages: stagesWith(area ? stagesOf(area, id) : [], triggers, id),
    castAt: (stage, step) => castOf(cat, area, id, groundAt, sheets, stage, step),
    slides: slidingPieces(
      map,
      (area?.states ?? []).flatMap((state) =>
        state.position && state.map === id
          ? [
              {
                id: state.id,
                x: state.position.x * WORLD_SCALE,
                z: state.position.z * WORLD_SCALE,
              },
            ]
          : [],
      ),
    ),
    letters: [...talk.keys()].sort(),
    linesOf: (who, letter) => talk.get(letter)?.get(who) ?? [],
    mapId: id,
    vocationTrees: vocationTreesOf(rom),
    weightTables: weightTablesOf(rom),
    skillPanels: skillPanelsOf(rom),
    skillWords: skillWordsOf(rom),
    region: regionHead(entry?.region),
    regionExterior: exteriorOf(cat, code),
    ...tracks,
    fieldZones: (id === undefined ? undefined : fieldEncountersOf(rom).get(id)) ?? [],
    triggers,
    eventMessages: (event) => eventMessagesOf(rom, event),
    eventScript: (event) => eventScriptOf(rom, event),
    catalogue: cat,
    map,
    world,
    figure,
    pieces: figurePieces(figure),
    wardrobe: parts,
    doorways: doorwaysOf(cat, code),
    archive,
    code,
  }
}
