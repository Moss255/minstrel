import { compressLz10, compressRawRle } from '@vesper/nitro-comp'
import { crc32OfName } from '../src/crc32.ts'

/**
 * Builds valid GPC2 archives in memory.
 *
 * Fixtures may not contain cartridge bytes, so every structure the parser is
 * tested against is constructed here from a plain description, implementing the
 * layout independently of the reader.
 *
 * The stored, LZ77 and run-length codecs are produced. Huffman is not: the
 * package has no Huffman *encoder*, and inventing one to test the decoder would
 * be testing two guesses against each other. The Huffman path's evidence is the
 * integration test against a real cartridge.
 */

export interface GpcFixtureMember {
  name: string
  data: Uint8Array
  /** Codec to store this member with. Defaults to LZ77. */
  codec?: 'stored' | 'lz77' | 'rle'
}

export interface GpcFixtureOptions {
  /** Override the version field. */
  version?: number
  /** Write a deliberately wrong entry-word count. */
  entryWords?: number
}

export function fill(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length)
  let x = (seed | 0) + 1
  for (let i = 0; i < length; i++) {
    x = (Math.imul(x, 1103515245) + 12345) | 0
    out[i] = (x >>> 16) & 0xff
  }
  return out
}

/** Compressible bytes, so the LZ77 path is genuinely exercised. */
export function repeating(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length)
  for (let i = 0; i < length; i++) out[i] = (i % (3 + (seed % 5))) + seed
  return out
}

const align4 = (n: number) => (n + 3) & ~3

/** Build a region: u32 prefix of (size << 3 | method), then the payload. */
function buildRegion(payload: Uint8Array, codec: 'stored' | 'lz77' | 'rle'): Uint8Array {
  // compressLz10 emits the 4-byte BIOS header; GPC2 regions carry the payload
  // bare, so drop it.
  const body =
    codec === 'stored'
      ? payload
      : codec === 'rle'
        ? compressRawRle(payload)
        : compressLz10(payload).subarray(4)
  const method = codec === 'stored' ? 0 : codec === 'rle' ? 4 : 1
  const region = new Uint8Array(4 + body.length)
  new DataView(region.buffer).setUint32(0, ((payload.length << 3) | method) >>> 0, true)
  region.set(body, 4)
  return region
}

export function buildGpc(members: GpcFixtureMember[], options: GpcFixtureOptions = {}): Uint8Array {
  const count = members.length

  // --- name table: NUL-separated, in the order given ---
  const nameOffsets = new Map<string, number>()
  const nameBytes: number[] = []
  for (const m of members) {
    nameOffsets.set(m.name, nameBytes.length)
    for (let i = 0; i < m.name.length; i++) nameBytes.push(m.name.charCodeAt(i) & 0xff)
    nameBytes.push(0)
  }
  while (nameBytes.length % 4 !== 0) nameBytes.push(0)
  const nameRegion = buildRegion(Uint8Array.from(nameBytes), 'lz77')

  const headerSize = 0x18
  const entryTableSize = count * 12
  const nameTableOffset = headerSize + entryTableSize
  const dataOffset = align4(nameTableOffset + nameRegion.length)

  // --- member regions, laid out in the order given ---
  const regions: { member: GpcFixtureMember; at: number; bytes: Uint8Array }[] = []
  let cursor = dataOffset
  for (const m of members) {
    const bytes = buildRegion(m.data, m.codec ?? 'lz77')
    regions.push({ member: m, at: cursor, bytes })
    cursor = align4(cursor + bytes.length)
  }
  const total = cursor

  // --- entry table, sorted ascending by hash as real archives are ---
  const entries = regions
    .map(({ member, at, bytes }) => ({
      hash: crc32OfName(member.name),
      nameOffset: nameOffsets.get(member.name) as number,
      words: (at - dataOffset) / 4,
      storedLength: bytes.length,
    }))
    .sort((a, b) => a.hash - b.hash)

  const archive = new Uint8Array(total)
  const view = new DataView(archive.buffer)

  archive.set([0x47, 0x50, 0x43, 0x32], 0) // 'GPC2'
  archive[4] = count & 0xff
  archive[5] = (count >>> 8) & 0x0f
  view.setUint16(0x06, options.version ?? 5, true)
  view.setUint16(0x08, nameTableOffset / 4, true)
  view.setUint16(0x0a, dataOffset / 4, true)
  view.setUint16(0x0c, options.entryWords ?? 3 * count, true)
  view.setUint16(0x0e, 0, true)
  view.setUint32(0x10, 0, true)
  view.setUint32(0x14, 0, true)

  entries.forEach((e, i) => {
    const at = headerSize + i * 12
    view.setUint32(at + 0, e.hash >>> 0, true)
    view.setUint32(at + 4, (((e.nameOffset & 0xff) << 24) | (e.words & 0xffffff)) >>> 0, true)
    view.setUint32(
      at + 8,
      ((((e.nameOffset >>> 8) & 0xff) << 24) | (e.storedLength & 0xffffff)) >>> 0,
      true,
    )
  })

  archive.set(nameRegion, nameTableOffset)
  for (const r of regions) archive.set(r.bytes, r.at)

  return archive
}
