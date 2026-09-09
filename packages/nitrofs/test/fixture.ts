import { crc16 } from '../src/crc16.ts'

/**
 * Builds minimal but *valid* DS cartridge images in memory.
 *
 * Test fixtures in this repo may never contain cartridge-derived bytes, so
 * every structure the parsers are tested against is constructed here from a
 * plain description. The builder implements the same published layout the
 * parser reads (GBATEK, "DS Cartridge Header" and "NitroROM"), independently
 * enough that a mistake in one is unlikely to be mirrored in the other.
 */

export interface FixtureFile {
  name: string
  data: Uint8Array
}

export interface FixtureDir {
  name: string
  dirs?: FixtureDir[]
  files?: FixtureFile[]
}

export interface FixtureOverlay {
  ramAddress?: number
  ramSize?: number
  data: Uint8Array
}

export interface FixtureOptions {
  title?: string
  gameCode?: string
  makerCode?: string
  arm9?: Uint8Array
  arm7?: Uint8Array
  overlays?: FixtureOverlay[]
  /** Emit a header whose CRC-16 fields are deliberately wrong. */
  corruptChecksums?: boolean
}

export function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values)
}

/** Deterministic filler so file contents are distinguishable in assertions. */
export function fill(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length)
  let x = (seed | 0) + 1
  for (let i = 0; i < length; i++) {
    x = (Math.imul(x, 1103515245) + 12345) | 0
    out[i] = (x >>> 16) & 0xff
  }
  return out
}

interface FlatDir {
  index: number
  parentIndex: number
  node: FixtureDir
  firstFileId: number
}

const HEADER_SIZE = 0x200
const ROM_START = 0x4000
const ALIGN = 0x200

function align(value: number): number {
  return (value + (ALIGN - 1)) & ~(ALIGN - 1)
}

function encodeName(name: string): Uint8Array {
  const out = new Uint8Array(name.length)
  for (let i = 0; i < name.length; i++) out[i] = name.charCodeAt(i) & 0x7f
  return out
}

/**
 * Flatten the tree into directory-table order: root first, then children
 * breadth-first, matching how retail images are laid out.
 */
function flatten(root: FixtureDir): FlatDir[] {
  const flat: FlatDir[] = [{ index: 0, parentIndex: 0, node: root, firstFileId: 0 }]
  for (let i = 0; i < flat.length; i++) {
    const current = flat[i] as FlatDir
    for (const child of current.node.dirs ?? []) {
      flat.push({ index: flat.length, parentIndex: current.index, node: child, firstFileId: 0 })
    }
  }
  return flat
}

