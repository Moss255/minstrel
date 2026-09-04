import { describe, expect, it } from 'vitest'
import { toSafeName, toSafePath } from '../src/paths.ts'

describe('toSafeName', () => {
  it('leaves an ordinary name alone', () => {
    for (const name of ['hero.nsbmd', 'B01M05L1.nsbta', 'ev01320.gp2', 'a_b-c.d+e@f']) {
      const result = toSafeName(name)
      expect(result.safe, name).toBe(name)
      expect(result.escaped, name).toBe(false)
      expect(result.originalHex, name).toBeUndefined()
    }
  })

  it('escapes the non-ASCII bytes real cartridges contain', () => {
    // Shift-JIS fullwidth characters, as found on the reference cartridge.
    const name = `ms04_${String.fromCharCode(0x82, 0x94)}anatos.bcfg`
    const result = toSafeName(name)

    expect(result.safe).toBe('ms04_%82%94anatos.bcfg')
    expect(result.escaped).toBe(true)
    expect(result.originalHex).toBe('6d7330345f8294616e61746f732e62636667')
  })

  it('escapes path separators so a name cannot escape its directory', () => {
    expect(toSafeName('a/b').safe).toBe('a%2Fb')
    expect(toSafeName('a\\b').safe).toBe('a%5Cb')
    expect(toSafeName('..').safe).toBe('%2E%2E')
    expect(toSafeName('.').safe).toBe('%2E')
  })

  it('escapes the escape character itself, so the mapping stays reversible', () => {
    // A dot is safe inside a name; only the escape character needs escaping.
    const result = toSafeName('100%.bin')
    expect(result.safe).toBe('100%25.bin')
    expect(result.escaped).toBe(true)
  })

  it('escapes control characters and spaces', () => {
    expect(toSafeName('a b').safe).toBe('a%20b')
    expect(toSafeName(`a${String.fromCharCode(0)}b`).safe).toBe('a%00b')
  })

  it('gives an empty name something to be', () => {
    expect(toSafeName('').safe).toBe('%00')
    expect(toSafeName('').escaped).toBe(true)
  })

  it('round-trips: the recorded hex reproduces the original bytes', () => {
    const name = `s043${String.fromCharCode(0x82, 0x86)}01.nsbmd`
    const hex = toSafeName(name).originalHex as string
    const bytes = (hex.match(/../g) as string[]).map((pair) => Number.parseInt(pair, 16))
    expect(String.fromCharCode(...bytes)).toBe(name)
  })

  it('rejects a string that is not byte-sized', () => {
    expect(() => toSafeName('café中')).toThrow(/not a byte string/)
  })
})

describe('toSafePath', () => {
  it('sanitises each segment and drops the leading slash', () => {
    expect(toSafePath('/data/map/B01M05.amdj')).toBe('data/map/B01M05.amdj')
  })

  it('keeps a traversal attempt inside the output tree', () => {
    expect(toSafePath('/data/../../etc/passwd')).toBe('data/%2E%2E/%2E%2E/etc/passwd')
  })

  it('collapses empty segments', () => {
    expect(toSafePath('//data///map/')).toBe('data/map')
  })
})
