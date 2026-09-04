#!/usr/bin/env node
/**
 * Catalogue a DS cartridge's filesystem.
 *
 *   pnpm inventory <rom.nds> [options]
 *
 *     --tree               print the full directory tree
 *     --deep               recurse into NARC archives, decompress, identify
 *     --find <substring>   list paths containing a substring (case-insensitive)
 *     --ext <ext>          list files with a given extension
 *     --kind <category>    list files identified as a category (model, audio, ...)
 *     --json <file>        write the full catalogue as JSON
 *     --extract <path>     write one file's bytes out
 *     --out <dir>          destination directory for --extract (default ./out)
 *     --limit <n>          cap listing output (default 200, 0 for no cap)
 *
 * Everything this prints or writes is derived from the cartridge. Keep it in
 * `out/`, which is gitignored, and never commit it.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tryDecompressLz10 } from '@vesper/nitro-comp'
import {
  checkHeaderIntegrity,
  gameCodeRegion,
  isNarc,
  type NitroDir,
  type NitroFile,
  readNarc,
  readNitroFs,
  walkFiles,
} from '@vesper/nitrofs'
import { identify, type SignatureCategory } from './signatures.ts'

interface Options {
  romPath: string
  tree: boolean
  find: string | undefined
  ext: string | undefined
  kind: string | undefined
  json: string | undefined
  extract: string | undefined
  out: string
  limit: number
  deep: boolean
}

function parseArgs(argv: string[]): Options {
  const positional: string[] = []
  const flags = new Map<string, string>()
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const name = arg.slice(2)
    if (name === 'tree' || name === 'deep') {
      flags.set(name, 'true')
      continue
    }
    const value = argv[++i]
    if (value === undefined) throw new Error(`--${name} needs a value`)
    flags.set(name, value)
  }
  const romPath = positional[0]
  if (romPath === undefined) {
    throw new Error('usage: pnpm inventory <rom.nds> [--tree] [--find s] [--json f] ...')
  }
  return {
    romPath,
    tree: flags.has('tree'),
    deep: flags.has('deep'),
    find: flags.get('find'),
    ext: flags.get('ext'),
    kind: flags.get('kind'),
    json: flags.get('json'),
    extract: flags.get('extract'),
    out: flags.get('out') ?? 'out',
    limit: Number(flags.get('limit') ?? 200),
  }
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
  return `${(n / (1024 * 1024)).toFixed(1)} MiB`
}

function printTree(dir: NitroDir, prefix = ''): void {
  const entries = [...dir.dirs, ...dir.files]
  entries.forEach((entry, i) => {
    const last = i === entries.length - 1
    const branch = last ? '└── ' : '├── '
    if (entry.kind === 'dir') {
      const counts = `${entry.dirs.length} dirs, ${entry.files.length} files`
      console.log(`${prefix}${branch}${entry.name}/  (${counts})`)
      printTree(entry, prefix + (last ? '    ' : '│   '))
    } else {
      console.log(`${prefix}${branch}${entry.name}  ${humanBytes(entry.size)}  #${entry.id}`)
    }
  })
}

function table(rows: [string, string | number][], indent = '  '): void {
  const width = Math.max(...rows.map(([k]) => k.length))
  for (const [k, v] of rows) console.log(`${indent}${k.padEnd(width)}  ${v}`)
}

function histogram(counts: Map<string, { files: number; bytes: number }>, title: string): void {
  const sorted = [...counts].sort((a, b) => b[1].bytes - a[1].bytes)
  console.log(`\n${title}`)
  table(
    sorted.map(([key, v]) => [key, `${String(v.files).padStart(5)} files  ${humanBytes(v.bytes)}`]),
  )
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const raw = await readFile(options.romPath)
  const rom = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)

  const sha1 = createHash('sha1').update(rom).digest('hex')
  const md5 = createHash('md5').update(rom).digest('hex')

  const fs = readNitroFs(rom)
  const { header } = fs
  const integrity = checkHeaderIntegrity(rom)

  console.log(`\n${options.romPath}`)
  table([
    ['title', header.title],
    ['game code', `${header.gameCode}  (region letter ${gameCodeRegion(header.gameCode)})`],
    ['maker code', header.makerCode],
    ['rom version', header.romVersion],
    ['image size', `${humanBytes(rom.length)} (${rom.length} bytes)`],
    ['used size', `${humanBytes(header.usedRomSize)}`],
    ['chip size', humanBytes(header.chipSize)],
    ['sha1', sha1],
    ['md5', md5],
    [
      'header crc',
      `0x${integrity.computedHeaderChecksum.toString(16)} ${integrity.headerOk ? 'ok' : 'MISMATCH'}`,
    ],
    ['logo crc', integrity.logoOk ? 'ok (retail)' : 'MISMATCH'],
    ['arm9', `0x${header.arm9.romOffset.toString(16)}  ${humanBytes(header.arm9.size)}`],
    ['arm7', `0x${header.arm7.romOffset.toString(16)}  ${humanBytes(header.arm7.size)}`],
    ['fnt', `0x${header.fnt.offset.toString(16)}  ${humanBytes(header.fnt.size)}`],
    ['fat', `0x${header.fat.offset.toString(16)}  ${fs.fat.length} entries`],
    ['arm9 overlays', fs.arm9Overlays.length],
    ['arm7 overlays', fs.arm7Overlays.length],
    ['named files', fs.files.length],
    ['directories', fs.dirs.length],
  ])

  // Identify every file from its leading bytes. Reading is a subarray, so this
  // touches four bytes per file, not the whole cartridge.
  interface Catalogued {
    file: NitroFile
    category: SignatureCategory
    label: string
    leadingBytes: string
  }
  const catalogued: Catalogued[] = []
  const byCategory = new Map<string, { files: number; bytes: number }>()
  const byExtension = new Map<string, { files: number; bytes: number }>()
  const unknownStamps = new Map<string, number>()

  const bump = (map: Map<string, { files: number; bytes: number }>, key: string, size: number) => {
    const entry = map.get(key) ?? { files: 0, bytes: 0 }
    entry.files++
    entry.bytes += size
    map.set(key, entry)
  }

  for (const file of walkFiles(fs.root)) {
    const id = identify(fs.read(file).subarray(0, 4))
    catalogued.push({
      file,
      category: id.category,
      label: id.label,
      leadingBytes: id.leadingBytes,
    })
    bump(byCategory, id.category, file.size)
    const dot = file.name.lastIndexOf('.')
    bump(byExtension, dot > 0 ? file.name.slice(dot).toLowerCase() : '(none)', file.size)
    if (id.category === 'unknown' && file.size > 0) {
      unknownStamps.set(id.leadingBytes, (unknownStamps.get(id.leadingBytes) ?? 0) + 1)
    }
  }

  histogram(byCategory, 'By identified container')
  histogram(byExtension, 'By extension')

  const topUnknown = [...unknownStamps].sort((a, b) => b[1] - a[1]).slice(0, 15)
  if (topUnknown.length > 0) {
    console.log('\nMost common unidentified leading bytes (candidates for a new parser)')
    table(topUnknown.map(([stamp, count]) => [stamp, `${count} files`]))
  }

  if (options.deep) {
    // Recurse one level into every NARC and identify its members. NARC member
    // reads are subarrays, so this stays cheap even across thousands of
    // archives; only the first four bytes of each member are examined.
    const memberCategories = new Map<string, { files: number; bytes: number }>()
    const memberExtensions = new Map<string, { files: number; bytes: number }>()
    const unknownMembers = new Map<string, number>()
    let archives = 0
    let namelessArchives = 0
    let failed = 0
    let compressedMembers = 0

    for (const c of catalogued) {
      if (c.category !== 'archive') continue
      const bytes = fs.read(c.file)
      if (!isNarc(bytes)) continue
      archives++
      try {
        const narc = readNarc(bytes)
        if (!narc.hasNames) namelessArchives++
        for (const member of narc.entries()) {
          // Identify what the member *is*, not how it is stored: nearly half of
          // them are LZ10 streams whose first four bytes say nothing useful.
          let payload = member.data
          const decompressed = tryDecompressLz10(payload)
          if (decompressed !== undefined) {
            payload = decompressed
            compressedMembers++
          }
          const id = identify(payload.subarray(0, 4))
          bump(memberCategories, id.category, payload.length)
          const name = member.name
          if (name !== undefined) {
            const dot = name.lastIndexOf('.')
            bump(
              memberExtensions,
              dot > 0 ? name.slice(dot).toLowerCase() : '(none)',
              payload.length,
            )
          }
          if (id.category === 'unknown' && payload.length > 0) {
            unknownMembers.set(id.leadingBytes, (unknownMembers.get(id.leadingBytes) ?? 0) + 1)
          }
        }
      } catch (error) {
        failed++
        if (failed <= 5) {
          console.error(
            `  ! ${c.file.path}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
    }

    console.log(
      `\nInside ${archives} NARC archives (${namelessArchives} nameless, ${failed} failed to parse)`,
    )
    console.log(`  ${compressedMembers} members were LZ10-compressed and decompressed first`)
    histogram(memberCategories, '  Members by identified container')
    histogram(memberExtensions, '  Members by extension')
    const topUnknownMembers = [...unknownMembers].sort((a, b) => b[1] - a[1]).slice(0, 10)
    if (topUnknownMembers.length > 0) {
      console.log('\n  Most common unidentified member leading bytes')
      table(
        topUnknownMembers.map(([stamp, count]) => [stamp, `${count} members`]),
        '    ',
      )
    }
  }

  console.log('\nTop-level directories')
  table(
    fs.root.dirs.map((d) => {
      const files = [...walkFiles(d)]
      const bytes = files.reduce((n, f) => n + f.size, 0)
      return [`${d.name}/`, `${String(files.length).padStart(5)} files  ${humanBytes(bytes)}`]
    }),
  )

  if (options.tree) {
    console.log('\nTree')
    printTree(fs.root)
  }

  const listing = catalogued.filter((c) => {
    if (options.find && !c.file.path.toLowerCase().includes(options.find.toLowerCase()))
      return false
    if (options.ext && !c.file.name.toLowerCase().endsWith(options.ext.toLowerCase())) return false
    if (options.kind && c.category !== options.kind) return false
    return options.find !== undefined || options.ext !== undefined || options.kind !== undefined
  })
  if (listing.length > 0) {
    console.log(`\nMatches (${listing.length})`)
    const shown = options.limit > 0 ? listing.slice(0, options.limit) : listing
    for (const c of shown) {
      console.log(
        `  #${String(c.file.id).padStart(5)}  ${humanBytes(c.file.size).padStart(10)}  ${c.file.path}  [${c.label}]`,
      )
    }
    if (shown.length < listing.length) {
      console.log(`  ... ${listing.length - shown.length} more (raise --limit)`)
    }
  }

  if (options.json) {
    const catalogue = {
      rom: { path: options.romPath, sha1, md5, size: rom.length },
      header,
      integrity,
      overlays: fs.arm9Overlays,
      files: catalogued.map((c) => ({
        id: c.file.id,
        path: c.file.path,
        start: c.file.start,
        size: c.file.size,
        category: c.category,
        label: c.label,
        leadingBytes: c.leadingBytes,
      })),
    }
    await mkdir(dirname(options.json), { recursive: true })
    await writeFile(options.json, JSON.stringify(catalogue, null, 2))
    console.log(`\nwrote ${options.json} (${catalogue.files.length} entries)`)
  }

  if (options.extract) {
    const file = fs.file(options.extract)
    if (!file) throw new Error(`no such file in the cartridge: ${options.extract}`)
    const dest = join(options.out, file.path.replace(/^\//, ''))
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, fs.read(file))
    console.log(`\nwrote ${dest} (${humanBytes(file.size)})`)
  }

  console.log('')
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
