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
  type ActionScript,
  type AttendingCharacter,
  type BattleZone,
  type BuildTable,
  type CharaColours,
  type CharacterPreset,
  castAtPoint,
  type DoorwayRegion,
  type EventBattle,
  type EventListEntry,
  type EventMessage,
  type ExperienceBand,
  type FieldMonster,
  type FieldZone,
  type Grammar,
  type ItemDef,
  type ItemKind,
  type ItemName,
  isMapLinks,
  isMapList,
  isMapManifest,
  isNpcList,
  isNpcPlacements,
  itemPrice,
  type LevelTable,
  type Lighting,
  type MapEntry,
  type MapManifest,
  type MapTransition,
  type MedalRewards,
  type MonsterBattle,
  mapAreas,
  mapDoorwayRegions,
  mapDoorways,
  NO_ACTION,
  type NpcEntry,
  type NpcPlacement,
  type NpcState,
  type PlaceRecord,
  placeNpcs,
  type QuestGiver,
  type QuestText,
  type RandomTreasure,
  type Recipe,
  readActionRanges,
  readActionScript,
  readActions,
  readAttendingCharacters,
  readBattleEncounters,
  readBuildTable,
  readCharaColours,
  readCharacterPresets,
  readDataTable,
  readEventBattles,
  readEventList,
  readEventMessages,
  readExperienceAdjust,
  readFieldEncounters,
  readFieldMonsters,
  readItemBattleParams,
  readItemDefs,
  readItemKinds,
  readItemNames,
  readItemStats,
  readItemTable,
  readLevelTable,
  readLighting,
  readMapLinks,
  readMapList,
  readMapManifest,
  readMedalRewards,
  readMonsterBattle,
  readMonsterList,
  readMonsterNames,
  readNpcList,
  readNpcPlacements,
  readNpcStates,
  readPlaceRecords,
  readQuestGivers,
  readQuestIds,
  readQuestTexts,
  readRandomTreasure,
  readRecipes,
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
  readWeaponPlaces,
  readWeightTables,
  type Script,
  type Shop,
  type SkillPanel,
  type SpellTable,
  type StoryArea,
  type TalkLine,
  type Treasure,
  type Trigger,
  type VocationTrees,
  type WeaponPlaces,
  type WeightTables,
} from '@minstrel/game-formats'
import { decompressBlz, looksBlz } from '@minstrel/nitro-comp'
import type { Model } from '@minstrel/nitro-gfx'
import { parseRomHeader, readNitroFs } from '@minstrel/nitrofs'
import { type CollisionWorld, createCollisionWorld, groundBelow, PERSON } from '@minstrel/sim'
import { type AssembledMap, assembleMap, type MapLighting, WORLD_SCALE } from '@minstrel/world'
import type { BattleWords } from './battle-scene.ts'
import { type Cast, cast, forgetSheets, type GroundAt } from './cast.ts'
import { CHEST_ARCHIVE, type ChestLook, chestModelsOf } from './chests.ts'
import { heroOutfit, LEVELS_FOLDER } from './hero.ts'
import { speedsOf } from './motion-speed.ts'
import { type GivenNames, givenNamesOf } from './naming.ts'
import { type Prop, propSprites } from './pots.ts'
import { SHADOW_ARCHIVE, shadowModelOf } from './shadows.ts'
import { isSliding, type SlidingPiece, slidingPieces } from './slide.ts'

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
  /**
   * Who stands in the map at a stage and step, by night if `night`, with the
   * game-wide flags `globals` set — see `castOf`.
   */
  castAt(
    stage: Stage | undefined,
    step?: number,
    night?: boolean,
    globals?: ReadonlySet<number>,
  ): Cast
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
   * The ten builds a character can be made in, out of the ARM9 binary — see
   * `readBuildTable`. Undefined when the binary will not unpack or holds no
   * such run, which leaves every figure its own size.
   */
  readonly buildTable: BuildTable | undefined
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
  /**
   * The alchemy recipes — `/data/bin/recipe.gp2`, see `readRecipes`. Empty
   * where the file is not there or will not read.
   */
  readonly recipes: readonly Recipe[]
  /**
   * The Krak Pot's own words in English — `str_ren`, by number. Message 18
   * names the per-cent chance and 19 and 20 the alchemiracle's two ways, which
   * is what `Recipe.chance`, `instead` and `fallback` are read as.
   */
  readonly potWords: ReadonlyMap<number, string>
  /**
   * The Krak Pot's menu labels — `bm_rrb`, a `0x67` table of 48 read like
   * `sta_skl`. `POT_LABELS` and `POT_CATEGORIES` in `alchemy.ts` are the
   * numbers into this; the words themselves stay on the cartridge.
   */
  readonly potLabels: ReadonlyMap<number, string>
  /**
   * Patty's own words — `str_lui`, by number; and her menu labels,
   * `bm_lui`, which is the same `0x67` table shape. `PATTY_SAYS` and
   * `PATTY_LABELS` in `recruit.ts` are the numbers into these.
   */
  readonly pattyWords: ReadonlyMap<number, string>
  readonly pattyLabels: ReadonlyMap<number, string>
  /** Alltrades Abbey's lines, `str_dam`, by number — see `abbey.ts`. Empty if they will not read. */
  readonly abbeyWords: ReadonlyMap<number, string>
  /** Its windows' words, `bm_dama`'s labels: Yes, No, Change Vocation, Revocate, the vocations. */
  readonly abbeyLabels: ReadonlyMap<number, string>
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
  /** Each scene's entry in the game's event lists — the map it plays in, by number. See `readEventList`. */
  readonly eventList: ReadonlyMap<number, EventListEntry>
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
  /** A map's entry in the map list by its own id — see `MapEntry`. */
  mapEntryOf(id: number): MapEntry | undefined
  /**
   * What each worn thing adds to a resistance, by item id — see
   * `readItemBattleParams`. Whatever is not listed adds nothing.
   */
  readonly itemResistances: ReadonlyMap<number, readonly number[]>
  /** Each item's battle flags, `itembtlprm.nat` `+0x00` — see `ITEM_EXPERIENCE_BONUS`. */
  readonly itemFlags: ReadonlyMap<number, number>
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
  /** Every item as the code holds it — its kind and its bits; see `readItemDefs`. */
  readonly itemDefs: ReadonlyMap<number, ItemDef>
  /** Where each kind of weapon is carried, by kind — see `readWeaponPlaces`. Empty when it will not read. */
  readonly weaponPlaces: ReadonlyMap<number, WeaponPlaces>
  /** The engine's standard messages in English, `strstd`, by number — 57 a head banged on the ceiling. */
  readonly standardWords: ReadonlyMap<number, string>
  /** The given names creation's last screen rolls from, out of `str_cm` — see `naming.ts`. */
  readonly givenNames: GivenNames
  /** What a made character's face is recoloured with, out of `palette.bin` — see `skin.ts`. Undefined if it will not read. */
  readonly charaColours: CharaColours | undefined
  /**
   * `expadj.nat`'s bands: what a battle's experience adds to each member's
   * level before it is shared — see `experienceShares`. Empty if it will not
   * read, which the game's own default, 4, stands in for.
   */
  readonly experienceBands: readonly ExperienceBand[]
  /** What Cap'n Max gives for mini medals, out of overlay 4 — see `medals.ts`. Undefined if not found. */
  readonly medalRewards: MedalRewards | undefined
  /** The medal service's lines by number, `str_mdl` — see `medals.ts`. */
  readonly medalWords: ReadonlyMap<number, string>
  /** The Starflight Express's words by number, `str_ark` — see `express.ts`. */
  readonly expressWords: ReadonlyMap<number, string>
  /** DQVC's lines, `str_da12`, by number — the connection's among them; see `connectDqvc` in `main.ts`. */
  readonly dqvcWords: ReadonlyMap<number, string>
  /** The quests: who offers each, where and when, `questorder3` — see `quests.ts`. Empty if it will not read. */
  readonly questGivers: readonly QuestGiver[]
  /** Each quest's texts, by the quest's own number (through `questidtbl`) — see `readQuestTexts`. */
  readonly questTexts: ReadonlyMap<number, QuestText>
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
  /**
   * The map's own areas, from its link table — see `mapAreas` in
   * `@minstrel/game-formats`. In the file's own units, as a trigger's are.
   */
  readonly mapAreas: readonly StoryArea[]
  /** The map's doorway regions, by the two numbers a doorway record names — see `mapDoorwayRegions`. */
  readonly doorwayRegions: readonly DoorwayRegion[]
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
  /** Its body's radius and height, `fx32` — see `MonsterName.radius`. */
  readonly radius: number
  readonly height: number
  /** Its size in battle, 4096ths — see `MonsterName.size`. */
  readonly size: number
  /** Its family and whether its body is metal — see `MonsterName.family`. */
  readonly family: number
  readonly metal: boolean
  /** Its level — see `MonsterName.level`. */
  readonly level: number
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
  /** Whom it is aimed at, 1 the monsters, 2 the party — see `Action.side`. */
  readonly side: number
  /** Which battle list it is in, 2 Spells, 1 Abilities — see `Action.list`. */
  readonly list: number
  /** Bit 1 set: listed in battle — see `Action.usableIn`. */
  readonly usableIn: number
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
    /** Whether its blows chain into a combo — see `Action.combos`. */
    readonly combos: boolean
    /** Whether tension works on it and is spent by it — see `Action.tensed`. */
    readonly tensed: boolean
    /** Its kind (`+0x18` bits 5–11): 1 a blow's, 15 Psyche Up's. */
    readonly kind: number
    readonly blockable: boolean
    /** Its damage handler, hit code, step after, and falloff — see `Action.damageHandler`, `hitCode`, `afterStep`, `fallsOff`. */
    readonly handler: number
    readonly hitCode: number
    readonly afterStep: number
    readonly fallsOff: boolean
    /** The targeting handlers a monster's AI takes for it in modes 1 and 2 — see `Action.aiTargets`. */
    readonly aiTargets: readonly [number, number]
    /** Always a critical — see `Action.alwaysCritical`. */
    readonly alwaysCritical: boolean
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
  /** Every record of its `place.bin`, in order — see `castAtPoint`. */
  readonly records: readonly PlaceRecord[]
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
 * cartridge's 1,289 placements names exactly.
 *
 * With no stage, each character is where their block's header puts them. With
 * one, it is **the game's own choice**, read from its code: `castAtPoint` in
 * `@minstrel/game-formats` runs the file's records in order as the game does —
 * a block places its character, a span over the story places or takes away,
 * one for another map takes them away from this one — and the time of day
 * counts. A map the index does not know is not narrowed at all rather than
 * narrowed by a guess, and has the headers' places.
 */
