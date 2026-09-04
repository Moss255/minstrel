import { asBytes, u32 } from './bytes.ts'
import { NitroFsError } from './errors.ts'
import { type FatEntry, type NitroDir, type NitroFile, normalisePath, parseFnt } from './fnt.ts'
import { parseRomHeader, type RomHeader } from './header.ts'

/**
 * NitroFS: the DS cartridge filesystem, made of a File Allocation Table (FAT)
 * of `[start, end)` byte ranges and a File Name Table (FNT) of directories that
 * name consecutive runs of those ranges.
 *
 * References:
 *  - GBATEK, "DS Cartridge NitroROM and NitroARC File Systems"
 *    https://problemkaputt.de/gbatek.htm#dscartridgenitroromandnitroarcfilesystems
 *  - Nintendo DS file formats wiki, "NitroFS"
 *
 * Reading a file returns a `subarray` view into the caller's buffer. Nothing is
 * copied, so holding a whole cartridge costs one allocation.
 */

/** Bytes per FAT entry. */
export const FAT_ENTRY_SIZE = 8

/** Bytes per overlay-table entry. */
export const OVERLAY_ENTRY_SIZE = 32

/**
 * One ARM9/ARM7 overlay. Overlays are ordinary FAT files that additionally
 * carry load metadata; they have no FNT names, which is why they are listed
 * separately from {@link NitroFs.files}.
 */
export interface OverlayEntry {
  readonly overlayId: number
  readonly ramAddress: number
  readonly ramSize: number
  readonly bssSize: number
  readonly staticInitStart: number
  readonly staticInitEnd: number
  /** FAT index of the overlay's own data. */
  readonly fileId: number
  /** Low 24 bits of the last word: compressed size, or 0 if not compressed. */
  readonly compressedSize: number
  /** Bit 24: the overlay is compressed. */
  readonly compressed: boolean
  /** Bit 25: the overlay is signed. */
  readonly signed: boolean
}

export interface NitroFs {
  readonly header: RomHeader
  readonly root: NitroDir
  /** Every FAT entry, indexed by file ID. Includes unnamed overlay files. */
  readonly fat: readonly FatEntry[]
  /** Every named file, in FNT order. */
  readonly files: readonly NitroFile[]
  /** Every directory, in FNT order; index 0 is the root. */
  readonly dirs: readonly NitroDir[]
  readonly arm9Overlays: readonly OverlayEntry[]
  readonly arm7Overlays: readonly OverlayEntry[]

  /** Look up a named file by absolute path. Returns `undefined` if absent. */
  file(path: string): NitroFile | undefined
  /** Look up a directory by absolute path. Returns `undefined` if absent. */
  dir(path: string): NitroDir | undefined
  /**
   * Return a zero-copy view of a file's bytes. Accepts a path, a FAT index, or
   * a {@link NitroFile}. Throws if the target does not exist.
   */
  read(target: string | number | NitroFile | FatEntry): Uint8Array
  /** A view of the ARM9 binary. */
  readArm9(): Uint8Array
  /** A view of the ARM7 binary. */
  readArm7(): Uint8Array
}

/**
 * Parse a FAT: `count` pairs of little-endian u32 `[start, end)` offsets.
 *
 * @param bound upper limit the ranges must lie within
 */
export function parseFat(
  data: Uint8Array,
  offset: number,
  size: number,
  bound: number,
  what = 'fat',
): FatEntry[] {
  if (size % FAT_ENTRY_SIZE !== 0) {
    throw new NitroFsError(`${what} size ${size} is not a multiple of ${FAT_ENTRY_SIZE}`, offset)
  }
  const count = size / FAT_ENTRY_SIZE
  const fat: FatEntry[] = new Array(count)
  for (let i = 0; i < count; i++) {
    const at = offset + i * FAT_ENTRY_SIZE
    const start = u32(data, at, `${what}[${i}].start`)
    const end = u32(data, at + 4, `${what}[${i}].end`)
    if (end < start) {
      throw new NitroFsError(`${what}[${i}] ends (0x${end.toString(16)}) before it starts`, at)
    }
    if (end > bound) {
      throw new NitroFsError(
        `${what}[${i}] ends at 0x${end.toString(16)}, past the ${bound}-byte limit`,
        at,
      )
    }
    fat[i] = { start, end }
  }
  return fat
}

