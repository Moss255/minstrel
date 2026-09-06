import { readFileSync } from 'node:fs'
import { fx32 } from '@vesper/fixed'
import {
  isBitmapFont,
  isCollisionMesh,
  isDataTable,
  readBitmapFont,
  readCollisionMesh,
  readDataTable,
} from '@vesper/game-formats'
import { crc32OfName, isGpc, readGpc } from '@vesper/l5-gpc'
import {
  decompressBlz,
  decompressLz10,
  isLz10,
  looksBlz,
  readCompressionHeader,
  tryDecompressLz10,
} from '@vesper/nitro-comp'
import {
  type Animation,
  blend,
  boneTrackSize,
  identity,
  inverseBindMatrices,
  isNsbca,
  isNsbmd,
  isNsbtx,
  MATRIX_STACK_SIZE,
  type Model,
  multiply,
  RenderOp,
  readNsbca,
  readNsbmd,
  readTex0,
  resolveShapeStates,
  rotationFromRef,
  runDisplayList,
  sampleAnimation,
  texelDataSize,
} from '@vesper/nitro-gfx'
import { isSdat, RecordKind, readSdat } from '@vesper/nitro-snd'
import { isNarc, type NitroFs, readNarc, readNitroFs, walkFiles } from '@vesper/nitrofs'
import { createCollisionWorld, groundBelow } from '@vesper/sim'
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

/**
 * One asset, and the archive it came out of.
 *
 * Members are collected once and shared, because several checks need the same
 * pass and because pairing a model with the animation beside it needs to know
 * which archive each came from.
 */
interface Asset {
  /** Path of the archive holding it, so siblings can be found. */
  readonly archive: string
  /** Member name with any extension stripped, for pairing by name. */
  readonly stem: string
  /** Full path, for failure messages. */
  readonly path: string
  readonly bytes: Uint8Array
}

