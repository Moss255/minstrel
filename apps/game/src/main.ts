import {
  dressFigure,
  type Figure,
  type FigurePiece,
  figurePieces,
  figureScale,
  Measurements,
  type Outfit,
} from '@minstrel/actor'
import { textureFor } from '@minstrel/cartridge'
import { FX32_ONE, fx32, toFloat } from '@minstrel/fixed'
import {
  ActionEffect,
  type AttendingCharacter,
  afterBattle,
  areaEvent,
  areasOf,
  entryPlay,
  eventOutcome,
  inArea,
  type LevelRow,
  type LevelTable,
  type NpcPlacement,
  partName,
  type StoryArea,
  spellsLearnt,
  type Treasure,
  vocationsWielding,
  wornResistances,
} from '@minstrel/game-formats'
import { ModelRenderer, type Piece } from '@minstrel/gl'
import {
  type Animation,
  type Geometry,
  loopFrames,
  type Model,
  measureBounds,
  type NodeTransform,
  poseGeometry,
  sampleAnimation,
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
  INDOORS,
  keepTriangles,
  moveRelativeToCamera,
  OUTDOORS,
  occludedChunks,
  updateFollowCamera,
} from '@minstrel/render'
import {
  BattleRng,
  blockChance,
  type CollisionWorld,
  calmFor,
  createCollisionWorld,
  createFollower,
  DropRng,
  dropsWon,
  type Fighter,
  type Follower,
  facingOff,
  groundBelow,
  headingAngle,
  howItOpens,
  monsterHp,
  type OpenGround,
  type Opening,
  PERSON,
  type Roamer,
  type RoamerKind,
  type Roaming,
  type RoamRules,
  resetFollower,
  spoils,
  startRoaming,
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
import { actorLookOf, packMotions } from './actors.ts'
import { type Bag, drop, EMPTY_BAG, pay, take } from './bag.ts'
import {
  type BattleItem,
  type BattleScene,
  type BattleSpell,
  battleBack,
  battleChoose,
  battleMove,
  battleRows,
  battleSpellOf,
  beginBattle,
  foeSpellOf,
  foeWaysOf,
  labelsOf,
  RESULT_SAYS,
  type Told,
  withPages,
} from './battle-scene.ts'
import { type Named, type Telling, tellBattle } from './battle-text.ts'
import { BUBBLE_SHEETS, type BubbleKind, bubbleFrame, doorAhead } from './bubbles.ts'
import {
  CABINET_OPENING,
  CABINET_SHUT,
  type Cabinet,
  cabinetsOf,
  cabinetTargets,
  motionFrame,
} from './cabinets.ts'
import { CARD, closesTheSlice } from './card.ts'
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
import { chestPieces, isChest } from './chests.ts'
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
  companionFighter,
  companionLook,
  companionModel,
  companionNamed,
  companionsAt,
  FOLLOW_TICKS,
  IVOR,
  levelsUp,
  type Member,
  PARTY_MOST,
  partyAfter,
  partyRestored,
  partySaved,
} from './companion.ts'
import { type Action, actionOfKey, MOVE_TOKENS, pressedActions } from './controls.ts'
import { ControlsPanel, turnHint, walkHint } from './controls-panel.ts'
import { lightingFor, TINTS, type TimeOfDay, timeOfDay, ZONE_KIND_BY_TIME } from './daytime.ts'
import { doorGate, doorTaken } from './doors.ts'
import { type EquipScreens, makeEquipScreens, PORTRAIT, readEquipPieces } from './equip-screen.ts'
import { choicesFor, equip, NOTHING_EQUIPPED, type Slot, slotOf } from './equipment.ts'
import {
  BGM_FADE_FRAMES,
  type EventCamera,
  EventPlayer,
  type EventStage,
  OPACITY_WHOLE,
  sceneMotion,
  TIME_OF_DAY,
} from './event.ts'
import { axesFrom, lastSearch, readSticks, type Sticks } from './gamepad.ts'
import {
  CARRY_BONES,
  type Carry,
  expAtLevel,
  expLevelledBy,
  gain,
  HERO_VOCATION_NUMBER,
  levelGainsText,
  outfitOf,
  outfitOfPreset,
  STARTING_EQUIPMENT,
  STARTING_GOLD,
  standing,
  VOCATION_WORDS,
} from './hero.ts'
import { entranceOf, type Loaded, load, type Stage } from './load.ts'
import { afterMarsh, MARSH_TICKS } from './marsh.ts'
import {
  back,
  choose,
  labelOf,
  MENU_COMMANDS,
  MENU_SAYS,
  type MenuContext,
  type MenuMember,
  type MenuSpell,
  type MenuState,
  moveCursor,
  openMenu,
  panelLines,
} from './menu.ts'
import {
  drawMinimap,
  type MinimapShown,
  type Minimaps,
  readMinimaps,
  showMinimap,
} from './minimap.ts'
import { type MonsterLook, monsterLookOf, monsterPieces } from './monsters.ts'
import { music, playBgm, playEffect, playJingle, playTrack } from './music.ts'
import {
  advance,
  advanceMotion,
  type Player,
  player,
  playerPieces,
  TICK_MS,
  WALK_SPEED,
} from './player.ts'
import { breakingFrame, isPotOrBarrel } from './pots.ts'
import { bagOf, readSave, SAVE_VERSION, type SaveGame, type SaveStore, writeSave } from './save.ts'
import {
  type Counter,
  chooseInVisit,
  INN_PRICE,
  leaveVisit,
  moveVisit,
  type Visit,
  viewOf,
  visitChurch,
  visitInn,
  visitShop,
} from './services.ts'
import { revealedCharacters } from './settings.ts'
import { shadowPieces } from './shadows.ts'
import { aimSlides, moveSlides, type Slide, standingIn, startSlides } from './slide.ts'
import { doorShut, doorsOf, moveDoors, type SwingDoor, swingGeometry } from './swing.ts'
import {
  answerNow,
  type Conversation,
  DEFAULT_CONTEXT,
  eventsTriggered,
  facingToward,
  letterForStage,
  moveChoice,
  nextPage,
  noteOf,
  OPENING_STAGE,
  pickLine,
  promptOf,
  type Service,
  sameStage,
  stageOrder,
  startConversation,
  TALK_REACH,
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
const cardEl = must<HTMLDivElement>('#card')
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

/** A battle's track: the boss stage's for a set battle in a dungeon with one, else the ordinary stages'. */
function playBattleMusic(): void {
  if (!cartridge || !loaded || params.get('bgm')) return
  const wanted =
    eventFight && loaded.bossMusic !== undefined ? loaded.bossMusic : loaded.battleMusic
  if (wanted === undefined) return
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
 * **The party, the Hero first.** Each place holds what used to be a loose
 * variable — experience, hit points, magic, seeds, what is worn — and whoever
 * an event's record has brought in and not since sent away holds the places
 * after. See `Member` in `companion.ts`, and `docs/party-and-vocations.md`
 * for the game's own four ordered slots that this is the shape of.
 *
 * Kept in the save, though only the Hero's numbers are yet written there.
 */
let members: Member[] = [{ ...freshMember(undefined), equipped: STARTING_EQUIPMENT }]

/** The level table a member's experience is read against — see `Member.vocation`. */
const levelsFor = (member: Member): LevelTable | undefined => loaded?.levels.get(member.vocation)

/**
 * The Hero: the party's first place, whom the player moves and commands.
 *
 * Named for the game's own arrangement rather than for the Hero, because that
 * is what it is — `0x0200fddc`, the function the message system asks who a
 * speaker should turn to face, is simply "slot 0".
 */
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
    exp: 0,
    // **Ours, and a stand-in.** Everyone starts as the Minstrel the Hero is,
    // because what vocation an attending character has is not read — `attnpc`
    // carries a level, stats, a weapon and a shield, and no vocation at all.
    vocation: HERO_VOCATION_NUMBER,
    appearance: undefined,
    name: undefined,
    gains: {},
    // **Only the Hero starts in the slice's kit.** `freshMember` is used for
    // the Hero at the start, for a story companion joining, and for a created
    // character being recruited; of the three only the first has any claim on
    // `STARTING_EQUIPMENT`, so it is the caller's to give.
    equipped: NOTHING_EQUIPPED,
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
  const after = afterBattle(loaded.triggers, fought.index, fought.won, fought.map)
  if (!after) return
  for (const flag of after.flags) storyFlags.add(flag)
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
/** Ticks after arriving or after a battle during which walking into a monster starts nothing. */
const ROAM_CALM = 120
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
    const stacks =
      animation && animation.boneCount === model.nodes.length
        ? model.pose(
            posedNodes(
              model,
              animation,
              cabinet
                ? motionFrame(
                    cabinet.motions,
                    cabinet.motion,
                    frame - cabinet.since,
                    animation.frameCount,
                  )
                : frame,
            ),
          )
        : model.shapeMatrices

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
      drawn.push(texture ? { geometry, ...texture } : { geometry })
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
    ...loaded.cast.members.flatMap((member) =>
      castPieces(
        { ...member, placement: castPlaced(member.placement) },
        cat,
        characterScale,
        frame,
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
function begin(bytes: Uint8Array, map: string): void {
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
    if (enter(saved.map, saved.at)) return
  }
  // Development convenience: `?stage=2.2` opens a new game at that stage,
  // `?step=4` at that step of it, and `?flags=0,1` with those story flags set.
  const stage = /^(\d+)\.(\d+)$/.exec(params.get('stage') ?? '')
  if (stage) storyStage = { major: Number(stage[1]), minor: Number(stage[2]) }
  const step = Number(params.get('step'))
  if (Number.isInteger(step) && step > 0) storyStep = step
  for (const flag of (params.get('flags') ?? '').split(',')) {
    if (/^\d+$/.test(flag)) storyFlags.add(Number(flag))
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
  const level = Number(params.get('level'))
  if (Number.isInteger(level) && level > 0) levelTo(level)
  // `?preset=3` dresses the Hero as a ready-made character — see `showPreset`.
  const asPreset = params.get('preset')
  if (asPreset !== null && /^\d+$/.test(asPreset)) showPreset(Number(asPreset))
  // `?party=4:0,12:3,21:9` fills the party with created characters: a preset
  // and a vocation each — **ours**, standing in for the Quester's Rest until
  // recruitment is built. See `recruit`.
  const asParty = params.get('party')
  if (asParty) recruit(asParty)
  // `?save=1` writes a save where it stands — **ours**, and only for driving.
  // The church is the one place a player can record anything, which makes the
  // save impossible to exercise from outside without walking to a priest.
  if (params.get('save') === '1') status(confess())
  if (wantedEvent !== undefined) startEvent(wantedEvent)
  else playEntryEvent()
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
  const found = entryPlay(loaded.triggers, loaded.mapId, storyStage, storyFlags, stepNow())
  if (!found || !loaded.eventScript(found.event)) return false
  // Its record's own flags, so it plays once — see `entryPlay`.
  for (const flag of found.flags) storyFlags.add(flag)
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
  // The whole party, each with their own — see `SaveMember`. An older save's
  // companions come back with nothing, which is all they ever had.
  members = partyRestored(game.members)
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
    members: partySaved(members),
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
function enter(map: string, arrival?: Arrival): boolean {
  if (!cartridge) return false
  const previous = loaded
  const previousSelf = self
  const started = performance.now()
  // Where an event left anyone belongs to the map it happened in — see `castLeft`.
  castLeft.clear()
  let opened: Loaded
  try {
    opened = load(cartridge, { map, lighting: wantedLighting, onProgress: status })
  } catch (error) {
    status(error instanceof Error ? error.message : String(error))
    loaded = previous
    self = previousSelf
    return false
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

  // The cast where the story stage has them.
  if (storyStage !== undefined) opened = { ...opened, cast: opened.castAt(storyStage, stepNow()) }
  loaded = opened
  witnessHook()
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
  areasIn.clear()
  cabinets = cabinetsOf(opened.map, opened.treasures, (slot) => {
    const inside = opened.treasures[slot]
    return inside !== undefined && openedTreasure.has(treasureKey(opened.code, slot, inside))
  })
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

/** The areas the Hero stood in at the last look, by id — see `maybeAreaEvent`. */
const areasIn = new Set<number>()
const areasNow = new Set<number>()
/** This map's areas at the story's stage, kept while neither changes. */
let areaCache: { key: string; areas: readonly StoryArea[] } | undefined

/**
 * Play what walking into one of the map's areas plays — see `areaEvent` in
 * `@minstrel/game-formats`, INFERRED: in the mayor's house at 2.1, walking up
 * to him plays his scene with Ivor, `ev02120`. Only on walking in, not while
 * standing in one, and not while anything else is up — both **ours**.
 */
function maybeAreaEvent(): void {
  if (!self || !loaded || !storyStage || playing || battle || talking || menu || visit) return
  if (travelling || loaded.mapId === undefined) return
  const key = `${loaded.mapId} ${storyStage.major}.${storyStage.minor}`
  if (areaCache?.key !== key) {
    areaCache = { key, areas: areasOf(loaded.triggers, loaded.mapId, storyStage) }
  }
  if (areaCache.areas.length === 0) return
  // Areas are in the units placements use; the world is those times its scale.
  const scale = WORLD_SCALE * worldScale
  const x = toFloat(self.state.x) / scale
  const y = toFloat(self.state.y) / scale
  const z = toFloat(self.state.z) / scale
  const height = toFloat(person().height) / scale
  areasNow.clear()
  for (const area of areaCache.areas) if (inArea(area, x, y, z, height)) areasNow.add(area.id)
  const found = areaEvent(
    loaded.triggers,
    loaded.mapId,
    storyStage,
    storyFlags,
    stepNow(),
    (id) => areasNow.has(id) && !areasIn.has(id),
  )
  areasIn.clear()
  for (const id of areasNow) areasIn.add(id)
  if (!found || !loaded.eventScript(found.event)) return
  for (const flag of found.flags) storyFlags.add(flag)
  startEvent(found.event)
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
    name: DEFAULT_CONTEXT.heroName,
  }
  // Each of the party where they walk, or on the Hero while they stand on
  // them. Keyed by place rather than by the story companions' compacted list,
  // so a created character gets a dot too — see `followersNow`.
  const walking = companionsInField()
  const companions = followersNow().flatMap(({ who, member, place }) => {
    if (who && standingHere(who)) return []
    const seen = walking.find((w) => w.place === place)
    return [
      { x: seen ? seen.x / unit : hero.x, z: seen ? seen.z / unit : hero.z, name: nameFor(member) },
    ]
  })
  drawMinimap(context, minimapShown, [hero, ...companions], loaded?.region)
}

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

let lastFrame = 0
function frame(now = 0): void {
  const elapsedMs = lastFrame === 0 ? 0 : now - lastFrame
  lastFrame = now

  if (loaded) {
    keepTime(elapsedMs)
    // A map is not a still life: the village's sky drifts its clouds apart and
    // the waterfall runs, both on the map's own animations.
    const wanted = Math.floor(now / (1000 / MAP_FPS))
    // Doors swing on the frame's own time, and a door that moved is a map to redraw.
    const swung = self !== undefined && moveDoors(doors, peopleAtDoors(), elapsedMs / 1000)
    const slid = moveSlides(slides, elapsedMs / 1000)
    if (wanted !== mapFrame || swung || slid) {
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
    const { moving, travelled, marshTicks } =
      playing || opening
        ? { moving: false, travelled: 0, marshTicks: 0 }
        : advance(self, world, camera.yaw, elapsedMs, trails, inMarshNow)
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
    advanceMotion(self, loaded.figure, measurements, moving, elapsedMs, travelled)
    maybeTravel()
    maybeAreaEvent()

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
    if (chunkBoxes.length > 0) {
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
    const heroPose = heroEventPose() ?? chestOpeningPose(now)
    const drawn = [
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
      ...(battle ? foePieces(now) : []),
      ...(battle ? companionPieces(now) : []),
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
      ...playerPieces(
        heroPose ? { ...self, motionFrame: heroPose.frame } : self,
        loaded.figure,
        loaded.pieces,
        loaded.catalogue,
        measurements,
        heroPose?.motion ?? loaded.figure.motions.get(self.motion ?? ''),
      ),
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
  renderer.draw(camera, false, undefined, playing?.player.stage.fov)
  requestAnimationFrame(frame)
}

const params = new URLSearchParams(location.search)
/**
 * Where a new game opens: the village, `M01`, at 2.1 — where coming in plays the
 * scene at the Guardian statue, `ev22590`, by the village's own entry record
 * (see `entryPlay`). From a let's play of the European release: the slice opens
 * there, a day before the morning in Erinn's house, which follows that
 * evening's question of hers — see `labelOnward`. The morning was the opening
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
/** Seconds spent in the field, which at 2.2 bring the evening and the night — see `daytime.ts`. */
let fieldSeconds = 0
/** The time of day as last shown, to notice it turning. */
let shownTime: TimeOfDay | undefined
/** The colour the view is multiplied by — see `TINTS`. */
const tintEl = document.querySelector<HTMLDivElement>('#tint')

/**
 * This engine's three times of day as the game's own four phases — see
 * `TIME_OF_DAY`. There is no morning here; the day's stretch covers it.
 */
const GAME_PHASE: Record<TimeOfDay, number> = {
  day: TIME_OF_DAY.day,
  evening: TIME_OF_DAY.evening,
  night: TIME_OF_DAY.night,
}

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

/** The time of day now: `?time=evening` forces one, `?lighting=night` the night, else the story's. */
function timeNow(): TimeOfDay {
  const forced = params.get('time')
  if (forced === 'day' || forced === 'evening' || forced === 'night') return forced
  if (params.get('lighting') === 'night') return 'night'
  return timeOfDay(storyStage, fieldSeconds)
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
  if (here.fieldZones.length > 0 && !playing && !battle && !menu && !visit && !talking) {
    fieldSeconds += elapsedMs / 1000
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
    const drawn = heroPortrait()
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
    equipped: [...leader().equipped.entries()],
    parts: loaded ? [...loaded.wardrobe.parts.keys()].filter((n) => /^p_[ws]/.test(n)) : [],
  }),
})
// For a headless check: the time of day, readable from the page.
Object.defineProperty(window, 'minstrelTime', {
  get: () => ({ time: timeNow(), fieldSeconds, lighting: wantedLighting }),
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
      exp: leader().exp,
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
 * `?bag=w,s:3` — a debugging aid, **ours**: one of every item the named item
 * tables list — or as many as follow a colon — put into the bag, once, when the
 * first map loads, to see the equipment screen full. The letters are the item
 * tables' own: `w` weapons, `s` shields and so on (see `readItemTable`).
 */
const wantedBag = params.get('bag')
let bagFilled = false
function fillBag(opened: Loaded): void {
  if (bagFilled || !wantedBag) return
  bagFilled = true
  for (const part of wantedBag.split(',')) {
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
    const worn = equip(bag, leader().equipped, slot, id)
    if (worn) {
      bag = worn.bag
      leader().equipped = worn.equipped
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
  begin(bytes, wantedMap)
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
    begin(kept.bytes, wantedMap)
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
  castLeft.clear()
  closeTalk()
  loaded = { ...loaded, cast: loaded.castAt(storyStage) }
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

/** Redraw the treasure markers, after a map is entered or a treasure opened. */
function refreshTreasures(): void {
  if (!loaded) {
    treasureDrawn = []
    return
  }
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
  // A cabinet opens whatever is inside: it plays its opening once, then holds.
  const cabinet = target.id >= CABINET_TARGET ? cabinets[target.id - CABINET_TARGET] : undefined
  if (cabinet && cabinet.motion === CABINET_SHUT) {
    cabinet.motion = CABINET_OPENING
    cabinet.since = Math.max(mapFrame, 0)
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
  if (!already) bag = take(bag, found.takings)
  // A pot or a barrel breaks as it is opened, and then is gone.
  if (!already && isPotOrBarrel(treasure)) smashedAt.set(key, performance.now())
  const code = loaded.code
  const tell = () => {
    talking = startConversation(
      { ...target, id: treasure.index ?? target.id },
      `${cabinet ? `${cabinet.stem}, ` : ''}kind 0x${treasure.kind.toString(16)} in ${code}`,
      [treasureText(treasure, already, found.text)],
      [already ? 'already open' : found.note],
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
/** Where the line being read goes on once read — see `labelOnward` in `talk.ts`. */
let talkOnward: { map: number; event: number; answer: number | undefined } | undefined
/** The event a line's label leads to, played once it is read — see `Choice.leadsTo`. */
let talkThen: { event: number; answer: number | undefined } | undefined
/** The last of a prompt's answers given in this talk, from 0. */
let talkAnswer: number | undefined

function talk(everyLine = false): void {
  if (!loaded || !self || opening) return
  if (talking) {
    const ending = talking
    // The answer given at a prompt, kept even where its branch ends the talk:
    // the Hexagon statue's Yes, `<YES><END>`, which its scene waits on.
    const given = answerNow(ending)
    talking = nextPage(talking, talkContext)
    if (given !== undefined) talkAnswer = given
    showTalk()
    // A line that ends by handing over — `<ADD><SHOP=32>` — opens its service.
    if (!talking && ending.run.service) openService(ending.run.service)
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
    // A line whose talk record goes on — Erinn's evening question, on to the
    // morning upstairs — goes, once read, if the answer it waits for was given.
    if (!talking && talkOnward) {
      const go = talkOnward
      talkOnward = undefined
      if (go.answer === undefined || go.answer === talkAnswer) {
        const code = loaded.mapCodeOf(go.map)
        if (code && (code === loaded.code || enter(code))) startEvent(go.event)
      }
    }
    // A line whose label leads to an event — the Hexagon's inscription, the
    // statue's button — plays it once read, on the answer it waits for, and
    // carries straight on from the conversation: see `Choice.leadsTo`.
    if (!talking && talkThen) {
      const go = talkThen
      talkThen = undefined
      if (go.answer === undefined || go.answer === talkAnswer) startEvent(go.event, true)
    }
    return
  }
  // While an event plays, `f` only reads its messages.
  if (playing) return
  talkOnward = undefined
  talkThen = undefined
  talkAnswer = undefined
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
  const who = talkTarget(
    { x: toFloat(self.state.x), z: toFloat(self.state.z), facing: self.facing },
    cast,
  )
  if (!who) {
    if (openTreasureAhead()) return
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
  const letter = chapter()
  const lines = letter === undefined ? [] : loaded.linesOf(who.id, letter)
  talkContext = contextFor(lines.map((line) => line.text ?? ''))
  if (everyLine || storyStage === undefined) {
    talking = startConversation(
      who,
      `every line of chapter ${letter ?? '—'}`,
      lines.map((line) => line.text),
      lines.map(noteOf),
      talkContext,
    )
  } else {
    const choice = pickLine({
      triggers: loaded.triggers,
      map: loaded.mapId,
      stage: storyStage,
      night: timeNow() === 'night',
      id: who.id,
      lines,
      flags: storyFlags,
      marks: storyMarks,
      alone: companionsNow().every(standingHere),
      step: stepNow(),
    })
    // What the record that chose it sets — the first time they are talked to.
    for (const mark of choice?.marks ?? []) storyMarks.add(mark)
    if (choice?.kind === 'line') {
      talking = startConversation(
        who,
        `chapter ${letter}: ${choice.why}`,
        [choice.line.text],
        [noteOf(choice.line)],
        talkContext,
      )
      talkOnward = choice.onward
      talkThen = choice.leadsTo
    } else if (choice?.kind === 'event') {
      // Played, not read out, so that what follows it follows — see `followEvent`.
      // Begun by talking, it carries straight on from the conversation — see `afterTalk`.
      if (loaded.eventScript(choice.event) && startEvent(choice.event, true)) return
      const messages = loaded.eventMessages(choice.event)
      talking = startConversation(
        who,
        `ev${String(choice.event).padStart(5, '0')}: ${choice.why}`,
        messages.map((message) => message.text),
        messages.map((message) => `message ${message.id}`),
      )
      // What follows it follows once it is read — or at once, with nothing to
      // read: Patty's `ev22510` starts the fight with Hexagoon.
      if (!talking) {
        followEvent(choice.event)
        return
      }
      talkEvent = choice.event
    }
  }
  if (!talking) {
    const when = storyStage ? ` at ${storyStage.major}.${storyStage.minor}` : ''
    status(`${who.name} (#${who.id}) has nothing to say in chapter ${letter ?? '—'}${when}`)
    return
  }
  showTalk()
}

/**
 * The innkeeper's line asks the engine for its price (`<val_2>`) and for how
 * many are staying (`<val_1>`); it is given the stand-in price, `INN_PRICE`,
 * and a party of one.
 */
function contextFor(texts: readonly string[]): TextContext {
  return texts.some((text) => text.includes('<INN='))
    ? { ...DEFAULT_CONTEXT, values: { val_1: '1', val_2: String(INN_PRICE) } }
    : DEFAULT_CONTEXT
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
      equipped: member.equipped,
    }
  }
  const levels = levelsFor(member)
  const now = levels ? standing(levels, member.exp, member.gains) : undefined
  return {
    name: nameFor(member),
    // The vocation in the menu's own words — `str_tm` 2106, the Minstrel.
    standing: now && {
      ...now,
      vocation: words?.get(VOCATION_WORDS + member.vocation) ?? now.vocation,
    },
    hp: member.hp,
    mp: member.mp,
    equipped: member.equipped,
  }
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
    return member.appearance === undefined
      ? DEFAULT_CONTEXT.heroName
      : `preset ${member.appearance}`
  }
  const who = loaded?.attending.find((one) => one.id === member.attnpc)
  return who?.name ?? `party member ${member.attnpc}`
}

/** What the menu's panels are told. */
function menuContext(): MenuContext {
  const levels = levelsFor(leader())
  const words = loaded?.menuWords
  const now = levels ? standing(levels, leader().exp, leader().gains) : undefined
  return {
    party: members.map(menuMember),
    hero: DEFAULT_CONTEXT.heroName,
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
    equipped: leader().equipped,
    numbersOf: (id) => loaded?.itemStats.get(id),
    itemName: nameOf,
    tableOf: (id) => loaded?.goods.get(id)?.table,
    spells: heroSpells(),
    noSpells: menuSay(MENU_SAYS.noFieldSpells, { actor: heroNamed() }),
    words,
  }
}

/** The Hero as the words name them: the name alone, and he — the preset Hero's. */
function heroNamed(): Named {
  return { name: DEFAULT_CONTEXT.heroName, gender: 0 }
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
function battleItems(): BattleItem[] {
  const uses = loaded?.itemUses
  if (!uses) return []
  const items: BattleItem[] = []
  for (const [id, count] of bag.items) {
    const use = uses.get(id)?.battle
    if (!use) continue
    const heal = use.effect === ActionEffect.RestoresHp ? use.range : undefined
    items.push(heal ? { id, name: itemNamed(id), count, heal } : { id, name: itemNamed(id), count })
  }
  return items
}

/** What the Spells command offers: what the Hero has learnt that a battle can cast — see `battleSpellOf`. */
function battleSpells(): BattleSpell[] {
  const here = loaded
  const table = here?.spellTable
  const row = heroRow()
  if (!here || !table || !row) return []
  return spellsLearnt(table, leader().vocation, row.level).flatMap((learnt) => {
    const action = here.actions.get(learnt.action)
    const spell = action && battleSpellOf(action)
    return spell ? [spell] : []
  })
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
  return levels ? standing(levels, leader().exp, leader().gains).level : undefined
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
function levelTo(level: number | undefined, by = 0): LevelRow | undefined {
  const levels = levelsFor(leader())
  if (!levels) {
    status('the level table did not load, so the Hero has no level to move')
    return undefined
  }
  const before = standing(levels, leader().exp, leader().gains).level
  leader().exp =
    level === undefined ? expLevelledBy(levels, leader().exp, by) : expAtLevel(levels, level)
  const after = standing(levels, leader().exp, leader().gains).level
  // Undefined is whole, and stays whole at the new maximum.
  const moved = leader()
  if (moved.hp !== undefined)
    moved.hp = Math.min(after.maxHp, moved.hp + (after.maxHp - before.maxHp))
  if (moved.mp !== undefined)
    moved.mp = Math.min(after.maxMp, moved.mp + (after.maxMp - before.maxMp))
  const worn = wornNumbers()
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
      ? `level ${after.level}${end} · ${numbers}`
      : `level ${after.level}, ${after.exp} experience · ${levelGainsText(before, after)} · ${numbers}`,
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
function useInField(id: number): string[] {
  const here = loaded
  const row = heroRow()
  if (!here || !row) return ['The level table did not load, so nothing can be used.']
  const hero = heroNamed()
  const use = here.itemUses.get(id)?.field
  const uses =
    menuSay(MENU_SAYS.uses, { actor: hero, item: itemNamed(id) }) ??
    `${hero.name} uses ${nameOf(id)}.`
  if (use?.action === WING_ACTION) return flyHome(id)
  if (use?.action === HOLY_WATER_ACTION) return sprinkle(id)
  if (!use) return [uses, menuSay(MENU_SAYS.nothingHappens, {}) ?? 'But nothing happens.']
  const outcome = useOn(use, heroVitals(row), fieldRng)
  if (outcome.kind === 'unknown') return [`What ${nameOf(id)} does is not read yet; it is kept.`]
  if (outcome.kind !== 'noUse') bag = drop(bag, id) ?? bag
  return [uses, settle(outcome, row)]
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
  bag = drop(bag, id) ?? bag
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
  bag = drop(bag, id) ?? bag
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

/** Throw one of an item away, and say so. */
function discardInField(id: number): string[] {
  bag = drop(bag, id) ?? bag
  return [menuSay(MENU_SAYS.discarded, { item: itemNamed(id) }) ?? `${nameOf(id)} discarded.`]
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
function heroSpells(): MenuSpell[] | undefined {
  const here = loaded
  const table = here?.spellTable
  const row = heroRow()
  if (!here || !table || !row) return undefined
  return spellsLearnt(table, leader().vocation, row.level).flatMap((spell) => {
    const action = here.actions.get(spell.action)
    return action
      ? [{ action: spell.action, name: action.name, cost: action.cost, field: action.field }]
      : []
  })
}

/** The items panel's row, kept inside a bag that has lost an item. */
function keptInBag(state: MenuState): MenuState {
  if (state.panel !== 'items' || state.acting) return state
  return { ...state, row: Math.max(0, Math.min(state.row, bag.items.size - 1)) }
}

/** What a shop, the inn or the church is told about the items and the Hero. */
function counter(): Counter {
  return {
    name: nameOf,
    price: (id) => loaded?.goods.get(id)?.price,
    sells: (id) => loaded?.goods.get(id)?.sells,
    divination: () => {
      const levels = levelsFor(leader())
      if (!levels) return 'The level table did not load.'
      const s = standing(levels, leader().exp)
      return s.next
        ? `${s.next.exp - s.exp} more experience to reach level ${s.next.level}.`
        : 'There are no more levels to reach.'
    },
  }
}

/** Open what a line handed over to — see `services.ts`. */
function openService(service: Service): void {
  if (!loaded) return
  if (service.kind === 'SHOP') {
    const shop = loaded.shops.get(service.id)
    if (!shop) {
      status(`the line hands over to shop ${service.id}, which the shop table does not have`)
      return
    }
    visit = visitShop(shop)
  } else {
    visit = service.kind === 'INN' ? visitInn(service.id) : visitChurch(service.id)
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
  for (const line of [view.title, ...view.lines]) {
    const row = document.createElement('div')
    row.textContent = line
    panel.append(row)
  }
  menuEl.append(rows, panel)
  menuEl.hidden = false
  status(`${view.title} · ↑/↓ choose, f take, Esc back`)
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
function wornNumbers(worn: ReadonlyMap<Slot, number> = leader().equipped): {
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

/** A member's level row, where their vocation's table read — see `levelsFor`. */
function levelOf(member: Member): LevelRow | undefined {
  const levels = levelsFor(member)
  return levels ? standing(levels, member.exp, member.gains).level : undefined
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
  const worn = wornNumbers(member.equipped)
  return {
    name: nameFor(member),
    side: 'party',
    maxHp: row.maxHp,
    maxMp: row.maxMp,
    attack: row.strength + worn.attack,
    defence: row.resilience + worn.defence,
    agility: row.agility + worn.agility,
    deftness: row.deftness,
    resist: wornResistances(
      [...member.equipped.values()].flatMap((id) => {
        const own = loaded?.itemResistances.get(id)
        return own ? [own] : []
      }),
    ),
    might: row.magicalMight,
    mending: row.magicalMending,
    shield: member.equipped.has('shield'),
    block: blockChance(member.equipped.has('shield'), worn.block),
    exp: 0,
    gold: 0,
    level: row.level,
  }
}

/**
 * The party level a monster runs from: its level and margin from `fld_mondata`
 * added — see `FieldMonster.level`. A monster with no record there runs as
 * before, whenever it draws its Flee.
 */
function runsFromOf(number: number): { runsFrom?: number } {
  const field = loaded?.fieldMonsters.get(number)
  return field ? { runsFrom: field.level + field.runsFromMargin } : {}
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
function startFight(codes: readonly string[], canFlee: boolean, opening: Opening = 'even'): void {
  if (!loaded || !self || !cartridge) return
  const levels = levelsFor(leader())
  if (!levels) {
    status('the level table did not load, so the Hero has no numbers to fight with')
    return
  }
  const row = standing(levels, leader().exp, leader().gains).level
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
      // It runs only from a party past its level by its margin — `fld_mondata`, INFERRED.
      ...runsFromOf(who.number),
    })
    looks.push(monsterLookOf(cartridge, code))
  }
  const worn = wornNumbers()
  const hero: Fighter = {
    name: DEFAULT_CONTEXT.heroName,
    side: 'party',
    maxHp: row.maxHp,
    maxMp: row.maxMp,
    attack: row.strength + worn.attack,
    defence: row.resilience + worn.defence,
    agility: row.agility + worn.agility,
    // The chance of a critical climbs with deftness past 150 — `criticalChance`.
    deftness: row.deftness,
    // What the Hero takes of each element: a hundred each, and what is worn
    // added on — the game's own sum (`wornResistances`). Nothing the slice
    // wears carries any, so these are all whole; something later will not be.
    resist: wornResistances(
      [...leader().equipped.values()].flatMap((id) => {
        const own = loaded?.itemResistances.get(id)
        return own ? [own] : []
      }),
    ),
    // What a spell's amount may scale by — the level's own; what is worn is not added, ours.
    might: row.magicalMight,
    mending: row.magicalMending,
    shield: leader().equipped.has('shield'),
    // The game's: what is worn says, and only behind a shield — `blockChance`.
    block: blockChance(leader().equipped.has('shield'), worn.block),
    exp: 0,
    gold: 0,
    // What a monster weighs before it runs — see `Fighter.runsFrom`.
    level: row.level,
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
  const hp = new Map([[0, leader().hp ?? row.maxHp]])
  for (const [i, { who, member }] of behind.entries()) {
    const max = who ? who.numbers.maxHp : (levelOf(member)?.maxHp ?? 0)
    hp.set(i + 1, member.hp ?? max)
  }
  battlesFought++
  // The monsters' places first: they turn the Hero to face them.
  const foeSpots = spotsFor(foes.length)
  playBattleMusic()
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
  battleSpots = [undefined, ...party.slice(1).map((_, i) => besideHero(i)), ...foeSpots]
  cueStarted = performance.now()
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
function followersNow(): { place: number; member: Member; who: AttendingCharacter | undefined }[] {
  return members.slice(1).map((member, place) => ({
    place,
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
 * Where each companion stands in the field: the one in the party's second
 * place on the Hero's footsteps a pace back, the next a pace further, and so
 * on. None in a battle or an event, which stand them themselves, and none
 * while one stands on the Hero, as all do on arriving until the Hero walks off
 * — **ours**, both. Nor one the map has standing in it — Ivor, waiting in
 * Erinn's house at 2.2 — who is not in two places at once: the same model,
 * see `companionModel`. Ours too.
 */
function companionsInField(): {
  who: AttendingCharacter | undefined
  member: Member
  place: number
  x: number
  y: number
  z: number
}[] {
  if (!self || battle || playing) return []
  const hx = toFloat(self.state.x)
  const hz = toFloat(self.state.z)
  const near = toFloat(person().radius) * 2
  return followersNow().flatMap(({ who, member, place }) => {
    const trail = trails[place]
    if (!trail) return []
    // A story companion the map already has standing in it is not drawn twice.
    if (who && standingHere(who)) return []
    const x = toFloat(trail.x)
    const z = toFloat(trail.z)
    if (Math.hypot(x - hx, z - hz) < near) return []
    return [{ who, member, place, x, y: toFloat(trail.y), z }]
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
  return companionsInField().flatMap(({ who, place, x, y, z }) => {
    const walkingNow = trailWalking[place] === 1
    // **A created character is built from parts, like the Hero**, so they are
    // posed the same way rather than drawn from a whole `.chr` model. This is
    // what a party of four is made of; a story companion keeps their model.
    const built = dressed[place + 1]
    if (built && !who) {
      const motion = built.figure.motions.get(walkingNow ? 'run' : 'stand')
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
          motionFrame: walkingNow ? hero.motionFrame : 0,
        },
        built.figure,
        built.pieces,
        here.catalogue,
        measurements,
        motion,
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
    const frame = walking
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
  const spot = battleSpots[at.index]
  if (!fighter || !spot) return []
  const onShow = scene.phase === 'telling' ? (scene.cues[0] ?? []) : []
  const cue = onShow.find((c) => c.fighter === at.index)
  // Fallen, but not yet told of: still standing.
  const toldOf = !scene.cues.some((cues) =>
    cues.some((c) => c.fighter === at.index && c.motion === 'death'),
  )
  const lying = fighter.hp <= 0 && toldOf
  const name = cue ? COMPANION_MOTIONS[cue.motion] : lying ? COMPANION_MOTIONS.death : 'stand'

  // **A created character is posed from the parts they are built of.** Their
  // figure carries the same motion names a companion's model does, so the cue
  // above needs no translating — see `dressParty`.
  const built = at.model === undefined ? dressed[at.place] : undefined
  if (built && loaded) {
    const own = built.figure.motions.get(name) ?? built.figure.motions.get('stand')
    const length = own?.frameCount ?? 1
    const since = Math.max(0, Math.floor(((now - cueStarted) / 1000) * MAP_FPS))
    const at3 = cue
      ? Math.min(since, length - 1)
      : lying
        ? length - 1
        : Math.floor((now / 1000) * MAP_FPS) % Math.max(1, length)
    return playerPieces(
      {
        ...self,
        state: {
          ...self.state,
          x: fx32(Math.round(spot.x * FX32_ONE)),
          y: fx32(Math.round(spot.y * FX32_ONE)),
          z: fx32(Math.round(spot.z * FX32_ONE)),
        },
        facing: self.facing,
        motionFrame: at3,
      },
      built.figure,
      built.pieces,
      loaded.catalogue,
      measurements,
      own,
    )
  }

  const look = at.model === undefined ? undefined : actorLookOf(rom, at.model, at.packs)
  if (!look) return []
  const motion = look.motions.get(name) ?? look.motions.get('stand')
  const length = motion?.frameCount ?? 1
  const since = Math.max(0, Math.floor(((now - cueStarted) / 1000) * MAP_FPS))
  const frame = cue
    ? Math.min(since, length - 1)
    : lying
      ? length - 1
      : Math.floor((now / 1000) * MAP_FPS)
  const placement = {
    id: at.index,
    map: 0,
    x: spot.x,
    y: spot.y,
    z: spot.z,
    facing: self.facing,
    offset: 0,
  } as NpcPlacement
  const member = { name: at.model ?? '', model: look.model, motion, floor: look.floor, placement }
  return [
    ...castPieces(member, look.catalogue, characterScale, frame),
    // What they hold, in their hands — see `heldOf`.
    ...(loaded ? heldPieces(member, heldOf(at.id), loaded.catalogue, characterScale, frame) : []),
  ]
}

/**
 * What an attending character holds in battle: their weapon and shield in
 * `attnpc` — Ivor's copper sword and pot lid — as parts of the Hero's
 * wardrobe, hung from the forearms as the Hero's are (`CARRY_BONES`). A let's
 * play shows Ivor fighting so.
 */
function heldOf(id: number): { model: Model; bone: string }[] {
  const who = loaded?.attending.find((w) => w.id === id)
  const wardrobe = loaded?.wardrobe
  if (!who || !wardrobe) return []
  const held: { model: Model; bone: string }[] = []
  const carried = [
    [who.weapon, CARRY_BONES.hands.weapon],
    [who.shield, CARRY_BONES.hands.shield],
  ] as const
  for (const [item, bone] of carried) {
    const name = item === undefined ? undefined : partName(item)
    const model = name === undefined ? undefined : wardrobe.parts.get(name)
    if (model) held.push({ model, bone })
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
} as const

/**
 * The monsters in the fight, turned to face the Hero: each playing what the
 * page on show has it do — once through, holding the last frame — or its
 * stand. One that has fallen stays until the page that tells of it is gone.
 */
function foePieces(now: number): Piece[] {
  if (!battle || !self) return []
  const scene = battle
  const looping = Math.floor((now / 1000) * MAP_FPS)
  const since = Math.max(0, Math.floor(((now - cueStarted) / 1000) * MAP_FPS))
  const facing = self.facing + Math.PI
  const onShow = scene.phase === 'telling' ? (scene.cues[0] ?? []) : []
  return scene.state.fighters.flatMap((fighter, i) => {
    const look = battleLooks[i]
    const at = battleSpots[i]
    if (fighter.side !== 'foes' || !look || !at) return []
    // A monster fallen or fled stays until its page is told.
    const going = scene.cues.some((cues) =>
      cues.some((c) => c.fighter === i && (c.motion === 'death' || c.motion === 'flee')),
    )
    if ((fighter.hp <= 0 || fighter.fled) && !going) return []
    const cue = onShow.find((c) => c.fighter === i)
    const motion = cue ? CUE_MOTIONS[cue.motion] : 'stand'
    const length = look.motions.get(motion)?.frameCount ?? 1
    const frame = cue ? Math.min(since, length - 1) : looping
    return monsterPieces(look, at, facing, characterScale, motion, frame)
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

/** Draw the battle: the message on show, or the rows to choose from, and the Hero's numbers. */
function showBattle(): void {
  if (!battle) return
  const labels = labelsOf(battle.state)
  if (battle.phase === 'telling' && battle.pages[0] !== undefined) {
    talkEl.replaceChildren()
    const body = document.createElement('div')
    body.textContent = battle.pages[0]
    talkEl.append(body)
    talkEl.hidden = false
  } else {
    talkEl.hidden = true
  }
  menuEl.replaceChildren()
  const rows = battleRows(battle)
  if (rows.length > 0) {
    const commands = document.createElement('div')
    commands.className = 'commands'
    for (const [index, row] of rows.entries()) {
      const item = document.createElement('div')
      item.textContent = row
      if (index === battle.cursor) item.className = 'chosen'
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

/**
 * What a battle comes to, once, as it comes to it: a win pays out experience
 * and gold, and a level reached says what it brought; a loss brings the Hero
 * round with half the gold gone. **The loss is a stand-in**: the game sends
 * the Hero back to a church, which is not done here.
 */
function settleBattle(): void {
  if (!battle || battle.settled || battle.state.outcome === 'ongoing') return
  const hero = battle.state.fighters[0]
  const name = DEFAULT_CONTEXT.heroName
  const levels = levelsFor(leader())
  const words = loaded?.battleWords
  const said = (number: number, telling: Telling) => {
    const template = words?.results.get(number)
    return words && template !== undefined
      ? tellBattle(template, telling, words.articles).text
      : undefined
  }
  const lines: string[] = []
  if (eventFight) eventFight = { ...eventFight, won: battle.state.outcome === 'won' }
  if (battle.state.outcome === 'won' && hero && levels) {
    const { exp, gold } = spoils(battle.state)
    const before = standing(levels, leader().exp, leader().gains).level
    leader().exp += exp
    bag = take(bag, { gold })
    const after = standing(levels, leader().exp, leader().gains).level
    leader().hp = Math.min(after.maxHp, hero.hp + (after.maxHp - before.maxHp))
    // MP spent in the battle stay spent, but a level's new MP come with it.
    const mp = Math.min(after.maxMp, hero.mp + (after.maxMp - before.maxMp))
    leader().mp = mp >= after.maxMp ? undefined : mp
    const earned = said(RESULT_SAYS.earns, { values: { str_1: name, val_1: exp } })
    const obtained = said(RESULT_SAYS.gold, { leader: heroNamed(), values: { val_1: gold } })
    lines.push(
      earned !== undefined && obtained !== undefined
        ? `${earned}\n${obtained}`
        : `${name} gains ${exp} experience and ${gold} gold coin${gold === 1 ? '' : 's'}.`,
    )
    if (after.level > before.level) {
      lines.push(
        said(RESULT_SAYS.level, { target: heroNamed(), values: { val_1: after.level } }) ??
          `${name} reaches level ${after.level}!`,
      )
      lines.push(levelGainsText(before, after))
    }
    // What the monsters dropped — rolled the game's way, from its own
    // generator, after the experience and the gold are settled; see `dropsWon`.
    for (const won of dropsWon(battle.state, dropRng)) {
      bag = take(bag, { item: won.item })
      const monster = monsterNamed(won.kind) ?? { name: won.from }
      const item = itemNamed(won.item)
      const chest = said(RESULT_SAYS.dropsChest, { monsters: [monster], target: heroNamed() })
      const holds = said(RESULT_SAYS.chestHolds, { item, target: heroNamed() })
      lines.push(
        chest !== undefined && holds !== undefined
          ? `${chest}\n${holds}`
          : `${monster.name} drops a treasure chest! It contains ${item.name}.`,
      )
    }
  } else if (battle.state.outcome === 'lost') {
    leader().hp = undefined
    leader().mp = undefined
    // Half the gold is the game's — a published guide: "Money on hand is halved
    // when your characters die" — though the rule is not found in code, and
    // rounding down is ours. Coming round in the village church is ours — see
    // `CHURCH`; the game's own words for either are not found.
    bag = pay(bag, Math.floor(bag.gold / 2)) ?? bag
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
    const left = battle.state.outcome === 'lost' ? fighter.maxHp : Math.max(1, fighter.hp)
    // By their place, so a created character keeps their wounds too.
    const along = members[at.place]
    if (along) along.hp = left >= fighter.maxHp ? undefined : left
  }
  battle = { ...withPages(battle, lines), settled: true }
}

/** Put the battle away. */
function endFight(): void {
  battle = undefined
  playMapMusic(true)
  // The weapon and shield go back on the Hero's back — see `dressHero`.
  dressHero()
  if (roaming) roaming = calmFor(roaming, ROAM_CALM)
  battleLooks = []
  battleSpots = []
  battleCompanions = []
  talkEl.hidden = true
  menuEl.hidden = true
  const fought = eventFight
  eventFight = undefined
  if (wakeInChurch) {
    wakeInChurch = false
    if (enter(CHURCH.map, CHURCH.spot)) {
      status(`${DEFAULT_CONTEXT.heroName} comes round in the church`)
      if (fought) followBattle(fought)
      return
    }
  }
  status(`back on the map · HP ${leader().hp ?? 'full'}`)
  if (fought) followBattle(fought)
}

/**
 * Play event `number` in the map the Hero is in — see `event.ts`. False when it
 * will not read. `afterTalk` when a talk record plays it, so it carries straight
 * on from the conversation — see `EventStage.afterTalk`; ours, that only these do.
 */
function startEvent(number: number, afterTalk = false): boolean {
  if (!loaded || !self) return false
  const name = `ev${String(number).padStart(5, '0')}`
  const script = loaded.eventScript(number)
  if (!script) {
    status(`${name} will not read`)
    return false
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
  playing.player.stage.afterTalk = afterTalk
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
  playing.player.stage.timeOfDay = GAME_PHASE[timeNow()]
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
 * The event's frames for this much time — 60 a second, as the scripts count
 * them — and then what they came to: the message the text box shows, and
 * where the Hero, character 0, now is.
 */
function playEvent(elapsedMs: number): void {
  const now = playing
  if (!now || !self) return
  now.carry = Math.min(now.carry + elapsedMs, TICK_MS * 8)
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
  // The sounds the scene asked for this frame.
  for (const sound of now.player.stage.sounds.splice(0)) void playSound(sound)
  const shown = now.player.stage.message
  // The event's message stays up until it is read to its end: whatever closed
  // the box, it comes back — or the event would wait on it for ever, and the
  // Hero with it, still lying where the event last put them.
  if (shown !== undefined && (shown !== now.showing || !talking)) {
    now.showing = shown
    talking = startConversation(
      { id: -1, name: `ev${now.event}`, x: 0, z: 0 },
      `ev${now.event}, message ${shown}`,
      [now.messages.get(shown) ?? `(message ${shown} says nothing)`],
      [`message ${shown}`],
    )
    showTalk()
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
  const member = [...loaded.cast.members, ...loaded.cast.sprites2d].find(
    (m) => m.placement.id === id,
  )
  if (!member) {
    status(`nobody with placement ${id} is in ${loaded.code}`)
    return
  }
  const at = castPlaced(member.placement)
  const back = TALK_REACH * 0.5
  const spot = { x: at.x - Math.sin(at.facing) * back, z: at.z - Math.cos(at.facing) * back }
  self.state = {
    ...self.state,
    x: fx32(Math.round(spot.x * FX32_ONE)),
    y: fx32(Math.round(at.y * FX32_ONE)),
    z: fx32(Math.round(spot.z * FX32_ONE)),
  }
  self.facing = facingToward(spot, at)
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
function endEvent(): void {
  const done = playing
  playing = undefined
  if (!done) return
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
}

/**
 * What follows an event, by its own trigger record — see `eventOutcome` in
 * `@minstrel/game-formats`, INFERRED throughout. The story moves on to the
 * stage and step the record sets; the flags it sets are set — a stage's own,
 * cleared when the stage moves on, INFERRED from the records testing them
 * naming none set in another; and where it goes on to, it goes: the map, and
 * the event played there.
 */
function followEvent(event: number): void {
  if (!loaded) return
  const outcome = eventOutcome(loaded.triggers, event, loaded.mapId)
  if (!outcome) return
  const { stage, onward } = outcome
  let closing = false
  if (stage) {
    const moved =
      !storyStage || storyStage.major !== stage.major || storyStage.minor !== stage.minor
    closing = moved && closesTheSlice(stage)
    const stepped = moved || storyStep !== stage.step
    if (moved) {
      storyFlags.clear()
      storyMarks.clear()
    }
    storyStage = { major: stage.major, minor: stage.minor }
    storyStep = stage.step
    // The cast stands where the stage and step have them: the Hexagon's
    // statue steps aside at 2.4, step 5 — see `castOf`.
    if (stepped) {
      // Where an event left anyone is kept only until the step moves — see `castLeft`.
      castLeft.clear()
      const cast = loaded.castAt(storyStage, stepNow())
      loaded = { ...loaded, cast }
      // A sliding piece goes where its character now stands — see `slide.ts`.
      aimSlides(slides, (id) => standingIn(cast, id))
      poseMap(Math.max(mapFrame, 0))
    }
  }
  for (const flag of outcome.flags) storyFlags.add(flag)
  // Whoever its record brings in or sends away — Ivor, over 2.2 and 2.3.
  members = partyAfter(members, outcome, freshMember)
  status(
    `ev${event} is over · the story is at ${storyStage?.major ?? '?'}.${storyStage?.minor ?? '?'}` +
      `, step ${storyStep}` +
      (storyFlags.size > 0 ? ` · flags ${[...storyFlags].sort((a, b) => a - b).join(' ')}` : '') +
      (members.length > 1
        ? ` · party ${members
            .slice(1)
            .map((m) => m.attnpc)
            .join(' ')}`
        : ''),
  )
  // Patty rescued and the story past the slice: its title card — see `card.ts`.
  if (closing) showCard()
  if (outcome.battle !== undefined) {
    startEventBattle(outcome.battle)
    return
  }
  if (onward) {
    const code = loaded.mapCodeOf(onward.map)
    if (code && (code === loaded.code || enter(code))) startEvent(onward.event)
  }
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
    // `?preset=` dresses the Hero as a ready-made character — see `showPreset`.
    const shown = place === 0 ? presetOutfit : undefined
    const made =
      member.appearance === undefined ? undefined : loaded?.presets[member.appearance]?.outfit
    const outfit =
      shown ?? (made && outfitOfPreset(made, carry, has)) ?? outfitOf(member.equipped, carry, has)
    const figure = dressFigure(wardrobe, outfit)
    return { figure, pieces: figurePieces(figure) }
  })
  const hero = dressed[0]
  if (hero) loaded = { ...loaded, figure: hero.figure, pieces: hero.pieces }
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
    made.push({
      ...member,
      appearance: Number(preset),
      vocation: /^\d+$/.test(vocation ?? '') ? Number(vocation) : HERO_VOCATION_NUMBER,
    })
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

/** The preset the Hero is being shown as, if `?preset=` asked for one. */
let presetOutfit: Outfit | undefined

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
  const outfit = outfitOfPreset(preset.outfit, 'back', has)
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
    if (!actor.model) return []
    const look = actorLookOf(rom, actor.model, actor.packs)
    if (!look) return []
    // One played once goes on to the next, or holds its last frame — see `sceneMotion`.
    const posed = sceneMotion((name) => look.motions.get(name), actor, stage.frame, MAP_FPS)
    const motion = posed?.motion
    const frame = posed?.frame ?? 0
    const member = { name: actor.model, model: look.model, motion, floor: look.floor, placement }
    const pieces = [
      ...castPieces(member, look.catalogue, characterScale, frame),
      ...hungPieces(rom, stage, id, member, frame),
    ]
    return opacity < 1 ? pieces.map((piece) => ({ ...piece, opacity })) : pieces
  })
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
  for (const [index, command] of MENU_COMMANDS.entries()) {
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
  }
  menuEl.hidden = false
}

/** Draw the equipment screen for the menu as it stands; false when it cannot be drawn. */
/** The figure the portrait draws, dressed for the hand — see `heroPortrait`. */
let portraitFigure: { key: string; figure: Loaded['figure']; pieces: Loaded['pieces'] } | undefined
/** The portrait's own renderer, drawing to nothing behind — see `heroPortrait`. */
const portraitEl = document.createElement('canvas')
let portrait: ModelRenderer | null | undefined
/** How many times the screen's pixels the portrait is drawn at, for crispness when the screen is scaled up. */
const PORTRAIT_SCALE = 3

/**
 * The Hero as they stand dressed, for the equipment screen: the figure at
 * rest, facing the camera, drawn alone by a second renderer onto a clear
 * ground. The framing — the camera at the waist, a figure and a quarter
 * away, so the figure fills the frame as the screenshots' does — is ours.
 */
function heroPortrait(): HTMLCanvasElement | undefined {
  const here = loaded
  if (!here || !self || portrait === null) return undefined
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
  const standing: Player = {
    ...self,
    state: { ...self.state, x: fx32(0), y: fx32(0), z: fx32(0) },
    facing: 0,
    motionFrame: 0,
  }
  // Dressed with the weapon and shield in hand, as the screenshots' figure
  // holds them; kept until what is worn changes.
  const key = [...leader().equipped.entries()].map(([slot, item]) => `${slot}=${item}`).join(',')
  if (portraitFigure?.key !== key) {
    const wardrobe = here.wardrobe
    const has = (name: string) => wardrobe.parts.has(name) || wardrobe.textures.has(name)
    const figure = dressFigure(wardrobe, outfitOf(leader().equipped, 'hands', has))
    portraitFigure = { key, figure, pieces: figurePieces(figure) }
  }
  const { figure, pieces: dressed } = portraitFigure
  const motion = figure.motions.get('stand')
  const pieces = playerPieces(standing, figure, dressed, here.catalogue, measurements, motion)
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
  equipScreens.draw(top, bottom, {
    hero: context.hero,
    level: context.standing?.level.level,
    equipped: context.equipped ?? NOTHING_EQUIPPED,
    bag,
    itemName: nameOf,
    row: menu.row,
    picking: menu.picking,
    choices: menu.picking ? choicesFor(menu.picking, bag, tableOf) : undefined,
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
    portrait: heroPortrait(),
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
    // **The cues are read and nothing plays them**, on purpose. `run.cues`
    // carries the id the game would ask for — `<ME_008>` is 57, `<SE_014>` is
    // a flat 14 — and that id belongs to the game's own sound-request space,
    // which is not `playEffect`'s index into the effect archive's records.
    // This did play them for half a day, and Gleeba's witness caught it:
    // "no effect 14 in the sound archive". Playing the archive's 14th effect
    // because the game asked for sound 14 is the kind of mapping that appears
    // to work. See `SoundCue` and `docs/still-open.md`.
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

/** Put the slice's title card up — see `card.ts`. */
function showCard(): void {
  const line = (tag: string, className: string, text: string) => {
    const element = document.createElement(tag)
    element.className = className
    element.textContent = text
    return element
  }
  cardEl.replaceChildren(
    line('div', 'card-end', CARD.end),
    line('h1', 'card-title', CARD.title),
    line('p', 'card-line', CARD.line),
    line('div', 'card-prompt', CARD.prompt),
  )
  self?.held.clear()
  cardEl.hidden = false
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
  if (turn === 'turnLeft' || turn === 'turnRight') {
    turning.add(turn)
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
  // The title card takes every key while it is up; confirm or cancel puts it away.
  if (!cardEl.hidden) {
    if (action === 'confirm' || action === 'cancel') {
      cardEl.hidden = true
      status('the slice is over · the Hexagon and Angel Falls are still there to walk')
    }
    event.preventDefault()
    return handled
  }
  // A battle takes every key while it lasts: the same keys as the menu.
  if (battle) {
    if (action === 'up') battle = battleMove(battle, -1)
    else if (action === 'down') battle = battleMove(battle, 1)
    else if (action === 'confirm') {
      const round = battle.state.round
      battle = battleChoose(battle, battleItems(), battleSpells())
      cueStarted = performance.now()
      // An item used this round is gone from the bag.
      if (battle.state.round !== round) {
        for (const event of battle.events)
          if (event.kind === 'item') bag = drop(bag, event.item) ?? bag
      }
      settleBattle()
      if (battle.phase === 'over') {
        endFight()
        event.preventDefault()
        return handled
      }
    } else if (action === 'cancel' || action === 'menu') battle = battleBack(battle)
    showBattle()
    event.preventDefault()
    return handled
  }
  // `p` picks a fight — see `FIGHT` — and Shift+P the boss.
  if (key === 'p' && loaded && !talking && !menu && !visit && !playing) {
    startFight(event.shiftKey ? BOSS_FIGHT : fightCodes(), !event.shiftKey)
    event.preventDefault()
    return handled
  }
  // `l` gives the Hero a level and Shift+L takes one back — see `levelTo`.
  // It works with the menu up, so the status panel can be watched as the
  // levels go by; not in a battle, whose fighters took their numbers when it
  // began, nor while the collision fit has `l` for its own.
  if (key === 'l' && loaded && !battle && !showCollision) {
    levelTo(undefined, event.shiftKey ? -1 : 1)
    event.preventDefault()
    return handled
  }
  // A shop, the inn or the church: the same keys as the menu, over its list.
  if (visit) {
    const told = counter()
    if (action === 'up') visit = moveVisit(visit, -1, bag, told)
    else if (action === 'down') visit = moveVisit(visit, 1, bag, told)
    else if (action === 'confirm') {
      const outcome = chooseInVisit(visit, bag, told)
      bag = outcome.bag
      visit = outcome.visit
      // A night at the inn restores the Hero whole, and the morning comes.
      if (outcome.rested) {
        fieldSeconds = 0
        // The whole party rests, not only the Hero.
        for (const member of members) {
          member.hp = undefined
          member.mp = undefined
        }
      }
      if (outcome.confessed && visit) visit = { ...visit, said: confess() }
    } else if (action === 'cancel' || action === 'menu') visit = leaveVisit(visit)
    showMenu()
    event.preventDefault()
    return handled
  }
  // The main menu: `x` opens it, and it or Esc goes back a step at a time.
  // While it is up the Hero stands still and the movement keys choose.
  if (menu) {
    if (action === 'up') menu = moveCursor(menu, -1, menuContext())
    else if (action === 'down') menu = moveCursor(menu, 1, menuContext())
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
            : taken.cast !== undefined
              ? castInField(taken.cast)
              : undefined
      if (said && menu) menu = { ...keptInBag(menu), said }
      if (taken.equip) {
        const worn = equip(bag, leader().equipped, taken.equip.slot, taken.equip.item)
        if (worn) {
          bag = worn.bag
          leader().equipped = worn.equipped
          // Drawn in what they now wear — see `dressHero`.
          dressHero()
        }
      }
      if (taken.talk) {
        showMenu()
        talk()
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
  if ((key === 'v' || key === 'n') && loaded && !showCollision) {
    moveChapter(key === 'n' ? 1 : -1)
    event.preventDefault()
  }
  // Flick through the story stages the cast's records name: `t` back, `y` on.
  if ((key === 't' || key === 'y') && loaded) {
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
  if (key === 'c') {
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
})

// A key held as the window loses focus never sends its `keyup`, and the camera
// would spin on for ever. The walk has the same trouble and clears with it.
addEventListener('blur', () => {
  turning.clear()
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
