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
 * A translation smaller than this is no translation.
 *
 * Far below anything a map places, so it cannot swallow a real one.
 */
const TINY = 1e-6

/**
 * Where a map puts one of its resources.
 *
 * Map pieces are authored in their own space and placed: the village's ten
 * doorways are ten models each spanning about a unit and a half from the
 * origin, and without this they are drawn stacked on top of each other in the
 * middle of the map, in the air, with their collision boxes stacked there too.
 */
export interface MapPlacement {
  /**
   * Translation, in the file's own units — the same units a model's scaled-up
   * positions and a collision mesh's shifted coordinates are in.
   */
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

/**
 * One of the places a map puts a resource.
 *
 * **A resource can be placed more than once**: `D03M06` lists two door models
 * and places each twice, a pair of doors at z 12.34 and another at z 17.70, and
 * each placement of a door has its own placement of the door's collision
 * attached to it. 144 placements on the reference cartridge are a resource's
 * second or later, in 45 maps, and 140 of them are doors or other repeated
 * pieces — see `docs/still-open.md` §5b.
 */
export interface MapInstance {
  /** Which instance this is, as a {@link MapPlacement.parent} names it: the record's `values[0]`. */
  readonly slot: number
  readonly placement: MapPlacement
}

/** One entry in a map's resource list. */
/** A resource's flags (`MapResource.flags`): which animations it has, a `.bcfg`, and tinting. */
export const RESOURCE_FLAGS = {
  jointAnimation: 0x01,
  materialAnimation: 0x02,
  textureAnimation: 0x04,
  patternAnimation: 0x08,
  /** It is an `Object3D` with named motions (`func_020151cc`); without, a plain model the map draws itself (`func_02014d80`). */
  motions: 0x10,
  /** Not tinted. */
  untinted: 0x20,
} as const

export interface MapResource {
  /** Position in the list. */
  readonly index: number
  /** Name as the manifest gives it, including its `.imd` extension. */
  readonly name: string
  /** The name without its extension, which is how the built file is found. */
  readonly stem: string
  /**
   * What the game loads for it — the third value's low six bits, read from
   * the manifest's loader (`func_02014a24`, opcode table `data_020ef418`, USA;
   * 1 October 2026): {@link RESOURCE_FLAGS}. **An animation is loaded only
   * when its bit is set**, whatever files lie beside the model — 167 of 5,342
   * resources on the reference cartridge differ from their files.
   */
  readonly flags: number
  /** The fourth value: a mask of texture sources, INFERRED from where the loader passes it. */
  readonly unknown_3: number
  /**
   * Which slot the resource occupies, as other resources refer to it.
   *
   * Not its position in the list: a resource's parent names this, and the two
   * do not track each other.
   */
  readonly slot: number
  /** Where the map puts it, when it carries a placement record — the last, if several. */
  readonly placement: MapPlacement | undefined
  /**
   * Every place the map puts it, in the manifest's order; empty for a resource
   * with no placement. The last is {@link placement}, and its slot {@link slot}.
   */
  readonly instances: readonly MapInstance[]
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
   * Whether there is one placement record per resource.
   *
   * False for the 56 manifests that place a resource more than once. Nothing
   * is left unplaced for it any more — a placement names its resource — and a
   * resource named by none takes the record at its own position only when this
   * is true.
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

