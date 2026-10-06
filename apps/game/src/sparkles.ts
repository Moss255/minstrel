import { FOUNTAIN_FIRST, isLying, WORD, wordField } from '@minstrel/sim'

/**
 * **The gathering spots on the map** — where their sparkles stand and which
 * the Hero is close enough to pick from. Read 6 October 2026 (US; the whole
 * reading is `docs/readings/T13-gathering.md`); the rules of the spots
 * themselves are `gathering.ts` in `@minstrel/sim`.
 */

/** The sparkle: an effect model (ov017 `func_ov017_0219b624`, `0x0219b834`). */
export const SPARKLE_FILE = 'effect/ev999990300.chr'

/** How near, in x and in z, the Hero must be to pick up — `0xb33`, in the files' units (ov017 `0x02198798`). */
export const PICK_REACH = 0xb33 / 4096

/** A sparkle stands this far above the floor found under its place (`func_02018fbc`, `+0x199`). */
export const SPARKLE_LIFT = 0x199 / 4096
/** The floor is looked for from this far above the place (`+0x1000`) … */
const PROBE_ABOVE = 1
/** … to this far below it (`−0xa000`). */
const PROBE_BELOW = 10

/** A spot of this map, as `load` gives it. */
export interface SpotHere {
  readonly id: number
  readonly item: number
  readonly places: readonly { readonly x: number; readonly y: number; readonly z: number }[]
}

/** An item lying at a spot's place, in the files' units. */
export interface Sparkle {
  readonly id: number
  readonly place: number
  readonly item: number
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * **The items lying on this map** (`func_0208f168`, on entering it): each
 * spot's places that its word marks, up to its most — or 8 for the
 * Fountain's — at the place's x and z, and **0.1 above the floor found from 1
 * above the place to 10 below**, or at the place's own height where none is.
 * `floor` answers the height of the floor under (x, z) at or below `from`.
 */
export function sparklesOf(
  spots: readonly SpotHere[],
  words: readonly number[],
  floor: (x: number, z: number, from: number) => number | undefined,
): Sparkle[] {
  const out: Sparkle[] = []
  for (const spot of spots) {
    const word = words[spot.id] ?? 0
    if (!wordField(word, WORD.setUp)) continue
    const count = spot.id >= FOUNTAIN_FIRST ? 8 : wordField(word, WORD.most)
    for (let place = 0; place < count && place < spot.places.length; place++) {
      if (!isLying(word, place)) continue
      const at = spot.places[place] as SpotHere['places'][number]
      const found = floor(at.x, at.z, at.y + PROBE_ABOVE)
      const y = found !== undefined && found >= at.y - PROBE_BELOW ? found + SPARKLE_LIFT : at.y
      out.push({ id: spot.id, place, item: spot.item, x: at.x, y, z: at.z })
    }
  }
  return out
}

/**
 * **The item the Hero can pick up**, if any (ov017 `func_ov017_021986fc`):
 * the first, in the spots' order and then their places', whose x and z are
 * both within {@link PICK_REACH} of the Hero's — in the files' units.
 */
export function sparkleWithin(
  sparkles: readonly Sparkle[],
  hero: { readonly x: number; readonly z: number },
): Sparkle | undefined {
  return sparkles.find(
    (s) => Math.abs(hero.x - s.x) < PICK_REACH && Math.abs(hero.z - s.z) < PICK_REACH,
  )
}
