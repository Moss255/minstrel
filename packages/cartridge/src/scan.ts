import { isGpc, readGpc } from '@minstrel/l5-gpc'
import { tryDecompressLz10 } from '@minstrel/nitro-comp'
import { isNarc, readNarc, readNitroFs, walkFiles } from '@minstrel/nitrofs'

/**
 * Walk a cartridge and hand back every leaf it holds.
 *
 * A DS cartridge is containers all the way down: the filesystem holds NARCs,
 * NARCs hold compressed members, and on this hardware's Level-5 titles a GPC2
 * archive holds more of both. Nothing that wants an asset can assume it sits at
 * the top, so the walk unwraps as it goes and reports what it finds by the path
 * it took to get there — `/data/map/M01.amdj/M01M0000.nsbmd`, a path that names
 * two containers and a member.
 *
 * This package knows about *containers*, not about assets. It has no opinion on
 * what a leaf is, which is what lets the same walk serve a general-purpose
 * explorer and a game that only wants one village: the caller classifies.
 */

/** One leaf: bytes that are not themselves a container this walk can open. */
export interface Leaf {
  /**
   * Where it was found, containers joined by `/`. Unique within a walk, so it
   * doubles as a key.
   */
  readonly path: string
  /** Decompressed if it arrived compressed; otherwise the bytes as stored. */
  readonly bytes: Uint8Array
  /** The path of the container holding it, or `''` for a cartridge-root file. */
  readonly archive: string
  /** How many containers deep, with a cartridge file at 0. */
  readonly depth: number
}

export interface ScanOptions {
  /**
   * Only walk cartridge paths containing this substring, case-insensitively.
   *
   * A full walk touches every archive and every compressed member, which is
   * seconds of work. Narrowing it is what makes a targeted load quick.
   */
  readonly pathFilter?: string
  /**
   * How many containers deep to open. The cartridge nests three deep in
   * practice; the limit is what stops a malformed archive that appears to
   * contain itself.
   */
  readonly maxDepth?: number
  /**
   * Called before a container is opened. Returning `false` leaves it closed and
   * reports it as a leaf instead, which is how a caller skips the 36 MiB of
   * sound it does not need.
   */
  readonly enter?: (path: string, bytes: Uint8Array) => boolean
}

const DEFAULT_MAX_DEPTH = 4

/**
 * Every leaf of the cartridge, in filesystem order.
 *
 * A generator rather than an array: a full walk turns up tens of thousands of
 * leaves and the caller keeps only what it recognises, so there is no reason to
 * hold them all. It also means the walk can be interrupted — the explorer and
 * the game both run it off the main thread, and a generator is what lets a
 * chunked driver yield between batches.
 */
export function* scanCartridge(rom: Uint8Array, options: ScanOptions = {}): Generator<Leaf> {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH
  const needle = options.pathFilter?.toLowerCase()
  const fs = readNitroFs(rom)

  for (const file of walkFiles(fs.root)) {
    if (needle && !file.path.toLowerCase().includes(needle)) continue
    yield* visit(fs.read(file), file.path, '', 0, maxDepth, options.enter)
  }
}

function* visit(
  raw: Uint8Array,
  path: string,
  archive: string,
  depth: number,
  maxDepth: number,
  enter: ScanOptions['enter'],
): Generator<Leaf> {
  const bytes = tryDecompressLz10(raw) ?? raw

  const openable = depth < maxDepth && (isNarc(bytes) || isGpc(bytes))
  if (!openable || (enter && !enter(path, bytes))) {
    yield { path, bytes, archive, depth }
    return
  }

  if (isNarc(bytes)) {
    let members: ReturnType<ReturnType<typeof readNarc>['entries']>
    try {
      members = readNarc(bytes).entries()
    } catch {
      // A container that will not open is a leaf: its bytes are still whatever
      // they are, and reporting them beats dropping them silently.
      yield { path, bytes, archive, depth }
      return
    }
    for (const member of members) {
      const name = String(member.name ?? member.index)
      yield* visit(member.data, `${path}/${name}`, path, depth + 1, maxDepth, enter)
    }
    return
  }

  try {
    const gpc = readGpc(bytes)
    for (const member of gpc.members) {
      // An unreadable member is one this repository cannot decode yet — one
      // GPC2 codec is still carried as raw bytes — not one that is absent.
      if (!member.readable) continue
      yield* visit(gpc.read(member), `${path}/${member.name}`, path, depth + 1, maxDepth, enter)
    }
  } catch {
    yield { path, bytes, archive, depth }
  }
}
