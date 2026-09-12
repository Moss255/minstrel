import type { Treasure } from '@minstrel/game-formats'
import { type CastSprite, sheetFor } from './cast.ts'

/**
 * Pots and barrels: treasure the engine draws as a sprite.
 *
 * Neither is part of a room's model — the rooms have nothing where they stand —
 * and their pictures are `tsubo_01` and `taru_01` in `/data/ani`, beside the
 * villagers' sheets: *tsubo* is a pot, *taru* a barrel. Each is drawn standing
 * where the treasure file places it, facing the camera, at the villagers' own
 * pixel scale.
 *
 * **Which kind is which is INFERRED.** Pots, barrels and cabinets share one
 * random table, `randTTT` — tsubo, taru, tansu — and the cabinet, tansu, is
 * kind `0x30`, the third; so `0x10` is taken for the pot and `0x20` for the
 * barrel, in the table's own order. The second sheet of each, `_02`, is named
 * for breaking (`tsuboware`) and is likely the smash, but it does not read yet,
 * so opening one leaves it standing; nor is the third, `_03`, drawn.
 */

export const POT_KIND = 0x10
export const BARREL_KIND = 0x20

/** The sheet each is drawn from. */
export const PROP_SHEETS: ReadonlyMap<number, string> = new Map([
  [POT_KIND, 'tsubo_01'],
  [BARREL_KIND, 'taru_01'],
])

/** Whether a treasure is drawn as a pot or a barrel: placed, and of one of their kinds. */
export function isPotOrBarrel(treasure: Treasure): boolean {
  return treasure.position !== undefined && PROP_SHEETS.has(treasure.kind)
}

/** The pots and barrels to draw, each standing where its treasure is. One whose sheet will not read is left out. */
export function propSprites(
  treasures: readonly Treasure[],
  sheets: ReadonlyMap<string, Uint8Array>,
): CastSprite[] {
  const props: CastSprite[] = []
  for (const [slot, treasure] of treasures.entries()) {
    const at = treasure.position
    const name = PROP_SHEETS.get(treasure.kind)
    if (!at || !name) continue
    const sprite = sheetFor(name, sheets)
    const bytes = sheets.get(name)
    if (!sprite || !bytes) continue
    props.push({
      name,
      sprite,
      bytes,
      placement: { id: treasure.index ?? slot, map: 0, ...at, facing: 0, offset: 0 },
    })
  }
  return props
}