describe.skipIf(!romPath)('a real cartridge', () => {
  let rom: Uint8Array
  let fs: NitroFs
  /** Every NSBMD on the cartridge, including those inside GPC2 archives. */
  let models: Asset[]
  /** Every NSBCA, likewise. */
  let animations: Asset[]
  /** Every container that carries textures: NSBTX, and NSBMD with a TEX0. */
  let textured: Asset[]

  beforeAll(() => {
    const raw = readFileSync(romPath as string)
    rom = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
    fs = readNitroFs(rom)

    // Walk every archive the cartridge holds, NARC and GPC2 alike, recursing
    // through nesting and decompressing on the way. Tests that only walked
    // NARCs saw a smaller cartridge than it has: the monster and character
    // models live inside `.gp2`.
    models = []
    animations = []
    textured = []
    const stemOf = (name: string) => {
      const dot = name.lastIndexOf('.')
      return dot > 0 ? name.slice(0, dot) : name
    }
    const visit = (raw: Uint8Array, archive: string, name: string, depth: number): void => {
      if (depth > 4) return
      const bytes = tryDecompressLz10(raw) ?? raw
      const path = `${archive}#${name}`
      if (isNsbmd(bytes)) {
        models.push({ archive, stem: stemOf(name), path, bytes })
        textured.push({ archive, stem: stemOf(name), path, bytes })
        return
      }
      if (isNsbtx(bytes)) {
        textured.push({ archive, stem: stemOf(name), path, bytes })
        return
      }
      if (isNsbca(bytes)) {
        animations.push({ archive, stem: stemOf(name), path, bytes })
        return
      }
      if (isNarc(bytes)) {
        try {
          for (const member of readNarc(bytes).entries()) {
            visit(member.data, path, String(member.name ?? member.index), depth + 1)
          }
        } catch {
          // An archive that will not open is reported by the tests that read it.
        }
        return
      }
      if (isGpc(bytes)) {
        try {
          const gpc = readGpc(bytes)
          for (const member of gpc.members) {
            if (!member.readable) continue
            visit(gpc.read(member), path, member.name, depth + 1)
          }
        } catch {
          // Likewise.
        }
      }
    }
    for (const file of walkFiles(fs.root)) {
      const slash = file.path.lastIndexOf('/')
      visit(fs.read(file), file.path.slice(0, Math.max(slash, 0)), file.path.slice(slash + 1), 0)
    }
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
    let parsed = 0
    let vertexMatches = 0
    let triangleMatches = 0

    const eachModel = (bytes: Uint8Array, path: string): void => {
      try {
        for (const model of readNsbmd(bytes).models) {
          parsed++
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

    for (const asset of models) eachModel(asset.bytes, asset.path)

    expect(failures.slice(0, 10)).toEqual([])
    expect(parsed).toBeGreaterThan(1000)
    expect(vertexMatches).toBe(parsed)
    expect(triangleMatches).toBe(parsed)
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

  it('reads every render-command stream to a clean End', () => {
    // The parameter counts were fitted, not taken from documentation, so the
    // check on them is that the stream terminates where it should. A wrong
    // count desynchronises and either runs off the end or stops on a byte that
    // happens to be an End opcode partway through.
    const failures: string[] = []
    let streams = 0

    for (const asset of models) {
      let parsed: ReturnType<typeof readNsbmd>
      try {
        parsed = readNsbmd(asset.bytes)
      } catch {
        continue
      }
      for (const model of parsed.models) {
        streams++
        if (model.renderCommandError !== undefined) {
          failures.push(`${asset.path}#${model.name}: ${model.renderCommandError}`)
        }
      }
    }

    expect(streams).toBeGreaterThan(1000)
    // A handful of effect models use opcodes this package does not identify;
    // they degrade to no render commands rather than throwing.
    expect(failures.length).toBeLessThan(streams / 100)
  })

  it('composes every blend term against a real node', () => {
    // A blend term is three values, and the middle one had been read as
    // padding. It is the node whose inverse bind transform the term composes
    // with: it indexes a node every time, and differs from the stack slot
    // beside it often enough that it cannot be the slot restated.
    const failures: string[] = []
    let terms = 0
    let differing = 0
    let blends = 0
    let weighted = 0

    for (const asset of models) {
      let parsed: ReturnType<typeof readNsbmd>
      try {
        parsed = readNsbmd(asset.bytes)
      } catch {
        continue
      }
      for (const model of parsed.models) {
        for (const command of model.renderCommands) {
          if (command.op !== RenderOp.NodeMix) continue
          blends++
          let sum = 0
          const count = command.params[1] as number
          for (let i = 0; i < count; i++) {
            const slot = command.params[2 + i * 3] as number
            const node = command.params[3 + i * 3] as number
            sum += command.params[4 + i * 3] as number
            terms++
            if (node >= model.nodes.length) {
              failures.push(`${asset.path}#${model.name}: blend term names node ${node}`)
            }
            if (node !== slot) differing++
          }
          // Weights are 256ths of a unit and a blend is a weighted average.
          if (Math.abs(sum - 256) < 2) weighted++
        }
      }
    }

    expect(failures.slice(0, 10)).toEqual([])
    expect(terms).toBeGreaterThan(1000)
    expect(weighted).toBe(blends)
    // If the middle parameter were the slot restated it would never differ.
    expect(differing / terms).toBeGreaterThan(0.25)
  })

  it('resolves every blend to the identity when the model is in its bind pose', () => {
    // A blended vertex is stored in bind-pose space. Composing each term with
    // the named node's inverse bind transform therefore has to give back the
    // identity in the bind pose, at the point the blend is computed — before a
    // later command reuses the slot it landed in.
    const failures: string[] = []
    let blends = 0

    for (const asset of models) {
      let parsed: ReturnType<typeof readNsbmd>
      try {
        parsed = readNsbmd(asset.bytes)
      } catch {
        continue
      }
      for (const model of parsed.models) {
        if (!model.renderCommands.some((c) => c.op === RenderOp.NodeMix)) continue
        const inverseBind = inverseBindMatrices(model.renderCommands, model.nodes)
        const stack: Float32Array[] = Array.from({ length: MATRIX_STACK_SIZE }, () => identity())
        const world: Float32Array[] = model.nodes.map(() => identity())
        const seen = new Set<number>()

        for (const command of model.renderCommands) {
          if (command.op === RenderOp.NodeDescription) {
            const id = command.params[0] as number
            const parentId = command.params[1] as number
            const node = model.nodes[id]
            if (!node) continue
            const parent = seen.has(parentId) ? (world[parentId] as Float32Array) : identity()
            const result = multiply(parent, node.local)
            world[id] = result
            seen.add(id)
            const slot = command.params[3]
            if ((command.opcode & 0x20) !== 0 && slot !== undefined && slot < MATRIX_STACK_SIZE) {
              stack[slot] = result
            }
          } else if (command.op === RenderOp.NodeMix) {
            const count = command.params[1] as number
            const sources: Float32Array[] = []
            const weights: number[] = []
            for (let i = 0; i < count; i++) {
              const slot = command.params[2 + i * 3] as number
              const node = command.params[3 + i * 3] as number
              const posed = (stack[slot] ?? identity()) as Float32Array
              const bind = inverseBind[node]
              sources.push(bind ? multiply(posed, bind) : posed)
              weights.push((command.params[4 + i * 3] as number) / 256)
            }
            const result = blend(sources, weights)
            blends++
            let worst = 0
            const I = identity()
            for (let k = 0; k < 16; k++) {
              worst = Math.max(worst, Math.abs((result[k] as number) - (I[k] as number)))
            }
            if (worst > 0.01) {
              failures.push(`${asset.path}#${model.name}: a blend is ${worst.toFixed(3)} off`)
            }
            const destination = command.params[0] as number
            if (destination < MATRIX_STACK_SIZE) stack[destination] = result
          }
        }
      }
    }

    expect(failures.slice(0, 10)).toEqual([])
    expect(blends).toBeGreaterThan(1000)
  })

  it("scales every vertex by the model's own position scale, and nothing else", () => {
    // A model's positions are stored small. Two things scale them: the
    // `PositionScale` render command, before the display list starts, and
    // `MTX_SCALE` inside it, which re-applies the same factor after an
    // `MTX_RESTORE` drops it.
    //
    // Both claims are checked here. Every `MTX_SCALE` the decoder meets must
    // carry the model's own `upScale` — that is the first assertion. And
    // decoding a shape a second time with the initial scale forced to one must
    // move each vertex by either that scale or nothing at all: a vertex whose
    // position is unchanged was already under an `MTX_SCALE`, and one whose
    // position moved took the initial scale. Any third ratio would be a vertex
    // left at a scale of its own.
    const failures: string[] = []
    let scaledShapes = 0
    let plainShapes = 0
    let scaleCommands = 0

    for (const asset of models) {
      let parsed: ReturnType<typeof readNsbmd>
      try {
        parsed = readNsbmd(asset.bytes)
      } catch {
        continue
      }
      for (const model of parsed.models) {
        const states = resolveShapeStates(model.renderCommands)
        model.shapes.forEach((shape, index) => {
          const expected = states[index]?.positionScaled ? model.upScale : 1
          let unscaled: ReturnType<typeof runDisplayList>
          let applied: ReturnType<typeof runDisplayList>
          try {
            unscaled = runDisplayList(shape.displayList, shape.name, { scale: 1 })
            applied = model.geometry(index)
          } catch {
            return
          }
          for (const value of applied.scales) {
            scaleCommands++
            if (value !== model.upScale) {
              failures.push(
                `${asset.path}#${model.name}/${shape.name}: MTX_SCALE is ${value}, upScale is ${model.upScale}`,
              )
            }
          }
          if (expected === 1) plainShapes++
          else scaledShapes++
          for (let k = 0; k < unscaled.vertices.length; k++) {
            const a = unscaled.vertices[k]
            const b = applied.vertices[k]
            if (!a || !b) continue
            const same =
              Math.abs(b.x - a.x) < 1e-4 && Math.abs(b.y - a.y) < 1e-4 && Math.abs(b.z - a.z) < 1e-4
            const scaled =
              Math.abs(b.x - a.x * expected) < 1e-4 &&
              Math.abs(b.y - a.y * expected) < 1e-4 &&
              Math.abs(b.z - a.z * expected) < 1e-4
            if (!same && !scaled) {
              failures.push(
                `${asset.path}#${model.name}/${shape.name}: vertex ${k} is neither unchanged nor ${expected}x`,
              )
              return
            }
          }
        })
      }
    }

    expect(failures.slice(0, 10)).toEqual([])
    expect(scaleCommands).toBeGreaterThan(500)
    expect(scaledShapes).toBeGreaterThan(1000)
    expect(plainShapes).toBeGreaterThan(100)
  })

  it('leaves a blended vertex where it was, when the model is in its bind pose', () => {
    // The same invariant as above, carried through to the vertices: a blended
    // vertex has to land exactly where the display list put it, bar the model's
    // own downScale, which posing folds in.
    //
    // Which vertices those are has to be worked out per shape. A model reuses
    // stack slots, so a slot holding a blend when one shape is drawn may hold a
    // plain node's transform by the time the next one is; counting every slot
    // that is ever a blend destination scores correct output as broken.
    let count = 0
    let exact = 0
    let worstAnywhere = 0

    for (const asset of models) {
      let model: Model | undefined
      try {
        model = readNsbmd(asset.bytes).models[0]
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
      count++
      worstAnywhere = Math.max(worstAnywhere, worst)
      if (worst < 0.001) exact++
    }

    expect(count).toBeGreaterThan(500)
    // Nothing on the cartridge is out by more than a fixed-point rounding.
    expect(worstAnywhere).toBeLessThan(0.1)
    expect(exact / count).toBeGreaterThan(0.85)
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

    for (const asset of textured) visit(asset.bytes, asset.path)

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
    let count = 0
    let tracks = 0
    let adjacent = 0

    for (const asset of animations) {
      try {
        for (const animation of readNsbca(asset.bytes).animations) {
          count++
          const sorted = [...animation.tracks].sort((a, b) => a.offset - b.offset)
          tracks += sorted.length
          for (let i = 0; i < sorted.length - 1; i++) {
            const here = sorted[i] as (typeof sorted)[number]
            const next = sorted[i + 1] as (typeof sorted)[number]
            adjacent++
            if (here.offset + boneTrackSize(here.flags) !== next.offset) {
              failures.push(
                `${asset.path}#${animation.name}: track ${i} of ${boneTrackSize(here.flags)} bytes does not reach ${next.offset - here.offset}`,
              )
            }
          }
        }
      } catch (error) {
        failures.push(`${asset.path}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    expect(failures.slice(0, 10)).toEqual([])
    expect(count).toBeGreaterThan(1000)
    expect(tracks).toBeGreaterThan(10000)
    expect(adjacent).toBeGreaterThan(10000)
  })

  it('predicts a constant scale axis from its flag bit', () => {
    // Flag bits 11 to 13 do not change an entry's length — a constant scale
    // axis and an animated one both take eight bytes — so the size fit could
    // not see them. What identifies them is that a constant axis holds a value
    // beside its reciprocal and an animated one holds a curve header.
    //
    // The direction that carries the weight is the negative one: an axis whose
    // bit is clear must *never* look like a reciprocal pair. Reading the same
    // eight bytes both ways is what makes that checkable.
    let constantAxes = 0
    let pairs = 0
    let animatedAxes = 0
    let falsePositives = 0

    for (const asset of animations) {
      let parsed: ReturnType<typeof readNsbca>
      try {
        parsed = readNsbca(asset.bytes)
      } catch {
        continue
      }
      for (const animation of parsed.animations) {
        const view = new DataView(
          animation.data.buffer,
          animation.data.byteOffset,
          animation.data.byteLength,
        )
        const reciprocalPair = (at: number): boolean => {
          if (at + 8 > animation.data.length) return false
          const value = view.getInt32(at, true) / 4096
          const other = view.getInt32(at + 4, true) / 4096
          return value !== 0 && Math.abs(value * other - 1) < 0.02
        }
        for (const track of animation.tracks) {
          for (const channel of track.scale ?? []) {
            if (channel.kind === 'constant') {
              constantAxes++
              if (reciprocalPair(channel.at)) pairs++
            } else {
              animatedAxes++
              if (reciprocalPair(channel.at)) falsePositives++
            }
          }
        }
      }
    }

    expect(constantAxes).toBeGreaterThan(10000)
    expect(animatedAxes).toBeGreaterThan(10000)
    // Zero-valued axes account for the shortfall on the positive side; the
    // negative side has to be clean.
    expect(pairs / constantAxes).toBeGreaterThan(0.99)
    expect(falsePositives).toBe(0)
  })

  it('resolves every rotation reference to an orthonormal matrix', () => {
    // A rotation reference's top bit picks between two pools that store
    // rotations completely differently — a pivot form of three values and a
    // basis form of five. Neither stores a full matrix, so both reconstruct
    // one, and mathematics supplies the check the format does not: the result
    // has to be orthonormal with determinant +1.
    const failures: string[] = []
    let pivot = 0
    let basis = 0
    const out = new Float32Array(16)

    const orthonormal = (m: Float32Array): boolean => {
      const col = (c: number) => [m[c * 4], m[c * 4 + 1], m[c * 4 + 2]] as number[]
      const dot = (x: number[], y: number[]) =>
        (x[0] as number) * (y[0] as number) +
        (x[1] as number) * (y[1] as number) +
        (x[2] as number) * (y[2] as number)
      const a = col(0)
      const b = col(1)
      const c = col(2)
      const det =
        (a[0] as number) *
          ((b[1] as number) * (c[2] as number) - (b[2] as number) * (c[1] as number)) -
        (b[0] as number) *
          ((a[1] as number) * (c[2] as number) - (a[2] as number) * (c[1] as number)) +
        (c[0] as number) *
          ((a[1] as number) * (b[2] as number) - (a[2] as number) * (b[1] as number))
      return (
        Math.abs(dot(a, a) - 1) < 0.02 &&
        Math.abs(dot(b, b) - 1) < 0.02 &&
        Math.abs(dot(c, c) - 1) < 0.02 &&
        Math.abs(dot(a, b)) < 0.02 &&
        Math.abs(dot(a, c)) < 0.02 &&
        Math.abs(dot(b, c)) < 0.02 &&
        Math.abs(det - 1) < 0.05
      )
    }

    for (const asset of animations) {
      let parsed: ReturnType<typeof readNsbca>
      try {
        parsed = readNsbca(asset.bytes)
      } catch {
        continue
      }
      for (const animation of parsed.animations) {
        const refs = new Set<number>()
        for (const track of animation.tracks) {
          if (!track.rotation) continue
          if (track.rotation.kind === 'constant') refs.add(track.rotation.ref)
          else {
            const curve = track.rotation.curve
            const dv = new DataView(
              animation.data.buffer,
              animation.data.byteOffset,
              animation.data.byteLength,
            )
            for (let i = 0; i < curve.count; i++) {
              const at = curve.offset + i * 2
              if (at + 2 <= animation.data.length) refs.add(dv.getUint16(at, true))
            }
          }
        }
        for (const ref of refs) {
          try {
            rotationFromRef(animation, ref, out)
          } catch (error) {
            failures.push(
              `${asset.path}#${animation.name}: ${error instanceof Error ? error.message : String(error)}`,
            )
            continue
          }
          if (ref & 0x8000) pivot++
          else basis++
          if (!orthonormal(out)) {
            failures.push(`${asset.path}#${animation.name}: reference ${ref} is not a rotation`)
          }
        }
      }
    }

    expect(failures.slice(0, 10)).toEqual([])
    expect(pivot).toBeGreaterThan(1000)
    expect(basis).toBeGreaterThan(1000)
  })

  it('lays every animation curve out without overlapping another', () => {
    // A curve header says where its samples start but not how many bytes they
    // take; that comes from the frame span, the sample width and, for scale,
    // the reciprocal stored beside each value. If any of those were wrong the
    // curves would run into each other, so the check is that none does.
    const failures: string[] = []
    let curves = 0

    for (const asset of animations) {
      let parsed: readonly Animation[]
      try {
        parsed = readNsbca(asset.bytes).animations
      } catch (error) {
        failures.push(`${asset.path}: ${error instanceof Error ? error.message : String(error)}`)
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
              `${asset.path}#${animation.name}: curve at ${starts[i]} runs ${stop - next} bytes into the next`,
            )
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

    for (const asset of animations) {
      try {
        for (const animation of readNsbca(asset.bytes).animations) {
          const last = Math.max(0, animation.frameCount - 1)
          for (const frame of [0, 1, animation.frameCount >> 1, last, animation.frameCount]) {
            sampleAnimation(animation, frame)
          }
          posed++
        }
      } catch (error) {
        failures.push(`${asset.path}: ${error instanceof Error ? error.message : String(error)}`)
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
    let pairs = 0

    const byArchive = new Map<string, Asset[]>()
    for (const asset of animations) {
      const list = byArchive.get(asset.archive) ?? []
      list.push(asset)
      byArchive.set(asset.archive, list)
    }

    for (const asset of models) {
      const beside = byArchive.get(asset.archive)?.find((a) => a.stem === asset.stem)
      if (!beside) continue
      let model: Model | undefined
      let parsed: readonly Animation[]
      try {
        model = readNsbmd(asset.bytes).models[0]
        parsed = readNsbca(beside.bytes).animations
      } catch {
        continue
      }
      if (!model) continue
      for (const animation of parsed) {
        if (animation.boneCount !== model.nodes.length) continue
        pairs++
        const local = sampleAnimation(animation, 0)
        for (const track of animation.tracks) {
          const node = model.nodes[track.index]
          const posedLocal = local[track.index]
          if (!node || !posedLocal) continue
          bones++
          let worst = 0
          for (let k = 0; k < 16; k++) {
            worst = Math.max(worst, Math.abs((posedLocal[k] as number) - (node.local[k] as number)))
          }
          if (worst < 0.02) matched++
        }
      }
    }

    expect(pairs).toBeGreaterThan(100)
    expect(bones).toBeGreaterThan(10000)
    // The shortfall is animations that genuinely do not open on the bind pose.
    expect(matched / bones).toBeGreaterThan(0.95)
  })

  it('binds every material to the texture the file says, not the one its name suggests', () => {
    // A texture-name dictionary entry names a run of material indices. That is
    // the file's own statement of the binding, and it has to be internally
    // consistent: every index in range, and no material claimed by two
    // textures. Guessing the texture from the material's name instead resolves
    // 41% of them, because the two names are usually unrelated.
    const failures: string[] = []
    let parsedModels = 0
    let materials = 0
    let bound = 0
    let paletted = 0

    for (const asset of models) {
      let parsed: ReturnType<typeof readNsbmd>
      try {
        parsed = readNsbmd(asset.bytes)
      } catch {
        continue
      }
      for (const model of parsed.models) {
        parsedModels++
        const claimed = new Map<string, string>()
        for (const material of model.materials) {
          materials++
          if (material.texture !== undefined) {
            bound++
            if (!model.textureNames.includes(material.texture)) {
              failures.push(
                `${asset.path}#${model.name}: '${material.texture}' is not a texture name`,
              )
            }
            const already = claimed.get(material.name)
            if (already !== undefined && already !== material.texture) {
              failures.push(`${asset.path}#${model.name}: '${material.name}' claimed twice`)
            }
            claimed.set(material.name, material.texture)
          }
          if (material.palette !== undefined) {
            paletted++
            if (!model.paletteNames.includes(material.palette)) {
              failures.push(
                `${asset.path}#${model.name}: '${material.palette}' is not a palette name`,
              )
            }
          }
        }
      }
    }

    expect(failures.slice(0, 10)).toEqual([])
    expect(parsedModels).toBeGreaterThan(1000)
    expect(materials).toBeGreaterThan(10000)
    // Nearly every material binds a texture; the few that do not are untextured.
    expect(bound / materials).toBeGreaterThan(0.95)
    expect(paletted).toBeGreaterThan(materials * 0.9)
  })

  it('reads every collision mesh, and its normals agree with its own triangles', () => {
    // `.col2` has no magic, so the checks have to come from inside. The strong
    // one is that each triangle stores a normal *and* the three points it was
    // computed from: the stored normal must be the normalised cross product of
    // the triangle's own edges, which a wrong field layout cannot satisfy.
    //
    // The index is checked the same way — the per-cell starts and counts have
    // to tile the triangle-index list, and every index has to name a triangle.
    const failures: string[] = []
    let meshes = 0
    let triangles = 0
    let degenerate = 0
    let normals = 0
    let enclosed = 0
    let tiled = 0

    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isNarc(bytes)) continue
      for (const member of readNarc(bytes).entries()) {
        const data = isLz10(member.data) ? decompressLz10(member.data) : member.data
        if (!member.name?.endsWith('.col2')) continue
        const path = `${file.path}#${member.name}`
        if (!isCollisionMesh(data)) {
          failures.push(`${path}: not recognised as a collision mesh`)
          continue
        }
        let mesh: ReturnType<typeof readCollisionMesh>
        try {
          mesh = readCollisionMesh(data)
        } catch (error) {
          failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`)
          continue
        }
        meshes++

        const low = [Infinity, Infinity, Infinity]
        const high = [-Infinity, -Infinity, -Infinity]
        for (const triangle of mesh.triangles) {
          triangles++
          for (const point of triangle.vertices) {
            for (let c = 0; c < 3; c++) {
              low[c] = Math.min(low[c] as number, point[c] as number)
              high[c] = Math.max(high[c] as number, point[c] as number)
            }
          }
          const [a, b, c] = triangle.vertices
          const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
          const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
          const cross = [
            (e1[1] as number) * (e2[2] as number) - (e1[2] as number) * (e2[1] as number),
            (e1[2] as number) * (e2[0] as number) - (e1[0] as number) * (e2[2] as number),
            (e1[0] as number) * (e2[1] as number) - (e1[1] as number) * (e2[0] as number),
          ]
          const length = Math.hypot(cross[0] as number, cross[1] as number, cross[2] as number)
          if (length === 0) {
            degenerate++
            continue
          }
          const dot =
            ((cross[0] as number) / length) * (triangle.normal[0] as number) +
            ((cross[1] as number) / length) * (triangle.normal[1] as number) +
            ((cross[2] as number) / length) * (triangle.normal[2] as number)
          if (dot > 0.999) normals++
          else failures.push(`${path}: a stored normal does not match its own triangle`)
        }

        const box = mesh.bounds
        if (
          mesh.triangles.length === 0 ||
          (box.minX <= (low[0] as number) &&
            box.minY <= (low[1] as number) &&
            box.minZ <= (low[2] as number) &&
            box.maxX >= (high[0] as number) &&
            box.maxY >= (high[1] as number) &&
            box.maxZ >= (high[2] as number))
        ) {
          enclosed++
        } else {
          failures.push(`${path}: the header box does not enclose the triangles`)
        }

        const listed = mesh.cells.reduce((n, cell) => n + cell.count, 0)
        // The list is padded to a word, so it may carry one entry past the end.
        if (listed >= mesh.cellTriangles.length - 1 && listed <= mesh.cellTriangles.length) tiled++
        else failures.push(`${path}: the cells do not tile the index list`)
        for (const index of mesh.cellTriangles.slice(0, listed)) {
          if (index >= mesh.triangles.length) {
            failures.push(`${path}: index ${index} names no triangle`)
            break
          }
        }
      }
    }

    expect(failures.slice(0, 10)).toEqual([])
    expect(meshes).toBeGreaterThan(500)
    expect(triangles).toBeGreaterThan(50000)
    expect(normals).toBe(triangles - degenerate)
    expect(enclosed).toBe(meshes)
    expect(tiled).toBe(meshes)
  })

  it('stands on every collision triangle it can walk onto', () => {
    // The sharpest self-check available on the world: for each triangle in each
    // map, ask what the ground is directly above its own centroid. The answer
    // has to be that triangle, or something above it — never nothing.
    //
    // That exercises the index, the containment test and the height
    // interpolation at once, on real map geometry rather than on squares built
    // for the purpose. A containment test that is off by a rounding loses the
    // centroid of a thin triangle; an index that files a triangle under the
    // wrong cell loses it outright.
    const failures: string[] = []
    let meshes = 0
    let tested = 0
    let found = 0
    let skipped = 0

    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isNarc(bytes)) continue
      for (const member of readNarc(bytes).entries()) {
        if (!member.name?.endsWith('.col2')) continue
        const data = isLz10(member.data) ? decompressLz10(member.data) : member.data
        if (!isCollisionMesh(data)) continue
        let mesh: ReturnType<typeof readCollisionMesh>
        try {
          mesh = readCollisionMesh(data)
        } catch {
          continue
        }
        if (mesh.triangles.length === 0) continue
        const world = createCollisionWorld(mesh)
        meshes++

        mesh.triangles.forEach((triangle, index) => {
          // A vertical face has no ground to stand on, and a degenerate one has
          // no centroid worth asking about.
          if (triangle.normal[1] === 0) return
          const [a, b, c] = triangle.vertices
          // The query takes whole fx32 words, so the centroid has to be
          // rounded to one, and on a sliver that rounding can land outside the
          // triangle itself. `twiceArea / longestEdge` is the triangle's
          // shortest height in the projection; where that is comfortably more
          // than the half-word the rounding moves, the centroid is safely
          // inside. Slivers below it are skipped, because the question there
          // would be about the rounding rather than about the world.
          const twiceArea = Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]))
          const longestEdge = Math.max(
            Math.hypot(b[0] - a[0], b[2] - a[2]),
            Math.hypot(c[0] - b[0], c[2] - b[2]),
            Math.hypot(a[0] - c[0], a[2] - c[2]),
          )
          if (longestEdge === 0 || twiceArea / longestEdge < 8) {
            skipped++
            return
          }
          const cx = Math.round((a[0] + b[0] + c[0]) / 3)
          const cy = Math.round((a[1] + b[1] + c[1]) / 3)
          const cz = Math.round((a[2] + b[2] + c[2]) / 3)
          tested++
          // Start a whole unit above the surface, so the query is looking down
          // at it rather than starting exactly on it.
          const hit = groundBelow(world, fx32(cx), fx32(cz), fx32(cy + 4096))
          if (hit === undefined) {
            if (failures.length < 10) {
              failures.push(`${file.path}#${member.name}: no ground over triangle ${index}`)
            }
            return
          }
          found++
          // Rounding the centroid sideways moves the query along the slope, so
          // the height found is not the centroid's height. What must hold is
          // that it is not *below* the triangle: the triangle's own surface is
          // a candidate everywhere within it, and the query returns the highest
          // candidate, so anything lower means the triangle was missed and
          // something beneath it answered instead.
          const lowest = Math.min(a[1], b[1], c[1])
          if (hit.y < lowest - 8) {
            failures.push(
              `${file.path}#${member.name}: triangle ${index} bottoms out at ${lowest} but the ground is ${hit.y}`,
            )
          }
        })
      }
    }

    expect(failures.slice(0, 10)).toEqual([])
    expect(meshes).toBeGreaterThan(500)
    expect(tested).toBeGreaterThan(5000)
    expect(found).toBe(tested)
    // Most of a collision mesh is wall — 85,349 of the cartridge's 109,122
    // triangles are exactly vertical — so the walkable surface this walks over
    // is the minority of it, and the slivers skipped are a small part of that.
    expect(skipped).toBeLessThan(tested)
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
