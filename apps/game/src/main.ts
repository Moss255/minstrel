import { figureScale, Measurements } from '@minstrel/actor'
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
  type NpcPlacement,
  type StoryArea,
  spellsLearnt,
  type Treasure,
} from '@minstrel/game-formats'
import { ModelRenderer, type Piece } from '@minstrel/gl'
import {
  type Animation,
  type Geometry,
  loopFrames,
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
  type CollisionWorld,
  calmFor,
  createCollisionWorld,
  createFollower,
  type Fighter,
  type Follower,
  groundBelow,
  headingAngle,
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
import { backdrop, findSpawn, inMarsh, placeGeometry, WORLD_SCALE, waysOut } from '@minstrel/world'
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
import {
  CABINET_OPENING,
  CABINET_SHUT,
  type Cabinet,
  cabinetsOf,
  cabinetTargets,
  motionFrame,
} from './cabinets.ts'
import { CARD, closesTheSlice } from './card.ts'
import { castPieces, propPieces, spritePieces, standingFrame } from './cast.ts'
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
  COMPANION_MOTIONS,
  companionFighter,
  companionLook,
  companionModel,
  companionNamed,
  companionsAt,
  FOLLOW_TICKS,
  IVOR,
  PARTY_MOST,
} from './companion.ts'
import { doorGate, doorTaken } from './doors.ts'
import { type EquipScreens, makeEquipScreens, readEquipPieces } from './equip-screen.ts'
import { choicesFor, type Equipped, equip, NOTHING_EQUIPPED } from './equipment.ts'
import { type EventCamera, EventPlayer } from './event.ts'
import { axesFrom, lastSearch, readSticks, type Sticks } from './gamepad.ts'
import {
  type Gains,
  gain,
  HERO_VOCATION_NUMBER,
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
import {
  bagOf,
  equippedOf,
  equippedRecord,
  readSave,
  SAVE_VERSION,
  type SaveGame,
  type SaveStore,
  writeSave,
} from './save.ts'
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
import { shadowPieces } from './shadows.ts'
import { aimSlides, moveSlides, type Slide, standingIn, startSlides } from './slide.ts'
import { doorShut, doorsOf, moveDoors, type SwingDoor, swingGeometry } from './swing.ts'
import {
  type Conversation,
  DEFAULT_CONTEXT,
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
  type Talker,
  type TextContext,
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
const menuEl = must<HTMLDivElement>('#menu')
const cardEl = must<HTMLDivElement>('#card')
const resumeRow = must<HTMLLabelElement>('#resume-row')
const resumeEl = must<HTMLInputElement>('#resume')

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
/** What the Hero carries — see `bag.ts` — starting from a stand-in purse, `STARTING_GOLD`. */
let bag: Bag = take(EMPTY_BAG, { gold: STARTING_GOLD })
/** What the Hero wears — see `equipment.ts`. */
let equipped: Equipped = STARTING_EQUIPMENT
/** The Hero's experience. Nothing gives any until there are battles; a save can. */
let heroExp = 0
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
      readonly event: number
      readonly messages: ReadonlyMap<number, string>
      showing: number | undefined
      carry: number
      readonly framing: { pitch: number; distance: number; yaw: number }
    }
  | undefined
/** The most monsters a battle here holds: ours, so the row stays in view. */
const BATTLE_MOST = 5
/** The Hero's hit points between battles; undefined is full. */
let heroHp: number | undefined
/** The Hero's MP now; undefined is full. */
let heroMp: number | undefined
/** Each companion's hit points between battles, by their number in `attnpc`; one not here is whole. */
const companionHp = new Map<number, number>()
/**
 * Footsteps behind the Hero: a trail for each place in the party after
 * theirs, each a pace further back — see `follow.ts`; begun anew in each map.
 */
let trails: Follower[] = []
/** Which way each place in the line faces in the field, and whether its footsteps moved this frame. */
const trailFacing = new Float64Array(PARTY_MOST - 1)
const trailWalking = new Uint8Array(PARTY_MOST - 1)
/** Where each trail stood before this frame's ticks, x and z, to tell who walked. */
const trailWas = new Int32Array((PARTY_MOST - 1) * 2)
/** Moving ticks walked in the poison marsh and not yet paid for — see `marsh.ts`. */
let marshCarry = 0
/** One of those beside the Hero in the battle under way: who, their place in it, and their look. */
interface BattleCompanion {
  readonly id: number
  readonly index: number
  readonly model: string
  readonly packs: readonly string[]
}
let battleCompanions: readonly BattleCompanion[] = []
/** What seeds have added to the Hero's numbers, for good — see `hero.ts`. */
let heroGains: Gains = {}
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
    ...loaded.cast.members.flatMap((member) => castPieces(member, cat, characterScale, frame)),
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
  // `?at=x,z` stands the Hero there, in world units, on the highest floor —
  // ours, for looking at a spot a headless browser cannot walk to.
  const spot = /^(-?[\d.]+),(-?[\d.]+)$/.exec(params.get('at') ?? '')
  const arrival = spot ? { x: Number(spot[1]), y: 0, z: Number(spot[2]), facing: 0 } : undefined
  if (!enter(map, arrival)) {
    startEl.hidden = false
    return
  }
  // `?level=20` puts the Hero at that level, with its experience — ours, so a
  // headless browser can see a fight through.
  const level = Number(params.get('level'))
  const row = Number.isInteger(level) ? loaded?.heroLevels?.levels[level - 1] : undefined
  if (row) heroExp = row.exp
  if (wantedEvent !== undefined) startEvent(wantedEvent)
  else playEntryEvent()
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
  bag = bagOf(game)
  equipped = equippedOf(game)
  heroExp = game.exp
  heroHp = game.hp ?? undefined
  heroMp = game.mp ?? undefined
  heroGains = { ...game.gains }
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
    gold: bag.gold,
    items: [...bag.items],
    equipped: equippedRecord(equipped),
    opened: [...openedTreasure],
    exp: heroExp,
    hp: heroHp ?? null,
    mp: heroMp ?? null,
    gains: heroGains,
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
  fillBag(opened)
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
  setTimeout(() => {
    const arrived = enter(door.to, {
      x: door.arriveX,
      y: door.arriveY,
      z: door.arriveZ,
      facing: door.arriveFacing,
    })
    travelling = false
    if (arrived) playEntryEvent()
  }, 0)
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
    padSeen ? 'left stick to walk · right stick to look' : 'WASD to walk · drag to turn',
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
  // Each companion where they walk, or on the Hero while they stand on them.
  const walking = companionsInField()
  const companions = companionsNow().flatMap((who, place) => {
    if (standingHere(who)) return []
    const seen = walking.find((w) => w.place === place)
    return [{ x: seen ? seen.x / unit : hero.x, z: seen ? seen.z / unit : hero.z, name: who.name }]
  })
  drawMinimap(context, minimapShown, [hero, ...companions])
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
    const seconds = elapsedMs / 1000
    camera.yaw -= sticks.lookX * LOOK_RATE * seconds
    // The follow camera clamps this to its own range on the same frame.
    camera.pitch += sticks.lookY * TILT_RATE * seconds
  }

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
    const { moving, travelled, marshTicks } = playing
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
    if (roaming && !battle && !menu && !visit && !talking && !playing) {
      roamCarry = Math.min(roamCarry + elapsedMs, TICK_MS * 8)
      while (roamCarry >= TICK_MS && roaming) {
        roamCarry -= TICK_MS
        const next = tickRoaming(roaming, world, roamKinds, self.state, roamRng, ROAM_RULES)
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
    const shot = playing?.player.stage.camera
    if (shot?.target) aimAtShot(shot)
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
    const heroPose = heroEventPose()
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
              ...loaded.cast.members.map((member) => member.placement),
              ...loaded.cast.sprites2d.map((sprite) => sprite.placement),
              { x: toFloat(self.state.x), y: toFloat(self.state.y), z: toFloat(self.state.z) },
              ...companionsInField().map(({ x, y, z }) => ({ x, y, z })),
            ],
            (material) => textureFor(loaded?.catalogue ?? { textures: new Map() }, material),
          )
        : []),
      ...loaded.cast.sprites2d.flatMap((s) =>
        spritePieces(
          s,
          toFloat(PERSON.height) * worldScale,
          camera.yaw,
          standingFrame(s, camera.yaw),
        ),
      ),
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
  renderer.draw(camera, false)
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
/** `?lighting=night` builds the map's night pieces instead of its day ones. */
const wantedLighting = params.get('lighting') === 'night' ? 'night' : 'day'
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

