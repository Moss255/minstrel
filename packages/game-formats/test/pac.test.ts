import { describe, expect, it } from 'vitest'
import { GameFormatError } from '../src/errors.ts'
import { isPac, readPac } from '../src/pac.ts'

/**
 * A pack built from FORMAT.md, not from a cartridge: each entry a 0x50-byte
 * head — the name, then at +0x40 the head's size, the data's, and the step to
 * the next entry — then the data, padded to sixteen; then an end marker.
 */
function pack(
  members: { name: string; data: number[] }[],
  end: 'zero' | 'ff' = 'zero',
): Uint8Array {
  const out: number[] = []
  for (const { name, data } of members) {
    const head = new Array<number>(0x50).fill(0)
    for (let i = 0; i < name.length; i++) head[i] = name.charCodeAt(i)
    head[name.length + 1] = 0x5c // left over after the NUL, as on the cartridge
    const step = (0x50 + data.length + 15) & ~15
    const put = (at: number, v: number) => {
      for (let i = 0; i < 4; i++) head[at + i] = (v >>> (i * 8)) & 0xff
    }
    put(0x40, 0x50)
    put(0x44, data.length)
    put(0x48, step)
    out.push(...head, ...data, ...new Array<number>(step - 0x50 - data.length).fill(0))
  }
  const marker = new Array<number>(0x50).fill(0)
  if (end === 'ff') {
    marker[0x40] = 0x50
    for (let i = 0x44; i < 0x4c; i++) marker[i] = 0xff
  }
  return Uint8Array.from([...out, ...marker])
}

describe('a pack', () => {
  it('reads its members by name, to the end marker', () => {
    const bytes = pack([
      { name: 'a.NCER', data: [1, 2, 3] },
      { name: 'a.NCGR', data: new Array<number>(20).fill(7) },
    ])
    const read = readPac(bytes)
    expect(isPac(bytes)).toBe(true)
    expect(read.members.map((m) => m.name)).toEqual(['a.NCER', 'a.NCGR'])
    expect([...(read.members[0]?.data ?? [])]).toEqual([1, 2, 3])
    expect(read.members[1]?.data.length).toBe(20)
    expect(read.end).toBe(bytes.length)
  })

  it('also ends on a marker whose size and next are all ones', () => {
    const bytes = pack([{ name: 'x.bcfg', data: [9] }], 'ff')
    expect(readPac(bytes).members).toHaveLength(1)
    expect(readPac(bytes).end).toBe(bytes.length)
  })

  it('refuses one without an end, one whose data runs past it, and a head not 0x50', () => {
    const bytes = pack([{ name: 'a', data: [1, 2, 3] }])
    expect(() => readPac(bytes.subarray(0, bytes.length - 0x50))).toThrow(/before its end marker/)
    const long = bytes.slice()
    long[0x44] = 0xff
    expect(() => readPac(long)).toThrow(GameFormatError)
    const odd = bytes.slice()
    odd[0x40] = 0x60
    expect(isPac(odd)).toBe(false)
    expect(() => readPac(odd)).toThrow(/not 0x50/)
  })
})