  // **A placement names the resource it places, so nothing pairs by position.**
  //
  // `values[0]` is which instance it is and **`values[1]` is the index of the
  // resource**. The counts differ not from a mismatch but because a resource
  // can be placed **more than once**: `D03M06` lists two door models and
  // places them four times — `D03M0602` at both (0.98, 12.34) and
  // (0.98, 17.70) — so thirteen placements serve nine resources.
  //
  // This used to pair by order and, where the counts disagreed, give every
  // resource no placement rather than risk an off-by-one. Fifty-six of the 755
  // manifests are in that state and the result is what {@link MapPlacement}
  // warns of: every piece at the origin, a door standing as a slab through the
  // floor. `S07M0000` is one — Gortress had its six doors and both gates piled
  // at the origin, so the fortress could be walked straight through.
  //
  // **`placement` is the last instance, and that is not arbitrary** — every
  // instance is in `instances`, and a caller drawing one per resource draws
  // this one. The Hexagon places
  // its sliding statue `D01M01S1` twice, at `(-3.45, 0, 0)` and at the origin,
  // each with its own collision parented to it — the two ends of the slide.
  // The origin is where it rests and where the step-5 record stands on it, and
  // it is the later of the two. Taking the first put the statue 0.431 out,
  // which is `-3.45` scaled, and `story.test.ts` caught it.
  //
  // **Pairing by `values[0]` instead is wrong** and was tried: it puts a
  // door's collision on the far side of the room from its door and discards
  // the parent link, which is the fault {@link MapPlacement} describes.
  const placements = table.withTag(TAG_PLACEMENT)
  const byResource = new Map<number, (typeof placements)[number][]>()
  for (const record of placements) {
    const names = record.values[1]
    if (names !== undefined) byResource.set(names, [...(byResource.get(names) ?? []), record])
  }
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
    const fallback = placementsPair ? placements[position] : undefined
    const records = byResource.get(index) ?? (fallback ? [fallback] : [])
    const instances = records.map((record) => ({
      slot: record.values[0] ?? position,
      placement: placementFrom(record),
    }))
    const record = records.at(-1)
    return {
      index,
      name,
      stem: dot > 0 ? name.slice(0, dot) : name,
      flags: (entry.values[2] ?? 0) & 0x3f,
      unknown_3: entry.values[3] ?? 0,
      slot: record?.values[0] ?? position,
      placement: instances.at(-1)?.placement,
      instances,
    }
  })

  return { resources, table, placementsPair }
}

/** A placement record, read. */
function placementFrom(record: DataTable['records'][number]): MapPlacement {
  const at = record.floats
  // A parent of -1 means none, and reads as NaN through the float view.
  // Placement records carry fourteen values, so their header is eight bytes
  // rather than four — see `table.ts`. Every index here is one lower than it
  // was while the extra type word was being read as a phantom record.
  const parent = record.values[5]
  return {
    x: at[2] ?? 0,
    y: at[3] ?? 0,
    z: at[4] ?? 0,
    scaleX: at[7] ?? 1,
    scaleY: at[8] ?? 1,
    scaleZ: at[9] ?? 1,
    parent: parent === undefined || parent === 0xffffffff ? undefined : parent,
    values: record.values,
  }
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
 * `slot` picks which of the resource's {@link MapResource.instances} to place,
 * and is the last when not given. A parent names an **instance**, not a
 * resource: the second door of a pair hangs its collision off the door's
 * second instance, and resolving it through the door's last would stack both
 * collisions on one doorway.
 *
 * The chain is followed to a bounded depth: a manifest that named a cycle would
 * otherwise hang the caller, and a malformed file should not be able to do that.
 */
export function placementOf(
  manifest: MapManifest,
  resource: MapResource,
  slot: number = resource.slot,
): { x: number; y: number; z: number; scaleX: number; scaleY: number; scaleZ: number } {
  const bySlot = new Map<number, MapPlacement>()
  for (const entry of manifest.resources) {
    for (const instance of entry.instances) {
      if (!bySlot.has(instance.slot)) bySlot.set(instance.slot, instance.placement)
    }
  }

  const own =
    resource.instances.find((instance) => instance.slot === slot)?.placement ?? resource.placement
  let placement: MapPlacement | undefined = own
  for (let depth = 0; placement && depth < 8; depth++) {
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
    const next: MapPlacement | undefined = bySlot.get(placement.parent)
    if (!next || next === placement) break
    placement = next
  }
  return {
    x: 0,
    y: 0,
    z: 0,
    scaleX: own?.scaleX ?? 1,
    scaleY: own?.scaleY ?? 1,
    scaleZ: own?.scaleZ ?? 1,
  }
}
