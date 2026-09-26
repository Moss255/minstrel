import type { CharaColours } from '@minstrel/game-formats'
import type { PaletteInfo } from '@minstrel/nitro-gfx'
import { describe, expect, it } from 'vitest'
import { FACE_SLOTS, faceColours } from '../src/skin.ts'

/** Colours numbered by table, row and place, so each copy can be seen to land. */
const table = (base: number, rows: number, each: number) =>
  Array.from({ length: rows }, (_, row) =>
    Array.from({ length: each }, (_, i) => base + row * 16 + i),
  )
const colours: CharaColours = {
  brows: table(0x1000, 10, 2),
  skin2: table(0x2000, 8, 2),
  skin4: table(0x3000, 8, 4),
  skin8: table(0x4000, 8, 8),
  eyes: table(0x5000, 8, 2),
  unknown_0x69: 0,
}
const palette = (dataOffset: number): PaletteInfo => ({
  name: 'p_f006_00_pl',
  index: 0,
  dataOffset,
  dataSize: 32,
})
const read = (bytes: Uint8Array) =>
  Array.from(
    { length: bytes.length / 2 },
    (_, i) => (bytes[i * 2] as number) | ((bytes[i * 2 + 1] as number) << 8),
  )

describe('a face recoloured as the game does it', () => {
  const edit = faceColours(colours, { skin: 3, eyes: 2, hairColour: 5 })
  const out = read(edit(palette(0), new Uint8Array(32)))

  it('writes the brows at slots 2–3 from the hair colour', () => {
    expect(FACE_SLOTS.brows).toBe(2)
    expect(out.slice(2, 4)).toEqual([0x1050, 0x1051])
  })

  it('writes the eyes at slots 4–5 from the eye colour', () => {
    expect(out.slice(4, 6)).toEqual([0x5020, 0x5021])
  })

  it('writes the tone’s eight shades at slots 8–15', () => {
    expect(out.slice(8, 16)).toEqual([
      0x4030, 0x4031, 0x4032, 0x4033, 0x4034, 0x4035, 0x4036, 0x4037,
    ])
  })

  it('leaves the rest of the palette, and any palette past the first, alone', () => {
    expect([out[0], out[1], out[6], out[7]]).toEqual([0, 0, 0, 0])
    const later = new Uint8Array(32).fill(7)
    expect(faceColours(colours, { skin: 3, eyes: 2, hairColour: 5 })(palette(32), later)).toBe(
      later,
    )
  })

  it('leaves a colour whose number runs past its table as it was', () => {
    const past = read(
      faceColours(colours, { skin: 3, eyes: 12, hairColour: 5 })(palette(0), new Uint8Array(32)),
    )
    expect(past.slice(4, 6)).toEqual([0, 0])
  })
})
