import { describe, expect, it } from 'vitest'
import { NitroCompError } from '../src/errors.ts'
import { readCompressionHeader } from '../src/header.ts'
import { compressLz10, decompressLz10, isLz10 } from '../src/lz10.ts'

/** Deterministic pseudo-random bytes: worst case, nothing compresses. */
function noise(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length)
  let x = (seed | 0) + 1
  for (let i = 0; i < length; i++) {
    x = (Math.imul(x, 1103515245) + 12345) | 0
    out[i] = (x >>> 16) & 0xff
  }
  return out
}

/** Hand-assemble an LZ10 stream from explicit blocks. */
function stream(decompressedSize: number, payload: number[]): Uint8Array {
  return Uint8Array.from([
    0x10,
    decompressedSize & 0xff,
    (decompressedSize >>> 8) & 0xff,
    (decompressedSize >>> 16) & 0xff,
    ...payload,
  ])
}

describe('decompressLz10', () => {
  it('decodes a stream of literals', () => {
    // One flag byte of all zeros, then eight literal bytes.
    const data = stream(8, [0x00, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(Array.from(decompressLz10(data))).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('decodes a back-reference', () => {
    // 'abc', then a match of length 3 at displacement 3 -> 'abcabc'.
    const data = stream(6, [0b0001_0000, 0x61, 0x62, 0x63, 0x00, 0x02])
    expect(new TextDecoder().decode(decompressLz10(data))).toBe('abcabc')
  })

  it('decodes an overlapping back-reference as a repeating run', () => {
    // 'a', then length 5 at displacement 1 -> the run 'aaaaaa'.
    // Displacement < length is legal and is how the format encodes runs.
    const data = stream(6, [0b0100_0000, 0x61, 0x20, 0x00])
    expect(new TextDecoder().decode(decompressLz10(data))).toBe('aaaaaa')
  })

  it('stops at the declared length and ignores trailing padding', () => {
    const data = stream(3, [0x00, 1, 2, 3, 4, 5, 6, 7, 8, 0xff, 0xff])
    expect(Array.from(decompressLz10(data))).toEqual([1, 2, 3])
  })

  it('decodes a zero-length stream', () => {
    expect(decompressLz10(stream(0, [])).length).toBe(0)
  })

  it('reads a zero size as an empty stream, not as a size extension', () => {
    // Some tools treat a zero 24-bit size as "a 32-bit size follows". This
    // cartridge contains no such stream, and that reading would corrupt a
    // genuinely empty one, so a zero means zero here.
    const header = readCompressionHeader(Uint8Array.from([0x10, 0, 0, 0, 0xff, 0xff, 0xff, 0xff]))
    expect(header.decompressedSize).toBe(0)
    expect(header.payloadOffset).toBe(4)
  })
})

describe('LZ10 round trip', () => {
  const cases: [string, Uint8Array][] = [
    ['empty', new Uint8Array(0)],
    ['single byte', Uint8Array.from([0x42])],
    ['under one block', Uint8Array.from([1, 2, 3])],
    ['exactly one block', noise(8, 1)],
    ['incompressible noise', noise(5000, 2)],
    ['a long run', new Uint8Array(4096).fill(0xab)],
    ['a repeating pattern', Uint8Array.from({ length: 3000 }, (_, i) => i % 7)],
    ['text with repetition', new TextEncoder().encode('minstrel '.repeat(400))],
    ['window boundary', noise(4096, 3)],
    ['just past the window', noise(4100, 4)],
    ['max match length', new Uint8Array(18 * 40).fill(9)],
  ]

  for (const [label, original] of cases) {
    it(`survives: ${label}`, () => {
      const compressed = compressLz10(original)
      expect(isLz10(compressed)).toBe(true)
      expect(readCompressionHeader(compressed).decompressedSize).toBe(original.length)
      expect(Array.from(decompressLz10(compressed))).toEqual(Array.from(original))
    })
  }

  it('actually compresses compressible input', () => {
    const original = new Uint8Array(8192).fill(0x5a)
    expect(compressLz10(original).length).toBeLessThan(original.length / 4)
  })
})

describe('decompressLz10 on malformed input', () => {
  it('rejects a stream shorter than the header', () => {
    expect(() => decompressLz10(Uint8Array.from([0x10, 0x00]))).toThrow(NitroCompError)
  })

  it('rejects a non-LZ77 type nibble', () => {
    expect(() => decompressLz10(Uint8Array.from([0x30, 4, 0, 0, 0x00, 1, 2, 3, 4]))).toThrow(
      /not an LZ77 stream/,
    )
  })

  it('rejects the LZ11 flags nibble it does not implement', () => {
    expect(() => decompressLz10(Uint8Array.from([0x11, 4, 0, 0, 0x00, 1, 2, 3, 4]))).toThrow(
      /only LZ10/,
    )
  })

  it('rejects a truncated stream rather than returning a short buffer', () => {
    expect(() => decompressLz10(stream(64, [0x00, 1, 2, 3]))).toThrow(/stream ended/)
  })

  it('rejects a stream that ends mid-back-reference', () => {
    expect(() => decompressLz10(stream(64, [0b1000_0000, 0x00]))).toThrow(
      /ended mid-back-reference/,
    )
  })

  it('rejects a back-reference pointing before the start of the output', () => {
    // The very first unit cannot be a match: there is nothing behind it.
    expect(() => decompressLz10(stream(16, [0b1000_0000, 0x00, 0x00]))).toThrow(
      /before the start of the output/,
    )
  })

  it('rejects a back-reference that would overrun the declared output', () => {
    // Two literals, then a length-18 match with only 2 bytes of room left.
    expect(() => decompressLz10(stream(4, [0b0010_0000, 0x61, 0x62, 0xf0, 0x00]))).toThrow(
      /past the declared/,
    )
  })

  it('never returns a buffer of the wrong length', () => {
    const original = noise(1234, 5)
    expect(decompressLz10(compressLz10(original)).length).toBe(original.length)
  })
})

describe('isLz10', () => {
  it('recognises the header byte only', () => {
    expect(isLz10(stream(0, []))).toBe(true)
    expect(isLz10(Uint8Array.from([0x11, 0, 0, 0]))).toBe(false)
    expect(isLz10(Uint8Array.from([0x10]))).toBe(false)
  })
})
