import { type Bag, drop, take } from './bag.ts'

/**
 * What the Hero wears: one item to a slot, each slot taking one item table's
 * category (FORMAT.md, "Items").
 *
 * **Who may wear what is read now** — see {@link mayWear}, which is the
 * game's own `func_020dd4c4` as far as vocation goes: a 12-bit mask on
 * armour, the skill trees on weapons and shields.
 */

export type Slot = 'weapon' | 'shield' | 'head' | 'body' | 'arms' | 'legs' | 'feet' | 'accessory'

/** The slots in the order the equip panel lists them, with the item table each takes. */
export const SLOTS: readonly {
  readonly slot: Slot
  readonly label: string
  readonly table: string
}[] = [
  { slot: 'weapon', label: 'Weapon', table: 'w' },
  { slot: 'shield', label: 'Shield', table: 's' },
  { slot: 'head', label: 'Head', table: 'h' },
  { slot: 'body', label: 'Body', table: 'b' },
  { slot: 'arms', label: 'Arms', table: 'a' },
  { slot: 'legs', label: 'Legs', table: 'u' },
  { slot: 'feet', label: 'Feet', table: 'l' },
  { slot: 'accessory', label: 'Accessory', table: 'd' },
]

export type Equipped = ReadonlyMap<Slot, number>

export const NOTHING_EQUIPPED: Equipped = new Map()

/** The slot an item goes in, by the table it is listed in; undefined for what is not worn. */
export function slotOf(table: string | undefined): Slot | undefined {
  return SLOTS.find((s) => s.table === table)?.slot
}

/**
 * What a piece of equipment says about who may wear it — the two fields of
 * `readItemStats` this rule is made of. See {@link mayWear}.
 */
export interface WearRule {
  /**
   * Who may wear it, a bit a vocation — bit `v − 1` for vocation `v`. 0 on
   * weapons and shields, whose use goes by the skill trees instead.
   */
  readonly usedBy: number
  /** Its kind: a weapon's subtype plus one, 13 a shield, 0 on everything else. */
  readonly kind: number
  /** Which sexes may wear it: bit 0 for sex 0, bit 1 for sex 1 — see {@link SEX}. */
  readonly wornBySex?: number | undefined
  /** Whether the wear-with-all award cannot lift its sex restriction. */
  readonly sexLock?: boolean | undefined
}

/**
 * The sexes, as the item bits and the character presets both number them.
 *
 * **Read off the cartridge, 24 September 2026**, and it is not a guess: of the
 * 944 pieces of equipment whose stats read, 823 are open to both. Of the rest,
 * **bit 0** carries the warrior's gloves, holy mail, the rogue's robes, the
 * flamenco shirt and the twinkling tuxedo; **bit 1** carries holy *femail*,
 * the *roguess's* robes, the priestess's pinafore, the dancer's dress and the
 * bunny suit. The mail/femail and robes/roguess pairs settle it.
 *
 * `charapreset.bin`'s own `sex` field is numbered the same way: across the 29
 * ready-made characters, **33 of 33** sex-restricted pieces they are dressed
 * in allow the sex their record names, and none is refused.
 */
export const SEX = { male: 0, female: 1 } as const

/**
 * The accessory that lets a character wear the other sex's things: **18048,
 * the wear-with-all award**.
 *
 * `0x020dd6b4` reads equipment slot 9 and compares it with this literal before
 * the sex test; with it worn, an item whose {@link WearRule.sexLock} is clear
 * skips that test altogether. 121 items are sex-restricted and 20 of them
 * carry the lock, which is what the award cannot help with.
 */
export const WEAR_WITH_ALL = 18048

/** Who is trying to put something on — see {@link mayWear}. */
export interface Wearer {
  /** Their vocation, 1 to 12. */
  readonly vocation: number
  /** Their sex — see {@link SEX}. Undefined leaves the sex rule unapplied. */
  readonly sex?: number | undefined
  /** Whether they are wearing the {@link WEAR_WITH_ALL} award. */
  readonly wearWithAll?: boolean | undefined
}

/** What the rule needs looked up elsewhere — see {@link mayWear}. */
export interface WearFrom {
  /** The vocations holding a weapon tree — `vocationsWielding`. */
  readonly wielding?: ((tree: number) => number) | undefined
  /** Whether they have bought that tree's Omnivocational panel — see `skills.ts`. */
  readonly regardless?: ((tree: number) => boolean) | undefined
}

