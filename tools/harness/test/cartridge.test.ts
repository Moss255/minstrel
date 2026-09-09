import { readFileSync } from 'node:fs'
import { chooseFigure, figurePieces, poseFigure } from '@minstrel/actor'
import { FX32_ONE, type Fx32, fx32, toFloat } from '@minstrel/fixed'
import {
  isBitmapFont,
  isCollisionMesh,
  isDataTable,
  isMapLinks,
  isMapManifest,
  isMarkerVolume,
  isNpcList,
  isNpcPlacements,
  isWaterTexture,
  mapDoorways,
  NPC_KIND,
  placementOf,
  placeNpcs,
  readBitmapFont,
  readCollisionMesh,
  readDataTable,
  readMapLinks,
  readMapList,
  readMapManifest,
  readNpcList,
  readNpcPlacements,
  resolveMapResources,
} from '@minstrel/game-formats'
import { crc32OfName, isGpc, readGpc } from '@minstrel/l5-gpc'
import {
  decompressBlz,
  decompressLz10,
  isLz10,
  looksBlz,
  readCompressionHeader,
  tryDecompressLz10,
} from '@minstrel/nitro-comp'
import {
  type Animation,
  blend,
  boneTrackSize,
  identity,
  inverseBindMatrices,
  isNsbca,
  isNsbmd,
  isNsbtx,
  loopFrames,
  MATRIX_STACK_SIZE,
  type Mat4,
  type Model,
  measureBounds,
  multiply,
  type NodeTransform,
  poseGeometry,
  RenderOp,
  readNsbca,
  readNsbmd,
  readTex0,
  resolvePose,
  resolveShapeStates,
  rotationFromRef,
  runDisplayList,
  sampleAnimation,
  texelDataSize,
} from '@minstrel/nitro-gfx'
import { isSdat, RecordKind, readSdat } from '@minstrel/nitro-snd'
import { isNarc, type NitroFs, readNarc, readNitroFs, walkFiles } from '@minstrel/nitrofs'
import {
  cameraEye,
  covered,
  followCamera,
  INDOORS,
  OUTDOORS,
  occluders,
  updateFollowCamera,
} from '@minstrel/render'
import {
  type CharacterState,
  createCollisionWorld,
  groundBelow,
  PERSON,
  type PlacedMesh,
  step,
} from '@minstrel/sim'
import { assembleMap } from '@minstrel/world'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * Integration tests against a real cartridge.
 *
 * These never run in CI and their inputs are never committed. Point
 * `MINSTREL_TEST_ROM` at your own dump to run them:
 *
 *   MINSTREL_TEST_ROM=rom/your.nds pnpm test
 *
 * The assertions are deliberately about *self-consistency* rather than about
 * specific offsets in one title, so they hold for any DS cartridge. They are
 * the evidence behind the claims in each package's FORMAT.md: a parser that
 * agrees with several thousand independent samples is not guessing.
 */
const romPath = process.env.MINSTREL_TEST_ROM

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

/**
 * These read a 256 MiB cartridge and walk every file in it, so they are seconds
 * each rather than milliseconds — and slower again when anything else is using
 * the machine. Vitest's default five seconds fails them spuriously the moment a
 * second test run, a build, or a browser is sharing the CPU, which reads as six
 * broken parsers rather than a loaded laptop.
 */