export function buildRom(root: FixtureDir, options: FixtureOptions = {}): Uint8Array {
  const overlays = options.overlays ?? []
  const arm9 = options.arm9 ?? fill(0x40, 9)
  const arm7 = options.arm7 ?? fill(0x40, 7)

  const flat = flatten(root)

  // File IDs: overlays occupy the leading FAT entries, then each directory's
  // files take a consecutive run in directory-table order.
  let nextFileId = overlays.length
  const allFiles: FixtureFile[] = []
  for (const dir of flat) {
    dir.firstFileId = nextFileId
    for (const file of dir.node.files ?? []) {
      allFiles.push(file)
      nextFileId++
    }
  }
  const fatCount = nextFileId

  // --- FNT ---
  const dirTableSize = flat.length * 8
  const subTables: Uint8Array[] = []
  for (const dir of flat) {
    const parts: number[] = []
    for (const file of dir.node.files ?? []) {
      const encoded = encodeName(file.name)
      parts.push(encoded.length, ...encoded)
    }
    for (const child of dir.node.dirs ?? []) {
      const childIndex = flat.findIndex((d) => d.node === child)
      const encoded = encodeName(child.name)
      const id = 0xf000 | childIndex
      parts.push(0x80 | encoded.length, ...encoded, id & 0xff, (id >>> 8) & 0xff)
    }
    parts.push(0x00)
    subTables.push(Uint8Array.from(parts))
  }

  const fntSize = dirTableSize + subTables.reduce((n, t) => n + t.length, 0)
  const fnt = new Uint8Array(fntSize)
  const fntView = new DataView(fnt.buffer)
  let subCursor = dirTableSize
  for (const dir of flat) {
    const at = dir.index * 8
    fntView.setUint32(at + 0, subCursor, true)
    fntView.setUint16(at + 4, dir.firstFileId, true)
    fntView.setUint16(at + 6, dir.index === 0 ? flat.length : 0xf000 | dir.parentIndex, true)
    const table = subTables[dir.index] as Uint8Array
    fnt.set(table, subCursor)
    subCursor += table.length
  }

  // --- Layout ---
  let cursor = ROM_START
  const arm9Offset = cursor
  cursor = align(cursor + arm9.length)
  const arm7Offset = cursor
  cursor = align(cursor + arm7.length)
  const overlayTableOffset = cursor
  const overlayTableSize = overlays.length * 32
  cursor = align(cursor + overlayTableSize)
  const fntOffset = cursor
  cursor = align(cursor + fntSize)
  const fatOffset = cursor
  const fatSize = fatCount * 8
  cursor = align(cursor + fatSize)

  const fat = new Uint8Array(fatSize)
  const fatView = new DataView(fat.buffer)
  const payloads: { offset: number; data: Uint8Array }[] = []
  let id = 0
  for (const overlay of overlays) {
    fatView.setUint32(id * 8 + 0, cursor, true)
    fatView.setUint32(id * 8 + 4, cursor + overlay.data.length, true)
    payloads.push({ offset: cursor, data: overlay.data })
    cursor = align(cursor + overlay.data.length)
    id++
  }
  for (const file of allFiles) {
    fatView.setUint32(id * 8 + 0, cursor, true)
    fatView.setUint32(id * 8 + 4, cursor + file.data.length, true)
    payloads.push({ offset: cursor, data: file.data })
    cursor = align(cursor + file.data.length)
    id++
  }

  const overlayTable = new Uint8Array(overlayTableSize)
  const overlayView = new DataView(overlayTable.buffer)
  overlays.forEach((overlay, i) => {
    const at = i * 32
    overlayView.setUint32(at + 0, i, true)
    overlayView.setUint32(at + 4, overlay.ramAddress ?? 0x02000000 + i * 0x1000, true)
    overlayView.setUint32(at + 8, overlay.ramSize ?? overlay.data.length, true)
    overlayView.setUint32(at + 12, 0, true)
    overlayView.setUint32(at + 16, 0, true)
    overlayView.setUint32(at + 20, 0, true)
    overlayView.setUint32(at + 24, i, true)
    overlayView.setUint32(at + 28, 0, true)
  })

  // --- Assemble ---
  const rom = new Uint8Array(cursor)
  rom.fill(0xff, ROM_START)
  const view = new DataView(rom.buffer)
  const ascii = (offset: number, text: string, length: number) => {
    for (let i = 0; i < length; i++) rom[offset + i] = i < text.length ? text.charCodeAt(i) : 0
  }

  ascii(0x000, options.title ?? 'MINSTRELFIXT', 12)
  ascii(0x00c, options.gameCode ?? 'ZZZP', 4)
  ascii(0x010, options.makerCode ?? '01', 2)
  rom[0x012] = 0x00
  rom[0x013] = 0x00
  rom[0x014] = 0x09
  rom[0x01d] = 0x00
  rom[0x01e] = 0x00
  rom[0x01f] = 0x00
  view.setUint32(0x020, arm9Offset, true)
  view.setUint32(0x024, 0x02000800, true)
  view.setUint32(0x028, 0x02000000, true)
  view.setUint32(0x02c, arm9.length, true)
  view.setUint32(0x030, arm7Offset, true)
  view.setUint32(0x034, 0x02380000, true)
  view.setUint32(0x038, 0x02380000, true)
  view.setUint32(0x03c, arm7.length, true)
  view.setUint32(0x040, fntOffset, true)
  view.setUint32(0x044, fntSize, true)
  view.setUint32(0x048, fatOffset, true)
  view.setUint32(0x04c, fatSize, true)
  view.setUint32(0x050, overlayTableSize === 0 ? 0 : overlayTableOffset, true)
  view.setUint32(0x054, overlayTableSize, true)
  view.setUint32(0x058, 0, true)
  view.setUint32(0x05c, 0, true)
  view.setUint32(0x068, 0, true)
  view.setUint32(0x080, cursor, true)
  view.setUint32(0x084, ROM_START, true)

  rom.set(arm9, arm9Offset)
  rom.set(arm7, arm7Offset)
  if (overlayTableSize > 0) rom.set(overlayTable, overlayTableOffset)
  rom.set(fnt, fntOffset)
  rom.set(fat, fatOffset)
  for (const payload of payloads) rom.set(payload.data, payload.offset)

  // The real logo bytes are Nintendo's; a fixture only needs a region whose
  // CRC we state truthfully, so the logo checksum here is computed, not forged.
  view.setUint16(0x15c, crc16(rom.subarray(0x0c0, 0x15c)), true)
  view.setUint16(0x15e, crc16(rom.subarray(0x000, 0x15e)), true)
  if (options.corruptChecksums) {
    view.setUint16(0x15e, 0xdead, true)
  }

  if (rom.length < HEADER_SIZE) throw new Error('fixture shorter than a header')
  return rom
}

