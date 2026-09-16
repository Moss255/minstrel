import { describe, expect, it } from 'vitest'
import {
  describeIdentity,
  humanSize,
  identifyCartridge,
  REFERENCE,
  sha1Of,
} from '../src/cartridge-id.ts'

/** Bytes with a cartridge header's title and game code where the header keeps them, and nothing else. */
function headed(title: string, gameCode: string, size = 0x200): Uint8Array {
  const bytes = new Uint8Array(size)
  for (let i = 0; i < 12; i++) bytes[i] = title.charCodeAt(i) || 0
  for (let i = 0; i < 4; i++) bytes[0x0c + i] = gameCode.charCodeAt(i)
  bytes[0x10] = 0x30
  bytes[0x11] = 0x31
  return bytes
}

describe('identifying a cartridge', () => {
  it('hashes with SHA-1', async () => {
    expect(await sha1Of(new Uint8Array(0))).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709')
    expect(await sha1Of(new TextEncoder().encode('abc'))).toBe(
      'a9993e364706816aba3e25717850c26c9cd0d89d',
    )
  })

  it('tells the same title from another cartridge, and neither from the reference', async () => {
    const same = await identifyCartridge(headed('SOMETHING', REFERENCE.gameCode))
    expect(same.verdict).toBe('same-title')
    expect(same.gameCode).toBe(REFERENCE.gameCode)
    expect(same.title).toBe('SOMETHING')
    const other = await identifyCartridge(headed('OTHER', 'ZZZZ'))
    expect(other.verdict).toBe('other')
    expect(describeIdentity(other)).toContain('not the title')
    const nothing = await identifyCartridge(new Uint8Array(16))
    expect(nothing.verdict).toBe('other')
    expect(nothing.title).toBe('')
  })

  it('says sizes as a person would', () => {
    expect(humanSize(REFERENCE.size)).toBe('256 MiB')
    expect(humanSize(2048)).toBe('2 KiB')
    expect(humanSize(12)).toBe('12 bytes')
  })
})
