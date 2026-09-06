import { GameFormatError } from './errors.ts'
import { type DataTable, readDataTable } from './table.ts'

/**
 * `.bmdj` — what a map is made of.
 *
 * A map archive holds a dozen loose files with no index between them; the
 * `.bmdj` beside them is the list. It is an ordinary tagged data table (see
 * `table.ts`), and the part of it that is established is the resource list:
 *
 * - a `0x6A` record whose single value is the number of resources
 * - one `0x6C` record per resource, whose first value is its position and whose
 *   second is a **byte offset into the string table**, not an index into it
 *
 * The names are authoring names — `C01M0300.imd` — and the built file beside
 * the manifest carries the same stem with whatever extension it was compiled
 * to. So the manifest says *what*, and the archive says *which form*.
 *
 * Across the reference cartridge every one of the **5,342** resources named by
 * the **755** manifests is present in its own archive, resolved that way.
 */
const TAG_RESOURCE_COUNT = 0x6a
const TAG_RESOURCE = 0x6c
/** One per resource, in the same order: where to put it. */
const TAG_PLACEMENT = 0x6f

/**
 * What a placement's translation is divided by to reach world units.
 *
 * **INFERRED**, and the one number here that is fitted rather than read. The
 * translations are floats an order of magnitude larger than the map they place
 * things in: the village's doors sit at x -28.56 and 26.10 in a village that
 * runs -4.38 to 7.61. Dividing brings them inside it, and the divisor is fitted
 * by asking, over every map that has both placed objects and unplaced ground,
 * how many objects authored to sit at their own origin end up standing on that
 * ground. That peaks at 8 to 8.5 across the cartridge and at 7.5 to 8.5 on the
 * slice's village, and 8 is a power of two, which is what a DS pipeline would
 * use. It is not read from the file, so it is recorded as a guess with its
 * evidence rather than as a fact.
 */
export const PLACEMENT_SCALE = 8

/**
 * A translation smaller than this is no translation.
 *
 * Well under a thousandth of a world unit, so it cannot swallow a real one.
 */
const TINY = 1e-6

/**
 * What a map's **placed** pieces are drawn at, relative to the map around them.
 *
 * **Set by eye against the original, not derived.** The doorway models are
 * `upScale` 1 while the terrain they stand in is `upScale` 8 — as is every
 * placed piece on the cartridge, 276 of 283 — and the manifest's own scale
 * field is 1, 1, 1 everywhere, so nothing in the data asks for them to be
 * resized. Unresized they are absurd: a doorway 1.54 units tall set into a
 * building facade of 1.50.
 *
 * A fifth is what looks right in the slice's village, judged against the
 * buildings there. It is recorded here as a number someone chose, and the
 * viewer keeps `,` and `.` for changing it, so revising it is a one-line edit
 * rather than an excavation.
 */
export const PLACED_PIECE_SCALE = 0.2

/**
 * Where a map puts one of its resources.
 *
 * Map pieces are authored in their own space and placed: the village's ten
 * doorways are ten models each spanning about a unit and a half from the
 * origin, and without this they are drawn stacked on top of each other in the
 * middle of the map, in the air, with their collision boxes stacked there too.
 */
export interface MapPlacement {
  /** Translation in world units — the file's value divided by {@link PLACEMENT_SCALE}. */
  readonly x: number
  readonly y: number
  readonly z: number
  /** Scale. One on every resource of the reference cartridge. */
  readonly scaleX: number
  readonly scaleY: number
  readonly scaleZ: number
  /**
   * The resource this one is attached to, by {@link MapResource.slot}, or
   * `undefined` for one placed in its own right.
   *
   * A door's collision carries no translation of its own; it names the door
   * model and goes where that goes. Placing it without following the link
   * leaves the collision at the origin while the model stands in the doorway.
   */
  readonly parent: number | undefined
  /** The record, for the six values whose meaning is not established. */
  readonly values: Uint32Array
}

/** One entry in a map's resource list. */
export interface MapResource {
  /** Position in the list. */
  readonly index: number
  /** Name as the manifest gives it, including its `.imd` extension. */
  readonly name: string
  /** The name without its extension, which is how the built file is found. */
  readonly stem: string
  /** Third and fourth values of the record. Their meaning is not established. */
  readonly unknown_2: number
  readonly unknown_3: number
  /**
   * Which slot the resource occupies, as other resources refer to it.
   *
   * Not its position in the list: a resource's parent names this, and the two
   * do not track each other.
   */
  readonly slot: number
  /** Where the map puts it, when it carries a placement record. */
  readonly placement: MapPlacement | undefined
}

export interface MapManifest {
  /** The resources the map is built from, in the order the manifest lists them. */
  readonly resources: readonly MapResource[]
  /**
   * The table underneath.
   *
   * Most of a manifest is not understood: there is a second per-resource record
   * (`0x6F`) carrying fourteen values, and a small tag after each one whose
   * values do not track what the resource turns out to be. Neither is read
   * here, and both are reachable through this for anyone who wants to look.
   */
  readonly table: DataTable
  /**
   * Whether the placement records pair one-to-one with the resources.
   *
   * False for the minority of manifests carrying more placements than
   * resources; those resources are left unplaced rather than placed by a
   * positional guess that could be off by one all the way down.
   */
  readonly placementsPair: boolean
}

/**
 * Cheap check for a map manifest.
 *
 * A `.bmdj` is a data table like several other files, so what distinguishes one
 * is that it carries a resource list.
 */
export function isMapManifest(data: Uint8Array): boolean {
  try {
    const table = readDataTable(data)
    return table.withTag(TAG_RESOURCE).length > 0
  } catch {
    return false
  }
}

