import { ascii, asciiLossy, checkRange, u8, u16, u32 } from './bytes.ts'
import { crc16, NINTENDO_LOGO_CRC } from './crc16.ts'
import { NitroFsError } from './errors.ts'

/** Size of the documented portion of the cartridge header. */
export const HEADER_SIZE = 0x200

/** A region of the cartridge addressed as `offset` + `size`. */
export interface RomRegion {
  readonly offset: number
  readonly size: number
}

/** One of the two ARM binaries described by the header. */
export interface ArmBinary {
  readonly romOffset: number
  readonly entryAddress: number
  readonly ramAddress: number
  readonly size: number
}

/**
 * Fields of the DS cartridge header.
 *
 * Field names, offsets and meanings are from GBATEK, "DS Cartridge Header"
 * (https://problemkaputt.de/gbatek.htm#dscartridgeheader). Reserved and
 * DSi-only regions are not surfaced; nothing here is inferred.
 */
export interface RomHeader {
  /** 12-byte internal title, NUL-padded ASCII. */
  readonly title: string
  /** 4-character game code, e.g. the trailing letter encodes the region. */
  readonly gameCode: string
  /** 2-character maker code. `'01'` is Nintendo. */
  readonly makerCode: string
  /** 0x00 = NDS, 0x02 = NDS+DSi, 0x03 = DSi-only. */
  readonly unitCode: number
  readonly encryptionSeedSelect: number
  /** Raw device capacity exponent; see {@link RomHeader.chipSize}. */
  readonly deviceCapacity: number
  /** Cartridge chip size in bytes: `128 KiB << deviceCapacity`. */
  readonly chipSize: number
  /** 0x00 = normal, 0x80 = China, 0x40 = Korea. */
  readonly region: number
  readonly romVersion: number
  readonly autostart: number

  readonly arm9: ArmBinary
  readonly arm7: ArmBinary

  /** File Name Table. */
  readonly fnt: RomRegion
  /** File Allocation Table; 8 bytes per file. */
  readonly fat: RomRegion
  /** ARM9 overlay table; 32 bytes per overlay. */
  readonly arm9OverlayTable: RomRegion
  /** ARM7 overlay table; 32 bytes per overlay. Usually empty. */
  readonly arm7OverlayTable: RomRegion

  /** Offset of the icon/title banner, or 0 if absent. */
  readonly bannerOffset: number
  /** Total used ROM size in bytes; the tail is usually 0xFF padding. */
  readonly usedRomSize: number
  /** Header size, normally 0x4000 — the start of the ARM9 binary. */
  readonly headerSize: number

  readonly secureAreaChecksum: number
  readonly logoChecksum: number
  readonly headerChecksum: number
}

/** Result of checking the header's two CRC-16 fields against the bytes. */
export interface HeaderIntegrity {
  readonly logoOk: boolean
  readonly headerOk: boolean
  readonly computedLogoChecksum: number
  readonly computedHeaderChecksum: number
}

function region(data: Uint8Array, offsetAt: number, sizeAt: number, what: string): RomRegion {
  return { offset: u32(data, offsetAt, `${what}.offset`), size: u32(data, sizeAt, `${what}.size`) }
}

function armBinary(data: Uint8Array, base: number, what: string): ArmBinary {
  return {
    romOffset: u32(data, base + 0x0, `${what}.romOffset`),
    entryAddress: u32(data, base + 0x4, `${what}.entryAddress`),
    ramAddress: u32(data, base + 0x8, `${what}.ramAddress`),
    size: u32(data, base + 0xc, `${what}.size`),
  }
}

/**
 * Parse the cartridge header.
 *
 * Throws if the image is shorter than the header, or if the header's declared
 * FNT/FAT regions fall outside the image — the two conditions that would
 * otherwise turn into confusing failures much deeper in the filesystem walk.
 * The checksums are *not* enforced; call {@link checkHeaderIntegrity} if you
 * want them, since a legitimately trimmed or patched ROM can still be useful.
 */
export function parseRomHeader(rom: Uint8Array): RomHeader {
  checkRange(rom, 0, HEADER_SIZE, 'rom header')

  const header: RomHeader = {
    title: asciiLossy(rom, 0x000, 12),
    gameCode: ascii(rom, 0x00c, 4, 'header.gameCode'),
    makerCode: ascii(rom, 0x010, 2, 'header.makerCode'),
    unitCode: u8(rom, 0x012, 'header.unitCode'),
    encryptionSeedSelect: u8(rom, 0x013, 'header.encryptionSeedSelect'),
    deviceCapacity: u8(rom, 0x014, 'header.deviceCapacity'),
    chipSize: 128 * 1024 * 2 ** u8(rom, 0x014, 'header.deviceCapacity'),
    region: u8(rom, 0x01d, 'header.region'),
    romVersion: u8(rom, 0x01e, 'header.romVersion'),
    autostart: u8(rom, 0x01f, 'header.autostart'),

    arm9: armBinary(rom, 0x020, 'arm9'),
    arm7: armBinary(rom, 0x030, 'arm7'),

    fnt: region(rom, 0x040, 0x044, 'fnt'),
    fat: region(rom, 0x048, 0x04c, 'fat'),
    arm9OverlayTable: region(rom, 0x050, 0x054, 'arm9OverlayTable'),
    arm7OverlayTable: region(rom, 0x058, 0x05c, 'arm7OverlayTable'),

    bannerOffset: u32(rom, 0x068, 'header.bannerOffset'),
    usedRomSize: u32(rom, 0x080, 'header.usedRomSize'),
    headerSize: u32(rom, 0x084, 'header.headerSize'),

    secureAreaChecksum: u16(rom, 0x06c, 'header.secureAreaChecksum'),
    logoChecksum: u16(rom, 0x15c, 'header.logoChecksum'),
    headerChecksum: u16(rom, 0x15e, 'header.headerChecksum'),
  }

  if (header.fnt.size === 0) {
    throw new NitroFsError('header declares an empty File Name Table; image has no NitroFS', 0x044)
  }
  checkRange(rom, header.fnt.offset, header.fnt.size, 'header.fnt region')
  checkRange(rom, header.fat.offset, header.fat.size, 'header.fat region')

  return header
}

/** Recompute the header's two CRC-16 fields and compare them with the stored values. */
export function checkHeaderIntegrity(rom: Uint8Array): HeaderIntegrity {
  checkRange(rom, 0, HEADER_SIZE, 'rom header')
  const computedLogoChecksum = crc16(rom.subarray(0x0c0, 0x15c))
  const computedHeaderChecksum = crc16(rom.subarray(0x000, 0x15e))
  return {
    logoOk: computedLogoChecksum === NINTENDO_LOGO_CRC,
    headerOk: computedHeaderChecksum === u16(rom, 0x15e),
    computedLogoChecksum,
    computedHeaderChecksum,
  }
}

/**
 * Region letter of a 4-character game code. This is a property of the Nintendo
 * game-code scheme, not of any particular title.
 */
export function gameCodeRegion(gameCode: string): string {
  return gameCode.length === 4 ? (gameCode[3] as string) : ''
}
