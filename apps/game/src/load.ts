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
  PLACED_PIECE_SCALE,
  placeNpcs,
  readMapList,
  readMapManifest,
  readNpcList,
  readNpcPlacements,
} from '@minstrel/game-formats'
import { type CollisionWorld, createCollisionWorld, groundBelow, PERSON } from '@minstrel/sim'
import { type AssembledMap, assembleMap, type MapLighting } from '@minstrel/world'
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
  /** The way out: where this map's doorways are and what they lead to. */
  readonly doorways: readonly MapTransition[]
  /** Which archive the map came out of, for the status line. */
  readonly archive: string
  /** The map's own code, which is what a doorway names. */
  readonly code: string
  /**
   * How much the map's own space was shrunk to build it.
   *
   * `1` outdoors and `PLACED_PIECE_SCALE` indoors — see `MapEntry.indoors`.
   * Anything else read in the map's own coordinates has to be shrunk to match,
   * which is why the doorways below already are.
   */
  readonly scale: number
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
/**
 * How much bigger an interior's collision has to be than the file makes it.
 *
 * **Fitted, not derived.** Moving the mesh over the room in the game until it
 * lined up gives two for the rooms that were fitted, and no field in the
 * `.col2` header, the manifest, the index or the model separates a map that
 * needs it from one that does not.
 *
 * It is not established for every map — the well measures the same factor the
 * other way — so this is the best single number for the rooms looked at rather
 * than a reading of the format. `docs/next.md` carries the record and the keys
 * for fitting more.
 */
export const INTERIOR_COLLISION_SCALE = 2

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
 * The characters standing in this map.
 *
 * A missing or unreadable cast is not fatal: the map is still walkable, and one
 * archive on the cartridge carries a zero-byte list.
 */
function castOf(cat: Catalogue, map: string, groundAt: GroundAt, id: number | undefined): Cast {
  // `/data/ani/<name>.spr`, by character name. These sit directly in the
  // filesystem rather than inside an archive, so they arrive as unclaimed
  // leaves rather than as an archive's members.
  const sheets = new Map<string, Uint8Array>()
  for (const leaf of cat.other) {
    if (!leaf.path.toLowerCase().endsWith('.spr')) continue
    const name = leaf.path.slice(leaf.path.lastIndexOf('/') + 1)
    sheets.set(name.slice(0, name.length - 4).toLowerCase(), leaf.bytes)
  }
  const empty: Cast = {
    members: [],
    sprites2d: [],
    sprites: 0,
    unclassified: 0,
    missing: [],
    elsewhere: 0,
  }
  // A cast list is per *area*: there are 74 of them and an interior has none of
  // its own, so `M01M02` — the village inn — takes `M01.npc`. Every prefix of
  // the code is offered until one names an archive. Which of that area's
  // characters belong to *this* map is then read off each placement rather than
  // guessed at from where it stands — see `NpcPlacement.map`.
  const candidates = [map]
  for (let cut = map.length - 1; cut > 0; cut--) candidates.push(map.slice(0, cut))

  for (const candidate of candidates) {
    const found = castFrom(cat, candidate, groundAt, sheets, id)
    if (found) return found
  }
  return empty
}

/** The cast of one named `.npc` archive, or undefined if there is no such archive. */
function castFrom(
  cat: Catalogue,
  area: string,
  groundAt: GroundAt,
  sheets: ReadonlyMap<string, Uint8Array>,
  id: number | undefined,
): Cast | undefined {
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
      // **The list is the whole area's, so it has to be narrowed to this map.**
      // Everyone inside the village's houses is in `M01.npc` too, placed in the
      // coordinates of the room they stand in — and those rooms are each their
      // own little map about their own origin, so having floor underneath is no
      // evidence at all of being in the right one. It let fifteen villagers
      // into the stable.
      //
      // The join is the map's own id out of `maplist9.bin`, which every one of
      // the cartridge's 1,289 placements names exactly. A map the index does
      // not know is not narrowed at all rather than narrowed by a guess.
      const placed = placeNpcs(readNpcList(list), readNpcPlacements(places)).filter(
        ({ placement }) => id === undefined || placement.map === id,
      )
      return cast(placed, cat.members, groundAt, toFloat(PERSON.height), sheets)
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
 * How much to shrink each map's own space, by the map's code.
 *
 * An indoor map is authored an eighth larger than it looks and an outdoor one
 * is not — see `MapEntry.indoors`. The cartridge's own index is the only thing
 * that says which: nothing inside a map's archive distinguishes the two.
 *
 * A map the index does not know is treated as outdoors, which is the unscaled
 * reading and the one that was right for every map before this.
 */
function indexOf(cat: Catalogue): (code: string) => MapEntry | undefined {
  for (const leaf of cat.other) {
    if (!leaf.path.toLowerCase().endsWith('maplist9.bin') || !isMapList(leaf.bytes)) continue
    try {
      const list = readMapList(leaf.bytes)
      return (code) => list.map(code.toUpperCase())
    } catch {
      // An index that will not read leaves every map at its shipped size and
      // every cast unnarrowed.
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
        // Nothing is scaled: see the note below on why all three parts of a
        // doorway are already in the character's own space.
        return mapDoorways(bytes)
      } catch {
        // A link table that will not walk leaves the map without doorways.
        return []
      }
    }
  }
  return []
}

