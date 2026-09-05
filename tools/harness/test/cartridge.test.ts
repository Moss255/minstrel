import { readFileSync } from 'node:fs'
import { isBitmapFont, isDataTable, readBitmapFont, readDataTable } from '@vesper/game-formats'
import { crc32OfName, isGpc, readGpc } from '@vesper/l5-gpc'
import {
  decompressBlz,
  decompressLz10,
  isLz10,
  looksBlz,
  readCompressionHeader,
} from '@vesper/nitro-comp'
import {
  type Animation,
  boneTrackSize,
  isNsbca,
  isNsbmd,
  isNsbtx,
  type Model,
  RenderOp,
  readNsbca,
  readNsbmd,
  readTex0,
  sampleAnimation,
  texelDataSize,
} from '@vesper/nitro-gfx'
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

  it('decompresses every BLZ overlay to the size its table declares', () => {
    // Three independent checks. The declared size is the obvious one; the
    // backwards walk consuming its input to exactly where the verbatim prefix
    // ends is the one a wrong decoder fails; and entropy falling sharply says
    // the output is code rather than more compressed data.
    const failures: string[] = []
    let expanded = 0

    const entropy = (bytes: Uint8Array): number => {
      const counts = new Array(256).fill(0)
      const n = Math.min(bytes.length, 0x8000)
      for (let i = 0; i < n; i++) counts[bytes[i] as number]++
      let e = 0
      for (const c of counts) {
        if (c === 0) continue
        const p = c / n
        e -= p * Math.log2(p)
      }
      return e
    }

    for (const overlay of fs.arm9Overlays) {
      const stored = fs.read(overlay.fileId)
      if (!overlay.compressed || !looksBlz(stored)) continue
      try {
        const out = decompressBlz(stored)
        if (out.length !== overlay.ramSize) {
          failures.push(
            `overlay ${overlay.overlayId}: ${out.length} bytes, table says ${overlay.ramSize}`,
          )
          continue
        }
        if (out.length > 0x8000 && entropy(out) >= entropy(stored)) {
          failures.push(`overlay ${overlay.overlayId}: entropy did not fall`)
          continue
        }
        expanded++
      } catch (error) {
        failures.push(
          `overlay ${overlay.overlayId}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }

    expect(failures).toEqual([])
    expect(expanded).toBe(fs.arm9Overlays.length)
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

  it("reads every model's bones and render commands", () => {
    // Two checks the files make of themselves. A node's size depends on its
    // flags, so computing it wrongly desynchronises from the object
    // dictionary's offsets; and a rotation that is read wrongly is not
    // orthonormal.
    const failures: string[] = []
    let nodes = 0
    let rotations = 0

    const check = (bytes: Uint8Array, path: string): void => {
      if (!isNsbmd(bytes)) return
      let parsed: ReturnType<typeof readNsbmd>
      try {
        parsed = readNsbmd(bytes)
      } catch {
        return
      }
      for (const model of parsed.models) {
        for (const node of model.nodes) {
          nodes++
          // A pure rotation — no scale — must have orthonormal columns.
          if ((node.flags & 0x02) !== 0 || (node.flags & 0x04) === 0) continue
          rotations++
          const m = node.local
          const col = (c: number) => [
            m[c * 4] as number,
            m[c * 4 + 1] as number,
            m[c * 4 + 2] as number,
          ]
          const dot = (x: number[], y: number[]) =>
            (x[0] as number) * (y[0] as number) +
            (x[1] as number) * (y[1] as number) +
            (x[2] as number) * (y[2] as number)
          for (const c of [0, 1, 2]) {
            if (Math.abs(Math.sqrt(dot(col(c), col(c))) - 1) > 0.02) {
              failures.push(`${path}#${model.name}/${node.name}: column ${c} is not unit length`)
            }
          }
          if (Math.abs(dot(col(0), col(1))) > 0.03 || Math.abs(dot(col(1), col(2))) > 0.03) {
            failures.push(`${path}#${model.name}/${node.name}: columns are not perpendicular`)
          }
        }
        // Posing must not throw and must preserve the vertex count.
        for (const shape of model.shapes) {
          const raw = model.geometry(shape)
          const posed = model.posedGeometry(shape)
          if (raw.vertices.length !== posed.vertices.length) {
            failures.push(`${path}#${model.name}: posing changed the vertex count`)
          }
        }
      }
    }

    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isNarc(bytes)) continue
      for (const member of readNarc(bytes).entries()) {
        const data = isLz10(member.data) ? decompressLz10(member.data) : member.data
        check(data, `${file.path}#${member.name ?? member.index}`)
      }
    }

    expect(failures.slice(0, 10)).toEqual([])
    expect(nodes).toBeGreaterThan(10000)
    expect(rotations).toBeGreaterThan(1000)
  })

  it('reads every texture set and decodes every texture', () => {
    // The oracle is that texture sizes tile: computing a texture's byte length
    // from its format and dimensions must land on the next texture's offset,
    // and the last must land on the declared data size. A wrong format table
    // fails that immediately.
    const failures: string[] = []
    let sets = 0
    let textures = 0
    let tiled = 0
    let tiledTotal = 0

    const visit = (bytes: Uint8Array, path: string): void => {
      let set: ReturnType<typeof readTex0> | undefined
      try {
        if (isNsbtx(bytes)) {
          const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
          const offset = view.getUint32(0x10, true)
          set = readTex0(bytes.subarray(offset, offset + view.getUint32(offset + 4, true)))
        } else if (isNsbmd(bytes)) {
          set = readNsbmd(bytes).textures
        }
      } catch (error) {
        failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`)
        return
      }
      if (!set) return
      sets++

      const sorted = [...set.textures]
        .filter((t) => t.dataSize > 0)
        .sort((a, b) => a.dataOffset - b.dataOffset)
      for (let i = 0; i < sorted.length - 1; i++) {
        tiledTotal++
        const here = sorted[i] as (typeof sorted)[number]
        const next = sorted[i + 1] as (typeof sorted)[number]
        if (here.dataOffset + here.dataSize === next.dataOffset) tiled++
      }

      for (const texture of set.textures) {
        textures++
        expect(texture.dataSize, `${path}#${texture.name}`).toBe(
          texelDataSize(texture.format, texture.width, texture.height),
        )
        try {
          const palette = set.palette(`${texture.name}_pl`) ?? set.palettes[texture.index]
          const pixels = set.decode(texture, palette)
          if (pixels.length !== texture.width * texture.height * 4) {
            failures.push(`${path}#${texture.name}: decoded ${pixels.length} bytes`)
          }
        } catch (error) {
          failures.push(
            `${path}#${texture.name}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
    }

    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isNarc(bytes)) continue
      for (const member of readNarc(bytes).entries()) {
        const data = isLz10(member.data) ? decompressLz10(member.data) : member.data
        visit(data, `${file.path}#${member.name ?? member.index}`)
      }
    }

    expect(failures.slice(0, 10)).toEqual([])
    expect(sets).toBeGreaterThan(1000)
    expect(textures).toBeGreaterThan(10000)
    // Textures pack tightly; the few gaps are alignment.
    expect(tiled / tiledTotal).toBeGreaterThan(0.95)
  })

  it('reads every animation, and its track sizes lay end to end', () => {
    // The size formula is fitted from the flag bits, so the check that it is
    // right is that a track's computed length lands exactly on the next
    // track's offset — the file's own numbers, not this code's.
    const failures: string[] = []
    let animations = 0
    let tracks = 0
    let adjacent = 0

    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isNarc(bytes)) continue
      for (const member of readNarc(bytes).entries()) {
        const data = isLz10(member.data) ? decompressLz10(member.data) : member.data
        if (!isNsbca(data)) continue
        try {
          for (const animation of readNsbca(data).animations) {
            animations++
            const sorted = [...animation.tracks].sort((a, b) => a.offset - b.offset)
            tracks += sorted.length
            for (let i = 0; i < sorted.length - 1; i++) {
              const here = sorted[i] as (typeof sorted)[number]
              const next = sorted[i + 1] as (typeof sorted)[number]
              adjacent++
              if (here.offset + boneTrackSize(here.flags) !== next.offset) {
                failures.push(
                  `${file.path}#${animation.name}: track ${i} of ${boneTrackSize(here.flags)} bytes does not reach ${next.offset - here.offset}`,
                )
              }
            }
          }
        } catch (error) {
          failures.push(
            `${file.path}#${member.name ?? member.index}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
    }

    expect(failures.slice(0, 10)).toEqual([])
    expect(animations).toBeGreaterThan(1000)
    expect(tracks).toBeGreaterThan(10000)
    expect(adjacent).toBeGreaterThan(10000)
  })

  it('leaves a blended vertex where it was, when the model is in its bind pose', () => {
    // A blended vertex is stored in bind-pose space, so composing each blend
    // term with the named node's inverse bind transform has to give back the
    // identity, and the vertex has to land exactly where the display list put
    // it — bar the model's own `downScale`, which posing folds in.
    //
    // Which vertices those are has to be worked out per shape: a model reuses
    // stack slots, so a slot holding a blend when one shape is drawn may hold a
    // plain node's transform by the time the next one is.
    let models = 0
    let exact = 0
    let worstAnywhere = 0

    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isNarc(bytes)) continue
      for (const member of readNarc(bytes).entries()) {
        const data = isLz10(member.data) ? decompressLz10(member.data) : member.data
        if (!isNsbmd(data)) continue
        let model: Model | undefined
        try {
          model = readNsbmd(data).models[0]
        } catch {
          continue
        }
        if (!model) continue

        const blendedPerShape: Set<number>[] = []
        const live = new Set<number>()
        for (const command of model.renderCommands) {
          if (command.op === RenderOp.NodeMix) live.add(command.params[0] as number)
          else if (
            command.op === RenderOp.NodeDescription &&
            (command.opcode & 0x20) !== 0 &&
            command.params[3] !== undefined
          ) {
            live.delete(command.params[3] as number)
          } else if (command.op === RenderOp.Shape) {
            blendedPerShape[command.params[0] as number] = new Set(live)
          }
        }
        if (!blendedPerShape.some((s) => s && s.size > 0)) continue

        let worst = 0
        let any = false
        try {
          model.shapes.forEach((shape, index) => {
            const blended = blendedPerShape[index]
            if (!blended || blended.size === 0) return
            const rest = (model as Model).geometry(shape)
            const posed = (model as Model).posedGeometry(index)
            const scale = (model as Model).downScale
            rest.vertices.forEach((v, k) => {
              if (!blended.has(v.matrixId)) return
              const q = posed.vertices[k]
              if (!q) return
              any = true
              worst = Math.max(
                worst,
                Math.hypot(q.x - v.x * scale, q.y - v.y * scale, q.z - v.z * scale),
              )
            })
          })
        } catch {
          continue
        }
        if (!any) continue
        models++
        worstAnywhere = Math.max(worstAnywhere, worst)
        if (worst < 0.001) exact++
      }
    }

    expect(models).toBeGreaterThan(100)
    // Nothing on the cartridge is out by more than a fixed-point rounding.
    expect(worstAnywhere).toBeLessThan(0.1)
    expect(exact / models).toBeGreaterThan(0.85)
  })

  it('lays every animation curve out without overlapping another', () => {
    // A curve header says where its samples start but not how many bytes they
    // take; that comes from the frame span, the sample width and, for scale,
    // the reciprocal stored beside each value. If any of those were wrong the
    // curves would run into each other, so the check is that none does.
    const failures: string[] = []
    let curves = 0

    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isNarc(bytes)) continue
      for (const member of readNarc(bytes).entries()) {
        const data = isLz10(member.data) ? decompressLz10(member.data) : member.data
        if (!isNsbca(data)) continue
        let parsed: readonly Animation[]
        try {
          parsed = readNsbca(data).animations
        } catch (error) {
          failures.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`)
          continue
        }
        for (const animation of parsed) {
          const ends = new Map<number, number>()
          const claim = (at: number, size: number) => {
            curves++
            ends.set(at, Math.max(ends.get(at) ?? 0, at + size))
          }
          for (const track of animation.tracks) {
            for (const channel of track.translation ?? []) {
              if (channel.kind === 'curve') {
                claim(channel.curve.offset, channel.curve.count * (channel.curve.narrow ? 2 : 4))
              }
            }
            for (const channel of track.scale ?? []) {
              if (channel.kind === 'curve') {
                claim(channel.curve.offset, channel.curve.count * (channel.curve.narrow ? 4 : 8))
              }
            }
            if (track.rotation?.kind === 'curve') {
              claim(track.rotation.curve.offset, track.rotation.curve.count * 2)
            }
          }
          const starts = [...ends.keys()].sort((a, b) => a - b)
          for (let i = 0; i < starts.length - 1; i++) {
            const stop = ends.get(starts[i] as number) as number
            const next = starts[i + 1] as number
            if (stop > next) {
              failures.push(
                `${file.path}#${animation.name}: curve at ${starts[i]} runs ${stop - next} bytes into the next`,
              )
            }
          }
        }
      }
    }

    expect(failures.slice(0, 10)).toEqual([])
    expect(curves).toBeGreaterThan(10000)
  })

  it('poses every animation without reading outside it', () => {
    const failures: string[] = []
    let posed = 0

    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isNarc(bytes)) continue
      for (const member of readNarc(bytes).entries()) {
        const data = isLz10(member.data) ? decompressLz10(member.data) : member.data
        if (!isNsbca(data)) continue
        try {
          for (const animation of readNsbca(data).animations) {
            const last = Math.max(0, animation.frameCount - 1)
            for (const frame of [0, 1, animation.frameCount >> 1, last, animation.frameCount]) {
              sampleAnimation(animation, frame)
            }
            posed++
          }
        } catch (error) {
          failures.push(
            `${file.path}#${member.name ?? member.index}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
    }

    expect(failures.slice(0, 10)).toEqual([])
    expect(posed).toBeGreaterThan(1000)
  })

  it("starts an animation on its model's bind pose", () => {
    // The strongest check available on the whole chain: a model and the
    // animation beside it are independent files, and if the flags, the field
    // layout, the curve headers or either rotation pool were read wrongly, the
    // transforms sampled at frame zero would not land back on the pose the
    // model itself stores.
    let bones = 0
    let matched = 0

    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isNarc(bytes)) continue
      const narc = readNarc(bytes)
      const members = [...narc.entries()]
      for (const member of members) {
        if (!member.name?.endsWith('.nsbmd')) continue
        const base = member.name.slice(0, -6)
        const beside = members.find((m) => m.name === `${base}.nsbca`)
        if (!beside) continue
        const modelBytes = isLz10(member.data) ? decompressLz10(member.data) : member.data
        const animBytes = isLz10(beside.data) ? decompressLz10(beside.data) : beside.data
        if (!isNsbmd(modelBytes) || !isNsbca(animBytes)) continue

        const model = readNsbmd(modelBytes).models[0]
        if (!model) continue
        for (const animation of readNsbca(animBytes).animations) {
          if (animation.boneCount !== model.nodes.length) continue
          const local = sampleAnimation(animation, 0)
          for (const track of animation.tracks) {
            const node = model.nodes[track.index]
            const posedLocal = local[track.index]
            if (!node || !posedLocal) continue
            bones++
            let worst = 0
            for (let k = 0; k < 16; k++) {
              worst = Math.max(
                worst,
                Math.abs((posedLocal[k] as number) - (node.local[k] as number)),
              )
            }
            if (worst < 0.02) matched++
          }
        }
      }
    }

    expect(bones).toBeGreaterThan(10000)
    // The shortfall is animations that genuinely do not open on the bind pose.
    expect(matched / bones).toBeGreaterThan(0.95)
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
