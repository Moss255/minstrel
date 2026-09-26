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
 * The rest of the body is recoloured too, by `func_02099d34`, with a skin ramp
 * of two, four or eight shades written at a fixed slot of every palette — but
 * how many shades each part takes is read from a record of the item worn, and
 * that record is not yet found. So the body keeps its own skin for now.
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
