import { NitroCompError } from './errors.ts'
import { CompressionType, readCompressionHeader } from './header.ts'
import { decompressLz10, tryDecompressLz10 } from './lz10.ts'

export { NitroCompError } from './errors.ts'
export {
  type CompressionHeader,
  CompressionType,
  type CompressionTypeValue,
  looksCompressed,
  readCompressionHeader,
} from './header.ts'
export { compressLz10, decompressLz10, isLz10, tryDecompressLz10 } from './lz10.ts'
export {
  compressRawRle,
  decompressHuffman,
  decompressRawLz77,
  decompressRawRle,
  type RawResult,
} from './raw.ts'

/**
 * Decompress any supported Nintendo-compressed stream, dispatching on the
 * header's type nibble.
 *
 * Only LZ10 is implemented. That is not an oversight: it is the only codec
 * present in this project's reference cartridge (11,166 members; the Huffman
 * and run-length variants appear zero times). The others are left unwritten
 * rather than written from memory and shipped untested — add them when a
 * cartridge that uses them turns up, with samples to verify against.
 */
export function decompress(data: Uint8Array): Uint8Array {
  const header = readCompressionHeader(data)
  switch (header.type) {
    case CompressionType.Lz77:
      return decompressLz10(data)
    default:
      throw new NitroCompError(
        `compression type 0x${header.type.toString(16)} is not implemented`,
        0,
      )
  }
}

/**
 * Decompress if the data really is a supported compressed stream, otherwise
 * return it unchanged.
 *
 * Identification is by successful decode, not by signature — see
 * {@link tryDecompressLz10} for why a four-byte header is not enough. The
 * returned buffer is the input itself when nothing was done.
 */
export function decompressIfNeeded(data: Uint8Array): Uint8Array {
  return tryDecompressLz10(data) ?? data
}
