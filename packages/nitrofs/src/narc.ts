import { asBytes, ascii, checkRange, u16, u32 } from './bytes.ts'
import { NitroFsError } from './errors.ts'
import { type FatEntry, type NitroDir, type NitroFile, normalisePath, parseFnt } from './fnt.ts'
import { parseFat } from './fs.ts'

/**
 * NARC — the Nitro archive, a whole NitroFS packed into a single file.
 *
 * Layout, as observed in retail cartridges and documented on the Nintendo DS
 * file formats wiki ("NARC") and in GBATEK under "NitroROM and NitroARC File
 * Systems":
 *
 *   0x00  char[4]  'NARC'
 *   0x04  u16      byte-order mark, 0xFFFE for little-endian
 *   0x06  u16      version, 0x0100
 *   0x08  u32      total file size
 *   0x0C  u16      header size, 0x10
 *   0x0E  u16      chunk count, 3
 *   0x10           the three chunks, each `char[4]` stamp + u32 size:
 *                    'BTAF'  u16 fileCount, u16 reserved, then the FAT
 *                    'BTNF'  an FNT, byte-identical in layout to the
 *                            cartridge's own; padded to a 4-byte boundary
 *                    'GMIF'  the file image the FAT's offsets are relative to
 *
 * Confirmed against this project's reference cartridge: the stamps appear on
 * disk in the order and spelling above (some references transcribe them
 * reversed as 'FATB'/'FNTB'/'FIMG'; that spelling was not observed here, so
 * both are accepted and the observed one is preferred).
 *
 * Many NARCs carry a names-free FNT — a single root directory with an empty
 * sub-table. Those archives are addressed purely by index, so
 * {@link NarcArchive.files} is empty while {@link NarcArchive.fat} is not.
 */

export const NARC_MAGIC = 'NARC'
const NARC_HEADER_SIZE = 0x10
const LITTLE_ENDIAN_BOM = 0xfffe

export interface NarcArchive {
  /** Archive-relative FAT. Offsets are absolute within the source buffer. */
  readonly fat: readonly FatEntry[]
  /** Named files, empty when the archive's FNT carries no names. */
  readonly files: readonly NitroFile[]
  readonly dirs: readonly NitroDir[]
  readonly root: NitroDir
  /** True when the FNT named at least one file. */
  readonly hasNames: boolean
  /** Number of entries in the FAT, named or not. */
  readonly length: number

  file(path: string): NitroFile | undefined
  dir(path: string): NitroDir | undefined
  /** Zero-copy view of one member, by path, by index, or by entry. */
  read(target: string | number | NitroFile | FatEntry): Uint8Array
  /** Every member as a view, in FAT order. */
  entries(): { index: number; name: string | undefined; data: Uint8Array }[]
}

/** Cheap check for the NARC stamp; does not validate the rest of the file. */
export function isNarc(source: Uint8Array | ArrayBuffer | DataView): boolean {
  const data = asBytes(source)
  if (data.length < 4) return false
  return data[0] === 0x4e && data[1] === 0x41 && data[2] === 0x52 && data[3] === 0x43 /* NARC */
}

interface Chunk {
  readonly stamp: string
  readonly offset: number
  readonly size: number
}

function readChunks(data: Uint8Array, start: number, count: number): Chunk[] {
  const chunks: Chunk[] = []
  let cursor = start
  for (let i = 0; i < count; i++) {
    checkRange(data, cursor, 8, `narc.chunk[${i}] header`)
    const stamp = ascii(data, cursor, 4, `narc.chunk[${i}].stamp`)
    const size = u32(data, cursor + 4, `narc.chunk[${i}].size`)
    if (size < 8) {
      throw new NitroFsError(`narc chunk '${stamp}' declares a ${size}-byte size`, cursor + 4)
    }
    checkRange(data, cursor, size, `narc.chunk['${stamp}']`)
    chunks.push({ stamp, offset: cursor, size })
    cursor += size
  }
  return chunks
}

function findChunk(chunks: Chunk[], ...stamps: string[]): Chunk {
  for (const stamp of stamps) {
    const found = chunks.find((c) => c.stamp === stamp)
    if (found) return found
  }
  throw new NitroFsError(
    `narc is missing its ${stamps[0]} chunk (found ${chunks.map((c) => `'${c.stamp}'`).join(', ') || 'none'})`,
  )
}

