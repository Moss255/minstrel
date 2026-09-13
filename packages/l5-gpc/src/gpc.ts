import { decompressHuffman, decompressRawLz77, decompressRawRle } from '@minstrel/nitro-comp'
import { crc32OfName } from './crc32.ts'
import { GpcError } from './errors.ts'

/**
 * GPC2 — a Level-5 archive container.
 *
 * Not a Nintendo format and not documented publicly. Everything below was
 * established by observation against a retail cartridge; see `FORMAT.md` for
 * the evidence behind each field and for what is still unknown. Fields whose
 * meaning has not been established are named `unknown_*` and carried through
 * rather than skipped.
 *
 * Layout:
 *
 *   0x00  char[4]  'GPC2'
 *   0x04  u12      member count, little-endian across byte 4 and the low
 *                  nibble of byte 5
 *   0x05  u4       unknown, high nibble of byte 5
 *   0x06  u16      version; always 5 on the reference cartridge
 *   0x08  u16      name-table offset, in 4-byte words
 *   0x0A  u16      data-region offset, in 4-byte words
 *   0x0C  u16      entry-table size in 4-byte words; always 3 * count
 *   0x0E  u16      unknown_0x0e
 *   0x10  u32      unknown_0x10
 *   0x14  u32      unknown_0x14
 *   0x18  ..       entry table, 12 bytes per member, sorted ascending by hash
 *
 * Entry:
 *
 *   +0  u32  CRC-32 of the member's filename
 *   +4  u32  low 24 bits: data offset in 4-byte words, from the data region
 *            high 8 bits: low byte of the name's offset in the name table
 *   +8  u32  low 24 bits: stored region length, including its 4-byte prefix
 *            high 8 bits: high byte of the name's offset
 *
 * The entry table is stored plainly when it exactly fills the space before the
 * name table, and Huffman compressed otherwise — with either 4-bit or 8-bit
 * symbols, and nothing in the header to say which. See {@link readEntryTable}.
 *
 * The name table and each member are "regions": a `u32` prefix whose low three
 * bits select a codec and whose upper 29 bits give the decompressed size,
 * followed by the payload. The name table decodes to NUL-separated names.
 *
 * **Bit 28 of `0x10` says the members are stored whole**, with no region
 * prefix: their bytes are their content. INFERRED — it is set on exactly the
 * three archives on the reference cartridge whose members' first words do not
 * read as prefixes, and on none of the rest. See `FORMAT.md`.
 */

export const GPC_MAGIC = 'GPC2'
export const HEADER_SIZE = 0x18
export const ENTRY_SIZE = 12

/** Codecs seen in a region prefix's low three bits. */
export const GpcMethod = {
  Stored: 0,
  Lz77: 1,
  Huffman4: 2,
  Huffman8: 3,
  RunLength: 4,
  /** No region prefix: the member is stored whole. Not a prefix's value — see {@link GpcHeader.storedWhole}. */
  Whole: -1,
} as const

/** Bit 28 of the header's `0x10`: the members are stored whole. */
const STORED_WHOLE = 0x10000000

export interface GpcHeader {
  readonly count: number
  readonly version: number
  /** Byte offset of the name table. */
  readonly nameTableOffset: number
  /** Byte offset of the data region. */
  readonly dataOffset: number
  /** High nibble of byte 5. Meaning not established. */
  readonly unknown_0x05: number
  readonly unknown_0x0e: number
  /** The whole word at `0x10`: bit 28 is {@link GpcHeader.storedWhole}; the rest is not established. */
  readonly unknown_0x10: number
  readonly unknown_0x14: number
  /**
   * Whether the members are stored whole, with no region prefix — bit 28 of
   * `0x10`. INFERRED; see `FORMAT.md`.
   */
  readonly storedWhole: boolean
}

export interface GpcMember {
  readonly name: string
  /** CRC-32 of {@link GpcMember.name}, as stored in the index. */
  readonly hash: number
  /** Byte offset of the member's region within the archive. */
  readonly offset: number
  /** Stored length of the region, including its 4-byte prefix. */
  readonly storedLength: number
  /** Decompressed length, from the region prefix; a whole member's own length. */
  readonly size: number
  /** Codec from the region prefix's low three bits; {@link GpcMethod.Whole} for a member stored whole. */
  readonly method: number
  /** False when the codec is one this package cannot decode. */
  readonly readable: boolean
}

export interface GpcArchive {
  readonly header: GpcHeader
  readonly members: readonly GpcMember[]
  /** Look up a member by exact name. */
  member(name: string): GpcMember | undefined
  /**
   * Decode a member. Throws {@link GpcError} if the member does not exist or
   * uses a codec this package does not implement.
   */
  read(target: string | number | GpcMember): Uint8Array
  /**
   * The member's stored bytes, verbatim and undecoded, including the four that
   * are its region prefix when it has one.
   *
   * Useful for a member whose `readable` is false — a codec this package does
   * not decode — which it hands to a caller that can, rather than discarding
   * it. See `FORMAT.md`.
   */
  readRaw(target: string | number | GpcMember): Uint8Array
}

