import { byteString, checkRange, u16, u32 } from './bytes.ts'
import { NitroFsError } from './errors.ts'

/**
 * The Nitro File Name Table walker, shared by the cartridge filesystem and by
 * NARC archives — both use the identical FNT layout, which is why GBATEK
 * documents them under one heading ("DS Cartridge NitroROM and NitroARC File
 * Systems").
 *
 * FNT layout:
 *   - A directory table of 8-byte entries, one per directory, root first:
 *       +0 u32  offset of this directory's sub-table, relative to the FNT
 *       +4 u16  file ID of the first file listed in the sub-table
 *       +6 u16  parent directory ID; for the root, the total directory count
 *   - Sub-tables of variable-length entries terminated by a 0x00 type byte:
 *       0x01..0x7F  file:   that many name bytes follow
 *       0x81..0xFF  subdir: (type & 0x7F) name bytes, then a u16 directory ID
 *
 * Nothing here is inferred; every field is documented in the reference above.
 *
 * Names are treated as opaque bytes. See `byteString` in `bytes.ts` for why.
 */

/** Directory IDs are 0xF000-based; the root is always 0xF000. */
export const ROOT_DIR_ID = 0xf000

/** A `[start, end)` byte range. */
export interface FatEntry {
  readonly start: number
  readonly end: number
}

/** A named file in the FNT. */
export interface NitroFile {
  readonly kind: 'file'
  /** FAT index. Also the ID the game uses to open the file. */
  readonly id: number
  readonly name: string
  /** Absolute path from the root, e.g. `/data/map/foo.bin`. */
  readonly path: string
  readonly start: number
  readonly end: number
  readonly size: number
}

/** A directory in the FNT. */
export interface NitroDir {
  readonly kind: 'dir'
  /** 0xF000-based directory ID. */
  readonly id: number
  readonly name: string
  /** Absolute path from the root, `/` for the root itself. */
  readonly path: string
  /** 0xF000-based ID of the parent; the root reports itself. */
  readonly parentId: number
  readonly dirs: readonly NitroDir[]
  readonly files: readonly NitroFile[]
}

export interface FntTree {
  readonly root: NitroDir
  readonly files: NitroFile[]
  readonly dirs: NitroDir[]
}

interface DirTableEntry {
  readonly subTableOffset: number
  readonly firstFileId: number
  readonly parentIdOrCount: number
}

/**
 * Walk an FNT and build its directory tree.
 *
 * @param fnt   the FNT bytes alone, with no surrounding container
 * @param fat   FAT entries the FNT's file IDs index into
 * @param base  offset of `fnt` within the enclosing image, used only so error
 *              messages name an offset the caller can find in a hex editor
 *
 * This is a single linear pass. Even a 7500-file cartridge walks in well under
 * a millisecond, so it needs no chunking; the expensive part of asset work is
 * decoding file *contents*, which happens elsewhere.
 */
