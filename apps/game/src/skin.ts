import type { CharaColours } from '@minstrel/game-formats'
import type { PaletteInfo } from '@minstrel/nitro-gfx'

/**
 * A made character's skin, eyes and brows: colours out of `palette.bin` written
 * over their face's palette, the texels left alone — as the game does it.
 *
 * **Read from the game's code.** `func_020730e0` recolours a character part by
 * part. For the face it calls `func_02099e18(model, skin, hair colour, eye
 * colour)`, which makes three copies into the start of the face's palette,
 * from two small tables of byte offsets and lengths at `0x020e8e20` and
 * `0x020e8e14`:
 *
 * | what | from | slots | table |
 * |---|---|---|---|
 * | brows | the hair colour's pair | 2–3 | `0x64` |
 * | eyes | the eye colour's pair | 4–5 | `0x68` |
 * | skin | the tone's eight shades | 8–15 | `0x67` |
 *
 * The three numbers come from the character's appearance: the skin tone is
 * bits 1–3 of its `+0x14` byte, the eye colour bits 4–7, and the hair colour
 * the low four bits of `+0x15` — which settles which of the three colour
 * fields is which, where only the skin's had been established.
 *
 * **The rest of the body** (read 3 October 2026): `func_020730e0` gives each
 * worn part — body, legs, arms or gloves, feet, headgear — and the hair's
 * colour texture to `func_02099d34`, which writes the tone's ramp of two,
 * four or eight shades **once**, into the part's palette data at byte
 * `(S > 32 ? S mod 32 : 0) + 4` — `+ 16` for the hair — where `S` is the
 * whole palette data's size (`0x02099dac`–`0x02099dc8`). How many shades is
 * the part's own record's (`ItemDef.skinShades`, by sex); a slot with no item
 * takes the bare part's: body 1000, legs 8001, arms 8010, feet 994. Weapons,
 * shields and accessories are never recoloured.
 */

/** Where each copy lands in the face's palette, in colours — the game's byte offsets over two. */
export const FACE_SLOTS = { brows: 2, eyes: 4, skin: 8 } as const

export interface FaceLook {
  readonly skin: number
  readonly eyes: number
  readonly hairColour: number
}

/**
 * The face's palette as the game leaves it for `look`: brows, eyes and skin
 * written over it. Only the palette at the start of the face's palette data
 * is touched, as the game copies to that address and no further. A colour
 * whose number runs past its table is left as it was, where the game would
 * read on into the next table.
 */
export function faceColours(
  colours: CharaColours,
  look: FaceLook,
): (palette: PaletteInfo, bytes: Uint8Array) => Uint8Array {
  return (palette, bytes) => {
    if (palette.dataOffset !== 0) return bytes
    const out = bytes.slice()
    const put = (slot: number, row: readonly number[] | undefined) => {
      if (!row) return
      row.forEach((colour, i) => {
        const at = (slot + i) * 2
        if (at + 1 >= out.length) return
        out[at] = colour & 0xff
        out[at + 1] = (colour >> 8) & 0xff
      })
    }
    put(FACE_SLOTS.brows, colours.brows[look.hairColour])
    put(FACE_SLOTS.eyes, colours.eyes[look.eyes])
    put(FACE_SLOTS.skin, colours.skin8[look.skin])
    return out
  }
}

/** The tone's ramp for a part that takes `count` (1, 2 or 4 — two, four or eight shades), or none. */
export function skinRamp(
  colours: CharaColours,
  skin: number,
  count: number,
): readonly number[] | undefined {
  const table =
    count === 1
      ? colours.skin2
      : count === 2
        ? colours.skin4
        : count === 4
          ? colours.skin8
          : undefined
  return table?.[skin]
}

/**
 * Where a part's ramp is written, as a colour of the palette at the start of
 * its palette data: byte `(S > 32 ? S mod 32 : 0) + offset`, halved — `offset`
 * 4 for a body part, 16 for the hair (`func_02099d34`). `paletteData` is `S`.
 */
export function skinSlot(paletteData: number, offset: 4 | 16): number {
  const byte = (paletteData > 32 ? paletteData % 32 : 0) + offset
  return byte >> 1
}

/** A part's palette with its skin ramp written at `slot`: only the palette at the start of the data, as the game's one write lands there. */
export function bodyColours(
  ramp: readonly number[],
  slot: number,
): (palette: PaletteInfo, bytes: Uint8Array) => Uint8Array {
  return (palette, bytes) => {
    if (palette.dataOffset !== 0) return bytes
    const out = bytes.slice()
    ramp.forEach((colour, i) => {
      const at = (slot + i) * 2
      if (at + 1 >= out.length) return
      out[at] = colour & 0xff
      out[at + 1] = (colour >> 8) & 0xff
    })
    return out
  }
}