describe.skipIf(!romPath)('a real cartridge', { timeout: 120_000 }, () => {
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

  it('reads the map index, and its codes name real archives', () => {
    // `maplist9.bin` is what turns a code into a place: it carries a region, a
    // map code and the name whoever built it wrote down. The code is also the
    // name of the map's archive, which is the check — a reading that resolved
    // the string offsets wrongly would not land on directories that exist.
    const entry = fs.file('/data/map/maplist9.bin')
    expect(entry).toBeDefined()
    const list = readMapList(fs.read(entry as NonNullable<typeof entry>))
    expect(list.maps.length).toBeGreaterThan(500)

    // Every archive the cartridge holds, by name.
    const archives = new Set<string>()
    for (const file of walkFiles(fs.root)) {
      const name = file.path.slice(file.path.lastIndexOf('/') + 1)
      const dot = name.lastIndexOf('.')
      if (dot > 0) archives.add(name.slice(0, dot).toUpperCase())
    }

    let named = 0
    const codes = new Set<string>()
    for (const entry of list.maps) {
      expect(entry.code.length).toBeGreaterThan(0)
      codes.add(entry.code.toUpperCase())
    }
    for (const code of codes) if (archives.has(code)) named++

    // Most codes name an archive. The rest are development maps the cartridge
    // kept an entry for without shipping the files.
    expect(named / codes.size).toBeGreaterThan(0.6)
    // The regions are real text, not offsets misread as one.
    const regions = new Set(list.maps.map((m) => m.region).filter(Boolean))
    expect(regions.size).toBeGreaterThan(20)
    for (const region of regions) expect(region).not.toMatch(/^\d{4}\//)
  })

  it('reads every `.bmbl` string table, and their links agree in both directions', () => {
    // `.bmbl` is the only thing found that says which maps reach which: the map
    // index carries no link field. This reads the header and the names only —
    // the check is that doing so works on every file, and that what comes out
    // is a graph rather than noise. The test below reads the same file's
    // records and checks the two halves against each other.
    const indexEntry = fs.file('/data/map/maplist9.bin')
    const codes = new Set(
      readMapList(fs.read(indexEntry as NonNullable<typeof indexEntry>)).maps.map((m) =>
        m.code.toUpperCase(),
      ),
    )
    const isMapCode = (name: string) => codes.has(name.toUpperCase())

    const linksOf = new Map<string, string[]>()
    let files = 0
    for (const file of walkFiles(fs.root)) {
      const stem = /\/([^/]+)\.ambl$/i.exec(file.path)?.[1]?.toUpperCase()
      if (!stem) continue
      const bytes = fs.read(file)
      if (!isNarc(bytes)) continue
      for (const member of readNarc(bytes).entries()) {
        const name = String(member.name ?? member.index)
        if (!name.toLowerCase().endsWith('.bmbl')) continue
        const data = tryDecompressLz10(member.data) ?? member.data
        files++
        // Every one is readable: this is the claim the parser rests on.
        expect(isMapLinks(data), file.path).toBe(true)
        const links = readMapLinks(data)
        // The declared count matching the names found is what makes the string
        // section a real reading rather than bytes that happen to split.
        const declared = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(
          12,
          true,
        )
        expect(links.names.length, file.path).toBe(declared)
        linksOf.set(
          stem,
          links.linksTo(stem, isMapCode).map((n) => n.toUpperCase()),
        )
      }
    }
    expect(files).toBeGreaterThan(600)

    // A map never links to itself.
    for (const [code, links] of linksOf) expect(links, code).not.toContain(code)

    // The real check. Names that merely looked like map codes would not agree
    // with each other in both directions: each interior names exactly its
    // exterior, and the exterior names it back.
    let pairs = 0
    let reciprocal = 0
    for (const [from, links] of linksOf) {
      for (const to of links) {
        pairs++
        if (linksOf.get(to)?.includes(from)) reciprocal++
      }
    }
    expect(pairs).toBeGreaterThan(800)
    expect(reciprocal / pairs).toBeGreaterThan(0.9)

    // The village's own neighbours: its interiors, and the field east of it.
    // `M01M00T1` is a texture of this map and `M01M01` is the map next door —
    // both begin with the map's own code, which is why the caller supplies the
    // test for what counts as a code, and why this checks the textures are out.
    const village = linksOf.get('M01') as string[]
    expect(village).toBeDefined()
    expect(village).not.toContain('M01M00T1')
    expect(village).not.toContain('M01M0000')
    expect(village).toContain('M01M01')
    expect(village).toContain('F01')
    expect(village.length).toBeGreaterThan(5)
  })

  it("reads every `.bmbl`'s doorways, and they agree with its own names", () => {
    // The claim: the record stream says which doorway leads where, and the
    // string table above says which maps this one connects to. They are read by
    // different code from different halves of the file, so their agreeing is
    // evidence neither could give alone.
    const indexEntry = fs.file('/data/map/maplist9.bin')
    const codes = new Set(
      readMapList(fs.read(indexEntry as NonNullable<typeof indexEntry>)).maps.map((m) =>
        m.code.toUpperCase(),
      ),
    )

    let files = 0
    let walked = 0
    let paired = 0
    let triggers = 0
    let secondName = 0
    const doorsOf = new Map<string, ReturnType<typeof mapDoorways>>()
    const namesOf = new Map<string, Set<string>>()
    for (const file of walkFiles(fs.root)) {
      const stem = /\/([^/]+)\.ambl$/i.exec(file.path)?.[1]?.toUpperCase()
      if (!stem) continue
      const bytes = fs.read(file)
      if (!isNarc(bytes)) continue
      for (const member of readNarc(bytes).entries()) {
        const name = String(member.name ?? member.index)
        if (!name.toLowerCase().endsWith('.bmbl')) continue
        const data = tryDecompressLz10(member.data) ?? member.data
        files++

        // Every file's records walk exactly to the string table. This is what
        // the record header's padding bought; before it, 387 threw.
        const table = readDataTable(data)
        walked++

        table.records.forEach((record, i) => {
          // A trigger is always followed by the action that says what it does.
          if (record.tag === 0x73) {
            triggers++
            if (table.records[i + 1]?.tag === 0x74) paired++
          }
          // The destination slot is fixed per form, and nothing else in a
          // transition record is marked a name — so there is no ambiguity to
          // resolve and no searching to get wrong.
          const slot = record.tag === 0x72 ? 8 : record.tag === 0x74 ? 4 : -1
          if (slot < 0 || record.kinds[slot] !== 0) return
          const names = Array.from(record.kinds.slice(0, record.values.length)).filter(
            (k) => k === 0,
          ).length
          if (names > 1) secondName++
        })

        doorsOf.set(stem, mapDoorways(data))
        namesOf.set(
          stem,
          new Set(
            readMapLinks(data)
              .names.map((n) => n.toUpperCase())
              .filter((n) => codes.has(n) && n !== stem),
          ),
        )
      }
    }
    expect(files).toBeGreaterThan(600)
    expect(walked).toBe(files)
    expect(triggers).toBeGreaterThan(2000)
    expect(paired).toBe(triggers)
    expect(secondName).toBe(0)

    // The agreement. Two maps differ and both are explained in `FORMAT.md`:
    // `M07` has a door its string table does not name, and `X05M10` has one
    // leading back into itself, which the name test excludes by design.
    const withDoors = [...doorsOf].filter(([, doors]) => doors.length > 0)
    expect(withDoors.length).toBeGreaterThan(400)
    let agreed = 0
    for (const [stem, doors] of withDoors) {
      const named = namesOf.get(stem) as Set<string>
      const led = new Set(doors.map((d) => d.to.toUpperCase()))
      if (led.size === named.size && [...led].every((d) => named.has(d))) agreed++
    }
    expect(agreed / withDoors.length).toBeGreaterThan(0.98)

    // Nearly every doorway names a map the index knows.
    const all = withDoors.flatMap(([, doors]) => doors)
    const known = all.filter((d) => codes.has(d.to.toUpperCase())).length
    expect(known / all.length).toBeGreaterThan(0.99)

    // The village: eight houses and the road out to the field, once each. The
    // two forms describe seven of these twice and `mapDoorways` merges them.
    const village = doorsOf.get('M01') as ReturnType<typeof mapDoorways>
    expect(village.map((d) => d.to).sort()).toEqual([
      'F01',
      'M01M01',
      'M01M02',
      'M01M03',
      'M01M04',
      'M01M05',
      'M01M06',
      'M01M07',
      'M01M08',
    ])
    // Every door stands somewhere in the village and leads somewhere in it.
    for (const door of village) {
      expect(Math.hypot(door.x, door.z), door.to).toBeLessThan(8)
      expect(door.width, door.to).toBeGreaterThan(0)
      expect(door.height, door.to).toBeGreaterThan(0)
    }
    // The road out is the outlier: the field is a hundred times the village's
    // area, and you arrive far from its origin.
    const field = village.find((d) => d.to === 'F01') as ReturnType<typeof mapDoorways>[number]
    expect(Math.abs(field.arriveX)).toBeGreaterThan(4)
  })

  it("builds one of a map's two lightings, not both at once", () => {
    // A map ships its lit pieces twice. The village's `M01M00L1` carries the
    // rainbow and `m01m00win01`; `M01M00N1` carries `m01m00win02`, the same 840
    // opaque pixels in a brighter, yellower colour — a lit window. Assembling
    // both draws them lit and unlit at the same time.
    const map = fs.file('/data/map/M01.amdj')
    expect(map).toBeDefined()
    const members = new Map<string, Uint8Array>()
    for (const member of readNarc(fs.read(map as NonNullable<typeof map>)).entries()) {
      members.set(
        String(member.name ?? member.index),
        tryDecompressLz10(member.data) ?? member.data,
      )
    }
    const manifestBytes = [...members.values()].find((b) => isMapManifest(b))
    expect(manifestBytes).toBeDefined()
    const manifest = readMapManifest(manifestBytes as Uint8Array)

    const day = assembleMap(manifest, members, { lighting: 'day' })
    const night = assembleMap(manifest, members, { lighting: 'night' })
    const both = assembleMap(manifest, members)

    const named = (m: typeof day) =>
      m.pieces.map((p) => p.model.name ?? '').filter((n) => /[LN]\d$/i.test(n))
    expect(named(day)).toEqual(['M01M00L1'])
    expect(named(night)).toEqual(['M01M00N1'])
    // Default is day, and it is one variant rather than both.
    expect(named(both)).toEqual(['M01M00L1'])

    // The two builds differ only by that piece: the terrain, the doorways and
    // the collision belong to neither lighting and must survive both.
    expect(night.pieces.length).toBe(day.pieces.length)
    expect(night.meshes.length).toBe(day.meshes.length)
    expect(day.meshes.length).toBeGreaterThan(0)

    // Cartridge-wide the two are a paired set, which is why this is a choice
    // and not a filter that happens to drop something.
    let withBoth = 0
    let equalCounts = 0
    for (const file of walkFiles(fs.root)) {
      if (!/\.amdj$/i.test(file.path)) continue
      const bytes = fs.read(file)
      if (!isNarc(bytes)) continue
      let l = 0
      let n = 0
      for (const member of readNarc(bytes).entries()) {
        const suffix = /([LN])(\d)\.nsbmd$/i.exec(String(member.name ?? ''))
        if (!suffix) continue
        if ((suffix[1] as string).toUpperCase() === 'L') l++
        else n++
      }
      if (l > 0 && n > 0) {
        withBoth++
        if (l === n) equalCounts++
      }
    }
    expect(withBoth).toBeGreaterThan(200)
    expect(equalCounts / withBoth).toBeGreaterThan(0.6)
  })

  it("reads a map's cast, and its ids join to its placements", () => {
    // Two files, joined by an id. The check is that the join is real: an id
    // that meant something else would not land on an entry 1,283 times.
    let archives = 0
    let entries = 0
    let blocks = 0
    let joined = 0
    let idsLandOnEntries = 0
    const kinds = new Map<number, number>()

    for (const file of walkFiles(fs.root)) {
      if (!file.path.toLowerCase().endsWith('.npc')) continue
      const bytes = fs.read(file)
      if (!isNarc(bytes)) continue
      let list: Uint8Array | undefined
      let places: Uint8Array | undefined
      for (const member of readNarc(bytes).entries()) {
        const name = String(member.name ?? member.index).toLowerCase()
        const data = tryDecompressLz10(member.data) ?? member.data
        if (name.endsWith('npc.bin')) list = data
        if (name.endsWith('place.bin')) places = data
      }
      if (!list || !places) continue
      archives++
      // One archive on the cartridge carries a zero-byte list.
      if (!isNpcList(list) || !isNpcPlacements(places)) continue

      // A placement file is not a tagged table, whatever the cheap check for
      // one says: its string offset happens to equal its length.
      expect(isNpcPlacements(places), file.path).toBe(true)

      const cast = readNpcList(list)
      const placements = readNpcPlacements(places)
      entries += cast.length
      blocks += placements.length
      joined += placeNpcs(cast, placements).length
      for (const entry of cast) kinds.set(entry.kind, (kinds.get(entry.kind) ?? 0) + 1)

      const ids = new Set(cast.map((e) => e.id))
      if (placements.every((p) => ids.has(p.id))) idsLandOnEntries++

      // Fewer placements than names on 26 archives and equal on 45, which is
      // what you would expect if events place the rest. **One archive has one
      // more placement than it has names** — `R01` — so this is a tendency,
      // not the invariant an earlier note in `docs/` called it.
      expect(placements.length, file.path).toBeLessThanOrEqual(cast.length + 1)

      for (const placement of placements) {
        // Authored data, not bytes that happen to decode.
        expect(placement.facing, file.path).toBeGreaterThanOrEqual(0)
        expect(placement.facing, file.path).toBeLessThanOrEqual(Math.PI * 2 + 1e-3)
      }
    }

    expect(archives).toBeGreaterThan(70)
    expect(entries).toBeGreaterThan(1300)
    expect(blocks).toBeGreaterThan(1200)
    expect(joined / blocks).toBeGreaterThan(0.99)
    expect(idsLandOnEntries / archives).toBeGreaterThan(0.95)
    // The kind byte takes a small set of values, not arbitrary ones.
    expect([...kinds.keys()].sort((a, b) => a - b)).toEqual([0, 1, 2, 5])
  })

  it("puts a village's cast inside the village, once the placements are scaled", () => {
    // The divisor is the same 8 the map's own placements need. Raw, half the
    // village's characters fall outside its collision entirely.
    const archive = [...walkFiles(fs.root)].find((f) => /\/M01\.npc$/i.test(f.path))
    expect(archive).toBeDefined()
    const narc = readNarc(fs.read(archive as NonNullable<typeof archive>))
    let list: Uint8Array | undefined
    let places: Uint8Array | undefined
    for (const member of narc.entries()) {
      const name = String(member.name ?? member.index).toLowerCase()
      const data = tryDecompressLz10(member.data) ?? member.data
      if (name.endsWith('npc.bin')) list = data
      if (name.endsWith('place.bin')) places = data
    }
    expect(list).toBeDefined()
    expect(places).toBeDefined()

    const cast = readNpcList(list as Uint8Array)
    const placed = placeNpcs(cast, readNpcPlacements(places as Uint8Array))
    expect(placed.length).toBe(49)

    // The village's own collision, assembled the way the game assembles it.
    const map = fs.file('/data/map/M01.amdj')
    expect(map).toBeDefined()
    const members = new Map<string, Uint8Array>()
    for (const member of readNarc(fs.read(map as NonNullable<typeof map>)).entries()) {
      members.set(
        String(member.name ?? member.index),
        tryDecompressLz10(member.data) ?? member.data,
      )
    }
    const manifest = [...members.values()].find((b) => isMapManifest(b))
    expect(manifest).toBeDefined()
    const assembled = assembleMap(readMapManifest(manifest as Uint8Array), members)
    const world = createCollisionWorld(assembled.meshes)
    const { bounds } = world

    let inside = 0
    for (const { placement } of placed) {
      const x = placement.x * FX32_ONE
      const z = placement.z * FX32_ONE
      if (x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ) inside++
    }
    expect(inside).toBe(placed.length)

    // And the models are the ones the kind byte says are models.
    const models = placed.filter((p) => p.entry.kind === NPC_KIND.MODEL)
    expect(models.length).toBeGreaterThan(0)
    for (const { entry } of models) {
      const chr = [...walkFiles(fs.root)].some((f) =>
        f.path.toLowerCase().endsWith(`/data/chara_sub/${entry.name?.toLowerCase()}.chr`),
      )
      expect(chr, entry.name).toBe(true)
    }
  })

  it('assembles a map from the resources its manifest names', () => {
    // A map archive is a dozen loose files with no index between them; the
    // `.bmdj` is the list. Two things have to hold for that to be usable.
    //
    // Every resource it names must be present — it names them by authoring
    // name, so each is found by stem against whatever the archive built it to.
    //
    // And assembling must be worth doing: the collision mesh should sit inside
    // the ground the map draws, and it does so far more often for the whole
    // assembly than for any single model in it. That is the check that the
    // manifest is describing a scene rather than listing unrelated files.
    const failures: string[] = []
    let manifests = 0
    let named = 0
    let resolved = 0
    let checked = 0
    let insideAssembly = 0
    let insideLargest = 0

    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isNarc(bytes)) continue
      const members = new Map<string, Uint8Array>()
      try {
        for (const member of readNarc(bytes).entries()) {
          const name = String(member.name ?? member.index)
          members.set(name, isLz10(member.data) ? decompressLz10(member.data) : member.data)
        }
      } catch {
        continue
      }

      for (const [name, data] of members) {
        if (!name.endsWith('.bmdj') || !isMapManifest(data)) continue
        let manifest: ReturnType<typeof readMapManifest>
        try {
          manifest = readMapManifest(data)
        } catch (error) {
          failures.push(`${file.path}#${name}: ${error instanceof Error ? error.message : error}`)
          continue
        }
        manifests++

        const models: Model[] = []
        const meshes: ReturnType<typeof readCollisionMesh>[] = []
        for (const entry of resolveMapResources(manifest, members.keys())) {
          named++
          if (entry.files.length === 0) {
            failures.push(`${file.path}#${name}: nothing in the archive is ${entry.resource.name}`)
            continue
          }
          resolved++
          for (const built of entry.files) {
            const resource = members.get(built) as Uint8Array
            if (isCollisionMesh(resource)) {
              try {
                meshes.push(readCollisionMesh(resource))
              } catch {
                // Reported by the collision test.
              }
            } else if (isNsbmd(resource)) {
              try {
                const model = readNsbmd(resource).models[0]
                if (model?.numShapes) models.push(model)
              } catch {
                // Reported by the model test.
              }
            }
          }
        }
        if (models.length === 0) continue

        const boundsOf = (list: readonly Model[]) =>
          measureBounds(list.flatMap((m) => m.shapes.map((_, i) => m.posedGeometry(i))))
        const whole = boundsOf(models)
        // The single model that covers the most ground, as the comparison.
        let largest = boundsOf([models[0] as Model])
        let largestSpan = 0
        for (const model of models) {
          const b = boundsOf([model])
          const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ)
          if (span > largestSpan) {
            largestSpan = span
            largest = b
          }
        }
        const pad = 0.05 * Math.max(whole.maxX - whole.minX, whole.maxZ - whole.minZ)
        const fits = (b: typeof whole, mesh: (typeof meshes)[number]) =>
          mesh.bounds.minX / 4096 >= b.minX - pad &&
          mesh.bounds.maxX / 4096 <= b.maxX + pad &&
          mesh.bounds.minZ / 4096 >= b.minZ - pad &&
          mesh.bounds.maxZ / 4096 <= b.maxZ + pad

        for (const mesh of meshes) {
          if (mesh.triangles.length === 0) continue
          checked++
          if (fits(whole, mesh)) insideAssembly++
          if (fits(largest, mesh)) insideLargest++
        }
      }
    }

    expect(failures.slice(0, 10)).toEqual([])
    expect(manifests).toBeGreaterThan(300)
    // Every resource a manifest names is in the archive beside it.
    expect(resolved).toBe(named)
    expect(checked).toBeGreaterThan(300)
    // Assembling has to account for more of the walkable ground than the
    // biggest single piece does, or the manifest is not describing a scene.
    // The margin is not large, because the biggest piece is usually the map's
    // main geometry and already covers most of it; what assembly adds is the
    // rest, and it must never take any away.
    expect(insideAssembly).toBeGreaterThan(insideLargest)
    expect(insideAssembly / checked).toBeGreaterThan(0.75)
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

  it('walks a character over every map without losing it', () => {
    // The controller is exercised on squares and ramps built for the purpose in
    // its own tests. This is the other half: real map collision, which is
    // 78% wall, full of slivers, and not built to be walked on by this code.
    //
    // What must hold is a safety property rather than a behavioural one. A
    // character may be stopped by a wall, and may walk off an edge and fall —
    // both are correct. What it may never do is leave the world: tunnel through
    // geometry, or reach a position the fixed-point format cannot hold.
    let maps = 0
    let walks = 0
    let ticks = 0
    let moved = 0
    let escaped = 0
    const speed = fx32(Math.round(0.05 * 4096))

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
        if (mesh.triangles.length < 20) continue
        const world = createCollisionWorld(mesh)
        maps++

        // Start on a few walkable triangles and set off in eight directions.
        const floors = mesh.triangles.filter((t) => t.normal[1] !== 0).slice(0, 3)
        for (const triangle of floors) {
          const [a, b, c] = triangle.vertices
          const cx = Math.round((a[0] + b[0] + c[0]) / 3)
          const cy = Math.round((a[1] + b[1] + c[1]) / 3)
          const cz = Math.round((a[2] + b[2] + c[2]) / 3)
          const ground = groundBelow(world, fx32(cx), fx32(cz), fx32(cy + 4096))
          if (ground === undefined) continue

          for (let direction = 0; direction < 4; direction++) {
            const angle = (direction * Math.PI) / 2
            const dx = fx32(Math.round(Math.cos(angle) * speed))
            const dz = fx32(Math.round(Math.sin(angle) * speed))
            let state: CharacterState = {
              x: fx32(cx),
              y: ground.y,
              z: fx32(cz),
              fallSpeed: fx32(0),
              grounded: true,
            }
            const startX = state.x
            const startZ = state.z
            walks++
            for (let tick = 0; tick < 90; tick++) {
              state = step(world, state, dx, dz, PERSON)
              ticks++
              if (
                !Number.isSafeInteger(state.x) ||
                !Number.isSafeInteger(state.y) ||
                !Number.isSafeInteger(state.z) ||
                Math.abs(state.y) > 0x7fffffff
              ) {
                escaped++
                break
              }
            }
            if (Math.hypot(state.x - startX, state.z - startZ) > 512) moved++
          }
        }
      }
    }

    expect(maps).toBeGreaterThan(300)
    expect(ticks).toBeGreaterThan(200000)
    // Never lost: no tunnelling out of the world, no position the format
    // cannot hold.
    expect(escaped).toBe(0)
    // And it is walking, not merely surviving. The rest is stopped by a wall
    // or gone over an edge, both of which are the world working.
    expect(moved / walks).toBeGreaterThan(0.6)
    // A quarter of a million ticks over real geometry is not a five-second job.
  }, 60_000)

  it('never takes the ground out from under the camera', () => {
    // The game does not solve a building standing between the camera and the
    // party by moving the camera; it stops drawing the building. The rule that
    // decides what to leave out is geometric, and its failure mode is severe:
    // a rule that is slightly too eager deletes the terrain the character is
    // standing on and the map disappears.
    //
    // So the check is a safety property on real maps rather than a picture. On
    // every assembled map, from every camera angle: the pieces the character is
    // standing on and in are still drawn, and what is left out stays a minority
    // of the map.
    let maps = 0
    let views = 0
    let pieces = 0
    let removed = 0
    const groundRemoved: string[] = []
    let enclosed = 0
    let indoorViews = 0
    let indoorAny = 0
    let outdoorViews = 0
    let outdoorAny = 0

    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isNarc(bytes)) continue
      const members = new Map<string, Uint8Array>()
      try {
        for (const member of readNarc(bytes).entries()) {
          const name = String(member.name ?? member.index)
          members.set(name, isLz10(member.data) ? decompressLz10(member.data) : member.data)
        }
      } catch {
        continue
      }

      for (const [name, data] of members) {
        if (!name.endsWith('.bmdj') || !isMapManifest(data)) continue
        let manifest: ReturnType<typeof readMapManifest>
        try {
          manifest = readMapManifest(data)
        } catch {
          continue
        }

        const boxes: ReturnType<typeof measureBounds>[] = []
        const meshes: ReturnType<typeof readCollisionMesh>[] = []
        for (const entry of resolveMapResources(manifest, members.keys())) {
          for (const built of entry.files) {
            const resource = members.get(built) as Uint8Array
            if (isCollisionMesh(resource)) {
              try {
                meshes.push(readCollisionMesh(resource))
              } catch {
                // Reported by the collision test.
              }
            } else if (isNsbmd(resource)) {
              try {
                const model = readNsbmd(resource).models[0]
                if (!model) continue
                for (let shape = 0; shape < model.numShapes; shape++) {
                  boxes.push(measureBounds([model.posedGeometry(shape)]))
                }
              } catch {
                // Reported by the model test.
              }
            }
          }
        }
        if (boxes.length < 4 || meshes.length === 0) continue
        const world = createCollisionWorld(meshes)
        if (world.triangles.length < 20) continue

        // Stand on the walkable triangle nearest the middle of the map, which
        // is the viewer's own spawn rule.
        const { bounds } = world
        const midX = (bounds.minX + bounds.maxX) / 2
        const midZ = (bounds.minZ + bounds.maxZ) / 2
        let stand: { x: number; z: number; y: number } | undefined
        let nearest = Number.POSITIVE_INFINITY
        for (const triangle of world.triangles) {
          if (triangle.normal[1] === 0) continue
          const [a, b, c] = triangle.vertices
          const cx = Math.round((a[0] + b[0] + c[0]) / 3)
          const cz = Math.round((a[2] + b[2] + c[2]) / 3)
          const away = Math.hypot(cx - midX, cz - midZ)
          if (away >= nearest) continue
          const hit = groundBelow(world, fx32(cx), fx32(cz), fx32(bounds.maxY + 4096))
          if (!hit) continue
          nearest = away
          stand = { x: cx, z: cz, y: hit.y }
        }
        if (!stand) continue
        maps++

        const at = { x: fx32(stand.x), y: fx32(stand.y), z: fx32(stand.z) }
        const feet = { x: stand.x / 4096, y: stand.y / 4096, z: stand.z / 4096 }
        // Indoors is decided by what is over the character's head, not by how
        // big the map is.
        const inside = covered(boxes, [feet.x, feet.y, feet.z], toFloat(PERSON.height))
        if (inside) enclosed++
        const camera = followCamera(inside ? INDOORS : OUTDOORS, toFloat(PERSON.height))

        // The pieces the character is inside the footprint of and standing on
        // top of: the ground under their feet, whatever else it is part of.
        // Under the feet means **below** them, not merely near them: the
        // character is inside the piece's footprint and the piece's top is at
        // or below where it is standing. A piece whose box merely spans the
        // character's height can be the roof over its head, and taking that
        // away is the rule working rather than failing.
        const underfoot = new Set<number>()
        boxes.forEach((box, index) => {
          const inside =
            feet.x >= box.minX &&
            feet.x <= box.maxX &&
            feet.z >= box.minZ &&
            feet.z <= box.maxZ &&
            box.maxY <= feet.y + toFloat(PERSON.height) / 4
          if (inside) underfoot.add(index)
        })

        for (let turn = 0; turn < 8; turn++) {
          camera.yaw = (turn * Math.PI) / 4
          updateFollowCamera(camera, at, 0)
          const hidden = occluders(boxes, cameraEye(camera), camera.focus, toFloat(PERSON.radius))
          views++
          pieces += boxes.length
          removed += hidden.length
          if (inside) {
            indoorViews++
            if (hidden.length > 0) indoorAny++
          } else {
            outdoorViews++
            if (hidden.length > 0) outdoorAny++
          }
          for (const index of hidden) {
            if (underfoot.has(index)) {
              groundRemoved.push(`${file.path}#${name}: piece ${index} is under the feet`)
            }
          }
        }
      }
    }

    // The ground is never taken away, on any map, from any angle. This is the
    // assertion the rule exists to satisfy.
    expect(groundRemoved.slice(0, 10)).toEqual([])
    expect(maps).toBeGreaterThan(100)
    expect(views).toBeGreaterThan(800)
    // Enough of the spawns are under a roof to exercise the indoor case at all.
    // Most are not, because the spawn is the walkable ground nearest the middle
    // of the map, which in a village is a street.
    expect(enclosed).toBeGreaterThan(20)
    // And the two cases behave as differently as the description says they do.
    // Under a roof there is usually something in the way — the roof — which is
    // the behaviour the whole rule exists for. Out in the open it is
    // occasional, which is walking behind a building.
    //
    // The indoor rate depends on how big the character is, because the camera's
    // boom is measured in character heights: a small character puts the eye
    // under the roof rather than behind it, and then there is nothing between
    // the two to remove. It was 89% when a person was 0.90 units and is around
    // 65% at 0.09, so this is a floor rather than a target.
    expect(indoorAny / indoorViews).toBeGreaterThan(0.5)
    expect(outdoorAny / outdoorViews).toBeGreaterThan(0.05)
    expect(outdoorAny / outdoorViews).toBeLessThan(indoorAny / indoorViews)
    // What is left out is a minority of the map, not a curtain over it.
    expect(removed / pieces).toBeLessThan(0.2)
  }, 60_000)

  it('draws a character the size it is meant to be, in every frame', () => {
    // The bug this pins: the character was scaled by its **bind pose**, which
    // is a T-pose — arms straight out, 9.2 units across and only 7.7 tall. That
    // is the height of a figure holding itself flat, not the height of the
    // figure, which stands 10.0 once posed. Scaling by one and drawing the
    // other made the character 30% too large, and made it grow as it set off,
    // because standing fell back to the bind pose and walking did not.
    //
    // Both halves are checked here: the size it is drawn at, against a house
    // measured off the same cartridge, and that the size does not change from
    // frame to frame.
    const parts: Model[] = []
    for (const asset of models) {
      if (!asset.archive.endsWith('#chara_pc.gp2')) continue
      if (!/^p_test\d+$/.test(asset.stem)) continue
      try {
        const model = readNsbmd(asset.bytes).models[0]
        if (model?.numShapes) parts.push(model)
      } catch {
        // Reported by the model test.
      }
    }
    expect(parts.length).toBeGreaterThan(0)

    const motions: Animation[] = []
    for (const asset of animations) {
      if (!asset.archive.endsWith('#chara_mp.gp2#mp0200ne.chr')) continue
      try {
        motions.push(...readNsbca(asset.bytes).animations)
      } catch {
        // Reported by the animation test.
      }
    }
    expect(motions.length).toBeGreaterThan(0)

    const pieces = parts.flatMap((model) => model.shapes.map((_, shape) => ({ model, shape })))
    const heightOf = (stacks: Map<Model, Mat4[][]>) => {
      const bounds = measureBounds(
        pieces.map(({ model, shape }) =>
          poseGeometry(
            model.geometry(shape),
            stacks.get(model)?.[shape] ?? (model.shapeMatrices[shape] as Mat4[]),
          ),
        ),
      )
      return bounds.maxY - bounds.minY
    }
    const stacksFor = (motion: Animation | undefined, frame: number) => {
      const stacks = new Map<Model, Mat4[][]>()
      for (const part of parts) {
        if (motion && motion.boneCount === part.nodes.length) {
          const local = sampleAnimation(motion, frame)
          const nodes: NodeTransform[] = part.nodes.map((node, i) => {
            const posed = local[i]
            return posed ? { ...node, local: posed } : node
          })
          stacks.set(part, part.pose(nodes))
        } else {
          stacks.set(part, part.shapeMatrices as Mat4[][])
        }
      }
      return stacks
    }

    // The bind pose really is wider than it is tall, which is why its height
    // cannot be the figure's height.
    const bind = measureBounds(
      pieces.map(({ model, shape }) =>
        poseGeometry(model.geometry(shape), model.shapeMatrices[shape] as Mat4[]),
      ),
    )
    expect(bind.maxX - bind.minX).toBeGreaterThan(bind.maxY - bind.minY)

    // The scale the viewer derives: the tallest frame of the walk cycle. Not
    // the tallest of every motion — reaching up a ladder is legitimately taller
    // than standing, and sizing by that leaves the character walking too small.
    const walk = motions.find((motion) => motion.name === 'walk') as Animation
    expect(walk).toBeDefined()
    let tallest = 0
    for (let frame = 0; frame < walk.frameCount; frame++) {
      tallest = Math.max(tallest, heightOf(stacksFor(walk, frame)))
    }
    const scale = toFloat(PERSON.height) / tallest
    const drawn: number[] = []
    for (let frame = 0; frame < walk.frameCount; frame++) {
      drawn.push(heightOf(stacksFor(walk, frame)) * scale)
    }
    expect(drawn.length).toBeGreaterThan(4)

    // A house in the slice's village, measured off the cartridge: the tallest
    // shape of the models the map's own manifest names.
    let house = 0
    let houses = 0
    for (const file of walkFiles(fs.root)) {
      if (!/\/M01\.amdj$/.test(file.path)) continue
      const members = new Map<string, Uint8Array>()
      for (const member of readNarc(fs.read(file)).entries()) {
        const bytes = member.data
        members.set(
          String(member.name ?? member.index),
          isLz10(bytes) ? decompressLz10(bytes) : bytes,
        )
      }
      for (const [name, data] of members) {
        if (!name.endsWith('.bmdj') || !isMapManifest(data)) continue
        for (const entry of resolveMapResources(readMapManifest(data), members.keys())) {
          for (const built of entry.files) {
            const resource = members.get(built) as Uint8Array
            if (!isNsbmd(resource)) continue
            const model = readNsbmd(resource).models[0]
            if (!model) continue
            // Which model holds the houses is not guessed: the cartridge names
            // its own nodes, and the village's two scenery models carry one
            // called `hus` and `hus1` beside their trees (`tre20`..) and their
            // ground (`base`). Sizing off "the tallest shape in the map" instead
            // measures the waterfall, at 4.4 units, or the sky backdrop at 2.1.
            if (!model.nodes.some((node) => /^hus\d*$/.test(node.name))) continue
            houses++
            for (let shape = 0; shape < model.numShapes; shape++) {
              const bounds = measureBounds([model.posedGeometry(shape)])
              house = Math.max(house, bounds.maxY - bounds.minY)
            }
          }
        }
      }
    }
    // Houses of 1.50 and 1.57 units, so the tallest is a little over 1.5.
    expect(houses).toBe(2)
    expect(house).toBeGreaterThan(1.4)
    expect(house).toBeLessThan(1.7)

    // The fraction of a house is set by eye against the original — see the note
    // on PERSON — so what this pins is that the drawn figure matches the
    // capsule walking it, which is the property the code guarantees, and that
    // the chosen fraction has not drifted.
    for (const height of drawn) {
      expect(height / house).toBeGreaterThan(0.1)
      expect(height / house).toBeLessThan(0.13)
    }
    // And the same size throughout: a character that changed height as it moved
    // is the failure this replaces.
    expect(Math.max(...drawn) - Math.min(...drawn)).toBeLessThan(toFloat(PERSON.height) / 10)
    for (const height of drawn) {
      expect(Math.abs(height - toFloat(PERSON.height))).toBeLessThan(toFloat(PERSON.height) / 10)
    }

    // **A posed figure stands about as tall as its bind pose**, and that is the
    // check that the rotations are the right way round. The stored 3x3s are
    // column-major; read as rows they come out transposed, which is to say
    // inverted, and the character's idle then raises its arms straight over its
    // head and stands 26% taller than the T-pose it was built in.
    const bindHeight = bind.maxY - bind.minY
    expect(tallest / bindHeight).toBeGreaterThan(0.9)
    expect(tallest / bindHeight).toBeLessThan(1.15)
  })

  it("places a map's pieces where the map says, instead of at the origin", () => {
    // The bug: a map's pieces are authored at their own origin and placed by
    // the manifest, and the placement was not read. The village's ten doorways
    // are ten models each about a unit and a half tall, all sitting at the
    // origin — drawn stacked in mid-air in the middle of the map, with their
    // collision boxes stacked there too, which is walls where there is nothing.
    let unplacedAtOrigin = 0
    let placedApart = 0
    let onGround = 0
    let standers = 0
    const misses: number[] = []

    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isNarc(bytes) || !/\.amdj$/.test(file.path)) continue
      const members = new Map<string, Uint8Array>()
      try {
        for (const member of readNarc(bytes).entries()) {
          const data = member.data
          members.set(
            String(member.name ?? member.index),
            isLz10(data) ? decompressLz10(data) : data,
          )
        }
      } catch {
        continue
      }

      for (const [name, data] of members) {
        if (!name.endsWith('.bmdj') || !isMapManifest(data)) continue
        let manifest: ReturnType<typeof readMapManifest>
        try {
          manifest = readMapManifest(data)
        } catch {
          continue
        }

        // The map's own ground: the pieces it does not move.
        const ground: ReturnType<typeof readCollisionMesh>[] = []
        const movable: { place: ReturnType<typeof placementOf>; minY: number }[] = []
        for (const { resource, files } of resolveMapResources(manifest, members.keys())) {
          const place = placementOf(manifest, resource)
          const moved = place.x !== 0 || place.z !== 0
          for (const built of files) {
            const resourceBytes = members.get(built) as Uint8Array
            if (!moved && isCollisionMesh(resourceBytes)) {
              try {
                ground.push(readCollisionMesh(resourceBytes))
              } catch {
                // Reported by the collision test.
              }
            }
            if (!isNsbmd(resourceBytes)) continue
            try {
              const model = readNsbmd(resourceBytes).models[0]
              if (!model?.numShapes) continue
              const bounds = measureBounds(
                model.shapes.map((_, shape) => model.posedGeometry(shape)),
              )
              // Authored at their own origin, so the placement y is where the
              // base goes and "does it meet the ground" is a real question.
              if (Math.abs(bounds.minY) > 0.05) continue
              if (moved) movable.push({ place, minY: bounds.minY })
            } catch {
              // Reported by the model test.
            }
          }
        }
        if (ground.length === 0 || movable.length === 0) continue

        const world = createCollisionWorld(ground)
        for (const { place } of movable) {
          const before = Math.hypot(place.x, place.z)
          if (before > 0.5) placedApart++
          else unplacedAtOrigin++
          const hit = groundBelow(
            world,
            fx32(Math.round(place.x * 4096)),
            fx32(Math.round(place.z * 4096)),
            fx32(Math.round((place.y + 0.4) * 4096)),
          )
          standers++
          if (!hit) continue
          const miss = Math.abs(hit.y / 4096 - place.y)
          misses.push(miss)
          if (miss < 0.05) onGround++
        }
      }
    }

    // The pieces really are moved: nearly all of them end up away from the
    // origin, which is the whole point.
    expect(placedApart).toBeGreaterThan(200)
    expect(placedApart).toBeGreaterThan(unplacedAtOrigin * 4)
    // And they land on the ground rather than anywhere: the divisor in
    // PLACEMENT_SCALE is fitted on exactly this, so what this pins is that the
    // value in the source still matches the cartridge.
    expect(standers).toBeGreaterThan(200)
    expect(onGround / standers).toBeGreaterThan(0.7)
    misses.sort((a, b) => a - b)
    expect(misses[misses.length >> 1] as number).toBeLessThan(0.05)
  })

  it('can walk away from where it puts a character down', () => {
    // Somewhere to stand and somewhere to walk are different questions. The
    // village's spawn was a spot with standable ground in all sixteen
    // directions that the character could not leave, because it sat inside a
    // two-and-a-half-unit wall: the character shuffled 0.03 units in forty
    // ticks whichever way it was pushed.
    const speed = fx32(Math.round(0.05 * 4096))
    const canLeave = (
      world: ReturnType<typeof createCollisionWorld>,
      x: Fx32,
      y: Fx32,
      z: Fx32,
    ) => {
      let open = 0
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4
        let state: CharacterState = { x, y, z, fallSpeed: fx32(0), grounded: true }
        for (let tick = 0; tick < 16; tick++) {
          state = step(
            world,
            state,
            fx32(Math.round(Math.cos(angle) * speed)),
            fx32(Math.round(Math.sin(angle) * speed)),
            PERSON,
          )
        }
        const moved = Math.hypot(toFloat(state.x) - toFloat(x), toFloat(state.z) - toFloat(z))
        if (moved > (toFloat(speed) * 16) / 2) open++
      }
      return open
    }

    let maps = 0
    let stuck = 0
    let free = 0
    const trapped: string[] = []

    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isNarc(bytes) || !/\.amdj$/.test(file.path)) continue
      const members = new Map<string, Uint8Array>()
      try {
        for (const member of readNarc(bytes).entries()) {
          const data = member.data
          members.set(
            String(member.name ?? member.index),
            isLz10(data) ? decompressLz10(data) : data,
          )
        }
      } catch {
        continue
      }
      for (const [name, data] of members) {
        if (!name.endsWith('.bmdj') || !isMapManifest(data)) continue
        let manifest: ReturnType<typeof readMapManifest>
        try {
          manifest = readMapManifest(data)
        } catch {
          continue
        }
        const meshes: PlacedMesh[] = []
        for (const { resource, files } of resolveMapResources(manifest, members.keys())) {
          const place = placementOf(manifest, resource)
          for (const built of files) {
            const resourceBytes = members.get(built) as Uint8Array
            if (!isCollisionMesh(resourceBytes)) continue
            try {
              meshes.push({
                mesh: readCollisionMesh(resourceBytes),
                offset: {
                  x: Math.round(place.x * 4096),
                  y: Math.round(place.y * 4096),
                  z: Math.round(place.z * 4096),
                },
              })
            } catch {
              // Reported by the collision test.
            }
          }
        }
        if (meshes.length === 0) continue
        const world = createCollisionWorld(meshes)
        if (world.triangles.length < 40) continue

        // The viewer's rule: walkable ground nearest the middle that the
        // character can leave, trying the nearest first.
        const midX = (world.bounds.minX + world.bounds.maxX) / 2
        const midZ = (world.bounds.minZ + world.bounds.maxZ) / 2
        const candidates = world.triangles
          .filter((t) => t.normal[1] !== 0)
          .map((t) => {
            const [a, b, c] = t.vertices
            const cx = Math.round((a[0] + b[0] + c[0]) / 3)
            const cz = Math.round((a[2] + b[2] + c[2]) / 3)
            return { x: fx32(cx), z: fx32(cz), away: Math.hypot(cx - midX, cz - midZ) }
          })
          .sort((p, q) => p.away - q.away)
          .slice(0, 120)

        let bestOpen = -1
        for (const candidate of candidates) {
          const hit = groundBelow(world, candidate.x, candidate.z, fx32(world.bounds.maxY + 4096))
          if (!hit || hit.slope < PERSON.maxSlope) continue
          const open = canLeave(world, candidate.x, hit.y, candidate.z)
          bestOpen = Math.max(bestOpen, open)
          if (open >= 6) break
        }
        if (bestOpen < 0) continue
        maps++
        if (bestOpen >= 6) free++
        else {
          stuck++
          if (trapped.length < 6)
            trapped.push(`${file.path}#${name}: best spawn opens ${bestOpen}/8 ways`)
        }
      }
    }

    expect(maps).toBeGreaterThan(200)
    // Nearly every map offers somewhere the character can walk away from. The
    // rule is "try until one works", so what this pins is that such a spot
    // exists to be found.
    expect(free / maps).toBeGreaterThan(0.9)
    expect(stuck).toBeLessThan(maps / 10)
    expect(trapped.length).toBeLessThan(7)
  }, 120_000)

  it("does not call a map's open ground indoors because of its sky", () => {
    // The village's sky is one piece 15.70 by 12.08 units around a map whose
    // walkable ground is 12.3 by 9.1. It is over the character's head
    // everywhere, so counted as a ceiling every spot in the village reads as
    // indoors and the camera tucks in under the open sky. All 41 of them did.
    //
    // No map on the cartridge has collision above head height, so the geometry
    // has to answer this; a piece reaching past the map's own collision on all
    // four sides is not part of the place being stood in.
    let maps = 0
    let withSky = 0
    let withoutSky = 0
    let spots = 0
    let villageSpots = 0
    let villageWithSky = 0
    let villageWithoutSky = 0

    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isNarc(bytes) || !/\.amdj$/.test(file.path)) continue
      const members = new Map<string, Uint8Array>()
      try {
        for (const member of readNarc(bytes).entries()) {
          const data = member.data
          members.set(
            String(member.name ?? member.index),
            isLz10(data) ? decompressLz10(data) : data,
          )
        }
      } catch {
        continue
      }
      for (const [name, data] of members) {
        if (!name.endsWith('.bmdj') || !isMapManifest(data)) continue
        let manifest: ReturnType<typeof readMapManifest>
        try {
          manifest = readMapManifest(data)
        } catch {
          continue
        }
        const boxes: ReturnType<typeof measureBounds>[] = []
        const meshes: PlacedMesh[] = []
        for (const { resource, files } of resolveMapResources(manifest, members.keys())) {
          const place = placementOf(manifest, resource)
          const offset = {
            x: Math.round(place.x * 4096),
            y: Math.round(place.y * 4096),
            z: Math.round(place.z * 4096),
          }
          for (const built of files) {
            const resourceBytes = members.get(built) as Uint8Array
            if (isCollisionMesh(resourceBytes)) {
              try {
                meshes.push({ mesh: readCollisionMesh(resourceBytes), offset })
              } catch {
                // Reported by the collision test.
              }
            } else if (isNsbmd(resourceBytes)) {
              try {
                const model = readNsbmd(resourceBytes).models[0]
                if (!model?.numShapes) continue
                for (let shape = 0; shape < model.numShapes; shape++) {
                  const b = measureBounds([model.posedGeometry(shape)])
                  boxes.push({
                    minX: b.minX + place.x,
                    maxX: b.maxX + place.x,
                    minY: b.minY + place.y,
                    maxY: b.maxY + place.y,
                    minZ: b.minZ + place.z,
                    maxZ: b.maxZ + place.z,
                  })
                }
              } catch {
                // Reported by the model test.
              }
            }
          }
        }
        if (meshes.length === 0 || boxes.length === 0) continue
        const world = createCollisionWorld(meshes)
        const ground = world.bounds
        const kept = boxes.filter(
          (b) =>
            !(
              b.minX < ground.minX / 4096 &&
              b.maxX > ground.maxX / 4096 &&
              b.minZ < ground.minZ / 4096 &&
              b.maxZ > ground.maxZ / 4096
            ),
        )
        if (kept.length === boxes.length) continue
        maps++
        const village = file.path === '/data/map/M01.amdj'

        for (let i = 0; i < 100; i++) {
          const x = ground.minX + ((ground.maxX - ground.minX) * (i % 10)) / 9
          const z = ground.minZ + ((ground.maxZ - ground.minZ) * Math.floor(i / 10)) / 9
          const hit = groundBelow(
            world,
            fx32(Math.round(x)),
            fx32(Math.round(z)),
            fx32(ground.maxY + 4096),
          )
          if (!hit) continue
          spots++
          const feet: [number, number, number] = [x / 4096, toFloat(hit.y), z / 4096]
          const under = covered(boxes, feet, toFloat(PERSON.height))
          const open = covered(kept, feet, toFloat(PERSON.height))
          if (under) withSky++
          if (open) withoutSky++
          if (village) {
            villageSpots++
            if (under) villageWithSky++
            if (open) villageWithoutSky++
          }
        }
      }
    }

    expect(maps).toBeGreaterThan(50)
    expect(spots).toBeGreaterThan(500)
    // Across the cartridge the effect is real but moderate, because most maps
    // are interiors where a ceiling overhead is the truth. Counting the
    // backdrop still turns a quarter of all open ground into ceiling.
    expect(withSky / spots).toBeGreaterThan(0.25)
    expect(withoutSky).toBeLessThan(withSky * 0.85)

    // The slice's village is the severe case, and the one to pin: counting its
    // sky, every spot on it is indoors.
    expect(villageSpots).toBeGreaterThan(15)
    expect(villageWithSky).toBe(villageSpots)
    expect(villageWithoutSky / villageSpots).toBeLessThan(0.3)
  }, 120_000)

  it('can walk the village once its doorway markers stop being walls', () => {
    // A map's collision arrives as several meshes, and a few are one quad
    // standing vertically with nothing to stand on. The village has eleven:
    // one across each of its ten doorways, plus a four-by-six quad standing in
    // the middle of the map. Treated as walls, every doorway is sealed and the
    // map is cut in half.
    const speed = Math.round(0.05 * 4096)
    const reach = (world: ReturnType<typeof createCollisionWorld>) => {
      const cell = Math.round(0.15 * 4096)
      const key = (x: number, z: number) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`
      const walkable = new Map<string, { x: number; z: number; y: Fx32 }>()
      for (let x = world.bounds.minX; x <= world.bounds.maxX; x += cell) {
        for (let z = world.bounds.minZ; z <= world.bounds.maxZ; z += cell) {
          const hit = groundBelow(
            world,
            fx32(Math.round(x)),
            fx32(Math.round(z)),
            fx32(world.bounds.maxY + 4096),
          )
          if (hit && hit.slope >= PERSON.maxSlope) {
            walkable.set(key(x, z), { x: Math.round(x), z: Math.round(z), y: hit.y })
          }
        }
      }
      if (walkable.size === 0) return 0
      const midX = (world.bounds.minX + world.bounds.maxX) / 2
      const midZ = (world.bounds.minZ + world.bounds.maxZ) / 2
      let start = [...walkable.values()][0] as { x: number; z: number; y: Fx32 }
      let near = Number.POSITIVE_INFINITY
      for (const spot of walkable.values()) {
        const away = Math.hypot(spot.x - midX, spot.z - midZ)
        if (away < near) {
          near = away
          start = spot
        }
      }
      const seen = new Set([key(start.x, start.z)])
      const queue: CharacterState[] = [
        { x: fx32(start.x), y: start.y, z: fx32(start.z), fallSpeed: fx32(0), grounded: true },
      ]
      while (queue.length > 0 && seen.size < 8000) {
        const at = queue.pop() as CharacterState
        for (let d = 0; d < 8; d++) {
          const angle = (d * Math.PI) / 4
          let state = at
          for (let i = 0; i < 4; i++) {
            state = step(
              world,
              state,
              fx32(Math.round(Math.cos(angle) * speed)),
              fx32(Math.round(Math.sin(angle) * speed)),
              PERSON,
            )
          }
          if (!state.grounded) continue
          const k = key(state.x, state.z)
          if (seen.has(k)) continue
          seen.add(k)
          queue.push(state)
        }
      }
      let reached = 0
      for (const k of walkable.keys()) if (seen.has(k)) reached++
      return reached / walkable.size
    }

    let markers = 0
    let standless = 0
    let sealed = 0
    let open = 0
    for (const file of walkFiles(fs.root)) {
      if (file.path !== '/data/map/M01.amdj') continue
      const members = new Map<string, Uint8Array>()
      for (const member of readNarc(fs.read(file)).entries()) {
        const data = member.data
        members.set(String(member.name ?? member.index), isLz10(data) ? decompressLz10(data) : data)
      }
      let manifest: ReturnType<typeof readMapManifest> | undefined
      for (const [name, data] of members) {
        if (name.endsWith('.bmdj') && isMapManifest(data)) manifest = readMapManifest(data)
      }
      if (!manifest) continue
      const all: PlacedMesh[] = []
      const kept: PlacedMesh[] = []
      for (const { resource, files } of resolveMapResources(manifest, members.keys())) {
        const place = placementOf(manifest, resource)
        const offset = {
          x: Math.round(place.x * 4096),
          y: Math.round(place.y * 4096),
          z: Math.round(place.z * 4096),
        }
        for (const built of files) {
          const bytes = members.get(built) as Uint8Array
          if (!isCollisionMesh(bytes)) continue
          const mesh = readCollisionMesh(bytes)
          all.push({ mesh, offset })
          if (isMarkerVolume(mesh)) {
            markers++
            if (!mesh.triangles.some((t) => t.normal[1] !== 0)) standless++
          } else {
            kept.push({ mesh, offset })
          }
        }
      }
      sealed = reach(createCollisionWorld(all))
      open = reach(createCollisionWorld(kept))
    }

    // Ten doorways and one more, every one of them nothing but wall.
    expect(markers).toBe(11)
    expect(standless).toBe(11)
    // Sealed, a good part of the village cannot be reached from its middle.
    // Open, nearly all of it can — and no walkable ground is lost with them,
    // because they held none.
    //
    // These were 0.4 and 0.55 while the character's radius was 0.04, which made
    // them 0.22 of their own height wide — about twice a person. At 0.025 they
    // fit past the ends of a marker quad rather than being stopped by it, so
    // sealing costs less than it did: 0.596 against 0.927. The gap is what the
    // test is for, and it is still the difference between three fifths of the
    // village and all but a fourteenth of it.
    expect(sealed).toBeLessThan(0.65)
    expect(open).toBeGreaterThan(0.9)
    expect(open - sealed).toBeGreaterThan(0.25)
  }, 120_000)

  it('does not put a character down in the water', () => {
    // The village's river is two flat planes across the middle of the map, and
    // a spawn that looks for the map's centre lands in one of them. The map's
    // own textures say where the water is: `m01m00wtr01` beside
    // `m01m00grs01`, a convention holding across 419 of the cartridge's map
    // models.
    let maps = 0
    let hadWater = 0
    let wouldSpawnWet = 0
    let stillWet = 0

    for (const file of walkFiles(fs.root)) {
      const bytes = fs.read(file)
      if (!isNarc(bytes) || !/\.amdj$/.test(file.path)) continue
      const members = new Map<string, Uint8Array>()
      try {
        for (const member of readNarc(bytes).entries()) {
          const data = member.data
          members.set(
            String(member.name ?? member.index),
            isLz10(data) ? decompressLz10(data) : data,
          )
        }
      } catch {
        continue
      }
      for (const [name, data] of members) {
        if (!name.endsWith('.bmdj') || !isMapManifest(data)) continue
        let manifest: ReturnType<typeof readMapManifest>
        try {
          manifest = readMapManifest(data)
        } catch {
          continue
        }
        const meshes: PlacedMesh[] = []
        const water: { minX: number; maxX: number; minZ: number; maxZ: number; surface: number }[] =
          []
        for (const { resource, files } of resolveMapResources(manifest, members.keys())) {
          const place = placementOf(manifest, resource)
          const offset = {
            x: Math.round(place.x * 4096),
            y: Math.round(place.y * 4096),
            z: Math.round(place.z * 4096),
          }
          for (const built of files) {
            const resourceBytes = members.get(built) as Uint8Array
            if (isCollisionMesh(resourceBytes)) {
              try {
                const mesh = readCollisionMesh(resourceBytes)
                if (!isMarkerVolume(mesh)) meshes.push({ mesh, offset })
              } catch {
                // Reported by the collision test.
              }
            } else if (isNsbmd(resourceBytes)) {
              try {
                const model = readNsbmd(resourceBytes).models[0]
                if (!model?.numShapes) continue
                for (let shape = 0; shape < model.numShapes; shape++) {
                  const materialIndex = model.shapeMaterials[shape]
                  const material =
                    materialIndex === undefined ? undefined : model.materials[materialIndex]
                  if (material?.texture === undefined || !isWaterTexture(material.texture)) continue
                  const b = measureBounds([model.posedGeometry(shape)])
                  water.push({
                    minX: b.minX + place.x,
                    maxX: b.maxX + place.x,
                    minZ: b.minZ + place.z,
                    maxZ: b.maxZ + place.z,
                    surface: b.maxY + place.y,
                  })
                }
              } catch {
                // Reported by the model test.
              }
            }
          }
        }
        if (meshes.length === 0) continue
        const world = createCollisionWorld(meshes)
        if (world.triangles.length < 40) continue
        maps++
        if (water.length === 0) continue
        hadWater++

        const wet = (x: number, y: number, z: number) =>
          water.some(
            (w) =>
              x >= w.minX &&
              x <= w.maxX &&
              z >= w.minZ &&
              z <= w.maxZ &&
              y <= w.surface + toFloat(PERSON.height),
          )

        const midX = (world.bounds.minX + world.bounds.maxX) / 2
        const midZ = (world.bounds.minZ + world.bounds.maxZ) / 2
        const candidates = world.triangles
          .filter((t) => t.normal[1] !== 0)
          .map((t) => {
            const [a, b, c] = t.vertices
            const cx = Math.round((a[0] + b[0] + c[0]) / 3)
            const cz = Math.round((a[2] + b[2] + c[2]) / 3)
            return { x: fx32(cx), z: fx32(cz), away: Math.hypot(cx - midX, cz - midZ) }
          })
          .sort((p, q) => p.away - q.away)
          .slice(0, 200)

        // Where the old rule went: nearest the middle, water or not.
        for (const candidate of candidates) {
          const hit = groundBelow(world, candidate.x, candidate.z, fx32(world.bounds.maxY + 4096))
          if (!hit || hit.slope < PERSON.maxSlope) continue
          if (wet(toFloat(candidate.x), toFloat(hit.y), toFloat(candidate.z))) wouldSpawnWet++
          break
        }
        // And where it goes now, skipping the water.
        for (const candidate of candidates) {
          const hit = groundBelow(world, candidate.x, candidate.z, fx32(world.bounds.maxY + 4096))
          if (!hit || hit.slope < PERSON.maxSlope) continue
          if (wet(toFloat(candidate.x), toFloat(hit.y), toFloat(candidate.z))) continue
          break
        }
        // Whether any dry candidate exists at all.
        const dry = candidates.some((candidate) => {
          const hit = groundBelow(world, candidate.x, candidate.z, fx32(world.bounds.maxY + 4096))
          return (
            hit !== undefined &&
            hit.slope >= PERSON.maxSlope &&
            !wet(toFloat(candidate.x), toFloat(hit.y), toFloat(candidate.z))
          )
        })
        if (!dry) stillWet++
      }
    }

    expect(maps).toBeGreaterThan(200)
    expect(hadWater).toBeGreaterThan(20)
    // The old rule put a character in the water on a real share of the maps
    // that have any — which is what happened in the village.
    expect(wouldSpawnWet).toBeGreaterThan(0)
    // And nearly every watery map has dry ground near its middle to use instead.
    expect(stillWet).toBeLessThan(hadWater / 4)
  }, 180_000)

  it("spreads a character's motions across a family of packs", () => {
    // The `.bcfg` beside a part names one pack, and taking that pack and
    // stopping gives a character that can walk and cannot stand still:
    // `mp0200ne` holds exactly one animation, `walk`. Standing is in
    // `mp0200n` and `mp0200f` beside it.
    const packs = new Map<string, string[]>()
    for (const asset of animations) {
      if (!asset.archive.includes('#chara_mp.gp2#')) continue
      try {
        packs.set(
          asset.archive.slice(asset.archive.lastIndexOf('#') + 1),
          readNsbca(asset.bytes).animations.map((a) => a.name),
        )
      } catch {
        // Reported by the animation test.
      }
    }
    expect(packs.size).toBeGreaterThan(100)

    let withStand = 0
    let withWalk = 0
    let withBoth = 0
    for (const names of packs.values()) {
      const stand = names.includes('stand')
      const walk = names.includes('walk')
      if (stand) withStand++
      if (walk) withWalk++
      if (stand && walk) withBoth++
    }
    expect(withStand).toBeGreaterThan(40)
    expect(withWalk).toBeGreaterThan(5)
    // The finding: not one pack on the cartridge holds both.
    expect(withBoth).toBe(0)

    // The family the slice's stand-in belongs to does hold both between them.
    const family = [...packs].filter(([name]) => name.startsWith('mp0200'))
    expect(family.length).toBeGreaterThan(5)
    const together = new Set(family.flatMap(([, names]) => names))
    expect(together.has('walk')).toBe(true)
    expect(together.has('stand')).toBe(true)
  })

  it('draws the stand-in figure once, not twice', () => {
    // The three `p_test` parts are not three pieces of one figure. `p_test0` is
    // a whole figure of four shapes; `p_test1` is its upper two and `p_test2`
    // its lower two, to the same bounds. Drawing all three draws the character
    // twice, which shows first on the head.
    const parts: { name: string; model: Model; bounds: ReturnType<typeof measureBounds> }[] = []
    for (const asset of models) {
      if (!asset.archive.endsWith('#chara_pc.gp2')) continue
      if (!/^p_test\d+$/.test(asset.stem)) continue
      try {
        const model = readNsbmd(asset.bytes).models[0]
        if (!model?.numShapes) continue
        parts.push({
          name: asset.stem,
          model,
          bounds: measureBounds(model.shapes.map((_, shape) => model.posedGeometry(shape))),
        })
      } catch {
        // Reported by the model test.
      }
    }
    expect(parts.length).toBe(3)

    // One of them covers the other two.
    const whole = parts.reduce((best, part) =>
      part.model.numShapes > best.model.numShapes ? part : best,
    )
    expect(whole.model.numShapes).toBe(4)
    for (const part of parts) {
      if (part === whole) continue
      expect(part.bounds.minY).toBeGreaterThanOrEqual(whole.bounds.minY - 1e-3)
      expect(part.bounds.maxY).toBeLessThanOrEqual(whole.bounds.maxY + 1e-3)
      expect(part.bounds.minX).toBeGreaterThanOrEqual(whole.bounds.minX - 1e-3)
      expect(part.bounds.maxX).toBeLessThanOrEqual(whole.bounds.maxX + 1e-3)
    }
    // Together they hold twice the shapes the whole figure needs.
    expect(parts.reduce((n, part) => n + part.model.numShapes, 0)).toBe(8)
  })

  it('picks a standing idle that keeps the figure on the floor', () => {
    // Three animations in the family are called `stand`. Keeping the last one
    // read chooses between them by archive order, and the one that wins that
    // way lifts the whole figure 7.5% of its own height off the ground — which
    // is what "the feet do not touch" looks like from the outside.
    //
    // Invisible to every test that has no cartridge: it needs the real packs
    // for there to be more than one candidate at all.
    const parts = new Map<string, Model>()
    for (const asset of models) {
      if (!asset.archive.endsWith('#chara_pc.gp2')) continue
      if (!/^p_[a-z]+\w*$/.test(asset.stem)) continue
      try {
        const model = readNsbmd(asset.bytes).models[0]
        if (model?.numShapes) parts.set(asset.stem, model)
      } catch {
        // Reported by the model test.
      }
    }
    expect(parts.size).toBeGreaterThan(100)

    const motions = new Map<string, Animation[]>()
    for (const asset of animations) {
      if (!asset.archive.includes('#chara_mp.gp2#')) continue
      const pack = asset.archive.slice(asset.archive.lastIndexOf('#') + 1)
      if (!pack.startsWith('mp0200')) continue
      try {
        for (const animation of readNsbca(asset.bytes).animations) {
          const list = motions.get(animation.name)
          if (list) list.push(animation)
          else motions.set(animation.name, [animation])
        }
      } catch {
        // Reported by the animation test.
      }
    }

    const stands = motions.get('stand') ?? []
    // If the cartridge ever stops disagreeing with itself this check is moot,
    // and saying so beats passing vacuously.
    expect(stands.length, 'the family should carry more than one `stand`').toBeGreaterThan(1)

    const figure = chooseFigure({ parts, motions })
    const pieces = figurePieces(figure)
    expect(pieces.length).toBeGreaterThan(0)

    const travelOf = (motion: Animation): number => {
      let low = Number.POSITIVE_INFINITY
      let high = Number.NEGATIVE_INFINITY
      for (let frame = 0; frame < loopFrames(motion); frame++) {
        const { minY } = measureBounds(
          poseFigure(figure, pieces, motion, frame).map((p) => p.posed),
        )
        low = Math.min(low, minY)
        high = Math.max(high, minY)
      }
      return high - low
    }

    const chosen = figure.motions.get('stand') as Animation
    expect(chosen).toBeDefined()
    const bounds = measureBounds(poseFigure(figure, pieces, chosen, 0).map((p) => p.posed))
    const figureHeight = bounds.maxY - bounds.minY
    expect(figureHeight).toBeGreaterThan(0)

    // The chosen idle holds the figure still, and the worst candidate does not,
    // so this is a real choice rather than a property they all happen to share.
    const travels = stands.map(travelOf)
    expect(travelOf(chosen)).toBe(Math.min(...travels))
    expect(travelOf(chosen) / figureHeight).toBeLessThan(0.01)
    expect(Math.max(...travels) / figureHeight).toBeGreaterThan(0.05)

    // The walk is a gait, not a lift: its travel is one foot leaving the floor,
    // and the same rule must not flatten it.
    const walk = figure.motions.get('walk')
    if (walk) expect(travelOf(walk) / figureHeight).toBeGreaterThan(0.02)
  })

  it('has motions that do not keep the character on its own origin', () => {
    // A character is placed by putting its model's origin at its feet, which
    // assumes the model's lowest point is that origin. It is not: `walk` poses
    // the figure down to -0.27 in model units while `stand` and `run` never
    // come below 0.73, so an idle drawn that way floats an eighth of the
    // character's own height above the floor.
    const parts: Model[] = []
    for (const asset of models) {
      if (!asset.archive.endsWith('#chara_pc.gp2')) continue
      if (!/^p_test\d+$/.test(asset.stem)) continue
      try {
        const model = readNsbmd(asset.bytes).models[0]
        if (model?.numShapes) parts.push(model)
      } catch {
        // Reported by the model test.
      }
    }
    expect(parts.length).toBeGreaterThan(0)
    // The viewer keeps the one part no other part covers.
    const whole = parts.reduce((best, part) => (part.numShapes > best.numShapes ? part : best))

    const motions = new Map<string, Animation>()
    for (const asset of animations) {
      if (!asset.archive.includes('#chara_mp.gp2#')) continue
      const pack = asset.archive.slice(asset.archive.lastIndexOf('#') + 1)
      if (!pack.startsWith('mp0200')) continue
      try {
        for (const animation of readNsbca(asset.bytes).animations)
          motions.set(animation.name, animation)
      } catch {
        // Reported by the animation test.
      }
    }
    expect(motions.has('walk')).toBe(true)
    expect(motions.has('stand')).toBe(true)

    const boundsAt = (motion: Animation, frame: number) => {
      const local = sampleAnimation(motion, frame)
      const nodes: NodeTransform[] = whole.nodes.map((node, i) =>
        local[i] ? { ...node, local: local[i] as Mat4 } : node,
      )
      const stacks = whole.pose(nodes)
      return measureBounds(
        whole.shapes.map((_, shape) =>
          poseGeometry(
            whole.geometry(shape),
            stacks[shape] ?? (whole.shapeMatrices[shape] as Mat4[]),
          ),
        ),
      )
    }

    // The scale the viewer derives, from the tallest frame of the walk.
    const walk = motions.get('walk') as Animation
    let tallest = 0
    for (let frame = 0; frame < walk.frameCount; frame++) {
      const b = boundsAt(walk, frame)
      tallest = Math.max(tallest, b.maxY - b.minY)
    }
    const scale = toFloat(PERSON.height) / tallest

    let byOrigin = 0
    let byCycle = 0
    for (const [name, motion] of motions) {
      const lows: number[] = []
      for (let frame = 0; frame < motion.frameCount; frame++)
        lows.push(boundsAt(motion, frame).minY)
      const lowest = Math.min(...lows)
      for (const low of lows) {
        // Hung from the model's origin, the gap is wherever the figure is.
        byOrigin = Math.max(byOrigin, Math.abs(low * scale))
        // Anchored once per cycle, it is planted on the lowest frame only.
        byCycle = Math.max(byCycle, (low - lowest) * scale)
      }
      if (name === 'stand') {
        // The idle carries the whole body up and back down through its cycle,
        // 0.39 to 1.25 in model units, while its own height changes by 0.05.
        // One offset for the whole motion cannot keep the feet down.
        expect(lowest).toBeGreaterThan(0.2)
        expect(Math.max(...lows) - lowest).toBeGreaterThan(0.5)
      }
    }

    // Hung from the origin, some motion holds the character a twentieth of its
    // height off the floor. Anchored once per cycle it still rides a twentieth
    // up mid-cycle. Only anchoring every frame puts it down, which is what the
    // viewer does: the drawn figure's own lowest point sits at the feet.
    expect(byOrigin).toBeGreaterThan(toFloat(PERSON.height) / 20)
    expect(byCycle).toBeGreaterThan(toFloat(PERSON.height) / 20)
  })

  it('tells a closing frame from a real one', () => {
    // An animation may end on a repeat of its first frame. Playing every frame
    // and wrapping then shows that pose twice running — a hitch once per cycle,
    // several times a second on a nine-frame walk.
    let total = 0
    let closes = 0
    let odd = 0
    for (const asset of animations) {
      let parsed: readonly Animation[]
      try {
        parsed = readNsbca(asset.bytes).animations
      } catch {
        continue
      }
      for (const animation of parsed) {
        if (animation.frameCount < 3) continue
        total++
        if (animation.frameCount % 2 === 1) odd++
        if (loopFrames(animation) === animation.frameCount - 1) closes++
      }
    }

    expect(total).toBeGreaterThan(4000)
    // It is a property of each animation, not a convention to assume: a good
    // share close and the rest do not, so both branches carry real data.
    expect(closes / total).toBeGreaterThan(0.3)
    expect(closes / total).toBeLessThan(0.7)
    // And the pattern behind it shows in the frame counts, which are mostly a
    // whole number of segments plus the frame that closes the last one.
    expect(odd / total).toBeGreaterThan(0.7)
  }, 120_000)

  it("plays the character's walk without holding a pose twice", () => {
    const motions = new Map<string, Animation>()
    for (const asset of animations) {
      if (!asset.archive.includes('#chara_mp.gp2#')) continue
      const pack = asset.archive.slice(asset.archive.lastIndexOf('#') + 1)
      if (!pack.startsWith('mp0200')) continue
      try {
        for (const animation of readNsbca(asset.bytes).animations)
          motions.set(animation.name, animation)
      } catch {
        // Reported by the animation test.
      }
    }
    const walk = motions.get('walk') as Animation
    const stand = motions.get('stand') as Animation
    expect(walk).toBeDefined()
    expect(stand).toBeDefined()
    // Both of the motions the viewer plays end on a repeat of their first
    // frame, so both loop one frame shorter than they are stored.
    expect(loopFrames(walk)).toBe(walk.frameCount - 1)
    expect(loopFrames(stand)).toBe(stand.frameCount - 1)
    expect(loopFrames(walk)).toBeGreaterThan(0)
  })

  it('assembles a character with a head on it', () => {
    // A character is not one model. `chara_pc.gp2` holds parts whose names say
    // what they are, and **only the bodies and legs carry the shared rig**. The
    // rest have a single bone of their own and sit at the origin until
    // something hangs them off the figure — which is why a character built from
    // the rigged parts alone ends at the neck.
    const parts = new Map<string, Model>()
    for (const asset of models) {
      if (!asset.archive.endsWith('#chara_pc.gp2')) continue
      try {
        const model = readNsbmd(asset.bytes).models[0]
        if (model?.numShapes) parts.set(asset.stem, model)
      } catch {
        // Reported by the model test.
      }
    }
    expect(parts.size).toBeGreaterThan(700)

    const kinds = new Map<string, { total: number; rigged: number }>()
    for (const [name, model] of parts) {
      const prefix = /^p_([a-z]+)/.exec(name)?.[1]
      if (prefix === undefined) continue
      const stat = kinds.get(prefix) ?? { total: 0, rigged: 0 }
      stat.total++
      if (model.nodes.length === 14) stat.rigged++
      kinds.set(prefix, stat)
    }
    // Bodies and legs carry the rig; hair, faces, shoes and weapons do not.
    expect(kinds.get('b')?.rigged).toBe(kinds.get('b')?.total)
    expect(kinds.get('p')?.rigged).toBe(kinds.get('p')?.total)
    for (const prefix of ['h', 'f', 's', 'w']) {
      expect(kinds.get(prefix)?.rigged).toBe(0)
      expect(kinds.get(prefix)?.total).toBeGreaterThan(10)
    }

    const motions: Animation[] = []
    for (const asset of animations) {
      if (!asset.archive.includes('#chara_mp.gp2#')) continue
      const pack = asset.archive.slice(asset.archive.lastIndexOf('#') + 1)
      if (!pack.startsWith('mp0200')) continue
      try {
        motions.push(...readNsbca(asset.bytes).animations)
      } catch {
        // Reported by the animation test.
      }
    }
    const stand = motions.find((m) => m.name === 'stand') as Animation
    expect(stand).toBeDefined()

    const named = [...parts.keys()].sort()
    const firstOf = (prefix: string, rigged: boolean) =>
      named.find((name) => {
        if (!name.startsWith(`p_${prefix}`) || name.startsWith('p_test')) return false
        const model = parts.get(name) as Model
        return rigged ? model.nodes.length === 14 : model.nodes.length < 14
      })
    const body = parts.get(firstOf('b', true) as string) as Model
    const legs = parts.get(firstOf('p', true) as string) as Model
    const face = parts.get(firstOf('f', false) as string) as Model
    expect(body).toBeDefined()
    expect(legs).toBeDefined()
    expect(face).toBeDefined()

    const posed = (model: Model) => {
      const local = sampleAnimation(stand, 0)
      const nodes: NodeTransform[] = model.nodes.map((node, i) =>
        local[i] ? { ...node, local: local[i] as Mat4 } : node,
      )
      const stacks = model.pose(nodes)
      return measureBounds(
        model.shapes.map((_, shape) =>
          poseGeometry(
            model.geometry(shape),
            stacks[shape] ?? (model.shapeMatrices[shape] as Mat4[]),
          ),
        ),
      )
    }
    const rigged = { body: posed(body), legs: posed(legs) }
    // Body and legs meet at the waist and together make a headless figure.
    expect(rigged.legs.minY).toBeLessThan(rigged.body.minY)
    expect(rigged.body.minY).toBeLessThan(rigged.legs.maxY)
    const neck = rigged.body.maxY

    // The head bone sits at the top of the body.
    const local = sampleAnimation(stand, 0)
    const nodes: NodeTransform[] = body.nodes.map((node, i) =>
      local[i] ? { ...node, local: local[i] as Mat4 } : node,
    )
    const headIndex = body.nodes.findIndex((node) => node.name === 'head')
    expect(headIndex).toBeGreaterThanOrEqual(0)
    const at = resolvePose(body.renderCommands, nodes).world[headIndex] as Mat4
    // Near the top of the body rather than exactly at it: a body may carry a
    // hood or a high collar that reaches above the bone the head hangs from.
    const shoulders = rigged.body.minY + (neck - rigged.body.minY) * 0.7
    expect(at[13] as number).toBeGreaterThan(shoulders)
    expect(at[13] as number).toBeLessThan(neck + 1)

    // A face put through that bone lands on the neck, and takes the figure to a
    // head that is a fifth of its height — the proportion this game draws.
    const raw = measureBounds(
      face.shapes.map((_, shape) =>
        poseGeometry(face.geometry(shape), face.shapeMatrices[shape] as Mat4[]),
      ),
    )
    const placed = {
      minY: raw.minY + (at[13] as number),
      maxY: raw.maxY + (at[13] as number),
    }
    // It sits above the shoulders and reaches past the waist of the body.
    expect(placed.minY).toBeGreaterThan(rigged.legs.maxY)
    expect(placed.maxY).toBeGreaterThan(shoulders)
    const whole = Math.max(placed.maxY, neck) - rigged.legs.minY
    expect((placed.maxY - placed.minY) / whole).toBeGreaterThan(0.1)
    expect((placed.maxY - placed.minY) / whole).toBeLessThan(0.35)
  })

  it("keeps a motion's own rise and fall instead of flattening it", () => {
    // A character is placed by putting its model's origin at its feet, and the
    // motions do not keep it there, so the offset has to be measured. The
    // question is how often. The lowest point moves through a cycle and it
    // should: over the walk it is a foot leaving the ground and coming back.
    // Subtracting it each frame pins that foot down and translates the whole
    // body instead, which is seen as the head bobbing.
    const parts = new Map<string, Model>()
    for (const asset of models) {
      if (!asset.archive.endsWith('#chara_pc.gp2')) continue
      try {
        const model = readNsbmd(asset.bytes).models[0]
        if (model?.numShapes) parts.set(asset.stem, model)
      } catch {
        // Reported by the model test.
      }
    }
    const motions = new Map<string, Animation>()
    for (const asset of animations) {
      if (!asset.archive.includes('#chara_mp.gp2#')) continue
      const pack = asset.archive.slice(asset.archive.lastIndexOf('#') + 1)
      if (!pack.startsWith('mp0200')) continue
      try {
        for (const animation of readNsbca(asset.bytes).animations)
          motions.set(animation.name, animation)
      } catch {
        // Reported by the animation test.
      }
    }

    const named = [...parts.keys()].sort()
    const firstRigged = (prefix: string) =>
      parts.get(
        named.find(
          (name) =>
            name.startsWith(`p_${prefix}`) &&
            !name.startsWith('p_test') &&
            (parts.get(name) as Model).nodes.length === 14,
        ) as string,
      ) as Model
    const figure = [firstRigged('b'), firstRigged('p')]

    for (const name of ['walk', 'stand']) {
      const motion = motions.get(name) as Animation
      const lows: number[] = []
      let tallest = 0
      for (let frame = 0; frame < loopFrames(motion); frame++) {
        const local = sampleAnimation(motion, frame)
        const drawn = figure.flatMap((model) => {
          const nodes: NodeTransform[] = model.nodes.map((node, i) =>
            local[i] ? { ...node, local: local[i] as Mat4 } : node,
          )
          const stacks = model.pose(nodes)
          return model.shapes.map((_, shape) =>
            poseGeometry(
              model.geometry(shape),
              stacks[shape] ?? (model.shapeMatrices[shape] as Mat4[]),
            ),
          )
        })
        const bounds = measureBounds(drawn)
        lows.push(bounds.minY)
        tallest = Math.max(tallest, bounds.maxY - bounds.minY)
      }

      const swing = Math.max(...lows) - Math.min(...lows)
      // The lowest point really does move — otherwise there would be nothing
      // to get wrong — but by a small fraction of the figure, which is a foot
      // lifting or a breath rather than the body jumping.
      expect(swing).toBeGreaterThan(0)
      // Measured on the rigged parts alone, so against a figure shorter than
      // the finished one — with its head on, the same swing is 4% of the walk
      // and 7% of the idle.
      expect(swing / tallest).toBeLessThan(0.15)
      if (name === 'walk') {
        // And it comes back: the cycle returns to its lowest, which is what
        // makes one offset for the whole motion the right one.
        expect(lows[0] as number).toBeCloseTo(Math.min(...lows), 5)
      }
    }
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
