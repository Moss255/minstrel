#!/usr/bin/env node
/**
 * Extract everything from a DS cartridge to a directory tree.
 *
 *   pnpm extract <rom.nds> [options]
 *
 *     --out <dir>       destination (default ./out)
 *     --raw             also write a verbatim tree, before unpacking
 *     --no-unpack       do not descend into archives
 *     --no-decompress   write compressed members as-is
 *     --filter <substr> only paths containing this substring
 *     --dry-run         report what would be written, write nothing
 *     --quiet           no progress output
 *
 * Layout produced under `--out`:
 *
 *   files/     the cartridge tree, with every archive replaced by a directory
 *              of its members, recursively, and members decompressed
 *   raw/       the cartridge tree verbatim, only with --raw
 *   system/    ARM9, ARM7 and each overlay
 *   manifest.json
 *
 * EVERYTHING THIS WRITES IS DERIVED FROM THE CARTRIDGE. `out/` is gitignored
 * and must stay that way; none of it may be committed.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { isGpc, readGpc } from '@vesper/l5-gpc'
import { decompressBlz, looksBlz, tryDecompressLz10 } from '@vesper/nitro-comp'
import { isSdat, readSdat } from '@vesper/nitro-snd'
import {
  checkHeaderIntegrity,
  isNarc,
  type NitroFs,
  readNarc,
  readNitroFs,
  walkFiles,
} from '@vesper/nitrofs'
import { toSafeName, toSafePath } from './paths.ts'
import { identify } from './signatures.ts'

interface Options {
  romPath: string
  out: string
  raw: boolean
  unpack: boolean
  decompress: boolean
  filter: string | undefined
  dryRun: boolean
  quiet: boolean
}

function parseArgs(argv: string[]): Options {
  const positional: string[] = []
  const flags = new Map<string, string>()
  const booleans = new Set(['raw', 'no-unpack', 'no-decompress', 'dry-run', 'quiet'])

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const name = arg.slice(2)
    if (booleans.has(name)) {
      flags.set(name, 'true')
      continue
    }
    const value = argv[++i]
    if (value === undefined) throw new Error(`--${name} needs a value`)
    flags.set(name, value)
  }

  const romPath = positional[0]
  if (romPath === undefined) {
    throw new Error('usage: pnpm extract <rom.nds> [--out dir] [--raw] [--dry-run]')
  }
  return {
    romPath,
    out: flags.get('out') ?? 'out',
    raw: flags.has('raw'),
    unpack: !flags.has('no-unpack'),
    decompress: !flags.has('no-decompress'),
    filter: flags.get('filter'),
    dryRun: flags.has('dry-run'),
    quiet: flags.has('quiet'),
  }
}

/** One written file, and where in the cartridge it came from. */
interface ManifestEntry {
  /** Path relative to the output directory. */
  out: string
  /** Cartridge path of the outermost file it came from. */
  source: string
  /** Member names traversed to reach it, outermost first. Empty for a plain file. */
  within: string[]
  size: number
  /** Compressed size, when the member was decompressed. */
  packedSize?: number
  /** Identified container, from the leading bytes after any decompression. */
  container: string
  /** Original name bytes, present only when the name had to be escaped. */
  originalNameHex?: string
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
  return `${(n / (1024 * 1024)).toFixed(1)} MiB`
}

/**
 * Bounded-concurrency writer. Thousands of small files go much faster in
 * parallel than one at a time, but an unbounded fan-out exhausts file handles.
 */
class WriteQueue {
  private pending: Promise<void>[] = []
  private readonly limit: number
  private readonly enabled: boolean
  bytes = 0
  count = 0

  constructor(limit: number, enabled: boolean) {
    this.limit = limit
    this.enabled = enabled
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    this.count++
    this.bytes += data.length
    if (!this.enabled) return

    const task = (async () => {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, data)
    })()
    this.pending.push(task)

