import { NitroCompError } from './errors.ts'

/**
 * Codecs used *without* the standard 4-byte compression header.
 *
 * The DS BIOS formats normally carry their decompressed size in a header (see
 * `header.ts`). Some containers instead record the size in their own index and
 * store the codec payload bare. The unit encodings below are the same ones
 * GBATEK documents under "BIOS Decompression Functions"; only the framing
 * differs, so the size is supplied by the caller.
 */

export interface RawResult {
  readonly data: Uint8Array
  /** Bytes consumed from `source`, starting at `start`. */
  readonly bytesRead: number
}

/**
 * LZ77 (LZ10 unit encoding) with the size supplied externally.
 *
 * Blocks of one flag byte then up to eight units, most significant bit first:
 * a clear bit is a literal byte; a set bit is a two-byte back-reference with
 * `length = (b0 >> 4) + 3` and `displacement = ((b0 & 0x0F) << 8 | b1) + 1`.
 * Overlapping copies are legal and are the format's way of encoding runs, so
 * the copy must proceed one byte at a time.
 */
export function decompressRawLz77(
  source: Uint8Array,
  decompressedSize: number,
  start = 0,
): RawResult {
  if (!Number.isInteger(decompressedSize) || decompressedSize < 0) {
    throw new NitroCompError(`invalid decompressed size ${decompressedSize}`, start)
  }
  const out = new Uint8Array(decompressedSize)
  let src = start
  let dst = 0

  while (dst < out.length) {
    if (src >= source.length) {
      throw new NitroCompError(`stream ended after ${dst} of ${out.length} bytes`, src)
    }
    let flags = source[src++] as number

    for (let unit = 0; unit < 8 && dst < out.length; unit++) {
      if ((flags & 0x80) === 0) {
        if (src >= source.length) {
          throw new NitroCompError(`stream ended mid-literal at output byte ${dst}`, src)
        }
        out[dst++] = source[src++] as number
      } else {
        if (src + 1 >= source.length) {
          throw new NitroCompError(`stream ended mid-back-reference at output byte ${dst}`, src)
        }
        const b0 = source[src++] as number
        const b1 = source[src++] as number
        const length = (b0 >>> 4) + 3
        const displacement = (((b0 & 0x0f) << 8) | b1) + 1

        if (displacement > dst) {
          throw new NitroCompError(
            `back-reference at output byte ${dst} reaches ${displacement} bytes back, before the start of the output`,
            src - 2,
          )
        }
        if (dst + length > out.length) {
          throw new NitroCompError(
            `back-reference at output byte ${dst} would overrun the ${out.length}-byte output`,
            src - 2,
          )
        }
        let from = dst - displacement
        for (let i = 0; i < length; i++) out[dst++] = out[from++] as number
      }
      flags = (flags << 1) & 0xff
    }
  }

  return { data: out, bytesRead: src - start }
}

/**
 * Huffman with the size supplied externally.
 *
 * Layout, per GBATEK:
 *
 *   +0            u8   tree table size / 2 - 1
 *   +1            ..   tree table, root node first
 *   +(n+1)*2      ..   bit stream, read from 32-bit little-endian words,
 *                      most significant bit first
 *
 * A node's low six bits give the offset to its child pair; bit 6 marks the
 * 1-child as a leaf and bit 7 marks the 0-child as a leaf. The child pair sits
 * at `(currentOffset & ~1) + (offset + 1) * 2`, where offsets are measured from
 * the tree-size byte — the base GBATEK leaves implicit, and the one confirmed
 * by observation here.
 *
 * `symbolBits` is 4 or 8. With 4, two symbols make a byte, low nibble first.
 *
 * **Confirmed by observation.** The DS BIOS header would carry the symbol width
 * in its low nibble, but a bare stream does not, so the caller supplies it. On
 * this project's reference cartridge, 4-bit streams decode the index tables of
 * 793 Level-5 containers such that every entry's CRC-32 matches its filename
 * and the consumed length exactly equals the region size — two independent
 * checks a wrong tree walk would not pass.
 */
export function decompressHuffman(
  source: Uint8Array,
  decompressedSize: number,
  symbolBits: 4 | 8,
  start = 0,
): RawResult {
  if (symbolBits !== 4 && symbolBits !== 8) {
    throw new NitroCompError(`unsupported Huffman symbol width ${symbolBits}; expected 4 or 8`)
  }
  if (start >= source.length) {
    throw new NitroCompError('Huffman stream starts past the end of the buffer', start)
  }

  const treeSizeByte = source[start] as number
  const treeStart = start + 1
  const treeBytes = (treeSizeByte + 1) * 2
  let bitPos = start + treeBytes
  if (bitPos > source.length) {
    throw new NitroCompError(
      `Huffman tree of ${treeBytes} bytes runs past the end of the buffer`,
      start,
    )
  }

  const out = new Uint8Array(decompressedSize)
  let dst = 0
  let word = 0
  let bitsLeft = 0
  let node = treeStart
  let pendingNibble = 0
  let havePendingNibble = false

  while (dst < out.length) {
    if (bitsLeft === 0) {
      if (bitPos + 4 > source.length) {
        throw new NitroCompError(
          `Huffman bit stream ended after ${dst} of ${out.length} bytes`,
          bitPos,
        )
      }
      word =
        ((source[bitPos] as number) |
          ((source[bitPos + 1] as number) << 8) |
          ((source[bitPos + 2] as number) << 16) |
          ((source[bitPos + 3] as number) << 24)) >>>
        0
      bitPos += 4
      bitsLeft = 32
    }

    const bit = (word >>> 31) & 1
    word = (word << 1) >>> 0
    bitsLeft--

    const value = source[node]
    if (value === undefined) {
      throw new NitroCompError('Huffman tree walk left the buffer', node)
    }
    const relative = node - start
    const child = start + ((relative & ~1) + ((value & 0x3f) + 1) * 2 + bit)
    if (child >= source.length) {
      throw new NitroCompError('Huffman child node lies past the end of the buffer', child)
    }

    const isLeaf = bit ? (value & 0x40) !== 0 : (value & 0x80) !== 0
    if (isLeaf) {
      const symbol = source[child] as number
      if (symbolBits === 8) {
        out[dst++] = symbol
      } else if (!havePendingNibble) {
        pendingNibble = symbol & 0x0f
        havePendingNibble = true
      } else {
        out[dst++] = ((symbol & 0x0f) << 4) | pendingNibble
        havePendingNibble = false
      }
      node = treeStart
    } else {
      node = child
    }
  }

  return { data: out, bytesRead: bitPos - start }
}
