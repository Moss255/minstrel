import { describe, expect, it } from 'vitest'
import { NitroCompError } from '../src/errors.ts'
import { compressLz10 } from '../src/lz10.ts'
import {
  compressRawRle,
  decompressBlz,
  decompressHuffman,
  decompressRawLz77,
  decompressRawRle,
  looksBlz,
} from '../src/raw.ts'

function noise(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length)
  let x = (seed | 0) + 1
  for (let i = 0; i < length; i++) {
    x = (Math.imul(x, 1103515245) + 12345) | 0
    out[i] = (x >>> 16) & 0xff
  }
  return out
}

/** Strip the 4-byte BIOS header to get the bare payload a raw stream carries. */
const bare = (data: Uint8Array) => compressLz10(data).subarray(4)

describe('decompressRawLz77', () => {
  const cases: [string, Uint8Array][] = [
    ['empty', new Uint8Array(0)],
    ['one byte', Uint8Array.from([0x42])],
    ['incompressible', noise(3000, 1)],
    ['a long run', new Uint8Array(5000).fill(0x7f)],
    ['a repeating pattern', Uint8Array.from({ length: 4000 }, (_, i) => i % 11)],
    ['window boundary', noise(4096, 2)],
  ]

  for (const [label, original] of cases) {
    it(`round-trips: ${label}`, () => {
      const result = decompressRawLz77(bare(original), original.length)
      expect(Array.from(result.data)).toEqual(Array.from(original))
    })
  }

  it('reports how many bytes it consumed', () => {
    const original = noise(500, 3)
    const payload = bare(original)
    const result = decompressRawLz77(payload, original.length)
    expect(result.bytesRead).toBeLessThanOrEqual(payload.length)
    expect(result.bytesRead).toBeGreaterThan(0)
  })

  it('decodes from an offset inside a larger buffer', () => {
    const original = noise(200, 4)
    const payload = bare(original)
    const framed = new Uint8Array(16 + payload.length)
    framed.set(payload, 16)
    expect(Array.from(decompressRawLz77(framed, original.length, 16).data)).toEqual(
      Array.from(original),
    )
  })

  it('decodes an overlapping back-reference as a repeating run', () => {
    // literal 'a', then length 5 at displacement 1.
    const stream = Uint8Array.from([0b0100_0000, 0x61, 0x20, 0x00])
    expect(new TextDecoder().decode(decompressRawLz77(stream, 6).data)).toBe('aaaaaa')
  })

  it('throws on a truncated stream rather than returning a short buffer', () => {
    expect(() => decompressRawLz77(Uint8Array.from([0x00, 1, 2]), 64)).toThrow(/stream ended/)
  })

  it('throws on a back-reference before the start of the output', () => {
    expect(() => decompressRawLz77(Uint8Array.from([0x80, 0x00, 0x00]), 16)).toThrow(
      /before the start of the output/,
    )
  })

  it('throws on a back-reference that would overrun the output', () => {
    expect(() =>
      decompressRawLz77(Uint8Array.from([0b0010_0000, 0x61, 0x62, 0xf0, 0x00]), 4),
    ).toThrow(/overrun/)
  })

  it('rejects a negative size', () => {
    expect(() => decompressRawLz77(new Uint8Array(4), -1)).toThrow(NitroCompError)
  })
})

