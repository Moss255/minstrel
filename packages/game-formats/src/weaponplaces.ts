import { GameFormatError } from './errors.ts'
import { readDataTable } from './table.ts'

/**
 * **Where a weapon is carried** — `/data/bin/wpnpos.bin`, a data table the
 * game runs as a script (US ARM9 `func_02099f6c`, one handler, tag `100`, at
 * `0x02099ef4`), read 29 September 2026. A record a kind of weapon: its
 * number, then two placements, each a bone slot, an offset and a turn. See
 * FORMAT.md, "Where a weapon is carried".
 *
 * The field's code hangs a character's weapon by one or the other
 * (`func_ov017_021917f0`): the bone its slot names, then the offset
 * (`func_020407b4`, the part's position) and the turn (`func_0203db34`, its
 * rotation, radians) composed on the bone — translate, then turn about z, y
 * and x (`Object3D::Draw` with `COMPOSE_TRANSFORM`, `SendTransformToFifo`).
 */
export interface WeaponPlace {
  /** The bone, by its slot — see {@link BONE_SLOTS}. */
  readonly slot: number
  /** In the rig's own units. */
  readonly offset: readonly [number, number, number]
  /** Radians, about x, y and z. */
  readonly turn: readonly [number, number, number]
}

export interface WeaponPlaces {
  /** The kind of weapon: an item's subtype, 0 to 11, INFERRED — see FORMAT.md. */
  readonly kind: number
  /**
   * The first placement, INFERRED to be on the back: its slot is the chest on
   * eleven of the twelve, turned a kind's own way.
   */
  readonly back: WeaponPlace
  /**
   * The second, INFERRED to be in the hands: its slot a forearm on eleven of
   * the twelve, at (−2.4, −0.4, 0) unturned on the right on nine.
   */
  readonly hands: WeaponPlace
}

/**
 * The bones a slot names, in the order the game looks them up on a character
 * (`func_02053e10`, into its `+0x1a0` on): the head, the waist, the chest, the
 * left and right forearms, the left and right thighs.
 */
export const BONE_SLOTS = ['head', 'waist', 'chest', 'arm1L', 'arm1R', 'leg1L', 'leg1R'] as const

const TAG_PLACES = 100

/** Read `wpnpos.bin`. */
export function readWeaponPlaces(data: Uint8Array): WeaponPlaces[] {
  const out: WeaponPlaces[] = []
  for (const record of readDataTable(data).withTag(TAG_PLACES)) {
    if (record.values.length < 15) {
      throw new GameFormatError(
        `weapon places: a record of ${record.values.length} values, not 15`,
        record.offset,
      )
    }
    const int = (i: number) => (record.values[i] ?? 0) | 0
    const float = (i: number) => record.floats[i] ?? 0
    const place = (at: number): WeaponPlace => ({
      slot: int(at),
      offset: [float(at + 1), float(at + 2), float(at + 3)],
      turn: [float(at + 4), float(at + 5), float(at + 6)],
    })
    out.push({ kind: int(0), back: place(1), hands: place(8) })
  }
  return out
}
