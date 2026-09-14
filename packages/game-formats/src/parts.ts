/**
 * Which character part an item is worn as.
 *
 * What a character wears is a set of parts in `/data/pack_lv5/chara_pc.gp2`
 * (and, larger and on another rig, in `chara_pd.gp2`), **named by the item's
 * id as its icon is**: the thousands choose a letter, the rest a three-digit
 * number. The celestial suit, 13007, is `p_b007`; the copper sword, 20004,
 * `p_w004`. See FORMAT.md, "Character parts".
 *
 * | id | worn | letter | drawn as |
 * |---|---|---|---|
 * | 12xxx | headgear | `m` | a model with one bone of its own |
 * | 13xxx | armour | `b` | a model on the rig: the body |
 * | 14xxx | the body's bare arms — no item | `a` | a texture, on the body |
 * | 15xxx | gloves | `g` | a texture, in place of the arms' |
 * | 16xxx | legwear | `p` | a model on the rig: the legs |
 * | 17xxx | footwear | `r` | a texture, on the legs |
 * | 20xxx | weapons | `w` | a model with one bone of its own |
 * | 21xxx | shields | `s` | a model with one bone of its own |
 *
 * The letters are the icons' (FORMAT.md, "Item icons") on every category the
 * two share, and each category's parts number as its items do. `a` has no
 * icon and no item: it is the arms each body has under it, numbered as the
 * body is — see {@link armsFor}.
 */
export const PART_LETTERS: Readonly<Record<number, string>> = {
  12: 'm',
  13: 'b',
  14: 'a',
  15: 'g',
  16: 'p',
  17: 'r',
  20: 'w',
  21: 's',
}

/**
 * The part an item id is worn as — `p_b007` for 13007 — or `undefined` for an
 * id no part is named by: tools, accessories, knives.
 *
 * `prefix` is the archive's: `p` in `chara_pc.gp2`, `d` in `chara_pd.gp2`.
 */
export function partName(id: number, prefix = 'p'): string | undefined {
  if (!Number.isInteger(id) || id < 0) return undefined
  const letter = PART_LETTERS[Math.floor(id / 1000)]
  return letter === undefined
    ? undefined
    : `${prefix}_${letter}${String(id % 1000).padStart(3, '0')}`
}

/**
 * The bare arms worn with a piece of armour: its number, under 14xxx.
 *
 * INFERRED, and well supported: of the 41 character presets on the cartridge
 * (FORMAT.md, "Character presets"), 39 pair their armour with arms of the same
 * number; every one of the 192 bodies has an arms file of its number; and 188
 * of them name their arms' material after it — `p_b002`'s is `p_a002_00`.
 */
export function armsFor(armour: number): number | undefined {
  return Number.isInteger(armour) && Math.floor(armour / 1000) === 13
    ? 14000 + (armour % 1000)
    : undefined
}
