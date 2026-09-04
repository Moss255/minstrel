import { NitroCompError } from './errors.ts'

/**
 * The 4-byte header shared by every Nintendo compression format, as decoded by
 * the DS BIOS decompression calls.
 *
 * Documented in GBATEK, "BIOS Decompression Functions"
 * (https://problemkaputt.de/gbatek.htm#biosdecompressionfunctions):
 *
 *   byte 0      bits 4-7  compression type
 *               bits 0-3  reserved / format-specific
 *   bytes 1-3   uncompressed size, 24-bit little-endian
 *
 * The payload begins at offset 4.
 *
 * Some third-party tools define an extension in which a zero 24-bit size means
 * "a 32-bit size follows at offset 4", so that streams above 16 MiB can be
 * expressed. That extension is deliberately NOT implemented here: it is not in
 * the reference above, this project's cartridge contains no stream that uses it
 * (0 of 11,166), and honouring it would misread a legitimately empty stream,
 * whose size field is a perfectly ordinary zero. A zero is read as a zero.
 */

/** Compression types the DS BIOS defines. */
export const CompressionType = {
  None: 0x0,
  Lz77: 0x1,
  Huffman: 0x2,
  RunLength: 0x3,
  Diff: 0x8,
} as const

export type CompressionTypeValue = (typeof CompressionType)[keyof typeof CompressionType]

export interface CompressionHeader {
  /** High nibble of byte 0. */
  readonly type: number
  /** Low nibble of byte 0; format-specific. For LZ77 it selects LZ10 vs LZ11. */
  readonly flags: number
  /** Decompressed length in bytes. */
  readonly decompressedSize: number
  /** Offset of the first payload byte. Always 4. */
  readonly payloadOffset: number
}

/**
 * Read the compression header.
 *
 * Throws if the input is too short. Does *not* judge whether the type is one
 * this package can decode — callers that only want to sniff should use
 * {@link looksCompressed}, which is deliberately conservative.
 */
export function readCompressionHeader(data: Uint8Array): CompressionHeader {
  if (data.length < 4) {
    throw new NitroCompError(`stream is ${data.length} bytes, too short for a 4-byte header`)
  }
  const byte0 = data[0] as number
  const decompressedSize =
    ((data[1] as number) | ((data[2] as number) << 8) | ((data[3] as number) << 16)) >>> 0

  return {
    type: byte0 >>> 4,
    flags: byte0 & 0x0f,
    decompressedSize,
    payloadOffset: 4,
  }
}

/**
 * Conservative check for "this looks like a compressed stream".
 *
 * A four-byte header is only four bytes, so any test is a heuristic; this one
 * requires a known type nibble *and* a plausible non-zero size, and callers
 * should still be prepared for {@link decompress} to throw. It exists so that
 * bulk tooling can skip obviously-uncompressed files, not to prove anything.
 */
export function looksCompressed(data: Uint8Array): boolean {
  if (data.length < 8) return false
  const type = (data[0] as number) >>> 4
  if (
    type !== CompressionType.Lz77 &&
    type !== CompressionType.Huffman &&
    type !== CompressionType.RunLength
  ) {
    return false
  }
  // A zero size is a valid empty stream, but it carries no evidence either
  // way, so this heuristic declines to call it compressed.
  const size =
    ((data[1] as number) | ((data[2] as number) << 8) | ((data[3] as number) << 16)) >>> 0
  return size > 0
}