function parseOverlayTable(rom: Uint8Array, offset: number, size: number): OverlayEntry[] {
  if (size === 0) return []
  if (size % OVERLAY_ENTRY_SIZE !== 0) {
    throw new NitroFsError(
      `overlay table size ${size} is not a multiple of ${OVERLAY_ENTRY_SIZE}`,
      offset,
    )
  }
  const count = size / OVERLAY_ENTRY_SIZE
  const overlays: OverlayEntry[] = new Array(count)
  for (let i = 0; i < count; i++) {
    const at = offset + i * OVERLAY_ENTRY_SIZE
    const flags = u32(rom, at + 28, `overlay[${i}].flags`)
    overlays[i] = {
      overlayId: u32(rom, at + 0, `overlay[${i}].overlayId`),
      ramAddress: u32(rom, at + 4, `overlay[${i}].ramAddress`),
      ramSize: u32(rom, at + 8, `overlay[${i}].ramSize`),
      bssSize: u32(rom, at + 12, `overlay[${i}].bssSize`),
      staticInitStart: u32(rom, at + 16, `overlay[${i}].staticInitStart`),
      staticInitEnd: u32(rom, at + 20, `overlay[${i}].staticInitEnd`),
      fileId: u32(rom, at + 24, `overlay[${i}].fileId`),
      compressedSize: flags & 0x00ffffff,
      compressed: (flags & 0x01000000) !== 0,
      signed: (flags & 0x02000000) !== 0,
    }
  }
  return overlays
}

/**
 * Parse a DS cartridge image and return its filesystem.
 *
 * The returned object holds views into `source`; keep the buffer alive for as
 * long as you use it, and do not mutate it.
 */
export function readNitroFs(source: Uint8Array | ArrayBuffer | DataView): NitroFs {
  const rom = asBytes(source)
  const header = parseRomHeader(rom)

  const fat = parseFat(rom, header.fat.offset, header.fat.size, rom.length)
  const { root, files, dirs } = parseFnt(
    rom.subarray(header.fnt.offset, header.fnt.offset + header.fnt.size),
    fat,
    header.fnt.offset,
  )
  const arm9Overlays = parseOverlayTable(
    rom,
    header.arm9OverlayTable.offset,
    header.arm9OverlayTable.size,
  )
  const arm7Overlays = parseOverlayTable(
    rom,
    header.arm7OverlayTable.offset,
    header.arm7OverlayTable.size,
  )

  const filesByPath = new Map(files.map((f) => [f.path, f]))
  const dirsByPath = new Map(dirs.map((d) => [d.path, d]))

  const file = (path: string) => filesByPath.get(normalisePath(path))
  const dir = (path: string) => dirsByPath.get(normalisePath(path))

  const read = (target: string | number | NitroFile | FatEntry): Uint8Array => {
    if (typeof target === 'string') {
      const found = file(target)
      if (!found) throw new NitroFsError(`no such file in NitroFS: '${normalisePath(target)}'`)
      return rom.subarray(found.start, found.end)
    }
    if (typeof target === 'number') {
      const range = fat[target]
      if (!range) {
        throw new NitroFsError(`file ID ${target} is outside the ${fat.length}-entry FAT`)
      }
      return rom.subarray(range.start, range.end)
    }
    return rom.subarray(target.start, target.end)
  }

  return {
    header,
    root,
    fat,
    files,
    dirs,
    arm9Overlays,
    arm7Overlays,
    file,
    dir,
    read,
    readArm9: () => rom.subarray(header.arm9.romOffset, header.arm9.romOffset + header.arm9.size),
    readArm7: () => rom.subarray(header.arm7.romOffset, header.arm7.romOffset + header.arm7.size),
  }
}
