import {
  dressFigure,
  type Figure,
  type FigurePiece,
  figurePieces,
  figureScale,
  Measurements,
  MOTION_FAMILY,
  type Outfit,
  type PriorMotion,
} from '@minstrel/actor'
import { type Catalogue, textureFor } from '@minstrel/cartridge'
import { FX32_ONE, type Fx32, fx32, toFloat } from '@minstrel/fixed'
import type { ActionScript } from '@minstrel/game-formats'
import {
  ActionEffect,
  ActionReach,
  type AttendingCharacter,
  afterBattle,
  areaAt,
  areaEvent,
  areasOf,
  BONE_SLOTS,
  BOOK_FLAG,
  blocksDoorway,
  type CharaColours,
  type CollisionMesh,
  type CollisionTriangle,
  conditionsOfWords,
  doorwayPlay,
  type EventOutcome,
  entryPlay,
  eventOutcome,
  FACILITY_DQVC_ONLINE,
  FACILITY_MEDALS,
  facilityFor,
  flagsHold,
  GRANTS_REGARDLESS,
  ITEM_EXPERIENCE_BONUS,
  type ItemDef,
  inArea,
  inTalkBox,
  type LevelRow,
  type LevelTable,
  type Lighting,
  MEDALS_MOST,
  MINI_MEDAL,
  modelName,
  modelNumber,
  type NpcPlacement,
  OP_EVENT,
  OP_FACILITY,
  parseMarkup,
  partName,
  QUEST_SLOTS,
  readSprite,
  type StoryArea,
  type StoryState,
  settingsPlay,
  shelfAt,
  spellsLearnt,
  TRICKS,
  type Treasure,
  trickKnown,
  trickLearntBit,
  trickPlay,
  triggerWords,
  vocationsWielding,
  watchPlay,
  wornResistances,
} from '@minstrel/game-formats'
import { type Backdrop, ModelRenderer, type Piece } from '@minstrel/gl'
import {
  type Animation,
  type Geometry,
  loopFrames,
  type MaterialAnimation,
  type Model,
  measureBounds,
  type NodeTransform,
  type PaletteInfo,
  type PatternAnimation,
  patternAt,
  poseGeometry,
  sampleAnimation,
  sampleMatTrack,
  sampleTexTrack,
  type TextureAnimation,
} from '@minstrel/nitro-gfx'
import {
  applyStyle,
  type Box,
  boxOfTriangles,
  cameraEye,
  cellsOf,
  clearDistance,
  covered,
  followCamera,
  fovOfHalfDegrees,
  INDOORS,
  keepTriangles,
  moveRelativeToCamera,
  OUTDOORS,
  occludedChunks,
  perspective,
  updateFollowCamera,
  viewMatrix,
} from '@minstrel/render'
import {
  BattleRng,
  type BattleState,
  blockChance,
  type Clock,
  COUP_OF,
  type CollisionWorld,
  type Command,
  calmFor,
  coupBonus,
  createCollisionWorld,
  createFollower,
  DropRng,
  dropsWon,
  experienceShares,
  type Fighter,
  type Filcher,
  type Follower,
  facingOff,
  fieldAmount,
  groundBelow,
  headingAngle,
  howItOpens,
  isNight,
  monsterHp,
  newClock,
  type OpenGround,
  type Opening,
  PERSON,
  type PlacedMesh,
  phaseOf,
  REST_TICKS,
  type Roamer,
  type RoamerKind,
  type Roaming,
  type RoamRules,
  resetFollower,
  type Sharer,
  STAY_TICKS,
  setPhase,
  spoils,
  startRoaming,
  tickClock,
  tickRoaming,
} from '@minstrel/sim'
import {
  backdrop,
  findSpawn,
  inMarsh,
  openGround,
  placeGeometry,
  WORLD_SCALE,
  waysOut,
} from '@minstrel/world'
import {
  ABBEY_JINGLE,
  ABBEY_LABELS,
  ABBEY_SAYS,
  type AbbeyFill,
  abbeyOpen,
  abbeyText,
  CEREMONY_MS,
  FLAG_REVOCATION,
  medalSaid,
  REVOCATION_LEVEL,
  REVOCATION_MEDALS,
  vocationSaid,
} from './abbey.ts'
import {
  type ActionRun,
  BLEND_MS,
  type Blend,
  isParty as isPartyObject,
  LOOSE_SCALE,
  MONSTER_BASE,
  PASS_MS,
  type ShowEvent,
  type StageFighter,
  startAction,
} from './action-player.ts'
import { BUILT_IN_EFFECTS, LINE_MS, makeReactions, type ReactionEvent } from './action-reactions.ts'
import { actionOf, objectOf, scriptFor } from './action-show.ts'
import { type ActorLook, actorLookOf, packMotions, packTable } from './actors.ts'
import {
  cook,
  FLAG_POT_USED,
  learnRecipe,
  OP_LEARN_RECIPE,
  POT_SAYS,
  potList,
  recipeKnown,
  tryYourLuck,
} from './alchemy.ts'
import {
  type Appearance,
  buildOf,
  CREATION_ORDER,
  faceOf,
  HAIR_VARIANTS,
  HERO_APPEARANCE,
  hairColourOf,
  hairOf,
  type ModelOf,
  makingPick,
  makingRows,
  makingTitle,
  scaleOf,
  startMaking,
  turned as turnKnob,
} from './appearance.ts'
import { gradientOf, horizonRow, LIGHTING_SLOT } from './backdrop.ts'
import { type Bag, bagLines, drop, EMPTY_BAG, pay, take } from './bag.ts'
import {
  type BattleCamera,
  type CameraStage,
  type Chase,
  cameraFrom,
  viewOf as cameraView,
  chasePose,
  followChase,
  playCamera,
  startChase,
  tickCamera,
} from './battle-camera.ts'
import {
  COMBO_SOUNDS,
  type Combo,
  comboPieces,
  leaveCombo,
  NO_COMBO,
  startCombo,
  tickCombo,
} from './battle-combo.ts'
import {
  type Arms,
  type Asked,
  type Entry,
  FOLLOW_ORDERS,
  monsterTargets,
  type Weapon,
} from './battle-commands.ts'
import { battleLog, logLine, logLongFrame, logText, motionChanges } from './battle-log.ts'
import {
  NUDGE_AT,
  type NumberKind,
  nudged,
  numberFrame,
  numberSprites,
  type RisingNumber,
  risingNumber,
} from './battle-numbers.ts'
import {
  type BattleItem,
  type BattleScene,
  type BattleSpell,
  battleBack,
  battleChoose,
  battleMenu,
  battleMove,
  battleSpellOf,
  beginBattle,
  blowOf,
  foeSpellOf,
  foeWaysOf,
  itemEntry,
  labelsOf,
  type Offered,
  RESULT_SAYS,
  type Told,
  withPages,
} from './battle-scene.ts'
import {
  type BattleScreenArt,
  type BottomView,
  drawBottom,
  drawResults,
  type PanelView,
  readBattleScreenArt,
} from './battle-screen.ts'
import { type Named, type Telling, tellBattle } from './battle-text.ts'
import { BUBBLE_SHEETS, type BubbleKind, bubbleFrame, doorAhead } from './bubbles.ts'
import { type Cabinet, cabinetsOf, cabinetTargets, searchedFrame } from './cabinets.ts'
import { type CartridgeIdentity, describeIdentity, identifyCartridge } from './cartridge-id.ts'
import { forgetCartridge, keepCartridge, keptCartridge } from './cartridge-store.ts'
import {
  castPieces,
  heldPieces,
  propPieces,
  sheetFor,
  spritePieces,
  standingFrame,
  walkingFrame,
} from './cast.ts'
import { chestFootprints, chestPieces, isChest } from './chests.ts'
import {
  type CollisionFit,
  collisionPieces,
  describeCollision,
  fitFrom,
  fitLine,
  fitMeshes,
  NO_FIT,
} from './collisionview.ts'
import {
  attendingStanding,
  COMPANION_MOTIONS,
  changeVocation,
  companionFighter,
  companionLook,
  companionModel,
  companionNamed,
  companionsAt,
  expOf,
  FOLLOW_TICKS,
  IVOR,
  levelsUp,
  type Member,
  marchingOrder,
  PARTY_MOST,
  partyAfter,
  partyRestored,
  partySaved,
  REVOCATION_FLAG,
  revocationsOf,
  revoke,
  vocationsOffered,
  wear,
  wornBy,
} from './companion.ts'
import { type Action, actionOfKey, MOVE_TOKENS, pressedActions } from './controls.ts'
import { ControlsPanel, turnHint, walkHint } from './controls-panel.ts'
import {
  BANK_MOST,
  BANK_SAYS,
  bankLimit,
  COUNTER_CANVASS,
  COUNTER_GUESTBOOK,
  COUNTER_LEAVE,
  COUNTER_SAYS,
  COUNTER_STAY,
  menuLabels,
  newDigits,
  PURSE_MOST,
  pressDigits,
  REST_PER_HEAD,
  REST_SAYS,
  THOUSAND,
} from './counter.ts'
import { lightingFor, TINTS, type TimeOfDay, timeOfPhase, ZONE_KIND_BY_TIME } from './daytime.ts'
import { doorGate, doorTaken } from './doors.ts'
import { type EquipScreens, makeEquipScreens, PORTRAIT, readEquipPieces } from './equip-screen.ts'
import {
  choicesFor,
  equip,
  mayWear,
  NOTHING_EQUIPPED,
  SEX,
  type Slot,
  slotOf,
  WEAR_WITH_ALL,
} from './equipment.ts'
import {
  BGM_FADE_FRAMES,
  type EventActor,
  type EventCamera,
  EventPlayer,
  type EventStage,
  OPACITY_WHOLE,
  sceneMotion,
} from './event.ts'
import {
  conductorLine,
  EXPRESS_PLACES,
  EXPRESS_WORDS,
  type ExpressMode,
  rideScenes,
  stopsOf,
} from './express.ts'
import {
  type Direction,
  type FlightState,
  fieldOf,
  flightFrame,
  regionIndexOf,
  SKY_MAP,
  type SkyRegion,
  skyOf,
  skyRegionOf,
  takeOff,
} from './flight.ts'
import { fpsLine, fpsMeter, LONG_FRAME_MS, resetFps, tickFps } from './fps-meter.ts'
import { axesFrom, lastSearch, readSticks, type Sticks } from './gamepad.ts'
import { HEALS, type Healer, healAll } from './heal-all.ts'
import {
  CARRY_BONES,
  type Carry,
  expAtLevel,
  expLevelledBy,
  gain,
  HERO_VOCATION_NUMBER,
  hairLetter,
  levelGainsText,
  outfitOf,
  outfitOfPreset,
  type PresetModels,
  STARTING_EQUIPMENT,
  STARTING_GOLD,
  standing,
  VOCATION_WORDS,
  weaponTurn,
} from './hero.ts'
import { type Carriers, obtain, removeSlot, takeOne, transfer } from './inventory.ts'
import { type Held, itemsRows } from './items-menu.ts'
import {
  CHURCH_JINGLE,
  CHURCH_SAYS,
  CHURCH_SERVICES,
  CURE_BASE,
  churchChoices,
  curePrice,
  INN_CANCEL,
  INN_HOLD_MS,
  INN_JINGLE,
  INN_REST,
  INN_SAYS,
  innChoices,
  innPrice,
} from './keepers.ts'
import {
  actionRecordOf,
  actionScripts,
  allTriggers,
  battleSheets,
  entranceOf,
  givenNamesFrom,
  itemDefsOf,
  keeperWords,
  type Loaded,
  load,
  mapLighting,
  menuServiceWords,
  motionSet,
  motionSpeeds,
  type Stage,
  setActionScript,
  stageMap,
  trickBubbleSheets,
} from './load.ts'
import { afterMarsh, MARSH_TICKS } from './marsh.ts'
import { exchangeLine, type MedalLine, medalText, visitMax } from './medals.ts'
import {
  back,
  changeCharacter,
  choose,
  FLAG_SKILLS_LISTED,
  labelOf,
  MENU_SAYS,
  type MenuContext,
  type MenuMember,
  type MenuSpell,
  type MenuState,
  menuCommands,
  moveCursor,
  openMenu,
  openPatty,
  openPot,
  panelLines,
  type Taken,
} from './menu.ts'
import {
  drawMinimap,
  type MinimapShown,
  type Minimaps,
  readMinimaps,
  readNameFont,
  showMinimap,
} from './minimap.ts'
import { type MonsterLook, monsterLookOf, monsterPieces } from './monsters.ts'
import { frameAt, MOTION_MS, motionMs } from './motion-speed.ts'
import {
  BATTLE_SOUNDS,
  FIELD_EFFECTS,
  music,
  playBattleSound,
  playBgm,
  playEffect,
  playJingle,
  playTrack,
  TEXT_JINGLE,
} from './music.ts'
import { NAME_MOST, rollName, tidyName } from './naming.ts'
import {
  advance,
  advanceMotion,
  type Player,
  player,
  playerPieces,
  type Solid,
  TICK_MS,
  WALK_SPEED,
} from './player.ts'
import { breakingFrame, isPotOrBarrel } from './pots.ts'
import {
  deliverAll,
  giversFor,
  newQuestBook,
  offerFor,
  type QuestBook,
  questNibble,
  questsAfter,
} from './quests.ts'
import {
  applyFor,
  callUp,
  dropOff,
  PATTY_SAYS,
  partWith,
  type Roster,
  recruitKit,
} from './recruit.ts'
import type { ResultsWindow } from './results-window.ts'
import { bagOf, readSave, SAVE_VERSION, type SaveGame, type SaveStore, writeSave } from './save.ts'
import { SceneBrowser } from './scene-browser.ts'
import { conditionsFor, firstWay, type SceneConditions, sceneIndex } from './scenes.ts'
import {
  type Counter,
  chooseInVisit,
  leaveVisit,
  moveVisit,
  type Visit,
  viewOf,
  visitShop,
} from './services.ts'
import { revealedCharacters } from './settings.ts'
import { shadowPieces } from './shadows.ts'
import {
  buy,
  POOL_MOST,
  panelsHeld,
  type SkillTreeView,
  type SkillWords,
  saidOf,
  treesOf,
  treeView,
} from './skills.ts'
import { bodyColours, faceColours, skinRamp, skinSlot } from './skin.ts'
import { aimSlides, moveSlides, type Slide, standingIn, startSlides } from './slide.ts'
import {
  type CreditCard,
  drawCard,
  drawStaffRoll,
  readCard,
  readRollFiles,
  type StaffRollRun,
} from './staff-roll.ts'
import {
  actorCloseUp,
  type BattleView,
  EYE_CEILING,
  easeOrbit,
  FIGHTER_HEIGHT,
  MONSTER_FACING,
  MONSTER_SLOTS,
  monsterExtent,
  monsterRow,
  type Orbit,
  openingStart,
  orbitOf,
  PARTY_FACING,
  PARTY_SLOTS,
  partyExtent,
  partyRow,
  placesOf,
  pulled,
  recordOfTriangle,
  sideShot,
  stageOfRecord,
  stageToFight,
  victoryView,
} from './stage.ts'
import { moveStory, type Story, swapThread, THREADS, threadOf, unstarted } from './story.ts'
import {
  drawStoryPage,
  fyggsFound,
  readStoryArt,
  STORY_START,
  type StoryArt,
  storySoFarAfter,
} from './story-so-far.ts'
import { doorShut, doorsOf, moveDoors, type SwingDoor, swingGeometry } from './swing.ts'
import {
  type After,
  afterFor,
  answerNow,
  type Conversation,
  DEFAULT_CONTEXT,
  eventsTriggered,
  facingToward,
  letterForStage,
  moveChoice,
  NEVER_TALKED,
  nextPage,
  noteOf,
  OPENING_STAGE,
  pickLine,
  promptOf,
  renderLine,
  runLine,
  type Service,
  sameStage,
  stageOrder,
  startConversation,
  TALK_REACH,
  type Talked,
  type Talker,
  type TextContext,
  type Turn,
  talkTarget,
} from './talk.ts'
import {
  findInside,
  nearestTreasure,
  renderName,
  TREASURE_MARKER,
  treasureKey,
  treasurePieces,
  treasureTargets,
  treasureText,
} from './treasure.ts'
import {
  bubbleOffset,
  type Performance,
  phaseLoops,
  startPerformance,
  stepPerformance,
  TRICK_BUBBLES,
  TRICK_SLOT,
  TRICK_SLOT_COUNT,
  TRICK_SOUNDS,
  type TrickMotions,
  type TrickShape,
  trickPack,
  trickShape,
  tricksFor,
} from './tricks.ts'
import { castOn, type Outcome, useOn, type Vitals } from './use.ts'

/**
 * Walk a village read from the player's own cartridge.
 *
 * The engine is original code; only the data comes from the cartridge, and it
 * is read on this machine and never uploaded.
 *
 * The doors lead somewhere. Where each one goes is read from the map's `.bmbl`
 * rather than from event bytecode — an earlier note here guessed the bytecode,
 * wrongly — so walking into one loads the map behind it and puts the character
 * down where that map says they come out.
 */

function must<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`page is missing ${selector}`)
  return element
}

const fileInput = must<HTMLInputElement>('#file')
const statusEl = must<HTMLDivElement>('#status')
const overlayEl = must<HTMLDivElement>('#overlay')
const minimapEl = must<HTMLCanvasElement>('#minimap')
const equipEl = must<HTMLDivElement>('#equip')
const equipTopEl = must<HTMLCanvasElement>('#equip-top')
const equipBottomEl = must<HTMLCanvasElement>('#equip-bottom')
const startEl = must<HTMLDivElement>('#start')
const createEl = must<HTMLDivElement>('#create')
const createTitle = must<HTMLHeadingElement>('#create-title')
const createRows = must<HTMLDivElement>('#create-rows')
const createHint = must<HTMLParagraphElement>('#create-hint')
const canvas = must<HTMLCanvasElement>('#gl')
const talkEl = must<HTMLDivElement>('#talk')
/**
 * The page of talk being revealed a character at a time, at the text speed
 * set in the controls panel — see `settings.ts`. Confirm while it is
 * revealing shows the rest at once, as the game's box does.
 */
let revealing:
  | { readonly body: HTMLElement; readonly text: string; readonly from: number }
  | undefined
const menuEl = must<HTMLDivElement>('#menu')
const battleBottomEl = must<HTMLCanvasElement>('#battle-bottom')
const resumeRow = must<HTMLLabelElement>('#resume-row')
const resumeEl = must<HTMLInputElement>('#resume')
const keptRow = must<HTMLDivElement>('#kept-row')
const keptSaid = must<HTMLSpanElement>('#kept-said')
const keptLoad = must<HTMLButtonElement>('#kept-load')
const keptForget = must<HTMLButtonElement>('#kept-forget')
/** What the cartridge was identified as — see `cartridge-id.ts`; undefined until one is checked. */
let identity: CartridgeIdentity | undefined

const status = (text: string) => {
  statusEl.textContent = text
}

let renderer: ModelRenderer
try {
  renderer = new ModelRenderer(canvas)
} catch (error) {
  status(error instanceof Error ? error.message : String(error))
  throw error
}

const camera = followCamera(OUTDOORS, toFloat(PERSON.height))
const measurements = new Measurements()

/**
 * How fast the right stick turns the camera, in radians a second.
 *
 * Held all the way over, a full turn takes about two seconds — quick enough to
 * spin round and see who is behind you, slow enough to aim. Tuned by eye, like
 * the walking speed.
 */
const LOOK_RATE = Math.PI
/**
 * The same for tilt.
 *
 * No limits are imposed here: the follow camera has its own — 15 to 60 degrees
 * outdoors — and it applies them every frame. Clamping to a wider range first
 * only looked like it was doing something.
 */
const TILT_RATE = Math.PI / 2

/** How much clear air there has to be past a piece for it to count as in the way. */
const CLEARANCE = toFloat(PERSON.radius)
/**
 * How far short of an obstruction the camera stops when it pulls in — see
 * `clearDistance`. A character's radius, so it scales with the world as the
 * rest of the framing does, and the near plane has somewhere to be.
 */
const CAMERA_MARGIN = toFloat(PERSON.radius)
/**
 * The side of the squares a map's shapes are cut into for deciding what is in
 * the way: two and a half character heights, about half a house. A choice —
 * smaller hides less and tests more boxes a frame. The squares are never drawn
 * as pieces of their own: that was five times the draw calls, and the frame
 * rate fell with it.
 */
const OCCLUSION_CELL = toFloat(PERSON.height) * 2.5
/** The DS plays a map's own animations at 30 frames a second. */
const MAP_FPS = 30

let loaded: Loaded | undefined
let self: Player | undefined
/**
 * The cartridge, kept so a doorway can open the map behind it.
 *
 * One reference to the bytes the player chose, never a copy: a dump is upwards
 * of 128 MiB and the loader takes a view of it.
 */
let cartridge: Uint8Array | undefined
/** The mini-map archive, read the first time a map is entered — see `minimap.ts`. */
let minimaps: Minimaps | undefined
/** This map's mini-map; undefined where it has none. */
let minimapShown: MinimapShown | undefined
/** Whether the corner shows it: `m` turns it on and off. **Ours.** */
let minimapWanted = true
/**
 * The equipment screen, its pieces read from the cartridge the first time it
 * opens — see `equip-screen.ts`. Null when they will not read, and the panel
 * is shown as text.
 */
let equipScreens: EquipScreens | null | undefined
/** Stops a doorway firing on the character it just put down. See `doors.ts`. */
const gate = doorGate()

/**
 * The controls: what each key and pad button does, changeable in the panel
 * `k` opens — see `controls.ts`. A change lets go of every held key, so a key
 * bound away cannot leave the Hero walking.
 */
const controlsPanel = new ControlsPanel(document.querySelector('#controls') as HTMLDivElement, () =>
  self?.held.clear(),
)
/** The pad's buttons as of the last frame, so a press fires once — see `pressedActions`. */
let padButtons: readonly number[] = []
/**
 * The camera-turning keys held right now.
 *
 * Kept apart from `self.held`, which is the *walk* and belongs to the Hero:
 * the camera turns whether or not there is a Hero to walk, and it turns while
 * the menu or a conversation is up, exactly as the right stick does. Held
 * state rather than a keypress, so it is read once a frame at a rate in
 * radians a second and does not depend on the browser's repeat.
 */
const turning = new Set<Action>()

/** Which way the camera is being turned this frame: −1, 0 or 1. Keys and shoulders together. */
function turningNow(): number {
  // On the equipment screen the shoulders change character, not the camera.
  if (menu?.panel === 'equip') return 0
  const held = (action: Action) =>
    turning.has(action) ||
    controlsPanel.bindings[action].buttons.some((b) => (padButtons[b] ?? 0) > 0.5)
  return (held('turnLeft') ? 1 : 0) - (held('turnRight') ? 1 : 0)
}

/** Play a music track by name and say so — see `music.ts`. */
async function startMusic(name: string): Promise<void> {
  if (!cartridge) return
  const played = await playBgm(cartridge, name)
  // `?tempo=0.9` multiplies the tempo: a knob for judging by ear, not the game's.
  const rate = Number(params.get('tempo'))
  if (played && Number.isFinite(rate) && rate > 0) music.rate(rate)
  status(
    played
      ? `♪ ${name} playing${rate > 0 ? ` at ×${rate} tempo` : ''} · b stops`
      : `no track ${name} in the music archive`,
  )
}
/**
 * The map's track, by index — see `Loaded.music`. A map naming the track
 * already playing lets it play on, so the village's theme runs into its
 * houses unbroken; going on after a battle starts it again. Both ours. An
 * address naming `?bgm=` keeps that track instead.
 */
let track: number | undefined
function playMapMusic(again = false): void {
  if (!cartridge || !loaded || params.get('bgm')) return
  const wanted = loaded.music
  if (wanted === undefined) return
  if (!again && music.playing && track === wanted) return
  track = wanted
  void playTrack(cartridge, wanted).then((name) => {
    if (!name) status(`no track ${wanted} in the music archive`)
  })
}

/**
 * **A battle's track** (`func_0209c480`, from the transition): 23 (`0x17`),
 * unless the battle has an `eventbattle.bin` record — then that record's
 * `+0x24`. The field's music is cut, not faded, for a roamer; a set battle's
 * fades over 10 (`func_0209c678`) — ours, cut here too.
 */
const BATTLE_TRACK = 0x17
function playBattleMusic(): void {
  if (!cartridge || !loaded || params.get('bgm')) return
  const own = eventFight ? loaded.eventBattles.get(eventFight.index)?.music : undefined
  const wanted = own !== undefined && own !== 0 ? own : BATTLE_TRACK
  track = wanted
  void playTrack(cartridge, wanted)
}
// For a headless check: the scene playing and its frame, readable from the page.
Object.defineProperty(window, 'minstrelScene', {
  get: () =>
    playing && {
      event: playing.event,
      frame: playing.player.stage.frame,
      hidden: [...playing.player.stage.actors].filter(([, a]) => a.hidden).map(([id]) => id),
      hung: [...playing.player.stage.actors]
        .filter(([, a]) => a.hungOn)
        .map(([id, a]) => `${id} on ${a.hungOn?.parent} ${a.hungOn?.bone}`),
    },
})
// For a headless check: the music's state, readable from the page.
Object.defineProperty(window, 'minstrelMusic', {
  get: () => ({ state: music.state, playing: music.playing, report: music.report }),
})
/** Set while a map is loading, so a doorway cannot be taken twice. */
let travelling = false
/** The map as drawn this frame, and one box per piece for deciding what is in the way. */
let mapPieces: Piece[] = []
let mapBoxes: Box[] = []
/** Which of those are backdrop — sky and the like — rather than part of the place. */
let mapBackdrop: boolean[] = []
/**
 * The map's shapes cut into chunks for deciding what is in the way — see
 * `cellsOf`: each shape's chunks as lists of its triangles, cut once per map;
 * and for every chunk, which shape and which of its chunks it is, and its box,
 * measured again with each pose.
 */
let shapeCells: number[][][] = []
let chunkShapes: number[] = []
let chunkLocal: number[] = []
let chunkBoxes: Box[] = []
let mapFrame = -1
let hiddenPieces = 0
/** Whether a pad has been seen, so the overlay can say which controls apply. */
let padSeen = false
/** The last pad read, so the overlay can show what it reports. */
let pad: Sticks | undefined
/** The cast as drawn this frame. They are not occluders and not a roof. */
let castPiecesNow: Piece[] = []
/**
 * How much to shrink a character into the world.
 *
 * One factor for everybody, the player included. The cartridge models its
 * characters in one space — the village's cast runs 9.00 to 22.96 units against
 * the player's 22.9 — so a single scale is what keeps a child a child.
 */
let characterScale = 1
/**
 * Where the story is: which of their records the cast stand at, which chapter
 * they talk from and which line they say. One for the whole game, not one per
 * map, and it opens where the slice does — see `OPENING_STAGE`. Undefined is no
 * stage at all: the file's own first placement of each character. `t` and `y`
 * move it.
 */
let storyStage: Stage | undefined = OPENING_STAGE
/** The step within the stage, and the story flags set — see `followEvent`. */
let storyStep = 0
/**
 * The step, where one is known: a stage opened without an event to set it — a
 * new game, `?stage=`, flicking with `t` — is at step 0, which no record
 * names, and then steps are not read. Ours.
 */
function stepNow(): number | undefined {
  return storyStep > 0 ? storyStep : undefined
}
const storyFlags = new Set<number>()
/**
 * **The story's five threads**, of which `storyStage`, `storyStep`,
 * `storyFlags` and `storyMarks` are the live one's copy — as the game keeps
 * them, a copy in `GameState` beside the trigger object's five records. Which
 * is live is the map's to decide — see `THREADS` in `story.ts` and
 * `enterThread`. This holds the others; the live one's entry is stale until it
 * is left.
 */
const storyThreads: Story[] = Array.from({ length: THREADS }, unstarted)
/**
 * The game-wide flags: a bank the game keeps outside the five threads, which
 * no move of the story clears — see `OP_SET_GLOBAL` in `@minstrel/game-formats`.
 */
const storyGlobals = new Set<number>()
/** The story as a record's conditions read it — see `holds` in `@minstrel/game-formats`. */
function storyState(): StoryState {
  const step = stepNow()
  return {
    flags: storyFlags,
    marks: storyMarks,
    ...(step === undefined ? {} : { step }),
    more: {
      globals: storyGlobals,
      night: timeNow() === 'night',
      quest: (quest) => questNibble(questBook, quest),
    },
  }
}
/**
 * Which thread the live story is. **Undefined when the story was put where it
 * is by hand** — a new game, a save carried on from, `?stage=`, the scene
 * browser — and then the next map entered takes it as its own thread's rather
 * than swapping it out. Ours: the game has no such state.
 */
let liveThread: number | undefined
/**
 * Take up the story thread a map is in, as the game does on entering one
 * (`func_02064b98`): the live story is kept as its thread's, and the new
 * thread's becomes the live one.
 */
function enterThread(map: number | undefined): void {
  const to = threadOf(map)
  if (liveThread === undefined || liveThread === to) {
    liveThread = to
    return
  }
  const live = { stage: storyStage, step: storyStep, flags: storyFlags, marks: storyMarks }
  swapThread(live, storyThreads, liveThread, to)
  storyStage = live.stage
  storyStep = live.step
  liveThread = to
}
/**
 * **The party, the Hero first.** Each place holds what used to be a loose
 * variable — experience, hit points, magic, seeds, what is worn — and whoever
 * an event's record has brought in and not since sent away holds the places
 * after. See `Member` in `companion.ts`, and `docs/party-and-vocations.md`
 * for the game's own four ordered slots that this is the shape of.
 *
 * Kept in the save, though only the Hero's numbers are yet written there.
 */
let members: Member[] = [heroAtStart()]

/**
 * **The party as carriers**, in party order — see `inventory.ts`. Each
 * member's list is their own, changed in place. A story companion is passed
 * over: **ours**, how the game takes a guest is not read.
 */
function carriers(): Carriers {
  const party = members
  return {
    carried: party.map((m) => {
      m.carried ??= []
      return m.carried
    }),
    fallen: (k) => party[k]?.hp === 0,
    passed: (k) => party[k]?.attnpc !== undefined,
  }
}

/** An item obtained, the game's way — see `obtain`. */
function give(id: number, count = 1, skipFallen = false): void {
  bag = obtain(bag, carriers(), loaded?.itemDefs.get(id), id, count, skipFallen).bag
}

/** One of an item taken from the party, the game's way — see `takeOne`; false when nobody has one. */
function takeAway(id: number): boolean {
  const after = takeOne(bag, carriers(), id)
  if (!after) return false
  bag = after
  return true
}
/**
 * The party trick in each of the seven slots the B Button and +Control Pad
 * reach — Up, Left, Right, Down 1 to 4, see `tricks.ts` — by number, or
 * undefined for none; set in the menu's Assign Party Tricks. The game's
 * defaults are not read: a new game starts with none assigned. Ours.
 */
let trickSlots: (number | undefined)[] = Array.from({ length: TRICK_SLOT_COUNT }, () => undefined)
/** Whether the cancel button — the game's B — is held, for a trick with a direction. */
let cancelHeld = false
/** A party trick being performed — see `tricks.ts`. */
let performing: Performance | undefined
/** The place in `performing.tricks` whose sound has been started, so each starts once. */
let performingSounded = -1
/** A, B, X or Y pressed while a lone trick holds its loop — see `stepPerformance`. */
let trickReleased = false
/**
 * The stop the Starflight Express is at, 0 for none — the field state's
 * halfword the Express's task reads (see `express.ts`): set by a record's
 * `216` and by every ride. Saved.
 */
let expressAt = 0
/** The Starflight Express in flight over the sky map — see `flight.ts`. Undefined on foot. */
let flying: FlightState | undefined
/** Milliseconds of flight not yet a tick — the Express moves at 60 ticks a second. */
let flightCarry = 0
/** The quests — their states, the log and when each was cleared; see `quests.ts`. Saved. */
let questBook: QuestBook = newQuestBook()
/** Who opened the Express's list and which conductor they are, while it is up or being answered. */
let expressBy:
  | { readonly who: Talker; readonly mode: ExpressMode; readonly stops: readonly number[] }
  | undefined

/** The Hero as a new game finds them: the slice's kit, in the vocation they are. */
function heroAtStart(): Member {
  const hero = freshMember(undefined)
  hero.outfits.set(hero.vocation, STARTING_EQUIPMENT)
  return hero
}

/** A vocation's name in the field menu's own words — `str_tm` 2100 on. */
const vocationWord = (vocation: number): string =>
  loaded?.menuWords?.get(VOCATION_WORDS + vocation) ?? `vocation ${vocation}`

/** The level table a member's experience is read against — see `Member.vocation`. */
const levelsFor = (member: Member): LevelTable | undefined => loaded?.levels.get(member.vocation)

/**
 * The Hero: the party's first place, whom the player moves and commands.
 *
 * Named for the game's own arrangement rather than for the Hero, because that
 * is what it is — `0x0200fddc`, the function the message system asks who a
 * speaker should turn to face, is simply "slot 0".
 */
/**
 * Those left with Patty at the Quester's Rest — see `recruit.ts`. A character
 * is in the party or on this list, never both.
 */
let withPatty: Member[] = []

const leader = (): Member => members[0] as Member

/** The place an attending character holds, if they are along. */
const memberOf = (attnpc: number): Member | undefined =>
  members.find((member) => member.attnpc === attnpc)

/** A place with nothing in it yet: whole, at no experience, wearing the start. */
function freshMember(attnpc: number | undefined): Member {
  return {
    attnpc,
    hp: undefined,
    mp: undefined,
    exp: new Map(),
    // **Ours, and a stand-in.** Everyone starts as the Minstrel the Hero is,
    // because what vocation an attending character has is not read — `attnpc`
    // carries a level, stats, a weapon and a shield, and no vocation at all.
    vocation: HERO_VOCATION_NUMBER,
    held: new Set([HERO_VOCATION_NUMBER]),
    appearance: undefined,
    look: undefined,
    sex: undefined,
    name: undefined,
    gains: {},
    // **Only the Hero starts in the slice's kit.** `freshMember` is used for
    // the Hero at the start, for a story companion joining, and for a created
    // character being recruited; of the three only the first has any claim on
    // `STARTING_EQUIPMENT`, so it is the caller's to give — see `heroAtStart`.
    outfits: new Map(),
    // Nothing earned and nothing spent. Points come with levels — see
    // `earnSkillPoints` — and a story companion, who does not level, earns
    // none, which is right: they have no skill screen in the game either.
    skillPool: 0,
    treePoints: new Map(),
    revocations: new Map(),
  }
}
/**
 * Where cast members stand that an event moved and left there, by placement
 * id — see {@link castPlaced}. Ours: kept until the story's step next moves or
 * the map changes, as the Hexagon's figure waits by the statue at 2.4, step 3.
 */
const castLeft = new Map<number, { x: number; y: number; z: number; facing: number }>()

/**
 * The speaker's facing while a conversation is open, and the facing they had
 * before it — see `turnSpeaker`.
 *
 * **Every message the game shows turns the speaker to face the player.** The
 * leading-tag pass at `0x0206a3c0` sets the target angle to
 * `atan2(player − npc)` before it reads a single tag, and the turn markup only
 * ever overrides that: `<N_TURN>` suppresses it, `<R_TURN>` and
 * `<END_R_TURN>` send them back, `<TURN=n>` gives an absolute angle. See
 * `docs/event-scripts.md` §7a.
 *
 * One record, because one conversation is open at a time — which is how the
 * game holds it too: the message window keeps a single actor handle at
 * `+0x1838` and the facing it had at `+0x183c`.
 *
 * `was` is captured before the first turn, so `castPlaced` gives the un-turned
 * facing at that moment.
 */
let turned: { id: number; was: number; facing: number } | undefined

/**
 * A cast member's placement as it stands now: where the event playing has it,
 * when one of its characters is that member (`EventActor.cast`, INFERRED from
 * `566(5, id, …)`); or where an event left it (`castLeft`); or else its own.
 */
/** The cover over the 3D view that a scene's fades darken — see `showDarkness`. */
const fadeEl = document.querySelector<HTMLDivElement>('#fade')

/**
 * A scene that ends in the dark leaves the field to come back: black a while,
 * then clearing. Ours, both, from a let's play's measure: after `ev02500` and
 * `ev02510` the screen stays black for about half a second and more, then the
 * field comes back over about a third of one.
 */
const RETURN_HOLD_MS = 500
const RETURN_FADE_MS = 300
/**
 * A doorway being gone through: the screen goes black, the map changes behind
 * it, and the field comes back. The let's play shows a fade through every
 * door; its length is ours.
 */
const DOOR_FADE_MS = 250
let doorFade:
  | { readonly since: number; readonly door: NonNullable<ReturnType<typeof doorTaken>> }
  | undefined
let returning: { readonly from: number; readonly since: number } | undefined

/** A frame of the game's, ms: its ticks are taken at 60 a second — the tick source is not read. */
const FRAME_MS = 1000 / 60
/** The swirl (`func_0204700c`): done past 35 ticks; from past 15 both screens to black over 20 frames. */
const SWIRL_TICKS = 35
const SWIRL_DARK_AFTER = 15
const SWIRL_DARK_FRAMES = 20
/** It turns the field's camera by −8° a tick and narrows its half-angle from 15° by 0.4333° a tick. */
const SWIRL_ROLL = 8
const SWIRL_FOV_FROM = 15
const SWIRL_FOV_STEP = 0.4333
/** Both screens up from black over 15 frames as the opening's camera begins (`SetBrightness(0, 15)`, ov026 `0x021d9d18`). */
const BATTLE_UP_MS = 15 * FRAME_MS
/** The opening's line closes itself 45 ticks after it is up (`<TIME=45><CLOSE>`, `func_ov026_021dd8a8`); no key is read. */
const OPENING_LINE_MS = 45 * FRAME_MS
/** A flight's line closes itself 30 frames after it is up (state 11); no key is read. */
const FLIGHT_LINE_MS = 30 * FRAME_MS
/** Leaving: both screens to black over 15 frames (`SetBrightness(−16, 15)`, ov000 `0x02168768`). */
const BATTLE_OUT_MS = 15 * FRAME_MS
/** Then the field's own screen up over 30 (`SetMainBrightness(0, 30)`, ov017 `0x021b7f3c`). */
const FIELD_UP_MS = 30 * FRAME_MS
/** A wipe-out holds the last frame 1000 ms before its line (state 10). */
const WIPE_HOLD_MS = 1000
/** The jingles, `bgm.sdat`'s sequences: the victory's `ME_005`, the wipe-out's `ME_009`. */
const VICTORY_JINGLE = 0x36
const WIPED_OUT_JINGLE = 0x3a

/** The swirl into a battle, while it runs — see {@link startFight}. */
let entering: { readonly since: number; readonly begin: () => void } | undefined
/** A fade of both screens, 0 lit to 1 black, and what follows it — see {@link battleDarkness}. */
let screenFade:
  | {
      readonly from: number
      readonly to: number
      readonly since: number
      readonly ms: number
      readonly done?: () => void
    }
  | undefined
/** Whether the battle is on its opening's lines, which close themselves. */
let inOpening = false
/** Whether the battle is going, the screens fading to black. */
let leaving = false
/** What the battle's end has started: the victory's or the wipe-out's music and shot, once. */
let ending: { readonly kind: 'won' | 'lost'; readonly since: number } | undefined

/** The swirl's tick now, and the camera's turn and half-angle at it. */
function swirlAt(
  now: number,
): { readonly tick: number; readonly roll: number; readonly halfFov: number } | undefined {
  if (!entering) return undefined
  const tick = Math.floor(Math.max(0, now - entering.since) / FRAME_MS) + 1
  const degrees = ((((-SWIRL_ROLL * tick) % 360) + 540) % 360) - 180
  return {
    tick,
    roll: (degrees * Math.PI) / 180,
    halfFov: Math.max(0.5, SWIRL_FOV_FROM - SWIRL_FOV_STEP * tick),
  }
}

/**
 * **How dark the battle has the screens**: the swirl's fade to black, the set-up
 * in the black and the fade up, and leaving — see {@link startFight} and
 * {@link leaveFight}. 0 lit, 1 black.
 */
function battleDarkness(now: number): number {
  const swirl = swirlAt(now)
  if (swirl && entering) {
    if (swirl.tick > SWIRL_TICKS) {
      const { begin } = entering
      entering = undefined
      camera.roll = 0
      begin()
      screenFade = battle ? { from: 1, to: 0, since: now, ms: BATTLE_UP_MS } : undefined
      return 1
    }
    return swirl.tick > SWIRL_DARK_AFTER
      ? Math.min(1, (swirl.tick - SWIRL_DARK_AFTER) / SWIRL_DARK_FRAMES)
      : 0
  }
  if (!screenFade) return 0
  const t = Math.min(1, Math.max(0, (now - screenFade.since) / screenFade.ms))
  const dark = screenFade.from + (screenFade.to - screenFade.from) * t
  if (t >= 1) {
    const { done } = screenFade
    screenFade = undefined
    done?.()
  }
  return dark
}

/**
 * **Leave the battle as the game does**: both screens to black over 15
 * frames (state 4), the battle freed and the field back (state 6), and the
 * field's own screen up over 30 (`func_ov017_021b790c`).
 */
function leaveFight(): void {
  if (leaving) return
  leaving = true
  screenFade = {
    from: 0,
    to: 1,
    since: performance.now(),
    ms: BATTLE_OUT_MS,
    done: () => {
      leaving = false
      endFight()
      screenFade = { from: 1, to: 0, since: performance.now(), ms: FIELD_UP_MS }
    },
  }
}

/** Darken the 3D view as the scene playing says, or bring the field back after one. */
function showDarkness(stage: { readonly darkness: number } | undefined, now: number): void {
  let dark = 0
  if (stage) {
    dark = stage.darkness
  } else if (doorFade) {
    dark = Math.min(1, (now - doorFade.since) / DOOR_FADE_MS)
    if (dark >= 1) {
      // Black: change the map behind it — the load blocks, and the screen
      // stays black for it — then clear without the hold a scene's end has.
      const { door } = doorFade
      doorFade = undefined
      goThrough(door)
      returning = { from: 1, since: performance.now() - RETURN_HOLD_MS }
    }
  } else if (returning) {
    const t = (now - returning.since - RETURN_HOLD_MS) / RETURN_FADE_MS
    dark = returning.from * Math.min(1, Math.max(0, 1 - t))
    if (t >= 1) returning = undefined
  }
  dark = Math.max(dark, battleDarkness(now))
  if (fadeEl) fadeEl.style.opacity = String(dark)
}

/**
 * How much of a cast member shows now, from 0 to 1: its event character's
 * opacity while an event plays one of them — see `EventActor.opacity` — else whole.
 */
function castOpacity(id: number): number {
  for (const actor of playing?.player.stage.actors.values() ?? []) {
    if (actor.cast === id && actor.placed) return actor.opacity / OPACITY_WHOLE
  }
  return 1
}

/**
 * A cast member's placement as it stands now: where the event playing has it,
 * when one of its characters is that member — see `castOpacity` for how much
 * of it shows then — or where an event left it; or else its own.
 */
function castPlaced<P extends NpcPlacement>(placement: P): P {
  // Being talked to turns only the head, so to speak: it overrides the facing
  // whatever decided the position, and an event that has hold of the character
  // still says where they stand.
  const looking = turned?.id === placement.id ? turned.facing : undefined
  const facing = (p: P): P => (looking === undefined ? p : { ...p, facing: looking })
  for (const actor of playing?.player.stage.actors.values() ?? []) {
    if (actor.cast === placement.id && actor.placed) {
      return facing({ ...placement, x: actor.x, y: actor.y, z: actor.z, facing: actor.facing })
    }
  }
  const left = castLeft.get(placement.id)
  return facing(left ? { ...placement, ...left } : placement)
}
/**
 * The second set of flags, "marks" — see `OP_IF_MARK` in `@minstrel/game-formats`.
 * Cleared with the story's flags when the stage moves on, and not yet saved —
 * both **ours**.
 */
const storyMarks = new Set<number>()
/**
 * Which chapter's talk files are read: an index into `loaded.letters`, or
 * undefined to follow the stage — see `letterForStage`. `v` and `b` move it.
 */
let chapterIndex: number | undefined
/** Who is being talked to, and how far through what they say. */
let talking: Conversation | undefined
/** The main menu while it is up — see `menu.ts`. */
let menu: MenuState | undefined
/**
 * The treasure opened this session, by `treasureKey` — its game-wide number, so
 * it stays open whichever way the Hero comes back. Not saved yet.
 */
const openedTreasure = new Set<string>()
/** When each pot or barrel opened this visit was smashed, by its treasure key — see `pots.ts`. */
const smashedAt = new Map<string, number>()
/**
 * Which of the four weight tables each of the game's eight ways of choosing
 * draws by, in the order `readWeightTables` finds them — the even, the
 * falling, the steep and the fourth. Types 3, 5, 6 and 7 pick another way
 * altogether (a round robin, a pair and a coin, two passes) and are not
 * modelled; they fall to the even table, which is **ours**.
 */
const WAYS_BY_AI: Readonly<Record<number, number>> = { 0: 0, 1: 1, 2: 2, 4: 3 }

/** What the Hero carries — see `bag.ts` — starting from the purse the slice opens with, `STARTING_GOLD`. */
let bag: Bag = take(EMPTY_BAG, { gold: STARTING_GOLD })
/** The shop, inn or church being visited — see `services.ts`. */
let visit: Visit | undefined
/** What the conversation is read with: the defaults, or those with the inn's price. */
let talkContext: TextContext = DEFAULT_CONTEXT
/** The battle under way — see `battle-scene.ts`. */
let battle: BattleScene | undefined
/** Each fighter's look and where it stands, by its place in the battle; the Hero's are undefined. */
let battleLooks: (MonsterLook | undefined)[] = []
let battleSpots: ({ x: number; y: number; z: number } | undefined)[] = []
/**
 * **The stage the battle is fought on**, while it lasts — see `stage.ts`. The
 * field is not drawn meanwhile, and the Hero's field place is left as it was,
 * so nothing needs putting back: the game keeps the party's field places and
 * restores them after (`func_ov000_021643d4`, `0x02168d08`), and this never
 * moves them.
 */
let battleStage: BattleStage | undefined

interface BattleStage {
  /** Its id in the map list, and its code. */
  readonly id: number
  readonly code: string
  /** The stage's origin in the world as drawn: where the Hero stood when it began. */
  readonly origin: { readonly x: number; readonly y: number; readonly z: number }
  /** Its models, placed about the origin. */
  readonly pieces: readonly Piece[]
  /** Its lighting — the sky's gradient behind it, see `backdrop.ts`. */
  readonly lighting: Lighting | undefined
  /** The lighting slot it is drawn by, the clock's as the battle was asked for — see `startFight`. */
  readonly slot: number
  /** Everyone's place on it as drawn, the party then the monsters, and their facings in radians. */
  readonly spots: readonly {
    readonly x: number
    readonly y: number
    readonly z: number
    readonly facing: number
  }[]
  /** Everyone's place in the stage's own space, map units, and facing in radians — the close-ups' frames. */
  readonly places: readonly { readonly x: number; readonly z: number; readonly facing: number }[]
  /** Everyone's height, map units: a monster's body, a party member's ours — see `openStage`. */
  readonly heights: readonly number[]
  /** Everyone's size in battle, `Object3D +0x18e`: a monster's record's, 1 for the party. */
  readonly sizes: readonly number[]
  /** The camera: what it holds now, the view's half-angle, and the opening's end while it eases. */
  view: BattleView
  halfFov: number
  easing: Orbit | undefined
  /** Whether the opening has come in; the fight's own shots wait for it. */
  opened: boolean
  /** Which shot the view is, so a change is a cut. */
  showing: string
  carry: number
  /** Everyone's radius, map units: a monster's body, a party member's ours — see `openStage`. */
  readonly radii: readonly number[]
  /** Everyone's row, map units — where formation 0 puts them (`func_ov000_02167e6c`). */
  readonly rows: readonly { readonly x: number; readonly z: number; readonly facing: number }[]
  /** The monsters' bodies, which their row and its extent are fitted to — see `stage.ts`. */
  readonly bodies: readonly {
    readonly kind: number
    readonly radius: number
    readonly height: number
  }[]
  /** The opening's wide shot, which the command phase cuts to each round, and its half-angle. */
  readonly commandShot: BattleView
  readonly commandHalfFov: number
  /** Its eye's z on the stage, which the monsters face while commands are chosen (`func_ov026_021daec8`). */
  readonly commandEyeZ: number
  /** How many actions have passed without the chase's start pose — see `chaseFor`. */
  unchased: number
  /** The draws the camera's choices take, ours: a number each. */
  draws: number
}

/**
 * **The action on show**, while its page is — its script played by
 * `action-player.ts`, its results shown by `action-reactions.ts`, the camera
 * it moves by `battle-camera.ts`. FORMAT.md, "The action scripts".
 */
interface ActionShown {
  /** The page it was made for: the battle's clock as the page began. */
  readonly page: number
  readonly run: ActionRun
  readonly reactions: ReturnType<typeof makeReactions>
  readonly camera: BattleCamera
  /** Pages after its own that it tells too — a death it dealt — and passes over when it ends. */
  readonly absorbs: number
  /** The chase shot, while the script has moved no camera — see `chaseFor`. */
  chase: Chase | undefined
  /** Real time not yet played, ms. */
  carry: number
}
let shown: ActionShown | undefined
/** Those whose death a battle has shown, by object index: a monster gone, one of the party lying. */
let fallenShown = new Set<number>()
/** The last action shown — a second blow on the same target plays the second section keyed 1. */
let lastShown:
  | { readonly actor: number; readonly action: number; readonly target: number | undefined }
  | undefined
/** When the battle's page on show began, which its monsters' motions play from. */
let cueStarted = 0
/**
 * The event playing, if one is — see `event.ts`: its player, its number, its
 * messages, the message the text box shows, time left over between ticks, and
 * the follow camera's framing to give back when it ends.
 */
let playing:
  | {
      readonly player: EventPlayer
      /** Which script is running: the one started, or whatever `538` chained. */
      event: number
      /** That script's own messages — a chain brings its own. */
      messages: ReadonlyMap<number, string>
      showing: number | undefined
      carry: number
      readonly framing: { pitch: number; distance: number; yaw: number }
      /** A script `538` chained into that plays in another map, waiting for it — see `startEvent`. */
      chainAway?: { readonly map: number; readonly event: number }
    }
  | undefined
/**
 * How far above a point the floor is looked for, which the game's own probe
 * starts from: ten, the constant `231` and `232` carry in place of a height.
 */
const GROUND_PROBE = 10

/** The most monsters a battle here holds: ours, so the row stays in view. */
const BATTLE_MOST = 5
/**
 * Footsteps behind the Hero: a trail for each place in the party after
 * theirs, each a pace further back — see `follow.ts`; begun anew in each map.
 */
let trails: Follower[] = []
/**
 * `PARTY_MOST - 1` and not `PARTY_MOST` because **the Hero follows nobody** —
 * `trails[i]` belongs to `members[i + 1]`. That stays right now the Hero is
 * member 0, and it was right before; the sizing was never the thing the old
 * shape got wrong.
 */
/** Which way each place in the line faces in the field, and whether its footsteps moved this frame. */
const trailFacing = new Float64Array(PARTY_MOST - 1)
const trailWalking = new Uint8Array(PARTY_MOST - 1)
/** Where each trail stood before this frame's ticks, x and z, to tell who walked. */
const trailWas = new Int32Array((PARTY_MOST - 1) * 2)
/** Moving ticks walked in the poison marsh and not yet paid for — see `marsh.ts`. */
let marshCarry = 0
/** One of those beside the Hero in the battle under way: who, their place in it, and their look. */
interface BattleCompanion {
  /** Their number in `attnpc`; undefined for a created character. */
  readonly id: number | undefined
  readonly index: number
  /** Their place in the party, which is their place in `dressed` too. */
  readonly place: number
  /**
   * The whole model a story companion is drawn from, and its motion packs.
   * **Undefined for a created character**, who is built out of parts like the
   * Hero and posed from `dressed` instead — see `companionPiecesOf`.
   */
  readonly model: string | undefined
  readonly packs: readonly string[]
}
let battleCompanions: readonly BattleCompanion[] = []
/** The member behind each of the party's fighters, by fighter — see `openFight`. */
let battleMembers: readonly Member[] = []
/** Battles fought this session, which seeds the next one's numbers. */
let battlesFought = 0
/**
 * The monsters `p` fights: `?fight=` codes, or two slimes. A stand-in while
 * encounters are not read — they are M6's. Read when the key is pressed, as
 * the page's parameters are declared further down.
 */
function fightCodes(): string[] {
  return (params.get('fight') ?? 'z000a,z000a').split(',').filter((code) => code !== '')
}
/** Shift+P fights the slice's boss, Hexagoon, from whom there is no running. */
const BOSS_FIGHT = ['b003a']
/**
 * The set battle being fought, the map it began in, and — once settled —
 * whether it was won: what follows it is that map's record for the outcome —
 * see `afterBattle` in `@minstrel/game-formats`.
 */
let eventFight: { index: number; map: number | undefined; won?: boolean } | undefined
/**
 * Fight set battle `index` — see `readEventBattles` — its monsters by their
 * codes, as many of each as it says. There is no running from one: **ours**,
 * as the boss's is; whether each set battle allows it is not read.
 */
function startEventBattle(index: number): void {
  const found = loaded?.eventBattles.get(index)
  const codes = (found?.foes ?? []).flatMap(({ monster, count }) => {
    const code = loaded?.monsterCodeOf.get(monster)
    return code ? Array<string>(count).fill(code) : []
  })
  if (!found || codes.length === 0) {
    status(`set battle ${index} is not in the event battles, or names no monster read`)
    return
  }
  eventFight = { index, map: loaded?.mapId }
  startFight(codes, false)
}

/**
 * What follows a set battle: the flags its map's record for the outcome sets,
 * and the event it plays — Patty's thanks after Hexagoon, `ev02550`.
 */
function followBattle(fought: { index: number; map: number | undefined; won?: boolean }): void {
  if (!loaded || fought.won === undefined) return
  const after = afterBattle(loaded.triggers, fought.index, fought.won, fought.map, storyState())
  if (!after) return
  // Everything its record does, won or lost: at the Tower of Trades at 6.4 the
  // story moves on either way.
  storyFromRecord(after.outcome)
  if (after.event !== undefined && fought.won) startEvent(after.event)
}
/**
 * How the field's monsters roam — see `tickRoaming`. **All of it ours**: the
 * game's spawning is in its code, not its data. Distances go by a person.
 */
const ROAM_RULES: RoamRules = {
  most: 3,
  near: fx32(PERSON.height * 6),
  far: fx32(PERSON.height * 10),
  vanish: fx32(PERSON.height * 16),
  touch: fx32(Math.round(PERSON.height * 0.6)),
  spawnEvery: 90,
  turnEvery: 60,
  shape: PERSON,
}
/** Ticks after arriving during which walking into a monster starts nothing. Ours. */
const ROAM_CALM = 120
/**
 * Ticks after a battle during which walking into a monster starts nothing:
 * the party's `+0xc3` set to 150 as the field comes back (`func_ov017_021b790c`,
 * `0x021b7bd4`). INFERRED: what the count holds off is an encounter. The game
 * keeps it on the party; here it is the field's calm.
 */
const AFTER_BATTLE_CALM = 150
/** The field's monsters, where the map has a zone — see `beginRoaming`. */
let roaming: Roaming | undefined
let roamKinds: RoamerKind[] = []
/** The zone roamed. */
let roamZone: number | undefined
let roamCarry = 0
/** The field's own numbers: one generator for the session, so the field is reproducible. */
const roamRng = new BattleRng(0x5eedf1e1dn)
/**
 * What a battle's drops are rolled from — the game draws these from the C
 * library's generator, not the battle's or the world's, so a drop costs a
 * battle no draw. **Ours**: the seed, as the game's own is not found.
 */
const dropRng = new DropRng(0x5eed0d09)
/** The markers where the map's treasure is — see `treasure.ts`. */
let treasureDrawn: Piece[] = []
/** The map's doors, and how far each has swung — see `swing.ts`. */
let doors: SwingDoor[] = []
/** The map's sliding pieces, and where each stands — see `slide.ts`. */
let slides: Slide[] = []
/** The map's cabinets, and the motion each is playing — see `cabinets.ts`. */
let cabinets: Cabinet[] = []
/** Talk-target ids from here on are cabinets, so they cannot be taken for a placed treasure. */
const CABINET_TARGET = 10_000

/** Draw the map for one frame of its own animations. */
function poseMap(frame: number): void {
  if (!loaded) return
  // **The map's own clock**: a plain piece's animations advance a frame every
  // 17 ms, all four kinds alike, each round on its full count
  // (`func_02015554`, `Animation3D::AdvanceTimer`); `frame` counts redraws.
  const time = mapTime(frame)
  const cat = loaded.catalogue
  const drawn: Piece[] = []
  for (const [pieceIndex, piece] of loaded.map.pieces.entries()) {
    const { model, animation } = piece
    const swung = doors.find((door) => door.piece === pieceIndex)?.angle ?? 0
    const slid = slides.find((slide) => slide.piece === pieceIndex)?.offset
    const grow = roomScale * worldScale
    const scale = piece.scale * grow
    const place = {
      x: (piece.place.x + (slid?.x ?? 0)) * grow,
      y: piece.place.y * grow,
      z: (piece.place.z + (slid?.z ?? 0)) * grow,
    }
    // Each shape has its own matrix stack, because a model reuses slots between
    // shapes. A map's models each drive themselves.
    // A cabinet stands where its motion has it; everything else loops its own.
    const cabinet = cabinets.find((c) => c.piece === pieceIndex)
    // A cabinet rests with no animation on it until it is searched — see `searchedFrame`.
    const at = cabinet
      ? cabinet.searched === undefined
        ? undefined
        : searchedFrame(cabinet.motions, time - cabinet.searched)
      : time
    const stacks =
      animation && animation.boneCount === model.nodes.length && at !== undefined
        ? model.pose(posedNodes(model, animation, at))
        : model.shapeMatrices

    const shade = piece.materialAnimations
      ? materialShade(piece.materialAnimations, model, cat, time, true)
      : undefined
    model.shapes.forEach((shape, index) => {
      const geometry: Geometry = placeGeometry(
        swingGeometry(poseGeometry(model.geometry(shape), stacks[index] ?? model.matrices), swung),
        place,
        // The piece's own scale, which `assembleMap` worked out: an eighth for
        // a piece instanced from the larger space, and the map's own scale for
        // the map itself — an eighth again indoors.
        scale,
      )
      const materialIndex = model.shapeMaterials[index]
      const material = materialIndex === undefined ? undefined : model.materials[materialIndex]
      const texture = material ? textureFor(cat, material) : undefined
      const plain: Piece = texture ? { geometry, ...texture } : { geometry }
      // Its own texture, material and pattern animations — water, fire, a
      // sign's glow — looping as the map's joint animations do. A shape whose
      // alpha is 0 now is kept, unseen, so the shapes keep their places.
      const shaded = shade ? shade(material?.name, plain) : plain
      drawn.push(shaded ?? { ...plain, opacity: 0 })
    })
  }
  // Each shape's own box decides what counts as a roof and what is backdrop;
  // the cast is neither, so it is measured before they are added.
  mapBoxes = drawn.map((piece) => measureBounds([piece.geometry]))
  mapBackdrop = backdrop(mapBoxes, (world ?? loaded.world)?.bounds)
  mapPieces = drawn
  // What is in the way is decided a chunk at a time — see `occludedChunks`. A
  // map's triangles keep their order from pose to pose, so it is cut once.
  if (shapeCells.length !== drawn.length) {
    const cell = OCCLUSION_CELL * roomScale * worldScale
    shapeCells = drawn.map((piece) => cellsOf(piece.geometry, cell))
    chunkShapes = shapeCells.flatMap((cells, shape) => cells.map(() => shape))
    chunkLocal = shapeCells.flatMap((cells) => cells.map((_, local) => local))
  }
  chunkBoxes = chunkShapes.map((shape, chunk) =>
    boxOfTriangles(
      (drawn[shape] as Piece).geometry,
      shapeCells[shape]?.[chunkLocal[chunk] as number] ?? [],
    ),
  )
  refit()
  castPiecesNow = [
    // Where an event has them, or left them — see `castPlaced`.
    // Bar one a scene is drawing itself — see `takenOverModel`.
    ...loaded.cast.members.flatMap((member) =>
      takenOver(member.placement.id)
        ? []
        : castPieces(
            { ...member, placement: castPlaced(member.placement) },
            cat,
            characterScale,
            // At its idle's own speed, every 17 ms (`motion-speed.ts`); without one, the map's frame.
            member.speed !== undefined ? time * member.speed : frame,
          ),
    ),
    // The 2D cast faces the camera, so it is rebuilt in the frame loop rather
    // than here; this is only its first placement before anyone has moved.
  ]
}

function posedNodes(
  model: { nodes: readonly NodeTransform[] },
  animation: Parameters<typeof sampleAnimation>[0],
  frame: number,
): NodeTransform[] {
  const local = sampleAnimation(animation, frame % animation.frameCount)
  return model.nodes.map((node, i) => {
    const posed = local[i]
    return posed ? { ...node, local: posed } : node
  })
}

/**
 * Take the cartridge the player chose and open the first map.
 *
 * The bytes are taken as they arrive rather than through a `Blob`: a dump is
 * upwards of 128 MiB and going through one costs a second copy and, in some
 * browsers, a spill to disk. Only this one array is held.
 */
/**
 * A new game or a kept one, from the cartridge's bytes.
 *
 * **Resolves when the world is open**, which is not always at once: the
 * Hero's creation runs before the map is entered, and the caller has work
 * that must wait for the map — the entry door, and the title `tools/shot`
 * watches. See `askCreation`.
 */
function begin(bytes: Uint8Array, map: string): Promise<void> {
  startEl.hidden = true
  // Kept for the rest of the session: every doorway taken reads the cartridge
  // again for the map behind it.
  cartridge = bytes
  minimaps = undefined
  equipScreens = undefined
  // Carry on from the last confession, unless the player asked for a new game.
  const saved = resumeEl.checked ? savedGame : undefined
  if (saved) {
    restore(saved)
    if (enter(saved.map, saved.at)) {
      // Saved in flight, the Express is where the Hero was — see `flight.ts`.
      if (loaded?.mapId === SKY_MAP)
        flying = takeOff(
          Math.round((saved.at.x / WORLD_SCALE) * 4096),
          Math.round((saved.at.z / WORLD_SCALE) * 4096),
        )
      return Promise.resolve()
    }
  }
  // A new game may begin by making the Hero, which is where the game begins
  // too — but only when asked for. See `askCreation`.
  if (params.get('create') === '1') return askCreation(map)
  openWorld(map)
  return Promise.resolve()
}

/**
 * **The Hero's own character creation, at the front door.**
 *
 * *Where the game puts it*: scene 21 `charamake`, which `main` loads when its
 * game mode is 2 — read from the mode dispatch at `0x0200111c`, whose arm at
 * `0x02001184` calls `LoadScene(0x15)`, against the scene table at
 * `0x020e8f20`. **Mode 2 is set in exactly one place**, `ov004 0x0216d19c`,
 * the boot menu that also sets the modes for the staff roll and the rest; so
 * the game makes the Hero **straight off the title screen, before any map**.
 * The screens it drives are overlay 9's — **the same ones Patty's step 4
 * drives for a recruit** — which is why the walk itself is shared; see
 * `Making` in `appearance.ts`.
 *
 * *So ours sits where the game's sits*: before the world, off the front
 * screen. What is ours is only that it is asked for with `?create=1` rather
 * than by a New Game item on a title screen, because there is no title screen
 * yet. The Observatory prologue is **not** what triggers it: the flag at
 * `[GameState+0x6000+0x3D6]` sets mode **3**, which loads scene 16
 * `movieview`. An earlier note here had that wrong.
 */
/**
 * Creation's eighth screen: the name, typed, or rolled from the game's own
 * given names for the character's sex. Resolves with it once it is done.
 * The screen is the creation panel's; the keyboard is this machine's — see
 * `naming.ts` for why, and for what is read.
 */
/** Whether the name screen is up — Patty's menu keeps out of its way. */
let naming = false

function askName(sex: number, who: string): Promise<string> {
  return new Promise((done) => {
    naming = true
    createEl.hidden = false
    createTitle.textContent = `Name — 8 of 8`
    const field = document.createElement('input')
    field.type = 'text'
    field.maxLength = NAME_MOST * 2
    field.spellcheck = false
    field.autocomplete = 'off'
    field.placeholder = `up to ${NAME_MOST} letters`
    const roll = document.createElement('button')
    roll.type = 'button'
    roll.textContent = 'Roll a name'
    const ok = document.createElement('button')
    ok.type = 'button'
    ok.textContent = 'OK'
    const names =
      loaded?.givenNames ?? (cartridge ? givenNamesFrom(cartridge) : { male: [], female: [] })
    // Ours: which of the list comes up is not the game's roll — see `naming.ts`.
    const draw = (count: number) => {
      const one = new Uint32Array(1)
      crypto.getRandomValues(one)
      return (one[0] as number) % count
    }
    const settle = () => {
      const name = tidyName(field.value)
      ok.disabled = name === ''
      createHint.textContent = name
        ? `${who} will be called ${name}.`
        : `What is ${who} called? Type one, or roll one of the game's own.`
    }
    const finish = () => {
      const name = tidyName(field.value)
      if (name === '') return
      createEl.removeEventListener('keydown', guard)
      createEl.hidden = true
      naming = false
      done(name)
    }
    // Typing a name is not walking, or talking to whoever is in front of you.
    const guard = (event: KeyboardEvent) => {
      event.stopPropagation()
      if (event.key === 'Enter') finish()
    }
    createEl.addEventListener('keydown', guard)
    field.addEventListener('input', () => {
      // Kept to eight letters as they are typed, as the game's eight slots are.
      const tidy = [...field.value].slice(0, NAME_MOST).join('')
      if (tidy !== field.value) field.value = tidy
      settle()
    })
    roll.addEventListener('click', () => {
      field.value = rollName(names, sex, draw) ?? field.value
      settle()
    })
    ok.addEventListener('click', finish)
    createRows.replaceChildren(field, roll, ok)
    settle()
    field.focus()
  })
}

function askCreation(map: string): Promise<void> {
  let making = startMaking()
  const modelOf = cartridge ? itemModels(itemDefsOf(cartridge)) : undefined
  let opened: () => void
  const draw = () => {
    createTitle.textContent = makingTitle(making)
    createRows.replaceChildren(
      ...makingRows(making, modelOf).map((shown, at) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = shown
        button.addEventListener('click', () => took(at))
        return button
      }),
    )
    createHint.textContent = `Making the Hero — screen ${making.at + 1} of ${CREATION_ORDER.length}.`
  }
  const took = async (at: number) => {
    const picked = makingPick(making, at, modelOf)
    if ('next' in picked) {
      making = picked.next
      draw()
      return
    }
    // The eighth screen, the name — see `naming.ts`.
    const name = await askName(picked.made.sex, 'the Hero')
    createEl.hidden = true
    const hero = leader()
    hero.look = picked.made
    hero.sex = picked.made.sex
    hero.name = name
    openWorld(map)
    dressParty()
    status(
      `the Hero: ${appearanceRows(hero)
        .map((row) => `${row.label} ${row.shown}`)
        .join(' · ')}`,
    )
    opened()
  }
  const open = new Promise<void>((resolve) => {
    opened = resolve
  })
  createEl.hidden = false
  draw()
  return open
}

/** How a preset of `sex` draws its face and hair items — see `PresetModels`. */
function presetModels(sex: number | undefined): PresetModels | undefined {
  const defs = loaded?.itemDefs
  if (!defs || sex === undefined) return undefined
  const woman = sex === SEX.female
  return {
    woman,
    part: (item) => {
      const def = defs.get(item)
      return def ? modelName(def, woman) : undefined
    },
    number: (item) => {
      const def = defs.get(item)
      return def ? modelNumber(def, woman) : undefined
    },
  }
}

/** An item's model number for a sex, from the items as the code holds them — see `modelNumber`. */
function itemModels(defs: ReadonlyMap<number, ItemDef>): ModelOf {
  return (item, sex) => {
    const def = defs.get(item)
    return def ? modelNumber(def, sex === SEX.female) : undefined
  }
}

/** A new game's world, once anything asked before it is done — the rest of `begin`. */
function openWorld(map: string): void {
  // Development convenience: `?stage=2.2` opens a new game at that stage,
  // `?step=4` at that step of it, and `?flags=0,1` with those story flags set.
  const stage = /^(\d+)\.(\d+)$/.exec(params.get('stage') ?? '')
  if (stage) storyStage = { major: Number(stage[1]), minor: Number(stage[2]) }
  // Whichever thread the first map is in takes the story as it is set here.
  liveThread = undefined
  const step = Number(params.get('step'))
  if (Number.isInteger(step) && step > 0) storyStep = step
  for (const flag of (params.get('flags') ?? '').split(',')) {
    if (/^\d+$/.test(flag)) storyFlags.add(Number(flag))
  }
  // `?globals=156` sets game-wide flags — the bank at `+0x8c` — by number, as
  // `?flags=` does the story's. **Ours**, a development parameter.
  for (const flag of (params.get('globals') ?? '').split(',')) {
    if (/^\d+$/.test(flag)) storyGlobals.add(Number(flag))
  }
  // `?ivor=1` opens it with Ivor in the party, as his call leaves him, for
  // looking at a stage he goes along over; an event's record may send him away.
  if (params.get('ivor') === '1' && !memberOf(IVOR)) members.push(freshMember(IVOR))
  // `?at=x,z` stands the Hero there, in world units, on the highest floor —
  // ours, for looking at a spot a headless browser cannot walk to.
  const spot = /^(-?[\d.]+),(-?[\d.]+)$/.exec(params.get('at') ?? '')
  const arrival = spot ? { x: Number(spot[1]), y: 0, z: Number(spot[2]), facing: 0 } : undefined
  if (!enter(map, arrival)) {
    startEl.hidden = false
    return
  }
  // `?bgm=BG_001` plays that track — which plays where is not read; see `music.ts`.
  const bgm = params.get('bgm')
  if (bgm) void startMusic(bgm)
  // `?se=113` or `?se=113:2`: sound an effect archive, or one slot of it, on load.
  const se = params.get('se')
  if (se && cartridge) {
    const [index, slot] = se.split(':').map(Number)
    void playEffect(cartridge, index ?? 0, slot).then((played) =>
      status(played ? `♪ effect ${se}` : `no effect ${se} in the effect archive`),
    )
  }
  // `?level=20` puts the Hero at that level, with its experience — ours, so a
  // headless browser can see a fight through. The same move the `l` key makes,
  // clamped to the table's ends; see `levelTo`.
  // `?medals=80` sets the mini medals already handed to Cap'n Max — ours, so
  // his exchange can be reached without handing in eighty. See `medals.ts`.
  const handedIn = Number(params.get('medals'))
  if (Number.isInteger(handedIn) && handedIn > 0) medalsGiven = Math.min(handedIn, MEDALS_MOST)
  const level = Number(params.get('level'))
  if (Number.isInteger(level) && level > 0) levelTo(level)
  // `?skills=1:3,11:58` puts that many points into each skill tree of the
  // Hero's — a way to try an ability in a fight without the skill screen.
  for (const pair of (params.get('skills') ?? '').split(',')) {
    const [tree, points] = pair.split(':').map(Number)
    if (Number.isInteger(tree) && Number.isInteger(points) && (points as number) > 0) {
      leader().treePoints.set(tree as number, Math.min(points as number, 100))
    }
  }
  // `?preset=3` dresses the Hero as a ready-made character — see `showPreset`.
  const asPreset = params.get('preset')
  if (asPreset !== null && /^\d+$/.test(asPreset)) showPreset(Number(asPreset))
  // `?party=4:0,12:3,21:9` fills the party with created characters: a preset
  // and a vocation each — **ours**, standing in for the Quester's Rest until
  // recruitment is built. See `recruit`.
  const asParty = params.get('party')
  if (asParty) recruit(asParty)
  // `?vocation=1:3` changes party place 1 to vocation 3 — **ours**, for
  // driving. The Abbey's own flow is Jack's — see `openAbbey`.
  for (const one of (params.get('vocation') ?? '').split(',')) {
    const asked = /^(\d+):(\d+)$/.exec(one)
    const who = asked ? members[Number(asked[1])] : undefined
    if (!asked || !who) continue
    const to = Number(asked[2])
    const was = who.vocation
    if (!changeVocation(who, to)) {
      status(`${to} is not a vocation — the Abbey's own bounds are 1 to 12`)
      continue
    }
    dressParty()
    status(
      `${nameFor(who)} was ${vocationWord(was)} at level ${levelOf({ ...who, vocation: was })?.level ?? '?'}` +
        ` · now ${vocationWord(to)} at level ${levelOf(who)?.level ?? '?'}`,
    )
  }
  // `?give=22010:3,22011` puts items in the bag — **ours**, and only for
  // driving: the Krak Pot and the equip screen both need a bag with something
  // in it, and walking to a shop for each is not a test.
  for (const one of (params.get('give') ?? '').split(',')) {
    const asked = /^(\d+)(?::(\d+))?$/.exec(one)
    if (!asked) continue
    const item = Number(asked[1])
    for (let n = 0; n < Number(asked[2] ?? 1); n++) bag = take(bag, { item })
  }
  if (params.get('give')) status(`bag: ${bagLines(bag, nameOf).join(' · ')}`)
  // `?tricks=2,0,0,10` fills the trick slots — Up, Left, Right, Down 1 to 4,
  // by number, 0 for none — **ours**, for driving a performance.
  const tricksWanted = params.get('tricks')
  if (tricksWanted)
    tricksWanted.split(',').forEach((n, i) => {
      if (i < TRICK_SLOT_COUNT && /^\d+$/.test(n)) trickSlots[i] = Number(n) || undefined
    })
  // `?gold=5000` puts that much in the purse — **ours**, for driving the bank.
  const gold = params.get('gold')
  if (gold !== null && /^\d+$/.test(gold))
    bag = { ...bag, gold: Math.min(PURSE_MOST, Number(gold)) }
  // `?pot=1` opens the Krak Pot — **ours, for driving**. Its real way in is
  // `<RENKIN>` at the end of the pot's own talk line in the Quester's Rest,
  // which needs the story far enough along for the pot to be placed and
  // talking; this reaches the same panel without walking there.
  // `?patty=1` opens Patty's Party Planning Place — **ours, for driving**.
  // Her real way in is `<LUIDA>` on her own talk line at the Quester's Rest.
  if (params.get('patty') === '1') {
    menu = { ...openMenu(), panel: 'patty', patty: openPatty() }
    showMenu()
  }
  if (params.get('pot') === '1') {
    menu = { ...openMenu(), panel: 'pot', pot: openPot() }
    showMenu()
  }
  // `?make=1` opens the appearance panel — **ours, and the only way in until
  // recruitment is built**: character creation is a scene of the game's own
  // (the protagonist's from `main`'s mode 3, a recruit's inside Patty's flow
  // at the Quester's Rest), never a menu command. See `UNLISTED_PANELS`.
  if (params.get('make') === '1') {
    menu = { ...openMenu(), panel: 'make' }
    showMenu()
  }
  // `?look=0:sex=1,hair=7,build=0` sets a member's appearance knob by knob —
  // **ours**, standing in for the Observatory and the Quester's Rest, neither
  // of which is built. See `appearance.ts` for what the knobs are.
  for (const one of (params.get('look') ?? '').split(';')) {
    const asked = /^(\d+):(.*)$/.exec(one)
    const who = asked ? members[Number(asked[1])] : undefined
    if (!asked || !who) continue
    let look = who.look ?? HERO_APPEARANCE
    for (const pair of (asked[2] ?? '').split(',')) {
      const set = /^([a-zA-Z]+)=(\d+)$/.exec(pair)
      if (!set || !((set[1] as string) in look)) continue
      look = { ...look, [set[1] as string]: Number(set[2]) }
    }
    who.look = look
    who.sex = look.sex
    status(
      `${nameFor(who)}: ${appearanceRows(who)
        .map((row) => `${row.label} ${row.shown}`)
        .join(' · ')}`,
    )
  }
  if (params.get('look')) dressParty()
  // `?save=1` writes a save where it stands — **ours**, and only for driving.
  // The church is the one place a player can record anything, which makes the
  // save impossible to exercise from outside without walking to a priest.
  if (params.get('save') === '1') status(confess())
  if (wantedEvent !== undefined) {
    goToEventsMap(wantedEvent)
    startEvent(wantedEvent)
  } else playEntryEvent()
  // `?scenes=1` opens the scene browser — see `scene-browser.ts`.
  if (params.get('scenes') === '1') openSceneBrowser()
  // `?scene=22510` plays a scene as the browser would: the stage, step and
  // flags its record wants — `&way=1` for another of its ways. For the
  // side-by-side comparisons, which name a scene and nothing else.
  const wantedScene = Number(params.get('scene'))
  if (Number.isInteger(wantedScene) && wantedScene > 0 && cartridge) {
    const entry = sceneIndex(allTriggers(cartridge)).find((e) => e.event === wantedScene)
    const way = entry?.ways[Number(params.get('way')) || 0] ?? (entry && firstWay(entry))
    if (entry && way) playScene(conditionsFor(entry.event, way))
    else status(`ev${wantedScene} is not played by any record`)
  }
  // `?talk=12` stands the Hero behind cast member 12 and talks to them —
  // **ours**, so a headless browser can see a conversation without walking to
  // it. Behind rather than in front on purpose: the default turn is then a
  // half-circle and plainly visible, and a line that asks for `<N_TURN>`
  // leaves the speaker's back to the camera, which is the whole difference.
  // `Number(null)` is 0, not NaN, so the parameter's presence is what is
  // tested — otherwise every plain map view tries to talk to placement 0.
  const talkTo = params.get('talk')
  if (talkTo !== null && /^\d+$/.test(talkTo)) standAndTalk(Number(talkTo))
}

/**
 * Play what entering this map plays, if anything does — see `entryEvent` in
 * `@minstrel/game-formats`: the map's own entry record, over the story's
 * stage, its flags holding. INFERRED. Not on a save carried on from, nor on a
 * map an event goes on to, whose own event is played instead — both **ours**.
 * True when an event began.
 */
function playEntryEvent(): boolean {
  if (!loaded || !storyStage || playing || loaded.mapId === undefined) return false
  // **INFERRED**: arriving at Gittingham Palace's field stop by the
  // Starflight Express at 15.3 step 5 plays ev29150, Celestria opening the
  // way — a scene of map 20034 listed at 16.1, whose start raises the story
  // there (see `startEvent`). Nothing read names it; the field's own code must.
  if (
    loaded.mapId === 20034 &&
    expressAt === 4 &&
    storyStage.major === 15 &&
    storyStage.minor === 3 &&
    stepNow() === 5
  ) {
    return startEvent(29150)
  }
  const found = entryPlay(
    loaded.triggers,
    loaded.mapId,
    storyStage,
    storyFlags,
    stepNow(),
    storyState().more,
  )
  // The map's settings record too, as the game runs it when the map's
  // triggers are loaded — see `settingsPlay`. The entry record's after it,
  // as the areas it adds are then in place.
  const settings = settingsPlay(loaded.triggers, loaded.mapId, storyStage, storyState())
  let began = false
  if (settings) {
    storyFromRecord(settings)
    began =
      followTalkOf(settings) ||
      (settings.event !== undefined &&
        !!loaded.eventScript(settings.event) &&
        startEvent(settings.event))
  }
  if (!found) return began
  // Everything its record does — its own flags among it, so it plays once;
  // see `entryPlay`. The game runs every action of the record it takes.
  storyFromRecord(found.outcome)
  if (began) return true
  if (followTalkOf(found.outcome)) return true
  if (found.event === undefined || !loaded.eventScript(found.event)) return false
  return startEvent(found.event)
}

/** The browser's own storage, where it allows it: private windows and blocked sites do not. */
function storage(): SaveStore | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/** Take up where a save left off — everything but the map, which `begin` enters. */
function restore(game: SaveGame): void {
  storyStage = game.stage ? { major: game.stage.major, minor: game.stage.minor } : undefined
  storyStep = game.step ?? 0
  storyFlags.clear()
  storyMarks.clear()
  for (const flag of game.flags ?? []) storyFlags.add(flag)
  for (const mark of game.marks ?? []) storyMarks.add(mark)
  storyGlobals.clear()
  for (const flag of game.globals ?? []) storyGlobals.add(flag)
  // A save from before the seven slots kept four, in the menu's order Up,
  // Right, Left, Down — Left and Right the other way round from the slots.
  const kept = game.tricks ?? []
  const slots = kept.length === 4 ? [kept[0], kept[2], kept[1], kept[3]] : kept
  trickSlots = Array.from({ length: TRICK_SLOT_COUNT }, (_, i) => slots[i] ?? undefined)
  expressAt = game.express ?? 0
  questBook = game.quests
    ? {
        nibbles: Uint8Array.from({ length: QUEST_SLOTS }, (_, i) => game.quests?.nibbles[i] ?? 0),
        log: game.quests.log.map(({ quest, progress }) => ({ quest, progress })),
        cleared: new Map(game.quests.cleared),
      }
    : newQuestBook()
  // The other threads — see `storyThreads`. A save from before they were kept
  // had only the one, and the map it was made in takes it.
  for (let thread = 0; thread < THREADS; thread++) {
    const kept = game.threads?.[thread]
    storyThreads[thread] = kept
      ? {
          stage: kept.stage ? { major: kept.stage.major, minor: kept.stage.minor } : undefined,
          step: kept.step,
          flags: new Set(kept.flags),
          marks: new Set(kept.marks),
        }
      : unstarted()
  }
  liveThread = game.thread
  medalsGiven = game.medalsGiven ?? 0
  storySoFar = game.storySoFar ?? STORY_START
  goldBanked = game.banked ?? 0
  // The day's clock, as saved; its running is not saved (INFERRED, as the
  // game's), so it runs on loading. A save from before it was kept is at the
  // day's start.
  clock.ticks = game.clock ?? STAY_TICKS
  clock.running = true
  recipesKnown.clear()
  for (const [recipe, bits] of game.recipes ?? []) recipesKnown.set(recipe, bits)
  // **A save from before recipes were kept** knew every recipe here. Read as
  // the game would have it — **ours**: past the Krak Pot's first talk (4.1 on,
  // its record's span), its six recipes known and the pot used; before, none.
  if (!game.recipes && storyStage && storyStage.major >= 4) {
    for (const recipe of [440, 441, 442, 443, 444, 445]) learnRecipe(recipesKnown, recipe)
    storyGlobals.add(FLAG_POT_USED)
    storyGlobals.add(0x1198)
  }
  // The whole party, each with their own — see `SaveMember`. An older save's
  // companions come back with nothing, which is all they ever had.
  members = partyRestored(game.members)
  withPatty = game.kept ? partyRestored(game.kept) : []
  // **A save written before a point could be spent has no pool**, and nobody
  // in it had spent one — so what they are owed is simply what their levels
  // earned. Worked out here rather than in `partyRestored`, which has no level
  // tables to read. See `earnSkillPoints`.
  members.forEach((member, place) => {
    if (game.members[place]?.skillPool !== undefined) return
    const levels = levelsFor(member)
    member.skillPool = levels ? standing(levels, expOf(member), member.gains).level.skillPoints : 0
  })
  bag = bagOf(game)
  openedTreasure.clear()
  for (const key of game.opened) openedTreasure.add(key)
}

/** Record where the Hero stands and all they carry: the church's confession. What the priest says. */
function confess(): string {
  if (!loaded || !self) return 'There is nothing to record.'
  const game: SaveGame = {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    map: loaded.code,
    // In the file's own units, which is what a doorway's arrival is in.
    at: {
      x: toFloat(self.state.x) / worldScale,
      y: toFloat(self.state.y) / worldScale,
      z: toFloat(self.state.z) / worldScale,
      facing: self.facing,
    },
    stage: storyStage ? { major: storyStage.major, minor: storyStage.minor } : null,
    step: storyStep,
    flags: [...storyFlags],
    marks: [...storyMarks],
    globals: [...storyGlobals],
    tricks: trickSlots.map((trick) => trick ?? null),
    ...(expressAt !== 0 ? { express: expressAt } : {}),
    quests: {
      nibbles: [...questBook.nibbles],
      log: questBook.log.map(({ quest, progress }) => ({ quest, progress })),
      cleared: [...questBook.cleared],
    },
    ...(liveThread === undefined ? {} : { thread: liveThread }),
    threads: storyThreads.map((kept) => ({
      stage: kept.stage ? { major: kept.stage.major, minor: kept.stage.minor } : null,
      step: kept.step,
      flags: [...kept.flags],
      marks: [...kept.marks],
    })),
    ...(medalsGiven > 0 ? { medalsGiven } : {}),
    ...(storySoFar !== STORY_START ? { storySoFar } : {}),
    recipes: [...recipesKnown],
    ...(goldBanked > 0 ? { banked: goldBanked } : {}),
    clock: clock.ticks,
    members: partySaved(members),
    ...(withPatty.length === 0 ? {} : { kept: partySaved(withPatty) }),
    gold: bag.gold,
    items: [...bag.items],
    opened: [...openedTreasure],
  }
  return writeSave(storage(), game)
    ? 'Your progress is recorded.'
    : 'This browser would not keep the record.'
}

/**
 * Where the character comes out, when they have come through a doorway.
 *
 * The stored height is not trusted on its own. It stands on the destination's
 * own collision floor on 884 of 1,132 doorways — 78.1% — and the rest would
 * leave the character hanging in the air or sunk into the ground, so the floor
 * is measured at the arrival and the stored height is the fallback.
 */
interface Arrival {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly facing: number
}

/**
 * Open a map and put the character down in it.
 *
 * With one, they come out of a doorway. With no arrival — the first map — they
 * come in the way the map's neighbours bring them, which for the village is the
 * road from the field; see `entranceOf`. Only a map nothing leads into is opened
 * wherever it affords standing.
 *
 * Returns whether anyone is standing anywhere afterwards. On failure the map
 * already loaded is left alone: a doorway onto a map that will not read should
 * not throw the player out of the one they are in.
 */
/** Whether the Hero was fallen as this map was entered — what `837` answers; the game takes it at the map's load. */
let heroFallenOnArrival = false

/**
 * **A floor for a map with no collision, entered for a scene** — **ours**.
 * The ending's montage plays in maps that have none (`E01M01` to `E01M11`),
 * where the scene places everyone itself; the game needs nothing to stand on
 * there, and this engine wants a world to put the Hero in. So a flat square
 * at height 0, 1,024 units each way, in the format's own `fx32` words.
 */
function standInFloor(): CollisionMesh {
  const r = 1024 * FX32_ONE
  const corner = (x: number, z: number) => [x, 0, z] as const
  const triangles: CollisionTriangle[] = [
    { vertices: [corner(-r, -r), corner(r, -r), corner(-r, r)], normal: [0, 1, 0], attributes: 0 },
    { vertices: [corner(r, -r), corner(r, r), corner(-r, r)], normal: [0, 1, 0], attributes: 0 },
  ]
  return {
    kind: 3,
    bounds: { minX: -r, minY: 0, minZ: -r, maxX: r, maxY: 0, maxZ: r },
    cellSize: FX32_ONE,
    gridX: 1,
    gridZ: 1,
    triangles,
    cells: [],
    cellTriangles: [],
    trailing: [],
    shift: 0,
    unknown_0x1a: 0,
    cell: () => [],
  }
}

function enter(map: string, arrival?: Arrival, forScene = false): boolean {
  if (!cartridge) return false
  const previous = loaded
  const previousSelf = self
  const started = performance.now()
  // Where an event left anyone belongs to the map it happened in — see `castLeft`.
  castLeft.clear()
  // Whether the Hero arrives fallen, kept for the map's stay — `837`, see
  // `EventStage.heroFallen`.
  heroFallenOnArrival = leader().hp === 0
  let opened: Loaded
  try {
    opened = load(cartridge, { map, lighting: wantedLighting, onProgress: status })
  } catch (error) {
    status(error instanceof Error ? error.message : String(error))
    loaded = previous
    self = previousSelf
    return false
  }

  if (!opened.world && forScene) {
    const floor = standInFloor()
    opened = {
      ...opened,
      map: { ...opened.map, meshes: [{ mesh: floor, offset: undefined }] },
      world: createCollisionWorld(floor),
    }
  }
  const world = opened.world
  if (!world) {
    status(`${opened.archive} has no collision — there is nowhere to stand`)
    loaded = previous
    self = previousSelf
    return false
  }

  // With no doorway to arrive by, come in by the map's entrance: where a
  // doorway from outside it puts you. Guessing at the middle of the village
  // stood the character at the river's edge by the waterfall.
  const entrance = arrival ? undefined : entranceOf(opened.catalogue, opened.code)
  const via: Arrival | undefined =
    arrival ??
    (entrance && {
      x: entrance.door.arriveX,
      y: entrance.door.arriveY,
      z: entrance.door.arriveZ,
      facing: entrance.door.arriveFacing,
    })

  // Where to stand. An arrival names the spot; without one, the map is asked
  // for somewhere the character can walk from.
  const walkable = (near?: { x: number; z: number }) =>
    findSpawn(world, {
      person: person(),
      speed: WALK_SPEED,
      water: opened.map.water,
      ...(near ? { near } : {}),
    })
  let at: { x: ReturnType<typeof fx32>; y: ReturnType<typeof fx32>; z: ReturnType<typeof fx32> }
  /** How far from the arrival the character had to be put, if not on it. */
  let strayed = 0
  if (via) {
    // A world grown around the character has to put them down where they now
    // belong in it, or they arrive inside the walls.
    const x = fx32(Math.round(via.x * worldScale * FX32_ONE))
    const z = fx32(Math.round(via.z * worldScale * FX32_ONE))
    const hit = groundBelow(world, x, z, fx32(Math.round(world.bounds.maxY + FX32_ONE)))
    if (hit) {
      at = { x, y: hit.y, z }
    } else {
      // No floor under the arrival. Rare: 2 of the 1,098 arrivals measured,
      // now each collision mesh is read at its own size. Before that, a
      // field's was read at half of it and 136 arrivals missed, 87 of them
      // into a field.
      //
      // So the character is put on the walkable ground nearest the arrival
      // rather than wherever the map affords standing. It keeps which side of
      // the map they came in on, which the middle of the map does not.
      const spot = walkable({ x: via.x * worldScale, z: via.z * worldScale })
      if (!spot) {
        status(`${opened.archive} has no floor under the arrival, and nowhere else to stand`)
        loaded = previous
        self = previousSelf
        return false
      }
      at = spot
      strayed = Math.hypot(toFloat(spot.x) - via.x, toFloat(spot.z) - via.z)
    }
  } else {
    const spawn = walkable()
    if (!spawn) {
      status(`${opened.archive} has collision but nowhere the character can walk from`)
      loaded = previous
      self = previousSelf
      return false
    }
    at = spawn
  }

  // The story thread this map is in, and then the cast where its stage has them.
  enterThread(opened.mapId)
  // Entering a map starts its talk counts again — see `Talked`.
  enteredForTalk(opened.code)
  if (storyStage !== undefined)
    opened = {
      ...opened,
      cast: opened.castAt(storyStage, stepNow(), timeNow() === 'night', storyGlobals),
    }
  loaded = opened
  playMapMusic()
  // Drawn in what they wear, which the map's wardrobe dresses — see `dressHero`.
  dressHero()
  fillBag(opened)
  wearWanted()
  // The top screen's map: the picture this map is drawn on, or its area's.
  minimaps ??= readMinimaps(cartridge)
  minimapShown = showMinimap(minimaps, opened.mapId, opened.code)
  chapterIndex = undefined
  closeTalk()
  refreshTreasures()
  doors = doorsOf(opened.map)
  slides = startSlides(opened.slides, (id) => standingIn(opened.cast, id))
  areaIn.triggers = undefined
  areaIn.map = undefined
  areaIn.doorway = undefined
  areasAdded.length = 0
  cabinets = cabinetsOf(opened.map, opened.treasures)
  measurements.clear()
  mapFrame = -1
  shapeCells = []
  poseMap(0)

  const scale = figureScale(opened.figure, opened.pieces, measurements, toFloat(person().height))
  characterScale = scale
  // The cast was posed before the scale was known; redo it now it is.
  poseMap(0)
  self = player(at, scale)
  // Whoever follows comes in on the Hero, with no footsteps behind them yet:
  // each place in the line a pace further back than the one before.
  trails = Array.from({ length: PARTY_MOST - 1 }, (_, i) =>
    createFollower(FOLLOW_TICKS * (i + 1), at),
  )
  if (via) self.facing = via.facing
  // **Dress the party for the map they are now in.** `load` builds the Hero's
  // figure out of the map's own wardrobe; everybody else's is built here, and
  // until this was called on entering a map rather than only when equipment
  // changed, a party restored from a save came back with nobody assembled.
  dressParty()
  // After the dressing, so what it reports is what is actually built.
  witnessHook()
  beginRoaming()

  // The character is put down inside the doorway they came out of more often
  // than not, so the gate starts shut and opens when they step clear of it.
  gate.armed = false
  // The camera trails the character; without this it would fly across the world
  // from wherever it was watching the last map.
  camera.focus = [toFloat(at.x), toFloat(at.y) + camera.height, toFloat(at.z)]

  const elapsed = Math.round(performance.now() - started)
  const { members, sprites, unclassified, missing, elsewhere } = opened.cast
  status(
    `${opened.archive} — ${opened.map.pieces.length} pieces, ${opened.map.meshes.length} collision meshes, ` +
      `${members.length + opened.cast.sprites2d.length} characters` +
      (opened.cast.sprites2d.length > 0 ? ` (${opened.cast.sprites2d.length} of them 2D)` : '') +
      (sprites > 0 ? `, ${sprites} sheets unread` : '') +
      (elsewhere > 0 ? `, ${elsewhere} stand in another map` : '') +
      (unclassified > 0 ? `, ${unclassified} unclassified` : '') +
      (missing.length > 0 ? `, ${missing.length} unread` : '') +
      `, ${opened.doorways.length} ${opened.doorways.length === 1 ? 'doorway' : 'doorways'}` +
      (opened.treasures.length > 0 ? `, ${opened.treasures.length} treasure` : '') +
      (entrance ? `, came in from ${entrance.from}` : '') +
      (strayed > 0 ? `, no floor under the doorway — put down ${strayed.toFixed(1)} away` : '') +
      `, ready in ${elapsed} ms` +
      // Never leave a resized map looking like a wrong one.
      (fitState() === 'as the file has it' ? '' : ` — ${fitState()}`),
  )
  return true
}

/**
 * Take a doorway, if the character is standing in one.
 *
 * Loading a map is not quick and it blocks, so the frame that starts it says so
 * first and the load happens on the next turn of the event loop. `travelling`
 * holds the door shut meanwhile.
 *
 * Not while an event plays: it moves the Hero itself, and where it goes on to
 * is its own record's to say — see `followEvent`. Ivor's call outside Erinn's
 * house, `ev02210`, stands the Hero on her doorstep. Ours.
 */
function maybeTravel(): void {
  if (!self || !loaded || travelling || playing) return
  const door = doorTaken(gate, loaded.doorways, toFloat(self.state.x), toFloat(self.state.z))
  if (!door) return
  // **A record for standing at this door** runs first, as the game runs it
  // for each doorway region the Hero is in — see `doorwayPlay`: someone
  // stops the Hero and speaks, an event plays, or the door is blocked
  // (`108`). Then the Hero must step clear and come back, as for any door
  // they arrive in: ours, where the game runs it every frame they stand there.
  if (door.id && storyStage && loaded.mapId !== undefined) {
    const found = doorwayPlay(loaded.triggers, loaded.mapId, storyStage, door.id, storyState())
    if (found) {
      storyFromRecord(found)
      const stopped = followTalkOf(found) || (found.event !== undefined && startEvent(found.event))
      if (stopped || blocksDoorway(found, door.id)) {
        gate.armed = false
        if (!stopped) status(`the way through is blocked`)
        return
      }
    }
  }
  travelling = true
  status(`entering ${door.to}…`)
  // The screen fades to black first; `showDarkness` goes through when it is.
  self.held.clear()
  doorFade = { since: performance.now(), door }
}

/** Change the map for the doorway's, with the screen black — see `doorFade`. */
function goThrough(door: NonNullable<ReturnType<typeof doorTaken>>): void {
  const arrived = enter(door.to, {
    x: door.arriveX,
    y: door.arriveY,
    z: door.arriveZ,
    facing: door.arriveFacing,
  })
  travelling = false
  if (arrived) playEntryEvent()
}

/**
 * The area the Hero stood in at the last look, for each of the two sources the
 * game tests on its own — a trigger's areas and the map's own — by id; none
 * when they stood in none. See `maybeAreaEvent`.
 */
const areaIn: {
  triggers: number | undefined
  map: number | undefined
  /** The doorway region, by its place in the map's table — see `maybeDoorwayRecord`. */
  doorway: number | undefined
} = {
  triggers: undefined,
  map: undefined,
  doorway: undefined,
}

/**
 * **A record for standing at a doorway**, run as the Hero walks into one of
 * the map's doorway regions — with or without somewhere it leads; see
 * `KIND_DOORWAY` and `doorwayPlay`. The game runs it for each region the Hero
 * is in, every frame, before the transition; here once on walking in, as an
 * area's is. `maybeTravel` runs it for a doorway the Hero goes through.
 */
function maybeDoorwayRecord(): void {
  if (!self || !loaded || !storyStage || playing || battle || talking || menu || visit) return
  if (travelling || loaded.mapId === undefined || loaded.doorwayRegions.length === 0) return
  const scale = WORLD_SCALE * worldScale
  const x = toFloat(self.state.x) / scale
  const y = toFloat(self.state.y) / scale
  const z = toFloat(self.state.z) / scale
  const now = areaAt(
    loaded.doorwayRegions.map((region) => region.area),
    x,
    y,
    z,
  )?.id
  const entered = now !== undefined && now !== areaIn.doorway
  areaIn.doorway = now
  if (!entered) return
  const region = loaded.doorwayRegions[now]
  if (!region) return
  const found = doorwayPlay(loaded.triggers, loaded.mapId, storyStage, region.id, storyState())
  if (!found) return
  storyFromRecord(found)
  followTalkOf(found) || (found.event !== undefined && startEvent(found.event))
}
/**
 * Areas records have added to this map as they ran, since it was entered —
 * see `EventOutcome.areas`. The game keeps them in the same list as the
 * settings' own, until the map's triggers are read again.
 */
const areasAdded: StoryArea[] = []

/**
 * Play what walking into one of the map's areas plays — see `areaEvent` in
 * `@minstrel/game-formats` — as the game's field does it, read from its code
 * (US ARM9 `func_ov017_02198e30` and `func_ov017_0219814c`): the Hero's
 * position is tested against a trigger's areas and against the map's own, each
 * on its own, and the first area of each that holds them is where they stand;
 * walking into another runs the records for it. In the mayor's house at 2.1,
 * walking up to him plays his scene with Ivor, `ev02120`; in Stornway's throne
 * room at 3.1, the map's own area 0 plays `ev03040`. Not while anything else
 * is up — **ours**.
 */
/**
 * **DQVC by Nintendo Wi-Fi Connection**, as Sellma opens it — `145 : 5`, the
 * queue's case (US ARM9 `0x02070164`) setting its "connected" bit and running
 * DQVC's `auction.stb` as `145 : 6` does without it. The connection was how
 * quests were delivered: "New quests are now available. Check the quest list
 * for more details." (`str_da12` 28).
 *
 * **Ours**: the service is gone, so connecting delivers every downloadable
 * quest at once — the service delivered them a few at a time — by the
 * delivered flag the online code set (see `deliverAll`). The lines are the
 * game's, `str_da12` 19, 46, 37 and 28; their order is ours, `auction.stb`
 * not being read, and DQVC's shop itself is not built.
 */
function connectDqvc(who: Talker): void {
  if (!loaded) return
  const before = questBook
  questBook = deliverAll(questBook, loaded.questGivers)
  const fresh = questBook.nibbles.some((n, q) => n !== before.nibbles[q])
  const lines = [19, 46, 37, ...(fresh ? [28] : [])]
  talkContext = textContext()
  talking = startConversation(
    who,
    'DQVC by Nintendo Wi-Fi Connection',
    lines.map((n) => loaded?.dqvcWords.get(n) ?? `(str_da12 ${n})`),
    lines.map((n) => `str_da12 ${n}`),
    talkContext,
  )
  showTalk()
  status(
    fresh
      ? 'every downloadable quest delivered — DQVC’s shop is not built'
      : 'DQVC’s shop is not built',
  )
}

/**
 * The Quest List's rows: the quests taken, with the text for their progress,
 * then those cleared, with theirs — see `QuestText` for which is which.
 */
function questList(): { name: string; text: string; cleared: boolean }[] {
  if (!loaded) return []
  const texts = loaded.questTexts
  const plain = (text: string | undefined) => (text ? plainMarkup(text, heroName()) : '')
  const taken = questBook.log.map(({ quest, progress }) => {
    const found = texts.get(quest)
    return {
      name: plain(found?.name) || `quest ${quest}`,
      text: plain(found?.texts[1 + progress] ?? found?.texts[1]),
      cleared: false,
    }
  })
  const cleared = [...questBook.cleared.keys()].map((quest) => {
    const found = texts.get(quest)
    return {
      name: plain(found?.name) || `quest ${quest}`,
      text: plain(found?.texts[9]),
      cleared: true,
    }
  })
  return [...taken, ...cleared]
}

/**
 * The quests the one talked to offers, run as talking runs it before their
 * records and lines are asked (`func_02095924`): over the map's givers, whose
 * conditions are tested with them as the one talked to. See `offerFor`.
 */
function offerQuests(character: number): void {
  if (!loaded || !storyStage || loaded.mapId === undefined) return
  const givers = giversFor(
    questBook,
    loaded.questGivers,
    loaded.mapId,
    storyStage.major,
    storyStage.minor,
  )
  if (givers.length === 0) return
  const state = storyState()
  const more = { ...state.more, character }
  questBook = offerFor(questBook, givers, character, (giver) =>
    flagsHold(conditionsOfWords(giver.conditions), state.flags, state.marks, state.step, more),
  ).book
}

/**
 * One frame of flight — see `flightFrame`: the +Control Pad held turns the
 * Express, which flies on at 60 ticks a second, and the Hero rides it, hidden,
 * so the camera follows. **Ours**: the camera is the field's own follow camera;
 * the game's was not read.
 */
function flyOn(elapsedMs: number): { moving: boolean; travelled: number; marshTicks: number } {
  if (!flying || !self) return { moving: false, travelled: 0, marshTicks: 0 }
  // Off the sky, by whatever way, the flight is over.
  if (loaded?.mapId !== SKY_MAP) {
    flying = undefined
    return { moving: false, travelled: 0, marshTicks: 0 }
  }
  if (!menu && !talking && !visit) {
    flightCarry += elapsedMs
    const held = heldDirection()
    const turn = Math.round(camera.yaw * 4096)
    while (flightCarry >= 1000 / 60) {
      flightCarry -= 1000 / 60
      flying = flightFrame(flying, held, turn)
    }
  }
  const grow = WORLD_SCALE * worldScale
  self.state = {
    ...self.state,
    x: fx32(Math.round(flying.x * grow)),
    y: fx32(Math.round(flying.y * grow)),
    z: fx32(Math.round(flying.z * grow)),
  }
  self.facing = flying.facing / 4096
  return { moving: false, travelled: 0, marshTicks: 0 }
}

/** The +Control Pad's direction held, of the eight — see `DIRECTION_ANGLES`. */
function heldDirection(): Direction | undefined {
  const held = self?.held
  if (!held) return undefined
  const up = held.has('w') && !held.has('s')
  const down = held.has('s') && !held.has('w')
  const left = held.has('a') && !held.has('d')
  const right = held.has('d') && !held.has('a')
  if (up) return left ? 'upLeft' : right ? 'upRight' : 'up'
  if (down) return left ? 'downLeft' : right ? 'downRight' : 'down'
  if (left) return 'left'
  if (right) return 'right'
  return undefined
}

/** The Express and its two carriages, drawn where they fly — `chara_sub/s203.chr` and `s204.chr`. Shadows are not drawn. */
function expressPieces(): ReturnType<typeof castPieces> {
  if (!flying || !cartridge) return []
  const grow = WORLD_SCALE * worldScale
  const place = (at: { x: number; z: number; facing: number }, model: string, id: number) => {
    const look = actorLookOf(cartridge as Uint8Array, model, [])
    if (!look) return []
    const placement = {
      id,
      map: SKY_MAP,
      x: (at.x / 4096) * grow,
      y: ((flying?.y ?? 0) / 4096) * grow,
      z: (at.z / 4096) * grow,
      facing: at.facing / 4096,
      offset: 0,
    }
    return castPieces(
      { name: model, model: look.model, motion: look.motions.get('stand'), floor: 0, placement },
      look.catalogue,
      EXPRESS_SCALE * WORLD_SCALE * worldScale,
      0,
    )
  }
  return [
    ...place(flying, 'chara_sub/s203.chr', 0xca),
    ...place(flying.carriages[0], 'chara_sub/s204.chr', 0xcb),
    ...place(flying.carriages[1], 'chara_sub/s204.chr', 0xcb),
  ]
}

/**
 * Summon the Express with Sterling's whistle — the item's own case in the
 * field's item code (US ov002 `func_ov002_02157634`, item `0x56f0`): in a
 * field region, or one of the towns the game lists (`0x020e6ea8`), the
 * whistle is blown and the Express comes (a summoning task, ov017
 * `func_ov017_021a6c2c`, then the sky map); elsewhere it cannot reach it.
 * The lines are `str_ark` 13 on, INFERRED from the item code's messages
 * 0x7530 on. **Ours**: the summoning's effect and waits are not played.
 */
function blowWhistle(): string[] | undefined {
  if (!loaded || loaded.mapId === undefined || !self) return undefined
  const words = (n: number) =>
    plainMarkup(loaded?.expressWords.get(n) ?? `(str_ark ${n})`, heroName())
  const here = loaded.mapId
  const field = here >= 20000 && here < 30000
  if (!field && !WHISTLE_TOWNS.includes(here)) return [words(13), words(14)]
  // Where the Express takes off: a region's own place plus the region's in
  // the world, over 6; a town's place in the map list is already the sky's.
  const entry = loaded.mapEntryOf(here)
  const grow = WORLD_SCALE * worldScale
  const local = {
    x: Math.round((toFloat(self.state.x) / grow) * 4096),
    z: Math.round((toFloat(self.state.z) / grow) * 4096),
  }
  const town = entry?.sky
  const sky =
    field && entry?.world
      ? skyOf(entry.world, local)
      : town
        ? { x: Math.round(town.x * 4096), z: Math.round(town.z * 4096) }
        : { x: 0, z: 0 }
  flying = takeOff(sky.x, sky.z)
  flightCarry = 0
  expressAt = 0
  const code = loaded.mapCodeOf(SKY_MAP)
  if (code) enter(code)
  return [words(13)]
}

/**
 * The Express's size in the sky against a character's: the flight's objects
 * are made at a scale of 192 (`0xc0`, of 4096) — US ARM9 `func_020aca88`.
 */
const EXPRESS_SCALE = 0xc0 / 4096

/** Sterling's whistle, by its item id (`0x56f0`) — the field item code tests the item itself. */
const STERLINGS_WHISTLE = 22256

/** The towns from which the whistle reaches the Express besides the field — `0x020e6ea8`. */
const WHISTLE_TOWNS: readonly number[] = [
  100, 198, 200, 201, 400, 4200, 1100, 1200, 1300, 1500, 1700, 1800, 1900, 2000, 2100, 2200, 2300,
  5700, 5800,
]

/** A line in flight, `str_ark`, said with no speaker, its answer handed on. */
function sayInFlight(line: number, then: (answer: number | undefined) => void): void {
  if (!loaded || !self) return
  talkContext = textContext()
  talking = startConversation(
    { id: -1, name: '', x: toFloat(self.state.x), z: toFloat(self.state.z) },
    'the Starflight Express',
    [loaded.expressWords.get(line) ?? `(str_ark ${line})`],
    [`str_ark ${line}`],
    talkContext,
  )
  afterTalk = then
  showTalk()
}

/**
 * A: "Disembark here?" (`str_ark` 36) — over land the Express may land on, the
 * Hero is put down in the region below; where it may not, "It's not possible
 * to disembark here. Head for the Realm of the Almighty?" (38), and yes rides
 * there, `ev29510`. The region is the sky collision's under the Express — see
 * `SkyRegion`. **Ours**: the descent and the ascent are not played, and the
 * Hero is put at the region's own place for the sky's, on the ground, where
 * the game takes the nearest of the region's landing places (not read).
 */
function askToLand(): void {
  const under = regionUnderExpress()
  if (under?.land && under.map !== undefined) {
    sayInFlight(36, (answer) => {
      if (answer === 0) landIn(under.map as number)
    })
    return
  }
  sayInFlight(38, (answer) => {
    if (answer !== 0) return
    flying = undefined
    expressAt = 3
    startEvent(29510)
  })
}

/** B: "Switch to the view inside the Starflight Express?" (`str_ark` 35) — yes goes aboard, map 6401. */
function askToGoInside(): void {
  sayInFlight(35, (answer) => {
    if (answer !== 0 || !loaded) return
    flying = undefined
    const code = loaded.mapCodeOf(6401)
    // The menu's own request (ov017 `0x021a7588`): (3.5, 0.6, −3.5), facing 0x25c2.
    if (code)
      enter(code, {
        x: (0x3800 / 4096) * WORLD_SCALE,
        y: (0x999 / 4096) * WORLD_SCALE,
        z: (-0x3800 / 4096) * WORLD_SCALE,
        facing: 0x25c2 / 4096,
      })
  })
}

/** The region of the sky under the Express, by its collision — see `regionIndexOf`. */
function regionUnderExpress(): SkyRegion | undefined {
  if (!flying || !loaded || !world) return undefined
  const grow = WORLD_SCALE * worldScale
  const hit = groundBelow(
    world,
    fx32(Math.round(flying.x * grow)),
    fx32(Math.round(flying.z * grow)),
    fx32(Math.round(world.bounds.maxY + FX32_ONE)),
  )
  if (!hit) return undefined
  const triangle = world.triangles[hit.triangle]
  const records = loaded.map.meshes.flatMap((placed) => placed.mesh.trailing)
  const record = triangle ? records[regionIndexOf(triangle.attributes)] : undefined
  return record ? skyRegionOf(record) : undefined
}

/** Put the Hero down in a field region, at its own place for the Express's in the sky. */
function landIn(map: number): void {
  if (!flying || !loaded) return
  const entry = loaded.mapEntryOf(map)
  const code = loaded.mapCodeOf(map)
  if (!entry?.world || !code) return
  const at = fieldOf(entry.world, flying)
  flying = undefined
  expressAt = 0
  enter(code, { x: (at.x / 4096) * WORLD_SCALE, y: 0, z: (at.z / 4096) * WORLD_SCALE, facing: 0 })
}

/**
 * **The Starflight Express's list**, opened by its conductor's record — see
 * `express.ts`. The game turns the Hero to face the conductor as it opens;
 * this does not. Ours.
 */
function openExpress(opened: { mode: number; values: readonly number[] }, who: Talker): void {
  const mode: ExpressMode = opened.mode === 1 ? 1 : 0
  expressBy = { who, mode, stops: stopsOf(opened.values) }
  menu = { ...openMenu(), panel: 'express', express: { mode, stops: expressBy.stops } }
  self?.held.clear()
  showMenu()
}

/** A conductor's line, said as a conversation — its prompt answered as any is. */
function sayExpress(line: number): void {
  if (!loaded || !expressBy) return
  const number = conductorLine(line, expressBy.mode)
  talkContext = textContext()
  talking = startConversation(
    expressBy.who,
    'the Starflight Express',
    [loaded.expressWords.get(number) ?? `(str_ark ${number})`],
    [`str_ark ${number}`],
    talkContext,
  )
  showTalk()
}

/**
 * A stop chosen from the list, as the task takes it (its states 5 to 7): the
 * stop it is at asks "that's where we are already" — yes puts the Hero down
 * at the stop's place, no says so and gives the list again; another stop is
 * a ride.
 */
function pickStop(stop: number): void {
  const by = expressBy
  if (!by) return
  if (stop !== expressAt) {
    ride(stop, by.mode)
    return
  }
  sayExpress(EXPRESS_WORDS.alreadyThere)
  afterTalk = (answer) => {
    if (answer === 0) {
      sayExpress(EXPRESS_WORDS.allChange)
      afterTalk = () => stayAt(stop)
      return
    }
    sayExpress(EXPRESS_WORDS.undecided)
    afterTalk = () => {
      menu = { ...openMenu(), panel: 'express', express: { mode: by.mode, stops: by.stops } }
      showMenu()
    }
  }
}

/** Put the Hero down at a stop's own place, with no scene — see `EXPRESS_PLACES`. */
function stayAt(stop: number): void {
  expressBy = undefined
  const place = EXPRESS_PLACES.get(stop)
  const code = place && loaded?.mapCodeOf(place.map)
  if (!place || !code) return
  expressAt = stop
  if (
    enter(code, {
      x: place.x * WORLD_SCALE,
      y: place.y * WORLD_SCALE,
      z: place.z * WORLD_SCALE,
      facing: place.facing,
    })
  ) {
    playEntryEvent()
  }
}

/**
 * A ride: the scene leaving the stop the Express is at, and the one arriving
 * at `stop` parked behind it, which it carries on into (`834`, `810`) — or the
 * story's own scene in its place; see `rideScenes`. The Express is then at the
 * stop.
 */
function ride(stop: number, mode: ExpressMode): void {
  expressBy = undefined
  const story = storyStage
    ? { ...storyStage, step: stepNow() ?? 0, globals: storyGlobals }
    : undefined
  const { leave, arrive } = rideScenes(expressAt, stop, mode, story)
  expressAt = stop
  const first = leave ?? arrive
  if (first === undefined) return
  status(
    `the Starflight Express: ${leave === undefined ? '' : `ev${leave}, then `}ev${arrive ?? '?'}`,
  )
  if (!startEvent(first)) return
  if (leave !== undefined && arrive !== undefined && playing) {
    playing.player.stage.queuedScript = arrive
  }
}

/**
 * **Perform the party tricks a direction holds** — see `tricks.ts`: one, or
 * Down's four in turn, by the Hero alone, where they stand, from their sex's
 * `data/chara/sg<nn><m|w>.chr`. Nothing else may happen while it plays.
 */
function performTricks(direction: 'up' | 'left' | 'right' | 'down'): void {
  if (performing || !self || opening) return
  const started = startPerformance(
    tricksFor(trickSlots, direction),
    performance.now(),
    trickMotionsOf,
  )
  if (!started) {
    status(`no trick to perform ${direction}`)
    return
  }
  performing = started
  const names = trickNames ?? (cartridge ? menuServiceWords(cartridge, 'str_sgs') : new Map())
  trickNames = names
  status(
    `${heroName()}: ${started.tricks.map((t) => plainMarkup(names.get(t) ?? `trick ${t}`, heroName())).join(', ')}`,
  )
  performingSounded = -1
  trickReleased = false
  self.held.clear()
}

/** Each trick pack read, by its file — see `trickMotionsOf`. */
const trickPacksRead = new Map<
  string,
  | {
      readonly shape: TrickShape
      readonly motions: ReadonlyMap<string, Animation>
      readonly speeds: ReadonlyMap<string, number>
    }
  | undefined
>()

/** A trick's motions, in the Hero's sex's pack, by what its `.bcfg` names; undefined when it will not read. */
function trickMotionsOf(trick: number): (TrickMotions & { read: TrickPackRead }) | undefined {
  if (!cartridge) return undefined
  const file = trickPack(trick, leader().sex === SEX.female)
  if (!trickPacksRead.has(file)) {
    const table = packTable(cartridge, file)
    const shape = trickShape(table.names)
    trickPacksRead.set(
      file,
      shape ? { shape, motions: packMotions(cartridge, file), speeds: table.speeds } : undefined,
    )
  }
  const read = trickPacksRead.get(file)
  if (!read) return undefined
  return {
    shape: read.shape,
    ms: (phase) => {
      const motion = read.motions.get(phase)
      return motion ? motionMs(read.speeds.get(phase), motion.frameCount) : 0
    },
    read,
  }
}
type TrickPackRead = NonNullable<ReturnType<typeof trickPacksRead.get>>

/** The performance a frame on: each trick's sound as it starts, and at the end what the map makes of it. */
function followPerformance(now: number): void {
  if (!performing) return
  const trick = performing.tricks[performing.index]
  if (performing.index !== performingSounded && trick !== undefined) {
    performingSounded = performing.index
    const sound = TRICK_SOUNDS.get(trick)
    if (sound !== undefined && cartridge) void playEffect(cartridge, sound)
  }
  const next = stepPerformance(performing, now, trickReleased, trickMotionsOf)
  trickReleased = false
  if (next !== 'done') {
    performing = next
    return
  }
  const tricks = performing.tricks
  performing = undefined
  trickAnswered(tricks)
}

/** The Hero's pose while performing: the phase's motion, with no blend in or out. */
function trickPose(
  now: number,
): { readonly motion: Animation; readonly frame: number } | undefined {
  if (!performing) return undefined
  const trick = performing.tricks[performing.index]
  const read = trick === undefined ? undefined : trickMotionsOf(trick)?.read
  const motion = read?.motions.get(performing.phase)
  if (!read || !motion) return undefined
  const at = frameAt(
    now - performing.since,
    read.speeds.get(performing.phase),
    motion.frameCount,
    phaseLoops(performing),
  )
  return { motion, frame: Math.floor(at) }
}

/**
 * **What the map makes of a performance**, once its last trick ends: the
 * first trick record for the area the Hero stands in whose conditions hold,
 * with every trick performed (`func_020649b0(…, 0x13, …)`, `0x02053960`) — and
 * runs it whole. Gleeba's Drak answers a Clap in area 10.
 */
function trickAnswered(tricks: readonly number[]): void {
  if (!loaded || !storyStage || loaded.mapId === undefined) return
  for (const area of [areaIn.triggers, areaIn.map]) {
    if (area === undefined) continue
    const found = trickPlay(
      loaded.triggers,
      loaded.mapId,
      storyStage,
      area,
      (wanted) => tricks.includes(wanted),
      storyState(),
    )
    if (!found) continue
    storyFromRecord(found.outcome)
    followTalkOf(found.outcome) ||
      (found.outcome.event !== undefined && startEvent(found.outcome.event))
    return
  }
}

/**
 * **The cross of the four places' names** while B is held in the field
 * (`func_ov017_0219a388`): each its trick's name from `str_sgs`, Down's the
 * first of its four. **Ours**: drawn as the page's own, not the game's
 * windows.
 */
function showTrickCross(): void {
  const idle =
    cancelHeld && !!self && !talking && !playing && !battle && !menu && !visit && !opening
  if (!idle || !cartridge) {
    trickCrossEl.hidden = true
    return
  }
  const names = trickNames ?? menuServiceWords(cartridge, 'str_sgs')
  trickNames = names
  const nameOf = (trick: number | undefined) => names.get(trick ?? 0) ?? '------'
  const down = TRICK_SLOT.down.map((i) => trickSlots[i]).find((t) => t !== undefined)
  const places: [string, number | undefined][] = [
    ['up', trickSlots[TRICK_SLOT.up]],
    ['left', trickSlots[TRICK_SLOT.left]],
    ['right', trickSlots[TRICK_SLOT.right]],
    ['down', down],
  ]
  trickCrossEl.replaceChildren(
    ...places.map(([place, trick]) => {
      const box = document.createElement('div')
      box.className = `place ${place}`
      box.textContent = plainMarkup(nameOf(trick), heroName())
      return box
    }),
  )
  trickCrossEl.hidden = false
}
/** `str_sgs`, the tricks' names by number, 0 "------"; read once. */
let trickNames: ReadonlyMap<number, string> | undefined
const trickCrossEl = must<HTMLDivElement>('#tricks')

function maybeAreaEvent(): void {
  if (!self || !loaded || !storyStage || playing || battle || talking || menu || visit) return
  if (travelling || loaded.mapId === undefined) return
  const triggerAreas = [
    ...areasOf(loaded.triggers, loaded.mapId, storyStage, storyState()),
    ...areasAdded,
  ]
  if (triggerAreas.length === 0 && loaded.mapAreas.length === 0) return
  // Areas are in the units placements use; the world is those times its scale.
  const scale = WORLD_SCALE * worldScale
  const x = toFloat(self.state.x) / scale
  const y = toFloat(self.state.y) / scale
  const z = toFloat(self.state.z) / scale
  const now = {
    triggers: areaAt(triggerAreas, x, y, z)?.id,
    map: areaAt(loaded.mapAreas, x, y, z)?.id,
  }
  const entered = (['triggers', 'map'] as const)
    .filter((source) => now[source] !== undefined && now[source] !== areaIn[source])
    .map((source) => now[source] as number)
  areaIn.triggers = now.triggers
  areaIn.map = now.map
  for (const id of entered) {
    const found = areaEvent(
      loaded.triggers,
      loaded.mapId,
      storyStage,
      storyFlags,
      stepNow(),
      (area) => area === id,
      storyState().more,
    )
    if (!found) continue
    // The first record for it that holds runs, whatever it does — see
    // `areaEvent` — and what it has follow, follows: a talk (`118`), as
    // Dourbridge's area 22 has the Hero talk to 3, or its event.
    storyFromRecord(found.outcome)
    followTalkOf(found.outcome) || (found.event !== undefined && startEvent(found.event))
    return
  }
}

/**
 * The talk a record's `118` starts, whoever ran the record — an area's, the
 * map's watch, a set battle's — as the game's queue starts it. True when one
 * began. A talk record's own `118` goes through `runTalkRecord`.
 */
function followTalkOf(outcome: EventOutcome): boolean {
  const talk = outcome.talk
  if (!talk) return false
  const to = talkerFor(talk.character)
  if (!to) return false
  talkWith(to, talk.label)
  return talking !== undefined || playing !== undefined
}

/** The overlay text: where the character is, and what it is standing in. */
function describe(uploaded: { vertices: number; triangles: number; textured: number }): void {
  if (!self || !loaded) {
    overlayEl.textContent = ''
    return
  }
  overlayEl.textContent = [
    `${loaded.code} · ${toFloat(self.state.x).toFixed(2)}, ${toFloat(self.state.y).toFixed(2)}, ${toFloat(self.state.z).toFixed(2)}` +
      (self.state.grounded ? '' : ' (falling)') +
      (self.inside ? ' · indoors' : ''),
    // Where the story stands on this map's thread, and the chapter its people
    // talk from — what decides whether anyone has a line for now.
    `story ${storyStage ? `${storyStage.major}.${storyStage.minor}` : 'not begun'}, step ${storyStep}` +
      ` · thread ${threadOf(loaded.mapId)} · talk from chapter ${chapter() ?? 'none'}`,
    `${uploaded.vertices} vertices · ${uploaded.triangles} triangles` +
      (hiddenPieces > 0 ? ` · ${hiddenPieces} chunks out of the way` : ''),
    loaded.pieces.length === 0 ? 'no character parts loaded' : undefined,
    padSeen
      ? 'left stick to walk · right stick to look · shoulders to turn'
      : `${walkHint(controlsPanel.bindings)} to walk · ${turnHint(controlsPanel.bindings)} or drag to turn · k for controls`,
    minimapShown ? 'm to show or hide the map' : undefined,
    // With `?pad=1`, what the pad reports — move a stick and watch which
    // numbers change, then pass those four to `?axes=`.
    showPad && !pad
      ? (() => {
          const found = lastSearch()
          if (!found.available) return 'pad: this browser has no gamepad API'
          if (found.filled > 0) return `pad: ${found.filled} present but none connected`
          // Chromium keeps a pad hidden until it has been used on this page.
          return `pad: none in ${found.slots} slots — press a button on it with this page focused`
        })()
      : undefined,
    showPad && pad
      ? `pad: ${pad.id} (${pad.mapping || 'no standard mapping'})\n` +
        `${pad.axes.length} axes: ${pad.axes.map((a, i) => `${i}:${a.toFixed(2)}`).join('  ')}\n` +
        `${pad.buttons.length} buttons: ${
          pad.buttons
            .map((b, i) => (b > 0.02 ? `${i}:${b.toFixed(2)}` : ''))
            .filter(Boolean)
            .join('  ') || 'none pressed'
        }`
      : undefined,
  ]
    .filter((line) => line !== undefined)
    .join('\n')
}

/**
 * The mini-map in the corner, where the Hero is now — see `minimap.ts`. Hidden
 * in a battle: **ours**, as are the corner and the key — what the DS's map
 * screen shows during one is not established. His position is the map file's
 * own units, as the picture's are: the world's divided by the scale it was put
 * in at.
 */
function drawCorner(): void {
  // The equipment screen goes where the menu leaves it; the map stays out of its way.
  if (!equipEl.hidden && menu?.panel !== 'equip') equipEl.hidden = true
  const show =
    minimapWanted && minimapShown !== undefined && self !== undefined && !battle && equipEl.hidden
  if (minimapEl.hidden === show) minimapEl.hidden = !show
  const context = show ? minimapEl.getContext('2d') : null
  if (!context || !minimapShown || !self) return
  const unit = WORLD_SCALE * worldScale
  const hero = {
    x: toFloat(self.state.x) / unit,
    z: toFloat(self.state.z) / unit,
    name: heroName(),
  }
  // Each of the party where they walk, or on the Hero while they stand on
  // them. Keyed by place rather than by the story companions' compacted list,
  // so a created character gets a dot too — see `followersNow`.
  const walking = companionsInField()
  const companions = marchersNow().flatMap(({ who, member, index }) => {
    if (who && standingHere(who)) return []
    const seen = walking.find((w) => w.index === index)
    return [
      { x: seen ? seen.x / unit : hero.x, z: seen ? seen.z / unit : hero.z, name: nameFor(member) },
    ]
  })
  drawMinimap(context, minimapShown, [hero, ...companions], loaded?.region)
}

/** The map's animation time for a redraw: the game's 17 ms frames since the page began. */
const mapTime = (redraw: number) => (redraw * (1000 / MAP_FPS)) / MOTION_MS

/** Where the Hero stands, for the doors — kept, not made anew each frame. */
const heroAtDoors = { x: 0, z: 0 }
const atDoors: { readonly x: number; readonly z: number }[] = []
/** Who the doors answer to: the Hero, and whoever an event has put somewhere — see `moveDoors`. */
function peopleAtDoors(): readonly { readonly x: number; readonly z: number }[] {
  atDoors.length = 0
  if (self) {
    heroAtDoors.x = toFloat(self.state.x)
    heroAtDoors.z = toFloat(self.state.z)
    atDoors.push(heroAtDoors)
  }
  if (playing) {
    for (const actor of playing.player.stage.actors.values()) if (actor.placed) atDoors.push(actor)
  }
  return atDoors
}

/**
 * **What the battle's end starts, once** (overlay 23's states 9 and 10): a
 * victory cuts the battle's tune and sounds `ME_005`, and from its lines on
 * the camera takes the victory's shot; a wipe-out lets the tune fade, holds
 * the last frame 1000 ms, and puts its line up with `ME_009`. **Not yet
 * played**: a level's `ME_004`. A flight has neither.
 */
function beginEnding(now: number): void {
  const outcome = battle?.state.outcome
  if (ending || (outcome !== 'won' && outcome !== 'lost') || !cartridge) return
  ending = { kind: outcome, since: now }
  if (params.get('bgm')) return
  const rom = cartridge
  if (outcome === 'won') {
    music.stop(true)
    void playJingle(rom, VICTORY_JINGLE)
    return
  }
  music.stop(false)
  setTimeout(() => {
    if (ending?.kind === 'lost') void playJingle(rom, WIPED_OUT_JINGLE)
  }, WIPE_HOLD_MS)
}

/** Whether a wipe-out's line is still being held back — see {@link beginEnding}. */
const wipeHeld = (now: number) => ending?.kind === 'lost' && now - ending.since < WIPE_HOLD_MS

/** The pages last looked at for an action to show — see `frame`. */
let pagesSeen: readonly string[] | undefined
/** How long a page telling an event with no action has left, ms — ours. */
let pageLeft = 0

let lastFrame = 0
function frame(now = 0): void {
  const elapsedMs = lastFrame === 0 ? 0 : now - lastFrame
  lastFrame = now
  if (battle && elapsedMs > LONG_FRAME_MS) logLongFrame(blog, now, elapsedMs)
  if (battle && battle.phase !== logPhase) {
    logPhase = battle.phase
    if (battle.phase === 'command') log(`— commands, round ${battle.state.round + 1}`)
    if (battle.phase === 'over') log(`— over: ${battle.state.outcome}`)
  }
  drawLog()
  if (battle && !fpsInBattle) resetFps(fps)
  fpsInBattle = battle !== undefined
  tickFps(fps, elapsedMs)
  if (debugOn) {
    const line = `${fpsLine(fps)}\n${DEBUG_KEYS}`
    if (fpsShown.textContent !== line) fpsShown.textContent = line
  }
  // The status line goes with the debug screen once a map is up.
  if (!debugOn && loaded && !statusEl.hidden) statusEl.hidden = true
  // Alltrades Abbey's ceremony, run its time — see `ceremony`.
  if (serviceWait && performance.now() >= serviceWait.until) {
    const done = serviceWait.done
    serviceWait = undefined
    done()
  }
  // **A page that tells an action shows it** — see `startShown` — and goes on
  // when it ends, as the game's does; a page that tells an event with no
  // action goes on when its lines have been up their time. **Ours**: the
  // latter's timing, a line's 750 ms each. The battle's own clock runs slower
  // through a hit-stop — see `battleSpeed`.
  if (battle) {
    if (battle.phase !== 'telling') inOpening = false
    // The skill-point screen put away: the results go on.
    if (allocating && menu?.panel !== 'skills') {
      allocating = false
      menu = undefined
      showMenu()
      turnPages(1)
    }
    openPage(now)
    if (shown) stepShown(elapsedMs)
    else if (pageLeft > 0) {
      pageLeft -= elapsedMs
      if (pageLeft <= 0) turnPages(1)
    }
    // A page turned just now opens before this frame is drawn: drawn first,
    // it would be told without its action — its numbers up at once and its
    // blow played from the page's cue — and then again by the action.
    openPage(now)
    // A results window's rows come in over time — see `results-window.ts`.
    if (resultsShown) drawBattleBottom()
    battleClock += elapsedMs * battleSpeed()
  }

  if (loaded) {
    keepTime(elapsedMs)
    // A map is not a still life: the village's sky drifts its clouds apart and
    // the waterfall runs, both on the map's own animations.
    const wanted = Math.floor(now / (1000 / MAP_FPS))
    // Doors swing on the frame's own time, and a door that moved is a map to redraw.
    const swung = self !== undefined && moveDoors(doors, peopleAtDoors(), elapsedMs / 1000)
    const slid = moveSlides(slides, elapsedMs / 1000)
    // A fight on its stage hides the map, so it is not posed until the fight is over.
    if (!battleStage && (wanted !== mapFrame || swung || slid)) {
      mapFrame = wanted
      poseMap(wanted)
    }
  }

  // A pad is read fresh each frame; the browser hands back a snapshot, not a
  // handle, and one unplugged mid-game simply reads as absent.
  const sticks = readSticks(padAxes, padOverridden)
  if (sticks.connected) {
    padSeen = true
    pad = sticks
    // Its buttons act as the keys bound to them do, once as each goes down;
    // the d-pad walks as the movement keys do while it is held.
    // B held on the pad, as on the keys — for a trick with a direction.
    const padCancel = controlsPanel.bindings.cancel.buttons.some(
      (b) => (sticks.buttons[b] ?? 0) > 0.5,
    )
    const padCancelWas = controlsPanel.bindings.cancel.buttons.some(
      (b) => (padButtons[b] ?? 0) > 0.5,
    )
    if (padCancel !== padCancelWas) {
      cancelHeld = padCancel
      showTrickCross()
    }
    for (const action of pressedActions(controlsPanel.bindings, sticks.buttons, padButtons)) {
      if (controlsPanel.waiting) continue
      onAction(action, '', false)
    }
    if (controlsPanel.waiting) {
      const down = sticks.buttons.findIndex((v, i) => v > 0.5 && (padButtons[i] ?? 0) <= 0.5)
      if (down >= 0) controlsPanel.button(down)
    }
    if (self) {
      for (const [action, token] of Object.entries(MOVE_TOKENS) as [Action, string][]) {
        const held = controlsPanel.bindings[action].buttons.some(
          (b) => (sticks.buttons[b] ?? 0) > 0.5,
        )
        const was = controlsPanel.bindings[action].buttons.some((b) => (padButtons[b] ?? 0) > 0.5)
        if (held && !was) self.held.add(token)
        else if (!held && was) self.held.delete(token)
      }
    }
    padButtons = sticks.buttons
    const seconds = elapsedMs / 1000
    camera.yaw -= sticks.lookX * LOOK_RATE * seconds
    // The follow camera clamps this to its own range on the same frame.
    camera.pitch += sticks.lookY * TILT_RATE * seconds
  }
  // `q` and `e`, and the shoulders: the same rate as the stick held over, so
  // the two ways of turning agree. Outside the block above because a key turns
  // the camera whether or not a pad is plugged in.
  const turn = turningNow()
  if (turn !== 0) camera.yaw += turn * LOOK_RATE * (elapsedMs / 1000)

  let uploaded = { vertices: 0, triangles: 0, textured: 0 }
  // The character walks on the world as the fit leaves it — see `refit`.
  if (self && loaded && world) {
    self.stick = { forward: sticks.forward, right: sticks.right }
    // An event moves the Hero itself, and the keys wait for it — see `playEvent`.
    if (playing) playEvent(elapsedMs)
    trails.forEach((trail, i) => {
      trailWas[2 * i] = trail.x
      trailWas[2 * i + 1] = trail.z
    })
    // Opening a chest holds the Hero where they knelt — see `openChest`.
    if (opening) followChestOpening(now)
    // A party trick holds them where they stand — see `performTricks`.
    if (performing) followPerformance(now)
    const { moving, travelled, marshTicks } =
      playing || opening || performing || battleStage
        ? { moving: false, travelled: 0, marshTicks: 0 }
        : flying
          ? flyOn(elapsedMs)
          : advance(self, world, camera.yaw, elapsedMs, trails, inMarshNow, chestsInTheWay)
    // The marsh takes its toll by the ticks walked in it — see `marsh.ts`.
    marshCarry += marshTicks
    while (marshCarry >= MARSH_TICKS) {
      marshCarry -= MARSH_TICKS
      marshToll()
    }
    // Each in the line walks while their footsteps move, facing the way they go.
    trails.forEach((trail, i) => {
      const dx = trail.x - (trailWas[2 * i] as number)
      const dz = trail.z - (trailWas[2 * i + 1] as number)
      trailWalking[i] = dx !== 0 || dz !== 0 ? 1 : 0
      if (trailWalking[i]) trailFacing[i] = Math.atan2(dx, dz)
    })
    // The field's monsters, on the Hero's own ticks, and only while nothing
    // else is up — see `beginRoaming`.
    if (roaming && !battle && !menu && !visit && !talking && !playing && !opening) {
      roamCarry = Math.min(roamCarry + elapsedMs, TICK_MS * 8)
      while (roamCarry >= TICK_MS && roaming) {
        roamCarry -= TICK_MS
        const next = tickRoaming(
          roaming,
          world,
          roamKinds,
          self.state,
          roamRng,
          ROAM_RULES,
          footingOf(world),
        )
        roaming = next.roaming
        if (next.touched) {
          fightRoamer(next.touched)
          break
        }
      }
    }
    // At the Hero's set's own speeds — see `motion-speed.ts`.
    const heroSpeeds = cartridge ? motionSpeeds(cartridge, motionFamilyOf(leader())) : undefined
    advanceMotion(self, loaded.figure, measurements, moving, elapsedMs, travelled, (name) =>
      heroSpeeds?.get(name),
    )
    maybeTravel()
    maybeAreaEvent()
    maybeDoorwayRecord()
    maybeWatch()

    // Indoors the camera comes in and tilts further down. What counts as
    // indoors is whether there is a roof over the character's head, checked as
    // they walk, so the camera tucks in on the way through a door rather than
    // on a guess about how big the map is.
    const feet: [number, number, number] = [
      toFloat(self.state.x),
      toFloat(self.state.y),
      toFloat(self.state.z),
    ]
    const inside = covered(
      mapBoxes.filter((_, index) => !mapBackdrop[index]),
      feet,
      toFloat(person().height),
    )
    if (inside !== self.inside) {
      self.inside = inside
      Object.assign(
        camera,
        applyStyle(camera, inside ? INDOORS : OUTDOORS, toFloat(person().height) * worldScale),
      )
    }

    // The world is passed so the eye is kept above the ground: it is never
    // pulled forward for a building — the roof comes off instead — but the
    // ground is the one thing culling must not remove, so a camera inside a
    // hill sees through the world.
    // The boom is a multiple of the character's height, so a world grown around
    // a character that did not grow leaves the camera inside it. Pulling it back
    // by the same factor keeps the room framed, which is the whole point: what
    // should change on screen is the character's size against the room, not how
    // close the camera happens to be.
    // An event's camera is its own — see `aimAtShot`.
    const eventStage = playing?.player.stage
    // Where the camera looks now, for a shot that moves it from there — see `looking`.
    if (eventStage) eventStage.looking = [camera.focus[0], camera.focus[1], camera.focus[2]]
    // Its fades to black and back, or the field coming back after one.
    showDarkness(eventStage, now)
    revealTalk(now)
    const shot = eventStage?.camera
    // `?probe=1` puts the scene's camera and the real one on `window`, so a
    // badly framed view can be told from a scene that never framed itself —
    // see `docs/areas.md`. **Behind a flag because this allocates**, and the
    // frame is not a place to allocate.
    if (probing) {
      ;(globalThis as { __shot?: unknown }).__shot = shot
        ? {
            target: shot.target,
            yaw: shot.yaw,
            rise: shot.rise,
            distance: shot.distance,
            angled: eventStage?.cameraAngled ?? false,
          }
        : null
    }
    if (shot?.target) aimAtShot(shot, eventStage?.cameraAngled ?? false)
    else if (battleStage) aimAtBattle(battleStage, elapsedMs * battleSpeed())
    else
      updateFollowCamera(
        camera,
        // A battle is watched from its middle — see `battleCentre`.
        battleCentre() ?? self.state,
        elapsedMs / 1000,
        world,
        worldScale === 1
          ? person()
          : { ...person(), height: fx32(Math.round(person().height * worldScale)) },
      )

    // **Pull the camera in short of anything between it and what it is
    // looking at** — what `actualDistance` has always been documented to be,
    // and what nothing did. Hiding chunks answers a building the camera looks
    // over; it cannot answer a wall belonging to a shape the focus is inside,
    // which is what a close shot against one gives. See `clearDistance`.
    if (chunkBoxes.length > 0 && !battleStage) {
      camera.actualDistance = clearDistance(
        chunkBoxes,
        camera.focus,
        cameraEye(camera, camera.actualDistance),
        camera.actualDistance,
        CAMERA_MARGIN,
      )
    }

    if (probing && self && loaded?.world) {
      // Where the Hero is against the floor under them: a scene that puts a
      // character below it is why `ev03030` looks the way it does.
      const w = loaded.world
      // **From the top and from just over their head.** Searching down from
      // the top of the world finds whatever is highest over that spot — a
      // balcony, a bridge, an upper floor — and not the floor the character
      // is standing on. Both are reported so the difference is visible.
      const top = groundBelow(
        w,
        self.state.x,
        self.state.z,
        fx32(Math.round(w.bounds.maxY + FX32_ONE)),
      )
      const near = groundBelow(
        w,
        self.state.x,
        self.state.z,
        fx32(self.state.y + Math.round(0.25 * FX32_ONE)),
      )
      ;(globalThis as { __floor?: unknown }).__floor = {
        hero: toFloat(self.state.y),
        highest: top ? toFloat(top.y) : null,
        underfoot: near ? toFloat(near.y) : null,
        under: near ? toFloat(self.state.y) - toFloat(near.y) : null,
      }
    }
    if (probing) {
      ;(globalThis as { __cam?: unknown }).__cam = {
        focus: [...camera.focus],
        eye: cameraEye(camera),
        yaw: camera.yaw,
        pitch: camera.pitch,
        wanted: camera.distance,
        distance: camera.actualDistance,
        hidden: hiddenPieces,
      }
    }

    const hidden = occludedChunks(
      mapBoxes,
      chunkBoxes,
      chunkShapes,
      cameraEye(camera),
      camera.focus,
      CLEARANCE,
      mapBackdrop,
    )
    hiddenPieces = hidden.length
    // A shape with a chunk in the way is drawn without that chunk's triangles;
    // every other shape is drawn as it was posed.
    const hiddenIn = new Map<number, number[]>()
    for (const chunk of hidden) {
      const shape = chunkShapes[chunk] as number
      const list = hiddenIn.get(shape)
      if (list) list.push(chunkLocal[chunk] as number)
      else hiddenIn.set(shape, [chunkLocal[chunk] as number])
    }
    const heroPose = heroEventPose() ?? chestOpeningPose(now) ?? trickPose(now)
    const drawn = battleStage
      ? stageDrawn(battleStage, battleClock)
      : [
          ...mapPieces.map((piece, shape) => {
            const gone = hiddenIn.get(shape)
            if (!gone) return piece
            const indices = keepTriangles(piece.geometry.indices, shapeCells[shape] ?? [], gone)
            return { ...piece, geometry: { ...piece.geometry, indices } }
          }),
          ...(showCollision ? collisionDrawn : []),
          ...castPiecesNow,
          ...treasureDrawn,
          // A round shadow under everyone, the Hero included — see `shadows.ts`.
          ...(loaded.shadow
            ? shadowPieces(
                loaded.shadow,
                [
                  ...loaded.cast.members.map((member) => castPlaced(member.placement)),
                  ...loaded.cast.sprites2d.map((sprite) => castPlaced(sprite.placement)),
                  { x: toFloat(self.state.x), y: toFloat(self.state.y), z: toFloat(self.state.z) },
                  ...companionsInField().map(({ x, y, z }) => ({ x, y, z })),
                ],
                (material) => textureFor(loaded?.catalogue ?? { textures: new Map() }, material),
              )
            : []),
          // Where an event has them, or left them — the Hexagon's figure — see `castPlaced`.
          ...loaded.cast.sprites2d.flatMap((sprite) => {
            const s = { ...sprite, placement: castPlaced(sprite.placement) }
            return spritePieces(
              s,
              toFloat(PERSON.height) * worldScale,
              camera.yaw,
              standingFrame(s, camera.yaw),
              // Fading, when an event's character is them: the figure on `ev02520`.
              castOpacity(sprite.placement.id),
            )
          }),
          // A battle's monsters, facing the Hero — see `monsters.ts`.
          ...(battle ? foePieces(battleClock) : []),
          ...(battle ? companionPieces(battleClock) : []),
          // An event's characters, bar the Hero — see `eventPieces`.
          ...eventPieces(),
          // The field's roaming monsters, in their field models.
          ...(roaming && !battle ? roamerPieces(now) : []),
          // Pots and barrels face the camera too — see `propPiecesNow`.
          ...propPiecesNow(loaded, now),
          // Whoever goes along, behind the Hero — see `companionsInField`.
          ...companionFieldPieces(now),
          // The mark over the Hero's head: someone to talk to, something to examine, a door.
          ...bubblePieces(now),
          // The Starflight Express and its carriages, in flight — see `flight.ts`.
          ...expressPieces(),
          ...(flying
            ? []
            : playerPieces(
                heroPose ? { ...self, motionFrame: heroPose.frame } : self,
                loaded.figure,
                loaded.pieces,
                loaded.catalogue,
                measurements,
                heroPose?.motion ?? loaded.figure.motions.get(self.motion ?? ''),
              )),
        ]
    uploaded = renderer.upload(drawn)
  } else if (mapPieces.length > 0) {
    uploaded = renderer.upload([
      ...mapPieces,
      ...(showCollision ? collisionDrawn : []),
      ...castPiecesNow,
      ...treasureDrawn,
    ])
  }
  describe(uploaded)
  drawCorner()

  const width = Math.max(1, Math.floor(canvas.clientWidth * devicePixelRatio))
  const height = Math.max(1, Math.floor(canvas.clientHeight * devicePixelRatio))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  // A scene frames itself: `532` gives the event's camera its own field of
  // view, and the field's stands until one asks — see `fovOfHalfDegrees`.
  // The swirl turns and narrows the field's camera — see `startFight`.
  const swirl = swirlAt(now)
  if (swirl) camera.roll = swirl.roll
  const fov = swirl
    ? fovOfHalfDegrees(swirl.halfFov)
    : (playing?.player.stage.fov ??
      (battleStage ? fovOfHalfDegrees(battleStage.halfFov) : undefined))
  renderer.draw(
    camera,
    false,
    undefined,
    fov,
    battleStage ? stageBackdrop(battleStage, fov) : undefined,
  )
  drawNumbers(battleClock, elapsedMs, fov)
  sceneBrowser?.tick()
  requestAnimationFrame(frame)
}

const params = new URLSearchParams(location.search)
/**
 * Where a new game opens: the village, `M01`, at 2.1 — where coming in plays the
 * scene at the Guardian statue, `ev22590`, by the village's own entry record
 * (see `entryPlay`). From a let's play of the European release: the slice opens
 * there, a day before the morning in Erinn's house, which follows that
 * evening's question of hers — her talk record after it, see `pickLine`. The morning was the opening
 * before; it is still what the evening goes on to.
 */
const OPENING_MAP = 'M01'
const wantedMap = params.get('map') ?? OPENING_MAP
/** `?event=N` plays event N once the map is entered, in place of the map's own entry event. */
const wantedEvent = params.get('event') !== null ? Number(params.get('event')) : undefined
/**
 * `?axes=0,1,2,3` moves the sticks to other axes, `?lookbuttons=6,7` reads the
 * look stick from two analog buttons, and `?pad=1` shows what a pad reports.
 */
const padAxes = axesFrom(params.get('axes'), params.get('lookbuttons'))
/** A layout given on the URL wins over anything known about the pad. */
const padOverridden = params.get('axes') !== null || params.get('lookbuttons') !== null
const showPad = params.get('pad') === '1'
/**
 * **The debug screen** — ours, like Minecraft's F3: the key left of 1 (`` ` ``
 * or `~`) shows or hides everything that is for looking at the game rather
 * than playing it, and **the developer keys work only while it is up** —
 * {@link DEBUG_KEYS}. Shift and the same key opens the scene browser.
 * `?debug=1` opens with it up, as `?fps=1` and `?log=1` still do.
 *
 * Up, it shows: the overlay (where the Hero stands, what is drawn, the pad),
 * the status line, the frame-rate meter with the keys under it, and the
 * fight's timeline. The meter and the timeline keep counting while it is down.
 */
let debugOn = params.get('debug') === '1' || params.get('fps') === '1' || params.get('log') === '1'
/** The developer keys, as the debug screen lists them. */
const DEBUG_KEYS = [
  '` debug screen · shift+` scene browser',
  'p a fight · shift+p the boss · l a level · shift+l one back (to whoever the menu is on)',
  'n / v chapter · t / y story stage · c collision',
].join('\n')
/** The frame-rate meter — see `fps-meter.ts` — at the top, the keys under it. */
const fps = fpsMeter()
const fpsShown = document.createElement('div')
fpsShown.id = 'fps'
document.querySelector('main')?.append(fpsShown)
/** The fight's timeline — see `battle-log.ts`. */
let blog = battleLog(0)
const logEl = document.createElement('pre')
logEl.id = 'battle-log'
document.querySelector('main')?.append(logEl)
/** The three, one under the other down the left — see `#debug` in the styles. */
const debugEl = document.createElement('div')
debugEl.id = 'debug'
// Where the overlay stood, under everything that comes after it — the map,
// the battle's screens, the menus — so the game's own windows stay on top.
overlayEl.before(debugEl)
debugEl.append(overlayEl, fpsShown, logEl)
debugEl.hidden = !debugOn

/** Show or hide the debug screen. Before a map is up the status line stays, for the loading's word. */
function showDebug(on: boolean): void {
  debugOn = on
  debugEl.hidden = !on
  statusEl.hidden = !on && loaded !== undefined
  logDrawn = -1
  drawLog()
}
/** The log's version last drawn, and each fighter's motion as the log last saw it. */
let logDrawn = -1
/** The battle's phase as the log last saw it. */
let logPhase: string | undefined
const logMotions = new Map<number, { motion: string; at: number }>()
/** A line in the fight's timeline, now. */
function log(text: string): void {
  logLine(blog, performance.now(), text)
}
/** A fighter in the log, by its battle object. */
function logName(object: number): string {
  return (battle ? labelsOf(battle.state)[fighterOf(object)] : undefined) ?? `#${object}`
}
/** Draw the log, when it is shown and something was added. */
function drawLog(): void {
  if (!debugOn || blog.version === logDrawn) return
  logDrawn = blog.version
  logEl.textContent =
    blog.entries.length > 0 ? logText(blog) : 'battle log · nothing yet: p picks a fight'
  // Short of room, it is the oldest lines that go.
  logEl.scrollTop = logEl.scrollHeight
}
/** Whether a fight was on last frame — the meter's drops count again from each one's start. */
let fpsInBattle = false
/** `?probe=1`: put the scene camera and the real one on `window` each frame. */
const probing = params.get('probe') === '1'
/** `?collision=1`, or `c` at any time: draw the collision mesh over the map. */
let showCollision = params.get('collision') === '1'
/** Built per map, and again whenever the fit below is moved. */
let collisionDrawn: Piece[] = []
/**
 * A correction to the collision, fitted by eye — see `CollisionFit`.
 *
 * It moves the mesh the character walks on as well as the one drawn, so a fit
 * can be judged by walking it and not only by looking at it.
 */
let fit: CollisionFit = fitFrom(params.get('fit'))
const NO_FIT_LINE = fitLine('', NO_FIT).trim()
/** The world as the fit leaves it: what the character actually walks on. */
let world: CollisionWorld | undefined
/** The meshes `world` was built of, in its order — a triangle's record is its own mesh's (see `recordOfTriangle`). */
let worldMeshes: readonly PlacedMesh[] = []
/**
 * A scale on the room the map *draws*, as against the collision it carries.
 *
 * The two experiments are not the same. Making the collision twice the size
 * gives the character twice the floor and leaves the room as it was; making the
 * room half the size fits the same floor to a smaller room and leaves the
 * character standing over more of it. They align identically and look nothing
 * alike, so both have to be available for the eye to choose between them.
 *
 * `?room=` sets it, `n` and `m` move it.
 */
let roomScale = Number(params.get('room')) > 0 ? Number(params.get('room')) : 1
/**
 * A scale on the room **and** its collision together, against the character.
 *
 * The other two controls ask whether the room and the collision agree with each
 * other. This one asks the question underneath: whether the pair of them is
 * right and the *character* is the wrong size. `PERSON.height` was set by eye
 * against the village and is the one number in the chain that no file gives, so
 * it is the one worth being able to hold still while everything else moves.
 *
 * `?world=` sets it, `g` and `h` move it.
 */
let worldScale = Number(params.get('world')) > 0 ? Number(params.get('world')) : 1
/**
 * A scale on the **character**, leaving the world exactly as the file has it.
 *
 * The cleaner way to ask whether the character is the wrong size. Growing the
 * world asks the same question and asks the camera an awkward one alongside it:
 * the boom is a multiple of the character's height, so a doubled room framed by
 * an unchanged character puts the camera on the floorboards. Shrinking the
 * character instead is the ordinary case with a different constant, and the
 * camera behaves.
 *
 * `?person=` sets it, `j` and `i` move it. `PERSON.radius` goes with it, being
 * a fact about the body; the step and snap heights do not — see `PERSON`.
 */
let personScale = Number(params.get('person')) > 0 ? Number(params.get('person')) : 1
/** The character as the scale above leaves them. */
function person() {
  if (personScale === 1) return PERSON
  return {
    ...PERSON,
    height: fx32(Math.round(PERSON.height * personScale)),
    radius: fx32(Math.round(PERSON.radius * personScale)),
  }
}
/** Which of the map's lightings to build: the time of day's — see `keepTime` — or `?lighting=night`'s. */
let wantedLighting: 'day' | 'night' = params.get('lighting') === 'night' ? 'night' : 'day'
/** **The day's clock** — see `Clock` in the sim. Saved; a new game's is the day's start, running. */
const clock: Clock = newClock()
/** The milliseconds not yet a tick of the clock. */
let clockCarry = 0
/** The time of day as last shown, to notice it turning. */
let shownTime: TimeOfDay | undefined
/** The colour the view is multiplied by — see `TINTS`. */
const tintEl = document.querySelector<HTMLDivElement>('#tint')

/** The scene's light scale as last shown, so the tint is only rewritten when it moves. */
let shownScale = 1

/**
 * Put the view's tint up: the time of day's colour, **multiplied by the light
 * scale a scene asked for** — the game's `578`, which scales its two light
 * colours and the horizon's the same way. Ours in where it lands: this engine
 * tints by one overlay where the game scales the lights themselves.
 */
function showTint(time: TimeOfDay): void {
  const scale = playing?.player.stage.lightScale ?? 1
  if (!tintEl || (time === shownTime && scale === shownScale)) return
  shownScale = scale
  const held = Math.max(0, Math.min(1, scale))
  const rgb = /(\d+)\D+(\d+)\D+(\d+)/.exec(TINTS[time])
  if (!rgb) return
  const [r, g, b] = [1, 2, 3].map((i) => Math.round(Number(rgb[i]) * held))
  tintEl.style.background = `rgb(${r} ${g} ${b})`
}

/**
 * The time of day now: `?time=evening` forces one, `?lighting=night` the
 * night; else what a scene last set, else the story's.
 */
function timeNow(): TimeOfDay {
  const forced = params.get('time')
  if (forced === 'day' || forced === 'evening' || forced === 'night') return forced
  if (params.get('lighting') === 'night') return 'night'
  return timeOfPhase(phaseOf(clock.ticks))
}

/**
 * Let the time pass and show it: the field's seconds count while the Hero is
 * out in one with nothing else going on; a turn of the time tints the view,
 * and into or out of the night rebuilds the map with its other lit pieces
 * where the Hero stands, and sets the field's monsters roaming again by the
 * night's zone. Ours — see `daytime.ts`.
 */
function keepTime(elapsedMs: number): void {
  const here = loaded
  if (!here || !self) return
  // **The clock runs on a field, the ocean or the sky** — a second a second,
  // whatever else is going on there (INFERRED: the game has no gate for
  // menus, talk, scenes or battles) — and nowhere else. See `Clock`.
  clockCarry = Math.min(clockCarry + elapsedMs, 250)
  while (clockCarry >= 1000 / 60) {
    tickClock(clock, here.mapKind)
    clockCarry -= 1000 / 60
  }
  // **What a scene asked of the clock** — `808`'s phase, `579`'s running —
  // applied once, and it stays when the scene ends.
  const asked = playing?.player.stage.clockAsked
  if (asked && (asked.phase !== undefined || asked.running !== undefined)) {
    if (asked.phase !== undefined) setPhase(clock, asked.phase)
    if (asked.running !== undefined) clock.running = asked.running
    if (playing) playing.player.stage.clockAsked = {}
  }
  const time = timeNow()
  // A scene's own light scale changes every frame while it fades, so the tint
  // is put up again whether or not the time of day turned — see `578`.
  showTint(time)
  if (time === shownTime) return
  const relit = shownTime !== undefined && lightingFor(time) !== lightingFor(shownTime)
  const turned = shownTime !== undefined
  shownTime = time
  wantedLighting = lightingFor(time)
  if (relit) {
    enter(here.code, {
      x: toFloat(self.state.x),
      y: toFloat(self.state.y),
      z: toFloat(self.state.z),
      facing: self.facing,
    })
  } else if (turned && roaming) beginRoaming()
}
// For a headless check: the portrait drawn, and how much of it is not clear.
Object.defineProperty(window, 'minstrelPortrait', {
  get: () => {
    const drawn = memberPortrait(0)
    if (!drawn) return { drawn: false, motions: loaded ? [...loaded.figure.motions.keys()] : [] }
    const probe = document.createElement('canvas')
    probe.width = drawn.width
    probe.height = drawn.height
    const g = probe.getContext('2d')
    if (!g) return { drawn: true }
    g.drawImage(drawn, 0, 0)
    const data = g.getImageData(0, 0, probe.width, probe.height).data
    let opaque = 0
    for (let i = 3; i < data.length; i += 4) if ((data[i] as number) > 0) opaque++
    return {
      drawn: true,
      width: drawn.width,
      height: drawn.height,
      opaque,
      pixels: data.length / 4,
    }
  },
})
// For a headless check: what the Hero wears, readable from the page.
Object.defineProperty(window, 'minstrelWorn', {
  get: () => ({
    equipped: [...wornBy(leader()).entries()],
    parts: loaded ? [...loaded.wardrobe.parts.keys()].filter((n) => /^p_[ws]/.test(n)) : [],
  }),
})
// For a headless check: the time of day, readable from the page.
Object.defineProperty(window, 'minstrelTime', {
  get: () => ({ time: timeNow(), clock: { ...clock }, lighting: wantedLighting }),
})
// For a headless check: the camera, to pull back and look round from a script.
Object.defineProperty(window, 'minstrelCamera', { get: () => camera })
/**
 * For a headless check, and for testing by hand: `minstrelLevel(30)` puts the
 * Hero at that level and gives back its numbers with the attack and defence a
 * fight would use; `minstrelLevel()` reads them without moving. See `levelTo`.
 */
Object.defineProperty(window, 'minstrelLevel', {
  value: (level?: number) => {
    const row = level === undefined ? heroRow() : levelTo(Math.trunc(level))
    if (!row) return null
    const worn = wornNumbers()
    return {
      level: row.level,
      exp: expOf(leader()),
      maxHp: row.maxHp,
      maxMp: row.maxMp,
      strength: row.strength,
      resilience: row.resilience,
      agility: row.agility,
      attack: row.strength + worn.attack,
      defence: row.resilience + worn.defence,
    }
  },
})
// For a headless check: the field's monsters, where each stands and what it plays.
Object.defineProperty(window, 'minstrelRoaming', {
  get: () =>
    roaming?.roamers.map((r) => ({
      number: r.number,
      x: toFloat(r.state.x),
      y: toFloat(r.state.y),
      z: toFloat(r.state.z),
      moving: r.moving,
      grounded: r.state.grounded,
    })) ?? null,
})
/**
 * `?door=M01M02` takes that doorway as soon as the first map has loaded.
 *
 * Walking into a door cannot be driven by a headless browser, and this is the
 * same path a door takes — `enter` with the doorway's own arrival — so a
 * screenshot of it is a screenshot of the real thing.
 */
const wantedDoor = params.get('door')
/**
 * `?fly=x,z` on the sky map (`?map=O01`) — a debugging aid, **ours**: the
 * Express in flight at that place in the sky's own units, as Sterling's
 * whistle would put it there, so a headless screenshot can see the flight.
 */
const wantedFlight = params.get('fly')
/**
 * `?bag=w,s:3` — a debugging aid, **ours**: one of every item the named item
 * tables list — or as many as follow a colon — put into the bag, once, when the
 * first map loads, to see the equipment screen full. The letters are the item
 * tables' own: `w` weapons, `s` shields and so on (see `readItemTable`).
 */
const wantedBag = params.get('bag')
/**
 * `?armoury=1` — **ours, for testing**: one of every weapon, shield and piece
 * of armour on the cartridge in the bag, and anyone may wear anything — so
 * every kind of weapon and every outfit can be put on the Hero and looked at,
 * whatever their vocation. The tables are the equipment slots' own
 * (`EQUIPMENT_SLOTS`), accessories left out as nothing draws them.
 */
const armoury = params.get('armoury') === '1'
const ARMOURY_TABLES: ReadonlySet<string> = new Set(['w', 's', 'h', 'b', 'a', 'u', 'l'])
let bagFilled = false
function fillBag(opened: Loaded): void {
  if (bagFilled || (!wantedBag && !armoury)) return
  bagFilled = true
  if (armoury) {
    for (const [id, goods] of opened.goods) {
      if (ARMOURY_TABLES.has(goods.table) && !bag.items.has(id)) bag = take(bag, { item: id })
    }
    status(`the armoury: ${bag.items.size} kinds of thing in the bag, and anyone may wear anything`)
  }
  for (const part of (wantedBag ?? '').split(',').filter((p) => p !== '')) {
    const [table, times] = part.split(':')
    const count = Math.max(1, Number(times) || 1)
    for (const [id, goods] of opened.goods) {
      if (goods.table !== table) continue
      for (let i = 0; i < count; i++) bag = take(bag, { item: id })
    }
  }
}

/**
 * `?wear=21002,20004` — a debugging aid, **ours**: those items put in the bag
 * and worn, once, when the first map loads, to see them on the Hero.
 */
const wantedWear = params.get('wear')
let wearDone = false
function wearWanted(): void {
  if (wearDone || !wantedWear) return
  wearDone = true
  for (const part of wantedWear.split(',')) {
    const id = Number(part)
    if (!Number.isInteger(id)) continue
    const slot = slotOf(partName(id)?.split('_')[1]?.[0])
    if (!slot) continue
    bag = take(bag, { item: id })
    const worn = equip(bag, wornBy(leader()), slot, id)
    if (worn) {
      bag = worn.bag
      wear(leader(), worn.equipped)
    }
  }
  dressHero()
}

/**
 * A dump chosen or dropped: checked against the reference, begun, and kept in
 * the browser for next time — the file itself, whole; see `cartridge-store.ts`.
 */
async function chose(file: File): Promise<void> {
  status(`reading ${file.name}…`)
  const bytes = new Uint8Array(await file.arrayBuffer())
  await checkAndBegin(bytes, true)
}

/** Identify the bytes, say what they are, begin, and keep them if asked. */
async function checkAndBegin(bytes: Uint8Array, keep: boolean): Promise<void> {
  status('checking the cartridge…')
  identity = await identifyCartridge(bytes)
  const said = describeIdentity(identity)
  status(said)
  await begin(bytes, wantedMap)
  // Said again after the map's own line, where a difference matters most.
  if (identity.verdict !== 'reference') status(said)
  if (!keep) return
  try {
    await keepCartridge(bytes, identity)
  } catch (error) {
    status(
      `the cartridge could not be kept in this browser: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/** The cartridge kept from a past visit, offered on the start screen. */
async function offerKept(): Promise<void> {
  const kept = await keptCartridge()
  if (!kept) return
  const when = new Date(kept.keptAt).toLocaleString()
  keptSaid.textContent = `Kept in this browser on ${when}: ${describeIdentity(kept.identity)}.`
  keptRow.hidden = false
  keptLoad.onclick = () => {
    keptRow.hidden = true
    identity = kept.identity
    status(describeIdentity(kept.identity))
    void begin(kept.bytes, wantedMap)
  }
  keptForget.onclick = () => {
    keptRow.hidden = true
    void forgetCartridge().then(() => status('the kept cartridge is forgotten'))
  }
}
// For a headless check: what the cartridge was identified as, and what the browser keeps.
Object.defineProperty(window, 'minstrelIdentity', { get: () => identity })
Object.defineProperty(window, 'minstrelKept', {
  value: async () => {
    const kept = await keptCartridge()
    return kept && { size: kept.bytes.length, sha1: kept.identity.sha1, keptAt: kept.keptAt }
  },
})

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) void chose(file)
})
document.addEventListener('dragover', (event) => {
  event.preventDefault()
  document.body.classList.add('dragging')
})
document.addEventListener('dragleave', () => document.body.classList.remove('dragging'))
document.addEventListener('drop', (event) => {
  event.preventDefault()
  document.body.classList.remove('dragging')
  const file = event.dataTransfer?.files?.[0]
  if (file) void chose(file)
})

let dragging = false
let lastX = 0
let lastY = 0
canvas.addEventListener('pointerdown', (event) => {
  dragging = true
  lastX = event.clientX
  lastY = event.clientY
  canvas.setPointerCapture(event.pointerId)
})
canvas.addEventListener('pointerup', (event) => {
  dragging = false
  canvas.releasePointerCapture(event.pointerId)
})
canvas.addEventListener('pointermove', (event) => {
  if (!dragging) return
  camera.yaw -= (event.clientX - lastX) * 0.01
  camera.pitch += (event.clientY - lastY) * 0.01
  lastX = event.clientX
  lastY = event.clientY
})

/**
 * Rebuild the collision from the map's meshes with the current fit applied.
 *
 * Both the mesh drawn and the one walked on, so a fit can be judged by walking
 * it. Cheap enough to do on a keypress: an interior is a few dozen triangles.
 */
function refit(): void {
  if (!loaded) return
  // The collision takes its own fit and the world scale on top of it, so the
  // two questions stay separate: does the collision match the room, and does
  // the pair match the character.
  // A door's own collision stands only while the door is shut; a sliding
  // piece's goes where the piece does.
  const standing = loaded.map.meshes.flatMap((placed, index) => {
    if (doors.some((door) => door.mesh === index && !doorShut(door))) return []
    const slid = slides.find((slide) => slide.mesh === index)?.offset
    if (!slid || (slid.x === 0 && slid.z === 0)) return [placed]
    const at = placed.offset ?? { x: 0, y: 0, z: 0 }
    return [
      {
        ...placed,
        offset: {
          x: at.x + Math.round(slid.x * FX32_ONE),
          y: at.y,
          z: at.z + Math.round(slid.z * FX32_ONE),
        },
      },
    ]
  })
  const meshes = fitMeshes(standing, {
    sx: fit.sx * worldScale,
    sy: fit.sy * worldScale,
    sz: fit.sz * worldScale,
    x: fit.x * worldScale,
    y: fit.y * worldScale,
    z: fit.z * worldScale,
  })
  world = meshes.length > 0 ? createCollisionWorld(meshes) : undefined
  worldMeshes = meshes
  collisionDrawn = world ? collisionPieces(world) : []
}

/**
 * Step the story stage through the ones this map's cast records and triggers
 * start at — see `Loaded.stages`. Before the first is no stage at all: the
 * file's own first placement of each character.
 */
function moveStage(by: number): void {
  if (!loaded) return
  const known = [...loaded.stages]
  const current = storyStage
  if (current && !known.some((stage) => sameStage(stage, current))) known.push(current)
  known.sort((a, b) => stageOrder(a) - stageOrder(b))
  const list: (Stage | undefined)[] = [undefined, ...known]
  const at = list.findIndex((stage) => sameStage(stage, current))
  storyStage = list[(at + by + list.length) % list.length]
  // Flags are the stage's own — see `followEvent` — so a stage stepped to has none.
  storyFlags.clear()
  storyMarks.clear()
  storyStep = 0
  liveThread = threadOf(loaded.mapId)
  castLeft.clear()
  closeTalk()
  loaded = {
    ...loaded,
    cast: loaded.castAt(storyStage, undefined, timeNow() === 'night', storyGlobals),
  }
  poseMap(Math.max(mapFrame, 0))
  const here = loaded.cast.members.length + loaded.cast.sprites2d.length
  const line =
    storyStage === undefined
      ? `${loaded.code} cast as the file first places it — ${here} characters · t/y change stage`
      : `${loaded.code} stage ${storyStage.major}.${storyStage.minor} · talk from chapter ${chapter() ?? '—'} — ${here} characters · t/y change stage`
  status(line)
  console.log(line)
}

/** The chapter letter talk is read from: the one `v` and `b` chose, or the stage's. */
function chapter(): string | undefined {
  if (!loaded || loaded.letters.length === 0) return undefined
  if (chapterIndex !== undefined) return loaded.letters[chapterIndex]
  return letterForStage(loaded.letters, storyStage)
}

/** Step the chapter talk is read from, leaving the cast where it stands. */
function moveChapter(by: number): void {
  if (!loaded || loaded.letters.length === 0) return
  const count = loaded.letters.length
  const from = chapterIndex ?? Math.max(0, loaded.letters.indexOf(chapter() ?? ''))
  chapterIndex = (from + by + count) % count
  closeTalk()
  status(
    `${loaded.code} talk from chapter ${loaded.letters[chapterIndex]} (${chapterIndex + 1} of ${count}) · v/b change chapter · f talk`,
  )
}

/**
 * The map's pots and barrels, facing the camera — see `pots.ts`. One opened is
 * smashed: its shards fly while they last, and then there is nothing there.
 */
function propPiecesNow(here: Loaded, now: number): Piece[] {
  const height = toFloat(PERSON.height) * worldScale
  return here.props.flatMap((prop) => {
    const key = treasureKey(here.code, prop.slot, prop.treasure)
    if (!openedTreasure.has(key)) return propPieces(prop, height, camera.yaw)
    const since = smashedAt.get(key)
    const shard = since === undefined ? undefined : breakingFrame(prop, now - since)
    return shard === undefined || !prop.breaking
      ? []
      : propPieces(prop.breaking, height, camera.yaw, shard)
  })
}

/** Where the map's chests stand in the Hero's way, in fx32 — see `chestFootprints`. */
let chestsInTheWay: Solid[] = []

/** Redraw the treasure markers, after a map is entered or a treasure opened. */
function refreshTreasures(): void {
  if (!loaded) {
    treasureDrawn = []
    chestsInTheWay = []
    return
  }
  chestsInTheWay = chestFootprints(loaded.treasures, loaded.chests).map((at) => ({
    x: Math.round(at.x * FX32_ONE),
    z: Math.round(at.z * FX32_ONE),
    radius: Math.round(at.radius * FX32_ONE),
  }))
  const { code, treasures } = loaded
  const isOpen = (treasure: Treasure, slot: number) =>
    openedTreasure.has(treasureKey(code, slot, treasure))
  // A chest being opened lifts its lid with the Hero's hands — see `openChest`.
  const lidOpenness = (treasure: Treasure, slot: number) => {
    const key = treasureKey(code, slot, treasure)
    if (opening?.key === key) return lidRaised(performance.now())
    return isOpen(treasure, slot) ? 1 : 0
  }
  treasureDrawn = [
    // A chest is drawn with its own model; anything else placed keeps a marker.
    ...chestPieces(treasures, loaded.chests, lidOpenness, (material) =>
      textureFor(loaded?.catalogue ?? { textures: new Map() }, material),
    ),
    ...treasurePieces(
      treasures,
      isOpen,
      toFloat(PERSON.height) * worldScale * TREASURE_MARKER,
      (treasure) => isChest(treasure) || isPotOrBarrel(treasure),
    ),
  ]
}

/** The recipes known — see `learnRecipe` in `alchemy.ts`. Saved. */
const recipesKnown = new Map<number, number>()

/** How far from a bookcase's own way the Hero may face and still read it: `8364.2` fx32 (`func_ov017_021984f4`), about 117°. */
const BOOKCASE_TURN = 8364.2 / 4096

/**
 * **Read the bookcase the Hero stands at**, if any — read 4 October 2026
 * (`func_ov017_021ac3b0`): inside its box and facing within
 * {@link BOOKCASE_TURN} of its way, the nearest way winning. The Hero turns
 * to it, its book's text is shown — a plain book's, or a recipe book's
 * first reading, or "already knows", or "nothing of interest" before the Krak
 * Pot has been used — and once the text is read, a recipe book's recipes are
 * learnt and its flag set. True when there was one.
 *
 * **Ours**: the book-taking sound and `<SE_RECIPE>`, whose ids are not read,
 * are not played.
 */
function readBookcaseAhead(): boolean {
  if (!loaded || !self || loaded.mapId === undefined) return false
  const x = toFloat(self.state.x) / worldScale
  const y = toFloat(self.state.y) / worldScale
  const z = toFloat(self.state.z) / worldScale
  const turnTo = (way: number) => {
    const d = Math.abs((self?.facing ?? 0) - way) % (2 * Math.PI)
    return Math.min(d, 2 * Math.PI - d)
  }
  const found = loaded.bookcases
    .filter((c) => inArea(c.area, x, y, z) && turnTo(c.facing) < BOOKCASE_TURN)
    .sort((a, b) => turnTo(a.facing) - turnTo(b.facing))[0]
  if (!found) return false
  self.facing = found.facing
  const shelf = shelfAt(loaded.bookshelves, loaded.mapId, found.index)
  const nothing =
    loaded.standardWords.get(0x53) ?? "There don't seem to be any books of particular interest."
  let text = nothing
  let teaches = false
  if (shelf) {
    if (!shelf.recipeBook || !storyGlobals.has(FLAG_POT_USED)) text = shelf.text0 ?? nothing
    else if (storyGlobals.has(BOOK_FLAG + shelf.book)) text = shelf.text2 ?? shelf.text1 ?? nothing
    else {
      text = shelf.text1 ?? nothing
      teaches = true
    }
  }
  talkContext = textContext()
  talking = startConversation(
    { id: -1, name: '', x: toFloat(self.state.x), z: toFloat(self.state.z) },
    `bookcase ${found.index}`,
    [text],
    [shelf ? `htana, book ${shelf.book}` : 'strstd 0x53'],
    talkContext,
  )
  if (teaches && shelf) {
    afterTalk = () => {
      for (const recipe of shelf.recipes) learnRecipe(recipesKnown, recipe)
      storyGlobals.add(BOOK_FLAG + shelf.book)
      status(`a recipe book: ${shelf.recipes.length} recipes learnt`)
    }
  }
  showTalk()
  return true
}

/**
 * Open the treasure the Hero is facing, if there is one near enough: the same
 * reach and facing as talking. True when there was one.
 */
function openTreasureAhead(): boolean {
  if (!loaded || !self) return false
  const target = talkTarget(
    { x: toFloat(self.state.x), z: toFloat(self.state.z), facing: self.facing },
    [
      ...treasureTargets(loaded.treasures),
      ...cabinetTargets(cabinets).map((t) => ({ ...t, id: CABINET_TARGET + t.id })),
    ],
  )
  if (!target) return false
  // A cabinet opens and shuts again as it is searched — see `searchedFrame`.
  const cabinet = target.id >= CABINET_TARGET ? cabinets[target.id - CABINET_TARGET] : undefined
  if (cabinet) {
    cabinet.searched = mapTime(Math.max(mapFrame, 0))
    poseMap(Math.max(mapFrame, 0))
  }
  const slot = cabinet ? cabinet.slot : target.id
  const treasure = slot === undefined ? undefined : loaded.treasures[slot]
  if (slot === undefined || !treasure) {
    talking = startConversation(
      target,
      `${cabinet?.stem ?? 'treasure'} in ${loaded.code}`,
      ['You open it. No treasure record is paired with it.'],
      ['unpaired'],
      textContext(),
    )
    showTalk()
    return true
  }
  const key = treasureKey(loaded.code, slot, treasure)
  const already = openedTreasure.has(key)
  const found = findInside(
    treasure,
    loaded.randoms,
    loaded.itemNames,
    undefined,
    loaded.monsterNames,
    loaded.systemStrings,
  )
  // Gold to the purse; an item the game's way — a member first, see `obtain`.
  if (!already) {
    if (found.takings.gold) bag = take(bag, { gold: found.takings.gold })
    if (found.takings.item !== undefined) give(found.takings.item)
  }
  // A pot or a barrel breaks as it is opened, and then is gone.
  if (!already && isPotOrBarrel(treasure)) smashedAt.set(key, performance.now())
  const code = loaded.code
  const tell = () => {
    talking = startConversation(
      { ...target, id: treasure.index ?? target.id },
      `${cabinet ? `${cabinet.stem}, ` : ''}kind 0x${treasure.kind.toString(16)} in ${code}`,
      [treasureText(treasure, already, found.text)],
      [already ? 'already open' : found.note],
      textContext(),
    )
    showTalk()
  }
  // A shut chest is opened by the Hero's own motion, and tells what was inside after.
  if (!already && !cabinet && isChest(treasure) && loaded.figure.motions.has(OPEN_CHEST_MOTION)) {
    opening = { key, started: performance.now(), lidUp: false, afterwards: tell }
    return true
  }
  openedTreasure.add(key)
  refreshTreasures()
  tell()
  return true
}

/**
 * The Hero opening a chest: `takara` — *treasure* — the motion every player
 * figure carries beside `hirou`, picking up, played once at the map's rate.
 *
 * **The lid goes back from its frame 6 to 9.** The chest has no motion of its
 * own — `T00GDS01` and `02` are its body and its lid, and nothing on the
 * cartridge turns the one on the other (see `chests.ts`) — so the lid follows
 * the Hero's hands. Frames 3 to 5 crouch, the forearms lowest on 5 at 31% of
 * the figure's height — where a chest's lid is, 28% of a person — and from 6
 * to 9 they rise up and forward, highest on 9. That the lid goes back as the
 * hands rise is INFERRED from that; the text of what was inside waiting for
 * the motion's end is **ours**.
 */
const OPEN_CHEST_MOTION = 'takara'
const OPEN_CHEST_LID_FRAME = 6
/** The frame the Hero's arms are highest, and the lid all the way back: 9. */
const OPEN_CHEST_LID_UP = 9
/** The chest being opened, when the Hero is opening one. */
let opening:
  | {
      readonly key: string
      readonly started: number
      lidUp: boolean
      readonly afterwards: () => void
    }
  | undefined

/** How far into opening the chest the Hero is, in the motion's frames. */
function chestOpeningFrame(now: number): number {
  return opening ? Math.floor(chestOpeningTime(now)) : 0
}

/** The same, between frames. */
function chestOpeningTime(now: number): number {
  return opening ? ((now - opening.started) * MAP_FPS) / 1000 : 0
}

/** How far the lid of the chest being opened has gone back: 0 until the arms rise, 1 at their highest. */
function lidRaised(now: number): number {
  const along =
    (chestOpeningTime(now) - OPEN_CHEST_LID_FRAME) / (OPEN_CHEST_LID_UP - OPEN_CHEST_LID_FRAME)
  return Math.max(0, Math.min(1, along))
}

/** Put the lid up on its frame, and at the motion's end tell what was inside. */
function followChestOpening(now: number): void {
  const going = opening
  const motion = loaded?.figure.motions.get(OPEN_CHEST_MOTION)
  if (!going) return
  const frame = chestOpeningFrame(now)
  if (!going.lidUp && frame >= OPEN_CHEST_LID_FRAME) {
    going.lidUp = true
    openedTreasure.add(going.key)
  }
  // The lid moves every frame it is going up.
  refreshTreasures()
  if (!motion || frame >= motion.frameCount) {
    openedTreasure.add(going.key)
    opening = undefined
    refreshTreasures()
    going.afterwards()
  }
}

/** The Hero's pose while opening a chest. */
function chestOpeningPose(
  now: number,
): { readonly motion: Animation; readonly frame: number } | undefined {
  const motion = opening ? loaded?.figure.motions.get(OPEN_CHEST_MOTION) : undefined
  if (!motion) return undefined
  return { motion, frame: Math.min(chestOpeningFrame(now), motion.frameCount - 1) }
}

/**
 * `f`: talk to whoever the Hero is facing, or go on to the next page. With
 * nobody there, open the treasure or the cabinet in front instead, if there is one.
 *
 * What they say is `pickLine`'s choice for the story stage — a line of their
 * talk file, or an event's messages — and the status line says why. `Shift+F`
 * reads out every line of their file instead, for checking the choice.
 */
/** An event being read out for want of a script that will read — see `followEvent`. */
let talkEvent: number | undefined
/**
 * The talk records that may run once the line being read is read, and who it
 * was said by — see `Choice.after`. The first whose answer holds runs.
 */
let talkAfter: { after: readonly After[]; who: Talker } | undefined
/**
 * The answer the last prompt was given, from 0. Every talk's window sets it to
 * 0 as it opens, as the game's does — see `OP_ANSWER_IS`.
 */
let talkAnswer = 0
/**
 * How often each character has been talked to, by id — see `Talked` — and the
 * sub-stage and area they were counted in, since a new one of either starts
 * some of them again.
 */
const talkCounts = new Map<number, Talked>()
let talkCountsStage: Stage | undefined
let talkCountsArea: string | undefined

/** Entering a map: its counts start again, and all of them in another area. */
function enteredForTalk(area: string): void {
  if (area !== talkCountsArea) talkCounts.clear()
  else for (const [id, counts] of talkCounts) talkCounts.set(id, { ...counts, map: 0 })
  talkCountsArea = area
}

/** How often `id` has been talked to, as the game counts it — see `Talked`. */
function talkedTo(id: number): Talked {
  if (!sameStage(talkCountsStage, storyStage)) {
    talkCounts.clear()
    talkCountsStage = storyStage
  }
  return talkCounts.get(id) ?? NEVER_TALKED
}

/** A line said: both of the speaker's counts go up, to 15. */
function countTalk(id: number): void {
  const { area, map } = talkedTo(id)
  talkCounts.set(id, { area: Math.min(area + 1, 15), map: Math.min(map + 1, 15) })
}

function talk(everyLine = false): void {
  if (!loaded || !self || opening) return
  // The Abbey's ceremony runs its time before anything more is said.
  if (serviceWait) return
  if (talking) {
    const ending = talking
    // The answer given at a prompt, kept even where its branch ends the talk:
    // the Hexagon statue's Yes, `<YES><END>`, which its scene waits on.
    const given = answerNow(ending)
    talking = nextPage(talking, talkContext)
    if (given !== undefined) talkAnswer = given
    showTalk()
    // A line that ends by handing over — `<ADD><SHOP=32>` — opens its service.
    if (!talking && ending.run.service) openService(ending.run.service, ending.who)
    // An event's message, read to its end, lets the event go on.
    if (!talking && playing) {
      playing.player.dismiss()
      playing.showing = undefined
    }
    // An event read out for want of its script goes on as a played one does.
    if (!talking && talkEvent !== undefined) {
      const read = talkEvent
      talkEvent = undefined
      followEvent(read)
    }
    // The talk records after the line, once it is read: the first whose
    // answer holds runs — Alltrades Abbey at 6.1 moves on to 6.2 so, Erinn's
    // evening question goes on to the morning upstairs, and the Hexagon's
    // statue asks "Press the button?" before its scene. See `pickLine`.
    if (!talking && talkAfter) {
      const { after, who } = talkAfter
      talkAfter = undefined
      const outcome = afterFor(after, talkAnswer)
      if (outcome && runTalkRecord(outcome, who)) return
    }
    // A conversation that goes on to something of the engine's own once read
    // — Cap'n Max's list, after his lines — with the answer given.
    if (!talking && afterTalk) {
      const go = afterTalk
      afterTalk = undefined
      go(talkAnswer)
    }
    return
  }
  // While an event plays, `f` only reads its messages.
  if (playing) return
  talkAfter = undefined
  afterTalk = undefined
  const cast: Talker[] = [
    // Where they stand now, an event having left them there — see `castPlaced`.
    ...[...loaded.cast.members, ...loaded.cast.sprites2d].map((member) => {
      const { id, x, z } = castPlaced(member.placement)
      return { id, name: member.name, x, z }
    }),
    // Something to examine is talked to like anyone else — see `Cast.spots`.
    ...loaded.cast.spots.map(({ placement }) => ({
      id: placement.id,
      name: 'something to examine',
      x: placement.x,
      z: placement.z,
    })),
  ]
  const hero = { x: toFloat(self.state.x), z: toFloat(self.state.z), facing: self.facing }
  const near = talkTarget(hero, cast)
  // **A talk box the Hero stands in** picks its character too, and the talk
  // asks with its label — the only way a thing to examine is talked to. Of
  // those, and whoever is near, the game takes the one most nearly faced
  // (ov017 `func_ov017_021a4e88`). See `TalkBox`.
  const boxed = talkBoxesAt(hero.x, hero.z)
  const turn = (t: Talker) => {
    const d = Math.abs(hero.facing - facingToward(hero, t)) % (2 * Math.PI)
    return Math.min(d, 2 * Math.PI - d)
  }
  const picked = [...boxed, ...(near ? [{ who: near, label: undefined }] : [])].sort(
    (a, b) => turn(a.who) - turn(b.who),
  )[0]
  const who = picked?.who
  if (!who) {
    if (openTreasureAhead()) return
    if (readBookcaseAhead()) return
    const here = { x: toFloat(self.state.x), z: toFloat(self.state.z) }
    const nearest = nearestTreasure(loaded.treasures, here)
    const cabinet = cabinets
      .map((c) => Math.hypot(c.x - here.x, c.z - here.z))
      .sort((a, b) => a - b)[0]
    status(
      'nobody near enough, and in front, to talk to, and no treasure' +
        (nearest
          ? ` — the nearest, #${nearest.treasure.index ?? '?'}, is ${nearest.distance.toFixed(2)} away`
          : ' placed in this map') +
        (cabinet === undefined ? '' : `; the nearest cabinet is ${cabinet.toFixed(2)} away`),
    )
    return
  }
  // **A character whose record names a facility opens it**, and says the
  // facility's own lines rather than any of theirs — Cap'n Max and his medals.
  // See `facilityFor`.
  if (
    loaded.mapId !== undefined &&
    storyStage !== undefined &&
    facilityFor(loaded.triggers, loaded.mapId, who.id, storyStage) === FACILITY_MEDALS
  ) {
    visitMedals(who)
    return
  }
  talkWith(who, undefined, everyLine, picked?.label)
}

/** Whoever of this map's cast has a talk box holding the point, with the box's label — see `TalkBox`. */
function talkBoxesAt(x: number, z: number): { who: Talker; label: number }[] {
  if (!loaded) return []
  const out: { who: Talker; label: number }[] = []
  const all = [
    ...[...loaded.cast.members, ...loaded.cast.sprites2d].map((m) => ({
      placement: m.placement,
      name: m.name,
    })),
    ...loaded.cast.spots.map(({ placement }) => ({ placement, name: 'something to examine' })),
    // Talked to only so — see `Cast.standIns`.
    ...loaded.cast.standIns.map(({ placement }) => ({ placement, name: STAND_IN_NAME })),
  ]
  for (const { placement, name } of all) {
    const box = (placement.boxes ?? []).find((b) => inTalkBox(b, x, z))
    if (!box) continue
    const at = castPlaced(placement)
    out.push({ who: { id: placement.id, name, x: at.x, z: at.z }, label: box.label })
  }
  return out
}

/**
 * Talk to `who` as the game does — see `pickLine` — with the label a record
 * asked for, or without one as the Hero walks up to them. `everyLine` reads
 * out every line of their file instead, for checking the choice.
 */
function talkWith(who: Talker, label: number | undefined, everyLine = false, box?: number): void {
  if (!loaded) return
  const letter = chapter()
  const lines = letter === undefined ? [] : loaded.linesOf(who.id, letter)
  talkContext = contextFor(lines.map((line) => line.text ?? ''))
  // The window opens, and the answer with it is 0 — see `talkAnswer`.
  talkAnswer = 0
  if (everyLine || storyStage === undefined) {
    talking = startConversation(
      who,
      `every line of chapter ${letter ?? '—'}`,
      lines.map((line) => line.text),
      lines.map(noteOf),
      talkContext,
    )
  } else {
    // The quests they offer, as talking asks first — see `offerFor`.
    offerQuests(who.id)
    const choice = pickLine({
      triggers: loaded.triggers,
      map: loaded.mapId,
      stage: storyStage,
      night: timeNow() === 'night',
      id: who.id,
      lines,
      ...(label !== undefined ? { label } : {}),
      ...(box !== undefined ? { box } : {}),
      flags: storyFlags,
      marks: storyMarks,
      alone: companionsNow().every(standingHere),
      party: members.length,
      step: stepNow(),
      globals: storyGlobals,
      talked: talkedTo(who.id),
      quest: (quest) => questNibble(questBook, quest),
    })
    // Everything the character's own record does, as the game runs every
    // action of the record it takes; its event, if it has one, is played below.
    if (choice && choice.kind !== 'line' && runTalkRecord(choice.record, who)) return
    if (choice?.kind === 'line') {
      if (choice.record) storyFromRecord(choice.record)
      countTalk(who.id)
      talking = startConversation(
        who,
        `chapter ${letter}: ${choice.why}`,
        [choice.line.text],
        [noteOf(choice.line)],
        talkContext,
      )
      talkAfter = { after: choice.after, who }
      // A line that is nothing but its service — Jack's `<DAMA>` — opens it
      // at once, with no page to read first.
      const bare = talking
        ? undefined
        : runLine(parseMarkup(choice.line.text ?? ''), 0, talkContext).service
      if (bare) {
        openService(bare, who)
        return
      }
    }
    if (!talking && !playing) {
      const when = storyStage ? ` at ${storyStage.major}.${storyStage.minor}` : ''
      status(
        choice?.kind === 'record'
          ? `${who.name} (#${who.id}): ${choice.why}`
          : `${who.name} (#${who.id}) has nothing to say in chapter ${letter ?? '—'}${when}` +
              (label !== undefined ? ` for label ${label}` : ''),
      )
      return
    }
  }
  if (talking) showTalk()
}

/**
 * Run a talk's record — a character's own, or a talk record after a line —
 * and whatever it has follow: another talk (`118`), a hand-on to another map,
 * or an event. True when something was started that takes over.
 */
function runTalkRecord(outcome: EventOutcome, who: Talker): boolean {
  if (!loaded) return false
  storyFromRecord(outcome)
  // A set battle it starts — Gortress's captain, the tower's guards — as an
  // event's record starts one; see `followRecord`.
  if (outcome.battle !== undefined) {
    startEventBattle(outcome.battle)
    return true
  }
  // `106 : c` starts that character's counts again — see `Talked`.
  for (const action of outcome.actions ?? []) if (action.op === 106) talkCounts.delete(action.arg)
  // DQVC by Nintendo Wi-Fi Connection, `145 : 5` — see `connectDqvc`.
  if ((outcome.actions ?? []).some((a) => a.op === OP_FACILITY && a.arg === FACILITY_DQVC_ONLINE)) {
    connectDqvc(who)
    return true
  }
  // The Starflight Express's list — its conductor's record, `215`.
  if (outcome.express) {
    openExpress(outcome.express, who)
    return true
  }
  if (outcome.talk) {
    const to = outcome.talk.character === who.id ? who : talkerFor(outcome.talk.character)
    if (to) {
      talkWith(to, outcome.talk.label)
      return talking !== undefined || playing !== undefined
    }
  }
  if (outcome.onward) {
    const code = loaded.mapCodeOf(outcome.onward.map)
    if (code && (code === loaded.code || enter(code, undefined, true)))
      startEvent(outcome.onward.event)
    return true
  }
  if (outcome.event !== undefined) {
    const event = outcome.event
    // Played, not read out, so that what follows it follows — see `followEvent`.
    // Begun by talking, it carries straight on from the conversation — see `afterTalk`.
    if (loaded.eventScript(event) && startEvent(event, true)) return true
    const messages = loaded.eventMessages(event)
    talking = startConversation(
      who,
      `ev${String(event).padStart(5, '0')}`,
      messages.map((message) => message.text),
      messages.map((message) => `message ${message.id}`),
      textContext(),
    )
    // What follows it follows once it is read — or at once, with nothing to
    // read: Patty's `ev22510` starts the fight with Hexagoon.
    if (!talking) {
      followEvent(event)
      return true
    }
    talkEvent = event
    showTalk()
    return true
  }
  return false
}

/** Whoever of the cast has id `id` in this map, to be talked to by a record's `118`. */
function talkerFor(id: number): Talker | undefined {
  if (!loaded) return undefined
  const member = [...loaded.cast.members, ...loaded.cast.sprites2d].find(
    (m) => m.placement.id === id,
  )
  if (member) {
    const { x, z } = castPlaced(member.placement)
    return { id, name: member.name, x, z }
  }
  const spot = loaded.cast.spots.find(({ placement }) => placement.id === id)
  if (spot) return { id, name: 'something to examine', x: spot.placement.x, z: spot.placement.z }
  const standIn = loaded.cast.standIns.find(({ placement }) => placement.id === id)
  return standIn && { id, name: STAND_IN_NAME, x: standIn.placement.x, z: standIn.placement.z }
}

/** What a stand-in over a counter is called on the status line — **ours**; see `Cast.standIns`. */
const STAND_IN_NAME = 'someone over the counter'

/**
 * The innkeeper's line asks the engine for its price (`<val_2>`) and for how
 * many are staying (`<val_1>`): the keeper's own price a head times the
 * living — see `innPrice`.
 */
function contextFor(texts: readonly string[]): TextContext {
  const inn = texts.map((text) => /<INN=(\d+)>/.exec(text)).find((m) => m)
  if (!inn || !cartridge) return textContext()
  const words = keeperWords(cartridge, 'in', Number(inn[1]) - 1)
  const living = members.filter((m) => m.hp !== 0).length
  const { total } = innPrice(words.get(INN_SAYS.perHead), living)
  return { ...textContext(), values: { val_1: String(living), val_2: String(total) } }
}

/**
 * What the Hero is called: the name creation's last screen gave them, or
 * "Hero" for one made before there was a name screen — see `naming.ts`.
 * Every line that names them names them so.
 */
function heroName(): string {
  return members[0]?.name ?? DEFAULT_CONTEXT.heroName
}

/** The text a line is filled from, with the Hero's own name in it. */
function textContext(): TextContext {
  const name = heroName()
  return name === DEFAULT_CONTEXT.heroName
    ? DEFAULT_CONTEXT
    : { ...DEFAULT_CONTEXT, heroName: name }
}

/** An item's name as the text box shows it, or its id when the names did not read. */
function nameOf(id: number): string {
  const name = loaded?.itemNames.get(id)
  return name === undefined ? `item 0x${id.toString(16)}` : renderName(name)
}

/**
 * How the menu reads one of the party.
 *
 * **A story companion's numbers are `attnpc`'s own, not a level table's.**
 * Ivor is level 3 with 25 hit points in that table, and the battle already
 * fights with those (`companionFighter`); reading him against the Minstrel's
 * level table instead showed him as level 1 with the Hero's 20, which was
 * wrong in the menu and right nowhere. `attnpc` has no vocation column, so
 * his line names none — see `docs/party-and-vocations.md`.
 *
 * Whoever is in no such table — the Hero, and anyone created later — is read
 * against their vocation's level table, which is what levelling means.
 */
function menuMember(member: Member): MenuMember {
  const words = loaded?.menuWords
  const along =
    member.attnpc === undefined
      ? undefined
      : loaded?.attending.find((one) => one.id === member.attnpc)
  if (along) {
    return {
      name: along.name,
      standing: attendingStanding(along),
      hp: member.hp,
      mp: member.mp,
      equipped: wornBy(member),
    }
  }
  const levels = levelsFor(member)
  const now = levels ? standing(levels, expOf(member), member.gains) : undefined
  return {
    name: nameFor(member),
    // The vocation in the menu's own words — `str_tm` 2106, the Minstrel.
    standing: now && {
      ...now,
      vocation: words?.get(VOCATION_WORDS + member.vocation) ?? now.vocation,
    },
    hp: member.hp,
    mp: member.mp,
    equipped: wornBy(member),
    // Their vocation's, at their level — not the Hero's.
    spells: heroSpells(member),
    // **Only somebody who levels has a pool to spend** — see `skills.ts`. A
    // story companion took the branch above and never reaches this.
    skills: skillsOf(member),
    revocations: revocationsOf(member),
  }
}

/**
 * Whether a member may wear a piece of equipment, in the vocation they are —
 * see `mayWear` in `equipment.ts`, which is the game's own rule.
 *
 * The two halves it needs come from two different places: armour's 12-bit
 * mask from the item table (`itemStats`), and a weapon's from the vocations'
 * skill trees in the ARM9 — or from the character having bought that tree's
 * **Omnivocational panel**, which is the one place the skill screen reaches
 * into what somebody may hold.
 */
function wearableBy(member: Member, item: number): boolean {
  // `?armoury=1`: anyone may wear anything — ours, for testing.
  if (armoury) return true
  const trees = loaded?.vocationTrees
  return mayWear(
    loaded?.itemStats.get(item),
    {
      vocation: member.vocation,
      sex: member.sex,
      // The award is worn like anything else, so this is simply what is in
      // their accessory slot — see `WEAR_WITH_ALL`.
      wearWithAll: wornBy(member).get('accessory') === WEAR_WITH_ALL,
    },
    {
      wielding: trees ? (tree) => vocationsWielding(trees, tree) : undefined,
      regardless: (tree) =>
        panelsHeld(member, loaded?.skillPanels ?? []).some(
          (panel) => panel.tree === tree && panel.grants === GRANTS_REGARDLESS,
        ),
    },
  )
}

/**
 * A member's skill points and the five trees their vocation may spend them
 * in, as the skill screen shows them — see `skills.ts`.
 *
 * The trees are the vocation's, read out of the ARM9; the panels are
 * `skilltable.bin`'s; the words are `str_sklc` and `sta_skl`. Any of the
 * three missing leaves a shorter screen that says so rather than one made up.
 */
function skillsOf(member: Member): { pool: number; trees: SkillTreeView[] } {
  return {
    pool: member.skillPool,
    trees: treesOf(loaded?.vocationTrees, member.vocation).map((tree) =>
      treeView(member, tree, loaded?.skillPanels ?? [], skillWords()),
    ),
  }
}

/**
 * The skill screen's words — the three tables `Loaded.skillWords` holds, with
 * the abilities named out of the action table beside them.
 *
 * The labels are run through `renderName` because they carry the same markup
 * item names do: `sta_skl`'s "Critical Hit Rate `<u_arrow>`" is an arrow
 * glyph, not four letters and two brackets.
 */
function skillWords(): SkillWords {
  const words = loaded?.skillWords
  return {
    trees: words?.trees ?? new Map(),
    panels: new Map([...(words?.panels ?? [])].map(([id, text]) => [id, renderName(text)])),
    said: words?.said ?? new Map(),
    abilityOf: (action) => loaded?.actions.get(action)?.name,
  }
}

/**
 * Put points into a tree until they reach a panel, for whoever the menu is
 * about — see `buy` in `skills.ts`. What it says is the game's own sentence
 * for the panel where `str_gskl` has one.
 */
function buyPanel(tree: number, id: number, state: MenuState | undefined): MenuState | undefined {
  const member = members[state?.member ?? 0] ?? leader()
  const panel = loaded?.skillPanels.find((one) => one.id === id)
  if (!state || !panel) return state
  const spent = buy(member, tree, panel)
  if (spent === undefined) {
    return { ...state, said: [`${member.skillPool} points is not enough for that.`] }
  }
  const words = skillWords()
  const name = words.panels.get(panel.id) ?? `panel ${panel.id}`
  const says = saidOf(panel, words.said, words.abilityOf?.(panel.action))
  return {
    ...state,
    said: [
      `${nameFor(member)} spends ${spent} on ${name}.`,
      ...(says === undefined ? [] : [plainMarkup(says, nameFor(member))]),
    ],
  }
}

/**
 * Cook a recipe at the Krak Pot and say what came out — see `cook` in
 * `alchemy.ts`. The pot's own words where it has them.
 *
 * **The roll is `Math.random`**, and deliberately not the battle's RNG: how
 * the game draws an alchemiracle is not read, and borrowing a generator whose
 * sequence *is* read would make a reproducible thing out of a guess.
 */
function cookRecipe(id: number, state: MenuState | undefined): MenuState | undefined {
  const recipe = loaded?.recipes.find((one) => one.id === id)
  if (!state || !recipe || !loaded) return state
  // The pot takes from the bag, then from whoever carries it (`func_02086d88`):
  // cooked out of all of it, then what it used taken the game's way, and what
  // it made given the game's way.
  let pooled = bag
  for (const list of carriers().carried) for (const id of list) pooled = take(pooled, { item: id })
  const made = cook(recipe, pooled, loaded.recipes)
  if (!made) {
    return { ...state, said: [potSay(POT_SAYS.lacking) ?? 'You have not got what that wants.'] }
  }
  const used = new Map<number, number>()
  for (const [id, n] of pooled.items) {
    const after = (made.bag.items.get(id) ?? 0) - (id === made.item ? 1 : 0)
    if (n > after) used.set(id, n - after)
  }
  for (const [id, n] of used) for (let k = 0; k < n; k++) takeAway(id)
  bag = { ...bag, gold: made.bag.gold }
  give(made.item)
  // **What is made is learnt** (`func_ov006_02153cbc`): known and made; and
  // after an alchemiracle, the recipe attempted known too.
  learnRecipe(recipesKnown, made.made.id, true)
  if (made.miracle) learnRecipe(recipesKnown, recipe.id)
  const item = itemNamed(made.item)
  return {
    ...state,
    said: [
      ...(made.miracle ? [potSay(POT_SAYS.miracle) ?? 'An alchemiracle!'] : []),
      // "Wow! <INDEF_ART_SGL_I_NAME>!" — one of them, so `val_1` is 1.
      potTell(POT_SAYS.behold, { item, values: { val_1: 1 } }) ?? `Out comes ${item.name}.`,
    ],
  }
}

/**
 * How many mini medals have been handed to Cap'n Max, over the whole game —
 * the game keeps it in its progress record at `+0xf74`. Saved.
 */
let medalsGiven = 0

/**
 * A visit to Cap'n Max: the medals in the bag handed over as the game hands
 * them, his rewards given, and his lines said — see `medals.ts`. Once every
 * milestone is passed, the scene that follows (`ev28590`, the Cap'n's
 * Curtsy) plays when his lines are read, its record in his own map.
 */
function visitMedals(who: Talker): void {
  if (!loaded) return
  const rewards = loaded.medalRewards
  if (!rewards) {
    status('the mini medal tables did not read, so Cap’n Max has nothing to give')
    return
  }
  const held = bag.items.get(MINI_MEDAL) ?? 0
  const visit = visitMax(rewards, medalsGiven, held)
  for (let n = 0; n < visit.handed; n++) takeAway(MINI_MEDAL)
  for (const gift of visit.gifts) give(gift)
  medalsGiven = visit.given
  medalTalker = who
  sayMedals(visit.lines)
  // The last milestone's reward given: his label 60 — the scene he has waited
  // for, and the Cap'n's Curtsy taught by his own handler, as `142` teaches a
  // trick (`func_0206e348`). See `CURTSY_SCENE`.
  if (visit.curtsy) {
    const bit = trickLearntBit(CURTSY_TRICK)
    if (bit !== undefined) storyGlobals.add(bit)
    afterTalk = () => startEvent(CURTSY_SCENE, true)
  }
  // Past every milestone, with medals to trade: his list, once he has spoken.
  else if (visit.allPassed && held > 0) afterTalk = () => openMedalList()
  status(
    `Cap’n Max: ${visit.handed} medal${visit.handed === 1 ? '' : 's'} handed in, ${medalsGiven} in all` +
      (visit.gifts.length > 0 ? ` · given ${visit.gifts.map(nameOf).join(', ')}` : ''),
  )
}

/** Cap'n Max, while his service is open: who the lines are said by. */
let medalTalker: Talker | undefined

/** What happens once the conversation up now is read, given the answer — see `talk`. */
let afterTalk: ((answer: number | undefined) => void) | undefined

/** Say some of his lines, as one conversation — see `medalText`. */
function sayMedals(lines: readonly MedalLine[]): void {
  if (!loaded || !medalTalker) return
  const words = loaded.medalWords
  talkContext = textContext()
  talking = startConversation(
    medalTalker,
    `the mini medals: ${medalsGiven} handed in`,
    lines.map((line) =>
      medalText(words.get(line.message) ?? `(message ${line.message})`, line, nameOf),
    ),
    lines.map((line) => `str_mdl ${line.message}`),
    talkContext,
  )
  showTalk()
}

/** His exchange's list — see `services.ts` and `medals.ts`. */
function openMedalList(): void {
  const rewards = loaded?.medalRewards
  if (!loaded || !rewards) return
  visit = {
    kind: 'medals',
    title: plainMarkup(loaded.medalWords.get(100) ?? 'Mini Medals', heroName()),
    exchanges: rewards.exchanges,
    held: bag.items.get(MINI_MEDAL) ?? 0,
    cursor: 0,
    said: '',
  }
  showMenu()
}

/**
 * One of his list chosen, and his lines on it, as `02168318` and `02168400`
 * run them: too few medals → 132 and the list again; enough → 130 and a
 * yes-or-no — yes hands the price over, counted into the total, and gives
 * it, 140, asking if there is more; no → 131 and the list again.
 */
function pickMedal(at: number): void {
  const offer = loaded?.medalRewards?.exchanges[at]
  if (!offer) {
    medalFarewell()
    return
  }
  const held = bag.items.get(MINI_MEDAL) ?? 0
  if (held < offer.medals) {
    sayMedals([exchangeLine(132, medalsGiven, held, offer)])
    afterTalk = () => openMedalList()
    return
  }
  sayMedals([exchangeLine(130, medalsGiven, held, offer)])
  afterTalk = (answer) => {
    if (answer !== 0) {
      sayMedals([exchangeLine(131, medalsGiven, held, offer)])
      afterTalk = () => openMedalList()
      return
    }
    for (let n = 0; n < offer.medals; n++) takeAway(MINI_MEDAL)
    medalsGiven = Math.min(medalsGiven + offer.medals, MEDALS_MOST)
    give(offer.item)
    const left = bag.items.get(MINI_MEDAL) ?? 0
    status(`Cap’n Max: ${nameOf(offer.item)} for ${offer.medals} mini medals, ${left} left`)
    sayMedals([exchangeLine(140, medalsGiven, left, offer)])
    afterTalk = (more) => {
      if (more !== 0) {
        medalFarewell()
        return
      }
      sayMedals([exchangeLine(141, medalsGiven, left, offer)])
      afterTalk = () => openMedalList()
    }
  }
}

/** Leaving him: what is left, and his goodbye — 150 and 151. */
function medalFarewell(): void {
  const held = bag.items.get(MINI_MEDAL) ?? 0
  sayMedals([exchangeLine(150, medalsGiven, held), exchangeLine(151, medalsGiven, held)])
}

/**
 * **A keeper's service while it is open** — the inn's or the church's, see
 * `keepers.ts`: who said the line, the keeper's own words (`str_in<k>`,
 * `str_ch<k>`), the inn's price, and the church's cure under way.
 */
let keeper:
  | {
      readonly who: Talker
      readonly service: 'inn' | 'church' | 'counter' | 'bank'
      readonly n: number
      readonly words: ReadonlyMap<number, string>
      price: { readonly perHead: number; readonly total: number }
      cure?: 'resurrection' | 'purification' | 'benediction'
      /** Erinn's inn, behind her counter: its Leave and its "too poor" go back to the counter. */
      readonly rest?: boolean
      /** The bank's transaction under way. */
      banking?: 'deposit' | 'withdrawal'
    }
  | undefined

/** Gold in the bank — `GameState+0x396c`, see `counter.ts`. Saved; spared at a wipe-out. */
let goldBanked = 0

/** One of the keeper's lines, its tags filled — the member it names, its values, its singulars and plurals. */
function keeperText(
  raw: string,
  fill: { target?: string; values?: Readonly<Record<string, number>>; str2?: string },
): string {
  const values = fill.values ?? {}
  return raw
    .replaceAll('\\n', '\n')
    .replace(
      /<IF_SING (val_\d)>(.*?)<ELSE_NOT_SING>(.*?)<ENDIF_SING>/gs,
      (_, which: string, one: string, many: string) => (values[which] === 1 ? one : many),
    )
    .replace(/<(val_\d)>/g, (_, which: string) => String(values[which] ?? ''))
    .replaceAll('<TARGET>', fill.target ?? heroName())
    .replaceAll('<str_2>', fill.str2 ?? '')
}

/** Say some of the keeper's lines as one conversation, the last asking Yes or No when `ask`. */
function sayKeeper(
  lines: readonly (
    | number
    | { readonly line: number; readonly fill: Parameters<typeof keeperText>[1] }
    | { readonly text: string }
  )[],
  fill: Parameters<typeof keeperText>[1] = {},
  ask = false,
): void {
  if (!keeper) return
  const words = keeper.words
  talkContext = textContext()
  const texts = lines.map((one, i) => {
    const text =
      typeof one === 'number'
        ? keeperText(words.get(one) ?? `(${keeper?.service} line ${one})`, fill)
        : 'text' in one
          ? keeperText(one.text, fill)
          : keeperText(words.get(one.line) ?? `(${keeper?.service} line ${one.line})`, one.fill)
    return ask && i === lines.length - 1 ? `${text.replace(/<ADD>$/, '')}<YESNO>` : text
  })
  talking = startConversation(
    keeper.who,
    `the ${keeper.service}`,
    texts,
    lines.map(
      (one) =>
        `${keeper?.service} ${typeof one === 'number' ? one : 'text' in one ? 'strstd' : one.line}`,
    ),
    talkContext,
  )
  showTalk()
}

/** The keeper's line, and the service over. */
function keeperEnd(lines: readonly number[], fill: Parameters<typeof keeperText>[1] = {}): void {
  sayKeeper(lines, fill)
  afterTalk = () => {
    keeper = undefined
  }
}

/** The gold, as the keepers' gold window shows it — `strstd` 1009, `<val_1><G>`. */
const goldLine = (): string => `${bag.gold} G`

/**
 * **The inn** — see `keepers.ts`. The innkeeper's own line has said the
 * greeting and the price (INFERRED: the talk line is the hand-over, and its
 * words are the service's 1000 or 1001, so it is not said twice); then the
 * menu, Stay Overnight, Rest by day, Cancel.
 */
function openInn(n: number, who: Talker | undefined): void {
  if (!loaded || !cartridge || !who) return
  const words = keeperWords(cartridge, 'in', n - 1)
  const living = members.filter((m) => m.hp !== 0).length
  keeper = { who, service: 'inn', n, words, price: innPrice(words.get(INN_SAYS.perHead), living) }
  openKeeperWindow('menu')
}

/**
 * **The church** — see `keepers.ts`. The priest's own line has greeted
 * (INFERRED, as the inn's); then the menu, beside the gold and the party's
 * state.
 */
function openChurch(n: number, who: Talker | undefined): void {
  if (!loaded || !cartridge || !who) return
  keeper = {
    who,
    service: 'church',
    n,
    words: keeperWords(cartridge, 'ch', n - 1),
    price: { perHead: 0, total: 0 },
  }
  openKeeperWindow('menu')
}

/** A member's level in their vocation — what the church prices by. */
const vocationLevel = (member: Member): number => levelOf(member)?.level ?? 1

/** One of the keeper's windows: its menu, or the church's who-list, with the gold and the party's state beside it. */
function openKeeperWindow(window: 'menu' | 'who'): void {
  if (!keeper) return
  const words = keeper.words
  const label = (line: number, ours: string) => {
    const said = words.get(line)
    return said && said.trim() !== '' ? plainMarkup(said, heroName()) : ours
  }
  let rows: string[]
  let values: number[]
  if (keeper.service === 'inn') {
    values = [...innChoices(isNight(clock))]
    rows = values.map((v) => label(v, ['Stay Overnight', 'Rest', 'Cancel'][v] ?? ''))
  } else if (window === 'menu') {
    values = [...churchChoices((line) => words.get(line))]
    rows = values.map((v) => label(v, CHURCH_SERVICES[v] ?? ''))
  } else {
    values = members.map((_, i) => i)
    rows = members.map((m) => nameFor(m))
  }
  // The church's status window: each member, "Dead" or "Lv. n" (str_ch 13,
  // strstd 1011). Poison and a curse are not kept outside a battle here.
  const state =
    keeper.service === 'church'
      ? members.map(
          (m) =>
            `${nameFor(m)} — ${
              m.hp === 0
                ? label(13, 'Dead')
                : `${plainMarkup(loaded?.standardWords.get(1011) ?? 'Lv. ', heroName())}${vocationLevel(m)}`
            }`,
        )
      : []
  const free = keeper.service === 'inn' && keeper.price.perHead === 0
  visit = {
    kind: 'keeper',
    service: keeper.service,
    window,
    title: window === 'who' ? label(11, 'On whom?') : '',
    rows,
    values,
    lines: [...(free ? [] : [goldLine()]), ...state],
    cursor: 0,
    said: '',
  }
  self?.held.clear()
  showMenu()
}

/** B in a keeper's window. */
function keeperCancelled(window: string): void {
  if (!keeper) return
  if (keeper.service === 'counter') {
    counterPicked(COUNTER_LEAVE)
    return
  }
  if (keeper.service === 'bank') {
    if (window === 'digits') bankAmount(0)
    else bankPicked(2)
    return
  }
  if (keeper.service === 'inn') {
    keeperPicked(window, INN_CANCEL)
    return
  }
  if (window === 'who') {
    sayKeeper([CHURCH_SAYS.cancelled, CHURCH_SAYS.anythingElse])
    afterTalk = () => openKeeperWindow('menu')
    return
  }
  keeperEnd([CHURCH_SAYS.farewell])
}

/** A row of a keeper's window chosen: the value it stands for. */
function keeperPicked(window: string, value: number): void {
  if (!keeper) return
  if (keeper.service === 'counter') {
    counterPicked(value)
    return
  }
  if (keeper.service === 'bank') {
    bankPicked(value)
    return
  }
  if (keeper.service === 'inn') {
    innPicked(value)
    return
  }
  if (window === 'who') {
    curePicked(value)
    return
  }
  churchPicked(value)
}

/**
 * The inn's choice: Cancel says 1090; Stay or Rest, too poor, 1020; else
 * 1010, the night — jingle 55 and its hold of 180 ticks — the price paid, the
 * living's HP and MP full, the clock at the day's start or the night's, and
 * 1011. The bed (`<INN=15>`) says neither 1010 nor 1011, and charges nothing.
 * **Ours**: the screen does not fade to black over the night.
 */
function innPicked(choice: number): void {
  if (!keeper) return
  const bed = keeper.n === 15
  const rest = keeper.rest === true
  if (choice === INN_CANCEL) {
    if (bed) keeper = undefined
    else if (rest) backToCounter(REST_SAYS.changedMind)
    else keeperEnd([INN_SAYS.cancel])
    return
  }
  const { total } = keeper.price
  if (bag.gold < total) {
    if (rest) backToCounter(REST_SAYS.tooPoor)
    else keeperEnd([INN_SAYS.tooPoor])
    return
  }
  const night = () => {
    if (cartridge && !params.get('bgm')) void playJingle(cartridge, INN_JINGLE)
    serviceWait = {
      until: performance.now() + INN_HOLD_MS,
      done: () => {
        bag = { ...bag, gold: bag.gold - total }
        for (const member of members) {
          if (member.hp === 0) continue
          member.hp = undefined
          member.mp = undefined
        }
        clock.ticks = choice === INN_REST ? REST_TICKS : STAY_TICKS
        status(
          `the inn: ${choice === INN_REST ? 'rested until the night' : 'stayed the night'}, ${total} G`,
        )
        if (bed) keeper = undefined
        else if (rest) keeperEnd([choice === INN_REST ? REST_SAYS.rested : REST_SAYS.morning])
        else keeperEnd([INN_SAYS.after])
      },
    }
  }
  if (bed) night()
  else {
    sayKeeper([rest ? REST_SAYS.paid : INN_SAYS.paid])
    afterTalk = night
  }
}

/** A keeper with no file number of its own — the counter, the bank — over `words`. */
function menuKeeper(who: Talker, service: 'counter' | 'bank', words: string): void {
  if (!cartridge) return
  keeper = {
    who,
    service,
    n: 0,
    words: menuServiceWords(cartridge, words),
    price: { perHead: 0, total: 0 },
  }
}

/**
 * **Erinn's counter** — see `counter.ts`: "What can I do for you today?"
 * (`strstd` 68), then her menu, `str_rkm` 92.
 */
function openCounter(who: Talker | undefined): void {
  if (!loaded || !who) return
  menuKeeper(who, 'counter', 'str_rkm')
  const greeting = loaded.standardWords.get(COUNTER_SAYS.greeting)
  sayKeeper([greeting === undefined ? COUNTER_SAYS.again : { text: greeting }])
  afterTalk = () => openCounterMenu()
}

/** Her four-item menu, `str_rkm` 92. */
function openCounterMenu(): void {
  if (!keeper) return
  const rows = menuLabels(keeper.words.get(COUNTER_SAYS.menu)).map((l) =>
    plainMarkup(l, heroName()),
  )
  visit = {
    kind: 'keeper',
    service: 'counter',
    window: 'menu',
    title: '',
    rows,
    values: rows.map((_, i) => i),
    lines: [],
    cursor: 0,
    said: '',
  }
  self?.held.clear()
  showMenu()
}

/** Back from her inn to her counter: the inn's line, "So what can I do for you today?" (41), her menu. */
function backToCounter(line: number): void {
  if (!keeper) return
  sayKeeper([line])
  const who = keeper.who
  afterTalk = () => {
    menuKeeper(who, 'counter', 'str_rkm')
    sayKeeper([COUNTER_SAYS.again])
    afterTalk = () => openCounterMenu()
  }
}

/**
 * Her counter's choice. **Ours**: canvassing and the guestbook — tag mode,
 * multiplayer — say so and come back to the menu.
 */
function counterPicked(choice: number): void {
  if (!keeper || !cartridge) return
  if (choice === COUNTER_STAY) {
    // **Her inn**: the inn's own flow with the Quester's Rest switch on —
    // `str_rki`'s words, 3 gold a head for the living.
    const living = members.filter((m) => m.hp !== 0).length
    const total = REST_PER_HEAD * living
    keeper = {
      who: keeper.who,
      service: 'inn',
      n: 0,
      words: menuServiceWords(cartridge, 'str_rki'),
      price: { perHead: REST_PER_HEAD, total },
      rest: true,
    }
    const night = isNight(clock)
    sayKeeper(
      [
        REST_SAYS.staffRate,
        night ? REST_SAYS.welcomeAtNight : REST_SAYS.welcome,
        night ? REST_SAYS.offerAtNight : REST_SAYS.offer,
      ],
      { values: { val_1: living, val_2: total } },
    )
    afterTalk = () => openKeeperWindow('menu')
    return
  }
  if (choice === COUNTER_CANVASS || choice === COUNTER_GUESTBOOK) {
    status('canvassing and the guestbook are tag mode — multiplayer, and not built')
    openCounterMenu()
    return
  }
  keeperEnd([COUNTER_SAYS.leave])
}

/** The bank's farewell: the balance, or none (`func_0216abd8`). */
function bankFarewell(): {
  readonly line: number
  readonly fill: Parameters<typeof keeperText>[1]
} {
  return goldBanked > 0
    ? { line: BANK_SAYS.farewell, fill: { values: { val_1: goldBanked } } }
    : { line: BANK_SAYS.farewellEmpty, fill: {} }
}

/** **The bank** — see `counter.ts`: the welcome, every visit, then the balance and the menu. */
function openBank(who: Talker | undefined): void {
  if (!loaded || !who) return
  menuKeeper(who, 'bank', 'str_bank')
  sayKeeper([
    BANK_SAYS.welcome,
    goldBanked > 0
      ? { line: BANK_SAYS.banked, fill: { values: { val_1: goldBanked } } }
      : BANK_SAYS.nothingBanked,
  ])
  afterTalk = () => {
    if (!keeper) return
    const words = keeper.words
    const label = (n: number) => plainMarkup(words.get(n) ?? `(bank line ${n})`, heroName())
    visit = {
      kind: 'keeper',
      service: 'bank',
      window: 'menu',
      title: '',
      rows: [label(BANK_SAYS.deposit), label(BANK_SAYS.withdrawal), label(BANK_SAYS.leave)],
      values: [BANK_SAYS.deposit, BANK_SAYS.withdrawal, BANK_SAYS.leave],
      lines: [goldLine()],
      cursor: 0,
      said: '',
    }
    self?.held.clear()
    showMenu()
  }
}

/** Say the bank's lines, its farewell after them, and end the visit. */
function bankEnd(lines: Parameters<typeof sayKeeper>[0]): void {
  sayKeeper([...lines, bankFarewell()])
  afterTalk = () => {
    keeper = undefined
  }
}

/** The bank's choice: a deposit or a withdrawal — its most, or its refusal — then the number window. */
function bankPicked(choice: number): void {
  if (!keeper) return
  if (choice !== BANK_SAYS.deposit && choice !== BANK_SAYS.withdrawal) {
    bankEnd([])
    return
  }
  const kind = choice === BANK_SAYS.deposit ? 'deposit' : 'withdrawal'
  const limit = bankLimit(kind, bag.gold, goldBanked)
  if ('refused' in limit) {
    bankEnd([limit.refused])
    return
  }
  keeper.banking = kind
  sayKeeper([
    kind === 'deposit'
      ? BANK_SAYS.askDeposit
      : { line: BANK_SAYS.askWithdraw, fill: { values: { val_1: goldBanked } } },
  ])
  afterTalk = () => {
    visit = {
      kind: 'digits',
      title: '',
      digits: newDigits(limit.most),
      lines: [goldLine()],
      said: '',
    }
    self?.held.clear()
    showMenu()
  }
}

/** The number set, in thousands, and the money moved — or the changed mind. One a visit. */
function bankAmount(thousands: number | undefined): void {
  if (!keeper?.banking) return
  const amount = (thousands ?? 0) * THOUSAND
  if (amount === 0) {
    // An amount of 0 counts as a cancel (`0x0216a7a4`).
    bankEnd([BANK_SAYS.changedMind])
    return
  }
  if (keeper.banking === 'deposit') {
    if (goldBanked + amount > BANK_MOST) {
      bankEnd([{ line: BANK_SAYS.vaultLimit, fill: { values: { val_1: BANK_MOST - goldBanked } } }])
      return
    }
    bag = { ...bag, gold: bag.gold - amount }
    goldBanked += amount
    bankEnd([{ line: BANK_SAYS.deposited, fill: { values: { val_1: amount } } }])
    return
  }
  goldBanked -= amount
  bag = { ...bag, gold: Math.min(PURSE_MOST, bag.gold + amount) }
  bankEnd([{ line: BANK_SAYS.withdrawn, fill: { values: { val_1: amount } } }])
}

/** The church's menu chosen — see `keepers.ts`. */
function churchPicked(choice: number): void {
  if (!keeper) return
  const service = CHURCH_SERVICES[choice]
  if (service === 'confession') {
    sayKeeper([CHURCH_SAYS.confess], {}, true)
    afterTalk = (answer) => {
      const goOn = (lines: number[]) => {
        sayKeeper(lines, {}, true)
        // **Ours**: "No" — not to go on — ends the game in the original
        // ("Please turn the power OFF", 110); here it ends the visit with 1014.
        afterTalk = (on) =>
          keeperEnd(on === 0 ? [CHURCH_SAYS.farewell] : [CHURCH_SAYS.farewellToRest])
      }
      if (answer !== 0) {
        goOn([CHURCH_SAYS.declined, CHURCH_SAYS.goOn])
        return
      }
      status(confess())
      if (cartridge && !params.get('bgm')) void playJingle(cartridge, 0x3c)
      goOn([CHURCH_SAYS.saved, CHURCH_SAYS.goOn])
    }
    return
  }
  if (service === 'divination') {
    const lines = members.map((member) => {
      const levels = levelsFor(member)
      const now = levels ? standing(levels, expOf(member), member.gains) : undefined
      const target = nameFor(member)
      if (!now?.next) {
        return {
          line: CHURCH_SAYS.mastered,
          fill: { target, str2: keeper?.words.get(CHURCH_SAYS.vocation + member.vocation) ?? '' },
        }
      }
      const need = now.next.exp - now.exp
      return need <= 0
        ? { line: CHURCH_SAYS.nextBattle, fill: { target } }
        : { line: CHURCH_SAYS.needs, fill: { target, values: { val_1: need } } }
    })
    sayKeeper([CHURCH_SAYS.divine, ...lines, CHURCH_SAYS.anythingElse])
    afterTalk = () => openKeeperWindow('menu')
    return
  }
  if (service === 'resurrection' || service === 'purification' || service === 'benediction') {
    keeper.cure = service
    sayKeeper([CURE_BASE[service]])
    afterTalk = () => openKeeperWindow('who')
    return
  }
  keeperEnd([CHURCH_SAYS.farewell])
}

/**
 * A member chosen for a cure: wanted or not — the dead to be raised; poison
 * and a curse not kept outside a battle here, so never wanted — then the
 * price (1061) and a Yes or No, the prayer (the base + 1) to jingle 59, and
 * the cure: **raised to full HP**, MP as it was (`func_02048150`).
 */
function curePicked(index: number): void {
  if (!keeper?.cure) return
  const cure = keeper.cure
  const member = members[index]
  if (!member) return
  const target = nameFor(member)
  const base = CURE_BASE[cure]
  const wanted = cure === 'resurrection' && member.hp === 0
  if (!wanted) {
    sayKeeper([base + 2, CHURCH_SAYS.anythingElse], { target })
    afterTalk = () => openKeeperWindow('menu')
    return
  }
  const price = curePrice(cure, vocationLevel(member))
  sayKeeper([CHURCH_SAYS.price], { target, values: { val_1: price } }, true)
  afterTalk = (answer) => {
    if (answer !== 0) {
      sayKeeper([CHURCH_SAYS.refused, CHURCH_SAYS.anythingElse])
      afterTalk = () => openKeeperWindow('menu')
      return
    }
    if (bag.gold < price) {
      sayKeeper([CHURCH_SAYS.tooPoor, CHURCH_SAYS.anythingElse])
      afterTalk = () => openKeeperWindow('menu')
      return
    }
    bag = { ...bag, gold: bag.gold - price }
    sayKeeper([base + 1], { target })
    afterTalk = () => {
      if (cartridge && !params.get('bgm')) void playJingle(cartridge, CHURCH_JINGLE)
      serviceWait = {
        until: performance.now() + CEREMONY_MS,
        done: () => {
          member.hp = undefined
          sayKeeper([CHURCH_SAYS.anythingElse])
          afterTalk = () => openKeeperWindow('menu')
        },
      }
    }
  }
}

/** The Story So Far's number — see `story-so-far.ts`. Saved. */
let storySoFar = STORY_START
/** Whether its page is up, on the bottom screen. */
let storyPageOpen = false
/** The parchment, read once. */
let storyArt: StoryArt | undefined

/**
 * **Open the Story So Far** — the page `storySoFar` names, on the parchment,
 * on the bottom screen, its `<val_1>` the fyggs found. **Ours**: the world
 * map the game puts on the top screen is not drawn, and there is no fade.
 */
function openStorySoFar(): void {
  if (!loaded || !cartridge) return
  storyArt ??= readStoryArt(cartridge)
  const raw = loaded.storySoFarWords.get(storySoFar)
  const context = battleBottomEl.getContext('2d')
  if (!storyArt || !raw || !context) {
    status(
      `the Story So Far: no page ${storySoFar}${storyArt ? '' : ', and the parchment did not read'}`,
    )
    return
  }
  const rendered = renderLine(raw, {
    ...textContext(),
    values: { val_1: String(fyggsFound(storyGlobals)) },
  })
  const text = rendered.pages.map((page) => page.text).join('\n')
  self?.held.clear()
  turning.clear()
  drawStoryPage(context, storyArt, readNameFont(cartridge), text)
  battleBottomEl.hidden = false
  document.body.classList.add('battle-bottom')
  storyPageOpen = true
  status(`the Story So Far: str_ol ${storySoFar} · Esc closes`)
}

function closeStorySoFar(): void {
  storyPageOpen = false
  if (!battle) {
    battleBottomEl.hidden = true
    document.body.classList.remove('battle-bottom')
  }
}

/**
 * **Alltrades Abbey while Jack's service is open** — see `abbey.ts`, and
 * `docs/party-and-vocations.md`, "The Abbey's own flow", for the steps this
 * follows: who said `<DAMA>`, the member his lines are about, whether it is
 * a change or a revocation, and the vocations his list offered.
 */
let abbey:
  | {
      readonly who: Talker
      target: number
      flow: 'change' | 'revoke'
      offered: readonly number[]
    }
  | undefined

/** The ceremony under way: when it has run its time, and what then — see `ceremony`. */
let serviceWait: { readonly until: number; readonly done: () => void } | undefined

/** A vocation as his lines name it, `str_dam 35 + v`. */
function abbeyVocation(vocation: number): string {
  return loaded?.abbeyWords.get(vocationSaid(vocation)) ?? vocationWord(vocation)
}

/** A window's word, `bm_dama`'s label. */
function abbeyLabel(label: number, fallback: string): string {
  return plainMarkup(loaded?.abbeyLabels.get(label) ?? fallback, heroName())
}

/**
 * What his lines are filled with, about the member he is speaking of. **Ours**:
 * a member whose sex is not kept — a story companion — is spoken of as a man.
 */
function abbeyFill(extra: Partial<AbbeyFill> = {}): AbbeyFill {
  const target = abbey ? members[abbey.target] : undefined
  const current = target ? abbeyVocation(target.vocation) : undefined
  return {
    target: target ? nameFor(target) : heroName(),
    sex: target?.sex === SEX.female ? 'f' : 'm',
    solo: members.length === 1,
    current,
    articleOf: current,
    ...extra,
  }
}

/**
 * Say some of his lines as one conversation; the last asks Yes or No when
 * `ask` does, with the cursor on No when `onNo` — the Abbey's own Yes/No
 * window, drawn by the talk's prompt in the game's words.
 */
function sayAbbey(lines: readonly number[], fill = abbeyFill(), ask?: 'yes' | 'no'): void {
  if (!abbey) return
  const words = loaded?.abbeyWords
  talkContext = textContext()
  const texts = lines.map((line, i) => {
    const text = abbeyText(words?.get(line) ?? `(str_dam ${line})`, fill)
    return ask && i === lines.length - 1 ? `${text.replace(/<ADD>$/, '')}<YESNO>` : text
  })
  const said = startConversation(
    abbey.who,
    'Alltrades Abbey',
    texts,
    lines.map((line) => `str_dam ${line}`),
    talkContext,
  )
  talking = said && ask === 'no' ? { ...said, choice: 1 } : said
  showTalk()
}

/** His line, and the visit over. */
function abbeyEnd(lines: readonly number[], fill = abbeyFill()): void {
  sayAbbey(lines, fill)
  afterTalk = () => {
    abbey = undefined
  }
}

/**
 * **Jack is spoken to** — step 0. Too soon, and he says so; with revocation
 * open, his menu; otherwise whether anybody wishes to change.
 */
function openAbbey(who: Talker | undefined): void {
  if (!loaded || !who) return
  abbey = { who, target: 0, flow: 'change', offered: [] }
  const flag = (bit: number) => storyGlobals.has(bit)
  if (!abbeyOpen(flag)) {
    abbeyEnd([ABBEY_SAYS.greet, ABBEY_SAYS.tooSoon])
    return
  }
  if (flag(FLAG_REVOCATION)) {
    sayAbbey([ABBEY_SAYS.greet, ABBEY_SAYS.how])
    afterTalk = () => openAbbeyWindow('menu')
    return
  }
  sayAbbey([ABBEY_SAYS.greet, ABBEY_SAYS.wish], abbeyFill(), 'yes')
  afterTalk = (answer) => (answer === 0 ? abbeyChange() : abbeyEnd([ABBEY_SAYS.content]))
}

/** Change Vocation chosen, or Yes said: who — or, alone, the Hero at once. */
function abbeyChange(): void {
  if (!abbey) return
  abbey.flow = 'change'
  if (members.length === 1) {
    abbeyTarget(0, false)
    return
  }
  sayAbbey([ABBEY_SAYS.who])
  afterTalk = () => openAbbeyWindow('who')
}

/**
 * The member to change. **Fallen** — refused (49); chosen from the list only,
 * as the game checks it there. **A curse** (8) is not modelled here, so
 * nobody is refused for one. Then which vocation.
 */
function abbeyTarget(index: number, fromList: boolean): void {
  if (!abbey) return
  abbey.target = index
  if (fromList && members[index]?.hp === 0) {
    abbeyEnd([ABBEY_SAYS.dead])
    return
  }
  sayAbbey([ABBEY_SAYS.which])
  afterTalk = () => openAbbeyWindow('vocation')
}

/**
 * One of the Abbey's windows, in the menu's box: his menu, who, or the
 * vocations — the six, then whichever of the other six their flag is set
 * for, each with the member's level in it.
 *
 * **Ours**: the list is one column, where the game's is two of six; the
 * revocation marks beside a name (`<tc1>`…`<tc10>`) are a count here; and
 * the panel describing the vocation under the cursor, on the sub screen, is
 * not drawn.
 */
function openAbbeyWindow(window: 'menu' | 'who' | 'vocation'): void {
  if (!loaded || !abbey) return
  const target = members[abbey.target]
  let rows: string[]
  let title = ''
  if (window === 'menu') {
    rows = [
      abbeyLabel(ABBEY_LABELS.change, 'Change Vocation'),
      abbeyLabel(ABBEY_LABELS.revocate, 'Revocate'),
    ]
  } else if (window === 'who') {
    // The slots, in their order — the living, then the fallen: see `marchingOrder`.
    rows = marchingOrder(members).map((member) => nameFor(member))
  } else {
    abbey.offered = vocationsOffered((bit) => storyGlobals.has(bit))
    title = abbeyLabel(ABBEY_LABELS.heading, 'Vocation')
    rows = abbey.offered.map((vocation) => {
      const level = target ? (levelOf({ ...target, vocation })?.level ?? 1) : 1
      const revoked = target ? revocationsOf(target, vocation) : 0
      return (
        `${abbeyLabel(vocation - 1, vocationWord(vocation))} — ${abbeyLabel(ABBEY_LABELS.level, 'Lv. ')}${level}` +
        (revoked > 0 ? ` · revoked ${revoked}×` : '')
      )
    })
  }
  visit = { kind: 'abbey', window, title, rows, cursor: 0, said: '' }
  self?.held.clear()
  showMenu()
}

/** A row of one of his windows chosen. */
function abbeyPicked(window: 'menu' | 'who' | 'vocation', pick: number): void {
  if (!abbey) return
  if (window === 'menu') {
    if (pick === 0) abbeyChange()
    else abbeyRevocation()
    return
  }
  if (window === 'who') {
    const index = members.indexOf(marchingOrder(members)[pick] as Member)
    if (abbey.flow === 'revoke') abbeyRevokeTarget(index)
    else abbeyTarget(index, true)
    return
  }
  const vocation = abbey.offered[pick]
  const target = members[abbey.target]
  if (vocation === undefined || !target) return
  const chosen = abbeyVocation(vocation)
  const fill = abbeyFill({ chosen, articleOf: chosen })
  // The vocation they already have: listed, and refused (`0x021571b0`).
  if (vocation === target.vocation) {
    sayAbbey([ABBEY_SAYS.already, ABBEY_SAYS.which], fill)
    afterTalk = () => openAbbeyWindow('vocation')
    return
  }
  sayAbbey([ABBEY_SAYS.confirm], fill, 'yes')
  afterTalk = (answer) => {
    if (answer !== 0) {
      sayAbbey([ABBEY_SAYS.again], fill)
      afterTalk = () => openAbbeyWindow('vocation')
      return
    }
    sayAbbey([ABBEY_SAYS.prayer], fill)
    afterTalk = () => ceremony(() => abbeyApply(vocation, fill))
  }
}

/** B in one of his windows: his menu (5), or who and which (7). */
function abbeyCancelled(window: 'menu' | 'who' | 'vocation'): void {
  if (!abbey) return
  abbeyEnd([window === 'menu' ? ABBEY_SAYS.adrift : ABBEY_SAYS.cancel])
}

/**
 * The ceremony: jingle 52, and 140 ticks before what it does is done.
 * **Not yet shown**: its effect, `data/effect/ev999991800.chr`, over the
 * member.
 */
function ceremony(done: () => void): void {
  if (cartridge && !params.get('bgm')) void playJingle(cartridge, ABBEY_JINGLE)
  serviceWait = { until: performance.now() + CEREMONY_MS, done }
}

/**
 * The change made, as `func_ov003_0215582c` makes it: the vocation set
 * (`changeVocation`, the setter `0x02083ca0`), their attributes now the new
 * vocation's at their level in it — which here they are by being worked out
 * from the level table — and **HP and MP whole**. A Priest's Heal and a
 * Mage's Frizz, which the game grants at the change, come from the spell
 * table at level one the same way. Then line 13.
 *
 * **Ours**: what they wear is the new vocation's own set, kept for it, where
 * the game puts everything worn in the bag and dresses them from it.
 */
function abbeyApply(vocation: number, fill: AbbeyFill): void {
  const target = abbey ? members[abbey.target] : undefined
  if (!target) return
  const was = target.vocation
  changeVocation(target, vocation)
  target.hp = undefined
  target.mp = undefined
  dressParty()
  status(
    `${nameFor(target)}: ${vocationWord(was)} → ${vocationWord(vocation)}, level ${levelOf(target)?.level ?? '?'}`,
  )
  abbeyEnd([ABBEY_SAYS.done], fill)
}

/**
 * Revocate chosen — step 4. Nobody at level 99: 14 and 66. Otherwise 14,
 * then who (15) — or, alone, the Hero.
 */
function abbeyRevocation(): void {
  if (!abbey) return
  abbey.flow = 'revoke'
  const anyMaster = members.some((member) => levelOf(member)?.level === REVOCATION_LEVEL)
  if (!anyMaster) {
    abbeyEnd([ABBEY_SAYS.revocation, ABBEY_SAYS.noneMaster])
    return
  }
  if (members.length === 1) {
    sayAbbey([ABBEY_SAYS.revocation])
    afterTalk = () => abbeyRevokeTarget(0)
    return
  }
  sayAbbey([ABBEY_SAYS.revocation, ABBEY_SAYS.revokeWho])
  afterTalk = () => openAbbeyWindow('who')
}

/** The member to revoke: at 99, living — then are they sure, the cursor on No. */
function abbeyRevokeTarget(index: number): void {
  if (!abbey) return
  abbey.target = index
  const target = members[index]
  if (!target) return
  if (levelOf(target)?.level !== REVOCATION_LEVEL) {
    abbeyEnd([ABBEY_SAYS.notMaster])
    return
  }
  if (target.hp === 0) {
    abbeyEnd([ABBEY_SAYS.sure, ABBEY_SAYS.revokeDead])
    return
  }
  sayAbbey([ABBEY_SAYS.sure, ABBEY_SAYS.revokeConfirm], abbeyFill(), 'no')
  afterTalk = (answer) => {
    if (answer !== 0) {
      abbeyEnd([ABBEY_SAYS.revokeDoubt])
      return
    }
    // **Ours**: the game tests line 21's article against the last vocation
    // its list had under the cursor — stale here — and this, their own.
    sayAbbey([ABBEY_SAYS.revokePrayer])
    afterTalk = () => ceremony(abbeyRevoke)
  }
}

/**
 * The revocation made (`func_ov003_02155e38`), HP and MP whole; the first
 * time for this vocation — event flag `0x118B + v` — its medal is given.
 * **Not built**: the titles a Hero earns at ten revocations of a vocation.
 */
function abbeyRevoke(): void {
  const target = abbey ? members[abbey.target] : undefined
  if (!target) return
  const vocation = target.vocation
  revoke(target)
  target.hp = undefined
  target.mp = undefined
  const first = !storyGlobals.has(REVOCATION_FLAG + vocation)
  const medal = REVOCATION_MEDALS.get(vocation)
  if (first && medal !== undefined) {
    storyGlobals.add(REVOCATION_FLAG + vocation)
    sayAbbey([ABBEY_SAYS.revoked, ABBEY_SAYS.reward])
    afterTalk = () => {
      give(medal)
      const fill = abbeyFill({
        medal: loaded?.abbeyWords.get(medalSaid(vocation)) ?? nameOf(medal),
      })
      abbeyEnd([ABBEY_SAYS.receives, ABBEY_SAYS.farewell], fill)
    }
    return
  }
  abbeyEnd([ABBEY_SAYS.revoked, ABBEY_SAYS.farewell])
}

/**
 * The scene of the eightieth medal, `ev28590`: his thanks, the exchange opened,
 * and the Cap'n's Curtsy taught — his lines 60 to 63 are its own messages too.
 * Its record stands in his map, 1807.
 */
const CURTSY_SCENE = 28590
/** The Cap'n's Curtsy, trick 23 (`str_tm` 4532) — taught at his label 60 (`0x02168014`). */
const CURTSY_TRICK = 23

/**
 * Do what Patty was asked — see `recruit.ts`, which holds the rules; this puts
 * the result back into the party and her list, and says what she says.
 *
 * **Recruiting runs overlay 9's eight screens** — sex, figure, hair, hair
 * colour, face, skin colour, eye colour, and then the name — the seven knobs
 * in her menu (`CREATION_ORDER`) and the name on its own screen
 * (`naming.ts`). See `docs/party-and-vocations.md`.
 */
function askPatty(
  asked: NonNullable<Taken['patty']>,
  state: MenuState | undefined,
): MenuState | undefined {
  if (!state) return state
  // **The eighth screen, the name**, before she files them — see `naming.ts`.
  // Her menu waits behind it and takes the answer as though asked again.
  if (asked.does === 'recruit' && asked.name === undefined) {
    menuEl.hidden = true
    void askName(asked.look.sex, 'the new recruit').then((name) => {
      menu = askPatty({ ...asked, name }, menu)
      showMenu()
    })
    return state
  }
  const before: Roster = { party: members, kept: withPatty }
  // Whom her answer is about, for its `<TARGET>`: the one called up, dropped
  // off or parted with, before she moves them.
  const about =
    asked.does === 'recruit'
      ? undefined
      : asked.does === 'dropOff'
        ? members[asked.at]
        : withPatty[asked.at]
  const target = about ? nameFor(about) : undefined
  const done =
    asked.does === 'recruit'
      ? applyFor(before, {
          ...freshMember(undefined),
          vocation: asked.vocation,
          // Made wearing the game's own kit for a recruit — see `recruitKit`.
          outfits: new Map([[asked.vocation, recruitKit(asked.vocation)]]),
          // What the eight screens settled on — see `CREATION_ORDER` and `naming.ts`.
          look: asked.look,
          sex: asked.look.sex,
          name: asked.name,
        })
      : asked.does === 'callUp'
        ? callUp(before, asked.at)
        : asked.does === 'dropOff'
          ? dropOff(before, asked.at, (who) => who.hp === 0)
          : partWith(before, asked.at)
  members = [...done.roster.party]
  withPatty = [...done.roster.kept]
  dressParty()
  dressHero()
  const said =
    done.refused !== undefined
      ? (pattySay(done.refused) ?? 'Patty cannot do that.')
      : asked.does === 'recruit'
        ? (pattySay(PATTY_SAYS.processed) ?? 'Your application has been processed!')
        : asked.does === 'callUp'
          ? (pattySay(PATTY_SAYS.comeUp, target) ?? 'They join the party.')
          : asked.does === 'dropOff'
            ? (pattySay(PATTY_SAYS.takeABreak, target) ?? 'They stay with Patty.')
            : (pattySay(PATTY_SAYS.leaves, target) ?? 'They leave for good.')
  // **Back to her menu when it is done**, which is what her step 4 does: it
  // says "All done. Your application has been processed!" and returns. Staying
  // on the last knob made a finished character look unfinished.
  return { ...state, patty: { at: 'top' }, said: [said], row: 0 }
}

/**
 * One of Patty's lines — see `pattyLines` — with `<TARGET>`, whom it is about,
 * filled in: "Hey, Rosa! You're up!". Left out, it read "Hey, ! You're up!".
 */
function pattySay(number: number, target?: string): string | undefined {
  const line = pattyLines()?.get(number)
  return line === undefined ? undefined : line.replaceAll(TARGET_MARK, target ?? '')
}

/** `<TARGET>`, kept through the markup's stripping for `pattySay` to fill. */
const TARGET_MARK = '\u0000TARGET\u0000'

/**
 * **Try Your Luck** — throw what was picked in and see what the pot makes of
 * it. `str_ren` 11 is its own refusal: "I don't seem to be able to make
 * anything with that particular combination of ingredients."
 */
function tryLuck(picked: readonly number[], state: MenuState | undefined): MenuState | undefined {
  if (!state || !loaded) return state
  const recipe = tryYourLuck(loaded.recipes, picked)
  if (!recipe) {
    return {
      ...state,
      pot: state.pot ? { ...state.pot, picked: [] } : undefined,
      said: [potSay(POT_SAYS.cannot) ?? 'Nothing comes of that combination.'],
    }
  }
  const cooked = cookRecipe(recipe.id, state)
  return cooked
    ? { ...cooked, pot: cooked.pot ? { ...cooked.pot, picked: [] } : undefined }
    : cooked
}

/** One of the Krak Pot's own lines, with the message system's markup taken out. */
function potSay(number: number): string | undefined {
  const text = loaded?.potWords.get(number)
  return text === undefined ? undefined : plainMarkup(text, heroName())
}

/** Patty's lines, readable — her `str_lui`, with the markup spelled out. */
/** The Starflight Express's words, readable — see `express.ts`. */
function expressLines(): ReadonlyMap<number, string> | undefined {
  if (!loaded) return undefined
  const out = new Map<number, string>()
  for (const [number, text] of loaded.expressWords) out.set(number, plainMarkup(text, heroName()))
  return out
}

function pattyLines(): ReadonlyMap<number, string> | undefined {
  if (!loaded) return undefined
  const out = new Map<number, string>()
  for (const [number, text] of loaded.pattyWords) {
    out.set(number, plainMarkup(text.replaceAll('<TARGET>', TARGET_MARK), heroName()))
  }
  return out
}

/** The pot's lines, readable — see `potSay`. Undefined before a cartridge is in. */
function potLines(): ReadonlyMap<number, string> | undefined {
  if (!loaded) return undefined
  const out = new Map<number, string>()
  for (const [number, text] of loaded.potWords) out.set(number, plainMarkup(text, heroName()))
  return out
}

/**
 * A `str_gskl` sentence with the message system's own markup taken out —
 * **ours, and a stand-in**: `<Cap>`, `<ACTOR>` and `<1>` are the same
 * vocabulary the conversation machinery handles, and the skill screen does
 * not go through it yet. See `docs/still-open.md`.
 */
function plainMarkup(text: string, actor: string): string {
  return (
    text
      .replaceAll('<Cap>', '')
      .replaceAll('<ACTOR>', actor)
      // The punctuation the text spells as tags — an apostrophe, a comma and a
      // dash. Without these a stripped line reads "So how will you be
      // conducting your alchemy hm?".
      .replaceAll('<1>', '\u2019')
      .replaceAll('<,>', ',')
      .replaceAll('<-->', '\u2014')
      // A line break written as the two characters backslash and n, as
      // Patty's are: "I hear ya!" then "Hey, …" printed the backslash.
      .replaceAll('\\n', '\n')
      .replaceAll(/<[^>]*>/g, '')
  )
}

/**
 * What a member is called.
 *
 * The Hero's own name; a story companion's from `attnpc`; and a created
 * character's own. **A created character's name is the player's**, given at
 * the Quester's Rest, and nothing here asks for one yet — so until character
 * creation does, one made by `?party=` is named for the ready-made character
 * they were built from, which at least tells them apart.
 */
function nameFor(member: Member): string {
  if (member.name !== undefined) return member.name
  if (member.attnpc === undefined) {
    // **Only party slot 0 is the Hero.** Anyone else with no `attnpc` is a
    // created character, and calling them "Hero" was what Patty's list showed
    // the first time it had somebody on it — see `docs/party-and-vocations.md`.
    if (members[0] === member) return heroName()
    if (member.appearance !== undefined) return `preset ${member.appearance}`
    // The name screen names everyone made since it was built — see
    // `naming.ts`. One made before it, kept in a save, goes by their trade.
    return `a ${vocationWord(member.vocation)}`
  }
  const who = loaded?.attending.find((one) => one.id === member.attnpc)
  return who?.name ?? `party member ${member.attnpc}`
}

/** What the menu's panels are told. */
function menuContext(): MenuContext {
  const levels = levelsFor(leader())
  const words = loaded?.menuWords
  const now = levels ? standing(levels, expOf(leader()), leader().gains) : undefined
  return {
    party: members.map(menuMember),
    hero: heroName(),
    map: loaded?.code,
    stage: storyStage ? `${storyStage.major}.${storyStage.minor}` : undefined,
    // The vocation in the menu's own words — `str_tm` 2106, the Minstrel.
    standing: now && {
      ...now,
      vocation: words?.get(VOCATION_WORDS + leader().vocation) ?? now.vocation,
    },
    hp: leader().hp,
    mp: leader().mp,
    bag,
    itemsView: {
      members: members.map((m, k) => ({
        name: k === 0 ? heroName() : nameFor(m),
        carried: carriers().carried[k] ?? [],
      })),
      bag,
      kindOf: (id) => loaded?.itemDefs.get(id)?.kind,
    },
    equipped: wornBy(leader()),
    numbersOf: (id) => loaded?.itemStats.get(id),
    itemName: nameOf,
    tableOf: (id) => loaded?.goods.get(id)?.table,
    mayWear: (id, place) => wearableBy(members[place] ?? leader(), id),
    quests: questList(),
    // The tricks the Hero can perform — sixteen from the start, the rest
    // learnt by `142` — and the four places; see `trickKnown`.
    tricks: {
      known: Array.from({ length: TRICKS }, (_, i) => i + 1).filter((trick) =>
        trickKnown(trick, storyGlobals),
      ),
      assigned: trickSlots,
    },
    // The list the pot is looking at: the Alchenomicon's chosen category, in
    // its chosen order — see `potList`.
    pot: loaded
      ? potList(loaded.recipes, bag, nameOf, {
          known: (id) => recipeKnown(recipesKnown, id),
          category: menu?.pot?.category,
          sort: menu?.pot?.sort,
          kindOf: (item) => loaded?.itemKinds.get(item),
        })
      : undefined,
    potLabels: loaded?.potLabels,
    pattyWords: loaded ? pattyLines() : undefined,
    expressWords: loaded ? expressLines() : undefined,
    pattyLabels: loaded?.pattyLabels,
    // Those left with Patty, as her lists name them.
    kept: withPatty.map((who) => ({
      name: nameFor(who),
      said: `${vocationWord(who.vocation)}, level ${levelOf(who)?.level ?? '?'}`,
    })),
    /** How many a category holds, which is what empties `???` from the list. */
    potCount: (at) =>
      loaded
        ? potList(loaded.recipes, bag, nameOf, {
            known: (id) => recipeKnown(recipesKnown, id),
            category: at,
            kindOf: (item) => loaded?.itemKinds.get(item),
          }).length
        : 0,
    look: loaded ? appearanceRows(members[menu?.member ?? 0] ?? leader()) : undefined,
    modelOf: loaded ? itemModels(loaded.itemDefs) : undefined,
    skillsListed: storyGlobals.has(FLAG_SKILLS_LISTED),
    // The pot's lines carry the same markup item names do — `you<1>re` is an
    // apostrophe — so they go through `renderName` as the skill labels do.
    potWords: potLines(),
    spells: heroSpells(),
    noSpells: menuSay(MENU_SAYS.noFieldSpells, { actor: heroNamed() }),
    words,
  }
}

/** The Hero as the words name them: the name alone, and he — the preset Hero's. */
function heroNamed(): Named {
  return { name: heroName(), gender: 0 }
}

/** One of the party in a battle, by their fighter's index, as the words name them. */
function fighterNamed(index: number): Named | undefined {
  if (index === 0) return heroNamed()
  const at = battleCompanions.find((one) => one.index === index)
  const member = at ? members[at.place] : undefined
  return member ? { name: nameFor(member), gender: member.sex === SEX.female ? 1 : 0 } : undefined
}

/** A monster as the words name it, by its record's number — see `MonsterWords`. */
function monsterNamed(number: number | undefined): Named | undefined {
  if (number === undefined) return undefined
  for (const words of loaded?.monsterCodes.values() ?? []) {
    if (words.number !== number) continue
    return { name: words.name, plural: words.plural, grammar: words.grammar }
  }
  return undefined
}

/** An item as the words name it: its name, plural and articles. */
function itemNamed(id: number): Named {
  const words = loaded?.itemWords.get(id)
  return words
    ? { name: words.singular, plural: words.plural, grammar: words.grammar }
    : { name: nameOf(id) }
}

/**
 * What the Items command offers: what the bag holds that does something in
 * battle, with a heal where its action restores HP — see `ItemUse`.
 */
function battleItems(carried: readonly number[]): BattleItem[] {
  const uses = loaded?.itemUses
  if (!uses) return []
  // **A member's own carried items**, slot by slot, not the bag's
  // (`func_ov026_021dc8fc` `0x021dcc2c`). What they wear, which the game lists
  // after, is not offered here — **ours**.
  return carried.map((id) => {
    const use = uses.get(id)?.battle
    const heal = use?.effect === ActionEffect.RestoresHp ? use.range : undefined
    return heal
      ? { id, name: itemNamed(id), count: 1, heal }
      : { id, name: itemNamed(id), count: 1 }
  })
}

/**
 * **What the command phase offers** each of the party — see `battle-commands.ts`.
 * Their Spells and Abilities lists are the game's (`func_ov026_021dc8fc`): the
 * actions of the skill panels they hold, by the panel's `battleOrder`, then
 * their vocation's spells in the table's order up to their level; each kept
 * only where its record says it is listed in battle, and put in Spells or
 * Abilities as its record says.
 *
 * **Ours**: the Items list is the bag's, where the game's is each member's own
 * carried items (char `+0x454`), which this engine does not keep; and an
 * action the battle cannot yet play — a blow with a handler of its own, most
 * abilities — is struck as the Attack.
 */
function battleOffered(): Offered {
  const items: BattleItem[] = []
  const spells: BattleSpell[] = []
  const known = new Map<number, Told>()
  const asked: Asked[] = battleMembers.map((member, fighter) => {
    const lists = battleListsOf(member, spells, known)
    const own = battleItems(member.carried ?? [])
    items.push(...own)
    return {
      fighter,
      name: battle?.names[fighter]?.name ?? nameFor(member),
      tactic: member.tactic ?? FOLLOW_ORDERS,
      ...(member.backLine ? { backLine: true } : {}),
      ...(member.sex === undefined ? {} : { gender: member.sex }),
      ...(armsOf(member) ? { arms: armsOf(member) as Arms } : {}),
      ...(member.attnpc === undefined && coupEntry(member, known)
        ? { coup: coupEntry(member, known) as Entry }
        : {}),
      own: fighter === 0,
      // A story companion acts by themselves. **Ours**: how the game takes a guest is not read.
      guest: member.attnpc !== undefined,
      spells: lists.spells,
      abilities: lists.abilities,
      items: own.map(itemEntry),
    }
  })
  return { asked, items, spells, known }
}

/** Revival's kind, `+0x18` bits 5–11; and Zing, Kazing and the Zing stick, which take either. */
const REVIVAL_KIND = 18
const RAISES_EITHER = new Set([38, 39, 84])
/** Psyche Up's kind of action, and the two that go straight to their level. */
const PSYCHE_KIND = 15

/** A member's Spells and Abilities, in the game's order — see `battleOffered`. */
function battleListsOf(
  member: Member,
  told: BattleSpell[],
  known: Map<number, Told>,
): { spells: Entry[]; abilities: Entry[] } {
  const here = loaded
  const out = { spells: [] as Entry[], abilities: [] as Entry[] }
  if (!here) return out
  // The panels held, and those a skill book they carry grants
  // (`func_ov026_021dc8fc` `0x021dc980`–`0x021dca0c`).
  const books = new Set(
    (member.carried ?? []).flatMap((id) => {
      const def = here.itemDefs.get(id)
      return def?.book ? [def.panel] : []
    }),
  )
  const held = panelsHeld(member, here.skillPanels)
  for (const panel of here.skillPanels)
    if (books.has(panel.id) && !held.includes(panel)) held.push(panel)
  const fromPanels = held
    .filter((panel) => panel.action !== 0)
    .sort((a, b) => a.battleOrder - b.battleOrder)
    .map((panel) => panel.action)
  const row = levelOf(member)
  const fromTable =
    here.spellTable && row
      ? here.spellTable.learnt
          .filter((spell) => spell.vocation === member.vocation && spell.level <= row.level)
          .map((spell) => spell.action)
      : []
  for (const id of [...fromPanels, ...fromTable]) {
    const action = here.actions.get(id)
    if (!action || (action.usableIn & 2) === 0) continue
    const list = action.list === 2 ? out.spells : action.list === 1 ? out.abilities : undefined
    if (!list) continue
    const spell = battleSpellOf(action)
    if (spell) told.push(spell)
    const kind = action.rolls?.kind
    const blow = blowOf(action)
    if (blow)
      known.set(id, {
        name: { name: action.name },
        message: action.message,
        opening: action.opening,
      })
    const command: Entry['command'] = spell
      ? (target) => ({ kind: 'spell', spell: spell.spell, target })
      : blow
        ? (target) => ({ kind: 'blow', blow, target })
        : kind === PSYCHE_KIND && action.reach === ActionReach.Actor
          ? () => ({
              kind: 'psyche',
              action: id,
              steps: Math.max(1, action.rolls?.levels ?? 1),
              ...(id === 0x151 || id === 0x152 ? { outright: true } : {}),
            })
          : (target) => ({ kind: 'attack', target: action.side === 1 ? target : -1 })
    list.push({
      action: id,
      name: renderName(action.name),
      cost: action.cost,
      side: action.side,
      reach: action.reach,
      ...(kind === REVIVAL_KIND ? { fallen: 'only' as const } : {}),
      ...(RAISES_EITHER.has(id) ? { fallen: 'either' as const } : {}),
      command,
    })
  }
  return out
}

/**
 * Tactics and rows set from Misc. in battle, kept with their members — see
 * `Member.tactic` and `Member.backLine`.
 */
function keepTactics(): void {
  if (!battle) return
  for (const [fighter, tactic] of battle.tactics) {
    const member = battleMembers[fighter]
    if (member) member.tactic = tactic === FOLLOW_ORDERS ? undefined : tactic
  }
  for (const [fighter, back] of battle.lines) {
    const member = battleMembers[fighter]
    if (member) member.backLine = back || undefined
  }
}

/**
 * **A member's weapons, as battle Equipment offers them** — see `Arms`: the
 * one in hand, and the bag's of a kind their vocation's trees, or a tree's
 * "may wield" panel, let them wield. The sex rule is not asked: the battle's
 * kind mask does not ask it (`func_020dd3cc`). None for a guest.
 */
function armsOf(member: Member): Arms | undefined {
  if (member.attnpc !== undefined || !loaded) return undefined
  const here = loaded
  const trees = here.vocationTrees
  const weapon = (id: number): Weapon | undefined => {
    const stats = here.itemStats.get(id)
    const kind = (stats?.kind ?? 0) - 1
    if (kind < 0 || kind > 11) return undefined
    const named = itemNamed(id)
    return {
      item: id,
      kind,
      name: tellBattle('<SGL_I_NAME>', { item: named }, new Map()).text,
      named,
      attack: stats?.attack ?? 0,
      defence: stats?.defence ?? 0,
      agility: stats?.agility ?? 0,
      coup: stats?.coupBonus ?? 0,
    }
  }
  const wields = (id: number) =>
    armoury ||
    mayWear(
      here.itemStats.get(id),
      { vocation: member.vocation },
      {
        wielding: trees ? (tree) => vocationsWielding(trees, tree) : undefined,
        regardless: (tree) =>
          panelsHeld(member, here.skillPanels ?? []).some(
            (panel) => panel.tree === tree && panel.grants === GRANTS_REGARDLESS,
          ),
      },
    )
  const held = wornBy(member).get('weapon')
  return {
    inHand: held === undefined ? undefined : weapon(held),
    bag: [...bag.items.keys()]
      .filter((id) => slotOf(here.goods.get(id)?.table) === 'weapon' && wields(id))
      .flatMap((id) => weapon(id) ?? []),
  }
}

/** How many of this battle's weapon changes are applied — see `keepArms`. */
let armsKept = 0

/** Weapons changed from Misc. in battle, put on from the bag at once, and drawn — see `Arms`. */
function keepArms(): void {
  if (!battle) return
  for (const { fighter, to } of battle.armed.slice(armsKept)) {
    const member = battleMembers[fighter]
    const worn = member && equip(bag, wornBy(member), 'weapon', to?.item)
    if (!member || !worn) continue
    bag = worn.bag
    wear(member, worn.equipped)
    dressHero()
  }
  armsKept = battle.armed.length
}

/** The numbers using an item or casting a spell outside battle draws from: seeded, as a battle's are. */
const fieldRng = new BattleRng(0x6d656e75n)

/**
 * The chimaera wing's action, as its item table names it. Its record says
 * nothing of what it does — no effect, no range, no message — so what it does
 * here is ours: thrown outdoors, in `actmsg` 363's words, it takes the Hero to
 * {@link WING_TOWN}, the slice's one village, where a map's own spawn stands
 * them; indoors the Hero bangs their head on the ceiling, `strstd` 57, and the
 * wing is kept.
 */
const WING_ACTION = 261
const WING_TOWN = 'M01'
const WING_THROWN = 363
const CEILING = 57
/**
 * Evac's action, whose record says nothing of what it does either: **ours**,
 * cast in a dungeon's rooms it takes the Hero to the region's outside —
 * `Loaded.regionExterior`, the Hexagon's `D01` — at its entrance, for its 3
 * MP; anywhere else it does nothing and costs nothing.
 */
const EVAC_ACTION = 205 // its rooms are the `D` maps' — a house is no dungeon
/**
 * Holy water's field action, likewise unread: **ours**, sprinkled in `actmsg`
 * 362's words, it keeps the field's monsters away for {@link HOLY_WATER_CALM}
 * ticks — a minute — where the game's keeps the weaker ones off for a while.
 */
const HOLY_WATER_ACTION = 259
const HOLY_WATER_CALM = 3600

/**
 * Where a Hero who is wiped out comes round: before the village church's
 * priest — character 13 of `M01M06`, whose line hands over to `<CHURCH=1>`, and
 * who stands at (0, 0.053, −0.575) facing the door — on the near side of his
 * altar, facing him. **Ours**: that a defeat ends at a church, this one, and
 * where in it; the game's rule is in its code, and no text says it.
 */
const CHURCH = {
  map: 'M01M06',
  spot: { x: 0, y: 0.053, z: -0.2, facing: Math.PI },
} as const
/** Whether the battle just put away was lost, and the Hero is to come round in the church. */
let wakeInChurch = false

/** The Hero's numbers now: their level's, with what seeds have added. */
function heroRow(): LevelRow | undefined {
  const levels = levelsFor(leader())
  return levels ? standing(levels, expOf(leader()), leader().gains).level : undefined
}

function heroVitals(row: LevelRow): Vitals {
  return {
    hp: Math.min(leader().hp ?? row.maxHp, row.maxHp),
    maxHp: row.maxHp,
    mp: Math.min(leader().mp ?? row.maxMp, row.maxMp),
    maxMp: row.maxMp,
  }
}

/**
 * Move the Hero a level, or put them at one — a testing aid, **ours**: `l` a
 * level on, Shift+L a level back, and `window.minstrelLevel(n)` straight to a
 * level. Nothing in the game hands out levels but a fight, and what a level
 * does to a fight is what this is for.
 *
 * The experience is set to the level's own threshold rather than the level
 * being set on its own — see `expAtLevel`. The wounds follow a level as a
 * battle's level-up does: the maximum's gain is gained, and what was spent
 * stays spent.
 *
 * What it says is the level reached, what the change brought, and the attack
 * and defence a fight would give the Hero — their strength and resilience
 * plus what they wear, which is what `startFight` hands the battle. Returns
 * the level's own numbers, for a headless check to read.
 */
function levelTo(
  level: number | undefined,
  by = 0,
  moved: Member = leader(),
): LevelRow | undefined {
  const place = members.indexOf(moved)
  const who = place <= 0 ? heroName() : nameFor(moved)
  // A story companion keeps the numbers `attnpc` gives them, and has no level to move.
  if (!levelsUp(moved)) {
    status(`${who} keeps their own numbers and has no level to move`)
    return undefined
  }
  const levels = levelsFor(moved)
  if (!levels) {
    status(`the level table did not load, so ${who} has no level to move`)
    return undefined
  }
  const before = standing(levels, expOf(moved), moved.gains).level
  // Into the vocation they are, which is the only one this moves.
  moved.exp.set(
    moved.vocation,
    level === undefined ? expLevelledBy(levels, expOf(moved), by) : expAtLevel(levels, level),
  )
  const after = standing(levels, expOf(moved), moved.gains).level
  earnSkillPoints(moved, before, after)
  // Undefined is whole, and stays whole at the new maximum.
  if (moved.hp !== undefined)
    moved.hp = Math.min(after.maxHp, moved.hp + (after.maxHp - before.maxHp))
  if (moved.mp !== undefined)
    moved.mp = Math.min(after.maxMp, moved.mp + (after.maxMp - before.maxMp))
  const worn = wornNumbers(wornBy(moved))
  const numbers = `attack ${after.strength + worn.attack} · defence ${after.resilience + worn.defence}`
  // At an end of the table a key press moves nothing, which is worth saying.
  const end =
    after.level === 1
      ? " — the table's first"
      : after.level === levels.levels.length
        ? " — the table's last"
        : ''
  status(
    after.level === before.level
      ? `${who}: level ${after.level}${end} · ${numbers}`
      : `${who}: level ${after.level}, ${after.exp} experience · ${levelGainsText(before, after)} · ${numbers}`,
  )
  // The status panel is where the numbers are read, so it is redrawn under the key.
  if (menu) showMenu()
  return after
}

/** One of a file's messages, told for who and what; undefined when the file has none by that number. */
function told(words: ReadonlyMap<number, string> | undefined, number: number, telling: Telling) {
  const template = words?.get(number)
  const articles = loaded?.battleWords.articles
  return template === undefined || !articles
    ? undefined
    : tellBattle(template, telling, articles).text
}

/** A field menu message, `str_tm`. */
const menuSay = (number: number, telling: Telling) => told(loaded?.menuWords, number, telling)
/**
 * One of the Krak Pot's messages, `str_ren`, told properly — through the same
 * machinery the battle's words go through, because the pot's lines use the
 * same vocabulary: `<IF_SING val_1>`, `<INDEF_ART_SGL_I_NAME>`, `<Cap>`.
 * Rendering them by stripping tags gives "Wow! ! warrior's sword."
 */
const potTell = (number: number, telling: Telling) => told(loaded?.potWords, number, telling)
/** An action's message, `actmsg`. */
const actionSay = (number: number, telling: Telling) =>
  told(loaded?.battleWords.actions, number, telling)

/** Put what came of something used on the Hero into their numbers, and say it in the action's words. */
function settle(outcome: Outcome, row: LevelRow): string {
  const hero = heroNamed()
  switch (outcome.kind) {
    case 'hp':
      leader().hp = outcome.hp >= row.maxHp ? undefined : outcome.hp
      return (
        actionSay(outcome.message, { target: hero }) ??
        menuSay(MENU_SAYS.healed, { target: hero }) ??
        `${hero.name} recovers ${outcome.amount} HP.`
      )
    case 'mp':
      leader().mp = outcome.mp >= row.maxMp ? undefined : outcome.mp
      return (
        actionSay(outcome.message, { target: hero }) ??
        `${hero.name} recovers ${outcome.amount} MP.`
      )
    case 'gain':
      leader().gains = gain(leader().gains, outcome.stat, outcome.amount)
      // **A seed of skill goes into the pool**, which is not a level's number
      // and so is not in `withGains`. The game adds it to `live+0x564` under
      // the same 2,600 cap a level's award has — `0x02084df4`, whose amount
      // is the literal 2.
      if (outcome.stat === 'skillPoints') {
        leader().skillPool = Math.min(POOL_MOST, leader().skillPool + outcome.amount)
      }
      return (
        actionSay(outcome.message, { target: hero, values: { val_1: outcome.amount } }) ??
        `${hero.name}'s ${outcome.stat} rises by ${outcome.amount}.`
      )
    case 'noUse':
      return menuSay(MENU_SAYS.noUse, { target: hero }) ?? `It would be no use on ${hero.name} now.`
    case 'unknown':
      return 'What it does is not read yet.'
  }
}

/**
 * Use an item from the items panel and say what came of it — see `use.ts`.
 * What would do nothing now is kept; what has no use outside battle does
 * nothing, and is kept; what does something is used up. The chimaera wing is
 * {@link WING_ACTION}'s.
 */
function useInField(held: Held): string[] {
  const id = held.item
  spending = held
  const here = loaded
  const row = heroRow()
  if (!here || !row) return ['The level table did not load, so nothing can be used.']
  const hero = heroNamed()
  const use = here.itemUses.get(id)?.field
  const uses =
    menuSay(MENU_SAYS.uses, { actor: hero, item: itemNamed(id) }) ??
    `${hero.name} uses ${nameOf(id)}.`
  if (use?.action === WING_ACTION) return flyHome(id)
  // Sterling's whistle is the field item code's own case, by the item — see `blowWhistle`.
  if (id === STERLINGS_WHISTLE) {
    const said = blowWhistle()
    if (flying) menu = undefined
    return said ?? []
  }
  if (use?.action === HOLY_WATER_ACTION) return sprinkle(id)
  if (!use) return [uses, menuSay(MENU_SAYS.nothingHappens, {}) ?? 'But nothing happens.']
  const outcome = useOn(use, heroVitals(row), fieldRng)
  if (outcome.kind === 'unknown') return [`What ${nameOf(id)} does is not read yet; it is kept.`]
  if (outcome.kind !== 'noUse') spend(id)
  return [uses, settle(outcome, row)]
}

/** The item being used, where it is — see `spend`. */
let spending: Held | undefined

/**
 * An item used up, from where it was used (`func_ov002_0215a7b4`): from a
 * member, that slot, the list closing up; from the bag, one. Only an item
 * that is used up when used goes (`+0x08` bit 19).
 */
function spend(id: number): void {
  const def = loaded?.itemDefs.get(id)
  if (def && !def.usedUp) return
  const held = spending
  if (held && held.item === id && held.owner !== 'bag') {
    const list = carriers().carried[held.owner]
    if (list?.[held.slot] === id) {
      removeSlot(list, held.slot)
      return
    }
  }
  bag = drop(bag, id) ?? bag
}

/** A chimaera wing, thrown — see {@link WING_ACTION}. Outdoors it closes the menu and flies. */
function flyHome(id: number): string[] {
  const hero = heroNamed()
  if (self?.inside) {
    return [
      told(loaded?.standardWords, CEILING, { actor: hero }) ??
        `${hero.name} bangs his head on the ceiling!`,
    ]
  }
  const thrown =
    actionSay(WING_THROWN, { actor: hero, item: itemNamed(id) }) ??
    `${hero.name} throws the chimaera wing high into the air!`
  spend(id)
  menu = undefined
  showMenu()
  if (enter(WING_TOWN)) status(thrown)
  return [thrown]
}

/** Holy water, sprinkled — see {@link HOLY_WATER_ACTION}: the field's monsters keep away a while. */
function sprinkle(id: number): string[] {
  const hero = heroNamed()
  const sprinkled =
    actionSay(362, { actor: hero, item: itemNamed(id) }) ??
    `${hero.name} sprinkles some holy water about the place.`
  spend(id)
  if (roaming) roaming = calmFor(roaming, HOLY_WATER_CALM)
  return [sprinkled]
}

/** Evac, cast — see {@link EVAC_ACTION}: out of a dungeon to its region's outside, or nothing. */
function evacuate(spell: { readonly name: string; readonly cost: number }): string[] {
  const row = heroRow()
  const here = loaded
  if (!row || !here) return ['That spell is not read.']
  const hero = heroNamed()
  const casts =
    menuSay(MENU_SAYS.casts, { actor: hero, values: { str_2: spell.name } }) ??
    `${hero.name} casts ${spell.name}.`
  // A dungeon's rooms only — the `D` maps; a house in the village is no dungeon.
  const outside = here.regionExterior
  if (!outside || outside === here.code || !/^D/i.test(outside)) {
    return [casts, menuSay(MENU_SAYS.nothingHappens, {}) ?? 'But nothing happens.']
  }
  const mp = leader().mp ?? row.maxMp
  if (mp < spell.cost) return [menuSay(MENU_SAYS.notEnoughMp, {}) ?? 'Not enough MP!']
  leader().mp = mp - spell.cost
  menu = undefined
  showMenu()
  if (enter(outside)) status(casts)
  return [casts]
}

/** Throw an item away, from where it is — a member's slot, or one from the bag — and say so. */
function discardInField(held: Held): string[] {
  const id = held.item
  if (held.owner === 'bag') bag = drop(bag, id) ?? bag
  else {
    const list = carriers().carried[held.owner]
    if (list?.[held.slot] === id) removeSlot(list, held.slot)
  }
  return [menuSay(MENU_SAYS.discarded, { item: itemNamed(id) }) ?? `${nameOf(id)} discarded.`]
}

/**
 * An item moved, from the Items panel's Transfer — see `transfer` in
 * `inventory.ts`. **Ours**: the words said; the game's are `str_tm` 9051 to
 * 9070, by who gives and who takes, and are not yet taken.
 */
function transferInField(move: NonNullable<Taken['transfer']>): string[] {
  const after = transfer(bag, carriers(), move.held, move.to)
  if (!after) return ['That will not go there.']
  bag = after
  const to = move.to.owner === 'bag' ? 'the bag' : nameFor(members[move.to.owner] ?? leader())
  return [`${nameOf(move.held.item)} goes to ${to}.`]
}

/**
 * **Heal All** over the party, as the game runs it — see `heal-all.ts` — and
 * what it says: for each cast, `str_tm` 9005 "X casts Heal.", then 9017 "Y's
 * wounds are healed!" (31052 for Squelch) or 9003 "But nothing happens."; and
 * 9003 alone when nothing was cast. Each amount is the field's own roll,
 * `fieldAmount`, from the world's generator.
 */
function healAllInField(): string[] {
  if (!loaded) return []
  const here = loaded
  const table = here.spellTable
  const rows = members.map((member) => menuMember(member).standing?.level)
  const party: Healer[] = members.map((member, i) => {
    const row = rows[i]
    const maxHp = row?.maxHp ?? 0
    const maxMp = row?.maxMp ?? 0
    const level = levelOf(member)
    const known = new Set(
      table && level ? spellsLearnt(table, member.vocation, level.level).map((s) => s.action) : [],
    )
    return {
      hp: member.hp ?? maxHp,
      maxHp,
      mp: member.mp ?? maxMp,
      // A story companion is no vocation's healer: Heal All ranks by
      // vocation, and theirs is not kept as one.
      vocation: member.attnpc === undefined ? member.vocation : -1,
      knows: (action) => known.has(action),
    }
  })
  const roll = (action: number, caster: number): number => {
    const range = here.actions.get(action)?.range
    if (!range) return 0
    const { min, max, scales } = range.party
    const mending = rows[caster]?.magicalMending ?? 0
    return fieldAmount(
      roamRng,
      scales ? { min, max, scales: { stat: mending, lo: scales.lo, hi: scales.hi } } : { min, max },
      range.spread,
      scales?.by === 'mending',
    )
  }
  const run = healAll(party, roll, (action) => here.actions.get(action)?.cost ?? 0)
  members.forEach((member, i) => {
    const row = rows[i]
    if (!row) return
    const hp = run.hp[i] ?? 0
    const mp = run.mp[i] ?? 0
    member.hp = hp >= row.maxHp ? undefined : hp
    member.mp = mp >= row.maxMp ? undefined : mp
  })
  const named = (i: number): Named => {
    const member = members[i]
    return {
      name: member ? nameFor(member) : heroName(),
      gender: member?.sex === SEX.female ? 1 : 0,
    }
  }
  const nothing = menuSay(MENU_SAYS.nothingHappens, {}) ?? 'But nothing happens.'
  const lines: string[] = []
  for (const cast of run.casts) {
    const spell = here.actions.get(cast.action)?.name ?? `action ${cast.action}`
    lines.push(
      menuSay(MENU_SAYS.casts, { actor: named(cast.caster), values: { str_2: spell } }) ??
        `${named(cast.caster).name} casts ${spell}.`,
    )
    if (!cast.took) {
      lines.push(nothing)
      continue
    }
    for (const [j, target] of cast.targets.entries()) {
      if ((cast.gained[j] ?? 0) <= 0 && cast.action !== HEALS.squelch) continue
      lines.push(
        menuSay(cast.action === HEALS.squelch ? MENU_SAYS.unpoisoned : MENU_SAYS.wounds, {
          target: named(target),
        }) ?? `${named(target).name} is healed.`,
      )
    }
  }
  if (run.nothing) lines.push(nothing)
  status(
    `Heal All: ${run.casts.length} cast${run.casts.length === 1 ? '' : 's'}` +
      (run.nothing ? ', and nothing happens' : ''),
  )
  return lines
}

/** Cast a spell on the Hero from the spells panel, and say what came of it — see `castOn`. */
function castInField(action: number): string[] {
  const row = heroRow()
  const spell = loaded?.actions.get(action)
  if (!row || !spell) return ['That spell is not read.']
  const hero = heroNamed()
  if (action === EVAC_ACTION) return evacuate(spell)
  const cast = castOn(spell, heroVitals(row), fieldRng)
  if (cast.outcome.kind === 'notEnoughMp') {
    return [menuSay(MENU_SAYS.notEnoughMp, {}) ?? 'Not enough MP!']
  }
  if (cast.outcome.kind === 'unknown') {
    return [`What ${spell.name} does outside a battle is not read yet.`]
  }
  leader().mp = cast.mp >= row.maxMp ? undefined : cast.mp
  const casts =
    menuSay(MENU_SAYS.casts, { actor: hero, values: { str_2: spell.name } }) ??
    `${hero.name} casts ${spell.name}.`
  return [casts, settle(cast.outcome, row)]
}

/** The spells the Hero has learnt by their level, with what each costs and whether it is cast here. */
function heroSpells(member: Member = leader()): MenuSpell[] | undefined {
  const here = loaded
  const table = here?.spellTable
  const row = levelOf(member)
  if (!here || !table || !row) return undefined
  return spellsLearnt(table, member.vocation, row.level).flatMap((spell) => {
    const action = here.actions.get(spell.action)
    return action
      ? [{ action: spell.action, name: action.name, cost: action.cost, field: action.field }]
      : []
  })
}

/** The items panel's row, kept inside a list that has lost an item. */
function keptInBag(state: MenuState): MenuState {
  if (state.panel !== 'items' || !state.items) return state
  const view = menuContext().itemsView
  const count = view ? itemsRows(state.items, view).length : 0
  return { ...state, row: Math.max(0, Math.min(state.row, count - 1)) }
}

/** What a shop, the inn or the church is told about the items and the Hero. */
function counter(): Counter {
  return {
    name: nameOf,
    price: (id) => loaded?.goods.get(id)?.price,
    sells: (id) => loaded?.goods.get(id)?.sells,
    carriers: carriers(),
    names: members.map((m, k) => (k === 0 ? heroName() : nameFor(m))),
    kindOf: (id) => loaded?.itemDefs.get(id)?.kind,
  }
}

/** Open what a line handed over to — see `services.ts`. */
function openService(service: Service, who?: Talker): void {
  if (!loaded) return
  if (service.kind === 'SHOP') {
    const shop = loaded.shops.get(service.id)
    if (!shop) {
      status(`the line hands over to shop ${service.id}, which the shop table does not have`)
      return
    }
    visit = visitShop(shop)
  } else if (service.kind === 'LUIDA') {
    // **Patty is spoken to**, as the pot is — `<LUIDA>` is facility code 5.
    menu = { ...openMenu(), panel: 'patty', patty: openPatty() }
    self?.held.clear()
    showMenu()
    return
  } else if (service.kind === 'RIKKA' || service.kind === 'RIKKAFIRST') {
    // Erinn's counter — codes 6 and 12, the same flow; see `counter.ts`.
    openCounter(who)
    return
  } else if (service.kind === 'BANK') {
    openBank(who)
    return
  } else if (service.kind === 'DAMA') {
    // Alltrades Abbey — facility code 9, `<DAMA>` on Jack's line.
    openAbbey(who)
    return
  } else if (service.kind === 'RENKIN') {
    // **The Krak Pot is spoken to, not chosen from a menu.** `<RENKIN>` at the
    // end of the pot's own talk line is facility code 7 — see `Service` in
    // `talk.ts` — so this is the pot's real entry point and the only one.
    // Opening it sets flag 0x777, which a bookcase's recipe book waits on.
    storyGlobals.add(FLAG_POT_USED)
    menu = { ...openMenu(), panel: 'pot', pot: openPot() }
    self?.held.clear()
    showMenu()
    return
  } else {
    // The inn and the church: their own flows — see `keepers.ts`.
    if (service.kind === 'INN') openInn(service.id, who)
    else openChurch(service.id, who)
    return
  }
  self?.held.clear()
  showMenu()
}

/** Draw the shop, inn or church being visited into the menu's box. */
function showVisit(current: Visit): void {
  const view = viewOf(current, bag, counter())
  menuEl.replaceChildren()
  const rows = document.createElement('div')
  rows.className = 'commands'
  for (const [index, row] of view.rows.entries()) {
    const item = document.createElement('div')
    item.textContent = row
    if (index === view.cursor) item.className = 'chosen'
    rows.append(item)
  }
  const panel = document.createElement('div')
  panel.className = 'panel'
  for (const line of [view.title, ...view.lines].filter((l) => l !== '')) {
    const row = document.createElement('div')
    row.textContent = line
    panel.append(row)
  }
  // A window with nothing beside it — Erinn's counter — draws no empty panel.
  menuEl.append(...(panel.childElementCount > 0 ? [rows, panel] : [rows]))
  menuEl.hidden = false
  status(`${view.title || 'choose'} · ↑/↓ choose, f take, Esc back`)
}

/**
 * Let the map's monsters roam, if it has a zone: its kind 0, or failing that
 * its first — the same zone on every map, since a kind 0 always comes first.
 * **How the game chooses among a map's zones is not established**
 * (game-formats' FORMAT.md, "Encounters"): Angel Falls Region's kind 0 and
 * kind 1 are slimes, teeny sanguinis, cruelcumbers and sacksquatches on other
 * weights, and its kind 2 bodkin archers, batterflies and cruelcumbers; which
 * roams when is wanted from the emulator. So the kind 0 is **ours**.
 * Each monster moves at the Hero's walking speed times its field speed from
 * `fld_mondata` (INFERRED). Their field models are read now, not mid-walk.
 */
function beginRoaming(): void {
  roaming = undefined
  roamKinds = []
  roamZone = undefined
  roamCarry = 0
  const here = loaded
  if (!here || !cartridge) return
  // The time of day's kind — see `ZONE_KIND_BY_TIME` — else the day's, else the first.
  const wantedKind = ZONE_KIND_BY_TIME[timeNow()]
  const zone =
    here.fieldZones.find((z) => z.kind === wantedKind) ??
    here.fieldZones.find((z) => z.kind === 0) ??
    here.fieldZones[0]
  if (!zone) return
  roamZone = zone.zone
  roamKinds = zone.monsters.map((m) => ({
    number: m.number,
    weight: m.weight,
    speed: fx32(Math.round(WALK_SPEED * (here.fieldMonsters.get(m.number)?.speed ?? 0.5))),
  }))
  for (const kind of roamKinds) {
    const code = here.monsterCodeOf.get(kind.number)
    if (code) monsterLookOf(cartridge, `${code}_f`)
  }
  // Work out where they may stand now, not on their first step.
  if (world) footingOf(world)
  roaming = startRoaming(ROAM_CALM)
}

/**
 * Walk into a roaming monster, and fight it, with up to two more from the
 * zone's battle company, each drawn evenly. **The company is a stand-in**: what
 * `encbtl`'s numbers beside each monster say about who joins is not read.
 */
function fightRoamer(touched: Roamer): void {
  if (!loaded) return
  const code = loaded.monsterCodeOf.get(touched.number)
  if (!code) return
  const company = roamZone === undefined ? [] : (loaded.battleZones.get(roamZone)?.company ?? [])
  const codes = [code]
  const total = company.reduce((sum, c) => sum + c.weight, 0)
  const kinds = total > 0 ? roamRng.below(3) : 0
  for (let i = 0; i < kinds && codes.length < BATTLE_MOST; i++) {
    let roll = roamRng.below(total)
    let joined: (typeof company)[number] | undefined
    for (const candidate of company) {
      roll -= candidate.weight
      if (roll < 0) {
        joined = candidate
        break
      }
    }
    const joinedCode = joined ? loaded.monsterCodeOf.get(joined.number) : undefined
    if (!joined || !joinedCode) continue
    const count = joined.least + roamRng.below(Math.max(1, joined.most - joined.least + 1))
    for (let k = 0; k < count && codes.length < BATTLE_MOST; k++) codes.push(joinedCode)
  }
  // **How the fight opens is the game's** — who was facing whom as they met,
  // and a draw from the C library's generator: `howItOpens`. The Hero's is the
  // party's highest deftness, no one else in the slice having numbers.
  const walker = self
  if (!walker) return
  const mine = {
    x: toFloat(walker.state.x),
    z: toFloat(walker.state.z),
    facing: walker.facing,
  }
  const theirs = {
    x: toFloat(touched.state.x),
    z: toFloat(touched.state.z),
    facing: headingAngle(touched.heading),
  }
  startFight(
    codes,
    true,
    howItOpens(dropRng, {
      theirs: facingOff(theirs, mine),
      ours: facingOff(mine, theirs),
      deftness: heroRow()?.deftness ?? 0,
    }),
  )
}

/** The open ground worked out last, and the map and scale it was for. */
let footing: { map: Loaded; grow: number; ground: OpenGround } | undefined
/**
 * Where the map draws open ground — see `openGround` — once for each map and
 * scale. **Not once for each world built**: the map's animation re-poses it,
 * and every pose rebuilds the collision, many times a second; the grid is by
 * position, not by triangle, so a rebuilt world of the same map keeps it. The
 * pieces are taken as they are drawn, grown by the room and world scales.
 */
function footingOf(walked: CollisionWorld): OpenGround | undefined {
  const here = loaded
  if (!here) return undefined
  const grow = roomScale * worldScale
  if (footing?.map !== here || footing.grow !== grow) {
    const pieces = here.map.pieces.map((piece) => ({
      ...piece,
      place: { x: piece.place.x * grow, y: piece.place.y * grow, z: piece.place.z * grow },
      scale: piece.scale * grow,
    }))
    footing = { map: here, grow, ground: openGround(pieces, walked) }
  }
  return footing.ground
}

/** The roaming monsters, each in its field model, running while it moves. */
function roamerPieces(now: number): Piece[] {
  const here = loaded
  const rom = cartridge
  if (!roaming || !here || !rom) return []
  const frame = Math.floor((now / 1000) * MAP_FPS)
  return roaming.roamers.flatMap((r) => {
    const code = here.monsterCodeOf.get(r.number)
    const look = code ? monsterLookOf(rom, `${code}_f`) : undefined
    if (!look) return []
    return monsterPieces(
      look,
      { x: toFloat(r.state.x), y: toFloat(r.state.y), z: toFloat(r.state.z) },
      headingAngle(r.heading),
      characterScale,
      r.moving ? 'run' : 'stand',
      frame,
    )
  })
}

/**
 * What the Hero's worn equipment adds to their attack, defence and agility, as
 * read — see `itemStatsOf` in `load.ts`.
 */
function wornNumbers(worn: ReadonlyMap<Slot, number> = wornBy(leader())): {
  attack: number
  defence: number
  agility: number
  block: number[]
} {
  const block: number[] = []
  let attack = 0
  let defence = 0
  let agility = 0
  for (const item of worn.values()) {
    const numbers = loaded?.itemStats.get(item)
    attack += numbers?.attack ?? 0
    defence += numbers?.defence ?? 0
    agility += numbers?.agility ?? 0
    block.push(numbers?.block ?? 0)
  }
  return { attack, defence, agility, block }
}

/**
 * What a level brought in skill points, added to the member's pool.
 *
 * **The level table's column 10 is cumulative** — "the skill points gained by
 * this level, all told", 0 at level 1 and 200 at 99 — so what a level brings
 * is the difference between the two rows. The pool is the character's, not a
 * vocation's, which is why levelling in a *new* vocation earns again: the
 * table read is that vocation's, and the points go to the same pool.
 *
 * **Clamped to the headroom under `POOL_MOST`**, which is what the game does:
 * `ov023 0x021f0c70` works out `2600 − pool` and cuts the award down to it
 * before adding, so the *award itself* is reduced rather than the sum being
 * truncated afterwards.
 *
 * ```
 * 021f0c70  sub   r0, r0, r1         ; headroom = 2600 - pool
 * 021f0c80  cmp   r1, r0, lsr #23    ; headroom < award ?
 * 021f0c94  strhlo r0, [r8, #4]      ; cut the award to the headroom
 * 021f0cb4  add   r8, ip, r8, lsr #23
 * 021f0cb8  strh  r8, [r1, #0x64]    ; pool += award
 * ```
 *
 * Moving down a level gives nothing back. The game has no way down, so
 * nothing about it is read; `?level` can go down and this declines to take
 * points that may already have been spent.
 */
function earnSkillPoints(member: Member, before: LevelRow, after: LevelRow): number {
  const wanted = Math.max(0, after.skillPoints - before.skillPoints)
  const gained = Math.min(wanted, POOL_MOST - member.skillPool)
  member.skillPool += gained
  return gained
}

/** A member's level row, where their vocation's table read — see `levelsFor`. */
function levelOf(member: Member): LevelRow | undefined {
  const levels = levelsFor(member)
  return levels ? standing(levels, expOf(member), member.gains).level : undefined
}

/**
 * A created character as a fighter: their vocation's numbers at their level,
 * plus what they wear — **built exactly as the Hero's is**, because they are
 * the same kind of thing. See `docs/party-and-vocations.md`.
 *
 * Undefined when their vocation's level table did not read, which leaves them
 * out of the fight rather than standing there with nothing.
 */
function createdFighter(member: Member): Fighter | undefined {
  const row = levelOf(member)
  if (!row) return undefined
  const worn = wornNumbers(wornBy(member))
  return {
    name: nameFor(member),
    side: 'party',
    maxHp: row.maxHp,
    maxMp: row.maxMp,
    attack: row.strength + worn.attack,
    defence: row.resilience + worn.defence,
    agility: row.agility + worn.agility,
    deftness: row.deftness,
    ...(holdsPanel(member, CRITICAL_IN_A_CRISIS) ? { crisisCritical: true } : {}),
    resist: wornResistances(
      [...wornBy(member).values()].flatMap((id) => {
        const own = loaded?.itemResistances.get(id)
        return own ? [own] : []
      }),
    ),
    might: row.magicalMight,
    mending: row.magicalMending,
    shield: wornBy(member).has('shield'),
    block: blockChance(wornBy(member).has('shield'), worn.block),
    exp: 0,
    gold: 0,
    level: row.level,
    coup: coupFor(member, row.level),
  }
}

/**
 * **A member's coup de grâce**, as the battle draws for it — see `coup.ts` in
 * the sim: their level in their vocation, and their term after acting, their
 * vocation's and the bonus of what they wear (`func_02085038`).
 */
function coupFor(member: Member, level: number): { level: number; bonus: number } {
  let worn = 0
  for (const item of wornBy(member).values()) worn += loaded?.itemStats.get(item)?.coupBonus ?? 0
  return { level, bonus: coupBonus(member.vocation, worn) }
}

/**
 * **A member's Coup de Grâce command** — their vocation's coup
 * (`data_ov000_02183658`): a blow where its handler is read, the Warrior's
 * Critical Claim among them. **Ours**: any other — its handler, of kinds 10,
 * 26 and 67 to 77, not read — is said, its opening line, and does nothing.
 */
function coupEntry(member: Member, known: Map<number, Told>): Entry | undefined {
  const id = COUP_OF.get(member.vocation)
  const action = id === undefined ? undefined : loaded?.actions.get(id)
  if (id === undefined || !action) return undefined
  known.set(id, { name: { name: action.name }, message: action.message, opening: action.opening })
  const blow = blowOf(action)
  return {
    action: id,
    name: renderName(action.name),
    cost: action.cost,
    side: action.side,
    reach: action.reach,
    command: blow
      ? (target) => ({ kind: 'blow', blow, target })
      : () => ({ kind: 'wait', action: id }),
  }
}

/**
 * Start a battle with these monsters, by code, where the Hero stands.
 *
 * The Hero fights with their level's numbers. **Their attack, defence and
 * agility are their strength, resilience and agility plus what their equipment
 * adds**: the equipment's numbers are read (game-formats' FORMAT.md, "The
 * stats"), the adding is **ours** — the battle reference takes attack and
 * defence as given (its setups name them, `atk123_def86`), and how the game
 * makes them up is not cited. Agility decides the order of a round.
 */
/**
 * **Go into a battle as the game does** (overlay 17 `func_ov017_021b6f18`, the
 * swirl `func_0204700c`): the battle's track cuts in at once, the field's
 * camera turns and narrows for 36 ticks, both screens going to black over 20
 * frames from the 16th; then the battle is set up in the black, and comes up
 * — see {@link battleDarkness}. **Ours**: the swirl's own model,
 * `effect/ev999991500.chr`, is not drawn — how it is placed in front of the
 * camera is not read.
 */
/** The lighting slot the battle being entered was asked for at — see {@link startFight}. */
let askedSlot: number = LIGHTING_SLOT.day

function startFight(codes: readonly string[], canFlee: boolean, opening: Opening = 'even'): void {
  blog = battleLog(performance.now())
  logMotions.clear()
  log(`fight: ${codes.join(', ')}${canFlee ? '' : ' (no running)'}, opening ${opening}`)
  if (entering || battle || leaving || !loaded) return
  self?.held.clear()
  playBattleMusic()
  // **The battle's lighting slot is the clock's as it is asked for** — the
  // request's `+5`, which touching a roamer (`0x02196bbc`) and a set battle's
  // trigger (`0x0206fc5c`) both take from `LightingManager +0x98` — and every
  // battle draws by it with no blend (`DrawBackgroundGradient`,
  // `GetCurrentAdvancedLightingValues`), whatever the clock does after.
  askedSlot = LIGHTING_SLOT[timeNow()]
  entering = { since: performance.now(), begin: () => openFight(codes, canFlee, opening) }
}

/** Set a battle up, in the black the swirl leaves — see {@link startFight}. */
function openFight(codes: readonly string[], canFlee: boolean, opening: Opening = 'even'): void {
  if (!loaded || !self || !cartridge) return
  const levels = levelsFor(leader())
  if (!levels) {
    status('the level table did not load, so the Hero has no numbers to fight with')
    return
  }
  const row = standing(levels, expOf(leader()), leader().gains).level
  const foes: Fighter[] = []
  const names: Named[] = []
  const looks: (MonsterLook | undefined)[] = []
  // The monsters' own spells, by action, for the telling; an item's is named as the item.
  const known = new Map<number, Told>()
  const items = new Map(
    [...loaded.itemWords.values()].map((w) => [
      w.singular,
      { name: w.singular, plural: w.plural, grammar: w.grammar },
    ]),
  )
  const spellOf = (id: number) => {
    const action = loaded?.actions.get(id)
    return action && foeSpellOf(action, items.get(action.name))
  }
  for (const code of codes) {
    const who = loaded.monsterCodes.get(code)
    const numbers = who ? loaded.monsterBattle.get(who.number) : undefined
    if (!who || !numbers) {
      status(`no monster ${code} in the monster data`)
      return
    }
    names.push({ name: who.name, plural: who.plural, grammar: who.grammar })
    // Its six ways, from its six words — see `foeWaysOf`.
    const ways = foeWaysOf(numbers.actions, spellOf, (id) => loaded?.actions.get(id))
    for (const [action, spell] of ways.known) known.set(action, spell)
    foes.push({
      acts: ways.acts,
      // Which weights it draws its ways by: **the game's own selector**, the
      // record's `aiType` — see `MonsterBattle.aiType` and `WAYS_BY_AI`. Its
      // four other types do not draw by weights at all, and take the even
      // table here: **ours**, and marked so in `docs/still-open.md`.
      ...(loaded.weightTables
        ? { choice: loaded.weightTables.tables[WAYS_BY_AI[numbers.aiType] ?? 0] }
        : {}),
      name: renderName(who.name),
      side: 'foes',
      // **Drawn, the game's way**: four fifths to the whole of its table's HP,
      // from the world's generator and not the battle's — `monsterHp`. A battle
      // that cannot be fled stands in for the game's own flag, which leaves
      // the table's as it is — INFERRED to be a scripted battle's.
      maxHp: monsterHp(roamRng, numbers.maxHp, !canFlee),
      maxMp: numbers.maxMp,
      attack: numbers.attack,
      defence: numbers.defence,
      agility: numbers.agility,
      shield: false,
      // What it takes of each element — its record's own, read as the game reads it.
      resist: numbers.resistances,
      // Its family and body, which the abilities' handlers ask — `mon_data` `+0x0A`.
      family: who.family,
      metal: who.metal,
      // Its level, which its handlers and tension's bonus take — `mon_data` `+0x0A`.
      level: who.level,
      exp: numbers.exp,
      gold: numbers.gold,
      // Which monster it is: what a battle drops goes by the kind — `dropsWon`.
      kind: who.number,
      // What it may drop: its record's two items, each with its chance step —
      // the ordinary and the rare; see `dropOneIn`.
      drops: [
        { item: numbers.drops[0], step: numbers.dropSteps[0] },
        { item: numbers.drops[1], step: numbers.dropSteps[1] },
      ],
      // Its AI — `mon_btldata +0x10`: when it chooses, its actions more a
      // round, its ways once a group, and whether it weighs who struck it.
      aiMode: numbers.aiMode,
      extraRule: numbers.extraRule,
      oncePerGroup: numbers.oncePerGroup,
      remembers: numbers.remembers,
    })
    looks.push(monsterLookOf(cartridge, code))
  }
  const worn = wornNumbers()
  const hero: Fighter = {
    name: heroName(),
    side: 'party',
    maxHp: row.maxHp,
    maxMp: row.maxMp,
    attack: row.strength + worn.attack,
    defence: row.resilience + worn.defence,
    agility: row.agility + worn.agility,
    // The chance of a critical climbs with deftness past 150 — `criticalChance`.
    deftness: row.deftness,
    ...(holdsPanel(leader(), CRITICAL_IN_A_CRISIS) ? { crisisCritical: true } : {}),
    // What the Hero takes of each element: a hundred each, and what is worn
    // added on — the game's own sum (`wornResistances`). Nothing the slice
    // wears carries any, so these are all whole; something later will not be.
    resist: wornResistances(
      [...wornBy(leader()).values()].flatMap((id) => {
        const own = loaded?.itemResistances.get(id)
        return own ? [own] : []
      }),
    ),
    // What a spell's amount may scale by — the level's own; what is worn is not added, ours.
    might: row.magicalMight,
    mending: row.magicalMending,
    shield: wornBy(leader()).has('shield'),
    // The game's: what is worn says, and only behind a shield — `blockChance`.
    block: blockChance(wornBy(leader()).has('shield'), worn.block),
    exp: 0,
    gold: 0,
    // What tension's bonus is made from — see `Fighter.level`.
    level: row.level,
    // What the coup de grâce's draws go by — see `coupFor`.
    coup: coupFor(leader(), row.level),
  }
  // **Everyone after the Hero fights, whatever they are.** A story companion
  // is `attnpc`'s fixed numbers; a created character is their own vocation's
  // level table and what they wear, exactly as the Hero is. Keyed by place
  // rather than by the story companions' compacted list — see `followersNow`.
  const behind = followersNow()
  const party: Fighter[] = [
    hero,
    ...behind.flatMap(({ who, member }) => {
      if (who) return [companionFighter(who, (id) => loaded?.itemStats.get(id))]
      const made = createdFighter(member)
      return made ? [made] : []
    }),
  ]
  battleMembers = [
    leader(),
    ...behind.flatMap(({ who, member }) => (who || createdFighter(member) ? [member] : [])),
  ]
  // Each in the row Line-Up last left them in — see `Member.backLine`.
  for (const [i, member] of battleMembers.entries()) {
    const fighter = party[i]
    if (fighter && member.backLine) party[i] = { ...fighter, backLine: true }
  }
  const hp = new Map([[0, leader().hp ?? row.maxHp]])
  for (const [i, { who, member }] of behind.entries()) {
    const max = who ? who.numbers.maxHp : (levelOf(member)?.maxHp ?? 0)
    hp.set(i + 1, member.hp ?? max)
  }
  battlesFought++
  // **The stage the fight is on**, and everyone's place on it — see `stage.ts`.
  // Without one, the monsters line up on the field ahead of the Hero, as they
  // did before the stages were read: ours.
  battleStage = openStage(codes, party.length)
  // The monsters' places first: on the field, they turn the Hero to face them.
  const foeSpots = battleStage ? battleStage.spots.slice(party.length) : spotsFor(foes.length)
  inOpening = true
  armsKept = 0
  battle = beginBattle([...party, ...foes], BigInt(battlesFought) * 0x9e3779b97f4a7c15n, {
    canFlee,
    opening,
    // A flight is drawn from the world's generator, not the battle's — the
    // game's `GetBTRandom()`; see `fleeChance`.
    world: roamRng,
    hp,
    mp: new Map([[0, leader().mp ?? row.maxMp]]),
    known,
    words: loaded.battleWords,
    names: [
      heroNamed(),
      ...behind.flatMap(({ who, member }) =>
        who ? [companionNamed(who)] : createdFighter(member) ? [{ name: nameFor(member) }] : [],
      ),
      ...names,
    ],
  })
  // The weapon and shield to the Hero's hands — see `dressHero`.
  dressHero()
  // Only the story companions have a `.chr` model to show in a battle. What a
  // created character looks like in one is **not built** — see
  // `docs/party-and-vocations.md`; they fight, and nothing draws them.
  // **Everyone who fights is drawn**, whatever they are: a story companion
  // from their whole `.chr`, a created character from the parts they are
  // assembled out of. Their figure carries the battle motions the cues name —
  // `attack1a`, `damage`, `death` — because it is built the same way the
  // Hero's is.
  battleCompanions = behind.map(({ who }, i): BattleCompanion => {
    const look = who ? companionLook(who) : undefined
    return {
      id: who?.id,
      index: i + 1,
      place: i + 1,
      model: look?.model,
      packs: look?.packs ?? [],
    }
  })
  battleLooks = [...party.map(() => undefined), ...looks]
  battleSpots = battleStage
    ? [undefined, ...battleStage.spots.slice(1, party.length), ...foeSpots]
    : [undefined, ...party.slice(1).map((_, i) => besideHero(i)), ...foeSpots]
  cueStarted = battleClock
  self.held.clear()
  closeTalk()
  menu = undefined
  visit = undefined
  showBattle()
}

/**
 * Where a battle's monsters stand: in a row ahead of the Hero as the camera
 * sees them — away from it, so the Hero stands between — on the ground they
 * stand on. The Hero turns to face them. Ahead of the Hero's own facing put
 * them between the Hero and the camera whenever the Hero faced it.
 */
function spotsFor(count: number): { x: number; y: number; z: number }[] {
  if (!self) return []
  const person = toFloat(PERSON.height) * worldScale
  const ahead = person * 1.6
  const gap = person * 0.9
  const forward = moveRelativeToCamera(camera.yaw, 1, 0)
  const right = moveRelativeToCamera(camera.yaw, 0, 1)
  self.facing = Math.atan2(forward.x, forward.z)
  const hx = toFloat(self.state.x)
  const hz = toFloat(self.state.z)
  const hy = toFloat(self.state.y)
  return Array.from({ length: count }, (_, i) => {
    const side = (i - (count - 1) / 2) * gap
    const x = hx + forward.x * ahead + right.x * side
    const z = hz + forward.z * ahead + right.z * side
    const hit = world
      ? groundBelow(
          world,
          fx32(Math.round(x * FX32_ONE)),
          fx32(Math.round(z * FX32_ONE)),
          fx32(Math.round((hy + person) * FX32_ONE)),
        )
      : undefined
    return { x, y: hit ? toFloat(hit.y) : hy, z }
  })
}

/** Whether the Hero stands in the map's poison marsh — see `inMarsh`. */
function inMarshNow(state: Player['state']): boolean {
  const marsh = loaded?.map.marsh
  if (!marsh || marsh.length === 0) return false
  return inMarsh(
    marsh,
    toFloat(state.x),
    toFloat(state.y),
    toFloat(state.z),
    toFloat(person().height),
  )
}

/**
 * The marsh's toll — see `marsh.ts`, where the rule, ours, is: on everyone in
 * the party, and the status line says so.
 */
function marshToll(): void {
  const row = heroRow()
  if (!row) return
  const hp = afterMarsh(leader().hp ?? row.maxHp)
  leader().hp = hp >= row.maxHp ? undefined : hp
  const told = [`HP ${hp}/${row.maxHp}`]
  for (const who of companionsNow()) {
    const max = who.numbers.maxHp
    const along = memberOf(who.id)
    const left = afterMarsh(along?.hp ?? max)
    if (along) along.hp = left >= max ? undefined : left
    told.push(`${who.name} ${left}/${max}`)
  }
  status(`the poison marsh stings · ${told.join(' · ')}`)
}

/** Who goes along with the Hero now, in their places after them — see `companionsAt`. */
function companionsNow(): readonly AttendingCharacter[] {
  return companionsAt(loaded?.attending ?? [], members)
}

/**
 * Each place after the Hero's, with whoever is in it and their trail.
 *
 * **Not `companionsNow()` indexed**, which would be wrong the moment a
 * created character walks in front of a story one: that list leaves out
 * anybody with no `attnpc` record, so its indices stop matching the trails.
 * They match today because every member after the Hero is a story companion;
 * they would not once the party is made of created characters, and the bug
 * would be somebody wearing the wrong person's footsteps.
 */
function followersNow(): {
  place: number
  index: number
  member: Member
  who: AttendingCharacter | undefined
}[] {
  return members.slice(1).map((member, place) => ({
    place,
    index: place + 1,
    member,
    who:
      member.attnpc === undefined
        ? undefined
        : loaded?.attending.find((one) => one.id === member.attnpc),
  }))
}

/**
 * Whether the map has a companion standing in it — Ivor, waiting in Erinn's
 * house at 2.2 — by the model they share: see `companionModel`. Then they are
 * not with the Hero: not following, and not on the top screen. Ours.
 */
function standingHere(who: AttendingCharacter): boolean {
  const model = companionModel(who)
  return (loaded?.cast.members ?? []).some((member) => member.name === model)
}

/**
 * Those after the Hero in the field, **in the slots' order — the living, then
 * the fallen** (`marchingOrder`, the game's rebuild), each with the trail of
 * the place they walk in. `index` is their place in `members`.
 *
 * **Ours**: the Hero walks first even when fallen, where the game's leader
 * is the first one alive — the walker is the Hero's figure here.
 */
function marchersNow(): ReturnType<typeof followersNow> {
  const behind = followersNow()
  return marchingOrder(behind.map((one) => one.member)).flatMap((member, place) => {
    const one = behind.find((f) => f.member === member)
    return one ? [{ ...one, place }] : []
  })
}

/**
 * Where each companion stands in the field: the one in the line's second
 * place on the Hero's footsteps a pace back, the next a pace further, and so
 * on — see `marchersNow`. None in a battle or an event, which stand them
 * themselves, and none while one stands on the Hero, as all do on arriving
 * until the Hero walks off — **ours**, both. Nor one the map has standing in
 * it — Ivor, waiting in Erinn's house at 2.2 — who is not in two places at
 * once: the same model, see `companionModel`. Ours too.
 */
function companionsInField(): {
  who: AttendingCharacter | undefined
  member: Member
  place: number
  index: number
  x: number
  y: number
  z: number
}[] {
  if (!self || battle || playing) return []
  const hx = toFloat(self.state.x)
  const hz = toFloat(self.state.z)
  const near = toFloat(person().radius) * 2
  return marchersNow().flatMap(({ who, member, place, index }) => {
    const trail = trails[place]
    if (!trail) return []
    // A story companion the map already has standing in it is not drawn twice.
    if (who && standingHere(who)) return []
    const x = toFloat(trail.x)
    const z = toFloat(trail.z)
    if (Math.hypot(x - hx, z - hz) < near) return []
    return [{ who, member, place, index, x, y: toFloat(trail.y), z }]
  })
}

/**
 * Those in the field, each in their own model: their `walk` in step with the
 * Hero's — the same pace over the same ground — or their `stand`.
 */
function companionFieldPieces(now: number): Piece[] {
  const rom = cartridge
  const hero = self
  const here = loaded
  if (!rom || !hero || !here) return []
  return companionsInField().flatMap(({ who, member, place, index, x, y, z }) => {
    const walkingNow = trailWalking[place] === 1
    // **A created character is built from parts, like the Hero**, so they are
    // posed the same way rather than drawn from a whole `.chr` model. This is
    // what a party of four is made of; a story companion keeps their model.
    const built = dressed[index]
    if (built && !who) {
      const name = walkingNow ? 'run' : 'stand'
      const motion = built.figure.motions.get(name)
      // At their own set's speed (`motion-speed.ts`), as the Hero's.
      const speed = motionSpeeds(rom, motionFamilyOf(member)).get(name)
      return playerPieces(
        {
          ...hero,
          state: {
            ...hero.state,
            x: fx32(Math.round(x * FX32_ONE)),
            y: fx32(Math.round(y * FX32_ONE)),
            z: fx32(Math.round(z * FX32_ONE)),
          },
          facing: trailFacing[place] ?? 0,
          motionFrame:
            speed !== undefined
              ? frameAt(now, speed, motion?.frameCount ?? 1, true)
              : walkingNow
                ? hero.motionFrame
                : 0,
        },
        built.figure,
        built.pieces,
        here.catalogue,
        measurements,
        motion,
        buildScale(member),
      )
    }
    if (!who) return []
    const { model } = companionLook(who)
    const look = actorLookOf(rom, model, [])
    if (!look) return []
    const walking = trailWalking[place] === 1
    // Whoever follows runs as the Hero does — see `advanceMotion`.
    const motion = look.motions.get(walking ? 'run' : 'stand') ?? look.motions.get('stand')
    const length = Math.max(1, motion ? loopFrames(motion) : 1)
    // At their own speed, every 17 ms (`motion-speed.ts`); without one, as before.
    const speed = look.speeds.get(walking ? 'run' : 'stand')
    const frame =
      speed !== undefined
        ? frameAt(now, speed, motion?.frameCount ?? 1, true)
        : walking
          ? Math.floor(hero.motionFrame) % length
          : Math.floor((now / 1000) * MAP_FPS) % length
    const placement = {
      id: -1 - place,
      map: 0,
      x,
      y,
      z,
      facing: trailFacing[place] ?? 0,
      offset: 0,
    } as NpcPlacement
    return castPieces(
      { name: model, model: look.model, motion, floor: look.floor, placement },
      look.catalogue,
      characterScale,
      frame,
    )
  })
}

/**
 * Where each place after the Hero stands in a battle, as `[ahead, across]` in
 * steps of the gap: to the Hero's right as the camera sees them, then their
 * left, then behind. **Ours**: the game's battle places are in its code.
 */
const BESIDE_HERO: readonly (readonly [number, number])[] = [
  [0, 1],
  [0, -1],
  [-1, 0],
]

/** Where a companion stands in a battle, by their place after the Hero, facing the monsters — see {@link BESIDE_HERO}. */
function besideHero(place: number): { x: number; y: number; z: number } | undefined {
  if (!self) return undefined
  const [ahead, across] = BESIDE_HERO[place] ?? [-1 - place, 0]
  const person = toFloat(PERSON.height) * worldScale
  const forward = moveRelativeToCamera(camera.yaw, 1, 0)
  const right = moveRelativeToCamera(camera.yaw, 0, 1)
  const gap = person * 0.9
  const x = toFloat(self.state.x) + (forward.x * ahead + right.x * across) * gap
  const z = toFloat(self.state.z) + (forward.z * ahead + right.z * across) * gap
  const hy = toFloat(self.state.y)
  const hit = world
    ? groundBelow(
        world,
        fx32(Math.round(x * FX32_ONE)),
        fx32(Math.round(z * FX32_ONE)),
        fx32(Math.round((hy + person) * FX32_ONE)),
      )
    : undefined
  return { x, y: hit ? toFloat(hit.y) : hy, z }
}

/**
 * **The stage a battle starting here is fought on**, loaded and placed with
 * its origin where the Hero stands — see `stage.ts`: a set battle's own, or
 * the one the ground under the Hero names, or 30116. Its camera opens on the
 * monsters, as the game's opening does (`func_ov000_0216118c`). Undefined
 * when there is nowhere to stand or the stage's models will not read.
 */
function openStage(codes: readonly string[], partyCount: number): BattleStage | undefined {
  if (!loaded || !self || !cartridge) return undefined
  const here = loaded
  const hit = world
    ? groundBelow(world, self.state.x, self.state.z, fx32(self.state.y + FX32_ONE))
    : undefined
  const record = hit ? recordOfTriangle(worldMeshes, hit.triangle) : undefined
  const set = eventFight ? loaded.eventBattles.get(eventFight.index)?.stage : undefined
  const id = stageToFight(
    record ? stageOfRecord(record) : undefined,
    set,
    (stage) => here.mapCodeOf(stage) !== undefined,
  )
  const code = loaded.mapCodeOf(id)
  const map = code ? stageMap(cartridge, code, wantedLighting) : undefined
  if (!code || !map) return undefined
  const origin = { x: toFloat(self.state.x), y: toFloat(self.state.y), z: toFloat(self.state.z) }
  // **Ours**: the stage is drawn in the field's own space, with its axes the
  // field's, so that the Hero's place in the field is left alone.
  const pieces: Piece[] = []
  for (const piece of map.pieces) {
    const { model } = piece
    const place = {
      x: origin.x + piece.place.x * worldScale,
      y: origin.y + piece.place.y * worldScale,
      z: origin.z + piece.place.z * worldScale,
    }
    model.shapes.forEach((shape, index) => {
      const geometry = placeGeometry(
        poseGeometry(model.geometry(shape), model.shapeMatrices[index] ?? model.matrices),
        place,
        piece.scale * worldScale,
      )
      const materialIndex = model.shapeMaterials[index]
      const material = materialIndex === undefined ? undefined : model.materials[materialIndex]
      const texture = material ? textureFor(here.catalogue, material) : undefined
      // **A polygon's own alpha**, the material's `POLYGON_ATTR` — the stage's
      // fog is 11 and 14 of 31, its sky 28, the gradient behind showing
      // through (see `stageBackdrop`). **Ours**: 0, a wireframe on the
      // hardware, is drawn solid.
      const alpha = material?.alpha ?? 31
      const opacity = alpha > 0 && alpha < 31 ? { opacity: alpha / 31 } : {}
      pieces.push(texture ? { geometry, ...texture, ...opacity } : { geometry, ...opacity })
    })
  }
  const bodies = codes.map((c) => {
    const who = here.monsterCodes.get(c)
    return {
      kind: who?.number ?? 0,
      radius: who?.radius ?? 0,
      height: who?.height ?? 0,
      size: who?.size ?? 4096,
    }
  })
  const shot = sideShot(1, monsterExtent(bodies), true)
  const end = orbitOf(shot)
  // **On the grid**, where the set-up leaves everyone (`0x02167dd8`); an
  // action's script moves them to their rows and back (overlay 25,
  // `func_ov025_021e6cf4`), not read when. The shot is fitted to the rows.
  const grow = (WORLD_SCALE * worldScale) / FX32_ONE
  const places = [
    ...placesOf(PARTY_SLOTS, partyCount).map((p) => ({ ...p, facing: PARTY_FACING })),
    ...placesOf(MONSTER_SLOTS, codes.length).map((p) => ({ ...p, facing: MONSTER_FACING })),
  ]
  const spots = places.map((place) => ({
    x: origin.x + place.x * grow,
    y: origin.y + FIGHTER_HEIGHT * grow,
    z: origin.z + place.z * grow,
    facing: place.facing / 4096,
  }))
  return {
    id,
    code,
    origin,
    pieces,
    lighting: mapLighting(cartridge, code),
    slot: askedSlot,
    spots,
    places: places.map((p) => ({ x: p.x / FX32_ONE, z: p.z / FX32_ONE, facing: p.facing / 4096 })),
    heights: [
      // **Ours**: a party member's height in battle is not read; the figure's own is taken.
      ...places.slice(0, partyCount).map(() => toFloat(PERSON.height) / WORLD_SCALE),
      ...bodies.map((b) => b.height / FX32_ONE),
    ],
    // A monster's size, its record's (`func_02048588`); 1.0 for anyone else,
    // which `func_02048614` sets and nothing changes.
    sizes: [...places.slice(0, partyCount).map(() => 1), ...bodies.map((b) => b.size / 4096)],
    radii: [
      // **Ours**: a party member's radius in battle is not read.
      ...places.slice(0, partyCount).map(() => PARTY_RADIUS),
      ...bodies.map((b) => b.radius / FX32_ONE),
    ],
    rows: [
      ...partyRow(partyCount).map((p) => ({
        x: p.x / FX32_ONE,
        z: p.z / FX32_ONE,
        facing: p.facing / 4096,
      })),
      ...monsterRow(bodies).map((p) => ({
        x: p.x / FX32_ONE,
        z: p.z / FX32_ONE,
        facing: p.facing / 4096,
      })),
    ],
    bodies,
    commandShot: { target: shot.target, orbit: end, pull: 0 },
    commandHalfFov: shot.halfFov,
    commandEyeZ: shot.eye[2],
    unchased: 0,
    draws: 0,
    view: { target: shot.target, orbit: openingStart(end), pull: 0 },
    halfFov: shot.halfFov,
    easing: end,
    opened: false,
    showing: 'opening',
    carry: 0,
  }
}

/**
 * **The sky behind a stage**: its lighting's gradient for the time of day,
 * the horizon on the row the camera puts it — see `backdrop.ts`. None for a
 * stage without lighting, or with none for the slot.
 */
function stageBackdrop(stage: BattleStage, fov: number | undefined): Backdrop | undefined {
  const slot = stage.lighting?.slots.get(stage.slot)
  if (!slot || fov === undefined) return undefined
  const row = horizonRow(camera.pitch, fov / 2, stage.lighting?.gradientCentreOffset ?? 0)
  return gradientOf(slot, row)
}

/**
 * What a frame draws while a battle is on a stage: the stage, and on it the
 * party and the monsters, each with its round shadow. Nothing of the field.
 */
function stageDrawn(stage: BattleStage, now: number): Piece[] {
  if (!loaded || !self) return []
  const here = loaded
  const at = fighterNow(0, now) ?? stage.spots[0]
  if (!at) return [...stage.pieces]
  const hero = {
    ...self,
    state: {
      ...self.state,
      x: fx32(Math.round(at.x * FX32_ONE)),
      y: fx32(Math.round(at.y * FX32_ONE)),
      z: fx32(Math.round(at.z * FX32_ONE)),
    },
    facing: at.facing,
  }
  // While commands are chosen the party is hidden and the monsters shown
  // (overlay 26, `0x021d9018`–`0x021d9034`).
  const hideParty = commanding()
  const standing = battle
    ? battleSpots.flatMap((spot, i) => {
        const fighter = battle?.state.fighters[i]
        if (hideParty && fighter?.side === 'party') return []
        const here = fighterNow(i, now) ?? spot
        return here && spot && fighter && fighter.hp > 0 && !fighter.fled
          ? [{ ...here, scale: stage.sizes[i] ?? 1 }]
          : []
      })
    : []
  return [
    // The stage, unless an action's `106 0` hides it.
    ...(shown?.run.stageShown === false ? [] : stage.pieces),
    ...(here.shadow
      ? shadowPieces(here.shadow, hideParty ? standing : [at, ...standing], (material) =>
          textureFor(here.catalogue, material),
        )
      : []),
    ...foePieces(now),
    ...(hideParty ? [] : companionPieces(now)),
    ...(hideParty ? [] : heroInBattle(hero, now)),
    ...shownEffectPieces(),
  ]
}

/**
 * **The effects the action on show plays** — see `action-player.ts`: each
 * drawn on its host, at the host's place turned by its facing and at its
 * scale times its own (`func_02057ab8`), or free on the stage at its own
 * scale, where `0x10a` is a fighter's. **Not drawn**: the screen-fixed ones
 * of the later pass, whose projection is not read; a particle effect's
 * (`.beff`), whose format is not read.
 */
function shownEffectPieces(): Piece[] {
  const s = shown
  const stage = battleStage
  if (!s || !stage) return []
  const grow = WORLD_SCALE * worldScale
  const out: Piece[] = []
  for (const e of s.run.effects) {
    if (!e || e.overlay) continue
    const host = e.host === undefined ? undefined : s.run.fighters.get(e.host)
    let x: number
    let y: number
    let z: number
    let facing: number
    let scale: number
    if (host) {
      const [ox, oy, oz] = e.offset
      const c = Math.cos(host.facing)
      const n = Math.sin(host.facing)
      x = host.x + ox * c + oz * n
      z = host.z - ox * n + oz * c
      y = oy
      facing = host.facing + e.turn
      scale = e.scale
    } else {
      ;[x, y, z] = e.offset
      facing = e.turn
      scale = e.scale / LOOSE_SCALE
    }
    out.push(
      ...effectPieces(
        { file: e.file, motion: e.motion },
        {
          x: stage.origin.x + x * grow,
          y: stage.origin.y + (FIGHTER_HEIGHT / FX32_ONE + y) * grow,
          z: stage.origin.z + z * grow,
          facing,
        },
        e.at,
        0,
        scale,
        (e.flags & 1) === 0,
      ),
    )
  }
  return out
}

/** An effect played `ms` in at a fighter's place and facing, raised by `raise`; nothing once it is through. */
function effectPieces(
  effect: { readonly file: string; readonly motion: string | undefined },
  at: { readonly x: number; readonly y: number; readonly z: number; readonly facing: number },
  ms: number,
  raise: number,
  scale = 1,
  loops = false,
): Piece[] {
  const rom = cartridge
  const look = rom ? actorLookOf(rom, effect.file, []) : undefined
  if (!look) return []
  const motion =
    (effect.motion !== undefined ? look.motions.get(effect.motion) : undefined) ??
    [...look.motions.values()][0]
  const speed =
    (effect.motion !== undefined ? look.speeds.get(effect.motion) : undefined) ??
    [...look.speeds.values()][0]
  const frames = motion?.frameCount ?? 1
  if (!loops && ms > motionMs(speed, frames)) return []
  const placement = {
    id: -1,
    map: 0,
    x: at.x,
    y: at.y + raise,
    z: at.z,
    facing: at.facing,
    offset: 0,
  } as NpcPlacement
  const frame = frameAt(ms, speed, frames, loops)
  return castPieces(
    { name: effect.file, model: look.model, motion, floor: 0, placement },
    look.catalogue,
    characterScale * scale,
    frame,
    effectShade(look, Math.floor(frame)),
  )
}

/** A texture a pattern animation swaps in, decoded once — see {@link materialShade}. */
function patternTexture(
  model: Model,
  catalogue: Pick<Catalogue, 'textures'>,
  material: string | undefined,
  texture: string,
  palette: string | undefined,
): { readonly pixels: Uint8Array; readonly width: number; readonly height: number } | undefined {
  let byKey = patternsDecoded.get(model)
  if (!byKey) {
    byKey = new Map()
    patternsDecoded.set(model, byKey)
  }
  const key = `${material}|${texture}|${palette}`
  if (byKey.has(key)) return byKey.get(key)
  const own = model.materials.find((m) => m.name === material)
  const decoded = own
    ? textureFor(catalogue, { ...own, texture, palette: palette ?? own.palette })
    : undefined
  byKey.set(key, decoded)
  return decoded
}
const patternsDecoded = new WeakMap<
  Model,
  Map<
    string,
    { readonly pixels: Uint8Array; readonly width: number; readonly height: number } | undefined
  >
>()

/** An effect's materials at a frame of its motion, played once — see {@link materialShade}. */
function effectShade(
  look: ActorLook,
  frame: number,
): ((material: string | undefined, piece: Piece) => Piece | undefined) | undefined {
  return materialShade(look, look.model, look.catalogue, frame, false)
}

/**
 * **A model's materials at a frame**, from its own animations: the texture
 * its pattern animation names (NSBTP, `MPTAnimationProcessingCallback`); the
 * material's alpha and diffuse (NSBMA); its texture scaled and slid as the
 * game's texture matrix does it (NSBTA, `CreateTextureMatrix_v0_TranslateScale`,
 * `RenderCommandProcs.cpp`) — s′ = sₛ·s − w·sₛ·tₛ and
 * t′ = sₜ·t + h·(1 − sₜ) + h·sₜ·tₜ, in texels. Looping, each by its own frame
 * count — a map's; or once — an effect's. INFERRED: that an alpha of 0 shows
 * nothing — GBATEK makes it a wireframe. **Ours**: a texture's rotation is not
 * applied; the effects read have none.
 */
function materialShade(
  anims: {
    readonly texAnim: TextureAnimation | undefined
    readonly matAnim: MaterialAnimation | undefined
    readonly patAnim: PatternAnimation | undefined
  },
  model: Model,
  catalogue: Pick<Catalogue, 'textures'>,
  frame: number,
  loop: boolean,
): ((material: string | undefined, piece: Piece) => Piece | undefined) | undefined {
  const { texAnim, matAnim, patAnim } = anims
  if (!texAnim && !matAnim && !patAnim) return undefined
  const at = (count: number | undefined) =>
    loop && count !== undefined && count > 0 ? frame % count : frame
  return (material, piece) => {
    let out = piece
    const swaps = patAnim?.tracks.find((t) => t.material === material)
    const key = swaps ? patternAt(swaps, at(patAnim?.frameCount)) : undefined
    if (key) {
      const swapped = patternTexture(model, catalogue, material, key.texture, key.palette)
      if (swapped) {
        out = { ...out, pixels: swapped.pixels, width: swapped.width, height: swapped.height }
      }
    }
    const colours = matAnim?.tracks.find((t) => t.material === material)
    if (colours) {
      const now = sampleMatTrack(colours, at(matAnim?.frameCount))
      if (now.alpha === 0) return undefined
      const channel = (shift: number) => ((now.diffuse >> shift) & 31) / 31
      out = {
        ...out,
        tint: [channel(0), channel(5), channel(10)],
        ...(now.alpha < 31 ? { opacity: now.alpha / 31 } : {}),
      }
    }
    const moves = texAnim?.tracks.find((t) => t.material === material)
    if (moves && out.width && out.height) {
      const t = sampleTexTrack(moves, at(texAnim?.frameCount))
      const [sS, sT, tS, tT] = [t.scaleS, t.scaleT, t.translateS, t.translateT].map((v) => v / 4096)
      const w = out.width
      const h = out.height
      const vertices = out.geometry.vertices.map((v) => ({
        ...v,
        s: (sS as number) * v.s - w * (sS as number) * (tS as number),
        t: (sT as number) * v.t + h * (1 - (sT as number)) + h * (sT as number) * (tT as number),
      }))
      out = { ...out, geometry: { ...out.geometry, vertices } }
    }
    return out
  }
}

/**
 * **The Hero in a fight**, playing what the page on show has them do — as
 * the companions do (`COMPANION_MOTIONS`), from the Hero's own figure. A blow
 * is the Hero's action script's (`mp0200.bact`): `attack1b`, and from its
 * half-way `attack1a` — INFERRED, that its `26 7 0.5` waits for the first
 * motion to be half through. Otherwise `damage`, `death` once fallen and told
 * of, and `stand`. Each played once through and held on its last frame.
 */
function heroInBattle(hero: Player, now: number): Piece[] {
  if (!loaded) return []
  const scene = battle
  const fighter = scene?.state.fighters[0]
  const onShow = scene?.phase === 'telling' ? (scene.cues[0] ?? []) : []
  const cue = onShow.find((c) => c.fighter === 0)
  const toldOf = !scene?.cues.some((cues) =>
    cues.some((c) => c.fighter === 0 && c.motion === 'death'),
  )
  const lying = (fighter !== undefined && fighter.hp <= 0 && toldOf) || fallenShown.has(0)
  const motions = loaded.figure.motions
  const speeds = speedsOfFighter(0)
  const forced = params.get('heromotion')
  const staged = fighterNow(0, now)
  if (staged && !staged.visible) return []
  let name = 'stand'
  let ms = now
  let loops = LOOPS.has(name)
  if (forced) name = forced
  else if (staged?.motion) {
    // On a stage, what the action on show has the Hero play — see `action-player.ts`.
    name = staged.motion
    ms = staged.ms
    loops = staged.loops
  } else if (cue?.motion === 'attack') {
    // Off a stage: `attack1b`, then `attack1a` from its half-way.
    const windUp = motionMs(speeds.get('attack1b'), motions.get('attack1b')?.frameCount ?? 2) / 2
    const since = now - cueStarted
    name = since < windUp ? 'attack1b' : 'attack1a'
    ms = since < windUp ? since : since - windUp
  } else if (cue) {
    name = COMPANION_MOTIONS[cue.motion]
    ms = LOOPS.has(name) ? now : now - cueStarted
  } else if (lying) {
    name = COMPANION_MOTIONS.death
    ms = Number.POSITIVE_INFINITY
  }
  if (!staged?.motion) loops = LOOPS.has(name)
  const motion = motions.get(name) ?? motions.get('stand')
  const frame = frameAt(ms, speeds.get(name), motion?.frameCount ?? 1, forced !== null || loops)
  return asShown(
    playerPieces(
      { ...hero, motionFrame: frame },
      loaded.figure,
      loaded.pieces,
      loaded.catalogue,
      measurements,
      motion,
      undefined,
      staged?.motion ? priorPose(staged.blend, motions, speeds) : undefined,
    ),
    staged,
  )
}

/**
 * **The battle's clock**, ms: what every motion, blow and shot in a fight is
 * timed by. It runs with the frame's time, as the game's own does — a motion
 * advances by the time the game's clock hands it (`motion-speed.ts`) — and
 * slower while the game's speed is turned down.
 */
let battleClock = 0

/** How fast the battle's clock runs now: the action on show's game speed, slowed through a hit-stop (`116`), else 1. */
function battleSpeed(): number {
  return shown?.run.speed ?? 1
}

/** The combo display's state — see `battle-combo.ts`. */
let combo: Combo = { ...NO_COMBO }

/** The numbers rising over the fighters — see `battle-numbers.ts`. */
let risingNumbers: RisingNumber[] = []
/** The page whose numbers have been put up, before and after its blow lands. */
let numberedPage = -1
let numbersCarry = 0
const numbersEl = must<HTMLCanvasElement>('#numbers')
/** Each sheet's frames, drawn once to a canvas each. */
const numberFrames = new Map<string, HTMLCanvasElement[]>()
/** Scratch for projecting a point, kept rather than made a frame. */
const numberView = new Float32Array(16)
const numberProjection = new Float32Array(16)

/** A sheet's frame as a picture, read from `btarc.nsarc` once. */
function numberFrameOf(sheet: string, frame: number): HTMLCanvasElement | undefined {
  let frames = numberFrames.get(sheet)
  if (!frames) {
    frames = []
    const bytes = cartridge ? battleSheets(cartridge).get(sheet) : undefined
    if (bytes) {
      try {
        const sprite = readSprite(bytes)
        for (let i = 0; i < sprite.frames; i++) {
          const decoded = sprite.decode(i)
          const picture = document.createElement('canvas')
          picture.width = decoded.width
          picture.height = decoded.height
          picture
            .getContext('2d')
            ?.putImageData(
              new ImageData(new Uint8ClampedArray(decoded.pixels), decoded.width, decoded.height),
              0,
              0,
            )
          frames.push(picture)
        }
      } catch {
        // A sheet that will not read shows no numbers.
      }
    }
    numberFrames.set(sheet, frames)
  }
  return frames[frame]
}

/** The top of a fighter as drawn: its place, raised by its height. */
function topOf(i: number, now: number): readonly [number, number, number] | undefined {
  const stage = battleStage
  const at = fighterNow(i, now)
  if (stage && at) {
    const grow = WORLD_SCALE * worldScale
    return [at.x, at.y + (stage.heights[i] ?? 1) * grow, at.z]
  }
  const spot =
    i === 0 && self
      ? { x: toFloat(self.state.x), y: toFloat(self.state.y), z: toFloat(self.state.z) }
      : battleSpots[i]
  return spot ? [spot.x, spot.y + toFloat(PERSON.height) * worldScale, spot.z] : undefined
}

/**
 * **Put the page's numbers up**: each amount a cue carries, over whom it is
 * about — damage in orange, recovery in green. A blow's over the one struck
 * as it lands (the reaction record, at 61% of the blow); the rest as their
 * page opens, **ours**, their scripts not played. A second number over the
 * same fighter in a page takes the next offset.
 */
function raiseNumbers(now: number): void {
  const scene = battle
  // An action on show puts its own numbers up as each result is shown — see `action-reactions.ts`.
  if (scene?.phase !== 'telling' || shown) return
  const cues = scene.cues[0] ?? []
  const hits = new Map<number, number>()
  const raise = (fighter: number, amount: number, kind: NumberKind) => {
    const at = topOf(fighter, now)
    const hit = hits.get(fighter) ?? 0
    hits.set(fighter, hit + 1)
    const number = at ? risingNumber(amount, kind, at, hit) : undefined
    if (number) risingNumbers = [...risingNumbers, number].slice(-16)
  }
  for (const cue of cues) {
    if (cue.amount === undefined) continue
    if (numberedPage !== cueStarted) raise(cue.fighter, cue.amount, cue.motion === 'heal' ? 2 : 0)
  }
  numberedPage = cueStarted
}

/**
 * **Draw the rising numbers** over the 3D view, each at its fighter's top as
 * the camera sees it, in the DS's own pixels — the view always holds the DS's
 * frame, so a DS pixel is the view's height over 192 (its width over 256 in a
 * view taller than 4:3). Their frames go at 60 a second: ours, the battle
 * loop's own rate not read.
 */
function drawNumbers(now: number, elapsedMs: number, fov: number | undefined): void {
  const width = Math.max(1, Math.floor(numbersEl.clientWidth * devicePixelRatio))
  const height = Math.max(1, Math.floor(numbersEl.clientHeight * devicePixelRatio))
  if (numbersEl.width !== width || numbersEl.height !== height) {
    numbersEl.width = width
    numbersEl.height = height
  }
  const context = numbersEl.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, width, height)
  if (!battle) {
    risingNumbers = []
    drawTrickBubble(context, width, height, fov)
    return
  }
  raiseNumbers(now)
  const aspect = width / height
  perspective(aspect, 0.01, 1000, numberProjection, fov)
  viewMatrix(camera, numberView)
  const unit = aspect >= 256 / 192 ? height / 192 : width / 256
  numbersCarry = Math.min(numbersCarry + elapsedMs, TICK_MS * 8)
  while (numbersCarry >= TICK_MS) {
    numbersCarry -= TICK_MS
    risingNumbers = risingNumbers.flatMap((n) => numberFrame(n) ?? [])
    tickCombo(combo)
    // The chooser's marker bobs: a phase of 0.1 a frame, round at 6.28 (`0x021de17c`).
    markerPhase = (markerPhase + 0.1) % 6.28
    // Each, on its first showing frame, nudged clear of the rest — see `nudged`.
    if (risingNumbers.some((n) => n.timer === NUDGE_AT)) {
      const screen = risingNumbers.map((n) => onScreen(n.at, width, height, unit))
      risingNumbers = risingNumbers.map((n, i) =>
        n.timer === NUDGE_AT ? (nudged(risingNumbers, i, screen) ?? n) : n,
      )
    }
  }
  context.imageSmoothingEnabled = false
  // The combo display, in the corner, over the numbers — see `battle-combo.ts`.
  for (const piece of comboPieces(combo)) {
    const picture = numberFrameOf(piece.sheet, 0)
    if (!picture) continue
    context.globalAlpha = piece.alpha / 31
    context.drawImage(
      picture,
      width / 2 + (piece.x - 128) * unit,
      height / 2 + (piece.y - 96) * unit,
      picture.width * unit,
      picture.height * unit,
    )
  }
  context.globalAlpha = 1
  drawTargetMarkers(context, width, height, unit, now)
  if (risingNumbers.length === 0) return
  for (const number of risingNumbers) {
    const point = onScreen(number.at, width, height, unit)
    if (!point) continue
    for (const sprite of numberSprites(number, point.x, point.y)) {
      const picture = numberFrameOf(sprite.sheet, sprite.frame)
      if (!picture) continue
      context.globalAlpha = sprite.alpha / 31
      context.drawImage(
        picture,
        width / 2 + (sprite.x - 128) * unit,
        height / 2 + (sprite.y - 96) * unit,
        picture.width * sprite.scale * unit,
        picture.height * sprite.scale * unit,
      )
    }
  }
  context.globalAlpha = 1
}

/**
 * **A trick's bubble** over the Hero's head while it plays (`func_0205337c`):
 * their place raised 1.7 (`0x1B33`), as the camera sees it, the picture's
 * top left at `bubbleOffset` from there — on the DS's pixels, as the rising
 * numbers are. INFERRED: that the projection's two outputs are x then y.
 */
function drawTrickBubble(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  fov: number | undefined,
): void {
  const trick = performing?.tricks[performing.index]
  if (trick === undefined || !self || !cartridge) return
  const kind = TRICK_BUBBLES.get(trick)
  if (!kind) return
  const name = `sg${String(trick).padStart(2, '0')}${kind === 'words' ? '_en' : ''}`
  const picture = trickBubbleOf(name)
  if (!picture) return
  const aspect = width / height
  perspective(aspect, 0.01, 1000, numberProjection, fov)
  viewMatrix(camera, numberView)
  const unit = aspect >= 256 / 192 ? height / 192 : width / 256
  const raise = BUBBLE_RAISE * WORLD_SCALE * worldScale
  const head = [
    toFloat(self.state.x),
    toFloat(self.state.y) + raise,
    toFloat(self.state.z),
  ] as const
  const point = onScreen(head, width, height, unit)
  if (!point) return
  const offset = bubbleOffset(trick)
  context.imageSmoothingEnabled = false
  context.drawImage(
    picture,
    width / 2 + (point.x + offset.x - 128) * unit,
    height / 2 + (point.y + offset.y - 96) * unit,
    picture.width * unit,
    picture.height * unit,
  )
}

/** How far above a character's feet a trick's bubble rises — 1.7, the game's `0x1B33`. */
const BUBBLE_RAISE = 0x1b33 / 4096

/** The bubbles, by name, decoded once — `data/ani/sg.gp2`. */
const trickBubbles = new Map<string, HTMLCanvasElement | undefined>()
function trickBubbleOf(name: string): HTMLCanvasElement | undefined {
  if (!trickBubbles.has(name)) {
    let picture: HTMLCanvasElement | undefined
    const bytes = cartridge ? trickBubbleSheets(cartridge).get(name) : undefined
    try {
      const decoded = bytes ? readSprite(bytes).decode(0) : undefined
      if (decoded) {
        picture = document.createElement('canvas')
        picture.width = decoded.width
        picture.height = decoded.height
        picture
          .getContext('2d')
          ?.putImageData(
            new ImageData(new Uint8ClampedArray(decoded.pixels), decoded.width, decoded.height),
            0,
            0,
          )
      }
    } catch {
      // A bubble that will not read is not drawn.
    }
    trickBubbles.set(name, picture)
  }
  return trickBubbles.get(name)
}

/** The chooser's marker's phase — see `drawTargetMarkers`. */
let markerPhase = 0

/** The monsters a command is aimed at: one, its group, or all, by its reach. */
function markedBy(command: Command, state: BattleState): number[] {
  const target = 'target' in command ? command.target : -1
  const foes = monsterTargets(state)
  if (command.kind === 'spell') {
    if (command.spell.does !== 'harm') return []
    if (command.spell.reach === 'all') return foes
    const kind = state.fighters[target]?.name
    if (command.spell.reach === 'group') return foes.filter((i) => state.fighters[i]?.name === kind)
  }
  if (command.kind !== 'attack' && command.kind !== 'spell') return []
  return foes.includes(target) ? [target] : []
}

/**
 * **The markers over the monsters aimed at** while commands are chosen —
 * overlay 26's `func_ov026_021dddcc`, drawn on the top screen at each
 * target's place raised by its height (`ConvertWorldToScreen`): the member
 * choosing has `bt_cursor.spr`, 21 px above it, bobbing along (1, 1, 0) by
 * 0.2 × sin of its phase; every other member who has chosen
 * `bt_cursor_oth.spr`, 24 px above. Several on one monster are spread 10 px
 * apart from −5 × the others (`0x021de150`). **Ours**: each marker centred on
 * its point, its picture's own origin not read.
 */
function drawTargetMarkers(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  unit: number,
  now: number,
): void {
  const scene = battle
  const c = scene?.commanding
  if (!scene || !c || scene.phase !== 'command') return
  const marks: { target: number; current: boolean }[] = []
  for (const { command } of c.chosen.values()) {
    for (const target of markedBy(command, scene.state)) marks.push({ target, current: false })
  }
  const step = c.step
  if (step.at === 'monster') {
    const on = monsterTargets(scene.state)[step.cursor]
    if (on !== undefined) {
      const reach = step.pending.aim.reach
      const kind = scene.state.fighters[on]?.name
      const foes = monsterTargets(scene.state)
      const aimed =
        reach === 3
          ? foes
          : reach === 4
            ? foes.filter((i) => scene.state.fighters[i]?.name === kind)
            : [on]
      for (const target of aimed) marks.push({ target, current: true })
    }
  }
  const counts = new Map<number, number>()
  for (const m of marks) counts.set(m.target, (counts.get(m.target) ?? 0) + 1)
  const placed = new Map<number, number>()
  const grow = WORLD_SCALE * worldScale
  for (const m of marks) {
    const top = topOf(m.target, now)
    if (!top) continue
    const bob = m.current ? 0.2 * Math.sin(markerPhase) * Math.SQRT1_2 * grow : 0
    const point = onScreen([top[0] + bob, top[1] + bob, top[2]], width, height, unit)
    if (!point) continue
    const others = (counts.get(m.target) ?? 1) - 1
    const k = placed.get(m.target) ?? 0
    placed.set(m.target, k + 1)
    const dx = -5 * others + 10 * k
    const picture = numberFrameOf(m.current ? 'bt_cursor' : 'bt_cursor_oth', 0)
    if (!picture) continue
    const x = point.x + dx
    const y = point.y - (m.current ? 21 : 24)
    context.drawImage(
      picture,
      width / 2 + (x - 128 - picture.width / 2) * unit,
      height / 2 + (y - 96 - picture.height / 2) * unit,
      picture.width * unit,
      picture.height * unit,
    )
  }
}

/**
 * Where a point falls on the DS's screen, in its pixels, through the view as
 * last set up (`numberView`, `numberProjection`); undefined behind the eye.
 */
function onScreen(
  at: readonly [number, number, number],
  width: number,
  height: number,
  unit: number,
): { readonly x: number; readonly y: number } | undefined {
  const [x, y, z] = at
  const v = numberView
  const p = numberProjection
  const ex = (v[0] as number) * x + (v[4] as number) * y + (v[8] as number) * z + (v[12] as number)
  const ey = (v[1] as number) * x + (v[5] as number) * y + (v[9] as number) * z + (v[13] as number)
  const ez = (v[2] as number) * x + (v[6] as number) * y + (v[10] as number) * z + (v[14] as number)
  const cw =
    (p[3] as number) * ex + (p[7] as number) * ey + (p[11] as number) * ez + (p[15] as number)
  if (cw <= 0) return undefined
  const cx =
    ((p[0] as number) * ex + (p[4] as number) * ey + (p[8] as number) * ez + (p[12] as number)) / cw
  const cy =
    ((p[1] as number) * ex + (p[5] as number) * ey + (p[9] as number) * ez + (p[13] as number)) / cw
  return { x: 128 + (cx * width) / 2 / unit, y: 96 - (cy * height) / 2 / unit }
}

/** A party member's radius on a stage, map units — ours: what the game gives a party member's body is not read. */
const PARTY_RADIUS = 0.5

/** The next of the camera's draws, 0 to 1 — ours: a fixed sequence a battle, not the game's generator. */
function cameraDraw(stage: BattleStage): number {
  stage.draws = (Math.imul(stage.draws, 1103515245) + 12345) >>> 0
  return (stage.draws >>> 8) / 0x1000000
}

/** How many frames a fighter's motion has: a monster's own, the Hero's figure's, a companion's or a member's. */
function motionFramesOf(i: number, name: string): number | undefined {
  const monster = battleLooks[i]
  if (monster) return monster.motions.get(name)?.frameCount
  if (i === 0) return loaded?.figure.motions.get(name)?.frameCount
  const companion = battleCompanions.find((c) => c.index === i)
  if (companion?.model !== undefined && cartridge) {
    return actorLookOf(cartridge, companion.model, companion.packs)?.motions.get(name)?.frameCount
  }
  return dressed[companion?.place ?? -1]?.figure.motions.get(name)?.frameCount
}

/** How long a fighter's motion takes once through, ms, at its own speed; undefined when it has none of that name. */
function motionLengthOf(i: number, name: string): number | undefined {
  const frames = motionFramesOf(i, name)
  return frames === undefined ? undefined : motionMs(speedsOfFighter(i).get(name), frames)
}

/**
 * **A fighter's own action script** — what the battle parses for each as it
 * loads (FORMAT.md, "The action scripts"): a monster's `<code>.bact`, a story
 * companion's in their model (Ivor's `s017b.bact`), a member's motion set's
 * (`mp0201.bact`).
 */
function ownScriptOf(i: number): ActionScript | undefined {
  const monster = battleLooks[i]
  if (monster) return monster.script
  const rom = cartridge
  if (!rom) return undefined
  const companion = battleCompanions.find((c) => c.index === i)
  if (companion?.model !== undefined) {
    return actorLookOf(rom, companion.model, companion.packs)?.script
  }
  const member = members[companion?.place ?? 0] ?? leader()
  return setActionScript(rom, motionFamilyOf(member))
}

/** The motion speeds a fighter plays by: a monster's own, a companion's, a member's set's — see `motion-speed.ts`. */
function speedsOfFighter(i: number): ReadonlyMap<string, number> {
  const monster = battleLooks[i]
  if (monster) return monster.speeds
  const companion = battleCompanions.find((c) => c.index === i)
  if (companion?.model !== undefined && cartridge) {
    return actorLookOf(cartridge, companion.model, companion.packs)?.speeds ?? new Map()
  }
  const member = members[companion?.place ?? 0] ?? leader()
  return cartridge ? motionSpeeds(cartridge, motionFamilyOf(member)) : new Map()
}

/**
 * **The motion a fighter is changing from**, posed as it was left and counting
 * for its weight — see `Blend`, from the action on show: by name among its
 * own motions, at its own speed.
 */
function priorPose(
  blend: Blend | undefined,
  motions: ReadonlyMap<string, Animation>,
  speeds: ReadonlyMap<string, number>,
): PriorMotion | undefined {
  if (!blend || blend.weight <= 0) return undefined
  const motion = motions.get(blend.from)
  if (!motion) return undefined
  const frame = frameAt(blend.at, speeds.get(blend.from), motion.frameCount, blend.loops)
  return { motion, frame: Math.floor(frame), weight: blend.weight }
}

/** Motions that go round rather than play once. */
const LOOPS: ReadonlySet<string> = new Set(['stand', 'run', 'walk'])

/**
 * **The chase shot, as an action without a camera of its own begins**
 * (`ov025 func_021db8d8`, `func_ov000_0216e678`): always taken; its start
 * pose forced on a round's first action, else on the fifth without one, or a
 * draw of one in 5 less those passed. **Ours**: the draws — the camera's own
 * generator here is not traced.
 */
function chaseFor(stage: BattleStage, actor: number, target: number, firstOfRound: boolean): Chase {
  const passed = stage.unchased
  const forced =
    firstOfRound ||
    passed >= 5 ||
    (passed >= 1 && Math.floor(cameraDraw(stage) * (5 - passed)) === 0)
  stage.unchased = forced ? 0 : passed + 1
  return startChase(actor, target, Math.floor(cameraDraw(stage) * 100), forced, cameraDraw(stage))
}

/** The fighter a battle object index is, back from `objectOf`. */
function fighterOf(object: number): number {
  const party = battle?.state.fighters.filter((f) => f.side === 'party').length ?? 1
  return object < MONSTER_BASE ? object : party + (object - MONSTER_BASE)
}

/**
 * **Where a fighter is on the stage now, and what it is doing**: its place,
 * facing, motion and how far into it, as the action on show leaves it; on the
 * grid, standing, when none is. Undefined off a stage.
 */
function fighterNow(
  i: number,
  _now: number,
):
  | {
      readonly x: number
      readonly y: number
      readonly z: number
      readonly facing: number
      /** The motion the action has it play, and how far in, ms; undefined when none does. */
      readonly motion: string | undefined
      readonly ms: number
      readonly loops: boolean
      /** The motion it is changing from, while it counts for some of the pose — see `Blend`. */
      readonly blend: Blend | undefined
      /** 0 to 1, and whether it is seen and drawn untextured. */
      readonly alpha: number
      readonly visible: boolean
      readonly flash: boolean
    }
  | undefined {
  const stage = battleStage
  const place = stage?.places[i]
  const scene = battle
  if (!stage || !place || !scene) return undefined
  const grow = WORLD_SCALE * worldScale
  const world = (at: { x: number; z: number }) => ({
    x: stage.origin.x + at.x * grow,
    y: stage.origin.y + (FIGHTER_HEIGHT / FX32_ONE) * grow,
    z: stage.origin.z + at.z * grow,
  })
  const f = shown?.run.fighters.get(objectOf(scene.state, i))
  if (f) {
    return {
      ...world(f),
      facing: f.facing,
      motion: f.motion,
      ms: f.motionAt,
      loops: (f.motionFlags & 1) === 0,
      blend: f.blend,
      alpha: Math.max(0, Math.min(1, f.alpha / 31)),
      visible: f.visible,
      flash: f.flash > 0,
    }
  }
  return {
    ...world(place),
    facing: place.facing,
    motion: undefined,
    ms: 0,
    loops: true,
    blend: undefined,
    alpha: 1,
    visible: true,
    flash: false,
  }
}

/** Pieces as the action leaves a fighter: faded, or untextured for the moment it is struck. */
function asShown(pieces: Piece[], at: ReturnType<typeof fighterNow>): Piece[] {
  if (!at || (!at.flash && at.alpha >= 1)) return pieces
  return pieces.map((piece) => {
    const { pixels: _pixels, ...plain } = piece
    const out = at.flash ? plain : piece
    return at.alpha < 1 ? { ...out, opacity: (piece.opacity ?? 1) * at.alpha } : out
  })
}

/**
 * **The shot the fight wants now**, once the opening has come in, or
 * undefined to hold the one it has: while a command is chosen, the command
 * camera (`commandView`); while an action is shown, the camera its script
 * moves — see {@link shownView}; between them, where the last left it
 * (`0x021dcbf4`).
 */
function wantedView(
  stage: BattleStage,
  _now: number,
): { key: string; view: BattleView; follow?: boolean; halfFov?: number } | undefined {
  const scene = battle
  if (!scene) return undefined
  const partyCount = scene.state.fighters.filter((f) => f.side === 'party').length
  // `?heromotion=`, for looking at a motion: the camera held on the Hero's close-up. Ours.
  const hero = stage.places[0]
  if (params.get('heromotion') && hero) {
    const view = actorCloseUp(hero, stage.heights[0] ?? 1, true, 0.21, 1.1, CLOSE_UP_HALF_FOV)
    return { key: 'looking at the Hero', view: { ...view, pull: 0 } }
  }
  const standing = stage.places
    .slice(0, partyCount)
    .filter((_, i) => (scene.state.fighters[i]?.hp ?? 0) > 0)
  // **The victory's shot** (`func_ov000_0216e3c4`, from overlay 23's
  // experience step only, `0x021f04b8`), from its lines on.
  if (ending?.kind === 'won') return { key: 'victory', view: victoryView(standing) }
  // **While commands are chosen** (overlay 26, sub-state 3, `0x021d8fd0`):
  // the opening's wide shot, cut to again each round and held still — eased
  // in on round 0 only, which the opening already is. **Ours**: the fixed
  // shots overlay 26 keeps for 47 kinds of monster (`0x021de87c`), not read.
  if (scene.phase !== 'telling' && scene.phase !== 'over') {
    return {
      key: `command ${scene.state.round}`,
      view: stage.commandShot,
      halfFov: stage.commandHalfFov,
    }
  }
  return undefined
}

/** Whether the party's commands are being chosen — the party hidden, the monsters facing the camera. */
const commanding = () =>
  battle !== undefined && battle.phase !== 'telling' && battle.phase !== 'over'

/** The camera's view of the stage while an action is shown — see `battle-camera.ts`. */
const cameraStage: CameraStage = {
  fighter(object) {
    const f = shown?.run.fighters.get(object)
    return f
      ? {
          x: f.x,
          z: f.z,
          facing: f.facing,
          height: f.height,
          radius: f.radius,
          size: f.size,
          party: isPartyObject(object),
        }
      : undefined
  },
  side(party) {
    return [...(shown?.run.fighters.values() ?? [])]
      .filter((f) => isPartyObject(f.index) === party && f.visible && f.state !== 6)
      .map((f) => ({
        x: f.x,
        z: f.z,
        facing: f.facing,
        height: f.height,
        radius: f.radius,
        size: f.size,
        party,
      }))
  },
  extent(party) {
    const stage = battleStage
    const count = battle?.state.fighters.filter((f) => f.side === 'party').length ?? 1
    return party ? partyExtent(count) : monsterExtent(stage?.bodies ?? [])
  },
}

/**
 * **The view while an action is shown**: the chase shot, while the action
 * opened on it and its script has moved no camera; else the camera the script
 * moves, resolved from where its fighter stands now.
 */
function shownView(stage: BattleStage): BattleView | undefined {
  const s = shown
  if (!s) return undefined
  const actor = s.run.hooks.context.actors[0]
  const target = s.run.hooks.context.targets[0]?.receivers[0]
  void stage
  void actor
  void target
  const now = s.chase?.now
  if (now) return { target: now.look, orbit: now.orbit, pull: 0 }
  return cameraView(s.camera, cameraStage)
}

/**
 * **Show the action the page on show tells**, if it tells one and the fight
 * is on a stage: choose its script as the game does (`func_ov025_021dbe10`),
 * stand everyone where the set-up's grid has them, and start it. A death it
 * deals, told on the pages that follow, is shown in it, as the game shows it.
 */
function startShown(): void {
  const scene = battle
  const stage = battleStage
  const rom = cartridge
  shown = undefined
  if (!scene || !stage || !rom || scene.phase !== 'telling') return
  const event = scene.told[0]
  const page = scene.pages[0]
  if (!event || page === undefined) return
  let absorbs = 0
  const defeated = new Map<number, readonly string[]>()
  if (event.kind === 'attack' || event.kind === 'spell') {
    for (;;) {
      const next = scene.told[1 + absorbs]
      if (next?.kind !== 'defeated') break
      defeated.set(next.actor, (scene.pages[1 + absorbs] ?? '').split('\n'))
      absorbs++
    }
  }
  const action = actionOf(event, scene.state, page.split('\n'), {
    itemAction: (item) => loaded?.itemUses.get(item)?.battle?.action,
    defeated,
  })
  if (!action) return
  const { context, results } = action
  const actor = context.actors[0]
  if (actor === undefined) return
  const record = actionRecordOf(rom, context.action)
  const scripts = actionScripts(rom)
  const archive =
    record?.archive === 2
      ? 'spell'
      : (record?.archive === 1 || record?.archive === 4) && isPartyObject(actor)
        ? 'skill'
        : 'other'
  const target = context.targets[0]?.receivers[0]
  const second = lastShown?.actor === actor && lastShown.action === 1 && lastShown.target === target
  const section = scriptFor(
    context.action,
    {
      own: ownScriptOf(fighterOf(actor)),
      skill: scripts.own(archive, context.action),
      fallback: scripts.fallback,
      kind: record?.kind ?? 0,
    },
    second,
  )
  lastShown = { actor, action: context.action, target }
  // A monster's action starts on its own sounds (`0x021e8de4`), which are not read.
  if (!isPartyObject(actor)) ownSounds = undefined
  const fighters: StageFighter[] = scene.state.fighters.flatMap((f, i) => {
    const object = objectOf(scene.state, i)
    const grid = stage.places[i]
    const row = stage.rows[i] ?? grid
    if (!grid || !row || f.fled) return []
    const fallen = fallenShown.has(object)
    if (fallen && !isPartyObject(object)) return []
    return [
      {
        index: object,
        x: grid.x,
        z: grid.z,
        facing: grid.facing,
        radius: stage.radii[i] ?? 0.5,
        height: stage.heights[i] ?? 1,
        size: stage.sizes[i] ?? 1,
        grid,
        row,
        alive: !fallen,
        visible: true,
        motion: fallen ? 'death' : 'stand',
        motionAt: fallen ? Number.POSITIVE_INFINITY : 0,
        // `death` is played once and held (`func_02033ba0`'s flag 1), so it
        // lies at its end; going round, its end would be no frame at all.
        motionFlags: fallen ? 1 : 0,
        ...blendIntoIdle(object, fallen),
        // `+0xb0`: 0x324 a tick, slower for a big monster (`0x021666e8`).
        turnRate: turnRateOf(stage.radii[i] ?? 0) / 4096,
      },
    ]
  })
  let reactions: ReturnType<typeof makeReactions> | undefined
  const run = startAction(
    section?.commands ?? [],
    context,
    fighters,
    {
      motionMs: (object, name) => motionLengthOf(fighterOf(object), name),
      effectMs: (file, motion) => effectLengthOf(file, motion),
    },
    {
      resources: BUILT_IN_EFFECTS,
      makeReactions: (hooks) => {
        reactions = makeReactions(hooks, results, onReaction)
        return reactions
      },
    },
  )
  if (!reactions) return
  // The chase shot, unless the script opens on a camera of its own (`func_ov025_021db8d8`).
  const commands = section?.commands ?? []
  const firstShow = commands.findIndex((c) => c.tag === 61 || c.tag === 7)
  const ownCamera =
    commands.some((c) => c.tag === 34) ||
    commands
      .slice(0, firstShow < 0 ? undefined : firstShow)
      .some((c) => c.tag === 12 && 'mode' in c && c.mode !== 10)
  const firstOfRound = chasedRound !== scene.state.round
  chasedRound = scene.state.round
  const chase =
    !ownCamera && target !== undefined ? chaseFor(stage, actor, target, firstOfRound) : undefined
  const actionName = loaded?.actions.get(context.action)?.name
  const aimed = context.targets.flatMap((t) => t.receivers.slice(0, 1).map(logName))
  log(
    `▶ ${logName(actor)}: ${actionName ? `${actionName} ` : ''}(action ${context.action})` +
      `${aimed.length ? ` at ${aimed.join(', ')}` : ''} · ${chase ? 'chase shot' : 'its own camera'}`,
  )
  logMotions.clear()
  shown = {
    page: cueStarted,
    run,
    reactions,
    camera: cameraFrom(stage.view, stage.halfFov),
    absorbs,
    chase,
    carry: 0,
  }
  // The chase is cut to as the action begins, before its first frame is drawn.
  followShownChase(shown)
}

/** Where each fighter was left by the last action shown — its motion, how far in, and whether it loops. */
const leftIn = new Map<number, { motion: string; at: number; loops: boolean }>()

/**
 * **Back to idle between actions, blended** from the motion the last action
 * left them in. INFERRED: what puts a fighter back to idle as an action begins
 * is not read; the game's idle — mode 0, `func_02033ba0` — is set with flag
 * `0x10`, which blends (see `Blend`), so a fighter's own return to it would.
 */
function blendIntoIdle(object: number, fallen: boolean): { blend?: Blend } {
  const left = fallen ? undefined : leftIn.get(object)
  if (!left || left.motion === 'stand') return {}
  return { blend: { from: left.motion, at: left.at, loops: left.loops, weight: 1, left: BLEND_MS } }
}

/** The round whose first action has been shown — the chase is forced on a round's first. */
let chasedRound = -1

/** A monster's turn rate by its radius (`func_ov000_02166540`, `0x021666e8`), 4096ths a tick. */
function turnRateOf(radius: number): number {
  const r = radius * 4
  return r >= 4 ? 0xc9 : r >= 3 ? 0x10c : r >= 2 ? 0x192 : 0x324
}

/** How long an effect's motion takes once through, ms — its `.bcfg` speed over its frames. */
function effectLengthOf(file: string, motion: string | undefined): number | undefined {
  const rom = cartridge
  const look = rom ? actorLookOf(rom, file, []) : undefined
  if (!look) return undefined
  const animation =
    (motion !== undefined ? look.motions.get(motion) : undefined) ?? [...look.motions.values()][0]
  const speed =
    (motion !== undefined ? look.speeds.get(motion) : undefined) ?? [...look.speeds.values()][0]
  return motionMs(speed, animation?.frameCount ?? 1)
}

/** What the reactions put up: the rising numbers, a close-up before a reaction, the camera's shake. */
function onReaction(event: ReactionEvent): void {
  const s = shown
  if (event.kind === 'number') {
    log(`  number ${event.value} over ${logName(event.fighter)}`)
    const at = topOf(fighterOf(event.fighter), battleClock)
    const number = at ? risingNumber(event.value, event.numberKind, at, event.index) : undefined
    if (number) risingNumbers = [...risingNumbers, number].slice(-16)
    return
  }
  if (event.kind === 'combo') {
    if (startCombo(combo, event.level)) battleSound('battle', COMBO_SOUNDS[event.level] ?? 0)
    return
  }
  if (!s) return
  if (event.kind === 'close-up') {
    playCamera(
      s.camera,
      {
        tag: 12,
        mode: 13,
        variant: 0,
        floats: [0, 0, 1.8],
        actor: event.fighter,
        target: undefined,
      },
      cameraStage,
      () => (battleStage ? cameraDraw(battleStage) : 0),
    )
    s.chase = undefined
    return
  }
  s.camera.shake = { amplitude: event.amplitude, left: event.ms }
}

/**
 * **The sequence archive an action's own sounds are from** (`+0xc4`): what its
 * `69` names — the party's sets say 101 — or a monster's own, set as its
 * action starts from its object's `+0x7a`, which is not read: none, so a
 * monster's own sounds are not played. Ours.
 */
let ownSounds: number | undefined

/** Sound one of the battle's: its own archive's, or the action's. */
function battleSound(from: 'battle' | 'own', sound: number): void {
  const rom = cartridge
  const archive = from === 'battle' ? BATTLE_SOUNDS : ownSounds
  if (!rom || archive === undefined || sound < 0) return
  void playBattleSound(rom, archive, sound)
}

/** What the run asks of the frame: its camera's commands and its sounds; the lights and the screen's brightness are not yet played. */
function onShow(event: ShowEvent): void {
  if (event.kind === 'sound') {
    battleSound(event.from, event.sound)
    return
  }
  if (event.kind === 'start-sound') {
    battleSound('battle', event.sound)
    return
  }
  if (event.kind === 'sound-set') {
    ownSounds = event.archive
    return
  }
  const s = shown
  if (!s || event.kind !== 'camera') return
  const shot = event.command
  log(`  camera: tag ${shot.tag}${'mode' in shot ? ` mode ${shot.mode}` : ''}`)
  playCamera(s.camera, event.command, cameraStage, () =>
    battleStage ? cameraDraw(battleStage) : 0,
  )
  s.chase = undefined
}

/**
 * **Play the action on show** for the frame's time, a pass every
 * {@link PASS_MS} — then, once it has ended, the page it tells and those it
 * took in are done, and the battle goes on.
 */
function stepShown(elapsedMs: number): void {
  const s = shown
  if (!s) return
  s.carry = Math.min(s.carry + elapsedMs, PASS_MS * 8)
  while (s.carry >= PASS_MS && shown === s) {
    s.carry -= PASS_MS
    for (const event of s.run.pass(PASS_MS)) onShow(event)
    for (const line of motionChanges(s.run.fighters.values(), logMotions, logName)) log(`  ${line}`)
    tickCamera(s.camera, PASS_MS * s.run.speed)
    followShownChase(s)
    if (s.run.ended) {
      finishShown()
      return
    }
  }
  const line = s.reactions.line
  if ((line ? line.text.slice(0, line.typed) : '') !== shownText) showBattle()
}

/** One tick of the chase following the pair as they move — see `battle-camera.ts`. */
function followShownChase(s: ActionShown): void {
  const chase = s.chase
  if (!chase) return
  const fighter = (i: number) => {
    const f = s.run.fighters.get(i)
    return f
      ? {
          index: i,
          x: f.x,
          z: f.z,
          facing: f.facing,
          height: f.height,
          radius: f.radius,
          size: f.size,
          party: isPartyObject(i),
        }
      : undefined
  }
  const a = fighter(chase.actor)
  const t = fighter(chase.target)
  // Without both the camera is left on the shot before (`0x0216eaa4`).
  if (!a || !t) return
  followChase(chase, chasePose(a, t, chase, chase.now?.orbit.yaw ?? s.camera.orbit.yaw))
}

/** An action over: its deaths kept, its pages done. */
function finishShown(): void {
  const s = shown
  if (!s) return
  log('■ action over')
  // Its showing over, the combo display goes (`0x021db8ac`).
  leaveCombo(combo)
  for (const f of s.run.fighters.values()) {
    if (f.state === 4 || f.state === 6) fallenShown.add(f.index)
    leftIn.set(f.index, { motion: f.motion, at: f.motionAt, loops: (f.motionFlags & 1) === 0 })
  }
  const stage = battleStage
  if (stage) {
    // The camera stays where the action left it (`0x021dcbf4`) — where the
    // chase had got to, when it was the chase's.
    stage.view = shownView(stage) ?? cameraView(s.camera, cameraStage)
    stage.halfFov = s.camera.halfFov
    stage.showing = `after ${s.page}`
  }
  shown = undefined
  turnPages(1 + s.absorbs)
}

/**
 * **A page opens**: an action's, shown — see `startShown`; any other, up for
 * its lines' time. Once a page, as it first comes up.
 */
function openPage(now: number): void {
  if (battle?.phase !== 'telling' || battle.pages === pagesSeen) return
  const first = pagesSeen === undefined
  pagesSeen = battle.pages
  openResults()
  log(`page: ${(battle.pages[0] ?? '').split('\n').join(' / ') || battle.phase}`)
  startShown()
  // The box says what the action has said so far — nothing yet — not the page.
  if (shown) showBattle()
  const told = battle.told[0]
  const party = told?.kind === 'flee' && battle.state.fighters[told.actor]?.side === 'party'
  // A flight's line comes with sound 9 (state 11).
  if (party) battleSound('battle', 9)
  pageLeft = shown
    ? 0
    : party
      ? FLIGHT_LINE_MS
      : told !== undefined
        ? (battle.pages[0] ?? '').split('\n').length * LINE_MS
        : inOpening
          ? OPENING_LINE_MS + (first ? BATTLE_UP_MS : 0)
          : 0
  if (told === undefined && !inOpening) beginEnding(now)
  if (!shown && pageLeft > 0) log(`  told for ${Math.round(pageLeft)} ms, no action shown`)
}

/** Go on past `n` pages, as confirming them did, and on to what follows. */
function turnPages(n: number): void {
  for (let k = 0; k < n && battle?.phase === 'telling'; k++) {
    battle = battleChoose(battle, battleOffered())
  }
  cueStarted = battleClock
  settleBattle()
  if (battle?.phase === 'over') {
    leaveFight()
    return
  }
  showBattle()
}

/** The half-angle a reset leaves, which the close-ups frame to (`0x0216d370`): 15, a view of 30°. */
const CLOSE_UP_HALF_FOV = 15

/**
 * **Aim the camera as the battle's does**: the opening's shot, eased in from
 * half a unit higher and 3 farther, 5% of what is left a tick — see
 * `easeOrbit`; then the fight's own shots, each a cut — the command camera
 * turning slowly, the close-ups pulling in by 20/4096 a tick — see
 * {@link wantedView}. The eye is never higher than 5 over the stage
 * (`func_ov000_0216f2b8`).
 */
function aimAtBattle(stage: BattleStage, elapsedMs: number): void {
  // While an action is shown, its script moves the camera — see `battle-camera.ts`.
  const acting = shown ? shownView(stage) : undefined
  const roll = shown?.chase?.now?.roll ?? 0
  if (acting && shown) {
    stage.view = acting
    stage.halfFov = shown.camera.halfFov
    stage.easing = undefined
    stage.opened = true
  } else if (stage.opened) {
    const wanted = wantedView(stage, battleClock)
    if (wanted && wanted.key !== stage.showing) {
      stage.showing = wanted.key
      stage.view = wanted.view
      stage.easing = undefined
      // Every shot after the opening follows a reset, which leaves 15 — the wide shot 22.
      stage.halfFov = wanted.halfFov ?? CLOSE_UP_HALF_FOV
    } else if (wanted?.follow) {
      // The chase shot's look-at follows, 5% of the way a frame (`0x0216ea38`).
      const [x, y, z] = stage.view.target
      const [tx, ty, tz] = wanted.view.target
      const k = Math.min(1, (0xcc / 4096) * (elapsedMs / TICK_MS))
      stage.view = {
        ...stage.view,
        target: [x + (tx - x) * k, y + (ty - y) * k, z + (tz - z) * k],
      }
    }
  }
  stage.carry = Math.min(stage.carry + elapsedMs, TICK_MS * 8)
  while (stage.carry >= TICK_MS) {
    stage.carry -= TICK_MS
    if (stage.easing) {
      const next = easeOrbit(stage.view.orbit, stage.easing)
      stage.view = { ...stage.view, orbit: next.orbit }
      if (next.done) {
        stage.easing = undefined
        stage.opened = true
      }
    } else if (!acting) stage.view = pulled(stage.view)
  }
  const grow = WORLD_SCALE * worldScale
  const { target, orbit } = stage.view
  const height = Math.min(orbit.height, EYE_CEILING - (target[1] as number))
  camera.focus = [
    stage.origin.x + (target[0] as number) * grow,
    stage.origin.y + (target[1] as number) * grow,
    stage.origin.z + (target[2] as number) * grow,
  ]
  camera.roll = roll
  camera.yaw = orbit.yaw
  camera.pitch =
    orbit.distance > 0 ? Math.asin(Math.max(-1, Math.min(1, height / orbit.distance))) : 0
  camera.distance = orbit.distance * grow
  camera.actualDistance = camera.distance
  camera.lift = 0
}

/**
 * Whoever stands beside the Hero, in their own model and motions — see
 * `COMPANION_MOTIONS`: playing what the page on show has them do, once
 * through, or their stand; lying where they fell once the page that tells it
 * has been shown.
 */
function companionPieces(now: number): Piece[] {
  return battleCompanions.flatMap((at) => companionPiecesOf(at, now))
}

/** One of those beside the Hero in battle — see {@link companionPieces}. */
function companionPiecesOf(at: BattleCompanion, now: number): Piece[] {
  const scene = battle
  const rom = cartridge
  if (!scene || !rom || !self) return []
  const fighter = scene.state.fighters[at.index]
  // On a stage, where the action on show has them — see `fighterNow`.
  const staged = fighterNow(at.index, now)
  const spot = staged ?? battleSpots[at.index]
  if (!fighter || !spot || (staged && !staged.visible)) return []
  const onShow = scene.phase === 'telling' ? (scene.cues[0] ?? []) : []
  const cue = onShow.find((c) => c.fighter === at.index)
  // Fallen, but not yet told of: still standing.
  const toldOf = !scene.cues.some((cues) =>
    cues.some((c) => c.fighter === at.index && c.motion === 'death'),
  )
  const lying = (fighter.hp <= 0 && toldOf) || fallenShown.has(objectOf(scene.state, at.index))
  const blowName = (_motions: ReadonlyMap<string, unknown>) => staged?.motion
  const cued = cue ? COMPANION_MOTIONS[cue.motion] : lying ? COMPANION_MOTIONS.death : 'stand'
  // Every motion at its own speed — see `motion-speed.ts`.
  const speeds = speedsOfFighter(at.index)
  const frameOf = (name: string, length: number, played: boolean): number =>
    played
      ? frameAt(staged?.ms ?? 0, speeds.get(name), length, staged?.loops ?? false)
      : LOOPS.has(name)
        ? frameAt(now, speeds.get(name), length, true)
        : cue
          ? frameAt(now - cueStarted, speeds.get(name), length, false)
          : frameAt(Number.POSITIVE_INFINITY, speeds.get(name), length, false)

  // **A created character is posed from the parts they are built of.** Their
  // figure carries the same motion names a companion's model does, so the cue
  // above needs no translating — see `dressParty`.
  const built = at.model === undefined ? dressed[at.place] : undefined
  if (built && loaded) {
    const played = blowName(built.figure.motions)
    const name = played ?? cued
    const own = built.figure.motions.get(name) ?? built.figure.motions.get('stand')
    const length = own?.frameCount ?? 1
    const at3 = frameOf(name, length, played !== undefined)
    return asShown(
      playerPieces(
        {
          ...self,
          state: {
            ...self.state,
            x: fx32(Math.round(spot.x * FX32_ONE)),
            y: fx32(Math.round(spot.y * FX32_ONE)),
            z: fx32(Math.round(spot.z * FX32_ONE)),
          },
          facing: staged?.facing ?? self.facing,
          motionFrame: at3,
        },
        built.figure,
        built.pieces,
        loaded.catalogue,
        measurements,
        own,
        buildScale(members[at.place]),
        played ? priorPose(staged?.blend, built.figure.motions, speeds) : undefined,
      ),
      staged,
    )
  }

  const look = at.model === undefined ? undefined : actorLookOf(rom, at.model, at.packs)
  if (!look) return []
  const played = blowName(look.motions)
  const name = played ?? cued
  const motion = look.motions.get(name) ?? look.motions.get('stand')
  const length = motion?.frameCount ?? 1
  const frame = frameOf(name, length, played !== undefined)
  const placement = {
    id: at.index,
    map: 0,
    x: spot.x,
    y: spot.y,
    z: spot.z,
    facing: staged?.facing ?? self.facing,
    offset: 0,
  } as NpcPlacement
  const prior = played ? priorPose(staged?.blend, look.motions, speeds) : undefined
  const member = {
    name: at.model ?? '',
    model: look.model,
    motion,
    floor: look.floor,
    placement,
    ...(prior ? { prior } : {}),
  }
  return asShown(
    [
      ...castPieces(member, look.catalogue, characterScale, frame),
      // What they hold, by their `attnpc` number; a created character reaches
      // here only when they have no figure to pose, which cannot happen.
      ...(loaded && at.id !== undefined
        ? heldPieces(member, heldOf(at.id), loaded.catalogue, characterScale, frame)
        : []),
    ],
    staged,
  )
}

/**
 * What an attending character holds in battle: their weapon and shield in
 * `attnpc` — Ivor's copper sword and pot lid — as parts of the Hero's
 * wardrobe, hung from the forearms as the Hero's are (`CARRY_BONES`); the
 * weapon where `wpnpos.bin` puts its kind in the hands, as `placeWeapon`
 * does for the party. A let's play shows Ivor fighting so.
 */
function heldOf(id: number): { model: Model; bone: string; turn?: Float32Array }[] {
  const who = loaded?.attending.find((w) => w.id === id)
  const wardrobe = loaded?.wardrobe
  if (!who || !wardrobe) return []
  const held: { model: Model; bone: string; turn?: Float32Array }[] = []
  const kind = who.weapon === undefined ? undefined : loaded?.itemKinds.get(who.weapon)?.subtype
  const place = kind === undefined ? undefined : loaded?.weaponPlaces.get(kind)?.hands
  const placedBone = place ? BONE_SLOTS[place.slot] : undefined
  const carried = [
    [
      who.weapon,
      placedBone ?? CARRY_BONES.hands.weapon,
      place && placedBone ? weaponTurn(place) : undefined,
    ],
    [who.shield, CARRY_BONES.hands.shield, undefined],
  ] as const
  for (const [item, bone, turn] of carried) {
    const name = item === undefined ? undefined : partName(item)
    const model = name === undefined ? undefined : wardrobe.parts.get(name)
    if (model) held.push(turn ? { model, bone, turn } : { model, bone })
  }
  return held
}

/** Each cue's motion, by the monster's own motion names — see `monsters.ts`. */
const CUE_MOTIONS = {
  appear: 'appear',
  attack: 'attack0a',
  damage: 'damage',
  death: 'death',
  // Ours: a monster running away stands until its page is told, then is gone.
  flee: 'stand',
  heal: 'stand',
} as const

/**
 * The monsters in the fight, turned to face the Hero: each playing what the
 * page on show has it do — once through, holding the last frame — or its
 * stand. One that has fallen stays until the page that tells of it is gone.
 */
function foePieces(now: number): Piece[] {
  if (!battle || !self) return []
  const scene = battle
  // On a stage each faces as its place has it — see `stage.ts`.
  const facing = self.facing + Math.PI
  const onShow = scene.phase === 'telling' ? (scene.cues[0] ?? []) : []
  return scene.state.fighters.flatMap((fighter, i) => {
    const look = battleLooks[i]
    const at = battleSpots[i]
    if (fighter.side !== 'foes' || !look || !at) return []
    const object = objectOf(scene.state, i)
    const run = shown?.run.fighters.get(object)
    if (shown) {
      // While an action is shown, what it has on the stage: a monster dead and faded is gone.
      if (!run?.visible || run.alpha <= 0) return []
    } else {
      // A monster fallen or fled stays until its page is told, or its death has been shown.
      const going = scene.cues.some((cues) =>
        cues.some((c) => c.fighter === i && (c.motion === 'death' || c.motion === 'flee')),
      )
      if (fallenShown.has(object)) return []
      if ((fighter.hp <= 0 || fighter.fled) && !going) return []
    }
    const cue = onShow.find((c) => c.fighter === i)
    const staged = fighterNow(i, now)
    const played = staged?.motion
    const motion = played ?? (cue ? CUE_MOTIONS[cue.motion] : 'stand')
    const length = look.motions.get(motion)?.frameCount ?? 1
    // At its own speed — see `motion-speed.ts`.
    const speed = look.speeds.get(motion)
    const frame = played
      ? frameAt(staged?.ms ?? 0, speed, length, staged?.loops ?? false)
      : LOOPS.has(motion)
        ? frameAt(now, speed, length, true)
        : frameAt(now - cueStarted, speed, length, false)
    // While commands are chosen, each turned to face the shot's eye (`func_ov026_021daec8`).
    const place = battleStage?.places[i]
    const faced =
      commanding() && place && battleStage
        ? Math.atan2(-place.x, battleStage.commandEyeZ - place.z)
        : (staged?.facing ?? facing)
    const prior = played ? priorPose(staged?.blend, look.motions, look.speeds) : undefined
    return asShown(
      monsterPieces(look, staged ?? at, faced, characterScale, motion, frame, prior),
      staged,
    )
  })
}

/**
 * The middle of the fight — the Hero and where the monsters stand — which the
 * camera follows while a battle lasts. **Ours**: the game's battle camera is in
 * its code.
 */
function battleCentre(): Player['state'] | undefined {
  if (!battle || !self) return undefined
  const spots = battleSpots.filter((s) => s !== undefined)
  if (spots.length === 0) return undefined
  const n = spots.length + 1
  const x = (toFloat(self.state.x) + spots.reduce((sum, s) => sum + s.x, 0)) / n
  const z = (toFloat(self.state.z) + spots.reduce((sum, s) => sum + s.z, 0)) / n
  return { ...self.state, x: fx32(Math.round(x * FX32_ONE)), z: fx32(Math.round(z * FX32_ONE)) }
}

/** The text the message box shows now, so a frame redraws it only when it changes. */
let shownText: string | undefined

/** Draw the battle: the message on show, or the rows to choose from, and the Hero's numbers. */
function showBattle(): void {
  if (!battle) return
  const labels = labelsOf(battle.state)
  // While an action is shown, its line as far as it has been typed — see `action-reactions.ts`.
  const line = shown?.reactions.line
  const text = shown
    ? line
      ? line.text.slice(0, line.typed)
      : ''
    : wipeHeld(performance.now())
      ? ''
      : battle.pages[0]
  shownText = text
  if (battle.phase === 'telling' && text) {
    talkEl.replaceChildren()
    const body = document.createElement('div')
    body.textContent = text
    talkEl.append(body)
    talkEl.hidden = false
  } else {
    talkEl.hidden = true
  }
  // **The bottom screen**, from the game's art — see `battle-screen.ts`; the
  // browser's boxes only where it will not read.
  if (drawBattleBottom()) {
    menuEl.hidden = true
    status(`battle, round ${battle.state.round} · ←↑↓→ choose, f take or go on, Esc back`)
    return
  }
  menuEl.replaceChildren()
  const shownMenu = battleMenu(battle)
  if (shownMenu && shownMenu.rows.length > 0) {
    const commands = document.createElement('div')
    commands.className = shownMenu.columns === 2 ? 'commands grid' : 'commands'
    for (const [index, row] of shownMenu.rows.entries()) {
      const item = document.createElement('div')
      item.textContent =
        typeof row === 'string' ? row : 'right' in row ? `${row.text} ${row.right}` : row.text
      if (typeof row !== 'string' && 'colour' in row) item.style.color = row.colour
      if (index === shownMenu.cursor) item.className = 'chosen'
      commands.append(item)
    }
    menuEl.append(commands)
  }
  const panel = document.createElement('div')
  panel.className = 'panel'
  for (const [i, fighter] of battle.state.fighters.entries()) {
    if (fighter.side !== 'party') continue
    const row = document.createElement('div')
    row.textContent = `${labels[i]} — HP ${fighter.hp}/${fighter.maxHp} · MP ${fighter.mp}/${fighter.maxMp}`
    panel.append(row)
  }
  menuEl.append(panel)
  menuEl.hidden = false
  status(`battle, round ${battle.state.round} · ↑/↓ choose, f take or go on, Esc back`)
}

/** The bottom screen's art, read once a cartridge; null when it will not read. */
let battleScreenArt: BattleScreenArt | null | undefined

/** `str_btl`'s words for the small panel's box: "Waiting...", the statuses, a tactic. */
const PANEL_WORDS = { waiting: 30030, dead: 4, asleep: 3, tactics: 30014 } as const

/** Draw the battle's bottom screen; false where its art will not read. */
function drawBattleBottom(): boolean {
  if (!battle || !cartridge) return false
  if (battleScreenArt === undefined) {
    try {
      battleScreenArt = readBattleScreenArt(cartridge, readNameFont(cartridge))
    } catch {
      battleScreenArt = null
    }
  }
  const context = battleBottomEl.getContext('2d')
  if (!battleScreenArt || !context) return false
  if (resultsShown) {
    const word = (n: number) => {
      const w = loaded?.battleWords?.menu.get(n)
      return w === undefined ? '' : tellBattle(w, {}, new Map()).text
    }
    const attributes = resultsShown.window.kind === 'attributes'
    drawResults(
      context,
      battleScreenArt,
      resultsShown.window,
      {
        title: word(attributes ? 30210 : 30200),
        none: word(30202),
        attributes: Array.from({ length: 9 }, (_, r) => word(30220 + r)),
      },
      performance.now() - resultsShown.since,
    )
  } else drawBottom(context, battleScreenArt, bottomView(battle))
  battleBottomEl.hidden = false
  document.body.classList.add('battle-bottom')
  return true
}

/** What the bottom screen shows of the battle now. */
function bottomView(scene: BattleScene): BottomView {
  const words = loaded?.battleWords
  const word = (n: number) => {
    const w = words?.menu.get(n)
    return w === undefined ? '' : tellBattle(w, {}, new Map()).text
  }
  const c = scene.commanding
  // A help line stands where the step it goes back to stood.
  const step = c?.step.at === 'say' ? c.step.back : c?.step
  // The member whose panel is large: the one being asked — on the party
  // menu, the first to be (`U+0x17c`, set as the round opens).
  const current =
    step && 'member' in step
      ? c?.members[step.member]?.fighter
      : step?.at === 'party' ||
          step?.at === 'misc' ||
          step?.at === 'tactics' ||
          step?.at === 'tactic' ||
          step?.at === 'examine' ||
          step?.at === 'lineUp' ||
          step?.at === 'armsWho'
        ? (c?.members.find((m) => !m.guest && (m.tactic ?? FOLLOW_ORDERS) === FOLLOW_ORDERS)
            ?.fighter ?? 0)
        : undefined
  const labels = labelsOf(scene.state)
  const panels: PanelView[] = scene.state.fighters.flatMap((f, i) => {
    if (f.side !== 'party') return []
    const asked = c?.members.find((m) => m.fighter === i)
    const chosen = c?.chosen.get(i)
    const tactic = c?.tactics.get(i) ?? asked?.tactic ?? FOLLOW_ORDERS
    const status = f.hp <= 0 ? 'dead' : f.states.sleep !== undefined ? 'asleep' : undefined
    const box = status
      ? word(status === 'dead' ? PANEL_WORDS.dead : PANEL_WORDS.asleep)
      : tactic !== FOLLOW_ORDERS
        ? word(PANEL_WORDS.tactics + tactic)
        : chosen
          ? 'word' in chosen.caption
            ? word(chosen.caption.word)
            : chosen.caption.name
          : scene.phase === 'command'
            ? word(PANEL_WORDS.waiting)
            : ''
    return [
      {
        place: i,
        name: labels[i] ?? '',
        hp: f.hp,
        maxHp: f.maxHp,
        mp: f.mp,
        maxMp: f.maxMp,
        large: current === i,
        box,
        chosen: chosen !== undefined,
        status,
      },
    ]
  })
  const menu = battleMenu(scene)
  return { panels, menu: menu && current !== undefined ? menu : undefined }
}

/** What one of a victory's pages opens on the bottom screen — a results window — and sounds. */
interface ResultsSlot {
  readonly window?: ResultsWindow
  readonly jingle?: number
  /**
   * The page may not be turned while the level's jingle sounds — a key then
   * is not taken (sub-state 7's step 7, `0x021f11d8`, read 4 October 2026).
   */
  readonly waitJingle?: boolean
  /** The results window closes — sub-state 8 closes it (`+0x5588`), and nothing after reopens it. */
  readonly closes?: boolean
  /** The skill-point screen opens for this member, by place, and the results wait on it — sub-state 8. */
  readonly skills?: number
}

/** Whether the results wait on the skill-point screen — see `ResultsSlot.skills`. */
let allocating = false

/** The slot of the page up now, if it is one of the victory's. */
function resultsSlotNow(): ResultsSlot | undefined {
  if (!battle || resultsQueue.length === 0) return undefined
  const k = resultsQueue.length - battle.pages.length
  return k >= 0 ? resultsQueue[k] : undefined
}

/**
 * The victory's pages' slots, one a page, as `settleBattle` made them; each
 * is taken up as its page opens (`openPage`). A slot with no window keeps
 * the last one up, as the game keeps it through the gold and the items.
 */
let resultsQueue: readonly ResultsSlot[] = []
/** The results window up, and when it opened. */
let resultsShown: { readonly window: ResultsWindow; readonly since: number } | undefined

/** A level's jingle, `ME_004` (`func_0209c6d8(snd, 0x35)`, `0x021f1010`). */
const LEVEL_JINGLE = 0x35

/** The nine attributes the level-up window lists, Strength to Max. MP (`str_btl` 30220–30228). */
function attributesOf(before: LevelRow, after: LevelRow): { before: number; after: number }[] {
  const pick = (row: LevelRow) => [
    row.strength,
    row.agility,
    row.resilience,
    row.deftness,
    row.charm,
    row.magicalMending,
    row.magicalMight,
    row.maxHp,
    row.maxMp,
  ]
  const was = pick(before)
  return pick(after).map((value, i) => ({ before: was[i] ?? 0, after: value }))
}

/** Take up the slot of the page just opened, if it is one of the victory's. */
function openResults(): void {
  const slot = resultsSlotNow()
  if (!slot) return
  if (slot.closes) resultsShown = undefined
  if (slot.window) resultsShown = { window: slot.window, since: performance.now() }
  if (slot.skills !== undefined) {
    allocating = true
    menu = { ...openMenu(), member: slot.skills, panel: 'skills' }
    showMenu()
  }
  if (slot.jingle !== undefined && cartridge && !params.get('bgm')) {
    void playJingle(cartridge, slot.jingle)
  }
}

/**
 * What a battle comes to, once, as it comes to it: a win pays out experience
 * and gold, and a level reached says what it brought; a loss brings the Hero
 * round with half the gold gone. **The loss is a stand-in**: the game sends
 * the Hero back to a church, which is not done here.
 */
function settleBattle(): void {
  if (!battle || battle.settled || battle.state.outcome === 'ongoing') return
  const hero = battle.state.fighters[0]
  const name = heroName()
  const levels = levelsFor(leader())
  const words = loaded?.battleWords
  const said = (number: number, telling: Telling) => {
    const template = words?.results.get(number)
    return words && template !== undefined
      ? tellBattle(template, telling, words.articles).text
      : undefined
  }
  /** A line of several pages, `<PAGE>` apart, each its own. */
  const saidPages = (number: number, telling: Telling): string[] => {
    const template = words?.results.get(number)
    if (!words || template === undefined) return []
    return template
      .split('<PAGE>')
      .map((part) => tellBattle(part, telling, words.articles).text)
      .filter((page) => page.trim() !== '')
  }
  const lines: string[] = []
  /** What each of a victory's pages opens on the bottom screen, and sounds — see `resultsQueue`. */
  const slots: ResultsSlot[] = []
  if (eventFight) eventFight = { ...eventFight, won: battle.state.outcome === 'won' }
  /** Hit points each companion's level brought, by place — added to their wounds below. */
  const grown = new Map<number, number>()
  if (battle.state.outcome === 'won' && hero && levels) {
    const { exp, gold } = spoils(battle.state)
    bag = take(bag, { gold })
    // **Shared as the game shares it** — see `sharesOf`: by level and rounds
    // taken part in, nothing to one down, each share rounded up.
    const earners = sharesOf(battle.state, exp).filter((s) => s.share > 0)
    // The game's own line: 26, "each party member", when more than one
    // earns, and 25 naming the one otherwise — `func_ov023_021f03a0`, which
    // counts the nonzero shares and chooses at `0x021f07fc`.
    const one = earners.length === 1 ? earners[0] : undefined
    const receives =
      earners.length > 1
        ? said(RESULT_SAYS.eachReceives, {})
        : one
          ? said(RESULT_SAYS.receives, { target: one.named })
          : undefined
    // **The amounts are the window's alone** — see `results-window.ts`:
    // "Experience Earned" opens on the bottom screen with this line, and the
    // game never says lines 6 to 9 in a victory (overlay 23, sub-state 6).
    lines.push(
      receives ?? earners.map((s) => `${s.named.name} gains ${s.share} experience.`).join('\n'),
    )
    slots.push({
      window: {
        kind: 'experience',
        rows: earners.map((s) => ({ name: s.named.name, share: s.share })),
      },
    })
    // `<IF_SOLO>` taken to be a party of one — INFERRED from its name.
    const solo = battle.state.fighters.filter((f) => f.side === 'party').length === 1
    // The gold after every level-up, in the box only (sub-state 11).
    const obtained =
      said(RESULT_SAYS.gold, { leader: heroNamed(), solo, values: { val_1: gold } }) ??
      `The party obtains ${gold} gold coin${gold === 1 ? '' : 's'}.`
    // The Hero's wounds and magic go on as the battle left them, whether or
    // not they earned; a level's new HP and MP come with it.
    const heroBefore = standing(levels, expOf(leader()), leader().gains).level
    for (const s of earners) {
      const table = levelsFor(s.member)
      if (!table) continue
      const before = standing(table, expOf(s.member), s.member.gains).level
      // Into the vocation that earned it; the other twelve are untouched.
      s.member.exp.set(s.member.vocation, expOf(s.member) + s.share)
      const after = standing(table, expOf(s.member), s.member.gains).level
      if (s.place !== 0) grown.set(s.place, after.maxHp - before.maxHp)
      if (after.level <= before.level) continue
      const named = s.place === 0 ? heroNamed() : s.named
      // **A level reached** (sub-state 7): line 10, or 22 for more than one,
      // with `ME_004`, and "Attributes Increased" for them; then 38; then the
      // skill points, 13.
      const jumped = after.level - before.level > 1
      lines.push(
        (jumped
          ? said(RESULT_SAYS.levelJump, {
              target: named,
              values: { val_1: before.level, val_2: after.level },
            })
          : said(RESULT_SAYS.level, { target: named, values: { val_1: after.level } })) ??
          `${named.name} reaches level ${after.level}!`,
      )
      slots.push({
        window: { kind: 'attributes', rows: attributesOf(before, after) },
        jingle: LEVEL_JINGLE,
      })
      lines.push(
        said(RESULT_SAYS.improve, { target: named }) ?? `${named.name}'s attributes improve!`,
      )
      // What follows 38 waits for the jingle to end (step 7).
      slots.push({ waitJingle: true })
      // **Each spell the levels brought**, one a page, in the table's order:
      // line 12 with the spell's name (step 1's `func_0209aa54`, then
      // sub-state 10, `func_ov023_021f2368`).
      for (const spell of loaded?.spellTable?.learnt ?? []) {
        if (spell.vocation !== s.member.vocation) continue
        if (spell.level <= before.level || spell.level > after.level) continue
        const spellName = loaded?.actions.get(spell.action)?.name ?? `action ${spell.action}`
        lines.push(
          said(RESULT_SAYS.newSpell, { target: named, values: { str_2: spellName } }) ??
            `${named.name} learns a new spell: ${spellName}!`,
        )
        slots.push({})
      }
      // A level's skill points, into the one pool a character has — see `earnSkillPoints`.
      const points = earnSkillPoints(s.member, before, after)
      if (points > 0) {
        lines.push(
          said(RESULT_SAYS.skillPoints, { target: named, values: { val_1: points } }) ??
            `${named.name} earns ${points} skill point${points === 1 ? '' : 's'}.`,
        )
        slots.push({})
      }
      // **The skill-point screen** (sub-state 8), where a tree of their
      // vocation's five is under 100 — after points earned, or with points
      // unspent (`func_ov023_021f5228`, `0x021f1188`). The first time, flag
      // `0x119c` is set and line 36 says what the screen is (`0x021f1360`).
      const trees = treesOf(loaded?.vocationTrees, s.member.vocation)
      const under = trees.some((tree) => (s.member.treePoints.get(tree) ?? 0) < 100)
      if (under && (points > 0 || s.member.skillPool > 0)) {
        if (!storyGlobals.has(FLAG_SKILLS_LISTED)) {
          storyGlobals.add(FLAG_SKILLS_LISTED)
          for (const page of saidPages(RESULT_SAYS.skillsFirst, { target: named })) {
            lines.push(page)
            slots.push({ closes: true })
          }
        }
        lines.push('')
        slots.push({ closes: true, skills: members.indexOf(s.member) })
      }
    }
    lines.push(obtained)
    slots.push({})
    const heroAfter = standing(levels, expOf(leader()), leader().gains).level
    leader().hp = Math.min(heroAfter.maxHp, hero.hp + (heroAfter.maxHp - heroBefore.maxHp))
    // MP spent in the battle stay spent, but a level's new MP come with it.
    const mp = Math.min(heroAfter.maxMp, hero.mp + (heroAfter.maxMp - heroBefore.maxMp))
    leader().mp = mp >= heroAfter.maxMp ? undefined : mp
    // What the monsters dropped — rolled the game's way, from its own
    // generator, after the experience and the gold are settled; see `dropsWon`.
    for (const won of dropsWon(battle.state, dropRng, filchersOf(battle.state))) {
      // To the first living member with room, else the bag (`func_ov023_021eeaac`).
      give(won.item, 1, true)
      const monster = monsterNamed(won.kind) ?? { name: won.from }
      const item = itemNamed(won.item)
      // Autofilch's: line 37, the member as ACTOR — sub-state 13 says it for
      // a drop whose record carries a member (`+5`).
      const thief = won.by === undefined ? undefined : fighterNamed(won.by)
      const stolen = thief && said(RESULT_SAYS.steals, { actor: thief, item })
      if (stolen !== undefined) {
        lines.push(stolen)
        slots.push({})
        continue
      }
      const chest = said(RESULT_SAYS.dropsChest, { monsters: [monster], target: heroNamed() })
      const holds = said(RESULT_SAYS.chestHolds, { item, target: heroNamed() })
      lines.push(
        chest !== undefined && holds !== undefined
          ? `${chest}\n${holds}`
          : `${monster.name} drops a treasure chest! It contains ${item.name}.`,
      )
      slots.push({})
    }
  } else if (battle.state.outcome === 'lost') {
    leader().hp = undefined
    leader().mp = undefined
    // Half the gold is the game's — a published guide: "Money on hand is halved
    // when your characters die" — though the rule is not found in code, and
    // rounding down is ours. Coming round in the village church is ours — see
    // `CHURCH`; the game's own words for either are not found.
    // The purse halved, rounding down (`func_02010604`, `0x020106e4`: `lsr #1`);
    // the bank is spared.
    bag = pay(bag, bag.gold - Math.floor(bag.gold / 2)) ?? bag
    wakeInChurch = true
    lines.push(`${name} comes round in the church, restored — but half the gold is gone.`)
  } else if (hero) {
    leader().hp = hero.hp
    leader().mp = hero.mp >= hero.maxMp ? undefined : hero.mp
  }
  // Each companion's wounds go on with them; one who fell gets up with 1 HP,
  // and after a loss they come round whole with the Hero — ours, all.
  for (const at of battleCompanions) {
    const fighter = battle.state.fighters[at.index]
    if (!fighter) continue
    // A level reached in it adds its HP to what they have, as the Hero's does.
    const gain = grown.get(at.place) ?? 0
    const most = fighter.maxHp + gain
    const left =
      battle.state.outcome === 'lost'
        ? fighter.maxHp
        : Math.min(most, Math.max(1, fighter.hp) + gain)
    // By their place, so a created character keeps their wounds too.
    const along = members[at.place]
    if (along) along.hp = left >= most ? undefined : left
  }
  battle = { ...withPages(battle, lines), settled: true }
  resultsQueue = slots.length === lines.length ? slots : lines.map(() => ({}))
}

/**
 * Who shares a won battle's experience, in the party's places, and what each
 * takes — `experienceShares`, the game's. Each is weighed by their level in
 * the vocation they are and the rounds they stood at the start of; one down
 * takes nothing.
 *
 * **A story companion takes no share and weighs nothing**: their numbers are
 * `attnpc`'s and fixed (`levelsUp`), and the game's own party of four is the
 * Hero and those made at the Quester's Rest — a guest who fights is ours.
 */
function sharesOf(
  state: BattleState,
  total: number,
): { member: Member; place: number; named: Named; share: number }[] {
  const fighting = [
    { member: leader(), index: 0, place: 0 },
    ...battleCompanions.map((at) => ({
      member: members[at.place],
      index: at.index,
      place: at.place,
    })),
  ]
  const places = fighting.map(({ member, index }): Sharer | undefined => {
    const fighter = state.fighters[index]
    const row = member && levelsUp(member) ? levelOf(member) : undefined
    if (!member || !fighter || !row) return undefined
    // Anything worn that carries the experience bonus — the elevating shoes;
    // see `ITEM_EXPERIENCE_BONUS`. Once, however many.
    const bonus = [...wornBy(member).values()].some(
      (id) => ((loaded?.itemFlags.get(id) ?? 0) & ITEM_EXPERIENCE_BONUS) !== 0,
    )
    return {
      rounds: fighter.rounds ?? 0,
      level: row.level,
      down: fighter.hp <= 0,
      ...(bonus ? { bonus } : {}),
    }
  })
  const shares = experienceShares(total, places, loaded?.experienceBands ?? [])
  return fighting.flatMap(({ member, place }, i) =>
    member && places[i]
      ? [
          {
            member,
            place,
            named: place === 0 ? heroNamed() : { name: nameFor(member) },
            share: shares[i] ?? 0,
          },
        ]
      : [],
  )
}

/** Put the battle away. */
function endFight(): void {
  battle = undefined
  battleStage = undefined
  shown = undefined
  combo = { ...NO_COMBO }
  inOpening = false
  ending = undefined
  ownSounds = undefined
  fallenShown = new Set()
  leftIn.clear()
  resultsQueue = []
  allocating = false
  resultsShown = undefined
  lastShown = undefined
  pagesSeen = undefined
  pageLeft = 0
  playMapMusic(true)
  // The weapon and shield go back on the Hero's back — see `dressHero`.
  dressHero()
  if (roaming) roaming = calmFor(roaming, AFTER_BATTLE_CALM)
  battleLooks = []
  battleSpots = []
  battleCompanions = []
  talkEl.hidden = true
  menuEl.hidden = true
  battleBottomEl.hidden = true
  document.body.classList.remove('battle-bottom')
  const fought = eventFight
  eventFight = undefined
  if (wakeInChurch) {
    wakeInChurch = false
    if (enter(CHURCH.map, CHURCH.spot)) {
      status(`${heroName()} comes round in the church`)
      if (fought) followBattle(fought)
      return
    }
  }
  status(`back on the map · HP ${leader().hp ?? 'full'}`)
  if (fought) followBattle(fought)
}

/**
 * The party as the drop roll's further passes see them, in the party's order
 * — see `Filcher`: each member's fighter, level in their vocation now, and
 * whether they hold Autofilch, panel 164 (a book grants it).
 */
function filchersOf(state: BattleState): Filcher[] {
  const fighting = [
    { member: leader(), index: 0 },
    ...battleCompanions.map((at) => ({ member: members[at.place], index: at.index })),
  ]
  return fighting.flatMap(({ member, index }) => {
    const row = member ? levelOf(member) : undefined
    if (!member || !row || !state.fighters[index]) return []
    return [{ fighter: index, level: row.level, autofilch: holdsPanel(member, AUTOFILCH) }]
  })
}

/** Autofilch, tree 19's eleventh panel — trait `0xa4` (`0x021f469c`). */
const AUTOFILCH = 164
/** Critical in a Crisis, tree 26's eleventh panel — trait `0x11d` (`0x02156d8c`). */
const CRITICAL_IN_A_CRISIS = 285

/**
 * Whether a member holds a skill panel: climbed to, or granted by a skill
 * book they carry (`func_ov026_021dc8fc`, `0x021dc980`–`0x021dca0c`) — the
 * bitset at record `+0x8ec` the battle's traits test (`func_02083b00`).
 */
function holdsPanel(member: Member, panel: number): boolean {
  const here = loaded
  if (!here) return false
  const book = (id: number) => here.itemDefs.get(id)
  if ((member.carried ?? []).some((id) => book(id)?.book === true && book(id)?.panel === panel))
    return true
  return panelsHeld(member, here.skillPanels).some((held) => held.id === panel)
}

/**
 * Play event `number` in the map the Hero is in — see `event.ts`. False when it
 * will not read. `afterTalk` when a talk record plays it, so it carries straight
 * on from the conversation — see `EventStage.afterTalk`; ours, that only these do.
 */
/**
 * Put the Hero in the map a scene actually happens in, before playing it.
 *
 * **`?event=` used to play a scene in whatever map was loaded and say nothing
 * about it**, and that cost more than anything else in this file. `ev03030`
 * was driven with `?map=C01`, which is not where it happens: its camera came
 * up inside a wall, the Hero came up a third of a unit under the floor, and
 * the fault was chased into the renderer, then the collision scale, then the
 * decomp before anyone checked the map. See `docs/still-open.md`.
 *
 * The triggers knew all along. A trigger record carries the map it applies in
 * (`Trigger.map`, the map's own id), so the area's own trigger file answers
 * "where does this scene happen" outright — `ev03030` names `C01M16`,
 * Stornway Castle, and plays properly there.
 *
 * So this looks the event up and enters that map first. A scene named by no
 * trigger is left alone rather than refused: `?event=` is also how a scene is
 * looked at that nothing reaches yet, and that is worth keeping.
 */
function goToEventsMap(number: number): void {
  if (!loaded || loaded.mapId === undefined) return
  const wants = new Set<number>()
  // The game's own answer first: the scene's map in its event list.
  const own = eventMapOf(number)
  if (own !== undefined) wants.add(own)
  else
    for (const trigger of loaded.triggers) {
      for (const word of triggerWords(trigger)) {
        if (word.op === OP_EVENT && word.arg === number) wants.add(trigger.map)
      }
    }
  if (wants.size === 0 || wants.has(loaded.mapId)) return
  // Several maps can name one scene. Taking the first in the triggers' own
  // order is a choice, and the status line says which, so a shot taken in the
  // wrong one of two is at least visible as that rather than silent.
  const [first] = [...wants]
  const code = first === undefined ? undefined : loaded.mapCodeOf(first)
  const named = [...wants].map((id) => loaded?.mapCodeOf(id) ?? `map ${id}`).join(', ')
  if (!code) {
    status(`ev${String(number).padStart(5, '0')} is not in ${loaded.code}; its map is not named`)
    return
  }
  const said = `ev${String(number).padStart(5, '0')} happens in ${named}, not ${loaded.code} — going there`
  status(said)
  // The status line holds one line and the scene's own "playing" message
  // lands on it immediately, so the reason would be gone before it was read.
  // The console keeps it, which is what a developer who typed the wrong map
  // needs — the overlay shows the map they ended up in, not why.
  console.info(said)
  enter(code)
}

/**
 * The map a scene plays in, from the game's event lists — see
 * `readEventList` — or undefined for one that plays wherever the Hero is, or
 * is not listed.
 */
function eventMapOf(event: number): number | undefined {
  const entry = loaded?.eventList.get(event)
  return entry && !entry.here && entry.map !== 0 ? entry.map : undefined
}

function startEvent(number: number, afterTalk = false): boolean {
  if (!loaded || !self) return false
  const name = `ev${String(number).padStart(5, '0')}`
  const script = loaded.eventScript(number)
  if (!script) {
    status(`${name} will not read`)
    return false
  }
  // **A scene plays in its own map**, as its event list has it: where that
  // is not here, the game changes map and plays it there (ov017
  // `func_ov017_021bbfc4`). Arriving by the map's entrance is ours; the game
  // keeps where the Hero stands on some, which is not read.
  const own = eventMapOf(number)
  if (own !== undefined && own !== loaded.mapId) {
    const code = loaded.mapCodeOf(own)
    if (code && !enter(code, undefined, true)) return false
    if (!loaded || !self) return false
  }
  // **Starting a scene raises the story to the scene's own stage** when it is
  // behind — read from the same start (at `0x021bc424`): the live thread's
  // major and minor, as 1000 × major + minor, against the list entry's, set
  // to the entry's when less and the major is 19 at most. The step is left.
  // No record moves the story into 16.1; the scene that opens it does.
  const listed = loaded.eventList.get(number)
  if (listed && storyStage) {
    const [major, minor] = listed.values as [number, number]
    const now = storyStage.major * 1000 + storyStage.minor
    if (major <= 19 && (major !== 0 || minor !== 0) && now < major * 1000 + minor) {
      storyStage = { major, minor }
      status(`${name} brings the story to ${major}.${minor}`)
    }
  }
  const messages = new Map(
    loaded
      .eventMessages(number)
      .flatMap((m) => (m.text === undefined ? [] : [[m.id, m.text] as const])),
  )
  playing = {
    player: new EventPlayer(
      script,
      WORLD_SCALE * worldScale,
      {
        x: toFloat(self.state.x),
        y: toFloat(self.state.y),
        z: toFloat(self.state.z),
        facing: self.facing,
      },
      // **A scene carrying on into another script**, the game's `538`. The
      // scene keeps its cast and its camera and runs the next script on the
      // same stage; what changes here is only which messages are on hand.
      (id) => {
        const next = loaded?.eventScript(id)
        if (!next) {
          status(`ev${String(id).padStart(5, '0')} will not read — the chain stops`)
          return undefined
        }
        // One that plays in another map ends this scene and goes there, as
        // the game's chain goes back through a scene's start — see `startEvent`.
        const away = eventMapOf(id)
        if (away !== undefined && away !== loaded?.mapId && playing) {
          playing.chainAway = { map: away, event: id }
          return undefined
        }
        if (playing) {
          playing.event = id
          playing.messages = new Map(
            (loaded?.eventMessages(id) ?? []).flatMap((m) =>
              m.text === undefined ? [] : [[m.id, m.text] as const],
            ),
          )
          playing.showing = undefined
        }
        return next
      },
    ),
    event: number,
    messages,
    showing: undefined,
    carry: 0,
    framing: { pitch: camera.pitch, distance: camera.distance, yaw: camera.yaw },
  }
  // The ending's roll: its files when `811` asks, and the roll itself carried
  // over from the scene before, which a chain into another map ends.
  playing.player.stage.rollFiles = () => {
    rollFiles ??= cartridge
      ? readRollFiles(cartridge)
      : { roll: undefined, fonts: [undefined, undefined] }
    return rollFiles
  }
  playing.player.stage.staffRoll = carriedRoll
  playing.player.stage.afterTalk = afterTalk
  playing.player.stage.heroFallen = heroFallenOnArrival
  // The live thread's flags and marks, which `601` and `602` read.
  for (const flag of storyFlags) playing.player.stage.threadFlags.add(flag)
  for (const mark of storyMarks) playing.player.stage.threadMarks.add(mark)
  // **A scene rolling a die**, the game's `7`, which draws from the battle's
  // own generator. This hands it the roamer's, so a scene's roll is of a piece
  // with the rest of the run and is the same on every machine.
  playing.player.stage.random = (span) => (span > 0 ? roamRng.below(span) : 0)
  // **What the floor is under a point**, which `231` and `232` walk a
  // character onto. The game probes downward from ten units up; this asks the
  // same collision world the Hero stands on.
  playing.player.stage.groundAt = (x, z, y) => {
    const world = loaded?.world
    if (!world) return undefined
    const from = fx32(Math.round(((y + GROUND_PROBE) / worldScale) * FX32_ONE))
    const hit = groundBelow(
      world,
      fx32(Math.round((x / worldScale) * FX32_ONE)),
      fx32(Math.round((z / worldScale) * FX32_ONE)),
      from,
    )
    return hit ? toFloat(hit.y) * worldScale : undefined
  }
  // **Which time of day the scene asks about** — `597`, which `588` pins and
  // `808` sets. Reading `808` settled the numbering: they all speak the game's
  // own four phases, night 0, morning 1, day 2, evening 3. This engine has
  // three times of day, so they map onto three of the four — there is no
  // morning here, and the day's stretch covers it.
  playing.player.stage.timeOfDay = phaseOf(clock.ticks)
  // **Say it where it happens.** An engine function the host has not got is
  // answered with 0 so the scene goes on, which is the right thing to do and
  // the wrong thing to be quiet about: a scene half-plays and nothing says
  // why. The first sighting of each number says so on the status line, with
  // what it was handed — see `EventStage.unread`.
  playing.player.stage.onUnread = (unread) => {
    const shape = [...unread.shapes][0] ?? ''
    status(`ev${number} wants engine function ${unread.fn}(${shape}) — answered 0`)
  }
  self.held.clear()
  closeTalk()
  menu = undefined
  status(`${name} playing · f reads its messages`)
  return true
}

/**
 * `?until=m101` reads a scene's lines on its own until message 101 is up,
 * and holds it there; `?until=f250` holds it at its frame 250. For the
 * side-by-side comparisons, which want the same moment every time. Ours.
 */
const until = /^([mf])(\d+)$/.exec(params.get('until') ?? '')
let untilReached = false
/** The scene browser's hold on the scene playing: paused, a frame wanted, and how fast. */
let scenePaused = false
let sceneStepWanted = false
let sceneSpeed = 1
let sceneBrowser: SceneBrowser | undefined

/**
 * Play a scene as the scene browser asks: the stage, step and flags its
 * record wants, its map entered, and the scene begun — without playing the
 * game up to it. A scene already playing is dropped without its outcome, so
 * playing again does not move the story on. **Ours**; see `scenes.ts`.
 */
function playScene(wanted: SceneConditions): void {
  if (!loaded) return
  if (playing) {
    playing = undefined
    closeTalk()
  }
  storyStage = { major: wanted.stage.major, minor: wanted.stage.minor }
  storyStep = wanted.step ?? 0
  storyFlags.clear()
  for (const flag of wanted.flags) storyFlags.add(flag)
  storyMarks.clear()
  // The scene's own map, which it enters next if it is elsewhere, takes the story as set.
  liveThread = wanted.map === loaded.mapId ? threadOf(loaded.mapId) : undefined
  castLeft.clear()
  const code = loaded.mapCodeOf(wanted.map)
  if (code && !enter(code, undefined, true)) return
  if (!code) status(`map ${wanted.map} has no code — playing where you are`)
  startEvent(wanted.event)
}

function openSceneBrowser(): void {
  if (sceneBrowser) {
    sceneBrowser.toggle()
    return
  }
  const rom = cartridge
  if (!rom) return
  sceneBrowser = new SceneBrowser({
    scenes: sceneIndex(allTriggers(rom)),
    mapCodeOf: (map) => loaded?.mapCodeOf(map),
    linesOf: (event) =>
      (loaded?.eventMessages(event) ?? []).flatMap((m) => (m.text === undefined ? [] : [m.text])),
    play: playScene,
    now: () =>
      playing
        ? {
            event: playing.event,
            frame: playing.player.stage.frame,
            message: playing.player.stage.message,
          }
        : undefined,
    get paused() {
      return scenePaused
    },
    set paused(on) {
      scenePaused = on
    },
    get speed() {
      return sceneSpeed
    },
    set speed(x) {
      sceneSpeed = x
    },
    step: () => {
      sceneStepWanted = true
    },
  })
}

/**
 * The event's frames for this much time — 60 a second, as the scripts count
 * them — and then what they came to: the message the text box shows, and
 * where the Hero, character 0, now is.
 */
function playEvent(elapsedMs: number): void {
  const now = playing
  if (!now || !self) return
  // The scene browser's pause, speed and single frame — see `scene-browser.ts`.
  if (scenePaused) {
    now.carry = sceneStepWanted ? TICK_MS : 0
    sceneStepWanted = false
  } else {
    now.carry = Math.min(now.carry + elapsedMs * sceneSpeed, TICK_MS * 8)
  }
  while (now.carry >= TICK_MS) {
    now.carry -= TICK_MS
    let more = false
    try {
      more = now.player.tick()
    } catch (error) {
      status(`ev${now.event}: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (!more) {
      // Its last ticks may have moved the Hero — the morning sets them down out
      // of bed on its very last — and ending here must not lose that, or they
      // are handed back where they lay.
      heroAsEvent(now)
      endEvent()
      return
    }
  }
  showEnding(now.player.stage)
  // The sounds the scene asked for this frame.
  for (const sound of now.player.stage.sounds.splice(0)) void playSound(sound)
  const shown = now.player.stage.message
  // `?until=`: held once the moment asked for comes up — see `until`.
  if (until && !untilReached) {
    const at = Number(until[2])
    if (until[1] === 'm' ? shown === at : now.player.stage.frame >= at) {
      untilReached = true
      scenePaused = true
    }
  }
  // The event's message stays up until it is read to its end: whatever closed
  // the box, it comes back — or the event would wait on it for ever, and the
  // Hero with it, still lying where the event last put them.
  if (shown !== undefined && (shown !== now.showing || !talking)) {
    now.showing = shown
    // A scene's lines name the Hero as the Hero is called — see `heroName`.
    talkContext = textContext()
    talking = startConversation(
      { id: -1, name: `ev${now.event}`, x: 0, z: 0 },
      `ev${now.event}, message ${shown}`,
      [now.messages.get(shown) ?? `(message ${shown} says nothing)`],
      [`message ${shown}`],
      talkContext,
    )
    showTalk()
    // Before the moment `?until=` asks for, each line is read as it comes.
    if (until && !untilReached) {
      for (let pages = 0; talking && pages < 64; pages++) talk()
    }
  }
  heroAsEvent(now)
}

/** Sound what a scene asks for — see `726`, `720` and `727` in `event.ts`. */
async function playSound(sound: {
  kind: 'effect' | 'jingle' | 'stop' | 'stopMusic' | 'music' | 'zoneMusic'
  index: number
  slot?: number
  frames?: number
}): Promise<void> {
  if (!cartridge) return
  if (sound.kind === 'stop') {
    music.stopEffects()
    return
  }
  if (sound.kind === 'stopMusic') {
    // **Ours**: `721` ramps the live sequence player's own volume down over
    // its count. This player's only fade is a master gain that the effects sit
    // under too, so what is done instead is the sequencer's own release — the
    // count decides only whether it is cut off, not how long it takes.
    music.stop((sound.frames ?? BGM_FADE_FRAMES) <= 0)
    return
  }
  if (sound.kind === 'zoneMusic') {
    // `736` asks the zone for its own tune. The game resolves the zone's id
    // through a table of 47, two substitutions that follow the time of day,
    // and an override list of story flags; this engine keeps a map's music by
    // name, so it plays that.
    playMapMusic(true)
    return
  }
  if (sound.kind === 'music') {
    // `714` starts the tune `713` armed, from its beginning. This player has
    // no arm-and-hold, so the arming is remembered on the stage and the tune
    // is played here, which is where it would start being heard anyway.
    if (!(await playTrack(cartridge, sound.index))) {
      status(`no track ${sound.index} in the music archive`)
    }
    return
  }
  const played =
    sound.kind === 'effect'
      ? await playEffect(cartridge, sound.index, sound.slot)
      : await playJingle(cartridge, sound.index)
  if (!played) status(`no ${sound.kind} ${sound.index} in the sound archive`)
}

/**
 * **What a witness needs to know**, put on `window` so a headless run can ask
 * the page rather than parse the cartridge again in Node — see `tools/witness`.
 *
 * It is a read-only view of what is already loaded: which map, which maps its
 * doorways lead to, and which events its triggers can reach. It calls nothing
 * and changes nothing, so it cannot alter what a shot shows. It exists because
 * the alternative — reading triggers a second time, in another language, from
 * another copy of the parsers — is the kind of duplication that drifts.
 */
function witnessHook(): void {
  const here = loaded
  if (!here) return
  ;(globalThis as { __witness?: unknown }).__witness = {
    map: here.code,
    doorways: here.doorways.map((door) => door.to),
    events: eventsTriggered(here.triggers),
    // Who can be talked to, for `?talk=` — the 2D villagers as much as the 3D
    // ones, since most of a town is 2D. Spots (something to examine) are left
    // out: they answer, but a signpost has nothing to show a witness.
    cast: [...here.cast.members, ...here.cast.sprites2d].map((m) => ({
      id: m.placement.id,
      name: m.name,
    })),
    // What the Hero's assembled figure can be posed with, which is also what
    // a created character can: they are built the same way.
    motions: [...here.figure.motions.keys()],
    // The party, so that what came back from a save can be read from outside
    // rather than counted off a canvas — see `Member`.
    party: members.map((member) => ({
      name: nameFor(member),
      vocation: member.vocation,
      appearance: member.appearance ?? null,
      attnpc: member.attnpc ?? null,
      dressed: dressed[members.indexOf(member)] !== undefined,
    })),
  }
}

/**
 * Stand the Hero behind a cast member and talk to them — see `?talk=`.
 *
 * The distance is well inside {@link TALK_REACH}, so `talkTarget` picks them
 * and not a neighbour, and the Hero is turned to look at them so that the
 * reach test's 60° cone holds.
 */
function standAndTalk(id: number): void {
  if (!loaded || !self) return
  const member = [
    ...loaded.cast.members,
    ...loaded.cast.sprites2d,
    ...loaded.cast.spots,
    ...loaded.cast.standIns,
  ].find((m) => m.placement.id === id)
  if (!member) {
    status(`nobody with placement ${id} is in ${loaded.code}`)
    return
  }
  const at = castPlaced(member.placement)
  const back = TALK_REACH * 0.5
  // **One with a talk box is talked to from it**, as the game has a thing to
  // examine or a keeper over a counter talked to: its middle is tried first.
  const box = member.placement.boxes?.[0]
  const inBox = box && { x: (box.minX + box.maxX) / 2, z: (box.minZ + box.maxZ) / 2 }
  // **Stand them on the floor, and go round the character to find some.**
  // This took the one spot behind the character, wrote it straight into the
  // Hero's state with the cast member's own `y`, and never asked whether
  // there was floor there — so in a room small enough, where behind a
  // character is outside the room, the Hero was put over nothing and fell out
  // of the world. Two of the four blank frames the area sweep found were
  // this, both reading `(falling)` at about `y = -6.4`.
  //
  // Behind is still tried first, because a half-circle turn is the thing
  // worth seeing — see the note on `?talk=` above. The others are tried in
  // turn rather than giving up, because giving up loses the conversation the
  // route exists to show: the first attempt at this fix stood the Hero where
  // they already were, and then nobody was near enough to talk to.
  const world = loaded.world
  const around = [Math.PI, Math.PI / 2, -Math.PI / 2, 0]
  let put: { spot: { x: number; z: number }; y: Fx32 } | undefined
  const spots = [
    ...(inBox ? [inBox] : []),
    ...around.map((turn) => {
      const angle = at.facing + turn
      return { x: at.x + Math.sin(angle) * back, z: at.z + Math.cos(angle) * back }
    }),
  ]
  for (const spot of spots) {
    const ground = world
      ? groundBelow(
          world,
          fx32(Math.round(spot.x * FX32_ONE)),
          fx32(Math.round(spot.z * FX32_ONE)),
          fx32(Math.round((at.y + 0.25) * FX32_ONE)),
        )
      : undefined
    if (ground) {
      put = { spot, y: ground.y }
      break
    }
  }
  if (!put) {
    status(`no floor around placement ${id} — the Hero stays where they are`)
    talk()
    return
  }
  self.state = {
    ...self.state,
    x: fx32(Math.round(put.spot.x * FX32_ONE)),
    y: put.y,
    z: fx32(Math.round(put.spot.z * FX32_ONE)),
  }
  self.facing = facingToward(put.spot, at)
  talk()
}

/** Stand the Hero where the event has character 0. */
function heroAsEvent(now: NonNullable<typeof playing>): void {
  const hero = now.player.stage.actors.get(0)
  if (!hero || !self) return
  self.state = {
    ...self.state,
    x: fx32(Math.round(hero.x * FX32_ONE)),
    y: fx32(Math.round(hero.y * FX32_ONE)),
    z: fx32(Math.round(hero.z * FX32_ONE)),
  }
  self.facing = hero.facing
}

/** The event is over: the Hero stands on the floor where it left them, and the camera follows them again. */
/** The staff roll's file and fonts, read once a cartridge when `811` first asks. */
let rollFiles: ReturnType<typeof readRollFiles> | undefined
/** The roll a scene left running, for the next to carry on — see `endEvent`. */
let carriedRoll: StaffRollRun | undefined
/** Whether the roll is on the bottom screen, and the card the top screen shows. */
let rollShown = false
let cardShown: { readonly path: string; readonly card: CreditCard | undefined } | undefined
const cardEl = must<HTMLCanvasElement>('#card')

/**
 * **The ending's two screens**: the staff roll on the bottom while it runs,
 * `811` to `812`, and the last card `820` put up over the view until `822`
 * — see `staff-roll.ts`.
 */
function showEnding(stage: EventStage | undefined): void {
  const roll = stage?.staffRoll
  const context = battleBottomEl.getContext('2d')
  if (roll && context) {
    drawStaffRoll(context, roll, rollFiles?.fonts ?? [undefined, undefined])
    if (!rollShown) {
      battleBottomEl.hidden = false
      document.body.classList.add('battle-bottom')
      rollShown = true
    }
  } else if (rollShown) {
    rollShown = false
    if (!battle && !storyPageOpen) {
      battleBottomEl.hidden = true
      document.body.classList.remove('battle-bottom')
    }
  }
  const path = stage?.lastCard
  if (!path || !cartridge) {
    cardShown = undefined
    cardEl.hidden = true
    return
  }
  if (cardShown?.path !== path) cardShown = { path, card: readCard(cartridge, path) }
  const top = cardEl.getContext('2d')
  if (!cardShown.card || !top) {
    cardEl.hidden = true
    return
  }
  drawCard(top, cardShown.card, stage.cards.length === 0)
  cardEl.hidden = false
}

function endEvent(): void {
  const done = playing
  playing = undefined
  if (!done) return
  // The staff roll is overlay 28's, not the scene's: it carries on into the next.
  carriedRoll = done.player.stage.staffRoll
  showEnding(undefined)
  // A scene may have dimmed the light; the field's is whole — see `578`.
  shownScale = 1
  if (tintEl) tintEl.style.background = TINTS[timeNow()]
  // A scene that ends in the dark leaves the field to come back — see `showDarkness`.
  const dark = done.player.stage.darkness
  if (dark > 0) returning = { from: dark, since: performance.now() }
  camera.pitch = done.framing.pitch
  camera.distance = done.framing.distance
  camera.actualDistance = done.framing.distance
  // A scene may have banked the view; the field's is level.
  camera.roll = 0
  if (self && world) {
    const reach = toFloat(self.state.y) + toFloat(person().height)
    const hit = groundBelow(world, self.state.x, self.state.z, fx32(Math.round(reach * FX32_ONE)))
    if (hit) self.state = { ...self.state, y: hit.y, fallSpeed: fx32(0), grounded: true }
    // Somewhere the Hero cannot walk away from — inside a bed, had an event
    // stopped before it set them down — is no place to hand them back: the
    // walkable ground nearest instead, as for an arrival with no floor. Ours.
    const walking = { person: person(), speed: WALK_SPEED }
    if (waysOut(world, self.state.x, self.state.y, self.state.z, walking) === 0) {
      const spot = findSpawn(world, {
        ...walking,
        water: loaded?.map.water ?? [],
        near: { x: toFloat(self.state.x), z: toFloat(self.state.z) },
      })
      if (spot) {
        self.state = { x: spot.x, y: spot.y, z: spot.z, fallSpeed: fx32(0), grounded: true }
      }
    }
  }
  // An event that leaves the Hero in a doorway has not sent them through it:
  // the door waits until they step clear, as on arriving. Ours.
  gate.armed = false
  // Whoever goes along picks up the Hero's footsteps from where the event left
  // them, not from wherever they were before it: as on arriving. Ours.
  if (self) for (const trail of trails) resetFollower(trail, self.state)
  closeTalk()
  // What the scene wanted and did not get, most-called first: the worklist in
  // miniature — see `apps/game/test/event-coverage.test.ts` for the whole of it.
  const unread = [...done.player.stage.unreadCalls.values()].sort((a, b) => b.calls - a.calls)
  status(
    `ev${done.event} is over` +
      (unread.length > 0
        ? ` · wanted ${unread.length} function${unread.length === 1 ? '' : 's'} it has not got: ${unread
            .slice(0, 6)
            .map((call) => `${call.fn}×${call.calls}`)
            .join(' ')}${unread.length > 6 ? ' …' : ''}`
        : ''),
  )
  // Any of the map's cast it moved stays where it left them — the Hexagon's
  // figure, by the statue — over the step its record moves to: see `castLeft`.
  const map = loaded?.code
  const moved = [...done.player.stage.actors.values()].filter(
    (actor) => actor.cast !== undefined && actor.placed,
  )
  // A chain into a scene of another map: that scene's record is the one that
  // runs, once it has played there — this one's does not.
  if (done.chainAway) {
    const { map: to, event } = done.chainAway
    const code = loaded?.mapCodeOf(to)
    if (code && enter(code, undefined, true)) startEvent(event)
    return
  }
  followEvent(done.event)
  if (loaded?.code === map) {
    for (const actor of moved) {
      castLeft.set(actor.cast as number, {
        x: actor.x,
        y: actor.y,
        z: actor.z,
        facing: actor.facing,
      })
    }
  }
  // Where the scene sent the Hero, once its own record has run — see `807`.
  // With an event, that plays in place of the map's own entry; without one,
  // the map is arrived in as through a doorway — ours, as the engine's entry
  // event is.
  const handOn = done.player.stage.handOn
  if (handOn && !playing && !battle) {
    const code = loaded?.mapCodeOf(handOn.map)
    const arrival = {
      x: handOn.x * WORLD_SCALE,
      y: handOn.y * WORLD_SCALE,
      z: handOn.z * WORLD_SCALE,
      facing: handOn.facing,
    }
    if (code && enter(code, arrival)) {
      if (handOn.event !== undefined) startEvent(handOn.event)
      else playEntryEvent()
    }
  }
}

/**
 * What follows an event, by its own trigger record — see `eventOutcome` in
 * `@minstrel/game-formats`, INFERRED throughout. The story moves on as
 * `moveStory` has it; whoever it brings in or sends away comes or goes; and
 * where it goes on to, it goes: the map, and the event played there.
 */
function followEvent(event: number): void {
  if (!loaded) return
  const outcome = eventOutcome(loaded.triggers, event, loaded.mapId, storyState())
  if (!outcome) return
  followRecord(outcome, `ev${event} is over`)
}

/**
 * A record's actions on the story — see `moveStory` — and what follows for
 * the map: the cast where the new step has them, whoever it brings in or
 * sends away. Its event, battle and hand-on are left to whoever ran it.
 * Whether the story moved into the stage that closes the slice.
 */
function storyFromRecord(outcome: EventOutcome): void {
  if (!loaded) return
  const story = { stage: storyStage, step: storyStep, flags: storyFlags, marks: storyMarks }
  const { stepped } = moveStory(
    story,
    outcome,
    { all: storyThreads, live: liveThread },
    storyGlobals,
  )
  storyStage = story.stage
  storyStep = story.step
  // **The day's clock**, as a record sets it (`func_02061c04`): `110 : p`
  // puts it at phase p's start; `177 : a, v` starts it when a is 0 or stops
  // it, and puts it at phase v. See `Clock`.
  for (const action of outcome.actions ?? []) {
    if (action.op === 110) setPhase(clock, action.arg)
    else if (action.op === 177) {
      clock.running = action.arg === 0
      const phase = ((action.params?.[0] ?? -1) >>> 16) & 0xffff
      setPhase(clock, phase)
    }
  }
  // The Story So Far's number, which `197 : n` sets — see `story-so-far.ts`.
  storySoFar = storySoFarAfter(outcome.actions, storySoFar)
  // A recipe taught, `161 : r` — see `learnRecipe`.
  for (const action of outcome.actions ?? [])
    if (action.op === OP_LEARN_RECIPE) learnRecipe(recipesKnown, action.arg)
  // Any areas it adds to the map, as it runs — see `areasAdded`. Once each:
  // the map's watch runs every frame.
  for (const area of outcome.areas) {
    if (!areasAdded.some((had) => JSON.stringify(had) === JSON.stringify(area)))
      areasAdded.push(area)
  }
  // What it does to the quests — see `questsAfter`. The clock's reading is
  // the game's too: `127` keeps the day and time a quest was cleared.
  if (outcome.quests && outcome.quests.length > 0) {
    const was = questBook
    questBook = questsAfter(questBook, outcome.quests, new Date().toISOString())
    for (const action of outcome.quests) {
      const name = loaded.questTexts.get(action.quest)?.name ?? `quest ${action.quest}`
      if (action.does === 'accept' && questBook.log.length > was.log.length)
        status(`Quest taken: ${name}`)
      if (action.does === 'clear') status(`Quest cleared: ${name}`)
    }
  }
  // Items a record gives and takes — `114 : i` and `115 : i`, both queued
  // (US ARM9 queue cases `0x0206fcc0` and `0x0206fd74`): **114 gives**, the
  // game's `func_0207d300` — a member first, see `obtain` — and **115
  // takes**, one from the bag or whoever carries it (`func_02086d88`; read 2
  // October 2026). What 115 then takes from what is worn is not modelled.
  for (const action of outcome.actions ?? []) {
    if (action.arg === 0) continue
    if (action.op === 114) {
      give(action.arg)
      status(`${nameOf(action.arg)} obtained`)
    } else if (action.op === 115) takeAway(action.arg)
  }
  // The stop the Starflight Express is at, `216` — see `OP_EXPRESS_AT`.
  if (outcome.expressAt !== undefined) expressAt = outcome.expressAt
  // Whoever it takes out of the map, `124` — see `OP_REMOVE`: gone until the
  // cast is next placed, as the game's object is skipped by every lookup
  // from then on. Drak leaves Gleeba's hall so after his talk at 11.2.
  const removed = outcome.removes ?? []
  if (removed.length > 0) {
    loaded = {
      ...loaded,
      cast: {
        ...loaded.cast,
        members: loaded.cast.members.filter((m) => !removed.includes(m.placement.id)),
      },
    }
    poseMap(Math.max(mapFrame, 0))
  }
  // The cast stands where the stage and step have them: the Hexagon's
  // statue steps aside at 2.4, step 5 — see `castOf`.
  if (stepped) {
    // Where an event left anyone is kept only until the step moves — see `castLeft`.
    castLeft.clear()
    const cast = loaded.castAt(storyStage, stepNow(), timeNow() === 'night', storyGlobals)
    loaded = { ...loaded, cast }
    // A sliding piece goes where its character now stands — see `slide.ts`.
    aimSlides(slides, (id) => standingIn(cast, id))
    poseMap(Math.max(mapFrame, 0))
  }
  // Whoever its record brings in or sends away — Ivor, over 2.2 and 2.3.
  members = partyAfter(members, outcome, freshMember)
}

/** Where the story stands, for the status line. */
function storyLine(): string {
  return (
    `the story is at ${storyStage?.major ?? '?'}.${storyStage?.minor ?? '?'}, step ${storyStep}` +
    (storyFlags.size > 0 ? ` · flags ${[...storyFlags].sort((a, b) => a - b).join(' ')}` : '') +
    (members.length > 1
      ? ` · party ${members
          .slice(1)
          .map((m) => m.attnpc)
          .join(' ')}`
      : '')
  )
}

/**
 * What follows a record that has run — an event's own, most often: its
 * actions on the story, then the set battle it starts or the map and event
 * it goes on to.
 */
function followRecord(outcome: EventOutcome, heading: string): void {
  if (!loaded) return
  storyFromRecord(outcome)
  status(`${heading} · ${storyLine()}`)
  if (outcome.battle !== undefined) {
    startEventBattle(outcome.battle)
    return
  }
  const { onward } = outcome
  if (onward) {
    const code = loaded.mapCodeOf(onward.map)
    if (code && (code === loaded.code || enter(code))) startEvent(onward.event)
  }
}

/**
 * Run the map's watch, as the game does every frame in the field — see
 * `KIND_WATCH` in `@minstrel/game-formats`: the first record for the map over
 * the stage whose conditions hold, and all it does. Angel Falls' church at 1.2
 * moves the story on the moment its two flags are set. Only while nothing else
 * is up, as `maybeAreaEvent`: **ours**, standing in for the game's own order
 * of doorways, fades and transitions first.
 */
function maybeWatch(): void {
  if (!self || !loaded || !storyStage || playing || battle || talking || menu || visit) return
  if (travelling || loaded.mapId === undefined) return
  const found = watchPlay(loaded.triggers, loaded.mapId, storyStage, storyState())
  if (!found) return
  const before = `${storyLine()} ${[...storyMarks].join(' ')} ${[...storyGlobals].join(' ')}`
  storyFromRecord(found)
  const after = `${storyLine()} ${[...storyMarks].join(' ')} ${[...storyGlobals].join(' ')}`
  // It runs every frame; say so only when it changed something.
  if (after !== before) status(`the map's watch ran · ${storyLine()}`)
  if (followTalkOf(found)) return
  if (found.event !== undefined && loaded.eventScript(found.event)) startEvent(found.event)
}

/**
 * The event's camera: looking at its target from its yaw, rise and distance —
 * which is the follow camera's own yaw, pitch and distance. A shot with no
 * angle of its own keeps the camera's and only moves where it looks — see
 * `cameraAngled`. INFERRED; see `event.ts`.
 */
function aimAtShot(shot: EventCamera, angled: boolean): void {
  if (!shot.target) return
  camera.focus = [shot.target[0], shot.target[1], shot.target[2]]
  // The bank a `327` asked for — the one camera field a shot sets that is not
  // part of its framing, so it is carried whether or not the shot is angled.
  camera.roll = shot.roll
  if (!angled) return
  camera.yaw = shot.yaw
  // The distance is the straight line from target to eye, so the rise over it
  // is the pitch's sine — see `EventCamera`.
  camera.pitch =
    shot.distance > 0 ? Math.asin(Math.max(-1, Math.min(1, shot.rise / shot.distance))) : 0
  camera.distance = shot.distance
  camera.actualDistance = camera.distance
  camera.lift = 0
}

/**
 * What the mark over the Hero's head says now — see `bubbles.ts`: someone to
 * talk to in front of them, something to examine, or a doorway just ahead. Who
 * talking would reach comes before the door: ours.
 */
function bubbleKindNow(at: { x: number; z: number; facing: number }): BubbleKind | undefined {
  if (!loaded) return undefined
  const spots = new Set(loaded.cast.spots.map(({ placement }) => placement.id))
  const who = talkTarget(at, [
    ...[...loaded.cast.members, ...loaded.cast.sprites2d].map((member) => {
      const { id, x, z } = castPlaced(member.placement)
      return { id, name: member.name, x, z }
    }),
    ...loaded.cast.spots.map(({ placement }) => ({
      id: placement.id,
      name: 'something to examine',
      x: placement.x,
      z: placement.z,
    })),
  ])
  if (who) return spots.has(who.id) ? 'examine' : 'talk'
  // A talk box the Hero stands in — a keeper over a counter — see `talkBoxesAt`.
  const boxed = talkBoxesAt(at.x, at.z)[0]
  if (boxed) return spots.has(boxed.who.id) ? 'examine' : 'talk'
  if (gate.armed && doorAhead(loaded.doorways, at, TALK_REACH)) return 'door'
  return undefined
}

/**
 * Dress the Hero in what they wear and wield — see `outfitOf` — the weapon and
 * shield in their hands while a battle is on and on their back otherwise.
 */
function dressHero(): void {
  dressParty()
}

/** One member built out of parts, ready to pose — see `dressParty`. */
interface Dressed {
  readonly figure: Figure
  readonly pieces: readonly FigurePiece[]
}

/**
 * Every member who is assembled from parts, dressed — by their place.
 *
 * **Only the created ones.** A story companion is a whole `.chr` model and
 * has no outfit to build (`companionLook`), so their place here is empty. The
 * Hero is place 0, and `loaded.figure` is kept as a view of it because the
 * motion and chest code asks the Hero specifically.
 */
let dressed: (Dressed | undefined)[] = []

/**
 * Dress the party.
 *
 * What each created member wears: the preset they were made from, or — for
 * the Hero, who has none until character creation — what they are actually
 * wearing. Everyone carries on their back in the field and in their hands in
 * a battle, as the Hero always has.
 */
function dressParty(): void {
  if (!loaded) return
  const wardrobe = loaded.wardrobe
  const has = (name: string) => wardrobe.parts.has(name) || wardrobe.textures.has(name)
  const carry: Carry = battle ? 'hands' : 'back'
  dressed = members.map((member, place) => {
    if (!levelsUp(member)) return undefined
    const outfit = outfitFor(member, place, carry, has)
    const figure = dressFigure(wardrobeFor(member), outfit)
    return { figure, pieces: figurePieces(figure) }
  })
  const hero = dressed[0]
  if (hero) loaded = { ...loaded, figure: hero.figure, pieces: hero.pieces }
}

/**
 * What a member built of parts is dressed in, carrying as `carry` says: the
 * preset they were made from, or what they actually wear — the weapon hung
 * where the game hangs its kind (`placeWeapon`), and **what they were made to
 * look like over what the clothes decide**: the face and the hair are the
 * character's, not the kit's — see `lookOver`. `?preset=` dresses the Hero as
 * a ready-made character — see `showPreset`.
 */
function outfitFor(
  member: Member,
  place: number,
  carry: Carry,
  has: (name: string) => boolean,
): Outfit {
  const shown = place === 0 ? presetOutfit : undefined
  const made =
    member.appearance === undefined ? undefined : loaded?.presets[member.appearance]?.outfit
  const outfit = placeWeapon(
    shown ??
      (made &&
        outfitOfPreset(
          made,
          carry,
          has,
          wornBy(member),
          presetModels(loaded?.presets[member.appearance ?? -1]?.sex),
        )) ??
      outfitOf(wornBy(member), carry, has),
    wornBy(member).get('weapon') ?? made?.weapon,
    carry,
  )
  return lookOver(outfit, member.look, has, member.look && hairLetterOf(member, made?.headgear))
}

/**
 * The letter a member's hair shape takes from what is on their head — see
 * `hairLetter`; undefined, no hair. `null` where the items are not read, so
 * the look's own shape stands.
 */
function hairLetterOf(member: Member, made: number | undefined): string | null | undefined {
  const look = member.look
  const defs = loaded?.itemDefs
  if (!look || !defs || defs.size === 0) return null
  const woman = look.sex === SEX.female
  const head = wornBy(member).get('head') ?? made
  const def = head === undefined ? undefined : defs.get(head)
  return hairLetter(def ? modelNumber(def, woman) : undefined, woman, hairItemOf(look))
}

/**
 * The hair item, 9000–9013, an appearance's style is — the one whose model
 * for the sex is the style's (`modelNumber`); undefined where none is, as a
 * man's styles 10–19 are no item the game can give him.
 */
function hairItemOf(look: Appearance): number | undefined {
  const defs = loaded?.itemDefs
  if (!defs) return undefined
  for (let item = HAIR_ITEMS; item < HAIR_ITEMS + HAIR_ITEM_COUNT; item++) {
    const def = defs.get(item)
    if (def && modelNumber(def, look.sex === SEX.female) === look.hair * 10) return item
  }
  return undefined
}

/** The hairs as items, 9000–9013 (`itemdt`, letter `h`). */
const HAIR_ITEMS = 9000
const HAIR_ITEM_COUNT = 14

/**
 * **The motion set a member moves by**: `mp` and two numbers, the body's and
 * the weapon's — each the `motionSet` of what they wear in that slot, the
 * weapon's 0 with none in hand (`func_02072c9c`). The copper sword's is 1, so
 * the Hero moves by `mp0201`; bare-handed, `mp0200`. **Ours**: a body with no
 * number — the underclothes, which are no item — takes 2, which every body
 * piece on the cartridge has.
 */
function motionFamilyOf(member: Member): string {
  const made =
    member.appearance === undefined ? undefined : loaded?.presets[member.appearance]?.outfit
  const setOf = (id: number | undefined) =>
    id === undefined ? undefined : loaded?.itemStats.get(id)?.motionSet
  const body = setOf(wornBy(member).get('body') ?? made?.armour) || 2
  const weapon = setOf(wornBy(member).get('weapon') ?? made?.weapon) ?? 0
  const two = (n: number) => String(n).padStart(2, '0')
  return `mp${two(body)}${two(weapon)}`
}

/** The wardrobe with the motions of the set a member moves by — see {@link motionFamilyOf}. */
function wardrobeFor(member: Member): Loaded['wardrobe'] {
  const here = loaded
  if (!here) throw new Error('nothing loaded to dress anyone from')
  const family = motionFamilyOf(member)
  if (family === MOTION_FAMILY || !cartridge) return here.wardrobe
  const motions = motionSet(cartridge, family)
  return motions.size > 0 ? { ...here.wardrobe, motions } : here.wardrobe
}

/**
 * **Hang the weapon where the game does**: the bone, offset and turn
 * `wpnpos.bin` gives its kind — the item's subtype, INFERRED — for the hands
 * or the back (see `readWeaponPlaces`, `weaponTurn`). An outfit whose weapon
 * has no kind, or a kind the file does not have, keeps its own.
 */
function placeWeapon(outfit: Outfit, weapon: number | undefined, carry: Carry): Outfit {
  const part = weapon === undefined ? undefined : partName(weapon)
  const kind = weapon === undefined ? undefined : loaded?.itemKinds.get(weapon)?.subtype
  const places = kind === undefined ? undefined : loaded?.weaponPlaces.get(kind)
  const place = places?.[carry]
  const bone = place ? BONE_SLOTS[place.slot] : undefined
  if (!place || !bone || part === undefined) return outfit
  return {
    ...outfit,
    attached: (outfit.attached ?? []).map((hung) =>
      hung.part === part ? { part: hung.part, bone, turn: weaponTurn(place) } : hung,
    ),
  }
}

/**
 * A member's look as the appearance panel shows it, knob by knob.
 *
 * **Seven knobs**, which is the set overlay 15's debug viewer names. Four of
 * them change what is drawn here; the three colours do not, and say so on the
 * row rather than being left off the screen — a knob that is there in the game
 * and does nothing here is worth seeing.
 */
function appearanceRows(member: Member): { knob: string; label: string; shown: string }[] {
  const look = member.look ?? HERO_APPEARANCE
  const build = buildOf(look, loaded?.buildTable)
  const scale = scaleOf(build)
  const per = (n: number) => `${Math.round(n * 1000) / 10}%`
  return [
    { knob: 'sex', label: 'Gender', shown: look.sex === SEX.female ? 'female' : 'male' },
    { knob: 'face', label: 'Face', shown: `${look.face} · ${faceOf(look)}` },
    { knob: 'hair', label: 'Hairstyle', shown: `${look.hair} · ${hairOf(look)}` },
    {
      knob: 'hairVariant',
      label: 'Hair shape',
      shown: `${HAIR_VARIANTS[look.hairVariant] ?? '?'}`,
    },
    {
      knob: 'hairColour',
      label: 'Hair Colour',
      shown: `${look.hairColour} · ${hairColourOf(look)}`,
    },
    {
      knob: 'build',
      label: 'Build',
      shown: build
        ? `${look.build} · ${per(scale.height)} tall, ${per(scale.width)} broad`
        : `${look.build} · the build table did not read`,
    },
    // The face takes both — see `skin.ts`; the rest of the body keeps its own
    // skin until how many shades each worn part takes is read.
    { knob: 'skin', label: 'Skin Colour', shown: `${look.skin} — on the face` },
    { knob: 'eyes', label: 'Eye Colour', shown: `${look.eyes}` },
  ]
}

/**
 * Turn one of a member's appearance knobs and redress them — see `turned` in
 * `appearance.ts`.
 *
 * Changing sex moves the build to that sex's row of five, which is what the
 * game's own `sex * 5 + n` does; nothing else follows from it here, though
 * **what they may wear does** — see `mayWear`.
 */
function turnLook(knob: string, by: number, state: MenuState | undefined): MenuState | undefined {
  const member = members[state?.member ?? 0]
  if (!state || !member) return state
  const look = member.look ?? HERO_APPEARANCE
  if (!(knob in look)) return state
  member.look = turnKnob(look, knob as keyof Appearance, by)
  member.sex = member.look.sex
  dressParty()
  dressHero()
  const shown = appearanceRows(member).find((row) => row.knob === knob)
  return { ...state, said: shown ? [`${shown.label}: ${shown.shown}`] : undefined }
}

/**
 * The scale a member's build asks for — one and one where they have no look
 * of their own, or where the ARM9's table did not read. See `playerPieces`,
 * which applies it to what is drawn and to nothing else.
 */
function buildScale(member: Member | undefined): { height: number; width: number } {
  const look = member?.look
  if (!look) return OWN_SIZE
  // **Kept per look rather than worked out per frame.** This runs for every
  // character every frame, and an `Appearance` is immutable — `turned` makes a
  // new one — so the object itself is the key. See `CLAUDE.md` on per-frame
  // allocation in hot paths.
  const already = scaleCache.get(look)
  if (already) return already
  const scale = scaleOf(buildOf(look, loaded?.buildTable))
  scaleCache.set(look, scale)
  return scale
}

/** The figure's own size, shared so that no frame makes one — see `buildScale`. */
const OWN_SIZE = { height: 1, width: 1 }
const scaleCache = new WeakMap<Appearance, { height: number; width: number }>()

/**
 * An outfit with a character's own face and hair put over it — see
 * `appearance.ts`.
 *
 * The clothes come from what they wear and what they were made in; the face
 * and the hair come from the character. The game keeps them apart too: the
 * face is the record's `+0x01` and the hair `+0x175`, neither of them in the
 * equipment block. A part the wardrobe has not got is left as it was rather
 * than naming a file that is not there.
 */
function lookOver(
  outfit: Outfit,
  look: Appearance | undefined,
  has: (name: string) => boolean,
  letter: string | null | undefined = null,
): Outfit {
  if (!look) return outfit
  const face = faceOf(look)
  // The headgear's letter, or no hair under it — see `hairLetterOf`.
  const hair = letter === undefined ? undefined : hairOf(look, has, letter ?? undefined)
  const colour = hairColourOf(look, has)
  // The hair colour replaces whichever `p_h` texture the outfit carried.
  const textures = [...(outfit.textures ?? []).filter((name) => !name.startsWith('p_h'))]
  if (has(colour)) textures.push(colour)
  // Their skin, eyes and brows written over the face's palette, and their
  // skin over every worn part's — see `skin.ts`.
  const colours = loaded?.charaColours
  const recolour = colours
    ? new Map([
        ...(has(face) ? [[face, faceColours(colours, look)] as const] : []),
        ...[outfit.body, outfit.legs, outfit.headgear, ...textures]
          .filter((name): name is string => name !== undefined)
          .flatMap((name) => {
            const edit = bodySkinOf(name, look, colours)
            return edit ? [[name, edit] as const] : []
          }),
      ])
    : outfit.recolour
  const { hair: kept, ...rest } = outfit
  const drawn = hair === undefined ? undefined : has(hair) ? hair : kept
  return {
    ...rest,
    ...(has(face) ? { face } : {}),
    ...(drawn !== undefined ? { hair: drawn } : {}),
    textures,
    ...(recolour ? { recolour } : {}),
  }
}

/** The part letters by the thousands of the items they are worn as — see `PART_LETTERS`. */
const PART_THOUSANDS: Readonly<Record<string, number>> = {
  m: 12,
  b: 13,
  a: 14,
  g: 15,
  p: 16,
  r: 17,
}
/**
 * The parts that are no item, for a slot drawn with no item's part — the bare
 * body, legs, arms and feet (`func_02072afc`'s fallbacks: 1000, 8001, 8010,
 * 994); our underclothes, `BARE_OUTFIT`, stand where those would.
 */
const BARE_PARTS: Readonly<Record<string, number>> = { b: 1000, p: 8001, a: 8010, g: 8010, r: 994 }

/**
 * **A worn part's skin** — see `skin.ts`: the ramp its record's count gives
 * the character's sex, at the place `S` puts it, over its first palette.
 * Undefined for a part that takes none.
 *
 * **The hair's colour texture** (part 4, `p_h<NNN>a`) takes its count from
 * the hair item (`GetItemSkinShades` on slot h3, `0x020731f0`, read 4 October
 * 2026) — the one of 9000–9013 that is the look's style, see `hairItemOf` —
 * and is written at offset 16, not 4. On this cartridge that is a man's
 * styles 8, 9 and 20, eight shades each. The shape (part 3) never is.
 */
function bodySkinOf(
  name: string,
  look: Appearance,
  colours: CharaColours,
): ((palette: PaletteInfo, bytes: Uint8Array) => Uint8Array) | undefined {
  const parsed = /^p_([a-z])(\d{3})/.exec(name)
  const letter = parsed?.[1]
  if (letter === 'h') return hairSkinOf(name, look, colours)
  const thousands = letter === undefined ? undefined : PART_THOUSANDS[letter]
  if (!parsed || letter === undefined || thousands === undefined) return undefined
  const defs = loaded?.itemDefs
  const own = defs?.get(thousands * 1000 + Number(parsed[2]))
  const bare = BARE_PARTS[letter]
  const def = own ?? (bare === undefined ? undefined : defs?.get(bare))
  const count = def ? (look.sex === 1 ? def.skinShades.woman : def.skinShades.man) : 0
  const ramp = skinRamp(colours, look.skin, count)
  if (!ramp) return undefined
  // The part's own palette data: inside its model, or its texture file.
  const set = loaded?.wardrobe.partTextures.get(name) ?? loaded?.wardrobe.textures.get(name)
  if (!set) return undefined
  const size = set.palettes.reduce((most, p) => Math.max(most, p.dataOffset + p.dataSize), 0)
  return bodyColours(ramp, skinSlot(size, 4))
}

/**
 * Fill the party from `?party=`, each `preset:vocation` — **ours**.
 *
 * The game recruits created characters at the Quester's Rest, which is a
 * whole flow of its own: naming, a face, a body, a vocation. None of that is
 * built. This makes the same *thing* — a member with no `attnpc` record, a
 * vocation of their own and an appearance from `charapreset.bin` — so that
 * the rest of the party machinery can be exercised and looked at before the
 * flow that would normally produce one exists.
 *
 * A vocation left out is the Minstrel's, as everyone's is by default.
 */
function recruit(asked: string): void {
  if (!loaded) return
  const made: Member[] = []
  for (const one of asked.split(',')) {
    const [preset, vocation] = one.split(':')
    if (!/^\d+$/.test(preset ?? '')) continue
    const member = freshMember(undefined)
    const recruited: Member = {
      ...member,
      appearance: Number(preset),
      // The ready-made character's own sex, which decides what they may wear
      // — see `SEX` in `equipment.ts`. Character creation is what will ask.
      sex: loaded?.presets[Number(preset)]?.sex,
      vocation: /^\d+$/.test(vocation ?? '') ? Number(vocation) : HERO_VOCATION_NUMBER,
    }
    dressFromPreset(recruited)
    made.push(recruited)
  }
  members = [leader(), ...made].slice(0, PARTY_MOST)
  // Everyone comes in on the Hero, with no footsteps behind them yet.
  if (self) {
    const at = { x: self.state.x, y: self.state.y, z: self.state.z }
    trails = Array.from({ length: PARTY_MOST - 1 }, (_, i) =>
      createFollower(FOLLOW_TICKS * (i + 1), at),
    )
  }
  dressParty()
  status(
    `party of ${members.length}: ` +
      members
        .map((m, i) => `${i}:${nameFor(m)}${m.appearance === undefined ? '' : `/p${m.appearance}`}`)
        .join(' '),
  )
}

/**
 * **A ready-made character comes in wearing what their preset shows them in**
 * — ours, as `?party=` is: what the game gives a recruit made at the Quester's
 * Rest is not read. Each piece the preset names (`charapreset.bin` values 79
 * to 85) that is an item goes in the slot its own table says; what their
 * vocation may not wear goes into the bag instead. The bare arms the gloves
 * field names when there are none, and the ids that name nothing, are no
 * item and are left. So what they are drawn in is what they have on.
 */
function dressFromPreset(member: Member): void {
  const outfit =
    member.appearance === undefined ? undefined : loaded?.presets[member.appearance]?.outfit
  if (!outfit) return
  const worn = new Map(wornBy(member))
  const pieces = [
    outfit.weapon,
    outfit.shield,
    outfit.headgear,
    outfit.armour,
    outfit.gloves,
    outfit.legwear,
    outfit.footwear,
  ]
  for (const id of pieces) {
    const slot = slotOf(loaded?.goods.get(id)?.table)
    if (!slot || worn.has(slot)) continue
    if (wearableBy({ ...member, outfits: new Map([[member.vocation, worn]]) }, id))
      worn.set(slot, id)
    else bag = take(bag, { item: id })
  }
  wear(member, worn)
}

/** The preset the Hero is being shown as, if `?preset=` asked for one. */
let presetOutfit: Outfit | undefined

/** The hair colour texture's skin — see `bodySkinOf`. */
function hairSkinOf(
  name: string,
  look: Appearance,
  colours: CharaColours,
): ((palette: PaletteInfo, bytes: Uint8Array) => Uint8Array) | undefined {
  const item = hairItemOf(look)
  const def = item === undefined ? undefined : loaded?.itemDefs.get(item)
  const count = def ? (look.sex === SEX.female ? def.skinShades.woman : def.skinShades.man) : 0
  const ramp = skinRamp(colours, look.skin, count)
  if (!ramp) return undefined
  const set = loaded?.wardrobe.textures.get(name) ?? loaded?.wardrobe.partTextures.get(name)
  if (!set) return undefined
  const size = set.palettes.reduce((most, p) => Math.max(most, p.dataOffset + p.dataSize), 0)
  return bodyColours(ramp, skinSlot(size, 16))
}

/**
 * Dress the Hero as a preset, by its place in `charapreset.bin`. What the
 * status line says is what a person needs to judge it: which one, how it is
 * dressed, and what was missing.
 */
function showPreset(at: number): void {
  if (!loaded) return
  const preset = loaded.presets[at]
  if (!preset) {
    status(`no preset ${at}; the cartridge has ${loaded.presets.length}`)
    return
  }
  const wardrobe = loaded.wardrobe
  const has = (name: string) => wardrobe.parts.has(name) || wardrobe.textures.has(name)
  const outfit = outfitOfPreset(preset.outfit, 'back', has, new Map(), presetModels(preset.sex))
  if (!outfit) {
    // Say which, and what it was looking for: "no body or legs" on its own
    // tells nobody whether the file is odd or the wardrobe is short.
    const want = (id: number) => `${id} (${partName(id) ?? 'no part name'})`
    status(
      `preset ${at} will not dress: armour ${want(preset.outfit.armour)}` +
        ` legwear ${want(preset.outfit.legwear)} — not in this wardrobe`,
    )
    return
  }
  presetOutfit = outfit
  dressHero()
  const o = preset.outfit
  const missing = (['headgear', 'weapon', 'shield'] as const).filter((slot) => {
    const name = partName(o[slot])
    return name !== undefined && !has(name)
  })
  status(
    `preset ${at} of ${loaded.presets.length} · ${preset.sex === 0 ? 'man' : 'woman'}` +
      ` · ${outfit.body} ${outfit.legs}${outfit.face ? ` ${outfit.face}` : ''}` +
      ` · ${outfit.attached?.length ?? 0} carried, ${outfit.textures?.length ?? 0} textures` +
      (missing.length > 0 ? ` · not in the wardrobe: ${missing.join(' ')}` : ''),
  )
}

/** How high over the Hero's feet the mark stands, in a person's heights: above their head. Ours. */
const BUBBLE_RISE = 1.15

/** The mark over the Hero's head, while nothing else is going on — see `bubbleKindNow`. */
function bubblePieces(now: number): Piece[] {
  if (!loaded || !self || playing || talking || menu || battle || visit) return []
  const at = { x: toFloat(self.state.x), z: toFloat(self.state.z), facing: self.facing }
  const kind = bubbleKindNow(at)
  if (!kind) return []
  const name = BUBBLE_SHEETS[kind]
  const sprite = sheetFor(name, loaded.sheets)
  const bytes = loaded.sheets.get(name)
  if (!sprite || !bytes) return []
  const person = toFloat(PERSON.height) * worldScale
  const placement = {
    id: -1,
    map: 0,
    x: at.x,
    y: toFloat(self.state.y) + person * BUBBLE_RISE,
    z: at.z,
    facing: 0,
    offset: 0,
  } as NpcPlacement
  return propPieces(
    { name, sprite, placement, bytes },
    person,
    camera.yaw,
    bubbleFrame(sprite.animations, (now * 60) / 1000),
  )
}

/** The event's characters in their own models, playing what they are told; the Hero is drawn as ever. */
function eventPieces(): Piece[] {
  const now = playing
  const rom = cartridge
  if (!now || !rom || !loaded) return []
  const stage = now.player.stage
  const sheets = loaded.sheets
  return [...stage.actors].flatMap(([id, actor]) => {
    // Only once the event has put them somewhere: one given a model and not
    // yet placed — Erinn before she walks in, Ivor's faces — stands nowhere.
    if (id === 0 || !actor.placed) return []
    // One `570` has hidden, or one hung on another — see `hungPieces`.
    if (actor.hidden || actor.hungOn) return []
    // As much of them as shows — see `219` and `220` in `event.ts`.
    const opacity = actor.opacity / OPACITY_WHOLE
    const placement = {
      id,
      map: 0,
      x: actor.x,
      y: actor.y,
      z: actor.z,
      facing: actor.facing,
      offset: 0,
    } as NpcPlacement
    // One drawn from a sprite sheet: the Hexagon's figure fading in on `ev02500`.
    if (actor.sprite) {
      const sprite = sheetFor(actor.sprite, sheets)
      const bytes = sheets.get(actor.sprite.toLowerCase())
      if (!sprite || !bytes) return []
      const member = { name: actor.sprite, sprite, placement, bytes }
      // Walking while a `207` has it on its way, on the scene's own frames.
      const walk = actor.walk
      const walking = walk !== undefined && stage.frame < walk.start + walk.frames
      const frame = walking
        ? walkingFrame(member, camera.yaw, stage.frame - walk.start)
        : standingFrame(member, camera.yaw)
      return spritePieces(member, toFloat(PERSON.height) * worldScale, camera.yaw, frame, opacity)
    }
    // A monster a scene brought in — Hexagoon on `ev22510` — in its own motions.
    if (actor.monster) {
      const code = actor.monster.replace(/^.*\//, '').replace(/\.mon$/i, '')
      const look = monsterLookOf(rom, code)
      if (!look) return []
      const posed = sceneMotion((name) => look.motions.get(name), actor, stage.frame, MAP_FPS)
      const pieces = castPieces(
        { name: code, model: look.model, motion: posed?.motion, floor: 0, placement },
        look.catalogue,
        characterScale,
        posed?.frame ?? 0,
      )
      return opacity < 1 ? pieces.map((piece) => ({ ...piece, opacity })) : pieces
    }
    const model = actor.model ?? takenOverModel(actor)
    if (!model) return []
    const look = actorLookOf(rom, model, actor.packs)
    if (!look) return []
    // One played once goes on to the next, or holds its last frame — see `sceneMotion`.
    const posed = sceneMotion((name) => look.motions.get(name), actor, stage.frame, MAP_FPS)
    const motion = posed?.motion
    const frame = posed?.frame ?? 0
    const member = { name: model, model: look.model, motion, floor: look.floor, placement }
    const pieces = [
      ...castPieces(member, look.catalogue, characterScale, frame),
      ...hungPieces(rom, stage, id, member, frame),
    ]
    return opacity < 1 ? pieces.map((piece) => ({ ...piece, opacity })) : pieces
  })
}

/**
 * The `.chr` of a cast member a scene has taken over, as `actorLookOf` names
 * files — `chara_sub/s025.chr` — or undefined when it has not.
 *
 * **Taken over** is a cast member (`566` kinds 4 and 5) that the scene has
 * placed *and* handed a motion or a motion pack: Patty on `ev02535`, given
 * `ev02330s025.chr` to lie under the rubble in. Drawn as the map draws her,
 * she stood in her idle through it. One the scene only moves keeps the map's
 * own drawing and idle, which is what it had.
 */
function takenOverModel(actor: EventActor): string | undefined {
  if (actor.cast === undefined || !actor.placed) return undefined
  if (actor.motion === undefined && actor.packs.length === 0) return undefined
  const member = loaded?.cast.members.find((m) => m.placement.id === actor.cast)
  if (!member || !loaded) return undefined
  const wanted = `/${member.name.toLowerCase()}.chr`
  for (const archive of loaded.catalogue.members.keys()) {
    const path = archive.toLowerCase()
    if (path.endsWith(wanted)) return path.replace(/^\/data\//, '')
  }
  return undefined
}

/**
 * Whether a scene is drawing this cast member itself: it has taken the member
 * over (see {@link takenOverModel}), or it has loaded the member's own `.chr`
 * for a character of its own.
 *
 * The second is INFERRED. `ev22510` loads Patty's `s025` as its character 2,
 * frees her from the rubble and stands her up, and nothing in it hides the
 * map's Patty — its `574`s name records 4, 6, 28 and 30, not her 203. Drawn
 * both, she was twice in the room: pinned where the map has her and standing
 * where the scene does. What supports the reading is `566`'s kind 4, which
 * gives a scene its own copy of a cast member rather than the map's.
 */
function takenOver(id: number): boolean {
  const member = loaded?.cast.members.find((m) => m.placement.id === id)
  const own = member ? `/${member.name.toLowerCase()}.chr` : undefined
  for (const actor of playing?.player.stage.actors.values() ?? []) {
    if (actor.cast === id && takenOverModel(actor) !== undefined) return true
    if (own && actor.model && `/${actor.model.toLowerCase()}`.endsWith(own)) return true
  }
  return false
}

/**
 * What hangs on a scene character's bones and is shown — a face on the head,
 * `235` in `event.ts` — drawn where the bone is in its pose, as a decal over
 * it. A face hung on the Hero is not drawn: the Hero is the figure, not a
 * scene model.
 */
function hungPieces(
  rom: Uint8Array,
  stage: EventStage,
  parentId: number,
  parent: Parameters<typeof heldPieces>[0],
  frame: number,
): Piece[] {
  const out: Piece[] = []
  for (const child of stage.actors.values()) {
    if (child.hungOn?.parent !== parentId || child.hidden || !child.model) continue
    const look = actorLookOf(rom, child.model, child.packs)
    if (!look) continue
    const held = [{ model: look.model, bone: child.hungOn.bone }]
    for (const piece of heldPieces(parent, held, look.catalogue, characterScale, frame)) {
      out.push({ ...piece, decal: true })
    }
  }
  return out
}

/**
 * The Hero's pose while an event plays: what character 0 is told, out of the
 * Hero's packs or their own, on the event's clock at the map's rate and
 * round again at its end.
 */
function heroEventPose(): { readonly motion: Animation; readonly frame: number } | undefined {
  const now = playing
  const rom = cartridge
  const hero = now?.player.stage.actors.get(0)
  if (!now || !rom || !hero?.motion || !loaded) return undefined
  const figure = loaded.figure
  const find = (name: string) =>
    hero.packs.map((pack) => packMotions(rom, pack).get(name)).find((found) => found) ??
    figure.motions.get(name)
  if (!find(hero.motion)) return undefined
  // One played once goes on to the next, or holds its last frame — see `sceneMotion`.
  return sceneMotion(find, hero, now.player.stage.frame, MAP_FPS)
}

/** Draw the main menu, or a visit, or put the box away when neither is up. */
function showMenu(): void {
  // The name screen is up in front of Patty's menu — see `askName`.
  if (naming) {
    menuEl.hidden = true
    return
  }
  if (battle) {
    showBattle()
    return
  }
  if (visit) {
    showVisit(visit)
    return
  }
  if (!menu) {
    menuEl.hidden = true
    return
  }
  menuEl.replaceChildren()
  const commands = document.createElement('div')
  commands.className = 'commands'
  for (const [index, command] of menuCommands(menuContext()).entries()) {
    const item = document.createElement('div')
    item.textContent = labelOf(command, loaded?.menuWords)
    if (index === menu.cursor) item.className = 'chosen'
    commands.append(item)
  }
  menuEl.append(commands)
  // Equipment is shown as the game shows it, on its two screens; the rest,
  // and equipment when its pieces will not read, as text.
  if (menu.panel === 'equip' && showEquipScreens()) {
    equipEl.hidden = false
  } else if (menu.panel) {
    const panel = document.createElement('div')
    panel.className = 'panel'
    for (const line of panelLines(menu.panel, menuContext(), menu)) {
      const row = document.createElement('div')
      row.textContent = line
      panel.append(row)
    }
    menuEl.append(panel)
  } else if (menu.said && menu.said.length > 0) {
    // What a command run from the list said — Heal All's casts — in the
    // panel's place.
    const panel = document.createElement('div')
    panel.className = 'panel'
    for (const line of menu.said) {
      const row = document.createElement('div')
      row.textContent = line
      panel.append(row)
    }
    menuEl.append(panel)
  }
  menuEl.hidden = false
}

/** Draw the equipment screen for the menu as it stands; false when it cannot be drawn. */
/** The figure the portrait draws, dressed for the hand — see `memberPortrait`. */
let portraitFigure: { key: string; figure: Loaded['figure']; pieces: Loaded['pieces'] } | undefined
/** The portrait's own renderer, drawing to nothing behind — see `memberPortrait`. */
const portraitEl = document.createElement('canvas')
let portrait: ModelRenderer | null | undefined
/** How many times the screen's pixels the portrait is drawn at, for crispness when the screen is scaled up. */
const PORTRAIT_SCALE = 3

/**
 * **Whoever the equipment screen is on**, as they stand dressed: the figure at
 * rest, facing the camera, drawn alone by a second renderer onto a clear
 * ground — built of parts as the party is (`outfitFor`), weapon and shield in
 * hand as the screenshots' figure holds them, or a story companion's own
 * model with what they hold. The framing — the camera at the waist, a figure
 * and a quarter away, so the figure fills the frame as the screenshots'
 * does — is ours.
 */
function memberPortrait(place: number): HTMLCanvasElement | undefined {
  const here = loaded
  const rom = cartridge
  if (!here || !self || !rom || portrait === null) return undefined
  if (portrait === undefined) {
    portraitEl.width = PORTRAIT.width * PORTRAIT_SCALE
    portraitEl.height = PORTRAIT.height * PORTRAIT_SCALE
    try {
      portrait = new ModelRenderer(portraitEl, { transparent: true })
    } catch {
      portrait = null
      return undefined
    }
  }
  const member = members[place] ?? leader()
  let pieces: Piece[]
  const along =
    member.attnpc === undefined ? undefined : here.attending.find((w) => w.id === member.attnpc)
  if (along) {
    // A story companion is their whole `.chr` — see `companionLook`.
    const wanted = companionLook(along)
    const look = actorLookOf(rom, wanted.model, wanted.packs)
    if (!look) return undefined
    const placement = { id: 0, map: 0, x: 0, y: 0, z: 0, facing: 0, offset: 0 } as NpcPlacement
    const cast = {
      name: wanted.model,
      model: look.model,
      motion: look.motions.get('stand'),
      floor: look.floor,
      placement,
    }
    pieces = [
      ...castPieces(cast, look.catalogue, characterScale, 0),
      ...heldPieces(cast, heldOf(along.id), here.catalogue, characterScale, 0),
    ]
  } else {
    const standing: Player = {
      ...self,
      state: { ...self.state, x: fx32(0), y: fx32(0), z: fx32(0) },
      facing: 0,
      motionFrame: 0,
    }
    // Kept until who it is or what they wear changes.
    const key = `${place}|${[...wornBy(member).entries()].map(([slot, item]) => `${slot}=${item}`).join(',')}`
    if (portraitFigure?.key !== key) {
      const wardrobe = here.wardrobe
      const has = (name: string) => wardrobe.parts.has(name) || wardrobe.textures.has(name)
      const figure = dressFigure(wardrobeFor(member), outfitFor(member, place, 'hands', has))
      portraitFigure = { key, figure, pieces: figurePieces(figure) }
    }
    const { figure, pieces: dressedPieces } = portraitFigure
    pieces = playerPieces(
      standing,
      figure,
      dressedPieces,
      here.catalogue,
      measurements,
      figure.motions.get('stand'),
      buildScale(member),
    )
  }
  if (pieces.length === 0) return undefined
  // The figure's own height as posed, in world units, frames it.
  let height = 0
  for (const piece of pieces)
    for (const v of piece.geometry.vertices) height = Math.max(height, v.y)
  if (height <= 0) return undefined
  portrait.upload(pieces)
  portrait.draw(
    {
      focus: [0, height * 0.5, 0],
      yaw: 0,
      pitch: 0.08,
      distance: height * 1.25,
      actualDistance: height * 1.25,
      lift: 0,
      height: 0,
      follow: 0,
      minPitch: 0,
      maxPitch: Math.PI / 2,
    },
    false,
    { width: portraitEl.width, height: portraitEl.height },
  )
  return portraitEl
}

function showEquipScreens(): boolean {
  if (!menu || !cartridge) return false
  if (equipScreens === undefined) {
    try {
      equipScreens = makeEquipScreens(readEquipPieces(cartridge))
    } catch {
      equipScreens = null
    }
  }
  const top = equipTopEl.getContext('2d')
  const bottom = equipBottomEl.getContext('2d')
  if (!equipScreens || !top || !bottom) return false
  const context = menuContext()
  const tableOf = context.tableOf ?? (() => undefined)
  const dressing = members[menu.member] ?? leader()
  // **Whoever the screen is on** — L and R change it, see `changeCharacter`.
  const chosen = context.party?.[menu.member]
  equipScreens.draw(top, bottom, {
    hero: chosen?.name ?? context.hero,
    level: (chosen?.standing ?? context.standing)?.level.level,
    equipped: chosen?.equipped ?? context.equipped ?? NOTHING_EQUIPPED,
    bag,
    itemName: nameOf,
    row: menu.row,
    picking: menu.picking,
    // What this vocation may not wear is left out — see `mayWear`. The panel
    // still *says* who may wear what, by `usedByOf`, because that is what
    // makes the absence legible rather than puzzling.
    choices: menu.picking
      ? choicesFor(menu.picking, bag, tableOf, (id) => wearableBy(dressing, id))
      : undefined,
    describe: (id) => {
      const words = loaded?.itemDescriptions.get(id)
      return words === undefined ? undefined : renderName(words)
    },
    subtypeOf: (id) => loaded?.itemKinds.get(id)?.subtype,
    numbersOf: (id) => loaded?.itemStats.get(id),
    rarityOf: (id) => loaded?.goods.get(id)?.rarity,
    // Armour by its own bits; a weapon or shield by who has its tree — see `vocationsWielding`.
    usedByOf: (id) => {
      const numbers = loaded?.itemStats.get(id)
      if (!numbers) return undefined
      if (numbers.usedBy !== 0 || !loaded?.vocationTrees) return numbers.usedBy
      return vocationsWielding(loaded.vocationTrees, numbers.kind)
    },
    portrait: memberPortrait(menu.member),
  })
  return true
}

/** The run and page whose sound cues have been played, so they play once. */
let cuedRun: unknown
let cuedPage = -1

/**
 * Turn the speaker, as the message asks — see {@link turned}.
 *
 * The one that matters is `keep`, which is 208 of the cartridge's turns:
 * without it every speaker would swivel, including the ones the text is
 * careful to leave alone. `back` is `<R_TURN>` and `<END_R_TURN>`; the game
 * makes the box wait for the rotation in the first case and not the second,
 * and this turns instantly either way, so the two come out the same.
 *
 * Only a cast member is turned. A spot — something to examine — has a
 * placement and a facing, and a signpost does not look round at you.
 */
function turnSpeaker(who: Talker, wanted: Turn): void {
  if (!loaded || !self) return
  const member = [...loaded.cast.members, ...loaded.cast.sprites2d].find(
    (m) => m.placement.id === who.id,
  )
  if (!member) return
  // Captured before the first turn, so this reads the un-turned facing.
  if (turned?.id !== who.id) {
    turned = { id: who.id, was: castPlaced(member.placement).facing, facing: 0 }
  }
  const was = turned.was
  const hero = self
  const atPlayer = () => facingToward(who, { x: toFloat(hero.state.x), z: toFloat(hero.state.z) })
  turned = {
    ...turned,
    facing:
      wanted.kind === 'keep' || wanted.kind === 'back'
        ? was
        : wanted.kind === 'angle'
          ? (wanted.radians ?? was)
          : atPlayer(),
  }
}

/** Draw the conversation's page into the text box, or put the box away when it is over. */
function showTalk(): void {
  if (!talking) {
    closeTalk()
    return
  }
  const { who, source, texts, notes, line, page, run, choice, aside } = talking
  const shown = run.pages[page]
  // **A sound written into the line is played when its page comes up.** The
  // game compiles `<ME_008>` and `<SE_014>` to control codes carried in the
  // message itself, so they sound where they stand rather than before or after
  // — see `docs/event-scripts.md` §7a. Guarded on the page, because moving
  // between a prompt's answers redraws the same one.
  if (cuedRun !== run || cuedPage !== page) {
    cuedRun = run
    cuedPage = page
    turnSpeaker(who, run.turn)
    // The ids are the game's own, read 4 October 2026: `<ME_n>`'s `n + 49`
    // is `bgm.sdat`'s sequence `ME_00n`, timed as the text's jingle is
    // (`TEXT_JINGLE`); `<SE_n>`'s flat 14 is entry 14 of the field's
    // sequence archive, 100 (`FIELD_EFFECTS`). See `SoundCue`.
    if (cartridge && !params.get('bgm')) {
      for (const cue of run.cues) {
        if (cue.page !== page) continue
        if (cue.kind === 'ME') void playJingle(cartridge, cue.id, TEXT_JINGLE)
        else void playEffect(cartridge, FIELD_EFFECTS, cue.id)
      }
    }
  }
  talkEl.replaceChildren()
  // `<CEN>` centres the box — the game's narration card, "Some days later…".
  talkEl.classList.toggle('centred', shown?.centred === true)
  // `<SHAKE>` shakes the message window for 30 frames — half a second. The
  // game moves the whole window rect by a hardcoded four-step table, −2px in x
  // and −3px in y; this is the same movement and duration in CSS.
  if (run.shake) {
    talkEl.classList.remove('shaking')
    void talkEl.offsetWidth
    talkEl.classList.add('shaking')
  }
  if (shown?.speaker) {
    const name = document.createElement('div')
    name.className = 'speaker'
    name.textContent = shown.speaker
    talkEl.append(name)
  }
  const body = document.createElement('div')
  const text = shown?.text ?? ''
  const first = revealedCharacters(controlsPanel.settings.textSpeed, 0, text.length)
  body.textContent = text.slice(0, first)
  revealing = first < text.length ? { body, text, from: performance.now() } : undefined
  talkEl.append(body)
  // A prompt is asked on the last page of a run, with its answers under it.
  const asking = promptOf(talking)
  if (asking) {
    const list = document.createElement('div')
    list.className = 'choices'
    for (const [index, answer] of asking.answers.entries()) {
      const item = document.createElement('div')
      item.textContent = answer.label
      if (index === choice) item.className = 'chosen'
      list.append(item)
    }
    talkEl.append(list)
  }
  talkEl.hidden = false
  const which = texts.length > 1 ? `${line + 1} of ${texts.length}, ` : ''
  status(
    `${who.name} #${who.id} · ${source} · ${which}${notes[line] ?? ''} · page ${page + 1} of ${run.pages.length}` +
      (aside ? ` · ${aside}` : '') +
      (run.unhandled.length > 0 ? ` · not shown: <${run.unhandled.join('> <')}>` : '') +
      (asking ? ' · ↑/↓ choose, f answer, Esc close' : ' · f next, Esc close'),
  )
}

/** Show more of the page being revealed, as its time comes; true while some is still to come. */
function revealTalk(now: number): boolean {
  if (!revealing) return false
  const { body, text, from } = revealing
  const shown = revealedCharacters(controlsPanel.settings.textSpeed, now - from, text.length)
  body.textContent = text.slice(0, shown)
  if (shown >= text.length) revealing = undefined
  return revealing !== undefined
}

/** Show the rest of the page at once. */
function revealAll(): void {
  if (!revealing) return
  revealing.body.textContent = revealing.text
  revealing = undefined
}

function closeTalk(): void {
  talking = undefined
  revealing = undefined
  talkEvent = undefined
  // The speaker goes back to the way they were standing. **Ours**: the game
  // holds the saved angle on the message window and restores it through the
  // turn family, and what it does to a speaker whose last message asked for
  // none of them has not been read. Leaving them turned would mean a town
  // slowly rotating to face wherever the Hero last stood.
  turned = undefined
  talkEl.hidden = true
  talkEl.replaceChildren()
}

/** Resize the character, leaving the world exactly as the file has it. */
function movePerson(by: number): void {
  personScale = Math.max(0.05, personScale + by)
  poseMap(0)
  showCollision = true
  const line =
    `${loaded?.code ?? '?'}  character ${personScale.toFixed(3)}` +
    `  (${toFloat(person().height).toFixed(3)} tall, world untouched)`
  status(line)
  console.log(line)
}

/** Resize the room and its collision together, leaving the character alone. */
function moveWorld(by: number): void {
  const was = worldScale
  worldScale = Math.max(0.05, worldScale + by)
  // Everything in the world scales except the character, so the character has
  // to be carried to where they now stand in it.
  if (self) {
    const k = worldScale / was
    self.state = {
      ...self.state,
      x: fx32(Math.round(self.state.x * k)),
      y: fx32(Math.round(self.state.y * k)),
      z: fx32(Math.round(self.state.z * k)),
    }
  }
  poseMap(0)
  showCollision = true
  const line =
    `${loaded?.code ?? '?'}  world ${worldScale.toFixed(3)}` +
    `  (room and collision together, character ${toFloat(PERSON.height).toFixed(3)} tall)`
  status(line)
  console.log(line)
}

/** Resize the room the map draws, leaving its collision where the file put it. */
function moveRoom(by: number): void {
  roomScale = Math.max(0.05, roomScale + by)
  poseMap(0)
  showCollision = true
  const line = `${loaded?.code ?? '?'}  room ${roomScale.toFixed(3)}  ·  ${fitLine('collision', fit)}`
  status(line)
  console.log(line)
}

/**
 * What is currently being done to this map, said out loud.
 *
 * A fit or a room scale is easy to leave applied and impossible to see, and a
 * map that has been quietly resized looks like a map that is wrong. So the
 * state goes on the status line whenever it is not the file's own.
 */
function fitState(): string {
  const moved = fit !== NO_FIT && fitLine('', fit).trim() !== NO_FIT_LINE
  const resized = roomScale !== 1 || worldScale !== 1 || personScale !== 1
  if (!moved && !resized) return 'as the file has it'
  return [
    moved ? fitLine('collision', fit) : '',
    roomScale !== 1 ? `room ${roomScale.toFixed(3)}` : '',
    worldScale !== 1 ? `world ${worldScale.toFixed(3)}` : '',
    personScale !== 1 ? `character ${personScale.toFixed(3)}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Move the fit and say where it now is, in a form that can be copied down. */
function moveFit(by: Partial<CollisionFit>, factor?: number): void {
  const step = (was: number, add: number | undefined) => (factor ? was * factor : was + (add ?? 0))
  fit = {
    sx: step(fit.sx, by.sx),
    sy: step(fit.sy, by.sy),
    sz: step(fit.sz, by.sz),
    x: fit.x + (by.x ?? 0),
    y: fit.y + (by.y ?? 0),
    z: fit.z + (by.z ?? 0),
  }
  refit()
  showCollision = true
  const line = fitLine(loaded?.code ?? '?', fit)
  status(`${line} · room ${roomScale.toFixed(3)}   —   ${describeCollision(world)}`)
  console.log(line)
}

addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase()
  // The key left of 1 shows or hides the debug screen, and with Shift opens
  // and closes the scene browser — see `scene-browser.ts`. Not while typing.
  const typing =
    event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
  if (!typing && (event.code === 'Backquote' || event.key === '`' || event.key === '~')) {
    if (event.shiftKey || event.key === '~') openSceneBrowser()
    else showDebug(!debugOn)
    event.preventDefault()
    return
  }
  // The controls panel takes every key while it is up — see `ControlsPanel`.
  if (controlsPanel.open) {
    if (controlsPanel.key(key)) event.preventDefault()
    return
  }
  if (key === 'k' && !talking && !menu && !visit && !battle) {
    self?.held.clear()
    turning.clear()
    controlsPanel.show()
    event.preventDefault()
    return
  }
  // Turning is held state, read once a frame, and it is taken here rather than
  // in `onAction` — which returns early for the title card, a battle, the menu
  // and a conversation, and would swallow it in all four.
  const turn = actionOfKey(controlsPanel.bindings, key)
  // On the equipment screen the same keys change character instead.
  if ((turn === 'turnLeft' || turn === 'turnRight') && menu?.panel === 'equip') {
    if (onAction(turn, key, event.shiftKey)) event.preventDefault()
    return
  }
  if (turn === 'turnLeft' || turn === 'turnRight') {
    turning.add(turn)
    event.preventDefault()
    return
  }
  if (actionOfKey(controlsPanel.bindings, key) === 'cancel') {
    cancelHeld = true
    showTrickCross()
  }
  // A direction held with B starts a trick once, as the game's newly-pressed test does.
  if (event.repeat && cancelHeld) {
    event.preventDefault()
    return
  }
  if (onAction(actionOfKey(controlsPanel.bindings, key), key, event.shiftKey))
    event.preventDefault()
})

/**
 * What a key or a pad button does, by the action bound to it — `key` is the
 * key itself for the development keys, which are not bound, and empty from
 * the pad. True when something was done, and the event is the game's.
 */
function onAction(action: Action | undefined, key: string, shift: boolean): boolean {
  let handled = false
  const event = {
    shiftKey: shift,
    preventDefault: () => {
      handled = true
    },
  }
  // Going into a battle, or out of one, the game reads no key.
  if (entering || leaving) {
    event.preventDefault()
    return handled
  }
  // A battle takes every key while it lasts: the same keys as the menu — but
  // the skill-point screen its results open takes them while it is up.
  if (battle && !allocating) {
    if (action === 'up') battle = battleMove(battle, 0, -1)
    else if (action === 'down') battle = battleMove(battle, 0, 1)
    else if (action === 'left') battle = battleMove(battle, -1, 0)
    else if (action === 'right') battle = battleMove(battle, 1, 0)
    else if (action === 'confirm') {
      // A page that tells an event, or the opening's, goes on by itself; the
      // game reads no key meanwhile, nor while a wipe-out holds its last frame.
      if (
        battle.phase === 'telling' &&
        (battle.told[0] !== undefined || inOpening || wipeHeld(performance.now()))
      ) {
        event.preventDefault()
        return handled
      }
      // A page that waits on the level's jingle takes no key while it sounds.
      if (resultsSlotNow()?.waitJingle && music.jingling) {
        event.preventDefault()
        return handled
      }
      const round = battle.state.round
      // A result line closed by a key sounds 1 (overlay 23).
      if (ending) battleSound('battle', 1)
      battle = battleChoose(battle, battleOffered())
      keepTactics()
      keepArms()
      cueStarted = battleClock
      // An item used this round is gone from its user's own — when it is one
      // that is used up (`func_020ddb38`: `+0x08` bit 19).
      if (battle.state.round !== round) {
        for (const event of battle.events) {
          if (event.kind !== 'item' || !loaded?.itemDefs.get(event.item)?.usedUp) continue
          const list = battleMembers[event.actor]?.carried
          const at = list?.indexOf(event.item) ?? -1
          if (list && at >= 0) removeSlot(list, at)
        }
      }
      settleBattle()
      if (battle.phase === 'over') {
        leaveFight()
        event.preventDefault()
        return handled
      }
    } else if (action === 'cancel' || action === 'menu') battle = battleBack(battle)
    showBattle()
    event.preventDefault()
    return handled
  }
  // `p` picks a fight — see `FIGHT` — and Shift+P the boss.
  if (key === 'p' && debugOn && loaded && !talking && !menu && !visit && !playing) {
    startFight(event.shiftKey ? BOSS_FIGHT : fightCodes(), !event.shiftKey)
    event.preventDefault()
    return handled
  }
  // `l` gives a level and Shift+L takes one back — see `levelTo` — to
  // whoever the menu is about, or the Hero with the menu shut.
  // It works with the menu up, so the status panel can be watched as the
  // levels go by; not in a battle, whose fighters took their numbers when it
  // began, nor while the collision fit has `l` for its own.
  if (key === 'l' && debugOn && loaded && !battle && !showCollision) {
    // Whoever the menu is about — the one picked on its attributes or
    // equipment screen — and the Hero with the menu shut.
    levelTo(undefined, event.shiftKey ? -1 : 1, (menu && members[menu.member]) || leader())
    event.preventDefault()
    return handled
  }
  // The Story So Far takes every key while it is up, and B closes it
  // (`story.stb`'s section 999); nothing else is read.
  if (storyPageOpen) {
    if (action === 'cancel') closeStorySoFar()
    event.preventDefault()
    return handled
  }
  // A shop, the inn or the church: the same keys as the menu, over its list.
  if (visit) {
    const told = counter()
    // The bank's number window: left and right move its cursor — see `Digits`.
    if (visit.kind === 'digits' && (action === 'left' || action === 'right'))
      visit = { ...visit, digits: pressDigits(visit.digits, action) }
    else if (action === 'up') visit = moveVisit(visit, -1, bag, told)
    else if (action === 'down') visit = moveVisit(visit, 1, bag, told)
    else if (action === 'confirm') {
      const abbeyWindow = visit.kind === 'abbey' ? visit.window : undefined
      const keeperWindow = visit.kind === 'keeper' ? visit.window : undefined
      const digits = visit.kind === 'digits'
      const outcome = chooseInVisit(visit, bag, told)
      bag = outcome.bag
      visit = outcome.visit
      // The bank's number window hands its value back to the bank — see `bankAmount`.
      if (digits) bankAmount(outcome.digitsPick)
      // A keeper's window hands its choice back to the keeper's flow — see `keeperPicked`.
      if (outcome.keeperPick !== undefined && keeperWindow)
        keeperPicked(keeperWindow, outcome.keeperPick)
      // Cap'n Max's list hands its choice back to his lines — see `pickMedal`.
      if (outcome.medalPick !== undefined) pickMedal(outcome.medalPick)
      // The Abbey's windows hand their choice back to Jack's lines — see `abbeyPicked`.
      if (outcome.abbeyPick !== undefined && abbeyWindow)
        abbeyPicked(abbeyWindow, outcome.abbeyPick)
    } else if (action === 'cancel' || action === 'menu') {
      const leaving = visit.kind === 'medals'
      const abbeyWindow = visit.kind === 'abbey' ? visit.window : undefined
      const keeperWindow =
        visit.kind === 'keeper' ? visit.window : visit.kind === 'digits' ? 'digits' : undefined
      visit = leaveVisit(visit)
      if (keeperWindow) keeperCancelled(keeperWindow)
      if (leaving) medalFarewell()
      if (abbeyWindow) abbeyCancelled(abbeyWindow)
    }
    showMenu()
    event.preventDefault()
    return handled
  }
  // The main menu: `x` opens it, and it or Esc goes back a step at a time.
  // While it is up the Hero stands still and the movement keys choose.
  if (menu) {
    if (action === 'up') menu = moveCursor(menu, -1, menuContext())
    else if (action === 'down') menu = moveCursor(menu, 1, menuContext())
    // L and R change character on the equipment screen — see `changeCharacter`.
    else if (action === 'turnLeft' || action === 'turnRight')
      menu = changeCharacter(menu, action === 'turnLeft' ? -1 : 1, menuContext())
    else if (action === 'confirm') {
      const taken = choose(menu, menuContext())
      menu = taken.state
      // What came of it is said under the panel — unless it closed the menu,
      // as a chimaera wing thrown outdoors does.
      const said =
        taken.use !== undefined
          ? useInField(taken.use)
          : taken.discard !== undefined
            ? discardInField(taken.discard)
            : taken.transfer !== undefined
              ? transferInField(taken.transfer)
              : taken.cast !== undefined
                ? castInField(taken.cast)
                : undefined
      if (said && menu) menu = { ...keptInBag(menu), said }
      if (taken.equip) {
        // **Whoever the attributes panel chose**, not always the Hero — the
        // bag is the party's, so anybody can be dressed out of it.
        const dressing = members[menu?.member ?? 0] ?? leader()
        const worn = equip(bag, wornBy(dressing), taken.equip.slot, taken.equip.item)
        if (worn) {
          bag = worn.bag
          wear(dressing, worn.equipped)
          // Drawn in what they now wear — see `dressParty`.
          dressHero()
        }
      }
      if (taken.buy) menu = buyPanel(taken.buy.tree, taken.buy.panel, menu)
      if (taken.cook !== undefined) menu = cookRecipe(taken.cook, menu)
      if (taken.luck) menu = tryLuck(taken.luck, menu)
      if (taken.patty) menu = askPatty(taken.patty, menu)
      if (taken.turn) menu = turnLook(taken.turn.knob, taken.turn.by, menu)
      if (taken.assign) trickSlots[taken.assign.slot] = taken.assign.trick
      if (taken.stop !== undefined) pickStop(taken.stop)
      // The Express's list closed without a stop: it is done with.
      else if (!menu) expressBy = undefined
      if (taken.talk) {
        showMenu()
        talk()
        event.preventDefault()
        return handled
      }
      // **Heal All**: run to its end, its lines said under the menu, which
      // stays — the game's field menu says them in its own window and goes
      // back to the Misc. menu.
      if (taken.healAll && menu) menu = { ...menu, said: healAllInField() }
      if (taken.controls) {
        showMenu()
        self?.held.clear()
        turning.clear()
        controlsPanel.show()
        event.preventDefault()
        return handled
      }
    } else if (action === 'cancel' || action === 'menu') menu = back(menu)
    showMenu()
    event.preventDefault()
    return handled
  }
  if (action === 'menu' && loaded && !talking && !playing) {
    self?.held.clear()
    menu = openMenu()
    showMenu()
    event.preventDefault()
    return handled
  }
  // **The Story So Far**: the Y Button, in the field with the player free —
  // see `story-so-far.ts`.
  if (action === 'y' && loaded && !talking && !playing && !battle && !opening && !serviceWait) {
    openStorySoFar()
    event.preventDefault()
    return handled
  }
  // **A party trick**: the B Button held with a direction performs the trick
  // assigned to it, which is how the game has it — "Allows you to set which
  // party tricks can be performed with the B Button and +Control Pad", `str_tm`
  // 4023. B is the cancel button here. See `performTrick`.
  // While one plays, A, B, X or Y ends a lone trick's held pose, and does
  // nothing else (`func_02012444(keys, 0xc03)`).
  if (performing) {
    if (action === 'confirm' || action === 'cancel' || action === 'menu' || action === 'y') {
      trickReleased = true
      event.preventDefault()
      return handled
    }
    if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
      event.preventDefault()
      return handled
    }
  }
  if (
    cancelHeld &&
    loaded &&
    self &&
    !talking &&
    !playing &&
    !battle &&
    !menu &&
    !visit &&
    (action === 'up' || action === 'down' || action === 'left' || action === 'right')
  ) {
    performTricks(action)
    event.preventDefault()
    return handled
  }
  // While a prompt waits for an answer the arrows choose, before anything else
  // that uses them; f or Enter answers, as it goes on to the next page.
  const moving = action === 'up' || action === 'down' || action === 'left' || action === 'right'
  if (talking && promptOf(talking) && moving) {
    talking = moveChoice(talking, action === 'up' || action === 'left' ? -1 : 1)
    showTalk()
    event.preventDefault()
    return handled
  }
  const token = action === undefined ? undefined : MOVE_TOKENS[action]
  if (self && token) {
    self.held.add(token)
    event.preventDefault()
  }
  // In flight, A asks to land and B to go inside — see `askToLand`.
  if (flying && !talking && !playing && (action === 'confirm' || action === 'cancel')) {
    if (action === 'confirm') askToLand()
    else askToGoInside()
    event.preventDefault()
    return handled
  }
  // Talk to whoever the Hero faces: `f` to start and to go on, Shift+F for every
  // line of their file, Esc to stop, `v` and `n` to read another chapter's words.
  if (action === 'confirm' && loaded) {
    if (revealing) revealAll()
    else talk(event.shiftKey)
    event.preventDefault()
  }
  // Esc closes what is being said — but an event's message is the event's to
  // close, so there it goes on, as `f` does.
  if (action === 'cancel' && talking) {
    const read = talkEvent
    if (playing) talk()
    else closeTalk()
    // An event read out goes on all the same.
    if (!playing && read !== undefined) followEvent(read)
    event.preventDefault()
  }
  if ((key === 'v' || key === 'n') && debugOn && loaded && !showCollision) {
    moveChapter(key === 'n' ? 1 : -1)
    event.preventDefault()
  }
  // Flick through the story stages the cast's records name: `t` back, `y` on.
  if ((key === 't' || key === 'y') && debugOn && loaded) {
    moveStage(key === 'y' ? 1 : -1)
    event.preventDefault()
  }
  // The mini-map on and off. Not while the collision is on show, whose fitting
  // keys take `m` for the room.
  if (action === 'map' && !showCollision) {
    minimapWanted = !minimapWanted
    event.preventDefault()
  }
  // Music off and on: the map's track, or the one the address names.
  if (action === 'music') {
    if (music.playing) {
      music.stop()
      track = undefined
      status('music stopped')
    } else if (params.get('bgm')) void startMusic(params.get('bgm') as string)
    else playMapMusic(true)
    event.preventDefault()
  }
  if (key === 'c' && debugOn) {
    showCollision = !showCollision
    status(
      showCollision
        ? `${fitLine(loaded?.code ?? '?', fit)} — green stands, red stops · arrows move · q/e raise · -/= scale all, ,/. x, ;/' z, k/l y · [/] halve/double · n/m room · g/h room+collision · j/i character · 0 resets`
        : 'collision hidden',
    )
    event.preventDefault()
  }
  // Fitting the collision over the room, by eye. Only while it is on show, so
  // these keys are free the rest of the time.
  if (showCollision) {
    const step = event.shiftKey ? 0.1 : 0.01
    const nudge: Record<string, () => void> = {
      arrowleft: () => moveFit({ x: -step }),
      arrowright: () => moveFit({ x: step }),
      arrowup: () => moveFit({ z: -step }),
      arrowdown: () => moveFit({ z: step }),
      q: () => moveFit({ y: -step }),
      e: () => moveFit({ y: step }),
      // All three axes together, then each on its own: the first room fitted
      // wanted twice its size in z and about its own in x.
      '-': () => moveFit({ sx: -step, sy: -step, sz: -step }),
      '=': () => moveFit({ sx: step, sy: step, sz: step }),
      ',': () => moveFit({ sx: -step }),
      '.': () => moveFit({ sx: step }),
      ';': () => moveFit({ sz: -step }),
      "'": () => moveFit({ sz: step }),
      k: () => moveFit({ sy: -step }),
      l: () => moveFit({ sy: step }),
      // The other way round: leave the collision and resize the room over it.
      n: () => moveRoom(-step),
      m: () => moveRoom(step),
      // Both at once, against a character that does not move: is the pair right
      // and the character small?
      g: () => moveWorld(-step),
      h: () => moveWorld(step),
      // And the character alone, which asks the same question the other way up.
      j: () => movePerson(-step),
      i: () => movePerson(step),
      '[': () => moveFit({}, 0.5),
      ']': () => moveFit({}, 2),
      '0': () => {
        fit = NO_FIT
        roomScale = 1
        worldScale = 1
        personScale = 1
        poseMap(0)
        refit()
        status(`${fitLine(loaded?.code ?? '?', fit)} — back to the file`)
      },
    }
    const move = nudge[key]
    if (move) {
      move()
      event.preventDefault()
      return handled
    }
  }
  return handled
}
addEventListener('keyup', (event) => {
  const action = actionOfKey(controlsPanel.bindings, event.key.toLowerCase())
  const token = action === undefined ? undefined : MOVE_TOKENS[action]
  if (token) self?.held.delete(token)
  if (action) turning.delete(action)
  if (action === 'cancel') {
    cancelHeld = false
    showTrickCross()
  }
})

// A key held as the window loses focus never sends its `keyup`, and the camera
// would spin on for ever. The walk has the same trouble and clears with it.
addEventListener('blur', () => {
  turning.clear()
  cancelHeld = false
  self?.held.clear()
})

frame()
status('choose or drop a cartridge dump')

/** The last confession, offered on the start screen; a save that will not read is said so. */
const kept = readSave(storage())
const savedGame = kept && 'game' in kept ? kept.game : undefined
if (kept) {
  const said = resumeRow.querySelector('span')
  resumeRow.hidden = false
  if (savedGame) {
    if (said) {
      said.textContent = `Carry on from the confession of ${new Date(savedGame.savedAt).toLocaleString()} in ${savedGame.map}, with ${savedGame.gold} G`
    }
  } else if ('error' in kept) {
    resumeEl.checked = false
    resumeEl.disabled = true
    if (said) said.textContent = `A save is kept, but will not read: ${kept.error}`
  }
}
// Development convenience: `?new=1` starts a new game past a kept save.
if (params.get('new') === '1') resumeEl.checked = false
// A cartridge kept from a past visit is offered, unless the address brings its own.
if (!params.get('rom')) void offerKept()

// Development convenience: `?rom=<url>` loads a dump over HTTP instead of
// through the file picker. It fetches only what the URL names, so it stays
// inert unless a developer asks for it.
const romUrl = params.get('rom')
if (romUrl) {
  void (async () => {
    status(`fetching ${romUrl}…`)
    try {
      const response = await fetch(romUrl)
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      // `?keep=1` keeps it in the browser too, as a dropped file is, for checking that path.
      await checkAndBegin(new Uint8Array(await response.arrayBuffer()), params.get('keep') === '1')
      if (wantedFlight && loaded?.mapId === SKY_MAP) {
        const [x, z] = wantedFlight.split(',').map(Number)
        flying = takeOff(Math.round((x ?? 0) * 4096), Math.round((z ?? 0) * 4096))
      }
      if (wantedDoor && loaded) {
        const door = loaded.doorways.find((d) => d.to.toLowerCase() === wantedDoor.toLowerCase())
        if (!door) throw new Error(`${loaded.code} has no doorway to '${wantedDoor}'`)
        const arrived = enter(door.to, {
          x: door.arriveX,
          y: door.arriveY,
          z: door.arriveZ,
          facing: door.arriveFacing,
        })
        // As `maybeTravel` does: a map's entry event plays on coming in this way too.
        if (arrived) playEntryEvent()
      }
      // `tools/shot` waits for a title beginning with `ready`, so a headless
      // driver can tell loading apart from a page that is merely slow.
      document.title = self ? 'ready — walking' : 'ready — loaded'
    } catch (error) {
      status(error instanceof Error ? error.message : String(error))
      document.title = 'failed'
    }
  })()
}
