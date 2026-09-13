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
 * **Opening one smashes it.** The second sheet of each, `_02`, is three frames
 * of shards flying apart, and its one animation is named for breaking —
 * `tsuboware`, `taruware` — three steps of 4. It plays once where the pot
 * stood, and then there is nothing there. A step's length is taken in the
 * DS's 60ths of a second, INFERRED from the villagers' walks, whose steps are
 * 8, and stands, 60. The third sheet, `_03`, is not drawn.
 *
 * **Which kind is which is INFERRED.** Pots, barrels and cabinets share one
 * random table, `randTTT` — tsubo, taru, tansu — and the cabinet, tansu, is
 * kind `0x30`, the third; so `0x10` is taken for the pot and `0x20` for the
 * barrel, in the table's own order.
 */

export const POT_KIND = 0x10
export const BARREL_KIND = 0x20

/** The sheet each is drawn from. */
export const PROP_SHEETS: ReadonlyMap<number, string> = new Map([
  [POT_KIND, 'tsubo_01'],
  [BARREL_KIND, 'taru_01'],
])

/** The sheet each breaks with, and the animation in it. */
export const BREAKING_SHEETS: ReadonlyMap<number, { sheet: string; animation: string }> = new Map([
  [POT_KIND, { sheet: 'tsubo_02', animation: 'tsuboware' }],
  [BARREL_KIND, { sheet: 'taru_02', animation: 'taruware' }],
])

/** A step of a sprite animation, in the DS's frames — 60 a second, INFERRED. */
const STEP_MS = 1000 / 60

/** A pot or barrel as drawn: where it stands, which treasure it is, and how it breaks. */
export interface Prop extends CastSprite {
  /** Its place in the map's treasure file, which with the treasure keys it as opened. */
  readonly slot: number
  readonly treasure: Treasure
  /** Its shards, when its breaking sheet reads. */
  readonly breaking: CastSprite | undefined
}

/** Whether a treasure is drawn as a pot or a barrel: placed, and of one of their kinds. */
export function isPotOrBarrel(treasure: Treasure): boolean {
  return treasure.position !== undefined && PROP_SHEETS.has(treasure.kind)
}

/** The pots and barrels to draw, each standing where its treasure is. One whose sheet will not read is left out. */
export function propSprites(
  treasures: readonly Treasure[],
  sheets: ReadonlyMap<string, Uint8Array>,
): Prop[] {
  const props: Prop[] = []
  for (const [slot, treasure] of treasures.entries()) {
    const at = treasure.position
    const name = PROP_SHEETS.get(treasure.kind)
    if (!at || !name) continue
    const sprite = sheetFor(name, sheets)
    const bytes = sheets.get(name)
    if (!sprite || !bytes) continue
    const placement = { id: treasure.index ?? slot, map: 0, ...at, facing: 0, offset: 0 }
    const breaks = BREAKING_SHEETS.get(treasure.kind)
    const shards = breaks ? sheetFor(breaks.sheet, sheets) : undefined
    const shardBytes = breaks ? sheets.get(breaks.sheet) : undefined
    props.push({
      name,
      sprite,
      bytes,
      placement,
      slot,
      treasure,
      breaking:
        breaks && shards && shardBytes
          ? { name: breaks.sheet, sprite: shards, bytes: shardBytes, placement }
          : undefined,
    })
  }
  return props
}

/**
 * Which frame of its breaking shows, this long after a prop was smashed — or
 * undefined once it is over, and the prop is gone.
 */
export function breakingFrame(prop: Prop, elapsedMs: number): number | undefined {
  const breaking = prop.breaking
  const animation = breaking?.sprite.animation(
    BREAKING_SHEETS.get(prop.treasure.kind)?.animation ?? '',
  )
  if (!breaking || !animation) return undefined
  let left = elapsedMs
  for (const step of animation.steps) {
    left -= step.duration * STEP_MS
    if (left < 0) return step.frame
  }
  return undefined
}
