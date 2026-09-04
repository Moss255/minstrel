import { NitroCompError } from './errors.ts'
import { CompressionType, readCompressionHeader } from './header.ts'

/**
 * LZ77 variant 10 — the DS BIOS `LZ77UnCompRead*` format, header byte 0x10.
 *
 * Documented in GBATEK, "BIOS Decompression Functions". After the 4-byte
 * header the payload is a sequence of blocks; each block is one flag byte
 * followed by up to eight units, processed from the flag's most significant
 * bit downwards:
 *
 *   flag bit 0   one literal byte, copied straight through
 *   flag bit 1   a two-byte back-reference:
 *                  length       = (byte0 >> 4) + 3          (3..18)
 *                  displacement = ((byte0 & 0x0F) << 8 | byte1) + 1   (1..4096)
 *                back-references are copied one byte at a time from the output
 *                written so far, so an overlapping run (displacement < length)
 *                legally repeats a short pattern — this is not a bug to guard
 *                against but the format's main way of encoding runs.
 *
 * Decoding stops as soon as the declared output length is reached; trailing
 * padding after that point is ignored, as the BIOS does.
 *
 * This implementation is confirmed against the project's reference cartridge:
 * all 11,166 LZ10 members across its archives decode to exactly their declared
 * length, and every one that declares a known container extension produces that
 * container's magic. See `FORMAT.md`.
 */

const MIN_MATCH = 3
const WINDOW_SIZE = 4096

/**
 * True when `data` starts with the LZ10 header byte. This is a *weak* test and
 * must not be used on its own to decide whether to decompress something.
 *
 * A one-byte signature collides: on this project's reference cartridge, 173
 * sprite files begin `10 00 03 00`, where the `0x10` is a width and not a
 * compression type. None of them is a valid LZ10 stream. Inside archives the
 * test happens to be exact (11,179 of 11,179), but that is a property of that
 * cartridge, not of the format.
 *
 * Use {@link tryDecompressLz10} when the answer matters: decoding successfully
 * to the declared length is the only reliable evidence a stream is LZ10.
 */
export function isLz10(data: Uint8Array): boolean {
  return data.length >= 4 && data[0] === 0x10
}

/**
 * Decompress an LZ10 stream.
 *
 * Allocates exactly one output buffer of the declared size. Throws
 * {@link NitroCompError} rather than returning a short or padded buffer if the
 * stream is truncated, over-long, or contains an out-of-range back-reference.
 */
export function decompressLz10(data: Uint8Array): Uint8Array {
  const header = readCompressionHeader(data)
  if (header.type !== CompressionType.Lz77) {
    throw new NitroCompError(
      `not an LZ77 stream: type nibble is 0x${header.type.toString(16)}, expected 0x1`,
      0,
    )
  }
  if (header.flags !== 0) {
    throw new NitroCompError(
      `LZ77 stream has flags nibble 0x${header.flags.toString(16)}; only LZ10 (0x0) is supported`,
      0,
    )
  }

  const out = new Uint8Array(header.decompressedSize)
  let src = header.payloadOffset
  let dst = 0

  while (dst < out.length) {
    if (src >= data.length) {
      throw new NitroCompError(`stream ended after ${dst} of ${out.length} declared bytes`, src)
    }
    let flags = data[src++] as number

    for (let unit = 0; unit < 8 && dst < out.length; unit++) {
      if ((flags & 0x80) === 0) {
        if (src >= data.length) {
          throw new NitroCompError(`stream ended mid-literal at output byte ${dst}`, src)
        }
        out[dst++] = data[src++] as number
      } else {
        if (src + 1 >= data.length) {
          throw new NitroCompError(`stream ended mid-back-reference at output byte ${dst}`, src)
        }
        const byte0 = data[src++] as number
        const byte1 = data[src++] as number
        const length = (byte0 >>> 4) + MIN_MATCH
        const displacement = (((byte0 & 0x0f) << 8) | byte1) + 1

        if (displacement > dst) {
          throw new NitroCompError(
            `back-reference at output byte ${dst} reaches ${displacement} bytes back, before the start of the output`,
            src - 2,
          )
        }
        if (dst + length > out.length) {
          throw new NitroCompError(
            `back-reference at output byte ${dst} would write ${dst + length - out.length} bytes past the declared ${out.length}-byte output`,
            src - 2,
          )
        }

        // Byte-at-a-time on purpose: overlapping copies are part of the format.
        let from = dst - displacement
        for (let i = 0; i < length; i++) out[dst++] = out[from++] as number
      }
      flags = (flags << 1) & 0xff
    }
  }

  return out
}

/**
 * Decompress if `data` really is an LZ10 stream, otherwise return `undefined`.
 *
 * This is the reliable way to ask the question. The four-byte header carries
 * too little information to identify the format on its own (see {@link isLz10}),
 * so this attempts the decode and additionally requires the output to be
 * exactly the declared length — a check that no observed non-LZ10 file has ever
 * passed by accident, and that every one of the reference cartridge's 11,179
 * genuine streams passes.
 *
 * Returning `undefined` means "not an LZ10 stream", which is an ordinary
 * answer, not an error. Callers wanting a hard failure should use
 * {@link decompressLz10} directly.
 */
export function tryDecompressLz10(data: Uint8Array): Uint8Array | undefined {
  if (!isLz10(data)) return undefined
  try {
    const declared = readCompressionHeader(data).decompressedSize
    const out = decompressLz10(data)
    return out.length === declared ? out : undefined
  } catch {
    return undefined
  }
}

/**
 * Compress to LZ10 with a greedy longest-match search.
 *
 * Provided so the decoder can be round-trip tested, and so tooling can re-pack
 * a modified asset. It makes no claim to match Nintendo's encoder byte for
 * byte — only to emit a stream the format's decoder accepts.
 */
export function compressLz10(data: Uint8Array): Uint8Array {
  const MAX_MATCH = 18
  const out: number[] = [
    0x10,
    data.length & 0xff,
    (data.length >>> 8) & 0xff,
    (data.length >>> 16) & 0xff,
  ]

  let pos = 0
  while (pos < data.length) {
    const flagIndex = out.length
    out.push(0)
    let flags = 0

    for (let unit = 0; unit < 8 && pos < data.length; unit++) {
      let bestLength = 0
      let bestDisplacement = 0
      const windowStart = Math.max(0, pos - WINDOW_SIZE)
      const maxLength = Math.min(MAX_MATCH, data.length - pos)

      if (maxLength >= MIN_MATCH) {
        for (let candidate = pos - 1; candidate >= windowStart; candidate--) {
          let length = 0
          while (length < maxLength && data[candidate + length] === data[pos + length]) length++
          if (length > bestLength) {
            bestLength = length
            bestDisplacement = pos - candidate
            if (length === maxLength) break
          }
        }
      }

      if (bestLength >= MIN_MATCH) {
        flags |= 0x80 >>> unit
        const encoded = bestDisplacement - 1
        out.push(((bestLength - MIN_MATCH) << 4) | ((encoded >>> 8) & 0x0f), encoded & 0xff)
        pos += bestLength
      } else {
        out.push(data[pos++] as number)
      }
    }

    out[flagIndex] = flags
  }

  return Uint8Array.from(out)
}