async function chose(file: File): Promise<void> {
  status(`reading ${file.name}…`)
  begin(new Uint8Array(await file.arrayBuffer()), wantedMap)
}

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
  treasureDrawn = [
    // A chest is drawn with its own model; anything else placed keeps a marker.
    ...chestPieces(treasures, loaded.chests, isOpen, (material) =>
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
  openedTreasure.add(key)
  talking = startConversation(
    { ...target, id: treasure.index ?? target.id },
    `${cabinet ? `${cabinet.stem}, ` : ''}kind 0x${treasure.kind.toString(16)} in ${loaded.code}`,
    [treasureText(treasure, already, found.text)],
    [already ? 'already open' : found.note],
  )
  refreshTreasures()
  showTalk()
  return true
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
/** The last of a prompt's answers given in this talk, from 0. */
let talkAnswer: number | undefined

function talk(everyLine = false): void {
  if (!loaded || !self) return
  if (talking) {
    const ending = talking
    talking = nextPage(talking, talkContext)
    if (talking?.answered !== undefined) talkAnswer = talking.answered
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
    return
  }
  // While an event plays, `f` only reads its messages.
  if (playing) return
  talkOnward = undefined
  talkAnswer = undefined
  const cast: Talker[] = [
    ...[...loaded.cast.members, ...loaded.cast.sprites2d].map((member) => ({
      id: member.placement.id,
      name: member.name,
      x: member.placement.x,
      z: member.placement.z,
    })),
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
      night: wantedLighting === 'night',
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
    } else if (choice?.kind === 'event') {
      // Played, not read out, so that what follows it follows — see `followEvent`.
      if (loaded.eventScript(choice.event) && startEvent(choice.event)) return
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

/** What the menu's panels are told. */
function menuContext(): MenuContext {
  const levels = loaded?.heroLevels
  const words = loaded?.menuWords
  const now = levels ? standing(levels, heroExp, heroGains) : undefined
  return {
    hero: DEFAULT_CONTEXT.heroName,
    map: loaded?.code,
    stage: storyStage ? `${storyStage.major}.${storyStage.minor}` : undefined,
    // The vocation in the menu's own words — `str_tm` 2106, the Minstrel.
    standing: now && {
      ...now,
      vocation: words?.get(VOCATION_WORDS + HERO_VOCATION_NUMBER) ?? now.vocation,
    },
    hp: heroHp,
    mp: heroMp,
    bag,
    equipped,
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
  return spellsLearnt(table, HERO_VOCATION_NUMBER, row.level).flatMap((learnt) => {
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
  const levels = loaded?.heroLevels
  return levels ? standing(levels, heroExp, heroGains).level : undefined
}

function heroVitals(row: LevelRow): Vitals {
  return {
    hp: Math.min(heroHp ?? row.maxHp, row.maxHp),
    maxHp: row.maxHp,
    mp: Math.min(heroMp ?? row.maxMp, row.maxMp),
    maxMp: row.maxMp,
  }
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
      heroHp = outcome.hp >= row.maxHp ? undefined : outcome.hp
      return (
        actionSay(outcome.message, { target: hero }) ??
        menuSay(MENU_SAYS.healed, { target: hero }) ??
        `${hero.name} recovers ${outcome.amount} HP.`
      )
    case 'mp':
      heroMp = outcome.mp >= row.maxMp ? undefined : outcome.mp
      return (
        actionSay(outcome.message, { target: hero }) ??
        `${hero.name} recovers ${outcome.amount} MP.`
      )
    case 'gain':
      heroGains = gain(heroGains, outcome.stat, outcome.amount)
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
  const cast = castOn(spell, heroVitals(row), fieldRng)
  if (cast.outcome.kind === 'notEnoughMp') {
    return [menuSay(MENU_SAYS.notEnoughMp, {}) ?? 'Not enough MP!']
  }
  if (cast.outcome.kind === 'unknown') {
    return [`What ${spell.name} does outside a battle is not read yet.`]
  }
  heroMp = cast.mp >= row.maxMp ? undefined : cast.mp
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
  return spellsLearnt(table, HERO_VOCATION_NUMBER, row.level).flatMap((spell) => {
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
    divination: () => {
      const levels = loaded?.heroLevels
      if (!levels) return 'The level table did not load.'
      const s = standing(levels, heroExp)
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
  const zone = here.fieldZones.find((z) => z.kind === 0) ?? here.fieldZones[0]
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
  startFight(codes, true)
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
function wornNumbers(): { attack: number; defence: number; agility: number } {
  let attack = 0
  let defence = 0
  let agility = 0
  for (const item of equipped.values()) {
    const numbers = loaded?.itemStats.get(item)
    attack += numbers?.attack ?? 0
    defence += numbers?.defence ?? 0
    agility += numbers?.agility ?? 0
  }
  return { attack, defence, agility }
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
function startFight(codes: readonly string[], canFlee: boolean): void {
  if (!loaded || !self || !cartridge) return
  const levels = loaded.heroLevels
  if (!levels) {
    status('the level table did not load, so the Hero has no numbers to fight with')
    return
  }
  const row = standing(levels, heroExp, heroGains).level
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
      name: renderName(who.name),
      side: 'foes',
      maxHp: numbers.maxHp,
      maxMp: numbers.maxMp,
      attack: numbers.attack,
      defence: numbers.defence,
      agility: numbers.agility,
      shield: false,
      exp: numbers.exp,
      gold: numbers.gold,
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
    shield: equipped.has('shield'),
    exp: 0,
    gold: 0,
  }
  // Whoever goes along stands and fights beside the Hero, in their places —
  // see `companionsAt`.
  const companions = companionsNow()
  const party: Fighter[] = [
    hero,
    ...companions.map((who) => companionFighter(who, (id) => loaded?.itemStats.get(id))),
  ]
  const hp = new Map([[0, heroHp ?? row.maxHp]])
  for (const [i, who] of companions.entries()) {
    hp.set(i + 1, companionHp.get(who.id) ?? who.numbers.maxHp)
  }
  battlesFought++
  // The monsters' places first: they turn the Hero to face them.
  const foeSpots = spotsFor(foes.length)
  battle = beginBattle([...party, ...foes], BigInt(battlesFought) * 0x9e3779b97f4a7c15n, {
    canFlee,
    hp,
    mp: new Map([[0, heroMp ?? row.maxMp]]),
    known,
    words: loaded.battleWords,
    names: [heroNamed(), ...companions.map(companionNamed), ...names],
  })
  battleCompanions = companions.map((who, i) => ({
    id: who.id,
    index: i + 1,
    ...companionLook(who),
  }))
  battleLooks = [...party.map(() => undefined), ...looks]
  battleSpots = [undefined, ...companions.map((_, i) => besideHero(i)), ...foeSpots]
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
  const hp = afterMarsh(heroHp ?? row.maxHp)
  heroHp = hp >= row.maxHp ? undefined : hp
  const told = [`HP ${hp}/${row.maxHp}`]
  for (const who of companionsNow()) {
    const max = who.numbers.maxHp
    const left = afterMarsh(companionHp.get(who.id) ?? max)
    if (left >= max) companionHp.delete(who.id)
    else companionHp.set(who.id, left)
    told.push(`${who.name} ${left}/${max}`)
  }
  status(`the poison marsh stings · ${told.join(' · ')}`)
}

/**
 * Who goes along with the Hero now, in their places after them — see
 * `companionsAt`. `?ivor=1` brings Ivor at any stage, to look at.
 */
function companionsNow(): readonly AttendingCharacter[] {
  return companionsAt(loaded?.attending ?? [], storyStage, params.get('ivor') === '1' ? [IVOR] : [])
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
  who: AttendingCharacter
  place: number
  x: number
  y: number
  z: number
}[] {
  if (!self || battle || playing) return []
  const hx = toFloat(self.state.x)
  const hz = toFloat(self.state.z)
  const near = toFloat(person().radius) * 2
  return companionsNow().flatMap((who, place) => {
    const trail = trails[place]
    if (!trail) return []
    if (standingHere(who)) return []
    const x = toFloat(trail.x)
    const z = toFloat(trail.z)
    if (Math.hypot(x - hx, z - hz) < near) return []
    return [{ who, place, x, y: toFloat(trail.y), z }]
  })
}

/**
 * Those in the field, each in their own model: their `walk` in step with the
 * Hero's — the same pace over the same ground — or their `stand`.
 */
function companionFieldPieces(now: number): Piece[] {
  const rom = cartridge
  const hero = self
  if (!rom || !hero) return []
  return companionsInField().flatMap(({ who, place, x, y, z }) => {
    const { model } = companionLook(who)
    const look = actorLookOf(rom, model, [])
    if (!look) return []
    const walking = trailWalking[place] === 1
    const motion = look.motions.get(walking ? 'walk' : 'stand') ?? look.motions.get('stand')
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
  const look = actorLookOf(rom, at.model, at.packs)
  if (!fighter || !spot || !look) return []
  const onShow = scene.phase === 'telling' ? (scene.cues[0] ?? []) : []
  const cue = onShow.find((c) => c.fighter === at.index)
  // Fallen, but not yet told of: still standing.
  const toldOf = !scene.cues.some((cues) =>
    cues.some((c) => c.fighter === at.index && c.motion === 'death'),
  )
  const lying = fighter.hp <= 0 && toldOf
  const name = cue ? COMPANION_MOTIONS[cue.motion] : lying ? COMPANION_MOTIONS.death : 'stand'
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
  return castPieces(
    { name: at.model, model: look.model, motion, floor: look.floor, placement },
    look.catalogue,
    characterScale,
    frame,
  )
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
  const levels = loaded?.heroLevels
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
    const before = standing(levels, heroExp, heroGains).level
    heroExp += exp
    bag = take(bag, { gold })
    const after = standing(levels, heroExp, heroGains).level
    heroHp = Math.min(after.maxHp, hero.hp + (after.maxHp - before.maxHp))
    // MP spent in the battle stay spent, but a level's new MP come with it.
    const mp = Math.min(after.maxMp, hero.mp + (after.maxMp - before.maxMp))
    heroMp = mp >= after.maxMp ? undefined : mp
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
      const gains = [
        ['Max HP', after.maxHp - before.maxHp],
        ['Max MP', after.maxMp - before.maxMp],
        ['Strength', after.strength - before.strength],
        ['Resilience', after.resilience - before.resilience],
        ['Agility', after.agility - before.agility],
      ] as const
      lines.push(gains.map(([label, gain]) => `${label} +${gain}`).join(' · '))
    }
  } else if (battle.state.outcome === 'lost') {
    heroHp = undefined
    heroMp = undefined
    // Ours, both: half the gold, and coming round in the village church — see
    // `CHURCH`. The game's own rule, and any words for it, are not found.
    bag = pay(bag, Math.floor(bag.gold / 2)) ?? bag
    wakeInChurch = true
    lines.push(`${name} comes round in the church, restored — but half the gold is gone.`)
  } else if (hero) {
    heroHp = hero.hp
    heroMp = hero.mp >= hero.maxMp ? undefined : hero.mp
  }
  // Each companion's wounds go on with them; one who fell gets up with 1 HP,
  // and after a loss they come round whole with the Hero — ours, all.
  for (const at of battleCompanions) {
    const fighter = battle.state.fighters[at.index]
    if (!fighter) continue
    const left = battle.state.outcome === 'lost' ? fighter.maxHp : Math.max(1, fighter.hp)
    if (left >= fighter.maxHp) companionHp.delete(at.id)
    else companionHp.set(at.id, left)
  }
  battle = { ...withPages(battle, lines), settled: true }
}

/** Put the battle away. */
function endFight(): void {
  battle = undefined
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
  status(`back on the map · HP ${heroHp ?? 'full'}`)
  if (fought) followBattle(fought)
}

/** Play event `number` in the map the Hero is in — see `event.ts`. False when it will not read. */
function startEvent(number: number): boolean {
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
    player: new EventPlayer(script, WORLD_SCALE * worldScale, {
      x: toFloat(self.state.x),
      y: toFloat(self.state.y),
      z: toFloat(self.state.z),
      facing: self.facing,
    }),
    event: number,
    messages,
    showing: undefined,
    carry: 0,
    framing: { pitch: camera.pitch, distance: camera.distance, yaw: camera.yaw },
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
  camera.pitch = done.framing.pitch
  camera.distance = done.framing.distance
  camera.actualDistance = done.framing.distance
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
  const unread = [...done.player.stage.unhandled.keys()]
  status(
    `ev${done.event} is over` +
      (unread.length > 0 ? ` · functions not read: ${unread.sort((a, b) => a - b).join(' ')}` : ''),
  )
  followEvent(done.event)
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
      const cast = loaded.castAt(storyStage, stepNow())
      loaded = { ...loaded, cast }
      // A sliding piece goes where its character now stands — see `slide.ts`.
      aimSlides(slides, (id) => standingIn(cast, id))
      poseMap(Math.max(mapFrame, 0))
    }
  }
  for (const flag of outcome.flags) storyFlags.add(flag)
  status(
    `ev${event} is over · the story is at ${storyStage?.major ?? '?'}.${storyStage?.minor ?? '?'}` +
      `, step ${storyStep}` +
      (storyFlags.size > 0 ? ` · flags ${[...storyFlags].sort((a, b) => a - b).join(' ')}` : ''),
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
 * The event's camera: looking at its target from its yaw, rise and run —
 * which is the follow camera's own yaw, pitch and distance. INFERRED; see
 * `event.ts`.
 */
function aimAtShot(shot: EventCamera): void {
  if (!shot.target) return
  camera.focus = [shot.target[0], shot.target[1], shot.target[2]]
  camera.yaw = shot.yaw
  camera.pitch = Math.atan2(shot.rise, shot.run)
  camera.distance = Math.hypot(shot.rise, shot.run)
  camera.actualDistance = camera.distance
  camera.lift = 0
}

/** The event's characters in their own models, playing what they are told; the Hero is drawn as ever. */
function eventPieces(): Piece[] {
  const now = playing
  const rom = cartridge
  if (!now || !rom) return []
  const stage = now.player.stage
  return [...stage.actors].flatMap(([id, actor]) => {
    if (id === 0 || !actor.model) return []
    const look = actorLookOf(rom, actor.model, actor.packs)
    if (!look) return []
    const motion = look.motions.get(actor.motion ?? '') ?? look.motions.get('stand')
    const frame = eventMotionFrame(stage.frame, actor.motionFrom)
    const placement = {
      id,
      map: 0,
      x: actor.x,
      y: actor.y,
      z: actor.z,
      facing: actor.facing,
      offset: 0,
    } as NpcPlacement
    return castPieces(
      { name: actor.model, model: look.model, motion, floor: look.floor, placement },
      look.catalogue,
      characterScale,
      frame,
    )
  })
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
  const name = hero.motion
  const motion =
    hero.packs.map((pack) => packMotions(rom, pack).get(name)).find((found) => found) ??
    loaded.figure.motions.get(name)
  if (!motion) return undefined
  const since = eventMotionFrame(now.player.stage.frame, hero.motionFrom)
  return { motion, frame: motion.frameCount > 0 ? since % motion.frameCount : 0 }
}

/** How far into its motion a character is, at the map's rate: event frames are sixtieths. */
function eventMotionFrame(frame: number, from: number): number {
  return Math.max(0, Math.floor(((frame - from) * MAP_FPS) / 60))
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
  })
  return true
}

/** Draw the conversation's page into the text box, or put the box away when it is over. */
function showTalk(): void {
  if (!talking) {
    closeTalk()
    return
  }
  const { who, source, texts, notes, line, page, run, choice, aside } = talking
  const shown = run.pages[page]
  talkEl.replaceChildren()
  if (shown?.speaker) {
    const name = document.createElement('div')
    name.className = 'speaker'
    name.textContent = shown.speaker
    talkEl.append(name)
  }
  const body = document.createElement('div')
  body.textContent = shown?.text ?? ''
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

function closeTalk(): void {
  talking = undefined
  talkEvent = undefined
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
  // The title card takes every key while it is up; f, Enter or Esc puts it away.
  if (!cardEl.hidden) {
    if (key === 'f' || key === 'enter' || key === 'escape') {
      cardEl.hidden = true
      status('the slice is over · the Hexagon and Angel Falls are still there to walk')
    }
    event.preventDefault()
    return
  }
  // A battle takes every key while it lasts: the same keys as the menu.
  if (battle) {
    if (key === 'arrowup' || key === 'w') battle = battleMove(battle, -1)
    else if (key === 'arrowdown' || key === 's') battle = battleMove(battle, 1)
    else if (key === 'f' || key === 'enter') {
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
        return
      }
    } else if (key === 'x' || key === 'escape') battle = battleBack(battle)
    showBattle()
    event.preventDefault()
    return
  }
  // `p` picks a fight — see `FIGHT` — and Shift+P the boss.
  if (key === 'p' && loaded && !talking && !menu && !visit && !playing) {
    startFight(event.shiftKey ? BOSS_FIGHT : fightCodes(), !event.shiftKey)
    event.preventDefault()
    return
  }
  // A shop, the inn or the church: the same keys as the menu, over its list.
  if (visit) {
    const told = counter()
    if (key === 'arrowup' || key === 'w') visit = moveVisit(visit, -1, bag, told)
    else if (key === 'arrowdown' || key === 's') visit = moveVisit(visit, 1, bag, told)
    else if (key === 'f' || key === 'enter') {
      const outcome = chooseInVisit(visit, bag, told)
      bag = outcome.bag
      visit = outcome.visit
      // A night at the inn restores the Hero whole.
      if (outcome.rested) {
        heroHp = undefined
        heroMp = undefined
        companionHp.clear()
      }
      if (outcome.confessed && visit) visit = { ...visit, said: confess() }
    } else if (key === 'x' || key === 'escape') visit = leaveVisit(visit)
    showMenu()
    event.preventDefault()
    return
  }
  // The main menu: `x` opens it, and it or Esc goes back a step at a time.
  // While it is up the Hero stands still and the movement keys choose.
  if (menu) {
    if (key === 'arrowup' || key === 'w') menu = moveCursor(menu, -1, menuContext())
    else if (key === 'arrowdown' || key === 's') menu = moveCursor(menu, 1, menuContext())
    else if (key === 'f' || key === 'enter') {
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
        const worn = equip(bag, equipped, taken.equip.slot, taken.equip.item)
        if (worn) {
          bag = worn.bag
          equipped = worn.equipped
        }
      }
      if (taken.talk) {
        showMenu()
        talk()
        event.preventDefault()
        return
      }
    } else if (key === 'x' || key === 'escape') menu = back(menu)
    showMenu()
    event.preventDefault()
    return
  }
  if (key === 'x' && loaded && !talking && !playing) {
    self?.held.clear()
    menu = openMenu()
    showMenu()
    event.preventDefault()
    return
  }
  // While a prompt waits for an answer the arrows choose, before anything else
  // that uses them; f or Enter answers, as it goes on to the next page.
  if (talking && promptOf(talking) && key.startsWith('arrow')) {
    talking = moveChoice(talking, key === 'arrowup' || key === 'arrowleft' ? -1 : 1)
    showTalk()
    event.preventDefault()
    return
  }
  if (key === 'enter' && talking) {
    talk()
    event.preventDefault()
    return
  }
  if (self && (key === 'w' || key === 'a' || key === 's' || key === 'd')) {
    self.held.add(key)
    event.preventDefault()
  }
  // Talk to whoever the Hero faces: `f` to start and to go on, Shift+F for every
  // line of their file, Esc to stop, `v` and `b` to read another chapter's words.
  if (key === 'f' && loaded) {
    talk(event.shiftKey)
    event.preventDefault()
  }
  // Esc closes what is being said — but an event's message is the event's to
  // close, so there it goes on, as `f` does.
  if (key === 'escape' && talking) {
    const read = talkEvent
    if (playing) talk()
    else closeTalk()
    // An event read out goes on all the same.
    if (!playing && read !== undefined) followEvent(read)
    event.preventDefault()
  }
  if ((key === 'v' || key === 'b') && loaded) {
    moveChapter(key === 'b' ? 1 : -1)
    event.preventDefault()
  }
  // Flick through the story stages the cast's records name: `t` back, `y` on.
  if ((key === 't' || key === 'y') && loaded) {
    moveStage(key === 'y' ? 1 : -1)
    event.preventDefault()
  }
  // The mini-map on and off. Not while the collision is on show, whose fitting
  // keys take `m` for the room.
  if (key === 'm' && !showCollision) {
    minimapWanted = !minimapWanted
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
      return
    }
  }
})
addEventListener('keyup', (event) => {
  self?.held.delete(event.key.toLowerCase())
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
      begin(new Uint8Array(await response.arrayBuffer()), wantedMap)
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
