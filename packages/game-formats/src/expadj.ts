import { GameFormatError } from './errors.ts'

/**
 * `/data/bin/expadj.nat` — how much a battle's experience leans on each
 * member's level when it is shared out.
 *
 * **Read 27 September 2026, from the code that loads and reads it**, overlay
 * 23 (US addresses). The victory state loads it (`func_ov023_021f5340`, its
 * name at `0x021fe338`) and copies it in (`021f5448`):
 *
 * - a header word: bits 0–11 the number of bands (`021f5524` makes their size
 *   from it, four bytes each); bits 12–30 the size of a second block copied
 *   in after them, **not established** — none on the reference cartridge;
 * - then the bands, a word each: bits 0–25 the most experience the band
 *   holds, **0 meaning no bound**; bits 26–31 the number it adds to a
 *   member's level.
 *
 * `func_ov023_021f5534` walks the bands in order and takes the first that
 * holds the battle's total — the total at or below its bound, or no bound —
 * and `021f5578` returns its number, or 4 when there is none. What the
 * number does is `experienceShares` in the simulation's battle.
 *
 * On the reference cartridge: up to 10,000 adds 4, up to 20,000 adds 3, and
 * more adds 2.
 */
export interface ExperienceBand {
  /** The most experience this band holds; `undefined` for no bound. */
  readonly upTo: number | undefined
  /** What it adds to each member's level before the shares are weighed. */
  readonly add: number
}

export interface ExperienceAdjust {
  readonly bands: readonly ExperienceBand[]
  /** The second block the header sizes, carried through as it is. */
  readonly unknown_tail: Uint8Array
}

/** Read `expadj.nat`. Throws if the header promises more than the file holds. */
export function readExperienceAdjust(bytes: Uint8Array): ExperienceAdjust {
  if (bytes.length < 4) {
    throw new GameFormatError(`experience adjust: ${bytes.length} bytes, not even a header`)
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const header = view.getUint32(0, true)
  const count = header & 0xfff
  const tail = (header >>> 12) & 0x7ffff
  const end = 4 + 4 * count + tail
  if (end > bytes.length) {
    throw new GameFormatError(
      `experience adjust: the header needs ${end} bytes, the file has ${bytes.length}`,
    )
  }
  const bands = Array.from({ length: count }, (_, i): ExperienceBand => {
    const word = view.getUint32(4 + 4 * i, true)
    const bound = word & 0x3ffffff
    return { upTo: bound === 0 ? undefined : bound, add: word >>> 26 }
  })
  return { bands, unknown_tail: bytes.subarray(4 + 4 * count, end) }
}