/**
 * **A doorway is already in the character's own space, all three parts of it.**
 *
 * Where it stands, where it puts you down, and how big it is were each scaled
 * with a map at some point, and none of them should be. It only ever showed
 * indoors, because outdoors the map's scale is one: the village's nine doorways
 * were right the whole time, which is why this survived.
 *
 * Scaled with the map that holds it, an indoor doorway collapsed onto the
 * origin — near enough the middle of the room that walking across the floor
 * threw the character back outside. That is "the door is in the wrong
 * position". Measured over the cartridge's **377 indoor doorways**, as how near
 * a doorway stands to the edge of its own map's collision, where 0 is in the
 * wall and 1 is dead centre:
 *
 * | | mean | within a quarter of the edge |
 * |---|---|---|
 * | scaled with the map | 0.68 | 7% |
 * | **left alone** | **0.06** | **90%** |
 *
 * The arrival went the same way, scaled by the map it leads to. The test that
 * settles it asks nothing of the collision: **you should come out beside the
 * door back**. Across 183 doorways into an indoor map, the distance from the
 * arrival to the door leading back the way you came:
 *
 * | | median | 75th | 90th |
 * |---|---|---|---|
 * | scaled by the destination | 0.973 | 1.749 | 2.717 |
 * | **left alone** | **0.285** | **0.462** | 2.133 |
 *
 * 0.285 units is a character and a half — beside the door. A whole unit is
 * across the room.
 *
 * A **contrary** measurement, recorded because it is what kept the scaling in
 * place: 93% of those arrivals stand on walkable floor when scaled and 26% when
 * left alone. That is the collision being wrong rather than the arrival: a
 * scaled arrival lands in the middle of the room, where there is always floor,
 * and a correct one lands at the threshold, which is exactly where an interior's
 * collision tends to stop short of its own walls. See `docs/next.md`.
 *
 * The volume was measured before either of these, on the 154 doorways of the
 * cartridge that have a doorway *model* standing at them — a model is a placed
 * piece, so it is in the character's space whatever its map is doing, which
 * makes it the ruler. Trigger against door:
 *
 * | | height | width |
 * |---|---|---|
 * | outdoors, 74 of them | 1.30 | 1.42 |
 * | indoors, volume left alone, 80 | **1.12** | **1.49** |
 * | indoors, volume scaled with the map | 0.14 | 0.19 |
 *
 * A trigger about half again the size of its own door, indoors and out. That
 * was the first of the three to be got right, and the other two agree with it.
 *
 * Angles have no scale, so they were never in question.
 */

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
  const index = indexOf(cat)
  const entry = index(code)
  const scale = entry?.indoors ? PLACED_PIECE_SCALE : 1
  const map = assembleMap(manifest, members, {
    scale,
    // An interior's collision sits at half the size of the room drawn around
    // it, and nothing in any file read here says which maps that is true of.
    // The correction is fitted by eye and applied to every interior — see
    // `AssembleOptions.collisionScale`.
    ...(entry?.indoors ? { collisionScale: INTERIOR_COLLISION_SCALE } : {}),
    ...(options.lighting === undefined ? {} : { lighting: options.lighting }),
  })
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
  return {
    cast: castOf(cat, code, groundAt, entry?.id),
    catalogue: cat,
    map,
    world,
    figure,
    pieces: figurePieces(figure),
    doorways: doorwaysOf(cat, code),
    archive,
    code,
    scale,
  }
}