function castOf(
  cat: Catalogue,
  area: Area | undefined,
  id: number | undefined,
  groundAt: GroundAt,
  sheets: ReadonlyMap<string, Uint8Array>,
  stage?: Stage,
  step?: number,
  night = false,
  isSet?: (bit: number, wanted: boolean) => boolean,
): Cast {
  if (!area) return NOBODY
  return cast(
    placedIn(area, id, stage, step, night, isSet),
    cat.members,
    groundAt,
    toFloat(PERSON.height),
    sheets,
  )
}

/** Who {@link castOf} stands in the map, before anyone is built — the choice alone. */
function placedIn(
  area: Area,
  id: number | undefined,
  stage?: Stage,
  step?: number,
  night = false,
  isSet?: (bit: number, wanted: boolean) => boolean,
): { entry: NpcEntry; placement: NpcPlacement }[] {
  const placed: { entry: NpcEntry; placement: NpcPlacement }[] = []
  if (stage === undefined || id === undefined) {
    for (const found of placeNpcs(area.entries, area.placements.map(placementInWorld))) {
      if (id === undefined || found.placement.map === id) placed.push(found)
    }
    return placed
  }
  const byId = new Map(area.entries.map((entry) => [entry.id, entry]))
  // A stage opened by hand, with no step — a new game, `?stage=`, `t` — is
  // taken at its first step, where the records start. Ours: the game always
  // has one.
  const point = { major: stage.major, minor: stage.minor, step: step ?? 1 }
  for (const [who, at] of castAtPoint(area.records, id, point, night, isSet)) {
    const entry = byId.get(who)
    if (!entry) continue
    placed.push({
      entry,
      placement: placementInWorld({
        id: who,
        map: at.map,
        x: at.x,
        y: at.y,
        z: at.z,
        facing: at.facing,
        offset: at.record.offset,
        ...(at.boxes ? { boxes: at.boxes } : {}),
      }),
    })
  }
  return placed
}