describe('decompressHuffman', () => {
  /**
   * A minimal hand-built tree: one root whose children are both leaves, so bit
   * 0 yields 'A' and bit 1 yields 'B'.
   *
   *   [0] tree size = 1, so the bit stream starts at (1 + 1) * 2 = 4
   *   [1] root: offset 0, bit6 and bit7 set -> both children are leaves
   *   [2] leaf for bit 0 = 'A'
   *   [3] leaf for bit 1 = 'B'
   */
  const tree = [0x01, 0xc0, 0x41, 0x42]

  /** Pack bits, most significant first, into 32-bit little-endian words. */
  function bitStream(bits: number[]): number[] {
    const words: number[] = []
    for (let i = 0; i < bits.length; i += 32) {
      let word = 0
      for (let b = 0; b < 32; b++) {
        word = ((word << 1) | (bits[i + b] ?? 0)) >>> 0
      }
      words.push(word & 0xff, (word >>> 8) & 0xff, (word >>> 16) & 0xff, (word >>> 24) & 0xff)
    }
    return words
  }

  it('decodes 8-bit symbols', () => {
    const data = Uint8Array.from([...tree, ...bitStream([0, 1, 1, 0])])
    expect(new TextDecoder().decode(decompressHuffman(data, 4, 8).data)).toBe('ABBA')
  })

  it('decodes 4-bit symbols, low nibble first', () => {
    // Leaves are nibbles: bit 0 -> 0x1, bit 1 -> 0x2. Two symbols make a byte,
    // the first becoming the low nibble.
    const nibbleTree = [0x01, 0xc0, 0x01, 0x02]
    const data = Uint8Array.from([...nibbleTree, ...bitStream([0, 1])])
    expect(Array.from(decompressHuffman(data, 1, 4).data)).toEqual([0x21])
  })

  it('reports how many bytes it consumed', () => {
    const data = Uint8Array.from([...tree, ...bitStream([0, 1])])
    // Tree (4 bytes) plus one 32-bit word.
    expect(decompressHuffman(data, 2, 8).bytesRead).toBe(8)
  })

  it('decodes from an offset inside a larger buffer', () => {
    const payload = [...tree, ...bitStream([1, 0])]
    const framed = new Uint8Array(8 + payload.length)
    framed.set(payload, 8)
    expect(new TextDecoder().decode(decompressHuffman(framed, 2, 8, 8).data)).toBe('BA')
  })

  it('decodes a zero-length output without touching the bit stream', () => {
    expect(decompressHuffman(Uint8Array.from(tree), 0, 8).data).toHaveLength(0)
  })

  it('rejects an unsupported symbol width', () => {
    expect(() => decompressHuffman(Uint8Array.from(tree), 1, 6 as never)).toThrow(/symbol width/)
  })

  it('throws when the bit stream ends early', () => {
    const data = Uint8Array.from([...tree, ...bitStream([0])])
    expect(() => decompressHuffman(data, 100, 8)).toThrow(/bit stream ended/)
  })

  it('throws when the tree runs past the buffer', () => {
    expect(() => decompressHuffman(Uint8Array.from([0xff, 0x00]), 4, 8)).toThrow(/tree of/)
  })

  it('throws when the stream starts past the buffer', () => {
    expect(() => decompressHuffman(new Uint8Array(4), 4, 8, 99)).toThrow(/past the end/)
  })
})

describe('decompressRawRle', () => {
  const cases: [string, Uint8Array][] = [
    ['empty', new Uint8Array(0)],
    ['one byte', Uint8Array.from([0x42])],
    ['two bytes, too short to run', Uint8Array.from([1, 1])],
    ['a minimum-length run', Uint8Array.from([7, 7, 7])],
    ['a maximum-length run', new Uint8Array(130).fill(0xab)],
    ['a run past the maximum', new Uint8Array(400).fill(0xcd)],
    ['pure literals', noise(300, 5)],
    ['a maximum-length literal block', noise(128, 6)],
    [
      'alternating runs and literals',
      Uint8Array.from([...noise(20, 7), ...new Array(50).fill(9), ...noise(20, 8)]),
    ],
    ['trailing run', Uint8Array.from([1, 2, 3, ...new Array(40).fill(0)])],
    ['leading run', Uint8Array.from([...new Array(40).fill(0xff), 1, 2, 3])],
  ]

  for (const [label, original] of cases) {
    it(`round-trips: ${label}`, () => {
      const packed = compressRawRle(original)
      const result = decompressRawRle(packed, original.length)
      expect(Array.from(result.data)).toEqual(Array.from(original))
      expect(result.bytesRead).toBe(packed.length)
    })
  }

  it('decodes the documented unit encoding', () => {
    // 0x00 -> 1 literal; 0x80 -> 3 copies; 0x84 -> 7 copies; 0x02 -> 3 literals
    const stream = Uint8Array.from([0x00, 0x01, 0x80, 0x00, 0x84, 0xff, 0x02, 0x61, 0x62, 0x63])
    expect(Array.from(decompressRawRle(stream, 14).data)).toEqual([
      0x01, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x61, 0x62, 0x63,
    ])
  })

  it('actually compresses a long run', () => {
    expect(compressRawRle(new Uint8Array(1000).fill(3)).length).toBeLessThan(30)
  })

  it('decodes from an offset inside a larger buffer', () => {
    const original = Uint8Array.from([...new Array(20).fill(5), 1, 2])
    const packed = compressRawRle(original)
    const framed = new Uint8Array(9 + packed.length)
    framed.set(packed, 9)
    expect(Array.from(decompressRawRle(framed, original.length, 9).data)).toEqual(
      Array.from(original),
    )
  })

  it('throws on a truncated stream', () => {
    expect(() => decompressRawRle(Uint8Array.from([0x00, 1]), 64)).toThrow(/stream ended/)
  })

  it('throws when the run byte is missing', () => {
    expect(() => decompressRawRle(Uint8Array.from([0x80]), 8)).toThrow(/before the run byte/)
  })

  it('throws when a run would overrun the output', () => {
    expect(() => decompressRawRle(Uint8Array.from([0xff, 0x00]), 4)).toThrow(/would overrun/)
  })

  it('throws when literals run past the end of the stream', () => {
    expect(() => decompressRawRle(Uint8Array.from([0x7f, 1, 2, 3]), 128)).toThrow(/past the end/)
  })

  it('throws when literals would overrun the output', () => {
    expect(() => decompressRawRle(Uint8Array.from([0x05, 1, 2, 3, 4, 5, 6]), 3)).toThrow(
      /would overrun/,
    )
  })
})