/**
 * Parse a NARC archive.
 *
 * Returns views into `source`; nothing is copied. Throws {@link NitroFsError}
 * for any structure that does not validate rather than returning partial data.
 */
export function readNarc(source: Uint8Array | ArrayBuffer | DataView): NarcArchive {
  const data = asBytes(source)

  checkRange(data, 0, NARC_HEADER_SIZE, 'narc header')
  const magic = ascii(data, 0, 4, 'narc.magic')
  if (magic !== NARC_MAGIC) {
    throw new NitroFsError(`not a NARC: magic is '${magic}', expected '${NARC_MAGIC}'`, 0)
  }
  const bom = u16(data, 0x04, 'narc.bom')
  if (bom !== LITTLE_ENDIAN_BOM) {
    throw new NitroFsError(
      `narc byte-order mark is 0x${bom.toString(16)}, expected 0x${LITTLE_ENDIAN_BOM.toString(16)}`,
      0x04,
    )
  }
  const declaredSize = u32(data, 0x08, 'narc.fileSize')
  if (declaredSize > data.length) {
    throw new NitroFsError(
      `narc declares ${declaredSize} bytes but only ${data.length} are present`,
      0x08,
    )
  }
  const headerSize = u16(data, 0x0c, 'narc.headerSize')
  if (headerSize < NARC_HEADER_SIZE) {
    throw new NitroFsError(`narc header size ${headerSize} is too small`, 0x0c)
  }
  const chunkCount = u16(data, 0x0e, 'narc.chunkCount')
  if (chunkCount === 0) {
    throw new NitroFsError('narc declares zero chunks', 0x0e)
  }

  // Trust the declared size over the buffer length: a NARC embedded in a larger
  // buffer would otherwise let a corrupt chunk read past its own end.
  const image = data.subarray(0, declaredSize)
  const chunks = readChunks(image, headerSize, chunkCount)

  const btaf = findChunk(chunks, 'BTAF', 'FATB')
  const btnf = findChunk(chunks, 'BTNF', 'FNTB')
  const gmif = findChunk(chunks, 'GMIF', 'FIMG')

  const fileCount = u16(image, btaf.offset + 8, 'narc.btaf.fileCount')
  const fatSize = fileCount * 8
  if (btaf.offset + 12 + fatSize > btaf.offset + btaf.size) {
    throw new NitroFsError(
      `narc BTAF declares ${fileCount} files, needing ${fatSize} bytes, but the chunk holds ${btaf.size - 12}`,
      btaf.offset + 8,
    )
  }

  // BTAF offsets are relative to the start of GMIF's payload.
  const dataStart = gmif.offset + 8
  const dataSize = gmif.size - 8
  const relative = parseFat(image, btaf.offset + 12, fatSize, dataSize, 'narc.btaf')
  const fat: FatEntry[] = relative.map((entry) => ({
    start: dataStart + entry.start,
    end: dataStart + entry.end,
  }))

  const { root, files, dirs } = parseFnt(
    image.subarray(btnf.offset + 8, btnf.offset + btnf.size),
    fat,
    btnf.offset + 8,
  )

  const filesByPath = new Map(files.map((f) => [f.path, f]))
  const dirsByPath = new Map(dirs.map((d) => [d.path, d]))
  const namesByIndex = new Map(files.map((f) => [f.id, f.name]))

  const file = (path: string) => filesByPath.get(normalisePath(path))
  const dir = (path: string) => dirsByPath.get(normalisePath(path))

  const read = (target: string | number | NitroFile | FatEntry): Uint8Array => {
    if (typeof target === 'string') {
      const found = file(target)
      if (!found) throw new NitroFsError(`no such member in NARC: '${normalisePath(target)}'`)
      return image.subarray(found.start, found.end)
    }
    if (typeof target === 'number') {
      const range = fat[target]
      if (!range) {
        throw new NitroFsError(`member index ${target} is outside the ${fat.length}-entry archive`)
      }
      return image.subarray(range.start, range.end)
    }
    return image.subarray(target.start, target.end)
  }

  return {
    fat,
    files,
    dirs,
    root,
    hasNames: files.length > 0,
    length: fat.length,
    file,
    dir,
    read,
    entries: () =>
      fat.map((entry, index) => ({
        index,
        name: namesByIndex.get(index),
        data: image.subarray(entry.start, entry.end),
      })),
  }
}
