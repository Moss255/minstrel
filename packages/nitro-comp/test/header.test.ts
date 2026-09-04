import { describe, expect, it } from 'vitest'
import { NitroCompError } from '../src/errors.ts'
import { CompressionType, looksCompressed, readCompressionHeader } from '../src/header.ts'

describe('readCompressionHeader', () => {
  it('splits the type and flags nibbles', () => {
    const header = readCompressionHeader(Uint8Array.from([0x11, 0x34, 0x12, 0x00]))
    expect(header.type).toBe(CompressionType.Lz77)
    expect(header.flags).toBe(1)
    expect(header.decompressedSize).toBe(0x1234)
    expect(header.payloadOffset).toBe(4)
  })

  it('reads a 24-bit size at its maximum', () => {
    const header = readCompressionHeader(Uint8Array.from([0x10, 0xff, 0xff, 0xff]))
    expect(header.decompressedSize).toBe(0xffffff)
  })

  it('reads a zero size as zero rather than as a size extension', () => {
    const header = readCompressionHeader(Uint8Array.from([0x10, 0, 0, 0, 0x00, 0x00, 0x00, 0x01]))
    expect(header.decompressedSize).toBe(0)
    expect(header.payloadOffset).toBe(4)
  })

  it('throws on a stream too short for a header', () => {
    expect(() => readCompressionHeader(Uint8Array.from([0x10, 0, 0]))).toThrow(NitroCompError)
  })

  it('accepts a bare 4-byte header', () => {
    expect(readCompressionHeader(Uint8Array.from([0x10, 0, 0, 0])).decompressedSize).toBe(0)
  })
})

describe('looksCompressed', () => {
  it('accepts the codecs the BIOS defines', () => {
    expect(looksCompressed(Uint8Array.from([0x10, 0x10, 0, 0, 0, 0, 0, 0]))).toBe(true)
    expect(looksCompressed(Uint8Array.from([0x30, 0x10, 0, 0, 0, 0, 0, 0]))).toBe(true)
  })

  it('rejects an unknown type nibble', () => {
    expect(looksCompressed(Uint8Array.from([0x70, 0x10, 0, 0, 0, 0, 0, 0]))).toBe(false)
  })

  it('declines to call a zero-size stream compressed: it carries no evidence', () => {
    expect(looksCompressed(Uint8Array.from([0x10, 0, 0, 0, 0, 0, 0, 0]))).toBe(false)
  })

  it('rejects anything too short to judge', () => {
    expect(looksCompressed(Uint8Array.from([0x10, 1, 0, 0]))).toBe(false)
  })
})