/** What the story reads of an area, without a map built — see {@link storyView}. */
export interface StoryView {
  /** Who stands in the map, by the id `pickLine` asks for, at a stage and step — as `castAt` places them. */
  castIds(
    map: number,
    stage: Stage,
    step?: number,
    night?: boolean,
    isSet?: (bit: number, wanted: boolean) => boolean,
  ): number[]
  /** The labels of the talk boxes of those who stand in the map, by id — see `TalkBox`. */
  boxLabels(
    map: number,
    stage: Stage,
    step?: number,
    night?: boolean,
    isSet?: (bit: number, wanted: boolean) => boolean,
  ): Map<number, number[]>
  /** The chapter letters the area has talk for, in order — as `Loaded.letters`. */
  readonly letters: readonly string[]
  /** A character's lines in a chapter — as `Loaded.linesOf`. */
  linesOf(id: number, letter: string): readonly TalkLine[]
}

/**
 * An area's cast and talk, read the way {@link load} reads them but with no map,
 * model or sound — for following the story over the whole cartridge at once
 * (`apps/game/test/story-walk.test.ts`). Who stands where is `castAt`'s own
 * choice, before anyone is built, so a character the build would leave out as
 * missing is still counted here.
 */
export function storyView(rom: Uint8Array, code: string): StoryView {
  const { cat } = walkOnce(rom, [`/data/scenario/${code}.npc`])
  const area = areaFrom(cat, code)
  const talk = talkOf(rom, code)
  return {
    castIds: (map, stage, step, night, isSet) =>
      area
        ? placedIn(area, map, stage, step, night, isSet).map(({ placement }) => placement.id)
        : [],
    boxLabels: (map, stage, step, night, isSet) => {
      const out = new Map<number, number[]>()
      if (!area) return out
      for (const { placement } of placedIn(area, map, stage, step, night, isSet)) {
        const labels = [...new Set((placement.boxes ?? []).map((box) => box.label))]
        if (labels.length > 0) out.set(placement.id, labels)
      }
      return out
    },
    letters: [...talk.keys()].sort(),
    linesOf: (who, letter) => talk.get(letter)?.get(who) ?? [],
  }
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
        records: readPlaceRecords(places),
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
 * Every area's triggers, by area code, out of `/data/scenario` in one walk —
 * for the scene browser, which lists every scene the triggers get to. An area
 * whose file will not read is left out rather than stopping the rest.
 */
export function allTriggers(rom: Uint8Array): { code: string; triggers: Trigger[] }[] {
  const out: { code: string; triggers: Trigger[] }[] = []
  for (const leaf of scanCartridge(rom, { pathFilter: '/data/scenario/trigger' })) {
    const named = /\/trigger([A-Z]\d\d)\.bin$/i.exec(leaf.path)
    if (!named) continue
    try {
      out.push({ code: (named[1] as string).toUpperCase(), triggers: readTriggers(leaf.bytes) })
    } catch {
      // An area whose triggers will not read offers no scenes.
    }
  }
  return out.sort((a, b) => a.code.localeCompare(b.code))
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
const itemBattleRead = new WeakMap<
  Uint8Array,
  { resistances: Map<number, readonly number[]>; flags: Map<number, number> }
>()

/**
 * What each item adds to a resistance, by item id — `itembtlprm.nat`, which
 * the game looks a worn thing up in and whose twenty numbers it sums onto a
 * hundred (`wornResistances`). Empty when the file will not read.
 */
function itemBattleOf(rom: Uint8Array): Map<number, readonly number[]> {
  return itemBattleRecords(rom).resistances
}

/** Each item's battle flags, by id — see `ITEM_EXPERIENCE_BONUS`. Empty when the file will not read. */
function itemFlagsOf(rom: Uint8Array): Map<number, number> {
  return itemBattleRecords(rom).flags
}

function itemBattleRecords(rom: Uint8Array): {
  resistances: Map<number, readonly number[]>
  flags: Map<number, number>
} {
  const already = itemBattleRead.get(rom)
  if (already) return already
  const read = {
    resistances: new Map<number, readonly number[]>(),
    flags: new Map<number, number>(),
  }
  for (const leaf of scanCartridge(rom, { pathFilter: ITEM_BATTLE })) {
    if (leaf.path !== ITEM_BATTLE) continue
    try {
      for (const item of readItemBattleParams(leaf.bytes)) {
        read.resistances.set(item.id, item.resistances)
        read.flags.set(item.id, item.flags)
      }
    } catch {
      // A file that will not read leaves everyone's resistances whole.
    }
  }
  itemBattleRead.set(rom, read)
  return read
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
              radius: monster.radius,
              height: monster.height,
              size: monster.size,
              family: monster.family,
              metal: monster.metal,
              level: monster.level,
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

/**
 * Each scene's entry in the game's three event lists, by number — see
 * `readEventList`. A list that will not read lists nothing. Read once per
 * cartridge.
 */
export function eventListOf(rom: Uint8Array): ReadonlyMap<number, EventListEntry> {
  const known = eventLists.get(rom)
  if (known) return known
  const out = new Map<number, EventListEntry>()
  for (const path of [
    '/data/event/eventlist6.bin',
    '/data/evspt_lv5/eventlist_lv5.bin',
    '/data/event/evl_quest.bin',
  ]) {
    const bytes = looseFile(rom, path)
    if (!bytes) continue
    try {
      for (const entry of readEventList(bytes)) out.set(entry.event, entry)
    } catch {
      // A list that will not read gives its scenes no map of their own.
    }
  }
  eventLists.set(rom, out)
  return out
}
const eventLists = new WeakMap<Uint8Array, ReadonlyMap<number, EventListEntry>>()

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
/** `/data/bin/wpnpos.bin`, by kind — see `readWeaponPlaces`. */
function weaponPlacesOf(rom: Uint8Array): ReadonlyMap<number, WeaponPlaces> {
  const { cat } = walkOnce(rom, ['/data/bin/wpnpos.bin'])
  for (const leaf of cat.other) {
    if (!leaf.path.toLowerCase().endsWith('/wpnpos.bin')) continue
    try {
      return new Map(readWeaponPlaces(leaf.bytes).map((places) => [places.kind, places]))
    } catch {
      return new Map()
    }
  }
  return new Map()
}

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

/** The items as the code holds them, `itemdt_en.nat` — see `readItemDefs`. Empty when it will not read. */
function itemDefsOf(rom: Uint8Array): ReadonlyMap<number, ItemDef> {
  for (const leaf of scanCartridge(rom, { pathFilter: '/data/prm/itemdt.gp2' })) {
    if (!/itemdt_en\.nat$/i.test(leaf.path)) continue
    try {
      return readItemDefs(leaf.bytes)
    } catch {
      return new Map()
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
  /** The motion set it gives its wearer — see `ItemStats.motionSet`. */
  readonly motionSet: number
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
            motionSet: entry.motionSet,
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
/**
 * One ARM9 overlay's code, unpacked: overlays are FAT files, and BLZ-packed
 * where the overlay table says so — as the ARM9 binary is, see `arm9Of`.
 */
function overlayOf(rom: Uint8Array, id: number): Uint8Array | undefined {
  try {
    const fs = readNitroFs(rom)
    const entry = fs.arm9Overlays.find((overlay) => overlay.overlayId === id)
    if (!entry) return undefined
    const packed = fs.read(entry.fileId)
    return entry.compressed && looksBlz(packed) ? decompressBlz(packed) : packed
  } catch {
    return undefined
  }
}

/** The medal service's code, where its reward tables are. */
const MEDAL_OVERLAY = 4

function medalRewardsOf(rom: Uint8Array): MedalRewards | undefined {
  const code = overlayOf(rom, MEDAL_OVERLAY)
  if (!code) return undefined
  try {
    return readMedalRewards(code)
  } catch {
    return undefined
  }
}

/**
 * `str_mdl`'s lines, by number: records of tag `0x67`, each its number and a
 * string — the medal service's own words, 10 to 200. See `medals.ts`.
 */
/** A table of numbered lines — a tag-`0x67` record each, a number and a string — as `str_mdl` and `str_da12` are. */
function numberedLines(rom: Uint8Array, archive: string, member: string): Map<number, string> {
  const { cat } = walkOnce(rom, [archive])
  const out = new Map<number, string>()
  for (const [, files] of cat.members) {
    for (const [name, bytes] of files) {
      if (!name.toLowerCase().endsWith(member)) continue
      try {
        const table = readDataTable(bytes)
        for (const record of table.withTag(0x67)) {
          const number = record.values[0]
          const text = record.values[1] === undefined ? undefined : table.stringAt(record.values[1])
          if (number !== undefined && text) out.set(number, text)
        }
      } catch {
        // Lines that will not read leave the service with nothing to say.
      }
    }
  }
  return out
}

function medalWordsOf(rom: Uint8Array): Map<number, string> {
  const { cat } = walkOnce(rom, ['/data/bin/menu/str_mdl.gp2'])
  const out = new Map<number, string>()
  for (const [, files] of cat.members) {
    for (const [name, bytes] of files) {
      if (!name.toLowerCase().endsWith('str_mdl_en.bin')) continue
      try {
        const table = readDataTable(bytes)
        for (const record of table.withTag(0x67)) {
          const number = record.values[0]
          const text = record.values[1] === undefined ? undefined : table.stringAt(record.values[1])
          if (number !== undefined && text) out.set(number, text)
        }
      } catch {
        // Lines that will not read leave the service with nothing to say.
      }
    }
  }
  return out
}

/** `/data/bin/expadj.nat`, read — a loose file, as `palette.bin` is. */
function experienceBandsOf(rom: Uint8Array): readonly ExperienceBand[] {
  const { cat } = walkOnce(rom, ['/data/bin/expadj.nat'])
  const leaf = cat.other.find((candidate) => candidate.path.toLowerCase().endsWith('/expadj.nat'))
  if (!leaf) return []
  try {
    return readExperienceAdjust(leaf.bytes).bands
  } catch {
    return []
  }
}

/** `/data/chara/palette.bin`, read — see `skin.ts`. A loose file, not an archive's member. */
function charaColoursOf(rom: Uint8Array): CharaColours | undefined {
  const { cat } = walkOnce(rom, ['/data/chara/palette.bin'])
  const leaf = cat.other.find((candidate) => candidate.path.toLowerCase().endsWith('/palette.bin'))
  if (!leaf) return undefined
  try {
    return readCharaColours(leaf.bytes)
  } catch {
    return undefined
  }
}

/**
 * The given names creation's last screen rolls from — see `naming.ts`. On its
 * own because the Hero is named before any map is loaded.
 */
export function givenNamesFrom(rom: Uint8Array): GivenNames {
  return givenNamesOf(
    englishText(rom, '/data/bin/menu/str_cm.gp2', 'str_cm_en.nat', readSystemStrings),
  )
}

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

const questsKept = new WeakMap<
  Uint8Array,
  { questGivers: readonly QuestGiver[]; questTexts: ReadonlyMap<number, QuestText> }
>()

/** The quests' givers and texts — see `quests.ts`. None where the files will not read. */
function questsOf(rom: Uint8Array): {
  questGivers: readonly QuestGiver[]
  questTexts: ReadonlyMap<number, QuestText>
} {
  const already = questsKept.get(rom)
  if (already) return already
  const read = <T>(path: string, reader: (bytes: Uint8Array) => T, none: T): T => {
    const bytes = looseFile(rom, path)
    if (!bytes) return none
    try {
      return reader(bytes)
    } catch {
      return none
    }
  }
  const questGivers = read('/data/scenario/questorder3.bin', readQuestGivers, [])
  const ids = read('/data/scenario/questidtbl.bin', readQuestIds, new Map<number, number>())
  const byNumber = englishQuestTexts(rom)
  const questTexts = new Map<number, QuestText>()
  for (const [quest, number] of ids) {
    const text = byNumber.get(number)
    if (text) questTexts.set(quest, text)
  }
  const out = { questGivers, questTexts }
  questsKept.set(rom, out)
  return out
}

/** `questmsg_en.bin`'s texts, by their number there. */
function englishQuestTexts(rom: Uint8Array): Map<number, QuestText> {
  const { cat } = walkOnce(rom, ['/data/scenario/questmsg.gp2'])
  for (const [, files] of cat.members) {
    for (const [name, bytes] of files) {
      if (!name.toLowerCase().endsWith('questmsg_en.bin')) continue
      try {
        return readQuestTexts(bytes)
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
    standard: englishText(rom, '/data/bin/strstd.gp2', 'strstd_en.nat', readSystemStrings),
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
        side: action.side,
        list: action.list,
        usableIn: action.usableIn,
        rolls: {
          foeChance: action.foeChance,
          chanceIsAccuracy: action.accuracyMode === 1,
          evadable: action.evadable,
          defendable: action.defendable,
          combos: action.combos,
          tensed: action.tensed,
          kind: action.kind,
          blockable: action.blockable,
          handler: action.damageHandler,
          hitCode: action.hitCode,
          afterStep: action.afterStep,
          fallsOff: action.fallsOff,
          aiTargets: action.aiTargets,
          alwaysCritical: action.alwaysCritical,
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
 * The track a map calls for, out of the index (`MapEntry.music`, INFERRED
 * there). A battle's is the code's, not the index's — see `playBattleMusic`.
 */
function musicOf(cat: Catalogue, code: string): Pick<Loaded, 'music'> {
  for (const leaf of cat.other) {
    if (!leaf.path.toLowerCase().endsWith('maplist9.bin') || !isMapList(leaf.bytes)) continue
    try {
      const own = readMapList(leaf.bytes).map(code.toUpperCase())?.music
      return { music: own === undefined || own === 0 ? undefined : own }
    } catch {
      return { music: undefined }
    }
  }
  return { music: undefined }
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

/**
 * A table of `0x67` (number, string) records — the shape `str_sklc`,
 * `sta_skl`, `str_gskl` and `bm_rrb` all share, and which `readTableMessages`
 * reads. See game-formats' FORMAT.md, "The tagged data table".
 */
const STRING_TABLE_TAG = 0x67

/** The skill screen's words in English — see {@link SkillWords}. */
function skillWordsOf(rom: Uint8Array): SkillWords {
  const strings = (archive: string, member: string) =>
    englishText(rom, archive, member, (bytes) =>
      messagesBy(readTableMessages(bytes, STRING_TABLE_TAG)),
    )
  return {
    trees: strings('/data/bin/str_sklc.gp2', 'str_sklc_en.bin'),
    panels: strings('/data/bin/menu/sta_skl.gp2', 'sta_skl_en.bin'),
    said: strings('/data/prm/str_gskl.gp2', 'str_gskl_en.bin'),
  }
}

const recipesRead = new WeakMap<Uint8Array, readonly Recipe[]>()

/** Where the recipes are: inside the Krak Pot's own archive. */
const RECIPE_ARCHIVE = '/data/bin/recipe.gp2'

/**
 * The alchemy recipes — see {@link Loaded.recipes}. The five language members
 * are the same file; the table holds no text, so `_<LG>` is convention only
 * and English is taken for consistency with the rest of this module.
 */
function recipesOf(rom: Uint8Array): readonly Recipe[] {
  const already = recipesRead.get(rom)
  if (already) return already
  const { cat } = walkOnce(rom, [RECIPE_ARCHIVE])
  let recipes: readonly Recipe[] = []
  for (const [, files] of cat.members) {
    for (const [name, bytes] of files) {
      if (!name.toLowerCase().endsWith('recipe_en.bin')) continue
      try {
        recipes = readRecipes(bytes)
      } catch {
        // A table that will not read leaves the pot with nothing to cook.
      }
    }
  }
  recipesRead.set(rom, recipes)
  return recipes
}

/** The build table read once from the ARM9 binary, by cartridge. */
const buildsRead = new WeakMap<Uint8Array, BuildTable | undefined>()

/** The builds out of the ARM9 binary — see game-formats' FORMAT.md, "Builds". */
function buildTableOf(rom: Uint8Array): BuildTable | undefined {
  if (buildsRead.has(rom)) return buildsRead.get(rom)
  let table: BuildTable | undefined
  try {
    const binary = arm9Of(rom)
    table = binary ? readBuildTable(binary) : undefined
  } catch {
    // A binary with no such run leaves every figure its own size.
  }
  buildsRead.set(rom, table)
  return table
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
function entryOf(cat: Catalogue): (id: number) => MapEntry | undefined {
  for (const leaf of cat.other) {
    if (!leaf.path.toLowerCase().endsWith('maplist9.bin') || !isMapList(leaf.bytes)) continue
    try {
      const byId = new Map(
        readMapList(leaf.bytes)
          .maps.filter((entry) => entry.id !== 0)
          .map((entry) => [entry.id, entry]),
      )
      return (id) => byId.get(id)
    } catch {
      return () => undefined
    }
  }
  return () => undefined
}

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
 * The other model archives a map's link table names beside the one opened
 * that are its own halves, its code and a letter — `O01.bmbl` names `O01a` and
 * `O01b`. None for any other map on the cartridge.
 */
function siblingArchives(cat: Catalogue, code: string, opened: string): string[] {
  const out: string[] = []
  for (const [archive, files] of cat.members) {
    if (stemOf(archive) !== code.toLowerCase() || !archive.toLowerCase().endsWith('.ambl')) continue
    for (const [name, bytes] of files) {
      if (!name.toLowerCase().endsWith('.bmbl') || !isMapLinks(bytes)) continue
      let names: readonly string[]
      try {
        names = readMapLinks(bytes).names
      } catch {
        continue
      }
      for (const named of names) {
        // Its own halves only — the map's code and one letter — not the
        // neighbours a link table also names.
        if (!new RegExp(`^${code.toLowerCase()}[a-z]$`).test(named.toLowerCase())) continue
        const path = [...cat.members.keys()].find(
          (p) => stemOf(p) === named.toLowerCase() && p.toLowerCase().endsWith('.amdj'),
        )
        if (path && path !== opened && !out.includes(path)) out.push(path)
      }
    }
  }
  return out
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

/** A map's own areas, out of its link table — see `mapAreas`. None when there is none or it will not read. */
function mapAreasOf(cat: Catalogue, code: string): readonly StoryArea[] {
  return fromLinkTable(cat, code, mapAreas)
}

/** A map's doorway regions, out of its link table — see `mapDoorwayRegions`. None when it will not read. */
function doorwayRegionsOf(cat: Catalogue, code: string): readonly DoorwayRegion[] {
  return fromLinkTable(cat, code, mapDoorwayRegions)
}

/** `read` of the map's link table, or nothing where there is none or it will not read. */
function fromLinkTable<T>(cat: Catalogue, code: string, read: (bytes: Uint8Array) => T[]): T[] {
  for (const [archive, files] of cat.members) {
    if (stemOf(archive) !== code.toLowerCase() || !archive.toLowerCase().endsWith('.ambl')) continue
    for (const [name, bytes] of files) {
      if (!name.toLowerCase().endsWith('.bmbl') || !isMapLinks(bytes)) continue
      try {
        return read(bytes)
      } catch {
        return []
      }
    }
  }
  return []
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
    ...(placement.boxes
      ? {
          boxes: placement.boxes.map((box) => ({
            label: box.label,
            maxX: box.maxX * WORLD_SCALE,
            maxZ: box.maxZ * WORLD_SCALE,
            minX: box.minX * WORLD_SCALE,
            minZ: box.minZ * WORLD_SCALE,
          })),
        }
      : {}),
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

/**
 * **A battle stage's models**, by its code — `B01M16` — placed as its own
 * descriptor places them, about the stage's origin (see `stage.ts`). The
 * cartridge's maps are walked once already for the map in play, so this reads
 * nothing new. Its lighting's pieces only: a stage has day (`L`) and night
 * (`N`) sets beside its ground, as a field has. Undefined for a code with no
 * model that reads.
 */
export function stageMap(
  rom: Uint8Array,
  code: string,
  lighting: MapLighting,
): AssembledMap | undefined {
  const { cat, manifests } = walkOnce(rom, SLICE_PATHS)
  const wanted = code.toLowerCase()
  for (const [path, manifest] of manifests) {
    if (stemOf(path) !== wanted) continue
    const members = cat.members.get(path)
    if (!members) continue
    const built = assembleMap(manifest, members, { lighting })
    if (built.pieces.length > 0) return built
  }
  return undefined
}

/**
 * **The battle's own sheets**, by name without `.spr`: the ones `btarc.nsarc`
 * holds — the numbers that rise over a fighter among them (`damage_num`,
 * `damage_waku` …; see `battle-numbers.ts`). Read once.
 */
export function battleSheets(rom: Uint8Array): ReadonlyMap<string, Uint8Array> {
  const already = battleSheetsRead.get(rom)
  if (already) return already
  const sheets = new Map<string, Uint8Array>()
  for (const leaf of scanCartridge(rom, { pathFilter: '/data/bin/btarc.nsarc' })) {
    const found = /\/([^/]+)\.spr$/i.exec(leaf.path)
    if (found) sheets.set((found[1] as string).toLowerCase(), leaf.bytes)
  }
  battleSheetsRead.set(rom, sheets)
  return sheets
}
const battleSheetsRead = new WeakMap<Uint8Array, Map<string, Uint8Array>>()

/**
 * **A map's lighting**, by its code: `<code>00.bats` in `ats_<letter>.ambl`,
 * by the code's first letter — `B01M1600.bats` in `ats_B.ambl` (see
 * `readLighting`). Undefined when there is none or it will not read.
 */
export function mapLighting(rom: Uint8Array, code: string): Lighting | undefined {
  const { cat } = walkOnce(rom, SLICE_PATHS)
  const archive = `ats_${code.slice(0, 1).toUpperCase()}.ambl`
  const wanted = `${code.toLowerCase()}00.bats`
  for (const [path, members] of cat.members) {
    if (!path.endsWith(`/${archive}`)) continue
    for (const [name, bytes] of members) {
      if (name.toLowerCase() !== wanted) continue
      try {
        return readLighting(bytes)
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

/**
 * **A motion set's motions**, by the set's name — `mp0201`, the swords' — out
 * of `chara_mp.gp2`: every pack of the family, as the Hero's own are read (see
 * `library`). Read once a set, and only when somebody moves by it.
 */
export function motionSet(rom: Uint8Array, family: string): Library['motions'] {
  let bySet = setsRead.get(rom)
  if (!bySet) {
    bySet = new Map()
    setsRead.set(rom, bySet)
  }
  const already = bySet.get(family)
  if (already) return already
  const built = library(family)
  for (const leaf of scanCartridge(rom, { pathFilter: '/data/pack_lv5/chara_mp.gp2' })) {
    built.offer(leaf.path, leaf.bytes)
  }
  bySet.set(family, built.motions)
  return built.motions
}
const setsRead = new WeakMap<Uint8Array, Map<string, Library['motions']>>()

/** A motion set's speeds, by motion name: its packs' `.bcfg` records — see `motion-speed.ts`. */
export function motionSpeeds(rom: Uint8Array, family: string): ReadonlyMap<string, number> {
  let bySet = speedsRead.get(rom)
  if (!bySet) {
    bySet = new Map()
    speedsRead.set(rom, bySet)
  }
  const already = bySet.get(family)
  if (already) return already
  const packOf = (path: string) => {
    const archive = path.slice(0, path.lastIndexOf('/'))
    return archive.slice(archive.lastIndexOf('/') + 1).toLowerCase()
  }
  const suffix = (path: string) =>
    packOf(path)
      .slice(family.length)
      .replace(/\.chr$/, '')
  // **The packs a battle loads come first** — `<set>f` and `<set>b`, then the
  // blow's, the item's, the spell's and the start's (`func_ov000_02164fac`,
  // overlays 25 and 26) — then the field's. The packs disagree: `stand` is
  // 0.1 in `f` and `n`, 0.3 in `n2`.
  const order = ['f', 'b', 'be', 'bi', 'bm', 's', 'n', 'ne']
  const rank = (path: string) => {
    const at = order.indexOf(suffix(path))
    return at < 0 ? order.length : at
  }
  const own = [...scanCartridge(rom, { pathFilter: '/data/pack_lv5/chara_mp.gp2' })]
    .filter((leaf) => packOf(leaf.path).startsWith(family))
    .sort((a, b) => rank(a.path) - rank(b.path))
  const speeds = speedsOf(own)
  bySet.set(family, speeds)
  return speeds
}
const speedsRead = new WeakMap<Uint8Array, Map<string, ReadonlyMap<string, number>>>()

/**
 * **A motion set's own action script** — `chara_mp.gp2/<set>b.chr/<set>.bact`,
 * which the battle parses for a party member as it loads
 * (`func_ov000_02164fac`, `"%sb.chr"`): its sections are what the member's
 * actions play first (FORMAT.md, "The action scripts").
 */
export function setActionScript(rom: Uint8Array, family: string): ActionScript | undefined {
  let bySet = setScriptsRead.get(rom)
  if (!bySet) {
    bySet = new Map()
    setScriptsRead.set(rom, bySet)
  }
  if (bySet.has(family)) return bySet.get(family)
  let found: ActionScript | undefined
  for (const leaf of scanCartridge(rom, { pathFilter: '/data/pack_lv5/chara_mp.gp2' })) {
    if (!leaf.path.toLowerCase().endsWith(`/${family}.bact`)) continue
    found = actionScriptOf(leaf.bytes)
    break
  }
  bySet.set(family, found)
  return found
}
const setScriptsRead = new WeakMap<Uint8Array, Map<string, ActionScript | undefined>>()

/** A fighter's own action script among its files — a monster's `.mon`, a companion's `.chr`. */
export function actionScriptAmong(
  files: Iterable<{ readonly path: string; readonly bytes: Uint8Array }>,
): ActionScript | undefined {
  for (const { path, bytes } of files) {
    if (!path.toLowerCase().endsWith('.bact')) continue
    const found = actionScriptOf(bytes)
    if (found) return found
  }
  return undefined
}

function actionScriptOf(bytes: Uint8Array): ActionScript | undefined {
  try {
    return readActionScript(bytes)
  } catch {
    return undefined
  }
}

/** The archives a spell's or a skill's own script is in, by its record's `+0x18` bits 12–15 (`func_ov025_021dbe10`). */
const SKILL_ARCHIVES = {
  spell: '/data/skill/actspl.nsarc',
  skill: '/data/skill/actskl.nsarc',
  other: '/data/skill/actetc.nsarc',
} as const

/**
 * **The scripts an action may play besides its fighter's** —
 * `data/bin/actdef.nsarc/default.bact`, read once a battle
 * (`func_ov000_02164fac`), and the `sp%03d.bact` of each skill archive, by the
 * action's own number (`func_ov025_021dc694`). Read once a cartridge.
 */
export interface ActionScripts {
  readonly fallback: ActionScript | undefined
  /** An action's own file in an archive, or undefined when the archive has none. */
  own(archive: keyof typeof SKILL_ARCHIVES, action: number): ActionScript | undefined
}

export function actionScripts(rom: Uint8Array): ActionScripts {
  const already = scriptsRead.get(rom)
  if (already) return already
  let fallback: ActionScript | undefined
  const byArchive = new Map<string, Map<number, ActionScript | undefined>>()
  // Only the four archives the scripts are in: the scan's filter is by file,
  // and all of `/data/` is every archive on the cartridge unpacked — over a
  // second, which a battle's first action stood still for.
  const leaves = [
    ...scanCartridge(rom, { pathFilter: '/data/bin/actdef.nsarc' }),
    ...Object.values(SKILL_ARCHIVES).flatMap((archive) => [
      ...scanCartridge(rom, { pathFilter: archive }),
    ]),
  ]
  for (const leaf of leaves) {
    const path = leaf.path.toLowerCase()
    if (path === '/data/bin/actdef.nsarc/default.bact') fallback = actionScriptOf(leaf.bytes)
    for (const [name, archive] of Object.entries(SKILL_ARCHIVES)) {
      if (!path.startsWith(`${archive}/`)) continue
      const n = /\/sp(\d{3})\.bact$/.exec(path)
      if (!n) continue
      const files = byArchive.get(name) ?? new Map()
      byArchive.set(name, files)
      files.set(Number(n[1]), actionScriptOf(leaf.bytes))
    }
  }
  const scripts: ActionScripts = {
    fallback,
    own: (archive, action) => byArchive.get(archive)?.get(action),
  }
  scriptsRead.set(rom, scripts)
  return scripts
}
const scriptsRead = new WeakMap<Uint8Array, ActionScripts>()

/**
 * **What an action's record says of how it is shown** — `+0x18` bits 12–15,
 * the archive its own script is in (2 `actspl`, 1 and 4 `actskl` for one of
 * the party, the rest `actetc`), and bits 5–11, its kind (`func_ov025_
 * 021dbe10`). Read once a cartridge, from both halves of the action table.
 */
export function actionRecordOf(
  rom: Uint8Array,
  action: number,
): { readonly archive: number; readonly kind: number } | undefined {
  let byAction = recordsRead.get(rom)
  if (!byAction) {
    byAction = new Map()
    recordsRead.set(rom, byAction)
    for (const leaf of scanCartridge(rom, { pathFilter: '/data/prm/actdt_' })) {
      if (!/actdt_[ab]_en\.nat$/i.test(leaf.path)) continue
      try {
        for (const a of readActions(leaf.bytes)) {
          if (byAction.has(a.id)) continue
          const word = new DataView(a.raw.buffer, a.raw.byteOffset, a.raw.byteLength).getUint32(
            0x18,
            true,
          )
          byAction.set(a.id, { archive: (word >>> 12) & 0xf, kind: (word >>> 5) & 0x7f })
        }
      } catch {
        // A half that will not read shows its actions by `default.bact`.
      }
    }
  }
  return byAction.get(action)
}
const recordsRead = new WeakMap<
  Uint8Array,
  Map<number, { readonly archive: number; readonly kind: number }>
>()

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
    const built = assembleMap(manifest, members, {
      ...(options.lighting === undefined ? {} : { lighting: options.lighting }),
      // A sliding piece is placed at each end of its slide — one piece at two
      // moments, not two pieces. See `slide.ts`.
      once: isSliding,
    })
    if (built.pieces.length === 0) continue
    archive = path
    map = built
    break
  }
  if (archive === undefined || map === undefined) {
    throw new Error(`'${matching[0]}' names no model that reads`)
  }
  // **A map in several archives**: the sky, O01, is `O01a` and `O01b`, both
  // named by its link table (`O01.bmbl`) and both placed at the origin — the
  // whole world in two halves, the collision in the second. Every archive the
  // link table names is assembled, and the map is all of them.
  for (const sibling of siblingArchives(cat, wanted, archive)) {
    const manifest = manifests.get(sibling)
    const members = cat.members.get(sibling)
    if (!manifest || !members) continue
    const more = assembleMap(manifest, members, {
      ...(options.lighting === undefined ? {} : { lighting: options.lighting }),
      once: isSliding,
    })
    map = {
      pieces: [...map.pieces, ...more.pieces],
      meshes: [...map.meshes, ...more.meshes],
      water: [...map.water, ...more.water],
      marsh: [...map.marsh, ...more.marsh],
      missing: [...map.missing, ...more.missing],
    }
  }

  // The map's own code — `O01`, not the half `O01a` that was opened first.
  const opened = stemOf(archive)
  const code = (
    opened.length === wanted.length + 1 && opened.startsWith(wanted) ? wanted : opened
  ).toUpperCase()
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
    eventList: eventListOf(rom),
    fieldMonsters: fieldMonstersOf(rom),
    levels: levelsOf(rom),
    shops: shopsOf(rom),
    attending: attendingOf(rom),
    presets: presetsOf(rom),
    mapCodeOf: codeOf(cat),
    mapEntryOf: entryOf(cat),
    goods: goodsOf(rom),
    itemResistances: itemBattleOf(rom),
    itemFlags: itemFlagsOf(rom),
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
    itemDefs: itemDefsOf(rom),
    weaponPlaces: weaponPlacesOf(rom),
    standardWords: englishText(rom, '/data/bin/strstd.gp2', 'strstd_en.nat', readSystemStrings),
    givenNames: givenNamesFrom(rom),
    charaColours: charaColoursOf(rom),
    medalRewards: medalRewardsOf(rom),
    experienceBands: experienceBandsOf(rom),
    medalWords: medalWordsOf(rom),
    expressWords: englishText(
      rom,
      '/data/bin/menu/str_ark.gp2',
      'str_ark_en.nat',
      readSystemStrings,
    ),
    ...questsOf(rom),
    dqvcWords: numberedLines(rom, '/data/menu/str_da12.gp2', 'str_da12_en.bin'),
    chests: chestModelsOf(
      [...cat.members].find(([path]) => path.toLowerCase() === CHEST_ARCHIVE)?.[1],
    ),
    shadow: shadowModelOf(
      [...cat.members].find(([path]) => path.toLowerCase() === SHADOW_ARCHIVE)?.[1],
    ),
    stages: stagesWith(area ? stagesOf(area, id) : [], triggers, id),
    castAt: (stage, step, night, globals) =>
      castOf(cat, area, id, groundAt, sheets, stage, step, night, (bit, wanted) =>
        globals ? globals.has(bit) === wanted : !wanted,
      ),
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
    buildTable: buildTableOf(rom),
    weightTables: weightTablesOf(rom),
    skillPanels: skillPanelsOf(rom),
    skillWords: skillWordsOf(rom),
    recipes: recipesOf(rom),
    potWords: englishText(rom, '/data/bin/menu/str_ren.gp2', 'str_ren_en.nat', readSystemStrings),
    potLabels: englishText(rom, '/data/bin/menu/bm_rrb.gp2', 'bm_rrb_en.bin', (bytes) =>
      messagesBy(readTableMessages(bytes, STRING_TABLE_TAG)),
    ),
    pattyWords: englishText(rom, '/data/bin/menu/str_lui.gp2', 'str_lui_en.nat', readSystemStrings),
    pattyLabels: englishText(rom, '/data/bin/menu/bm_lui.gp2', 'bm_lui_en.bin', (bytes) =>
      messagesBy(readTableMessages(bytes, STRING_TABLE_TAG)),
    ),
    abbeyWords: englishText(rom, '/data/bin/menu/str_dam.gp2', 'str_dam_en.nat', readSystemStrings),
    abbeyLabels: englishText(rom, '/data/bin/menu/bm_dama.gp2', 'bm_dama_en.bin', (bytes) =>
      messagesBy(readTableMessages(bytes, STRING_TABLE_TAG)),
    ),
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
    mapAreas: mapAreasOf(cat, code),
    doorwayRegions: doorwayRegionsOf(cat, code),
    archive,
    code,
  }
}
