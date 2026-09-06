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
    return {
      index,
      name,
      stem: dot > 0 ? name.slice(0, dot) : name,
      unknown_2: entry.values[2] ?? 0,
      unknown_3: entry.values[3] ?? 0,
    }
  })

  return { resources, table }
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