/**
 * Read the entry table, whose encoding the format does not record.
 *
 * It is stored plainly when it exactly fills the space between the header and
 * the name table. Otherwise it is compressed — observed as LZ77, 4-bit Huffman
 * and 8-bit Huffman across the reference cartridge — and **nothing in the
 * header says which**. Small archives tend to use 4-bit Huffman and large ones
 * 8-bit, but that is a tendency, not a rule, and byte counts alone do not
 * separate them reliably: a correct decode may leave a few bytes of alignment
 * padding unread.
 *
 * So the decoded table is checked rather than the decoder guessed at. A valid
 * index has two properties that a wrong decode does not reproduce: the hashes
 * are in strictly ascending order, because the table is a binary-search index,
 * and every entry's data offset lands inside the archive. The first candidate
 * satisfying both is accepted.
 *
 * This is corroborated independently once parsing continues: every member's
 * filename, recovered from a separately-compressed name table, must match the
 * CRC-32 stored in the entry the offset came from.
 */
function readEntryTable(data: Uint8Array, header: GpcHeader, count: number): Uint8Array {
  const area = header.nameTableOffset - HEADER_SIZE
  const size = count * ENTRY_SIZE
  if (area === size) return data.subarray(HEADER_SIZE, header.nameTableOffset)

  /** A decoded table is an index only if it reads as one. */
  const isPlausibleIndex = (table: Uint8Array): boolean => {
    let previous = -1
    for (let i = 0; i < count; i++) {
      const at = i * ENTRY_SIZE
      const hash = u32(table, at)
      if (hash <= previous) return false
      previous = hash
      const offset = header.dataOffset + (u32(table, at + 4) & 0x00ffffff) * 4
      if (offset + 4 > data.length) return false
    }
    return true
  }

  const candidates: [string, () => Uint8Array][] = [
    ['lz77', () => decompressRawLz77(data, size, HEADER_SIZE).data],
    ['huffman-4', () => decompressHuffman(data, size, 4, HEADER_SIZE).data],
    ['huffman-8', () => decompressHuffman(data, size, 8, HEADER_SIZE).data],
    ['run-length', () => decompressRawRle(data, size, HEADER_SIZE).data],
  ]

  const tried: string[] = []
  for (const [name, decode] of candidates) {
    try {
      const table = decode()
      if (isPlausibleIndex(table)) return table
      tried.push(`${name}: decoded but not a valid index`)
    } catch (error) {
      tried.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  throw new GpcError(
    `entry table of ${size} bytes could not be decoded from its ${area}-byte area (${tried.join('; ')})`,
    HEADER_SIZE,
  )
}

function u16(d: Uint8Array, at: number): number {
  if (at + 2 > d.length) throw new GpcError('read past end of archive', at)
  return (d[at] as number) | ((d[at + 1] as number) << 8)
}

function u32(d: Uint8Array, at: number): number {
  if (at + 4 > d.length) throw new GpcError('read past end of archive', at)
  return (
    ((d[at] as number) |
      ((d[at + 1] as number) << 8) |
      ((d[at + 2] as number) << 16) |
      ((d[at + 3] as number) << 24)) >>>
    0
  )
}

/** Cheap check for the GPC2 stamp; does not validate the body. */
export function isGpc(data: Uint8Array): boolean {
  return (
    data.length >= 4 && data[0] === 0x47 && data[1] === 0x50 && data[2] === 0x43 && data[3] === 0x32
  )
}

interface Region {
  readonly method: number
  readonly size: number
  readonly readable: boolean
  decode(): Uint8Array
}

function readRegion(data: Uint8Array, at: number): Region {
  const prefix = u32(data, at)
  const method = prefix & 7
  const size = prefix >>> 3
  const payload = at + 4

  switch (method) {
    case GpcMethod.Stored:
      if (payload + size > data.length) {
        throw new GpcError(`stored region of ${size} bytes runs past the archive`, at)
      }
      return {
        method,
        size,
        readable: true,
        decode: () => data.subarray(payload, payload + size),
      }
    case GpcMethod.Lz77:
      return {
        method,
        size,
        readable: true,
        decode: () => decompressRawLz77(data, size, payload).data,
      }
    case GpcMethod.Huffman4:
      return {
        method,
        size,
        readable: true,
        decode: () => decompressHuffman(data, size, 4, payload).data,
      }
    case GpcMethod.Huffman8:
      return {
        method,
        size,
        readable: true,
        decode: () => decompressHuffman(data, size, 8, payload).data,
      }
    case GpcMethod.RunLength:
      return {
        method,
        size,
        readable: true,
        decode: () => decompressRawRle(data, size, payload).data,
      }
    default:
      return {
        method,
        size,
        readable: false,
        decode: () => {
          throw new GpcError(
            `region uses codec ${method}, which is not identified; see FORMAT.md`,
            at,
          )
        },
      }
  }
}

/** Split a decoded name table into its NUL-separated names, by byte offset. */
function splitNames(table: Uint8Array): Map<number, string> {
  const names = new Map<number, string>()
  let start = 0
  for (let i = 0; i < table.length; i++) {
    if (table[i] !== 0) continue
    if (i > start) {
      let name = ''
      for (let j = start; j < i; j++) name += String.fromCharCode(table[j] as number)
      names.set(start, name)
    }
    start = i + 1
  }
  return names
}

/**
 * Parse a GPC2 archive.
 *
 * Member payloads are decoded on demand by {@link GpcArchive.read}; parsing
 * only decodes the index and the name table.
 */
export function readGpc(data: Uint8Array): GpcArchive {
  if (!isGpc(data)) {
    const stamp = Array.from(data.subarray(0, 4), (c) =>
      c >= 0x20 && c <= 0x7e ? String.fromCharCode(c) : '.',
    ).join('')
    throw new GpcError(`not a GPC2 archive: stamp is '${stamp}'`, 0)
  }
  if (data.length < HEADER_SIZE) {
    throw new GpcError(`archive is ${data.length} bytes, shorter than its header`)
  }

  const count = (data[4] as number) | (((data[5] as number) & 0x0f) << 8)
  const unknown_0x10 = u32(data, 0x10)
  const header: GpcHeader = {
    count,
    version: u16(data, 0x06),
    nameTableOffset: u16(data, 0x08) * 4,
    dataOffset: u16(data, 0x0a) * 4,
    unknown_0x05: (data[5] as number) >>> 4,
    unknown_0x0e: u16(data, 0x0e),
    unknown_0x10,
    unknown_0x14: u32(data, 0x14),
    storedWhole: (unknown_0x10 & STORED_WHOLE) !== 0,
  }

  const entryWords = u16(data, 0x0c)
  if (entryWords !== 3 * count) {
    throw new GpcError(
      `header declares ${entryWords} entry words but ${count} members need ${3 * count}`,
      0x0c,
    )
  }
  if (count === 0) {
    return {
      header,
      members: [],
      member: () => undefined,
      read: () => {
        throw new GpcError('archive is empty')
      },
      readRaw: () => {
        throw new GpcError('archive is empty')
      },
    }
  }

  const entryBytes = readEntryTable(data, header, count)

  const names = splitNames(readRegion(data, header.nameTableOffset).decode())

  const members: GpcMember[] = []
  for (let i = 0; i < count; i++) {
    const at = i * ENTRY_SIZE
    const hash = u32(entryBytes, at)
    const packedOffset = u32(entryBytes, at + 4)
    const packedLength = u32(entryBytes, at + 8)

    const nameOffset = (packedOffset >>> 24) | ((packedLength >>> 24) << 8)
    const offset = header.dataOffset + (packedOffset & 0x00ffffff) * 4
    const storedLength = packedLength & 0x00ffffff

    const name = names.get(nameOffset)
    if (name === undefined) {
      throw new GpcError(`entry ${i} names byte ${nameOffset}, which is not a name-table entry`)
    }
    if (crc32OfName(name) !== hash) {
      throw new GpcError(
        `entry ${i} hash 0x${hash.toString(16)} does not match CRC-32 of '${name}'`,
      )
    }
    if (offset + 4 > data.length) {
      throw new GpcError(`member '${name}' starts at ${offset}, past the archive`, offset)
    }

    if (header.storedWhole) {
      if (offset + storedLength > data.length) {
        throw new GpcError(
          `member '${name}' of ${storedLength} bytes runs past the archive`,
          offset,
        )
      }
      members.push({
        name,
        hash,
        offset,
        storedLength,
        size: storedLength,
        method: GpcMethod.Whole,
        readable: true,
      })
      continue
    }

    const region = readRegion(data, offset)
    members.push({
      name,
      hash,
      offset,
      storedLength,
      size: region.size,
      method: region.method,
      readable: region.readable,
    })
  }

  const byName = new Map(members.map((m) => [m.name, m]))

  const read = (target: string | number | GpcMember): Uint8Array => {
    const member = resolve(target)
    return header.storedWhole
      ? data.subarray(member.offset, member.offset + member.storedLength)
      : readRegion(data, member.offset).decode()
  }

  const resolve = (target: string | number | GpcMember): GpcMember => {
    let member: GpcMember | undefined
    if (typeof target === 'string') member = byName.get(target)
    else if (typeof target === 'number') member = members[target]
    else member = target
    if (!member) {
      throw new GpcError(
        typeof target === 'number'
          ? `member index ${target} is outside the ${members.length}-member archive`
          : `no such member: '${String(target)}'`,
      )
    }
    return member
  }

  const readRaw = (target: string | number | GpcMember): Uint8Array => {
    const member = resolve(target)
    return data.subarray(member.offset, member.offset + member.storedLength)
  }

  return { header, members, member: (name) => byName.get(name), read, readRaw }
}