// --- NARC ---------------------------------------------------------------

export interface NarcFixtureOptions {
  /** Emit an FNT with no names, as many retail archives do. */
  nameless?: boolean
  /** Override the byte-order mark, to exercise the endianness check. */
  bom?: number
  /** Write chunk stamps in the reversed spelling some references use. */
  reversedStamps?: boolean
}

/** Build a valid NARC archive containing the given members, in order. */
export function buildNarc(members: FixtureFile[], options: NarcFixtureOptions = {}): Uint8Array {
  const pad4 = (n: number) => (n + 3) & ~3

  // BTAF: u16 count, u16 reserved, then [start, end) per member.
  const btafBody = new Uint8Array(4 + members.length * 8)
  const btafView = new DataView(btafBody.buffer)
  btafView.setUint16(0, members.length, true)
  btafView.setUint16(2, 0, true)

  // BTNF: one root directory. With names, its sub-table lists every member.
  const nameParts: number[] = []
  if (!options.nameless) {
    for (const member of members) {
      const encoded = encodeName(member.name)
      nameParts.push(encoded.length, ...encoded)
    }
  }
  nameParts.push(0x00)
  const btnfBody = new Uint8Array(pad4(8 + nameParts.length))
  btnfBody.fill(0xff, 8 + nameParts.length)
  const btnfView = new DataView(btnfBody.buffer)
  btnfView.setUint32(0, 8, true) // sub-table offset, relative to the FNT
  btnfView.setUint16(4, 0, true) // first file ID
  btnfView.setUint16(6, 1, true) // root: total directory count
  btnfBody.set(Uint8Array.from(nameParts), 8)

  // GMIF: member payloads, each 4-byte aligned.
  let imageSize = 0
  const placed: { offset: number; data: Uint8Array }[] = []
  members.forEach((member, i) => {
    btafView.setUint32(4 + i * 8 + 0, imageSize, true)
    btafView.setUint32(4 + i * 8 + 4, imageSize + member.data.length, true)
    placed.push({ offset: imageSize, data: member.data })
    imageSize = pad4(imageSize + member.data.length)
  })
  const gmifBody = new Uint8Array(imageSize)
  for (const p of placed) gmifBody.set(p.data, p.offset)

  const stamps = options.reversedStamps ? ['FATB', 'FNTB', 'FIMG'] : ['BTAF', 'BTNF', 'GMIF']
  const bodies = [btafBody, btnfBody, gmifBody]

  const total = 0x10 + bodies.reduce((n, b) => n + 8 + b.length, 0)
  const narc = new Uint8Array(total)
  const view = new DataView(narc.buffer)
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) narc[offset + i] = text.charCodeAt(i)
  }

  writeAscii(0x00, 'NARC')
  view.setUint16(0x04, options.bom ?? 0xfffe, true)
  view.setUint16(0x06, 0x0100, true)
  view.setUint32(0x08, total, true)
  view.setUint16(0x0c, 0x10, true)
  view.setUint16(0x0e, bodies.length, true)

  let cursor = 0x10
  bodies.forEach((body, i) => {
    writeAscii(cursor, stamps[i] as string)
    view.setUint32(cursor + 4, 8 + body.length, true)
    narc.set(body, cursor + 8)
    cursor += 8 + body.length
  })

  return narc
}