export function parseFnt(fnt: Uint8Array, fat: readonly FatEntry[], base = 0): FntTree {
  const readDirTableEntry = (index: number): DirTableEntry => {
    const at = index * 8
    checkRange(fnt, at, 8, `fnt.dirTable[${index}]`)
    return {
      subTableOffset: u32(fnt, at + 0, `fnt.dirTable[${index}].subTableOffset`),
      firstFileId: u16(fnt, at + 4, `fnt.dirTable[${index}].firstFileId`),
      parentIdOrCount: u16(fnt, at + 6, `fnt.dirTable[${index}].parentIdOrCount`),
    }
  }

  const dirCount = readDirTableEntry(0).parentIdOrCount
  if (dirCount < 1) {
    throw new NitroFsError('FNT root entry declares zero directories', base + 6)
  }
  if (dirCount * 8 > fnt.length) {
    throw new NitroFsError(
      `FNT declares ${dirCount} directories, needing ${dirCount * 8} bytes of directory table, but the FNT is only ${fnt.length} bytes`,
      base + 6,
    )
  }

  const files: NitroFile[] = []
  const dirs: NitroDir[] = new Array(dirCount)
  const visited = new Uint8Array(dirCount)

  const buildDir = (
    index: number,
    name: string,
    parentPath: string,
    parentId: number,
  ): NitroDir => {
    if (index >= dirCount) {
      throw new NitroFsError(
        `FNT references directory index ${index}, beyond the declared ${dirCount}`,
        base,
      )
    }
    if (visited[index]) {
      throw new NitroFsError(
        `FNT directory index ${index} is reachable twice; the tree contains a cycle`,
        base + index * 8,
      )
    }
    visited[index] = 1

    const entry = readDirTableEntry(index)
    const path = index === 0 ? '/' : parentPath === '/' ? `/${name}` : `${parentPath}/${name}`
    const childDirs: NitroDir[] = []
    const childFiles: NitroFile[] = []

    let cursor = entry.subTableOffset
    let nextFileId = entry.firstFileId
    if (cursor >= fnt.length) {
      throw new NitroFsError(
        `FNT directory index ${index} sub-table starts at 0x${cursor.toString(16)}, past the ${fnt.length}-byte FNT`,
        base + index * 8,
      )
    }

    for (;;) {
      const type = fnt[cursor] as number | undefined
      if (type === undefined) {
        throw new NitroFsError(
          `FNT directory index ${index} sub-table runs past the end of the FNT without a terminator`,
          base + cursor,
        )
      }
      cursor += 1
      if (type === 0x00) break
      if (type === 0x80) {
        throw new NitroFsError(
          `FNT directory index ${index} contains a zero-length sub-directory name`,
          base + cursor - 1,
        )
      }

      const nameLength = type & 0x7f
      // Names are bytes, not text: decoded byte-transparently so that non-ASCII
      // names (which real cartridges do contain) survive and still compare
      // exactly. See `byteString`.
      const childName = byteString(fnt, cursor, nameLength, `fnt.dir[${index}].name`)
      cursor += nameLength

      if (type < 0x80) {
        const id = nextFileId++
        const range = fat[id]
        if (range === undefined) {
          throw new NitroFsError(
            `FNT names file ID ${id} ('${childName}') but the FAT has only ${fat.length} entries`,
            base + cursor,
          )
        }
        const file: NitroFile = {
          kind: 'file',
          id,
          name: childName,
          path: path === '/' ? `/${childName}` : `${path}/${childName}`,
          start: range.start,
          end: range.end,
          size: range.end - range.start,
        }
        childFiles.push(file)
        files.push(file)
      } else {
        const rawId = u16(fnt, cursor, `fnt.dir[${index}].subDirId`)
        cursor += 2
        if ((rawId & 0xf000) !== ROOT_DIR_ID) {
          throw new NitroFsError(
            `FNT sub-directory '${childName}' has ID 0x${rawId.toString(16)}, which is not 0xF000-based`,
            base + cursor - 2,
          )
        }
        childDirs.push(buildDir(rawId & 0x0fff, childName, path, ROOT_DIR_ID | index))
      }
    }

    const dir: NitroDir = {
      kind: 'dir',
      id: ROOT_DIR_ID | index,
      name,
      path,
      parentId,
      dirs: childDirs,
      files: childFiles,
    }
    dirs[index] = dir
    return dir
  }

  const root = buildDir(0, '', '/', ROOT_DIR_ID)
  return { root, files, dirs: dirs.filter((d): d is NitroDir => d !== undefined) }
}

/** Normalise a lookup path: forward slashes, one leading slash, no trailing slash. */
export function normalisePath(path: string): string {
  const trimmed = path.replace(/\\/g, '/').replace(/\/+/g, '/')
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeading.length > 1 && withLeading.endsWith('/')
    ? withLeading.slice(0, -1)
    : withLeading
}

/** Depth-first walk yielding every named file under `dir`. */
export function* walkFiles(dir: NitroDir): Generator<NitroFile> {
  yield* dir.files
  for (const child of dir.dirs) yield* walkFiles(child)
}

/** Depth-first walk yielding `dir` and every directory beneath it. */
export function* walkDirs(dir: NitroDir): Generator<NitroDir> {
  yield dir
  for (const child of dir.dirs) yield* walkDirs(child)
}
