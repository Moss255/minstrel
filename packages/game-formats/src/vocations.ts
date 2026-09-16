import { GameFormatError } from './errors.ts'

/**
 * The vocations' skill trees — the table that says which weapons each
 * vocation may wield, which no file on the cartridge holds: it is in the
 * ARM9 binary, unpacked. See FORMAT.md, "Vocation skill trees".
 *
 * Twelve rows of five bytes, one a vocation in the level tables' order —
 * warrior, priest, mage, martial artist, thief, minstrel, gladiator,
 * armamentalist, paladin, sage, luminary, ranger — each row four weapon,
 * shield or fisticuffs trees (1 to 14, numbered as `str_sklc` names them:
 * sword 1, spear 2, knife 3, wand 4, whip 5, staff 6, claws 7, fan 8, axe 9,
 * hammer 10, boomerang 11, bow 12, shield 13, fisticuffs 14) and, last, the
 * vocation's own tree, 15 to 26 in the vocations' order. The table is found
 * by that shape, not by an offset, so a binary laid out otherwise still
 * yields it or says it is not there.
 */
export const VOCATIONS = 12
export const TREES_A_VOCATION = 5
export const WEAPON_TREES = 14
export const FIRST_OWN_TREE = 15

export interface VocationTrees {
  /** Where the table begins in the bytes it was found in. */
  readonly offset: number
  /** Each vocation's trees, vocation 1 first: four of the weapon trees then its own. */
  readonly rows: readonly (readonly number[])[]
}

/** Whether a row of five is a vocation's: four distinct weapon trees and, last, its own tree for the row. */
function isRow(bytes: Uint8Array, at: number, vocation: number): boolean {
  const seen = new Set<number>()
  for (let c = 0; c < TREES_A_VOCATION - 1; c++) {
    const v = bytes[at + c] as number
    if (v < 1 || v > WEAPON_TREES || seen.has(v)) return false
    seen.add(v)
  }
  return bytes[at + TREES_A_VOCATION - 1] === FIRST_OWN_TREE + vocation
}

/** Find the table in a binary and read it; throws when its shape is nowhere in the bytes. */
export function readVocationTrees(bytes: Uint8Array): VocationTrees {
  const length = VOCATIONS * TREES_A_VOCATION
  for (let at = 0; at + length <= bytes.length; at++) {
    if (bytes[at + TREES_A_VOCATION - 1] !== FIRST_OWN_TREE) continue
    let all = true
    for (let v = 0; v < VOCATIONS && all; v++) all = isRow(bytes, at + v * TREES_A_VOCATION, v)
    if (!all) continue
    const rows: number[][] = []
    for (let v = 0; v < VOCATIONS; v++) {
      rows.push([...bytes.subarray(at + v * TREES_A_VOCATION, at + (v + 1) * TREES_A_VOCATION)])
    }
    return { offset: at, rows }
  }
  throw new GameFormatError('no vocation skill-tree table: twelve rows of five ending 15 to 26', 0)
}

/**
 * Which vocations may wield a weapon kind or a shield: a bit a vocation,
 * bit v − 1 for vocation v, as `ItemStats.usedBy` carries for armour. `tree`
 * is the item's kind — `ItemStats.kind`, a weapon's subtype plus one, 13 for
 * a shield — which is the tree's number.
 */
export function vocationsWielding(trees: VocationTrees, tree: number): number {
  let mask = 0
  trees.rows.forEach((row, v) => {
    if (row.slice(0, TREES_A_VOCATION - 1).includes(tree)) mask |= 1 << v
  })
  return mask
}
