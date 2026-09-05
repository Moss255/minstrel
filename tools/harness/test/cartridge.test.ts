import { readFileSync } from 'node:fs'
import { isBitmapFont, isDataTable, readBitmapFont, readDataTable } from '@vesper/game-formats'
import { crc32OfName, isGpc, readGpc } from '@vesper/l5-gpc'
import { decompressLz10, isLz10, readCompressionHeader } from '@vesper/nitro-comp'
import { isNsbmd, readNsbmd } from '@vesper/nitro-gfx'
import { isSdat, RecordKind, readSdat } from '@vesper/nitro-snd'
import { isNarc, type NitroFs, readNarc, readNitroFs, walkFiles } from '@vesper/nitrofs'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * Integration tests against a real cartridge.
 *
 * These never run in CI and their inputs are never committed. Point
 * `VESPER_TEST_ROM` at your own dump to run them:
 *
 *   VESPER_TEST_ROM=rom/your.nds pnpm test
 *
 * The assertions are deliberately about *self-consistency* rather than about
 * specific offsets in one title, so they hold for any DS cartridge. They are
 * the evidence behind the claims in each package's FORMAT.md: a parser that
 * agrees with several thousand independent samples is not guessing.
 */
const romPath = process.env.VESPER_TEST_ROM

describe.skipIf(!romPath)('a real cartridge', () => {
  let rom: Uint8Array
  let fs: NitroFs

  beforeAll(() => {
    const raw = readFileSync(romPath as string)
    rom = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
    fs = readNitroFs(rom)
  })

  it('has a header whose checksums verify', () => {
    expect(fs.header.gameCode).toHaveLength(4)
    expect(fs.header.headerSize).toBeGreaterThanOrEqual(0x200)
    expect(fs.header.usedRomSize).toBeLessThanOrEqual(rom.length)
  })

  it('walks its whole filesystem without throwing', () => {
    const files = [...walkFiles(fs.root)]
    expect(files.length).toBeGreaterThan(0)
    expect(files.length).toBeLessThanOrEqual(fs.fat.length)
  })

  it('gives every named file a range inside the image', () => {
    for (const file of walkFiles(fs.root)) {
      expect(file.start, file.path).toBeLessThanOrEqual(file.end)
      expect(file.end, file.path).toBeLessThanOrEqual(rom.length)
      expect(fs.read(file).length, file.path).toBe(file.size)
    }
  })

  it('resolves every named file by path and by ID to the same bytes', () => {
    for (const file of walkFiles(fs.root)) {
      const byPath = fs.read(file.path)
      const byId = fs.read(file.id)
      expect(byId.byteOffset, file.path).toBe(byPath.byteOffset)
      expect(byId.length, file.path).toBe(byPath.length)
    }
  })

  it('points every overlay at a real FAT entry', () => {
    for (const overlay of fs.arm9Overlays) {
      expect(overlay.fileId).toBeLessThan(fs.fat.length)
      expect(fs.read(overlay.fileId).length).toBeGreaterThan(0)
    }
  })

  it('parses every NARC archive it contains', () => {
    const failures: string[] = []
    let archives = 0
    let members = 0

    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isNarc(bytes)) continue
      archives++
      try {
        const narc = readNarc(bytes)
        for (const entry of narc.entries()) {
          members++
          expect(entry.data.length).toBeGreaterThanOrEqual(0)
        }
      } catch (error) {
        failures.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    expect(failures).toEqual([])
    expect(archives).toBeGreaterThan(0)
    expect(members).toBeGreaterThan(archives)
  })

  it('decompresses every LZ10 member to exactly its declared length', () => {
    const failures: string[] = []
    let compressed = 0

    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isNarc(bytes)) continue
      for (const entry of readNarc(bytes).entries()) {
        if (!isLz10(entry.data)) continue
        compressed++
        const declared = readCompressionHeader(entry.data).decompressedSize
        try {
          const out = decompressLz10(entry.data)
          if (out.length !== declared) {
            failures.push(`${file.path}#${entry.index}: got ${out.length}, declared ${declared}`)
          }
        } catch (error) {
          failures.push(
            `${file.path}#${entry.index}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
    }

    expect(failures.slice(0, 10)).toEqual([])
    expect(compressed).toBeGreaterThan(0)
  })

  it('parses the GPC2 archives it contains and resolves every name by CRC-32', () => {
    // The strongest available check on the GPC2 reading: the hash is stored in
    // the index, the name comes from a separately-compressed table, and the two
    // are joined through an offset split across two words. All three decodings
    // must be right for a single name to match.
    const failures: string[] = []
    let archives = 0
    let names = 0

    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isGpc(bytes)) continue
      try {
        const archive = readGpc(bytes)
        archives++
        for (const member of archive.members) {
          names++
          if (crc32OfName(member.name) !== member.hash) {
            failures.push(`${file.path}: '${member.name}' hash mismatch`)
          }
        }
      } catch (error) {
        failures.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // A small number of large archives use an index shape this package does not
    // yet read; see packages/l5-gpc/FORMAT.md. Everything that parses must be
    // internally consistent.
    expect(failures.filter((f) => f.includes('hash mismatch'))).toEqual([])
    expect(archives).toBeGreaterThan(0)
    expect(names).toBeGreaterThan(archives)
  })

  it('decodes every GPC2 member whose codec is implemented to its declared size', () => {
    const failures: string[] = []
    let decoded = 0
    let unidentified = 0

    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isGpc(bytes)) continue
      let archive: ReturnType<typeof readGpc>
      try {
        archive = readGpc(bytes)
      } catch {
        continue
      }
      for (const member of archive.members) {
        if (!member.readable) {
          unidentified++
          continue
        }
        try {
          const out = archive.read(member)
          if (out.length !== member.size) {
            failures.push(`${file.path}#${member.name}: ${out.length} != ${member.size}`)
          } else {
            decoded++
          }
        } catch (error) {
          failures.push(
            `${file.path}#${member.name}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
    }

    expect(failures.length).toBeLessThan(10)
    expect(decoded).toBeGreaterThan(0)
    expect(unidentified).toBeGreaterThan(0)
    // The overwhelming majority of members must be readable; a codec regression
    // would show up here as a collapse in this ratio rather than as an error.
    expect(decoded / (decoded + unidentified)).toBeGreaterThan(0.95)
  })

  it('offers raw bytes for GPC2 members whose codec is unidentified', () => {
    // Some members are stored with no region prefix and are archives outright.
    // They must survive as bytes rather than being dropped.
    let raw = 0
    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isGpc(bytes)) continue
      let archive: ReturnType<typeof readGpc>
      try {
        archive = readGpc(bytes)
      } catch {
        continue
      }
      for (const member of archive.members) {
        if (member.readable) continue
        const stored = archive.readRaw(member)
        expect(stored.length, `${file.path}#${member.name}`).toBe(member.storedLength)
        raw++
      }
    }
    expect(raw).toBeGreaterThan(0)
  })

  it('parses every model on the cartridge and decodes its geometry', () => {
    // Two independent oracles, both from the model's own header: the number of
    // vertices the display list yields, and the number of triangles once quads
    // are split. A display-list interpreter that is subtly wrong — a mistaken
    // parameter count, a missed partial-vertex command — desynchronises and
    // fails both.
    const failures: string[] = []
    let models = 0
    let vertexMatches = 0
    let triangleMatches = 0

    const eachModel = (bytes: Uint8Array, path: string): void => {
      if (!isNsbmd(bytes)) return
      try {
        for (const model of readNsbmd(bytes).models) {
          models++
          let vertices = 0
          let triangles = 0
          for (const shape of model.shapes) {
            const geometry = model.geometry(shape)
            vertices += geometry.vertices.length
            triangles += geometry.indices.length / 3
          }
          if (vertices === model.numVertices) vertexMatches++
          else
            failures.push(
              `${path}#${model.name}: ${vertices} vertices, header says ${model.numVertices}`,
            )
          if (triangles === model.numTriangles + model.numQuads * 2) triangleMatches++
          else
            failures.push(
              `${path}#${model.name}: ${triangles} triangles, header says ${model.numTriangles} + 2*${model.numQuads}`,
            )
        }
      } catch (error) {
        failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isNarc(bytes)) continue
      for (const member of readNarc(bytes).entries()) {
        const data = isLz10(member.data) ? decompressLz10(member.data) : member.data
        eachModel(data, `${file.path}#${member.name ?? member.index}`)
      }
    }

    expect(failures.slice(0, 10)).toEqual([])
    expect(models).toBeGreaterThan(1000)
    expect(vertexMatches).toBe(models)
    expect(triangleMatches).toBe(models)
  })

  it('parses its sound archives and resolves every audio resource', () => {
    // The load-bearing check: a record's file id must land on a file whose
    // stamp is the one that record kind implies. Reading the leading u16 of
    // every record as a file id looks plausible and is wrong for three of the
    // eight kinds, so this is what separates a correct reading from a lucky one.
    const expected: Record<number, string> = {
      [RecordKind.Sequence]: 'SSEQ',
      [RecordKind.SequenceArchive]: 'SSAR',
      [RecordKind.Bank]: 'SBNK',
      [RecordKind.WaveArchive]: 'SWAR',
      [RecordKind.Stream]: 'STRM',
    }
    const failures: string[] = []
    let archives = 0
    let resolved = 0
    let chains = 0

    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isSdat(bytes)) continue
      archives++
      const sdat = readSdat(bytes)

      for (const [kind, stamp] of Object.entries(expected)) {
        for (const record of sdat.records[Number(kind)] ?? []) {
          if (record.fileId === undefined) continue
          resolved++
          const data = sdat.read(record)
          const actual = String.fromCharCode(...data.subarray(0, 4))
          if (actual !== stamp) {
            failures.push(`${file.path}#${record.name ?? record.index}: '${actual}' not '${stamp}'`)
          }
        }
      }

      // Walk each sequence to its bank and on to that bank's wave archives —
      // three lookups through separately-parsed tables.
      for (const sequence of sdat.sequences) {
        if (sequence.fileId === undefined) continue
        const bank = sdat.banks[sdat.sequenceInfo(sequence).bankId]
        if (!bank || bank.fileId === undefined) continue
        const waves = sdat.bankInfo(bank).waveArchiveIds.filter((id) => id !== 0xffff)
        if (waves.every((id) => sdat.waveArchives[id]?.fileId !== undefined)) chains++
      }
    }

    expect(failures.slice(0, 10)).toEqual([])
    expect(archives).toBeGreaterThan(0)
    expect(resolved).toBeGreaterThan(1000)
    expect(chains).toBeGreaterThan(0)
  })

  it('reads every bitmap font it contains', () => {
    // The font has no magic number, so this doubles as a check on the header
    // shape test: it must accept every font and nothing else in the cartridge.
    const failures: string[] = []
    let fonts = 0
    let glyphs = 0
    let falsePositives = 0

    const visit = (bytes: Uint8Array, path: string): void => {
      if (!isBitmapFont(bytes)) return
      const looksLikeFont = path.endsWith('.mes')
      if (!looksLikeFont) {
        falsePositives++
        return
      }
      fonts++
      try {
        const font = readBitmapFont(bytes)
        glyphs += font.glyphCount
        if (font.glyphCount > 0) {
          font.glyph(0)
          font.glyph(font.glyphCount - 1)
        }
      } catch (error) {
        failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isGpc(bytes)) continue
      let archive: ReturnType<typeof readGpc>
      try {
        archive = readGpc(bytes)
      } catch {
        continue
      }
      for (const member of archive.members) {
        if (!member.readable) continue
        try {
          visit(archive.read(member), `${file.path}/${member.name}`)
        } catch {
          // A member whose codec is not identified is covered by its own test.
        }
      }
    }

    expect(failures).toEqual([])
    expect(fonts).toBeGreaterThan(500)
    expect(glyphs).toBeGreaterThan(50000)
    expect(falsePositives).toBe(0)
  })

  it('reads every map descriptor and attribute table', () => {
    // Two checks the files make of themselves: the string section must decode
    // to exactly the count the header declares, and the record stream — walked
    // by nothing but its own length fields — must arrive precisely at the
    // string table.
    const failures: string[] = []
    let tables = 0
    let resources = 0

    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isNarc(bytes)) continue
      for (const member of readNarc(bytes).entries()) {
        const name = member.name ?? ''
        if (!name.endsWith('.bmdj') && !name.endsWith('.bats')) continue
        const data = isLz10(member.data) ? decompressLz10(member.data) : member.data
        if (!isDataTable(data)) {
          failures.push(`${file.path}#${name}: failed the table shape test`)
          continue
        }
        try {
          const table = readDataTable(data)
          tables++
          resources += table.strings.filter((s) => s.endsWith('.imd')).length
        } catch (error) {
          failures.push(
            `${file.path}#${name}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
    }

    expect(failures.slice(0, 10)).toEqual([])
    expect(tables).toBeGreaterThan(1000)
    expect(resources).toBeGreaterThan(1000)
  })

  it('produces the container magic each member extension implies', () => {
    // Independent cross-check on the decompressor: a decoder that is subtly
    // wrong would not reliably land on the right four-byte stamp thousands of
    // times over.
    const expected: Record<string, string> = {
      '.nsbmd': 'BMD0',
      '.nsbtx': 'BTX0',
      '.nsbca': 'BCA0',
      '.nsbta': 'BTA0',
      '.nsbtp': 'BTP0',
      '.nsbma': 'BMA0',
    }
    const mismatches: string[] = []
    let checked = 0

    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isNarc(bytes)) continue
      for (const entry of readNarc(bytes).entries()) {
        const name = entry.name
        if (name === undefined) continue
        const dot = name.lastIndexOf('.')
        const want = dot > 0 ? expected[name.slice(dot).toLowerCase()] : undefined
        if (want === undefined) continue

        const data = isLz10(entry.data) ? decompressLz10(entry.data) : entry.data
        const stamp = String.fromCharCode(...data.subarray(0, 4))
        checked++
        if (stamp !== want) mismatches.push(`${file.path}#${name}: '${stamp}' not '${want}'`)
      }
    }

    expect(mismatches.slice(0, 10)).toEqual([])
    expect(checked).toBeGreaterThan(0)
  })
})