describe('decompressBlz', () => {
  /**
   * Encode a BLZ stream carrying only literals.
   *
   * The decoder walks backwards, so the encoding has to be built backwards
   * too: within a group, the flag byte sits *above* its literals in memory,
   * and the literal consumed first sits directly below the flag. Groups run
   * from high address to low in consumption order. Writing that out by hand
   * gets it wrong, so it is generated here by mirroring the decoder.
   */
  function literalBlz(prefix: number[], payload: number[]): Uint8Array {
    const consumed = [...payload].reverse() // the decoder fills output top-down
    const encoded: number[] = []
    for (let i = 0; i < consumed.length; i += 8) {
      const group = consumed.slice(i, i + 8)
      // Memory order within a group: last-consumed literal lowest, flag highest.
      encoded.unshift(...[...group].reverse(), 0x00)
    }

    const headerLength = 8
    const total = prefix.length + encoded.length + headerLength
    const out = new Uint8Array(total)
    out.set(Uint8Array.from(prefix), 0)
    out.set(Uint8Array.from(encoded), prefix.length)

    const view = new DataView(out.buffer)
    view.setUint32(total - 8, ((headerLength << 24) | (total - prefix.length)) >>> 0, true)
    view.setUint32(total - 4, 0, true)
    return out
  }

  it('copies the verbatim prefix through unchanged', () => {
    const prefix = [1, 2, 3, 4, 5, 6, 7, 8]
    const out = decompressBlz(literalBlz(prefix, [0xaa, 0xbb, 0xcc, 0xdd]))
    expect(Array.from(out.subarray(0, 8))).toEqual(prefix)
  })

  it('decodes literals into the tail of the output', () => {
    const payload = [0x11, 0x22, 0x33, 0x44, 0x55]
    const out = decompressBlz(literalBlz([0, 0, 0, 0], payload))
    expect(Array.from(out.subarray(out.length - payload.length))).toEqual(payload)
  })

  it('grows the output by the footer increase length', () => {
    const data = literalBlz([1, 2, 3, 4], [9, 9])
    new DataView(data.buffer).setUint32(data.length - 4, 64, true)
    expect(decompressBlz(data)).toHaveLength(data.length + 64)
  })

  it('rejects a stream too short for a footer', () => {
    expect(() => decompressBlz(new Uint8Array(4))).toThrow(/too short for a BLZ footer/)
  })

  it('rejects an encoded region larger than the stream', () => {
    const data = literalBlz([1, 2, 3, 4], [9, 9])
    new DataView(data.buffer).setUint32(data.length - 8, 0x08ff_ffff >>> 0, true)
    expect(() => decompressBlz(data)).toThrow(/encoded region/)
  })

  it('rejects an oversized header length', () => {
    const data = literalBlz([1, 2, 3, 4], [9, 9])
    new DataView(data.buffer).setUint32(data.length - 8, (0xff << 24) | 4, true)
    expect(() => decompressBlz(data)).toThrow(/header/)
  })
})

describe('looksBlz', () => {
  it('rejects a stream with no plausible footer', () => {
    expect(looksBlz(new Uint8Array(4))).toBe(false)
    expect(looksBlz(new Uint8Array(64))).toBe(false)
  })

  it('accepts a self-consistent footer', () => {
    const data = new Uint8Array(128)
    const view = new DataView(data.buffer)
    view.setUint32(120, (8 << 24) | 64, true)
    view.setUint32(124, 32, true)
    expect(looksBlz(data)).toBe(true)
  })
})
