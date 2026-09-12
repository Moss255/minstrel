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
  isMapLinks,
  isMapList,
  isMapManifest,
  isNpcList,
  isNpcPlacements,
  type MapEntry,
  type MapManifest,
  type MapTransition,
  mapDoorways,
  type NpcEntry,
  type NpcPlacement,
  type NpcState,
  placeNpcs,
  readMapList,
  readMapManifest,
  readNpcList,
  readNpcPlacements,
  readNpcStates,
} from '@minstrel/game-formats'
import { type CollisionWorld, createCollisionWorld, groundBelow, PERSON } from '@minstrel/sim'
import { type AssembledMap, assembleMap, type MapLighting, WORLD_SCALE } from '@minstrel/world'
import { type Cast, cast, forgetSheets, type GroundAt } from './cast.ts'

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
  /** The way out: where this map's doorways are and what they lead to. */
  readonly doorways: readonly MapTransition[]
  /** Which archive the map came out of, for the status line. */
  readonly archive: string
  /** The map's own code, which is what a doorway names. */
  readonly code: string
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
  const archive =
    [...manifests.keys()].find((path) => stemOf(path) === wanted) ??
    [...manifests.keys()].find((path) => stemOf(path).includes(wanted))
  const manifest = archive === undefined ? undefined : manifests.get(archive)
  const members = archive === undefined ? undefined : cat.members.get(archive)
  if (!manifest || !members || archive === undefined) {
    throw new Error(`no map matching '${options.map}' in this cartridge`)
  }

  const code = stemOf(archive).toUpperCase()
  const entry = indexOf(cat)(code)
  const map = assembleMap(
    manifest,
    members,
    options.lighting === undefined ? {} : { lighting: options.lighting },
  )
  if (map.pieces.length === 0) throw new Error(`'${archive}' names no model that reads`)

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
  return {
    cast: castOf(cat, area, id, groundAt, sheets),
    stages: area ? stagesOf(area, id) : [],
    castAt: (stage) => castOf(cat, area, id, groundAt, sheets, stage),
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