    if (this.pending.length >= this.limit) {
      await Promise.all(this.pending)
      this.pending = []
    }
  }

  async drain(): Promise<void> {
    await Promise.all(this.pending)
    this.pending = []
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const raw = await readFile(options.romPath)
  const rom = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)

  const fs: NitroFs = readNitroFs(rom)
  const sha1 = createHash('sha1').update(rom).digest('hex')
  const integrity = checkHeaderIntegrity(rom)

  const log = (message: string) => {
    if (!options.quiet) console.log(message)
  }

  log(`\n${options.romPath}`)
  log(`  ${fs.header.gameCode}  ${humanBytes(rom.length)}  sha1 ${sha1}`)
  log(
    `  header crc ${integrity.headerOk ? 'ok' : 'MISMATCH'}, logo ${integrity.logoOk ? 'ok' : 'MISMATCH'}`,
  )
  log(
    options.dryRun ? '\n  dry run: nothing will be written\n' : `\n  writing to ${options.out}/\n`,
  )

  const queue = new WriteQueue(64, !options.dryRun)
  const manifest: ManifestEntry[] = []

  /**
   * Claim an output path, disambiguating collisions.
   *
   * Cartridge archives may hold two members with the same name, and one of a
   * colliding pair may be an archive (wanting a directory) while the other is a
   * plain file. Without this, extraction dies partway through with an EEXIST.
   *
   * Keys are lowercased so that a pair differing only in case — legal here,
   * fatal on a case-insensitive filesystem — is disambiguated too, and the
   * extraction is reproducible on any contributor's machine. The `~N` suffix
   * cannot be confused with a cartridge name, since a literal `~` would have
   * been percent-escaped by `toSafeName`.
   */
  const claimed = new Set<string>()
  let collisions = 0
  const claim = (path: string): string => {
    if (!claimed.has(path.toLowerCase())) {
      claimed.add(path.toLowerCase())
      return path
    }
    collisions++
    for (let n = 1; ; n++) {
      const candidate = `${path}~${n}`
      if (!claimed.has(candidate.toLowerCase())) {
        claimed.add(candidate.toLowerCase())
        return candidate
      }
    }
  }
  let archivesUnpacked = 0
  let gpcUnpacked = 0
  let gpcUnreadable = 0
  let gpcPrefixless = 0
  let sdatUnpacked = 0
  let sdatFiles = 0
  let overlaysExpanded = 0
  let membersDecompressed = 0
  let escapedNames = 0
  const failures: string[] = []

  /**
   * Write one payload, descending into it first if it is an archive.
   *
   * Archives become directories of the same name, so an entry in the output
   * tree is either a file or an unpacked archive, never ambiguously both.
   */
  const emit = async (
    data: Uint8Array,
    requestedPath: string,
    source: string,
    within: string[],
    originalNameHex: string | undefined,
  ): Promise<void> => {
    const outPath = claim(requestedPath)
    let payload = data
    let packedSize: number | undefined

    if (options.decompress) {
      // Identification is by successful decode: a leading 0x10 alone is not
      // evidence, and several file types on this cartridge start with one
      // without being compressed. Nothing decoded simply means nothing to do.
      const decompressed = tryDecompressLz10(payload)
      if (decompressed !== undefined) {
        packedSize = payload.length
        payload = decompressed
        membersDecompressed++
      }
    }

    if (options.unpack && isGpc(payload)) {
      // Parsing the index and unpacking members are separated deliberately: a
      // single member with an unidentified codec must not cost the whole
      // archive, and once any member has been written the output path is a
      // directory and can no longer fall back to being a file.
      let archive: ReturnType<typeof readGpc> | undefined
      try {
        archive = readGpc(payload)
      } catch (error) {
        failures.push(
          `${source}${within.length ? ` [${within.join(' > ')}]` : ''}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
      if (archive) {
        gpcUnpacked++
        for (const member of archive.members) {
          const safe = toSafeName(member.name)
          if (safe.escaped) escapedNames++
          if (!member.readable) {
            // The codec is not identified, so the bytes are preserved rather
            // than lost. Some of these members turn out to have no region
            // prefix at all and to be archives outright; where the raw bytes
            // identify themselves, keep the member's real name so the recursion
            // below can unpack them, and only mark the rest.
            gpcUnreadable++
            const stored = archive.readRaw(member)
            const identifiable = isNarc(stored) || isGpc(stored)
            if (identifiable) gpcPrefixless++
            await emit(
              stored,
              join(outPath, identifiable ? safe.safe : `${safe.safe}.gpc-codec${member.method}`),
              source,
              [...within, member.name],
              safe.originalHex,
            )
            continue
          }
          try {
            await emit(
              archive.read(member),
              join(outPath, safe.safe),
              source,
              [...within, member.name],
              safe.originalHex,
            )
          } catch (error) {
            failures.push(
              `${source} [${[...within, member.name].join(' > ')}]: ${error instanceof Error ? error.message : String(error)}`,
            )
          }
        }
        return
      }
    }

    if (options.unpack && isSdat(payload)) {
      // A sound archive names most of its files through its symbol block; the
      // rest are numbered. The stamp gives the extension, so an SSEQ lands as
      // BG_001.sseq rather than as an anonymous blob.
      try {
        const sdat = readSdat(payload)
        sdatUnpacked++
        const namesById = new Map<number, string>()
        for (const list of sdat.records) {
          for (const record of list) {
            if (record.fileId === undefined || !record.name) continue
            if (!namesById.has(record.fileId)) namesById.set(record.fileId, record.name)
          }
        }
        for (const file of sdat.files) {
          const bytes = sdat.read(file.id)
          const extension =
            bytes.length >= 4
              ? Array.from(bytes.subarray(0, 4), (c) =>
                  c >= 0x41 && c <= 0x5a ? String.fromCharCode(c + 32) : '',
                ).join('')
              : ''
          const stem = namesById.get(file.id) ?? `${String(file.id).padStart(4, '0')}`
          const safe = toSafeName(`${stem}.${extension || 'bin'}`)
          if (safe.escaped) escapedNames++
          sdatFiles++
          await emit(bytes, join(outPath, safe.safe), source, [...within, stem], safe.originalHex)
        }
        return
      } catch (error) {
        failures.push(
          `${source}${within.length ? ` [${within.join(' > ')}]` : ''}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    if (options.unpack && isNarc(payload)) {
      try {
        const archive = readNarc(payload)
        archivesUnpacked++
        for (const member of archive.entries()) {
          const memberName = member.name ?? `${String(member.index).padStart(4, '0')}.bin`
          const safe = toSafeName(memberName)
          if (safe.escaped) escapedNames++
          await emit(
            member.data,
            join(outPath, safe.safe),
            source,
            [...within, memberName],
            safe.originalHex,
          )
        }
        return
      } catch (error) {
        // A NARC we cannot walk is still worth having on disk as bytes.
        failures.push(
          `${source}${within.length ? ` [${within.join(' > ')}]` : ''}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    const entry: ManifestEntry = {
      out: outPath.slice(options.out.length + 1),
      source,
      within,
      size: payload.length,
      container: identify(payload.subarray(0, 4)).label,
    }
    if (packedSize !== undefined) entry.packedSize = packedSize
    if (originalNameHex !== undefined) entry.originalNameHex = originalNameHex
    manifest.push(entry)

    await queue.write(outPath, payload)
  }

  // --- ARM binaries and overlays -----------------------------------------
  await queue.write(join(options.out, 'system', 'arm9.bin'), fs.readArm9())
  await queue.write(join(options.out, 'system', 'arm7.bin'), fs.readArm7())
  manifest.push(
    {
      out: 'system/arm9.bin',
      source: '(arm9)',
      within: [],
      size: fs.header.arm9.size,
      container: 'ARM9 binary',
    },
    {
      out: 'system/arm7.bin',
      source: '(arm7)',
      within: [],
      size: fs.header.arm7.size,
      container: 'ARM7 binary',
    },
  )
  for (const overlay of fs.arm9Overlays) {
    const name = `overlay_${String(overlay.overlayId).padStart(4, '0')}.bin`
    const stored = fs.read(overlay.fileId)

    // Overlays are BLZ-compressed. Writing them out raw leaves them unreadable
    // to anything downstream, so decompress when the footer says to and the
    // result is the size the overlay table declares.
    let data = stored
    let packedSize: number | undefined
    if (overlay.compressed && looksBlz(stored)) {
      try {
        const expanded = decompressBlz(stored)
        if (expanded.length === overlay.ramSize) {
          packedSize = stored.length
          data = expanded
          overlaysExpanded++
        }
      } catch (error) {
        failures.push(
          `(arm9 overlay ${overlay.overlayId}): ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    await queue.write(join(options.out, 'system', 'overlay9', name), data)
    const entry: ManifestEntry = {
      out: `system/overlay9/${name}`,
      source: `(arm9 overlay ${overlay.overlayId})`,
      within: [],
      size: data.length,
      container: packedSize === undefined ? 'overlay' : 'overlay, BLZ-decompressed',
    }
    if (packedSize !== undefined) entry.packedSize = packedSize
    manifest.push(entry)
  }

  // --- The filesystem ------------------------------------------------------
  const files = [...walkFiles(fs.root)].filter(
    (file) => !options.filter || file.path.toLowerCase().includes(options.filter.toLowerCase()),
  )
  log(`  ${files.length} files to process`)

  let processed = 0
  for (const file of files) {
    const data = fs.read(file)
    const safePath = toSafePath(file.path)
    if (safePath !== file.path.replace(/^\//, '')) escapedNames++

    if (options.raw) {
      await queue.write(claim(join(options.out, 'raw', safePath)), data)
    }
    await emit(data, join(options.out, 'files', safePath), file.path, [], undefined)

    if (++processed % 500 === 0) {
      log(`    ${processed}/${files.length} files, ${queue.count} written`)
    }
  }
  await queue.drain()

  // --- Manifest ------------------------------------------------------------
  const summary = {
    rom: {
      path: options.romPath,
      sha1,
      size: rom.length,
      gameCode: fs.header.gameCode,
      headerChecksumOk: integrity.headerOk,
      logoChecksumOk: integrity.logoOk,
    },
    extractedAt: new Date().toISOString(),
    options: {
      unpack: options.unpack,
      decompress: options.decompress,
      raw: options.raw,
      filter: options.filter ?? null,
    },
    counts: {
      cartridgeFiles: files.length,
      written: queue.count,
      archivesUnpacked,
      gpcUnpacked,
      gpcUnreadable,
      gpcPrefixless,
      sdatUnpacked,
      sdatFiles,
      overlaysExpanded,
      membersDecompressed,
      escapedNames,
      collisions,
      failures: failures.length,
    },
    files: manifest,
  }
  if (!options.dryRun) {
    await mkdir(options.out, { recursive: true })
    await writeFile(join(options.out, 'manifest.json'), JSON.stringify(summary, null, 2))
  }

  log('')
  const rows: [string, string][] = [
    ['cartridge files', String(files.length)],
    ['archives unpacked', String(archivesUnpacked)],
    ['gpc2 archives unpacked', String(gpcUnpacked)],
    ['gpc2 members with an unidentified codec', String(gpcUnreadable)],
    ['  of those, stored with no prefix and recovered', String(gpcPrefixless)],
    ['sdat archives unpacked', String(sdatUnpacked)],
    ['sound files written', String(sdatFiles)],
    ['overlays BLZ-decompressed', String(overlaysExpanded)],
    ['members decompressed', String(membersDecompressed)],
    ['names escaped', String(escapedNames)],
    ['name collisions resolved', String(collisions)],
    ['files written', String(queue.count)],
    ['bytes written', humanBytes(queue.bytes)],
    ['failures', String(failures.length)],
  ]
  const width = Math.max(...rows.map(([k]) => k.length))
  for (const [k, v] of rows) console.log(`  ${k.padEnd(width)}  ${v}`)

  if (failures.length > 0) {
    console.log(`\n  first failures:`)
    for (const failure of failures.slice(0, 10)) console.log(`    ${failure}`)
    if (failures.length > 10) console.log(`    ... ${failures.length - 10} more`)
  }

  if (!options.dryRun) {
    console.log(`\n  manifest: ${join(options.out, 'manifest.json')}`)
    console.log('\n  This output is cartridge-derived. Do not commit it.\n')
  } else {
    console.log('')
  }
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