/** Read a map's resource list. */
export function readMapManifest(data: Uint8Array): MapManifest {
  const table = readDataTable(data)
  const entries = table.withTag(TAG_RESOURCE)

  const declared = table.withTag(TAG_RESOURCE_COUNT)[0]?.values[0]
  if (declared !== undefined && declared !== entries.length) {
    throw new GameFormatError(
      `map manifest declares ${declared} resources but lists ${entries.length}`,
    )
  }

  // Placements pair with resources by position, so they are only trusted when
  // there is exactly one for each. A minority of manifests carry more
  // placements than resources — things placed in the map that are not in its
  // resource list — and pairing positionally through those would put pieces
  // confidently in the wrong places. No placement is better than a wrong one,
  // so those maps get none and say so.
  const placements = table.withTag(TAG_PLACEMENT)
  const placementsPair = placements.length === entries.length

  const resources = entries.map((entry, position) => {
    const index = entry.values[0] ?? position
    const offset = entry.values[1]
    if (offset === undefined) {
      throw new GameFormatError(`map manifest resource ${position} names no string`)
    }
    const name = table.stringAt(offset)
    if (name === undefined) {
      throw new GameFormatError(
        `map manifest resource ${position} names offset ${offset}, which is not a string`,
      )
    }
    const dot = name.lastIndexOf('.')
    const record = placementsPair ? placements[position] : undefined
    const at = record?.floats
    // A parent of -1 means none, and reads as NaN through the float view.
    const parent = record?.values[6]
    return {
      index,
      name,
      stem: dot > 0 ? name.slice(0, dot) : name,
      unknown_2: entry.values[2] ?? 0,
      unknown_3: entry.values[3] ?? 0,
      slot: record?.values[1] ?? position,
      placement:
        record && at
          ? {
              x: (at[3] ?? 0) / PLACEMENT_SCALE,
              y: (at[4] ?? 0) / PLACEMENT_SCALE,
              z: (at[5] ?? 0) / PLACEMENT_SCALE,
              scaleX: at[8] ?? 1,
              scaleY: at[9] ?? 1,
              scaleZ: at[10] ?? 1,
              parent: parent === undefined || parent === 0xffffffff ? undefined : parent,
              values: record.values,
            }
          : undefined,
    }
  })

  return { resources, table, placementsPair }
}

/**
 * Match a manifest's resources to the files beside them.
 *
 * `files` is whatever the archive holds, by name. Matching is by stem and
 * case-insensitive, because the manifest and the archive do not always agree on
 * case.
 *
 * **One resource can be several files.** An authored `.imd` is compiled into
 * whatever it needs — geometry, a material animation, a texture animation — and
 * they all keep its stem, so `C01M0300.imd` is `C01M0300.nsbmd` *and*
 * `C01M0300.nsbma`. Returning one of them would mean picking arbitrarily: on
 * the reference cartridge, taking the first match loses the main geometry of a
 * map to the manifest file sitting next to it under the same stem. The caller
 * knows which kinds it wants; this says which files exist.
 *
 * A resource with no files is returned with an empty list rather than dropped,
 * so a caller can say what is missing instead of silently assembling less than
 * the map.
 */
export function resolveMapResources(
  manifest: MapManifest,
  files: Iterable<string>,
): { resource: MapResource; files: string[] }[] {
  const byStem = new Map<string, string[]>()
  for (const file of files) {
    const dot = file.lastIndexOf('.')
    if (dot <= 0) continue
    const stem = file.slice(0, dot).toLowerCase()
    const list = byStem.get(stem) ?? []
    list.push(file)
    byStem.set(stem, list)
  }
  return manifest.resources.map((resource) => ({
    resource,
    files: byStem.get(resource.stem.toLowerCase()) ?? [],
  }))
}

/**
 * Where a resource actually goes, following the chain of parents.
 *
 * A resource attached to another carries no translation of its own and takes
 * the one it is attached to. Returns the origin for a resource with no
 * placement at all, so a caller can place everything uniformly.
 *
 * The chain is followed to a bounded depth: a manifest that named a cycle would
 * otherwise hang the caller, and a malformed file should not be able to do that.
 */
export function placementOf(
  manifest: MapManifest,
  resource: MapResource,
): { x: number; y: number; z: number; scaleX: number; scaleY: number; scaleZ: number } {
  const bySlot = new Map<number, MapResource>()
  for (const entry of manifest.resources) if (!bySlot.has(entry.slot)) bySlot.set(entry.slot, entry)

  let at: MapResource | undefined = resource
  for (let depth = 0; at && depth < 8; depth++) {
    const placement: MapPlacement | undefined = at.placement
    if (!placement) break
    // Not `!== 0`: one of the village's ten doorway collisions carries a
    // denormal of about -1e-9 where the other nine carry a clean zero, and
    // reading that as a translation of its own left that one doorway's wall at
    // the map's origin while its door stood in the doorway.
    if (
      Math.abs(placement.x) > TINY ||
      Math.abs(placement.y) > TINY ||
      Math.abs(placement.z) > TINY
    ) {
      return {
        x: placement.x,
        y: placement.y,
        z: placement.z,
        scaleX: placement.scaleX,
        scaleY: placement.scaleY,
        scaleZ: placement.scaleZ,
      }
    }
    if (placement.parent === undefined) break
    const next: MapResource | undefined = bySlot.get(placement.parent)
    if (!next || next === at) break
    at = next
  }
  const own = resource.placement
  return {
    x: 0,
    y: 0,
    z: 0,
    scaleX: own?.scaleX ?? 1,
    scaleY: own?.scaleY ?? 1,
    scaleZ: own?.scaleZ ?? 1,
  }
}
