import { chooseFigure, type Figure, type FigurePiece, figurePieces, library } from '@minstrel/actor'
import { type Catalogue, catalogue, scanCartridge } from '@minstrel/cartridge'
import { FX32_ONE, fx32, toFloat } from '@minstrel/fixed'
import {
  isMapLinks,
  isMapList,
  isMapManifest,
  isNpcList,
  isNpcPlacements,
  type MapManifest,
  type MapTransition,
  mapDoorways,
  npcSubMap,
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
function castOf(cat: Catalogue, map: string, groundAt: GroundAt): Cast {
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
    const found = castFrom(cat, candidate, map, groundAt, sheets)
    if (found) return found
  }
  return empty
}

/** The cast of one named `.npc` archive, or undefined if there is no such archive. */
function castFrom(
  cat: Catalogue,
  area: string,
  map: string,
  groundAt: GroundAt,
  sheets: ReadonlyMap<string, Uint8Array>,
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
      // into the stable. See `NpcPlacement.map`.
      const here = npcSubMap(area, map)
      const placed = placeNpcs(readNpcList(list), readNpcPlacements(places)).filter(
        ({ placement }) => here === undefined || placement.map % 100 === here,
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
function scales(cat: Catalogue): (code: string) => number {
  for (const leaf of cat.other) {
    if (!leaf.path.toLowerCase().endsWith('maplist9.bin') || !isMapList(leaf.bytes)) continue
    try {
      const list = readMapList(leaf.bytes)
      return (code) => (list.map(code.toUpperCase())?.indoors ? PLACED_PIECE_SCALE : 1)
    } catch {
      // An index that will not read leaves every map at its shipped size.
      return () => 1
    }
  }
  return () => 1
}

/**
 * A map's doorways, out of the `.bmbl` beside its geometry.
 *
 * The `.amdj` holds what a map looks like and the `.ambl` next to it holds what
 * it connects to. A map with no readable `.bmbl` is still walkable; it just has
 * no way out.
 */
function doorwaysOf(
  cat: Catalogue,
  code: string,
  scaleFor: (code: string) => number,
): readonly MapTransition[] {
  for (const [archive, files] of cat.members) {
    if (stemOf(archive) !== code.toLowerCase() || !archive.toLowerCase().endsWith('.ambl')) continue
    for (const [name, bytes] of files) {
      if (!name.toLowerCase().endsWith('.bmbl') || !isMapLinks(bytes)) continue
      try {
        // **Two maps, two spaces.** A doorway stands in the map that holds it,
        // so its position and volume shrink with that map; the arrival is a
        // spot in the map it leads to, and shrinks with that one instead.
        // Scaling both by the map that holds them put the character an eighth
        // of the way to the village every time they left a house.
        const here = scaleFor(code)
        return mapDoorways(bytes).map((door) => scaled(door, here, scaleFor(door.to)))
      } catch {
        // A link table that will not walk leaves the map without doorways.
        return []
      }
    }
  }
  return []
}

/**
 * One doorway in final coordinates.
 *
 * Three things, in three spaces, and they are not the same:
 *
 * - **Where it stands** is in the map that holds it, so it takes `here`.
 * - **Where it comes out** is a spot in the map it leads to, so it takes
 *   `there`. Scaling it by `here` puts the character an eighth of the way to
 *   the village every time they leave a house.
 * - **How big it is** is in neither. The volume is already in the character's
 *   own space and is left alone.
 *
 * That last one is measured, on the 154 doorways of the cartridge that have a
 * doorway *model* standing at them — a model is a placed piece, so it is in the
 * character's space whatever its map is doing, which makes it the ruler this
 * needs. Trigger against door:
 *
 * | | height | width |
 * |---|---|---|
 * | outdoors, 74 of them | 1.30 | 1.42 |
 * | indoors, volume left alone, 80 | **1.12** | **1.49** |
 * | indoors, volume scaled with the map | 0.14 | 0.19 |
 *
 * A trigger about half again the size of its own door, indoors and out. Scaled
 * with the map an indoor one comes out at a seventh of its door and narrower
 * than the character — 0.13 to 0.43 of their height across, against the 0.44
 * they are wide — so they would have to thread it dead centre.
 *
 * Angles have no scale, so they are left alone in every case.
 */
function scaled(door: MapTransition, here: number, there: number): MapTransition {
  if (here === 1 && there === 1) return door
  return {
    ...door,
    x: door.x * here,
    y: door.y * here,
    z: door.z * here,
    arriveX: door.arriveX * there,
    arriveY: door.arriveY * there,
    arriveZ: door.arriveZ * there,
  }
}

/** An archive's name without its directory or extension: `M01` for `/data/map/M01.amdj`. */
function stemOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return (dot < 0 ? name : name.slice(0, dot)).toLowerCase()
}

export function load(rom: Uint8Array, options: LoadOptions): Loaded {
  forgetSheets()
  const manifests = new Map<string, MapManifest>()
  const parts = library()
  const wanted = options.map.toLowerCase()

  options.onProgress?.('reading the cartridge…')

  // One walk, several filters: the scan takes a single substring, so the
  // narrowed paths are walked in turn and their leaves catalogued together.
  const leaves = []
  // The cast list is per map, so it is asked for by name rather than by
  // walking the 35 MiB of scenario data around it.
  // The cast list is per map, so it is asked for by name rather than by walking
  // the 35 MiB of scenario data around it. An interior takes its area's list,
  // so every prefix of the name is offered.
  const paths = [
    ...(options.paths ?? SLICE_PATHS),
    ...castArchives(options.map).map((code) => `/data/scenario/${code}.npc`),
  ]
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
  const scaleFor = scales(cat)
  const scale = scaleFor(code)
  const map = assembleMap(manifest, members, {
    scale,
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
    cast: castOf(cat, code, groundAt),
    catalogue: cat,
    map,
    world,
    figure,
    pieces: figurePieces(figure),
    doorways: doorwaysOf(cat, code, scaleFor),
    archive,
    code,
    scale,
  }
}
