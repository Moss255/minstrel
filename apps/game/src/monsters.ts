import { type Catalogue, catalogue, scanCartridge } from '@minstrel/cartridge'
import type { NpcPlacement } from '@minstrel/game-formats'
import type { Piece } from '@minstrel/gl'
import { type Animation, type Model, readNsbmd } from '@minstrel/nitro-gfx'
import { castPieces } from './cast.ts'

/**
 * How a monster looks: its model and its motions, out of
 * `/data/pack_lv5/enemy.gp2`.
 *
 * The archive holds a member for each monster, `<code>.mon` — `z000a.mon` the
 * slime — stored whole, a `NARC` of three files: `.cchr`, a compressed `NARC`
 * of the model and its first motions (`appear`, `attack0a`, `run`, `stand`);
 * `.cmot`, another, of the rest (`attack1a`, `call`, `damage`, `death`,
 * `escape`, `sake`); and `.bact`, not read. A `<code>_f.mon` beside each has no
 * `.cmot`. The cartridge walk opens them now it takes the archive's unprefixed
 * members raw — see `scanCartridge`.
 *
 * INFERRED: that they are in the characters' own space, as the cast is — the
 * slime stands 9 units to a person's 23, Hexagoon 35 — so they are drawn at the
 * cast's scale.
 */

export const ENEMY_ARCHIVE = '/data/pack_lv5/enemy.gp2'

export interface MonsterLook {
  readonly code: string
  readonly model: Model
  /** Its motions by name: `stand`, `attack0a`, `damage`, `death` … */
  readonly motions: ReadonlyMap<string, Animation>
  /** Its own textures, which the map's catalogue does not hold. */
  readonly catalogue: Catalogue
}

const looksRead = new WeakMap<Uint8Array, Map<string, MonsterLook | undefined>>()

/** A monster's look, by its code; undefined when its member will not read. Kept once read. */
export function monsterLookOf(rom: Uint8Array, code: string): MonsterLook | undefined {
  let byCode = looksRead.get(rom)
  if (!byCode) {
    byCode = new Map()
    looksRead.set(rom, byCode)
  }
  if (byCode.has(code)) return byCode.get(code)
  const member = `${ENEMY_ARCHIVE}/${code}.mon`.toLowerCase()
  // Open only this monster's member: the archive holds 601.
  const leaves = [
    ...scanCartridge(rom, {
      pathFilter: ENEMY_ARCHIVE,
      enter: (path) => {
        const p = path.toLowerCase()
        return p === ENEMY_ARCHIVE || p === member || p.startsWith(`${member}/`)
      },
    }),
  ].filter((leaf) => leaf.path.toLowerCase().startsWith(`${member}/`))
  let look: MonsterLook | undefined
  try {
    const cat = catalogue(leaves)
    const leaf = cat.models.find((m) => m.path.toLowerCase().includes('.cchr/'))
    const model = leaf ? readNsbmd(leaf.bytes).models[0] : undefined
    if (model) {
      const motions = new Map<string, Animation>()
      for (const list of cat.animations.values()) {
        for (const animation of list) motions.set(animation.name, animation)
      }
      look = { code, model, motions, catalogue: cat }
    }
  } catch {
    look = undefined
  }
  byCode.set(code, look)
  return look
}

/**
 * A monster drawn standing at `at`, turned to `facing`, at the cast's `scale`,
 * playing `motion` — its `stand` when it has no such one.
 */
export function monsterPieces(
  look: MonsterLook,
  at: { readonly x: number; readonly y: number; readonly z: number },
  facing: number,
  scale: number,
  motion: string,
  frame: number,
): Piece[] {
  const placement = { id: 0, map: 0, x: at.x, y: at.y, z: at.z, facing, offset: 0 } as NpcPlacement
  return castPieces(
    {
      name: look.code,
      model: look.model,
      motion: look.motions.get(motion) ?? look.motions.get('stand'),
      floor: 0,
      placement,
    },
    look.catalogue,
    scale,
    frame,
  )
}