/**
 * Whether a vocation may wear a piece of equipment.
 *
 * **Read 24 September 2026** from `func_020dd4c4`, the game's own "may this
 * character equip this?", which hands back a bitmask of refusal reasons and
 * has two separate rules in it:
 *
 * - **Armour, headgear, gloves, legwear, footwear and accessories** — the
 *   in-RAM categories 2 to 7 — are tested against a **12-bit mask**, bit
 *   `v − 1` for vocation `v`, in bits 0 to 11 of the item record's second
 *   word. That is `ItemStats.usedBy`, and this is what confirms the bit order
 *   that reading inferred from the vocation presets.
 *   `arm9 0x020dd63c: lsl r0, r1, r0` over `0x020dd644: tst r0, r1, lsr #20`.
 * - **Weapons and shields** — categories 0 and 1 — skip that mask entirely and
 *   go by the **skill trees**: the item's tree against the four weapon trees
 *   the vocation holds (`0x020dd19c`, whose loop really is `i < 4`, because
 *   the fifth is the vocation's own tree and never a weapon's), *or* the
 *   character having earned that tree's "regardless of vocation" panel
 *   (`0x020dd200`, checked first).
 *
 * - **And a sex rule, beside both**: bits 27 and 28 of the same word are "sex
 *   0 may" and "sex 1 may", used as a **two-entry lookup indexed by the
 *   character's own sex bit** rather than compared (`0x020dd6f8`). It is
 *   lifted by the {@link WEAR_WITH_ALL} award, except on items whose bit 29
 *   says it cannot be.
 *
 * `from.wielding` is asked for the vocations that hold a weapon tree, which is
 * `vocationsWielding` in `@minstrel/game-formats`; `from.regardless` whether
 * this character has earned the tree's Omnivocational panel — see `skills.ts`.
 * **Whatever is not given is not applied**: nothing is refused for want of a
 * lookup, which is better than refusing it wrongly.
 *
 * The order here is the game's: sex first, then vocation. It makes no
 * difference to the answer, only to which refusal a caller would report.
 */
export function mayWear(rule: WearRule | undefined, who: Wearer, from: WearFrom = {}): boolean {
  // Nothing read about it refuses nobody: an item whose stats did not read is
  // worn as it always was.
  if (!rule) return true
  // The sex rule, where the item carries one and the character has a sex.
  // `wornBySex` of 3 is both, which is 823 of the cartridge's 944.
  if (rule.wornBySex !== undefined && who.sex !== undefined) {
    const allowed = (rule.wornBySex & (1 << who.sex)) !== 0
    if (!allowed && !(who.wearWithAll && !rule.sexLock)) return false
  }
  if (who.vocation < 1 || who.vocation > 12) return true
  if (rule.kind > 0) {
    if (from.regardless?.(rule.kind)) return true
    if (!from.wielding) return true
    return (from.wielding(rule.kind) & (1 << (who.vocation - 1))) !== 0
  }
  // Armour with an empty mask is worn by nobody, which is what the mask says;
  // `0xfff` — every accessory and most armour — is worn by all twelve.
  return (rule.usedBy & (1 << (who.vocation - 1))) !== 0
}

/**
 * What can go in a slot: nothing, to take off what is there, then each item in
 * the bag of the slot's category, in the bag's order.
 *
 * **What this vocation may not wear is left out** where `mayWear` is given
 * what it needs to say so — see {@link mayWear}. Without a vocation the list
 * is the whole bag's, as it was.
 */
export function choicesFor(
  slot: Slot,
  bag: Bag,
  tableOf: (id: number) => string | undefined,
  wearable: (id: number) => boolean = () => true,
): (number | undefined)[] {
  return [
    undefined,
    ...[...bag.items.keys()].filter((id) => slotOf(tableOf(id)) === slot && wearable(id)),
  ]
}

/**
 * Put an item on, from the bag, or take off what is worn with `undefined`.
 * What was in the slot goes back into the bag. Undefined when the bag has no
 * such item to put on.
 */
export function equip(
  bag: Bag,
  equipped: Equipped,
  slot: Slot,
  item: number | undefined,
): { bag: Bag; equipped: Equipped } | undefined {
  let after = bag
  if (item !== undefined) {
    const taken = drop(after, item)
    if (!taken) return undefined
    after = taken
  }
  const worn = equipped.get(slot)
  if (worn !== undefined) after = take(after, { item: worn })
  const next = new Map(equipped)
  if (item === undefined) next.delete(slot)
  else next.set(slot, item)
  return { bag: after, equipped: next }
}
